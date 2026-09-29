import { hash01 } from './clock';
import { SILVER_VANISH, TRACK_Z, TURNBACK_REACH, trackSide } from './layout';
import type { Timetable } from './timetable';

/**
 * Silverpilen, the silver ghost train of Stockholm folklore. Once an hour, at
 * a minute nobody can predict, it glides west on track 1 of the Akalla branch
 * without a sound, stops at one station with its doors open, then continues
 * to Kymlinge, the station that never opened, and disappears into the dark
 * tunnel toward Kista.
 *
 * Like the timetable, it is a pure function of the clock. Runs start between
 * two regular trains (the regular loops start every headway at the same
 * phase) and reach Kymlinge when a regular train would, gliding at the pace
 * the others keep with all their stops, which keeps a safe distance to both.
 */

/** Its glide when the regular trains' pace allows no other (see `pace`). */
const SPEED = 10;
const ACCEL = 0.7;
const OPEN = 2.5;
const CLOSE = 2.5;
const STATION_HOLD = 16;
const KYMLINGE_HOLD = 32;
/** Where between two regular trains a run starts, as a fraction of the headway. */
export const SILVER_PHASE = 0.5;

export interface SilverState {
  run: number;
  u: number;
  x: number;
  z: number;
  speed: number;
  doors: number;
  phase: 'moving' | 'opening' | 'dwell' | 'closing';
  /** Station index it stands at, or 'kymlinge'. */
  at: number | 'kymlinge' | null;
  /** The station it stops at on this run. */
  stopStation: number;
  /** 1 while solid, fading to 0 as it vanishes. */
  opacity: number;
}

interface Leg {
  from: number;
  to: number;
  duration: number;
  vmax: number;
}

function leg(from: number, to: number, speed: number): Leg {
  const length = to - from;
  const full = (speed * speed) / ACCEL;
  if (length >= full) return { from, to, vmax: speed, duration: length / speed + speed / ACCEL };
  const peak = Math.sqrt(length * ACCEL);
  return { from, to, vmax: peak, duration: (2 * peak) / ACCEL };
}

function legAt(l: Leg, t: number): { s: number; v: number } {
  const ta = l.vmax / ACCEL;
  const cruise = l.duration - 2 * ta;
  const length = l.to - l.from;
  if (t <= ta) return { s: 0.5 * ACCEL * t * t, v: ACCEL * t };
  if (t <= ta + cruise) return { s: 0.5 * ACCEL * ta * ta + l.vmax * (t - ta), v: l.vmax };
  const td = Math.min(l.duration, t) - ta - cruise;
  return { s: Math.min(length, 0.5 * ACCEL * ta * ta + l.vmax * cruise + l.vmax * td - 0.5 * ACCEL * td * td), v: Math.max(0, l.vmax - ACCEL * td) };
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

export class Silverpilen {
  readonly xEast: number;
  /** Stations it may stop at: every station of its route before Kymlinge. */
  readonly stations: number[];
  private extra: number | null = null;

  /**
   * @param timetable the route it runs along, which must not be shifted
   * @param kymlingeX world x of Kymlinge's center, on that route
   */
  constructor(readonly timetable: Timetable, readonly headway: number, readonly kymlingeX: number) {
    const xs = timetable.stationX;
    this.xEast = xs[timetable.route[0]] - TURNBACK_REACH;
    this.stations = timetable.route.filter((i) => xs[i] < kymlingeX);
  }

  /** Debug: add one run that starts shortly after `time`. */
  summon(time: number): void {
    this.extra = this.align(time + 5);
  }

  private align(target: number): number {
    return target + mod(SILVER_PHASE * this.headway - target, this.headway);
  }

  /** Start time of the run in hour `hour` (epoch hours). */
  runStart(hour: number): number {
    const minute = 3 + Math.floor(hash01(hour, 41) * 48);
    return this.align(hour * 3600 + minute * 60);
  }

  stopStation(run: number): number {
    return this.stations[Math.floor(hash01(run, 43) * this.stations.length)];
  }

  private plan(run: number) {
    const station = this.stopStation(run);
    const us = this.timetable.stationX[station] - this.xEast;
    const uk = this.kymlingeX - this.xEast;
    const uv = uk + SILVER_VANISH;
    const holds = [OPEN + STATION_HOLD + CLOSE, OPEN + KYMLINGE_HOLD + CLOSE];
    const speed = this.pace(uk, holds[0]);
    const legs = [leg(0, us, speed), leg(us, uk, speed), leg(uk, uv, speed)];
    const duration = legs[0].duration + holds[0] + legs[1].duration + holds[1] + legs[2].duration;
    return { station, legs, holds, duration };
  }

  /**
   * The glide that brings it to Kymlinge (`uk` along) when a regular train leaving the east turnback with it
   * would pass there: two legs, one stop of `hold` seconds. The regular trains stop at every station, so this
   * keeps it about as far from the one ahead as from the one behind all the way.
   */
  private pace(uk: number, hold: number): number {
    const tt = this.timetable;
    const at = (k: number) => tt.stops[k].u;
    const next = tt.stops.findIndex((s, k) => s.kind === 'station' && s.track === 1 && at(k) > uk);
    if (next <= 0) return SPEED;
    const prev = next - 1;
    const leaves = tt.arrival(prev) + tt.stopDuration(prev);
    const passes = leaves + ((uk - at(prev)) / (at(next) - at(prev))) * (tt.arrival(next) - leaves);
    const moving = passes - tt.stopDuration(0) - hold;
    // uk / v + 2 v / a = moving, the slower root: it cruises most of the way.
    const disc = moving * moving - (8 * uk) / ACCEL;
    if (disc < 0) return SPEED;
    return Math.min(SPEED * 1.4, ((moving - Math.sqrt(disc)) * ACCEL) / 4);
  }

  /** Total length of a run in seconds. */
  duration(run = 0): number {
    return this.plan(run).duration;
  }

  /** The runs that may be under way at `time`: last hour's, this hour's and a summoned one. */
  starts(time: number): Array<{ run: number; start: number }> {
    const hour = Math.floor(time / 3600);
    const starts = [
      { run: hour - 1, start: this.runStart(hour - 1) },
      { run: hour, start: this.runStart(hour) },
    ];
    if (this.extra !== null) starts.push({ run: -1, start: this.extra });
    return starts;
  }

  stateAt(time: number): SilverState | null {
    for (const { run, start } of this.starts(time)) {
      const state = this.runState(run, time - start);
      if (state) return state;
    }
    return null;
  }

  /** How far along the regular train ahead is when a run starts: half a headway out of the east turnback. */
  lead(): number {
    return this.timetable.stateAt(this.timetable.stopDuration(0) + SILVER_PHASE * this.headway).u;
  }

  /** Run `run`, `local` seconds after it set off, or null outside it. */
  runState(run: number, local: number): SilverState | null {
    const plan = this.plan(run);
    if (local < 0 || local >= plan.duration) return null;
    let t = local;
    const make = (u: number, speed: number, phase: SilverState['phase'], doors: number, at: SilverState['at']): SilverState => {
      const x = this.xEast + u;
      const vanishStart = this.kymlingeX + SILVER_VANISH - 60;
      const opacity = Math.max(0, Math.min(1, 1 - (x - vanishStart) / 60));
      return { run, u, x, z: trackSide(1) * TRACK_Z, speed, doors, phase, at, stopStation: plan.station, opacity };
    };
    const hold = (u: number, duration: number, at: SilverState['at']): SilverState | null => {
      if (t >= duration) { t -= duration; return null; }
      if (t < OPEN) return make(u, 0, 'opening', t / OPEN, at);
      if (t >= duration - CLOSE) return make(u, 0, 'closing', (duration - t) / CLOSE, at);
      return make(u, 0, 'dwell', 1, at);
    };
    const move = (l: Leg): SilverState | null => {
      if (t >= l.duration) { t -= l.duration; return null; }
      const { s, v } = legAt(l, t);
      return make(l.from + s, v, 'moving', 0, null);
    };
    return move(plan.legs[0])
      ?? hold(plan.legs[0].to, plan.holds[0], plan.station)
      ?? move(plan.legs[1])
      ?? hold(plan.legs[1].to, plan.holds[1], 'kymlinge')
      ?? move(plan.legs[2]);
  }
}
