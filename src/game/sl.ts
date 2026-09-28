import { stockholmEpoch } from './clock';
import { relayFeed, relayUrl } from './relay';

/**
 * SL's open Transport API (no key, CORS enabled): real-time metro departures
 * per station. SL publishes departures, not positions, so what we keep is,
 * per journey, the expected departure from each station on our stretch.
 * Times from earlier polls are kept, so a train that has just left a station
 * still knows when it did. Shared by the landing map and the game's real mode,
 * both of which read the relay's shared copy (`relay.ts`), never SL itself,
 * so SL sees the same load however many visitors watch.
 * No three.js here: the landing page imports it.
 */

/** Departure to departure between neighbouring stations when no journey shows both. */
export const DEFAULT_GAP = 110;
/** Without fresh data for this long, a line falls back to the game's own timetable. */
export const STALE = 150;
/** Share of a line's stations SL must report trains at for the line to follow SL. */
const COVERED = 0.25;

/**
 * Whether one poll's sightings cover a line of `stations` stations. Without GTFS the relay only asks for the blue
 * line's stations, but those that other lines share list their trains too: a line counts as covered only when SL
 * reported from a good part of it.
 */
export function covers(sightings: readonly Sighting[], stations: number): boolean {
  return new Set(sightings.map((x) => x.station)).size >= Math.max(2, COVERED * stations);
}
const FORGET = 20 * 60;

export interface Sighting {
  journey: number;
  line: string;
  /** 1 toward Hjulsta and Akalla (track 1), 2 toward Kungsträdgården (track 2). */
  direction: 1 | 2;
  destination: string;
  station: number;
  /** Expected departure, epoch seconds. */
  time: number;
  atStop: boolean;
}

export interface Journey {
  id: number;
  line: string;
  direction: 1 | 2;
  destination: string;
  /** Expected departure per station index, if SL has listed it. */
  times: (number | undefined)[];
  /** Station where SL last reported the train standing, and when. */
  atStop: { station: number; seen: number } | null;
  seen: number;
}

/** SL gives local Stockholm time without an offset, for example 2026-09-23T20:15:48. */
export function parseStockholm(text: string): number | null {
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return stockholmEpoch(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
}

export interface ApiDeparture {
  direction_code?: number;
  destination?: string;
  expected?: string;
  scheduled?: string;
  state?: string;
  journey?: { id?: number };
  line?: { designation?: string };
}

/** Sightings of the given lines in one station's departure list. */
export function parseDepartures(station: number, body: { departures?: ApiDeparture[] }, lines: ReadonlySet<string>): Sighting[] {
  const out: Sighting[] = [];
  for (const d of body.departures ?? []) {
    const line = d.line?.designation ?? '';
    const journey = d.journey?.id;
    const time = parseStockholm(d.expected ?? d.scheduled ?? '');
    if (!lines.has(line) || journey === undefined || time === null) continue;
    if (d.direction_code !== 1 && d.direction_code !== 2) continue;
    out.push({ journey, line, direction: d.direction_code, destination: d.destination ?? '', station, time, atStop: d.state === 'ATSTOP' });
  }
  return out;
}

export interface DepartureLists {
  /** One per site, in the order asked for. */
  lists: Array<{ departures?: ApiDeparture[] }>;
  /** When SL gave them, epoch seconds. */
  at: number;
}

/** Real trains need a relay: without one they are off rather than every visitor polling SL. */
export const realTrainsAvailable = (): boolean => relayUrl() !== null;

/** Every site's departure list, from the relay's shared copy. Throws when there is no relay or it has no copy. */
export async function fetchDepartures(sites: readonly number[], signal?: AbortSignal): Promise<DepartureLists> {
  const cached = await relayFeed<Record<string, { departures?: ApiDeparture[] }>>('sl', signal);
  if (!cached) throw new Error('SL departures need the relay');
  return { lists: sites.map((site) => cached.data[site] ?? {}), at: cached.at };
}

/** Sightings of `lines` at every site. Station `i` is `sites[i]`. */
export async function fetchSightings(sites: readonly number[], lines: ReadonlySet<string>, signal?: AbortSignal): Promise<{ sightings: Sighting[]; at: number }> {
  const { lists, at } = await fetchDepartures(sites, signal);
  return { sightings: lists.flatMap((body, i) => parseDepartures(i, body, lines)), at };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export class JourneyStore {
  readonly journeys = new Map<number, Journey>();

  /** Adds one poll's sightings, taken at `now`. */
  update(sightings: Sighting[], now: number): void {
    for (const s of sightings) {
      let j = this.journeys.get(s.journey);
      if (!j) {
        j = { id: s.journey, line: s.line, direction: s.direction, destination: s.destination, times: [], atStop: null, seen: now };
        this.journeys.set(s.journey, j);
      }
      j.times[s.station] = s.time;
      j.seen = now;
      if (s.atStop) j.atStop = { station: s.station, seen: now };
      else if (j.atStop?.station === s.station) j.atStop = null;
    }
    for (const [id, j] of this.journeys) if (now - j.seen > FORGET) this.journeys.delete(id);
  }

  /** Departure to departure between neighbouring stations `a` and `b` (either order), from journeys that show both. */
  gap(a: number, b: number): number {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const gaps: number[] = [];
    for (const j of this.journeys.values()) {
      const ta = j.times[lo];
      const tb = j.times[hi];
      if (ta !== undefined && tb !== undefined && ta !== tb) gaps.push(Math.abs(tb - ta));
    }
    return gaps.length ? Math.max(55, Math.min(300, median(gaps))) : DEFAULT_GAP;
  }
}
