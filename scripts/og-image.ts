// Renders the link preview image (public/og.jpg) from the game itself, in headless Chrome.
// Run against the production build: `bun run build && bun run serve:prod`, then `bun scripts/og-image.ts`.
// It writes the plain view (og.jpg, also the landing page's picture) and the preview card for each landing page
// (og-sv.jpg, og-en.jpg): the same view with the sign, a line of pitch and the way in, since a preview with a headline
// and a call to act is the one people click. Committed images, with the README's clip: see AGENTS.md. Re-run it when
// the stations change their look.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WIDTH = 1200;
const HEIGHT = 630;
const site = process.env.OG_SITE ?? 'http://localhost:4173/';
// A weekday noon (`t` counts from one) at T-Centralen's blue line platform under the vines.
const params = process.env.OG_PARAMS ?? 'debug&t=0&weather=clear';
// Then time runs on until a train stands at the platform with its doors open. OG_SETUP replaces this.
const setup = process.env.OG_SETUP ?? `(() => {
  __us.goto(1);
  const near = () => __us.services.some((s) => s.train.group.visible
    && Math.abs(s.train.group.position.x - __us.player.feet.x) < 60 && Math.abs(s.train.group.position.z - __us.player.feet.z) < 8
    && s.timetable.stateAt(s.clock).doors > 0.9);
  for (let i = 0; i < 200 && !near(); i++) { __us.time += 5; __us.step(0.2, 5); }
})()`;
const dir = process.env.OG_DIR ?? join(import.meta.dir, '..', 'public');
// Each landing page's words for its card, as on the page itself.
const cards = {
  sv: { lead: 'Åk Stockholms tunnelbana i webbläsaren', note: 'Hela nätet, 100 stationer. Gratis, inget att installera.', cta: 'Gå ner i tunnelbanan' },
  en: { lead: 'Ride the Stockholm metro in your browser', note: 'The whole network, 100 stations. Free, nothing to install.', cta: 'Go down to the metro' },
};
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const profile = mkdtempSync(join(tmpdir(), 'og-chrome-'));
const browser = spawn(chrome, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  `--window-size=${WIDTH},${HEIGHT}`, '--hide-scrollbars', '--mute-audio', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore' });

/** A minimal Chrome DevTools Protocol client over the page's WebSocket. */
async function connect(): Promise<(method: string, params?: object) => Promise<any>> {
  let target: { webSocketDebuggerUrl: string } | undefined;
  for (let i = 0; i < 50 && !target; i++) {
    try {
      // Chrome picks a free port and writes it into the profile.
      const port = (await Bun.file(join(profile, 'DevToolsActivePort')).text()).split('\n')[0];
      target = ((await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as any[]).find((t) => t.type === 'page');
    } catch { /* Not up yet. */ }
    if (!target) await Bun.sleep(200);
  }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  const waiting = new Map<number, (message: any) => void>();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    waiting.get(message.id)?.(message);
  });
  let id = 0;
  return (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    waiting.set(n, (message) => (message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}

try {
  const send = await connect();
  const evaluate = async (expression: string) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? expression);
    return result.result.value;
  };
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  /** Polls from here rather than in the page, so a navigation cannot strand a pending promise. */
  const until = async (expression: string, seconds: number) => {
    for (const end = Date.now() + seconds * 1000; Date.now() < end; await Bun.sleep(250)) {
      try { if (await evaluate(expression)) return; } catch { /* The page is still navigating. */ }
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  await send('Page.navigate', { url: `${site}?${params}` });
  await until(`document.readyState === 'complete' && !!document.getElementById('start')`, 30);
  await evaluate(`document.getElementById('start').click()`);
  // The loading screen goes once the first frame is drawn.
  await until(`!!window.__us && !document.querySelector('.loading')`, 180);
  await evaluate(setup);
  await evaluate(`__us.step(0.5, 30)`);
  // Only the view: no HUD, no touch buttons, no pause card.
  await evaluate(`document.querySelectorAll('.hud, .pause, .touch-controls').forEach((el) => { el.style.display = 'none'; })`);
  await evaluate(`__us.step(0.1, 30); new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  const capture = async (name: string) => {
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 } });
    const out = join(dir, name);
    await Bun.write(out, Buffer.from(shot.data, 'base64'));
    console.log(`Wrote ${out} (${Math.round(Buffer.byteLength(shot.data, 'base64') / 1024)} kB)`);
  };
  await capture('og.jpg');
  // The cards: the same view with the words over it.
  for (const [lang, card] of Object.entries(cards)) {
    await evaluate(`(() => {
      document.getElementById('og-card')?.remove();
      const card = document.createElement('div');
      card.id = 'og-card';
      card.innerHTML = ${JSON.stringify(`
        <style>
          #og-card { position: fixed; inset: 0; z-index: 99999; display: flex; flex-direction: column; justify-content: flex-end;
            align-items: flex-start; padding: 0 64px 56px; --f: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #fff; background: linear-gradient(90deg, rgba(5, 6, 8, 0.86) 0%, rgba(5, 6, 8, 0.62) 42%, rgba(5, 6, 8, 0) 72%),
              linear-gradient(0deg, rgba(5, 6, 8, 0.7) 0%, rgba(5, 6, 8, 0) 55%); }
          #og-card .sign { padding: 12px 28px; font: 600 44px/1.1 var(--f); text-transform: uppercase; white-space: nowrap;
            background: linear-gradient(180deg, #2449a6, #1b3a8f 55%, #183482); border-bottom: 9px solid #f2c200; border-radius: 2px;
            box-shadow: 0 0 60px rgba(36, 73, 166, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.18); }
          #og-card h2 { margin: 30px 0 0; max-width: 620px; font: 700 52px/1.08 var(--f); text-shadow: 0 2px 18px rgba(0, 0, 0, 0.6); }
          #og-card p { margin: 14px 0 0; max-width: 700px; font: 500 25px/1.3 var(--f); color: #d6deea; text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7); }
          #og-card .cta { margin-top: 30px; padding: 17px 34px; font: 700 26px/1 var(--f); border: 3px solid #fff; border-radius: 12px;
            background: #1c63c4; box-shadow: 0 0 28px rgba(28, 99, 196, 0.65); }
        </style>
        <div class="sign">Under Stockholm</div>
        <h2>${card.lead}</h2>
        <p>${card.note}</p>
        <div class="cta">${card.cta} →</div>`)};
      document.body.append(card);
    })()`);
    await evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    await capture(`og-${lang}.jpg`);
  }
} finally {
  browser.kill();
  rmSync(profile, { recursive: true, force: true });
}
