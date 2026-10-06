import { expect, test } from 'bun:test';
import { TRACK_Z } from '../src/game/layout';
import { BLUE_LINE, ghostX, NETWORK, routeTimetables } from '../src/game/line';
import { trunkHeadway } from './blue';
import { Silverpilen } from '../src/game/silverpilen';
import { CLEAR, HOLD, RealSilverpilen, type Rival } from '../src/game/silverReal';

const routes = routeTimetables(BLUE_LINE);
const ghostRoute = BLUE_LINE.routes.findIndex((r) => r.number === BLUE_LINE.ghost.route);
const silver = new Silverpilen(routes[ghostRoute], trunkHeadway, ghostX(NETWORK));
const HOUR = 493000;
const START = silver.runStart(HOUR);

test('with no real trains about she runs at her called minute, as by the timetable', () => {
  const real = new RealSilverpilen(silver);
  expect(real.update(START - 1, [])).toBeNull();
  for (let t = START; t < START + silver.duration(HOUR); t += 1) {
    const s = real.update(t, [])!;
    const plain = silver.stateAt(t)!;
    expect(s.x).toBeCloseTo(plain.x, 6);
    expect(s.opacity).toBeCloseTo(plain.opacity, 6);
  }
});

test('she waits in the east turnback until the train ahead is half a headway along', () => {
  const real = new RealSilverpilen(silver);
  const ahead: Rival = { x: silver.xEast + 200, z: -TRACK_Z };
  let set = -1;
  for (let t = START; t < START + 900; t += 1) {
    ahead.x = silver.xEast + 200 + (t - START) * 10;
    if (real.update(t, [ahead])) { set = t; break; }
  }
  expect(set).toBeGreaterThan(START);
  expect(ahead.x - silver.xEast).toBeGreaterThanOrEqual(silver.lead());
  // A train on the other track never holds her.
  expect(new RealSilverpilen(silver).update(START, [{ x: silver.xEast + 200, z: TRACK_Z }])).not.toBeNull();
});

test('a train standing ahead holds her in the tunnel, and she goes on when it leaves', () => {
  const real = new RealSilverpilen(silver);
  const standing: Rival = { x: silver.xEast + silver.lead() + 400, z: -TRACK_Z };
  let t = START;
  let s = real.update(t, [standing])!;
  for (; t < START + 300; t += 0.5) s = real.update(t, [standing])!;
  expect(s.opacity).toBe(1);
  expect(s.speed).toBeLessThan(0.1);
  expect(standing.x - s.x).toBeGreaterThanOrEqual(HOLD - 1);
  const waited = s.x;
  standing.x = 1e6;
  for (let k = 0; k < 60; k++, t += 0.5) s = real.update(t, [standing])!;
  expect(s.x).toBeGreaterThan(waited + 50);
});

test('held past her patience, she fades and the hour is spent', () => {
  const real = new RealSilverpilen(silver);
  const standing: Rival = { x: silver.xEast + silver.lead() + 100, z: -TRACK_Z };
  let gone = -1;
  for (let t = START; t < START + 900; t += 0.5) if (!real.update(t, [standing]) && t > START) { gone = t; break; }
  expect(gone).toBeGreaterThan(START + 4 * 60);
  expect(real.update(gone + 30, [])).toBeNull();
});

test('a real train catching up from behind makes her fade where she is', () => {
  const real = new RealSilverpilen(silver);
  const mid = START + 200;
  for (let t = START; t < mid; t += 1) expect(real.update(t, [])).not.toBeNull();
  const here = real.update(mid, [])!;
  const behind: Rival = { x: here.x - CLEAR + 10, z: -TRACK_Z };
  real.update(mid + 1, [behind]);
  const fading = real.update(mid + 2, [behind])!;
  expect(fading.opacity).toBeLessThan(here.opacity);
  let gone = -1;
  for (let t = mid + 2; t < mid + 20; t += 0.5) if (!real.update(t, [behind])) { gone = t; break; }
  expect(gone - mid).toBeLessThan(6);
  expect(real.update(gone + 30, [])).toBeNull();
});

test('a run under way when SL takes over goes on where it was', () => {
  const real = new RealSilverpilen(silver);
  const t = START + 120;
  real.adopt(t);
  expect(real.update(t, [])!.x).toBeCloseTo(silver.stateAt(t)!.x, 6);
});
