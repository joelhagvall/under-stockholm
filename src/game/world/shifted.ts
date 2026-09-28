import type { Physics } from '../physics';

/** A physics wrapper that lays every collider `dx` further along x and `dz` along z, for geometry built in one place and moved to another. */
export function shifted(physics: Physics, dx: number, dz = 0): Physics {
  return {
    box: (min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }) => physics.box({ ...min, x: min.x + dx, z: min.z + dz }, { ...max, x: max.x + dx, z: max.z + dz }),
    tiltedBox: (center: { x: number; y: number; z: number }, half: { x: number; y: number; z: number }, angle: number) => physics.tiltedBox({ ...center, x: center.x + dx, z: center.z + dz }, half, angle),
  } as unknown as Physics;
}

export const shiftZ = (physics: Physics, dz: number): Physics => shifted(physics, 0, dz);
