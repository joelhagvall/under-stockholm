// The shared cache of the open data feeds, served at /feeds/<name>: by the Bun relay in development (server/feeds.ts,
// which adds GTFS Regional when it has Trafiklab's keys) and by the hub on Cloudflare (worker/hub.ts). Nothing here
// needs Bun or a browser.
// Every player asks the relay, the relay asks the source at most once per feed's interval, and only while someone is
// asking: with nobody playing it makes no requests at all. Concurrent requests share one upstream fetch, a failed
// fetch is not retried for a while, and the last good copy is served until it is too old.
//
// Every answer is { at, data }, `at` being when the relay fetched it (epoch ms):
//   GET /feeds/sl          data: { [site]: { departures } }   SL departures at every metro station from GTFS Regional
//                          with Trafiklab keys (server/gtfs.ts), else at the blue line's from SL's Transport API
//                          (also when GTFS has failed for longer than its last copy keeps)
//   GET /feeds/deviations  data: SL's traffic information, as SL sends it
//   GET /feeds/weather     data: Open-Meteo's answer, as it sends it
//   GET /feeds/warnings    data: SMHI's warnings for Stockholms län only
//   GET /feeds/news        data: [{ title, published }]   P4 Stockholm's news, for the newspapers

import { SL_DEVIATIONS, slDepartures, SMHI_WARNINGS, SR_NEWS, WEATHER } from '../src/game/feeds';
import { parseHeadlines } from '../src/game/news';
import { forStockholm } from '../src/game/warnings';
import { LINES } from '../src/landing/lines';

const TIMEOUT_MS = 8000;
/** After a failed fetch, wait this long before asking the source again, or longer when it says so with Retry-After. */
const RETRY_MS = 15_000;
const MAX_RETRY_MS = 10 * 60_000;

interface Feed {
  /** Seconds a copy stays fresh. */
  ttl: number;
  /** Seconds a copy may still be served while the source fails. */
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

interface Departure {
  direction_code?: number;
  destination?: string;
  expected?: string;
  scheduled?: string;
  state?: string;
  journey?: { id?: number };
  line?: { designation?: string };
}
type DepartureList = { departures: Departure[] };

/** Only the fields the game reads, so a poll of every station stays small. */
const trim = (d: Departure): Departure => ({
  direction_code: d.direction_code,
  destination: d.destination,
  expected: d.expected,
  scheduled: d.scheduled,
  state: d.state,
  journey: { id: d.journey?.id },
  line: { designation: d.line?.designation },
});

/**
 * SL's keyless Transport API has no published quota but asks for restraint, and Trafiklab support has named 12
 * requests a minute. The relay keeps to that however many play: at most 12 in any 60 s, spent on the stations whose
 * lists are oldest, so each station is refreshed every 100 s on average and every two minutes at most. Trains still
 * move smoothly, from SL's expected times.
 */
const SL_PER_MINUTE = 12;
/** Without GTFS the Transport API covers the blue line only: its quota would not reach every station. */
const STATIONS = LINES[0].stations;
/** Seconds a station's list stays usable: a few rounds of the line, so one failing station does not vanish. */
const SL_KEEP = 5 * 60;

export interface FeedOptions {
  /** Every metro station's departures from GTFS Regional, or null while there is none (the Bun relay, with keys). */
  gtfs?: () => Promise<Record<number, unknown> | null>;
  log?: (message: string) => void;
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
  /** Each station's last good list. */
  const lastLists = new Map<number, { list: DepartureList; at: number }>();
  /** When each request to SL in the last minute was sent. */
  const slSent: number[] = [];
  /** When GTFS Regional last answered with every line's departures. */
  let gtfsAt = 0;

  /** Takes up to `want` requests from SL's budget. */
  function slBudget(want: number): number {
    const now = Date.now();
    while (slSent.length && now - slSent[0] >= 60_000) slSent.shift();
    const n = Math.max(0, Math.min(want, SL_PER_MINUTE - slSent.length));
    for (let i = 0; i < n; i++) slSent.push(now);
    return n;
  }

  const FEEDS: Record<FeedName, Feed> = {
    // The game's real trains and the landing map poll every 30 s. With GTFS one fetch covers the line, as often as
    // SL updates it; without, each load spends what the Transport API's budget allows.
    sl: {
      ttl: options.gtfs ? 15 : 5, keep: SL_KEEP,
      load: async () => {
        if (options.gtfs) {
          try {
            const lists = await options.gtfs();
            if (lists) { gtfsAt = Date.now(); return lists; }
          } catch (err) {
            // A short outage keeps the last copy, every line's, for as long as it keeps (SL_KEEP), and asks GTFS again
            // after the usual pause: the Transport API would narrow it to the blue line. Only a longer one falls back.
            if (Date.now() - gtfsAt < SL_KEEP * 1000) throw err;
            log(`feed sl (GTFS), using the Transport API: ${err instanceof Error ? err.message : err}`);
          }
        }
        const age = (site: number) => lastLists.get(site)?.at ?? 0;
        const due = [...STATIONS].sort((a, b) => age(a.site) - age(b.site));
        const batch = due.slice(0, slBudget(due.length));
        const results = await Promise.allSettled(batch.map(async (s) => {
          const body = (await json(slDepartures(s.site))) as { departures?: Departure[] };
          lastLists.set(s.site, { list: { departures: (body.departures ?? []).map(trim) }, at: Date.now() });
        }));
        const failures = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
        const lists: Record<number, DepartureList> = {};
        for (const s of STATIONS) {
          const last = lastLists.get(s.site);
          if (last && Date.now() - last.at < SL_KEEP * 1000) lists[s.site] = last.list;
        }
        // Being rate limited, or having nothing to show, pauses the whole feed.
        const limited = failures.find((e) => e instanceof SourceError && e.status === 429);
        if (limited || (failures.length && !Object.keys(lists).length)) throw limited ?? failures[0];
        return lists;
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
  const pending = new Map<string, Promise<Copy>>();
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
      }).finally(() => pending.delete(name));
      pending.set(name, load);
    }
    try {
      return await load;
    } catch (err) {
      const wait = err instanceof SourceError ? Math.min(MAX_RETRY_MS, Math.max(RETRY_MS, err.retryMs)) : RETRY_MS;
      pausedUntil.set(name, Date.now() + wait);
      log(`feed ${name}: ${err instanceof Error ? err.message : err}`);
      return usable;
    }
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
