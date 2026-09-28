import type { AudioOut } from './sfx';

/**
 * Generated singing: a few voices on a melody, each a buzzy source through
 * two vowel formants with a little vibrato. In tune and together for the
 * Lucia procession, loud for the students, and out of time and out of tune
 * for a gang on their way home from the pub. All the tunes are original.
 */

export interface SungNote {
  /** Beats from the start of the tune. */
  beat: number;
  beats: number;
  /** MIDI note number. */
  pitch: number;
  vowel?: Vowel;
}

type Vowel = 'a' | 'o' | 'e' | 'i';
const FORMANTS: Record<Vowel, [number, number]> = { a: [800, 1200], o: [450, 820], e: [500, 1800], i: [320, 2300] };

export interface ChoirStyle {
  voices: number;
  /** Seconds per beat. */
  beat: number;
  /** Octave offsets for the voices, e.g. [0, -12] for sopranos over altos. */
  octaves: number[];
  /** Random pitch error per note, in cents. */
  sloppy: number;
  /** Random timing error per voice, in seconds. */
  drift: number;
  volume: number;
  /** Brighter source for shouting and cheering. */
  bright?: boolean;
}

/** Parses a compact melody: "G4:1 A4:.5 B4:.5 ..." (note:beats), with "-" for a rest. */
export function tune(text: string, vowels: Vowel[] = ['a', 'o', 'e']): SungNote[] {
  const names: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const notes: SungNote[] = [];
  let beat = 0;
  text.trim().split(/\s+/).forEach((token, k) => {
    const [name, length] = token.split(':');
    const beats = Number(length);
    if (name !== '-') {
      const m = name.match(/^([A-G])(#|b)?(\d)$/)!;
      const pitch = 12 * (Number(m[3]) + 1) + names[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
      notes.push({ beat, beats, pitch, vowel: vowels[k % vowels.length] });
    }
    beat += beats;
  });
  return notes;
}

/** A gentle, lilting tune in three for the Lucia procession. */
export const LUCIA_TUNE = tune(`
  D4:1 G4:1 G4:1 B4:1.5 A4:.5 G4:1 A4:1 B4:1 C5:1 B4:3
  B4:1 D5:1 C5:1 B4:1.5 A4:.5 G4:1 F#4:1 A4:1 G4:1 E4:3
  D4:1 G4:1 G4:1 B4:1.5 A4:.5 G4:1 A4:1 B4:1 C5:1 D5:3
  E5:1 D5:1 C5:1 B4:1.5 A4:.5 G4:1 A4:2 F#4:1 G4:3 -:3
`, ['a', 'a', 'o', 'i', 'a', 'o']);

/** A marching, shouty tune for students in white caps. */
export const STUDENT_TUNE = tune(`
  G4:.5 G4:.5 C5:1 C5:1 E5:1 D5:.5 C5:.5 D5:2 -:1
  E5:.5 E5:.5 F5:1 E5:1 D5:1 C5:.5 D5:.5 E5:2 -:1
  G5:1 E5:1 C5:1 D5:1 B4:1 G4:1 C5:3 -:1
`, ['a', 'e', 'a', 'i', 'a', 'o']);

/** A drinking-song sort of tune, meant to be sung badly. */
export const PARTY_TUNE = tune(`
  C4:1 E4:1 G4:1 G4:1 A4:1 G4:1 E4:2
  F4:1 F4:1 D4:1 D4:1 G4:1 F4:1 E4:2
  C4:1 E4:1 G4:1 C5:1 A4:1 F4:1 G4:1 E4:1 D4:1 C4:3 -:2
`, ['a', 'e', 'a', 'o']);

export const LUCIA_STYLE: ChoirStyle = { voices: 5, beat: 0.42, octaves: [0, 0, 12, -12, 0], sloppy: 6, drift: 0.01, volume: 0.035 };
export const STUDENT_STYLE: ChoirStyle = { voices: 6, beat: 0.3, octaves: [0, -12, 0, -12, 0, 0], sloppy: 25, drift: 0.04, volume: 0.05, bright: true };
export const PARTY_STYLE: ChoirStyle = { voices: 4, beat: 0.36, octaves: [-12, -12, 0, -12], sloppy: 70, drift: 0.12, volume: 0.05 };

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/**
 * Plays a tune into `dest`, starting `delay` seconds from now. Returns its
 * length in seconds. Every node is disconnected when its note ends.
 */
export function sing(out: AudioOut, dest: AudioNode, notes: SungNote[], style: ChoirStyle, delay = 0): number {
  const ctx = out.ctx;
  const start = ctx.currentTime + delay;
  const end = notes.reduce((m, n) => Math.max(m, n.beat + n.beats), 0) * style.beat;
  for (let v = 0; v < style.voices; v++) {
    const shift = style.octaves[v % style.octaves.length];
    const lag = (Math.random() - 0.5) * style.drift * 2;
    for (const n of notes) {
      const at = start + n.beat * style.beat + lag + (Math.random() - 0.5) * style.drift;
      const length = n.beats * style.beat * 0.92;
      const osc = ctx.createOscillator();
      osc.type = style.bright ? 'sawtooth' : 'triangle';
      osc.frequency.value = midi(n.pitch + shift);
      osc.detune.value = (Math.random() - 0.5) * style.sloppy * 2 + (v - style.voices / 2) * 4;
      // Vibrato that settles in after the note starts.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5 + Math.random();
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, at);
      depth.gain.linearRampToValueAtTime(osc.frequency.value * 0.012, at + Math.min(0.4, length));
      lfo.connect(depth).connect(osc.frequency);
      const [f1, f2] = FORMANTS[n.vowel ?? 'a'];
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(style.volume, at + 0.06);
      env.gain.setValueAtTime(style.volume, at + Math.max(0.07, length - 0.08));
      env.gain.exponentialRampToValueAtTime(0.0001, at + length + 0.05);
      const a = ctx.createBiquadFilter();
      a.type = 'bandpass';
      a.frequency.value = f1;
      a.Q.value = 6;
      const b = ctx.createBiquadFilter();
      b.type = 'bandpass';
      b.frequency.value = f2;
      b.Q.value = 8;
      const mix = ctx.createGain();
      mix.gain.value = 3;
      osc.connect(a).connect(mix);
      osc.connect(b).connect(mix);
      mix.connect(env).connect(dest);
      osc.start(at);
      lfo.start(at);
      osc.stop(at + length + 0.1);
      lfo.stop(at + length + 0.1);
      osc.onended = () => { for (const node of [osc, lfo, depth, a, b, mix, env]) node.disconnect(); };
    }
  }
  return end + delay;
}
