import { expect, test } from 'bun:test';
import { DISCOVERIES, DiscoveryBook, discoveriesIn, GROUPS } from '../src/game/discoveries';
import text from '../src/game/i18n/sv.json';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

test('every discovery has a name, a hint and a group', () => {
  const items = text.discover.items as Record<string, string[]>;
  const ids = new Set<string>();
  for (const d of DISCOVERIES) {
    expect(ids.has(d.id)).toBe(false);
    ids.add(d.id);
    expect(items[d.id]?.length).toBe(2);
    expect(GROUPS).toContain(d.group);
  }
  expect(Object.keys(items).sort()).toEqual([...ids].sort());
  for (const g of GROUPS) expect((text.discover.groups as Record<string, string>)[g]).toBeTruthy();
});

test('captions give discoveries away', () => {
  expect(discoveriesIn(text.critters.rat)).toEqual(['rat']);
  // Any line of a list counts.
  expect(discoveriesIn(text.platform.call[2][0])).toEqual(['call']);
  // Templates match whatever was filled in.
  expect(discoveriesIn(text.lost.taken.replace('{item}', 'en nalle').replace('{total}', '3'))).toEqual(['lost']);
  expect(discoveriesIn(text.driver.perfect.replace('{error}', '12'))).toEqual(['perfect']);
  // Long texts count inside a longer message too.
  expect(discoveriesIn(`${text.festive.lucia} `)).toEqual(['lucia']);
  expect(discoveriesIn('Nästa: Kymlinge.')).toEqual([]);
  expect(discoveriesIn('Hej')).toEqual([]);
});

test('the book remembers, once', () => {
  const storage = memory();
  const book = new DiscoveryBook(storage);
  const found: string[] = [];
  book.onFind = (id) => found.push(id);
  book.see(text.critters.pigeons);
  book.see(text.critters.pigeons);
  book.see(text.brake.pulled);
  expect(found).toEqual(['pigeons', 'brake']);
  expect(book.count).toBe(2);
  expect(book.total).toBe(DISCOVERIES.length);
  const again = new DiscoveryBook(storage);
  expect(again.has('pigeons')).toBe(true);
  expect(again.count).toBe(2);
});

test('no text gives away the wrong discovery', () => {
  const at = (path: string): unknown => path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], text);
  const all = (node: unknown): string[] => (typeof node === 'string' ? [node] : Array.isArray(node) ? node.flatMap(all) : node && typeof node === 'object' ? Object.values(node).flatMap(all) : []);
  for (const d of DISCOVERIES) for (const path of d.texts) for (const s of all(at(path))) {
    if (/\{\w+\}/.test(s)) continue;
    expect([path, discoveriesIn(s)]).toEqual([path, [d.id]]);
  }
});
