import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace } from 'three';
import { rgb } from '../gfx/color';
import { PASSAGE_LAYOUT as P, TRAVELATOR_LAYOUT as V } from '../layout';
import type { Physics } from '../physics';
import type { Section } from './section';

/**
 * The moving walkways in the City passage: a ribbed belt along each wall,
 * toward City on one side and back toward the blue line on the other, with
 * glass balustrades and black handrails. The belts' ribs scroll with the
 * belt speed; `World.travelatorVelocity` carries whoever stands on them.
 */

/** One belt, in passage coordinates: `a` across the passage, `dir` +1 toward City (+z). */
export interface Belt {
  a0: number;
  a1: number;
  dir: 1 | -1;
}

export const BELTS: Belt[] = [
  { a0: P.a0 + V.wall, a1: P.a0 + V.wall + V.width, dir: 1 },
  { a0: P.a1 - V.wall - V.width, a1: P.a1 - V.wall, dir: -1 },
];

let beltMaterial: MeshBasicMaterial | null = null;

/** Ribbed aluminium, scrolled along the belt. */
function material(): MeshBasicMaterial {
  if (beltMaterial) return beltMaterial;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#5b6166';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#8c949a';
  for (let x = 0; x < 64; x += 8) ctx.fillRect(x, 0, 4, 64);
  ctx.fillStyle = '#3a3f43';
  ctx.fillRect(0, 62, 64, 2);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  beltMaterial = new MeshBasicMaterial({ map: t, side: DoubleSide, color: 0xc8c8c8 });
  return beltMaterial;
}

/** Moves the belts' ribs to where they are at game time `t` (escalator time, so they stop with the escalators). */
export function setTravelatorTime(t: number): void {
  if (beltMaterial?.map) beltMaterial.map.offset.y = (t * V.speed) / 0.4;
}

/**
 * @param X world x at `a` across the passage
 * @param Y the passage floor
 * @param z0 world z where the passage leaves the hall
 */
export function buildTravelators(s: Section, physics: Physics, X: (a: number) => number, Y: number, z0: number): void {
  const za = z0 + V.z0;
  const zb = z0 + V.z1;
  const length = zb - za;
  const steel = rgb(0xa9b2b8);
  const box = (a0: number, a1: number, y0: number, y1: number, pz0: number, pz1: number, color: number | ReturnType<typeof rgb>, collide = false) => {
    const min = { x: Math.min(X(a0), X(a1)), y: y0, z: pz0 };
    const max = { x: Math.max(X(a0), X(a1)), y: y1, z: pz1 };
    s.lit.box(min, max, typeof color === 'number' ? rgb(color) : color);
    if (collide) physics.box(min, max);
  };
  for (const belt of BELTS) {
    // The belt, flush with a thin comb plate at each end.
    box(belt.a0, belt.a1, Y, Y + 0.04, za, zb, 0x2b2e31, true);
    for (const z of [za - 0.4, zb]) box(belt.a0, belt.a1, Y, Y + 0.05, z, z + 0.4, 0xb8bdc2);
    if (!s.dry) {
      const surface = new Mesh(new PlaneGeometry(V.width - 0.08, length), material());
      surface.rotation.x = -Math.PI / 2;
      surface.position.set(X((belt.a0 + belt.a1) / 2), Y + 0.045, (za + zb) / 2);
      const uv = surface.geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * length / 0.4 * belt.dir);
      s.extras.add(surface);
    }
    // The balustrade on the walkway side: a steel skirt, glass, and a handrail; the wall side has a handrail too.
    const inner = belt.dir > 0 ? belt.a1 : belt.a0;
    const out = belt.dir > 0 ? 1 : -1;
    box(inner + (out > 0 ? 0 : -V.rail), inner + (out > 0 ? V.rail : 0), Y, Y + 0.18, za - 0.6, zb + 0.6, steel, true);
    box(inner + (out > 0 ? 0.04 : -V.rail + 0.04), inner + (out > 0 ? V.rail - 0.04 : -0.04), Y + 0.18, Y + 0.95, za - 0.6, zb + 0.6, 0xbfd6e6);
    physics.box({ x: Math.min(X(inner), X(inner + out * V.rail)), y: Y, z: za - 0.6 }, { x: Math.max(X(inner), X(inner + out * V.rail)), y: Y + 1.05, z: zb + 0.6 });
    for (const a of [inner + out * V.rail / 2, (out > 0 ? belt.a0 : belt.a1) - out * 0.04]) box(a - 0.035, a + 0.035, Y + 0.95, Y + 1.03, za - 0.6, zb + 0.6, 0x16191c);
    // Arrows on the end plates.
    const entry = belt.dir > 0 ? za - 0.4 : zb + 0.4;
    s.unlit.box({ x: Math.min(X(belt.a0 + 0.4), X(belt.a1 - 0.4)), y: Y + 0.052, z: entry - 0.06 }, { x: Math.max(X(belt.a0 + 0.4), X(belt.a1 - 0.4)), y: Y + 0.055, z: entry + 0.06 }, rgb(0x35d07f));
  }
  // Soft light along the glass.
  for (let z = za + 5; z < zb; z += 10) s.light(X((P.a0 + P.a1) / 2), Y + 2.6, z, rgb(0xf4f6ff), 0.3, 6);
}

/** Belt velocity at a point in the passage, given world x of `a`. */
export function beltVelocity(p: { x: number; y: number; z: number }, X: (a: number) => number, Y: number, z0: number, running: boolean): number {
  if (!running || Math.abs(p.y - Y) > 0.4) return 0;
  const za = z0 + V.z0 - 0.2;
  const zb = z0 + V.z1 + 0.2;
  if (p.z < za || p.z > zb) return 0;
  for (const belt of BELTS) {
    const x0 = Math.min(X(belt.a0), X(belt.a1));
    const x1 = Math.max(X(belt.a0), X(belt.a1));
    if (p.x > x0 && p.x < x1) return belt.dir * V.speed;
  }
  return 0;
}
