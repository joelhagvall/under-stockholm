import { hash01 } from './clock';
import { TRACK_Z, TRAIN_HALF_L, TRAIN_NOSE, trackSide } from './layout';
import type { Operations } from './operations';

/**
 * The empty train: now and then a train with "Ej i trafik" on its signs
 * rushes straight through a station without stopping, pushing a gust of air
 * ahead of it. Like Silverpilen it is a pure function of the clock: each
 * half hour one station and track gets a run, timed for a moment when the
 * tracks either side of the station are clear of every regular train. It
 * comes out of the dark halfway along one tunnel and is gone halfway along
 * the next, out of sight of both stations.
 */

const SLOT = 1800;
const SPEED = 19;
/** Where it appears and vanishes, either side of the station center: halfway along the tunnels. */
const REACH = 250;
const RUN = (2 * REACH) / SPEED;
const MARGIN = 60;

export interface ExpressState {
  slot: number;
  x: number;
  z: number;
  speed: number;
  dir: 1 | -1;
  station: number;
}

export class Express {
  private readonly plans = new Map<number, { start: number; station: number; dir: 1 | -1 } | null>();

  /** @param stationX world x of every station */
  constructor(private readonly operations: Operations, private readonly stationX: number[], private readonly blocked: (time: number, x0: number, x1: number, z: number) => boolean = () => false) {}

  /** The run in a half hour, if one fits: when it starts, where, and which way. */
  plan(slot: number): { start: number; station: number; dir: 1 | -1 } | null {
    if (this.plans.has(slot)) return this.plans.get(slot)!;
    const station = Math.floor(hash01(slot, 111) * this.stationX.length);
    const dir: 1 | -1 = hash01(slot, 112) < 0.5 ? 1 : -1;
    const cx = this.stationX[station];
    const z = trackSide(dir) * TRACK_Z;
    let found: { start: number; station: number; dir: 1 | -1 } | null = null;
    // Try moments through the half hour until the stretch stays clear for the whole run.
    for (let k = 0; k < 150 && !found; k++) {
      const start = slot * SLOT + 120 + hash01(slot, 113) * 300 + k * 9;
      let clear = true;
      for (let t = start - 4; t <= start + RUN + 4 && clear; t += 1) {
        if (this.trainNear(t, cx, z) || this.blocked(t, cx - REACH - MARGIN - TRAIN_HALF_L, cx + REACH + MARGIN + TRAIN_HALF_L, z)) clear = false;
      }
      if (clear) found = { start, station, dir };
    }
    if (this.plans.size > 64) this.plans.clear();
    this.plans.set(slot, found);
    return found;
  }

  private trainNear(time: number, cx: number, z: number): boolean {
    const ops = this.operations;
    for (let i = 0; i < ops.offsets.length; i++) {
      if (!ops.inService(time, i)) continue;
      const st = ops.timetableOf(i).stateAt(time + ops.offsets[i]);
      if (Math.abs(st.z - z) < 2 && Math.abs(st.x - cx) < REACH + MARGIN + 2 * (TRAIN_HALF_L + TRAIN_NOSE)) return true;
    }
    return false;
  }

  stateAt(time: number): ExpressState | null {
    const slot = Math.floor(time / SLOT);
    for (const s of [slot, slot - 1]) {
      const p = this.plan(s);
      if (!p) continue;
      const t = time - p.start;
      if (t < 0 || t > RUN) continue;
      const cx = this.stationX[p.station];
      return { slot: s, x: cx - p.dir * REACH + p.dir * SPEED * t, z: trackSide(p.dir) * TRACK_Z, speed: SPEED, dir: p.dir, station: p.station };
    }
    return null;
  }
}
