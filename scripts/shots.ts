// Pictures of the stations' platforms, to see at a glance that each still looks like itself: `bun run shots` (with
// `bun run dev` running). Headless Chrome on this computer's GPU goes to each station in a held moment (a fixed
// weekday noon, clear weather, no passengers, the trains out of view) and takes two pictures: along the platform, and
// turned toward a track wall. They go to `shots/now/` (ignored by git: pictures never go in the repository), the run
// before moves to `shots/prev/`, and each line gets a contact sheet, `shots/<line>.png`, with the stations that
// changed since the run before framed in red and listed. A change is only a question: most are meant.
//
//   bun run shots                  every station, about a quarter of an hour
//   bun run shots red              one line's stations (blue, red, green)
//   bun run shots Globen,Kista     these stations
//   bun run shots --url http://localhost:5181/
//
// The pictures are there to be looked at, by a person or by an agent reading the sheets.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { CHROME, GPU_ARGS } from './chrome';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('url', 'http://localhost:5180/');
const OUT = 'shots';
const NOW = join(OUT, 'now');
const PREV = join(OUT, 'prev');
/** The mean difference, 0 to 255 per channel, over which a station counts as changed since the run before. */
const CHANGED = 6;
const WIDTH = 1100;
const HEIGHT = 620;
const wanted = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--url') ?? '';

interface Station { index: number; name: string; line: string }

/** A file name for a station: its line and name, plainly spelled. */
const fileOf = (s: Station, k: 'a' | 'b') => `${s.line}-${s.name.replace(/[^\p{L}\p{N}]+/gu, '_')}-${k}.png`;

async function start(page: Page): Promise<void> {
  const url = new URL(BASE);
  url.searchParams.set('debug', '');
  url.searchParams.set('clock', '2026-09-23T12:00');
  url.searchParams.set('weather', 'clear');
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url.toString(), { waitUntil: 'load' });
      await new Promise((r) => setTimeout(r, 1500));
      await page.click('#start');
      await page.waitForFunction('window.__us', { timeout: 120_000 });
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
    }
  }
  await new Promise((r) => setTimeout(r, 3000));
  // Only the world: no HUD, map or captions.
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas.game-canvas { visibility: visible !important; }' });
}

/** Takes the two pictures of one station, the trains hidden so each run sees the same platform. */
async function shoot(page: Page, s: Station): Promise<void> {
  await page.evaluate(`__us.goto(${s.index})`);
  await new Promise((r) => setTimeout(r, 2500));
  await page.waitForFunction('!__us.world.building && !__us.world.paused.length', { timeout: 30_000, polling: 250 }).catch(() => {});
  const hideTrains = `(() => { for (const t of [...__us.services.map((v) => v.train), __us.silver?.train].filter(Boolean)) t.group.visible = false; })()`;
  await page.evaluate(`(() => { __us.player.pitch = 0.05; ${hideTrains}; })()`);
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: join(NOW, fileOf(s, 'a')) });
  await page.evaluate(`(() => { __us.player.yaw += 1.2; __us.player.pitch = 0.15; ${hideTrains}; })()`);
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: join(NOW, fileOf(s, 'b')) });
}

// The run before becomes the one to compare with; a run of a few stations keeps the rest of the last one.
mkdirSync(OUT, { recursive: true });
if (existsSync(NOW)) {
  rmSync(PREV, { recursive: true, force: true });
  renameSync(NOW, PREV);
}
mkdirSync(NOW, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: [...GPU_ARGS] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });
  // Passengers off, as a new visitor has them: they stand somewhere else every run.
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('under-stockholm:passengers', 'off'); } catch { /* No storage. */ } });
  await start(page);
  const all = (await page.evaluate('__us.world.net.stations.map((s, index) => ({ index, name: s.name, line: __us.world.net.lines[s.line].id }))')) as Station[];
  const names = wanted.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
  const stations = all.filter((s) => s.name !== 'Kymlinge' && (!names.length || names.includes(s.line) || names.includes(s.name.toLowerCase())));
  if (!stations.length) throw new Error(`No station or line called ${wanted}`);
  console.log(`${stations.length} stations`);
  for (const [k, s] of stations.entries()) {
    // Another session's edit may reload the page under us: start again and take the station again.
    for (let tries = 0; ; tries++) {
      try {
        if (!(await page.evaluate('!!window.__us'))) await start(page);
        await shoot(page, s);
        break;
      } catch (err) {
        if (tries >= 2) { console.error(`${s.name}: ${err}`); break; }
        await start(page).catch(() => {});
      }
    }
    if ((k + 1) % 10 === 0) console.log(`  ${k + 1} of ${stations.length}`);
  }
  // A station left out of this run keeps its pictures from the last.
  if (existsSync(PREV)) for (const f of readdirSync(PREV)) if (!existsSync(join(NOW, f))) writeFileSync(join(NOW, f), readFileSync(join(PREV, f)));

  // The contact sheets, drawn in the page: each station's first picture, its name, and a red frame where it changed.
  const changes: Array<[string, number]> = [];
  for (const line of [...new Set(stations.map((s) => s.line))]) {
    const own = all.filter((s) => s.line === line && s.name !== 'Kymlinge' && existsSync(join(NOW, fileOf(s, 'a'))));
    const data = (dir: string, f: string) => (existsSync(join(dir, f)) ? `data:image/png;base64,${readFileSync(join(dir, f)).toString('base64')}` : null);
    const tiles = own.map((s) => ({ name: s.name, now: data(NOW, fileOf(s, 'a'))!, prev: data(PREV, fileOf(s, 'a')), prevB: data(PREV, fileOf(s, 'b')), nowB: data(NOW, fileOf(s, 'b')) }));
    const sheet = await browser.newPage();
    const result = (await sheet.evaluate(async (tiles, CHANGED) => {
      const load = (src: string) => new Promise<HTMLImageElement>((done) => { const i = new Image(); i.onload = () => done(i); i.src = src; });
      /** The mean difference per channel between two pictures, compared small. */
      const differ = async (a: string, b: string | null) => {
        if (!b) return 0;
        const [x, y] = await Promise.all([load(a), load(b)]);
        const c = document.createElement('canvas');
        c.width = 110; c.height = 62;
        const g = c.getContext('2d')!;
        g.drawImage(x, 0, 0, 110, 62);
        const p = g.getImageData(0, 0, 110, 62).data;
        g.drawImage(y, 0, 0, 110, 62);
        const q = g.getImageData(0, 0, 110, 62).data;
        let sum = 0;
        for (let i = 0; i < p.length; i += 4) sum += Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]);
        return sum / (p.length / 4) / 3;
      };
      const W = 440, H = 248, COLS = 4;
      const c = document.createElement('canvas');
      c.width = W * COLS;
      c.height = H * Math.ceil(tiles.length / COLS);
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      const changed: Array<[string, number]> = [];
      for (const [k, t] of tiles.entries()) {
        const x = (k % COLS) * W;
        const y = Math.floor(k / COLS) * H;
        g.drawImage(await load(t.now), x, y, W, H);
        const d = Math.max(await differ(t.now, t.prev), t.nowB ? await differ(t.nowB, t.prevB) : 0);
        g.font = '600 18px system-ui, sans-serif';
        g.fillStyle = '#000';
        g.fillRect(x, y, g.measureText(t.name).width + 14, 26);
        g.fillStyle = '#ffd400';
        g.fillText(t.name, x + 7, y + 19);
        if (d > CHANGED) {
          changed.push([t.name, Math.round(d)]);
          g.strokeStyle = '#e0201a';
          g.lineWidth = 6;
          g.strokeRect(x + 3, y + 3, W - 6, H - 6);
        }
      }
      return { png: c.toDataURL('image/png'), changed };
    }, tiles, CHANGED)) as { png: string; changed: Array<[string, number]> };
    await sheet.close();
    writeFileSync(join(OUT, `${line}.png`), Buffer.from(result.png.split(',')[1], 'base64'));
    changes.push(...result.changed);
    console.log(`${join(OUT, `${line}.png`)}: ${own.length} stations`);
  }
  if (!existsSync(PREV)) console.log('\nThe first run: nothing to compare with yet.');
  else if (changes.length) console.log(`\nChanged since the run before (mean difference, ${CHANGED} and over): ${changes.map(([n, d]) => `${n} ${d}`).join(', ')}`);
  else console.log('\nNothing changed since the run before.');
} finally {
  await browser.close();
}
