import { LOADING_SLICE_MS, nextFrame } from './frames';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BoxGeometry, CylinderGeometry, Group, Matrix4, CatmullRomCurve3, TubeGeometry, Vector3, type BufferGeometry } from 'three';
import { MeshBuilder, type Paint } from './gfx/builder';
import { rgb, scale, type RGB } from './gfx/color';
import { cabinPosterTexture, columnTexture, flexSignTexture, routeMapTexture, seatBackTexture, vinylTexture, weaveTexture } from './gfx/textures';
import { CABIN_DESIGN as I, C20 as C20_STOCK, C30 as C30_STOCK, CAB_DEPTH, SEAT_LAYOUT, TRAIN_JOINT_HALF_W, TRAIN_END_TRIM, DOOR_HALF_W, DOOR_TOP, PLATFORM_Y, TRAIN_HALF_L, TRAIN_HALF_W, TRAIN_NOSE, TRAIN_ROOF, type Stock } from './layout';
import { Section } from './world/section';

/**
 * Geometry for a train of Stockholm's C20 stock (or the red line's C30, see `C30_LOOK`): rounded
 * blue cab fronts with a black windshield mask, ribbed stainless sides below
 * a dark window band, blue above the band and around the car ends, a smooth
 * arched roof, and the interior of the renovated C20: side seats along one
 * wall and groups of four across the aisle, flex areas with lean bars, navy
 * seats patterned with triangles and yellow priority seats, yellow grab
 * poles, a yellow cab bulkhead and a curved ceiling, lit by its own cove
 * strips (baked), so it reads as lit even deep in a tunnel. Where two units
 * are coupled each has its cab, closed off by a bulkhead: there is no way
 * through from one unit to the next.
 */

export const L = TRAIN_HALF_L;
export const W = TRAIN_HALF_W;
export const FLOOR = PLATFORM_Y;
export const WIN_LO = 2.0;
export const WIN_HI = 2.95;
export const NOSE = TRAIN_NOSE;

/** Height where the side walls meet the arched roof. */
const SHOULDER = 3.35;

export type TrainVariant = 'c20' | 'c30' | 'silver' | 'cab' | 'retro' | 'retro30';

/** The stock a variant is built on: the C30's for the red line's trains, today's and in the time machine. */
export function stockOf(variant: TrainVariant): Stock {
  return variant === 'c30' || variant === 'retro30' ? C30_STOCK : C20_STOCK;
}

const C20 = {
  body: rgb(0xbfc8ce),
  rib: rgb(0xaab4bb),
  roof: rgb(0xb9bec4),
  band: rgb(0x262a30),
  mask: rgb(0x101216),
  blue: rgb(0x3177b9),
  skirt: rgb(0x23262b),
  bogie: rgb(0x1f2023),
  wheel: rgb(0x55585c),
  bellows: rgb(0x1c1d1f),
  screen: rgb(0x0f151c),
  lining: rgb(0xdededa),
  ceiling: rgb(0xf1f1ee),
  mullion: rgb(0xc9cccc),
  /** The seats' shells and the groups' pedestals. */
  shell: rgb(0x3a3e44),
  /** The dark base under the side seats. */
  plinth: rgb(0x4b5056),
  yellow: rgb(0xe7c92b),
  /** The renovated C20's cab bulkhead and its door are yellow. */
  cab: rgb(0xecc436),
  cabDoor: rgb(0xe2b82e),
  gangway: rgb(0x8f959a),
  /** Tints the seat backs' fabric. */
  seat: rgb(0x55688c),
  cushion: rgb(0x40475a),
  /** The priority seats' fabric: yellow in the renovated C20, for contrast. */
  priority: rgb(0xf2c53d),
  /** Triangles on the seat backs, or plain fabric. */
  patterned: true,
  /** Tints the floor's vinyl. */
  floor: rgb(0xffffff),
  /** The C30's smooth sides with a window per bay, instead of the C20's ribbed steel and window band. */
  smooth: false,
  /** The cab front around the windscreen. */
  nose: rgb(0x3177b9),
  /** A light around the windscreen, as the C30's front has, or none. */
  frame: null as RGB | null,
};

type Palette = typeof C20;

/**
 * The C30, from photographs: a smooth white body with a dark skirt, a window to each bay, blue doors, and a front of
 * black glass inside a ring of white light. Inside, pale walls, yellow poles and seats in grey with black and white
 * triangles, the priority seats yellow.
 */
const C30_LOOK: Palette = {
  ...C20,
  body: rgb(0xe9ebed), rib: rgb(0xe9ebed), roof: rgb(0xc4c9cd), band: rgb(0x23272c), mask: rgb(0x0b0d10),
  blue: rgb(0x2c6db4), skirt: rgb(0x3b3f45), lining: rgb(0xe8e9e7), ceiling: rgb(0xf5f5f3), mullion: rgb(0xd3d6d6),
  shell: rgb(0x2f3339), plinth: rgb(0x5a5f66), cab: rgb(0xdfe2e2), cabDoor: rgb(0xcfd3d5), gangway: rgb(0xa3a8ac),
  seat: rgb(0x5d626b), cushion: rgb(0x3a3e45), floor: rgb(0xd8d8d6),
  smooth: true, nose: rgb(0xe9ebed), frame: rgb(0xf7fbff),
};

/**
 * The time machine's 1975: the old green Cx stock. Inside, from photos of
 * the preserved cars: mustard-cream walls and seat shells, brown ribbed
 * seats, a polished steel ceiling, steel poles and a dark ribbed floor.
 */
const RETRO: Palette = {
  ...C20,
  body: rgb(0x5f9a6c), rib: rgb(0x578f63), roof: rgb(0x8a9290), band: rgb(0x2b3a30), blue: rgb(0x4d8a5c),
  mask: rgb(0x1c2420), skirt: rgb(0x2a2c2a),
  lining: rgb(0xe2cb8a), ceiling: rgb(0xc9cbcb), mullion: rgb(0xb9b39c), shell: rgb(0xe3cb84),
  yellow: rgb(0xb8bcbf), cab: rgb(0xe0c46a), cabDoor: rgb(0xd6b75a), gangway: rgb(0x2e2a24), plinth: rgb(0x4a4238),
  seat: rgb(0x8c4a28), cushion: rgb(0x7d4224), priority: rgb(0x8c4a28), patterned: false, floor: rgb(0x4d4b47),
};

/**
 * Silverpilen: unpainted aluminium like the C5 prototype cars. Inside, from
 * photos of the preserved car 2901: beige walls, rust-brown ribbed seats in
 * pale shells, steel poles and a dark ribbed floor, all a little yellowed.
 */
const SILVER: Palette = {
  ...C20,
  body: rgb(0xc9ccce), rib: rgb(0xb6babd), roof: rgb(0xa4a8ab), blue: rgb(0xb3b7ba),
  band: rgb(0x1b1d20), mask: rgb(0x16181b), skirt: rgb(0x2a2b2d),
  lining: rgb(0xcbc39c), ceiling: rgb(0xd8d0b0), mullion: rgb(0xb3a78c), shell: rgb(0xcfcab5),
  yellow: rgb(0xa9adaf), cab: rgb(0xc4b894), cabDoor: rgb(0x55595f), gangway: rgb(0x1f1e1c), plinth: rgb(0x6f8a78),
  seat: rgb(0xa35a33), cushion: rgb(0x96522e), priority: rgb(0xa35a33), patterned: false, floor: rgb(0x4a4844),
};

/** Intervals of the side wall that are not door openings. */
export function wallSegments(stock: Stock = C20_STOCK): Array<[number, number]> {
  const segs: Array<[number, number]> = [];
  let x = -L;
  for (const d of [...stock.doors].sort((a, b) => a - b)) {
    segs.push([x, d - DOOR_HALF_W]);
    x = d + DOOR_HALF_W;
  }
  segs.push([x, L]);
  return segs;
}

/** Non-overlapping exterior panels, leaving an actual gap for every rubber joint. */
export function bodyPanels(stock: Stock = C20_STOCK): Array<{ a: number; b: number; blue: boolean }> {
  const panels: Array<{ a: number; b: number; blue: boolean }> = [];
  for (const section of stock.sections) {
    const left = section.center - section.halfLength;
    const right = section.center + section.halfLength;
    const lo = left + (left > -L ? TRAIN_JOINT_HALF_W : 0);
    const hi = right - (right < L ? TRAIN_JOINT_HALF_W : 0);
    for (const [start, end] of wallSegments(stock)) {
      const a = Math.max(start, lo), b = Math.min(end, hi);
      if (b <= a) continue;
      const cuts = [a, lo + TRAIN_END_TRIM, hi - TRAIN_END_TRIM, b].filter((x) => x >= a && x <= b).sort((x, y) => x - y);
      for (let i = 1; i < cuts.length; i++) {
        if (cuts[i] <= cuts[i - 1]) continue;
        const mid = (cuts[i] + cuts[i - 1]) / 2;
        panels.push({ a: cuts[i - 1], b: cuts[i], blue: mid < lo + TRAIN_END_TRIM || mid > hi - TRAIN_END_TRIM });
      }
    }
  }
  return panels;
}

/** One seat: its cushion's centre and the way its sitter faces. */
export interface CabinSeat {
  x: number;
  z: number;
  /** Facing along the train (x) in the groups of four, across the aisle (z) on the side seats. */
  fx: number;
  fz: number;
  kind: 'facing' | 'side';
  /** Yellow fabric: the side row's seat by a door. */
  priority: boolean;
}

/** Floor along one wall taken by seats, from `a` to `b` along the train and out to `z` from the center line. */
export interface SeatBay {
  a: number;
  b: number;
  side: 1 | -1;
  z: number;
}

/** A flex area for prams, wheelchairs and walkers along one wall, with a lean bar and no seats. */
export interface FlexArea {
  a: number;
  b: number;
  side: 1 | -1;
}

interface Seating {
  seats: CabinSeat[];
  bays: SeatBay[];
  flex: FlexArea[];
}

/**
 * How a train is furnished: the renovated C20's side seats, groups of four and flex areas,
 * or the older stock's groups of four all along (the time machine's 1975
 * and Silverpilen); `c30` and `classic30` are the same on the C30's layout.
 */
export type SeatStyle = 'c20' | 'classic' | 'c30' | 'classic30';

export function seatStyle(variant: TrainVariant): SeatStyle {
  if (variant === 'c30') return 'c30';
  if (variant === 'retro30') return 'classic30';
  return variant === 'retro' || variant === 'silver' ? 'classic' : 'c20';
}

/** The stock a seating is laid out on. */
export function seatStock(style: SeatStyle): Stock {
  return style === 'c30' || style === 'classic30' ? C30_STOCK : C20_STOCK;
}

/** The older stock's groups of four all along, rather than side seats, groups and flex areas. */
function classicSeats(style: SeatStyle): boolean {
  return style === 'classic' || style === 'classic30';
}

const seatings = new Map<SeatStyle, Seating>();

/**
 * The stretch of aisle someone at `x` can walk along, between the cab bulkheads of their unit: the train's own ends,
 * or the cabs where it is coupled to the next unit.
 */
export function unitAisle(stock: Stock, x: number): { a: number; b: number } {
  let a = -CAB_X, b = CAB_X;
  for (const c of stock.couplings) {
    if (c <= x) a = Math.max(a, c + CAB_DEPTH);
    else b = Math.min(b, c - CAB_DEPTH);
  }
  return { a, b };
}

/** The inside of the side walls, from the center line. */
const INNER = W - 0.1;
/** Where the cab bulkheads stand, from the middle of the train. */
export const CAB_X = L - 2.3;

/**
 * The renovated C20's and the C30's seating (see `SEAT_LAYOUT`). Each
 * section's floor is split at its doors. Between two doors one wall gets a
 * row of side seats and the other groups of four facing along the train, the
 * walls taking turns along the train. The row starts at one door where there
 * is room to spare, leaving a flex area on its wall by the other door, the
 * doors taking turns too; where there is not, it is centred. By a gangway one
 * wall is a flex area and the other a row from the door; by a cab both walls
 * get a row from the door to the bulkhead.
 * The classic stock has groups of four on both walls between the screens,
 * and a single row facing into the section where a group does not fit.
 */
function layoutSeats(style: SeatStyle): Seating {
  const cached = seatings.get(style);
  if (cached) return cached;
  const { rowSpacing, rowBack, screen, singleRow, column, sidePitch, sideRow, flexMin, flexLength } = SEAT_LAYOUT;
  const group = rowSpacing + rowBack * 2;
  const seats: CabinSeat[] = [];
  const bays: SeatBay[] = [];
  const flex: FlexArea[] = [];
  const za = I.seatAisle;
  const zw = INNER - I.seatEdge;

  /** Two seats across one side of the aisle, facing +x (1) or -x (-1). */
  const row = (x: number, facing: 1 | -1, side: 1 | -1) => {
    for (const part of [0, 1]) seats.push({ x, z: side * (za + (zw - za) * (part + 0.5) / 2), fx: facing, fz: 0, kind: 'facing', priority: false });
  };
  /** As many groups of four as fit, centred. */
  const groups = (a: number, b: number, side: 1 | -1): boolean => {
    const count = Math.floor((b - a + 1e-6) / group);
    if (!count) return false;
    const start = (a + b) / 2 - (count * group) / 2;
    for (let g = 0; g < count; g++) {
      const gc = start + group * (g + 0.5);
      row(gc - rowSpacing / 2, 1, side);
      row(gc + rowSpacing / 2, -1, side);
    }
    bays.push({ a: start, b: start + count * group, side, z: za - 0.02 });
    return true;
  };
  /** One row with its back at `back`, facing the other way, and the knee room in front of it. */
  const single = (back: number, facing: 1 | -1, side: 1 | -1) => {
    const x = back + facing * rowBack;
    row(x, facing, side);
    bays.push({ a: Math.min(back, x + facing * 0.5), b: Math.max(back, x + facing * 0.5), side, z: za - 0.02 });
  };
  /** A row of side seats from `from` toward `to`; the one at `from` is yellow if `priority`. Returns where it ends. */
  const sideSeats = (from: number, to: number, side: 1 | -1, priority: boolean): number => {
    const dir = Math.sign(to - from);
    const count = Math.min(sideRow, Math.floor((Math.abs(to - from) + 1e-6) / sidePitch));
    if (!count) return from;
    const end = from + dir * count * sidePitch;
    for (let k = 0; k < count; k++) {
      seats.push({ x: from + dir * (k + 0.5) * sidePitch, z: side * (zw - I.sideDepth / 2), fx: 0, fz: -side, kind: 'side', priority: priority && k === 0 });
    }
    bays.push({ a: Math.min(from, end), b: Math.max(from, end), side, z: zw - I.sideDepth - 0.02 });
    return end;
  };

  /** A row of side seats centred between `a` and `b`, yellow at the `a` end if `fromA`, else at the `b` end. */
  const centredSeats = (a: number, b: number, side: 1 | -1, fromA: boolean) => {
    const pad = (b - a - Math.min(sideRow, Math.floor((b - a + 1e-6) / sidePitch)) * sidePitch) / 2;
    if (fromA) sideSeats(a + pad, b - pad, side, true);
    else sideSeats(b - pad, a + pad, side, true);
  };

  const stock = seatStock(style);
  /** A section end at a cab: the train's own ends and both sides of every coupling. */
  const cabEnd = (x: number) => Math.abs(x) >= L - 1e-6 || stock.couplings.some((c) => Math.abs(x - c) < 1e-6);
  let turn = 0;
  /** Which door a row of side seats starts from, taking turns too. */
  let from = 0;
  for (const section of stock.sections) {
    const bounds = [section.center - section.halfLength, ...section.doors, section.center + section.halfLength];
    const spaces = bounds.slice(1).map((right, i) => {
      const left = bounds[i];
      const leftDoor = i > 0, rightDoor = i < bounds.length - 2;
      const leftCab = !leftDoor && cabEnd(left), rightCab = !rightDoor && cabEnd(right);
      // Clear of a cab's bulkhead, or of a gangway.
      const a = left + (leftCab ? CAB_DEPTH + 0.1 : 0.5), b = right - (rightCab ? CAB_DEPTH + 0.1 : 0.5);
      return {
        leftDoor, rightDoor, cab: leftCab || rightCab,
        // The groups keep to the glass screens, the side seats clear the door columns.
        ga: leftDoor ? left + screen : a,
        gb: rightDoor ? right - screen : b,
        wa: leftDoor ? left + column : a,
        wb: rightDoor ? right - column : b,
        side: 1 as 1 | -1,
      };
    });
    // Between the doors the side seats take turns, and a gangway's flex area follows the space next to it.
    for (const space of spaces) if (space.leftDoor && space.rightDoor) space.side = turn++ % 2 ? 1 : -1;
    const n = spaces.length;
    if (n > 1) {
      spaces[0].side = spaces[1].side;
      spaces[n - 1].side = spaces[n - 2].side;
    }
    for (const space of spaces) {
      const { ga, gb, wa, wb, side } = space;
      const other = -side as 1 | -1;
      if (classicSeats(style)) {
        for (const s of [-1, 1] as const) {
          if (groups(ga, gb, s) || gb - ga < singleRow) continue;
          const facing = (ga + gb) / 2 < section.center ? 1 : -1;
          single(facing > 0 ? ga : gb, facing, s);
        }
        continue;
      }
      if (space.leftDoor && space.rightDoor) {
        const count = Math.min(sideRow, Math.floor((wb - wa + 1e-6) / sidePitch));
        const rest = wb - wa - count * sidePitch;
        const fromA = from++ % 2 === 0;
        if (rest >= flexMin) {
          // A row from one door, and by the other door a flex area on the same wall.
          const end = fromA ? sideSeats(wa, wb, side, true) : sideSeats(wb, wa, side, true);
          flex.push({ a: fromA ? end : wa, b: fromA ? wb : end, side });
        } else {
          centredSeats(wa, wb, side, fromA);
        }
        // Across the aisle, groups of four between the glass screens, or a row too if none fits.
        if (!groups(ga, gb, other)) {
          if (rest >= flexMin) {
            if (fromA) sideSeats(wa, wb, other, true);
            else sideSeats(wb, wa, other, true);
          } else {
            centredSeats(wa, wb, other, fromA);
          }
        }
      } else if (space.cab) {
        // The cab is at the end without a door: a row along each wall from the door to the bulkhead.
        const cabAt: 1 | -1 = space.leftDoor ? 1 : -1;
        const back = cabAt > 0 ? gb : ga;
        const door = cabAt > 0 ? wa : wb;
        for (const s of [-1, 1] as const) sideSeats(door, back, s, true);
      } else {
        // A gangway at the end without a door.
        const jointAt: 1 | -1 = space.leftDoor ? 1 : -1;
        const joint = jointAt > 0 ? wb : wa;
        const door = jointAt > 0 ? wa : wb;
        const length = Math.min(flexLength, wb - wa);
        const flexEnd = joint - jointAt * length;
        flex.push({ a: Math.min(joint, flexEnd), b: Math.max(joint, flexEnd), side });
        if (Math.abs(flexEnd - door) >= sidePitch * 2) sideSeats(door, flexEnd, side, true);
        sideSeats(door, joint, other, true);
      }
    }
  }
  const seating = { seats, bays, flex };
  seatings.set(style, seating);
  return seating;
}

/** Stretches of floor taken by seats along each wall. */
export function seatBays(style: SeatStyle = 'c20'): SeatBay[] {
  return layoutSeats(style).bays;
}

/** Every seat, section by section along the train. */
export function cabinSeatLayout(style: SeatStyle = 'c20'): CabinSeat[] {
  return layoutSeats(style).seats;
}

/** The flex areas for prams and wheelchairs. */
export function flexAreas(style: SeatStyle = 'c20'): FlexArea[] {
  return layoutSeats(style).flex;
}

function box(b: MeshBuilder, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: RGB): void {
  b.box({ x: Math.min(x0, x1), y: Math.min(y0, y1), z: Math.min(z0, z1) }, { x: Math.max(x0, x1), y: Math.max(y0, y1), z: Math.max(z0, z1) }, c);
}

interface Ring {
  p: Vector3[];
  n: Vector3[];
}

/** A vertical cross-section of the carbody at x: a rectangle with rounded corners. */
function roundedRing(x: number, halfW: number, y0: number, y1: number, r: number): Ring {
  const p: Vector3[] = [];
  const n: Vector3[] = [];
  const seg = 4;
  const corners: Array<[number, number, number]> = [
    [halfW - r, y1 - r, 0],
    [-(halfW - r), y1 - r, Math.PI / 2],
    [-(halfW - r), y0 + r, Math.PI],
    [halfW - r, y0 + r, (3 * Math.PI) / 2],
  ];
  for (const [cz, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      p.push(new Vector3(x, cy + r * Math.sin(a), cz + r * Math.cos(a)));
      n.push(new Vector3(0, Math.sin(a), Math.cos(a)));
    }
  }
  return { p, n };
}

/** Connects cross-section rings with smooth-shaded triangles. */
function sweep(b: MeshBuilder, rings: Ring[], paint: Paint): void {
  for (let r = 0; r < rings.length - 1; r++) {
    const A = rings[r];
    const B = rings[r + 1];
    const m = A.p.length;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      b.tri(A.p[i], B.p[i], B.p[j], paint, { normals: [A.n[i], B.n[i], B.n[j]] });
      b.tri(A.p[i], B.p[j], A.p[j], paint, { normals: [A.n[i], B.n[j], A.n[j]] });
    }
  }
}

/** Arched roof profile: an open cylinder segment with its axis along x. */
function roofArc(b: MeshBuilder, cx: number, yc: number, radius: number, halfAngle: number, len: number, paint: Paint): void {
  const geo = new CylinderGeometry(radius, radius, len, 24, 1, true, Math.PI / 2 - halfAngle, halfAngle * 2);
  b.geometry(geo, new Matrix4().makeRotationZ(Math.PI / 2).setPosition(cx, yc, 0), paint);
  geo.dispose();
}

function* exterior(ext: MeshBuilder, glass: MeshBuilder, C: Palette, stock: Stock): Generator<void, void> {
  // Underframe.
  box(ext, -L, L, 0.45, 1.02, -W + 0.05, W - 0.05, C.skirt);

  for (const { center: cx, halfLength } of stock.sections) {
    // Arched roof, from shoulder to shoulder.
    const r = 2.725;
    roofArc(ext, cx, 3.8 - r, r, 0.585, halfLength * 2 - TRAIN_JOINT_HALF_W * 2, C.roof);
    // Roof-mounted air conditioning pods.
    for (const ax of [cx]) {
      box(ext, ax - 1.5, ax + 1.5, 3.68, 3.86, -0.6, 0.6, rgb(0x9a9fa5));
      for (let g = -1.1; g <= 1.1; g += 0.37) box(ext, ax + g - 0.05, ax + g + 0.05, 3.86, 3.89, -0.5, 0.5, rgb(0x3a3d42));
    }
    // Bogies with wheels.
    for (const bx of [cx - halfLength + 2.5, cx + halfLength - 2.5]) {
      box(ext, bx - 1.4, bx + 1.4, 0.3, 0.62, -1.15, 1.15, C.bogie);
      for (const wx of [bx - 1.0, bx + 1.0]) {
        for (const wz of [-0.72, 0.72]) {
          const wheel = new CylinderGeometry(0.4, 0.4, 0.12, 14);
          ext.geometry(wheel, new Matrix4().makeRotationX(Math.PI / 2).setPosition(wx, 0.4, wz), C.wheel);
          wheel.dispose();
        }
      }
    }
  }
  yield;
  // One continuous folded shell per gangway. The body panels stop at its edges.
  for (const gx of stock.articulations) {
    const rings: Ring[] = [];
    const samples = 40;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const fold = (1 - Math.cos(t * Math.PI * 10)) * 0.022;
      rings.push(roundedRing(gx - TRAIN_JOINT_HALF_W + t * TRAIN_JOINT_HALF_W * 2, W - 0.065 + fold, 1.0, 3.8 - 0.06 + fold, 0.22));
    }
    sweep(ext, rings, C.bellows);
    yield;
  }
  // Where two units are coupled, two flat cab ends face each other over the coupler, with the gap dark between them.
  for (const gx of stock.couplings) {
    for (const end of [-1, 1] as const) {
      const ring = roundedRing(gx + end * TRAIN_JOINT_HALF_W, W - 0.02, 0.45, 3.62, 0.3);
      const center = new Vector3(gx + end * TRAIN_JOINT_HALF_W, 2, 0);
      for (let i = 0; i < ring.p.length; i++) ext.tri(center, ring.p[(i + 1) % ring.p.length], ring.p[i], (p) => (p.y < 1.0 ? C.skirt : C.nose));
    }
    box(ext, gx - TRAIN_JOINT_HALF_W, gx + TRAIN_JOINT_HALF_W, 0.6, 0.85, -0.18, 0.18, C.bogie);
  }

  // Side walls: ribbed stainless below, dark window band, blue above; or the C30's smooth sides, a window to each bay.
  const pitch = C.smooth ? 1.9 : 3.2;
  const post = C.smooth ? 0.2 : 0.08;
  for (const side of [-1, 1] as const) {
    const zo = side * W;
    const zi = side * (W - 0.05);
    const inner = side > 0 ? 'nz' : 'pz';
    const skip = ['px', 'nx', 'py', 'ny', inner] as const;
    for (const { a, b, blue } of bodyPanels(stock)) {
      if (C.smooth) box(ext, a, b, 1.0, WIN_LO, zi, zo, C.body);
      else {
        // Corrugation: alternating strips, every other one slightly proud.
        const strips = 18;
        const h = (WIN_LO - 1.0) / strips;
        for (let i = 0; i < strips; i++) {
          const y0 = 1.0 + i * h;
          const proud = i % 2 === 0;
          const z1 = proud ? zo + side * 0.012 : zo;
          ext.box(
            { x: a, y: y0, z: Math.min(zo, z1) },
            { x: b, y: y0 + h, z: Math.max(zo, z1) },
            blue ? C.blue : i < 5 && proud ? C.rib : C.body,
            [...skip],
          );
        }
      }
      box(ext, a, b, WIN_HI, 3.08, zi, zo, C.smooth ? C.body : C.band);
      box(ext, a, b, 3.08, SHOULDER, zi, zo, blue && !C.smooth ? C.blue : C.body);
      const pillar = C.smooth ? C.body : C.band;
      for (let m = a; m <= b; m += pitch) box(ext, m - post, m + post, WIN_LO, WIN_HI, zi, zo, pillar);
      box(ext, b - post, b + post, WIN_LO, WIN_HI, zi, zo, pillar);
      box(glass, a, b, WIN_LO, WIN_HI, side * (W - 0.03) - 0.005, side * (W - 0.03) + 0.005, C.body);
      // Black rubber seals around every pane, standing a little proud of the glass.
      const seal0 = side * (W - 0.035);
      const seal1 = side * (W + 0.004);
      const seal = (x0: number, x1: number, y0: number, y1: number) => box(ext, x0, x1, y0, y1, Math.min(seal0, seal1), Math.max(seal0, seal1), C.mask);
      seal(a, b, WIN_LO, WIN_LO + 0.04);
      seal(a, b, WIN_HI - 0.04, WIN_HI);
      const posts: number[] = [];
      for (let m = a; m <= b; m += pitch) posts.push(m);
      if (posts[posts.length - 1] !== b) posts.push(b);
      for (const m of posts) {
        if (m > a) seal(m - post - 0.04, m - post, WIN_LO, WIN_HI);
        if (m < b) seal(m + post, m + post + 0.04, WIN_LO, WIN_HI);
      }
    }
    for (const d of stock.doors) {
      box(ext, d - DOOR_HALF_W, d + DOOR_HALF_W, DOOR_TOP, SHOULDER, zi, zo, C.blue);
      // Dark door frame.
      for (const e of [-1, 1]) box(ext, d + e * DOOR_HALF_W - 0.05, d + e * DOOR_HALF_W + 0.05, 1.0, DOOR_TOP, zo - side * 0.06, zo + side * 0.02, C.band);
    }
    // The black windshield mask wraps a short way onto the cab sides, at the train's ends and either side of a coupling.
    const mask = (x0: number, x1: number) => box(ext, x0, x1, WIN_LO, 3.08, Math.min(zo, zo + side * 0.014), Math.max(zo, zo + side * 0.014), C.mask);
    for (const end of [-1, 1]) mask(end * (L - 2.6), end * L);
    for (const gx of stock.couplings) for (const end of [-1, 1]) mask(gx + end * TRAIN_JOINT_HALF_W, gx + end * 2.6);
  }

  yield;
  // Cab ends: a swept rounded nose, blue with a dark skirt.
  for (const end of [-1, 1] as const) {
    const at = (dx: number, halfW: number, y0: number, y1: number, r: number) => roundedRing(end * (L + dx), halfW, y0, y1, r);
    const rings = [
      at(0, W, 0.45, 3.62, 0.3),
      at(0.28, 1.47, 0.47, 3.68, 0.36),
      at(0.52, 1.4, 0.52, 3.62, 0.42),
      at(0.7, 1.33, 0.58, 3.5, 0.42),
      at(0.8, 1.28, 0.62, 3.4, 0.4),
    ];
    sweep(ext, rings, (p) => (p.y < 1.0 ? C.skirt : C.nose));

    // Rounded blue fascia and a tall inset windscreen, following the C20's U-shaped mask.
    const fx = end * (L + NOSE);
    {
      // The windscreen is real glass: rings instead of discs, so you can see into the cab and out of it.
      const ring = (outer: Ring, inner: Ring, color: RGB) => {
        for (let i = 0; i < outer.p.length; i++) {
          const j = (i + 1) % outer.p.length;
          ext.tri(outer.p[i], inner.p[i], inner.p[j], color);
          ext.tri(outer.p[i], inner.p[j], outer.p[j], color);
        }
      };
      const fascia = roundedRing(fx, 1.28, 0.62, 3.4, 0.4);
      const screen = roundedRing(fx + end * 0.016, 0.97, 1.87, 3.13, 0.16);
      if (C.frame) {
        // The C30: nearly the whole front black glass, inside a thin ring of light.
        const light = roundedRing(fx, 1.2, 1.02, 3.36, 0.34);
        const mask = roundedRing(fx + end * 0.008, 1.13, 1.09, 3.3, 0.3);
        ring(fascia, light, C.nose);
        ring(light, roundedRing(fx, 1.13, 1.09, 3.3, 0.3), C.frame);
        ring(mask, screen, C.mask);
      } else {
        const mask = roundedRing(fx + end * 0.008, 1.2, 1.58, 3.36, 0.34);
        ring(fascia, roundedRing(fx, 1.2, 1.58, 3.36, 0.34), C.nose);
        ring(mask, screen, C.mask);
      }
      const center = new Vector3(fx + end * 0.016, 2.5, 0);
      for (let i = 0; i < screen.p.length; i++) glass.tri(center, screen.p[i], screen.p[(i + 1) % screen.p.length], C.body);
    }
    // Reflective vertical highlights and rubber center seam.
    box(ext, fx + end * 0.019, fx + end * 0.021, 1.97, 3.08, -0.84, -0.77, rgb(0x637781));
    box(ext, fx + end * 0.023, fx + end * 0.025, 1.87, 3.12, -0.025, 0.025, C.mask);
    for (const wz of [-0.43, 0.43]) {
      const wiper = new BoxGeometry(0.025, 0.66, 0.025);
      ext.geometry(wiper, new Matrix4().makeRotationX(0.3).setPosition(fx + end * 0.035, 2.19, wz), C.mask);
      wiper.dispose();
    }
    box(ext, fx - 0.025, fx + 0.025, 0.65, 1.06, -1.14, 1.14, C.skirt);
    // Twin round lamp recesses under the windscreen.
    for (const z of [-0.83, 0.83]) {
      const housing = new CylinderGeometry(0.12, 0.12, 0.045, 16);
      ext.geometry(housing, new Matrix4().makeRotationZ(Math.PI / 2).setPosition(fx, 1.73, z), C.mask);
      housing.dispose();
    }
    yield;
    // Coupler.
    box(ext, end * (L + NOSE - 0.05), end * (L + NOSE + 0.35), 0.6, 0.85, -0.18, 0.18, C.bogie);
  }
}

function* interior(s: Section, glass: MeshBuilder, C: Palette, style: SeatStyle, stock: Stock): Generator<void, void> {
  const b = s.lit;
  const floor = s.artLayer(vinylTexture());
  const columns = s.artLayer(columnTexture());
  const maps = s.artLayer(routeMapTexture());
  const posters = s.artLayer(cabinPosterTexture());
  const pole = (x: number, z: number, top: number, bottom = FLOOR) => {
    const geo = new CylinderGeometry(I.poleRadius, I.poleRadius, top - bottom, 10);
    b.geometry(geo, new Matrix4().setPosition(x, (bottom + top) / 2, z), C.yellow);
    geo.dispose();
  };
  const tube = (points: Vector3[], radius = I.poleRadius, color = C.yellow) => {
    const geo = new TubeGeometry(new CatmullRomCurve3(points, false, 'centripetal'), 14, radius, 8, false);
    b.geometry(geo, null, color); geo.dispose();
  };
  /** A flat picture facing into the car from the wall at `side`, or from a cab bulkhead facing along x. */
  const picture = (layer: MeshBuilder, corners: [Vector3, Vector3, Vector3, Vector3]) => {
    const [p0, p1, p2, p3] = corners;
    layer.tri(p0, p1, p2, rgb(0xffffff), { uvs: [[0, 0], [1, 0], [1, 1]] });
    layer.tri(p0, p2, p3, rgb(0xffffff), { uvs: [[0, 0], [1, 1], [0, 1]] });
  };
  const inner = INNER;
  const cabX = CAB_X;
  const WALL_TOP = 3.05;

  box(floor, -cabX, cabX, FLOOR - 0.05, FLOOR, -inner, inner, C.floor);

  // Wall lining with window reveals.
  for (const side of [-1, 1]) {
    const z0 = side * (inner - 0.02);
    const z1 = side * inner;
    for (const [a0, b0] of wallSegments(stock)) {
      const a = Math.max(a0, -cabX);
      const bb = Math.min(b0, cabX);
      if (bb <= a) continue;
      box(b, a, bb, FLOOR, WIN_LO, z0, z1, C.lining);
      box(b, a, bb, WIN_HI, WALL_TOP - 0.09, z0, z1, C.lining);
      // Line map strip above the windows.
      box(maps, a, bb, WALL_TOP - 0.09, WALL_TOP, z0, z1, rgb(0xffffff));
      for (let m = a; m <= bb; m += 3.2) box(b, m - 0.1, m + 0.1, WIN_LO, WIN_HI, side * (inner - 0.08), z1, C.mullion);
      // A slim window sill, clear of the side seats' backs.
      box(b, a, bb, WIN_LO - 0.03, WIN_LO, side * (inner - 0.08), z1, C.mullion);
    }
    for (const d of stock.doors) {
      box(b, d - DOOR_HALF_W, d + DOOR_HALF_W, DOOR_TOP, WALL_TOP, z0, z1, C.lining);
    }
  }

  yield;
  // Rounded door columns with speaker grills and emergency panels.
  for (const d of stock.doors) {
    for (const jx of [-1, 1]) {
      for (const side of [-1, 1]) {
        const col = new CylinderGeometry(I.columnRadius, I.columnRadius, WALL_TOP - FLOOR, 20, 1, true);
        columns.geometry(col, new Matrix4().setPosition(d + jx * (DOOR_HALF_W + I.columnRadius), (FLOOR + WALL_TOP) / 2, side * (inner - I.columnRadius)), rgb(0xffffff), true);
        col.dispose();
      }
    }
  }

  yield;
  // Separate luminous diffusers, ceiling seams and ventilation channels from the C20 reference.
  for (const { center: cx, halfLength } of stock.sections) {
    const r = 2.83;
    roofArc(b, cx, 3.42 - r, r, 0.515, halfLength * 2 - 0.2, C.ceiling);
    const x0 = Math.max(cx - halfLength + 0.3, -cabX);
    const x1 = Math.min(cx + halfLength - 0.3, cabX);
    for (let x = x0; x < x1; x += I.lightPitch) {
      const end = Math.min(x + I.lightLength, x1);
      box(b, x, end, I.ceilingPanelY, I.ceilingPanelY + I.ceilingSeam, -I.ceilingPanelWidth / 2, I.ceilingPanelWidth / 2, rgb(0xd5d8d6));
      box(b, x, x + I.ceilingSeam, I.ceilingPanelY - I.ceilingSeam, I.ceilingPanelY, -inner, inner, rgb(0x9ca7ad));
      for (const side of [-1, 1]) {
        const z = side * I.lightZ;
        box(b, x, end, I.lightY, I.lightY + I.ceilingSeam * 3, z - I.lightWidth / 2 - I.ceilingSeam, z + I.lightWidth / 2 + I.ceilingSeam, rgb(0x89969e));
        box(s.unlit, x + I.ceilingSeam, end - I.ceilingSeam, I.lightY - I.ceilingSeam, I.lightY, z - I.lightWidth / 2, z + I.lightWidth / 2, rgb(0xf3f7f5));
        box(b, x, end, I.ventilationY, I.ventilationY + I.ventilationWidth, side * (inner - I.ceilingSeam), side * inner, rgb(0x7c898f));
      }
    }
  }
  for (let x = -cabX + 1; x <= cabX - 1; x += I.lightPitch) {
    for (const z of [-I.lightZ, I.lightZ]) s.light(x, I.lightY - 0.2, z, rgb(0xf2f6f6), 0.58, 3.6);
  }

  // Gangways between the sections: pleated grey walls, a header and a round turntable plate in the floor.
  const pleat = scale(C.gangway, 0.78);
  for (const gx of stock.articulations) {
    for (const side of [-1, 1]) {
      box(b, gx - 0.3, gx + 0.3, FLOOR, TRAIN_ROOF - 0.12, side * (inner - 0.3), side * inner, C.gangway);
      for (let x = gx - 0.3 + I.pleatPitch / 2; x < gx + 0.3; x += I.pleatPitch) {
        box(b, x - 0.012, x + 0.012, FLOOR, TRAIN_ROOF - 0.5, side * (inner - 0.32), side * (inner - 0.3), pleat);
      }
    }
    box(b, gx - 0.3, gx + 0.3, TRAIN_ROOF - 0.5, TRAIN_ROOF - 0.12, -inner, inner, C.gangway);
    for (const [radius, y, color] of [[I.turntableRadius, 0.003, rgb(0x6c7277)], [I.turntableRadius - 0.05, 0.005, rgb(0xb7bcbf)]] as const) {
      const plate = new CylinderGeometry(radius, radius, 0.004, 32);
      b.geometry(plate, new Matrix4().setPosition(gx, FLOOR + y, 0), color);
      plate.dispose();
    }
  }
  // Cab bulkheads with a door whose window looks through the cab and its windscreen, down the tunnel ahead. Where
  // two units are coupled, a cab each side: a bulkhead with a closed door, and no way through.
  const pane = { z: 0.3, y0: FLOOR + 1.1, y1: FLOOR + 1.85 };
  const bulkhead = (x: number, facing: 1 | -1, window: boolean) => {
    const x0 = x, x1 = x - facing * 0.08;
    box(b, x0, x1, FLOOR, TRAIN_ROOF - 0.12, -inner, -0.4, C.cab);
    box(b, x0, x1, FLOOR, TRAIN_ROOF - 0.12, 0.4, inner, C.cab);
    box(b, x0, x1, DOOR_TOP, TRAIN_ROOF - 0.12, -0.4, 0.4, C.cab);
    const door = C.cabDoor;
    const dx0 = x + facing * 0.01, dx1 = x - facing * 0.09;
    if (window) {
      box(b, dx0, dx1, FLOOR + 0.1, pane.y0, -0.4, 0.4, door);
      box(b, dx0, dx1, pane.y1, DOOR_TOP, -0.4, 0.4, door);
      for (const side of [-1, 1]) box(b, dx0, dx1, pane.y0, pane.y1, side * pane.z, side * 0.4, door);
      box(glass, x - facing * 0.035, x - facing * 0.045, pane.y0, pane.y1, -pane.z, pane.z, C.body);
    } else box(b, dx0, dx1, FLOOR + 0.1, DOOR_TOP, -0.4, 0.4, door);
    box(b, x0, x1, FLOOR, FLOOR + 0.1, -0.4, 0.4, C.cab);
    // A poster on the bulkhead either side of the door, above the seats.
    const px = x + facing * 0.012;
    for (const zc of [-0.95, 0.95]) {
      const u = -facing * I.posterWidth * 0.6;
      const y0 = FLOOR + 1.25, y1 = FLOOR + 1.25 + I.posterHeight * 1.2;
      picture(posters, [new Vector3(px, y0, zc - u), new Vector3(px, y0, zc + u), new Vector3(px, y1, zc + u), new Vector3(px, y1, zc - u)]);
    }
  };
  for (const end of [-1, 1] as const) {
    bulkhead(end * cabX, -end as 1 | -1, true);
    driverCab(s, end, cabX, C);
  }
  for (const gx of stock.couplings) for (const end of [-1, 1] as const) bulkhead(gx + end * CAB_DEPTH, end, false);

  yield;
  // Seats: the groups' sculpted pads on an open pedestal, and single side seats along the walls.
  const cushions = s.artLayer(weaveTexture());
  const backs = C.patterned ? s.artLayer(seatBackTexture(0.6)) : cushions;
  const yellowBacks = C.patterned ? s.artLayer(seatBackTexture(0.84)) : cushions;
  const za = I.seatAisle;
  const zw = inner - I.seatEdge;
  const padWidth = (zw - za) / 2 - I.seatEdge;
  // One segment per rounded edge: a chamfer at this radius reads as a curve, at a third of the vertices.
  // RoundedBoxGeometry comes without an index already; asking for one more copy only logs a warning per cushion.
  const rounded = (x: number, y: number, z: number, r = I.seatRadius) => {
    const geo = new RoundedBoxGeometry(x, y, z, 1, r);
    return geo.index ? geo.toNonIndexed() : geo;
  };
  const cushion = rounded(I.cushionDepth, I.cushionHeight, padWidth);
  const backrest = rounded(I.backThickness, I.backHeight, padWidth);
  const shell = rounded(I.shellThickness, I.backHeight + I.seatRadius, padWidth + I.seatEdge, I.shellThickness / 2);
  const sideCushion = rounded(I.sideWidth, I.cushionHeight, I.sideDepth);
  const sideBack = rounded(I.sideWidth, I.sideBackHeight, I.backThickness);
  const seats = cabinSeatLayout(style);
  for (let i = 0; i < seats.length; i++) {
    if (i % 40 === 0) yield;
    const { x, z, fx, kind, priority } = seats[i];
    const side = Math.sign(z);
    const fabric = priority ? C.priority : C.seat;
    const back = priority ? yellowBacks : backs;
    const seatColor = priority ? C.priority : C.cushion;
    const pan = FLOOR + I.cushionY - I.cushionHeight / 2;
    if (kind === 'facing') {
      const bx = x - fx * I.backOffset;
      const aisle = Math.abs(z) < (za + zw) / 2;
      box(b, x - I.cushionDepth / 2, x + I.cushionDepth / 2, FLOOR + I.pedestalHeight, pan, z - (padWidth + I.seatEdge) / 2, z + (padWidth + I.seatEdge) / 2, C.shell);
      cushions.geometry(cushion, new Matrix4().setPosition(x, FLOOR + I.cushionY, z), seatColor);
      back.geometry(backrest, new Matrix4().makeRotationZ(fx * I.backLean).setPosition(bx, FLOOR + I.backY, z), fabric, true);
      b.geometry(shell, new Matrix4().makeRotationZ(fx * I.backLean).setPosition(bx - fx * I.shellOffset, FLOOR + I.backY, z), C.shell);
      if (aisle) {
        // One pedestal under the pair, and a bowed yellow grip along the aisle edge of the backrest.
        const pz = side * (za + zw) / 2;
        box(b, x - I.pedestalWidth / 2, x + I.pedestalWidth / 2, FLOOR, FLOOR + I.pedestalHeight, pz - I.pedestalWidth / 2, pz + I.pedestalWidth / 2, C.shell);
        tube([
          new Vector3(bx, FLOOR + I.backY - I.seatHandleHeight, side * za),
          new Vector3(bx - fx * I.seatRadius, FLOOR + I.backY, side * (za - I.seatRadius)),
          new Vector3(bx, FLOOR + I.backY + I.seatHandleHeight, side * za),
        ]);
      }
    } else {
      const pitch = SEAT_LAYOUT.sidePitch;
      box(b, x - pitch / 2, x + pitch / 2, FLOOR, FLOOR + I.plinthHeight, side * (inner - I.plinthDepth), side * inner, C.plinth);
      box(b, x - I.sideWidth / 2, x + I.sideWidth / 2, FLOOR + I.plinthHeight, pan, side * (zw - I.sideDepth + 0.05), side * zw, C.shell);
      cushions.geometry(sideCushion, new Matrix4().setPosition(x, FLOOR + I.cushionY, z), seatColor);
      back.geometry(sideBack, new Matrix4().makeRotationX(side * I.sideBackLean).setPosition(x, FLOOR + I.sideBackY, side * (inner - I.sideBackZ)), fabric, true);
    }
  }
  for (const geo of [cushion, backrest, shell, sideCushion, sideBack]) geo.dispose();

  yield;
  // A yellow rail over the aisle edge of every run of seats, and a pole in the middle of each row of side seats.
  for (const bay of seatBays(style)) {
    if (bay.b - bay.a < 1) continue;
    const z = bay.side * bay.z;
    tube([new Vector3(bay.a, I.railY, z), new Vector3((bay.a + bay.b) / 2, I.railY, z), new Vector3(bay.b, I.railY, z)]);
    if (bay.z > za && bay.b - bay.a > 2) pole((bay.a + bay.b) / 2, bay.side * (bay.z - 0.05), I.railY);
  }
  // Flex areas: a lean bar out from the wall with a lower bar below it, and a pictogram plate.
  const signs = s.artLayer(flexSignTexture());
  for (const { a, b: e, side } of flexAreas(style)) {
    const wall = side * (inner - 0.02);
    const out = side * (inner - I.leanBarOut);
    const y = FLOOR + I.leanBarY, low = FLOOR + I.leanBarLowY;
    const mid = (a + e) / 2;
    tube([
      new Vector3(a + 0.05, y, wall), new Vector3(a + 0.18, y, out), new Vector3(mid, y, out),
      new Vector3(e - 0.18, y, out), new Vector3(e - 0.05, y, wall),
    ]);
    tube([new Vector3(a + 0.3, low, out), new Vector3(mid, low, out), new Vector3(e - 0.3, low, out)]);
    for (const sx of [a + 0.3, e - 0.3]) tube([new Vector3(sx, low, out), new Vector3(sx, (low + y) / 2, out), new Vector3(sx, y, out)]);
    tube([new Vector3(a, I.railY, side * 0.8), new Vector3(mid, I.railY, side * 0.8), new Vector3(e, I.railY, side * 0.8)]);
    const u = side * 0.2;
    const sy = FLOOR + I.flexSignY;
    const face = side * (inner - 0.021);
    picture(signs, [new Vector3(mid + u, sy - 0.1, face), new Vector3(mid - u, sy - 0.1, face), new Vector3(mid - u, sy + 0.1, face), new Vector3(mid + u, sy + 0.1, face)]);
  }

  for (const d of stock.doors) {
    yield;
    // Paired overhead U rails and full-height poles at the aisle ends of the glass screens.
    for (const dx of [-0.76, 0.76]) {
      for (const z of [-za, za]) pole(d + dx, z, I.railY);
      tube([new Vector3(d + dx, I.railY + I.seatRadius, -za), new Vector3(d + dx, I.railY, 0), new Vector3(d + dx, I.railY + I.seatRadius, za)]);
    }
    for (const side of [-1, 1]) {
      box(b, d - DOOR_HALF_W, d + DOOR_HALF_W, FLOOR, FLOOR + I.thresholdHeight, side * (inner - I.thresholdDepth), side * inner, rgb(0x979fa4));
      // A grab handle standing off the aisle face of each door column.
      for (const jx of [-1, 1]) {
        const cx = d + jx * (DOOR_HALF_W + I.columnRadius);
        const face = side * (inner - 2 * I.columnRadius + 0.01);
        const grip = side * (inner - 2 * I.columnRadius - I.gripOut);
        const lo = FLOOR + I.gripLow, hi = FLOOR + I.gripHigh;
        pole(cx, grip, hi, lo);
        for (const y of [lo + 0.04, hi - 0.04]) box(b, cx - 0.025, cx + 0.025, y - 0.025, y + 0.025, face, grip, C.mullion);
      }
      // The passenger-information poster, on the aisle side of the column beside the door, above the
      // seat backs, where nothing hides it from the doorway or the aisle. One column per side, alternating.
      // A little past the column's middle, so the pole at the screen's end does not stand in front of it.
      const xc = d + side * (DOOR_HALF_W + I.columnRadius + 0.1);
      const zf = side * (inner - 2 * I.columnRadius - 0.012);
      const [x0, x1] = side > 0 ? [xc + I.posterWidth / 2, xc - I.posterWidth / 2] : [xc - I.posterWidth / 2, xc + I.posterWidth / 2];
      const y0 = I.posterY - I.posterHeight / 2, y1 = I.posterY + I.posterHeight / 2;
      box(b, xc - I.posterWidth / 2 - I.ceilingSeam, xc + I.posterWidth / 2 + I.ceilingSeam, y0 - I.ceilingSeam, y1 + I.ceilingSeam, Math.min(zf, zf + side * 0.02), Math.max(zf, zf + side * 0.02), C.mullion);
      const face = zf - side * 0.003;
      picture(posters, [new Vector3(x0, y0, face), new Vector3(x1, y0, face), new Vector3(x1, y1, face), new Vector3(x0, y1, face)]);
    }
  }
}

/** Lining, desk and seat for a drivable cab, seen from the driver's seat. */
function driverCab(s: Section, end: number, cabX: number, C: Palette): void {
  const b = s.lit;
  const X = (a: number) => end * a;
  const x0 = cabX + 0.08;
  const nose = L + NOSE;
  box(b, X(x0), X(L + 0.3), FLOOR - 0.02, FLOOR, -W + 0.12, W - 0.12, rgb(0x3b3f44));
  for (const side of [-1, 1]) box(b, X(x0), X(L + 0.2), FLOOR, 3.3, side * (W - 0.14), side * (W - 0.1), rgb(0xcfd3d4));
  box(b, X(x0), X(L + 0.35), 3.3, 3.36, -W + 0.1, W - 0.1, rgb(0xe7e8e4));
  // Wraparound desk under the windscreen, a sloped instrument panel and a footwell.
  box(b, X(L - 0.35), X(nose - 0.12), FLOOR + 0.02, FLOOR + 0.78, -1.12, 1.12, rgb(0x2a2e33));
  const panel = new BoxGeometry(0.62, 0.05, 2.1);
  b.geometry(panel, new Matrix4().makeRotationZ(end * -0.32).setPosition(X(L + 0.12), FLOOR + 0.86, 0), rgb(0x1d2126));
  panel.dispose();
  box(b, X(L - 0.2), X(L + 0.35), FLOOR + 0.78, FLOOR + 0.8, -1.1, 1.1, rgb(0x55595e));
  // Driver's seat on the center line, with a headrest.
  box(b, X(L - 1.25), X(L - 0.75), FLOOR, FLOOR + 0.45, -0.28, 0.28, rgb(0x2b2d31));
  box(b, X(L - 1.3), X(L - 0.7), FLOOR + 0.45, FLOOR + 0.58, -0.3, 0.3, C.blue);
  box(b, X(L - 1.34), X(L - 1.22), FLOOR + 0.58, FLOOR + 1.45, -0.28, 0.28, C.blue);
  // Inner lining of the nose and a dark frame around the windscreen.
  const trim = rgb(0x2a2e33);
  for (const side of [-1, 1]) box(b, X(L + 0.2), X(nose - 0.08), FLOOR, 3.35, side * 1.18, side * 1.24, rgb(0xcfd3d4));
  box(b, X(L + 0.2), X(nose - 0.06), 3.28, 3.34, -1.24, 1.24, rgb(0xe7e8e4));
  const fx0 = X(nose - 0.07);
  const fx1 = X(nose - 0.03);
  for (const side of [-1, 1]) box(b, fx0, fx1, FLOOR + 0.7, 3.3, side * 0.97, side * 1.24, trim);
  box(b, fx0, fx1, 3.13, 3.3, -0.97, 0.97, trim);
  box(b, fx0, fx1, FLOOR + 0.7, 1.87, -0.97, 0.97, trim);
  s.light(X(L - 0.6), 3.1, 0, rgb(0xd9e2ff), 0.35, 3);
}

/** Glass draught screens beside each door, with a yellow grab pole at the aisle edge. */
function glassPanels(glass: MeshBuilder, b: MeshBuilder, C: Palette, stock: Stock): void {
  const inner = W - 0.1;
  for (const d of stock.doors) {
    for (const e of [-1, 1]) {
      const x0 = d + e * 0.74;
      const x1 = d + e * 0.78;
      for (const side of [-1, 1]) {
        box(glass, x0, x1, FLOOR + 0.05, 2.85, Math.min(side * 0.78, side * inner), Math.max(side * 0.78, side * inner), C.body);
        box(b, x0 - I.screenInset, x1 + I.screenInset, FLOOR, FLOOR + I.pedestalHeight, side * 0.78, side * inner, C.mullion);
        const rail = new CylinderGeometry(I.poleRadius, I.poleRadius, I.railY - FLOOR, 10);
        b.geometry(rail, new Matrix4().setPosition((x0 + x1) / 2, (FLOOR + I.railY) / 2, side * 0.78), C.yellow);
        rail.dispose();
      }
    }
  }
}

export interface TrainModel {
  exterior: BufferGeometry;
  glass: BufferGeometry;
  interior: Group;
}

const models = new Map<TrainVariant, TrainModel>();

/**
 * Built once per variant. Each variant's interior has its own materials, so
 * its light can change on its own. The cab variant only differs in its
 * exterior materials (see `variantMaterials`), so it shares the C20 model.
 */
export function trainModel(variant: TrainVariant = 'c20'): TrainModel {
  const steps = trainModelSteps(variant);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

/** Prepares the shared model behind the loading screen without one long construction task. */
export async function loadTrainModel(variant: TrainVariant): Promise<void> {
  let started = performance.now();
  for (const _ of trainModelSteps(variant)) {
    if (performance.now() - started < LOADING_SLICE_MS) continue;
    await nextFrame();
    started = performance.now();
  }
}

function* trainModelSteps(variant: TrainVariant): Generator<void, TrainModel> {
  if (variant === 'cab') variant = 'c20';
  let model = models.get(variant);
  if (!model) {
    const palette = variant === 'silver' ? SILVER : variant === 'retro' || variant === 'retro30' ? RETRO : variant === 'c30' ? C30_LOOK : C20;
    const stock = stockOf(variant);
    const ext = new MeshBuilder();
    const glass = new MeshBuilder();
    yield* exterior(ext, glass, palette, stock);
    const inside = new Section(`train-interior-${variant}`, variant === 'silver' ? rgb(0x3a3226) : rgb(0x4a4a48));
    glassPanels(glass, inside.lit, palette, stock);
    yield* interior(inside, glass, palette, seatStyle(variant), stock);
    model = { exterior: ext.build(), glass: glass.build(), interior: yield* inside.finishSteps(true) };
    models.set(variant, model);
  }
  return model;
}
