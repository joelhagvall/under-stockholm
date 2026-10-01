import { afterEach, expect, spyOn, test } from 'bun:test';
import { reloadForNewer, reopening, staleBuild } from '../src/place';

const descriptors = ['sessionStorage', 'location'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
let clock: ReturnType<typeof spyOn> | null = null;
afterEach(() => {
  clock?.mockRestore();
  clock = null;
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function browser() {
  const storage = new Map<string, string>();
  let now = 100_000;
  let reloads = 0;
  clock = spyOn(Date, 'now').mockImplementation(() => now);
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { reload: () => { reloads++; } } });
  return { advance: (ms: number) => { now += ms; }, get reloads() { return reloads; } };
}

test('missing imports, CSS and invalid WASM headers can recover, other failures cannot', () => {
  for (const message of [
    'TypeError: Failed to fetch dynamically imported module: /assets/boot-old.js',
    'TypeError: error loading dynamically imported module: /assets/boot-old.js',
    'TypeError: Importing a module script failed.',
    'Error: Unable to preload CSS for /assets/boot-old.css',
    'CompileError: WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 44 4f @+0',
    'CompileError: WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 4e 6f 74 20 @+0',
    'CompileError: wasm validation error: at offset 0: failed to match magic number',
  ]) expect(staleBuild(message)).toBe(true);
  for (const message of ['CompileError: WebAssembly.instantiate(): invalid opcode', 'Error: WebGL context lost', 'TypeError: undefined is not an object']) {
    expect(staleBuild(new Error(message))).toBe(false);
  }
});

test('a reload reopens the requested game or view once, without an immediate reload loop', () => {
  const b = browser();
  const opening = { showcase: false, again: true, station: 'Kista', life: true };
  expect(reloadForNewer(opening)).toBe(true);
  expect(b.reloads).toBe(1);
  expect(reopening()).toEqual(opening);
  expect(reopening()).toBeNull();
  expect(reloadForNewer(opening)).toBe(false);
  expect(b.reloads).toBe(1);
  b.advance(60_000);
  expect(reloadForNewer({ view: 'natet' })).toBe(true);
  expect(reopening()).toEqual({ view: 'natet' });
  expect(reloadForNewer({ view: 'natet' })).toBe(false);
  expect(b.reloads).toBe(2);
});

test('without session storage the reload guard refuses to start a loop', () => {
  const b = browser();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('storage denied'); } });
  expect(reloadForNewer({})).toBe(false);
  expect(reopening()).toBeNull();
  expect(b.reloads).toBe(0);
});
