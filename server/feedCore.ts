// The shared cache of the open data feeds, served at /feeds/<name>: by the Bun relay in development (server/feeds.ts,
// which adds GTFS Regional when it has Trafiklab's keys) and by the hub on Cloudflare (worker/hub.ts). Nothing here
// needs Bun or a browser.
// Every player asks the relay, the relay asks the source at most once per feed's interval, and only while someone is
// asking: with nobody playing it makes no requests at all. Concurrent requests share one upstream fetch, a failed
// fetch is not retried for a while, and a usable last copy answers at once while the next is fetched.
//
// Every answer is { at, data }, `at` being when the relay fetched it (epoch ms):
//   GET /feeds/sl          data: { [site]: { departures } }   SL departures at every metro station from GTFS Regional
//                          (server/gtfs.ts), with Trafiklab's keys; without them, or once GTFS has failed for longer
//                          than its last copy keeps, unavailable, and the game keeps every line to its timetable
//   GET /feeds/deviations  data: SL's traffic information, as SL sends it
//   GET /feeds/weather     data: Open-Meteo's answer, as it sends it
//   GET /feeds/warnings    data: SMHI's warnings for Stockholms län only
//   GET /feeds/news        data: [{ title, published }]   P4 Stockholm's news, for the newspapers

import { SL_DEVIATIONS, SMHI_WARNINGS, SR_NEWS, WEATHER } from '../src/game/feeds';
import { parseHeadlines } from '../src/game/news';
import { forStockholm } from '../src/game/warnings';

const TIMEOUT_MS = 8000;
/** After a failed fetch, wait this long before asking the source again, or longer when it says so with Retry-After. */
const RETRY_MS = 15_000;
const MAX_RETRY_MS = 10 * 60_000;

interface Feed {
  /** Seconds a copy stays fresh. */
  ttl: number;
  /** Seconds a copy may still be served while refreshing or while the source fails. */
  keep: number;
  load: () => Promise<unknown>;
}

export class SourceError extends Error {
  constructor(message: string, readonly status: number, readonly retryMs: number) {
    super(message);
  }
}

/**
 * Fetches from a source, throwing a SourceError (with the host only: GTFS urls carry the key) when it fails. Asks for
 * gzip, which Trafiklab requires (406 without it): Bun sends it on its own, Cloudflare's runtime does not.
 */
export async function source(url: string, timeout = TIMEOUT_MS): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'under-stockholm-relay', 'accept-encoding': 'gzip' } });
  if (!response.ok) {
    const after = Number(response.headers.get('retry-after')) * 1000;
    throw new SourceError(`${new URL(url).host} ${response.status}`, response.status, Number.isFinite(after) ? after : 0);
  }
  return response;
}

const json = async (url: string): Promise<unknown> => (await source(url)).json();

/** Seconds SL's last copy stays usable while GTFS fails: a short outage is never seen, a longer one hands every line back to the timetable at once. */
const SL_KEEP = 5 * 60;
/**
 * How long SL's feed may fail before the relay says so (`FeedOptions.alert`): its last copy's five minutes, then ten
 * with every line on the timetable. Once per outage, and once more when it is back.
 */
export const SL_ALERT_MS = 15 * 60_000;

export interface FeedOptions {
  /** Every metro station's departures from GTFS Regional, or null until its timetable is in. Without it (no keys), no SL feed. */
  gtfs?: () => Promise<Record<number, unknown> | null>;
  log?: (message: string) => void;
  /** Tells someone (ALERT_URL) that SL's feed has been down for SL_ALERT_MS, and that it is back. */
  alert?: (title: string, text: string) => void;
  /** Keeps a refresh alive after the response, where the host needs it (the Durable Object). */
  waitUntil?: (task: Promise<unknown>) => void;
}

/** The feeds there are: anything else under /feeds/ is not asked of anyone (worker/index.ts answers it at once). */
export const FEED_NAMES = ['sl', 'deviations', 'weather', 'warnings', 'news'] as const;
export type FeedName = (typeof FEED_NAMES)[number];
export const isFeed = (name: string): name is FeedName => (FEED_NAMES as readonly string[]).includes(name);

export interface Feeds {
  /** Answers /feeds/<name>, or returns null for any other path. */
  handle(url: URL, headers?: Record<string, string>): Promise<Response | null>;
}

/** A feed cache with its own state: one per relay, so the quotas hold for everyone it serves. */
export function createFeeds(options: FeedOptions = {}): Feeds {
  const log = options.log ?? ((message: string) => console.warn(message));
  /** Since when SL's feed has failed, and whether that was told: kept in memory, so a restart starts the count again. */
  let slDown: { since: number; told: boolean; reason: string } | null = null;
  const minutes = (ms: number) => Math.round(ms / 60_000);
  const slFailed = (err: unknown) => {
    const now = Date.now();
    slDown ??= { since: now, told: false, reason: '' };
    slDown.reason = err instanceof Error ? err.message : String(err);
    if (slDown.told || now - slDown.since < SL_ALERT_MS) return;
    slDown.told = true;
    options.alert?.('Under Stockholm: SL feed down', `GTFS has failed for ${minutes(now - slDown.since)} min (${slDown.reason}). Every line keeps to the timetable until it is back.`);
  };
  const slBack = () => {
    if (slDown?.told) options.alert?.('Under Stockholm: SL feed back', `GTFS answers again after ${minutes(Date.now() - slDown.since)} min. The lines follow SL again.`);
    slDown = null;
  };

  const FEEDS: Record<FeedName, Feed> = {
    // The game's real trains and the landing map poll every 30 s; one GTFS fetch covers every line, as often as SL
    // updates it. A failure keeps the last copy for SL_KEEP, then the feed is unavailable and asked again after the
    // usual pause: every line keeps to the timetable meanwhile, never some lines on SL and others not.
    sl: {
      ttl: 15, keep: SL_KEEP,
      load: async () => {
        // Without keys there is nothing to ask: not again for a long while.
        if (!options.gtfs) throw new SourceError('no GTFS keys', 503, MAX_RETRY_MS);
        try {
          const lists = await options.gtfs();
          if (!lists) throw new SourceError('GTFS timetable not in yet', 503, 0);
          slBack();
          return lists;
        } catch (err) {
          slFailed(err);
          throw err;
        }
      },
    },
    deviations: { ttl: 120, keep: 15 * 60, load: () => json(SL_DEVIATIONS) },
    weather: { ttl: 15 * 60, keep: 3 * 60 * 60, load: () => json(WEATHER) },
    warnings: { ttl: 5 * 60, keep: 60 * 60, load: async () => forStockholm(await json(SMHI_WARNINGS)) },
    // The papers print yesterday's news, so a copy may be old; SR is asked twice an hour at most.
    news: { ttl: 30 * 60, keep: 24 * 60 * 60, load: async () => parseHeadlines(await (await source(SR_NEWS)).text()) },
  };

  interface Copy { data: unknown; at: number }
  const copies = new Map<string, Copy>();
  const pending = new Map<string, Promise<Copy | null>>();
  const pausedUntil = new Map<string, number>();

  async function get(name: string, feed: Feed): Promise<Copy | null> {
    const now = Date.now();
    const copy = copies.get(name);
    if (copy && now - copy.at < feed.ttl * 1000) return copy;
    const usable = copy && now - copy.at < feed.keep * 1000 ? copy : null;
    if (now < (pausedUntil.get(name) ?? 0)) return usable;
    let load = pending.get(name);
    if (!load) {
      load = feed.load().then((data) => {
        const fresh = { data, at: Date.now() };
        copies.set(name, fresh);
        return fresh;
      }).catch((err) => {
        const wait = err instanceof SourceError ? Math.min(MAX_RETRY_MS, Math.max(RETRY_MS, err.retryMs)) : RETRY_MS;
        pausedUntil.set(name, Date.now() + wait);
        log(`feed ${name}: ${err instanceof Error ? err.message : err}`);
        return null;
      }).finally(() => pending.delete(name));
      pending.set(name, load);
      options.waitUntil?.(load);
    }
    // Preserve the original timestamp and freshness headers: serving a copy must not make it younger. With no
    // usable copy, a cold request still waits for this shared fetch rather than exposing expired data.
    return usable ?? await load;
  }

  return {
    async handle(url, headers = {}) {
      const match = /^\/feeds\/([a-z]+)$/.exec(url.pathname);
      if (!match) return null;
      if (!isFeed(match[1])) return new Response('Unknown feed', { status: 404, headers });
      const feed = FEEDS[match[1]];
      const copy = await get(match[1], feed);
      if (!copy) return Response.json({ error: 'unavailable' }, { status: 502, headers });
      const age = Math.floor((Date.now() - copy.at) / 1000);
      // Browsers and any cache in front may keep it until the relay would fetch a new one.
      const maxAge = Math.max(0, feed.ttl - age);
      return Response.json({ at: copy.at, data: copy.data }, { headers: { ...headers, 'cache-control': `public, max-age=${maxAge}`, age: String(age) } });
    },
  };
}
