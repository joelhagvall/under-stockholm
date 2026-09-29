import { BoxGeometry, Matrix4, SphereGeometry } from 'three';
import { mix, rgb, type RGB } from '../gfx/color';
import { fbm3 } from '../gfx/noise';
import { hash01 } from '../clock';
import { CANOPY, PLATFORM_Y, STATION_DESIGN } from '../layout';
import { OPEN, type Clearing } from './outdoor';
import type { Physics } from '../physics';
import type { Section } from './section';

/**
 * What stands over an open-air platform, as the real station has it: most of the 1950s stations have a roof of
 * sheet on one row of posts over part of the platform, the rest open under lamp posts, and the posts' colour is
 * what tells them apart. Without one, a flat grey roof over the whole platform.
 */
export interface CanopyDef {
  /** The roof's shape: a flat slab, a butterfly whose wings tip up to the eaves, a gable, or none at all. */
  roof?: 'flat' | 'butterfly' | 'gable' | 'none';
  /** The stretch it covers, as fractions of the platform from the end with the main hall: [from, to]. */
  cover?: readonly [number, number];
  /** The roof's underside, top and eaves. */
  under?: number;
  top?: number;
  eaves?: number;
  /** The posts: one row down the middle or two, and their colour. */
  rows?: 1 | 2;
  posts?: number;
  /** The lamp posts beyond the roof. */
  lanterns?: number;
  /** Windbreaks under the roof, down the middle of the island: glass in this colour's frames. */
  screens?: number;
  /** The platform's surface, where it is not the usual pale slabs (asphalt, concrete). */
  floor?: number;
  /** The building over the escalators at the hall's end. */
  building?: number;
  /** A concrete deck over the whole station, tracks and all, as under a town centre: its underside's colour. */
  deck?: number;
  /** Under a deck, walls beside the tracks instead of the open air: their colour (Vällingby's green mosaic). */
  walls?: number;
  /**
   * Walls beside the tracks, beyond the fences, where the line runs in a cutting: blasted rock or board-marked
   * concrete, on both sides or only on one (+1 or -1 across).
   */
  cutting?: { kind: 'rock' | 'concrete'; side?: 1 | -1; height?: number };
  /** A great white globe in view, as the arena beside Globen: its middle from the station's (along, across), radius and height. */
  globe?: readonly [number, number, number, number];
}

type Span = readonly [number, number];

/** Where the roof covers the platform from `p0` to `p1`, with the main hall at the `hallEnd` end. */
export function canopySpans(c: CanopyDef | undefined, p0: number, p1: number, hallEnd: 1 | -1): Span[] {
  if (c?.roof === 'none') return [];
  const [a, b] = c?.cover ?? [0, 1];
  const from = hallEnd > 0 ? p1 : p0;
  const x0 = from - hallEnd * a * (p1 - p0);
  const x1 = from - hallEnd * b * (p1 - p0);
  return [[Math.min(x0, x1), Math.max(x0, x1)]];
}

export const covered = (spans: readonly Span[], x: number, half = 0): boolean => spans.some(([a, b]) => x - half >= a - 0.01 && x + half <= b + 0.01);

/** A thin box `len` along x, `width` across, tilted across the island by `angle`, its middle at (x, y, z). */
function tilted(s: Section, x: number, y: number, z: number, len: number, width: number, angle: number, paint: (n: number) => RGB): void {
  const geo = new BoxGeometry(len, CANOPY.thick, width, Math.max(1, Math.round(len / 2.5)), 1, 2);
  s.lit.geometry(geo, new Matrix4().makeRotationX(angle).setPosition(x, y, z), (_p, n) => paint(n.y));
  geo.dispose();
}

/**
 * The roof over the island at `zi`, its posts and windbreaks. `free` says whether the island is clear at an x (not
 * where escalators go through it).
 */
export function buildCanopy(s: Section, physics: Physics, c: CanopyDef | undefined, zi: number, cx: number, spans: readonly Span[], free: (x: number, half?: number) => boolean): void {
  const under = rgb(c?.under ?? 0xd8d4cc);
  const top = rgb(c?.top ?? 0x5a5c5e);
  const eaves = rgb(c?.eaves ?? 0x2f3438);
  const post = rgb(c?.posts ?? 0x4a5058);
  const Y = CANOPY.y;
  const W = CANOPY.halfW;
  const face = (ny: number) => (ny < -0.3 ? under : top);
  for (const [x0, x1] of spans) {
    const len = x1 - x0;
    const mx = (x0 + x1) / 2;
    const shape = c?.roof ?? 'flat';
    if (shape === 'flat') {
      s.lit.box({ x: x0, y: Y, z: zi - W }, { x: x1, y: Y + CANOPY.thick, z: zi + W }, (_p, n) => face(n.y));
      for (const side of [-1, 1]) s.lit.box({ x: x0, y: Y - 0.35, z: Math.min(zi + side * (W - 0.05), zi + side * (W + 0.05)) }, { x: x1, y: Y + CANOPY.thick, z: Math.max(zi + side * (W - 0.05), zi + side * (W + 0.05)) }, eaves);
    } else {
      // Two wings: a butterfly's rise from the middle to the eaves, a gable's fall to them.
      const angle = Math.atan2(CANOPY.pitch, W);
      const wide = Math.hypot(W, CANOPY.pitch);
      for (const side of [-1, 1]) {
        const tilt = shape === 'butterfly' ? -side * angle : side * angle;
        tilted(s, mx, Y + CANOPY.pitch / 2 + CANOPY.thick / 2, zi + side * W / 2, len, wide, tilt, face);
        const eaveY = shape === 'butterfly' ? Y + CANOPY.pitch : Y;
        s.lit.box({ x: x0, y: eaveY - 0.25, z: Math.min(zi + side * (W - 0.05), zi + side * (W + 0.05)) }, { x: x1, y: eaveY + CANOPY.thick, z: Math.max(zi + side * (W - 0.05), zi + side * (W + 0.05)) }, eaves);
      }
      // The beam along the middle: a butterfly's gutter, a gable's ridge.
      const beamY = shape === 'butterfly' ? Y - 0.1 : Y + CANOPY.pitch;
      s.lit.box({ x: x0, y: beamY, z: zi - 0.18 }, { x: x1, y: beamY + 0.3, z: zi + 0.18 }, eaves);
    }
    // The posts, down the middle or in two rows, under a beam along the roof.
    const rows = c?.rows === 2 ? [-2.2, 2.2] : [0];
    const xs = CANOPY.postXs.map((dx) => cx + dx).filter((x) => x > x0 + 0.5 && x < x1 - 0.5 && free(x, 0.3));
    for (const x of [...xs, ...(xs.length ? [] : [mx])]) {
      for (const rz of rows) {
        const z = zi + rz;
        s.lit.box({ x: x - CANOPY.postHalf, y: PLATFORM_Y, z: z - CANOPY.postHalf }, { x: x + CANOPY.postHalf, y: Y, z: z + CANOPY.postHalf }, post, [], 1);
        physics.box({ x: x - CANOPY.postHalf - 0.03, y: PLATFORM_Y, z: z - CANOPY.postHalf - 0.03 }, { x: x + CANOPY.postHalf + 0.03, y: Y, z: z + CANOPY.postHalf + 0.03 });
      }
    }
    if (rows.length === 2) for (const rz of rows) s.lit.box({ x: x0, y: Y - 0.25, z: zi + rz - 0.1 }, { x: x1, y: Y, z: zi + rz + 0.1 }, post);
    else s.lit.box({ x: x0, y: Y - 0.25, z: zi - 0.1 }, { x: x1, y: Y, z: zi + 0.1 }, post);
    // Windbreaks: glass panes in frames down the middle, clear of the benches.
    if (c?.screens !== undefined) {
      const frame = rgb(c.screens);
      for (const dx of [-51, -27, 27, 51]) {
        const x = cx + dx;
        if (!covered(spans, x, 2) || !free(x, 2)) continue;
        s.lit.box({ x: x - 2, y: PLATFORM_Y, z: zi - 0.06 }, { x: x + 2, y: PLATFORM_Y + 2.3, z: zi + 0.06 }, (p) => (p.y < PLATFORM_Y + 0.15 || p.y > PLATFORM_Y + 2.15 || Math.abs(p.x - x) > 1.9 ? frame : rgb(0x9fb4b8)));
        physics.box({ x: x - 2, y: PLATFORM_Y, z: zi - 0.08 }, { x: x + 2, y: PLATFORM_Y + 2.3, z: zi + 0.08 });
      }
    }
  }
}

/**
 * Beyond the roof, the lamp rail is carried on lamp posts down the middle, each with an arm out to both rails and a
 * lantern at each end.
 */
export function buildLanterns(s: Section, physics: Physics, c: CanopyDef | undefined, zi: number, p0: number, p1: number, spans: readonly Span[], free: (x: number, half?: number) => boolean, lamp: RGB): void {
  const color = rgb(c?.lanterns ?? c?.posts ?? 0x4a5058);
  const RAIL = STATION_DESIGN.lightingY;
  const Z = STATION_DESIGN.lightingZ;
  for (let x = p0 + CANOPY.lanternStep / 2; x < p1; x += CANOPY.lanternStep) {
    if (covered(spans, x, 1) || !free(x, 0.3)) continue;
    s.lit.box({ x: x - 0.07, y: PLATFORM_Y, z: zi - 0.07 }, { x: x + 0.07, y: RAIL + 0.35, z: zi + 0.07 }, color, [], 1);
    s.lit.box({ x: x - 0.05, y: RAIL + 0.2, z: zi - Z - 0.1 }, { x: x + 0.05, y: RAIL + 0.3, z: zi + Z + 0.1 }, color);
    physics.box({ x: x - 0.1, y: PLATFORM_Y, z: zi - 0.1 }, { x: x + 0.1, y: RAIL, z: zi + 0.1 });
    for (const side of [-1, 1]) {
      const z = zi + side * Z;
      s.lit.box({ x: x - 0.22, y: RAIL - 0.3, z: z - 0.22 }, { x: x + 0.22, y: RAIL - 0.05, z: z + 0.22 }, rgb(0x2a2c2e));
      s.unlit.box({ x: x - 0.18, y: RAIL - 0.34, z: z - 0.18 }, { x: x + 0.18, y: RAIL - 0.3, z: z + 0.18 }, rgb(0xf6f0dc));
      s.light(x, RAIL - 0.4, z, lamp, 0.6, 8);
    }
  }
}

/**
 * A concrete deck over the whole station, tracks and all, on square columns beside the tracks and down the middle
 * of the island, where a town centre stands over the line.
 */
export function buildDeck(s: Section, physics: Physics, c: CanopyDef, xa: number, xb: number, halfW: number, islands: readonly number[], free: (x: number, half?: number) => boolean, lamp: RGB): void {
  const under = rgb(c.deck!);
  const Y = CANOPY.deckY;
  s.lit.box({ x: xa, y: Y, z: -halfW - 1 }, { x: xb, y: Y + 1.2, z: halfW + 1 }, under);
  if (c.walls !== undefined) {
    const wall = rgb(c.walls);
    for (const side of [-1, 1]) s.lit.box({ x: xa, y: 0, z: Math.min(side * (halfW + 0.3), side * (halfW + 0.6)) }, { x: xb, y: Y, z: Math.max(side * (halfW + 0.3), side * (halfW + 0.6)) }, wall, [], 1.5);
  }
  for (let x = xa + 4; x < xb; x += 8) {
    for (const z of [-halfW + 0.4, halfW - 0.4]) {
      s.lit.box({ x: x - 0.35, y: 0, z: z - 0.35 }, { x: x + 0.35, y: Y, z: z + 0.35 }, under, [], 1);
      physics.box({ x: x - 0.35, y: 0, z: z - 0.35 }, { x: x + 0.35, y: Y, z: z + 0.35 });
    }
  }
  for (const zi of islands) {
    for (const dx of CANOPY.postXs) {
      const x = (xa + xb) / 2 + dx;
      if (!free(x, 0.6)) continue;
      // A column that spreads into the deck like a tree.
      s.lit.box({ x: x - 0.3, y: PLATFORM_Y, z: zi - 0.3 }, { x: x + 0.3, y: Y - 0.8, z: zi + 0.3 }, under, [], 1);
      s.lit.box({ x: x - 1.2, y: Y - 0.8, z: zi - 1.2 }, { x: x + 1.2, y: Y, z: zi + 1.2 }, under);
      physics.box({ x: x - 0.32, y: PLATFORM_Y, z: zi - 0.32 }, { x: x + 0.32, y: Y, z: zi + 0.32 });
    }
    for (let x = xa + 6; x < xb; x += 9) s.light(x, Y - 0.4, zi, lamp, 0.5, 9);
  }
}

/** A great white globe of panels, most of it above the ground, seen over the roofs from the platform. */
export function buildGlobe(s: Section, cx: number, [dx, dz, radius, y]: readonly [number, number, number, number]): void {
  const geo = new SphereGeometry(radius, 48, 24, 0, Math.PI * 2, 0, Math.acos(-Math.min(1, (y + 0.5) / radius)));
  s.lit.geometry(geo, new Matrix4().setPosition(cx + dx, y, dz), (p) => {
    // Seams between the panels, along and round.
    const lat = Math.asin(Math.max(-1, Math.min(1, (p.y - y) / radius)));
    const lon = Math.atan2(p.z - dz, p.x - cx - dx);
    const seam = Math.abs(((lat / 0.14) % 1 + 1) % 1 - 0.5) > 0.46 || Math.abs(((lon / 0.13) % 1 + 1) % 1 - 0.5) > 0.47;
    return seam ? rgb(0xc8ccd0) : rgb(0xf2f3f4);
  });
  geo.dispose();
}

const ROCK = (p: { x: number; y: number; z: number }): RGB => mix(rgb(0x4e4a44), rgb(0x8a857c), fbm3(p.x * 0.35, p.y * 0.5, p.z * 0.35, 4, 331));
const BOARDED = (p: { x: number; y: number; z: number }): RGB => mix(rgb(0x8c8a84), rgb(0xa8a6a0), fbm3(p.x * 0.2, p.y * 3, p.z * 0.2, 2, 332) * 0.7 + (Math.floor(p.y / 0.3) % 2) * 0.12);

/**
 * A cutting's walls from `x0` to `x1` beyond the fences: blasted rock in blocks of uneven height, or a straight
 * board-marked concrete wall. None where a ticket hall's stairs come up beside the tracks (`clear`).
 */
export function buildCutting(s: Section, physics: Physics, c: NonNullable<CanopyDef['cutting']>, x0: number, x1: number, clear: readonly Clearing[]): void {
  const z0 = OPEN.fenceZ + CANOPY.cutGap;
  const height = c.height ?? (c.kind === 'rock' ? 6 : 4.5);
  for (const side of c.side ? [c.side] : [-1, 1] as const) {
    const [za, zb] = side > 0 ? [z0, z0 + 2] : [-z0 - 2, -z0];
    for (let x = x0; x < x1; x += CANOPY.cutStep) {
      const xb = Math.min(x1, x + CANOPY.cutStep);
      if (clear.some((k) => xb > k.x0 && x < k.x1 && Math.sign(k.z0 + k.z1) === side)) continue;
      // Rock rises and falls along the cutting, with a little break from block to block.
      const h = c.kind === 'rock' ? height * (0.6 + fbm3(x * 0.04, 0, side * 7, 2, 333) * 0.7 + hash01(Math.round(x), side > 0 ? 41 : 42) * 0.12) : height;
      s.lit.box({ x, y: -0.3, z: za }, { x: xb, y: h, z: zb }, c.kind === 'rock' ? ROCK : BOARDED, [], 3);
      physics.box({ x, y: -0.3, z: za }, { x: xb, y: h, z: zb });
    }
  }
}
