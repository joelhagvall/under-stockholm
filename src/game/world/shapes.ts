import { Matrix4, Path, Shape, ShapeGeometry, Vector2, Vector3 } from 'three';
import type { MeshBuilder, Paint, UV } from '../gfx/builder';
import type { RGB } from '../gfx/color';
import { fbm3, noise3, smoothstep } from '../gfx/noise';

/** A cross-section point in the (z, y) plane with its outward normal. */
export interface ProfilePoint {
  z: number;
  y: number;
  nz: number;
  ny: number;
}

/**
 * Arched cross-section: vertical walls up to `wallH`, then an elliptical vault
 * up to `top`. Ordered from the left wall bottom, over the vault, to the right
 * wall bottom.
 */
export function archProfile(zc: number, halfW: number, wallH: number, top: number, bottom: number, arcSegments: number, wallStep = 1.1): ProfilePoint[] {
  const pts: ProfilePoint[] = [];
  const wallSteps = Math.max(2, Math.ceil((wallH - bottom) / wallStep));
  for (let i = 0; i < wallSteps; i++) {
    pts.push({ z: zc - halfW, y: bottom + ((wallH - bottom) * i) / wallSteps, nz: -1, ny: 0 });
  }
  const ry = top - wallH;
  for (let i = 0; i <= arcSegments; i++) {
    const a = Math.PI - (Math.PI * i) / arcSegments;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const nz = c / halfW;
    const ny = s / ry;
    const len = Math.hypot(nz, ny);
    pts.push({ z: zc + halfW * c, y: wallH + ry * s, nz: nz / len, ny: ny / len });
  }
  for (let i = wallSteps - 1; i >= 0; i--) {
    pts.push({ z: zc + halfW, y: bottom + ((wallH - bottom) * i) / wallSteps, nz: 1, ny: 0 });
  }
  return pts;
}

export interface ExtrudeOptions {
  step: number;
  /** How far the rock surface may recede from the profile (outward). */
  amplitude: number;
  /** How far the rock may bulge inward past the profile. */
  inset?: number;
  seed: number;
  /** Spacing of the scalloped ridges left by each blasting round, in meters. */
  rounds?: number;
  /** Map u along x with this period and v along the cross-section, for artwork. */
  artPeriod?: number;
  /** A finished wall, not rock: no displacement at all. */
  smooth?: boolean;
}

/** Length of a profile along its points, in meters. */
export function profileLength(profile: ProfilePoint[]): number {
  let len = 0;
  for (let j = 1; j < profile.length; j++) len += Math.hypot(profile[j].z - profile[j - 1].z, profile[j].y - profile[j - 1].y);
  return len;
}

/**
 * Sweeps a profile along x from x0 to x1 and displaces it into blasted rock:
 * broad bulges, blasting-round scallops and fine roughness. Uses smooth
 * normals and darkens recesses (a cheap ambient occlusion). Displacement fades
 * to zero at both ends so end walls meet the surface cleanly.
 */
export function extrudeRock(b: MeshBuilder, profile: ProfilePoint[], x0: number, x1: number, opts: ExtrudeOptions, paint: Paint): void {
  for (const _ of extrudeRockSteps(b, profile, x0, x1, opts, paint)) { /* run to the end */ }
}

/** `extrudeRock` in steps: the displaced grid, then the triangles. Yields between them so a lazy build can spread over frames. */
/** Rings of rock per build step: each needs noise at every point of the profile, so a dozen fill a frame. */
const ROCK_STAGE = 12;

export function* extrudeRockSteps(b: MeshBuilder, profile: ProfilePoint[], x0: number, x1: number, opts: ExtrudeOptions, paint: Paint): Generator<void, void> {
  if (b.dry) return;
  const segs = Math.max(1, Math.round((x1 - x0) / opts.step));
  const bottom = profile[0].y;
  const A = opts.amplitude;
  const inset = opts.inset ?? 0;
  const rounds = opts.rounds ?? 0;
  const seed = opts.seed;
  const grid: Vector3[][] = [];
  const disp: number[][] = [];
  const scallopOffsets = profile.map((p) => rounds > 0 ? fbm3(p.y * 0.2, p.z * 0.2, 0, 2, seed + 3) * 1.5 : 0);

  for (let i = 0; i <= segs; i++) {
    if (i > 0 && i % ROCK_STAGE === 0) yield;
    const x = x0 + ((x1 - x0) * i) / segs;
    const endFade = smoothstep(0, 4, Math.min(x - x0, x1 - x));
    const ring: Vector3[] = [];
    const dr: number[] = [];
    for (let j = 0; j < profile.length; j++) {
      const p = profile[j];
      const fade = endFade * smoothstep(0, 1.2, p.y - bottom);
      const broad = (fbm3(x * 0.045, p.y * 0.07, p.z * 0.045, 3, seed) - 0.5) * 2;
      const medium = (fbm3(x * 0.48, p.y * 0.48, p.z * 0.48, 3, seed + 1) - 0.5) * 2;
      const fine = noise3(x * 1.4, p.y * 1.4, p.z * 1.4, seed + 2) - 0.5;
      let scallop = 0;
      if (rounds > 0) {
        const t = (((x + scallopOffsets[j]) / rounds) % 1 + 1) % 1;
        scallop = t * t * 0.45;
      }
      const raw = opts.smooth ? 0 : A * (0.25 + broad * 0.85) + medium * A * 0.8 + fine * 0.24 + scallop;
      const d = Math.max(-inset, Math.min(A * 1.6, raw)) * fade;
      ring.push(new Vector3(x, p.y + p.ny * d, p.z + p.nz * d));
      dr.push(d);
    }
    grid.push(ring);
    disp.push(dr);
  }
  yield;

  const cols = profile.length;
  const normals: Vector3[][] = [];
  const across = new Vector3();
  for (let i = 0; i <= segs; i++) {
    if (i > 0 && i % ROCK_STAGE === 0) yield;
    const ring: Vector3[] = [];
    for (let j = 0; j < cols; j++) {
      const ip = grid[Math.min(segs, i + 1)][j];
      const im = grid[Math.max(0, i - 1)][j];
      const jp = grid[i][Math.min(cols - 1, j + 1)];
      const jm = grid[i][Math.max(0, j - 1)];
      ring.push(new Vector3().subVectors(ip, im).cross(across.subVectors(jp, jm)).normalize());
    }
    normals.push(ring);
  }

  // Recessed spots (deeper than their neighbours, or near the floor) get darker.
  const occlusion: number[][] = [];
  for (let i = 0; i <= segs; i++) {
    if (i > 0 && i % ROCK_STAGE === 0) yield;
    const ring: number[] = [];
    for (let j = 0; j < cols; j++) {
      const d = disp[i][j];
      const around =
        (disp[Math.min(segs, i + 1)][j] + disp[Math.max(0, i - 1)][j] + disp[i][Math.min(cols - 1, j + 1)] + disp[i][Math.max(0, j - 1)]) / 4;
      const cavity = Math.max(0, d - around);
      const depth = A > 0 ? Math.max(0, d / A) : 0;
      const floor = 0.62 + 0.38 * smoothstep(0, 1.6, profile[j].y - bottom);
      ring.push(Math.max(0.4, (1 - 0.22 * depth - 1.6 * cavity) * floor));
    }
    occlusion.push(ring);
  }
  // Each grid vertex is shared by up to six triangles: paint it once, ring by ring as the triangles need it.
  const painted: RGB[][] = [];
  const colors = (i: number): RGB[] => {
    let ring = painted[i];
    if (!ring) {
      ring = painted[i] = grid[i].map((p, j) => {
        const base = typeof paint === 'function' ? paint(p, normals[i][j]) : paint;
        const k = occlusion[i][j];
        return [base[0] * k, base[1] * k, base[2] * k];
      });
    }
    return ring;
  };

  const arc: number[] = [0];
  for (let j = 1; j < cols; j++) arc.push(arc[j - 1] + Math.hypot(profile[j].z - profile[j - 1].z, profile[j].y - profile[j - 1].y));
  const total = arc[cols - 1];
  const uvAt = (i: number, j: number): UV => [grid[i][j].x / (opts.artPeriod ?? 1), arc[j] / total];

  for (let i = 0; i < segs; i++) {
    // A stretch of rock at a time, so one step stays short.
    if (i > 0 && i % 60 === 0) yield;
    const ring = colors(i), next = colors(i + 1);
    for (let j = 0; j < cols - 1; j++) {
      const a = grid[i][j], bb = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
      const na = normals[i][j], nb = normals[i + 1][j], nc = normals[i + 1][j + 1], nd = normals[i][j + 1];
      const ca = ring[j], cb = next[j], cc = next[j + 1], cd = ring[j + 1];
      if (opts.artPeriod) {
        const ua = uvAt(i, j), ub = uvAt(i + 1, j), uc = uvAt(i + 1, j + 1), ud = uvAt(i, j + 1);
        b.tri(a, bb, c, paint, { normals: [na, nb, nc], uvs: [ua, ub, uc], colors: [ca, cb, cc] });
        b.tri(a, c, d, paint, { normals: [na, nc, nd], uvs: [ua, uc, ud], colors: [ca, cc, cd] });
      } else {
        b.tri(a, bb, c, paint, { normals: [na, nb, nc], colors: [ca, cb, cc] });
        b.tri(a, c, d, paint, { normals: [na, nc, nd], colors: [ca, cc, cd] });
      }
    }
  }
}

/**
 * Flat wall in the plane x = const, outlined by a profile, with holes cut out
 * for tunnel mouths and shafts. Hole outlines are given in (z, y).
 */
export function wallWithHoles(b: MeshBuilder, x: number, outline: ProfilePoint[], holes: Array<Array<[number, number]>>, paint: Paint): void {
  const shape = new Shape(outline.map((p) => new Vector2(p.z, p.y)));
  shape.closePath();
  for (const hole of holes) {
    const path = new Path();
    hole.forEach(([z, y], i) => (i === 0 ? path.moveTo(z, y) : path.lineTo(z, y)));
    path.closePath();
    shape.holes.push(path);
  }
  const geo = new ShapeGeometry(shape, 8);
  // Shape (sx, sy) -> world (x, sy, sx).
  const m = new Matrix4().set(0, 0, 1, x, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
  b.geometry(geo, m, paint);
  geo.dispose();
}

/** Outline of an arched tube for use as a hole, in (z, y). */
export function archHole(zc: number, halfW: number, wallH: number, top: number, bottom: number): Array<[number, number]> {
  return archProfile(zc, halfW, wallH, top, bottom, 10).map((p) => [p.z, p.y]);
}

export function rectHole(z0: number, z1: number, y0: number, y1: number): Array<[number, number]> {
  return [
    [z0, y0],
    [z1, y0],
    [z1, y1],
    [z0, y1],
  ];
}
