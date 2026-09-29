import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, Points, PointsMaterial, SphereGeometry, type Scene } from 'three';
import { glowTexture } from './gfx/textures';
import { CAVE_HALF_L, TRACK_Z, TRAIN_HALF_L, TRAIN_NOSE, trackSide } from './layout';
import type { Network } from './line';
import { noiseBurst, Spatial, thump, tone, type AudioOut } from './sfx';
import type { Timetable, TrainState } from './timetable';

/**
 * Block signals along the tracks: one at the tunnel mouth where each
 * platform ends, and more along the tunnels. A signal shows red while any
 * train is in the block ahead of it and green once the block is clear, so
 * you can watch the red follow a train into the dark. In the turnback
 * caverns the points motor whirrs and the blades land with a clunk before a
 * train shunts across.
 */

const BLOCK = 170;
const UPDATE = 0.25;
const REACH = 700;

interface Signal {
  x: number;
  /** The track's centerline. */
  track: number;
  /** +1 for trains heading toward +x. */
  dir: 1 | -1;
  /** The far end of the block it protects. */
  end: number;
  red: boolean;
}

export interface SignalTrain {
  x: number;
  z: number;
}

export interface ShuntService {
  id: number;
  state: TrainState;
  timetable: Timetable;
}

/** Whether a train body overlaps the stretch of track from `a` to `b`. */
export function occupied(trains: SignalTrain[], track: number, a: number, b: number): boolean {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return trains.some((t) => Math.abs(t.z - track) < 1.5 && t.x + TRAIN_HALF_L + TRAIN_NOSE > lo && t.x - TRAIN_HALF_L - TRAIN_NOSE < hi);
}

/** Signals along every stretch between neighbouring stations, in both directions. */
export function layoutSignals(net: Network, stationX: number[]): Signal[] {
  const out: Signal[] = [];
  for (const link of net.layout.links) {
    const a = stationX[link.a];
    const b = stationX[link.b];
    // Through a portal only the departure signals stand.
    const jump = link.portal !== null;
    for (const dir of [1, -1] as const) {
      const start = dir > 0 ? a + CAVE_HALF_L - 2 : b - CAVE_HALF_L + 2;
      const stop = dir > 0 ? b - CAVE_HALF_L : a + CAVE_HALF_L;
      const track = trackSide(dir) * TRACK_Z;
      const xs: number[] = [start];
      if (!jump) for (let x = start + dir * BLOCK; (stop - x) * dir > 60; x += dir * BLOCK) xs.push(x);
      xs.forEach((x, i) => out.push({ x, track, dir, end: i + 1 < xs.length ? xs[i + 1] : stop + dir * (CAVE_HALF_L + 10), red: false }));
    }
  }
  return out;
}

export class Signals {
  private readonly signals: Signal[];
  private readonly heads: InstancedMesh;
  private readonly lamps: InstancedMesh;
  private readonly glow: Points;
  private readonly red = new Color(0xff2a1a);
  private readonly green = new Color(0x3dff7a);
  private readonly dark = new Color(0x1a1c1e);
  private timer = 0;
  private readonly shunting = new Map<number, boolean>();
  private points: Spatial | null = null;

  constructor(scene: Scene, net: Network, stationX: number[]) {
    this.signals = layoutSignals(net, stationX);
    const n = this.signals.length;
    // A mast and a dark head on the outer side of the track, with a red lamp over a green one.
    const head = new BoxGeometry(0.28, 0.72, 0.22);
    head.translate(0, 2.35, 0);
    const mast = new BoxGeometry(0.1, 2, 0.1);
    mast.translate(0, 1, 0);
    this.heads = new InstancedMesh(head, new MeshLambertMaterial({ color: 0x24272b }), n);
    const masts = new InstancedMesh(mast, new MeshLambertMaterial({ color: 0x3a3d40 }), n);
    this.lamps = new InstancedMesh(new SphereGeometry(0.07, 10, 8), new MeshBasicMaterial({ color: 0xffffff }), n * 2);
    const m = new Matrix4();
    this.signals.forEach((s, i) => {
      const z = s.track + Math.sign(s.track) * 2.05;
      m.makeTranslation(s.x, 0, z);
      this.heads.setMatrixAt(i, m);
      masts.setMatrixAt(i, m);
      // The lamps face oncoming drivers.
      for (const [k, y] of [[0, 2.55], [1, 2.2]] as const) {
        m.makeTranslation(s.x - s.dir * 0.12, y, z);
        this.lamps.setMatrixAt(i * 2 + k, m);
        this.lamps.setColorAt(i * 2 + k, this.dark);
      }
    });
    for (const mesh of [this.heads, masts, this.lamps]) {
      mesh.computeBoundingSphere();
      mesh.name = 'signals';
      scene.add(mesh);
    }
    const geo = new BufferGeometry();
    const positions = new Float32Array(n * 3);
    this.signals.forEach((s, i) => positions.set([s.x - s.dir * 0.2, 0, s.track + Math.sign(s.track) * 2.05], i * 3));
    geo.setAttribute('position', new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage));
    this.glow = new Points(geo, new PointsMaterial({ size: 0.9, map: glowTexture(), vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false }));
    this.glow.frustumCulled = false;
    scene.add(this.glow);
    this.update(1, [], 0, [], null);
  }

  /**
   * @param trains every train on the tracks, for the aspects
   * @param services the timetable trains, for the points in the turnback caverns
   */
  update(dt: number, trains: SignalTrain[], playerX: number, services: ShuntService[], out: AudioOut | null, listener?: { x: number; z: number }): void {
    this.timer -= dt;
    if (listener && out) this.shunts(services, listener, out);
    if (this.timer > 0) return;
    this.timer = UPDATE;
    const positions = this.glow.geometry.getAttribute('position') as BufferAttribute;
    const colors = this.glow.geometry.getAttribute('color') as BufferAttribute;
    let changed = false;
    this.signals.forEach((s, i) => {
      if (Math.abs(s.x - playerX) > REACH) return;
      const red = occupied(trains, s.track, s.x, s.end);
      if (red === s.red && positions.getY(i) !== 0) return;
      s.red = red;
      changed = true;
      this.lamps.setColorAt(i * 2, red ? this.red : this.dark);
      this.lamps.setColorAt(i * 2 + 1, red ? this.dark : this.green);
      const c = red ? this.red : this.green;
      colors.setXYZ(i, c.r * 0.7, c.g * 0.7, c.b * 0.7);
      positions.setY(i, red ? 2.55 : 2.2);
    });
    if (!changed) return;
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
    positions.needsUpdate = true;
    colors.needsUpdate = true;
  }

  /** Before a train shunts across a turnback cavern, the points motor runs and the blades clunk home. */
  private shunts(services: ShuntService[], listener: { x: number; z: number }, out: AudioOut): void {
    for (const svc of services) {
      const tt = svc.timetable;
      const stop = tt.stops[svc.state.stop];
      const next = tt.stops[svc.state.next];
      const shunting = stop.kind === 'turnback' && next.kind === 'turnback' && svc.state.phase === 'moving';
      const was = this.shunting.get(svc.id);
      this.shunting.set(svc.id, shunting);
      if (!shunting || was !== false) continue;
      if (Math.hypot(svc.state.x - listener.x, listener.z) > 260) continue;
      this.points ??= new Spatial(out, 6, 1, 200);
      this.points.setPosition({ x: svc.state.x, y: 0.4, z: 0 });
      this.points.setLevel(1, 0.01);
      tone(out, this.points.input, 110, 0.05, 1.1, { type: 'sawtooth', glideTo: 150, attack: 0.1 });
      noiseBurst(out, this.points.input, { type: 'bandpass', frequency: 600, q: 2, volume: 0.08, attack: 0.1, decay: 1 });
      thump(out, 0.45, 220, this.points.input);
    }
  }
}
