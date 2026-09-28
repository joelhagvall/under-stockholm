import { serviceOpen, stockholm, stockholmEpoch, summerTimetable } from './clock';
import type { Timetable } from './timetable';

/**
 * Which timetable trains run right now. Service is decided once per loop, at
 * the moment a train leaves the east turnback cavern, so trains only enter and
 * leave service out of sight. Everything here is a pure function of the clock.
 *
 * Services alternate between the routes (`service % routes`), spread evenly
 * over their common cycle, so the trunk sees a train every `cycle / TRAIN_COUNT`.
 */

export const TRAIN_COUNT = 6;

/** Services that rest on the summer timetable: one per route, so both branches keep a train every other slot. */
export const SUMMER_REST = [2, 5];

const mod = (a: number, n: number) => ((a % n) + n) % n;

export function serviceOffset(timetable: Timetable, index: number): number {
  return (index * timetable.cycle) / TRAIN_COUNT;
}

/** Game time when the loop containing `time` began for a train with this offset. */
export function loopStart(timetable: Timetable, time: number, offset: number): number {
  return time - mod(time + offset, timetable.cycle);
}

export interface Arrival {
  /** Seconds until the train reaches the stop (0 while it stands there). */
  eta: number;
  service: number;
  /** No later train reaches this stop before the night break. */
  last: boolean;
}

/** One train's place in the service. */
export interface ServiceSlot {
  timetable: Timetable;
  /** Added to the clock: `timetable.stateAt(time + offset)`. */
  offset: number;
  /** Index of the route, among all the network's routes. */
  route: number;
  line: number;
  /** Stays in the depot on the summer timetable. */
  summerRest?: boolean;
  /** Only ever driven by SL's real trains, never by the timetable. */
  spare?: boolean;
}

export class Operations {
  private readonly open = new Map<number, boolean>();
  readonly slots: ServiceSlot[];
  readonly offsets: number[];
  /** Every route's timetable, by route index. */
  readonly timetables: Timetable[];

  /**
   * @param timetables one line's timetables, one per route with the same
   * cycle (`TRAIN_COUNT` services taking turns between them), or every
   * service of the network as slots, with the routes' timetables by index
   */
  constructor(timetables: Timetable | Timetable[] | { slots: ServiceSlot[]; timetables: Timetable[] }) {
    if ('slots' in timetables) {
      this.slots = timetables.slots;
      this.timetables = timetables.timetables;
    } else {
      this.timetables = Array.isArray(timetables) ? timetables : [timetables];
      this.slots = Array.from({ length: TRAIN_COUNT }, (_, i) => ({
        timetable: this.timetables[i % this.timetables.length],
        offset: serviceOffset(this.timetables[0], i),
        route: i % this.timetables.length,
        line: 0,
        summerRest: SUMMER_REST.includes(i),
      }));
    }
    this.offsets = this.slots.map((s) => s.offset);
  }

  /** The first route's timetable. */
  get timetable(): Timetable {
    return this.timetables[0];
  }

  /** Route index of a service. */
  routeOf(service: number): number {
    return this.slots[service]?.route ?? service % this.timetables.length;
  }

  timetableOf(service: number): Timetable {
    return this.slots[service]?.timetable ?? this.timetables[this.routeOf(service)];
  }

  /** Whether a service runs the loop that starts at `start`. */
  loopInService(start: number, service = 0): boolean {
    const key = Math.round(start * 10) * 1024 + service;
    let value = this.open.get(key);
    if (value === undefined) {
      const slot = this.slots[service];
      value = !slot?.spare && serviceOpen(start) && !(slot?.summerRest && summerTimetable(start));
      if (this.open.size > 4096) this.open.clear();
      this.open.set(key, value);
    }
    return value;
  }

  inService(time: number, service: number): boolean {
    const slot = this.slots[service];
    if (!slot || slot.spare) return false;
    return this.loopInService(loopStart(slot.timetable, time, slot.offset), service);
  }

  /**
   * Soonest in-service arrival at a station on a track, over every route that
   * serves it (on one `line` only, at a station two lines share), within `horizon` seconds.
   */
  nextArrival(time: number, station: number, track: 1 | 2, horizon = 6 * 3600, line?: number): Arrival | null {
    return this.nextArrivals(time, station, track, 1, horizon, line)[0] ?? null;
  }

  /** The next `count` in-service arrivals at a station on a track, soonest first, as the platform boards list them. */
  nextArrivals(time: number, station: number, track: 1 | 2, count: number, horizon = 6 * 3600, line?: number): Arrival[] {
    const out: Arrival[] = [];
    let found = this.soonest(time, station, track, horizon, -1, line);
    while (found && found.eta < horizon && out.length < count) {
      const cycle = this.timetableOf(found.service).cycle;
      const following = this.soonest(time, station, track, found.eta + cycle * 1.5, found.eta + 0.5, line);
      out.push({ ...found, last: following === null && !serviceOpen(time + found.eta + cycle) });
      found = following;
    }
    return out;
  }

  /**
   * Seconds until the last in-service train reaches a station on a track
   * before the night break, if that is within `horizon`. Null on all-night service.
   */
  lastArrival(time: number, station: number, track: 1 | 2, horizon = 6 * 3600): number | null {
    let t = time;
    for (let i = 0; i < 200; i++) {
      const a = this.nextArrival(t, station, track, horizon - (t - time));
      if (!a) return null;
      if (a.last) return t - time + a.eta;
      // Step past this train's stop, since a standing train reads as zero seconds away.
      const tt = this.timetableOf(a.service);
      t += a.eta + tt.stopDuration(tt.stopIndex(station, track)) + 1;
    }
    return null;
  }

  private soonest(time: number, station: number, track: 1 | 2, horizon: number, after: number, line?: number): { eta: number; service: number } | null {
    let best: { eta: number; service: number } | null = null;
    for (let service = 0; service < this.slots.length; service++) {
      const slot = this.slots[service];
      if (slot.spare || (line !== undefined && slot.line !== line)) continue;
      const tt = slot.timetable;
      const k = tt.stopIndex(station, track);
      if (k < 0) continue;
      const first = tt.secondsUntil(time + slot.offset, k);
      for (let eta = first; eta < horizon; eta += tt.cycle) {
        if (eta <= after) continue;
        if (best && eta >= best.eta) break;
        if (this.inService(time + eta, service)) { best = { eta, service }; break; }
      }
    }
    return best;
  }
}

/**
 * A fixed daytime instant for debug screenshots. `?t=20` keeps meaning what it
 * did before the clock was real: the first train about to reach Kungsträdgården.
 */
export function referenceEpoch(timetable: Timetable): number {
  const base = timetable.arrival(timetable.stopIndex(0, 1)) - 14;
  const noon = stockholmEpoch(2026, 1, 14, 12);
  return noon + mod(base - noon, timetable.cycle);
}

/**
 * Start time for this session. Normally now. With `?debug`, `clock=HH:MM`
 * (or `clock=YYYY-MM-DDTHH:MM`) picks a Stockholm time and `t` offsets it,
 * or on its own counts from the screenshot reference.
 */
export function startTime(timetable: Timetable, params: URLSearchParams, debug: boolean, now = Date.now() / 1000): number {
  if (!debug) return now;
  const t = params.has('t') ? Number(params.get('t')) || 0 : 0;
  const clock = params.get('clock');
  if (clock) {
    const m = clock.match(/^(?:(\d{4})-(\d{2})-(\d{2})T)?(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const today = stockholm(now);
      const [y, mo, d] = m[1] ? [Number(m[1]), Number(m[2]), Number(m[3])] : [today.year, today.month, today.day];
      return stockholmEpoch(y, mo, d, Number(m[4]), Number(m[5]), Number(m[6] ?? 0)) + t;
    }
  }
  if (params.has('t')) return referenceEpoch(timetable) + t;
  return now;
}
