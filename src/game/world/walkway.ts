import { Vector3 } from 'three';
import { mix, rgb } from '../gfx/color';
import { fbm3 } from '../gfx/noise';
import { tileTexture } from '../gfx/textures';
import type { Physics } from '../physics';
import { PAINT } from './parts';
import type { Section } from './section';
import { place, textSign } from './signage';
import type { Zone } from './zones';

/**
 * A passage between two lines' stations that lie apart along x (the blue
 * line's T-Centralen and Fridhemsplan, and the red and green lines' own). It
 * is built at both stations as the same Z of tiled corridor: out from the
 * hall along `leg`, a turn into the long middle `run`, and a turn into a
 * second leg that is the other station's first. Walking past the middle of
 * the run you cross to the other station's copy, turned half round about the
 * run's middle: everything in sight is the same, and the turns hide the rest.
 */

export const WALKWAY = { half: 1.4, height: 3.2, leg: 24, run: 40 };

/** One station's end of a walkway: the door in its hall wall, the way out of the hall (`u`), and which way the run turns (`side`). */
export interface WalkwayEnd {
  door: Vector3;
  u: Vector3;
  side: 1 | -1;
  /**
   * How thick the wall is where the door's jambs and lintel frame the corridor exactly (a hall's door): the corridor's
   * walls and ceiling begin behind it, else their faces lie in the jambs' and the lintel's planes and flicker.
   */
  wall?: number;
}

const { half: H, height: HT, leg: L, run: R } = WALKWAY;

/** The walkway's three stretches at one end, in the corridor's frame: u and v ranges. */
const STRETCHES = [[0, L, -H, H], [L, L + 2 * H, -H, R + H], [L + 2 * H, 2 * L + 2 * H, R - H, R + H]];

/** The run's middle, in the corridor's own frame: u along the first leg, v along the run. */
const MID = { u: L + H, v: R / 2 };

function axes(end: WalkwayEnd): { U: Vector3; V: Vector3 } {
  const U = end.u.clone().setY(0).normalize();
  const V = new Vector3(-U.z, 0, U.x).multiplyScalar(end.side);
  return { U, V };
}

export function walkwayPoint(end: WalkwayEnd, u: number, v: number, y = 0): Vector3 {
  const { U, V } = axes(end);
  return end.door.clone().addScaledVector(U, u).addScaledVector(V, v).setY(end.door.y + y);
}

/** Where a point in world space lies in the corridor's frame. */
function local(end: WalkwayEnd, p: Vector3): { u: number; v: number } {
  const { U, V } = axes(end);
  const d = p.clone().sub(end.door);
  return { u: d.dot(U), v: d.dot(V) };
}

/**
 * Builds a walkway's corridor at one end: floor, ceiling, walls and lamps,
 * closed where the other station's door would be. The walls are tiled, or
 * `blue`: rock painted deep blue, as in T-Centralen's Blå gången.
 * @param sign what the first leg leads to, hung facing the way in
 */
export function buildWalkway(s: Section, physics: Physics, end: WalkwayEnd, sign: string, blue = false): void {
  const tiles = blue ? s.lit : s.artLayer(tileTexture());
  const rock = (p: Vector3) => mix(rgb(0x0f2f78), rgb(0x2c5cc0), fbm3(p.x * 0.35, p.y * 0.5, p.z * 0.35, 4, 71));
  /** A box given in the corridor's frame: u, v and height ranges. */
  const box = (b: typeof s.lit, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, paint: Parameters<typeof s.lit.box>[2], collide = true) => {
    const a = walkwayPoint(end, u0, v0, y0);
    const c = walkwayPoint(end, u1, v1, y1);
    const min = { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), z: Math.min(a.z, c.z) };
    const max = { x: Math.max(a.x, c.x), y: Math.max(a.y, c.y), z: Math.max(a.z, c.z) };
    // Painted rock needs a finer grid for its mottling to show.
    b.box(min, max, paint, [], blue ? 0.7 : 2.5);
    if (collide) physics.box(min, max);
  };
  const floor = (_p: Vector3, n: Vector3) => (n.y > 0.5 ? rgb(0x8a867d) : rgb(0x6f6c65));
  const T = 0.3;
  // The first leg's walls and ceiling start behind the door's wall: a little behind its face where the opening is
  // wider than the corridor, else behind the whole jamb.
  const start = end.wall ?? 0.05;
  // Floors and ceilings: the first leg, the run, the second leg.
  for (const [u0, u1, v0, v1] of STRETCHES) {
    box(s.lit, u0, u1, v0, v1, -0.5, 0, floor);
    box(s.lit, u0 === 0 ? end.wall ?? 0 : u0, u1, v0, v1, HT, HT + 0.4, blue ? rock : rgb(0xe9e6de));
  }
  // Walls, tiled on the inside (or painted rock).
  const white = blue ? rock : rgb(0xffffff);
  box(tiles, start, L + 2 * H, -H - T, -H, 0, HT, white);
  box(tiles, start, L, H, H + T, 0, HT, white);
  box(tiles, L + 2 * H, L + 2 * H + T, -H, R - H, 0, HT, white);
  box(tiles, L - T, L, H, R + H, 0, HT, white);
  box(tiles, L, 2 * L + 2 * H, R + H, R + H + T, 0, HT, white);
  box(tiles, L + 2 * H, 2 * L + 2 * H, R - H - T, R - H, 0, HT, white);
  // Closed where the other station's hall would be.
  box(tiles, 2 * L + 2 * H, 2 * L + 2 * H + T, R - H, R + H, 0, HT, white);
  // A blue band at hand height, as in the blue line's passages.
  if (!blue) for (const [u0, u1, v0, v1] of [[start, L + 2 * H, -H, -H + 0.02], [start, L, H - 0.02, H], [L + 2 * H - 0.02, L + 2 * H, -H, R - H], [L, L + 0.02, H, R + H], [L, 2 * L + 2 * H, R + H - 0.02, R + H], [L + 2 * H, 2 * L + 2 * H, R - H, R - H + 0.02]]) {
    box(s.lit, u0, u1, v0, v1, 1.25, 1.45, rgb(0x1f5aa6), false);
  }
  // Lamps down the middle of every stretch.
  const lamp = (u: number, v: number) => {
    const p = walkwayPoint(end, u, v, HT - 0.03);
    s.unlit.box({ x: p.x - 0.5, y: p.y - 0.03, z: p.z - 0.5 }, { x: p.x + 0.5, y: p.y + 0.03, z: p.z + 0.5 }, PAINT.lampCool);
    s.light(p.x, p.y - 0.5, p.z, rgb(0xf4f6ff), 0.8, 9);
  };
  for (let u = 3; u < L; u += 6) lamp(u, 0);
  for (let v = 3; v < R; v += 6) lamp(L + H, v);
  for (let u = L + 2 * H + 3; u < 2 * L + 2 * H; u += 6) lamp(u, R);
  // The way on, hung just inside the door.
  const at = walkwayPoint(end, 4, 0, HT - 0.4);
  place(s, textSign(sign, 1024, 112), 2.6, 0.3, at, axes(end).U.clone().negate());
}

/** The walkway's three stretches at one end, as zones named `label` that belong to `station`. */
export function walkwayZones(end: WalkwayEnd, station: number, label: string): Zone[] {
  return STRETCHES.map(([u0, u1, v0, v1]) => {
    const a = walkwayPoint(end, u0, v0, -0.5);
    const c = walkwayPoint(end, u1, v1, HT);
    return {
      min: { x: Math.min(a.x, c.x), y: a.y, z: Math.min(a.z, c.z) },
      max: { x: Math.max(a.x, c.x), y: c.y, z: Math.max(a.z, c.z) },
      station, area: 'hall', label,
    };
  });
}

/** A walkway with both ends, and how to carry someone from one to the other. */
export class Walkway {
  constructor(readonly a: WalkwayEnd, readonly b: WalkwayEnd) {}

  /** If `p` stands in the walkway at either end, the other end's door: where the walk leads, a step past the middle. */
  ahead(p: Vector3): Vector3 | null {
    for (const [from, to] of [[this.a, this.b], [this.b, this.a]] as const) {
      if (p.y < from.door.y - 1 || p.y > from.door.y + HT) continue;
      const { u, v } = local(from, p);
      if (STRETCHES.some(([u0, u1, v0, v1]) => u >= u0 && u <= u1 && v >= v0 && v <= v1)) return to.door;
    }
    return null;
  }

  /**
   * If `p` stands in the far half of one end's run (walking toward the
   * other station), where the same spot is at the other end, and how much
   * to turn. Null elsewhere.
   */
  cross(p: Vector3): { to: Vector3; turn: number } | null {
    for (const [from, to] of [[this.a, this.b], [this.b, this.a]] as const) {
      if (p.y < from.door.y - 1 || p.y > from.door.y + HT) continue;
      const { u, v } = local(from, p);
      if (u < L || u > L + 2 * H || v < MID.v || v > R + H) continue;
      // Half round about the run's middle.
      const there = walkwayPoint(to, 2 * MID.u - u, 2 * MID.v - v, p.y - from.door.y);
      const f = axes(from);
      const t = axes(to);
      // The same heading, measured in each end's frame and turned half round.
      const angle = (U: Vector3) => Math.atan2(U.x, U.z);
      return { to: there, turn: angle(t.U) - angle(f.U) + Math.PI };
    }
    return null;
  }
}
