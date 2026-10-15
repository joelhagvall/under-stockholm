// Every metro station's departures from Trafiklab's GTFS Regional feeds (server/gtfs.ts), for the `sl` feed: the part
// both relays share, the Bun relay in development (server/feeds.ts, the timetable in a file) and the hub on Cloudflare
// (worker/hub.ts, the timetable in its storage). Nothing here needs Bun. See docs/DRIFT.md, section 4.
//
// Keys: TRAFIKLAB_RT_KEY and TRAFIKLAB_STATIC_KEY, never with a VITE_ prefix: they stay on the relay.
// Silver quota: realtime 250 a minute, so every 15 s, as often as SL updates it (the feed's ttl in feedCore.ts);
// static 250 a month, so once a day, kept where `store` puts it so a restart does not download it again (the Bun relay
// in development once a week, as it shares the key: `every`). A download
// that fails is tried again after a pause that doubles to STATIC_PAUSE_MAX, also kept in `store` (the Durable Object
// sleeps between requests): a month of failures costs about 130 of the 250. The first failure of a row is told through
// `alert`, and so is the download that ends it.

import { source } from './feedCore';
import { departures, GTFS_REALTIME, GTFS_STATIC, parseTripUpdates, readTimetable, runsToday, type Timetable } from './gtfs';

/** Download a new timetable when this one is older (SL exports one a night)... */
export const STATIC_EVERY = 20 * 60 * 60 * 1000;
/** ...but try at most this often, doubling after each failure up to STATIC_PAUSE_MAX, and serve the old one meanwhile: it holds three weeks of service days. */
const STATIC_RETRY = 30 * 60 * 1000;
const STATIC_PAUSE_MAX = 6 * 60 * 60 * 1000;
/** The static timetable is about 48 MB. */
const STATIC_TIMEOUT = 5 * 60_000;

export interface GtfsKeys { realtime: string; static: string }

/** When a download of the timetable last started, and how many in a row have failed (it counts as failed until it is in). */
export interface StaticTry { at: number; failures: number }

/** Where the metro's timetable, and its last download, are kept between restarts. */
export interface TimetableStore {
  read(): Promise<Timetable | null>;
  write(timetable: Timetable): Promise<void>;
  readTry(): Promise<StaticTry | null>;
  writeTry(attempt: StaticTry): Promise<void>;
}

/** The timetable as /perf shows it: which export is in and when it came, and how the downloads are going. */
export interface TimetableStatus {
  /** SL's export date, or null until one is in. */
  version: string | null;
  /** When it was downloaded, epoch ms. */
  fetched: number | null;
  /** When the last download started, epoch ms, and how many in a row have failed. */
  tried: number | null;
  failures: number;
  /** Whether a download is under way. */
  loading: boolean;
}

/** Every station's departures, with the timetable's state beside them. */
export type GtfsFeed = (() => Promise<Record<number, unknown> | null>) & { status(): Promise<TimetableStatus> };

/** How long to wait after a download that started `failures` failures in a row ago. */
export const staticPause = (failures: number) => Math.min(STATIC_PAUSE_MAX, STATIC_RETRY * 2 ** Math.max(0, failures - 1));

export interface GtfsOptions {
  /** Download a new timetable once the one in is this old, ms. */
  every?: number;
  /** Tells someone (ALERT_URL) that a download failed, the first of a row of failures, and that one came in again. */
  alert?: (title: string, text: string) => void;
}

/** The last service day a timetable has trips on, YYYY-MM-DD. */
const lastDay = (timetable: Timetable) => {
  const day = timetable.trips.reduce((last, t) => t.dates.reduce((a, d) => (d > a ? d : a), last), '');
  return `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
};

/**
 * Every station's departures from GTFS, or null until a timetable is in (the feed is unavailable until then), and
 * again once it has no trips today.
 */
export function gtfsDepartures(keys: GtfsKeys, store: TimetableStore, log: (message: string) => void, { every = STATIC_EVERY, alert }: GtfsOptions = {}): GtfsFeed {
  let timetable: Timetable | null = null;
  let stored: Promise<void> | null = null;
  let tried: StaticTry = { at: 0, failures: 0 };
  let loading: Promise<void> | null = null;

  /** The timetable if one is usable, starting a download in the background when it is due. */
  function current(): Timetable | null {
    const now = Date.now();
    const age = timetable ? now - timetable.fetched : Infinity;
    if (age > every && !loading && now - tried.at > staticPause(tried.failures)) {
      // Written before it starts, so a download that takes the object down with it still counts.
      tried = { at: now, failures: tried.failures + 1 };
      const attempt = tried;
      loading = (async () => {
        await store.writeTry(attempt);
        // Read as it downloads: only the files the timetable needs are kept, never the whole 48 MB.
        const response = await source(`${GTFS_STATIC}?key=${keys.static}`, STATIC_TIMEOUT);
        timetable = await readTimetable(response.body ?? new Uint8Array(await response.arrayBuffer()), Date.now() / 1000);
        await store.write(timetable);
        tried = { at: attempt.at, failures: 0 };
        await store.writeTry(tried);
        log(`GTFS timetable ${timetable.version}: ${timetable.trips.length} metro trips`);
        if (attempt.failures > 1) alert?.('Under Stockholm: SL timetable in again', `Export ${timetable.version} came in after ${attempt.failures - 1} failed downloads. It has trips until ${lastDay(timetable)}.`);
      })().catch((err) => {
        const reason = err instanceof Error ? err.message : String(err);
        log(`GTFS timetable: ${reason}`);
        if (attempt.failures !== 1) return;
        const held = timetable ? `The one in (export ${timetable.version}) has trips until ${lastDay(timetable)}, and then every line keeps to the timetable.` : 'There is none in, so every line keeps to the timetable.';
        alert?.('Under Stockholm: SL timetable download failed', `${reason}. ${held} Tried again within ${Math.round(staticPause(1) / 60_000)} min, doubling to ${STATIC_PAUSE_MAX / 3_600_000} h.`);
      }).finally(() => { loading = null; });
    }
    return timetable && runsToday(timetable, now / 1000) ? timetable : null;
  }

  /** What the store holds, read once per object (the timetable is a few MB). */
  const restore = () => stored ??= Promise.all([
    store.read().then((t) => { timetable ??= t; }, () => { /* Downloaded on first use. */ }),
    store.readTry().then((t) => { if (t && t.at > tried.at) tried = t; }, () => { /* Never tried. */ }),
  ]).then(() => {});

  const feed = async () => {
    await restore();
    const table = current();
    if (!table) return null;
    const updates = new Uint8Array(await (await source(`${GTFS_REALTIME}?key=${keys.realtime}`)).arrayBuffer());
    return departures(table, parseTripUpdates(updates), Date.now() / 1000);
  };
  const status = async (): Promise<TimetableStatus> => {
    await restore();
    // In from the download under way, which only counts as done once it is stored.
    const done = timetable !== null && timetable.fetched >= tried.at;
    return { version: timetable?.version ?? null, fetched: timetable?.fetched ?? null, tried: tried.at || null, failures: done ? 0 : tried.failures, loading: loading !== null && !done };
  };
  return Object.assign(feed, { status });
}
