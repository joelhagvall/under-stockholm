import type { Vector3 } from 'three';

/** The shared audio graph that feature sounds plug into. */
export interface AudioOut {
  ctx: AudioContext;
  /** The world outside the train: muffled while you ride with the doors shut. */
  bus: AudioNode;
  /** Sounds inside the carriage with you, and your own footsteps: never muffled. */
  cabin: AudioNode;
}

const noises = new WeakMap<AudioContext, Map<string, AudioBuffer>>();

/** Looping noise, cached per context: white, pink-ish or brown. */
export function noiseBuffer(ctx: AudioContext, color: 'white' | 'pink' | 'brown', seconds = 2): AudioBuffer {
  let byColor = noises.get(ctx);
  if (!byColor) noises.set(ctx, (byColor = new Map()));
  const cached = byColor.get(color);
  if (cached) return cached;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (color === 'white') data[i] = white * 0.5;
    else if (color === 'brown') {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.12;
    }
  }
  byColor.set(color, buffer);
  return buffer;
}

export function loopNoise(out: AudioOut, color: 'white' | 'pink' | 'brown'): AudioBufferSourceNode {
  const src = out.ctx.createBufferSource();
  src.buffer = noiseBuffer(out.ctx, color);
  src.loop = true;
  src.start();
  return src;
}

/** A positional sound source: route anything into `input`. */
export class Spatial {
  readonly input: GainNode;
  private readonly panner: PannerNode;

  /** @param inside a sound in the carriage with the listener, which the closed doors do not muffle */
  constructor(private readonly out: AudioOut, refDistance = 3, rolloff = 1.4, maxDistance = 80, inside = false) {
    const ctx = out.ctx;
    this.input = ctx.createGain();
    this.input.gain.value = 0;
    this.panner = ctx.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = refDistance;
    this.panner.rolloffFactor = rolloff;
    this.panner.maxDistance = maxDistance;
    this.input.connect(this.panner).connect(inside ? out.cabin : out.bus);
  }

  setPosition(p: { x: number; y: number; z: number }): void {
    const t = this.out.ctx.currentTime;
    this.panner.positionX.setTargetAtTime(p.x, t, 0.05);
    this.panner.positionY.setTargetAtTime(p.y, t, 0.05);
    this.panner.positionZ.setTargetAtTime(p.z, t, 0.05);
  }

  setLevel(level: number, smoothing = 0.2): void {
    this.input.gain.setTargetAtTime(level, this.out.ctx.currentTime, smoothing);
  }
}

/** Places the Web Audio listener at the camera. */
export function placeListener(out: AudioOut, position: Vector3, yaw: number): void {
  const l = out.ctx.listener;
  const t = out.ctx.currentTime;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  if (l.positionX) {
    l.positionX.setTargetAtTime(position.x, t, 0.03);
    l.positionY.setTargetAtTime(position.y, t, 0.03);
    l.positionZ.setTargetAtTime(position.z, t, 0.03);
    l.forwardX.setTargetAtTime(fx, t, 0.03);
    l.forwardY.setTargetAtTime(0, t, 0.03);
    l.forwardZ.setTargetAtTime(fz, t, 0.03);
    l.upX.value = 0;
    l.upY.value = 1;
    l.upZ.value = 0;
  } else {
    // Older Safari.
    l.setPosition(position.x, position.y, position.z);
    l.setOrientation(fx, 0, fz, 0, 1, 0);
  }
}

/** A short two-tone beep, like a card reader. */
export function beep(out: AudioOut, ok: boolean): void {
  const ctx = out.ctx;
  const t = ctx.currentTime;
  const tones = ok ? [1318, 1760] : [440, 330];
  tones.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = f;
    const g = ctx.createGain();
    const start = t + i * 0.09;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.05, start + 0.005);
    g.gain.setValueAtTime(0.05, start + 0.07);
    g.gain.linearRampToValueAtTime(0, start + 0.085);
    osc.connect(g).connect(out.bus);
    osc.start(start);
    osc.stop(start + 0.1);
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
  });
}

/** A soft, dull thump: a coin, a door, a flap. */
export function thump(out: AudioOut, volume = 0.2, frequency = 180, dest: AudioNode = out.bus): void {
  const ctx = out.ctx;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 'brown');
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = frequency;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random());
  src.stop(t + 0.3);
  src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
}

export interface BurstOptions {
  type?: BiquadFilterType;
  frequency: number;
  q?: number;
  volume: number;
  attack?: number;
  decay: number;
  delay?: number;
  /** Filter frequency at the end, for a sweep. */
  sweepTo?: number;
  color?: 'white' | 'pink' | 'brown';
}

/** A filtered noise burst into any node: a sneeze, a whoosh, a tick. */
export function noiseBurst(out: AudioOut, dest: AudioNode, o: BurstOptions): void {
  const ctx = out.ctx;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, o.color ?? 'white');
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.Q.value = o.q ?? 1;
  const t = ctx.currentTime + (o.delay ?? 0);
  const attack = o.attack ?? 0.005;
  f.frequency.setValueAtTime(o.frequency, t);
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + attack + o.decay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.volume), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + o.decay);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random());
  src.stop(t + attack + o.decay + 0.05);
  src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
}

/** A decaying tone into any node: a bell, a glass clink, a squeak. */
export function tone(out: AudioOut, dest: AudioNode, frequency: number, volume: number, decay: number, opts: { type?: OscillatorType; delay?: number; glideTo?: number; attack?: number } = {}): void {
  const ctx = out.ctx;
  const osc = ctx.createOscillator();
  osc.type = opts.type ?? 'sine';
  const t = ctx.currentTime + (opts.delay ?? 0);
  osc.frequency.setValueAtTime(frequency, t);
  if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(opts.glideTo, t + decay);
  const g = ctx.createGain();
  const attack = opts.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
  osc.onended = () => { osc.disconnect(); g.disconnect(); };
}
