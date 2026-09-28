import { expect, test } from 'bun:test';
import { Scene, Vector3 } from 'three';
import { EscalatorLife, laneSpot } from '../src/game/escalatorLife';
import { escalatorHeight, escalatorRun } from '../src/game/escalatorMotion';
import text from '../src/game/i18n/sv.json';
import { ESC_ANGLE, ESC_DESIGN, ESC_RISE, ESC_SPEED } from '../src/game/layout';
import type { EscalatorZone } from '../src/game/world/escalator';

const ESC_RUN = escalatorRun(ESC_RISE);
const zone = (dir: 1 | -1): EscalatorZone => ({ wallX: 0, dir, z: 0, rise: ESC_RISE, run: ESC_RUN, stoppedLane: 0, update: () => {} });

test('right is right for the direction of travel, on both lanes and both ends', () => {
  for (const dir of [1, -1] as const) {
    const esc = zone(dir);
    const x = dir * 10;
    const y = escalatorHeight(10, ESC_RISE);
    // Riding up (+z lane) toward +x·dir, the right hand side is +z·dir.
    const up = laneSpot(esc, new Vector3(x, y, ESC_DESIGN.laneCenter + dir * 0.28))!;
    expect(up.lane).toBe(1);
    expect(up.right).toBeGreaterThan(0);
    expect(up.s).toBeCloseTo(10);
    const down = laneSpot(esc, new Vector3(x, y, -ESC_DESIGN.laneCenter - dir * 0.28))!;
    expect(down.lane).toBe(-1);
    expect(down.right).toBeGreaterThan(0);
    expect(down.s).toBeCloseTo(ESC_RUN - 10);
  }
  expect(laneSpot(zone(1), new Vector3(10, escalatorHeight(10, ESC_RISE), 0))).toBeNull();
});

test('standing on the left earns an ursäkta, a sigh and the rule; stepping right a thank you', () => {
  const said: string[] = [];
  const life = new EscalatorLife(new Scene(), { say: (m) => said.push(m), speak: () => {} });
  const esc = zone(1);
  const along = ESC_RUN * 0.8;
  const left = new Vector3(along, escalatorHeight(along, ESC_RISE), ESC_DESIGN.laneCenter - 0.28);
  for (let t = 0; t < 40; t += 0.05) life.update(0.05, [esc], left, true, true, [1], null);
  expect(said).toEqual([text.escalator.excuse, text.escalator.sigh, text.escalator.rule]);
  const right = left.clone().setZ(ESC_DESIGN.laneCenter + 0.28);
  life.update(0.05, [esc], right, true, true, [1], null);
  expect(said[said.length - 1]).toBe(text.escalator.thanks);
  // Standing on the right bothers nobody.
  said.length = 0;
  for (let t = 0; t < 40; t += 0.05) life.update(0.05, [esc], right, true, true, [1], null);
  expect(said).toEqual([]);
});

test('nobody on a running escalator moves slower than its steps, so nobody seems to walk backwards', () => {
  const life = new EscalatorLife(new Scene(), { say: () => {}, speak: () => {} });
  const esc = zone(1);
  const belt = ESC_SPEED * Math.cos(ESC_ANGLE);
  // The player is far off, so the riders only have each other to keep their distance from.
  const away = new Vector3(0, 0, 40);
  const riders = (life as unknown as { riders: Array<{ s: number; wait: number }> }).riders;
  const dt = 0.05;
  for (let t = 0; t < 120; t += dt) {
    const before = riders.map((r) => ({ s: r.s, on: r.wait <= 0 }));
    life.update(dt, [esc], away, true, true, [1], null);
    riders.forEach((r, i) => {
      // Stepping off at the top starts them over at the bottom, which is not riding.
      if (!before[i].on || r.wait > 0 || r.s < before[i].s) return;
      expect(r.s - before[i].s).toBeGreaterThanOrEqual(belt * dt - 1e-9);
    });
  }
});

test('someone who steps on right behind another rides the steps instead of standing still against them', () => {
  const life = new EscalatorLife(new Scene(), { say: () => {}, speak: () => {} });
  const esc = zone(1);
  const belt = ESC_SPEED * Math.cos(ESC_ANGLE);
  const away = new Vector3(0, 0, 40);
  const dt = 0.05;
  life.update(dt, [esc], away, true, true, [1], null);
  const riders = (life as unknown as { riders: Array<{ lane: number; walker: boolean; s: number; wait: number }> }).riders;
  // Two walkers on the up lane, the second just behind the first: closer than they like to keep.
  const [first, second] = riders.filter((r) => r.lane === 1 && r.walker);
  Object.assign(first, { s: 0.5, wait: 0 });
  Object.assign(second, { s: 0, wait: 0 });
  life.update(dt, [esc], away, true, true, [1], null);
  expect(second.s).toBeGreaterThanOrEqual(belt * dt - 1e-9);
});
