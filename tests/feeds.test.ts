import { afterAll, afterEach, expect, setSystemTime, test } from 'bun:test';
import { handleFeeds } from '../server/feeds';
import { LINES } from '../src/landing/lines';

const STATIONS = LINES[0].stations;

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
afterAll(() => { setSystemTime(); });

// The relay keeps state between tests, so the clock only ever moves forward.
let clock = Date.now();
const advance = (seconds: number) => { clock += seconds * 1000; setSystemTime(new Date(clock)); };
advance(0);

const cors = { 'access-control-allow-origin': '*' };
const ask = (name: string) => handleFeeds(new URL(`http://relay/feeds/${name}`), cors);
const stations = async () => Object.keys(((await (await ask('sl'))!.json()) as { data: Record<string, unknown> }).data).length;

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

test('a crowd of players costs SL no more than one budget of requests', async () => {
  const calls = countingFetch(() => ({ departures: [{ line: { designation: '11' }, journey: { id: 7 }, direction_code: 1, expected: '2026-09-24T08:48:00', destination: 'Akalla', deviations: ['dropped'] }] }));
  const answers = await Promise.all(Array.from({ length: 200 }, () => ask('sl')));
  expect(calls.length).toBe(12);
  const body = (await answers[0]!.json()) as { at: number; data: Record<string, { departures: Array<Record<string, unknown>> }> };
  expect(Object.keys(body.data).length).toBe(12);
  // Only the fields the game reads are passed on.
  expect(Object.values(body.data)[0].departures[0].deviations).toBeUndefined();
  expect(answers[0]!.headers.get('cache-control')).toMatch(/max-age=\d+/);
  // Still fresh: nobody else reaches SL.
  await ask('sl');
  expect(calls.length).toBe(12);
});

test('however often players ask, SL gets at most 12 requests a minute and every station stays fresh', async () => {
  const calls = countingFetch(() => ({ departures: [] }));
  const lastAsked = new Map<string, number>();
  let worstGap = 0;
  for (let step = 0; step < 10 * 60; step++) {
    advance(1);
    await ask('sl');
    for (const url of calls.splice(0)) {
      const site = /sites\/(\d+)\//.exec(url)![1];
      if (lastAsked.has(site)) worstGap = Math.max(worstGap, clock - lastAsked.get(site)!);
      lastAsked.set(site, clock);
      lastAsked.set(`n${step}`, (lastAsked.get(`n${step}`) ?? 0) + 1);
    }
  }
  // Any 60 s window, not just whole minutes.
  const sent = Array.from({ length: 600 }, (_, s) => lastAsked.get(`n${s}`) ?? 0);
  const windows = Array.from({ length: 541 }, (_, start) => sent.slice(start, start + 60).reduce((a, b) => a + b));
  expect(Math.max(...windows)).toBeLessThanOrEqual(12);
  expect(worstGap).toBeLessThanOrEqual(120_000);
  expect(await stations()).toBe(STATIONS.length);
});

test('one station failing keeps its last list instead of failing the whole line', async () => {
  const broken = STATIONS[3].site;
  const calls = countingFetch(() => ({ departures: [] }));
  const counting = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => (String(input).includes(`/sites/${broken}/`) ? new Response('oops', { status: 500 }) : counting(input))) as typeof fetch;
  for (let i = 0; i < 24; i++) {
    advance(5);
    expect((await ask('sl'))!.status).toBe(200);
  }
  expect(calls.length).toBeGreaterThan(0);
  expect(await stations()).toBe(STATIONS.length);
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
  expect(await handleFeeds(new URL('http://relay/notes'), cors)).toBeNull();
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
