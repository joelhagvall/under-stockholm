import { Vector3 } from 'three';
import { hash01 } from './clock';
import { ESC_DESIGN, PLATFORM_Y, TRAIN_HALF_L } from './layout';
import type { AudioOut } from './sfx';
import type { TrainState } from './timetable';
import type { Train } from './train';
import type { StationInfo } from './world/station';

/**
 * Screensaver mode: the camera travels the line on its own. It rides in the
 * cab of a train watching the tunnel come at it, waits on a platform as a
 * train pulls in, sits in a carriage, and rides the escalators up, cutting
 * between shots through a fade. Slow generated music plays underneath. Any
 * key, click or touch ends it.
 */

export interface SaverTrain {
  train: Train;
  state: TrainState;
  /** +1 heading toward +x. */
  heading: 1 | -1;
  /** The stop it is heading for is a station, not a turnback. */
  toStation: boolean;
}

export interface SaverWorld {
  trains(): SaverTrain[];
  stations: StationInfo[];
  /** Seconds until a train reaches a station on a track, or null. */
  arrival(station: number, track: 1 | 2): number | null;
  teleport(feet: Vector3, yaw: number): void;
  /** Fixes the camera at a point (a cab window), or frees it. */
  eye(at: Vector3 | null): void;
  look(yaw: number, pitch: number): void;
  blackout(during: () => void): Promise<void>;
}

type Shot = 'cab' | 'platform' | 'escalator' | 'window';

interface Running {
  shot: Shot;
  until: number;
  train?: Train;
  heading?: 1 | -1;
  yaw: number;
  pan: number;
  pitch: number;
}

const ORDER: Shot[] = ['cab', 'platform', 'window', 'cab', 'escalator', 'platform'];

export class Screensaver {
  active = false;
  private shot: Running | null = null;
  private clock = 0;
  private index = 0;
  private cutting = false;
  private music: Music | null = null;
  private readonly eyeAt = new Vector3();

  constructor(private readonly world: SaverWorld) {}

  start(out: AudioOut | null): void {
    if (this.active) return;
    this.active = true;
    this.shot = null;
    this.index = Math.floor(Math.random() * ORDER.length);
    if (out) { this.music ??= new Music(out); this.music.play(true); }
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.shot = null;
    this.world.eye(null);
    this.music?.play(false);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.clock += dt;
    this.music?.update();
    const s = this.shot;
    if (!s || this.clock > s.until) { this.next(); return; }
    s.yaw += s.pan * dt;
    this.world.look(s.yaw, s.pitch);
    if (s.shot === 'cab' && s.train && s.heading) {
      // The cab window, at the very front of the train.
      this.eyeAt.set(s.train.position.x + s.heading * (TRAIN_HALF_L - 0.95), PLATFORM_Y + 1.42, s.train.position.z);
      this.world.eye(this.eyeAt);
    }
  }

  /** Cuts to the next shot through a fade. */
  private next(): void {
    if (this.cutting) return;
    this.cutting = true;
    const shot = ORDER[this.index++ % ORDER.length];
    void this.world.blackout(() => {
      this.world.eye(null);
      this.shot = this.frame(shot) ?? this.frame('platform') ?? this.frame('escalator');
    }).then(() => { this.cutting = false; });
  }

  private frame(shot: Shot): Running | null {
    const trains = this.world.trains();
    const now = this.clock;
    if (shot === 'cab' || shot === 'window') {
      const moving = trains.filter((t) => t.toStation && (t.state.phase === 'moving' || t.state.phase === 'closing'));
      if (!moving.length) return null;
      const t = moving[Math.floor(Math.random() * moving.length)];
      const yaw = t.heading > 0 ? -Math.PI / 2 : Math.PI / 2;
      if (shot === 'cab') {
        this.world.teleport(new Vector3(t.train.position.x + t.heading * (TRAIN_HALF_L - 3.2), PLATFORM_Y + 0.02, t.train.position.z), yaw);
        return { shot, until: now + 50, train: t.train, heading: t.heading, yaw, pan: 0, pitch: -0.03 };
      }
      // Standing in the aisle, watching the tunnel wall and the lamps go by.
      const side = hash01(Math.floor(now), 3) < 0.5 ? 1 : -1;
      const x = t.train.position.x + (hash01(Math.floor(now), 4) - 0.5) * 60;
      this.world.teleport(new Vector3(x, PLATFORM_Y + 0.02, t.train.position.z), side > 0 ? Math.PI : 0);
      return { shot, until: now + 30, yaw: side > 0 ? Math.PI : 0, pan: 0.01, pitch: 0.02 };
    }
    if (shot === 'platform') {
      // A platform where a train is due in a little while.
      let best: { s: StationInfo; track: 1 | 2; eta: number } | null = null;
      for (const s of this.world.stations) {
        for (const track of [1, 2] as const) {
          const eta = this.world.arrival(s.index, track);
          if (eta !== null && eta > 12 && eta < 50 && (!best || Math.random() < 0.3)) best = { s, track, eta };
        }
      }
      if (!best) return null;
      const { s, track, eta } = best;
      const dir = track === 1 ? 1 : -1;
      const z = track === 1 ? 2.8 : -2.8;
      // Toward the tunnel the train comes out of, then panning slowly as it pulls in.
      const yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.world.teleport(new Vector3(s.cx + dir * 30, PLATFORM_Y, z), yaw + (z > 0 ? -0.35 : 0.35) * dir);
      return { shot, until: now + eta + 16, yaw: yaw + (z > 0 ? -0.35 : 0.35) * dir, pan: -dir * 0.012, pitch: 0 };
    }
    // Up the escalator of a station, looking up the shaft.
    const s = this.world.stations[Math.floor(Math.random() * this.world.stations.length)];
    const esc = s.escalator;
    const yaw = esc.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.world.teleport(new Vector3(esc.wallX + esc.dir * 0.6, PLATFORM_Y, esc.z + ESC_DESIGN.laneCenter), yaw);
    return { shot, until: now + 34, yaw, pan: 0, pitch: 0.18 };
  }
}

/**
 * Slow, warm chords with a little echo and a sparse melody over them: a
 * major seventh, a minor ninth, a fourth and a suspended fifth, over and over.
 */
export class Music {
  private readonly bus: GainNode;
  private next = 0;
  private bar = 0;
  private on = false;

  constructor(private readonly out: AudioOut) {
    const ctx = out.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.62;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    this.bus.connect(lp).connect(out.cabin);
    lp.connect(delay).connect(feedback).connect(delay);
    delay.connect(out.cabin);
  }

  play(on: boolean): void {
    this.on = on;
    this.bus.gain.setTargetAtTime(on ? 0.16 : 0, this.out.ctx.currentTime, on ? 1.5 : 0.4);
    if (on) this.next = this.out.ctx.currentTime + 0.3;
  }

  update(): void {
    if (!this.on) return;
    const ctx = this.out.ctx;
    const chords = [[48, 55, 59, 64], [45, 52, 55, 62], [41, 48, 52, 57], [43, 50, 55, 57]];
    while (this.next < ctx.currentTime + 1) {
      const at = this.next;
      const chord = chords[this.bar % chords.length];
      const length = 6;
      for (const n of chord) this.voice(at, length + 1, n, 0.05, 'triangle', 2);
      // A few bell notes on top.
      for (let k = 0; k < 3; k++) {
        if (hash01(this.bar * 7 + k, 151) < 0.5) continue;
        const n = chord[Math.floor(hash01(this.bar * 5 + k, 152) * chord.length)] + 24;
        this.voice(at + 0.5 + k * 1.8, 2.4, n, 0.03, 'sine', 0.01);
      }
      this.next += length;
      this.bar++;
    }
  }

  private voice(at: number, length: number, note: number, volume: number, type: OscillatorType, attack: number): void {
    const ctx = this.out.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = 440 * 2 ** ((note - 69) / 12);
    osc.detune.value = (Math.random() - 0.5) * 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(volume, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(g).connect(this.bus);
    osc.start(at);
    osc.stop(at + length + 0.1);
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
  }
}
