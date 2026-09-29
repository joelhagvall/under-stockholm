import { CAVE_HALF_L, STACK, TRACK_Z, TURNBACK_REACH } from './layout';

/**
 * A route is modelled as one closed loop: west on track 1 (z < 0, trains
 * keep left), across in the far turnback cavern, east on track 2 (z > 0), and
 * across again.
 * Every train on a route follows the same timetable, offset in time, so the
 * whole service is a pure function of the clock and never needs collision
 * checks. Routes that share a trunk share its timing too (see
 * `lineTimetables` in `routes.ts`).
 */

export interface RouteShape {
  /** Global indices of the stations served, east to west. Defaults to all. */
  stations?: number[];
  /** Each station's distance along the route from the first. Defaults to their spacing in `stationX`. */
  along?: number[];
  /**
   * World x minus distance along the route, per station. Where it changes
   * between neighbours the route crosses a portal halfway between them, into
   * a stretch built elsewhere along x (see `routes.ts`). Defaults to no portals.
   */
  offsets?: number[];
  /**
   * How far outside the usual tracks the route runs, per station: where two
   * lines share a station (T-Centralen, Gamla stan, Slussen) the second
   * line's tracks lie this much further out, beyond the platforms they
   * share. Changes, like offsets, happen at a portal. Defaults to none.
   */
  lanes?: number[];
  /**
   * Extra seconds in the turnbacks, so every route of a line keeps to the
   * trunk's rhythm (see `lineTimetables`). A number is the west end's.
   */
  layover?: number | { west?: number; east?: number };
  /**
   * The route ends where its line goes on: it turns on a siding between the
   * running tracks there, instead of in a cavern beyond the terminal.
   */
  siding?: { east?: boolean; west?: boolean };
  /** Seconds the doors stand open at each station (see `stationDwell`). Defaults to `STATION_DWELL`. */
  dwells?: number[];
  /**
   * Per station, whether it lies on two levels (see `STACK`): there track 1 runs mirrored to track 2's side and
   * `STACK.drop` under it, crossing over at a portal in the tunnel either side.
   */
  stacked?: boolean[];
}

export type Track = 1 | 2;

export interface Stop {
  u: number;
  kind: 'station' | 'turnback';
  station: number;
  track: Track;
  dwell: number;
  terminal: boolean;
}

export type Phase = 'opening' | 'dwell' | 'closing' | 'waiting' | 'moving';

export interface TrainState {
  u: number;
  x: number;
  z: number;
  /** The rail's height: 0, or under a two-level station's upper track (see `STACK`). */
  y: number;
  speed: number;
  doors: number;
  phase: Phase;
  /** The stop the train is at, or just left. */
  stop: number;
  /** The stop the train is heading for next. */
  next: number;
}

const OPEN = 2;
// The buzzer leads the door movement slightly, then overlaps the closing slide.
export const DOOR_WARNING = 0.4;
export const DOOR_SLIDE = 2.5;
export const DEPARTURE_HOLD = 1;
export const STATION_DWELL = 12;
/** Weekday boardings at the quietest stations, where the doors stand open `STATION_DWELL`. */
const QUIET_RIDERS = 2000;

/**
 * How long the doors stand open at a station, from its weekday boardings: about 12 s out in the suburbs, half a
 * minute at Slussen and T-Centralen, as SL's trains do. Whole seconds, so timetables stay easy to read.
 */
export function stationDwell(riders?: number): number {
  if (!riders) return STATION_DWELL;
  return Math.round(Math.min(36, STATION_DWELL + 5 * Math.log2(Math.max(1, riders / QUIET_RIDERS))));
}
const CLOSE = DOOR_WARNING + DOOR_SLIDE;
const LINE_SPEED = 22;
const LINE_ACCEL = 1.1;
const SHUNT_SPEED = 2.5;
const SHUNT_ACCEL = 0.5;

interface Hop {
  length: number;
  duration: number;
  vmax: number;
  accel: number;
}

function makeHop(length: number, vmax: number, accel: number): Hop {
  const full = (vmax * vmax) / accel;
  if (length >= full) return { length, vmax, accel, duration: length / vmax + vmax / accel };
  const peak = Math.sqrt(length * accel);
  return { length, vmax: peak, accel, duration: (2 * peak) / accel };
}

/** Trapezoidal motion profile: distance and speed after `t` seconds. */
function hopAt(h: Hop, t: number): { s: number; v: number } {
  const ta = h.vmax / h.accel;
  const cruise = h.duration - 2 * ta;
  if (t <= ta) return { s: 0.5 * h.accel * t * t, v: h.accel * t };
  if (t <= ta + cruise) return { s: 0.5 * h.accel * ta * ta + h.vmax * (t - ta), v: h.vmax };
  const td = Math.min(h.duration, t) - ta - cruise;
  const s = 0.5 * h.accel * ta * ta + h.vmax * cruise + h.vmax * td - 0.5 * h.accel * td * td;
  return { s: Math.min(h.length, s), v: Math.max(0, h.vmax - h.accel * td) };
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export class Timetable {
  readonly stops: Stop[] = [];
  readonly loopLength: number;
  readonly cycle: number;
  private readonly hops: Hop[] = [];
  private readonly starts: number[] = [];
  /** Along the route (0 at the first station), where the turnbacks lie. */
  private readonly xWest: number;
  private readonly xEast: number;
  private readonly runLength: number;
  private readonly shuntLength = 2 * TRACK_Z;
  /** Global indices of the stations served, east to west. */
  readonly route: number[];
  /** Each station's distance along the route. */
  readonly along: number[];
  /** Portals along the route: from distance `from` on, world x is distance plus `offset`, and the tracks lie `lane` further out. */
  private readonly segments: Array<{ from: number; offset: number; lane: number }>;
  /** Along the route, where track 1 runs on the lower level of a two-level station: from, to. */
  private readonly lower: Array<[number, number]>;

  /** @param stationX world x of every station, by global index */
  constructor(readonly stationX: number[], shape: RouteShape = {}) {
    const route = shape.stations ?? stationX.map((_, i) => i);
    this.route = route;
    const along = shape.along ?? route.map((i) => stationX[i] - stationX[route[0]]);
    this.along = along;
    const offsets = shape.offsets ?? route.map((i, k) => stationX[i] - along[k]);
    const lanes = shape.lanes ?? route.map(() => 0);
    const reach = CAVE_HALF_L + STACK.portal;
    this.lower = route.flatMap((_, k) => (shape.stacked?.[k] ? [[along[k] - reach, along[k] + reach] as [number, number]] : []));
    this.segments = [{ from: -Infinity, offset: offsets[0], lane: lanes[0] }];
    for (let k = 1; k < route.length; k++) {
      if (offsets[k] !== offsets[k - 1] || lanes[k] !== lanes[k - 1]) this.segments.push({ from: (along[k - 1] + along[k]) / 2, offset: offsets[k], lane: lanes[k] });
    }
    const n = route.length;
    this.xEast = along[0] - TURNBACK_REACH;
    this.xWest = along[n - 1] + TURNBACK_REACH;
    this.runLength = this.xWest - this.xEast;
    const L = this.runLength;
    const C = this.shuntLength;
    this.loopLength = 2 * L + 2 * C;
    const layover = typeof shape.layover === 'number' ? { west: shape.layover } : shape.layover ?? {};
    // On a siding the train waits between the running tracks, halfway through its crossing.
    const westWait = shape.siding?.west ? L + C / 2 : L;
    const eastWait = shape.siding?.east ? 2 * L + C + C / 2 : 2 * L + C;

    const stops = this.stops;
    const west = route[n - 1];
    const east = route[0];
    stops.push({ u: 0, kind: 'turnback', station: east, track: 1, dwell: 4, terminal: false });
    const dwells = shape.dwells ?? route.map(() => STATION_DWELL);
    along.forEach((a, k) => stops.push({ u: a - this.xEast, kind: 'station', station: route[k], track: 1, dwell: dwells[k], terminal: k === n - 1 }));
    stops.push({ u: westWait, kind: 'turnback', station: west, track: 1, dwell: 4 + (layover.west ?? 0), terminal: false });
    stops.push({ u: L + C, kind: 'turnback', station: west, track: 2, dwell: 4, terminal: false });
    for (let k = n - 1; k >= 0; k--) {
      stops.push({ u: L + C + (this.xWest - along[k]), kind: 'station', station: route[k], track: 2, dwell: dwells[k], terminal: k === 0 });
    }
    stops.push({ u: eastWait, kind: 'turnback', station: east, track: 2, dwell: 4 + (layover.east ?? 0), terminal: false });

    let t = 0;
    for (let k = 0; k < stops.length; k++) {
      const a = stops[k];
      const b = stops[(k + 1) % stops.length];
      const length = mod(b.u - a.u, this.loopLength);
      const shunt = a.kind === 'turnback' && b.kind === 'turnback';
      const hop = shunt ? makeHop(length, SHUNT_SPEED, SHUNT_ACCEL) : makeHop(length, LINE_SPEED, LINE_ACCEL);
      this.hops.push(hop);
      this.starts.push(t);
      t += this.stopDuration(k) + hop.duration;
    }
    this.cycle = t;
  }

  /** Clock time (within one cycle) when a train arrives at stop `k`. */
  arrival(k: number): number {
    return this.starts[k];
  }

  stopDuration(k: number): number {
    const s = this.stops[k];
    return s.kind === 'station' ? OPEN + s.dwell + CLOSE + DEPARTURE_HOLD : s.dwell;
  }

  /** The stretch a distance along the route lies in: past a portal the track lies elsewhere along x. */
  private segment(a: number): { offset: number; lane: number } {
    const s = this.segments;
    let k = s.length - 1;
    while (a < s[k].from) k--;
    return s[k];
  }

  private shift(a: number): number {
    return a + this.segment(a).offset;
  }

  /** Distance along the route from its first station, for a loop coordinate. */
  alongAt(u: number): number {
    const L = this.runLength;
    const C = this.shuntLength;
    const w = mod(u, this.loopLength);
    if (w < L) return this.xEast + w;
    if (w < L + C) return this.xWest;
    if (w < 2 * L + C) return this.xWest - (w - L - C);
    return this.xEast;
  }

  /** Maps a loop coordinate to a world position on the track (`y` the rail's height). */
  pose(u: number): { x: number; z: number; y: number } {
    const L = this.runLength;
    const C = this.shuntLength;
    const w = mod(u, this.loopLength);
    if (w < L) {
      const a = this.xEast + w;
      const s = this.segment(a);
      // Round a two-level station track 1 runs under track 2, crossing over at a portal either side.
      if (this.lower.some(([p, q]) => a > p && a < q)) return { x: a + s.offset, z: TRACK_Z + s.lane, y: -STACK.drop };
      return { x: a + s.offset, z: -TRACK_Z - s.lane, y: 0 };
    }
    if (w < L + C) return { x: this.shift(this.xWest), z: -TRACK_Z + (w - L), y: 0 };
    if (w < 2 * L + C) {
      const s = this.segment(this.xWest - (w - L - C));
      return { x: this.xWest - (w - L - C) + s.offset, z: TRACK_Z + s.lane, y: 0 };
    }
    return { x: this.shift(this.xEast), z: TRACK_Z - (w - 2 * L - C), y: 0 };
  }

  /** Does this route stop at a station? */
  serves(station: number): boolean {
    return this.route.includes(station);
  }

  stateAt(time: number): TrainState {
    const t = mod(time, this.cycle);
    let k = this.starts.length - 1;
    for (let i = 0; i < this.starts.length; i++) {
      if (this.starts[i] > t) {
        k = i - 1;
        break;
      }
    }
    const stop = this.stops[k];
    const next = (k + 1) % this.stops.length;
    const local = t - this.starts[k];
    const held = this.stopDuration(k);

    if (local < held) {
      const { x, z, y } = this.pose(stop.u);
      if (stop.kind === 'turnback') return { u: stop.u, x, z, y, speed: 0, doors: 0, phase: 'waiting', stop: k, next };
      let doors = 1;
      let phase: Phase = 'dwell';
      if (local < OPEN) {
        doors = local / OPEN;
        phase = 'opening';
      } else if (local >= held - DEPARTURE_HOLD) {
        doors = 0;
        phase = 'waiting';
      } else if (local >= held - DEPARTURE_HOLD - CLOSE) {
        // Hold briefly for the warning onset, then close while the buzzer plays.
        doors = Math.min(1, Math.max(0, (held - DEPARTURE_HOLD - local) / DOOR_SLIDE));
        phase = 'closing';
      }
      return { u: stop.u, x, z, y, speed: 0, doors, phase, stop: k, next };
    }

    const { s, v } = hopAt(this.hops[k], local - held);
    const u = stop.u + s;
    const { x, z, y } = this.pose(u);
    return { u, x, z, y, speed: v, doors: 0, phase: 'moving', stop: k, next };
  }

  /** Seconds until a train with the given clock reaches stop `k` (0 while it is standing there). */
  secondsUntil(time: number, k: number): number {
    const t = mod(time, this.cycle);
    const start = this.starts[k];
    if (t >= start && t < start + this.stopDuration(k)) return 0;
    return mod(start - t, this.cycle);
  }

  /** Index of the station stop for a given station and track. */
  stopIndex(station: number, track: Track): number {
    return this.stops.findIndex((s) => s.kind === 'station' && s.station === station && s.track === track);
  }

  destination(track: Track): number {
    return track === 1 ? this.route[this.route.length - 1] : this.route[0];
  }
}
