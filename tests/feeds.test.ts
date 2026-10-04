import { afterAll, afterEach, expect, setSystemTime, test } from 'bun:test';
import { createFeeds, SL_ALERT_MS, SourceError } from '../server/feedCore';

const realFetch = globalThis.fetch;
afterEach(async () => { await settle(); globalThis.fetch = realFetch; });
afterAll(() => { setSystemTime(); });

// The relay keeps state between tests, so the clock only ever moves forward.
let clock = Date.now();
const advance = (seconds: number) => { clock += seconds * 1000; setSystemTime(new Date(clock)); };
advance(0);

const cors = { 'access-control-allow-origin': '*' };
const background = new Set<Promise<unknown>>();
const waitUntil = (task: Promise<unknown>) => { background.add(task); void task.finally(() => background.delete(task)); };
const settle = () => Promise.all([...background]);
const feeds = createFeeds({ waitUntil });
// Simulated seconds must let their upstream work finish before advancing the clock again.
const ask = async (name: string) => {
  const response = await feeds.handle(new URL(`http://relay/feeds/${name}`), cors);
  await settle();
  return response;
};

function countingFetch(body: (url: string) => unknown) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    await new Promise((r) => setTimeout(r, 5));
    return Response.json(body(url));
  }) as typeof fetch;
  return calls;
}

test('without GTFS keys SL is never asked: the feed is unavailable and the game keeps to the timetable', async () => {
  const calls = countingFetch(() => ({ departures: [] }));
  expect((await ask('sl'))!.status).toBe(502);
  advance(60);
  expect((await ask('sl'))!.status).toBe(502);
  expect(calls.length).toBe(0);
});

test('a crowd of players costs GTFS one fetch', async () => {
  let calls = 0;
  const every = { 9001: { departures: [{ line: { designation: '11' }, journey: { id: 7 }, direction_code: 1, expected: '2026-09-24T08:48:00', destination: 'Akalla' }] } };
  const feeds = createFeeds({ gtfs: async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return every; }, waitUntil });
  const answers = await Promise.all(Array.from({ length: 200 }, () => feeds.handle(new URL('http://relay/feeds/sl'))));
  await settle();
  expect(calls).toBe(1);
  const body = (await answers[0]!.json()) as { data: Record<string, unknown> };
  expect(Object.keys(body.data)).toEqual(['9001']);
  expect(answers[0]!.headers.get('cache-control')).toMatch(/max-age=\d+/);
});

test('until the GTFS timetable is in, the feed is unavailable, and asked again after a pause', async () => {
  let ready = false;
  let calls = 0;
  const feeds = createFeeds({ gtfs: async () => { calls++; return ready ? { 1: { departures: [] } } : null; }, log: () => {}, waitUntil });
  const sl = async () => { const r = (await feeds.handle(new URL('http://relay/feeds/sl')))!; await settle(); return r.status; };
  expect(await sl()).toBe(502);
  expect(await sl()).toBe(502);
  expect(calls).toBe(1);
  ready = true;
  advance(20);
  expect(await sl()).toBe(200);
});

test('SMHI is asked once and only Stockholms län is passed on; unknown feeds are refused', async () => {
  const calls = countingFetch(() => [
    { event: { code: 'SNOW' }, warningAreas: [{ id: 1, affectedAreas: [{ id: 1 }] }, { id: 2, affectedAreas: [{ id: 12 }] }] },
  ]);
  const [a] = await Promise.all([ask('warnings'), ask('warnings'), ask('warnings')]);
  expect(calls.length).toBe(1);
  const body = (await a!.json()) as { data: Array<{ warningAreas: Array<{ id: number }> }> };
  expect(body.data[0].warningAreas.map((x) => x.id)).toEqual([1]);
  expect((await ask('everything'))!.status).toBe(404);
  expect(await feeds.handle(new URL('http://relay/notes'), cors)).toBeNull();
});

test('a failing source is not hammered: one try, then a pause', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response('busy', { status: 429 }); }) as unknown as typeof fetch;
  expect((await ask('deviations'))!.status).toBe(502);
  expect((await ask('deviations'))!.status).toBe(502);
  expect(calls).toBe(1);
});

test('Retry-After from a source is respected', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response('slow down', { status: 429, headers: { 'retry-after': '120' } }); }) as unknown as typeof fetch;
  expect((await ask('weather'))!.status).toBe(502);
  advance(60);
  expect((await ask('weather'))!.status).toBe(502);
  expect(calls).toBe(1);
  advance(70);
  await ask('weather');
  expect(calls).toBe(2);
});

test('SR news reaches the papers through the relay, parsed and twice an hour at most', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response('<feed><title>P4</title><entry><title>Ny park i Kista</title><published>2026-09-23T08:00:00Z</published></entry></feed>');
  }) as unknown as typeof fetch;
  const body = (await (await ask('news'))!.json()) as { data: Array<{ title: string; published: number }> };
  expect(body.data).toEqual([{ title: 'Ny park i Kista', published: Date.parse('2026-09-23T08:00:00Z') / 1000 }]);
  advance(20 * 60);
  await ask('news');
  expect(calls).toBe(1);
});

test('a short GTFS outage keeps every line from the last copy; a long one makes the feed unavailable, with nothing else asked', async () => {
  let gtfsUp = true;
  const every = { 1: { departures: [] }, 2: { departures: [] }, 3: { departures: [] } };
  const feeds = createFeeds({
    gtfs: async () => { if (!gtfsUp) throw new SourceError('opendata.samtrafiken.se 502', 502, 0); return every; },
    log: () => {},
    waitUntil,
  });
  const calls = countingFetch(() => ({ departures: [] }));
  const sl = async () => {
    const response = (await feeds.handle(new URL('http://relay/feeds/sl')))!;
    await settle();
    return response.status === 200 ? Object.keys(((await response.json()) as { data: Record<string, unknown> }).data) : response.status;
  };
  expect(await sl()).toEqual(['1', '2', '3']);
  gtfsUp = false;
  advance(20);
  // The copy from before.
  expect(await sl()).toEqual(['1', '2', '3']);
  // Still down once the copy is too old: unavailable, every line to the timetable at once.
  advance(5 * 60);
  expect(await sl()).toBe(502);
  expect(calls.length).toBe(0);
  // Back up: every line again.
  gtfsUp = true;
  advance(20);
  expect(await sl()).toEqual(['1', '2', '3']);
});

test('usable SL data answers a crowd immediately while one refresh runs, without extending its age', async () => {
  const before = { 1: { departures: [] } };
  const after = { 2: { departures: [] } };
  let release!: (data: typeof after) => void;
  const updating = new Promise<typeof after>((resolve) => { release = resolve; });
  let calls = 0;
  const feeds = createFeeds({ gtfs: async () => ++calls === 1 ? before : updating, waitUntil });
  const url = new URL('http://relay/feeds/sl');
  try {
    const first = await (await feeds.handle(url))!.json() as { at: number };
    advance(16);
    const responses = await Promise.all(Array.from({ length: 200 }, () => feeds.handle(url)));
    expect(calls).toBe(2);
    expect(background.size).toBe(1);
    expect(responses[0]!.headers.get('cache-control')).toBe('public, max-age=0');
    expect(responses[0]!.headers.get('age')).toBe('16');
    expect(await responses[0]!.json()).toEqual({ at: first.at, data: before });
    // After the maximum age, a request must wait for the refresh, even though the old copy still exists.
    advance(5 * 60);
    let answered = false;
    const expired = feeds.handle(url).then((response) => { answered = true; return response; });
    await Promise.resolve();
    expect(answered).toBe(false);
    expect(calls).toBe(2);
    release(after);
    const response = (await expired)!;
    expect(await response.json()).toEqual({ at: clock, data: after });
    expect(response.headers.get('cache-control')).toBe('public, max-age=15');
  } finally {
    // A failing assertion must not leave the test suite waiting on an unresolved refresh.
    release(after);
  }
});

test('a failed background refresh is logged once, respects Retry-After and never serves an expired copy', async () => {
  const data = { 1: { departures: [] } };
  let calls = 0;
  const logs: string[] = [];
  const feeds = createFeeds({
    gtfs: async () => { if (++calls > 1) throw new SourceError('opendata.samtrafiken.se 429', 429, 600_000); return data; },
    waitUntil, log: (message) => logs.push(message),
  });
  const url = new URL('http://relay/feeds/sl');
  const first = await (await feeds.handle(url))!.json() as { at: number };
  advance(16);
  const responses = await Promise.all(Array.from({ length: 20 }, () => feeds.handle(url)));
  await settle();
  expect(calls).toBe(2);
  expect(logs.length).toBe(1);
  expect(await responses[0]!.json()).toEqual({ at: first.at, data });
  advance(120);
  expect((await feeds.handle(url))!.status).toBe(200);
  expect(calls).toBe(2);
  advance(5 * 60);
  expect((await feeds.handle(url))!.status).toBe(502);
  expect(calls).toBe(2);
  expect(logs.length).toBe(1);
});

test('an SL outage past its last copy is told once, after a quarter of an hour, and once more when it is back', async () => {
  let up = true;
  const alerts: string[] = [];
  const feeds = createFeeds({
    gtfs: async () => { if (!up) throw new SourceError('opendata.samtrafiken.se 503', 503, 0); return { 1: { departures: [] } }; },
    alert: (title) => alerts.push(title),
    log: () => {},
    waitUntil,
  });
  const sl = async () => { await feeds.handle(new URL('http://relay/feeds/sl')); await settle(); };
  await sl();
  up = false;
  // Asked every 20 s through the outage, as players would: quiet until a quarter of an hour has passed.
  for (let t = 0; t < SL_ALERT_MS / 1000 - 40; t += 20) { advance(20); await sl(); }
  expect(alerts).toEqual([]);
  for (let t = 0; t < 10 * 60; t += 20) { advance(20); await sl(); }
  expect(alerts).toEqual(['Under Stockholm: SL feed down']);
  up = true;
  advance(20);
  await sl();
  advance(20);
  await sl();
  expect(alerts).toEqual(['Under Stockholm: SL feed down', 'Under Stockholm: SL feed back']);
});

test('a short SL outage, and a relay without keys, tell nobody', async () => {
  let up = true;
  const alerts: string[] = [];
  const feeds = createFeeds({
    gtfs: async () => { if (!up) throw new SourceError('opendata.samtrafiken.se 503', 503, 0); return { 1: { departures: [] } }; },
    alert: (title) => alerts.push(title),
    log: () => {},
    waitUntil,
  });
  const sl = async (f = feeds) => { await f.handle(new URL('http://relay/feeds/sl')); await settle(); };
  await sl();
  up = false;
  for (let t = 0; t < 6 * 60; t += 20) { advance(20); await sl(); }
  up = true;
  advance(20);
  await sl();
  const keyless = createFeeds({ alert: (title) => alerts.push(title), log: () => {}, waitUntil });
  for (let t = 0; t < 30 * 60; t += 60) { advance(60); await sl(keyless); }
  expect(alerts).toEqual([]);
});
