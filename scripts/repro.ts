// Plays the game headless the way a player's report describes, to see an error happen (and, after a fix, not happen):
// `bun run repro`, with `bun run dev` running. Headless Chrome on this machine's GPU, as a phone or a desktop, goes to a
// station, rides the trains for a while in simulated time and records what went wrong: errors thrown in the page,
// errors and warnings logged, a lost WebGL context and a crashed page, with what the game held as it went: the GPU's
// buffers and textures (counted from the WebGL calls), the canvases alive and the JS heap.
//   bun run repro --station Skanstull --profile phone --minutes 10
//   bun run repro --station Akalla --expect "reading 'x'"     exit 1 if a message with that text is seen
//   bun run repro --budget 900                               exit 1 if GPU and canvases together peak above 900 MB
//   --url http://localhost:5181/   --walk (stay on the platform instead of riding)   --json <file> (the record)
// Without --expect any error fails it. Reproduce a group from `bun run errors` with it before a fix, and check with it after.

import puppeteer from 'puppeteer-core';
import { CHROME, GPU_ARGS } from './chrome';

const arg = (name: string, fallback = '') => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const URL_BASE = arg('url', 'http://localhost:5180/');
const STATION = arg('station');
const PROFILE = arg('profile', 'phone');
const MINUTES = Number(arg('minutes', '8'));
const EXPECT = arg('expect');
const BUDGET = Number(arg('budget', '0'));
const JSON_OUT = arg('json');
const WALK = process.argv.includes('--walk');
if (PROFILE !== 'phone' && PROFILE !== 'desktop') throw new Error('--profile is phone or desktop');

const VIEWPORTS = {
  phone: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desktop: { width: 1512, height: 900, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
};

interface Sample { minute: number; gpuMB: number; texturesMB: number; canvasMB: number; canvases: number; heapMB: number; geometries: number; textures: number; where: string }
const events: Array<{ minute: number; kind: string; text: string }> = [];
const samples: Sample[] = [];
let minute = 0;
const note = (kind: string, text: string) => {
  events.push({ minute, kind, text: text.slice(0, 500) });
  console.log(`  ${minute.toFixed(1).padStart(5)} min  ${kind}: ${text.slice(0, 200)}`);
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: [...GPU_ARGS, '--js-flags=--expose-gc'], protocolTimeout: 20 * 60_000 });
let crashed = false;
try {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORTS[PROFILE]);
  if (PROFILE === 'phone') await (await page.createCDPSession()).send('Emulation.setCPUThrottlingRate', { rate: 4 });
  page.on('error', (e) => { crashed = true; note('page crashed', e.message); });
  page.on('pageerror', (e) => note('thrown', String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') note(`console.${m.type()}`, m.text()); });
  // What the page holds, counted from the WebGL calls and the canvases made, so it is known without asking three.js.
  await page.evaluateOnNewDocument(() => {
    const P = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    const buffers = new Map<unknown, number>();
    const textures = new Map<unknown, Map<string, number>>();
    const bound: Record<number, unknown> = {};
    const units: Record<string, unknown> = {};
    let unit = 0;
    const wrap = (name: string, before: (a: unknown[]) => void) => {
      const original = P[name];
      P[name] = function (this: unknown, ...a: unknown[]) { before(a); return original.apply(this, a); };
    };
    const texture = (target: number) => units[`${unit}:${target >= 0x8515 && target <= 0x851a ? 0x8513 : target}`];
    const level = (target: number, lvl: number, bytes: number) => {
      const t = texture(target);
      if (!t) return;
      let levels = textures.get(t);
      if (!levels) textures.set(t, (levels = new Map()));
      levels.set(`${target}:${lvl}`, bytes);
    };
    wrap('bindBuffer', ([t, b]) => { bound[t as number] = b; });
    wrap('bufferData', ([t, d]) => { const b = bound[t as number]; if (b) buffers.set(b, typeof d === 'number' ? d : (d as ArrayBufferView).byteLength); });
    wrap('deleteBuffer', ([b]) => { buffers.delete(b); });
    wrap('activeTexture', ([u]) => { unit = u as number; });
    wrap('bindTexture', ([t, x]) => { units[`${unit}:${t}`] = x; });
    wrap('texImage2D', (a) => {
      if (a.length >= 8) level(a[0] as number, a[1] as number, (a[3] as number) * (a[4] as number) * 4);
      else { const s = a[5] as { width: number; height: number }; level(a[0] as number, a[1] as number, s.width * s.height * 4); }
    });
    wrap('texStorage2D', ([t, levels, , w, h]) => { for (let l = 0; l < (levels as number); l++) level(t as number, l, Math.max(1, (w as number) >> l) * Math.max(1, (h as number) >> l) * 4); });
    wrap('deleteTexture', ([x]) => { textures.delete(x); });
    const canvases: Array<WeakRef<HTMLCanvasElement>> = [];
    const create = document.createElement.bind(document);
    document.createElement = ((tag: string, options?: ElementCreationOptions) => {
      const el = create(tag, options);
      if (tag.toLowerCase() === 'canvas') canvases.push(new WeakRef(el as HTMLCanvasElement));
      return el;
    }) as typeof document.createElement;
    (window as unknown as { __held: () => object }).__held = () => {
      (window as unknown as { gc?: () => void }).gc?.();
      let px = 0;
      let n = 0;
      for (const r of canvases) { const c = r.deref(); if (c && c.width * c.height > 1) { n++; px += c.width * c.height; } }
      let buf = 0;
      for (const v of buffers.values()) buf += v;
      let tex = 0;
      for (const levels of textures.values()) for (const v of levels.values()) tex += v;
      return { gpuMB: (buf + tex) / 1e6, texturesMB: tex / 1e6, canvasMB: px * 4 / 1e6, canvases: n };
    };
  });
  const url = new URL(URL_BASE);
  url.searchParams.set('debug', '');
  await page.goto(url.toString(), { waitUntil: 'load' });
  await page.click('#start');
  await page.waitForFunction('window.__us && window.__us.world', { timeout: 180_000 });
  // The canvas reports a lost context as an event, not as an error.
  await page.evaluate(() => {
    const canvas = (window as unknown as { __us: { renderer: { domElement: HTMLCanvasElement } } }).__us.renderer.domElement;
    canvas.addEventListener('webglcontextlost', () => console.error('webglcontextlost'));
  });
  const sample = async () => {
    const s = await page.evaluate(() => {
      const u = (window as unknown as { __us: any }).__us;
      const held = (window as unknown as { __held: () => { gpuMB: number; texturesMB: number; canvasMB: number; canvases: number } }).__held();
      const m = u.renderer.info.memory;
      return { ...held, heapMB: ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e6, geometries: m.geometries, textures: m.textures, where: u.world.nearestStation(u.player.feet.x).name };
    });
    samples.push({ minute, ...s });
    console.log(`  ${minute.toFixed(1).padStart(5)} min  ${s.where.padEnd(18)} GPU ${s.gpuMB.toFixed(0).padStart(4)} MB (textures ${s.texturesMB.toFixed(0)}), canvases ${s.canvases} ${s.canvasMB.toFixed(0)} MB, heap ${s.heapMB.toFixed(0)} MB, ${s.geometries} geometries, ${s.textures} textures`);
  };
  const run = (seconds: number) => page.evaluate(async (seconds) => {
    const u = (window as unknown as { __us: { step(s: number, r: number): void } }).__us;
    for (let left = seconds * 15; left > 0; left -= 5) { u.step(5 / 15, 15); await new Promise(requestAnimationFrame); }
  }, seconds);
  console.log(`Repro on ${URL_BASE} as a ${PROFILE}${STATION ? ` at ${STATION}` : ''}, ${MINUTES} simulated minutes ${WALK ? 'on the platform' : 'riding'}`);
  if (STATION) {
    const i = await page.evaluate((name) => (window as unknown as { __us: { world: { stations: Array<{ name: string }> } } }).__us.world.stations.findIndex((s) => s.name.toLowerCase() === name.toLowerCase()), STATION);
    if (i < 0) throw new Error(`No station called ${STATION}`);
    await page.evaluate((i) => (window as unknown as { __us: { goto(i: number): void } }).__us.goto(i), i);
  }
  await run(5);
  await sample();
  if (!WALK) await page.evaluate(() => (window as unknown as { __us: { ride(): void } }).__us.ride());
  for (minute = 0; minute < MINUTES && !crashed;) {
    await run(60);
    minute++;
    await sample();
  }
} catch (err) {
  note('repro failed', String(err));
} finally {
  await browser.close();
}

const peak = samples.reduce((most, s) => Math.max(most, s.gpuMB + s.canvasMB), 0);
const errors = events.filter((e) => e.kind !== 'console.warn');
const seen = EXPECT ? events.filter((e) => e.text.includes(EXPECT)) : errors;
const overBudget = BUDGET > 0 && peak > BUDGET;
if (JSON_OUT) await Bun.write(JSON_OUT, JSON.stringify({ station: STATION, profile: PROFILE, minutes: MINUTES, peakMB: peak, events, samples }, null, 2));
console.log(`\nPeak held: ${peak.toFixed(0)} MB on the GPU and in canvases${BUDGET ? ` (budget ${BUDGET} MB)` : ''}.`);
console.log(EXPECT ? `${seen.length ? 'Seen' : 'Not seen'}: "${EXPECT}" (${seen.length} times).` : `${errors.length} errors.`);
process.exit(seen.length || overBudget ? 1 : 0);
