// The built landing page's recovery, including the WASM import's cached rejection: one bad asset response must
// reload and reopen the game, while an asset that stays missing must return to the menu without a reload loop.
// Keep the built page's prefetch enabled: also check failures before the click, including a cached HTML response.
// Local files only, with ?debug so no player reports are sent. Run after a build, or through `bun run check`.
import { join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';
import { CHROME, GPU_ARGS } from './chrome';

const dist = join(import.meta.dir, '..', 'dist');
const manifest = await Bun.file(join(dist, '.vite/manifest.json')).json();
if (!manifest['src/game/boot.ts']) {
  console.log('Landing-only build: no game startup to check.');
  process.exit(0);
}

let broken = true;
let persistent = false;
let wasmRequests = 0;
let cachedHtml = false;
let wasmType = 'text/html';
let faultStatus = 404;
const server = Bun.serve({
  port: 0, hostname: '127.0.0.1',
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path.endsWith('.wasm')) {
      wasmRequests++;
      if (broken) {
        broken = persistent;
        return new Response('<!DOCTYPE html><html>missing asset</html>', {
          status: faultStatus,
          headers: { 'content-type': wasmType, 'cache-control': cachedHtml ? 'public, max-age=31536000, immutable' : 'no-store' },
        });
      }
    }
    const file = Bun.file(join(dist, path === '/' ? 'index.html' : path));
    if (!await file.exists()) return new Response('Not found', { status: 404 });
    return new Response(file, { headers: { 'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store' } });
  },
});

let browser: Browser | null = null;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true, args: [...GPU_ARGS],
  });
  const cases: Array<{ name: string; read: boolean; fault: boolean; missing: boolean; cached: boolean; navigations: number; requests: number; mime?: string; status?: number }> = [
    { name: 'a direct click recovers from one HTML response', read: false, fault: true, missing: false, cached: false, navigations: 2, requests: 2 },
    { name: 'a direct click returns to the menu when WASM stays missing', read: false, fault: true, missing: true, cached: false, navigations: 2, requests: 2 },
    { name: 'prefetched WASM is reused by the game without another download', read: true, fault: false, missing: false, cached: false, navigations: 1, requests: 1 },
    { name: 'a failed prefetch does not prevent the next click from starting', read: true, fault: true, missing: false, cached: false, navigations: 1, requests: 2 },
    { name: 'missing WASM after prefetch returns to the menu after one reload', read: true, fault: true, missing: true, cached: false, navigations: 2, requests: 4 },
    { name: 'cached HTML from prefetch is replaced before the game imports it', read: true, fault: true, missing: false, cached: true, navigations: 1, requests: 2 },
    { name: 'cached non-WASM bytes are replaced even with a WASM content type', read: true, fault: true, missing: false, cached: true, navigations: 1, requests: 2, mime: 'application/wasm' },
    { name: 'a cached missing-file response is replaced before the game imports it', read: true, fault: true, missing: false, cached: true, navigations: 1, requests: 2, status: 404 },
    { name: 'persistent cached HTML from prefetch stops after one reload', read: true, fault: true, missing: true, cached: true, navigations: 2, requests: 2 },
  ];
  for (const test of cases) {
    persistent = test.missing;
    broken = test.fault;
    cachedHtml = test.cached;
    wasmType = test.mime ?? 'text/html';
    faultStatus = test.status ?? (test.cached ? 200 : 404);
    wasmRequests = 0;
    // A fresh cache and session per case, so a good WASM file cannot hide the next case's bad response.
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 960, height: 600 });
    let navigations = 0;
    const errors: string[] = [];
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations++; });
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto(`http://127.0.0.1:${server.port}/?debug&clock=2026-09-23T08:05`, { waitUntil: 'load' });
    if (test.read) {
      const response = await page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('.wasm'), { timeout: 30_000 });
      await response.buffer();
      await page.waitForNetworkIdle({ idleTime: 200, timeout: 30_000 });
      if (wasmRequests !== 1 || navigations !== 1 || !await page.evaluate(() => {
        const start = document.querySelector<HTMLButtonElement>('#start');
        return start && !start.disabled && !document.querySelector('#status')?.textContent && !document.querySelector('.game-canvas');
      })) throw new Error(`${test.name}: prefetch must leave the landing page ready for a click`);
    }
    await page.click('#start');
    if (test.missing) {
      await page.waitForFunction(() => {
        const start = document.querySelector<HTMLButtonElement>('#start');
        return start && !start.disabled && !!document.querySelector('#status')?.textContent;
      }, { timeout: 60_000 });
    } else {
      await page.waitForFunction('window.__us || (!document.querySelector("#start").disabled && document.querySelector("#status").textContent)', { timeout: 60_000 });
      if (!await page.evaluate('!!window.__us')) throw new Error(`${test.name}: returned to the menu instead of recovering (${navigations} navigations, ${wasmRequests} WASM requests)`);
    }
    if (navigations !== test.navigations || wasmRequests !== test.requests || errors.length) throw new Error(`${test.name}: expected ${test.navigations} navigations and ${test.requests} WASM requests, got ${navigations} navigations, ${wasmRequests} requests and ${errors.length} unhandled errors: ${errors.join('; ')}`);
    console.log(`  ok   ${test.name}`);
    await context.close();
  }
} finally {
  await browser?.close();
  server.stop(true);
}
