import type { Physics } from '../physics';

/** A physics wrapper that lays every collider `dx` further along x, `dz` along z and `dy` up, for geometry built in one place and moved to another. */
export function shifted(physics: Physics, dx: number, dz = 0, dy = 0): Physics {
  return {
    box: (min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }) => physics.box({ x: min.x + dx, y: min.y + dy, z: min.z + dz }, { x: max.x + dx, y: max.y + dy, z: max.z + dz }),
    tiltedBox: (center: { x: number; y: number; z: number }, half: { x: number; y: number; z: number }, angle: number) => physics.tiltedBox({ x: center.x + dx, y: center.y + dy, z: center.z + dz }, half, angle),
  } as unknown as Physics;
}

export const shiftZ = (physics: Physics, dz: number): Physics => shifted(physics, 0, dz);

/**
 * A physics wrapper for a two-level station built as one (see `STACK`): every collider on the side `takes` picks (by
 * its middle) is mirrored across z = 0 and dropped `drop`, as the geometry is (`Fold`). A box across z = 0 is split
 * there first.
 */
export function foldedPhysics(physics: Physics, takes: (v: { x: number; y: number; z: number }) => boolean, drop: number): Physics {
  type V = { x: number; y: number; z: number };
  const box = (min: V, max: V): unknown => {
    if (min.z < 0 && max.z > 0 && takes({ x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: min.z / 2 })) {
      box(min, { ...max, z: 0 });
      return box({ ...min, z: 0 }, max);
    }
    if (!takes({ x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 })) return physics.box(min, max);
    return physics.box({ x: min.x, y: min.y - drop, z: -max.z }, { x: max.x, y: max.y - drop, z: -min.z });
  };
  return {
    box,
    tiltedBox: (center: V, half: V, angle: number) => (takes(center) ? physics.tiltedBox({ ...center, y: center.y - drop, z: -center.z }, half, angle) : physics.tiltedBox(center, half, angle)),
    turnedBox: (center: V, half: V, angle: number) => (takes(center) ? physics.turnedBox({ ...center, y: center.y - drop, z: -center.z }, half, -angle) : physics.turnedBox(center, half, angle)),
    remove: (c: Parameters<Physics['remove']>[0]) => physics.remove(c),
    get world() { return physics.world; },
    get R() { return physics.R; },
  } as unknown as Physics;
}
