import { BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { MeshBuilder } from '../gfx/builder';
import { rgb } from '../gfx/color';
import { escalatorHeight, escalatorRun } from '../escalatorMotion';
import { ESC_LANDING, HALL_H, INCLINE as I, PLATFORM_Y } from '../layout';
import type { Physics, StaticCollider } from '../physics';
import { torchify } from '../powerLights';
import type { Section } from './section';
import { place as placeSign, textSign } from './signage';

/**
 * An inclined lift, a snedbanehiss: a glass cabin on rails in a narrow shaft
 * beside the escalators, shuttling between the platform and the ticket hall.
 * Where it is follows from the time alone, like the trains, so every visitor
 * sees the same cabin. Its floor and end walls are colliders moved by hand,
 * and whoever stands in it is carried along (`World.inclines`).
 */

/** Where the cabin is: `a` its downhill end along the flight, the stop it stands at (-1 below, 1 above, 0 on the way) and how open its doors are. */
export interface InclinePose {
  a: number;
  stop: -1 | 0 | 1;
  open: number;
}

/** How far the cabin has come after `t` seconds of a trip of `d` meters: speeding up, at speed, slowing down. */
function travelled(t: number, d: number): number {
  const ta = Math.min(I.speed / I.accel, Math.sqrt(d / I.accel));
  const top = I.accel * ta;
  const cruise = Math.max(0, (d - top * ta) / top);
  if (t <= ta) return 0.5 * I.accel * t * t;
  if (t <= ta + cruise) return 0.5 * top * ta + top * (t - ta);
  const u = Math.min(ta, t - ta - cruise);
  return Math.min(d, 0.5 * top * ta + top * cruise + top * u - 0.5 * I.accel * u * u);
}

/** Seconds a trip of `d` meters takes. */
export function tripTime(d: number): number {
  const ta = Math.min(I.speed / I.accel, Math.sqrt(d / I.accel));
  const top = I.accel * ta;
  return 2 * ta + Math.max(0, (d - top * ta) / top);
}

/** Doors opening over `I.doors` seconds from the start of a stop and closing over its last. */
function doorsAt(t: number): number {
  return Math.max(0, Math.min(1, t / I.doors, (I.dwell - t) / I.doors));
}

/**
 * The cabin at `time`, for a flight climbing `rise`: it waits with its doors open below, rides up, waits above and
 * rides down again. `phase` (0 to 1) sets each lift's place in the round, so they do not all move together.
 */
export function inclinePose(time: number, rise: number, phase: number): InclinePose {
  const d = escalatorRun(rise) - I.length;
  const trip = tripTime(d);
  const round = 2 * (I.dwell + trip);
  const t = (((time + phase * round) % round) + round) % round;
  if (t < I.dwell) return { a: 0, stop: -1, open: doorsAt(t) };
  if (t < I.dwell + trip) return { a: travelled(t - I.dwell, d), stop: 0, open: 0 };
  if (t < 2 * I.dwell + trip) return { a: d, stop: 1, open: doorsAt(t - I.dwell - trip) };
  return { a: d - travelled(t - 2 * I.dwell - trip, d), stop: 0, open: 0 };
}

/** The cabin's floor over the rails with its downhill end at `a`: on the flight's line under its middle, so level with the platform and the hall at the stops. */
export function cabinFloor(a: number, rise: number): number {
  return escalatorHeight(a + I.length / 2, rise);
}

/** Open enough to walk through: the door colliders stand aside. */
export const PASSABLE = 0.3;

export interface InclineZone {
  wallX: number;
  dir: 1 | -1;
  rise: number;
  run: number;
  /** The cabin's pose at the last update. */
  pose: InclinePose;
  /** How far the cabin moved at the last update. */
  delta: Vector3;
  /** The cabin and the doors, once the station is built (the dry pass has none). */
  view: InclineView | null;
  /** Is someone with their feet at `p` standing in the cabin? */
  holds(p: Vector3): boolean;
  /** Is `p` in the lift's shaft, cabin or doorways? */
  contains(p: Vector3): boolean;
  /** Which doorway `p` stands in (-1 below, 1 above), or 0. */
  doorway(p: Vector3): -1 | 0 | 1;
  update(time: number): void;
  /** Hides the cabin and doors, far from anyone who could see them; `update` shows them again. */
  hide(): void;
}

export interface InclineView {
  cabin: Group;
  /** The cabin's own doors (downhill, uphill) and the landings' (below, above), each sliding along z to open. */
  doors: [Mesh, Mesh, Mesh, Mesh];
}

/** The lift's lane across z beside escalators centred on `zc`, on their `side`: from `z0` to `z1`, and its edge by them. */
function laneAt(zc: number, side: 1 | -1) {
  const [z0, z1] = side > 0 ? [zc + I.z0, zc + I.z1] : [zc - I.z1, zc - I.z0];
  return { z0, z1, mid: (z0 + z1) / 2, half: (z1 - z0) / 2, inner: side > 0 ? z0 : z1, outer: side > 0 ? z1 : z0 };
}
const HALF = (I.z1 - I.z0) / 2;
/** Doors are a little lower than the cabin. */
const DOOR_H = I.height - 0.15;

let cabinGeometry: BufferGeometry | null = null;
let doorGeometry: BufferGeometry | null = null;
const cabinMaterial = torchify(new MeshBasicMaterial({ vertexColors: true }));
const glassMaterial = torchify(new MeshBasicMaterial({ color: 0xbfd6e6, transparent: true, opacity: 0.25, depthWrite: false, side: DoubleSide }));

/** The cabin, from its downhill end at x = 0 along +x, floor at y = 0, centred on z = 0: a steel frame round glass, a lit ceiling and a wedge of chassis under the floor. */
function cabin(): BufferGeometry {
  if (cabinGeometry) return cabinGeometry;
  const b = new MeshBuilder();
  const L = I.length, H = I.height, W = HALF - 0.04;
  const frame = rgb(0xb8bec4);
  b.box({ x: 0, y: -0.12, z: -W }, { x: L, y: 0, z: W }, (_p, n) => (n.y > 0.5 ? rgb(0x5a5e63) : rgb(0x3a3d41)));
  b.box({ x: 0, y: H, z: -W }, { x: L, y: H + 0.1, z: W }, frame);
  b.box({ x: 0.2, y: H - 0.02, z: -0.2 }, { x: L - 0.2, y: H, z: 0.2 }, rgb(0xf4f7ff));
  for (const x of [0, L - 0.06]) for (const z of [-W, W - 0.06]) b.box({ x, y: 0, z }, { x: x + 0.06, y: H, z: z + 0.06 }, frame);
  for (const z of [-W, W - 0.05]) b.box({ x: 0, y: 1.0, z }, { x: L, y: 1.05, z: z + 0.05 }, frame);
  // The chassis under the floor, deeper at the downhill end where the rails fall away beneath it.
  const drop = Math.tan(Math.PI / 6) * L / 2 + 0.2;
  b.quad(new Vector3(0, -0.12, -W), new Vector3(0, -0.12 - drop, -W), new Vector3(L, -0.32, -W), new Vector3(L, -0.12, -W), rgb(0x2c2f33));
  b.quad(new Vector3(0, -0.12, W), new Vector3(L, -0.12, W), new Vector3(L, -0.32, W), new Vector3(0, -0.12 - drop, W), rgb(0x2c2f33));
  cabinGeometry = b.build();
  return cabinGeometry;
}

/** A door across the lane from its escalator side (z = 0) outward, from y = 0 up: it folds back toward z = 0 to open. */
function door(): BufferGeometry {
  if (doorGeometry) return doorGeometry;
  const b = new MeshBuilder();
  b.box({ x: -0.03, y: 0, z: 0 }, { x: 0.03, y: DOOR_H, z: 2 * HALF }, (_p, n) => (Math.abs(n.x) > 0.5 ? rgb(0x8f989f) : rgb(0x6c747b)));
  doorGeometry = b.build();
  return doorGeometry;
}

/**
 * Builds the shaft beside an escalator flight from the end wall at `wx` (going `e` along x) up `rise`, and returns the
 * lift that runs in it. `phase` places it in its round (see `inclinePose`); `top` is how far the wall it comes out
 * through at the top reaches past the flight, for its sign. The escalators' middle is at `zc`, and the lift runs on
 * their `side` of it: +z, or -z on a shared station's other island, away from the tracks between them.
 */
export function* inclineSteps(s: Section, physics: Physics, wx: number, e: 1 | -1, rise: number, phase: number, top = 0, zc = 0, side: 1 | -1 = 1): Generator<void, InclineZone> {
  const run = escalatorRun(rise);
  const LANE = laneAt(zc, side);
  const X = (a: number) => wx + e * a;
  const h = (a: number) => escalatorHeight(Math.max(0, Math.min(run, a)), rise);
  /** Over the cabin wherever it may be: its roof, with room for the rope sheaves. */
  const ceiling = (a: number) => h(a + I.length / 2) + I.height + 0.6;
  /** Under it: the rail bed, clear of the chassis. */
  const bed = (a: number) => h(a - I.length / 2) - 0.6;
  const at = (a: number, y: number, z: number) => new Vector3(X(a), y, z);
  const ab = new Vector3();
  const ad = new Vector3();
  const quad = (a: Vector3, b: Vector3, c: Vector3, d: Vector3, facing: Vector3, color: number, cell = 1.5) => {
    const n = ab.subVectors(b, a).cross(ad.subVectors(d, a));
    if (n.dot(facing) < 0) s.lit.gridQuad(a, d, c, b, rgb(color), cell);
    else s.lit.gridQuad(a, b, c, d, rgb(color), cell);
  };

  // The shaft: its walls, the ceiling and the rail bed, straight between the flight's bends.
  const half = I.length / 2;
  const joints = [...new Set([0, run, ESC_LANDING - half, run - ESC_LANDING - half, ESC_LANDING + half, run - ESC_LANDING + half].map((a) => Math.max(0, Math.min(run, a))))].sort((p, q) => p - q);
  for (let k = 1; k < joints.length; k++) {
    const a = joints[k - 1], b = joints[k];
    quad(at(a, ceiling(a), LANE.z0), at(b, ceiling(b), LANE.z0), at(b, ceiling(b), LANE.z1), at(a, ceiling(a), LANE.z1), new Vector3(0, -1, 0), 0xdadcd8);
    quad(at(a, bed(a), LANE.z0), at(b, bed(b), LANE.z0), at(b, bed(b), LANE.z1), at(a, bed(a), LANE.z1), new Vector3(0, 1, 0), 0x3a3f44);
    for (const [z, face] of [[LANE.z0, 1], [LANE.z1, -1]] as const) {
      quad(at(a, bed(a), z), at(b, bed(b), z), at(b, ceiling(b), z), at(a, ceiling(a), z), new Vector3(0, 0, face), 0xc9ced1);
    }
    // Two rails on the bed.
    for (const z of [LANE.mid - 0.35, LANE.mid + 0.35]) {
      quad(at(a, bed(a) + 0.12, z - 0.04), at(b, bed(b) + 0.12, z - 0.04), at(b, bed(b) + 0.12, z + 0.04), at(a, bed(a) + 0.12, z + 0.04), new Vector3(0, 1, 0), 0x9aa3aa, 4);
    }
  }
  for (let a = 3; a < run - 1; a += 6) s.light(X(a), ceiling(a) - 0.5, LANE.mid, rgb(0xf2f7ff), 0.55, 7);
  // A sign over each door.
  if (!s.dry) {
    // Narrow enough to stay clear of a rock arch round the escalators beside the lane (Rådhuset's).
    const sign = textSign('Hiss', 256, 96, '#1f2a36');
    placeSign(s, sign, 0.66, 0.25, new Vector3(X(-0.02), PLATFORM_Y + DOOR_H + 0.3, LANE.mid), new Vector3(-e, 0, 0));
    placeSign(s, sign, 0.66, 0.25, new Vector3(X(run + top + 0.02), PLATFORM_Y + rise + DOOR_H + 0.3, LANE.mid), new Vector3(e, 0, 0));
  }
  yield;

  // The outer wall's collider: the inner one is the escalators' (see `escalatorSteps`).
  physics.box({ x: Math.min(X(0), X(run)), y: PLATFORM_Y, z: Math.min(LANE.outer, LANE.outer + side * I.wall) }, { x: Math.max(X(0), X(run)), y: PLATFORM_Y + rise + HALL_H, z: Math.max(LANE.outer, LANE.outer + side * I.wall) });

  // The cabin's floor and end walls, and a landing door at each stop, all moved or switched by `update`.
  const zone: InclineZone = {
    wallX: wx, dir: e, rise, run,
    pose: inclinePose(0, rise, phase),
    delta: new Vector3(),
    view: null,
    holds: (p) => {
      const along = (p.x - wx) * e - zone.pose.a;
      return along > 0.05 && along < I.length - 0.05 && p.z > LANE.z0 && p.z < LANE.z1 && Math.abs(p.y - cabinFloor(zone.pose.a, rise)) < 0.6;
    },
    contains: (p) => {
      const along = (p.x - wx) * e;
      return along > -0.3 && along < run + 0.3 && p.z > LANE.z0 && p.z < LANE.z1 && p.y > PLATFORM_Y - 0.5 && p.y < PLATFORM_Y + rise + 1;
    },
    doorway: (p) => {
      if (p.z < LANE.z0 || p.z > LANE.z1) return 0;
      const along = (p.x - wx) * e;
      if (Math.abs(along) < 0.5 && Math.abs(p.y - PLATFORM_Y) < 1) return -1;
      if (Math.abs(along - run) < 0.5 && Math.abs(p.y - PLATFORM_Y - rise) < 1) return 1;
      return 0;
    },
    update: () => {},
    hide: () => {
      if (!zone.view) return;
      zone.view.cabin.visible = false;
      for (const d of zone.view.doors) d.visible = false;
    },
  };
  // A build without physics (the lazy one, whose colliders are the dry pass's) gets none back.
  const slab = (a0: number, a1: number, y0: number, y1: number): [StaticCollider | undefined, number, number] => {
    const collider: StaticCollider | undefined = physics.box({ x: Math.min(X(a0), X(a1)), y: y0, z: LANE.z0 }, { x: Math.max(X(a0), X(a1)), y: y1, z: LANE.z1 });
    return [collider, (a0 + a1) / 2, (y0 + y1) / 2];
  };
  // Each is laid with the cabin at its lower stop: `update` moves it on from there.
  const floorY = cabinFloor(0, rise);
  const parts = {
    floor: slab(0, I.length, floorY - 0.2, floorY),
    back: slab(0, I.wall, floorY, floorY + I.height),
    front: slab(I.length - I.wall, I.length, floorY, floorY + I.height),
  };
  const below = slab(-I.wall, 0, PLATFORM_Y, PLATFORM_Y + DOOR_H);
  const above = slab(run, run + I.wall, PLATFORM_Y + rise, PLATFORM_Y + rise + DOOR_H);

  if (!s.dry) {
    const cabinGroup = new Group();
    cabinGroup.name = 'incline-cabin';
    const body = new Mesh(cabin(), cabinMaterial);
    body.scale.x = e;
    // The glass: the sides and the roof between the frame.
    const glass = new MeshBuilder();
    const W = HALF - 0.04;
    for (const z of [-W, W]) glass.quad(new Vector3(0, 0, z), new Vector3(I.length, 0, z), new Vector3(I.length, I.height, z), new Vector3(0, I.height, z), rgb(0xffffff));
    const pane = new Mesh(glass.build(), glassMaterial);
    pane.scale.x = e;
    cabinGroup.add(body, pane);
    const leaf = () => new Mesh(door(), cabinMaterial);
    const doors: InclineView['doors'] = [leaf(), leaf(), leaf(), leaf()];
    s.extras.add(cabinGroup, ...doors);
    zone.view = { cabin: cabinGroup, doors };
  }

  const place = ([collider, a, y]: [StaticCollider | undefined, number, number], da: number, dy: number, on: boolean) => {
    collider?.setTranslation({ x: X(a + da), y: y + dy, z: LANE.mid });
    collider?.setEnabled(on);
  };
  let first = true;
  zone.update = (time: number) => {
    const before = zone.pose;
    const pose = inclinePose(time, rise, phase);
    zone.pose = pose;
    const dy = cabinFloor(pose.a, rise) - floorY;
    zone.delta.set(e * (pose.a - before.a), cabinFloor(pose.a, rise) - cabinFloor(before.a, rise), 0);
    if (first) { zone.delta.set(0, 0, 0); first = false; }
    const passable = pose.open > PASSABLE;
    place(parts.floor, pose.a, dy, true);
    place(parts.back, pose.a, dy, !(passable && pose.stop === -1));
    place(parts.front, pose.a, dy, !(passable && pose.stop === 1));
    below[0]?.setEnabled(!(passable && pose.stop === -1));
    above[0]?.setEnabled(!(passable && pose.stop === 1));
    const view = zone.view;
    if (!view) return;
    view.cabin.visible = true;
    for (const d of view.doors) d.visible = true;
    view.cabin.position.set(X(pose.a), cabinFloor(pose.a, rise), LANE.mid);
    // Folding back against the escalators' wall as it opens.
    const slide = (mesh: Mesh, a: number, y: number, open: number) => {
      const width = 1 - open * 0.92;
      mesh.position.set(X(a), y, side > 0 ? LANE.inner + 0.02 : LANE.inner - 0.02 - 2 * HALF * width);
      mesh.scale.set(1, 1, width);
    };
    const cabinY = cabinFloor(pose.a, rise);
    slide(view.doors[0], pose.a + 0.03, cabinY, pose.stop === -1 ? pose.open : 0);
    slide(view.doors[1], pose.a + I.length - 0.03, cabinY, pose.stop === 1 ? pose.open : 0);
    slide(view.doors[2], -0.06, PLATFORM_Y, pose.stop === -1 ? pose.open : 0);
    slide(view.doors[3], run + 0.06, PLATFORM_Y + rise, pose.stop === 1 ? pose.open : 0);
  };
  zone.update(0);
  return zone;
}
