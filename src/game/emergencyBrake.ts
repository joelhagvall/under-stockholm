import type { Timetable, TrainState } from './timetable';

/**
 * The emergency brake. Pull it and the train stops dead in the tunnel,
 * stands while the driver checks the carriages, then pulls away and runs on
 * to the next station, late. Passenger trains are a function of the clock,
 * so this is a local detour: while it lasts the train follows these
 * kinematics instead, and afterwards it keeps to the timetable with a delay
 * (see `Service.delay` in `boot.ts`), which it makes up later in a turnback,
 * out of sight. Other players never see it stop.
 */

const BRAKE = 2.4;
const ACCEL = 1.1;
const VMAX = 22;
/** Seconds standing still while the driver walks the train. */
export const BRAKE_HOLD = 40;

const mod = (a: number, n: number) => ((a % n) + n) % n;

export class BrakeOverride {
  /** Game time when the train reaches the next station and the timetable takes over again. */
  readonly arrive: number;
  /** The timetable clock the train will follow from then on, as an offset from game time. */
  readonly lag: number;
  private readonly stopU: number;
  private readonly brakeTime: number;
  private readonly targetU: number;
  private readonly hop: { duration: number; vmax: number; length: number };

  /**
   * @param clock the train's timetable clock when the brake was pulled
   * @param time game time when the brake was pulled
   */
  constructor(private readonly timetable: Timetable, readonly time: number, clock: number, private readonly start: TrainState) {
    const v0 = start.speed;
    this.brakeTime = v0 / BRAKE;
    this.stopU = start.u + (v0 * v0) / (2 * BRAKE);
    const next = timetable.stops[start.next];
    this.targetU = next.u < this.stopU - 1 ? next.u + timetable.loopLength : next.u;
    const length = Math.max(0.1, this.targetU - this.stopU);
    const full = (VMAX * VMAX) / ACCEL;
    this.hop = length >= full ? { length, vmax: VMAX, duration: length / VMAX + VMAX / ACCEL } : { length, vmax: Math.sqrt(length * ACCEL), duration: 2 * Math.sqrt(length / ACCEL) };
    this.arrive = time + this.brakeTime + BRAKE_HOLD + this.hop.duration;
    // At `arrive` the timetable must have the train just arriving at the next stop.
    const cycle = timetable.cycle;
    const base = clock - mod(clock, cycle);
    let at = base + timetable.arrival(start.next);
    if (at < clock) at += cycle;
    this.lag = at - this.arrive;
  }

  /** Whether the train is still standing, for the driver's messages. */
  standing(time: number): boolean {
    const t = time - this.time;
    return t >= this.brakeTime && t < this.brakeTime + BRAKE_HOLD;
  }

  stateAt(time: number): TrainState {
    const t = Math.max(0, time - this.time);
    let u: number;
    let speed: number;
    if (t < this.brakeTime) {
      speed = this.start.speed - BRAKE * t;
      u = this.start.u + this.start.speed * t - 0.5 * BRAKE * t * t;
    } else if (t < this.brakeTime + BRAKE_HOLD) {
      speed = 0;
      u = this.stopU;
    } else {
      const h = this.hop;
      const k = Math.min(h.duration, t - this.brakeTime - BRAKE_HOLD);
      const ta = h.vmax / ACCEL;
      const cruise = h.duration - 2 * ta;
      let s: number;
      if (k <= ta) { s = 0.5 * ACCEL * k * k; speed = ACCEL * k; }
      else if (k <= ta + cruise) { s = 0.5 * ACCEL * ta * ta + h.vmax * (k - ta); speed = h.vmax; }
      else {
        const td = k - ta - cruise;
        s = 0.5 * ACCEL * ta * ta + h.vmax * cruise + h.vmax * td - 0.5 * ACCEL * td * td;
        speed = Math.max(0, h.vmax - ACCEL * td);
      }
      u = this.stopU + Math.min(h.length, s);
    }
    const { x, z } = this.timetable.pose(u);
    return { u: mod(u, this.timetable.loopLength), x, z, speed, doors: 0, phase: 'moving', stop: this.start.stop, next: this.start.next };
  }
}
