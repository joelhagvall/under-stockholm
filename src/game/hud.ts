import './hud.css';
import { label, lang, text } from './i18n/text';
import { FEEDBACK_MAIL } from './crash';
import type { Network } from './line';
import type { DriverReadout } from './driver';
import { networkMapLayout } from './world/station';
import type { Explored } from './explore';
import { keyName, settings, type Action } from './settings';
import { composeNote, GAP, PHRASES, STATIONS, THINGS } from './notePhrases';
import { planTrip, tripSummary } from './trip';

/** Writes `message` into `el`, a leading key (`E · Sätt upp en lapp`) drawn as a key cap. */
function keyCap(el: HTMLElement, message: string): void {
  const key = /^(\S{1,6}|Num \S+) · (.+)$/.exec(message);
  if (!key) { el.textContent = message; return; }
  const cap = document.createElement('kbd');
  cap.textContent = key[1];
  const label = document.createElement('span');
  label.textContent = key[2];
  el.replaceChildren(cap, label);
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Screen pixels per network map unit in the corner map: how near it zooms in. */
const MAP_ZOOM = 0.8;

/** A section of the discovery book, as the pause menu shows it. */
export interface BookGroup {
  title: string;
  items: Array<{ title: string; hint: string; found: boolean }>;
}

export interface MapTrain {
  x: number;
  z: number;
}

/** DOM overlay: status bar, subtitles, line map, pause screen, fades. */
export class Hud {
  readonly root: HTMLDivElement;
  readonly pause: HTMLDivElement;
  readonly resumeButton: HTMLButtonElement;
  private readonly pauseCard: HTMLElement;
  readonly soundButton: HTMLButtonElement;
  readonly pixelButton: HTMLButtonElement;
  readonly batteryButton: HTMLButtonElement;
  readonly unstuckButton: HTMLButtonElement;
  readonly motionButtons: HTMLButtonElement[];
  private readonly interaction: HTMLParagraphElement;
  private readonly tipLine: HTMLParagraphElement;
  private tipTimer = 0;
  readonly crowdButtons: HTMLButtonElement[];
  readonly ghostButton: HTMLButtonElement;
  readonly voiceButton: HTMLButtonElement;
  readonly driverButton: HTMLButtonElement;
  readonly saverButton: HTMLButtonElement;
  readonly loopButton: HTMLButtonElement;
  readonly eraButton: HTMLButtonElement;
  readonly bookButton: HTMLButtonElement;
  readonly showButton: HTMLButtonElement;
  readonly lifeButton: HTMLButtonElement;
  readonly settingsButton: HTMLButtonElement;
  /** The settings panel, filled by `SettingsPanel`. */
  readonly settingsPanel: HTMLDivElement;
  /** Switches menus, help and settings between Swedish and English. */
  readonly langButton: HTMLButtonElement;
  private driving = false;
  private past = false;
  private readonly showCard: HTMLDivElement;
  readonly tripButton: HTMLButtonElement;
  private readonly tripPanel: HTMLDivElement;
  private readonly tripFrom: HTMLSelectElement;
  private readonly tripTo: HTMLSelectElement;
  private readonly tripCancel: HTMLButtonElement;
  private readonly tripLine: HTMLParagraphElement;
  /** A trip picked in the pause menu: from and to, by station name. */
  onTrip: ((from: string, to: string) => void) | null = null;
  onTripCancel: (() => void) | null = null;
  private readonly book: HTMLDivElement;
  private readonly bookBack: HTMLButtonElement;
  private readonly foundCard: HTMLDivElement;
  private foundTimer = 0;
  /** Sees every caption and notice as it is shown (the discovery book listens here). */
  onText: ((message: string) => void) | null = null;
  private readonly lineLabel: HTMLParagraphElement;
  private readonly ghostsLine: HTMLParagraphElement;
  private readonly noticeCard: HTMLDivElement;
  private readonly driverPanel: HTMLDivElement;
  private readonly ticket: HTMLParagraphElement;
  private noticeTimer = 0;
  private lastClock = '';
  private lineName = text.line;
  private readonly title: HTMLParagraphElement;
  private readonly sub: HTMLParagraphElement;
  private readonly caption: HTMLParagraphElement;
  private readonly warning: HTMLParagraphElement;
  private readonly fade: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly map: HTMLCanvasElement;
  private readonly mapCtx: CanvasRenderingContext2D;
  private spots: Array<{ x: number; y: number; label: 'above' | 'below' }> | null = null;
  private links: Array<{ a: number; b: number; line: number; shift: number }> | null = null;
  private captionTimer = 0;
  private lastTitle = '';
  private lastSub = '';

  constructor(parent: HTMLElement, private readonly net: Network, private readonly touch = false) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-status"><p class="hud-line">${text.line}</p><p class="hud-title" aria-live="polite"></p><p class="hud-sub" aria-live="polite"></p><p class="hud-trip" hidden></p><p class="hud-ghosts" hidden></p></div>
      <div class="hud-notice" role="status" hidden><p class="hud-notice-title"></p><p class="hud-notice-body"></p></div>
      <div class="hud-found" role="status" hidden><p class="hud-found-label" data-t="discover.found"></p><p class="hud-found-body"></p></div>
      <div class="hud-driver" hidden aria-live="off">
        <div class="hud-driver-speed"><strong>0</strong><span>${text.driver.speed}</span></div>
        <div class="hud-driver-limit"><span>${text.driver.limit}</span><strong>80</strong></div>
        <div class="hud-driver-notch"></div>
        <div class="hud-driver-next"><span></span><strong></strong></div>
        <div class="hud-driver-score"></div>
      </div>
      <div class="hud-cross" aria-hidden="true"></div>
      <button type="button" class="hud-crowd" aria-pressed="false" data-key="passengers"><span data-t="passengers"></span> <strong></strong> <kbd></kbd></button>
      <button type="button" class="hud-crowd hud-motion" aria-pressed="true" data-key="motion"><span data-t="motion"></span> <strong></strong> <kbd></kbd></button>
      <!-- What is in reach changes as the player looks around: left out of the live regions, or it would never be quiet. -->
      <p class="hud-interaction" hidden></p>
      <p class="hud-tip" role="status" hidden></p>
      <p class="hud-warning" role="alert" hidden></p>
      <p class="hud-caption" aria-live="polite"></p>
      <canvas class="hud-map" width="640" height="280" aria-hidden="true"></canvas>
      <div class="hud-help">
        <p></p>
      </div>
      <div class="hud-show" hidden aria-live="polite"><p class="hud-show-title"></p><p class="hud-show-sub"></p><p class="hud-show-hint" data-t="${touch ? 'show.hintTouch' : 'show.hint'}"></p></div>
      <div class="hud-fade"></div>
    `;
    parent.appendChild(this.root);
    const q = <T extends Element>(sel: string) => this.root.querySelector(sel) as T;
    this.title = q('.hud-title');
    this.sub = q('.hud-sub');
    this.caption = q('.hud-caption');
    this.interaction = q('.hud-interaction');
    this.tipLine = q('.hud-tip');
    window.addEventListener('resize', () => this.placeCaption());
    this.warning = q('.hud-warning');
    this.fade = q('.hud-fade');
    this.help = q('.hud-help');
    this.map = q('.hud-map');
    const ctx = this.map.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.mapCtx = ctx;

    this.pause = document.createElement('div');
    this.pause.className = 'pause';
    this.pause.innerHTML = `
      <div class="pause-card" tabindex="-1">
        <h2 id="pause-title" translate="no">Under Stockholm</h2>
        <button type="button" class="pause-resume" data-t="touch.resume"></button>
        <button type="button" class="pause-option pause-loop" data-t="loop.wakeButton" hidden></button>
        <p class="pause-ticket"></p>
        ${touch ? '<p class="pause-touch-help pause-intro" data-t="touch.help"></p>' : '<p class="pause-keys pause-intro"></p>'}
        <div class="pause-nav">
          <button type="button" class="pause-option pause-book" aria-expanded="false" aria-controls="pause-book"><span data-t="discover.button"></span> <strong></strong></button>
          <button type="button" class="pause-option pause-settings" aria-expanded="false" aria-controls="pause-settings" data-t="settings.button"></button>
        </div>
        <section class="pause-modes" aria-labelledby="pause-modes-title">
          <h3 id="pause-modes-title" data-t="modes"></h3>
          <div class="pause-mode-list">
            <button type="button" class="pause-option pause-trip" aria-expanded="false" aria-controls="pause-trip" data-t="trip.button"></button>
            <button type="button" class="pause-option pause-driver" data-key="drive"></button>
            <button type="button" class="pause-option pause-show" data-t="show.button"></button>
            <button type="button" class="pause-option pause-life" data-t="life"></button>
            <button type="button" class="pause-option pause-network" data-t="network"></button>
            <button type="button" class="pause-option pause-era" aria-pressed="false"><span data-t="era.toggle"></span> <strong></strong></button>
            <button type="button" class="pause-option pause-saver" data-key="screensaver" data-t="saver.start"></button>
          </div>
        </section>
        <p class="pause-links">
          <button type="button" class="pause-support pause-unstuck" data-t="unstuck.button"></button>
          <a class="pause-support" href="mailto:${FEEDBACK_MAIL}?subject=Under%20Stockholm" data-t="feedback"></a>
          <a class="pause-support" href="https://buymeacoffee.com/joelhagvall" target="_blank" rel="noopener" data-t="support"></a>
        </p>
      </div>
      <div class="pause-card pause-book-panel" id="pause-book" hidden>
        <div class="panel-head">
          <button type="button" class="panel-back pause-book-back"><span aria-hidden="true">←</span> <span data-t="discover.back"></span></button>
          <h2><span data-t="discover.title"></span> <span class="pause-book-count"></span></h2>
        </div>
        <p class="pause-book-intro" data-t="discover.intro"></p>
        <div class="pause-book-groups"></div>
      </div>
      <div class="pause-card pause-book-panel pause-trip-panel" id="pause-trip" hidden>
        <div class="panel-head">
          <button type="button" class="panel-back pause-trip-back"><span aria-hidden="true">←</span> <span data-t="discover.back"></span></button>
          <h2 data-t="trip.button"></h2>
        </div>
        <p class="pause-book-intro" data-t="trip.intro"></p>
        <form class="trip-form">
          <label><span data-t="trip.from"></span><select name="from" translate="no"></select></label>
          <label><span data-t="trip.to"></span><select name="to" translate="no"></select></label>
          <p class="trip-plan" aria-live="polite"></p>
          <div class="trip-actions">
            <button type="submit" class="pause-resume trip-go" data-t="trip.go"></button>
            <button type="button" class="pause-option trip-cancel" data-t="trip.cancel" hidden></button>
          </div>
        </form>
      </div>
      <div class="pause-card pause-book-panel pause-settings-panel" id="pause-settings" hidden>
        <section class="settings-section settings-toggles" aria-labelledby="settings-game-title">
          <h3 id="settings-game-title" data-t="settings.game"></h3>
          <div class="settings-switches">
            <button type="button" class="pause-option pause-sound" aria-pressed="true"><span data-t="touch.sound"></span> <strong></strong></button>
            <button type="button" class="hud-crowd pause-crowd" aria-pressed="false" data-key="passengers"><span data-t="passengers"></span> <strong></strong> <kbd></kbd></button>
            <button type="button" class="pause-option pause-ghosts" aria-pressed="true" data-key="ghosts"><span data-t="ghosts.toggle"></span> <strong></strong></button>
            <button type="button" class="pause-option pause-voices" aria-pressed="false" data-t-title="voices.hint"><span data-t="voices.toggle"></span> <strong></strong></button>
            <button type="button" class="hud-crowd pause-crowd pause-motion" aria-pressed="true" data-key="motion"><span data-t="motion"></span> <strong></strong> <kbd></kbd></button>
            <button type="button" class="pause-option pause-pixels" aria-pressed="false"><span data-t="touch.pixels"></span> <strong></strong></button>
            <button type="button" class="pause-option pause-battery" aria-pressed="false" data-t-title="battery.hint"><span data-t="battery.toggle"></span> <strong></strong></button>
            <button type="button" class="pause-option pause-lang"><span data-t="settings.language"></span> <strong data-t="language"></strong></button>
          </div>
          ${touch ? '<p class="settings-touch-help" data-t="touch.help"></p>' : ''}
        </section>
      </div>`;
    this.pause.setAttribute('role', 'dialog');
    this.pause.setAttribute('aria-labelledby', 'pause-title');
    parent.appendChild(this.pause);
    this.pauseCard = this.pause.querySelector('.pause-card')!;
    this.resumeButton = this.pause.querySelector('.pause-resume')!;
    this.soundButton = this.pause.querySelector('.pause-sound')!;
    this.pixelButton = this.pause.querySelector('.pause-pixels')!;
    this.batteryButton = this.pause.querySelector('.pause-battery')!;
    this.unstuckButton = this.pause.querySelector('.pause-unstuck')!;
    this.crowdButtons = [q<HTMLButtonElement>('.hud-crowd'), this.pause.querySelector<HTMLButtonElement>('.pause-crowd')!];
    this.motionButtons = [q<HTMLButtonElement>('.hud-motion'), this.pause.querySelector<HTMLButtonElement>('.pause-motion')!];
    this.ghostButton = this.pause.querySelector('.pause-ghosts')!;
    this.voiceButton = this.pause.querySelector('.pause-voices')!;
    this.driverButton = this.pause.querySelector('.pause-driver')!;
    this.saverButton = this.pause.querySelector('.pause-saver')!;
    this.loopButton = this.pause.querySelector('.pause-loop')!;
    this.eraButton = this.pause.querySelector('.pause-era')!;
    this.bookButton = this.pause.querySelector('.pause-book')!;
    this.showButton = this.pause.querySelector('.pause-show')!;
    this.lifeButton = this.pause.querySelector('.pause-life')!;
    // The whole network is its own page state: the game is left for it.
    this.pause.querySelector('.pause-network')!.addEventListener('click', () => {
      const url = new URL(location.href);
      url.searchParams.set('natet', '');
      location.assign(url);
    });
    this.book = this.pause.querySelector('.pause-book-panel')!;
    this.bookBack = this.pause.querySelector('.pause-book-back')!;
    this.settingsButton = this.pause.querySelector('.pause-settings')!;
    this.settingsPanel = this.pause.querySelector('.pause-settings-panel')!;
    this.settingsPanel.addEventListener('click', (event) => event.stopPropagation());
    this.book.addEventListener('click', (event) => event.stopPropagation());
    this.settingsButton.addEventListener('click', (event) => { event.stopPropagation(); this.showSettings(true); });
    this.bookButton.addEventListener('click', (event) => { event.stopPropagation(); this.showBook(true); });
    this.bookBack.addEventListener('click', (event) => { event.stopPropagation(); this.showBook(false); });
    this.tripButton = this.pause.querySelector('.pause-trip')!;
    this.tripPanel = this.pause.querySelector('.pause-trip-panel')!;
    this.tripPanel.addEventListener('click', (event) => event.stopPropagation());
    this.tripButton.addEventListener('click', (event) => { event.stopPropagation(); this.showTrip(true); });
    this.tripPanel.querySelector('.pause-trip-back')!.addEventListener('click', (event) => { event.stopPropagation(); this.showTrip(false); });
    const form = this.tripPanel.querySelector('form')!;
    [this.tripFrom, this.tripTo] = [...form.querySelectorAll('select')];
    // Every station once, by name: a station two lines share, or two of one name joined by a walkway, is one place to the player.
    const names = [...new Set(net.stations.map((s) => s.name))].sort((a, b) => a.localeCompare(b, 'sv'));
    for (const select of [this.tripFrom, this.tripTo]) for (const name of names) select.add(new Option(name, name));
    this.tripTo.value = names.find((n) => n !== this.tripFrom.value) ?? '';
    for (const select of [this.tripFrom, this.tripTo]) select.addEventListener('change', () => this.planPreview());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!planTrip(this.net, this.tripFrom.value, this.tripTo.value)) return;
      // Back to the menu first: if the browser refuses the mouse, the game stays paused there, the trip under way.
      this.showTrip(false, false);
      this.onTrip?.(this.tripFrom.value, this.tripTo.value);
    });
    this.tripCancel = form.querySelector('.trip-cancel')!;
    this.tripCancel.addEventListener('click', (event) => { event.stopPropagation(); this.onTripCancel?.(); });
    this.tripLine = q('.hud-trip');
    this.ticket = this.pause.querySelector('.pause-ticket')!;
    this.lineLabel = q('.hud-line');
    this.ghostsLine = q('.hud-ghosts');
    this.noticeCard = q('.hud-notice');
    this.driverPanel = q('.hud-driver');
    this.foundCard = q('.hud-found');
    this.showCard = q('.hud-show');
    this.langButton = this.pause.querySelector('.pause-lang')!;
    this.relabel();
    window.setTimeout(() => this.help.classList.add('is-faded'), 12000);
  }

  setStatus(title: string, sub: string): void {
    if (title !== this.lastTitle) this.title.textContent = this.lastTitle = title;
    if (sub !== this.lastSub) this.sub.textContent = this.lastSub = sub;
  }

  /** Stockholm time next to the line name. */
  setClock(clock: string): void {
    if (clock === this.lastClock) return;
    this.lastClock = clock;
    this.lineLabel.textContent = `${this.lineName} · ${clock}`;
  }

  setGhostCount(message: string | null): void {
    this.ghostsLine.hidden = message === null;
    if (message !== null && this.ghostsLine.textContent !== message) this.ghostsLine.textContent = message;
  }

  setTicket(line: string): void {
    if (this.ticket.textContent !== line) this.ticket.textContent = line;
  }

  setDriverButton(driving: boolean): void {
    this.driving = driving;
    this.driverButton.textContent = driving ? text.driver.exit : text.driver.start;
  }

  /** Writes every label in the current language: once at the start, and again when the player switches. */
  relabel(): void {
    const ui = lang();
    this.pause.lang = ui;
    this.help.lang = ui;
    label(this.root);
    label(this.pause);
    // The keys as the player has bound them.
    const k = (action: Action) => `<kbd>${escapeHtml(keyName(settings.key(action)))}</kbd>`;
    const walk = (['forward', 'left', 'back', 'right'] as const).map((a) => keyName(settings.key(a))).join('');
    const keys = (more: string) => `<kbd>${escapeHtml(walk)}</kbd> ${text.walk} · ${more}${k('run')} ${text.run} · ${k('jump')} ${text.jump} · ${k('sit')} ${text.sit} · ${k('use')} ${text.use} · ${k('drive')} ${text.driver.title.toLowerCase()} · ${k('ghosts')} ${text.ghosts.toggle.toLowerCase()} · ${k('screensaver')} ${text.saver.start.toLowerCase()} · ${k('mute')} ${text.mute} · ${k('pixels')} ${text.pixels}`;
    for (const el of [...this.root.querySelectorAll<HTMLElement>('[data-key]'), ...this.pause.querySelectorAll<HTMLElement>('[data-key]')]) {
      const code = settings.key(el.dataset.key as Action);
      el.setAttribute('aria-keyshortcuts', code.replace(/^Key|^Digit/, ''));
      const cap = el.querySelector('kbd');
      if (cap) cap.textContent = keyName(code);
    }
    this.help.querySelector('p')!.innerHTML = `${keys('')} · ${k('help')} ${text.help} · <kbd>Esc</kbd> ${text.pause}`;
    const pauseKeys = this.pause.querySelector('.pause-keys');
    if (pauseKeys) pauseKeys.innerHTML = keys(`<kbd>${text.mouse}</kbd> ${text.look} · `);
    // The button offers the other language, in that language.
    this.langButton.querySelector('strong')!.lang = text.languageCode;
    for (const button of [...this.root.querySelectorAll('.hud-crowd'), ...this.pause.querySelectorAll('[aria-pressed]')]) {
      const state = button.querySelector('strong');
      if (state) state.textContent = button.getAttribute('aria-pressed') === 'true' ? text.on : text.off;
    }
    this.setEra(this.past);
    this.setDriverButton(this.driving);
    if (this.tripPanel) this.planPreview();
  }

  /** A card in the middle of the view, e.g. a ticket inspection. */
  notice(title: string, body: string, seconds = 5): void {
    this.noticeCard.querySelector('.hud-notice-title')!.textContent = title;
    this.noticeCard.querySelector('.hud-notice-body')!.textContent = body;
    this.noticeCard.hidden = false;
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => { this.noticeCard.hidden = true; }, seconds * 1000);
    this.onText?.(title);
    this.onText?.(body);
  }

  /** A small card at the top when something new goes into the discovery book. */
  discovered(line: string, seconds = 5): void {
    this.foundCard.querySelector('.hud-found-body')!.textContent = line;
    this.foundCard.hidden = false;
    window.clearTimeout(this.foundTimer);
    this.foundTimer = window.setTimeout(() => { this.foundCard.hidden = true; }, seconds * 1000);
  }

  /** Fills the discovery book and the count on its button. */
  setBook(groups: BookGroup[], progress: string): void {
    this.bookButton.querySelector('strong')!.textContent = progress;
    this.book.querySelector('.pause-book-count')!.textContent = progress;
    const list = this.book.querySelector('.pause-book-groups')!;
    list.replaceChildren(...groups.map((g) => {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = `${g.title} · ${g.items.filter((i) => i.found).length}/${g.items.length}`;
      const ul = document.createElement('ul');
      for (const item of g.items) {
        const li = document.createElement('li');
        li.className = item.found ? 'is-found' : '';
        const name = document.createElement('strong');
        if (item.found) name.textContent = item.title;
        else {
          const mark = document.createElement('span');
          mark.textContent = '?';
          mark.setAttribute('aria-hidden', 'true');
          const unknown = document.createElement('span');
          unknown.className = 'visually-hidden';
          unknown.textContent = text.discover.unknown;
          name.append(mark, unknown);
        }
        const hint = document.createElement('span');
        hint.textContent = item.hint;
        li.append(name, hint);
        ul.append(li);
      }
      section.append(heading, ul);
      return section;
    }));
  }

  showBook(open: boolean, focus = true): void {
    this.book.hidden = !open;
    this.settingsPanel.hidden = true;
    this.tripPanel.hidden = true;
    this.pause.querySelector<HTMLElement>('.pause-card:not(.pause-book-panel)')!.hidden = open;
    this.bookButton.setAttribute('aria-expanded', String(open));
    if (open) this.book.scrollTop = 0;
    if (focus) (open ? this.bookBack : this.bookButton).focus({ preventScroll: true });
  }

  showSettings(open: boolean, focus = true): void {
    this.settingsPanel.hidden = !open;
    this.book.hidden = true;
    this.tripPanel.hidden = true;
    this.pause.querySelector<HTMLElement>('.pause-card:not(.pause-book-panel)')!.hidden = open;
    this.settingsButton.setAttribute('aria-expanded', String(open));
    if (open) this.settingsPanel.scrollTop = 0;
    if (focus) (open ? this.settingsPanel.querySelector<HTMLElement>('input, button') : this.settingsButton)?.focus({ preventScroll: true });
  }

  /** Opens the trip planner, from the station the player is at (`here`), or closes it. */
  showTrip(open: boolean, focus = true): void {
    this.tripPanel.hidden = !open;
    this.book.hidden = true;
    this.settingsPanel.hidden = true;
    this.pause.querySelector<HTMLElement>('.pause-card:not(.pause-book-panel)')!.hidden = open;
    this.tripButton.setAttribute('aria-expanded', String(open));
    if (open) {
      // From where the player is; at the end of a trip, back again.
      if (this.tripHere === this.tripTo.value) this.tripTo.value = this.tripFrom.value;
      if (this.tripHere) this.tripFrom.value = this.tripHere;
      this.planPreview();
      this.tripPanel.scrollTop = 0;
    }
    if (focus) (open ? this.tripTo : this.tripButton).focus({ preventScroll: true });
  }

  /** The station the player is at, where the planner starts from. */
  private tripHere: string | null = null;
  setTripHere(station: string | null): void {
    this.tripHere = station;
  }

  /** The way between the two stations picked, as it will be ridden. */
  private planPreview(): void {
    const plan = planTrip(this.net, this.tripFrom.value, this.tripTo.value);
    const line = this.tripPanel.querySelector('.trip-plan')!;
    line.textContent = plan ? tripSummary(this.net, plan) : this.tripFrom.value === this.tripTo.value ? text.trip.same : text.trip.none;
    this.tripPanel.querySelector<HTMLButtonElement>('.trip-go')!.disabled = !plan;
  }

  /** The trip under the station's name, or null when there is none; and the planner's way to cancel it. */
  setTrip(line: string | null): void {
    this.tripLine.hidden = line === null;
    if (line !== null && this.tripLine.textContent !== line) this.tripLine.textContent = line;
    this.tripCancel.hidden = line === null;
  }

  /** Closes the discovery book, the settings or the trip planner if one is open, back to the pause menu. */
  closePanel(): boolean {
    if (!this.tripPanel.hidden) { this.showTrip(false); return true; }
    if (!this.settingsPanel.hidden) { this.showSettings(false); return true; }
    if (!this.book.hidden) { this.showBook(false); return true; }
    return false;
  }

  setDriver(readout: DriverReadout | null): void {
    this.driverPanel.hidden = readout === null;
    this.root.classList.toggle('is-driving', readout !== null);
    if (!readout) return;
    const p = this.driverPanel;
    p.querySelector('.hud-driver-speed strong')!.textContent = String(Math.round(readout.speed));
    const limit = p.querySelector('.hud-driver-limit')!;
    limit.querySelector('strong')!.textContent = String(Math.round(readout.limit / 5) * 5);
    limit.classList.toggle('is-over', readout.emergency || readout.speed > readout.limit + 2);
    const notch = readout.emergency ? text.driver.emergency : readout.notch > 0 ? `${text.driver.power} ${readout.notch}` : readout.notch < 0 ? `${text.driver.brake} ${-readout.notch}` : text.driver.neutral;
    const notchEl = p.querySelector('.hud-driver-notch')!;
    notchEl.textContent = readout.doors ? `${notch} · ${text.driver.doors}` : notch;
    notchEl.className = `hud-driver-notch ${readout.notch > 0 ? 'is-power' : readout.notch < 0 || readout.emergency ? 'is-brake' : ''}`;
    p.querySelector('.hud-driver-next span')!.textContent = readout.next ? `${text.driver.next}: ${readout.next}` : '';
    p.querySelector('.hud-driver-next strong')!.textContent = readout.distance === null ? '' : `${new Intl.NumberFormat(lang(), { maximumFractionDigits: readout.distance > 0 ? 0 : 1 }).format(readout.distance)}\u00a0m ${text.driver.toStop}`;
    p.querySelector('.hud-driver-score')!.textContent = `${readout.score} / ${readout.maxScore}`;
  }

  setCrowd(enabled: boolean): void {
    for (const button of this.crowdButtons) {
      button.setAttribute('aria-pressed', String(enabled));
      button.querySelector('strong')!.textContent = enabled ? text.on : text.off;
    }
  }

  setMotion(enabled: boolean): void {
    for (const button of this.motionButtons) {
      button.setAttribute('aria-pressed', String(enabled));
      button.querySelector('strong')!.textContent = enabled ? text.on : text.off;
    }
  }

  /** What the player can do here, under the crosshair. A leading key (`E · Sätt upp en lapp`) is drawn as a key cap. */
  setInteraction(message: string | null): void {
    const hidden = message === null;
    // Only on a change: assigning the same value still costs a style pass, every frame.
    if (this.interaction.hidden !== hidden) this.interaction.hidden = hidden;
    if (hidden || this.interaction.dataset.message === message) return;
    this.interaction.dataset.message = message;
    keyCap(this.interaction, message);
  }

  /** A first-time hint, at the foot of the screen (above the interaction prompt where there is no room). */
  tip(message: string, seconds = 6): void {
    keyCap(this.tipLine, message);
    this.tipLine.hidden = false;
    this.placeCaption();
    window.clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(() => { this.tipLine.hidden = true; }, seconds * 1000);
  }

  say(text: string, seconds = 6): void {
    this.caption.textContent = text;
    this.caption.classList.add('is-on');
    this.placeCaption();
    window.clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => this.caption.classList.remove('is-on'), seconds * 1000);
    this.onText?.(text);
  }

  /**
   * Keeps a long caption clear of the map and the hint above it: it stays where it is unless it would run into one of
   * them, and then rises above it.
   */
  private placeCaption(): void {
    this.caption.style.bottom = '';
    if (!this.caption.textContent) return;
    for (let pass = 0; pass < 3; pass++) {
      const c = this.caption.getBoundingClientRect();
      const hit = [this.map, this.tipLine].map((el) => el.getBoundingClientRect())
        .find((r) => r.width > 0 && c.left < r.right && c.right > r.left && c.top < r.bottom && c.bottom > r.top);
      if (!hit) return;
      this.caption.style.bottom = `${this.root.getBoundingClientRect().bottom - hit.top + 12}px`;
    }
  }

  clearCaption(expected?: string): void {
    if (expected !== undefined && this.caption.textContent !== expected) return;
    window.clearTimeout(this.captionTimer);
    this.caption.classList.remove('is-on');
    this.caption.textContent = '';
  }

  setWarning(text: string | null): void {
    if (text === null) {
      this.warning.hidden = true;
      return;
    }
    if (this.warning.textContent !== text) this.warning.textContent = text;
    this.warning.hidden = false;
  }

  toggleHelp(): void {
    this.help.classList.toggle('is-faded');
  }

  /** A touch screen's map opens on request; on a desktop it is shown until put away. */
  toggleMap(): void {
    this.map.classList.toggle(this.touch ? 'is-open' : 'is-closed');
    this.placeCaption();
  }

  setOption(button: HTMLButtonElement, enabled: boolean): void {
    button.setAttribute('aria-pressed', String(enabled));
    button.querySelector('strong')!.textContent = enabled ? text.on : text.off;
  }

  /** The time machine's button shows the year. */
  setEra(past: boolean): void {
    this.past = past;
    this.eraButton.setAttribute('aria-pressed', String(past));
    this.eraButton.querySelector('strong')!.textContent = past ? '1975' : text.era.now;
  }

  /** The showcase's title card: what the scene shows, and when. */
  setShowTitle(title: string | null, sub = ''): void {
    this.showCard.hidden = title === null;
    if (title === null) return;
    this.showCard.querySelector('.hud-show-title')!.textContent = title;
    this.showCard.querySelector('.hud-show-sub')!.textContent = sub;
  }

  /** Screensaver mode hides everything but the view. */
  setScreensaver(on: boolean): void {
    this.root.classList.toggle('is-screensaver', on);
  }

  setPaused(paused: boolean): void {
    const was = this.pause.classList.contains('is-on');
    this.pause.classList.toggle('is-on', paused);
    // The focus starts in the menu. Not modal: with the mouse free, the HUD's own toggles are meant to be used too.
    if (paused && !was) this.pauseCard.focus({ preventScroll: true });
    // The keys are told once, on the menu the game starts with; after that they live in the settings.
    if (!paused && was) for (const intro of this.pause.querySelectorAll<HTMLElement>('.pause-intro')) intro.hidden = true;
    if (!paused && !this.book.hidden) this.showBook(false, false);
    if (!paused && !this.settingsPanel.hidden) this.showSettings(false, false);
    if (!paused && !this.tripPanel.hidden) this.showTrip(false, false);
  }

  /** Asks for a note for the board, put together from the fixed parts in `notePhrases.ts`. Null if cancelled. */
  askNote(): Promise<string | null> {
    return new Promise((resolve) => {
      const t = text.notes;
      const box = document.createElement('form');
      box.className = 'hud-ask';
      box.innerHTML = `<p></p><label><span></span><select name="phrase"></select></label><label><span></span><select name="word"></select></label><p class="hud-ask-preview" aria-live="polite"></p><div><button type="submit"></button><button type="button"></button></div>`;
      const [question, preview] = [...box.querySelectorAll('p')];
      const [phraseLabel, wordLabel] = [...box.querySelectorAll('label')];
      const [phraseSelect, wordSelect] = [...box.querySelectorAll('select')];
      const [ok, no] = [...box.querySelectorAll('button')];
      question.textContent = t.ask;
      phraseLabel.querySelector('span')!.textContent = t.phrase;
      wordLabel.querySelector('span')!.textContent = t.word;
      ok.textContent = t.send;
      no.textContent = t.cancel;
      PHRASES.forEach((p, i) => phraseSelect.add(new Option(p.text.replace(GAP, '…'), String(i))));
      const phrase = () => PHRASES[Number(phraseSelect.value)];
      const group = (label: string, words: string[]) => {
        const g = document.createElement('optgroup');
        g.label = label;
        for (const w of words) g.append(new Option(w));
        wordSelect.append(g);
      };
      const show = () => { preview.textContent = composeNote(phrase(), wordSelect.value); };
      const fill = () => {
        const p = phrase();
        wordSelect.replaceChildren();
        if (p.gap === 'thing' || p.gap === 'any') group(t.things, THINGS);
        if (p.gap === 'station' || p.gap === 'any') group(t.stations, STATIONS);
        wordLabel.hidden = !p.gap;
        show();
      };
      phraseSelect.addEventListener('change', fill);
      wordSelect.addEventListener('change', show);
      fill();
      const done = (value: string | null) => { box.remove(); resolve(value); };
      box.addEventListener('submit', (e) => { e.preventDefault(); done(composeNote(phrase(), wordSelect.value)); });
      no.addEventListener('click', () => done(null));
      // The game's keys stay out while the note is being picked.
      box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } e.stopPropagation(); });
      this.root.appendChild(box);
      phraseSelect.focus();
    });
  }

  async blackout(during: () => void): Promise<void> {
    this.fade.classList.add('is-on');
    await new Promise((r) => window.setTimeout(r, 450));
    during();
    await new Promise((r) => window.setTimeout(r, 250));
    this.fade.classList.remove('is-on');
  }

  /** Names the line the player is on, in the status bar. */
  setLine(name: string): void {
    const upper = name.toUpperCase();
    if (upper === this.lineName) return;
    this.lineName = upper;
    this.lastClock = '';
  }

  /**
   * Where a point along x lies on the map: between the two stations of the
   * tunnel it is in (a portal's by its copy), or just beyond the station it
   * is past.
   */
  private mapPoint(x: number, spots: Array<{ x: number; y: number }>): { x: number; y: number } {
    const xs = this.net.x;
    for (const l of this.net.layout.links) {
      let xa = xs[l.a];
      let xb = xs[l.b];
      if (l.portal) {
        const ghost = xs[l.portal.anchor] + l.portal.shift;
        if (l.portal.dir > 0) xa = ghost; else xb = ghost;
      }
      if (x < xa || x > xb) continue;
      const t = (x - xa) / (xb - xa);
      return { x: spots[l.a].x + (spots[l.b].x - spots[l.a].x) * t, y: spots[l.a].y + (spots[l.b].y - spots[l.a].y) * t };
    }
    let near = 0;
    xs.forEach((sx, i) => { if (Math.abs(sx - x) < Math.abs(xs[near] - x)) near = i; });
    // Beyond a line's end: a little further out, the way the line was going.
    const link = this.net.layout.links.find((l) => l.a === near || l.b === near);
    const from = link ? spots[link.a === near ? link.b : link.a] : spots[near];
    const dx = spots[near].x - from.x;
    const dy = spots[near].y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, Math.abs(x - xs[near]) / 250) * 18;
    return { x: spots[near].x + (dx / len) * k, y: spots[near].y + (dy / len) * k };
  }

  /**
   * The map's stretches, each in the colour of the line whose trains run on it (not the line a shared station belongs
   * to), and moved aside where two lines run between the same stations.
   */
  private mapLinks(): Array<{ a: number; b: number; line: number; shift: number }> {
    if (this.links) return this.links;
    const net = this.net;
    const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
    const count = new Map<string, number>();
    for (const l of net.layout.links) count.set(key(l.a, l.b), (count.get(key(l.a, l.b)) ?? 0) + 1);
    const seen = new Map<string, number>();
    this.links = net.layout.links.map((l) => {
      const k = key(l.a, l.b);
      const n = count.get(k)!;
      const i = seen.get(k) ?? 0;
      seen.set(k, i + 1);
      // Links run from a to b in either order; measure the shift against the same direction for both.
      const flip = l.a > l.b ? -1 : 1;
      return { a: l.a, b: l.b, line: net.routes[l.routes[0]].line, shift: n > 1 ? (i - (n - 1) / 2) * 7 * flip : 0 };
    });
    return this.links;
  }

  /** @param explored where the player has been: the rest of the network is drawn faint until visited */
  drawMap(trains: MapTrain[], player: { x: number; z: number }, explored?: Explored): void {
    const ctx = this.mapCtx;
    // Drawn at the screen's own resolution, so it stays sharp; hidden (a touch screen's closed map), it waits.
    const cssW = this.map.clientWidth;
    const cssH = this.map.clientHeight;
    if (!cssW || !cssH) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (this.map.width !== bw || this.map.height !== bh) { this.map.width = bw; this.map.height = bh; }
    ctx.setTransform(dpr * MAP_ZOOM, 0, 0, dpr * MAP_ZOOM, 0, 0);
    // The window's size in network map units.
    const w = cssW / MAP_ZOOM;
    const h = cssH / MAP_ZOOM;
    const net = this.net;
    this.spots ??= networkMapLayout(net);
    const spots = this.spots;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(249, 249, 246, 0.95)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 2);
    ctx.fill();
    // A window on the network map, following the player.
    const me = this.mapPoint(player.x, spots);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    ctx.translate(Math.round(w / 2 - me.x), Math.round(h / 2 - me.y));

    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Every line in its own colour; stretches you have not travelled yet paler and dashed.
    for (const { a, b, line, shift } of this.mapLinks()) {
      const seen = !explored || explored.tunnels.has(`${a}-${b}`);
      // Where two lines share a stretch (red and green through the city), they run side by side.
      const dx = spots[b].x - spots[a].x;
      const dy = spots[b].y - spots[a].y;
      const len = Math.hypot(dx, dy) || 1;
      const ox = (-dy / len) * shift;
      const oy = (dx / len) * shift;
      ctx.strokeStyle = net.lines[line].color;
      ctx.globalAlpha = seen ? 1 : 0.65;
      ctx.setLineDash(seen ? [] : [6, 5]);
      ctx.beginPath();
      ctx.moveTo(spots[a].x + ox, spots[a].y + oy);
      ctx.lineTo(spots[b].x + ox, spots[b].y + oy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    ctx.font = '600 14px system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(249, 249, 246, 0.9)';
    net.stations.forEach((s, i) => {
      const { x, y, label } = spots[i];
      const seen = !explored || explored.stations.has(i);
      ctx.fillStyle = seen ? '#fff' : '#dfe3e8';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = seen ? '#15283b' : '#8d97a2';
      ctx.save();
      ctx.translate(x, y + (label === 'above' ? -9 : 9));
      ctx.rotate(-0.5);
      ctx.textAlign = label === 'above' ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      // A pale halo keeps names readable where they cross a line.
      ctx.strokeText(s.name, 0, 0);
      ctx.fillText(s.name, 0, 0);
      ctx.restore();
    });

    for (const t of trains) {
      const p = this.mapPoint(t.x, spots);
      const side = (t.z > 0 ? -1 : 1) * Math.min(1, Math.abs(t.z) / 6.6);
      ctx.fillStyle = '#ffb444';
      ctx.strokeStyle = '#6b4a12';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(p.x - 9, p.y + side * 8 - 4, 18, 8, 3);
      ctx.fill();
      ctx.stroke();
    }
    // You: a green dot in a white ring.
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(me.x, me.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1fae62';
    ctx.beginPath();
    ctx.arc(me.x, me.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0b1220';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}
