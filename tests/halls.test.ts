import { describe, expect, test } from 'bun:test';
import { Vector3 } from 'three';
import { escalatorRun } from '../src/game/escalatorMotion';
import { withoutSigns } from '../src/game/gfx/signs';
import { INCLINE, PLATFORM_Y } from '../src/game/layout';
import { hallDir, isOutdoor, NETWORK } from '../src/game/line';
import { Physics, loadRapier } from '../src/game/physics';
import { cabinFloor, inclinePose, inclineSteps, tripTime, type InclineZone } from '../src/game/world/incline';
import { Section } from '../src/game/world/section';
import { World } from '../src/game/world/world';

const RISE = 20;
const D = escalatorRun(RISE) - INCLINE.length;
const ROUND = 2 * (INCLINE.dwell + tripTime(D));

describe('inclined lift', () => {
  test('waits with its doors open at each stop and rides between them', () => {
    const poses = Array.from({ length: Math.ceil(ROUND * 10) }, (_, k) => inclinePose(k / 10, RISE, 0));
    expect(poses[30]).toMatchObject({ a: 0, stop: -1, open: 1 });
    const top = poses.find((p) => p.stop === 1)!;
    expect(top.a).toBeCloseTo(D);
    // Closed on the way, and never faster than its top speed.
    for (const p of poses) if (p.stop === 0) expect(p.open).toBe(0);
    for (let k = 1; k < poses.length; k++) expect(Math.abs(poses[k].a - poses[k - 1].a)).toBeLessThanOrEqual(INCLINE.speed / 10 + 1e-9);
    // Round and round: the same place a whole round later, whatever the phase.
    for (const phase of [0, 0.3, 0.8]) expect(inclinePose(1234.5 + ROUND, RISE, phase).a).toBeCloseTo(inclinePose(1234.5, RISE, phase).a);
  });

  test('its floor is level with the platform below and the hall above', () => {
    expect(cabinFloor(0, RISE)).toBeCloseTo(PLATFORM_Y);
    expect(cabinFloor(D, RISE)).toBeCloseTo(PLATFORM_Y + RISE);
  });

  test('carries whoever stands in it from the platform to the hall, both ways round', async () => {
    const R = await loadRapier();
    for (const e of [1, -1] as const) {
      const physics = new Physics(R);
      const lift = withoutSigns(() => {
        const steps = inclineSteps(new Section('incline-test', [1, 1, 1], true), physics, 80 * e, e, RISE, 0);
        let r = steps.next();
        while (!r.done) r = steps.next();
        return r.value as InclineZone;
      });
      const world = { stations: [{ inclines: [lift] }], liftCarry: new Vector3() } as unknown as World;
      const carry = (time: number, feet: Vector3) => World.prototype.inclines.call(world, time, feet);
      // Aboard at the lower stop, then through the ride to the upper one.
      const feet = new Vector3(80 * e + e * INCLINE.length / 2, PLATFORM_Y, (INCLINE.z0 + INCLINE.z1) / 2);
      carry(1, feet);
      expect(lift.holds(feet)).toBe(true);
      for (let t = 1; t <= INCLINE.dwell + tripTime(D) + 1; t += 0.05) feet.add(carry(t, feet));
      expect(lift.pose.stop).toBe(1);
      expect(feet.y).toBeCloseTo(PLATFORM_Y + RISE, 1);
      expect((feet.x - 80 * e) * e).toBeCloseTo(D + INCLINE.length / 2, 1);
    }
  });
});

describe('halls from the stations\' plans', () => {
  for (const [i, def] of NETWORK.stations.entries()) {
    const halls = def.halls ?? [];
    if (!halls.length) continue;
    test(def.name, () => {
      const underground = !isOutdoor(NETWORK, i);
      // What the builder leaves out is not asked for: passages and lifts are for underground stations, passages for a
      // line's own (a shared one's escalators come up in wings).
      for (const h of halls) {
        if (!underground) expect(h.corridor ?? h.incline).toBeUndefined();
        if (def.lines.length > 1) expect(h.corridor).toBeUndefined();
        // Underground a way up through a tiled ceiling; in the open a way down to a hall under the tracks.
        if (h.from !== undefined && !h.down) expect(underground && def.architecture === 'tiles').toBe(true);
        if (h.down) expect(!underground && def.lines.length === 1 && !def.city && h.from !== undefined).toBe(true);
      }
      // At most one hall at each end.
      const atEnds = halls.filter((h) => h.from === undefined).map(hallDir);
      expect(new Set(atEnds).size).toBe(atEnds.length);
    });
  }
});
