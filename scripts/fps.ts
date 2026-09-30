// Real frame rates, measured by a machine instead of a person: `bun scripts/fps.ts` (with `bun run dev` running).
// Chrome runs headless on this computer's own GPU, with the page visible and requestAnimationFrame at the screen's
// rate, so the game plays as it does for a player. Each scene is set up through `__us` (`?debug`), given a few
// seconds to build what lies near, and then timed. The same scenes run again as a phone: a phone's screen and
// touch, and a CPU six times slower (the GPU cannot be slowed, so a real phone draws slower still).
// With `--device`, the scenes also run on an Android phone over USB: Chrome on the phone, driven through adb, with
// the dev server reached through `adb reverse`. That is the only measurement with a phone's real GPU.
// Options: --url http://localhost:5180/ (default), --seconds 6, --only desktop|phone|device, --scene <parts of names, comma separated>,
// --names <whole names, separated by |> (exactly these scenes, as `scripts/check.ts` runs a failed one again),
// --why (what the frames over 50 ms spent their time on), --json <file> (the numbers, for `scripts/check.ts`),
// --device (the phone too).

import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('url', 'http://localhost:5180/');
const SECONDS = Number(arg('seconds', '6'));
const ONLY = arg('only', '');
const SCENES_WANTED = arg('scene', '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
const NAMES_WANTED = arg('names', '').split('|').filter(Boolean);
const JSON_OUT = arg('json', '');
const DEVICE = process.argv.includes('--device') || ONLY === 'device';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

interface Scene {
  name: string;
  /** Run in the page once the game is up; `__us` is the debug handle. */
  set: string;
  /** Meters a second the player is carried along x while the scene is timed, as on a train: stations ahead get built on the way. */
  travel?: number;
  /** How long to time it, instead of the default. */
  seconds?: number;
}

export const SCENES: Scene[] = [
  { name: 'T-Centralen, platform', set: '__us.goto(1)' },
  { name: 'Slussen, open air', set: '__us.goto(32)' },
  { name: 'Gamla stan, over the water', set: '__us.goto(31)' },
  { name: 'City passage, rush hour', set: '__us.city()' },
  { name: 'Kista', set: '__us.goto(9)' },
  // Up out of the exit among the real city (OpenStreetMap's houses and streets round the entrance).
  { name: 'Odenplan, the street', set: "__us.street('Odenplan')" },
  // A minute aboard a real train, as a player rides: through stations, tunnels and, on route 10, the portal.
  { name: 'A minute aboard', set: '__us.goto(1); __us.ride()', seconds: 60 },
  // Out along a branch at train speed, where the stations are built as you come: the stutter test.
  { name: 'Riding out to Akalla', set: '__us.goto(8)', travel: 22 },
  { name: 'Riding out to Hässelby', set: '__us.goto(64)', travel: -22 },
];

interface Profile {
  viewport: { width: number; height: number; deviceScaleFactor: number; isMobile: boolean; hasTouch: boolean } | null;
  cpu: number;
  /** A real phone over USB instead of headless Chrome. */
  device?: boolean;
}

export const PROFILES: Record<string, Profile> = {
  desktop: { viewport: { width: 1512, height: 900, deviceScaleFactor: 2, isMobile: false, hasTouch: false }, cpu: 1 },
  phone: { viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, cpu: 6 },
  device: { viewport: null, cpu: 1, device: true },
};

export interface Result { fps: number; p95: number; slow: number; worst: number; hitches: number; pixelRatio: number; calls: number; triangles: number }
/** What `--json` writes: per profile, per scene. */
export type FpsReport = Record<string, Record<string, Result>>;

/** Frame times over `seconds`, from the page's own requestAnimationFrame, and where the adaptive resolution ended up. */
async function measure(page: Page, seconds: number, travel = 0): Promise<Result> {
  return page.evaluate(async (seconds: number, travel: number) => {
    const deltas: number[] = [];
    const tasks: Array<{ start: number; ms: number; what: string }> = [];
    const w = window as unknown as { __tasks?: typeof tasks };
    w.__tasks = tasks;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.duration < 100) continue;
          const scripts = (e as unknown as { scripts?: Array<{ invoker: string; sourceURL: string; sourceFunctionName: string; duration: number }> }).scripts ?? [];
          const what = scripts.filter((x) => x.duration > 20).map((x) => `${x.invoker} ${x.sourceURL.split('/').pop()?.split('?')[0]}:${x.sourceFunctionName} ${Math.round(x.duration)}ms`).join(' | ');
          tasks.push({ start: Math.round(e.startTime), ms: Math.round(e.duration), what: what || '(no script: rendering, layout or garbage collection)' });
        }
      }).observe({ type: 'long-animation-frame', buffered: false });
    } catch { /* Not supported. */ }
    let last = performance.now();
    const end = last + seconds * 1000;
    const player = (window as unknown as { __us: { player: { feet: { x: number; clone(): { setX(x: number): unknown } }; teleport(p: unknown): void } } }).__us.player;
    await new Promise<void>((done) => {
      const tick = (t: number) => {
        deltas.push(t - last);
        if (travel) player.teleport(player.feet.clone().setX(player.feet.x + (travel * (t - last)) / 1000));
        last = t;
        if (t < end) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
    const sorted = [...deltas].sort((a, b) => a - b);
    const us = (window as unknown as { __us: { renderer: { getPixelRatio(): number; info: { render: { calls: number; triangles: number } } } } }).__us;
    return {
      fps: Math.round((1000 * deltas.length) / deltas.reduce((a, b) => a + b, 0)),
      p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
      slow: Math.round((100 * deltas.filter((d) => d > 20).length) / deltas.length),
      worst: Math.round(sorted[sorted.length - 1]),
      hitches: deltas.filter((d) => d > 50).length,
      pixelRatio: Math.round(us.renderer.getPixelRatio() * 100) / 100,
      calls: us.renderer.info.render.calls,
      triangles: us.renderer.info.render.triangles,
    };
  }, seconds, travel);
}

/** Runs an adb command and returns what it printed; throws with adb's own words when it fails. */
async function adb(...args: string[]): Promise<string> {
  const proc = Bun.spawn(['adb', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  if ((await proc.exited) !== 0) throw new Error(`adb ${args.join(' ')}: ${(err || out).trim()}`);
  return out.trim();
}

const DEVTOOLS_PORT = 9223;

/**
 * Chrome on the Android phone plugged in over USB, reachable through adb: the dev server's port is reversed to the
 * phone (so `localhost` on the phone is this computer), and Chrome's DevTools socket forwarded here. Chrome must be
 * installed; it is started on `about:blank` if it is not running. Needs USB debugging on the phone and adb installed.
 */
async function connectDevice(): Promise<{ browser: Browser; close: () => Promise<void> }> {
  const devices = (await adb('devices')).split('\n').slice(1).filter((l) => l.trim().endsWith('device'));
  if (!devices.length) throw new Error('No Android device over USB (adb devices lists none authorized). Plug one in with USB debugging on, or run without --device.');
  const port = new URL(BASE).port || '80';
  await adb('reverse', `tcp:${port}`, `tcp:${port}`);
  await adb('forward', `tcp:${DEVTOOLS_PORT}`, 'localabstract:chrome_devtools_remote');
  await adb('shell', 'am', 'start', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main', '-d', 'about:blank');
  let browser: Browser | null = null;
  for (let attempt = 0; attempt < 20 && !browser; attempt++) {
    try {
      browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEVTOOLS_PORT}`, defaultViewport: null });
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!browser) throw new Error('Chrome on the phone did not answer on its DevTools socket.');
  const close = async () => {
    await browser!.disconnect();
    await adb('forward', '--remove', `tcp:${DEVTOOLS_PORT}`).catch(() => {});
    await adb('reverse', '--remove', `tcp:${port}`).catch(() => {});
  };
  return { browser, close };
}

async function run(name: string, p: Profile, report: FpsReport): Promise<void> {
  const device = p.device ? await connectDevice() : null;
  const browser = device?.browser ?? await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const page = await browser.newPage();
    if (p.viewport) await page.setViewport(p.viewport);
    if (p.cpu > 1) await (await page.createCDPSession()).send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
    // Passengers on, as the busiest case.
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('under-stockholm:passengers', 'on'); } catch { /* No storage. */ } });
    const url = new URL(BASE);
    url.searchParams.set('debug', '');
    // A fixed weekday morning, not today's: a weekend has fewer trains and people, and would pass or fail the baseline
    // by the day of the week rather than by the code (a Wednesday, with no power cut and no feast).
    url.searchParams.set('clock', '2026-09-23T08:05');
    // The dev server may reload the page once while it prepares its modules, so start over if that happens.
    for (let attempt = 0; ; attempt++) {
      try {
        await page.goto(url.toString(), { waitUntil: 'load' });
        await new Promise((r) => setTimeout(r, 1500));
        await page.click('#start');
        await page.waitForFunction('window.__us', { timeout: 120_000 });
        break;
      } catch (err) {
        if (attempt >= 2) throw err;
      }
    }
    await new Promise((r) => setTimeout(r, 3000));
    // Every scene is timed at the same moment of the timetable, whatever the loading and the warm-up took: which trains
    // are in sight changes from one second to the next, and would otherwise count as a regression or hide one.
    await page.evaluate('window.__fpsBase = Math.floor(__us.time / 60) * 60');
    const size = p.viewport ? `${p.viewport.width}x${p.viewport.height} @${p.viewport.deviceScaleFactor}x, CPU ${p.cpu}x slower` : (await page.evaluate('`${innerWidth}x${innerHeight} @${devicePixelRatio}x, ` + navigator.userAgent.match(/Android[^;)]*/)?.[0]')) as string;
    console.log(`\n${name} (${size})`);
    console.log('scene'.padEnd(30), 'fps', '  p95 ms', ' >20ms', ' worst', ' >50ms', ' pixels', ' calls', ' triangles');
    const results: Record<string, Result> = {};
    for (const scene of SCENES) {
      if (SCENES_WANTED.length && !SCENES_WANTED.some((s) => scene.name.toLowerCase().includes(s))) continue;
      if (NAMES_WANTED.length && !NAMES_WANTED.includes(scene.name)) continue;
      // Aboard, a jump in time would leave the train behind: set it before boarding instead.
      const aboard = scene.set.includes('ride()');
      await page.evaluate('__us.time = __fpsBase');
      await page.evaluate(scene.set);
      // Aboard, the warm-up below lasts as long as the builds take, and the train runs on meanwhile: note the moment of
      // boarding, to go back to it before timing, so the minute always covers the same stretch of line.
      if (aboard) await page.evaluate('window.__fpsAboard = __us.time');
      // Time to build what lies near, and for the resolution to settle: at least four seconds, and on until nothing is
      // left to build within reach, so a scene is timed as a player finds it, whichever scene ran before (on a slow
      // phone the builds around a far station take longer than that).
      await new Promise((r) => setTimeout(r, 4000));
      await page.waitForFunction('!__us.world.building && !__us.world.paused.length', { timeout: 30_000, polling: 250 }).catch(() => {});
      // The warm-up's slow frames may have lowered the resolution: each scene starts at full, so where it ends up is its own.
      await page.evaluate('__us.resetResolution?.()');
      await new Promise((r) => setTimeout(r, 1000));
      await page.evaluate(aboard ? '__us.jump(__fpsAboard)' : '__us.time = __fpsBase + 30');
      await page.evaluate('__us.slowFrames(true)');
      const r = await measure(page, scene.seconds ?? (scene.travel ? SECONDS * 2 : SECONDS), scene.travel);
      results[scene.name] = r;
      const tasks = (await page.evaluate('window.__tasks ?? []')) as Array<{ ms: number; what: string }>;
      if (process.argv.includes('--why')) for (const t of tasks) console.log('    long frame', t.ms, 'ms:', t.what);
      const slow = (await page.evaluate('__us.slowFrames(true)')) as Array<{ ms: number; parts: Record<string, number>; where: string }>;
      if (process.argv.includes('--why')) for (const f of slow.filter((f) => f.ms > 50)) console.log('   ', f.ms, 'ms', f.where, JSON.stringify(f.parts));
      console.log(scene.name.padEnd(30), String(r.fps).padStart(3), String(r.p95).padStart(8), `${r.slow}%`.padStart(6), String(r.worst).padStart(6), String(r.hitches).padStart(6), String(r.pixelRatio).padStart(7), String(r.calls).padStart(6), String(r.triangles).padStart(10));
    }
    report[name] = results;
    if (device) await page.close();
  } finally {
    if (device) await device.close();
    else await browser.close();
  }
}

if (import.meta.main) {
  const report: FpsReport = {};
  for (const [name, profile] of Object.entries(PROFILES)) {
    if (ONLY ? ONLY !== name : profile.device && !DEVICE) continue;
    await run(name, profile, report);
  }
  if (JSON_OUT) await Bun.write(JSON_OUT, JSON.stringify(report, null, 2));
}
