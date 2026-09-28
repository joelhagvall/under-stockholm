// Records the README's opening clip (docs/under-stockholm.webp, an animated WebP: smaller than a GIF and far sharper)
// from the game itself, through `capture.ts`, and with `--video` the same clip as an MP4 with music under it
// (video/under-stockholm.mp4, not committed: GitHub plays a video in a README only when it is uploaded there).
// Needs `bun run dev` running, ffmpeg and libwebp's img2webp (`brew install ffmpeg webp`). Re-run it when the stations
// change their look.
// Options: --url http://localhost:5180/ (default), --stills (one frame per scene, to set up the shots),
// --scene <part of a name>, --encode (make the clip again from the last capture's frames, to tune its size),
// --video.
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mp4, shoot, type Scene } from './capture';
import { renderMusic } from './music';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const VIDEO = process.argv.includes('--video');
const STILLS = process.argv.includes('--stills');
const ENCODE = process.argv.includes('--encode');
/** Frames a second: the WebP keeps it low for its size, the video plays smoothly. */
const FPS = VIDEO ? 30 : 15;
/** How much faster than the game the clip plays: brisk enough to take in at a glance. */
const SPEED = 1.5;
/** WebP quality, 0 to 100. */
const QUALITY = 82;
const OUT_WIDTH = 1280;
const ROOT = join(import.meta.dir, '..');
const OUT = VIDEO ? join(ROOT, 'video', 'under-stockholm.mp4') : join(ROOT, 'docs', 'under-stockholm.webp');
/** The captured frames, kept after a run so `--encode` can make the clip again from them. */
const FRAMES = join(tmpdir(), VIDEO ? 'readme-video-frames' : 'readme-clip-frames');

const SCENES: Scene[] = [
  {
    // Under the blue vines, as a train comes out of the tunnel.
    name: 'T-Centralen',
    view: 'game',
    place: `{ const s = __us.world.stations[1]; __stand(s.cx + 60.5, 1.1, 3.9, Math.PI / 2 - 0.2); }`,
    start: `__before(1, 1, 9);`,
    seconds: 3,
  },
  {
    // Aboard, between stations.
    name: 'Aboard',
    view: 'game',
    place: `__us.goto(1)`,
    start: `__us.ride(); __us.step(3, 15);`,
    seconds: 2,
  },
  {
    // Out in the open at Gamla stan, from the island platform, as a red line train comes in off the bridge.
    name: 'Gamla stan',
    view: 'game',
    place: `{ const s = __us.world.stations[31]; __stand(s.cx - 68, 1.1, 9.3, -Math.PI / 2 + 0.2); }`,
    start: `__before(31, 1, 8, 1);`,
    seconds: 2.7,
  },
  {
    // Every line at its real depth, a day running past, as the camera circles.
    name: 'The whole network',
    view: 'network',
    place: `document.querySelector('.net-day').click(); __net.camera.position.set(-10 + 22, 62, 88);`,
    each: `{ const c = __net.camera.position, a = ${0.004 * (VIDEO ? 0.5 : 1)}, x = c.x + 10; c.x = x * Math.cos(a) - c.z * Math.sin(a) - 10; c.z = x * Math.sin(a) + c.z * Math.cos(a); }`,
    seconds: VIDEO ? 3.2 : 2.3,
    // The view's day runs 1440 times faster than the clock: slower here, or the trains jump between frames and flicker.
    speed: 0.3,
    fadeOut: VIDEO ? 0.8 : 0,
  },
];

function webp(): void {
  mkdirSync(join(OUT, '..'), { recursive: true });
  const small = join(FRAMES, 'small');
  rmSync(small, { recursive: true, force: true });
  mkdirSync(small);
  const scale = Bun.spawnSync(['ffmpeg', '-loglevel', 'error', '-i', join(FRAMES, '%05d.png'), '-vf', `scale=${OUT_WIDTH}:-1:flags=lanczos`, join(small, '%05d.png')], { stderr: 'inherit' });
  if (scale.exitCode !== 0) throw new Error('ffmpeg failed');
  const files = [...new Bun.Glob('*.png').scanSync(small)].sort().map((f) => join(small, f));
  const out = Bun.spawnSync(['img2webp', '-loop', '0', '-lossy', '-q', String(QUALITY), '-m', '6', '-d', String(Math.round(1000 / FPS)), ...files, '-o', OUT], { stdout: 'ignore', stderr: 'inherit' });
  if (out.exitCode !== 0) throw new Error('img2webp failed');
  console.log(`Wrote ${OUT} (${Math.round(Bun.file(OUT).size / 1024)} kB)`);
}

const seconds = SCENES.reduce((sum, s) => sum + s.seconds, 0);
if (!ENCODE) {
  const film = { fps: FPS, speed: SPEED, width: 960, height: 540, dir: FRAMES, stills: STILLS, only: arg('scene', ''), url: arg('url', 'http://localhost:5180/') };
  const { browser, page } = await shoot(SCENES, film);
  try {
    if (VIDEO && !STILLS) {
      // Calm: the chords, the bells and the rail joints, and the arpeggio from the second bar.
      const music = await renderMusic(page, {
        bpm: 100,
        bars: [{ pad: 1, bell: 1, rail: 0.5 }, { pad: 1, bell: 0.8, rail: 0.6, arp: 0.6, bass: 0.5 }, { pad: 1, rail: 0.6, arp: 0.8, bass: 0.6 }, { pad: 1, bell: 1, arp: 0.6, bass: 0.5, rail: 0.5 }, { pad: 1, bell: 1, ring: true }],
        seconds,
        fade: 1.5,
      });
      await Bun.write(join(FRAMES, 'music.wav'), music);
    }
  } finally {
    await browser.close();
  }
}
if (STILLS) console.log(`Stills in ${FRAMES}`);
else if (VIDEO) mp4(FRAMES, FPS, OUT, join(FRAMES, 'music.wav'));
else webp();
