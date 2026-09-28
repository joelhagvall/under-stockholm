import { expect, test } from 'bun:test';
import { busyness, serviceOpen, stockholm, stockholmEpoch, sunElevation } from '../src/game/clock';
import { cleanerPose, stationLight } from '../src/game/night';
import { loopStart, Operations, referenceEpoch, serviceOffset, startTime, TRAIN_COUNT } from '../src/game/operations';
import { PLATFORM_HALF_L, TRACK_Z } from '../src/game/layout';
import { Timetable } from '../src/game/timetable';

const timetable = new Timetable([0, 500, 1000, 1500]);
const operations = new Operations(timetable);

test('Stockholm wall time handles both summer and winter offsets', () => {
  expect(stockholm(Date.UTC(2026, 0, 14, 11, 0) / 1000).hour).toBe(12);
  expect(stockholm(Date.UTC(2026, 6, 14, 10, 0) / 1000).hour).toBe(12);
  const epoch = stockholmEpoch(2026, 3, 29, 3, 30);
  const c = stockholm(epoch);
  expect([c.year, c.month, c.day, c.hour, c.minute]).toEqual([2026, 3, 29, 3, 30]);
});

test('weeknights close between one and five, weekend nights run through', () => {
  expect(serviceOpen(stockholmEpoch(2026, 9, 23, 3, 0))).toBe(false); // Wednesday
  expect(serviceOpen(stockholmEpoch(2026, 9, 23, 0, 40))).toBe(true);
  expect(serviceOpen(stockholmEpoch(2026, 9, 23, 5, 1))).toBe(true);
  expect(serviceOpen(stockholmEpoch(2026, 9, 26, 3, 0))).toBe(true); // Saturday morning
  expect(serviceOpen(stockholmEpoch(2026, 9, 27, 3, 0))).toBe(true); // Sunday morning
  expect(serviceOpen(stockholmEpoch(2026, 9, 28, 3, 0))).toBe(false); // Monday morning
  expect(busyness(stockholmEpoch(2026, 9, 23, 8, 0))).toBeGreaterThan(busyness(stockholmEpoch(2026, 9, 23, 11, 0)));
  expect(busyness(stockholmEpoch(2026, 9, 23, 3, 0))).toBe(0);
});

test('trains leave and enter service only at the east turnback, out of sight', () => {
  const night = stockholmEpoch(2026, 9, 23, 0, 0);
  for (let i = 0; i < TRAIN_COUNT; i++) {
    let was = operations.inService(night, i);
    for (let t = night; t < night + 6 * 3600; t += 5) {
      const now = operations.inService(t, i);
      if (now !== was) {
        const state = timetable.stateAt(t + serviceOffset(timetable, i));
        expect(state.u).toBeLessThan(1);
        expect(t - loopStart(timetable, t, serviceOffset(timetable, i))).toBeLessThan(5.01);
      }
      was = now;
    }
  }
});

test('boards know the last train of the night and the first of the morning', () => {
  const lateEvening = stockholmEpoch(2026, 9, 23, 0, 50);
  let t = lateEvening;
  let lastSeen = false;
  for (; t < lateEvening + 3600; t += 20) {
    const a = operations.nextArrival(t, 1, 1);
    if (a && a.last) { lastSeen = true; break; }
  }
  expect(lastSeen).toBe(true);
  const deepNight = stockholmEpoch(2026, 9, 23, 3, 0);
  const first = operations.nextArrival(deepNight, 1, 1)!;
  const arrives = stockholm(deepNight + first.eta);
  expect(arrives.hour).toBe(5);
  expect(arrives.minute).toBeLessThan(10);
});

test('the screenshot reference keeps old ?t= views and lands on a weekday noon', () => {
  const ref = referenceEpoch(timetable);
  const base = timetable.arrival(timetable.stopIndex(0, 1)) - 14;
  expect(timetable.stateAt(ref + 20)).toEqual(timetable.stateAt(20 + base));
  expect(stockholm(ref).hour).toBe(12);
  expect(startTime(timetable, new URLSearchParams('clock=03:10'), true, stockholmEpoch(2026, 9, 23, 15, 0))).toBe(stockholmEpoch(2026, 9, 23, 3, 10));
  expect(startTime(timetable, new URLSearchParams('clock=03:10'), false, 1234)).toBe(1234);
});

test('night dims the stations smoothly and the scrubber stays on the platform', () => {
  expect(stationLight(stockholmEpoch(2026, 9, 23, 12, 0))).toBe(1);
  expect(stationLight(stockholmEpoch(2026, 9, 23, 3, 0))).toBeLessThan(0.6);
  let previous = stationLight(stockholmEpoch(2026, 9, 23, 0, 40));
  for (let m = 41; m < 80; m++) {
    const level = stationLight(stockholmEpoch(2026, 9, 23, 0, 0) + m * 60);
    expect(Math.abs(level - previous)).toBeLessThan(0.12);
    previous = level;
  }
  for (let t = 0; t < 2000; t += 3) {
    const pose = cleanerPose(t);
    expect(Math.abs(pose.x)).toBeLessThan(PLATFORM_HALF_L - 1);
    expect(Math.abs(pose.z)).toBeLessThan(TRACK_Z - 3.5);
    expect(Math.abs(pose.z)).toBeGreaterThan(1.2);
  }
});

test('the sun is up at midsummer noon and down at midwinter midnight', () => {
  expect(sunElevation(stockholmEpoch(2026, 6, 21, 13, 0))).toBeGreaterThan(50);
  expect(sunElevation(stockholmEpoch(2026, 12, 21, 0, 0))).toBeLessThan(-40);
  expect(sunElevation(stockholmEpoch(2026, 12, 21, 12, 0))).toBeLessThan(10);
});
