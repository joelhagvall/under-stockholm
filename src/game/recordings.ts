import type { AudioOut } from './sfx';

/**
 * Real recordings for the few sounds of people that synthesis could not make
 * believable: a sneeze, a sigh and bottles clinking in a bag. Each file in
 * `public/audio/sfx/` holds a few takes (see its README); a random one plays.
 * A file is fetched the first time it is needed, so only once sound is on.
 */

export type Recording = 'sneeze' | 'sigh' | 'clink';

/** Where each take starts in its file and how long it lasts, in seconds. */
const FILES: Record<Recording, { path: string; takes: Array<[number, number]> }> = {
  sneeze: { path: 'audio/sfx/nysning.mp3', takes: [[0, 1.06], [1.36, 0.93]] },
  sigh: { path: 'audio/sfx/suck.mp3', takes: [[0, 1.1], [1.4, 1.12], [2.82, 1.26]] },
  clink: { path: 'audio/sfx/klirr.mp3', takes: [[0, 0.83], [1.13, 0.77], [2.2, 0.66]] },
};

const loads = new WeakMap<AudioContext, Map<Recording, Promise<AudioBuffer | null>>>();

function load(ctx: AudioContext, name: Recording): Promise<AudioBuffer | null> {
  let byName = loads.get(ctx);
  if (!byName) loads.set(ctx, (byName = new Map()));
  const cached = byName.get(name);
  if (cached) return cached;
  const path = FILES[name].path;
  const loading = fetch(`${import.meta.env.BASE_URL}${path}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return ctx.decodeAudioData(await response.arrayBuffer());
    })
    .catch((error: unknown) => { console.warn('Recording could not load', path, error); return null; });
  byName.set(name, loading);
  return loading;
}

/** Plays one take of a recording into `dest`, `delay` seconds from now (counted from the call, even on the first load). */
export function playRecording(out: AudioOut, dest: AudioNode, name: Recording, volume: number, delay = 0): void {
  const ctx = out.ctx;
  const at = ctx.currentTime + delay;
  const takes = FILES[name].takes;
  const [start, duration] = takes[Math.floor(Math.random() * takes.length)];
  void load(ctx, name).then((buffer) => {
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(dest);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start(Math.max(at, ctx.currentTime), start, duration);
  });
}
