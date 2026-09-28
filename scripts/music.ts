// Music for the videos, made the way the game makes its sound: Web Audio, rendered offline in the page into a WAV.
// The chords are the screensaver's (`Music` in screensaver.ts): a major seventh, a minor ninth, a fourth and a
// suspended fifth. Over them a bass, an arpeggio, bells, a kick, hats and the rail joints' da-dunk as the rhythm. A score
// says how loud each part is in each bar; recorded announcements from `public/audio/` can be laid on top, and the
// music ducks under them.
import type { Page } from 'puppeteer-core';

export type Part = 'pad' | 'bass' | 'arp' | 'bell' | 'rail' | 'kick' | 'hat' | 'riser';

export interface Score {
  bpm: number;
  /** Each bar's parts and their levels, 0 to 1. A bar with `ring` holds its chord and lets it ring out. */
  bars: Array<Partial<Record<Part, number>> & { ring?: boolean }>;
  /** Clips from `public/audio/`, played one after another from `at` seconds. */
  clips?: Array<{ files: string[]; at: number; gain?: number }>;
  /** Seconds of music in all; the end fades out. */
  seconds: number;
  /** Seconds of fade at the end. */
  fade?: number;
}

/** Renders the score in the page (which must be on the dev server, for the clips) and returns a WAV. */
export async function renderMusic(page: Page, score: Score): Promise<Uint8Array> {
  const base64 = (await page.evaluate(render, score)) as string;
  return Buffer.from(base64, 'base64');
}

// Runs in the page: no imports, nothing from outside.
async function render(score: Score): Promise<string> {
  const rate = 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(score.seconds * rate), rate);
  const beat = 60 / score.bpm;
  const bar = beat * 4;
  const chords = [[48, 55, 59, 64], [45, 52, 55, 62], [41, 48, 52, 57], [43, 50, 55, 57]];
  const hz = (n: number) => 440 * 2 ** ((n - 69) / 12);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  // Master: a gentle compressor and the fade at the end.
  const master = ctx.createGain();
  const fade = score.fade ?? 2;
  master.gain.setValueAtTime(1, Math.max(0, score.seconds - fade));
  master.gain.linearRampToValueAtTime(0.0001, score.seconds);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  // The music goes through a gain that ducks under the announcements.
  const music = ctx.createGain();
  music.connect(master);

  // A room: a convolver on made-up decaying noise, and an echo on dotted eighths.
  const room = ctx.createConvolver();
  const ir = ctx.createBuffer(2, rate * 3, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-i / rate) * 2.2);
  }
  room.buffer = ir;
  const roomOut = ctx.createGain();
  roomOut.gain.value = 0.35;
  room.connect(roomOut).connect(music);
  const echo = ctx.createDelay(2);
  echo.delayTime.value = beat * 0.75;
  const echoBack = ctx.createGain();
  echoBack.gain.value = 0.32;
  const echoOut = ctx.createGain();
  echoOut.gain.value = 0.4;
  echo.connect(echoBack).connect(echo);
  echo.connect(echoOut).connect(music);

  const noise = ctx.createBuffer(1, rate * 2, rate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  /** An envelope gain into `to` (and the room, by `wet`). */
  const env = (at: number, attack: number, peak: number, length: number, to: AudioNode, wet = 0): GainNode => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    g.connect(to);
    if (wet) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s).connect(room); }
    return g;
  };
  const osc = (type: OscillatorType, freq: number, at: number, length: number, to: AudioNode, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(to);
    o.start(at);
    o.stop(at + length + 0.05);
    return o;
  };
  const hiss = (at: number, length: number, to: AudioNode) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.connect(to);
    s.start(at, rnd());
    s.stop(at + length);
  };

  const pad = (at: number, chord: number[], level: number, length: number) => {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = env(at, 0.7, 0.05 * level, length, music, 0.6);
    lp.connect(g);
    for (const n of chord) for (const d of [-7, 7]) osc('sawtooth', hz(n), at, length, lp, d);
    osc('triangle', hz(chord[0] - 12), at, length, lp);
  };
  const bass = (at: number, root: number, level: number) => {
    for (const b of [0, 1.5, 2, 3, 3.5]) {
      const t = at + b * beat;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, t);
      lp.frequency.exponentialRampToValueAtTime(180, t + 0.25);
      lp.connect(env(t, 0.008, 0.32 * level, beat * 0.9, music));
      osc('sawtooth', hz(root - 12), t, beat, lp);
      osc('sine', hz(root - 24), t, beat, lp);
    }
  };
  const arp = (at: number, chord: number[], level: number) => {
    const tones = [...chord.map((n) => n + 12), ...chord.map((n) => n + 24)];
    const order = [0, 2, 4, 6, 5, 3, 1, 3, 0, 2, 4, 7, 6, 4, 2, 1];
    for (let k = 0; k < 16; k++) {
      const t = at + (k * beat) / 4;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(3200, t);
      lp.frequency.exponentialRampToValueAtTime(700, t + 0.14);
      const g = env(t, 0.004, 0.045 * level * (k % 4 === 0 ? 1 : 0.7), 0.22, music, 0.25);
      const s = ctx.createGain();
      s.gain.value = 0.5;
      g.connect(s).connect(echo);
      lp.connect(g);
      osc('square', hz(tones[order[k] % tones.length]), t, 0.25, lp);
    }
  };
  const bell = (at: number, chord: number[], level: number) => {
    for (let k = 0; k < 2; k++) {
      const n = chord[Math.floor(rnd() * chord.length)] + 24;
      const t = at + k * beat * 2 + beat * 0.5;
      const g = env(t, 0.005, 0.05 * level, 2.6, music, 0.8);
      osc('sine', hz(n), t, 2.6, g);
      osc('sine', hz(n) * 2.76, t, 0.8, env(t, 0.005, 0.012 * level, 0.8, music, 0.5));
    }
  };
  // The wheels over a rail joint: da-dunk, da-dunk, as the two bogies pass.
  const rail = (at: number, level: number) => {
    for (const b of [1, 1.25, 3, 3.25]) {
      const t = at + b * beat;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1700;
      bp.Q.value = 1.4;
      bp.connect(env(t, 0.002, 0.5 * level, 0.07, music, 0.3));
      hiss(t, 0.09, bp);
      const thump = osc('sine', 110, t, 0.14, env(t, 0.003, 0.35 * level, 0.13, music));
      thump.frequency.setValueAtTime(110, t);
      thump.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    }
  };
  const kick = (at: number, level: number) => {
    for (let b = 0; b < 4; b++) {
      const t = at + b * beat;
      const o = osc('sine', 150, t, 0.4, env(t, 0.003, 0.8 * level, 0.38, music));
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    }
  };
  const hat = (at: number, level: number) => {
    for (let k = 0; k < 8; k++) {
      const t = at + (k * beat) / 2;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7500;
      hp.connect(env(t, 0.002, (k % 2 ? 0.14 : 0.06) * level, 0.045, music, 0.1));
      hiss(t, 0.06, hp);
    }
  };
  const riser = (at: number, level: number) => {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(300, at);
    bp.frequency.exponentialRampToValueAtTime(7000, at + bar);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.25 * level, at + bar * 0.97);
    g.gain.linearRampToValueAtTime(0.0001, at + bar);
    bp.connect(g).connect(music);
    const s = ctx.createGain();
    s.gain.value = 0.4;
    g.connect(s).connect(room);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.connect(bp);
    src.start(at);
    src.stop(at + bar);
  };

  score.bars.forEach((parts, i) => {
    const at = i * bar;
    const chord = chords[i % chords.length];
    if (parts.pad) pad(at, chord, parts.pad, parts.ring ? Math.max(bar, score.seconds - at) : bar + 0.9);
    if (parts.bass) bass(at, chord[0], parts.bass);
    if (parts.arp) arp(at, chord, parts.arp);
    if (parts.bell) bell(at, chord, parts.bell);
    if (parts.rail) rail(at, parts.rail);
    if (parts.kick) kick(at, parts.kick);
    if (parts.hat) hat(at, parts.hat);
    if (parts.riser) riser(at, parts.riser);
  });

  // The announcements, dry and in front, with the music ducking under them.
  const voice = ctx.createGain();
  voice.gain.value = 0.9;
  voice.connect(master);
  for (const clip of score.clips ?? []) {
    let t = clip.at;
    for (const file of clip.files) {
      const data = await (await fetch(`/audio/${file}`)).arrayBuffer();
      const buffer = await ctx.decodeAudioData(data);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      g.gain.value = clip.gain ?? 1;
      src.connect(g).connect(voice);
      src.start(t);
      t += buffer.duration;
    }
    music.gain.setTargetAtTime(0.35, clip.at - 0.3, 0.1);
    music.gain.setTargetAtTime(1, t + 0.1, 0.4);
  }

  const out = await ctx.startRendering();
  // 16-bit stereo WAV.
  const frames = out.length;
  const bytes = new DataView(new ArrayBuffer(44 + frames * 4));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) bytes.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); bytes.setUint32(4, 36 + frames * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true);
  bytes.setUint32(24, rate, true); bytes.setUint32(28, rate * 4, true); bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true);
  str(36, 'data'); bytes.setUint32(40, frames * 4, true);
  const l = out.getChannelData(0), r = out.getChannelData(1);
  for (let i = 0; i < frames; i++) {
    bytes.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 32767, true);
    bytes.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i])) * 32767, true);
  }
  let bin = '';
  const u8 = new Uint8Array(bytes.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
