import { buildViaduct } from './canopy';
import { ConeGeometry, CylinderGeometry, Matrix4, SphereGeometry, type Texture, Vector3 } from 'three';
import { hash01 } from '../clock';
import { mix, rgb, type RGB } from '../gfx/color';
import { fbm3, noise3 } from '../gfx/noise';
import { cached, canvas, finish } from '../gfx/textures';
import { TRACK_Z, TUBE_BOTTOM, TUBE_HALF_W, TUBE_TOP, TUBE_WALL_H } from '../layout';
import type { Physics } from '../physics';
import { buildOsm, nearBuilding, type OsmPatch } from './osm';
import { addTrack, PAINT } from './parts';
import type { Section } from './section';
import { archHole, wallWithHoles, type ProfilePoint } from './shapes';

/**
 * The open air: most of the red and green lines' suburban stretches run on
 * the surface. A fenced track bed on ballast, grass beyond, birches and pines,
 * and the blocks of flats of the 1950s and 60s further off. Where the line
 * goes into the rock, a concrete tunnel mouth.
 */

export const OPEN = {
  /** The fences either side of the tracks. */
  fenceZ: 10.5,
  fenceH: 1.9,
  /** How far out the ground and scenery reach. */
  reach: 110,
};

const GRASS = (p: Vector3): RGB => mix(rgb(0x4d6a34), rgb(0x7a8f48), fbm3(p.x * 0.05, 0, p.z * 0.05, 3, 311) * 0.8 + noise3(p.x * 0.6, 0, p.z * 0.6, 312) * 0.25);
const CONCRETE = (p: Vector3): RGB => mix(rgb(0x8e8b84), rgb(0xb2aea4), fbm3(p.x * 0.3, p.y * 0.3, p.z * 0.3, 3, 313));

/** A block of flats' facade: rows of windows every storey, three metres apart. */
export function facadeTexture(): Texture {
  return cached('facade', () => {
    const [c, ctx] = canvas(64, 64);
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#39424c';
    ctx.fillRect(14, 16, 36, 30);
    ctx.fillStyle = '#d8d4c8';
    ctx.fillRect(31, 16, 2, 30);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.fillRect(0, 60, 64, 4);
    return finish(c, 3);
  });
}

/**
 * Fenced ground from `x0` to `x1` on both sides of the tracks, with trees and buildings, by `seed`. Within the reach
 * of a station in `osm` the buildings are its real ones.
 */
/** Ground left to something else beside the tracks: where a ticket hall's stairs come up (see `station.ts`). */
export interface Clearing { x0: number; x1: number; z0: number; z1: number }

/** How far the ground at `x` lies below its usual level (`-0.3`), as under a viaduct: 0, or a negative number of meters. */
export type Ground = (x: number) => number;
export const FLAT: Ground = () => 0;
/** The grass in pieces this long along x, so it can follow the ground where it slopes. */
const GROUND_STEP = 12;

/** Is `x`, `z` within `margin` of a clearing? */
export function inClearing(clear: readonly Clearing[], x: number, z: number, margin = 0): boolean {
  return clear.some((c) => x > c.x0 - margin && x < c.x1 + margin && z > c.z0 - margin && z < c.z1 + margin);
}

/** @param clear ground left bare of grass, trees and houses, for what stands there instead */
export function openGround(s: Section, physics: Physics, x0: number, x1: number, seed: number, fences = true, osm: readonly OsmPatch[] = [], clear: readonly Clearing[] = [], ground: Ground = FLAT): void {
  const F = OPEN.fenceZ;
  for (const side of [-1, 1]) {
    // Grass from the fence out to the scenery's reach, round any clearing on this side (which start at the fence).
    // Wound so the grass faces up on both sides: facing down, the bake left the +z side dark.
    const grass = (xa: number, xb: number, near: number) => {
      const [za, zb] = side > 0 ? [OPEN.reach, near] : [-near, -OPEN.reach];
      for (let x = xa; x < xb; x += GROUND_STEP) {
        const x2 = Math.min(xb, x + GROUND_STEP);
        const [ya, yb] = [-0.3 + ground(x), -0.3 + ground(x2)];
        s.lit.gridQuad(new Vector3(x, ya, za), new Vector3(x2, yb, za), new Vector3(x2, yb, zb), new Vector3(x, ya, zb), GRASS, 8);
      }
    };
    let from = x0;
    for (const c of clear.filter((k) => Math.sign(k.z0 + k.z1) === side && k.x1 > x0 && k.x0 < x1).sort((p, q) => p.x0 - q.x0)) {
      grass(from, Math.max(from, c.x0), F);
      grass(Math.max(from, c.x0), Math.min(x1, c.x1), Math.max(Math.abs(c.z0), Math.abs(c.z1)));
      from = Math.max(from, Math.min(x1, c.x1));
    }
    grass(from, x1, F);
    if (!fences) continue;
    // A fence you can see through: posts, a top rail and a rail at knee height.
    // Up on a viaduct the deck's parapet stands in its place (`canopy.ts`); its collider is the same.
    const zf = side * (F - 0.05);
    const low = (x: number) => ground(x) >= -1;
    for (let x = x0; x < x1; x += GROUND_STEP) {
      const x2 = Math.min(x1, x + GROUND_STEP);
      if (low((x + x2) / 2)) for (const y of [0.55, OPEN.fenceH - 0.05]) s.lit.box({ x, y, z: zf - 0.03 }, { x: x2, y: y + 0.06, z: zf + 0.03 }, rgb(0x6a746e), [], 6);
    }
    for (let x = Math.ceil(x0 / 3) * 3; x < x1; x += 3) if (low(x)) s.lit.box({ x: x - 0.035, y: -0.3, z: zf - 0.035 }, { x: x + 0.035, y: OPEN.fenceH, z: zf + 0.035 }, rgb(0x4a524e));
    physics.box({ x: x0, y: -1, z: Math.min(zf, zf + side) }, { x: x1, y: 4, z: Math.max(zf, zf + side) });
  }
  scenery(s, x0, x1, seed, osm, clear, ground);
  for (const patch of osm) buildOsm(s, s.artLayer(facadeTexture()), patch, x0, x1, OPEN.reach, clear, ground);
}

/** Trees near the fences and buildings further off, the same wherever the same stretch is built; none where `osm` has real ones. */
function scenery(s: Section, x0: number, x1: number, seed: number, osm: readonly OsmPatch[], clear: readonly Clearing[] = [], ground: Ground = FLAT): void {
  const facade = s.artLayer(facadeTexture());
  const trunk = new CylinderGeometry(0.2, 0.28, 2.6, 5);
  const pine = new ConeGeometry(2.1, 7.5, 7);
  const birch = new SphereGeometry(2.3, 7, 5);
  const m = new Matrix4();
  /** The block of flats in a cell on a side, if one stands there: one in five cells, beyond the trees. */
  const block = (cell: number, side: number) => {
    const r = (k: number) => hash01(cell * 7 + (side > 0 ? 3 : 0) + seed * 101, 400 + k);
    if (r(6) >= 0.2) return null;
    const x = cell * 12 + r(1) * 12;
    const w = 14 + r(7) * 22;
    const d = 10 + r(8) * 4;
    const z0 = side * (OPEN.fenceZ + 38 + r(10) * 40);
    const z1 = z0 + side * d;
    return { x, w, h: 3 * (3 + Math.floor(r(9) * 6)), za: Math.min(z0, z1), zb: Math.max(z0, z1), colour: [0xe8dcc0, 0xc86a4a, 0xf0e2a8, 0xe6e6e0, 0xb8c4c8][Math.floor(r(11) * 5)] };
  };
  for (let cell = Math.floor(x0 / 12); cell * 12 < x1; cell++) {
    for (const side of [-1, 1]) {
      const r = (k: number) => hash01(cell * 7 + (side > 0 ? 3 : 0) + seed * 101, 400 + k);
      const x = cell * 12 + r(1) * 12;
      if (x < x0 || x > x1) continue;
      // Trees, one in two cells, a little way from the fence.
      const z = side * (OPEN.fenceZ + 4 + r(3) * 26);
      if (r(2) < 0.55 && !nearBuilding(osm, x, z, 2.5) && !inClearing(clear, x, z, 2.5)) {
        const isBirch = r(4) < 0.45;
        const g = ground(x);
        s.lit.geometry(trunk, m.makeTranslation(x, 1 + g, z), isBirch ? rgb(0xe8e4d8) : rgb(0x5a4632));
        if (isBirch) s.lit.geometry(birch, m.makeScale(1, 1.3, 1).setPosition(x, 4.6 + g, z), mix(rgb(0x6a9a3c), rgb(0x9ab84a), r(5)));
        else s.lit.geometry(pine, m.makeTranslation(x, 5.5 + g, z), mix(rgb(0x1f4028), rgb(0x345a34), r(5)));
      }
      // A block of flats, unless it would run into one in the cells before it (they are up to three cells wide).
      const b = osm.some((p) => x > p.x0 - 20 && x < p.x1 + 20) ? null : block(cell, side);
      const clearOf = (o: ReturnType<typeof block>) => !b || !o || Math.abs(o.x - b.x) > (o.w + b.w) / 2 + 1 || o.za > b.zb + 1 || o.zb < b.za - 1;
      const bare = !b || !clear.some((c) => b.x + b.w / 2 > c.x0 && b.x - b.w / 2 < c.x1 && b.zb > c.z0 && b.za < c.z1);
      if (b && bare && clearOf(block(cell - 1, side)) && clearOf(block(cell - 2, side)) && clearOf(block(cell - 3, side))) {
        const { w, za, zb } = b;
        const g = ground(b.x);
        const h = b.h + g;
        facade.box({ x: b.x - w / 2, y: -0.3 + g, z: za }, { x: b.x + w / 2, y: h, z: zb }, rgb(b.colour), ['py', 'ny'], 3);
        s.lit.box({ x: b.x - w / 2 - 0.2, y: h, z: za - 0.2 }, { x: b.x + w / 2 + 0.2, y: h + 0.4, z: zb + 0.2 }, rgb(0x3a3634));
      }
    }
  }
  trunk.dispose();
  pine.dispose();
  birch.dispose();
}

/** Open track from `x0` to `x1`: ballast, both tracks, the fences and the ground beyond (see `openGround` for `osm`). */
/**
 * @param clear squares beside the tracks where the stairs from a station's hall under them come up
 * @param keep where such a hall stands under the tracks: no viaduct pier there
 */
export function buildOpenTrack(s: Section, physics: Physics, x0: number, x1: number, seed: number, osm: readonly OsmPatch[] = [], ground: Ground = FLAT, clear: readonly Clearing[] = [], keep: readonly Clearing[] = []): void {
  const F = OPEN.fenceZ;
  s.lit.box({ x: x0, y: -0.5, z: -F }, { x: x1, y: 0, z: F }, PAINT.ballast, ['ny'], 4);
  for (const zc of [-TRACK_Z, TRACK_Z]) addTrack(s, x0, x1, zc, true);
  physics.box({ x: x0, y: -1, z: -F }, { x: x1, y: -0.02, z: F });
  openGround(s, physics, x0, x1, seed, true, osm, clear, ground);
  buildViaduct(s, physics, x0, x1, ground, [], keep);
}

/**
 * A tunnel mouth at `x`: a concrete face across the cutting with the two
 * tube openings, and the hill it goes into. `dir` points out, into the open.
 */
export function buildTunnelMouth(s: Section, physics: Physics, x: number, dir: 1 | -1, trackZs = [-TRACK_Z, TRACK_Z], F = OPEN.fenceZ + 1, city = false): void {
  const top = 9;
  const outline: ProfilePoint[] = [
    { z: -F, y: -0.5, nz: -1, ny: 0 }, { z: -F, y: top, nz: -1, ny: 0 },
    { z: F, y: top, nz: 1, ny: 0 }, { z: F, y: -0.5, nz: 1, ny: 0 },
  ];
  const holes = trackZs.map((zc) => archHole(zc, TUBE_HALF_W, TUBE_WALL_H, TUBE_TOP, TUBE_BOTTOM));
  wallWithHoles(s.lit, x, outline, holes, CONCRETE);
  // The hill the tunnel goes into: rock beside the mouth, then terraces of earth and grass rising behind it.
  const rockPaint = (p: Vector3) => mix(rgb(0x5f5c55), rgb(0x8a857a), fbm3(p.x * 0.2, p.y * 0.2, p.z * 0.2, 3, 315));
  // In the city the line goes in under a concrete deck, not a hill.
  const earth = (p: Vector3) => (city ? CONCRETE(p) : p.y > 1 ? mix(rgb(0x4d6a34), rgb(0x6f8a44), fbm3(p.x * 0.08, p.y * 0.08, p.z * 0.08, 3, 314)) : rockPaint(p));
  const box = (a: number, b: number, y0: number, y1: number, z0: number, z1: number, paint: (p: Vector3) => RGB) =>
    s.lit.box({ x: Math.min(x - dir * a, x - dir * b), y: y0, z: z0 }, { x: Math.max(x - dir * a, x - dir * b), y: y1, z: z1 }, paint, [], 4);
  box(0, 60, top, top + 3, -F - 25, F + 25, earth);
  box(12, 60, top + 3, top + 7, -F - 20, F + 20, earth);
  box(28, 60, top + 7, top + 10, -F - 12, F + 12, earth);
  for (const side of [-1, 1]) {
    box(0, 60, -0.5, top, Math.min(side * F, side * (F + 25)), Math.max(side * F, side * (F + 25)), rockPaint);
    // The cutting's rock walls run out a little way in front of the mouth.
    box(-25, 0, -0.5, 4, Math.min(side * (F + 0.2), side * (F + 3)), Math.max(side * (F + 0.2), side * (F + 3)), rockPaint);
  }
  const xo0 = dir > 0 ? x - 1 : x;
  const xo1 = dir > 0 ? x : x + 1;
  // Solid between the tube mouths, open through them below their tops.
  let z = -F - 1;
  for (const zc of [...trackZs].sort((a, b) => a - b)) {
    physics.box({ x: xo0, y: -1, z }, { x: xo1, y: 14, z: zc - TUBE_HALF_W });
    physics.box({ x: xo0, y: TUBE_TOP, z: zc - TUBE_HALF_W }, { x: xo1, y: 14, z: zc + TUBE_HALF_W });
    z = zc + TUBE_HALF_W;
  }
  physics.box({ x: xo0, y: -1, z }, { x: xo1, y: 14, z: F + 1 });
}


/** Beyond a station at the end of the line in the open: the tracks run on to buffer stops, where trains turn. */
export function buildOpenTurnback(s: Section, physics: Physics, wallX: number, dir: 1 | -1, length: number, seed: number, osm: readonly OsmPatch[] = [], ground: Ground = FLAT, clear: readonly Clearing[] = [], keep: readonly Clearing[] = []): void {
  const far = wallX + dir * length;
  const [x0, x1] = [Math.min(wallX, far), Math.max(wallX, far)];
  buildOpenTrack(s, physics, x0, x1, seed, osm, ground, clear, keep);
  for (const zc of [-TRACK_Z, TRACK_Z]) {
    const bx = far - dir * 1.2;
    s.lit.box({ x: bx - 0.4, y: 0, z: zc - 1.2 }, { x: bx + 0.4, y: 1.4, z: zc + 1.2 }, PAINT.buffer);
    physics.box({ x: bx - 0.4, y: 0, z: zc - 1.2 }, { x: bx + 0.4, y: 1.4, z: zc + 1.2 });
  }
}
