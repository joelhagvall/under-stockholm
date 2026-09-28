import { Curve, DynamicDrawUsage, ExtrudeGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Shape, TubeGeometry, Vector3, type BufferGeometry } from 'three';
import { MeshBuilder } from '../gfx/builder';
import { rgb } from '../gfx/color';
import { ESC_DESIGN as E, ESC_HALF_W, ESC_HEADROOM, ESC_LANDING, HALL_H, PLATFORM_Y } from '../layout';
import { escalatorHeight, escalatorRun, escalatorStepAlong } from '../escalatorMotion';
import type { Physics } from '../physics';
import type { Section } from './section';
import { torchify } from '../powerLights';

export interface EscalatorZone {
  wallX: number;
  dir: 1 | -1;
  /** The z of the escalators' middle: 0, or a shared station's platform (see `LANE`). */
  z: number;
  /** How far the flight climbs to the ticket hall, and how far along x it reaches (see `escalatorRun`). */
  rise: number;
  run: number;
  /** A lane that stands still today (-1 is the down lane), or 0. */
  stoppedLane: -1 | 0 | 1;
  update(time: number, playerX: number): void;
}

/**
 * The shaft's ceiling underground: at the platform no higher than the opening in the station's end wall, then rising
 * steeply, and from there on it follows the flight at `INCLINE` over the steps, an inclined tunnel as at the deep
 * stations, up to the ticket hall's own ceiling. Riding down you look out over the whole flight instead of into a
 * ceiling an arm's length above your head. In the open air the shaft stays a slim tube over the steps, which is all
 * that shows of it from outside.
 */
const shaftTop = (rise: number) => PLATFORM_Y + rise + HALL_H;
const CEILING_RISE = 1.6;
const INCLINE = 6;
export const shaftCeiling = (a: number, rise: number, tall = true) => {
  const low = escalatorHeight(a, rise) + ESC_HEADROOM;
  if (!tall) return low;
  return Math.max(low, Math.min(shaftTop(rise), PLATFORM_Y + ESC_HEADROOM + a * CEILING_RISE, escalatorHeight(a, rise) + INCLINE));
};
/** Where the ceiling bends along the flight, so its faces can run straight between them. */
const ceilingBends = (rise: number, run: number): number[] => {
  const bends: number[] = [];
  const step = 0.05;
  for (let a = step; a < run - step; a += step) {
    const bend = shaftCeiling(a + step, rise) - 2 * shaftCeiling(a, rise) + shaftCeiling(a - step, rise);
    if (Math.abs(bend) > 1e-6 && !bends.some((b) => a - b < 3 * step)) bends.push(a);
  }
  return bends;
};
/** Wall lamps light the steps, a little over head height, since the ceiling is too high for its lamps to reach them. */
const LAMP_HEIGHT = 3.2;

/** Balustrades by rise: a station's depth is whole meters, so the network has only a handful of them. */
const rails = new Map<number, { casing: BufferGeometry; rubber: BufferGeometry }>();
/** The balustrade casing and handrail, the same for every escalator of a rise, built once. */
function railGeometries(rise: number): { casing: BufferGeometry; rubber: BufferGeometry } {
  const built = rails.get(rise);
  if (built) return built;
  const RUN = escalatorRun(rise);
  const outline = new Shape();
  const bottom = E.railHeight - E.railRadius * 2;
  outline.moveTo(E.railEnd, bottom);
  outline.absarc(E.railEnd, E.railHeight - E.railRadius, E.railRadius, -Math.PI / 2, -Math.PI * 1.5, true);
  outline.lineTo(ESC_LANDING, E.railHeight);
  outline.lineTo(RUN - ESC_LANDING, rise + E.railHeight);
  outline.lineTo(RUN - E.railEnd, rise + E.railHeight);
  outline.absarc(RUN - E.railEnd, rise + E.railHeight - E.railRadius, E.railRadius, Math.PI / 2, -Math.PI / 2, true);
  outline.lineTo(RUN - ESC_LANDING, rise + bottom);
  outline.lineTo(ESC_LANDING, bottom);
  outline.closePath();
  const casing = new ExtrudeGeometry(outline, { depth: E.railWidth, bevelEnabled: true, bevelThickness: E.panelGap, bevelSize: E.panelGap, bevelSegments: 2, steps: 1, curveSegments: 12 });
  class HandrailCurve extends Curve<Vector3> {
    constructor() { super(); }
    override getPoint(t: number, target = new Vector3()): Vector3 {
      const p = outline.getPoint(t);
      return target.set(p.x, p.y, 0);
    }
  }
  // Enough segments for the longest flights to stay round at the newels.
  const rubber = new TubeGeometry(new HandrailCurve(), Math.round(480 * Math.max(1, RUN / 23)), E.handrailRadius, 8, true).toNonIndexed();
  const made = { casing, rubber };
  rails.set(rise, made);
  return made;
}

let stepGeometry: BufferGeometry | null = null;
const stepMaterial = torchify(new MeshBasicMaterial({ vertexColors: true }));
function treadGeometry(): BufferGeometry {
  if (stepGeometry) return stepGeometry;
  const b = new MeshBuilder();
  const half = E.treadWidth / 2;
  b.box({ x: -E.stepPitch / 2, y: -E.stepDepth, z: -half }, { x: E.stepPitch / 2, y: 0, z: half }, (_p, n) => rgb(n.y > 0.5 ? 0x70767a : 0x43494e));
  // The ribs are a few millimetres high: only their tops and front edges are ever seen, so only those are drawn
  // (a whole box per rib made each flight of steps some 50 000 triangles).
  for (let z = -half + E.groovePitch; z < half; z += E.groovePitch) {
    b.box({ x: -E.stepPitch / 2, y: 0, z }, { x: E.stepPitch / 2, y: E.grooveHeight, z: z + E.grooveWidth }, rgb(0xabb1b3), ['ny', 'px', 'pz', 'nz']);
    b.box({ x: -E.stepPitch / 2 - E.grooveHeight, y: -E.stepDepth, z }, { x: -E.stepPitch / 2, y: 0, z: z + E.grooveWidth }, rgb(0x858d91), ['px', 'py', 'ny', 'pz', 'nz']);
  }
  for (const side of [-1, 1]) {
    const z = side * (half - E.groovePitch / 2);
    b.box({ x: -E.stepPitch / 2, y: 0, z: z - E.grooveWidth }, { x: E.stepPitch / 2, y: E.grooveHeight, z: z + E.grooveWidth }, rgb(0xccb259));
  }
  stepGeometry = b.build();
  return stepGeometry;
}

/** Stockholm-style steel balustrades, rounded newels and individual moving treads. */
export function buildEscalators(s: Section, physics: Physics, wx: number, e: 1 | -1, rise: number): EscalatorZone {
  const steps = escalatorSteps(s, physics, wx, e, rise);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

/** `buildEscalators` in steps, one balustrade at a time, for stations built while the player rides toward them. */
/**
 * @param rise how far the flight climbs to the hall (see `StationDef.rise`)
 * @param tall an underground shaft, open up to the hall's ceiling (see `shaftCeiling`)
 */
export function* escalatorSteps(s: Section, physics: Physics, wx: number, e: 1 | -1, rise: number, tall = true): Generator<void, EscalatorZone> {
  const RUN = escalatorRun(rise);
  const height = (a: number) => escalatorHeight(a, rise);
  const point = (a: number, y: number, z: number) => new Vector3(wx + e * a, y, z);
  const floor = (a: number, z: number, lift = 0) => point(a, height(a) + lift, z);
  const metal = (_p: Vector3, n: Vector3) => rgb(Math.abs(n.y) > 0.6 ? 0xd8dee0 : Math.abs(n.x) > 0.5 ? 0x939da4 : 0xafb9c0);
  const joints = [0, ESC_LANDING, RUN - ESC_LANDING, RUN];
  const box = (a: number, b: number, y0: number, y1: number, z0: number, z1: number, color: number) => {
    s.lit.box({ x: Math.min(wx + e * a, wx + e * b), y: y0, z: z0 }, { x: Math.max(wx + e * a, wx + e * b), y: y1, z: z1 }, rgb(color));
  };
  // A quad facing into the shaft whichever way the escalator runs: the baked light follows the face's normal.
  const ab = new Vector3();
  const ad = new Vector3();
  const inward = (a: Vector3, b: Vector3, c: Vector3, d: Vector3, facing: Vector3, color: number, cell: number) => {
    const n = ab.subVectors(b, a).cross(ad.subVectors(d, a));
    if (n.dot(facing) < 0) s.lit.gridQuad(a, d, c, b, rgb(color), cell);
    else s.lit.gridQuad(a, b, c, d, rgb(color), cell);
  };
  const UP = new Vector3(0, 1, 0);
  const DOWN = new Vector3(0, -1, 0);
  // The ceiling and the walls up to it: straight between the steps' joints and where the ceiling levels out.
  const top = (a: number, z: number) => point(a, shaftCeiling(a, rise, tall), z);
  const breaks = [...new Set([...joints, ...(tall ? ceilingBends(rise, RUN) : [])])].filter((a) => a >= 0 && a <= RUN).sort((a, b) => a - b);
  for (let i = 1; i < breaks.length; i++) {
    const a = breaks[i - 1], b = breaks[i];
    inward(top(a, -ESC_HALF_W), top(b, -ESC_HALF_W), top(b, ESC_HALF_W), top(a, ESC_HALF_W), DOWN, 0xe4e5e2, 1.5);
    for (const side of [-1, 1]) {
      // Down to the floor under the steps, so no slit is left beside them.
      inward(floor(a, side * ESC_HALF_W, -E.stepDepth), floor(b, side * ESC_HALF_W, -E.stepDepth), top(b, side * ESC_HALF_W), top(a, side * ESC_HALF_W), new Vector3(0, 0, -side), 0xc7cdd0, 1);
    }
  }
  for (let i = 1; i < joints.length; i++) {
    const a = joints[i - 1], b = joints[i];
    inward(floor(a, -ESC_HALF_W, -E.stepDepth), floor(b, -ESC_HALF_W, -E.stepDepth), floor(b, ESC_HALF_W, -E.stepDepth), floor(a, ESC_HALF_W, -E.stepDepth), UP, 0x313b42, 1);
    // A smooth collider avoids camera judder while the visible steps circulate.
    const angle = Math.atan2(height(b) - height(a), b - a);
    const normal = new Vector3(-e * Math.sin(angle), Math.cos(angle), 0);
    const mid = point((a + b) / 2, (height(a) + height(b)) / 2, 0);
    physics.tiltedBox(mid.clone().addScaledVector(normal, -E.stepDepth / 2), { x: Math.hypot(b - a, height(b) - height(a)) / 2, y: E.stepDepth / 2, z: ESC_HALF_W }, e * angle);
    for (const lane of [-1, 1]) {
      for (const side of [-1, 1]) {
        const z = lane * E.laneCenter + side * (E.treadWidth / 2 + E.railWidth / 2);
        const center = mid.clone().addScaledVector(normal, E.railHeight / 2); center.z = z;
        physics.tiltedBox(center, { x: Math.hypot(b - a, height(b) - height(a)) / 2, y: E.railHeight / 2, z: E.railWidth / 2 }, e * angle);
      }
    }
  }

  const { casing, rubber } = railGeometries(rise);
  for (const lane of [-1, 1]) {
    for (const side of [-1, 1]) {
      yield;
      const z = lane * E.laneCenter + side * (E.treadWidth / 2 + E.railWidth / 2);
      s.lit.geometry(casing, new Matrix4().makeScale(e, 1, 1).setPosition(wx, PLATFORM_Y, z - E.railWidth / 2), metal);
      s.lit.geometry(rubber, new Matrix4().makeScale(e, 1, 1).setPosition(wx, PLATFORM_Y, z - side * E.railWidth / 2), rgb(0x161b20));
      // Panel joints and the brush strip along the step edge.
      for (let a = ESC_LANDING; a < RUN - ESC_LANDING; a += E.panelLength) {
        const y = height(a);
        box(a, a + E.panelGap, y + E.skirtHeight, y + E.railHeight - E.handrailRadius, z - E.railWidth / 2 - E.panelGap, z + E.railWidth / 2 + E.panelGap, 0x839098);
      }
      for (let i = 1; i < joints.length; i++) {
        const a = joints[i - 1], b = joints[i];
        const brushZ = z - side * (E.railWidth / 2 + E.panelGap);
        s.lit.quad(floor(a, brushZ, E.skirtHeight), floor(b, brushZ, E.skirtHeight), floor(b, brushZ, E.skirtHeight + E.panelGap), floor(a, brushZ, E.skirtHeight + E.panelGap), rgb(0x1d252a));
      }
      for (const a of [E.railEnd, RUN - E.railEnd]) {
        const y = height(a);
        box(a - E.indicatorRadius, a + E.indicatorRadius, y + E.skirtHeight, y + E.skirtHeight + E.indicatorRadius * 2, z - E.railWidth / 2 - E.panelGap, z + E.railWidth / 2 + E.panelGap, lane > 0 ? 0x50c48a : 0xde6751);
      }
    }
    for (const end of [0, RUN - E.combLength]) {
      const z = lane * E.laneCenter;
      const y = height(end);
      box(end, end + E.combLength, y, y + E.combHeight, z - E.treadWidth / 2, z + E.treadWidth / 2, 0xc3c8c9);
      for (let offset = -E.treadWidth / 2; offset < E.treadWidth / 2; offset += E.groovePitch) {
        box(end, end + E.combLength, y + E.combHeight, y + E.combHeight + E.grooveHeight, z + offset, z + offset + E.grooveWidth, 0x6b7379);
      }
    }
  }

  for (let a = ESC_LANDING; a < RUN; a += E.lightSpacing) {
    const x = wx + e * a;
    // A lamp on each wall over the steps, and a light strip on the ceiling high above.
    const y = height(a) + LAMP_HEIGHT;
    for (const side of [-1, 1]) {
      const z = side * (ESC_HALF_W - E.fixtureDepth);
      s.unlit.box({ x: x - 0.45, y: y - 0.06, z: Math.min(z, side * ESC_HALF_W) }, { x: x + 0.45, y: y + 0.06, z: Math.max(z, side * ESC_HALF_W) }, rgb(0xf2f7ff));
      s.light(x, y - 0.2, side * (ESC_HALF_W - 0.5), rgb(0xf2f7ff), 0.55, E.lightSpacing * 2);
    }
    const c = shaftCeiling(a, rise, tall);
    s.unlit.box({ x: x - E.fixtureDepth, y: c - E.fixtureDepth, z: -E.lightHalfWidth }, { x: x + E.fixtureDepth, y: c, z: E.lightHalfWidth }, rgb(0xf2f7ff));
    s.light(x, c - 0.6, 0, rgb(0xf2f7ff), 0.6, Math.max(E.lightSpacing * 2, c - height(a)));
  }
  for (const side of [-1, 1]) {
    physics.box({ x: Math.min(wx, wx + e * RUN), y: PLATFORM_Y, z: side > 0 ? ESC_HALF_W : -ESC_HALF_W - E.railWidth }, { x: Math.max(wx, wx + e * RUN), y: shaftTop(rise), z: side > 0 ? ESC_HALF_W + E.railWidth : -ESC_HALF_W });
  }
  const count = Math.ceil(RUN / E.stepPitch) + 2;
  const flights = [-1, 1].map((lane) => {
    const mesh = new InstancedMesh(treadGeometry(), stepMaterial, count);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    // Steps are placed from the wall, so they stay precise far from the world's origin.
    mesh.position.x = wx;
    mesh.name = lane > 0 ? 'escalator-up' : 'escalator-down';
    s.extras.add(mesh);
    return { lane, mesh };
  });
  const matrix = new Matrix4();
  const zone: EscalatorZone = { wallX: wx, dir: e, z: 0, rise, run: RUN, stoppedLane: 0, update: () => {} };
  zone.update = (time: number, playerX: number) => {
    for (const { lane, mesh } of flights) {
      mesh.visible = Math.abs(playerX - wx) < E.updateDistance;
      if (!mesh.visible) continue;
      const t = lane === zone.stoppedLane ? 0 : time;
      for (let i = 0; i < count; i++) {
        const along = escalatorStepAlong(i, t, lane);
        if (along < 0 || along > RUN) matrix.makeScale(0, 0, 0);
        else matrix.makeRotationY(e < 0 ? Math.PI : 0).setPosition(e * along, height(along), lane * E.laneCenter);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  zone.update(0, wx);
  return zone;
}
