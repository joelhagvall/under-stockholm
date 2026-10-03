import { BoxGeometry, Matrix4, Vector3 } from 'three';
import { mix, rgb, type RGB } from '../gfx/color';
import { noise3 } from '../gfx/noise';
import {
  CAVERN_HALF_W,
  CONNECTOR,
  CAVERN_TOP,
  CAVERN_WALL_H,
  TRACK_Z,
  TUBE_BOTTOM,
  TUBE_HALF_W,
  TUBE_INNER,
  TUBE_OUTER,
  TUBE_TOP,
  TUBE_WALL_H,
} from '../layout';
import sv from '../i18n/sv.json';
import { text } from '../i18n/text';
import type { Paint } from '../gfx/builder';
import type { Physics } from '../physics';
import type { Section } from './section';
import { archHole, archProfile, extrudeRock, extrudeRockSteps, rectHole, wallWithHoles, type ProfilePoint } from './shapes';
import { exitSign, place } from './signage';
import type { Interactable, Zone } from './zones';
import { staffKey } from '../staffKey';

export const PAINT = {
  ballast: (p: Vector3): RGB => mix(rgb(0x3f3a35), rgb(0x5a534b), noise3(p.x * 3, p.y * 3, p.z * 3, 2)),
  concrete: rgb(0x6f6d68),
  darkConcrete: rgb(0x4b4a47),
  steel: rgb(0x7e848b),
  railTop: rgb(0xc3c8cd),
  sleeper: rgb(0x6d6a64),
  thirdRail: rgb(0x9c8645),
  tunnelRock: (p: Vector3): RGB => mix(rgb(0x4d4944), rgb(0x6c665e), noise3(p.x * 0.4, p.y * 0.6, p.z * 0.4, 4)),
  cable: rgb(0x2b2b2b),
  lampWarm: rgb(0xfff0d0),
  lampCool: rgb(0xeef4ff),
  fixture: rgb(0x3a3a3c),
  buffer: (p: Vector3): RGB => (Math.floor(p.y * 3) & 1 ? rgb(0xc23a2e) : rgb(0xf2f2f2)),
};

const TUNNEL_LAMP = rgb(0xffd9a0);

/** Rails, sleepers or slab, and the third rail on the outer side. */
export function addTrack(s: Section, x0: number, x1: number, zc: number, sleepers: boolean): void {
  const outer = Math.sign(zc) || 1;
  if (sleepers) {
    for (let x = x0 + 0.4; x < x1; x += 0.75) {
      s.lit.box({ x: x - 0.12, y: 0, z: zc - 1.25 }, { x: x + 0.12, y: 0.12, z: zc + 1.25 }, PAINT.sleeper, ['ny']);
    }
  } else {
    s.lit.box({ x: x0, y: 0, z: zc - 1.1 }, { x: x1, y: 0.12, z: zc + 1.1 }, PAINT.concrete, ['ny', 'px', 'nx']);
  }
  for (const side of [-1, 1]) {
    const rz = zc + side * 0.72;
    s.lit.box({ x: x0, y: 0.12, z: rz - 0.035 }, { x: x1, y: 0.28, z: rz + 0.035 }, (_p, n) => (n.y > 0.5 ? PAINT.railTop : PAINT.steel), ['ny', 'px', 'nx']);
  }
  const tz = zc + outer * 1.6;
  s.lit.box({ x: x0, y: 0.22, z: tz - 0.06 }, { x: x1, y: 0.4, z: tz + 0.06 }, PAINT.thirdRail, ['ny', 'px', 'nx']);
}

/** A cross passage between the tubes halfway along a tunnel, with a stair up to an emergency exit. */
export const ESCAPE = { halfWidth: 1.2, height: 2.5, stairRun: 10, stairRise: 5, landing: 2, stairHalfW: 0.8 };
const EXIT_GREEN = rgb(0x35c46a);
let exitSigns: { left: ReturnType<typeof exitSign>; right: ReturnType<typeof exitSign> } | null = null;

export interface TubeExtras {
  zones: Zone[];
  interactables: Interactable[];
}

/**
 * Two single-track rock tubes between x0 and x1 (x0 < x1), with lamps and
 * cable trays. With `escape`, green signs point along both tubes to a cross
 * passage halfway, where a door opens onto a stair up to an emergency exit.
 */
/** Where a tunnel's tubes lie: `lane` further out than the usual tracks (see `LANE`), and only some `sides` of them (-1 for z < 0). */
export interface TubePlace {
  lane?: number;
  sides?: ReadonlyArray<-1 | 1>;
  /** No lamps: a tube no train in service takes. */
  dark?: boolean;
}

export function buildTubes(s: Section, physics: Physics, x0: number, x1: number, seed: number, escape = false, place: TubePlace = {}): TubeExtras {
  const steps = tubeSteps(s, physics, x0, x1, seed, escape, place);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

/** `buildTubes` in steps, one stretch of rock at a time, for tunnels built while the player rides toward them. */
export function* tubeSteps(s: Section, physics: Physics, x0: number, x1: number, seed: number, escape = false, place: TubePlace = {}): Generator<void, TubeExtras> {
  const extras: TubeExtras = { zones: [], interactables: [] };
  const lane = place.lane ?? 0;
  const sides = place.sides ?? [-1, 1];
  // A cross passage only joins the usual pair of tubes.
  const xm = escape && !lane && sides.length === 2 ? Math.round((x0 + x1) / 2) : null;
  const gap = ESCAPE.halfWidth;
  for (const zc of sides.map((side) => side * (TRACK_Z + lane))) {
    const profile = archProfile(zc, TUBE_HALF_W, TUBE_WALL_H, TUBE_TOP, TUBE_BOTTOM, 10);
    const rock = { step: 2.5, amplitude: 0.35, seed: seed + (zc > 0 ? 1 : 0) };
    if (xm === null) yield* extrudeRockSteps(s.lit, profile, x0, x1, rock, PAINT.tunnelRock);
    else {
      // The inner wall opens onto the cross passage.
      const inner = (p: ProfilePoint) => (zc > 0 ? p.z < zc - TUBE_HALF_W + 0.01 : p.z > zc + TUBE_HALF_W - 0.01) && p.y < ESCAPE.height;
      yield* extrudeRockSteps(s.lit, profile, x0, xm - gap, rock, PAINT.tunnelRock);
      yield* extrudeRockSteps(s.lit, profile.filter((p) => !inner(p)), xm - gap, xm + gap, { ...rock, amplitude: 0.05 }, PAINT.tunnelRock);
      yield* extrudeRockSteps(s.lit, profile, xm + gap, x1, rock, PAINT.tunnelRock);
    }
    yield;
    s.lit.box({ x: x0, y: -0.4, z: zc - TUBE_HALF_W }, { x: x1, y: 0, z: zc + TUBE_HALF_W }, PAINT.ballast, ['ny', 'px', 'nx']);
    addTrack(s, x0, x1, zc, false);

    const wallZ = zc + Math.sign(zc) * (TUBE_HALF_W - 0.12);
    for (const y of [2.0, 2.3]) {
      s.lit.box({ x: x0, y, z: wallZ - 0.05 }, { x: x1, y: y + 0.08, z: wallZ + 0.05 }, PAINT.cable, ['px', 'nx']);
    }
    const first = Math.ceil(x0 / 25) * 25;
    for (let x = first; x < x1 && !place.dark; x += 25) {
      s.unlit.box({ x: x - 0.25, y: 3.2, z: wallZ - 0.1 }, { x: x + 0.25, y: 3.4, z: wallZ + 0.1 }, PAINT.lampWarm);
      s.light(x, 3.3, zc + Math.sign(zc) * 1.6, TUNNEL_LAMP, 1.15, 11);
    }
    if (xm !== null) exitMarkers(s, x0, x1, xm, zc, wallZ);
  }
  // A floor per tube, none in the rock between: stairs from a service corridor go down through it (Rådhuset's shelter).
  for (const side of sides) physics.box({ x: x0, y: -1, z: Math.min(side * (TUBE_INNER + lane), side * (TUBE_OUTER + lane)) }, { x: x1, y: -0.02, z: Math.max(side * (TUBE_INNER + lane), side * (TUBE_OUTER + lane)) });
  // Walls and roofs per tube only: an escalator shaft climbs through the rock between them, and a staff passage runs
  // in beside it (`SIDE_DOOR`), so the inner walls are thin.
  for (const side of sides) {
    const zIn = side * (TUBE_INNER + lane);
    const zOut = side * (TUBE_OUTER + lane);
    const inner = (a: number, b: number, y0 = -1) => physics.box({ x: a, y: y0, z: Math.min(zIn, zIn - side * 0.2) }, { x: b, y: 7, z: Math.max(zIn, zIn - side * 0.2) });
    if (xm === null) inner(x0, x1);
    else {
      inner(x0, xm - gap);
      inner(xm + gap, x1);
      inner(xm - gap, xm + gap, ESCAPE.height);
    }
    physics.box({ x: x0, y: -1, z: Math.min(zOut, zOut + side) }, { x: x1, y: 7, z: Math.max(zOut, zOut + side) });
    physics.box({ x: x0, y: TUBE_TOP, z: Math.min(zIn, zOut) }, { x: x1, y: TUBE_TOP + 1, z: Math.max(zIn, zOut) });
  }
  if (xm !== null) buildEscape(s, physics, xm, extras);
  return extras;
}

/** Green signs along the outer wall, each pointing to the nearer way out: the cross passage or a station. */
function exitMarkers(s: Section, x0: number, x1: number, xm: number, zc: number, wallZ: number): void {
  if (!exitSigns || exitSigns.left.canvas.width === 1) exitSigns = { left: exitSign(`← ${sv.escape.sign}`), right: exitSign(`${sv.escape.sign} →`) };
  const facing = new Vector3(0, 0, -Math.sign(zc));
  for (let x = x0 + 30; x < x1 - 20; x += 50) {
    const toExit = Math.abs(x - xm) < Math.min(x - x0, x1 - x) ? Math.sign(xm - x) : x - x0 < x1 - x ? -1 : 1;
    // Seen from inside the tube, the viewer's right is -x on the +z side and +x on the -z side.
    const right = zc > 0 ? toExit < 0 : toExit > 0;
    place(s, right ? exitSigns.right : exitSigns.left, 0.8, 0.3, new Vector3(x, 2.75, wallZ - Math.sign(zc) * 0.08), facing);
    s.light(x, 2.6, wallZ - Math.sign(zc) * 0.6, EXIT_GREEN, 0.3, 3.5);
  }
}

/** The cross passage between the tubes and the stair up to a locked, alarmed exit. */
function buildEscape(s: Section, physics: Physics, xm: number, extras: TubeExtras): void {
  const E = ESCAPE;
  const concrete = (_p: Vector3, n: Vector3): RGB => (n.y > 0.5 ? rgb(0x5f5e5a) : n.y < -0.5 ? rgb(0x77766f) : rgb(0x8f8d86));
  const wall = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, collide = true) => {
    s.lit.box({ x: x0, y: y0, z: z0 }, { x: x1, y: y1, z: z1 }, concrete);
    if (collide) physics.box({ x: x0, y: y0, z: z0 }, { x: x1, y: y1, z: z1 });
  };
  const zi = TUBE_INNER;
  // The passage itself: a concrete box through the rock between the tubes.
  wall(xm - E.halfWidth, xm + E.halfWidth, -0.3, 0, -zi, zi);
  wall(xm - E.halfWidth, xm + E.halfWidth, E.height, E.height + 0.3, -zi, zi);
  wall(xm - E.halfWidth - 0.3, xm - E.halfWidth, -0.3, E.height, -zi, zi);
  // The far wall has a door onto the stair.
  wall(xm + E.halfWidth, xm + E.halfWidth + 0.3, -0.3, E.height, -zi, -E.stairHalfW);
  wall(xm + E.halfWidth, xm + E.halfWidth + 0.3, -0.3, E.height, E.stairHalfW, zi);
  wall(xm + E.halfWidth, xm + E.halfWidth + 0.3, 2.2, E.height, -E.stairHalfW, E.stairHalfW);
  s.unlit.box({ x: xm - 0.4, y: E.height - 0.06, z: -0.15 }, { x: xm + 0.4, y: E.height, z: 0.15 }, rgb(0xeaf6ee));
  s.light(xm, E.height - 0.4, 0, rgb(0xd8ffe6), 0.9, 7);
  place(s, exitSign(sv.escape.sign), 0.9, 0.34, new Vector3(xm + E.halfWidth - 0.02, 2.35, 0), new Vector3(-1, 0, 0));
  // The stair up, with a ramp collider for a steady walk.
  const a0 = xm + E.halfWidth + 0.3;
  const steps = Math.round(E.stairRise / 0.25);
  const run = E.stairRun / steps;
  for (let k = 0; k < steps; k++) {
    const top = (k + 1) * (E.stairRise / steps);
    s.lit.box({ x: a0 + k * run, y: -0.3, z: -E.stairHalfW }, { x: a0 + (k + 1) * run, y: top, z: E.stairHalfW }, (_p, n) => (n.y > 0.5 ? rgb(0x6c6a64) : rgb(0x55534e)));
    s.lit.box({ x: a0 + k * run, y: top - 0.01, z: -E.stairHalfW }, { x: a0 + k * run + 0.05, y: top + 0.004, z: E.stairHalfW }, rgb(0xd9b93b));
  }
  const length = Math.hypot(E.stairRun, E.stairRise);
  const angle = Math.atan2(E.stairRise, E.stairRun);
  const mid = new Vector3(a0 + E.stairRun / 2, E.stairRise / 2 + 0.125, 0);
  const normal = new Vector3(-Math.sin(angle), Math.cos(angle), 0);
  physics.tiltedBox(mid.addScaledVector(normal, -0.15), { x: length / 2 + 0.1, y: 0.15, z: E.stairHalfW }, angle);
  const b0 = a0 + E.stairRun;
  const b1 = b0 + E.landing;
  for (const side of [-1, 1]) wall(a0, b1, -0.3, E.stairRise + 2.8, side * E.stairHalfW, side * (E.stairHalfW + 0.2));
  for (let k = 0; k < 4; k++) {
    const y = (E.stairRise * (k + 1)) / 4 + 2.6;
    wall(a0 + (E.stairRun * k) / 4, a0 + (E.stairRun * (k + 1)) / 4, y, y + 0.25, -E.stairHalfW, E.stairHalfW, false);
  }
  wall(b0, b1, E.stairRise - 0.3, E.stairRise, -E.stairHalfW, E.stairHalfW);
  wall(b0, b1, E.stairRise + 2.6, E.stairRise + 2.85, -E.stairHalfW, E.stairHalfW);
  wall(b1, b1 + 0.3, E.stairRise - 0.3, E.stairRise + 2.85, -E.stairHalfW, E.stairHalfW);
  // The exit door at the top, green, with a push bar and an alarm notice.
  s.lit.box({ x: b1 - 0.05, y: E.stairRise, z: -0.5 }, { x: b1, y: E.stairRise + 2.1, z: 0.5 }, rgb(0x2f7a45));
  s.lit.box({ x: b1 - 0.12, y: E.stairRise + 1.02, z: -0.4 }, { x: b1 - 0.05, y: E.stairRise + 1.08, z: 0.4 }, rgb(0x9aa0a6));
  s.unlit.box({ x: b1 - 0.9, y: E.stairRise + 2.55, z: -0.12 }, { x: b1 - 0.3, y: E.stairRise + 2.6, z: 0.12 }, rgb(0xeaf6ee));
  s.light(b1 - 0.8, E.stairRise + 2.2, 0, rgb(0xd8ffe6), 0.8, 5);
  place(s, exitSign(sv.escape.street), 0.9, 0.34, new Vector3(b1 - 0.07, E.stairRise + 2.35, 0), new Vector3(-1, 0, 0));
  extras.zones.push(
    { min: { x: xm - E.halfWidth, y: -0.5, z: -zi + 0.05 }, max: { x: xm + E.halfWidth, y: E.height, z: zi - 0.05 }, station: null, area: 'service', label: sv.escape.passage },
    { min: { x: a0 - 0.3, y: -0.5, z: -E.stairHalfW }, max: { x: b1, y: E.stairRise + 2.6, z: E.stairHalfW }, station: null, area: 'service', label: sv.escape.stair },
  );
  const door = new Vector3(b1 - 0.6, E.stairRise + 0.1, 0);
  extras.interactables.push({ pos: door, radius: 1.3, get prompt() { return staffKey.has ? text.key.unlockPrompt : text.escape.prompt; }, act: () => (staffKey.exit(door) ? undefined : text.escape.locked) });
}

/**
 * Turnback cavern: short tubes from the station end wall at `wallX`, then a
 * wide cavern where trains shunt across to the other track. `dir` points away
 * from the station.
 */
export interface TurnbackOptions {
  /** A staff door (half width, height) in the cavern wall between the two tube mouths. */
  door?: { halfWidth: number; height: number };
  /** Track 1 continues through the far wall (toward Kymlinge). */
  throughTrack1?: boolean;
}

export function buildTurnback(s: Section, physics: Physics, wallX: number, dir: 1 | -1, tubeLen: number, cavernLen: number, seed: number, options: TurnbackOptions = {}): void {
  const t0 = wallX;
  const t1 = wallX + dir * tubeLen;
  buildTubes(s, physics, Math.min(t0, t1), Math.max(t0, t1), seed);

  const c0 = t1;
  const c1 = t1 + dir * cavernLen;
  const lo = Math.min(c0, c1);
  const hi = Math.max(c0, c1);
  const profile = archProfile(0, CAVERN_HALF_W, CAVERN_WALL_H, CAVERN_TOP, -0.4, 16);
  extrudeRock(s.lit, profile, lo, hi, { step: 2.5, amplitude: 0.6, seed }, PAINT.tunnelRock);
  s.lit.box({ x: lo, y: -0.4, z: -CAVERN_HALF_W }, { x: hi, y: 0, z: CAVERN_HALF_W }, PAINT.ballast, ['ny']);
  for (const zc of [-TRACK_Z, TRACK_Z]) addTrack(s, lo, hi, zc, true);

  // Wall facing into the cavern, with the two tube mouths.
  const holes = [-TRACK_Z, TRACK_Z].map((zc) => archHole(zc, TUBE_HALF_W, TUBE_WALL_H, TUBE_TOP, TUBE_BOTTOM));
  const door = options.door;
  if (door) holes.push(rectHole(-door.halfWidth, door.halfWidth, 0, door.height));
  wallWithHoles(s.lit, c0, profile, holes, PAINT.tunnelRock);
  wallWithHoles(s.lit, c1, profile, options.throughTrack1 ? [archHole(-TRACK_Z, TUBE_HALF_W, TUBE_WALL_H, TUBE_TOP, TUBE_BOTTOM)] : [], PAINT.tunnelRock);

  // Buffer stops at the far end.
  for (const zc of [-TRACK_Z, TRACK_Z]) {
    if (options.throughTrack1 && zc < 0) continue;
    const bx = c1 - dir * 1.2;
    s.lit.box({ x: bx - 0.4, y: 0, z: zc - 1.2 }, { x: bx + 0.4, y: 1.4, z: zc + 1.2 }, PAINT.buffer);
  }

  for (let x = lo + 12; x < hi; x += 20) {
    for (const z of [-CAVERN_HALF_W + 0.3, CAVERN_HALF_W - 0.3]) {
      s.unlit.box({ x: x - 0.3, y: 3.6, z: z - 0.12 }, { x: x + 0.3, y: 3.8, z: z + 0.12 }, PAINT.lampWarm);
      s.light(x, 3.7, z * 0.8, TUNNEL_LAMP, 1.1, 14);
    }
  }

  physics.box({ x: lo, y: -1, z: -CAVERN_HALF_W }, { x: hi, y: -0.02, z: CAVERN_HALF_W });
  physics.box({ x: lo, y: -1, z: CAVERN_HALF_W }, { x: hi, y: 9, z: CAVERN_HALF_W + 1 });
  physics.box({ x: lo, y: -1, z: -CAVERN_HALF_W - 1 }, { x: hi, y: 9, z: -CAVERN_HALF_W });
  const endX = dir > 0 ? { a: hi, b: hi + 1 } : { a: lo - 1, b: lo };
  if (options.throughTrack1) {
    physics.box({ x: endX.a, y: -1, z: -CAVERN_HALF_W }, { x: endX.b, y: 9, z: -TUBE_OUTER });
    physics.box({ x: endX.a, y: -1, z: -TUBE_INNER }, { x: endX.b, y: 9, z: CAVERN_HALF_W });
    physics.box({ x: endX.a, y: TUBE_TOP, z: -TUBE_OUTER }, { x: endX.b, y: 9, z: -TUBE_INNER });
  } else {
    physics.box({ x: endX.a, y: -1, z: -CAVERN_HALF_W }, { x: endX.b, y: 9, z: CAVERN_HALF_W });
  }
  const wallX2 = dir > 0 ? { a: c0 - 0.5, b: c0 } : { a: c0, b: c0 + 0.5 };
  physics.box({ x: wallX2.a, y: TUBE_TOP, z: -CAVERN_HALF_W }, { x: wallX2.b, y: 9, z: CAVERN_HALF_W });
  physics.box({ x: wallX2.a, y: -1, z: TUBE_OUTER }, { x: wallX2.b, y: 9, z: CAVERN_HALF_W });
  physics.box({ x: wallX2.a, y: -1, z: -CAVERN_HALF_W }, { x: wallX2.b, y: 9, z: -TUBE_OUTER });
  if (door) {
    physics.box({ x: wallX2.a, y: -1, z: -TUBE_INNER }, { x: wallX2.b, y: 9, z: -door.halfWidth });
    physics.box({ x: wallX2.a, y: -1, z: door.halfWidth }, { x: wallX2.b, y: 9, z: TUBE_INNER });
    physics.box({ x: wallX2.a, y: door.height, z: -door.halfWidth }, { x: wallX2.b, y: 9, z: door.halfWidth });
  } else {
    physics.box({ x: wallX2.a, y: -1, z: -TUBE_INNER }, { x: wallX2.b, y: 9, z: TUBE_INNER });
  }
}

/**
 * A siding cavern in the middle of a tunnel, from `x0` to `x1`: the two
 * running tracks go straight through and a third track between them holds a
 * train turning back, where a route ends but its line goes on (Alvik,
 * Åkeshov). Tube mouths open at both ends.
 */
/** Where a connector's branch leaves its cavern at `x1`: its distance out from the line's middle. */
export function connectorOut(): number {
  return TRACK_Z + (CONNECTOR.length - 8) * Math.tan(CONNECTOR.angle);
}

/**
 * A connecting track's cavern from `x0` to `x1` (the branch leaving toward `x1`): both running tracks through it, a
 * switch off the one on `side` just past `x0` and the branch running out at an angle to a hole in the far wall, locked
 * off by a gate, with a red signal at the switch.
 */
export function buildConnector(s: Section, physics: Physics, x0: number, x1: number, side: -1 | 1, seed: number): void {
  const C = CONNECTOR;
  const mid = side * C.shift;
  const profile = archProfile(mid, C.halfW, CAVERN_WALL_H, CAVERN_TOP, -0.4, 18);
  extrudeRock(s.lit, profile, x0, x1, { step: 2.5, amplitude: 0.6, seed }, PAINT.tunnelRock);
  s.lit.box({ x: x0, y: -0.4, z: mid - C.halfW }, { x: x1, y: 0, z: mid + C.halfW }, PAINT.ballast, ['ny']);
  for (const zc of [-TRACK_Z, TRACK_Z]) addTrack(s, x0, x1, zc, true);
  // The branch: from the switch straight out at its angle, a slab and two rails.
  const start = new Vector3(x0 + 8, 0, side * TRACK_Z);
  const out = connectorOut();
  const end = new Vector3(x1, 0, side * out);
  const run = end.distanceTo(start);
  const along = Math.atan2(-(end.z - start.z), end.x - start.x);
  const beam = (w: number, h: number, y: number, dz: number, paint: Paint) => {
    const m = new Matrix4().makeRotationY(along);
    m.setPosition(new Vector3((start.x + end.x) / 2, y, (start.z + end.z) / 2).add(new Vector3(0, 0, dz).applyMatrix4(new Matrix4().makeRotationY(along))));
    s.lit.geometry(new BoxGeometry(run, h, w), m, paint);
  };
  beam(2.2, 0.12, 0.06, 0, PAINT.concrete);
  for (const rz of [-0.72, 0.72]) beam(0.07, 0.16, 0.2, rz, (_p, n) => (n.y > 0.5 ? PAINT.railTop : PAINT.steel));
  const tubes = [-TRACK_Z, TRACK_Z].map((zc) => archHole(zc, TUBE_HALF_W, TUBE_WALL_H, TUBE_TOP, TUBE_BOTTOM));
  wallWithHoles(s.lit, x0, profile, tubes, PAINT.tunnelRock);
  wallWithHoles(s.lit, x1, profile, [...tubes, archHole(side * out, TUBE_HALF_W + 0.1, TUBE_WALL_H, TUBE_TOP, TUBE_BOTTOM)], PAINT.tunnelRock);
  // The gate across the branch, just inside the far wall.
  const gx = x1 - 0.4;
  for (let z = -TUBE_HALF_W + 0.15; z <= TUBE_HALF_W - 0.1; z += 0.25) {
    s.lit.box({ x: gx - 0.03, y: 0, z: side * out + z - 0.03 }, { x: gx + 0.03, y: 3.2, z: side * out + z + 0.03 }, PAINT.steel);
  }
  for (const y of [0.1, 1.6, 3.1]) s.lit.box({ x: gx - 0.05, y, z: side * out - TUBE_HALF_W }, { x: gx + 0.05, y: y + 0.1, z: side * out + TUBE_HALF_W }, (p) => (Math.floor(p.z * 2) & 1 ? rgb(0xe0b020) : rgb(0x1a1a1a)));
  physics.box({ x: gx - 0.3, y: -1, z: side * out - TUBE_HALF_W - 0.5 }, { x: gx + 0.3, y: 6, z: side * out + TUBE_HALF_W + 0.5 });
  // One lamp over the gate, so the branch shows as a way off into the dark and not a patch of shadow.
  s.unlit.box({ x: x1 - 0.2, y: TUBE_TOP + 0.4, z: side * out - 0.3 }, { x: x1, y: TUBE_TOP + 0.55, z: side * out + 0.3 }, PAINT.lampWarm);
  s.light(x1 - 2.5, TUBE_TOP, side * out, TUNNEL_LAMP, 1.2, 12);
  // A red signal before the switch, on the outer side.
  const sz = side * (TRACK_Z + 2.1);
  s.lit.box({ x: x0 + 3.9, y: 0, z: sz - 0.08 }, { x: x0 + 4.1, y: 2.6, z: sz + 0.08 }, PAINT.fixture);
  s.lit.box({ x: x0 + 3.8, y: 2.3, z: sz - 0.2 }, { x: x0 + 4.2, y: 3.0, z: sz + 0.2 }, PAINT.fixture);
  s.unlit.box({ x: x0 + 3.75, y: 2.72, z: sz - 0.1 }, { x: x0 + 3.8, y: 2.9, z: sz + 0.1 }, rgb(0xff2a1a));
  s.light(x0 + 3.2, 2.8, sz, rgb(0xff3322), 0.5, 4);
  for (let x = x0 + 12; x < x1; x += 20) {
    for (const z of [mid - C.halfW + 0.3, mid + C.halfW - 0.3]) {
      s.unlit.box({ x: x - 0.3, y: 3.6, z: z - 0.12 }, { x: x + 0.3, y: 3.8, z: z + 0.12 }, PAINT.lampWarm);
      s.light(x, 3.7, mid + (z - mid) * 0.8, TUNNEL_LAMP, 1.1, 14);
    }
  }
  const lo = mid - C.halfW, hi = mid + C.halfW;
  physics.box({ x: x0, y: -1, z: lo }, { x: x1, y: -0.02, z: hi });
  physics.box({ x: x0, y: -1, z: hi }, { x: x1, y: 9, z: hi + 1 });
  physics.box({ x: x0, y: -1, z: lo - 1 }, { x: x1, y: 9, z: lo });
  for (const [a, b] of [[x0 - 0.5, x0], [x1, x1 + 0.5]]) {
    physics.box({ x: a, y: TUBE_TOP, z: lo }, { x: b, y: 9, z: hi });
    physics.box({ x: a, y: -1, z: TUBE_OUTER }, { x: b, y: 9, z: Math.max(hi, TUBE_OUTER + 0.1) });
    physics.box({ x: a, y: -1, z: Math.min(lo, -TUBE_OUTER - 0.1) }, { x: b, y: 9, z: -TUBE_OUTER });
    physics.box({ x: a, y: -1, z: -TUBE_INNER }, { x: b, y: 9, z: TUBE_INNER });
  }
}

export function buildSiding(s: Section, physics: Physics, x0: number, x1: number, seed: number, open = false): void {
  if (open) {
    // In the open air, the middle track simply lies between the running tracks.
    addTrack(s, x0 + 8, x1 - 8, 0, true);
    for (const bx of [x0 + 7, x1 - 7]) s.lit.box({ x: bx - 0.4, y: 0, z: -1.2 }, { x: bx + 0.4, y: 1.4, z: 1.2 }, PAINT.buffer);
    return;
  }
  const profile = archProfile(0, CAVERN_HALF_W, CAVERN_WALL_H, CAVERN_TOP, -0.4, 16);
  extrudeRock(s.lit, profile, x0, x1, { step: 2.5, amplitude: 0.6, seed }, PAINT.tunnelRock);
  s.lit.box({ x: x0, y: -0.4, z: -CAVERN_HALF_W }, { x: x1, y: 0, z: CAVERN_HALF_W }, PAINT.ballast, ['ny']);
  for (const zc of [-TRACK_Z, TRACK_Z]) addTrack(s, x0, x1, zc, true);
  addTrack(s, x0 + 8, x1 - 8, 0, true);
  const holes = [-TRACK_Z, TRACK_Z].map((zc) => archHole(zc, TUBE_HALF_W, TUBE_WALL_H, TUBE_TOP, TUBE_BOTTOM));
  for (const x of [x0, x1]) wallWithHoles(s.lit, x, profile, holes, PAINT.tunnelRock);
  // Buffer stops at both ends of the middle track.
  for (const bx of [x0 + 7, x1 - 7]) s.lit.box({ x: bx - 0.4, y: 0, z: -1.2 }, { x: bx + 0.4, y: 1.4, z: 1.2 }, PAINT.buffer);
  for (let x = x0 + 12; x < x1; x += 20) {
    for (const z of [-CAVERN_HALF_W + 0.3, CAVERN_HALF_W - 0.3]) {
      s.unlit.box({ x: x - 0.3, y: 3.6, z: z - 0.12 }, { x: x + 0.3, y: 3.8, z: z + 0.12 }, PAINT.lampWarm);
      s.light(x, 3.7, z * 0.8, TUNNEL_LAMP, 1.1, 14);
    }
  }
  physics.box({ x: x0, y: -1, z: -CAVERN_HALF_W }, { x: x1, y: -0.02, z: CAVERN_HALF_W });
  physics.box({ x: x0, y: -1, z: CAVERN_HALF_W }, { x: x1, y: 9, z: CAVERN_HALF_W + 1 });
  physics.box({ x: x0, y: -1, z: -CAVERN_HALF_W - 1 }, { x: x1, y: 9, z: -CAVERN_HALF_W });
  for (const [a, b] of [[x0 - 0.5, x0], [x1, x1 + 0.5]]) {
    physics.box({ x: a, y: TUBE_TOP, z: -CAVERN_HALF_W }, { x: b, y: 9, z: CAVERN_HALF_W });
    physics.box({ x: a, y: -1, z: TUBE_OUTER }, { x: b, y: 9, z: CAVERN_HALF_W });
    physics.box({ x: a, y: -1, z: -CAVERN_HALF_W }, { x: b, y: 9, z: -TUBE_OUTER });
    physics.box({ x: a, y: -1, z: -TUBE_INNER }, { x: b, y: 9, z: TUBE_INNER });
  }
}
