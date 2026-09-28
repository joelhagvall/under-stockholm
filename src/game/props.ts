import { BoxGeometry, CylinderGeometry, Matrix4, MeshLambertMaterial, type BufferGeometry } from 'three';
import { MeshBuilder } from './gfx/builder';
import { rgb } from './gfx/color';

/**
 * Small things people bring into the metro: dogs, a cat or a rabbit in a
 * carrier, a pram, a rolling suitcase and an empty can. Local origin at floor
 * level, facing +x.
 */

let material: MeshLambertMaterial | null = null;

/** Shared lit material for props (vertex colored, like the train exterior). */
export function propMaterial(): MeshLambertMaterial {
  material ??= new MeshLambertMaterial({ vertexColors: true });
  return material;
}

const box = (b: MeshBuilder, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number) =>
  b.box({ x: x0, y: y0, z: z0 }, { x: x1, y: y1, z: z1 }, rgb(color), [], 10);

function cylinder(b: MeshBuilder, radius: number, length: number, matrix: Matrix4, color: number, segments = 12): void {
  const geo = new CylinderGeometry(radius, radius, length, segments);
  b.geometry(geo, matrix, rgb(color));
  geo.dispose();
}

export type DogBuild = 'medium' | 'small' | 'large';

/** Leg length and body length for each kind of dog, and its overall size. */
const DOGS: Record<DogBuild, { leg: number; length: number; size: number; floppy: boolean }> = {
  medium: { leg: 0.3, length: 1, size: 1, floppy: false },
  // Long and low, like a dachshund.
  small: { leg: 0.16, length: 1.45, size: 0.72, floppy: true },
  large: { leg: 0.34, length: 1.05, size: 1.3, floppy: true },
};

/** A dog standing beside its owner. */
export function dogGeometry(coat = 0xa8743f, build: DogBuild = 'medium', ears = 0x6b4a2b): BufferGeometry {
  const { leg, length, size, floppy } = DOGS[build];
  const b = new MeshBuilder();
  const back = -0.3 * length;
  box(b, back, 0.26, leg - 0.02, leg + 0.2, -0.11, 0.11, coat);
  box(b, 0.22, 0.44, leg + 0.14, leg + 0.34, -0.09, 0.09, coat);
  box(b, 0.44, 0.54, leg + 0.16, leg + 0.25, -0.05, 0.05, ears);
  box(b, 0.53, 0.56, leg + 0.2, leg + 0.24, -0.02, 0.02, 0x111111);
  for (const z of [-0.07, 0.07]) {
    if (floppy) box(b, 0.25, 0.31, leg + 0.1, leg + 0.3, z * 1.45 - 0.02, z * 1.45 + 0.02, ears);
    else box(b, 0.26, 0.32, leg + 0.3, leg + 0.42, z - 0.025, z + 0.025, ears);
  }
  for (const [x, z] of [[back + 0.06, -0.07], [back + 0.06, 0.07], [0.19, -0.07], [0.19, 0.07]]) box(b, x - 0.035, x + 0.035, 0, leg, z - 0.035, z + 0.035, coat);
  const tail = new BoxGeometry(0.22, 0.04, 0.04);
  b.geometry(tail, new Matrix4().makeRotationZ(0.7).setPosition(back - 0.06, leg + 0.26, 0), rgb(coat));
  tail.dispose();
  box(b, 0.2, 0.25, leg + 0.13, leg + 0.2, -0.1, 0.1, 0xc0392b);
  const geo = b.build();
  geo.scale(size, size, size);
  return geo;
}

/** A pet carrier with a barred front, and the cat or rabbit looking out of it. */
export function carrierGeometry(animal: 'cat' | 'rabbit', coat: number): BufferGeometry {
  const b = new MeshBuilder();
  const shell = 0x8d99a6;
  const dark = 0x2b3036;
  box(b, -0.26, 0.26, 0, 0.03, -0.17, 0.17, shell);
  box(b, -0.26, 0.26, 0.31, 0.34, -0.17, 0.17, shell);
  for (const z of [-0.17, 0.15]) box(b, -0.26, 0.26, 0.03, 0.31, z, z + 0.02, shell);
  box(b, -0.26, -0.24, 0.03, 0.31, -0.15, 0.15, shell);
  for (const z of [-0.12, -0.06, 0, 0.06, 0.12]) box(b, 0.245, 0.26, 0.03, 0.31, z - 0.007, z + 0.007, dark);
  for (const x of [-0.1, 0.1]) box(b, x - 0.015, x + 0.015, 0.34, 0.41, -0.015, 0.015, dark);
  box(b, -0.1, 0.1, 0.39, 0.42, -0.02, 0.02, dark);
  // The animal, facing out through the bars.
  box(b, -0.2, 0.08, 0.03, 0.19, -0.1, 0.1, coat);
  box(b, 0.07, 0.21, 0.08, 0.22, -0.07, 0.07, coat);
  if (animal === 'cat') {
    for (const z of [-0.045, 0.045]) {
      box(b, 0.12, 0.16, 0.22, 0.27, z - 0.02, z + 0.02, coat);
      box(b, 0.205, 0.215, 0.16, 0.18, z - 0.012, z + 0.012, 0x7fbf3f);
    }
  } else {
    // Long ears laid back along the body, a white tail and a pink nose.
    for (const z of [-0.035, 0.035]) box(b, -0.06, 0.13, 0.2, 0.23, z - 0.018, z + 0.018, coat);
    box(b, 0.21, 0.22, 0.13, 0.15, -0.015, 0.015, 0xe58fa0);
    box(b, -0.23, -0.19, 0.08, 0.13, -0.03, 0.03, 0xf4f1ea);
  }
  return b.build();
}

/** A pram with a hood, a handle and four wheels. */
export function pramGeometry(fabric = 0x2c3e57): BufferGeometry {
  const b = new MeshBuilder();
  box(b, -0.36, 0.36, 0.42, 0.82, -0.26, 0.26, fabric);
  box(b, 0.05, 0.36, 0.82, 1.05, -0.27, 0.27, fabric);
  box(b, 0.3, 0.37, 0.95, 1.08, -0.27, 0.27, fabric);
  box(b, -0.36, 0.36, 0.38, 0.42, -0.2, 0.2, 0x1c1d20);
  const bar = new CylinderGeometry(0.018, 0.018, 0.62, 8);
  for (const z of [-0.23, 0.23]) b.geometry(bar, new Matrix4().makeRotationZ(0.75).setPosition(-0.52, 0.86, z), rgb(0x9aa0a6));
  bar.dispose();
  cylinder(b, 0.022, 0.52, new Matrix4().makeRotationX(Math.PI / 2).setPosition(-0.73, 1.08, 0), 0x1c1d20);
  for (const x of [-0.28, 0.28]) for (const z of [-0.27, 0.27]) cylinder(b, 0.14, 0.05, new Matrix4().makeRotationX(Math.PI / 2).setPosition(x, 0.14, z), 0x222326, 14);
  return b.build();
}

/** A rolling suitcase with its handle up, pulled along behind someone. */
export function suitcaseGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  box(b, -0.12, 0.12, 0.06, 0.66, -0.2, 0.2, 0x1f2a36);
  for (const y of [0.2, 0.45]) box(b, -0.125, 0.125, y, y + 0.02, -0.2, 0.2, 0x324458);
  for (const z of [-0.08, 0.08]) box(b, 0.09, 0.11, 0.66, 1.0, z - 0.01, z + 0.01, 0x9aa0a6);
  box(b, 0.08, 0.12, 0.98, 1.02, -0.1, 0.1, 0x1c1d20);
  for (const z of [-0.16, 0.16]) cylinder(b, 0.035, 0.03, new Matrix4().makeRotationX(Math.PI / 2).setPosition(-0.1, 0.035, z), 0x111111, 10);
  return b.build();
}

/** An empty aluminium can lying on its side, its axis along z so it rolls along x. Centered on its axis. */
export function canGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  const geo = new CylinderGeometry(0.033, 0.033, 0.12, 14);
  b.geometry(geo, new Matrix4().makeRotationX(Math.PI / 2), (p) => rgb(Math.abs(p.z) > 0.05 ? 0xb8bdc2 : p.y > 0.01 ? 0xc0392b : 0xe8e8e8));
  geo.dispose();
  return b.build();
}

/** A rollator: a light frame on four wheels with handles and a basket, pushed along in front. */
export function walkerGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  const frame = 0x9aa0a6;
  for (const z of [-0.24, 0.24]) {
    cylinder(b, 0.016, 0.86, new Matrix4().makeRotationZ(-0.18).setPosition(-0.1, 0.5, z), frame);
    cylinder(b, 0.016, 0.8, new Matrix4().makeRotationZ(0.22).setPosition(0.22, 0.46, z), frame);
    box(b, -0.24, -0.1, 0.9, 0.94, z - 0.02, z + 0.02, 0x1c1d20);
  }
  cylinder(b, 0.014, 0.48, new Matrix4().makeRotationX(Math.PI / 2).setPosition(0.05, 0.55, 0), frame);
  box(b, -0.02, 0.26, 0.5, 0.64, -0.2, 0.2, 0x2c4a7a);
  for (const x of [-0.18, 0.34]) for (const z of [-0.25, 0.25]) cylinder(b, 0.08, 0.04, new Matrix4().makeRotationX(Math.PI / 2).setPosition(x, 0.08, z), 0x222326, 12);
  return b.build();
}
