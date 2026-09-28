import { lang, text } from './i18n/text';
import { ACTIONS, CHANNELS, FOV, keyName, SENSITIVITY, settings, type Action, type Channel } from './settings';

/**
 * The settings card in the pause menu: sliders for look and sound, and a button per action to rebind its key.
 * Everything is saved as it changes; the game listens through `settings.on`.
 */
export class SettingsPanel {
  /** The action waiting for a key, while one is being rebound. */
  private waiting: Action | null = null;
  /** Rebinding swallows the next key press, so the game must not act on it. */
  get capturing(): boolean {
    return this.waiting !== null;
  }

  /** The game's own switches (sound, real trains, passengers…), kept by the HUD and shown first. */
  private readonly toggles: HTMLElement | null;

  constructor(private readonly panel: HTMLElement, private readonly back: () => void, touch: boolean) {
    this.toggles = panel.querySelector<HTMLElement>('.settings-toggles');
    this.render(touch);
    window.addEventListener('keydown', (e) => {
      if (!this.waiting) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const action = this.waiting;
      this.waiting = null;
      if (e.code !== 'Escape') settings.bind(action, e.code);
      this.render(touch);
      this.panel.querySelector<HTMLElement>(`[data-bind="${action}"]`)?.focus({ preventScroll: true });
    }, { capture: true });
  }

  /** Builds the card in the current language. */
  render(touch: boolean): void {
    const s = settings.value;
    const card = this.panel;
    // The switches move with the card as it is rebuilt (a new language): keep the focus on the one that was pressed.
    const focused = this.toggles?.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    card.replaceChildren();
    // A header that stays at the top while the card scrolls: the way back, then the title.
    const head = document.createElement('div');
    head.className = 'panel-head';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'panel-back';
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '←';
    back.append(arrow, ` ${text.settings.back}`);
    back.addEventListener('click', () => { this.waiting = null; this.back(); });
    const h2 = document.createElement('h2');
    h2.textContent = text.settings.title;
    head.append(back, h2);
    card.append(head);
    if (this.toggles) card.append(this.toggles);
    focused?.focus({ preventScroll: true });

    const section = (title: string) => {
      const el = document.createElement('section');
      el.className = 'settings-section';
      const h3 = document.createElement('h3');
      h3.textContent = title;
      el.append(h3);
      card.append(el);
      return el;
    };
    const slider = (into: HTMLElement, name: string, value: number, range: { min: number; max: number; step: number }, show: (v: number) => string, set: (v: number) => void) => {
      const row = document.createElement('label');
      row.className = 'settings-row';
      const label = document.createElement('span');
      label.textContent = name;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(range.min);
      input.max = String(range.max);
      input.step = String(range.step);
      input.value = String(value);
      const out = document.createElement('output');
      out.textContent = show(value);
      input.setAttribute('aria-valuetext', show(value));
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = show(v);
        input.setAttribute('aria-valuetext', show(v));
        set(v);
      });
      row.append(label, input, out);
      into.append(row);
    };

    const decimals = new Intl.NumberFormat(lang(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const percent = new Intl.NumberFormat(lang(), { style: 'percent' });
    const look = section(text.settings.look);
    slider(look, text.settings.sensitivity, s.sensitivity, SENSITIVITY, (v) => `${decimals.format(v)}×`, (v) => settings.change((x) => { x.sensitivity = v; }));
    slider(look, text.settings.fov, s.fov, FOV, (v) => `${v}°`, (v) => settings.change((x) => { x.fov = v; }));

    const volume = section(text.settings.volume);
    for (const c of CHANNELS) {
      slider(volume, text.settings[c as Channel], s.volume[c], { min: 0, max: 1, step: 0.05 }, (v) => percent.format(v), (v) => settings.change((x) => { x.volume[c] = v; }));
    }

    if (!touch) {
      const keys = section(text.settings.keys);
      const grid = document.createElement('div');
      grid.className = 'settings-keys';
      const names = text.settings.actions as Record<Action, string>;
      for (const action of ACTIONS) {
        const row = document.createElement('div');
        row.className = 'settings-key';
        const label = document.createElement('span');
        label.id = `settings-key-${action}`;
        label.textContent = names[action];
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.bind = action;
        // Named by the action and then its key ("Forward W"), not by the key alone.
        button.id = `settings-bind-${action}`;
        button.setAttribute('aria-labelledby', `${label.id} ${button.id}`);
        button.textContent = this.waiting === action ? text.settings.press : keyName(s.keys[action]);
        button.addEventListener('click', () => {
          this.waiting = action;
          button.textContent = text.settings.press;
          button.classList.add('is-waiting');
        });
        row.append(label, button);
        grid.append(row);
      }
      keys.append(grid);
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'pause-option settings-reset';
      reset.textContent = text.settings.reset;
      reset.addEventListener('click', () => { settings.resetKeys(); this.render(touch); });
      keys.append(reset);
    }
    const pad = document.createElement('p');
    pad.className = 'settings-pad';
    pad.textContent = text.settings.gamepad;
    card.append(pad);

  }
}
