import { TRACK_Z, TRAIN_HALF_L } from './layout';
import type { SilverState, Silverpilen } from './silverpilen';
import { NOSE } from './trainModel';

/** How long she waits in the east turnback for a gap before letting the hour pass. */
const WAIT = 20 * 60;
/** Center to center, the nearest she comes to the train ahead: she stands still there, as at a red signal. */
export const HOLD = 2 * (TRAIN_HALF_L + NOSE) + 60;
/** From this far behind the train ahead she eases off, to a stop at `HOLD`. */
export const EASE = HOLD + 400;
/** Nearer than this behind her, a train makes her fade: two trains' length and the way it runs while she does. */
export const CLEAR = 2 * (TRAIN_HALF_L + NOSE) + 100;
/** Seconds her fade takes. */
const FADE = 4;
/** Held still longer than this (a train ahead laid over in a turnback), she gives up and fades. */
const PATIENCE = 4 * 60;

/** A real train on the blue line: where it is. */
export interface Rival {
  x: number;
  z: number;
}

interface Run {
  run: number;
  /** The start it was called for. */
  called: number;
  /** Seconds into her run: her own clock, which slows while a train ahead holds her up. */
  local: number;
  /** Game time of the last update. */
  last: number;
  /** Since when she has stood held, or null. */
  held: number | null;
  /** Since when she has been fading, or null. */
  fading: number | null;
}

/**
 * Silverpilen among SL's real trains, where no timetable leaves her a gap. Her run is called at the same
 * minute as always, but she waits in the east turnback until the real train ahead on track 1 is as far off
 * as the timetable's would be, then glides the same run on a clock of her own, as a real journey runs on
 * a warped timetable clock: it slows while the train ahead is near (SL's trains stand at the platforms until
 * their real departure), so she waits in the dark tunnel behind it. A real train catching up from behind, or
 * a wait past all patience, makes her fade where she is, and whoever rides her goes with her. This is local
 * state, not a function of the clock: players meet her where SL's trains let her run, so shared rides on her
 * stay off while SL drives the blue line.
 */
export class RealSilverpilen {
  private run: Run | null = null;
  /** Called starts of runs that are over, given up or faded. */
  private readonly spent = new Set<number>();

  constructor(private readonly silver: Silverpilen) {}

  /** Keeps a run of the timetable's that is under way when SL takes over. */
  adopt(time: number): void {
    const now = this.silver.starts(time).find(({ run, start }) => this.silver.runState(run, time - start));
    this.run = now ? { run: now.run, called: now.start, local: time - now.start, last: time, held: null, fading: null } : null;
  }

  update(time: number, rivals: readonly Rival[]): SilverState | null {
    this.run ??= this.depart(time, rivals);
    const r = this.run;
    if (!r) return null;
    // A clock that jumps back ends the run; one that jumps ahead only moves her a second's worth.
    if (time < r.last) return this.end();
    const dt = Math.min(1, time - r.last);
    r.last = time;
    const before = this.silver.runState(r.run, r.local);
    if (!before) return this.end();

    let ahead = Infinity;
    let behind = Infinity;
    for (const t of rivals) {
      if (!onTrack(t)) continue;
      const d = t.x - before.x;
      if (d >= 0) ahead = Math.min(ahead, d);
      else behind = Math.min(behind, -d);
    }
    // Her clock runs at full speed with the way clear and slows as she closes on the train ahead (the square root
    // brakes her evenly), still at `HOLD`.
    let rate = before.speed > 0.1 ? Math.sqrt(Math.max(0, Math.min(1, (ahead - HOLD) / (EASE - HOLD)))) : 1;
    if (rate < 0.05) rate = 0;
    r.local += dt * rate;
    r.held = rate < 0.05 ? r.held ?? time : null;
    if (r.fading === null && (behind < CLEAR || (r.held !== null && time - r.held > PATIENCE))) r.fading = time;

    const state = this.silver.runState(r.run, r.local);
    if (!state) return this.end();
    state.speed *= rate;
    if (r.fading === null) return state;
    const left = 1 - (time - r.fading) / FADE;
    if (left <= 0) return this.end();
    state.opacity *= left;
    return state;
  }

  /** Where the run under way puts her `ahead` seconds from now, if nothing holds her up. */
  peek(ahead: number): SilverState | null {
    return this.run ? this.silver.runState(this.run.run, this.run.local + ahead) : null;
  }

  private end(): null {
    if (this.run) this.spent.add(this.run.called);
    this.run = null;
    if (this.spent.size > 8) this.spent.delete(this.spent.values().next().value!);
    return null;
  }

  /** A called run whose way is clear: the train ahead as far along as the timetable's would be. */
  private depart(time: number, rivals: readonly Rival[]): Run | null {
    const due = this.silver.starts(time).find(({ start }) => start <= time && time < start + WAIT && !this.spent.has(start));
    if (!due) return null;
    const lead = this.silver.lead();
    const xEast = this.silver.xEast;
    if (!rivals.every((t) => !onTrack(t) || t.x < xEast - CLEAR || t.x - xEast >= lead)) return null;
    return { run: due.run, called: due.start, local: 0, last: time, held: null, fading: null };
  }
}

/** On her track, or crossing toward it in a turnback. */
const onTrack = (t: Rival) => t.z > -TRACK_Z + 1;
