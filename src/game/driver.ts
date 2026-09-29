import { Vector3 } from 'three';
import sv from './i18n/sv.json';
import { text } from './i18n/text';
import { CAVE_HALF_L, PLATFORM_Y, TRACK_Z, TRAIN_HALF_L, TRAIN_NOSE, trackSide } from './layout';
import type { Train } from './train';

/**
 * Driver mode: a practice train on its own timeline. Regular service steps
 * aside while you drive a C20 from the cab, stopping with the nose at each
 * station's stop board. This train is the one thing in the game that is not
 * a function of the clock, which is why it never shares the tracks with the
 * timetable.
 */

const MAX_NOTCH = 4;
const MIN_NOTCH = -5;
const LINE_LIMIT = 80 / 3.6;
const APPROACH_DECEL = 0.85;

export interface DriverStop {
  station: number;
  name: string;
  /** World x of the stop board. */
  mark: number;
  score: number | null;
}

export interface DriverReadout {
  speed: number;
  limit: number;
  notch: number;
  emergency: boolean;
  next: string | null;
  distance: number | null;
  doors: boolean;
  score: number;
  maxScore: number;
}

export interface DriverEvents {
  say(text: string, seconds?: number): void;
  chime(): void;
  finished(): void;
}

const format = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));

/** Braking limit toward a stop point: what speed still lets you stop in time. */
export function approachLimit(distance: number): number {
  return Math.min(LINE_LIMIT, Math.sqrt(2 * APPROACH_DECEL * Math.max(0, distance + 12)) + 1.5);
}

/** Grades a stop by how far the nose ended up from the board (positive = past it). */
export function gradeStop(error: number): { score: number; message: string } {
  const a = Math.abs(error);
  if (a < 0.5) return { score: 100, message: format(text.driver.perfect, { error: Math.round(a * 100) }) };
  if (a < 2) return { score: 80, message: format(text.driver.good, { error: Math.round(a * 100) }) };
  if (a < 5) return { score: 50, message: format(text.driver.ok, { error: a.toFixed(1).replace('.', ',') }) };
  if (error < 0) return { score: 15, message: format(text.driver.short, { error: a.toFixed(1).replace('.', ',') }) };
  return { score: 0, message: format(text.driver.long, { error: a.toFixed(1).replace('.', ',') }) };
}

export class Driver {
  active = false;
  private x = 0;
  private dir: 1 | -1 = 1;
  private z = trackSide(1) * TRACK_Z;
  private speed = 0;
  private notch = 0;
  private emergency = false;
  private doors = 0;
  private doorsTarget = 0;
  private doorTimer = 0;
  private atc = false;
  private stops: DriverStop[] = [];
  private current = 0;
  private distance = 0;
  private acceleration = 0;
  private finishing = 0;
  readonly eye = new Vector3();

  /** `train` should be a 'cab' variant, so the windscreen can be seen through. */
  constructor(readonly train: Train, private readonly stationX: number[], private readonly names: string[], private readonly events: DriverEvents) {
    this.train.setActive(false);
    // The train's own signs are in the world, so Swedish; what the player is told follows the menus.
    this.train.setDestination(sv.driver.title);
  }

  /** Places the practice train at a station, pointing along the line toward the far terminal. */
  start(station: number): void {
    const last = this.stationX.length - 1;
    this.dir = station === last ? -1 : 1;
    this.z = trackSide(this.dir) * TRACK_Z;
    this.x = this.stationX[station];
    this.speed = 0;
    this.notch = 0;
    this.emergency = false;
    this.doors = this.doorsTarget = 0;
    this.finishing = 0;
    this.distance = 0;
    this.stops = [];
    for (let i = station + this.dir; i >= 0 && i <= last; i += this.dir) {
      this.stops.push({ station: i, name: this.names[i], mark: this.stationX[i] + this.dir * (TRAIN_HALF_L + TRAIN_NOSE), score: null });
    }
    this.current = 0;
    this.active = true;
    this.train.place(this.x, this.z);
    this.train.setActive(true);
    this.train.setHeading(this.dir);
    this.train.setDoors(0, this.z > 0 ? -1 : 1);
    this.train.setInfo(`${sv.driver.next}: ${this.stops[0].name}`);
    this.updateEye();
  }

  stop(): void {
    this.active = false;
    this.train.setActive(false);
  }

  /** Where the player's capsule rides: just behind the cab bulkhead. */
  get seatFeet(): Vector3 {
    return new Vector3(this.x + this.dir * (TRAIN_HALF_L - 3), PLATFORM_Y + 0.02, this.z);
  }

  get heading(): 1 | -1 {
    return this.dir;
  }

  get state() {
    return { speed: this.speed, distance: this.distance, acceleration: this.acceleration };
  }

  /** The platform the train stands at, if any (for leaving the cab). */
  get platformStation(): number | null {
    for (let i = 0; i < this.stationX.length; i++) if (Math.abs(this.x - this.stationX[i]) < 40) return i;
    return null;
  }

  throttle(delta: number): void {
    if (!this.active) return;
    if (this.emergency && delta > 0 && this.speed > 0.05) return;
    this.emergency = false;
    this.notch = Math.max(MIN_NOTCH, Math.min(MAX_NOTCH, this.notch + delta));
  }

  emergencyBrake(): void {
    if (!this.active) return;
    this.emergency = true;
    this.notch = MIN_NOTCH;
  }

  toggleDoors(): void {
    if (!this.active || this.finishing > 0) return;
    if (this.doorsTarget > 0) {
      this.doorsTarget = 0;
      this.events.chime();
      return;
    }
    const stop = this.stops[this.current];
    const front = this.x + this.dir * (TRAIN_HALF_L + TRAIN_NOSE);
    if (this.speed > 0.05 || !stop || Math.abs(front - stop.mark) > 15) {
      this.events.say(text.driver.doorsFirst, 3);
      return;
    }
    const grade = gradeStop((front - stop.mark) * this.dir);
    stop.score = grade.score;
    this.events.say(grade.message, 5);
    this.doorsTarget = 1;
    this.doorTimer = 0;
  }

  readout(): DriverReadout {
    const stop = this.stops[this.current];
    const front = this.x + this.dir * (TRAIN_HALF_L + TRAIN_NOSE);
    const scored = this.stops.filter((s) => s.score !== null);
    return {
      speed: this.speed * 3.6,
      limit: this.limit() * 3.6,
      notch: this.notch,
      emergency: this.emergency || this.atc,
      next: stop?.name ?? null,
      distance: stop ? (stop.mark - front) * this.dir : null,
      doors: this.doors > 0,
      score: scored.reduce((sum, s) => sum + (s.score ?? 0), 0),
      maxScore: this.stops.length * 100,
    };
  }

  private limit(): number {
    const stop = this.stops[this.current];
    if (!stop) return LINE_LIMIT;
    const front = this.x + this.dir * (TRAIN_HALF_L + TRAIN_NOSE);
    return approachLimit((stop.mark - front) * this.dir);
  }

  update(dt: number): void {
    if (!this.active) return;
    // Doors: open, then close on request; the train may not take power with doors open.
    this.doors += Math.sign(this.doorsTarget - this.doors) * Math.min(Math.abs(this.doorsTarget - this.doors), dt / 2);
    if (this.doorsTarget > 0) this.doorTimer += dt;
    const stop = this.stops[this.current];
    if (stop && stop.score !== null && this.doorsTarget === 0 && this.doors === 0) {
      this.current++;
      const next = this.stops[this.current];
      this.train.setInfo(next ? `${sv.driver.next}: ${next.name}` : sv.driver.title);
      if (!next) {
        const r = this.readout();
        this.events.say(format(text.driver.done, { count: this.stops.length, score: r.score, max: r.maxScore }), 7);
        this.finishing = 4;
      }
    }
    if (this.finishing > 0) {
      this.finishing -= dt;
      if (this.finishing <= 0) this.events.finished();
    }

    const limit = this.limit();
    if (this.speed > limit + 1.2 && !this.atc) {
      this.atc = true;
      this.events.say(text.driver.atc, 3);
    }
    if (this.atc && this.speed < limit - 1) this.atc = false;

    let a: number;
    if (this.atc || this.emergency) a = -1.5;
    else if (this.notch > 0 && this.doors === 0) a = 1.15 * (this.notch / MAX_NOTCH) * Math.max(0, 1 - this.speed / 24);
    else if (this.notch < 0) a = -1.2 * (-this.notch / -MIN_NOTCH);
    else a = 0;
    a -= 0.03 + 0.0005 * this.speed * this.speed;
    if (this.notch > 0 && this.doors > 0 && this.speed < 0.05) a = 0;
    this.speed = Math.max(0, this.speed + a * dt);
    this.acceleration = this.speed > 0 ? a : 0;
    const step = this.speed * dt;
    this.x += this.dir * step;
    this.distance += step;

    // A missed station counts as a failed stop.
    const front = this.x + this.dir * (TRAIN_HALF_L + TRAIN_NOSE);
    if (stop && stop.score === null && (front - stop.mark) * this.dir > 45) {
      stop.score = 0;
      this.events.say(format(text.driver.long, { error: Math.round((front - stop.mark) * this.dir) }), 4);
    }
    // Beyond the last platform lies the turnback: stop the exercise there.
    const last = this.stops[this.stops.length - 1];
    if (last && (front - (this.stationX[last.station] + this.dir * CAVE_HALF_L)) * this.dir > 15 && this.finishing <= 0) {
      this.emergencyBrake();
      this.events.say(text.driver.overrun, 4);
      this.finishing = 3;
    }

    this.train.setPose(this.x, this.z);
    this.train.setDoors(this.doors, this.z > 0 ? -1 : 1);
    this.updateEye();
  }

  private updateEye(): void {
    this.eye.set(this.x + this.dir * (TRAIN_HALF_L - 0.95), PLATFORM_Y + 1.42, this.z);
  }
}
