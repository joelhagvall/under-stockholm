import { expect, test } from 'bun:test';
import { flooding, hear, MAX_CLIENTS, MAX_PER_ADDRESS, MAX_SENT, MESSAGE_BUDGET, newPlayer, parsePose, readMessage, refill, refused, RIDE_TRIP, snapshots, spendMessage, STALE_MS, WATCH, type Player } from '../server/pose';

const player = (id: number, x: number | null, seen = 0, address = `10.0.0.${id}`): Player => ({ ...newPlayer(id, address, seen), pose: x === null ? null : [x, 0, 1, 0, -1, 0, 0] });

test('each player hears of the others nearest along the line, however many there are', () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const players = Array.from({ length: 200 }, (_, i) => player(i + 1, Math.round(random() * 5000)));
  const out = snapshots(players, 1000);
  for (const me of players) {
    const sent = JSON.parse(out.get(me.id)!) as { n: number; p: number[][] };
    expect(sent.n).toBe(200);
    expect(sent.p.length).toBe(MAX_SENT);
    expect(sent.p.some((r) => r[0] === me.id)).toBe(false);
    // The same distances as sorting everyone for this player (ties may come in either order).
    const x = me.pose![0];
    const nearest = players.filter((o) => o !== me).map((o) => Math.abs(o.pose![0] - x)).sort((a, b) => a - b).slice(0, MAX_SENT);
    expect(sent.p.map((r) => Math.abs(r[1] - x)).sort((a, b) => a - b)).toEqual(nearest);
  }
});

test('players without a place yet, or gone quiet, are not sent, but still hear the others', () => {
  const out = snapshots([player(1, 10, 1000), player(2, null, 1000), player(3, 20, 1000 - STALE_MS - 1)], 1000);
  expect(JSON.parse(out.get(1)!)).toMatchObject({ t: 's', now: 1000, n: 1, p: [] });
  expect(JSON.parse(out.get(2)!).p.map((r: number[]) => r[0])).toEqual([1]);
});

test('a player can send twice what the game sends, and no more', () => {
  const p = player(1, 0);
  let taken = 0;
  // Ten seconds of a client sending twenty a second: the burst, then four a second.
  for (let tick = 0; tick < 20; tick++) {
    for (let i = 0; i < 10; i++) if (spendMessage(p)) taken++;
    refill([p]);
  }
  expect(taken).toBeLessThanOrEqual(MESSAGE_BUDGET + 4 * 10);
  expect(taken).toBeGreaterThanOrEqual(4 * 10);
});

test('only well-formed poses are taken', () => {
  expect(readMessage(JSON.stringify({ t: 'p', p: [1.234, 2, 3, 0.5, 2, 0.1, 0.2] }))).toEqual([1.23, 2, 3, 0.5, 2, 0.1, 0.2]);
  expect(readMessage('{"t":"p","p":[1,2,3]}')).toBeNull();
  expect(readMessage('not json')).toBeNull();
  expect(readMessage(JSON.stringify({ t: 'p', p: [1, 2, 3, 4, 5, 6, 7], pad: 'x'.repeat(300) }))).toBeNull();
  expect(parsePose([Infinity, 0, 0, 0, 0, 0, 0])).toBeNull();
  expect(parsePose([1e9, 0, 0, 0, 0, 0, 0])).toBeNull();
});

test('a watcher stays connected without being placed', () => {
  const p = newPlayer(1, '10.0.0.1', 0);
  hear(p, WATCH, 30_000);
  expect(p.seen).toBe(30_000);
  expect(p.pose).toBeNull();
  hear(p, 'not json', 40_000);
  expect(p.seen).toBe(30_000);
  hear(p, JSON.stringify({ t: 'p', p: [5, 0, 1, 0, -1, 0, 0] }), 50_000);
  expect(p.seen).toBe(50_000);
  expect(p.pose).toEqual([5, 0, 1, 0, -1, 0, 0]);
});

test('a client that floods is told apart from one that only bursts', () => {
  const burst = player(1, 0);
  for (let i = 0; i < MESSAGE_BUDGET + 5; i++) spendMessage(burst);
  expect(flooding(burst)).toBe(false);
  const flood = player(2, 0);
  for (let i = 0; i < 200; i++) spendMessage(flood);
  expect(flooding(flood)).toBe(true);
  // Each tick starts over.
  refill([flood]);
  expect(flooding(flood)).toBe(false);
});

test('one address cannot take the whole relay, and the relay has room for no more than it holds', () => {
  const same = Array.from({ length: MAX_PER_ADDRESS }, (_, i) => player(i + 1, 0, 0, '203.0.113.7'));
  expect(refused(same, '203.0.113.7')).toBe(true);
  expect(refused(same, '203.0.113.8')).toBe(false);
  const full = Array.from({ length: MAX_CLIENTS }, (_, i) => player(i + 1, 0));
  expect(refused(full, '198.51.100.1')).toBe(true);
});

test('a rider on a train SL drives sends its journey, which goes on to the others whole', () => {
  const trip = 4_503_599_627_370_495;
  expect(parsePose([10, 1.1, 2, 0.5, RIDE_TRIP, 3.25, 0.5, trip])).toEqual([10, 1.1, 2, 0.5, RIDE_TRIP, 3.25, 0.5, trip]);
  // A journey only with such a ride, and only a whole number: else the rider is on foot.
  expect(parsePose([10, 1.1, 2, 0.5, 4, 3.25, 0.5, trip])).toEqual([10, 1.1, 2, 0.5, 4, 3.25, 0.5]);
  expect(parsePose([10, 1.1, 2, 0.5, RIDE_TRIP, 3.25, 0.5, 1.5])![4]).toBe(-1);
  expect(parsePose([10, 1.1, 2, 0.5, RIDE_TRIP, 3.25, 0.5])![4]).toBe(-1);
  expect(parsePose([10, 1.1, 2, 0.5, RIDE_TRIP, 3.25, 0.5, trip, 1])).toBeNull();
  const players: Player[] = [
    { ...newPlayer(1, '10.0.0.1', 0), pose: parsePose([10, 1.1, 2, 0.5, RIDE_TRIP, 3.25, 0.5, trip]) },
    { ...newPlayer(2, '10.0.0.2', 0), pose: parsePose([12, 1.1, 2, 0.5, -1, 0, 0]) },
  ];
  const rows = (JSON.parse(snapshots(players, 1).get(2)!) as { p: number[][] }).p;
  expect(rows.find((r) => r[0] === 1)).toEqual([1, 10, 1.1, 2, 0.5, RIDE_TRIP, 3.25, 0.5, trip]);
});
