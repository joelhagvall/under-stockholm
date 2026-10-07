import { usesTouchControls } from './device';
import { saveLang, type Lang } from './lang';
import { comingBack, notWasm, reloadForNewer, reopening, savedPlace, staleBuild, tooOld } from './place';

document.documentElement.classList.toggle('touch-device', usesTouchControls());
// Following the link to the other language is a choice, and the game's menus keep to it.
const langLink = document.querySelector<HTMLAnchorElement>('.menu-lang');
langLink?.addEventListener('click', () => saveLang(langLink.dataset.lang as Lang));

// The live line map is a small separate chunk (the timetable, no three.js),
// loaded once the page has settled so it never competes with first paint.
const lineNow = document.getElementById('line-now')!;
const mountMap = () =>
  import('./landing/lineMap').then(({ mountLineMap }) => mountLineMap(lineNow)).catch((err) => {
    // Without its chunk (offline, say) the section would be dead buttons around an empty map: leave it out.
    console.error(err);
    lineNow.hidden = true;
    // The departure strip then keeps the routes it came with.
    document.getElementById('departures')?.classList.remove('is-pending');
  });
if ('requestIdleCallback' in window) requestIdleCallback(mountMap, { timeout: 1500 });
else setTimeout(mountMap, 300);

/**
 * The ways into the game and the network view. Built only with the game: the landing page alone (LANDING_ONLY=1) has
 * a line saying it opens soon instead, and none of this code, so neither the game nor the network view is in the build.
 */
function game(): void {
  const start = document.getElementById('start') as HTMLButtonElement;
  const tour = document.getElementById('tour') as HTMLButtonElement;
  const resume = document.getElementById('continue') as HTMLButtonElement;
  // Back where the player last stood, if they have been down before.
  const place = savedPlace();
  if (place) {
    resume.hidden = false;
    resume.querySelector('small')!.textContent = place.station;
  }
  const network = document.getElementById('network') as HTMLButtonElement;
  const buttons = [start, tour, resume, network];
  const statusEl = document.getElementById('status') as HTMLParagraphElement;
  // The page carries its own copy of these, in its language.
  const { loading, error, webgl, blocked, old } = statusEl.dataset;
  // A machine without WebGL (most often with hardware acceleration off) is told what to do about it, and so is one
  // whose network handed back something else for the physics binary, and one too old to read the game's code.
  const failed = (err: unknown) => (/WebGL/.test(String(err)) ? webgl : notWasm(err) ? blocked : tooOld(err) ? old : error) ?? '';
  const menu = document.getElementById('menu') as HTMLElement;
  const game = document.getElementById('game') as HTMLDivElement;
  const invalidPrefetches = new Set<string>();

  // The game (three.js + Rapier) is imported only once the player asks for it;
  // fetching its files ahead never executes them on the landing page.
  // The tour opens the same game in showcase mode, which plays on its own until you take over.
  const launch = async (showcase: boolean, again = false, station?: string, life = false, to?: string) => {
    const since = performance.now();
    // Disabling the buttons drops the focus; it goes back where it was if the game cannot start.
    const focused = document.activeElement as HTMLElement | null;
    for (const b of buttons) b.disabled = true;
    // No loading line here: the game's own loading screen takes over the whole page at once.
    statusEl.textContent = '';
    try {
      // An HTML error page with status 200 can be cached even for a hashed asset. Replace a known bad prefetch
      // before importing it: the normal recovery reload cannot evict an immutable response from the HTTP cache.
      for (const file of invalidPrefetches) await fetch(file, { cache: 'reload' }).then((r) => r.arrayBuffer());
      invalidPrefetches.clear();
      // Start physics alongside the game download instead of waiting for the large game chunk.
      const physicsReady = import('./game/physics').then(({ loadRapier }) => loadRapier());
      // Attach the rejection handler immediately; startGame still receives the original promise.
      void physicsReady.catch(() => {});
      const { startGame } = await import('./game/boot');
      menu.hidden = true;
      game.hidden = false;
      document.body.classList.add('is-playing');
      await startGame(game, { showcase, physicsReady, resume: again, station, life, since, trip: station && to ? { from: station, to } : undefined });
    } catch (err) {
      console.error(err);
      // A page left open across a deploy: the new build opens the game instead.
      if (staleBuild(err) && reloadForNewer({ showcase, again, station, life })) return;
      // Reported as the game would (`game/crash.ts`, a small chunk): a start that fails on someone's machine is known.
      void import('./game/crash').then(({ reportError }) => reportError(err, true)).catch(() => {});
      menu.hidden = false;
      game.hidden = true;
      document.body.classList.remove('is-playing');
      for (const b of buttons) b.disabled = false;
      statusEl.textContent = failed(err);
      focused?.focus();
    }
  };
  // Reading the page takes a while: the game comes down meanwhile, at low priority a moment after the page has loaded
  // and painted (sooner, it would share the line with what the page shows first), so a click finds it in the cache (the build names the files, `gameFiles` in vite.config.ts). Not for a visitor saving
  // data or on a very slow line, nor once something has opened: that fetches what it needs itself.
  const fetchAhead = () => {
    const files = document.querySelector<HTMLMetaElement>('meta[name="game-files"]')?.content.split(' ').filter(Boolean);
    const line = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (!files?.length || line?.saveData || /2g/.test(line?.effectiveType ?? '') || buttons.some((b) => b.disabled)) return;
    for (const file of files) {
      const url = new URL(file, import.meta.url);
      void fetch(url, { priority: 'low' } as RequestInit).then(async (r) => {
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (!r.ok || /text\/html/i.test(r.headers.get('content-type') ?? '') ||
          (file.endsWith('.wasm') && (bytes[0] !== 0 || bytes[1] !== 97 || bytes[2] !== 115 || bytes[3] !== 109))) invalidPrefetches.add(url.href);
      }).catch(() => {});
    }
  };
  const idle = () => setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(fetchAhead, { timeout: 2000 }) : fetchAhead()), 2000);
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });

  start.addEventListener('click', () => void launch(false));
  tour.addEventListener('click', () => void launch(true));
  resume.addEventListener('click', () => void launch(false, true));
  // Loaded again for a newer build: what was being opened opens.
  const reopen = reopening();
  if (comingBack()) void launch(false, true);
  else if (reopen && !reopen.view && !new URLSearchParams(location.search).has('liv')) void launch(!!reopen.showcase, !!reopen.again, reopen.station, !!reopen.life);
  // A life on the blue line: a link, so it can be shared, that opens the game straight into it.
  const lifeLink = document.getElementById('life') as HTMLAnchorElement;
  lifeLink.addEventListener('click', (e) => {
    // A new tab or window is the link's own business.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    void launch(false, false, undefined, true);
  });
  if (new URLSearchParams(location.search).has('liv')) void launch(false, false, undefined, true);

  // The whole network (`?natet`), its own lazily loaded chunk, full screen over the landing page. A click on a station in the network goes down into the game there.
  type View = (root: HTMLElement, options: { close(): void; dive(station: string, to?: string): void }) => Promise<() => void>;
  const views: Record<string, [HTMLButtonElement, () => Promise<View>]> = {
    natet: [network, () => import('./network/view').then((m) => m.mountNetwork)],
  };
  const param = (name: string, on: boolean) => {
    const url = new URL(location.href);
    if (on) url.searchParams.set(name, ''); else url.searchParams.delete(name);
    history.replaceState(null, '', url);
  };
  const openView = async (name: string) => {
    const [button, load] = views[name];
    for (const b of buttons) b.disabled = true;
    statusEl.textContent = loading ?? '';
    const done = (again: boolean) => {
      for (const b of buttons) b.disabled = !again;
      menu.hidden = !again;
    };
    try {
      const mount = await load();
      const view = document.createElement('div');
      document.body.append(view);
      menu.hidden = true;
      param(name, true);
      const leave = () => { close(); view.remove(); param(name, false); };
      const close = await mount(view, {
        dive: (station, to) => { leave(); void launch(false, false, station, false, to); },
        close: () => { leave(); done(true); button.focus(); },
      });
      statusEl.textContent = '';
    } catch (err) {
      console.error(err);
      if (staleBuild(err) && reloadForNewer({ view: name })) return;
      done(true);
      statusEl.textContent = failed(err);
      button.focus();
    }
  };
  for (const [name, [button]] of Object.entries(views)) {
    button.addEventListener('click', () => void openView(name));
    if (new URLSearchParams(location.search).has(name) || reopen?.view === name) void openView(name);
  }
}
if (__GAME__) game();

export {};
