// Every metro station's departures from Trafiklab's GTFS Regional feeds (server/gtfs.ts), for the `sl` feed: the part
// both relays share, the Bun relay in development (server/feeds.ts, the timetable in a file) and the hub on Cloudflare
// (worker/hub.ts, the timetable in its storage). Nothing here needs Bun. See docs/DRIFT.md, section 4.
//
// Keys: TRAFIKLAB_RT_KEY and TRAFIKLAB_STATIC_KEY, never with a VITE_ prefix: they stay on the relay.
// Silver quota: realtime 250 a minute, so every 15 s, as often as SL updates it (the feed's ttl in feedCore.ts);
// static 250 a month, so once a day, kept where `store` puts it so a restart does not download it again. A download
// that fails is tried again after a pause that doubles to STATIC_PAUSE_MAX, also kept in `store` (the Durable Object
// sleeps between requests): a month of failures costs about 130 of the 250.

import { source } from './feedCore';
import { departures, GTFS_REALTIME, GTFS_STATIC, parseTripUpdates, readTimetable, type Timetable } from './gtfs';

/** Download a new timetable when this one is older (SL exports one a night)... */
const STATIC_EVERY = 20 * 60 * 60 * 1000;
/** ...but try at most this often, doubling after each failure up to STATIC_PAUSE_MAX, and serve the old one meanwhile: it holds a week of service days. */
const STATIC_RETRY = 30 * 60 * 1000;
const STATIC_PAUSE_MAX = 6 * 60 * 60 * 1000;
const STATIC_KEEP = 6 * 24 * 60 * 60 * 1000;
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

/** How long to wait after a download that started `failures` failures in a row ago. */
export const staticPause = (failures: number) => Math.min(STATIC_PAUSE_MAX, STATIC_RETRY * 2 ** Math.max(0, failures - 1));

/** Every station's departures from GTFS, or null until a timetable is in (the feed is unavailable until then). */
export function gtfsDepartures(keys: GtfsKeys, store: TimetableStore, log: (message: string) => void): () => Promise<Record<number, unknown> | null> {
  let timetable: Timetable | null = null;
  let stored: Promise<void> | null = null;
  let tried: StaticTry = { at: 0, failures: 0 };
  let loading: Promise<void> | null = null;

  /** The timetable if one is usable, starting a download in the background when it is due. */
  function current(): Timetable | null {
    const now = Date.now();
    const age = timetable ? now - timetable.fetched : Infinity;
    if (age > STATIC_EVERY && !loading && now - tried.at > staticPause(tried.failures)) {
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
      })().catch((err) => log(`GTFS timetable: ${err instanceof Error ? err.message : err}`)).finally(() => { loading = null; });
    }
    return timetable && now - timetable.fetched < STATIC_KEEP ? timetable : null;
  }

  return async () => {
    stored ??= Promise.all([
      store.read().then((t) => { timetable ??= t; }, () => { /* Downloaded on first use. */ }),
      store.readTry().then((t) => { if (t && t.at > tried.at) tried = t; }, () => { /* Never tried. */ }),
    ]).then(() => {});
    await stored;
    const table = current();
    if (!table) return null;
    const feed = new Uint8Array(await (await source(`${GTFS_REALTIME}?key=${keys.realtime}`)).arrayBuffer());
    return departures(table, parseTripUpdates(feed), Date.now() / 1000);
  };
}
