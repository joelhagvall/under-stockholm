import { expect, test } from 'bun:test';
import { STATION_SPACING } from '../src/game/layout';
import { RealSchedule } from '../src/game/realService';
import type { Sighting } from '../src/game/sl';
import { Timetable } from '../src/game/timetable';

const stationX = [0, 1, 2, 3].map((i) => i * STATION_SPACING);
const timetable = new Timetable(stationX);
const T0 = 1_800_000_000;
const GAP = 110;

const sighting = (journey: number, direction: 1 | 2, station: number, time: number): Sighting => ({
  journey, line: '10', direction, destination: direction === 1 ? 'Hjulsta' : 'Kungsträdgården', station, time, atStop: false,
});

/** A westbound journey leaving Kungsträdgården at T0 and every station GAP seconds later. */
const westbound = (id = 1, start = T0) => [0, 1, 2, 3].map((s) => sighting(id, 1, s, start + s * GAP));

function trace(schedule: RealSchedule, from: number, to: number, step = 0.5) {
  const out: { t: number; clock: number; rate: number; x: number; doors: number; phase: string }[] = [];
  for (let t = from; t <= to; t += step) {
    schedule.update(t);
    const c = schedule.slot(0, t);
    if (!c) { out.push({ t, clock: NaN, rate: 0, x: NaN, doors: 0, phase: 'none' }); continue; }
    const st = timetable.stateAt(c.clock);
    out.push({ t, clock: c.clock, rate: c.rate, x: st.x, doors: st.doors, phase: st.phase });
  }
  return out;
}

test('a westbound train stands at each platform with open doors until SL says it leaves', () => {
  const schedule = new RealSchedule(timetable, 6);
  schedule.store.update(westbound(), T0 - 600);
  const run = trace(schedule, T0 - 200, T0 + 3 * GAP + 120);
  for (let s = 0; s < 4; s++) {
    const due = T0 + s * GAP;
    const before = run.find((p) => p.t >= due - 6)!;
    expect(before.phase).toBe('dwell');
    expect(before.doors).toBe(1);
    expect(Math.abs(before.x - stationX[s])).toBeLessThan(1);
    // Gone within a few seconds of the expected departure.
    const after = run.find((p) => p.t >= due + 8)!;
    expect(after.phase).toBe('moving');
  }
});

test('the train clock never runs backwards and the run ends in the west cavern', () => {
  const schedule = new RealSchedule(timetable, 6);
  schedule.store.update(westbound(), T0 - 600);
  const run = trace(schedule, T0 - 200, T0 + 3 * GAP + 200);
  const live = run.filter((p) => p.phase !== 'none');
  for (let i = 1; i < live.length; i++) expect(live[i].clock).toBeGreaterThanOrEqual(live[i - 1].clock);
  // Tunnel runs are slower than the game's own, never faster than a quarter over.
  expect(Math.max(...live.map((p) => p.rate))).toBeLessThanOrEqual(1 / 0.75 + 1e-9);
  expect(run[run.length - 1].phase).toBe('none');
});

test('a later expected departure keeps the train at the platform instead of making it jump', () => {
  const schedule = new RealSchedule(timetable, 6);
  schedule.store.update(westbound(), T0 - 600);
  const run = trace(schedule, T0 - 200, T0 + GAP - 20);
  // SL now says the train leaves T-Centralen 40 s late.
  schedule.store.update([sighting(1, 1, 1, T0 + GAP + 40), sighting(1, 1, 2, T0 + 2 * GAP + 40), sighting(1, 1, 3, T0 + 3 * GAP + 40)], T0 + GAP - 20);
  const rest = trace(schedule, T0 + GAP - 19.5, T0 + GAP + 60);
  const all = [...run, ...rest].filter((p) => p.phase !== 'none');
  for (let i = 1; i < all.length; i++) expect(Math.abs(all[i].x - all[i - 1].x)).toBeLessThan(15);
  expect(rest.find((p) => p.t >= T0 + GAP + 30)!.phase).toBe('dwell');
  expect(rest.find((p) => p.t >= T0 + GAP + 50)!.phase).toBe('moving');
});

test('an eastbound train comes out of the west cavern and ends at Kungsträdgården', () => {
  const schedule = new RealSchedule(timetable, 6);
  // SL lists no departures from Kungsträdgården toward itself; that stop is estimated.
  schedule.store.update([3, 2, 1].map((s) => sighting(2, 2, s, T0 + (3 - s) * GAP)), T0 - 600);
  const run = trace(schedule, T0 - 120, T0 + 4 * GAP + 120);
  const first = run.find((p) => p.phase !== 'none')!;
  expect(first.x).toBeGreaterThan(stationX[3]);
  const atEnd = run.filter((p) => p.phase === 'dwell' && Math.abs(p.x - stationX[0]) < 1);
  expect(atEnd.length).toBeGreaterThan(0);
  expect(run[run.length - 1].phase).toBe('none');
});

test('a journey first seen halfway is placed where it would be by now', () => {
  const schedule = new RealSchedule(timetable, 6);
  // Only Rådhuset and Fridhemsplan are still listed: the train is between T-Centralen and Rådhuset.
  schedule.store.update(westbound().slice(2), T0 + GAP + 30);
  schedule.update(T0 + GAP + 30);
  const c = schedule.slot(0, T0 + GAP + 30)!;
  const st = timetable.stateAt(c.clock);
  expect(st.phase).toBe('moving');
  expect(st.x).toBeGreaterThan(stationX[1]);
  expect(st.x).toBeLessThan(stationX[2]);
});

test('boards show the next real departure per track', () => {
  const schedule = new RealSchedule(timetable, 6);
  schedule.store.update([...westbound(1), ...westbound(3, T0 + 300)], T0 - 600);
  schedule.update(T0 - 100);
  const next = schedule.nextDeparture(1, 1, T0 - 100)!;
  expect(next.journey.id).toBe(1);
  expect(next.departs).toBe(GAP + 100);
  expect(schedule.nextDeparture(1, 2, T0 - 100)).toBeNull();
});

test('a journey with no time on the route yet never hides the next train on the board', () => {
  const schedule = new RealSchedule(timetable, 6);
  // Journey 2 is only known beyond the game's stretch (station 9), as a real trip that starts outside it.
  schedule.store.update([...westbound(1, T0 + 60), sighting(2, 1, 9, T0 + 30)], T0 - 600);
  const next = schedule.nextDeparture(1, 1, T0);
  expect(next?.journey.id).toBe(1);
  expect(next?.departs).toBe(60 + GAP);
});
