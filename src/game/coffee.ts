import { AdditiveBlending, BufferAttribute, BufferGeometry, CylinderGeometry, DynamicDrawUsage, Group, Mesh, MeshBasicMaterial, Points, PointsMaterial, Vector3, type PerspectiveCamera, type Scene } from 'three';
import { serviceOpen, stockholm } from './clock';
import { glowTexture } from './gfx/textures';
import text from './i18n/sv.json';
import { beep, type AudioOut } from './sfx';
import { KIOSK } from './world/kiosk';
import type { StationInfo } from './world/station';
import type { Interactable } from './world/zones';
import { era } from './era';

/**
 * Coffee and a cinnamon bun from the kiosk. The bun is gone in three bites;
 * the coffee you carry with you for a while, its steam rising in the cold
 * air of the hall and curling away as you walk.
 */

/** Coffee and a bun, and what it cost in the time machine's 1975. */
const PRICE = 45;
const PRICE_1975 = 3;
const STEAM = 40;
const CUP_SECONDS = 150;

export class Coffee {
  readonly interactables: Interactable[] = [];
  private readonly cup = new Group();
  private readonly steam: Points;
  private readonly steamData = new Float32Array(STEAM * 3);
  private readonly steamLife = new Float32Array(STEAM);
  private left = 0;
  private now = 0;
  private out: AudioOut | null = null;
  private readonly world = new Vector3();

  constructor(scene: Scene, camera: PerspectiveCamera, stations: StationInfo[], private readonly pay: (amount: number) => boolean, private readonly say: (message: string, seconds: number) => void) {
    // A paper cup with a lid and a sleeve, held low on the right.
    const paper = new Mesh(new CylinderGeometry(0.042, 0.033, 0.11, 16), new MeshBasicMaterial({ color: 0xe9e4da }));
    const sleeve = new Mesh(new CylinderGeometry(0.0425, 0.037, 0.045, 16), new MeshBasicMaterial({ color: 0xb3162c }));
    sleeve.position.y = -0.005;
    const lid = new Mesh(new CylinderGeometry(0.044, 0.044, 0.012, 16), new MeshBasicMaterial({ color: 0x2b2d31 }));
    lid.position.y = 0.06;
    this.cup.add(paper, sleeve, lid);
    this.cup.position.set(0.19, -0.2, -0.42);
    this.cup.rotation.x = 0.15;
    this.cup.visible = false;
    camera.add(this.cup);
    if (!camera.parent) scene.add(camera);

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.steamData, 3).setUsage(DynamicDrawUsage));
    this.steam = new Points(geo, new PointsMaterial({ size: 0.05, map: glowTexture(), color: 0xf2f4f6, transparent: true, opacity: 0.35, depthWrite: false, blending: AdditiveBlending }));
    this.steam.frustumCulled = false;
    this.steam.visible = false;
    scene.add(this.steam);
    for (let i = 0; i < STEAM; i++) this.steamData[i * 3 + 1] = -1000;

    for (const s of stations) {
      const x = s.hallX((KIOSK.a0 + KIOSK.a1) / 2);
      this.interactables.push({
        pos: new Vector3(x, s.hall.y + 1, KIOSK.counterZ + 0.4), radius: 1.8,
        get prompt() { return era.past ? text.kiosk.prompt1975 : text.kiosk.prompt; },
        enabled: () => Coffee.open(this.now),
        act: () => this.buy(),
      });
    }
  }

  /** The kiosk opens early for the morning commute and closes late. */
  static open(epoch: number): boolean {
    const h = stockholm(epoch).hours;
    return serviceOpen(epoch) && h >= 6 && h < 23;
  }

  private buy(): string {
    if (this.left > 0) return text.kiosk.already;
    if (!this.pay(era.past ? PRICE_1975 : PRICE)) {
      if (this.out) beep(this.out, false);
      return text.kiosk.broke;
    }
    if (this.out) beep(this.out, true);
    this.left = CUP_SECONDS;
    return era.past ? text.kiosk.bought1975 : text.kiosk.bought;
  }

  update(dt: number, time: number, out: AudioOut | null): void {
    this.now = time;
    this.out = out;
    const had = this.left > 0;
    this.left = Math.max(0, this.left - dt);
    this.cup.visible = this.left > 0;
    this.steam.visible = this.left > 0;
    if (had && this.left === 0) this.say(text.kiosk.empty, 3);
    if (this.left <= 0) return;
    // Steam rises from the lid in world space, so it trails behind as you walk.
    this.cup.getWorldPosition(this.world);
    const d = this.steamData;
    const warm = Math.min(1, this.left / 60);
    for (let i = 0; i < STEAM; i++) {
      this.steamLife[i] -= dt;
      const o = i * 3;
      if (this.steamLife[i] <= 0) {
        if (Math.random() > warm * 0.5) { d[o + 1] = -1000; continue; }
        this.steamLife[i] = 1 + Math.random() * 0.8;
        d[o] = this.world.x + (Math.random() - 0.5) * 0.03;
        d[o + 1] = this.world.y + 0.07;
        d[o + 2] = this.world.z + (Math.random() - 0.5) * 0.03;
        continue;
      }
      d[o] += Math.sin(time * 2 + i) * 0.03 * dt;
      d[o + 1] += (0.12 + Math.random() * 0.05) * dt;
      d[o + 2] += Math.cos(time * 1.7 + i) * 0.03 * dt;
    }
    (this.steam.material as PointsMaterial).opacity = 0.35 * warm;
    this.steam.geometry.attributes.position.needsUpdate = true;
  }
}
