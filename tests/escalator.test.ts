import { describe, expect, test } from 'bun:test';
import { Vector3 } from 'three';
import { escalatorHeight, escalatorRun, escalatorSlope, escalatorStepAlong, onEscalatorTread } from '../src/game/escalatorMotion';
import { ESC_ANGLE, ESC_DESIGN as E, ESC_LANDING, ESC_RISE, ESC_SPEED, PLATFORM_Y } from '../src/game/layout';

const ESC_RUN = escalatorRun(ESC_RISE);
import { Physics, loadRapier } from '../src/game/physics';
import { Section } from '../src/game/world/section';
import { buildEscalators } from '../src/game/world/escalator';
import { World } from '../src/game/world/world';

const speed = ESC_SPEED * Math.cos(ESC_ANGLE);

describe('escalator transport', () => {
  test('landings are level and meet the platform and ticket hall', () => {
    expect(escalatorHeight(0, ESC_RISE)).toBe(PLATFORM_Y);
    expect(escalatorHeight(ESC_LANDING, ESC_RISE)).toBe(PLATFORM_Y);
    expect(escalatorHeight(ESC_RUN - ESC_LANDING, ESC_RISE)).toBeCloseTo(PLATFORM_Y + ESC_RISE);
    expect(escalatorHeight(ESC_RUN, ESC_RISE)).toBeCloseTo(PLATFORM_Y + ESC_RISE);
    expect(escalatorSlope(ESC_LANDING / 2, ESC_RISE)).toBe(0);
    expect(escalatorSlope(ESC_RUN - ESC_LANDING / 2, ESC_RISE)).toBe(0);
    expect(escalatorSlope(ESC_RUN / 2, ESC_RISE)).toBeCloseTo(Math.tan(ESC_ANGLE));
    expect(onEscalatorTread(0)).toBe(false);
    for (const lane of [-1, 1]) {
      expect(onEscalatorTread(lane * E.laneCenter)).toBe(true);
      expect(onEscalatorTread(lane * (E.laneCenter + E.treadWidth / 2 + E.railWidth / 2))).toBe(false);
    }
  });

  test('visible steps and passenger carry share their speed in both station orientations', () => {
    for (const dir of [-1, 1] as const) for (const lane of [-1, 1]) {
      const escalator = { wallX: 80, dir, z: 0, rise: ESC_RISE, run: ESC_RUN };
      const world = { stations: [{ escalator, escalators: [escalator], platforms: [0] }] } as unknown as World;
      const a = escalatorStepAlong(15, 0.1, lane);
      const b = escalatorStepAlong(15, 0.11, lane);
      const v = World.prototype.escalatorVelocity.call(world, new Vector3(80 + dir * a, escalatorHeight(a, ESC_RISE), lane * E.laneCenter), new Vector3());
      expect((b - a) / 0.01 * dir).toBeCloseTo(v.x);
      expect((escalatorHeight(b, ESC_RISE) - escalatorHeight(a, ESC_RISE)) / 0.01).toBeCloseTo(v.y);
      const period = E.stepPitch / speed;
      expect(escalatorStepAlong(15, 0.1 + period, lane)).toBeCloseTo(a);
    }
  });

  test('a standing Rapier passenger crosses both landing joins without sticking or falling, shallow or deep', async () => {
    const R = await loadRapier();
    for (const rise of [7, ESC_RISE, 33]) for (const dir of [-1, 1] as const) for (const lane of [-1, 1]) {
      const run = escalatorRun(rise);
      const physics = new Physics(R);
      const section = new Section('escalator-test', [1, 1, 1]);
      const escalator = buildEscalators(section, physics, 0, dir, rise);
      const world = { stations: [{ escalator, escalators: [escalator], platforms: [0] }] } as unknown as World;
      const start = lane > 0 ? 0.2 : run - 0.2;
      const feet = new Vector3(dir * start, escalatorHeight(start, rise) + 0.03, lane * E.laneCenter);
      const capsule = physics.world.createCollider(R.ColliderDesc.capsule(0.55, 0.3).setTranslation(feet.x, feet.y + 0.85, feet.z));
      const controller = physics.world.createCharacterController(0.02);
      controller.enableSnapToGround(0.35);
      controller.setMaxSlopeClimbAngle(42 * Math.PI / 180);
      controller.setMinSlopeSlideAngle(50 * Math.PI / 180);
      const dt = 1 / 60;
      for (let frame = 0; frame < Math.ceil((run - 0.5) / speed / dt); frame++) {
        const velocity = World.prototype.escalatorVelocity.call(world, feet, new Vector3());
        feet.addScaledVector(velocity, dt);
        capsule.setTranslation({ x: feet.x, y: feet.y + 0.85, z: feet.z });
        physics.step(dt);
        controller.computeColliderMovement(capsule, { x: 0, y: -2 * dt, z: 0 });
        const m = controller.computedMovement();
        feet.add(new Vector3(m.x, m.y, m.z));
        capsule.setTranslation({ x: feet.x, y: feet.y + 0.85, z: feet.z });
        expect(Math.abs(feet.y - escalatorHeight(feet.x * dir, rise))).toBeLessThan(0.12);
      }
      expect(feet.x * dir).toBeCloseTo(lane > 0 ? run - 0.3 : 0.3, 0);
      physics.world.free();
    }
  });
});
