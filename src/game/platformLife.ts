import { type Scene, type Vector3 } from 'three';
import { hash01, stockholm } from './clock';
import { drawFigure, figureMesh, hideFigure, paintFigure, type FigurePose } from './figures';
import text from './i18n/sv.json';
import { CAVE_HALF_L, PLATFORM_HALF_W, PLATFORM_Y, TRAIN_HALF_W } from './layout';
import { noiseBurst, Spatial, tone, type AudioOut } from './sfx';
import type { Timetable, TrainState } from './timetable';
import type { Train } from './train';
import { benchXs, type StationInfo } from './world/station';

/**
 * A few people on the platform with something going on: a commuter talking
 * on the phone a little too loudly, a can collector going from bin to bin, a
 * couple saying goodbye at the doors (one stays and waves as the train
 * leaves), and someone running for the train as the doors close, who either
 * just makes it or has them shut in their face. The couple and the runner
 * follow the timetable, so everyone sees the same goodbyes.
 */

const TALKER = 0;
const COLLECTOR = 1;
const LEAVER = 2;
const STAYER = 3;
const RUNNER = 4;
const COUNT = 5;
const RUN_SPEED = 6.2;

export interface LifeService {
  index: number;
  train: Train;
  timetable: Timetable;
  clock: number;
  state: TrainState;
  active: boolean;
}

export interface PlatformEvents {
  say(message: string, seconds: number): void;
  speak(message: string, pitch: number, rate: number): void;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Whether a stop of a train on a loop has a couple saying goodbye, or someone running for it. */
export function platformScene(kind: 'farewell' | 'runner', service: number, loop: number, stop: number): boolean {
  return hash01(service * 7919 + loop * 131 + stop, kind === 'farewell' ? 91 : 92) < (kind === 'farewell' ? 0.3 : 0.35);
}

/** Where the can collector is on a platform at a time: bins along the benches, a pause at each. */
export function collectorPose(time: number, cx: number): { x: number; z: number; yaw: number; searching: boolean } {
  const bins = benchXs(cx).map((x) => x + 1.6);
  const walk = 0.75;
  // A round trip along the bins and back, with six seconds of rummaging at each.
  const legs: Array<{ from: number; to: number }> = [];
  for (let k = 0; k < bins.length - 1; k++) legs.push({ from: bins[k], to: bins[k + 1] });
  for (let k = bins.length - 1; k > 0; k--) legs.push({ from: bins[k], to: bins[k - 1] });
  const durations = legs.map((l) => 6 + Math.abs(l.to - l.from) / walk);
  const total = durations.reduce((a, b) => a + b, 0);
  let t = mod(time, total);
  for (let k = 0; k < legs.length; k++) {
    if (t < durations[k]) {
      const { from, to } = legs[k];
      const dir = Math.sign(to - from) || 1;
      if (t < 6) return { x: from, z: 0.62, yaw: Math.PI, searching: true };
      const x = from + dir * (t - 6) * walk;
      return { x, z: 0.95, yaw: dir * Math.PI / 2, searching: false };
    }
    t -= durations[k];
  }
  return { x: bins[0], z: 0.62, yaw: Math.PI, searching: true };
}

export class PlatformLife {
  private readonly mesh = figureMesh(COUNT);
  private clock = 0;
  private voice: Spatial | null = null;
  private feetSound: Spatial | null = null;
  private call = { next: 20, line: 0, until: 0 };
  private collectorSeen = -1;
  private lastClink = -1;
  private told = new Set<string>();
  private lastStep = 0;

  constructor(scene: Scene, private readonly events: PlatformEvents) {
    this.mesh.name = 'platform-life';
    this.mesh.visible = false;
    scene.add(this.mesh);
    paintFigure(this.mesh, TALKER, { coat: 0x2b3a4a, skin: 0xe8bd9b, hair: 0x6b4a2e, bag: 0x1b1d22, trousers: 0x303a48, shoes: 0x242629, prop: 0x16181b });
    paintFigure(this.mesh, COLLECTOR, { coat: 0x4d4a3a, skin: 0x946747, hair: 0x8a8f94, bag: 0x1d57a8, trousers: 0x3a3d40, shoes: 0x2a2320, prop: 0x1d57a8, back: 'none' });
    paintFigure(this.mesh, LEAVER, { coat: 0x753e45, skin: 0xdba987, hair: 0x382a25, bag: 0x293338, trousers: 0x303a48, shoes: 0x242629 });
    paintFigure(this.mesh, STAYER, { coat: 0xc0b5a2, skin: 0x634432, hair: 0x1b1b1b, bag: 0x293338, trousers: 0x44546a, shoes: 0x242629, build: 'woman', long: true, back: 'none', carry: 'handbag', prop: 0x6b2430 });
    paintFigure(this.mesh, RUNNER, { coat: 0x2e6e5e, skin: 0xe8bd9b, hair: 0x8a7052, bag: 0x1b1d22, trousers: 0x303a48, shoes: 0xf2efe6, prop: 0xc9a472, build: 'woman', long: true });
  }

  /** @param past the time machine's 1975: nobody talks on a phone on the platform */
  update(dt: number, time: number, station: StationInfo | null, feet: Vector3, services: LifeService[], people: boolean, out: AudioOut | null, past = false): void {
    this.clock += dt;
    this.mesh.visible = people && station !== null;
    if (!this.mesh.visible || !station) return;
    if (out) {
      this.voice ??= new Spatial(out, 1.5, 1.4, 30);
      this.feetSound ??= new Spatial(out, 1.5, 1.3, 40);
    }
    if (past) hideFigure(this.mesh, TALKER);
    else this.talker(time, station, feet, out);
    this.collector(time, station, feet, out);
    this.goodbyes(station, feet, services);
    this.runner(station, feet, services, out);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private draw(i: number, pose: FigurePose): void {
    drawFigure(this.mesh, i, pose, this.clock + i * 3);
  }

  /** Walks slowly up and down, talking, on the player's platform. Close by, you hear their half of the call. */
  private talker(time: number, s: StationInfo, feet: Vector3, out: AudioOut | null): void {
    const span = 36;
    const t = mod(time * 0.5 + s.index * 11, span * 2);
    const along = t < span ? t : span * 2 - t;
    const x = s.cx - 30 + along;
    const z = islandNear(s, feet) - 1.9;
    this.draw(TALKER, { x, z, yaw: t < span ? Math.PI / 2 : -Math.PI / 2, walking: true, arm: 'phone', carry: 'phone' });
    const near = Math.hypot(x - feet.x, z - feet.z) < 7;
    if (!near || this.clock < this.call.next) return;
    const lines = text.platform.call;
    const [caption, spoken] = lines[this.call.line % lines.length];
    this.call.line++;
    this.call.next = this.clock + 18 + Math.random() * 12;
    this.events.say(caption, 4);
    this.events.speak(spoken, 1, 1.05);
    if (out && this.voice) this.voice.setPosition({ x, y: PLATFORM_Y + 1.6, z });
  }

  /** From bin to bin, rummaging for cans to return for the deposit. */
  private collector(time: number, s: StationInfo, feet: Vector3, out: AudioOut | null): void {
    const h = stockholm(time).hours;
    if (h < 8 || h > 23) { hideFigure(this.mesh, COLLECTOR); return; }
    const pose = collectorPose(time + s.index * 37, s.cx);
    pose.z += islandNear(s, feet);
    this.draw(COLLECTOR, { x: pose.x, z: pose.z, yaw: pose.yaw, walking: !pose.searching, carry: 'bag', sway: pose.searching ? 0.45 + Math.sin(this.clock * 3) * 0.08 : 0 });
    const near = Math.hypot(pose.x - feet.x, pose.z - feet.z) < 12;
    if (near && this.collectorSeen !== s.index) {
      this.collectorSeen = s.index;
      this.events.say(text.platform.collector, 5);
    }
    // Now and then a can turns up, with a clink into the bag.
    const found = Math.floor((time + s.index * 37) / 6);
    if (pose.searching && near && out && this.voice && found !== this.lastClink && hash01(found, 93) < 0.4) {
      this.lastClink = found;
      this.voice.setPosition({ x: pose.x, y: PLATFORM_Y + 0.8, z: pose.z });
      this.voice.setLevel(1, 0.01);
      tone(out, this.voice.input, 2900, 0.03, 0.18, { delay: 0.3 });
      tone(out, this.voice.input, 2150, 0.025, 0.25, { delay: 0.42 });
    }
  }

  /** The couple at the doors: close together while the train stands, then one boards and the other waves. */
  private goodbyes(s: StationInfo, feet: Vector3, services: LifeService[]): void {
    let shown = false;
    for (const svc of services) {
      if (!svc.active) continue;
      const tt = svc.timetable;
      const k = svc.state.stop;
      const stop = tt.stops[k];
      if (stop.kind !== 'station' || stop.station !== s.index || stop.terminal) continue;
      const loop = Math.floor(svc.clock / tt.cycle);
      if (!platformScene('farewell', svc.index, loop, k)) continue;
      const elapsed = mod(svc.clock - tt.arrival(k), tt.cycle);
      const held = tt.stopDuration(k);
      if (elapsed > held + 40) continue;
      const side = Math.sign(svc.state.z) || 1;
      const doorXs = svc.train.stock.doors;
      const door = doorXs[Math.floor(hash01(svc.index * 31 + loop, 94) * doorXs.length)];
      const x = s.cx + door;
      const edge = side * (PLATFORM_HALF_W - 0.75);
      const facing = side > 0 ? 0 : Math.PI;
      const aboard = elapsed > held - 4.4;
      // The one leaving: on the platform, then just inside the doors, riding away with the train.
      if (!aboard) this.draw(LEAVER, { x: x + 0.25, z: edge - side * 0.1, yaw: facing + Math.PI + 0.3, walking: false, arm: 'hold' });
      else {
        const tx = svc.train.position.x + door;
        this.draw(LEAVER, { x: tx, z: svc.state.z - side * (TRAIN_HALF_W - 0.6), yaw: facing + Math.PI, walking: false, arm: 'wave' });
      }
      // The one staying: waves until the train is gone, then turns for the exit.
      const gone = elapsed > held + 22;
      const walkAway = gone ? (elapsed - held - 22) * 1.1 : 0;
      this.draw(STAYER, { x: x - 0.25 + s.exitDir * walkAway, z: gone ? edge - side * 1.5 : edge - side * 0.6, yaw: gone ? s.exitDir * Math.PI / 2 : facing, walking: gone, arm: aboard && !gone ? 'wave' : undefined, look: aboard && !gone ? Math.sin(this.clock) * 0.2 : undefined });
      shown = true;
      const key = `bye:${svc.index}:${loop}:${k}`;
      if (aboard && !gone && !this.told.has(key) && Math.hypot(x - feet.x, edge - feet.z) < 18) {
        this.told.add(key);
        this.events.say(text.platform.farewell, 5);
      }
      break;
    }
    if (!shown) { hideFigure(this.mesh, LEAVER); hideFigure(this.mesh, STAYER); }
  }

  /** Someone sprints down the platform as the doors start to close. */
  private runner(s: StationInfo, feet: Vector3, services: LifeService[], out: AudioOut | null): void {
    let shown = false;
    for (const svc of services) {
      if (!svc.active) continue;
      const tt = svc.timetable;
      const k = svc.state.stop;
      const stop = tt.stops[k];
      if (stop.kind !== 'station' || stop.station !== s.index || stop.terminal) continue;
      const loop = Math.floor(svc.clock / tt.cycle);
      if (!platformScene('runner', svc.index, loop, k)) continue;
      const elapsed = mod(svc.clock - tt.arrival(k), tt.cycle);
      const held = tt.stopDuration(k);
      const makesIt = hash01(svc.index * 13 + loop * 7 + k, 95) < 0.5;
      // Doors start to slide at held - 3.5 and are shut at held - 1.
      const reach = makesIt ? held - 3.1 : held - 1.2;
      const side = Math.sign(svc.state.z) || 1;
      const e = s.exitDir;
      const doors = svc.train.stock.doors.filter((d) => d * e < 20);
      const door = doors[Math.floor(hash01(svc.index + loop * 3, 96) * doors.length)];
      const start = { x: s.cx + e * (CAVE_HALF_L - 6), z: side * 1.3 };
      const end = { x: s.cx + door, z: side * (PLATFORM_HALF_W - 0.7) };
      const distance = Math.hypot(end.x - start.x, end.z - start.z);
      const t0 = reach - distance / RUN_SPEED;
      if (elapsed < t0 || elapsed > held + 30) continue;
      const f = Math.min(1, (elapsed - t0) / (reach - t0));
      const yaw = Math.atan2(end.x - start.x, end.z - start.z);
      if (f < 1) this.draw(RUNNER, { x: start.x + (end.x - start.x) * f, z: start.z + (end.z - start.z) * f, yaw, walking: true, running: true, carry: 'bag' });
      else if (makesIt) {
        // Squeezed in: stands just inside the doors, getting their breath back.
        if (elapsed > held + 12) continue;
        this.draw(RUNNER, { x: svc.train.position.x + door, z: svc.state.z - side * (TRAIN_HALF_W - 0.55), yaw: side > 0 ? Math.PI : 0, walking: false, sway: 0.25 });
      } else {
        // Too late: arms out, then a long wait for the next one.
        this.draw(RUNNER, { x: end.x, z: end.z - side * 0.3, yaw: side > 0 ? 0 : Math.PI, walking: false, arm: elapsed < held + 4 ? 'wave' : undefined, sway: -0.08 });
      }
      shown = true;
      const near = Math.hypot(end.x - feet.x, end.z - feet.z) < 30;
      const key = `run:${svc.index}:${loop}:${k}`;
      if (near && f > 0.3 && !this.told.has(key)) {
        this.told.add(key);
        this.events.say(text.platform.running, 3);
      }
      if (near && f >= 1 && !this.told.has(`${key}:end`)) {
        this.told.add(`${key}:end`);
        this.events.say(makesIt ? text.platform.madeIt : text.platform.missed, 4);
        if (!makesIt && out && this.voice) {
          this.voice.setPosition({ x: end.x, y: PLATFORM_Y + 1.6, z: end.z });
          this.voice.setLevel(1, 0.01);
          noiseBurst(out, this.voice.input, { type: 'bandpass', frequency: 700, sweepTo: 250, q: 1.4, volume: 0.35, attack: 0.3, decay: 1.1, color: 'pink' });
        }
      }
      // Running footsteps.
      if (f < 1 && out && this.feetSound && this.clock - this.lastStep > 0.16) {
        this.lastStep = this.clock;
        this.feetSound.setPosition({ x: start.x + (end.x - start.x) * f, y: PLATFORM_Y, z: start.z + (end.z - start.z) * f });
        this.feetSound.setLevel(1, 0.01);
        noiseBurst(out, this.feetSound.input, { type: 'lowpass', frequency: 900, volume: 0.25, decay: 0.05 });
      }
      break;
    }
    if (!shown) hideFigure(this.mesh, RUNNER);
    if (this.told.size > 200) this.told.clear();
  }
}

/** The middle of the platform nearest the player (a shared station has two). */
function islandNear(s: StationInfo, feet: Vector3): number {
  return s.platforms.reduce((best, z) => (Math.abs(z - feet.z) < Math.abs(best - feet.z) ? z : best));
}
