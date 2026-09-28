import { hash01, serviceOpen, stockholm } from './clock';

/**
 * The saxophonist's music, without the saxophonist: a generated solo and the reed that plays it, and when he is
 * there. No three.js.
 */

export const BPM = 76;
export const BEAT = 60 / BPM;
const SWING = 0.62;
/** ii-V-I-VI in a major key, as semitones from the tonic: chord tones for the improvisation. */
const CHANGES = [[2, 5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 11], [9, 12, 16, 19]];
const SCALE = [0, 2, 4, 5, 7, 9, 11];

export interface Phrase { start: number; length: number; pitch: number; accent: number }

/** Sixteen bars of a solo, in seconds from the start. */
export function improvise(seed: number, tonic: number): { notes: Phrase[]; length: number } {
  let i = 0;
  const r = () => hash01(i++, seed);
  const notes: Phrase[] = [];
  let pitch = tonic + 12;
  for (let bar = 0; bar < 16; bar++) {
    const chord = CHANGES[bar % 4];
    let beat = 0;
    // Rest now and then, to breathe.
    if (r() < 0.2) beat = 2;
    while (beat < 4) {
      const long = r() < 0.3;
      const length = long ? 1 : 0.5;
      const onBeat = beat % 1 === 0;
      const pool = (onBeat ? chord : SCALE).flatMap((s) => [tonic + s, tonic + 12 + s, tonic + 24 + s]).filter((n) => n >= tonic + 5 && n <= tonic + 26);
      const target = pitch + Math.round((r() - 0.5) * 7);
      pitch = pool.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
      const swung = onBeat ? beat : Math.floor(beat) + SWING;
      notes.push({ start: (bar * 4 + swung) * BEAT, length: length * BEAT * 0.95, pitch, accent: onBeat ? 1 : 0.7 });
      beat += length;
    }
  }
  return { notes, length: 16 * 4 * BEAT };
}

export const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** He plays by day while the metro runs. */
export function saxPlaying(epoch: number): boolean {
  const h = stockholm(epoch).hours;
  return serviceOpen(epoch) && h >= 9 && h < 21;
}

/** The hall's echo, from a generated impulse. */
export function hallReverb(ctx: AudioContext, seconds = 2.2): ConvolverNode {
  const reverb = ctx.createConvolver();
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.6;
  }
  reverb.buffer = impulse;
  return reverb;
}

/** One breathy note: a buzzing reed through a filter that opens as the note swells. */
export function reed(ctx: AudioContext, bus: AudioNode, at: number, n: Phrase): void {
  const f = midi(n.pitch - 12);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f * 0.985, at);
  osc.frequency.exponentialRampToValueAtTime(f, at + 0.06);
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, at);
  depth.gain.linearRampToValueAtTime(f * 0.01, at + n.length);
  vib.connect(depth).connect(osc.frequency);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(700, at);
  filter.frequency.linearRampToValueAtTime(1500 + n.accent * 900, at + Math.min(0.25, n.length));
  filter.frequency.linearRampToValueAtTime(900, at + n.length);
  const env = ctx.createGain();
  const peak = 0.06 * n.accent;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(peak, at + 0.04);
  env.gain.setValueAtTime(peak * 0.85, at + n.length * 0.7);
  env.gain.exponentialRampToValueAtTime(0.0001, at + n.length + 0.08);
  osc.connect(filter).connect(env).connect(bus);
  osc.start(at);
  vib.start(at);
  osc.stop(at + n.length + 0.1);
  vib.stop(at + n.length + 0.1);
  osc.onended = () => { for (const node of [osc, vib, depth, filter, env]) node.disconnect(); };
}
