/**
 * The player's settings: look sensitivity, field of view, volumes and key bindings, kept in `localStorage`.
 * Keys are `KeyboardEvent.code`s, so WASD sits in the same place on AZERTY and Dvorak.
 */

const KEY = 'under-stockholm:settings';

/** What a key can be bound to. Escape always pauses and the arrow keys always walk. */
export const ACTIONS = ['forward', 'back', 'left', 'right', 'run', 'jump', 'sit', 'use', 'punch', 'drive', 'map', 'help', 'mute', 'passengers', 'motion', 'pixels', 'ghosts', 'screensaver'] as const;
export type Action = (typeof ACTIONS)[number];

export const DEFAULT_KEYS: Record<Action, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', run: 'ShiftLeft', jump: 'Space',
  sit: 'KeyF', use: 'KeyE', punch: 'KeyQ', drive: 'KeyK', map: 'KeyL', help: 'KeyH', mute: 'KeyM',
  passengers: 'KeyN', motion: 'KeyV', pixels: 'KeyP', ghosts: 'KeyG', screensaver: 'KeyB',
};

export type Channel = 'master' | 'announcements' | 'ambience' | 'trains';
export const CHANNELS: Channel[] = ['master', 'announcements', 'ambience', 'trains'];

export interface Settings {
  /** Multiplies mouse, touch and gamepad look speed. */
  sensitivity: number;
  /** Vertical field of view in degrees. */
  fov: number;
  volume: Record<Channel, number>;
  keys: Record<Action, string>;
}

export const SENSITIVITY = { min: 0.25, max: 3, step: 0.05 };
export const FOV = { min: 60, max: 100, step: 1, initial: 72 };

function defaults(): Settings {
  return { sensitivity: 1, fov: FOV.initial, volume: { master: 1, announcements: 1, ambience: 1, trains: 1 }, keys: { ...DEFAULT_KEYS } };
}

const clamp = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

function load(): Settings {
  const s = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    s.sensitivity = clamp(raw.sensitivity, SENSITIVITY.min, SENSITIVITY.max, 1);
    s.fov = clamp(raw.fov, FOV.min, FOV.max, FOV.initial);
    for (const c of CHANNELS) s.volume[c] = clamp(raw.volume?.[c], 0, 1, 1);
    for (const a of ACTIONS) if (typeof raw.keys?.[a] === 'string') s.keys[a] = raw.keys[a];
  } catch { /* Defaults. */ }
  return s;
}

type Listener = (s: Settings) => void;

class Store {
  readonly value: Settings = load();
  private readonly listeners: Listener[] = [];

  on(listener: Listener): void {
    this.listeners.push(listener);
    listener(this.value);
  }

  change(edit: (s: Settings) => void): void {
    edit(this.value);
    try { localStorage.setItem(KEY, JSON.stringify(this.value)); } catch { /* Session only. */ }
    for (const l of this.listeners) l(this.value);
  }

  /** Binds `code` to `action`; an action that had it takes the old key instead, so nothing is left unbound. */
  bind(action: Action, code: string): void {
    this.change((s) => {
      const old = s.keys[action];
      for (const a of ACTIONS) if (a !== action && s.keys[a] === code) s.keys[a] = old;
      s.keys[action] = code;
    });
  }

  resetKeys(): void {
    this.change((s) => { s.keys = { ...DEFAULT_KEYS }; });
  }

  /** The action a key is bound to, if any. The right Shift runs too. */
  action(code: string): Action | null {
    const keys = this.value.keys;
    for (const a of ACTIONS) if (keys[a] === code) return a;
    if (code === 'ShiftRight' && keys.run === 'ShiftLeft') return 'run';
    return null;
  }

  key(action: Action): string {
    return this.value.keys[action];
  }
}

export const settings = new Store();

/** A short label for a key code: `KeyW` is W, `ShiftLeft` is Shift, `Digit1` is 1. */
export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] ?? code;
  const names: Record<string, string> = {
    ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt',
    MetaLeft: 'Cmd', MetaRight: 'Cmd', Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: '⌫', CapsLock: 'Caps',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`',
  };
  return names[code] ?? code;
}

/** A prompt such as `E · Sätt upp en lapp` with its leading key swapped for whatever the player bound that action to. */
export function rebindPrompt(prompt: string): string {
  const m = /^(E|F) · /.exec(prompt);
  if (!m) return prompt;
  return `${keyName(settings.key(m[1] === 'E' ? 'use' : 'sit'))} · ${prompt.slice(m[0].length)}`;
}

/** A line such as "Tryck F för att resa dig" with the key swapped for the one the player bound. */
export function rebindText(message: string): string {
  return message.replace(/\b(Tryck|Press) (E|F)\b/, (_, verb: string, key: string) => `${verb} ${keyName(settings.key(key === 'E' ? 'use' : 'sit'))}`);
}
