import { expect, test } from 'bun:test';
import { holiday, occasion } from '../src/game/calendar';
import { stockholmEpoch } from '../src/game/clock';
import { BrakeOverride, BRAKE_HOLD } from '../src/game/emergencyBrake';
import { luciaHours, luciaPose, shoeStation, studentsAboard } from '../src/game/festivities';
import { PLATFORM_HALF_L, PLATFORM_HALF_W, TRACK_Z } from '../src/game/layout';
import { BLUE_LINE, NETWORK, routeTimetables } from '../src/game/line';
import { lostToday } from '../src/game/lostProperty';
import { collectorPose, platformScene } from '../src/game/platformLife';
import { layoutSignals, occupied } from '../src/game/signals';
import { schoolTrip } from '../src/game/carriageLife';
import { workSite } from '../src/game/trackWork';
import { preaching } from '../src/game/preacher';
import { blueOperations } from './blue';

test('the year has its days: Lucia, graduation, weekend nights, trees and fireworks', () => {
  expect(occasion(stockholmEpoch(2026, 12, 13, 8, 0))).toBe('lucia');
  expect(occasion(stockholmEpoch(2026, 6, 4, 15, 0))).toBe('graduation');
  expect(occasion(stockholmEpoch(2026, 6, 6, 15, 0))).not.toBe('graduation'); // Saturday
  expect(occasion(stockholmEpoch(2026, 9, 26, 1, 30))).toBe('party'); // Saturday night
  expect(occasion(stockholmEpoch(2026, 9, 23, 1, 30))).toBeNull(); // Wednesday night
  expect(holiday(stockholmEpoch(2026, 12, 20, 12)).tree).toBe(true);
  expect(holiday(stockholmEpoch(2027, 1, 20, 12)).tree).toBe(false);
  expect(holiday(stockholmEpoch(2026, 6, 19, 12)).wreath).toBe(true);
  expect(holiday(stockholmEpoch(2027, 1, 1, 0, 5)).fireworks).toBe(1);
  expect(holiday(stockholmEpoch(2026, 12, 31, 12)).fireworks).toBe(0);
  expect(holiday(stockholmEpoch(2026, 12, 31, 21)).fireworks).toBeGreaterThan(0);
});

test('the Lucia procession walks the platform, mornings and afternoons', () => {
  expect(luciaHours(stockholmEpoch(2026, 12, 13, 8))).toBe(true);
  expect(luciaHours(stockholmEpoch(2026, 12, 13, 12))).toBe(false);
  for (let t = 0; t < 2000; t += 3) expect(Math.abs(luciaPose(t).x)).toBeLessThan(PLATFORM_HALF_L - 10);
});

test('people on the platform stay on it, and scenes are shared', () => {
  for (let t = 0; t < 3000; t += 2) {
    const p = collectorPose(t, 1000);
    expect(Math.abs(p.x - 1000)).toBeLessThan(PLATFORM_HALF_L);
    expect(Math.abs(p.z)).toBeLessThan(PLATFORM_HALF_W);
  }
  let farewells = 0;
  for (let i = 0; i < 1000; i++) if (platformScene('farewell', i % 6, i, 3)) farewells++;
  expect(farewells).toBeGreaterThan(200);
  expect(farewells).toBeLessThan(400);
  expect(platformScene('runner', 2, 99, 4)).toBe(platformScene('runner', 2, 99, 4));
  expect(studentsAboard(1, 600)).toBe(studentsAboard(1, 900));
  expect(schoolTrip(0, stockholmEpoch(2026, 9, 27, 10))).toBe(false); // Sunday
});

test('lost property: a few things per station and one ringing phone a day', () => {
  const plan = lostToday(20500, 20);
  expect(plan.filter((p) => p.kind === 'phone').length).toBe(1);
  expect(plan.length).toBe(60);
  expect(lostToday(20500, 20)).toEqual(plan);
  expect(lostToday(20501, 20)).not.toEqual(plan);
  expect(shoeStation(stockholmEpoch(2026, 9, 26, 3), 20)).not.toBeNull();
  expect(shoeStation(stockholmEpoch(2026, 9, 23, 3), 20)).toBeNull();
});

test('signals guard every tunnel, red while a train is in the block', () => {
  const signals = layoutSignals(NETWORK, NETWORK.x);
  expect(signals.length).toBeGreaterThan(60);
  for (const s of signals) expect(Math.abs(Math.abs(s.track) - TRACK_Z)).toBeLessThan(1e-9);
  expect(occupied([{ x: 300, z: TRACK_Z }], TRACK_Z, 200, 370)).toBe(true);
  expect(occupied([{ x: 300, z: -TRACK_Z }], TRACK_Z, 200, 370)).toBe(false);
  expect(occupied([{ x: 600, z: TRACK_Z }], TRACK_Z, 200, 370)).toBe(false);
});

test('the summer timetable rests one train per route, only at the east turnback', () => {
  const ops = blueOperations();
  const all = ops.slots.map((_, i) => i);
  const resting = ops.slots.filter((s) => s.summerRest).length;
  expect(resting).toBeGreaterThan(0);
  // Each route keeps most of its trains.
  for (let r = 0; r < ops.timetables.length; r++) expect(ops.slots.filter((s) => s.route === r && !s.summerRest).length).toBeGreaterThan(0);
  const july = stockholmEpoch(2026, 7, 15, 12);
  expect(all.filter((i) => ops.inService(july, i)).length).toBe(all.length - resting);
  const september = stockholmEpoch(2026, 9, 15, 12);
  expect(all.every((i) => ops.inService(september, i))).toBe(true);
});

test('the emergency brake stops the train in the tunnel, then it arrives late at the next station', () => {
  const tt = routeTimetables(BLUE_LINE)[1];
  const k = tt.stopIndex(1, 1);
  const leave = tt.arrival(k) + tt.stopDuration(k) + 20;
  const state = tt.stateAt(leave);
  expect(state.phase).toBe('moving');
  const brake = new BrakeOverride(tt, 1000, leave, state);
  const stopped = brake.stateAt(1000 + 15);
  expect(stopped.speed).toBe(0);
  expect(brake.standing(1000 + 15)).toBe(true);
  let x = state.x;
  for (let t = 1000; t < brake.arrive; t += 0.5) {
    const s = brake.stateAt(t);
    expect(s.x).toBeGreaterThanOrEqual(x - 1e-6);
    x = s.x;
  }
  expect(brake.stateAt(brake.arrive).x).toBeCloseTo(tt.stationX[tt.stops[state.next].station], 1);
  // The timetable, offset by the lag, has the train arriving right then (give or take rounding in the sum).
  expect(tt.stateAt(brake.arrive + brake.lag + 1e-6).phase).not.toBe('moving');
  expect(brake.arrive - 1000).toBeGreaterThan(BRAKE_HOLD);
});

test('night work moves nightly', () => {
  const pairs: Array<[number, number]> = [[0, 1], [1, 2], [2, 3]];
  const night = stockholmEpoch(2026, 9, 23, 2);
  expect(workSite(night, pairs)).toEqual(workSite(night + 3600, pairs));
});

test('the street preacher keeps her hours, the same for everyone', () => {
  let days = 0;
  for (let d = 0; d < 100; d++) {
    const noon = stockholmEpoch(2026, 9, 1, 12) + d * 86400;
    if (preaching(noon)) days++;
    expect(preaching(noon)).toBe(preaching(noon + 3600));
    expect(preaching(noon - 4 * 3600)).toBe(false);
  }
  expect(days).toBeGreaterThan(50);
  expect(days).toBeLessThan(90);
});
