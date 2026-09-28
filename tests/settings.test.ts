import { expect, test } from 'bun:test';

// A small in-memory localStorage, installed before the modules read it.
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
});
const { ACTIONS, DEFAULT_KEYS, keyName, rebindPrompt, rebindText, settings } = await import('../src/game/settings');
const { savedPlace, savePlace } = await import('../src/place');

test('every action has its own default key', () => {
  const keys = ACTIONS.map((a) => DEFAULT_KEYS[a]);
  expect(new Set(keys).size).toBe(keys.length);
});

test('binding a taken key swaps it, so nothing is left unbound', () => {
  settings.bind('forward', 'KeyE');
  expect(settings.key('forward')).toBe('KeyE');
  expect(settings.key('use')).toBe('KeyW');
  expect(settings.action('KeyE')).toBe('forward');
  expect(rebindPrompt('E · Sätt upp en lapp')).toBe('W · Sätt upp en lapp');
  expect(rebindText('Du sitter ner. Tryck F för att resa dig.')).toBe('Du sitter ner. Tryck F för att resa dig.');
  expect(JSON.parse(store.get('under-stockholm:settings')!).keys.forward).toBe('KeyE');
  settings.resetKeys();
  expect(settings.key('use')).toBe('KeyE');
  expect(settings.action('ShiftRight')).toBe('run');
});

test('key names are short', () => {
  expect(keyName('KeyW')).toBe('W');
  expect(keyName('ShiftLeft')).toBe('Shift');
  expect(keyName('Digit4')).toBe('4');
  expect(keyName('ArrowUp')).toBe('↑');
});

test('a saved place comes back, and an old one is forgotten', () => {
  savePlace({ x: 1, y: 2, z: 3, yaw: 0.5, station: 'Slussen', at: Date.now() });
  expect(savedPlace()?.station).toBe('Slussen');
  savePlace({ x: 1, y: 2, z: 3, yaw: 0.5, station: 'Slussen', at: Date.now() - 40 * 24 * 3600 * 1000 });
  expect(savedPlace()).toBeNull();
});
