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
