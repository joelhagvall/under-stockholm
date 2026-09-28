import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Points,
  PointsMaterial,
  type Scene,
} from 'three';
import { serviceOpen, stockholm } from './clock';
import { drawFigure, figureMesh, paintFigure } from './figures';
import { glowTexture } from './gfx/textures';
import { PLATFORM_HALF_L, PLATFORM_Y } from './layout';
import { loopNoise, Spatial, type AudioOut } from './sfx';
import { worldMaterialList } from './world/section';
import type { World } from './world/world';

/**
 * The metro at night: after the last train the stations dim, the escalators
 * stop and a floor scrubber hums slowly up and down the nearest platform,
 * leaving a wet trail that dries behind it.
 */

const NIGHT_LEVEL = 0.52;
const LANES = [-1.6, 2.35, 1.6, -2.35];
const SPAN = (PLATFORM_HALF_L - 9) * 2;
const SPEED = 0.95;
const TRAIL = 90;
const TRAIL_LIFE = 50;

/** Station light level for a moment in time, easing in and out of the night break. */
export function stationLight(epoch: number): number {
  const ramp = 600;
  const closedNow = !serviceOpen(epoch);
  const before = !serviceOpen(epoch - ramp);
  const after = !serviceOpen(epoch + ramp);
  if (closedNow === before && closedNow === after) return closedNow ? NIGHT_LEVEL : 1;
  // Near a switch: sample the neighbourhood and blend.
  let closed = 0;
  for (let k = -4; k <= 4; k++) closed += serviceOpen(epoch + (k * ramp) / 4) ? 0 : 1;
  return 1 - (1 - NIGHT_LEVEL) * (closed / 9);
}

/** Where the scrubber is at a given time, along the platform of a station centered at x = 0. */
export function cleanerPose(epoch: number): { x: number; z: number; heading: 1 | -1 } {
  const travelled = epoch * SPEED;
  const pass = Math.floor(travelled / SPAN);
  const along = travelled - pass * SPAN;
  const heading: 1 | -1 = pass % 2 === 0 ? 1 : -1;
  const x = heading > 0 ? -SPAN / 2 + along : SPAN / 2 - along;
  return { x, z: LANES[((pass % LANES.length) + LANES.length) % LANES.length], heading };
}

export class Night {
  readonly group = new Group();
  private readonly cleaner = new Group();
  private readonly driver = figureMesh(1);
  private readonly beacon: Points;
  private readonly trail: Mesh;
  private readonly trailPoints: Array<{ x: number; z: number; t: number }> = [];
  private readonly trailPositions: Float32Array;
  private readonly trailColors: Float32Array;
  private hum: Spatial | null = null;
  private level = 1;
  private clock = 0;
  private station = -1;
  closed = false;

  constructor(scene: Scene, private readonly world: World) {
    this.group.name = 'night';
    scene.add(this.group);
    const paint = new MeshLambertMaterial({ color: 0xd98e1f });
    const dark = new MeshLambertMaterial({ color: 0x2a2c30 });
    const body = new Mesh(new BoxGeometry(1.5, 0.75, 0.95), paint);
    body.position.y = 0.55;
    const hood = new Mesh(new BoxGeometry(0.55, 0.35, 0.9), paint);
    hood.position.set(0.45, 1.05, 0);
    const deck = new Mesh(new BoxGeometry(0.5, 0.14, 1.1), dark);
    deck.position.set(0.85, 0.12, 0);
    const squeegee = new Mesh(new BoxGeometry(0.08, 0.1, 1.2), dark);
    squeegee.position.set(-0.85, 0.07, 0);
    const seat = new Mesh(new BoxGeometry(0.45, 0.12, 0.5), dark);
    seat.position.set(-0.35, 0.98, 0);
    const mast = new Mesh(new CylinderGeometry(0.02, 0.02, 0.9), dark);
    mast.position.set(-0.65, 1.35, 0.35);
    const lamp = new Mesh(new CylinderGeometry(0.08, 0.09, 0.14, 12), new MeshBasicMaterial({ color: 0xffa21a }));
    lamp.position.set(-0.65, 1.85, 0.35);
    this.cleaner.add(body, hood, deck, squeegee, seat, mast, lamp);
    for (const [x, z] of [[0.55, 0.45], [0.55, -0.45], [-0.55, 0.45], [-0.55, -0.45]] as const) {
      const wheel = new Mesh(new CylinderGeometry(0.17, 0.17, 0.1, 14), dark);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.17, z);
      this.cleaner.add(wheel);
    }
    paintFigure(this.driver, 0, { coat: 0xf08a24, torso: 0xf08a24, skin: 0xd8a47f, hair: 0x2a2f38, bag: 0xf08a24, trousers: 0x243049, shoes: 0x1c1d20 });
    drawFigure(this.driver, 0, { x: -0.3, y: 0.5, z: 0, yaw: Math.PI / 2, walking: false, seated: true }, 0);
    this.cleaner.add(this.driver);
    const flash = new BufferGeometry();
    flash.setAttribute('position', new Float32BufferAttribute([-0.65, 1.86, 0.35], 3));
    this.beacon = new Points(flash, new PointsMaterial({ size: 1.6, map: glowTexture(), color: 0xffa21a, transparent: true, blending: AdditiveBlending, depthWrite: false }));
    this.cleaner.add(this.beacon);
    this.cleaner.visible = false;
    this.group.add(this.cleaner);

    this.trailPositions = new Float32Array(TRAIL * 2 * 3);
    this.trailColors = new Float32Array(TRAIL * 2 * 4);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.trailPositions, 3).setUsage(DynamicDrawUsage));
    geo.setAttribute('color', new BufferAttribute(this.trailColors, 4).setUsage(DynamicDrawUsage));
    const index: number[] = [];
    for (let i = 0; i < TRAIL - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(index);
    this.trail = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 1;
    this.group.add(this.trail);
  }

  update(dt: number, time: number, playerX: number, out: AudioOut | null): void {
    this.clock += dt;
    const level = stationLight(time);
    if (Math.abs(level - this.level) > 0.002) {
      this.level = level;
      for (const m of worldMaterialList()) m.color.setScalar(level);
    }
    this.closed = !serviceOpen(time);
    // Escalators rest for the quiet middle of the night break.
    const h = stockholm(time).hours;
    this.world.escalatorsRunning = !(this.closed && h >= 1.5 && h < 4.75);

    const station = this.world.nearestStation(playerX);
    const active = this.closed && Math.abs(playerX - station.cx) < 200;
    if (station.index !== this.station) { this.station = station.index; this.trailPoints.length = 0; }
    this.cleaner.visible = active;
    this.trail.visible = active;
    if (!active) {
      this.hum?.setLevel(0);
      return;
    }
    const pose = cleanerPose(time);
    const x = station.cx + pose.x;
    this.cleaner.position.set(x, PLATFORM_Y, pose.z);
    this.cleaner.rotation.y = pose.heading > 0 ? 0 : Math.PI;
    (this.beacon.material as PointsMaterial).opacity = 0.35 + 0.65 * Math.max(0, Math.sin(this.clock * 7));

    // The squeegee leaves a darker, wet stripe that dries from the far end.
    const last = this.trailPoints[this.trailPoints.length - 1];
    const tail = x - pose.heading * 0.9;
    if (!last || Math.hypot(last.x - tail, last.z - pose.z) > 0.5) {
      const jump = last && Math.hypot(last.x - tail, last.z - pose.z) > 3;
      // Two invisible points bridge a lane change without smearing the stripe.
      if (jump) this.trailPoints.push({ x: last.x, z: last.z, t: -Infinity }, { x: tail, z: pose.z, t: -Infinity });
      this.trailPoints.push({ x: tail, z: pose.z, t: time });
      while (this.trailPoints.length > TRAIL) this.trailPoints.shift();
    }
    this.trailColors.fill(0);
    this.trailPoints.forEach((p, i) => {
      const alpha = Number.isFinite(p.t) ? Math.max(0, 1 - (time - p.t) / TRAIL_LIFE) * 0.32 : 0;
      for (const side of [0, 1]) {
        const k = i * 2 + side;
        this.trailPositions.set([p.x, PLATFORM_Y + 0.006, p.z + (side ? 0.55 : -0.55)], k * 3);
        this.trailColors.set([0.05, 0.06, 0.07, alpha], k * 4);
      }
    });
    for (let i = this.trailPoints.length; i < TRAIL; i++) {
      const p = this.trailPoints[this.trailPoints.length - 1];
      for (const side of [0, 1]) this.trailPositions.set([p?.x ?? 0, PLATFORM_Y, p?.z ?? 0], (i * 2 + side) * 3);
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.color.needsUpdate = true;

    if (out) {
      if (!this.hum) {
        this.hum = new Spatial(out, 2.5, 1.3, 60);
        const noise = loopNoise(out, 'brown');
        const lp = out.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 420;
        noise.connect(lp).connect(this.hum.input);
        const motor = out.ctx.createOscillator();
        motor.type = 'sawtooth';
        motor.frequency.value = 96;
        const mg = out.ctx.createGain();
        mg.gain.value = 0.05;
        const mf = out.ctx.createBiquadFilter();
        mf.type = 'lowpass';
        mf.frequency.value = 300;
        motor.connect(mf).connect(mg).connect(this.hum.input);
        motor.start();
      }
      this.hum.setPosition({ x, y: PLATFORM_Y + 0.6, z: pose.z });
      this.hum.setLevel(0.5);
    }
  }
}
