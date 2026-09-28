import { expect, test } from 'bun:test';
import { stockholmEpoch } from '../src/game/clock';
import { COAST, cutClock, cutOn, cutRate, forceCut, powerOut } from '../src/game/powerCut';

test('a couple of cuts a year, by day and a few minutes long', () => {
  let cuts = 0;
  for (let year = 2026; year < 2036; year++) for (let month = 1; month <= 12; month++) for (let day = 1; day <= 28; day++) {
    const c = cutOn(year, month, day);
    if (!c) continue;
    cuts++;
    expect(c.end - c.start).toBeGreaterThanOrEqual(240);
    expect(c.end - c.start).toBeLessThanOrEqual(420);
    expect(c.start).toBeGreaterThanOrEqual(stockholmEpoch(year, month, day, 7));
    expect(c.end).toBeLessThanOrEqual(stockholmEpoch(year, month, day, 22, 10));
  }
  expect(cuts).toBeGreaterThan(8);
  expect(cuts).toBeLessThan(50);
});

test('the clock runs down, stands, winds up and catches up without a jump', () => {
  const start = stockholmEpoch(2030, 1, 1, 12);
  forceCut(start, 300);
  expect(cutClock(start - 10)).toBe(start - 10);
  expect(powerOut(start + 1)).not.toBeNull();
  expect(powerOut(start + 301)).toBeNull();
  // Standing still in the middle.
  expect(cutClock(start + 100)).toBeCloseTo(cutClock(start + 200));
  expect(cutRate(start + 100)).toBe(0);
  // Continuous and never running backwards.
  let prev = cutClock(start - 0.5);
  for (let t = start; t < start + 5000; t += 0.5) {
    const c = cutClock(t);
    expect(c).toBeGreaterThanOrEqual(prev - 1e-9);
    expect(c - prev).toBeLessThan(0.6);
    prev = c;
  }
  // Back on time in the end.
  expect(cutClock(start + 300 + COAST + 300 / 0.08 + 10)).toBe(start + 300 + COAST + 300 / 0.08 + 10);
});
