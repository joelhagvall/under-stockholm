import { AdditiveBlending, BufferAttribute, BufferGeometry, CylinderGeometry, DynamicDrawUsage, Group, Matrix4, Mesh, Points, PointsMaterial, type Scene, type Vector3 } from 'three';
import { dayNumber } from './calendar';
import { hash01, serviceOpen } from './clock';
import { drawFigure, figureMesh, paintFigure } from './figures';
import { MeshBuilder } from './gfx/builder';
import { rgb } from './gfx/color';
import { glowTexture } from './gfx/textures';
import text from './i18n/sv.json';
import { CAVE_HALF_L, TRACK_Z, trackSide } from './layout';
import type { Physics, StaticCollider } from './physics';
import { propMaterial } from './props';
import { loopNoise, noiseBurst, Spatial, thump, type AudioOut } from './sfx';

/**
 * Night track work: while the trains rest, a yellow maintenance vehicle
 * stands on the track in one of the tunnels with its beacons turning, and
 * three workers in high-visibility clothes grind, measure and carry. The
 * site changes every night and is the same for everyone.
 */

const SPARKS = 30;

/** Tonight's site: a tunnel (between the stations at these indices) and a track, by the way it runs (1 toward +x). */
export function workSite(epoch: number, pairs: Array<[number, number]>): { pair: [number, number]; along: number; track: 1 | -1 } {
  const night = dayNumber(epoch - 6 * 3600);
  const pair = pairs[Math.floor(hash01(night, 121) * pairs.length)];
  return { pair, along: 0.3 + hash01(night, 122) * 0.4, track: hash01(night, 123) < 0.5 ? 1 : -1 };
}

function vehicleGeometry(): ReturnType<MeshBuilder['build']> {
  const b = new MeshBuilder();
  const yellow = rgb(0xf2b705);
  const dark = rgb(0x2a2c30);
  b.box({ x: -4.5, y: 0.35, z: -1.3 }, { x: 4.5, y: 1.4, z: 1.3 }, yellow);
  b.box({ x: 2.2, y: 1.4, z: -1.25 }, { x: 4.4, y: 3.1, z: 1.25 }, yellow);
  b.box({ x: 2.3, y: 2.0, z: -1.26 }, { x: 4.3, y: 2.9, z: 1.26 }, rgb(0x1c2a33));
  b.box({ x: 4.38, y: 2.0, z: -1.1 }, { x: 4.42, y: 2.9, z: 1.1 }, rgb(0x1c2a33));
  // A crane arm folded over the flatbed, and a load of new sleepers.
  b.box({ x: -3.6, y: 1.4, z: -0.2 }, { x: 1.6, y: 1.7, z: 0.2 }, rgb(0xd98e1f));
  for (let k = 0; k < 4; k++) b.box({ x: -4.2, y: 1.4 + k * 0.14, z: -1.1 }, { x: -1.8, y: 1.52 + k * 0.14, z: 1.1 }, rgb(0x6d6a64));
  b.box({ x: -4.6, y: 0.2, z: -1.2 }, { x: 4.6, y: 0.35, z: 1.2 }, dark);
  for (const x of [-3, 3]) {
    for (const z of [-0.72, 0.72]) {
      const wheel = new CylinderGeometry(0.33, 0.33, 0.12, 14);
      b.geometry(wheel, new Matrix4().makeRotationX(Math.PI / 2).setPosition(x, 0.33, z), dark);
      wheel.dispose();
    }
  }
  // Hazard stripes on the buffers.
  for (const x of [-4.62, 4.52]) for (let k = 0; k < 6; k++) b.box({ x, y: 0.35, z: -1.2 + k * 0.4 }, { x: x + 0.1, y: 0.75, z: -1 + k * 0.4 }, k % 2 ? rgb(0x111111) : yellow);
  return b.build();
}

export class TrackWork {
  private readonly group = new Group();
  private readonly crew = figureMesh(3);
  private readonly beacons: Points;
  private readonly lamp: Points;
  private readonly sparks: Points;
  private readonly sparkData = new Float32Array(SPARKS * 3);
  private readonly sparkVel = new Float32Array(SPARKS * 3);
  private readonly collider: StaticCollider;
  private readonly pairs: Array<[number, number]>;
  private siteKey = '';
  private clock = 0;
  private x = 0;
  private z = 0;
  private dir: 1 | -1 = 1;
  private sound: { spatial: Spatial } | null = null;
  private nextNoise = 0;
  private told = '';

  /**
   * @param stationX world x of every station
   * @param pairs neighbouring stations with a tunnel between them
   */
  constructor(scene: Scene, physics: Physics, private readonly stationX: number[], pairs: Array<[number, number]>, private readonly events: { say(message: string, seconds: number): void }) {
    this.pairs = pairs;
    this.group.name = 'track-work';
    this.group.visible = false;
    const vehicle = new Mesh(vehicleGeometry(), propMaterial());
    this.group.add(vehicle);
    scene.add(this.group);
    for (let i = 0; i < 3; i++) paintFigure(this.crew, i, { coat: 0xf08a24, torso: 0xd8e53a, skin: [0xdba987, 0x634432, 0xe8bd9b][i], hair: 0xf2f2ee, bag: 0x2a2c30, trousers: 0x1f3a6a, shoes: 0x1c1d20, prop: 0xc9c9c9 });
    this.crew.visible = false;
    scene.add(this.crew);
    const points = (n: number, size: number, color: number) => {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage));
      const p = new Points(geo, new PointsMaterial({ size, map: glowTexture(), color, transparent: true, blending: AdditiveBlending, depthWrite: false }));
      p.frustumCulled = false;
      return p;
    };
    this.beacons = points(2, 2.2, 0xffa21a);
    this.lamp = points(1, 6, 0xfff4dc);
    this.sparks = points(SPARKS, 0.16, 0xffc56b);
    this.group.add(this.beacons, this.lamp);
    scene.add(this.sparks);
    for (let i = 0; i < SPARKS; i++) this.sparkData[i * 3 + 1] = -1000;
    this.sparks.geometry.setAttribute('position', new BufferAttribute(this.sparkData, 3).setUsage(DynamicDrawUsage));
    this.collider = physics.box({ x: -4.6, y: 0, z: -1.3 }, { x: 4.6, y: 3.1, z: 1.3 });
    this.collider.setEnabled(false);
  }

  /** Where tonight's site is: the vehicle's center on the track, and which way it faces. */
  siteAt(time: number): { x: number; z: number; dir: 1 | -1 } {
    const site = workSite(time, this.pairs);
    const [a, b] = site.pair;
    const x0 = this.stationX[a] + CAVE_HALF_L;
    const x1 = this.stationX[b] - CAVE_HALF_L;
    return { x: x0 + (x1 - x0) * site.along, z: trackSide(site.track) * TRACK_Z, dir: site.track };
  }

  update(dt: number, time: number, feet: Vector3, out: AudioOut | null): void {
    this.clock += dt;
    const on = !serviceOpen(time);
    const site = workSite(time, this.pairs);
    const key = `${site.pair.join('-')}:${site.along}:${site.track}`;
    if (key !== this.siteKey) {
      this.siteKey = key;
      ({ x: this.x, z: this.z, dir: this.dir } = this.siteAt(time));
      this.group.position.set(this.x, 0, this.z);
      this.group.rotation.y = this.dir > 0 ? 0 : Math.PI;
      this.collider.setTranslation({ x: this.x, y: 1.55, z: this.z });
    }
    const near = on && Math.abs(this.x - feet.x) < 400;
    this.group.visible = near;
    this.crew.visible = near;
    this.sparks.visible = near;
    this.collider.setEnabled(on);
    if (!near) { this.sound?.spatial.setLevel(0, 0.5); return; }
    // Beacons on the cab roof, turning.
    const beacon = this.beacons.geometry.getAttribute('position') as BufferAttribute;
    const flash = Math.max(0, Math.sin(this.clock * 8));
    beacon.setXYZ(0, 3.3, 3.25, flash > 0.2 ? 0.8 : -100);
    beacon.setXYZ(1, 3.3, 3.25, flash < 0.2 ? -0.8 : -100);
    beacon.needsUpdate = true;
    (this.lamp.geometry.getAttribute('position') as BufferAttribute).setXYZ(0, -6, 2.4, 0);
    this.lamp.geometry.getAttribute('position').needsUpdate = true;
    // The crew: one grinding a rail joint, one measuring the gauge, one carrying a lamp.
    const along = (d: number) => this.x - this.dir * d;
    const grind = Math.floor(this.clock / 5) % 3 !== 2;
    drawFigure(this.crew, 0, { x: along(8), z: this.z - 0.5, y: 0.02, yaw: this.dir * Math.PI / 2, walking: false, sway: 0.6 }, this.clock);
    drawFigure(this.crew, 1, { x: along(11), z: this.z + 0.6, y: 0.02, yaw: -this.dir * Math.PI / 2, walking: false, sway: 0.35, arm: 'phone', carry: 'paper' }, this.clock + 3);
    const pace = Math.sin(this.clock * 0.3) * 6;
    drawFigure(this.crew, 2, { x: along(14 + pace), z: this.z - 1.4 * Math.sign(this.z), y: 0.02, yaw: Math.cos(this.clock * 0.3) > 0 ? this.dir * Math.PI / 2 : -this.dir * Math.PI / 2, walking: true, carry: 'lantern' }, this.clock);
    this.crew.instanceMatrix.needsUpdate = true;
    this.spark(dt, grind ? along(8.3) : null);
    const key2 = this.siteKey;
    if (this.told !== key2 && Math.abs(this.x - feet.x) < 90) {
      this.told = key2;
      this.events.say(text.trackWork.seen, 5);
    }
    if (!out) return;
    if (!this.sound) {
      const spatial = new Spatial(out, 5, 1.1, 200);
      // A diesel generator ticking over.
      const hum = loopNoise(out, 'brown');
      const lp = out.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 180;
      hum.connect(lp).connect(spatial.input);
      this.sound = { spatial };
    }
    this.sound.spatial.setPosition({ x: this.x, y: 1.5, z: this.z });
    this.sound.spatial.setLevel(0.8, 0.5);
    if (this.clock > this.nextNoise) {
      this.nextNoise = this.clock + (grind ? 0.25 : 1.2 + Math.random() * 2);
      if (grind) noiseBurst(out, this.sound.spatial.input, { type: 'bandpass', frequency: 3000 + Math.random() * 1500, q: 3, volume: 0.12, attack: 0.02, decay: 0.3 });
      else thump(out, 0.25, 900, this.sound.spatial.input);
    }
  }

  /** Orange sparks off the grinder, bouncing on the ballast. */
  private spark(dt: number, at: number | null): void {
    const d = this.sparkData;
    const v = this.sparkVel;
    for (let i = 0; i < SPARKS; i++) {
      const o = i * 3;
      if (d[o + 1] < 0.02) {
        if (at === null || Math.random() > 0.3) { d[o + 1] = -1000; continue; }
        d[o] = at;
        d[o + 1] = 0.3;
        d[o + 2] = this.z - 0.72 * Math.sign(this.z || 1);
        v[o] = (Math.random() - 0.5) * 3;
        v[o + 1] = 1 + Math.random() * 2;
        v[o + 2] = (Math.random() - 0.5) * 3;
      }
      v[o + 1] -= 9 * dt;
      d[o] += v[o] * dt;
      d[o + 1] += v[o + 1] * dt;
      d[o + 2] += v[o + 2] * dt;
    }
    this.sparks.geometry.getAttribute('position').needsUpdate = true;
  }
}
