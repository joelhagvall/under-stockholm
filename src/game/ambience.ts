import { hash01, stockholm, sunElevation } from './clock';
import { squeakyEscalator, type Occasion } from './calendar';
import text from './i18n/sv.json';
import { CAVE_HALF_L, ESC_ANGLE, ESC_DESIGN, ESC_SPEED, PLATFORM_Y, TRACK_Z, TRAIN_HALF_L, TRAIN_NOSE } from './layout';
import { playRecording } from './recordings';
import { loopNoise, noiseBurst, Spatial, tone, type AudioOut } from './sfx';
import type { Location } from './world/world';
import type { StationInfo } from './world/station';

/**
 * The sound of the metro between the trains: the street at the top of the
 * stairs, the red and green lines rumbling through the rock at T-Centralen,
 * tunnel fans, rails that start to sing before a train shows, the horn as it
 * leaves the tunnel, a train passing the other way, someone sneezing, a
 * squeaky escalator, a phone speaker and clinking Friday bags.
 */

export interface AmbientTrain {
  id: number;
  x: number;
  z: number;
  speed: number;
  /** +1 heading toward +x. */
  dir: 1 | -1;
}

export interface AmbienceInput {
  time: number;
  dt: number;
  listener: { x: number; y: number; z: number };
  location: Location;
  trains: AmbientTrain[];
  /** The service train the player rides, if any. */
  riding: AmbientTrain | null;
  /** Passengers are shown, so people can sneeze and play music. */
  people: boolean;
  busy: number;
  occasion: Occasion;
  escalatorsRunning: boolean;
  /** Summer: tourists ask the way, in English. */
  tourists?: boolean;
  /** The time machine's 1975: no phones to play music from. */
  past?: boolean;
}

export interface AmbienceEvents {
  say(message: string, seconds: number): void;
  speak(message: string, pitch: number, rate: number, lang?: string): void;
  jolt(strength: number): void;
}

const RAIL_REACH = 420;
const SQUEAK_PERIOD = (2 * ESC_DESIGN.stepPitch) / (ESC_SPEED * Math.cos(ESC_ANGLE));
const PENTATONIC = [0, 3, 5, 7, 10, 12, 15];
/** Levels of the recorded sneeze, the bottles in a Friday bag and the sigh at someone's phone music. */
const SNEEZE = 0.25;
const CLINK = 0.6;
const PHONE_SIGH = 0.1;

export class Ambience {
  private out: AudioOut | null = null;
  private street: Spatial | null = null;
  private vents: Spatial[] = [];
  private rails: { spatial: Spatial; sing: GainNode } | null = null;
  private horn: Spatial | null = null;
  private near: Spatial | null = null;
  private nearInside: Spatial | null = null;
  private squeak: Spatial | null = null;
  private phone: Spatial | null = null;
  private rumble: GainNode | null = null;
  private clock = 0;
  private nextBus = 20;
  private nextGull = 8;
  private nextRumble = 30;
  private nextSneeze = 60 + Math.random() * 90;
  private nextClink = 5;
  private nextTourist = 40 + Math.random() * 60;
  private lastBell = '';
  private lastSqueak = -1;
  private lastTick = 0;
  private draftShown = false;
  private readonly fronts = new Map<number, number>();
  private readonly passing = new Map<number, number>();
  private music: { window: number; train: number; next: number; step: number; seed: number } | null = null;

  constructor(private readonly stations: StationInfo[], private readonly events: AmbienceEvents) {}

  update(input: AmbienceInput, out: AudioOut | null): void {
    this.clock += input.dt;
    if (!out) return;
    if (this.out !== out) this.build(out);
    const { location } = input;
    const station = location.station !== null && location.station < this.stations.length ? this.stations[location.station] : null;
    this.updateStreet(input, station);
    this.updateRumble(station);
    this.updateVents(input, station);
    this.updateRails(input, station);
    this.updateHorns(input);
    this.updatePassing(input);
    this.updatePeople(input, station);
    this.updateSqueak(input, station);
    this.updatePhone(input);
  }

  private build(out: AudioOut): void {
    this.out = out;
    const ctx = out.ctx;
    // Street: a low bed of traffic behind the doors.
    this.street = new Spatial(out, 4, 1.2, 60);
    const traffic = loopNoise(out, 'brown');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const bed = ctx.createGain();
    bed.gain.value = 0.35;
    traffic.connect(lp).connect(bed).connect(this.street.input);
    // Tunnel fans at both cave ends.
    this.vents = [0, 1].map(() => {
      const s = new Spatial(out, 5, 1.1, 90);
      const air = loopNoise(out, 'pink');
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 280;
      band.Q.value = 0.8;
      air.connect(band).connect(s.input);
      const hum = ctx.createOscillator();
      hum.frequency.value = 50;
      const hg = ctx.createGain();
      hg.gain.value = 0.08;
      hum.connect(hg).connect(s.input);
      hum.start();
      return s;
    });
    // Singing rails: two high partials with a slow shimmer.
    const spatial = new Spatial(out, 6, 1, 120);
    const sing = ctx.createGain();
    sing.gain.value = 0;
    for (const [f, g] of [[3150, 0.6], [4720, 0.35], [3185, 0.4]] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.7 + f / 5000;
      const depth = ctx.createGain();
      depth.gain.value = 6;
      lfo.connect(depth).connect(osc.frequency);
      const og = ctx.createGain();
      og.gain.value = g;
      osc.connect(og).connect(sing);
      osc.start();
      lfo.start();
    }
    sing.connect(spatial.input);
    spatial.setLevel(1);
    this.rails = { spatial, sing };
    this.horn = new Spatial(out, 12, 1, 300);
    this.horn.setLevel(1, 0.01);
    this.near = new Spatial(out, 2, 1.3, 40);
    this.near.setLevel(1, 0.01);
    this.nearInside = new Spatial(out, 2, 1.3, 40, true);
    this.nearInside.setLevel(1, 0.01);
    this.squeak = new Spatial(out, 3, 1.3, 60);
    this.squeak.setLevel(1, 0.01);
    this.phone = new Spatial(out, 2, 1.4, 30, true);
    // Deep rumble from other lines, felt more than heard.
    const deep = loopNoise(out, 'brown');
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 85;
    this.rumble = ctx.createGain();
    this.rumble.gain.value = 0;
    deep.connect(dl).connect(this.rumble).connect(out.bus);
  }

  /** Buses, gulls and church bells through the street doors. */
  private updateStreet(input: AmbienceInput, station: StationInfo | null): void {
    const out = this.out!;
    const area = input.location.area;
    const up = station && (area === 'hall' || area === 'escalator' || area === 'street') && !input.location.label;
    this.street!.setLevel(up ? (area === 'street' ? 0.9 : 0.5) : 0, 0.6);
    if (!up || !station) return;
    // The nearest hall's, where the station has one at each end.
    const x = input.listener.x;
    const e = station.halls.reduce((best, h) => (Math.abs(h.exit.x - x) < Math.abs(best.exit.x - x) ? h : best)).exit;
    // Out of the doorway, or up on the street from the road across the square.
    // Out at the side of a hall under the tracks, the street is beside them.
    this.street!.setPosition(e.across ? { x: e.x, y: e.sillY + 1.6, z: e.across * 30 } : area === 'street' ? { x: e.x + e.dir * 22, y: (e.street?.y ?? e.top) + 1.6, z: 0 } : { x: e.x, y: e.sillY + 1.6, z: 0 });
    const dest = this.street!.input;
    const c = stockholm(input.time);
    if (this.clock > this.nextBus) {
      this.nextBus = this.clock + 25 + Math.random() * 40;
      // A bus pulls away: a diesel drone that rises and fades, with a sigh of air brakes first.
      noiseBurst(out, dest, { type: 'highpass', frequency: 2500, volume: 0.25, attack: 0.02, decay: 0.7 });
      for (const [f, v] of [[48, 0.5], [96, 0.25]] as const) tone(out, dest, f, v, 6, { type: 'sawtooth', attack: 1.6, glideTo: f * 1.6, delay: 0.8 });
    }
    if (sunElevation(input.time) > -4 && this.clock > this.nextGull) {
      this.nextGull = this.clock + 9 + Math.random() * 22;
      const calls = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < calls; k++) tone(out, dest, 1550 - k * 40, 0.06, 0.3, { type: 'triangle', delay: k * 0.42, glideTo: 950, attack: 0.03 });
    }
    // Church bells strike the hour in the daytime.
    if (c.minute === 0 && c.hour >= 8 && c.hour <= 21) {
      const strikes = c.hour % 12 || 12;
      const k = Math.floor(c.second / 2.4);
      const key = `${c.hour}:${k}`;
      if (k < strikes && key !== this.lastBell) {
        this.lastBell = key;
        for (const [ratio, v] of [[1, 0.12], [2.4, 0.05], [3, 0.04], [0.5, 0.06]] as const) tone(out, dest, 392 * ratio, v, 3.2, { attack: 0.004 });
      }
    }
  }

  /** At T-Centralen the red and green lines thunder somewhere above. */
  private updateRumble(station: StationInfo | null): void {
    const out = this.out!;
    const here = station?.name === 'T-Centralen';
    if (!here) { this.rumble!.gain.setTargetAtTime(0, out.ctx.currentTime, 0.5); return; }
    if (this.clock > this.nextRumble) {
      this.nextRumble = this.clock + 35 + Math.random() * 60;
      const t = out.ctx.currentTime;
      const g = this.rumble!.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.9, t + 3);
      g.setValueAtTime(0.9, t + 5);
      g.linearRampToValueAtTime(0, t + 10);
    }
  }

  /** Fans roar at the tunnel mouths; a cold draft at the platform end. */
  private updateVents(input: AmbienceInput, station: StationInfo | null): void {
    const inCave = station && (input.location.area === 'platform' || input.location.area === 'track');
    this.vents.forEach((v, i) => {
      if (!inCave || !station) { v.setLevel(0, 0.5); return; }
      v.setPosition({ x: station.cx + (i ? 1 : -1) * CAVE_HALF_L, y: 6.2, z: 0 });
      v.setLevel(0.3, 0.5);
    });
    if (inCave && station && !this.draftShown && input.riding === null && Math.abs(Math.abs(input.listener.x - station.cx) - CAVE_HALF_L) < 9) {
      this.draftShown = true;
      this.events.say(text.ambience.draft, 4);
    }
  }

  /** Before the train is visible the rails start to tick and sing faintly. */
  private updateRails(input: AmbienceInput, station: StationInfo | null): void {
    const out = this.out!;
    const rails = this.rails!;
    let best = 0;
    let source: { x: number; z: number } | null = null;
    if (station && (input.location.area === 'platform' || input.location.area === 'track') && !input.riding) {
      for (const t of input.trains) {
        if (t.speed < 4) continue;
        const front = t.x + t.dir * (TRAIN_HALF_L + TRAIN_NOSE);
        const mouth = station.cx - t.dir * CAVE_HALF_L;
        const distance = (mouth - front) * t.dir;
        if (distance < 15 || distance > RAIL_REACH) continue;
        const level = (1 - distance / RAIL_REACH) ** 1.5;
        if (level > best) { best = level; source = { x: mouth, z: t.z > 0 ? TRACK_Z : -TRACK_Z }; }
      }
    }
    rails.sing.gain.setTargetAtTime(best * 0.035, out.ctx.currentTime, 0.4);
    if (!source) return;
    rails.spatial.setPosition({ x: source.x, y: 0.3, z: source.z });
    // Ticks come faster as the train nears.
    const interval = 0.95 - 0.7 * best;
    if (this.clock - this.lastTick > interval) {
      this.lastTick = this.clock;
      noiseBurst(out, rails.spatial.input, { type: 'highpass', frequency: 4200, volume: 0.05 + best * 0.12, decay: 0.03 });
    }
  }

  /** A short blast as a train leaves the tunnel and runs into a station. Everyone hears the same trains blow. */
  private updateHorns(input: AmbienceInput): void {
    const out = this.out!;
    for (const t of input.trains) {
      const front = t.x + t.dir * (TRAIN_HALF_L + TRAIN_NOSE);
      const before = this.fronts.get(t.id);
      this.fronts.set(t.id, front);
      if (before === undefined || t.speed < 5) continue;
      for (const s of this.stations) {
        const mouth = s.cx - t.dir * CAVE_HALF_L;
        const crossed = (mouth - before) * t.dir > 0 && (mouth - front) * t.dir <= 0;
        if (!crossed || hash01(Math.floor(input.time / 20) + t.id * 7, 88) > 0.45) continue;
        if (Math.hypot(mouth - input.listener.x, t.z - input.listener.z) > 320) continue;
        this.horn!.setPosition({ x: front, y: 1.8, z: t.z });
        for (const f of [330, 392]) tone(out, this.horn!.input, f, 0.12, 0.55, { type: 'sawtooth', attack: 0.04 });
      }
    }
  }

  /** In the tunnel a train passes the other way: a dull bang, a rush of air and a shudder. */
  private updatePassing(input: AmbienceInput): void {
    const out = this.out!;
    const r = input.riding;
    if (!r) { this.passing.clear(); return; }
    const inCave = this.stations.some((s) => Math.abs(r.x - s.cx) < CAVE_HALF_L + 10);
    for (const t of input.trains) {
      if (t.id === r.id || Math.sign(t.z) === Math.sign(r.z)) continue;
      const gap = Math.abs(t.x - r.x) - 2 * (TRAIN_HALF_L + TRAIN_NOSE);
      const before = this.passing.get(t.id);
      this.passing.set(t.id, gap);
      if (before === undefined || inCave || r.speed + t.speed < 14) continue;
      if (before > 0 && gap <= 0) {
        noiseBurst(out, out.bus, { type: 'lowpass', frequency: 160, volume: 0.9, attack: 0.01, decay: 0.6, color: 'brown' });
        noiseBurst(out, out.bus, { type: 'bandpass', frequency: 2200, sweepTo: 300, volume: 0.28, attack: 0.15, decay: 3.2, q: 0.6 });
        this.events.jolt(1);
      }
    }
  }

  /** People: a sneeze and a "prosit", and on Friday afternoons the clink of bottle bags. */
  private updatePeople(input: AmbienceInput, station: StationInfo | null): void {
    const out = this.out!;
    const among = input.people && ((station && input.location.area === 'platform' && input.busy > 0.15) || input.riding !== null);
    if (!among) return;
    const near = input.riding ? this.nearInside! : this.near!;
    const somewhere = () => near.setPosition({ x: input.listener.x + (Math.random() - 0.5) * 8, y: input.listener.y + 1.4, z: input.listener.z + (Math.random() - 0.5) * 3 });
    if (this.clock > this.nextSneeze) {
      this.nextSneeze = this.clock + 110 + Math.random() * 180;
      somewhere();
      playRecording(out, near.input, 'sneeze', SNEEZE);
      setTimeout(() => {
        this.events.speak(text.ambience.prositSpoken, 0.9 + Math.random() * 0.3, 1.05);
        this.events.say(text.ambience.prosit, 4);
      }, 1300);
    }
    if (input.tourists && station && this.clock > this.nextTourist) {
      this.nextTourist = this.clock + 90 + Math.random() * 120;
      const k = Math.floor(Math.random() * text.ambience.touristSpoken.length);
      this.events.speak(text.ambience.touristSpoken[k], 1.1, 1.05, 'en-GB');
      this.events.say(text.ambience.tourist[k], 5);
    }
    if (input.occasion === 'friday' && station && this.clock > this.nextClink) {
      this.nextClink = this.clock + 5 + Math.random() * 10;
      somewhere();
      playRecording(out, near.input, 'clink', CLINK);
    }
  }

  /** One of the up escalators squeaks, in step with the treads. */
  private updateSqueak(input: AmbienceInput, station: StationInfo | null): void {
    if (!station || !input.escalatorsRunning || station.index !== squeakyEscalator(input.time, this.stations.length)) return;
    const k = Math.floor(input.time / SQUEAK_PERIOD);
    if (k === this.lastSqueak) return;
    this.lastSqueak = k;
    const esc = station.escalator;
    this.squeak!.setPosition({ x: esc.wallX + esc.dir * esc.run * 0.45, y: esc.base + esc.rise * 0.45 + 0.4, z: esc.z + ESC_DESIGN.laneCenter });
    tone(this.out!, this.squeak!.input, 2250, 0.035, 0.12, { type: 'triangle', glideTo: 1850 });
  }

  /** Now and then someone aboard plays music out loud from their phone. The others sigh. */
  private updatePhone(input: AmbienceInput): void {
    const out = this.out!;
    const r = input.riding;
    const window = Math.floor(input.time / 200);
    const playing = r && input.people && !input.past && hash01(window * 13 + r.id, 51) < 0.35 && input.time - window * 200 < 55;
    if (!playing || !r) {
      this.music = null;
      this.phone!.setLevel(0, 0.1);
      return;
    }
    const phone = this.phone!;
    phone.setPosition({ x: r.x + 6, y: PLATFORM_Y + 0.9, z: r.z + 0.9 });
    if (!this.music || this.music.window !== window || this.music.train !== r.id) {
      this.music = { window, train: r.id, next: out.ctx.currentTime + 0.1, step: 0, seed: window };
      phone.setLevel(1, 0.05);
      this.events.say(text.ambience.phoneMusic, 5);
      playRecording(out, out.cabin, 'sigh', PHONE_SIGH, 2.4);
    }
    // A tinny loop through a small speaker: square-wave hook, a thin kick and hats.
    const m = this.music;
    const eighth = 60 / 124 / 2;
    while (m.next < out.ctx.currentTime + 0.15) {
      const t = m.next - out.ctx.currentTime;
      const s = m.step % 16;
      if (s % 4 === 0) tone(out, phone.input, 180, 0.06, 0.08, { delay: Math.max(0, t), glideTo: 90 });
      if (s % 2 === 1) noiseBurst(out, phone.input, { type: 'highpass', frequency: 6000, volume: 0.02, decay: 0.03, delay: Math.max(0, t) });
      if (hash01(m.seed * 16 + s, 52) < 0.55) {
        const note = 72 + PENTATONIC[Math.floor(hash01(m.seed * 16 + s, 53) * PENTATONIC.length)];
        tone(out, phone.input, 440 * 2 ** ((note - 69) / 12), 0.025, eighth * 0.8, { type: 'square', delay: Math.max(0, t) });
      }
      m.step++;
      m.next += eighth;
    }
  }
}
