import { BoxGeometry, InstancedMesh, Matrix4, Mesh, Object3D, SphereGeometry, type BufferGeometry, type Scene, type Vector3 } from 'three';
import { MeshBuilder } from './gfx/builder';
import { rgb } from './gfx/color';
import { text } from './i18n/text';
import { CAVE_HALF_L, PLATFORM_HALF_L, PLATFORM_HALF_W, TRAIN_HALF_L } from './layout';
import { propMaterial } from './props';
import { noiseBurst, Spatial, tone, type AudioOut } from './sfx';
import type { StationInfo } from './world/station';
import type { Location } from './world/world';

/**
 * Pigeons that have walked down the stairs into the ticket hall and peck at
 * crumbs by the doors until someone comes too close, and a rat that runs
 * along the foot of the platform wall and vanishes into a drain as soon as
 * the rails start to sing. They are local to each visitor, like the crowd.
 */

const PIGEONS = 6;
const FLEE = 2.6;

function pigeonGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  const body = new SphereGeometry(0.11, 10, 8);
  const m = new Matrix4();
  b.geometry(body, m.makeScale(1.35, 0.85, 0.9).setPosition(0, 0.16, 0), (p) => rgb(p.y > 0.2 ? 0x8f949c : 0x70757d));
  body.dispose();
  const head = new SphereGeometry(0.055, 8, 6);
  b.geometry(head, new Matrix4().setPosition(0.13, 0.28, 0), rgb(0x6c7079));
  head.dispose();
  // The green and purple sheen on the neck.
  const neck = new SphereGeometry(0.06, 8, 6);
  b.geometry(neck, new Matrix4().makeScale(1, 1.1, 1).setPosition(0.1, 0.22, 0), (p) => rgb(p.z > 0 ? 0x4f7a5c : 0x6d4f78));
  neck.dispose();
  b.box({ x: 0.18, y: 0.265, z: -0.012 }, { x: 0.22, y: 0.285, z: 0.012 }, rgb(0x2b2b2b));
  b.box({ x: -0.25, y: 0.12, z: -0.05 }, { x: -0.1, y: 0.16, z: 0.05 }, rgb(0x55595f));
  for (const z of [-0.035, 0.035]) b.box({ x: 0.0, y: 0, z: z - 0.008 }, { x: 0.02, y: 0.08, z: z + 0.008 }, rgb(0xb5494a));
  return b.build();
}

function ratGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  const body = new SphereGeometry(0.07, 8, 6);
  b.geometry(body, new Matrix4().makeScale(1.9, 0.8, 0.9).setPosition(0, 0.055, 0), rgb(0x4d4339));
  body.dispose();
  const head = new SphereGeometry(0.04, 8, 6);
  b.geometry(head, new Matrix4().makeScale(1.4, 0.9, 1).setPosition(0.14, 0.05, 0), rgb(0x564a3f));
  head.dispose();
  for (const z of [-0.025, 0.025]) b.box({ x: 0.12, y: 0.08, z: z - 0.012 }, { x: 0.135, y: 0.1, z: z + 0.012 }, rgb(0x8a6d62));
  const tail = new BoxGeometry(0.22, 0.012, 0.012);
  b.geometry(tail, new Matrix4().makeRotationZ(0.12).setPosition(-0.24, 0.035, 0), rgb(0x9a7f74));
  tail.dispose();
  return b.build();
}

interface Pigeon {
  x: number;
  z: number;
  y: number;
  yaw: number;
  /** Seconds until it walks somewhere else. */
  wait: number;
  tx: number;
  tz: number;
  /** 0 on the ground; above 0 flying away, counting up. */
  flight: number;
  /** Seconds until it comes back after flying off. */
  away: number;
  peck: number;
}

export class Critters {
  private readonly pigeons: InstancedMesh;
  private readonly flock: Pigeon[] = [];
  private readonly rat: Mesh;
  private readonly dummy = new Object3D();
  private hall: StationInfo | null = null;
  private platform: StationInfo | null = null;
  private clock = 0;
  private sound: Spatial | null = null;
  private ratSound: Spatial | null = null;
  private nextCoo = 5;
  private rx = 0;
  private side: 1 | -1 = 1;
  private ratDir: 1 | -1 = 1;
  private ratRun = 0;
  private ratHidden = 0;
  private ratSeen = false;

  constructor(scene: Scene, private readonly events: { say(message: string, seconds: number): void }) {
    this.pigeons = new InstancedMesh(pigeonGeometry(), propMaterial(), PIGEONS);
    this.pigeons.name = 'pigeons';
    this.pigeons.frustumCulled = false;
    this.pigeons.visible = false;
    scene.add(this.pigeons);
    for (let i = 0; i < PIGEONS; i++) this.flock.push({ x: 0, z: 0, y: 0, yaw: 0, wait: Math.random() * 3, tx: 0, tz: 0, flight: 0, away: 0, peck: Math.random() * 6 });
    this.rat = new Mesh(ratGeometry(), propMaterial());
    this.rat.name = 'rat';
    this.rat.visible = false;
    scene.add(this.rat);
  }

  /**
   * @param trains every train's x and track side, so the rat knows when to hide
   * @param daylight pigeons only come down in the daytime
   */
  update(dt: number, here: Location, stations: StationInfo[], feet: Vector3, trains: Array<{ x: number; z: number; speed: number }>, daylight: boolean, out: AudioOut | null): void {
    this.clock += dt;
    const station = here.station !== null && here.station < stations.length && !here.label ? stations[here.station] : null;
    this.updatePigeons(dt, here.area === 'hall' && daylight ? station : null, feet, out);
    this.updateRat(dt, here.area === 'platform' || here.area === 'track' ? station : null, feet, trains, out);
  }

  /** The unpaid side of the hall, between the gates and the foot of the stairs. */
  private spot(s: StationInfo, i: number): { x: number; z: number } {
    const a = 14 + Math.random() * 4.5;
    const z = (Math.random() - 0.5) * 12;
    return { x: s.hallX(a) + (i % 2) * 0.1, z };
  }

  private updatePigeons(dt: number, hall: StationInfo | null, feet: Vector3, out: AudioOut | null): void {
    this.pigeons.visible = hall !== null;
    if (!hall) { this.hall = null; return; }
    if (hall !== this.hall) {
      this.hall = hall;
      for (const [i, p] of this.flock.entries()) {
        Object.assign(p, this.spot(hall, i), { y: hall.hall.y, flight: 0, away: 0 });
        p.tx = p.x;
        p.tz = p.z;
      }
    }
    if (out && !this.sound) this.sound = new Spatial(out, 2, 1.3, 30);
    const door = hall.exit;
    let scattered = false;
    this.flock.forEach((p, i) => {
      if (p.away > 0) {
        p.away -= dt;
        if (p.away <= 0) {
          // Back down the stairs, one at a time.
          Object.assign(p, this.spot(hall, i), { y: hall.hall.y, flight: 0 });
          p.tx = p.x;
          p.tz = p.z;
        }
        this.hide(i);
        return;
      }
      const near = Math.hypot(p.x - feet.x, p.z - feet.z) < FLEE && Math.abs(feet.y - hall.hall.y) < 2;
      if (near && p.flight === 0) { p.flight = 0.001; scattered = true; }
      if (p.flight > 0) {
        // Up and out through the doors.
        p.flight += dt;
        const tx = door.x;
        const ty = door.sillY + 2.2;
        const k = Math.min(1, dt * 1.4);
        p.x += (tx - p.x) * k;
        p.y += (ty - p.y) * k + dt * 1.2;
        p.z += (0 - p.z) * k;
        p.yaw = Math.atan2(-(0 - p.z), tx - p.x);
        if (p.flight > 2.2) { p.away = 25 + Math.random() * 40; this.hide(i); return; }
      } else {
        p.wait -= dt;
        if (p.wait <= 0) {
          p.wait = 1.5 + Math.random() * 4;
          const target = this.spot(hall, i);
          p.tx = p.x + (target.x - p.x) * 0.25;
          p.tz = p.z + (target.z - p.z) * 0.25;
        }
        const dx = p.tx - p.x;
        const dz = p.tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.02) {
          const step = Math.min(d, dt * 0.35);
          p.x += (dx / d) * step;
          p.z += (dz / d) * step;
          p.yaw = Math.atan2(-dz, dx);
        }
      }
      const walking = p.flight === 0 && Math.hypot(p.tx - p.x, p.tz - p.z) > 0.02;
      p.peck -= dt;
      if (p.peck < 0) p.peck = 2 + Math.random() * 5;
      const pecking = !walking && p.flight === 0 && p.peck < 0.5;
      const bob = walking ? Math.abs(Math.sin(this.clock * 9 + i)) * 0.02 : 0;
      this.dummy.position.set(p.x, p.y + bob, p.z);
      this.dummy.rotation.set(0, p.yaw, p.flight > 0 ? 0.35 : pecking ? -0.45 * Math.abs(Math.sin(p.peck * 12)) : 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.pigeons.setMatrixAt(i, this.dummy.matrix);
    });
    this.pigeons.instanceMatrix.needsUpdate = true;
    if (!out || !this.sound) return;
    const settled = this.flock.find((p) => p.away <= 0 && p.flight === 0);
    if (scattered) {
      this.sound.setPosition({ x: feet.x, y: hall.hall.y + 0.5, z: feet.z });
      this.sound.setLevel(1, 0.01);
      // A clatter of wings.
      for (let k = 0; k < 9; k++) noiseBurst(out, this.sound.input, { type: 'bandpass', frequency: 900 + Math.random() * 500, q: 1.2, volume: 0.25, attack: 0.01, decay: 0.07, delay: k * 0.07 + Math.random() * 0.03 });
      if (!this.hall || Math.random() < 0.3) this.events.say(text.critters.pigeons, 3);
    } else if (settled && this.clock > this.nextCoo) {
      this.nextCoo = this.clock + 4 + Math.random() * 8;
      this.sound.setPosition({ x: settled.x, y: hall.hall.y + 0.3, z: settled.z });
      this.sound.setLevel(1, 0.01);
      for (let k = 0; k < 3; k++) tone(out, this.sound.input, 420 - k * 25, 0.04, 0.28, { type: 'sine', delay: k * 0.32, glideTo: 330 - k * 20, attack: 0.06 });
    }
  }

  private hide(i: number): void {
    this.pigeons.setMatrixAt(i, new Matrix4().makeScale(0, 0, 0));
  }

  /** A rat along the foot of the platform wall. It dives into a drain when a train is near. */
  private updateRat(dt: number, station: StationInfo | null, feet: Vector3, trains: Array<{ x: number; z: number; speed: number }>, out: AudioOut | null): void {
    if (station !== this.platform) {
      this.platform = station;
      if (station) {
        this.side = Math.random() < 0.5 ? 1 : -1;
        this.rx = station.cx + (Math.random() - 0.5) * 100;
        this.ratHidden = 4 + Math.random() * 8;
        this.ratSeen = false;
      }
    }
    if (!station) { this.rat.visible = false; return; }
    // Trains on this side within a few hundred meters, or standing at the platform.
    const danger = trains.some((t) => Math.sign(t.z) === this.side && Math.abs(t.x - station.cx) < CAVE_HALF_L + TRAIN_HALF_L + 250);
    if (danger) {
      if (this.rat.visible && out) {
        this.ratSound ??= new Spatial(out, 1.5, 1.4, 25);
        this.ratSound.setPosition({ x: this.rx, y: 0.2, z: this.side * (PLATFORM_HALF_W + 0.2) });
        this.ratSound.setLevel(1, 0.01);
        tone(out, this.ratSound.input, 3200, 0.02, 0.06, { type: 'triangle', glideTo: 2600 });
      }
      this.rat.visible = false;
      this.ratHidden = 6 + Math.random() * 10;
      return;
    }
    if (this.ratHidden > 0) {
      this.ratHidden -= dt;
      this.rat.visible = false;
      return;
    }
    // Scurry in short dashes, stop, sniff, and turn at the platform ends.
    this.ratRun -= dt;
    if (this.ratRun < -1.2 - Math.random()) {
      this.ratRun = 0.4 + Math.random() * 1.2;
      if (Math.random() < 0.3) this.ratDir = this.ratDir > 0 ? -1 : 1;
    }
    const running = this.ratRun > 0;
    if (running) this.rx += this.ratDir * dt * 2.4;
    const lo = station.cx - PLATFORM_HALF_L + 4;
    const hi = station.cx + PLATFORM_HALF_L - 4;
    if (this.rx < lo) { this.rx = lo; this.ratDir = 1; }
    if (this.rx > hi) { this.rx = hi; this.ratDir = -1; }
    const z = this.side * (PLATFORM_HALF_W + 0.28 + Math.sin(this.clock * 3) * 0.04);
    this.rat.visible = true;
    this.rat.position.set(this.rx, 0.12, z);
    this.rat.rotation.set(0, this.ratDir > 0 ? 0 : Math.PI, running ? 0 : Math.sin(this.clock * 14) * 0.05);
    if (!this.ratSeen && Math.hypot(this.rx - feet.x, z - feet.z) < 7 && Math.abs(feet.z) < PLATFORM_HALF_W + 0.2) {
      this.ratSeen = true;
      this.events.say(text.critters.rat, 4);
    }
  }
}
