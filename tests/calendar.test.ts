import { expect, test } from 'bun:test';
import { brokenTube, dayNumber, escalatorOutOfOrder, occasion, squeakyEscalator } from '../src/game/calendar';
import { serviceOpen, stockholm, stockholmEpoch } from '../src/game/clock';
import { joggerPose, sleeperPose, trainPassengerPoses } from '../src/game/crowd';
import { escalatorHeight, escalatorRun } from '../src/game/escalatorMotion';
import { tubeOn } from '../src/game/effects';
import { CAVE_HALF_L, ESC_RISE, PLATFORM_HALF_W, PLATFORM_Y } from '../src/game/layout';
import { Operations } from '../src/game/operations';
import { Timetable } from '../src/game/timetable';

test('a Stockholm day changes at local midnight, not UTC midnight', () => {
  const late = stockholmEpoch(2026, 9, 23, 23, 50);
  const early = stockholmEpoch(2026, 9, 24, 0, 10);
  expect(dayNumber(early) - dayNumber(late)).toBe(1);
  expect(dayNumber(stockholmEpoch(2026, 9, 24, 1, 30))).toBe(dayNumber(early));
});

test('occasions follow the calendar', () => {
  expect(occasion(stockholmEpoch(2026, 10, 4, 12, 0))).toBe('buns');
  expect(occasion(stockholmEpoch(2026, 8, 14, 21, 0))).toBe('crayfish');
  expect(occasion(stockholmEpoch(2026, 9, 25, 16, 30))).toBe('friday');
  expect(occasion(stockholmEpoch(2026, 9, 27, 8, 0))).toBe('sunday');
  expect(occasion(stockholmEpoch(2026, 9, 23, 12, 0))).toBeNull();
});

test('escalators break on some days, the same for everyone all day', () => {
  const broken = [0, 0, 0, 0];
  for (let d = 0; d < 400; d++) {
    const morning = stockholmEpoch(2026, 1, 1, 6, 0) + d * 86400;
    const evening = morning + 14 * 3600;
    for (let s = 0; s < 4; s++) {
      expect(escalatorOutOfOrder(morning, s)).toBe(escalatorOutOfOrder(evening, s));
      if (escalatorOutOfOrder(morning, s)) broken[s]++;
    }
  }
  for (const count of broken) {
    expect(count / 400).toBeGreaterThan(0.05);
    expect(count / 400).toBeLessThan(0.25);
  }
  const week = stockholmEpoch(2026, 9, 21, 12, 0);
  expect(squeakyEscalator(week, 4)).toBe(squeakyEscalator(week + 2 * 86400, 4));
  expect(brokenTube(2, 30)).toBe(brokenTube(2, 30));
  expect(brokenTube(2, 30)).toBeLessThan(30);
});

test('the broken tube mostly stays lit and flickers in bursts', () => {
  let lit = 0;
  for (let t = 0; t < 3600; t += 0.05) if (tubeOn(t, 1)) lit++;
  const share = lit / (3600 / 0.05);
  expect(share).toBeGreaterThan(0.7);
  expect(share).toBeLessThan(0.97);
});

test('the Sunday jogger runs along the platform and up the escalator, never through a wall', () => {
  for (const dir of [1, -1] as const) {
    let seenUp = false;
    for (let t = 0; t < 150; t += 0.25) {
      const pose = joggerPose(t, dir, { rise: ESC_RISE, run: escalatorRun(ESC_RISE) });
      if (!pose) continue;
      const along = pose.x * dir - CAVE_HALF_L;
      if (along > 0) {
        seenUp = true;
        expect(along).toBeLessThanOrEqual(escalatorRun(ESC_RISE));
        expect(pose.y).toBeCloseTo(escalatorHeight(along, ESC_RISE));
      } else {
        expect(Math.abs(pose.z)).toBeLessThan(PLATFORM_HALF_W - 1.1);
        expect(pose.y ?? PLATFORM_Y).toBe(PLATFORM_Y);
      }
    }
    expect(seenUp).toBe(true);
  }
});

test('the sleeper takes a seat nobody else sits on', () => {
  const sleeper = sleeperPose();
  expect(trainPassengerPoses().some((p) => Math.abs(p.x - sleeper.x) < 0.2 && Math.abs(p.z - sleeper.z) < 0.2)).toBe(false);
  expect(sleeper.seated).toBe(true);
});

test('the evening boards know when the last train before the night break leaves', () => {
  const timetable = new Timetable([0, 500, 1000, 1500]);
  const operations = new Operations({ slots: Array.from({ length: 6 }, (_, i) => ({ timetable, offset: (i * timetable.cycle) / 6, route: 0, line: 0 })), timetables: [timetable] });
  const k = timetable.stopIndex(1, 1);
  const evening = stockholmEpoch(2026, 9, 23, 22, 30); // Wednesday
  const eta = operations.lastArrival(evening, 1, 1)!;
  expect(eta).not.toBeNull();
  const last = stockholm(evening + eta);
  expect(last.hour === 0 || last.hour === 1).toBe(true);
  // Its loop started before the break, so it may call a little after one.
  expect(last.hour * 60 + last.minute).toBeLessThan(75);
  // Nothing after it until the morning.
  const after = evening + eta + timetable.stopDuration(k) + 1;
  const next = operations.nextArrival(after, 1, 1)!;
  expect(stockholm(after + next.eta).hour).toBeGreaterThanOrEqual(5);
  // Friday night runs all night: no last train.
  expect(operations.lastArrival(stockholmEpoch(2026, 9, 25, 22, 30), 1, 1)).toBeNull();
});
