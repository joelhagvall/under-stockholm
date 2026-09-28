import { stockholm, stockholmEpoch } from './clock';
import type { Era } from './era';
import type { Silverpilen } from './silverpilen';
import type { WeatherKind } from './weather';

/**
 * Showcase mode: a guided tour of the moments most players never happen to
 * see. Like the screensaver it runs on its own, but each scene jumps to its
 * own time (a snowy December evening, Lucia morning, rush hour, a night in
 * the tunnels) and may borrow a weather, a year and a crowd for a while. A
 * title card says what you are looking at. Nothing is saved, and any key,
 * click or touch hands the game back, in the present.
 */

export interface ShowPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Radians per second the camera turns while the scene lasts. */
  pan?: number;
}

export interface ShowScene {
  title: string;
  sub: string;
  /** Game time the scene plays at, given the time the tour started. */
  at(start: number): number;
  weather?: WeatherKind;
  era?: Era;
  /** Where the camera stands, worked out once the clock has jumped. Null skips the scene. */
  pose(): ShowPose | null;
  seconds: number;
}

export interface ShowStage {
  time(): number;
  /** Sets the game clock for this player alone. */
  jump(time: number): void;
  /** Borrows a scene's weather and year, or gives them back with null. */
  setup(scene: ShowScene | null): void;
  place(pose: ShowPose): void;
  look(yaw: number, pitch: number): void;
  title(title: string | null, sub?: string): void;
  blackout(during: () => void): Promise<void>;
}

export class Showcase {
  active = false;
  private index = 0;
  private clock = 0;
  private until = 0;
  private start = 0;
  private cutting = false;
  private pose: ShowPose | null = null;

  constructor(private readonly stage: ShowStage, private readonly scenes: ShowScene[]) {}

  begin(): void {
    if (this.active) return;
    this.active = true;
    this.index = 0;
    this.until = this.clock;
    this.pose = null;
    this.start = this.stage.time();
  }

  end(): void {
    if (!this.active) return;
    this.active = false;
    this.pose = null;
    this.stage.title(null);
    this.stage.setup(null);
  }

  /** The time the tour started from, to hand back when it ends. */
  get startedAt(): number {
    return this.start;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.clock += dt;
    if (this.clock >= this.until) { this.next(); return; }
    const p = this.pose;
    if (p) {
      p.yaw += (p.pan ?? 0) * dt;
      this.stage.look(p.yaw, p.pitch);
    }
  }

  /** Cuts to the next scene through a fade; a scene without a place to stand is skipped. */
  private next(): void {
    if (this.cutting) return;
    this.cutting = true;
    void this.stage.blackout(() => {
      if (!this.active) return;
      for (let tries = 0; tries < this.scenes.length; tries++) {
        const scene = this.scenes[this.index++ % this.scenes.length];
        this.stage.jump(scene.at(this.start));
        this.stage.setup(scene);
        const pose = scene.pose();
        if (!pose) continue;
        this.pose = { ...pose };
        this.stage.place(this.pose);
        this.stage.title(scene.title, scene.sub);
        this.until = this.clock + scene.seconds;
        return;
      }
      this.until = this.clock + 5;
    }).then(() => { this.cutting = false; });
  }
}

const DAY = 86400;

/** A Stockholm wall-clock time on the day `days` after the one containing `epoch`. */
function onDay(epoch: number, days: number, hour: number, minute: number): number {
  const c = stockholm(epoch + days * DAY);
  return stockholmEpoch(c.year, c.month, c.day, hour, minute, 0);
}

/** `now` if it is light and busy enough to show the trains, otherwise one in the afternoon. */
export function daytime(now: number): number {
  const h = stockholm(now).hours;
  if (h >= 7 && h < 21) return now;
  return onDay(now, h >= 21 ? 1 : 0, 13, 0);
}

/** The next Monday to Friday (today included) at a time of day. */
export function weekdayAt(now: number, hour: number, minute: number): number {
  for (let d = 0; d < 7; d++) {
    const t = onDay(now, d, hour, minute);
    const wd = stockholm(t).weekday;
    if (wd >= 1 && wd <= 5) return t;
  }
  return onDay(now, 0, hour, minute);
}

/** A date this year, at a time of day. */
export function dateAt(now: number, month: number, day: number, hour: number, minute: number): number {
  return stockholmEpoch(stockholm(now).year, month, day, hour, minute, 0);
}

/**
 * The next time Silverpilen opens its doors somewhere, from `from` on, and
 * where: the station it stops at, and when its doors start to open.
 */
export function silverStop(silver: Silverpilen, from: number): { station: number; time: number } | null {
  for (let hour = Math.floor(from / 3600); hour < Math.floor(from / 3600) + 3; hour++) {
    const start = silver.runStart(hour);
    if (start < from) continue;
    for (let t = start; t < start + silver.duration(hour); t += 1) {
      const s = silver.stateAt(t);
      if (s && s.run === hour && s.phase === 'opening' && s.at !== null && s.at !== 'kymlinge') return { station: s.at, time: t };
    }
  }
  return null;
}
