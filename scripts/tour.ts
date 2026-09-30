// A walk through every station, from the platform up to the street: `bun run tour` (with `bun run dev` running).
// Where `bun run shots` looks at the platforms, this looks at the rest: headless Chrome on this computer's GPU goes to
// each station in a held moment (a fixed weekday noon, clear weather, no passengers, the trains out of view) and takes
// the platform twice, each ticket hall toward its way out and back toward the gates, and the street out of each hall
// looking out, back at the entrance and to the side. The pictures go to `shots/tour/now/` (ignored by git), the run
// before moves to `shots/tour/prev/`, and each station gets a sheet of its pictures, `shots/tour/<line>-<station>.png`,
// with those that changed since the run before framed in red. As with the shots, a change is only a question.
//
//   bun run tour                   every station, about three quarters of an hour
//   bun run tour red               one line's stations (blue, red, green)
//   bun run tour Globen,Kista      these stations
//   bun run tour --url http://localhost:5181/
//
// What to look for: black where sky or a room should be (a doorway, the top of a flight of stairs), ground that
// flickers, houses standing in the stairs or the square, a street that never came, signs that name the wrong street.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('url', 'http://localhost:5180/');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = join('shots', 'tour');
const NOW = join(OUT, 'now');
const PREV = join(OUT, 'prev');
/** The mean difference, 0 to 255 per channel, over which a picture counts as changed since the run before. */
const CHANGED = 6;
const WIDTH = 1100;
const HEIGHT = 620;
const wanted = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--url') ?? '';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Station { index: number; name: string; line: string; halls: number }

/** A file name for one of a station's pictures: its line, its name plainly spelled, and what it shows. */
const fileOf = (s: Station, what: string) => `${s.line}-${s.name.replace(/[^\p{L}\p{N}]+/gu, '_')}-${what}.png`;

async function start(page: Page): Promise<void> {
  const url = new URL(BASE);
  url.searchParams.set('debug', '');
  url.searchParams.set('clock', '2026-09-23T12:00');
  url.searchParams.set('weather', 'clear');
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url.toString(), { waitUntil: 'load' });
      await sleep(1500);
      await page.click('#start');
      await page.waitForFunction('window.__us', { timeout: 120_000 });
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
    }
  }
  await sleep(3000);
  // Only the world: no HUD, map or captions.
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas.game-canvas { visibility: visible !important; }' });
}

/** Waits until nothing near is left to build: a street's city comes when its file does. */
async function settle(page: Page, ms: number): Promise<void> {
  await sleep(ms);
  await page.waitForFunction('!__us.world.building && !__us.world.paused.length', { timeout: 40_000, polling: 250 }).catch(() => {});
  await sleep(400);
}

const HIDE_TRAINS = `for (const t of [...__us.services.map((v) => v.train), __us.silver?.train].filter(Boolean)) t.group.visible = false;`;

/** Takes one station's pictures: the platform, then each hall and the street out of it. */
async function shoot(page: Page, s: Station): Promise<string[]> {
  const taken: string[] = [];
  const snap = async (what: string, look: string) => {
    await page.evaluate(`(() => { ${look}; ${HIDE_TRAINS} })()`);
    await page.evaluate('__us.step(0.1, 30)');
    await sleep(250);
    const file = fileOf(s, what);
    await page.screenshot({ path: join(NOW, file) });
    taken.push(file);
  };
  await page.evaluate(`__us.goto(${s.index})`);
  await settle(page, 2500);
  await snap('platform-a', '__us.player.pitch = 0.05');
  await snap('platform-b', '__us.player.yaw += 1.2; __us.player.pitch = 0.15');
  for (let k = 0; k < s.halls; k++) {
    // In the middle of the hall, facing its way out.
    await page.evaluate(`(() => {
      const h = __us.world.stations[${s.index}].halls[${k}];
      __us.player.teleport(__us.player.feet.clone().set((h.bounds.x0 + h.bounds.x1) / 2, h.bounds.y + 0.2, 0), h.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    })()`);
    await settle(page, 1200);
    await snap(`hall${k}-out`, '__us.player.pitch = 0.05');
    await snap(`hall${k}-in`, '__us.player.yaw += Math.PI; __us.player.pitch = 0.05');
    // Up on the street, twice: the city round an exit is built once the player is near it.
    await page.evaluate(`__us.street(${s.index}, ${k})`);
    await settle(page, 2500);
    await page.evaluate(`__us.street(${s.index}, ${k})`);
    await page.evaluate('__us.step(0.5, 30)');
    await settle(page, 800);
    const where = (await page.evaluate('__us.info().where.area')) as string;
    if (where !== 'street' && where !== 'hall') console.log(`  ${s.name}, hall ${k}: up on the street it says ${where}`);
    await snap(`street${k}-out`, '__us.player.pitch = 0.02');
    await snap(`street${k}-back`, '__us.player.yaw += Math.PI; __us.player.pitch = 0.08');
    await snap(`street${k}-side`, '__us.player.yaw += Math.PI / 2; __us.player.pitch = 0.02');
  }
  return taken;
}

// The run before becomes the one to compare with; a run of a few stations keeps the rest of the last one.
mkdirSync(OUT, { recursive: true });
if (existsSync(NOW)) {
  rmSync(PREV, { recursive: true, force: true });
  renameSync(NOW, PREV);
}
mkdirSync(NOW, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });
  // Passengers off, as a new visitor has them: they stand somewhere else every run.
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('under-stockholm:passengers', 'off'); } catch { /* No storage. */ } });
  page.on('pageerror', (err) => console.log(`  page error: ${String(err).slice(0, 300)}`));
  await start(page);
  const all = (await page.evaluate('__us.world.net.stations.map((s, index) => ({ index, name: s.name, line: __us.world.net.lines[s.line].id, halls: __us.world.stations[index].halls.length }))')) as Station[];
  const names = wanted.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
  const stations = all.filter((s) => s.name !== 'Kymlinge' && (!names.length || names.includes(s.line) || names.includes(s.name.toLowerCase())));
  if (!stations.length) throw new Error(`No station or line called ${wanted}`);
  console.log(`${stations.length} stations`);
  const pictures = new Map<Station, string[]>();
  for (const [k, s] of stations.entries()) {
    // Another session's edit may reload the page under us: start again and take the station again.
    for (let tries = 0; ; tries++) {
      try {
        if (!(await page.evaluate('!!window.__us && !document.querySelector(".loading.crash")'))) await start(page);
        pictures.set(s, await shoot(page, s));
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

  // The sheets, drawn in a page of their own once the game is done with (a second page would stop its frames): each
  // station's pictures with their names, and a red frame round those that changed.
  const changes: string[] = [];
  const sheet = await browser.newPage();
  const data = (dir: string, f: string) => (existsSync(join(dir, f)) ? `data:image/png;base64,${readFileSync(join(dir, f)).toString('base64')}` : null);
  for (const [s, files] of pictures) {
    const tiles = files.map((f) => ({ what: f.slice(fileOf(s, '').length - 4, -4), now: data(NOW, f)!, prev: data(PREV, f) }));
    const result = (await sheet.evaluate(async (tiles, title, CHANGED) => {
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
      const W = 550, H = 310, COLS = 3, TOP = 32;
      const c = document.createElement('canvas');
      c.width = W * COLS;
      c.height = TOP + H * Math.ceil(tiles.length / COLS);
      const g = c.getContext('2d')!;
      g.fillStyle = '#000';
      g.fillRect(0, 0, c.width, c.height);
      g.font = '600 20px system-ui, sans-serif';
      g.fillStyle = '#ffd400';
      g.fillText(title, 8, 23);
      const changed: string[] = [];
      for (const [k, t] of tiles.entries()) {
        const x = (k % COLS) * W;
        const y = TOP + Math.floor(k / COLS) * H;
        g.drawImage(await load(t.now), x, y, W, H);
        g.font = '600 18px system-ui, sans-serif';
        g.fillStyle = '#000';
        g.fillRect(x, y, g.measureText(t.what).width + 14, 26);
        g.fillStyle = '#fff';
        g.fillText(t.what, x + 7, y + 19);
        if (await differ(t.now, t.prev) > CHANGED) {
          changed.push(t.what);
          g.strokeStyle = '#e0201a';
          g.lineWidth = 6;
          g.strokeRect(x + 3, y + 3, W - 6, H - 6);
        }
      }
      return { png: c.toDataURL('image/png'), changed };
    }, tiles, `${s.line} ${s.name}`, CHANGED)) as { png: string; changed: string[] };
    writeFileSync(join(OUT, fileOf(s, 'sheet').replace(/-sheet\.png$/, '.png')), Buffer.from(result.png.split(',')[1], 'base64'));
    if (result.changed.length) changes.push(`${s.name} (${result.changed.join(', ')})`);
  }
  await sheet.close();
  console.log(`\n${pictures.size} sheets in ${OUT}/`);
  if (!existsSync(PREV)) console.log('The first run: nothing to compare with yet.');
  else if (changes.length) console.log(`Changed since the run before: ${changes.join('; ')}`);
  else console.log('Nothing changed since the run before.');
} finally {
  await browser.close();
}
