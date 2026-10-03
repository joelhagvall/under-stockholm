// How long it takes from the click to playing, and what the time goes to: `bun scripts/load.ts`, with the production
// build served (`bun run build && bun run serve:prod`), so the files are the real ones, compressed as a host sends them.
// Headless Chrome with an empty cache clicks "Start" and times the download of the game (JavaScript and the physics
// binary), compiling the physics, and building the world behind the loading screen. The screen closes as soon as
// physics, the starting view and its first GPU render are ready. The default uses ?debug for startup diagnostics.
// It runs on a desktop connection and as a phone on Lighthouse's slow 4G with a CPU four times slower.
// Options: --url http://localhost:4173/ (default), --only desktop|phone, --runs 2 (the median is shown),
// --json <file> (the medians, for `scripts/check.ts`), --read 8 (a visitor who reads the landing page that many seconds
// before the click, throttled from the start and with the cache on, so the files it fetches ahead count: not a gate).
// --normal uses the ordinary player start and pause menu instead of ?debug. Not a gate.
// --why prints the startup stages, timed in boot.ts; physics attachment can overlap the world build.

import puppeteer from 'puppeteer-core';
import { CHROME, GPU_ARGS } from './chrome';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('url', 'http://localhost:4173/');
const ONLY = arg('only', '');
const RUNS = Number(arg('runs', '2'));
const JSON_OUT = arg('json', '');
const WHY = process.argv.includes('--why');
const READ = Number(arg('read', '0'));
const NORMAL = process.argv.includes('--normal');

const PROFILES = {
  desktop: { viewport: { width: 1512, height: 900, deviceScaleFactor: 2, isMobile: false, hasTouch: false }, cpu: 1, network: null },
  // Lighthouse's mobile throttling: 1.6 Mbit/s down, 750 kbit/s up, 150 ms round trips.
  phone: { viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, cpu: 4, network: { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 } },
} as const;

export interface Run {
  downloadS: number; bytes: number; wasmBytes: number; wasmDoneS: number; compileS: number; readyS: number;
  stages?: Record<string, number>;
  measurement?: { mode: 'debug' | 'normal'; readS: number; loadingMinimumS: number };
}
/** What `--json` writes: the median run per profile. */
export type LoadReport = Record<string, Run>;

async function once(profile: keyof typeof PROFILES): Promise<Run> {
  const p = PROFILES[profile];
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: [...GPU_ARGS] });
  try {
    const page = await browser.newPage();
    await page.setViewport(p.viewport);
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: !READ });
    // Compiling the physics binary, timed from inside the page.
    await page.evaluateOnNewDocument(() => {
      const w = window as unknown as { __compile: Array<[number, number]> };
      w.__compile = [];
      const time = <T>(fn: (...args: never[]) => Promise<T>) => async (...args: never[]) => {
        const start = performance.now();
        try { return await fn(...args); } finally { w.__compile.push([start, performance.now()]); }
      };
      WebAssembly.instantiateStreaming = time(WebAssembly.instantiateStreaming.bind(WebAssembly)) as typeof WebAssembly.instantiateStreaming;
      WebAssembly.instantiate = time(WebAssembly.instantiate.bind(WebAssembly)) as typeof WebAssembly.instantiate;
      // The moment the loading screen is done; with `?debug` it is taken away at once, too soon to be caught by polling.
      const measured = window as unknown as { __ready?: number; __loadingStart?: number };
      new MutationObserver((changes) => {
        for (const c of changes) {
          for (const node of c.addedNodes) if (node instanceof Element && node.classList.contains('loading')) measured.__loadingStart ??= performance.now();
          if ((c.target as Element).classList?.contains('loading') && (c.target as Element).classList.contains('is-done')) measured.__ready ??= performance.now();
        }
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    });
    const url = new URL(BASE);
    if (NORMAL) url.searchParams.delete('debug');
    else url.searchParams.set('debug', '');
    const throttle = async () => {
      if (p.network) await cdp.send('Network.emulateNetworkConditions', p.network);
      if (p.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
    };
    if (READ) {
      await throttle();
      await page.goto(url.toString(), { waitUntil: 'load' });
      await new Promise((resolve) => setTimeout(resolve, READ * 1000));
    } else {
      await page.goto(url.toString(), { waitUntil: 'networkidle0' });
      // Throttle only from the click on: the landing page is not what is measured.
      await throttle();
    }
    const t0 = (await page.evaluate(() => { const t = performance.now(); document.querySelector<HTMLButtonElement>('#start')!.click(); return t; })) as number;
    await page.waitForFunction(() => (window as unknown as { __ready?: number }).__ready, { timeout: 300_000, polling: 200 });
    return (await page.evaluate((t0: number) => {
      const ready = (window as unknown as { __ready: number }).__ready;
      // Include a fetch begun while reading if it finishes after the click.
      const game = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((e) => e.responseEnd >= t0 && /\/assets\/.+\.(js|wasm)$/.test(e.name));
      const wasm = game.filter((e) => e.name.endsWith('.wasm'));
      const compile = (window as unknown as { __compile: Array<[number, number]> }).__compile.filter(([s]) => s >= t0);
      const s = (ms: number) => ms / 1000;
      const marks = Object.fromEntries(performance.getEntriesByType('mark').filter((e) => e.name.startsWith('us-load:')).map((e) => [e.name.slice(8), e.startTime]));
      const stages: Record<string, number> = {};
      const loadingStart = (window as unknown as { __loadingStart?: number }).__loadingStart;
      if (loadingStart !== undefined) stages['loading screen'] = s(ready - loadingStart);
      for (const [name, from, to] of [
        ['models', 'boot', 'models-done'], ['world', 'world-start', 'world-done'],
        ['physics attachment', 'physics-start', 'physics-done'], ['trains', 'trains-start', 'trains-done'],
        ['scene setup', 'trains-done', 'setup-done'], ['nearby world', 'near-start', 'near-done'],
        ['first render', 'gpu-start', 'gpu-done'],
      ]) if (from in marks && to in marks) stages[name] = s(marks[to] - marks[from]);
      return {
        downloadS: s(Math.max(t0, ...game.map((e) => e.responseEnd)) - t0),
        bytes: game.reduce((sum, e) => sum + e.transferSize, 0),
        wasmBytes: wasm.reduce((sum, e) => sum + e.transferSize, 0),
        wasmDoneS: s(Math.max(t0, ...wasm.map((e) => e.responseEnd)) - t0),
        compileS: s(compile.reduce((sum, [a, b]) => sum + (b - a), 0)),
        readyS: s(ready - t0),
        stages,
      };
    }, t0)) as Run;
  } finally {
    await browser.close();
  }
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const report: LoadReport = {};
if (READ) console.log(`After reading the landing page for ${READ} s, throttled from the start, with the cache on:`);
console.log(`${NORMAL ? 'Normal' : 'Debug'} start: loading screen closes when the game is ready.`);
console.log('profile'.padEnd(9), 'downloaded', '   of it physics', '  physics compiled*', '  playable');
for (const profile of Object.keys(PROFILES) as Array<keyof typeof PROFILES>) {
  if (ONLY && ONLY !== profile) continue;
  const runs: Run[] = [];
  for (let i = 0; i < RUNS; i++) runs.push(await once(profile));
  const m = (k: Exclude<keyof Run, 'stages' | 'measurement'>) => median(runs.map((r) => r[k]));
  report[profile] = { downloadS: m('downloadS'), bytes: m('bytes'), wasmBytes: m('wasmBytes'), wasmDoneS: m('wasmDoneS'), compileS: m('compileS'), readyS: m('readyS') };
  report[profile].stages = Object.fromEntries(Object.keys(runs[0].stages ?? {}).map((name) => [name, median(runs.map((r) => r.stages![name]))]));
  report[profile].measurement = { mode: NORMAL ? 'normal' : 'debug', readS: READ, loadingMinimumS: 0 };
  const kb = (bytes: number) => `${Math.round(bytes / 1000)} kB`;
  console.log(
    profile.padEnd(9),
    `${m('downloadS').toFixed(1)} s ${kb(m('bytes'))}`.padStart(16),
    `${kb(m('wasmBytes'))}, done ${m('wasmDoneS').toFixed(1)} s`.padStart(22),
    `${m('compileS').toFixed(2)} s`.padStart(12),
    `${m('readyS').toFixed(1)} s`.padStart(11),
  );
  if (WHY) for (const [name, seconds] of Object.entries(report[profile].stages!)) console.log(`  ${name.padEnd(20)} ${seconds.toFixed(2)} s`);
}
console.log('* time inside WebAssembly.instantiate, which overlaps the download when it streams');
if (JSON_OUT) await Bun.write(JSON_OUT, JSON.stringify(report, null, 2));
