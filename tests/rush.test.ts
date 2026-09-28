import { expect, test } from 'bun:test';
import { Scene, Vector3 } from 'three';
import { stockholmEpoch } from '../src/game/clock';
import { RUSH_LAYOUT } from '../src/game/layout';
import { RushHour, rushCount, rushProfile } from '../src/game/rush';
import type { Passage } from '../src/game/world/station';

const passage: Passage = {
  busker: new Vector3(7.2, 13.1, 23),
  yaw: 0,
  zone: { min: { x: 3, y: 12, z: 9 }, max: { x: 8, y: 16, z: 159 }, station: 1, area: 'hall', label: 'test' },
  bounds: { x0: 3, x1: 8, z0: 9, z1: 159, y: 13.1 },
  gateZ: 150,
  interactables: [],
};

interface Inside { x: Float32Array; z: Float32Array; state: Uint8Array }

function crowd() {
  const said: string[] = [];
  const escorted: Vector3[] = [];
  const rush = new RushHour(new Scene(), passage, { say: (m) => said.push(m), speak: () => {}, lurch: () => {}, escort: (to) => escorted.push(to) });
  rush.forceBusy = 1;
  return { rush, said, escorted, inside: rush as unknown as Inside };
}

test('the passage is packed at rush hour and nearly empty at night', () => {
  expect(rushCount(0)).toBe(0);
  expect(rushCount(1)).toBe(RUSH_LAYOUT.count);
  expect(rushCount(0.35)).toBeLessThan(RUSH_LAYOUT.count / 3);
  expect(rushProfile(0)).toBeLessThan(0.2);
  expect(rushProfile(80)).toBe(1);
});

test('commuters stay between the walls and slow the player down', () => {
  const { rush, inside } = crowd();
  const feet = new Vector3(5.5, 13.1, 80);
  const time = stockholmEpoch(2026, 9, 23, 8, 0);
  let slowest = 1;
  for (let f = 0; f < 300; f++) {
    rush.update(1 / 60, time + f / 60, feet, Math.PI, null);
    slowest = Math.min(slowest, rush.pace);
  }
  let walking = 0;
  for (let i = 0; i < RUSH_LAYOUT.count; i++) {
    if (inside.state[i] !== 2) continue;
    walking++;
    expect(inside.x[i]).toBeGreaterThan(passage.bounds.x0);
    expect(inside.x[i]).toBeLessThan(passage.bounds.x1);
    expect(Math.abs(inside.z[i] - feet.z)).toBeLessThan(RUSH_LAYOUT.window + 1);
  }
  expect(walking).toBeGreaterThan(RUSH_LAYOUT.count * 0.6);
  expect(slowest).toBeLessThan(0.8);
});

test('an elbow pushes people aside and gets counted', () => {
  const { rush } = crowd();
  const feet = new Vector3(5.5, 13.1, 80);
  const time = stockholmEpoch(2026, 9, 23, 8, 0);
  let shoved = false;
  for (let f = 0; f < 600 && !shoved; f++) {
    rush.update(1 / 60, time + f / 60, feet, Math.PI, null);
    if (rush.interactable.enabled?.()) {
      rush.interactable.act();
      shoved = rush.shoves > 0;
    }
  }
  expect(shoved).toBe(true);
});

test('nobody is simulated when the player is elsewhere', () => {
  const { rush, inside } = crowd();
  rush.update(1 / 60, stockholmEpoch(2026, 9, 23, 8, 0), new Vector3(500, 1.1, 0), 0, null);
  expect(inside.state.every((s) => s === 0)).toBe(true);
  expect(rush.push.length()).toBe(0);
});

test('punches knock people down, and the guards walk you out after a few', () => {
  const { rush, escorted, inside } = crowd();
  const feet = new Vector3(5.5, 13.1, 80);
  const time = stockholmEpoch(2026, 9, 23, 8, 0);
  const lying = () => (inside as unknown as { down: Float32Array }).down.some((d) => d > 0);
  let knocked = false;
  for (let f = 0; f < 1200 && escorted.length === 0; f++) {
    rush.update(1 / 60, time + f / 60, feet, Math.PI, null);
    if (f % 45 === 0) rush.punch();
    knocked ||= lying();
  }
  expect(knocked).toBe(true);
  expect(rush.punches).toBeGreaterThanOrEqual(3);
  expect(escorted.length).toBe(1);
  expect(escorted[0].z).toBeLessThan(passage.bounds.z0);
});
