import { CylinderGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, BoxGeometry, PlaneGeometry, Vector3 } from 'three';
import sv from '../i18n/sv.json';
import { text } from '../i18n/text';
import type { Paint } from '../gfx/builder';
import { rgb, type RGB } from '../gfx/color';
import { createCanvasSign, fitText, FONT } from '../gfx/signs';
import { CAVE_HALF_L, PLATFORM_HALF_L, PLATFORM_Y, SIDE_DOOR, TAIL_TUBE } from '../layout';
import type { Physics } from '../physics';
import { Section } from './section';
import { archProfile, extrudeRock, rectHole, wallWithHoles } from './shapes';
import { fbm3 } from '../gfx/noise';
import { exitSign, place, shelterSign, textSign } from './signage';
import type { Interactable, Zone } from './zones';
import { staffKey } from '../staffKey';
import { noteWriter, sharedNotes } from '../notes';
import { mystery, type Clue } from '../mystery';

/**
 * Staff-only spaces behind the far end of each platform: a gate in the end
 * fence, steps down to the trackbed and a steel door in the end wall. Behind
 * it, a service corridor leads to a turnback cavern, a staff room with an
 * emergency exit, or a civil defence shelter deep under the tracks. Where a
 * ticket hall's escalators take that end of the platform, a narrow door beside
 * them leads the same way (`SIDE_DOOR`).
 */

export const SERVICE_DOOR = { halfWidth: 0.7, height: 2.2 };


/** A handwritten note on a square of paper. */
function noteSign(note: string, paper: string) {
  return createCanvasSign(240, 280, (ctx, w, h) => {
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c8c3b2';
    ctx.fillRect(w * 0.3, 0, w * 0.4, 16);
    ctx.fillStyle = '#1d2a4a';
    ctx.font = `600 30px "Comic Sans MS", "Marker Felt", ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let line = '';
    let y = 30;
    for (const word of note.split(' ')) {
      if (line && ctx.measureText(line + word).width > w - 36) { ctx.fillText(line, 18, y); line = ''; y += 36; }
      line += word + ' ';
    }
    ctx.fillText(line, 18, y);
  });
}
const CORRIDOR = { halfWidth: 0.9, height: 2.6, wall: 0.12 };
const STEPS = { count: 4, run: 0.3, halfWidth: 0.6 };

const CONCRETE: Paint = (_p, n) => (n.y > 0.5 ? rgb(0x5f5e5a) : n.y < -0.5 ? rgb(0x77766f) : rgb(0x8f8d86));
const STEEL = rgb(0x4a5057);
const YELLOW = rgb(0xd9b93b);
const LAMP = rgb(0xf3f1e6);
const WARM_BULB = rgb(0xffd9a0);
/** Service corridors: painted dado and pale walls. */
const corridorPaint = (floorY: number): Paint => (p, n) => {
  if (n.y > 0.5) return rgb(0x55544f);
  if (n.y < -0.5) return rgb(0x7d7c75);
  return p.y - floorY < 1.1 ? rgb(0x51645a) : rgb(0xb9b8ae);
};
/** Swedish shelters: pale green walls and a grey epoxy floor. */
const shelterPaint = (floorY: number): Paint => (p, n) => {
  if (n.y > 0.5) return rgb(0x6d706d);
  if (n.y < -0.5) return rgb(0xc9ccc2);
  return p.y - floorY < 1.3 ? rgb(0x7f9a86) : rgb(0xc4d0bd);
};

/** Fluorescent tubes: the cold light of every Swedish shelter. */
const COLD_TUBE = rgb(0xeef3f6);
/** Wool blankets from the civil defence stores. */
const BLANKETS = [rgb(0x5a6070), rgb(0x6b5a48), rgb(0x4f5e52), rgb(0x7a3b34)];
const BINDERS = [rgb(0x1c4a9a), rgb(0xb3261e), rgb(0x2f6b3f), rgb(0xd9b93b), rgb(0x2a2d31)];
/** Grey epoxy on the floor. */
const EPOXY: Paint = (_p, n) => (n.y > 0.5 ? rgb(0x6f726e) : rgb(0x55574f));
/** Sprayed concrete over blasted rock: pale above, painted green-grey where people lean and bunks scrape. */
const SHOTCRETE = (floorY: number): Paint => (p) => {
  const tone = 0.88 + fbm3(p.x * 0.4, p.y * 0.4, p.z * 0.4, 2, 41) * 0.24;
  const c = p.y - floorY < 1.45 ? rgb(0x7f9a86) : rgb(0xc9c9bf);
  return [c[0] * tone, c[1] * tone, c[2] * tone];
};

/** The shelters of Kungsholmen and Norrmalm, ringed in red on an old civil defence map. */
function shelterMap() {
  return createCanvasSign(768, 512, (ctx, w, h) => {
    ctx.fillStyle = '#ebe5d2';
    ctx.fillRect(0, 0, w, h);
    const m = { x: 24, y: 70, w: w - 48, h: h - 94 };
    ctx.fillStyle = '#a9c7d4';
    ctx.fillRect(m.x, m.y, m.w, m.h);
    const land = (pts: Array<[number, number]>) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(m.x + x * m.w, m.y + y * m.h) : ctx.moveTo(m.x + x * m.w, m.y + y * m.h)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    ctx.fillStyle = '#f3eedd';
    ctx.strokeStyle = '#8a8472';
    ctx.lineWidth = 2;
    // Norrmalm and Vasastan across the top, Kungsholmen to the west, Gamla stan and Södermalm below.
    land([[0.32, 0], [1, 0], [1, 0.46], [0.86, 0.5], [0.72, 0.46], [0.6, 0.52], [0.5, 0.44], [0.4, 0.36], [0.33, 0.2]]);
    land([[0, 0.14], [0.27, 0.12], [0.35, 0.3], [0.44, 0.44], [0.42, 0.52], [0.26, 0.56], [0.08, 0.6], [0, 0.56]]);
    land([[0.6, 0.6], [0.7, 0.57], [0.74, 0.66], [0.66, 0.72], [0.58, 0.68]]);
    land([[0.08, 0.84], [0.4, 0.8], [0.62, 0.84], [0.9, 0.8], [1, 0.82], [1, 1], [0.05, 1]]);
    // The blue line under it all.
    ctx.strokeStyle = '#1c4a9a';
    ctx.lineWidth = 5;
    ctx.setLineDash([14, 8]);
    ctx.beginPath();
    ctx.moveTo(m.x + 0.02 * m.w, m.y + 0.4 * m.h);
    ctx.lineTo(m.x + 0.38 * m.w, m.y + 0.42 * m.h);
    ctx.lineTo(m.x + 0.56 * m.w, m.y + 0.36 * m.h);
    ctx.lineTo(m.x + 0.78 * m.w, m.y + 0.4 * m.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#5f5a4c';
    ctx.font = `700 15px ${FONT}`;
    ctx.textAlign = 'center';
    const label = (name: string, x: number, y: number) => ctx.fillText(name, m.x + x * m.w, m.y + y * m.h);
    label('NORRMALM', 0.7, 0.18);
    label('KUNGSHOLMEN', 0.16, 0.32);
    label('GAMLA STAN', 0.66, 0.78);
    label('SÖDERMALM', 0.5, 0.93);
    // Every shelter a red ring; this one bolder, with a pencilled question beside it.
    ctx.strokeStyle = '#b3261e';
    ctx.lineWidth = 3;
    for (const [x, y] of [[0.12, 0.44], [0.24, 0.24], [0.5, 0.16], [0.62, 0.3], [0.86, 0.22], [0.9, 0.38], [0.3, 0.9], [0.72, 0.9]] as const) {
      ctx.beginPath();
      ctx.arc(m.x + x * m.w, m.y + y * m.h, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(m.x + 0.38 * m.w, m.y + 0.42 * m.h, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#6d6a62';
    ctx.font = `italic 500 20px "Comic Sans MS", "Marker Felt", ${FONT}`;
    ctx.fillText(sv.service.mapNote, m.x + 0.38 * m.w + 12, m.y + 0.42 * m.h + 42);
    ctx.fillStyle = '#20252b';
    fitText(ctx, sv.service.mapTitle, w - 48, 800, 30);
    ctx.textBaseline = 'middle';
    ctx.fillText(sv.service.mapTitle, w / 2, 38);
  });
}

/** A wall clock that stopped at twenty past four, some night long ago. */
function stoppedClock() {
  return createCanvasSign(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const c = w / 2;
    ctx.fillStyle = '#f4f2ea';
    ctx.strokeStyle = '#1d1f21';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(c, h / 2, 118, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.lineWidth = i % 3 ? 4 : 8;
      ctx.beginPath();
      ctx.moveTo(c + Math.sin(a) * 92, c - Math.cos(a) * 92);
      ctx.lineTo(c + Math.sin(a) * 106, c - Math.cos(a) * 106);
      ctx.stroke();
    }
    const hand = (turn: number, length: number, width: number) => {
      const a = turn * Math.PI * 2;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.sin(a) * length, c - Math.cos(a) * length);
      ctx.stroke();
    };
    hand((4 + 20 / 60) / 12, 58, 10);
    hand(20 / 60, 86, 6);
  });
}

export interface ServiceWing {
  group: Group;
  zones: Zone[];
  interactables: Interactable[];
  update?(dt: number): void;
}

/** Steps, gate and door frame at a platform's far end, built into the station's own section. */
export function buildServiceAccess(s: Section, physics: Physics, cx: number, e: 1 | -1): void {
  const farEnd = cx - e * PLATFORM_HALF_L;
  const X = (a: number) => farEnd - e * a;
  const box = (a0: number, a1: number, y0: number, y1: number, z0: number, z1: number, paint: Paint, collide = true) => {
    const min = { x: Math.min(X(a0), X(a1)), y: y0, z: z0 };
    const max = { x: Math.max(X(a0), X(a1)), y: y1, z: z1 };
    s.lit.box(min, max, paint);
    if (collide) physics.box(min, max);
  };
  const rise = PLATFORM_Y / STEPS.count;
  for (let k = 0; k < STEPS.count; k++) {
    const top = PLATFORM_Y - (k + 1) * rise;
    if (top <= 0.001) break;
    box(k * STEPS.run, (k + 1) * STEPS.run, -0.02, top, -STEPS.halfWidth, STEPS.halfWidth, (_p, n) => (n.y > 0.5 ? STEEL : rgb(0x30343a)));
    box(k * STEPS.run, k * STEPS.run + 0.05, top - 0.01, top + 0.005, -STEPS.halfWidth, STEPS.halfWidth, YELLOW, false);
  }
  // Handrails beside the steps, and the swung-open gate leaf.
  for (const side of [-1, 1]) {
    const z = side * (STEPS.halfWidth + 0.04);
    box(0, STEPS.count * STEPS.run + 0.3, PLATFORM_Y + 0.85, PLATFORM_Y + 0.9, z - 0.025, z + 0.025, YELLOW, false);
    for (const a of [0.05, STEPS.count * STEPS.run + 0.25]) box(a - 0.025, a + 0.025, 0, PLATFORM_Y + 0.9, z - 0.025, z + 0.025, YELLOW);
  }
  box(0.02, 1.15, PLATFORM_Y, PLATFORM_Y + 1.1, STEPS.halfWidth + 0.1, STEPS.halfWidth + 0.14, YELLOW);
  // A worn concrete path across the trackbed to the door.
  const wallA = CAVE_HALF_L - PLATFORM_HALF_L;
  box(STEPS.count * STEPS.run, wallA, 0, 0.03, -0.75, 0.75, rgb(0x6a6863), false);
  // Door frame and a door leaf standing open into the corridor.
  const d = SERVICE_DOOR;
  box(wallA - 0.12, wallA, 0, d.height + 0.12, -d.halfWidth - 0.1, -d.halfWidth, STEEL, false);
  box(wallA - 0.12, wallA, 0, d.height + 0.12, d.halfWidth, d.halfWidth + 0.1, STEEL, false);
  box(wallA - 0.12, wallA, d.height, d.height + 0.12, -d.halfWidth, d.halfWidth, STEEL, false);
  s.light(X(wallA - 1.2), 2.6, 0, WARM_BULB, 0.5, 5);
  s.unlit.box({ x: Math.min(X(wallA - 0.25), X(wallA - 0.05)), y: d.height + 0.2, z: -0.12 }, { x: Math.max(X(wallA - 0.25), X(wallA - 0.05)), y: d.height + 0.34, z: 0.12 }, WARM_BULB);
  const facing = new Vector3(e, 0, 0);
  place(s, exitSign(), 0.9, 0.34, new Vector3(X(wallA - 0.02), d.height + 0.62, 0), facing);
  place(s, textSign(sv.service.staffOnly, 512, 96, '#f2f2f2', '#b3261e'), 1.3, 0.24, new Vector3(X(wallA - 0.02), 1.55, d.halfWidth + 0.72), facing);
}

/**
 * The corridor and whatever lies behind the far end wall. `kind` decides
 * where it leads. Coordinates run along `a`, measured from the end wall away
 * from the station.
 */
/** A clue for the Silverpilen mystery on a small paper, pinned or scratched somewhere. */
function clueNote(title: string, scratched = false) {
  return createCanvasSign(256, 200, (ctx, w, h) => {
    if (scratched) ctx.clearRect(0, 0, w, h);
    else {
      ctx.fillStyle = '#e6d9a8';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#b8a66e';
      for (let y = 60; y < h - 10; y += 14) ctx.fillRect(14, y, w - 28 - ((y * 7) % 40), 5);
    }
    ctx.fillStyle = scratched ? 'rgba(235, 232, 220, 0.8)' : '#2a2620';
    ctx.font = `${scratched ? 600 : 800} ${scratched ? 26 : 22}px ${scratched ? '"Courier New", monospace' : 'Georgia, serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const words = title.split(' ');
    let line = '';
    let y = scratched ? 24 : 14;
    for (const word of words) {
      if (line && ctx.measureText(line + word).width > w - 20) { ctx.fillText(line.trim(), w / 2, y); line = ''; y += scratched ? 32 : 26; }
      line += word + ' ';
    }
    ctx.fillText(line.trim(), w / 2, y);
  });
}

/**
 * @param clue a clue for the Silverpilen mystery to leave in this wing
 * @param side reached by the door beside the escalators (`SIDE_DOOR`), where a ticket hall's take the end wall
 */
export function buildServiceWing(physics: Physics, index: number, cx: number, e: 1 | -1, kind: 'cavern' | 'staff' | 'shelter', dry = false, clue?: Clue, side = false): ServiceWing {
  const s = new Section(`service-${index}`, rgb(0x1b1c1d), dry);
  const wallX = cx - e * CAVE_HALF_L;
  const X = (a: number) => wallX - e * a;
  const zones: Zone[] = [];
  const interactables: Interactable[] = [];
  const updates: Array<(dt: number) => void> = [];
  const box = (a0: number, a1: number, y0: number, y1: number, z0: number, z1: number, paint: Paint, collide = true, cell?: number) => {
    const min = { x: Math.min(X(a0), X(a1)), y: y0, z: Math.min(z0, z1) };
    const max = { x: Math.max(X(a0), X(a1)), y: y1, z: Math.max(z0, z1) };
    s.lit.box(min, max, paint, [], cell);
    if (collide) physics.box(min, max);
  };
  const zone = (a0: number, a1: number, y0: number, y1: number, halfW: number, label: string) => {
    zones.push({ min: { x: Math.min(X(a0), X(a1)), y: y0, z: -halfW }, max: { x: Math.max(X(a0), X(a1)), y: y1, z: halfW }, station: index, area: 'service', label });
  };
  const lamp = (a: number, y: number, z: number, color: RGB = LAMP, intensity = 0.8, range = 7) => {
    s.unlit.box({ x: Math.min(X(a - 0.5), X(a + 0.5)), y: y - 0.05, z: z - 0.07 }, { x: Math.max(X(a - 0.5), X(a + 0.5)), y, z: z + 0.07 }, color);
    s.light(X(a), y - 0.3, z, color, intensity, range);
  };
  const facing = (dir: 1 | -1) => new Vector3(-e * dir, 0, 0);

  /** A straight corridor along a, open at both ends unless walls are added. */
  const corridor = (a0: number, a1: number, floorY: number, halfW = CORRIDOR.halfWidth, height = CORRIDOR.height, paint = corridorPaint(floorY)) => {
    const w = CORRIDOR.wall;
    box(a0, a1, floorY - 0.2, floorY, -halfW - w, halfW + w, paint);
    box(a0, a1, floorY + height, floorY + height + 0.2, -halfW - w, halfW + w, paint);
    for (const side of [-1, 1]) box(a0, a1, floorY, floorY + height, side * halfW, side * (halfW + w), paint);
    // A cable tray and conduit along one wall.
    box(a0, a1, floorY + height - 0.35, floorY + height - 0.3, halfW - 0.25, halfW, rgb(0x3b3e41), false);
    for (let a = a0 + 2.5; a < a1 - 1; a += 5) lamp(a, floorY + height - 0.02, 0);
  };
  /** A wall across the corridor at `a`, with an opening. */
  const endWall = (a: number, floorY: number, halfW: number, height: number, gapHalf: number, gapTop: number, paint: Paint) => {
    box(a, a + 0.2, floorY, floorY + height, -halfW - 0.12, -gapHalf, paint);
    box(a, a + 0.2, floorY, floorY + height, gapHalf, halfW + 0.12, paint);
    if (gapTop < height) box(a, a + 0.2, floorY + gapTop, floorY + height, -gapHalf, gapHalf, paint);
  };
  /** Straight stairs along a, with a smooth ramp collider so walking stays steady. */
  const stairs = (a0: number, a1: number, y0: number, y1: number, halfW: number) => {
    const steps = Math.round(Math.abs(y1 - y0) / 0.25);
    const run = (a1 - a0) / steps;
    const rise = (y1 - y0) / steps;
    for (let k = 0; k < steps; k++) {
      const top = rise > 0 ? y0 + (k + 1) * rise : y0 + k * rise;
      box(a0 + k * run, a0 + (k + 1) * run, Math.min(y0, y1) - 0.2, top, -halfW, halfW, (_p, n) => (n.y > 0.5 ? rgb(0x6c6a64) : rgb(0x55534e)), false);
      box(a0 + k * run, a0 + k * run + 0.05, top - 0.01, top + 0.004, -halfW, halfW, YELLOW, false);
    }
    const length = Math.hypot(a1 - a0, y1 - y0);
    const angle = Math.atan2(y1 - y0, a1 - a0);
    // Half a riser up, so the ramp runs through the middle of each tread.
    const mid = new Vector3(X((a0 + a1) / 2), (y0 + y1) / 2 + 0.125, 0);
    // The ramp's top face runs through the step nosings.
    const normal = new Vector3(-(-e) * Math.sin(angle), Math.cos(angle), 0);
    physics.tiltedBox(mid.addScaledVector(normal, -0.15), { x: length / 2 + 0.1, y: 0.15, z: halfW }, -e * angle);
    const w = CORRIDOR.wall;
    const lo = Math.min(y0, y1);
    const hi = Math.max(y0, y1);
    for (const side of [-1, 1]) box(a0, a1, lo - 0.2, hi + CORRIDOR.height + 0.4, side * halfW, side * (halfW + w), corridorPaint(lo));
    // A stepped ceiling that follows the flight.
    for (let k = 0; k < 4; k++) {
      const ya = y0 + (y1 - y0) * (rise > 0 ? (k + 1) / 4 : k / 4);
      box(a0 + (a1 - a0) * k / 4, a0 + (a1 - a0) * (k + 1) / 4, ya + CORRIDOR.height + 0.2, ya + CORRIDOR.height + 0.4, -halfW - w, halfW + w, corridorPaint(lo), false);
    }
    for (let a = a0 + 1.5; a < a1; a += 3.2) lamp(a, y0 + (y1 - y0) * (a - a0) / (a1 - a0) + CORRIDOR.height + 0.1, halfW - 0.2, LAMP, 0.7, 6);
  };

  /** Where the service corridor starts: at the end wall, or past the passage from the door beside the escalators. */
  const start = side ? SIDE_DOOR.start : 0;
  if (side) {
    const D = SIDE_DOOR;
    const W = CORRIDOR.wall;
    const paint = corridorPaint(0);
    const high = corridorPaint(PLATFORM_Y);
    // A box across z from `z0` to `z1`, the side passage's own (the helpers above are centred on the corridor).
    const wall = (a0: number, a1: number, y0: number, y1: number, z0: number, z1: number, p: Paint, collide = true) => box(a0, a1, y0, y1, z0, z1, p, collide);
    // At the platform's level through the end wall, then steps down to the trackbed.
    wall(0, D.down, PLATFORM_Y - 0.2, PLATFORM_Y, D.z0, D.z1, high);
    wall(0, D.down, PLATFORM_Y + CORRIDOR.height, PLATFORM_Y + CORRIDOR.height + 0.2, D.z0 - W, D.z1 + W, high);
    const steps = 5;
    const run = (D.flat - D.down) / steps;
    for (let k = 0; k < steps; k++) {
      const top = PLATFORM_Y - (k + 1) * (PLATFORM_Y / steps);
      wall(D.down + k * run, D.down + (k + 1) * run, -0.2, Math.max(0, top), D.z0, D.z1, (_p, n) => (n.y > 0.5 ? STEEL : rgb(0x30343a)), false);
      wall(D.down + k * run, D.down + k * run + 0.05, top - 0.01, top + 0.004, D.z0, D.z1, YELLOW, false);
    }
    const along = Math.hypot(D.flat - D.down, PLATFORM_Y);
    const tilt = Math.atan2(PLATFORM_Y, D.flat - D.down);
    physics.tiltedBox({ x: X((D.down + D.flat) / 2), y: PLATFORM_Y / 2 - 0.15, z: (D.z0 + D.z1) / 2 }, { x: along / 2 + 0.1, y: 0.15, z: (D.z1 - D.z0) / 2 }, e * tilt);
    wall(D.down, D.turn, PLATFORM_Y + CORRIDOR.height, PLATFORM_Y + CORRIDOR.height + 0.2, D.z0 - W, D.z1 + W, high);
    wall(D.flat, D.turn, -0.2, 0, D.z0, D.z1, paint);
    for (const [z0, z1] of [[D.z0 - W, D.z0], [D.z1, D.z1 + W]]) wall(0, D.turn, -0.2, PLATFORM_Y + CORRIDOR.height, z0, z1, high);
    // Across under the escalator shaft to the corridor, its walls closing either end.
    // A lintel where the high passage meets the low one.
    wall(D.turn - W, D.turn, CORRIDOR.height, PLATFORM_Y + CORRIDOR.height + 0.2, D.z0, D.z1, paint);
    const [c0, c1] = [D.turn, D.start];
    const zc = CORRIDOR.halfWidth;
    wall(c0, c1, -0.2, 0, D.z0, zc, paint);
    wall(c0, c1, CORRIDOR.height, CORRIDOR.height + 0.2, D.z0 - W, zc + W, paint);
    wall(c0 - W, c0, 0, CORRIDOR.height, D.z1, zc + W, paint);
    wall(c1, c1 + W, 0, CORRIDOR.height, D.z0 - W, -zc, paint);
    wall(c0, c1, 0, CORRIDOR.height, zc, zc + W, paint);
    wall(c0, c1, 0, CORRIDOR.height, D.z0 - W, D.z0, paint);
    lamp(1.5, PLATFORM_Y + CORRIDOR.height - 0.02, (D.z0 + D.z1) / 2, LAMP, 0.7, 5);
    lamp(D.flat + 0.6, CORRIDOR.height + 0.8, (D.z0 + D.z1) / 2, LAMP, 0.7, 5);
    lamp((c0 + c1) / 2, CORRIDOR.height - 0.02, -1.6, LAMP, 0.7, 6);
    const zoneBox = (a0: number, a1: number, y0: number, y1: number, z0: number, z1: number) => zones.push({
      min: { x: Math.min(X(a0), X(a1)), y: y0, z: z0 }, max: { x: Math.max(X(a0), X(a1)), y: y1, z: z1 }, station: index, area: 'service', label: sv.service.corridor,
    });
    zoneBox(0, D.turn, -0.5, PLATFORM_Y + 3, D.z0, D.z1);
    zoneBox(c0, c1, -0.5, 3, D.z0, zc);
    // The door frame on the platform, a staff-only sign by it and an exit sign over it.
    const facingOut = new Vector3(e, 0, 0);
    for (const z of [D.z0, D.z1]) wall(-0.12, 0, PLATFORM_Y, PLATFORM_Y + D.height + 0.12, Math.min(z, z + (z === D.z0 ? -0.1 : 0.1)), Math.max(z, z + (z === D.z0 ? -0.1 : 0.1)), STEEL, false);
    wall(-0.12, 0, PLATFORM_Y + D.height, PLATFORM_Y + D.height + 0.12, D.z0, D.z1, STEEL, false);
    if (!s.dry) {
      place(s, exitSign(), 0.7, 0.26, new Vector3(X(-0.14), PLATFORM_Y + D.height + 0.35, (D.z0 + D.z1) / 2), facingOut);
      place(s, textSign(sv.service.staffOnly, 512, 96, '#f2f2f2', '#b3261e'), 0.9, 0.17, new Vector3(X(-0.02), PLATFORM_Y + 1.5, D.z0 - 0.62), facingOut);
    }
  }

  if (kind === 'cavern') {
    // A short bypass between the tail tubes into the turnback cavern.
    corridor(start, TAIL_TUBE, 0);
    zone(start, TAIL_TUBE, -0.5, 3, CORRIDOR.halfWidth + 0.1, sv.service.corridor);
    const sign = textSign(sv.service.turnback, 768, 112, '#f2f2f2', '#10325f');
    place(s, sign, 1.6, 0.23, new Vector3(X(start + 1), 2.25, -CORRIDOR.halfWidth + 0.02), new Vector3(0, 0, 1));
    if (clue === 'scratches') {
      const scratched = clueNote(sv.mystery.clues.scratches[1].split(': ')[1].replace(/[”"]/g, ''), true);
      scratched.material.transparent = true;
      place(s, scratched, 1.1, 0.86, new Vector3(X(11), 1.45, CORRIDOR.halfWidth - 0.02), new Vector3(0, 0, -1));
      interactables.push({ pos: new Vector3(X(11), 1, 0.3), radius: 1.4, prompt: () => text.mystery.scratchesPrompt, act: () => mystery.read('scratches') });
    }
  }

  if (kind === 'staff') {
    corridor(start, 12, 0);
    zone(start, 12, -0.5, 3, CORRIDOR.halfWidth + 0.1, sv.service.corridor);
    // Staff room: table, chairs, lockers, a coffee machine and a notice board.
    const R = { a0: 12, a1: 20, halfW: 3.2, height: 2.8 };
    const paint = corridorPaint(0);
    box(R.a0, R.a1, -0.2, 0, -R.halfW - 0.12, R.halfW + 0.12, rgb(0x6b5b4b));
    box(R.a0, R.a1, R.height, R.height + 0.2, -R.halfW - 0.12, R.halfW + 0.12, paint);
    for (const side of [-1, 1]) box(R.a0, R.a1, 0, R.height, side * R.halfW, side * (R.halfW + 0.12), paint);
    endWall(R.a0 - 0.2, 0, R.halfW, R.height, CORRIDOR.halfWidth, CORRIDOR.height, paint);
    endWall(R.a1, 0, R.halfW, R.height, 0.8, 2.5, paint);
    zone(R.a0, R.a1, -0.5, 3, R.halfW, sv.service.staffRoom);
    lamp(14.5, R.height - 0.02, -1.4, LAMP, 0.9, 8);
    lamp(17.5, R.height - 0.02, 1.4, LAMP, 0.9, 8);
    box(15, 17.6, 0.72, 0.77, -1.9, -0.9, rgb(0xd8d2c3));
    box(15.1, 15.18, 0, 0.72, -1.8, -1.72, STEEL);
    box(17.42, 17.5, 0, 0.72, -1.08, -1, STEEL);
    physics.box({ x: Math.min(X(15), X(17.6)), y: 0, z: -1.9 }, { x: Math.max(X(15), X(17.6)), y: 0.77, z: -0.9 });
    for (const a of [15.6, 17]) for (const z of [-2.35, -0.45]) box(a - 0.22, a + 0.22, 0, 0.45, z - 0.2, z + 0.2, rgb(0x2f5a8a));
    for (let a = 12.4; a < 15.6; a += 0.62) box(a, a + 0.58, 0, 1.85, R.halfW - 0.5, R.halfW, rgb(0x8e9aa3));
    box(18.6, 19.5, 0, 1.75, R.halfW - 0.6, R.halfW, rgb(0x2b2e33));
    s.unlit.box({ x: Math.min(X(18.95), X(19.05)), y: 1.2, z: R.halfW - 0.61 }, { x: Math.max(X(18.95), X(19.05)), y: 1.26, z: R.halfW - 0.6 }, rgb(0xff3b2e));
    box(12.3, 13.1, 0, 1.8, -R.halfW, -R.halfW + 0.65, rgb(0xe9e8e2));
    const board = createCanvasSign(512, 384, (ctx, w, h) => {
      ctx.fillStyle = '#b89a6a';
      ctx.fillRect(0, 0, w, h);
      const notes: Array<[string, string, number, number]> = sv.service.notices.map((note, i) => [note, ['#fff7b0', '#ffffff', '#cfe8ff', '#ffd6d6'][i % 4], 30 + (i % 2) * 250, 24 + Math.floor(i / 2) * 170]);
      for (const [note, bg, x, y] of notes) {
        ctx.fillStyle = bg;
        ctx.fillRect(x, y, 220, 150);
        ctx.fillStyle = '#20252b';
        ctx.font = `600 22px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const words = note.split(' ');
        let line = '';
        let ly = y + 14;
        for (const word of words) {
          if (ctx.measureText(line + word).width > 196) { ctx.fillText(line, x + 12, ly); line = ''; ly += 28; }
          line += word + ' ';
        }
        ctx.fillText(line, x + 12, ly);
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.arc(x + 110, y + 8, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    place(s, board, 1.6, 1.2, new Vector3(X(17), 1.6, R.halfW - 0.02), new Vector3(0, 0, -1));
    // Passive-aggressive notes on the fridge, the coffee machine and the lockers.
    const [yoghurt, descale, locker] = sv.service.kitchenNotes.map((note, i) => noteSign(note, ['#fff3a8', '#ffffff', '#ffd9e1'][i]));
    place(s, yoghurt, 0.24, 0.28, new Vector3(X(12.72), 1.32, -R.halfW + 0.65), new Vector3(0, 0, 1));
    place(s, descale, 0.22, 0.26, new Vector3(X(18.85), 1.5, R.halfW - 0.6), new Vector3(0, 0, -1));
    place(s, locker, 0.22, 0.26, new Vector3(X(13.95), 1.45, R.halfW - 0.5), new Vector3(0, 0, -1));
    if (clue === 'clipping') {
      place(s, clueNote('SPÖKTÅGET: FÖRAREN SOM VÄGRAR KÖRA'), 0.34, 0.27, new Vector3(X(16.4), 1.95, R.halfW - 0.03), new Vector3(0, 0, -1));
      interactables.push({ pos: new Vector3(X(16.4), 1.2, R.halfW - 0.9), radius: 1.2, prompt: () => text.mystery.clippingPrompt, act: () => mystery.read('clipping') });
    }
    // The shared notice board on the other wall: notes from other players (see `notes.ts`).
    if (!s.dry) place(s, sharedNotes.board(), 1.8, 1.2, new Vector3(X(16.3), 1.55, -R.halfW + 0.02), new Vector3(0, 0, 1));
    interactables.push({
      pos: new Vector3(X(16.3), 1, -R.halfW + 1), radius: 1.5, prompt: () => text.notes.prompt,
      act: () => { sharedNotes.refresh(); noteWriter.open?.(); },
    });
    interactables.push({
      pos: new Vector3(X(19.05), 1.1, R.halfW - 0.9), radius: 1.3, prompt: () => text.service.coffeePrompt,
      act: () => text.service.coffee,
    });

    // Emergency stairs up to a locked, alarmed door.
    stairs(20.2, 30.2, 0, 6, 0.8);
    zone(20.2, 32.2, -0.5, 9, 0.9, sv.service.emergencyExit);
    box(30.2, 32.2, 5.8, 6, -0.92, 0.92, CONCRETE);
    box(30.2, 32.2, 8.6, 8.8, -0.92, 0.92, CONCRETE);
    for (const side of [-1, 1]) box(30.2, 32.2, 6, 8.6, side * 0.8, side * 0.92, corridorPaint(6));
    box(32.2, 32.4, 6, 8.6, -0.92, 0.92, corridorPaint(6));
    box(32.1, 32.2, 6, 8.1, -0.5, 0.5, rgb(0x5a6b58), false);
    box(32.0, 32.1, 7.05, 7.1, -0.4, 0.4, STEEL, false);
    lamp(31.2, 8.58, 0, LAMP, 0.8, 5);
    place(s, exitSign(sv.service.exitVasagatan), 0.9, 0.34, new Vector3(X(32.08), 8.3, 0), facing(1));
    place(s, textSign(sv.service.alarmed, 512, 96, '#f4d03f', '#1c2025'), 0.7, 0.13, new Vector3(X(32.08), 7.45, 0), facing(1));
    const door = new Vector3(X(31.7), 7, 0);
    interactables.push({ pos: door, radius: 1.3, get prompt() { return staffKey.has ? text.key.unlockPrompt : text.service.pushPrompt; }, act: () => (staffKey.exit(door) ? undefined : text.service.lockedExit) });
  }

  if (kind === 'shelter') {
    corridor(start, 10, 0);
    zone(start, 10, -0.5, 3, CORRIDOR.halfWidth + 0.1, sv.service.corridor);
    const floor = -6;
    stairs(10, 20, 0, floor, 0.9);
    zone(10, 20, floor - 0.5, 3, 1, sv.service.shelterStairs);
    const tube = (a: number, z: number, y: number, ceiling: number, intensity = 0.85) => {
      // A fluorescent fitting on two wires, lengthwise.
      for (const da of [-0.5, 0.5]) box(a + da - 0.01, a + da + 0.01, y + 0.07, ceiling, z - 0.01, z + 0.01, rgb(0x2a2c2e), false);
      box(a - 0.65, a + 0.65, y + 0.04, y + 0.1, z - 0.09, z + 0.09, rgb(0xd8d9d2), false);
      s.unlit.box({ x: Math.min(X(a - 0.6), X(a + 0.6)), y, z: z - 0.04 }, { x: Math.max(X(a - 0.6), X(a + 0.6)), y: y + 0.04, z: z + 0.04 }, COLD_TUBE);
      if (intensity > 0) s.light(X(a), y - 0.25, z, COLD_TUBE, intensity, 9);
    };
    const door = rgb(0x5e6f60);

    // The lock: a heavy blast door standing open, a short chamber, and the inner door into the shelter.
    const L = { a0: 20, a1: 27.6, halfW: 1.8, height: 2.7 };
    box(L.a0, L.a1, floor - 0.2, floor, -L.halfW - 0.2, L.halfW + 0.2, EPOXY, true, 1.2);
    box(L.a0 + 0.6, L.a1 - 0.6, floor + L.height, floor + L.height + 0.2, -L.halfW - 0.2, L.halfW + 0.2, shelterPaint(floor), false, 1.2);
    for (const side of [-1, 1]) box(L.a0 + 0.6, L.a1 - 0.6, floor, floor + L.height, side * L.halfW, side * (L.halfW + 0.2), shelterPaint(floor), true, 1.2);
    const doorWall = (a0: number, a1: number, top: number) => {
      box(a0, a1, floor, floor + top, -L.halfW - 0.2, -0.65, shelterPaint(floor));
      box(a0, a1, floor, floor + top, 0.65, L.halfW + 0.2, shelterPaint(floor));
      box(a0, a1, floor + 2.1, floor + top, -0.65, 0.65, shelterPaint(floor));
    };
    // The outer wall runs up to the stair ceiling, with the shelter's sign over the door.
    doorWall(L.a0, L.a0 + 0.6, 4.55);
    for (const side of [-1, 1]) box(L.a0 - 0.06, L.a0, floor, floor + 2.18, side * 0.65, side * 0.78, STEEL, false);
    box(L.a0 - 0.06, L.a0, floor + 2.1, floor + 2.18, -0.78, 0.78, STEEL, false);
    place(s, shelterSign(), 0.56, 0.7, new Vector3(X(L.a0 - 0.02), floor + 2.62, 0), facing(-1));
    place(s, textSign(sv.service.shelterPlate, 768, 96, '#f2f2f2', '#10151c'), 1.5, 0.19, new Vector3(X(L.a0 - 0.02), floor + 3.25, 0), facing(-1));
    // The blast door swung back against the lock's wall, its closing levers showing.
    box(L.a0 + 0.62, L.a0 + 1.94, floor + 0.02, floor + 2.06, 1.56, 1.76, door);
    for (const a of [L.a0 + 0.85, L.a0 + 1.7]) for (const y of [0.55, 1.55]) box(a - 0.05, a + 0.05, floor + y - 0.13, floor + y + 0.13, 1.48, 1.56, STEEL, false);
    doorWall(L.a1 - 0.6, L.a1 - 0.02, L.height);
    tube((L.a0 + L.a1) / 2, 0, floor + L.height - 0.25, floor + L.height, 0.7);
    zone(L.a0, L.a1, floor - 0.5, floor + L.height + 0.2, L.halfW, sv.service.shelterLock);
    place(s, textSign(sv.service.lockSign, 1024, 96, '#f4d03f', '#1c2025'), 1.3, 0.12, new Vector3(X(L.a1 - 0.62), floor + 2.35, 0), facing(-1));
    // The decontamination shower over a drain, a bench, and masks on their hooks.
    const shower = { a: L.a0 + 2.4, z: -1.1 };
    box(shower.a - 0.02, shower.a + 0.02, floor + 2.2, floor + L.height, shower.z - 0.02, shower.z + 0.02, STEEL, false);
    const head = new CylinderGeometry(0.12, 0.06, 0.08, 14);
    s.lit.geometry(head, new Matrix4().setPosition(X(shower.a), floor + 2.16, shower.z), STEEL);
    head.dispose();
    box(shower.a - 0.25, shower.a + 0.25, floor, floor + 0.006, shower.z - 0.25, shower.z + 0.25, rgb(0x2b2d2f), false);
    interactables.push({ pos: new Vector3(X(shower.a), floor + 1, shower.z), radius: 1.2, prompt: () => text.service.showerPrompt, act: () => text.service.shower });
    box(L.a0 + 3.4, L.a0 + 5.6, floor + 0.42, floor + 0.47, 1.3, 1.75, rgb(0x8a6a45));
    for (const a of [L.a0 + 3.5, L.a0 + 5.5]) box(a - 0.03, a + 0.03, floor, floor + 0.42, 1.35, 1.7, STEEL, false);
    box(L.a0 + 3.2, L.a0 + 6, floor + 1.72, floor + 1.76, -L.halfW + 0.02, -L.halfW + 0.07, STEEL, false);
    for (let i = 0; i < 6; i++) {
      const a = L.a0 + 3.45 + i * 0.47;
      box(a - 0.12, a + 0.12, floor + 1.4, floor + 1.7, -L.halfW + 0.03, -L.halfW + 0.13, rgb(0x2b2e2b), false);
      const filter = new CylinderGeometry(0.06, 0.06, 0.09, 10);
      s.lit.geometry(filter, new Matrix4().makeRotationX(Math.PI / 2).setPosition(X(a), floor + 1.46, -L.halfW + 0.18), rgb(0x5d6a47));
      filter.dispose();
    }
    interactables.push({ pos: new Vector3(X(L.a0 + 4.6), floor + 1, -L.halfW + 0.7), radius: 1.3, prompt: () => text.service.masksPrompt, act: () => text.service.masks });

    // The shelter proper: a vault blasted into the rock and sprayed with concrete, 480 places under one arch.
    const V = { a0: L.a1, a1: 67.6, halfW: 7, wallH: 1.8, top: 4.8, rooms: 59.6 };
    const vx0 = Math.min(X(V.a0), X(V.a1));
    const vx1 = Math.max(X(V.a0), X(V.a1));
    const profile = archProfile(0, V.halfW, floor + V.wallH, floor + V.top, floor, 28, 0.6);
    extrudeRock(s.lit, profile, vx0, vx1, { step: 0.5, amplitude: 0.16, seed: 4127 }, SHOTCRETE(floor));
    wallWithHoles(s.lit, X(V.a0), profile, [rectHole(-0.65, 0.65, floor, floor + 2.1)], SHOTCRETE(floor));
    wallWithHoles(s.lit, X(V.a1), profile, [], SHOTCRETE(floor));
    box(V.a0, V.a1, floor - 0.25, floor, -V.halfW - 0.2, V.halfW + 0.2, EPOXY, true, 1.2);
    for (const side of [-1, 1]) {
      physics.box({ x: vx0, y: floor, z: Math.min(side * V.halfW, side * (V.halfW + 0.6)) }, { x: vx1, y: floor + V.top + 1, z: Math.max(side * V.halfW, side * (V.halfW + 0.6)) });
      physics.box({ x: Math.min(X(V.a0 - 0.6), X(V.a0)), y: floor, z: Math.min(side * L.halfW, side * (V.halfW + 0.6)) }, { x: Math.max(X(V.a0 - 0.6), X(V.a0)), y: floor + V.top + 1, z: Math.max(side * L.halfW, side * (V.halfW + 0.6)) });
    }
    physics.box({ x: Math.min(X(V.a1), X(V.a1 + 0.5)), y: floor, z: -V.halfW - 0.6 }, { x: Math.max(X(V.a1), X(V.a1 + 0.5)), y: floor + V.top + 1, z: V.halfW + 0.6 });
    zone(V.a0, V.rooms, floor - 0.5, floor + V.top + 0.2, V.halfW, sv.service.shelter);
    // The inner door, open into the shelter.
    box(V.a0 + 0.02, V.a0 + 1.3, floor + 0.02, floor + 2.04, -0.76, -0.68, door);
    box(V.a0 + 1.1, V.a0 + 1.16, floor + 0.95, floor + 1.15, -0.68, -0.64, STEEL, false);
    // Yellow lines keep the aisle free between the bunks.
    for (const z of [-1.45, 1.45]) box(V.a0 + 0.8, V.rooms - 0.4, floor, floor + 0.004, z - 0.04, z + 0.04, YELLOW, false);
    // Cable trays at the springing of the arch, and the ventilation duct along the crown.
    for (const side of [-1, 1]) box(V.a0 + 0.4, V.a1 - 0.4, floor + V.wallH + 0.12, floor + V.wallH + 0.17, side * (V.halfW - 0.35), side * (V.halfW - 0.05), rgb(0x3b3e41), false);
    const ductY = floor + 4.15;
    const duct = new CylinderGeometry(0.32, 0.32, V.a1 - V.a0 - 2.8, 16, 1, true);
    s.lit.geometry(duct, new Matrix4().makeRotationZ(Math.PI / 2).setPosition(X((V.a0 + 1.2 + V.a1 - 1.6) / 2), ductY, 0), rgb(0x9aa19b));
    duct.dispose();
    for (let a = V.a0 + 3; a < V.a1 - 2; a += 3) box(a - 0.03, a + 0.03, ductY + 0.3, floor + V.top, -0.03, 0.03, rgb(0x2a2c2e), false);
    for (let a = V.a0 + 4.5; a < V.rooms - 2; a += 6) box(a - 0.25, a + 0.25, ductY - 0.42, ductY - 0.3, -0.18, 0.18, rgb(0x5a5f5c), false);
    // Two rows of fluorescent tubes; one of them has seen better days.
    let flickering: Mesh | null = null;
    for (let i = 0, a = V.a0 + 3.2; a < V.rooms - 2; a += 4.5, i++) {
      for (const z of [-2.6, 2.6]) {
        const bad = i === 3 && z > 0;
        tube(a, z, floor + 3.05, floor + 4.55, bad ? 0.3 : 0.85);
        if (bad && !s.dry) {
          flickering = new Mesh(new BoxGeometry(1.2, 0.042, 0.082), new MeshBasicMaterial({ color: 0xf2f6ff }));
          flickering.position.set(X(a), floor + 3.02, z);
          s.extras.add(flickering);
        }
      }
    }
    if (flickering) {
      const tubeMesh = flickering;
      let next = 0;
      updates.push((dt) => {
        next -= dt;
        if (next > 0) return;
        const on = !tubeMesh.visible;
        tubeMesh.visible = on;
        next = on ? 0.4 + Math.random() * 3 : 0.04 + Math.random() * 0.12;
      });
    }

    // Triple bunks along both walls.
    for (let a = V.a0 + 3; a < V.rooms - 4.5; a += 2.3) {
      for (const side of [-1, 1]) {
        const zw = side * (V.halfW - 0.45);
        const zi = side * (V.halfW - 1.4);
        for (const [pa, pz] of [[a, zw], [a + 1.95, zw], [a, zi], [a + 1.95, zi]] as const) box(pa, pa + 0.05, floor, floor + 2.3, pz - side * 0.05, pz, rgb(0x55605a), false);
        for (const y of [0.35, 1.15, 1.95]) {
          box(a, a + 2, floor + y, floor + y + 0.06, zi, zw, rgb(0x55605a), false);
          box(a + 0.05, a + 1.95, floor + y + 0.06, floor + y + 0.16, zi + side * 0.05, zw - side * 0.05, rgb(0x5d7152), false);
          // Some places are made up: a folded blanket at the foot, a pillow at the head.
          const k = Math.floor(a * 7 + y * 13 + side * 5 + 100);
          if (k % 5 > 1) continue;
          const zm = (zi + zw) / 2;
          box(a + 1.35, a + 1.85, floor + y + 0.16, floor + y + 0.26, zm - 0.35, zm + 0.35, BLANKETS[k % BLANKETS.length], false);
          box(a + 0.12, a + 0.52, floor + y + 0.16, floor + y + 0.24, zm - 0.28, zm + 0.28, rgb(0xd9d6cc), false);
        }
        physics.box({ x: Math.min(X(a), X(a + 2)), y: floor, z: Math.min(zi, zw) }, { x: Math.max(X(a), X(a + 2)), y: floor + 2.3, z: Math.max(zi, zw) });
      }
    }
    // Tables with benches down the aisle.
    for (const a of [V.a0 + 6, V.a0 + 14, V.a0 + 22]) {
      box(a, a + 3.2, floor + 0.72, floor + 0.77, -0.5, 0.5, rgb(0x8a6a45));
      for (const la of [a + 0.2, a + 3]) box(la - 0.04, la + 0.04, floor, floor + 0.72, -0.4, 0.4, STEEL, false);
      for (const side of [-1, 1]) {
        box(a + 0.1, a + 3.1, floor + 0.42, floor + 0.46, side * 0.75, side * 1.05, rgb(0x7a5c3a));
        for (const la of [a + 0.3, a + 2.9]) box(la - 0.03, la + 0.03, floor, floor + 0.42, side * 0.8, side * 1.0, STEEL, false);
      }
    }
    if (clue === 'logbook') {
      // A worn driver's logbook, left open on a table.
      box(V.a0 + 14.9, V.a0 + 15.5, floor + 0.77, floor + 0.81, -0.22, 0.22, rgb(0x5a2a22), false);
      box(V.a0 + 14.93, V.a0 + 15.47, floor + 0.81, floor + 0.82, -0.2, 0.2, rgb(0xe6d9a8), false);
      interactables.push({ pos: new Vector3(X(V.a0 + 15.2), floor + 0.6, 0), radius: 1.5, prompt: () => text.mystery.logbookPrompt, act: () => mystery.read('logbook') });
    }
    // Water and emergency rations by the far end.
    for (let i = 0; i < 3; i++) {
      const tank = new CylinderGeometry(0.55, 0.55, 1.5, 16);
      s.lit.geometry(tank, new Matrix4().setPosition(X(V.rooms - 3.4 + i * 1.2), floor + 0.75, -V.halfW + 1.2), rgb(0x2d5f9a));
      tank.dispose();
    }
    physics.box({ x: Math.min(X(V.rooms - 4), X(V.rooms - 0.6)), y: floor, z: -V.halfW }, { x: Math.max(X(V.rooms - 4), X(V.rooms - 0.6)), y: floor + 1.5, z: -V.halfW + 1.8 });
    for (let i = 0; i < 6; i++) {
      const a = V.rooms - 1.2 - (i % 3) * 0.7;
      const y = floor + Math.floor(i / 3) * 0.5;
      box(a - 0.3, a + 0.3, y, y + 0.48, V.halfW - 1.9, V.halfW - 1.1, rgb(0x6d7a4e), i < 3);
    }
    place(s, textSign(sv.service.rations, 512, 96, '#6d7a4e', '#f0f0e6'), 0.6, 0.11, new Vector3(X(V.rooms - 1.9), floor + 0.75, V.halfW - 1.93), new Vector3(0, 0, -1));
    // Notices and a first aid cabinet on the entrance wall, facing in.
    const posters: Array<[string, string, string[]]> = [
      [sv.service.posterAlarm, '#d9b93b', sv.service.alarmLines],
      [sv.service.posterInfo, '#b3261e', sv.service.posterLines],
      [sv.service.posterCalm, '#1c4a9a', sv.service.posterLines],
    ];
    posters.forEach(([title, band, lines], i) => {
      const poster = createCanvasSign(384, 512, (ctx, w) => {
        ctx.fillStyle = '#efeae0';
        ctx.fillRect(0, 0, w, 512);
        ctx.fillStyle = band;
        ctx.fillRect(0, 0, w, 120);
        ctx.fillStyle = i === 0 ? '#1c2025' : '#ffffff';
        fitText(ctx, title, w - 40, 800, 40);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, w / 2, 62);
        ctx.fillStyle = '#2a2d31';
        ctx.font = `500 22px ${FONT}`;
        lines.forEach((line, k) => ctx.fillText(line, w / 2, 170 + k * 52));
      });
      place(s, poster, 0.6, 0.8, new Vector3(X(V.a0 + 0.02), floor + 1.6, 2.3 + i * 0.8), facing(1));
    });
    box(V.a0, V.a0 + 0.2, floor + 1.2, floor + 1.8, -4.2, -3.6, rgb(0xeeeeea), false);
    box(V.a0 + 0.2, V.a0 + 0.21, floor + 1.42, floor + 1.58, -3.95, -3.85, rgb(0xc0392b), false);
    box(V.a0 + 0.2, V.a0 + 0.21, floor + 1.46, floor + 1.54, -4.01, -3.79, rgb(0xc0392b), false);
    // A key board by the door, with one key left on its hook.
    const hookZ = -2.1;
    box(V.a0, V.a0 + 0.03, floor + 1.3, floor + 1.75, hookZ - 0.3, hookZ + 0.3, rgb(0x8a6a45), false);
    if (!s.dry) {
      const key = new Group();
      const ring = new Mesh(new CylinderGeometry(0.035, 0.035, 0.01, 12), new MeshBasicMaterial({ color: 0xc9a44a }));
      ring.rotation.x = Math.PI / 2;
      const blade = new Mesh(new BoxGeometry(0.02, 0.1, 0.008), new MeshBasicMaterial({ color: 0xc9a44a }));
      blade.position.y = -0.07;
      const tag = new Mesh(new BoxGeometry(0.06, 0.035, 0.006), new MeshBasicMaterial({ color: 0xb3261e }));
      tag.position.set(0.04, -0.03, 0);
      key.add(ring, blade, tag);
      key.rotation.y = Math.PI / 2;
      key.position.set(X(V.a0 + 0.07), floor + 1.52, hookZ);
      s.extras.add(key);
      staffKey.hang(key);
    }
    interactables.push({
      pos: new Vector3(X(V.a0 + 0.8), floor + 1, hookZ), radius: 1.3, prompt: () => text.key.takePrompt,
      enabled: () => !staffKey.has,
      act: () => { staffKey.take(); return text.key.taken; },
    });

    // Three rooms behind a block wall at the far end, open to the vault above: command, filters, dry toilets.
    const R = { a0: V.rooms, a1: V.a1, height: 2.4, wall: 0.2, edge: 6.75 };
    const doors = [-4.6, 0, 4.6];
    const cuts = [-R.edge, ...doors.flatMap((z) => [z - 0.5, z + 0.5]), R.edge];
    for (let k = 0; k < cuts.length; k += 2) box(R.a0, R.a0 + R.wall, floor, floor + R.height, cuts[k], cuts[k + 1], shelterPaint(floor));
    for (const z of doors) box(R.a0, R.a0 + R.wall, floor + 2.05, floor + R.height, z - 0.5, z + 0.5, shelterPaint(floor));
    for (const side of [-1, 1]) {
      box(R.a0, R.a0 + R.wall, floor, floor + V.wallH, side * R.edge, side * V.halfW, shelterPaint(floor));
      box(R.a0 + R.wall, R.a1, floor, floor + R.height, side * 2.3, side * 2.45, shelterPaint(floor));
    }
    const roomSigns: Array<[string, number]> = [[sv.service.roomCommand, doors[0]], [sv.service.roomFilters, doors[1]], [sv.service.roomToilets, doors[2]]];
    for (const [label, z] of roomSigns) place(s, textSign(label, 512, 96, '#f2f2f2', '#10151c'), 0.8, 0.15, new Vector3(X(R.a0 - 0.02), floor + 2.23, z), facing(-1));
    const zoneZ = (a0: number, a1: number, z0: number, z1: number, label: string) => {
      zones.push({ min: { x: Math.min(X(a0), X(a1)), y: floor - 0.5, z: z0 }, max: { x: Math.max(X(a0), X(a1)), y: floor + V.top + 0.2, z: z1 }, station: index, area: 'service', label });
    };
    zoneZ(R.a0, R.a1, -V.halfW, -2.3, sv.service.shelterCommand);
    zoneZ(R.a0, R.a1, -2.3, 2.3, sv.service.shelterFilters);
    zoneZ(R.a0, R.a1, 2.3, V.halfW, sv.service.shelterToilets);
    const roomY = floor + 2.3;
    for (const z of [-4.6, 0, 4.6]) tube((R.a0 + R.a1) / 2, z, roomY, floor + (z === 0 ? 4.2 : 3.6), 0.75);

    // Command: a desk with the radio and a telephone, the map of the shelters, and a clock that has stopped.
    box(R.a1 - 0.9, R.a1 - 0.05, floor + 0.72, floor + 0.77, -6.2, -3.4, rgb(0x6b5b4b));
    box(R.a1 - 0.85, R.a1 - 0.1, floor, floor + 0.72, -6.15, -5.4, rgb(0x5a4c3f));
    box(R.a1 - 0.85, R.a1 - 0.8, floor, floor + 0.72, -3.5, -3.45, STEEL, false);
    box(R.a1 - 1.6, R.a1 - 1.15, floor + 0.42, floor + 0.46, -5.1, -4.65, rgb(0x3a3d40));
    box(R.a1 - 1.2, R.a1 - 1.15, floor + 0.46, floor + 0.95, -5.1, -4.65, rgb(0x3a3d40), false);
    box(R.a1 - 0.75, R.a1 - 0.3, floor + 0.77, floor + 1.03, -5.65, -5.15, rgb(0x4b3b2e), false);
    box(R.a1 - 0.6, R.a1 - 0.35, floor + 0.77, floor + 0.86, -4.05, -3.75, rgb(0x16181a), false);
    box(R.a1 - 0.52, R.a1 - 0.43, floor + 0.86, floor + 0.9, -4.12, -3.68, rgb(0x16181a), false);
    box(R.a0 + 0.35, R.a0 + 0.85, floor, floor + 1.3, -6.5, -5.9, rgb(0x7d837f));
    // A shelf of binders against the rock: instructions, rosters, the inventory nobody finished.
    for (const a of [R.a0 + 2, R.a0 + 4.2]) box(a - 0.03, a + 0.03, floor, floor + 1.9, -6.72, -6.38, STEEL, false);
    for (const y of [0.1, 0.55, 1, 1.45, 1.88]) box(R.a0 + 1.97, R.a0 + 4.23, floor + y, floor + y + 0.03, -6.72, -6.38, rgb(0x6b6f6c), false);
    for (let i = 0; i < 26; i++) {
      const shelf = [0.13, 0.58, 1.03, 1.48][i % 4];
      const a = R.a0 + 2.08 + Math.floor(i / 4) * 0.33 + (i % 3) * 0.08;
      box(a, a + 0.07, floor + shelf, floor + shelf + 0.3, -6.66, -6.42, BINDERS[i % BINDERS.length], false);
    }
    physics.box({ x: Math.min(X(R.a0 + 1.95), X(R.a0 + 4.25)), y: floor, z: -6.75 }, { x: Math.max(X(R.a0 + 1.95), X(R.a0 + 4.25)), y: floor + 1.9, z: -6.35 });
    s.light(X(R.a1 - 0.5), floor + 1.4, -4.6, WARM_BULB, 0.5, 4);
    s.unlit.box({ x: Math.min(X(R.a1 - 0.35), X(R.a1 - 0.2)), y: floor + 1.15, z: -4.75 }, { x: Math.max(X(R.a1 - 0.35), X(R.a1 - 0.2)), y: floor + 1.22, z: -4.55 }, WARM_BULB);
    box(R.a1 - 0.3, R.a1 - 0.26, floor + 0.77, floor + 1.18, -4.67, -4.63, rgb(0x2f4a3a), false);
    let radioOn = false;
    let radioLine = 0;
    let dial: MeshBasicMaterial | null = null;
    if (!s.dry) {
      dial = new MeshBasicMaterial({ color: 0x2a2a20 });
      const glass = new Mesh(new PlaneGeometry(0.26, 0.08), dial);
      glass.position.set(X(R.a1 - 0.76), floor + 0.95, -5.4);
      glass.rotation.y = Math.atan2(facing(-1).x, facing(-1).z);
      s.extras.add(glass);
    }
    interactables.push({
      pos: new Vector3(X(R.a1 - 1.2), floor + 1, -5.4), radius: 1.3,
      get prompt() { return radioOn ? text.service.radioOffPrompt : text.service.radioPrompt; },
      act: () => {
        radioOn = !radioOn;
        dial?.color.setHex(radioOn ? 0xffc861 : 0x2a2a20);
        if (!radioOn) return text.service.radioOff;
        return text.service.radio[radioLine++ % text.service.radio.length];
      },
    });
    interactables.push({ pos: new Vector3(X(R.a1 - 1.1), floor + 1, -3.9), radius: 1, prompt: () => text.service.phonePrompt, act: () => text.service.phone });
    place(s, shelterMap(), 1.5, 1, new Vector3(X((R.a0 + R.a1) / 2), floor + 1.45, -2.47), new Vector3(0, 0, -1));
    interactables.push({ pos: new Vector3(X((R.a0 + R.a1) / 2), floor + 1, -3.3), radius: 1.3, prompt: () => text.service.mapPrompt, act: () => text.service.map });
    const clock = stoppedClock();
    clock.material.transparent = true;
    place(s, clock, 0.34, 0.34, new Vector3(X(R.a0 + R.wall + 0.02), floor + 1.95, -3.2), facing(1));

    // Filters: the hand-cranked fan, three filter canisters feeding the duct, and the reserve exit's hatch.
    const vent = { a: R.a0 + 2, z: -1.55 };
    box(vent.a - 0.6, vent.a + 0.6, floor, floor + 1.7, vent.z - 0.7, vent.z + 0.7, rgb(0x5b6e5c));
    for (const da of [-0.3, 0.3]) {
      const pipe = new CylinderGeometry(0.14, 0.14, ductY - 1.7 - floor, 12);
      s.lit.geometry(pipe, new Matrix4().setPosition(X(vent.a + da), floor + 1.7 + (ductY - 1.7 - floor) / 2, vent.z + 0.2), rgb(0x8b948d));
      pipe.dispose();
    }
    place(s, textSign(sv.service.ventilation, 512, 96, '#5b6e5c', '#f0f0e6'), 0.9, 0.17, new Vector3(X(vent.a), floor + 1.56, vent.z + 0.72), new Vector3(0, 0, 1));
    const crank = new Group();
    const arm = new Mesh(new BoxGeometry(0.05, 0.36, 0.05), new MeshBasicMaterial({ color: 0x9a9f98 }));
    arm.position.y = 0.16;
    const handle = new Mesh(new CylinderGeometry(0.03, 0.03, 0.16, 8), new MeshBasicMaterial({ color: 0x2a2320 }));
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0.32, 0.08);
    crank.add(arm, handle);
    crank.position.set(X(vent.a), floor + 1.05, vent.z + 0.74);
    s.extras.add(crank);
    let spin = 0;
    updates.push((dt) => {
      if (spin <= 0) return;
      spin = Math.max(0, spin - dt);
      crank.rotation.z -= dt * 5 * Math.min(1, spin);
    });
    interactables.push({
      pos: new Vector3(X(vent.a), floor + 1.1, vent.z + 1), radius: 1.4, prompt: () => text.service.crankPrompt,
      act: () => { spin = 3; return text.service.crank; },
    });
    for (let i = 0; i < 3; i++) {
      const a = R.a0 + 1.4 + i * 1.2;
      const can = new CylinderGeometry(0.36, 0.36, 1.3, 16);
      s.lit.geometry(can, new Matrix4().setPosition(X(a), floor + 0.65, 1.3), rgb(0x7f8782));
      can.dispose();
      const rise = new CylinderGeometry(0.09, 0.09, ductY - 1.3 - floor, 10);
      s.lit.geometry(rise, new Matrix4().setPosition(X(a), floor + 1.3 + (ductY - 1.3 - floor) / 2, 1.3), rgb(0x8b948d));
      rise.dispose();
      box(a - 0.09, a + 0.09, ductY - 0.09, ductY + 0.09, 0.25, 1.3, rgb(0x8b948d), false);
    }
    physics.box({ x: Math.min(X(R.a0 + 0.9), X(R.a0 + 4.3)), y: floor, z: 0.9 }, { x: Math.max(X(R.a0 + 0.9), X(R.a0 + 4.3)), y: floor + 1.3, z: 1.7 });
    box(R.a1 - 0.1, R.a1, floor + 0.7, floor + 1.8, -0.55, 0.55, STEEL, false);
    box(R.a1 - 0.16, R.a1 - 0.1, floor + 0.8, floor + 1.7, -0.45, 0.45, door, false);
    const wheel = new CylinderGeometry(0.2, 0.2, 0.04, 16);
    s.lit.geometry(wheel, new Matrix4().makeRotationZ(Math.PI / 2).setPosition(X(R.a1 - 0.2), floor + 1.25, 0), STEEL);
    wheel.dispose();
    place(s, exitSign(sv.service.reserveExitSign), 0.9, 0.34, new Vector3(X(R.a1 - 0.02), floor + 2.1, 0), facing(-1));
    interactables.push({ pos: new Vector3(X(R.a1 - 0.6), floor + 1, 0), radius: 1.3, prompt: () => text.service.pushPrompt, act: () => text.service.reserveExit });

    // Dry toilets: three cubicles with their doors open, and water for washing.
    const stalls = [2.45, 3.85, 5.25, 6.55];
    for (const z of stalls.slice(1, -1)) box(R.a1 - 2.4, R.a1, floor, floor + 1.9, z - 0.025, z + 0.025, rgb(0xb8b6a8));
    box(R.a1 - 2.4, R.a1, floor, floor + 1.9, 6.55, 6.6, rgb(0xb8b6a8));
    for (let k = 0; k < 3; k++) {
      const z0 = stalls[k];
      const z1 = stalls[k + 1];
      box(R.a1 - 3.1, R.a1 - 2.4, floor + 0.15, floor + 1.9, z0 + 0.03, z0 + 0.07, rgb(0xa7a595));
      const zc = (z0 + z1) / 2;
      const bucket = new CylinderGeometry(0.22, 0.2, 0.42, 14);
      s.lit.geometry(bucket, new Matrix4().setPosition(X(R.a1 - 0.45), floor + 0.21, zc), rgb(0x3f5a46));
      bucket.dispose();
      const seat = new CylinderGeometry(0.24, 0.24, 0.04, 14);
      s.lit.geometry(seat, new Matrix4().setPosition(X(R.a1 - 0.45), floor + 0.44, zc), rgb(0x1d1f21));
      seat.dispose();
      interactables.push({ pos: new Vector3(X(R.a1 - 1.6), floor + 1, zc), radius: 1, prompt: () => text.service.toiletPrompt, act: () => text.service.toilet });
    }
    box(R.a0 + 0.6, R.a0 + 1.8, floor + 0.78, floor + 0.82, 5.8, 6.5, rgb(0x8a6a45));
    for (const a of [R.a0 + 0.7, R.a0 + 1.7]) box(a - 0.03, a + 0.03, floor, floor + 0.78, 5.85, 6.45, STEEL, false);
    box(R.a0 + 0.75, R.a0 + 1.1, floor + 0.82, floor + 1.25, 5.95, 6.2, rgb(0x2d5f9a), false);
    box(R.a0 + 1.25, R.a0 + 1.65, floor + 0.82, floor + 0.95, 5.95, 6.35, rgb(0xd8d9d2), false);
  }

  const group = s.finish();
  return { group, zones, interactables, update: updates.length ? (dt) => updates.forEach((u) => u(dt)) : undefined };
}
