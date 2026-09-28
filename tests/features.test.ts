import { expect, test } from 'bun:test';
import { composeTune } from '../src/game/busker';
import { approachLimit, gradeStop } from '../src/game/driver';
import { inspectorsAboard } from '../src/game/fares';
import { CAVE_HALF_L, TRAIN_HALF_L, TRAIN_NOSE } from '../src/game/layout';
import { seasonalWeather } from '../src/game/weather';
import { tunnelWind } from '../src/game/wind';

test('wind builds as a train nears the cave mouth and fades once it is in', () => {
  const cx = 500;
  const at = (front: number) => tunnelWind(cx, [{ x: front - (TRAIN_HALF_L + TRAIN_NOSE), speed: 20, dir: 1 }]).strength;
  const mouth = cx - CAVE_HALF_L;
  expect(at(mouth - 500)).toBe(0);
  expect(at(mouth - 200)).toBeGreaterThan(0);
  expect(at(mouth - 50)).toBeGreaterThan(at(mouth - 200));
  expect(at(mouth + 60)).toBeLessThan(at(mouth));
  expect(at(mouth + 100)).toBe(0);
  expect(tunnelWind(cx, [{ x: mouth - 150, speed: 0, dir: 1 }]).strength).toBe(0);
  // Trains leaving in the other direction push nothing toward this station.
  expect(tunnelWind(cx, [{ x: mouth - 150, speed: 20, dir: -1 }]).strength).toBe(0);
});

test('stop grading and the braking curve', () => {
  expect(gradeStop(0.2).score).toBe(100);
  expect(gradeStop(-1.5).score).toBe(80);
  expect(gradeStop(4).score).toBe(50);
  expect(gradeStop(-12).score).toBeGreaterThan(gradeStop(12).score);
  expect(approachLimit(1000)).toBeCloseTo(80 / 3.6);
  expect(approachLimit(0)).toBeLessThan(6.5);
  // The curve always leaves room to stop at the service brake rate.
  for (let d = 0; d < 400; d += 5) expect((approachLimit(d) - 1.5) ** 2 / (2 * 1.2)).toBeLessThan(d + 12 + 1e-6);
});

test('inspectors ride now and then, the same for everyone', () => {
  let aboard = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) if (inspectorsAboard(i % 4, Math.floor(i / 12), i % 12)) aboard++;
  expect(aboard / n).toBeGreaterThan(0.12);
  expect(aboard / n).toBeLessThan(0.25);
  expect(inspectorsAboard(2, 1000, 3)).toBe(inspectorsAboard(2, 1000, 3));
});

test('busker tunes are 32 bars in three-four, in range and in order', () => {
  for (const seed of [1, 2, 3, 99]) {
    const tune = composeTune(seed, 62);
    expect(tune.melody.length).toBeGreaterThan(64);
    for (let i = 1; i < tune.melody.length; i++) expect(tune.melody[i].start).toBeGreaterThanOrEqual(tune.melody[i - 1].start);
    for (const n of tune.melody) {
      expect(n.pitch).toBeGreaterThanOrEqual(62 + 5);
      expect(n.pitch).toBeLessThanOrEqual(62 + 26);
      expect(n.start + n.length).toBeLessThanOrEqual(tune.length + 1e-6);
    }
    // Every tune resolves on the tonic.
    expect((tune.melody[tune.melody.length - 1].pitch - 62) % 12).toBe(0);
  }
});

test('offline weather is a stable daily guess that respects the season', () => {
  const winter = Date.UTC(2026, 0, 10, 12) / 1000;
  expect(seasonalWeather(winter)).toEqual(seasonalWeather(winter + 3600));
  for (let d = 0; d < 45; d++) {
    const w = seasonalWeather(winter + d * 86400);
    expect(w.kind).not.toBe('rain' as never);
    expect(w.temperature).toBeLessThan(3);
  }
  for (let d = 0; d < 60; d++) expect(seasonalWeather(Date.UTC(2026, 6, 1, 12) / 1000 + d * 86400).kind).not.toBe('snow');
});
