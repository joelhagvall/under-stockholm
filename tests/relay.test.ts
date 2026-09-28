import { afterEach, expect, test } from 'bun:test';
import { relayFeed } from '../src/game/relay';
import { fetchDepartures, realTrainsAvailable } from '../src/game/sl';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.VITE_GHOSTS_URL;
});

function stub(answer: () => Response | Promise<Response>) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => { calls.push(String(input)); return answer(); }) as typeof fetch;
  return calls;
}

test('a relay without a copy gives nothing, and is asked again next time', async () => {
  process.env.VITE_GHOSTS_URL = 'ws://relay.test/ghosts';
  const calls = stub(() => Response.json({ error: 'unavailable' }, { status: 502 }));
  expect(await relayFeed('deviations')).toBeNull();
  expect(await relayFeed('deviations')).toBeNull();
  expect(calls.length).toBe(2);
});

test('without a relay there are no real trains and SL is never asked', async () => {
  const calls = stub(() => Response.json({ departures: [] }));
  expect(realTrainsAvailable()).toBe(false);
  await expect(fetchDepartures([9001, 9002])).rejects.toThrow('relay');
  expect(calls.length).toBe(0);
});

test('with a relay, every station comes from its one shared copy', async () => {
  process.env.VITE_GHOSTS_URL = 'ws://relay.test/ghosts';
  const calls = stub(() => Response.json({ at: 1_000_000, data: { 9001: { departures: [] } } }));
  expect(realTrainsAvailable()).toBe(true);
  const { lists, at } = await fetchDepartures([9001, 9002]);
  expect(lists).toEqual([{ departures: [] }, {}]);
  expect(at).toBe(1000);
  expect(calls).toEqual(['http://relay.test/feeds/sl']);
});

// Last: it leaves the relay marked as down for a minute.
test('a relay that does not answer sends the caller to the source', async () => {
  process.env.VITE_GHOSTS_URL = 'ws://relay.test/ghosts';
  stub(() => { throw new TypeError('connection refused'); });
  expect(await relayFeed('deviations')).toBeNull();
});
