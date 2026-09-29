import { expect, test } from 'bun:test';
import { Scene, Vector3 } from 'three';
import { stockholmEpoch } from '../src/game/clock';
import text from '../src/game/i18n/sv.json';
import { escalatorRun } from '../src/game/escalatorMotion';
import { CAVE_HALF_L, PLATFORM_Y } from '../src/game/layout';
import { Preacher, preaching } from '../src/game/preacher';
import type { Train } from '../src/game/train';
import type { StationInfo } from '../src/game/world/station';

// Her sign is painted on a canvas; the tests only need one to exist.
const context = new Proxy({}, { get: (_, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };

// A deep station, as the blue line's T-Centralen is: its hall lies 21 m over the platform.
const RISE = 21;
const ESC_RUN = escalatorRun(RISE);
const HALL_Y = PLATFORM_Y + RISE;
const station = { index: 1, name: 'T-Centralen', cx: 0, exitDir: 1, rise: RISE, escalator: { rise: RISE, run: ESC_RUN }, hall: { x0: CAVE_HALF_L + ESC_RUN, x1: CAVE_HALF_L + ESC_RUN + 32, y: HALL_Y }, hallX: (a: number) => CAVE_HALF_L + ESC_RUN + a } as StationInfo;
/** A point in the ticket hall, `a` meters along it from the escalator top. */
const hall = (a: number, z = 3.4, y = HALL_Y) => new Vector3(CAVE_HALF_L + ESC_RUN + a, y, z);
const inHall = { station: 1, area: 'hall' as const };
const elsewhere = { station: 1, area: 'escalator' as const };
/** A noon when she is out preaching. */
const noon = (() => {
  for (let d = 0; ; d++) if (preaching(stockholmEpoch(2026, 9, 1, 12) + d * 86400)) return stockholmEpoch(2026, 9, 1, 12) + d * 86400;
})();

function setup(doors: () => boolean = () => true) {
  const said: string[] = [];
  const preacher = new Preacher(new Scene(), [station], {
    say: (m) => said.push(m), speak: () => {}, lurch: () => {}, doorsOpen: () => doors(),
  });
  const pos = (preacher as unknown as { pos: Vector3 }).pos;
  return { preacher, said, pos };
}

test('she comes running from across the hall and follows you through the gates and down the escalator', () => {
  const { preacher, said, pos } = setup();
  const dt = 1 / 30;
  let t = noon;
  // Seen from across the hall, as you walk in on the far side.
  preacher.update(dt, t, inHall, hall(20, -6), null, null);
  expect(said[0]).toBe(text.preacher.spotted);
  // You run for the gates, past them to the escalator top, and on down the escalator.
  let lowest = Infinity;
  let furthest = Infinity;
  for (let k = 0; k < 30 * 12; k++) {
    t += dt;
    const run = k * dt * 5;
    const a = 20 - run;
    const feet = a > 0 ? hall(a, -6) : hall(a, -6, HALL_Y - (Math.min(-a, ESC_RUN) / ESC_RUN) * (HALL_Y - PLATFORM_Y));
    preacher.update(dt, t, a > 0 ? inHall : elsewhere, feet, null, null);
    lowest = Math.min(lowest, pos.y);
    furthest = Math.min(furthest, pos.x - hall(0).x);
  }
  // Well past the gates (13 m from the escalator top), and down the escalator after you.
  expect(furthest).toBeLessThan(0);
  expect(lowest).toBeLessThan(HALL_Y - 1);
  expect(said).not.toContain(text.preacher.missed);
});

test('she gets on the train after you while its doors are open, and rides it', () => {
  let open = true;
  const { preacher, pos } = setup(() => open);
  const dt = 1 / 30;
  let t = noon;
  const train = { position: hall(16, 6) } as unknown as Train;
  preacher.update(dt, t, inHall, hall(20), null, null);
  // You step into the train standing beside you and wait in it.
  for (let k = 0; k < 30 * 3; k++) {
    t += dt;
    const inside = train.position.clone().add(new Vector3(0, 0, -0.5 + Math.min(1, k / 30)));
    preacher.update(dt, t, elsewhere, inside, train, null);
  }
  // Doors shut and it pulls away with both of you: she stays aboard, however far it goes.
  open = false;
  const start = pos.x;
  for (let k = 0; k < 30 * 3; k++) {
    t += dt;
    train.position.x += 10 * dt;
    preacher.update(dt, t, elsewhere, train.position.clone().add(new Vector3(0, 0, 0.5)), train, null);
  }
  expect(pos.x - start).toBeGreaterThan(25);
});

test('doors closing in front of her leave her on the platform', () => {
  let open = true;
  const { preacher, said, pos } = setup(() => open);
  const dt = 1 / 30;
  let t = noon;
  const train = { position: hall(4, -6) } as unknown as Train;
  preacher.update(dt, t, inHall, hall(20), null, null);
  // You dash across the hall and in; the doors shut behind you before she is there.
  for (let k = 0; k < 30 * 4; k++) {
    t += dt;
    if (k === 30 * 2) open = false;
    if (!open) train.position.x -= 10 * dt;
    const feet = k < 30 * 2 ? hall(20 - k * dt * 8, 3.4 - k * dt * 4.7) : train.position.clone();
    preacher.update(dt, t, elsewhere, feet, k < 30 * 2 ? null : train, null);
  }
  expect(said).toContain(text.preacher.missed);
  // She did not ride along: the train is well on its way, she is back in the hall.
  expect((preacher as unknown as { on: unknown }).on).toBeNull();
  expect(pos.x).toBeGreaterThan(train.position.x + 10);
});
