import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, PointsMaterial, Vector3, type Camera, type Scene } from 'three';
import { stockholm } from './clock';
import { drawFigure, figureMesh, paintFigure } from './figures';
import { glowTexture } from './gfx/textures';
import sv from './i18n/sv.json';
import { text } from './i18n/text';
import { kioskShift } from './world/kiosk';
import type { StationInfo } from './world/station';
import type { Interactable } from './world/zones';

/**
 * People in the ticket hall: the attendant in the glass booth, who looks up
 * as you pass, and a street paper vendor by the gates who says hello. In
 * the cold, breath shows as small clouds near the street doors.
 */

const PUFFS = 48;
const VENDOR = { a: 15.6, z: -4.2 };
const BOOTH = { a: 12, z: 8.7 };
/** Behind the kiosk counter (see `world/kiosk.ts`). */
const CLERK = { a: 23.2, z: -7.9 };

export interface HallEvents {
  say(message: string, seconds: number): void;
  speak(message: string, pitch: number, rate: number): void;
  /** Pays with the SL card; false if the balance is too low. */
  spend(amount: number): boolean;
}

/** The vendor works the stations with an odd index (T-Centralen, Fridhemsplan, Västra skogen), in the daytime. */
export const hasVendor = (station: number) => station % 2 === 1;
const vendorHours = (hours: number) => hours >= 8 && hours < 19;

const hallX = (s: StationInfo, a: number) => s.hallX(a);

export class HallLife {
  readonly interactables: Interactable[] = [];
  private readonly figures = figureMesh(3);
  private readonly puffs: Points;
  private readonly puffData = new Float32Array(PUFFS * 3);
  private readonly puffColor = new Float32Array(PUFFS * 4);
  private readonly puffVel = new Float32Array(PUFFS * 3);
  private readonly puffLife = new Float32Array(PUFFS);
  private nextPuff = 0;
  private nextBreath = 0;
  private clock = 0;
  private greeted = -1;
  private nodded = false;
  private station: StationInfo | null = null;
  private vendorHere = false;
  private hours = 12;

  constructor(scene: Scene, private readonly stations: StationInfo[], private readonly events: HallEvents) {
    paintFigure(this.figures, 0, { coat: 0x1f2a36, torso: 0x2b4a7a, skin: 0xd8a47f, hair: 0x5a4636, bag: 0x1f2a36, trousers: 0x243049, shoes: 0x1c1d20 });
    paintFigure(this.figures, 1, { coat: 0x3a3f45, torso: 0xc0392b, skin: 0x946747, hair: 0x2b2b2b, bag: 0x3a3f45, trousers: 0x2e3440, shoes: 0x1f1b18, prop: 0xe9e4d6 });
    paintFigure(this.figures, 2, { coat: 0xb3162c, torso: 0xb3162c, skin: 0xe8bd9b, hair: 0x6b4a2e, bag: 0xb3162c, trousers: 0x2e3440, shoes: 0x1f1b18 });
    this.figures.visible = false;
    this.figures.name = 'hall-people';
    scene.add(this.figures);

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.puffData, 3).setUsage(DynamicDrawUsage));
    // RGBA: each cloud fades out on its own.
    geo.setAttribute('color', new BufferAttribute(this.puffColor, 4).setUsage(DynamicDrawUsage));
    this.puffs = new Points(geo, new PointsMaterial({ size: 0.3, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false }));
    this.puffs.frustumCulled = false;
    this.puffs.name = 'breath';
    scene.add(this.puffs);
    for (let i = 0; i < PUFFS; i++) this.puffData[i * 3 + 1] = -1000;

    for (const s of stations) {
      if (!hasVendor(s.index)) continue;
      this.interactables.push({
        pos: new Vector3(hallX(s, VENDOR.a), s.hall.y + 1, VENDOR.z), radius: 1.6, prompt: () => text.ambience.vendorPrompt,
        enabled: () => vendorHours(this.hours),
        act: () => (this.events.spend(80) ? text.ambience.vendorBought : text.ambience.vendorBroke),
      });
    }
  }

  /**
   * @param hall the station whose ticket hall the player is in, or null
   * @param cold breath shows
   */
  update(dt: number, time: number, hall: number | null, feet: Vector3, camera: Camera, cold: boolean): void {
    this.clock += dt;
    this.hours = stockholm(time).hours;
    const s = hall !== null ? this.stations[hall] : null;
    if (s !== this.station) { this.station = s; this.nodded = false; }
    this.figures.visible = s !== null;
    if (s) {
      // The attendant looks up from the screen when someone comes close.
      const bx = hallX(s, BOOTH.a);
      const toPlayer = Math.atan2(feet.x - bx, feet.z - BOOTH.z);
      const near = Math.hypot(feet.x - bx, feet.z - BOOTH.z) < 7;
      const turn = near ? Math.max(-1.1, Math.min(1.1, wrap(toPlayer - Math.PI))) : Math.sin(this.clock * 0.2) * 0.1;
      drawFigure(this.figures, 0, { x: bx, y: s.hall.y + 0.22, z: BOOTH.z, yaw: Math.PI, walking: false, seated: true, look: turn }, this.clock);
      if (near && !this.nodded && Math.hypot(feet.x - bx, feet.z - BOOTH.z) < 3.2) {
        this.nodded = true;
        this.events.say(text.ambience.attendantNod, 3);
      }
      this.vendorHere = hasVendor(s.index) && vendorHours(this.hours);
      const vx = hallX(s, VENDOR.a);
      const distance = Math.hypot(feet.x - vx, feet.z - VENDOR.z);
      if (this.vendorHere) {
        const greeting = distance < 4;
        drawFigure(this.figures, 1, { x: vx, y: s.hall.y, z: VENDOR.z, yaw: s.exitDir * Math.PI / 2, walking: false, arm: greeting ? 'wave' : 'phone', carry: greeting ? undefined : 'paper', look: greeting ? wrap(Math.atan2(feet.x - vx, feet.z - VENDOR.z) - s.exitDir * Math.PI / 2) * 0.8 : Math.sin(this.clock * 0.3) * 0.25 }, this.clock);
        if (greeting && this.greeted !== s.index) {
          this.greeted = s.index;
          this.events.say(sv.ambience.vendorHello, 4);
          this.events.speak(sv.ambience.vendorSpoken, 1.15, 1.1);
        }
      } else drawFigure(this.figures, 1, { x: 0, y: -1000, z: 0, yaw: 0, walking: false }, 0);
      if (distance > 12 && this.greeted === s.index) this.greeted = -1;
      // The kiosk clerk, glancing at the queue that is not there.
      const kx = hallX(s, CLERK.a + kioskShift(s.exit.across));
      drawFigure(this.figures, 2, { x: kx, y: s.hall.y, z: CLERK.z, yaw: 0, walking: false, look: Math.hypot(feet.x - kx, feet.z - CLERK.z) < 5 ? wrap(Math.atan2(feet.x - kx, feet.z - CLERK.z)) * 0.7 : Math.sin(this.clock * 0.25) * 0.4 }, this.clock + 5);
      this.figures.instanceMatrix.needsUpdate = true;
    }
    this.breathe(dt, s, camera, cold);
  }

  /** Small clouds of breath: yours, and the vendor's. */
  private breathe(dt: number, s: StationInfo | null, camera: Camera, cold: boolean): void {
    const d = this.puffData, c = this.puffColor, v = this.puffVel, life = this.puffLife;
    if (cold && s) {
      if (this.clock > this.nextBreath) {
        this.nextBreath = this.clock + 3.2 + Math.random() * 1.2;
        const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = Math.min(forward.y, 0.1);
        this.emit(camera.position.clone().addScaledVector(forward, 0.45).add(new Vector3(0, -0.14, 0)), forward);
      }
      if (this.vendorHere && this.clock > this.nextPuff) {
        this.nextPuff = this.clock + 3.6 + Math.random();
        this.emit(new Vector3(hallX(s, VENDOR.a) + s.exitDir * 0.25, s.hall.y + 1.62, VENDOR.z), new Vector3(s.exitDir, 0, 0));
      }
    }
    for (let i = 0; i < PUFFS; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt / 1.6;
      const o = i * 3;
      d[o] += v[o] * dt;
      d[o + 1] += v[o + 1] * dt;
      d[o + 2] += v[o + 2] * dt;
      v[o] *= 1 - dt * 1.5;
      v[o + 2] *= 1 - dt * 1.5;
      c.set([0.93, 0.95, 0.97, Math.max(0, life[i]) * 0.55], i * 4);
      if (life[i] <= 0) d[o + 1] = -1000;
    }
    this.puffs.geometry.attributes.position.needsUpdate = true;
    this.puffs.geometry.attributes.color.needsUpdate = true;
  }

  private emit(at: Vector3, dir: Vector3): void {
    for (let n = 0; n < 5; n++) {
      let i = 0;
      while (i < PUFFS && this.puffLife[i] > 0) i++;
      if (i >= PUFFS) return;
      this.puffLife[i] = 0.8 + Math.random() * 0.2;
      this.puffData.set([at.x, at.y, at.z], i * 3);
      this.puffVel.set([dir.x * (0.35 + Math.random() * 0.3) + (Math.random() - 0.5) * 0.15, 0.08 + Math.random() * 0.1, dir.z * (0.35 + Math.random() * 0.3) + (Math.random() - 0.5) * 0.15], i * 3);
    }
  }
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
