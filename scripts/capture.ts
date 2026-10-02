// Films the game for the README clip and the videos (`readme-clip.ts`, `launch-video.ts`): headless Chrome on this
// computer's GPU, with the game's own loop held so only `__us.step` (`?debug`) moves the world, one frame at a time.
// However slow a frame is to capture, the film runs smoothly. Captions and fades are drawn onto each frame in the page.
// Needs `bun run dev` running.
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { CHROME, GPU_ARGS } from './chrome';

export interface Scene {
  name: string;
  /** The game (`__us`), the whole network (`__net`, `?natet`) or a card of text on black. */
  view: 'game' | 'network' | 'card';
  /** Run in the page with the live loop going, so what lies near gets built: places the camera. */
  place?: string;
  /** Run in the page once the loop is held, just before the first frame: sets the clock and the weather. */
  start?: string;
  /** Run in the page before every frame, with `f` the frame's index in the scene. */
  each?: string;
  /** Seconds of film. */
  seconds: number;
  /** How much faster than the game this scene runs, instead of the film's. */
  speed?: number;
  /** A sign in the corner, and a line under it; on a card, the card's text. */
  caption?: [string, string?];
  /** Seconds into the scene the caption comes in, 0.3 by default. */
  captionAt?: number;
  /** Seconds of fade from black at the start and to black at the end, none by default. */
  fadeIn?: number;
  fadeOut?: number;
}

export interface Film {
  /** Frames a second in the film. */
  fps: number;
  /** How much faster than the game the film runs. */
  speed: number;
  /** The page's size; frames are drawn at twice this. */
  width: number;
  height: number;
  /** Where the frames go, as 00000.png on. */
  dir: string;
  /** Only the first frame of each scene, to set up the shots. */
  stills?: boolean;
  /** Only the scenes whose names contain this. */
  only?: string;
  url?: string;
}


// Helpers for the scenes, in the page: `stand` places the camera, `before` sets the clock a little before the next
// train on a track reaches a station, `station` finds a station by name, `clock` sets the time of day in Stockholm,
// on the same day.
const HELPERS = `
  window.__stand = (x, y, z, yaw, pitch = 0) => {
    __us.player.teleport(__us.player.feet.clone().set(x, y, z), yaw);
    __us.player.pitch = pitch;
    __us.world.ensureBuilt(x);
  };
  // On to lead seconds before a train comes into a station on a track: any line's, or at a station two lines share, the given line's.
  window.__before = (station, track, lead, line) => {
    const next = __us.operations.nextArrival(__us.time, station, track, 1800, line);
    if (next) __us.time += next.eta - lead;
  };
  window.__station = (name) => __us.world.stations.findIndex((s) => s.name === name);
  window.__clock = (h, m) => {
    const [hh, mm, ss] = new Date(__us.time * 1000).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm' }).split(':').map(Number);
    __us.time += (h - hh) * 3600 + (m - mm) * 60 - ss;
  };
`;

// Draws a frame: the view (or black), a fade, and a caption in the landing page's sign style: white capitals on
// SL blue over a yellow rule, and a line in the departure boards' amber under it. A card centers them, larger.
const COMPOSE = `
  window.__compose = (source, dark, caption, sub, alpha, card) => {
    const w = source ? source.width : window.__w, h = source ? source.height : window.__h;
    const c = (window.__canvas ??= document.createElement('canvas'));
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    if (source) g.drawImage(source, 0, 0);
    if (dark > 0) { g.fillStyle = 'rgba(0,0,0,' + dark + ')'; g.fillRect(0, 0, w, h); }
    if (caption && alpha > 0 && !card) {
      // A shade rising from the bottom, so the caption reads over a bright floor too.
      const shade = g.createLinearGradient(0, h * 0.55, 0, h);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,' + 0.6 * alpha + ')');
      g.fillStyle = shade;
      g.fillRect(0, h * 0.55, w, h * 0.45);
    }
    if (caption && alpha > 0) {
      const font = 'system-ui, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';
      // Sized by the frame's shorter side, large enough to read on a phone in a feed, and shrunk to fit its width.
      const short = Math.min(w, h), room = w * 0.9;
      const text = caption.toUpperCase();
      let size = short * (card ? 0.075 : 0.058);
      g.save();
      g.globalAlpha = alpha;
      g.font = '600 ' + size + 'px ' + font;
      let tw = g.measureText(text).width;
      if (tw + size * 1.8 > room) {
        size *= room / (tw + size * 1.8);
        g.font = '600 ' + size + 'px ' + font;
          tw = g.measureText(text).width;
      }
      const padX = size * 0.9, padY = size * 0.55, rule = size * 0.2;
      const bw = tw + padX * 2, bh = size + padY * 2;
      // Rises a little as it fades in.
      const lift = (1 - alpha) * h * 0.012;
      const x = card ? (w - bw) / 2 : w * 0.05;
      const y = (card ? h * 0.42 - bh / 2 : h * 0.8 - bh) + lift;
      g.shadowColor = 'rgba(36, 73, 166, 0.6)';
      g.shadowBlur = size * 1.4;
      const grad = g.createLinearGradient(0, y, 0, y + bh);
      grad.addColorStop(0, '#2449a6'); grad.addColorStop(0.55, '#1b3a8f'); grad.addColorStop(1, '#183482');
      g.fillStyle = grad;
      g.fillRect(x, y, bw, bh);
      g.shadowBlur = 0;
      g.fillStyle = '#f2c200';
      g.fillRect(x, y + bh, bw, rule);
      g.fillStyle = '#fff';
      g.textBaseline = 'middle';
      g.fillText(text, x + padX, y + bh / 2 + size * 0.04);
      if (sub) {
        const s2 = short * (card ? 0.04 : 0.042);
        g.font = '600 ' + s2 + 'px ' + font;
        g.fillStyle = '#ffb444';
        g.shadowColor = 'rgba(0, 0, 0, 0.9)';
        g.shadowBlur = s2 * 0.7;
        // Broken into lines that fit the frame.
        const lines = [];
        for (const word of sub.split(' ')) {
          const last = lines[lines.length - 1];
          if (last !== undefined && g.measureText(last + ' ' + word).width <= room) lines[lines.length - 1] = last + ' ' + word;
          else lines.push(word);
        }
        lines.forEach((line, i) => {
          const sw = g.measureText(line).width;
          g.fillText(line, card ? (w - sw) / 2 : x + 2, y + bh + rule + s2 * (1.2 + i * 1.25));
        });
      }
      g.restore();
    }
    // A mouse pointer, and the name of the station under it in the view's own label style.
    const p = window.__pointer;
    if (p) {
      const k = Math.min(w, h) / 540;
      g.save();
      if (p.label) {
        g.font = '700 ' + 14 * k + 'px system-ui, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';
        g.fillStyle = '#ffb444';
        g.shadowColor = '#000';
        g.shadowBlur = 8 * k;
        g.fillText(p.label, p.x + 16 * k, p.y - 8 * k);
      }
      g.translate(p.x, p.y);
      g.scale(k * (p.press ? 0.88 : 1), k * (p.press ? 0.88 : 1));
      g.shadowColor = 'rgba(0,0,0,0.5)';
      g.shadowBlur = 4;
      g.beginPath();
      g.moveTo(0, 0); g.lineTo(0, 17); g.lineTo(4.2, 13); g.lineTo(7.2, 19.5); g.lineTo(9.8, 18.4); g.lineTo(6.9, 12); g.lineTo(12.4, 12);
      g.closePath();
      g.fillStyle = '#fff';
      g.fill();
      g.shadowBlur = 0;
      g.lineWidth = 1.2;
      g.strokeStyle = '#000';
      g.stroke();
      g.restore();
    }
    return c.toDataURL('image/png');
  };
`;

async function open(page: Page, view: 'game' | 'network', base: string): Promise<void> {
  const url = new URL(base);
  url.search = view === 'game' ? 'debug&t=0&weather=clear' : 'natet&debug';
  // The dev server may reload the page once while it prepares its modules, so start over if that happens.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url.toString(), { waitUntil: 'load' });
      await new Promise((r) => setTimeout(r, 1500));
      if (view === 'game') await page.click('#start');
      await page.waitForFunction(view === 'game' ? 'window.__us' : 'window.__net', { timeout: 120_000 });
      await page.evaluate(HELPERS + COMPOSE);
      return;
    } catch (err) {
      if (attempt >= 2) throw err;
    }
  }
}

/** A browser with the game's loop held on demand (`__hold`, `__release()`), passengers on, at the film's size. */
export async function studio(film: Film): Promise<{ browser: Browser; page: Page }> {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [...GPU_ARGS, '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: film.width, height: film.height, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(() => {
    // Passengers on: the stations look lived in.
    try { localStorage.setItem('under-stockholm:passengers', 'on'); } catch { /* No storage. */ }
    const w = window as unknown as { __hold: boolean; __release(): void };
    const raf = window.requestAnimationFrame.bind(window);
    const held: FrameRequestCallback[] = [];
    w.__hold = false;
    window.requestAnimationFrame = (cb) => raf((t) => (w.__hold ? held.push(cb) : cb(t)));
    w.__release = () => { w.__hold = false; for (const cb of held.splice(0)) raf(cb); };
  });
  return { browser, page };
}

/** Films the scenes into `film.dir`, and returns the page (still open) and each scene's start in seconds of film. */
export async function shoot(scenes: Scene[], film: Film): Promise<{ browser: Browser; page: Page; starts: number[] }> {
  const base = film.url ?? 'http://localhost:5180/';
  rmSync(film.dir, { recursive: true, force: true });
  mkdirSync(film.dir, { recursive: true });
  const { browser, page } = await studio(film);
  const starts: number[] = [];
  let n = 0;
  let opened: 'game' | 'network' | 'blank' | null = null;
  try {
    for (const scene of scenes) {
      starts.push(n / film.fps);
      if (film.only && !scene.name.toLowerCase().includes(film.only.toLowerCase())) continue;
      if (scene.view !== 'card') {
        if (opened !== scene.view) await open(page, (opened = scene.view), base);
        await page.evaluate('__release()');
        if (scene.place) await page.evaluate(scene.place);
        // Time to build what lies near.
        await new Promise((r) => setTimeout(r, 5000));
        await page.evaluate('__hold = true');
        // Full resolution, whatever the adaptive resolution made of the slow frames while building.
        if (scene.view === 'game') await page.evaluate(`__us.renderer.setPixelRatio(2); __us.renderer.setSize(${film.width}, ${film.height}); ${scene.place ?? ''}`);
        if (scene.start) await page.evaluate(scene.start);
      } else if (!opened) {
        await page.goto('about:blank');
        await page.evaluate(COMPOSE);
        opened = 'blank';
      }
      await page.evaluate(`window.__w = ${film.width * 2}; window.__h = ${film.height * 2};`);
      const dt = (scene.speed ?? film.speed) / film.fps;
      const count = film.stills ? 1 : Math.round(scene.seconds * film.fps);
      const at = scene.captionAt ?? 0.3;
      for (let f = 0; f < count; f++) {
        const t = f / film.fps;
        const left = scene.seconds - t;
        const dark = film.stills ? 0 : Math.max(0, scene.fadeIn ? 1 - t / scene.fadeIn : 0, scene.fadeOut ? 1 - left / scene.fadeOut : 0);
        // The caption eases in over half a second and out with the scene's fade.
        const alpha = film.stills ? 1 : Math.min(1, Math.max(0, (t - at) / 0.5)) * (1 - dark);
        const source = scene.view === 'game' ? `(__us.step(${dt}, ${1 / dt}), __us.renderer.domElement)`
          : scene.view === 'network' ? `(__net.step(${dt}, ${1 / dt}), document.querySelector('.net canvas'))`
          : 'null';
        const expr = `(() => { const f = ${f}; ${scene.each ?? ''}; return __compose(${source}, ${Math.min(1, dark)}, ${JSON.stringify(scene.caption?.[0] ?? null)}, ${JSON.stringify(scene.caption?.[1] ?? null)}, ${alpha}, ${scene.view === 'card'}); })()`;
        const data = (await page.evaluate(expr)) as string;
        const name = film.stills ? `still-${scene.name.toLowerCase().replace(/\W+/g, '-')}.png` : `${String(n++).padStart(5, '0')}.png`;
        await Bun.write(join(film.dir, name), Buffer.from(data.split(',')[1], 'base64'));
      }
      console.log(scene.name, film.stills ? 'still' : `${count} frames`);
    }
  } catch (err) {
    await browser.close();
    throw err;
  }
  return { browser, page, starts };
}

/** Makes an H.264 MP4 of the frames, `width` pixels wide, with a WAV under it if there is one. */
export function mp4(dir: string, fps: number, out: string, audio?: string, width = 1920): void {
  mkdirSync(join(out, '..'), { recursive: true });
  const ffmpeg = Bun.spawnSync(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, '%05d.png'),
    ...(audio ? ['-i', audio] : []),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-vf', `scale=${width}:-2:flags=lanczos`,
    ...(audio ? ['-af', 'loudnorm=I=-15:TP=-1.5:LRA=9', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest'] : []), '-movflags', '+faststart', out], { stderr: 'inherit' });
  if (ffmpeg.exitCode !== 0) throw new Error('ffmpeg failed');
  console.log(`Wrote ${out} (${(Bun.file(out).size / 1024 / 1024).toFixed(1)} MB)`);
}
