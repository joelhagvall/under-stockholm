import { usesTouchControls } from './device';
import { saveLang, type Lang } from './lang';
import { comingBack, savedPlace } from './place';

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
  const { loading, error } = statusEl.dataset;
  const menu = document.getElementById('menu') as HTMLElement;
  const game = document.getElementById('game') as HTMLDivElement;

  // The game (three.js + Rapier) is only downloaded once the player asks for it,
  // which keeps the landing page tiny.
  // The tour opens the same game in showcase mode, which plays on its own until you take over.
  const launch = async (showcase: boolean, again = false, station?: string, life = false) => {
    const since = performance.now();
    // Disabling the buttons drops the focus; it goes back where it was if the game cannot start.
    const focused = document.activeElement as HTMLElement | null;
    for (const b of buttons) b.disabled = true;
    // No loading line here: the game's own loading screen takes over the whole page at once.
    statusEl.textContent = '';
    try {
      // Start physics alongside the game download instead of waiting for the large game chunk.
      const physicsReady = import('./game/physics').then(({ loadRapier }) => loadRapier());
      // Attach the rejection handler immediately; startGame still receives the original promise.
      void physicsReady.catch(() => {});
      const { startGame } = await import('./game/boot');
      menu.hidden = true;
      game.hidden = false;
      document.body.classList.add('is-playing');
      await startGame(game, { showcase, physicsReady, resume: again, station, life, since });
    } catch (err) {
      console.error(err);
      // Reported as the game would (`game/crash.ts`, a small chunk): a start that fails on someone's machine is known.
      void import('./game/crash').then(({ reportError }) => reportError(err, true)).catch(() => {});
      menu.hidden = false;
      game.hidden = true;
      document.body.classList.remove('is-playing');
      for (const b of buttons) b.disabled = false;
      statusEl.textContent = error ?? '';
      focused?.focus();
    }
  };
  start.addEventListener('click', () => void launch(false));
  tour.addEventListener('click', () => void launch(true));
  resume.addEventListener('click', () => void launch(false, true));
  if (comingBack()) void launch(false, true);
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
  type View = (root: HTMLElement, options: { close(): void; dive(station: string): void }) => Promise<() => void>;
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
        dive: (station) => { leave(); void launch(false, false, station); },
        close: () => { leave(); done(true); button.focus(); },
      });
      statusEl.textContent = '';
    } catch (err) {
      console.error(err);
      done(true);
      statusEl.textContent = error ?? '';
      button.focus();
    }
  };
  for (const [name, [button]] of Object.entries(views)) {
    button.addEventListener('click', () => void openView(name));
    if (new URLSearchParams(location.search).has(name)) void openView(name);
  }
}
if (__GAME__) game();

export {};
