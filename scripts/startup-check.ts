// The built landing page's recovery, including the WASM import's cached rejection: one bad asset response must
// reload and reopen the game, while an asset that stays missing must return to the menu without a reload loop.
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
const server = Bun.serve({
  port: 0, hostname: '127.0.0.1',
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path.endsWith('.wasm')) {
      wasmRequests++;
      if (broken) {
        broken = persistent;
        return new Response('<!DOCTYPE html><html>missing asset</html>', { status: 404, headers: { 'content-type': 'text/html' } });
      }
    }
    const file = Bun.file(join(dist, path === '/' ? 'index.html' : path));
    return await file.exists() ? new Response(file) : new Response('Not found', { status: 404 });
  },
});

let browser: Browser | null = null;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true, args: [...GPU_ARGS],
  });
  for (const missing of [false, true]) {
    persistent = missing;
    broken = true;
    wasmRequests = 0;
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 600 });
    let navigations = 0;
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations++; });
    await page.goto(`http://127.0.0.1:${server.port}/?debug&clock=2026-09-23T08:05`, { waitUntil: 'load' });
    await page.click('#start');
    if (missing) {
      await page.waitForFunction(() => {
        const start = document.querySelector<HTMLButtonElement>('#start');
        return start && !start.disabled && !!document.querySelector('#status')?.textContent;
      }, { timeout: 60_000 });
    } else {
      await page.waitForFunction('window.__us', { timeout: 60_000 });
    }
    if (navigations !== 2 || wasmRequests !== 2) throw new Error(`Expected one recovery reload and two WASM requests, got ${navigations} navigations and ${wasmRequests} requests`);
    console.log(missing ? '  ok   a persistent missing WASM file returns to the menu after one reload' : '  ok   an HTML response for WASM reloads and reopens the game');
    await page.close();
  }
} finally {
  await browser?.close();
  server.stop(true);
}
