import { covers, fetchDepartures, JourneyStore, parseDepartures, STALE, type Journey, type Sighting } from '../game/sl';
import { LINES } from './lines';
import { MAP_REACH, ROUTE_STATIONS, type Departure, type MapTrain } from './trains';

/**
 * A real line on the map, from SL (see `game/sl.ts`). SL publishes
 * departures, not positions, so a train's place is inferred: a journey shows
 * up in the departure lists of the stations it has yet to pass, and between
 * two of them it is interpolated by the expected times.
 */

/** Roughly how long a train stands at a platform before its expected departure. */
const DWELL = 25;
/** A train that reached its inbound terminal stays on the map this long before it reverses as a new journey. */
const TERMINUS_HOLD = 60;
const HOP = 110;

/** Every line's sightings from one fetch of the relay's copy. Station `i` of line `l` is `LINES[l].stations[i]`. */
export async function fetchSightings(signal?: AbortSignal): Promise<{ sightings: Sighting[][]; at: number }> {
  const sites = LINES.flatMap((line) => line.stations.map((s) => s.site));
  const { lists, at } = await fetchDepartures(sites, signal);
  let k = 0;
  const sightings = LINES.map((line) => {
    // A shared station has one site for both lines, so each line keeps its own trains.
    const numbers = new Set(line.routes.map((r) => r.number));
    return line.stations.map((_, i) => parseDepartures(i, lists[k++], numbers)).flat();
  });
  return { sightings, at };
}

export class RealTrains {
  private readonly store = new JourneyStore();
  private lastOk = -Infinity;

  constructor(private readonly line = 0) {}

  /** Adds one poll's sightings, taken at `now`. */
  update(sightings: Sighting[], now: number): void {
    this.store.update(sightings, now);
    if (covers(sightings, LINES[this.line].stations.length)) this.lastOk = now;
  }

  /** SL recently sent trains from enough of the line to show them, by the same rule as the game. */
  live(now: number): boolean {
    return now - this.lastOk < STALE;
  }

  /** Next outbound departures from a station, from SL's expected times. */
  nextDepartures(now: number, station: number, count = 2): Departure[] {
    const deps: Departure[] = [];
    for (const [, j] of this.store.journeys) {
      if (j.direction !== 1) continue;
      const t = j.times[station];
      if (t === undefined || t <= now - 20) continue;
      deps.push({ line: j.line, destination: j.destination, seconds: Math.max(0, t - now) });
    }
    return deps.sort((a, b) => a.seconds - b.seconds).slice(0, count);
  }

  private hop(a: number, b: number): number {
    return this.store.gap(a, b);
  }

  trains(now: number): MapTrain[] {
    const out: MapTrain[] = [];
    for (const [id, j] of this.store.journeys) {
      const route = LINES[this.line].routes.findIndex((r) => r.number === j.line);
      if (route < 0) continue;
      const place = this.place(j, now, ROUTE_STATIONS[this.line][route]);
      if (!place) continue;
      const row = j.direction === 1 ? 0 : 1;
      out.push({ id: `sl-${id}`, line: j.line, destination: j.destination, route, row, doorsOpen: place.status.kind === 'at', ...place });
    }
    return out;
  }

  /** @param stations the journey's route, east to west, as the line's station indices */
  private place(j: Journey, now: number, stations: number[]): Pick<MapTrain, 's' | 'status'> | null {
    const last = stations.length - 1;
    // Positions along the route are station steps; SL's times are keyed by global station index.
    const seq = j.direction === 1 ? stations.map((_, k) => k) : stations.map((_, k) => last - k);
    const time = (k: number) => j.times[stations[k]];
    const at = (k: number) => ({ s: k, status: { kind: 'at' as const, station: stations[k] } });
    const between = (from: number, to: number, f: number) => ({ s: from + (to - from) * Math.min(1, Math.max(0, f)), status: { kind: 'to' as const, station: stations[to] } });

    // SL's own word wins while it is fresh.
    const standing = j.atStop ? stations.indexOf(j.atStop.station) : -1;
    if (j.atStop && standing >= 0 && now - j.atStop.seen < 45 && (j.times[j.atStop.station] ?? 0) > now - 5) return at(standing);

    const hop = (a: number, b: number) => this.hop(Math.min(stations[a], stations[b]), Math.max(stations[a], stations[b]));
    const p = seq.findIndex((k) => (time(k) ?? -Infinity) > now);
    if (p >= 0) {
      const k = seq[p];
      const t = time(k)!;
      if (t - now <= DWELL) return at(k);
      if (p === 0) {
        // Outbound trains start at the inbound terminal and only show once SL says they stand there.
        if (j.direction === 1) return null;
        // Inbound trains coming out of the turnback beyond the outbound terminal.
        const f = (t - DWELL - now) / (HOP - DWELL);
        return f > 1 ? null : { s: last + f * MAP_REACH * 0.9, status: { kind: 'to', station: stations[last] } };
      }
      const prev = seq[p - 1];
      const tp = time(prev) ?? t - hop(prev, k);
      const f = (now - tp) / (t - DWELL - tp);
      if (f < -0.5) return null;
      return f < 0 ? at(prev) : between(prev, k, f);
    }

    // Every known station is behind the train.
    let q = -1;
    for (let i = seq.length - 1; i >= 0; i--) if (time(seq[i]) !== undefined) { q = i; break; }
    if (q < 0) return null;
    const passed = seq[q];
    const tl = time(passed)!;
    if (q < seq.length - 1) {
      // Terminals list no arrivals, so the last leg is estimated.
      const next = seq[q + 1];
      const tn = tl + hop(passed, next);
      if (now < tn - DWELL) return between(passed, next, (now - tl) / (tn - DWELL - tl));
      return now < tn + (q + 1 === seq.length - 1 ? TERMINUS_HOLD : 0) ? at(next) : null;
    }
    // Past the last station listed, into the turnback.
    const f = (now - tl) / (HOP - DWELL);
    return f > 1 ? null : { s: last + f * MAP_REACH * 0.9, status: { kind: 'away' } };
  }
}
