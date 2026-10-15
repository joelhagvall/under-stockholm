import { afterAll, afterEach, expect, setSystemTime, test } from 'bun:test';
import type { Timetable } from '../server/gtfs';
import { gtfsDepartures, type StaticTry, type TimetableStore } from '../server/gtfsFeed';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
afterAll(() => { setSystemTime(); });

const HOUR = 60 * 60 * 1000;
const keys = { realtime: 'rt', static: 'static' };
const tick = () => new Promise((r) => setTimeout(r, 1));

/** A store in memory, as the Durable Object's storage outlives the object. */
function memoryStore(): TimetableStore {
  let attempt: StaticTry | null = null;
  return {
    read: async () => null as Timetable | null,
    write: async () => {},
    readTry: async () => attempt,
    writeTry: async (a) => { attempt = a; },
  };
}

/** Every static download fails, as when SL's export changes or the zip will not read. */
function failingStatic() {
  const calls: number[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes('sl.zip')) calls.push(Date.now());
    return new Response('nope', { status: 500 });
  }) as typeof fetch;
  return calls;
}

test('a month of failed timetable downloads stays inside the static quota of 250', async () => {
  const calls = failingStatic();
  const store = memoryStore();
  let clock = Date.UTC(2026, 9, 1);
  // Players ask every 15 s; the object sleeps and wakes again (a fresh closure on the same storage) every hour.
  for (let hour = 0; hour < 31 * 24; hour++) {
    const sl = gtfsDepartures(keys, store, () => {});
    for (let i = 0; i < 4; i++) {
      setSystemTime(new Date(clock));
      expect(await sl()).toBeNull();
      await tick();
      clock += 15 * 60 * 1000;
    }
  }
  expect(calls.length).toBeLessThan(150);
  // The pause grows to 6 h and stays there.
  const gaps = calls.slice(1).map((t, i) => (t - calls[i]) / HOUR);
  expect(gaps.slice(0, 4)).toEqual([0.75, 1.25, 2.25, 4.25]);
  expect(Math.max(...gaps)).toBeLessThanOrEqual(6.25);
});

test('a restart keeps the pause instead of downloading again at once', async () => {
  const calls = failingStatic();
  const store = memoryStore();
  setSystemTime(new Date(Date.UTC(2026, 9, 1)));
  await gtfsDepartures(keys, store, () => {})();
  await tick();
  expect(calls.length).toBe(1);
  setSystemTime(new Date(Date.UTC(2026, 9, 1) + 10 * 60 * 1000));
  await gtfsDepartures(keys, store, () => {})();
  await tick();
  expect(calls.length).toBe(1);
});

test('the status says what the store holds and how the downloads went, without starting one', async () => {
  const calls = failingStatic();
  const store = memoryStore();
  setSystemTime(new Date(Date.UTC(2026, 9, 1)));
  expect(await gtfsDepartures(keys, store, () => {}).status()).toEqual({ version: null, fetched: null, tried: null, failures: 0, loading: false });
  expect(calls.length).toBe(0);
  const sl = gtfsDepartures(keys, store, () => {});
  await sl();
  expect((await sl.status()).loading).toBe(true);
  await tick();
  expect(await sl.status()).toEqual({ version: null, fetched: null, tried: Date.UTC(2026, 9, 1), failures: 1, loading: false });
});

test('an old timetable is used for as long as it has trips today, whatever a failed download says', async () => {
  const fetched = Date.UTC(2026, 9, 1, 10);
  const table: Timetable = { version: '2026-10-01', fetched, trips: [{ id: 'A', line: '11', direction: 1, destination: 'Akalla', dates: ['20261014'], stops: [[9001, 1, 43200, 43200]] }] };
  const store = { ...memoryStore(), read: async () => table };
  const calls = failingStatic();
  const failing = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => String(input).includes('TripUpdates') ? new Response(new Uint8Array()) : failing(input)) as typeof fetch;
  // Thirteen days after it came, a day it still runs: served, while a new one is tried for.
  setSystemTime(new Date(Date.UTC(2026, 9, 14, 10)));
  expect(await gtfsDepartures(keys, store, () => {})()).not.toBeNull();
  await tick();
  expect(calls.length).toBe(1);
  // The day after its last: none.
  setSystemTime(new Date(Date.UTC(2026, 9, 15, 10)));
  expect(await gtfsDepartures(keys, store, () => {})()).toBeNull();
});

test('a relay told to download less often keeps a day-old timetable without asking', async () => {
  const table: Timetable = { version: '2026-10-01', fetched: Date.UTC(2026, 9, 1, 10), trips: [{ id: 'A', line: '11', direction: 1, destination: 'Akalla', dates: ['20261002'], stops: [[9001, 1, 43200, 43200]] }] };
  const store = { ...memoryStore(), read: async () => table };
  const calls = failingStatic();
  const failing = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => String(input).includes('TripUpdates') ? new Response(new Uint8Array()) : failing(input)) as typeof fetch;
  setSystemTime(new Date(Date.UTC(2026, 9, 2, 12)));
  await gtfsDepartures(keys, store, () => {}, { every: 7 * 24 * HOUR })();
  await tick();
  expect(calls.length).toBe(0);
  await gtfsDepartures(keys, store, () => {})();
  await tick();
  expect(calls.length).toBe(1);
});

test('the first failed download of a row is told, and so is the one that ends it', async () => {
  const told: string[] = [];
  const alert = (title: string) => { told.push(title); };
  failingStatic();
  const store = memoryStore();
  let clock = Date.UTC(2026, 9, 1);
  for (let i = 0; i < 3; i++) {
    setSystemTime(new Date(clock));
    await gtfsDepartures(keys, store, () => {}, { alert })();
    await tick();
    clock += 7 * HOUR;
  }
  expect(told).toEqual(['Under Stockholm: SL timetable download failed']);
});
