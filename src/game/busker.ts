import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, type Scene, Vector3 } from 'three';
import { hash01, serviceOpen, stockholm } from './clock';
import { drawFigure, figureMesh, paintFigure } from './figures';
import { text } from './i18n/text';
import { Spatial, thump, type AudioOut } from './sfx';
import type { Passage } from './world/station';
import type { Interactable } from './world/zones';

/**
 * An accordion player in the passage off T-Centralen's ticket hall. The music
 * is generated: polska-like tunes in three-four, an AABB form over a minor-key
 * chord pattern, played on detuned reeds with a musette wobble and a left-hand
 * oom-pah, with the passage's tiles giving it some echo.
 */

const BPM = 104;
const BEAT = 60 / BPM;
const BAR = BEAT * 3;
const AUDIBLE = 70;

/** Chords as semitone offsets from the tonic. */
const CHORDS: Record<string, number[]> = {
  i: [0, 3, 7], iv: [5, 8, 12], V: [7, 11, 14], VI: [8, 12, 15], III: [3, 7, 10], VII: [10, 14, 17],
};
const A_PART = ['i', 'i', 'iv', 'V', 'i', 'VI', 'iv', 'V'];
const B_PART = ['III', 'VII', 'i', 'V', 'VI', 'III', 'iv', 'i'];
const SCALE = [0, 2, 3, 5, 7, 8, 10];
/** Rhythms in eighth notes, three beats to the bar. */
const RHYTHMS = [[2, 1, 1, 2], [1, 1, 1, 1, 1, 1], [3, 1, 2], [2, 2, 1, 1], [1, 1, 2, 2], [2, 1, 1, 1, 1]];

interface Note { start: number; length: number; pitch: number; velocity: number }

function rng(seed: number): () => number {
  let i = 0;
  return () => hash01(i++, seed);
}

/** One tune: 32 bars of melody plus bass and chords, in seconds from its start. */
export function composeTune(seed: number, tonic: number): { melody: Note[]; bass: Note[]; length: number } {
  const random = rng(seed);
  const parts = [A_PART, A_PART, B_PART, B_PART];
  const melody: Note[] = [];
  const bass: Note[] = [];
  const phrases = new Map<string, Note[]>();
  let pitch = tonic + 12 + 7;
  const nearest = (target: number, choices: number[]) => choices.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
  parts.forEach((part, p) => {
    const key = p % 2 === 1 ? String(p - 1) : null;
    const offset = p * 8 * BAR;
    // The second time through a part repeats it, with a new last bar.
    const reuse = key !== null ? phrases.get(key) : undefined;
    const phrase: Note[] = [];
    part.forEach((chord, bar) => {
      const tones = CHORDS[chord];
      const barStart = bar * BAR;
      bass.push({ start: offset + barStart, length: BEAT * 0.9, pitch: tonic - 12 + (tones[0] % 12) - (tones[0] % 12 > 7 ? 12 : 0), velocity: 0.9 });
      for (const beat of [1, 2]) for (const t of tones) bass.push({ start: offset + barStart + beat * BEAT, length: BEAT * 0.45, pitch: tonic + (t % 12) - 12 + (t % 12 > 9 ? -12 : 0) + 12, velocity: 0.45 });
      if (reuse && bar < 7) return;
      const final = bar === 7;
      const cadence = bar === 3 || final;
      const rhythm = final ? [4, 2] : cadence ? [2, 4] : RHYTHMS[Math.floor(random() * RHYTHMS.length)];
      let t = 0;
      rhythm.forEach((eighths, k) => {
        const strong = t % 2 === 0;
        const leading = chord === 'V' ? [11] : [];
        const scale = [...SCALE.filter((s) => !(chord === 'V' && s === 10)), ...leading];
        const pool: number[] = [];
        for (const octave of [0, 12, 24]) for (const s of strong ? tones : scale) pool.push(tonic + octave + (s % 12));
        const inRange = pool.filter((n) => n >= tonic + 5 && n <= tonic + 26);
        const step = (random() < 0.5 ? -1 : 1) * (strong ? 2 + Math.floor(random() * 4) : 1 + Math.floor(random() * 2));
        pitch = nearest(pitch + step, inRange);
        if (final && k === rhythm.length - 1) pitch = nearest(pitch, [tonic + 12, tonic + 24]);
        phrase.push({ start: barStart + t * BEAT / 2, length: eighths * BEAT / 2 * 0.92, pitch, velocity: strong ? 0.9 : 0.7 });
        t += eighths;
      });
    });
    if (key === null) phrases.set(String(p), phrase);
    const played = reuse ? [...reuse.filter((n) => n.start < 7 * BAR), ...phrase] : phrase;
    for (const n of played) melody.push({ ...n, start: n.start + offset });
  });
  return { melody, bass, length: 32 * BAR };
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

export class Busker {
  readonly group = new Group();
  readonly interactable: Interactable;
  private readonly figure = figureMesh(1);
  private readonly bellows: Mesh;
  private readonly position: Vector3;
  private voice: { spatial: Spatial; dry: GainNode; tremolo: GainNode; reverb: ConvolverNode } | null = null;
  private tune: ReturnType<typeof composeTune> | null = null;
  private tuneStart = 0;
  private scheduled = 0;
  private cursor = { melody: 0, bass: 0 };
  private seed: number;
  private tonic = 62;
  private clock = 0;
  private coins = 0;
  private out: AudioOut | null = null;
  private now = 0;

  constructor(scene: Scene, private readonly passage: Passage) {
    this.position = passage.busker.clone();
    this.seed = Math.floor(Date.now() / 86400000);
    const { x, y, z } = this.position;
    paintFigure(this.figure, 0, { coat: 0x5b3a52, skin: 0xc79a78, hair: 0x6b6f75, bag: 0x3d2a24, trousers: 0x2e3440, shoes: 0x1f1b18 });
    this.group.add(this.figure);
    const wood = new MeshLambertMaterial({ color: 0x6b4a2e });
    const stool = new Mesh(new CylinderGeometry(0.2, 0.2, 0.05, 14), wood);
    stool.position.set(x, y + 0.5, z);
    const leg = new Mesh(new CylinderGeometry(0.03, 0.05, 0.5, 8), wood);
    leg.position.set(x, y + 0.25, z);
    this.group.add(stool, leg);

    // The accordion sits on the knees, facing out.
    const accordion = new Group();
    const red = new MeshLambertMaterial({ color: 0x9c1f2a });
    const black = new MeshLambertMaterial({ color: 0x17181b });
    const keys = new Mesh(new BoxGeometry(0.1, 0.36, 0.2), red);
    keys.position.x = 0.2;
    const bass = new Mesh(new BoxGeometry(0.1, 0.34, 0.2), black);
    bass.position.x = -0.2;
    this.bellows = new Mesh(new BoxGeometry(0.3, 0.32, 0.19), new MeshLambertMaterial({ color: 0x2b2d33 }));
    accordion.add(keys, bass, this.bellows);
    accordion.position.set(x, y + 0.98, z);
    accordion.rotation.y = passage.yaw;
    accordion.translateZ(0.28);
    this.group.add(accordion);

    // An open instrument case with a few coins.
    const case_ = new Mesh(new BoxGeometry(0.75, 0.08, 0.32), new MeshLambertMaterial({ color: 0x1d1f24 }));
    const lining = new Mesh(new BoxGeometry(0.68, 0.02, 0.26), new MeshLambertMaterial({ color: 0x7a2330 }));
    case_.position.set(x, y + 0.04, z);
    lining.position.set(x, y + 0.085, z);
    for (const m of [case_, lining]) m.rotation.y = passage.yaw + Math.PI / 2;
    const forward = new Vector3(Math.sin(passage.yaw), 0, Math.cos(passage.yaw));
    case_.position.addScaledVector(forward, 0.95);
    lining.position.addScaledVector(forward, 0.95);
    this.group.add(case_, lining);
    const coin = new MeshLambertMaterial({ color: 0xd8b04a });
    for (let i = 0; i < 7; i++) {
      const c = new Mesh(new CylinderGeometry(0.018, 0.018, 0.004, 10), coin);
      c.position.copy(lining.position).add(new Vector3(Math.sin(i * 2.4) * 0.22, 0.013, Math.cos(i * 1.7) * 0.08));
      this.group.add(c);
    }
    scene.add(this.group);

    this.interactable = {
      pos: case_.position.clone(), radius: 1.6, prompt: () => text.busker.prompt,
      enabled: () => Busker.playing(this.now),
      act: () => {
        this.coins++;
        this.seed += 1;
        this.tonic = [62, 64, 57, 60, 65][this.coins % 5];
        this.tune = null;
        if (this.out) thump(this.out, 0.08, 2400);
        return text.busker.thanks;
      },
    };
  }

  /** Busking hours: daytime and evening, while the trains run. */
  static playing(epoch: number): boolean {
    const h = stockholm(epoch).hours;
    return serviceOpen(epoch) && h >= 8 && h < 22;
  }

  update(dt: number, time: number, listener: Vector3, out: AudioOut | null): void {
    this.clock += dt;
    this.out = out;
    this.now = time;
    const here = Busker.playing(time);
    const distance = listener.distanceTo(this.position);
    this.group.visible = here && distance < 180;
    const near = here && distance < AUDIBLE;
    // Sway gently with the three-four.
    drawFigure(this.figure, 0, { x: this.position.x, y: this.position.y, z: this.position.z, yaw: this.passage.yaw + Math.sin(this.clock * Math.PI * 2 / (BAR * 2)) * 0.12, walking: false, seated: true }, this.clock);
    this.figure.instanceMatrix.needsUpdate = true;
    this.bellows.scale.x = 0.75 + 0.35 * Math.sin((this.clock / (BAR * 2)) * Math.PI * 2);
    if (!out) return;
    if (!near) { this.voice?.spatial.setLevel(0, 0.4); return; }
    this.ensureVoice(out);
    const v = this.voice!;
    v.spatial.setPosition({ x: this.position.x, y: this.position.y + 1, z: this.position.z });
    v.spatial.setLevel(0.9, 0.6);
    this.schedule(out);
  }

  private ensureVoice(out: AudioOut): void {
    if (this.voice) return;
    const ctx = out.ctx;
    const spatial = new Spatial(out, 3, 1.1, 90);
    const dry = ctx.createGain();
    dry.gain.value = 0.8;
    // Musette: a slow amplitude wobble on the melody reeds.
    const tremolo = ctx.createGain();
    tremolo.gain.value = 0.85;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.6;
    const depth = ctx.createGain();
    depth.gain.value = 0.15;
    lfo.connect(depth).connect(tremolo.gain);
    lfo.start();
    // Tiled passage echo from a generated impulse.
    const reverb = ctx.createConvolver();
    const length = Math.floor(ctx.sampleRate * 1.6);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
    reverb.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    tremolo.connect(dry).connect(spatial.input);
    tremolo.connect(reverb).connect(wet).connect(spatial.input);
    this.voice = { spatial, dry, tremolo, reverb };
  }

  private schedule(out: AudioOut): void {
    const ctx = out.ctx;
    const now = ctx.currentTime;
    if (!this.tune || now > this.tuneStart + this.tune.length + BAR) {
      this.tune = composeTune(this.seed++, this.tonic);
      this.tuneStart = Math.max(now + 0.1, this.scheduled);
      this.cursor = { melody: 0, bass: 0 };
    }
    const tune = this.tune;
    const horizon = now + 0.35;
    const play = (list: Note[], key: 'melody' | 'bass', reed: boolean) => {
      while (this.cursor[key] < list.length && this.tuneStart + list[this.cursor[key]].start < horizon) {
        const n = list[this.cursor[key]++];
        const at = this.tuneStart + n.start;
        if (at < now - 0.05) continue;
        this.reed(ctx, at, n, reed);
        this.scheduled = Math.max(this.scheduled, at + n.length);
      }
    };
    play(tune.melody, 'melody', true);
    play(tune.bass, 'bass', false);
  }

  private reed(ctx: AudioContext, at: number, note: Note, melody: boolean): void {
    const v = this.voice!;
    const f = midi(note.pitch);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    const peak = (melody ? 0.07 : 0.045) * note.velocity;
    env.gain.linearRampToValueAtTime(peak, at + 0.03);
    env.gain.setValueAtTime(peak, at + note.length);
    env.gain.linearRampToValueAtTime(0, at + note.length + 0.07);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = melody ? 2600 : 1200;
    filter.Q.value = 1.2;
    env.connect(filter).connect(melody ? v.tremolo : v.dry);
    const detunes = melody ? [-7, 0, 7] : [0];
    const oscs = detunes.map((cents) => {
      const o = ctx.createOscillator();
      o.type = melody ? 'sawtooth' : 'square';
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(env);
      o.start(at);
      o.stop(at + note.length + 0.1);
      return o;
    });
    oscs[0].onended = () => { for (const o of oscs) o.disconnect(); env.disconnect(); filter.disconnect(); };
  }
}
