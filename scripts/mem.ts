// Memory leaks, caught by a machine: `bun scripts/mem.ts` (with `bun run dev` running).
// Chrome runs headless on the GPU, or SwiftShader in CI, and the game is driven through `__us` (`?debug`). Each scenario is run
// a couple of times to warm up (first builds fill caches that are meant to stay), then measured over more rounds:
// - GPU objects: every geometry and texture uploaded after the warm-up must be freed again or still be in use (in
//   the scene, or on a train out of service). One left over is a leak, however small.
// - Canvases alive after garbage collection, the JS heap, Blink's own heap (canvas text caches live there), DOM nodes
//   and event listeners may only grow within a small margin.
// It fails (exit code 1) if any scenario leaks. When it does, the `three-webgl-game` skill has the workflow for
// finding out why with heap snapshots.
// Options: --url http://localhost:5180/ (default), --rounds 6, --scene <part of a name>, --json <file> (the growth
// per scenario, for `scripts/check.ts`).
// It reads three.js's own listener names (onGeometryDispose, onTextureDispose), so it needs the dev server's
// unminified code, like `bun run fps`.

import puppeteer, { type CDPSession, type Page } from 'puppeteer-core';
import { CHROME, GPU_ARGS, SOFTWARE_GL } from './chrome';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = process.argv[i + 1];
  if (!value || value.startsWith('--')) throw new Error(`--${name} needs a value`);
  return value;
};
const BASE = arg('url', 'http://localhost:5180/');
const ROUNDS = Number(arg('rounds', '6'));
const SCENE = arg('scene', '');
const JSON_OUT = arg('json', '');
if (!Number.isSafeInteger(ROUNDS) || ROUNDS < 1) throw new Error('--rounds must be a positive integer');

/** How much may grow over all measured rounds before it counts as a leak. */
const MARGIN = { heapMB: 10, blinkMB: 10, canvases: 6, nodes: 80, listeners: 30 };

interface Scenario {
  name: string;
  /** One round, run in the page: an async function body with `__us` and the helpers below in scope. */
  round: string;
}

// Helpers defined in the page before the rounds: `step()` runs bounded batches, `settle()` waits for builds, `wait(ms)`.
const SCENARIOS: Scenario[] = [
  // Out along the branches and back: stations are built on the way and taken down again far behind.
  { name: 'Travelling the network', round: 'for (const i of [11, 23, 94, 0]) { __us.goto(i); await settle(); }' },
  // A life on the blue line: the time machine changes the trains' stock, and the reflections in the windows with it.
  {
    name: 'A life on the blue line',
    round: `__us.lifeScene(0); await wait(900); await step(4, 15);
      for (let i = 1; i < 8; i++) { __us.lifeScene(i); await step(4, 15); }
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', key: 'x' })); await wait(300);
      await step(1, 15); __us.goto(0); await settle();`,
  },
  // Into the driver's cab and out again.
  {
    name: 'Driving and stopping',
    round: `__us.drive(); await wait(1200); await step(20, 15);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', key: 'k' })); await wait(1200);
      await step(2, 15); __us.goto(0); await settle();`,
  },
];
const scenarios = SCENARIOS.filter((scenario) => !SCENE || scenario.name.toLowerCase().includes(SCENE.toLowerCase()));
if (!scenarios.length) throw new Error(`No leak scenario matches "${SCENE}"`);

/** Hooks three.js and the canvases in the page, so what is uploaded, freed and still alive can be counted. */
const TRACK = `(() => {
  const scene = __us.world.group.parent;
  let mesh; scene.traverse((o) => { if (!mesh && o.geometry) mesh = o; });
  let geometry = Object.getPrototypeOf(mesh.geometry);
  while (!Object.prototype.hasOwnProperty.call(geometry, 'setAttribute')) geometry = Object.getPrototypeOf(geometry);
  let texture; scene.traverse((o) => { if (!texture && o.material?.map) texture = o.material.map; });
  let tex = Object.getPrototypeOf(texture);
  while (tex.constructor.name !== 'Texture') tex = Object.getPrototypeOf(tex);
  const dispatcher = Object.getPrototypeOf(geometry);
  const t = { geometries: new Set(), textures: new Set(), on: false };
  window.__mem = t;
  const add = dispatcher.addEventListener;
  dispatcher.addEventListener = function (type, fn) {
    if (t.on && type === 'dispose') {
      if (this.isBufferGeometry && fn.name === 'onGeometryDispose') t.geometries.add(this);
      else if (this.isTexture && fn.name === 'onTextureDispose') t.textures.add(this);
    }
    return add.call(this, type, fn);
  };
  const freeGeometry = geometry.dispose;
  geometry.dispose = function () { t.geometries.delete(this); return freeGeometry.call(this); };
  const freeTexture = tex.dispose;
  tex.dispose = function () { t.textures.delete(this); return freeTexture.call(this); };
})()`;

/** What was uploaded while tracking and is neither freed nor reachable: in the scene, or on a train that is not. */
const ORPHANS = `(() => {
  const seen = new Set(), geometries = new Set(), textures = new Set();
  const walk = (o) => {
    if (!o || !o.isObject3D || seen.has(o)) return;
    seen.add(o);
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [o.material].flat()) if (m) for (const k in m) if (m[k]?.isTexture) textures.add(m[k]);
    for (const c of o.children) walk(c);
  };
  walk(__us.world.group.parent);
  for (const s of __us.services) walk(s.train.group);
  for (const holder of [__us.driver, __us.silver]) if (holder) for (const v of Object.values(holder)) walk(v?.group ?? v);
  const where = (o) => o.name || o.type;
  const g = [...__mem.geometries].filter((x) => !geometries.has(x));
  const t = [...__mem.textures].filter((x) => !textures.has(x));
  return { geometries: g.length, textures: t.length, sample: [...g, ...t].slice(0, 5).map(where) };
})()`;

interface Sample { heapMB: number; blinkMB: number; canvases: number; nodes: number; listeners: number }
/** What `--json` writes: per scenario, how much each count grew over the measured rounds, and what was left on the GPU. */
export type MemReport = Record<string, Sample & { orphans: number; leak: boolean }>;
const report: MemReport = {};

async function sample(page: Page, cdp: CDPSession): Promise<Sample> {
  for (let i = 0; i < 2; i++) await cdp.send('HeapProfiler.collectGarbage');
  // WeakRefs are only cleared after the task that made them: let one pass, and collect again.
  await new Promise((r) => setTimeout(r, 200));
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number; embedderHeapUsedSize?: number };
  const dom = (await cdp.send('Memory.getDOMCounters')) as { nodes: number; jsEventListeners: number };
  const canvases = (await page.evaluate('window.__canvases.filter((r) => r.deref()).length')) as number;
  return { heapMB: heap.usedSize / 1e6, blinkMB: (heap.embedderHeapUsedSize ?? 0) / 1e6, canvases, nodes: dom.nodes, listeners: dom.jsEventListeners };
}

async function start(page: Page): Promise<void> {
  const url = new URL(BASE);
  url.searchParams.set('debug', '');
  url.searchParams.set('clock', '12:00');
  // The dev server may reload the page once while it prepares its modules, so start over if that happens.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url.toString(), { waitUntil: 'load' });
      await new Promise((r) => setTimeout(r, 1500));
      await page.click('#start');
      await page.waitForFunction('window.__us && window.__us.world', { timeout: 120_000 });
      break;
    } catch (err) {
      if (attempt >= 2) throw err;
    }
  }
  await new Promise((r) => setTimeout(r, 2000));
  await page.evaluate(`
    window.wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // Let Chrome present between small CPU-rendered batches rather than queue thousands of draws in one task.
    if (${SOFTWARE_GL}) __us.renderer.setAnimationLoop(null);
    window.step = async (seconds, rate) => {
      if (!${SOFTWARE_GL}) {
        __us.step(seconds, rate);
        // Queued builds may be waiting for same-origin map data, which cannot arrive during a synchronous round.
        await wait(0);
        return;
      }
      for (let left = Math.ceil(seconds * rate); left > 0;) {
        const count = Math.min(left, 5);
        __us.step(count / rate, rate);
        const gl = __us.renderer.getContext();
        if (gl.isContextLost()) throw new Error('WebGL context lost during the leak scenario');
        gl.flush();
        left -= count;
        await new Promise(requestAnimationFrame);
      }
    };
    window.settle = async () => {
      const w = __us.world; let n = 0;
      // Check after each CPU-rendered frame, not after twenty expensive draws of an already finished build.
      const seconds = ${SOFTWARE_GL} ? 1 / 20 : 1;
      do { await step(seconds, 20); n++; } while (w.hasPendingBuild(__us.player.feet.x) && n < 120 / seconds);
      if (w.hasPendingBuild(__us.player.feet.x)) throw new Error('World did not settle after 120 simulated seconds');
    };
  `);
  await page.evaluate(TRACK);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [...GPU_ARGS, '--autoplay-policy=no-user-gesture-required'],
  // CPU rendering is slower, but an unfinished round must still fail within a bounded time.
  protocolTimeout: SOFTWARE_GL ? 10 * 60_000 : undefined,
});
const VIEWPORT = SOFTWARE_GL ? { width: 320, height: 180 } : { width: 1280, height: 720 };
let failed = false;
try {
  console.log('scenario'.padEnd(26), 'heap MB', '   blink MB', '  canvases', '   nodes', ' listeners', '  GPU left over');
  for (const scenario of scenarios) {
    // A fresh page per scenario, so one's leftovers never count against the next.
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    page.on('error', (err) => console.error(`  ${scenario.name}: Chrome page crashed: ${err.message}`));
    page.on('pageerror', (err) => console.error(`  ${scenario.name}: page error: ${String(err)}`));
    await page.evaluateOnNewDocument(() => {
      const refs: Array<WeakRef<HTMLCanvasElement>> = [];
      (window as unknown as { __canvases: typeof refs }).__canvases = refs;
      const create = document.createElement.bind(document);
      document.createElement = ((tag: string, options?: ElementCreationOptions) => {
        const el = create(tag, options);
        if (tag.toLowerCase() === 'canvas') refs.push(new WeakRef(el as HTMLCanvasElement));
        return el;
      }) as typeof document.createElement;
    });
    const cdp = await page.createCDPSession();
    const started = performance.now();
    await start(page);
    const size = await page.evaluate('`${__us.renderer.domElement.width}x${__us.renderer.domElement.height}`');
    console.log(`  ${scenario.name}: started in ${((performance.now() - started) / 1000).toFixed(1)} s, ${SOFTWARE_GL ? 'CPU' : 'GPU'}, drawing ${size}`);
    const round = `(async () => { ${scenario.round} })()`;
    for (let i = 0; i < 2; i++) {
      const at = performance.now();
      await page.evaluate(round);
      console.log(`  ${scenario.name}: warm-up ${i + 1}/2, ${((performance.now() - at) / 1000).toFixed(1)} s`);
    }
    const before = await sample(page, cdp);
    await page.evaluate('__mem.on = true');
    for (let i = 0; i < ROUNDS; i++) {
      const at = performance.now();
      await page.evaluate(round);
      console.log(`  ${scenario.name}: round ${i + 1}/${ROUNDS}, ${((performance.now() - at) / 1000).toFixed(1)} s`);
    }
    await page.evaluate('__mem.on = false');
    const after = await sample(page, cdp);
    const orphans = (await page.evaluate(ORPHANS)) as { geometries: number; textures: number; sample: string[] };
    const grew = (k: keyof Sample) => after[k] - before[k];
    const bad = [
      orphans.geometries + orphans.textures > 0 && 'GPU objects left over',
      grew('heapMB') > MARGIN.heapMB && 'JS heap',
      grew('blinkMB') > MARGIN.blinkMB && 'Blink heap',
      grew('canvases') > MARGIN.canvases && 'canvases',
      grew('nodes') > MARGIN.nodes && 'DOM nodes',
      grew('listeners') > MARGIN.listeners && 'event listeners',
    ].filter(Boolean);
    const change = (k: keyof Sample, digits = 0) => `${before[k].toFixed(digits)}→${after[k].toFixed(digits)}`;
    console.log(scenario.name.padEnd(26), change('heapMB').padStart(9), change('blinkMB').padStart(11), change('canvases').padStart(11), change('nodes').padStart(9), change('listeners').padStart(10), `  ${orphans.geometries} geo, ${orphans.textures} tex`);
    report[scenario.name] = { heapMB: grew('heapMB'), blinkMB: grew('blinkMB'), canvases: grew('canvases'), nodes: grew('nodes'), listeners: grew('listeners'), orphans: orphans.geometries + orphans.textures, leak: bad.length > 0 };
    if (bad.length) {
      failed = true;
      console.log(`  LEAK over ${ROUNDS} rounds: ${bad.join(', ')}${orphans.sample.length ? ` (left over: ${orphans.sample.join(', ')})` : ''}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
if (JSON_OUT) await Bun.write(JSON_OUT, JSON.stringify(report, null, 2));
if (failed) process.exit(1);
console.log(`\nNo leaks over ${ROUNDS} rounds.`);
