import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  type Scene,
  type Vector3,
} from 'three';
import { holiday, type Holiday, type Occasion } from './calendar';
import { hash01, stockholm } from './clock';
import { LUCIA_STYLE, LUCIA_TUNE, PARTY_STYLE, PARTY_TUNE, sing, STUDENT_STYLE, STUDENT_TUNE } from './choir';
import { drawFigure, figureMesh, paintFigure } from './figures';
import { glowTexture } from './gfx/textures';
import text from './i18n/sv.json';
import { CAVE_HALF_L, PLATFORM_HALF_L, PLATFORM_Y } from './layout';
import { MeshBuilder } from './gfx/builder';
import { rgb } from './gfx/color';
import { propMaterial } from './props';
import { noiseBurst, Spatial, tone, type AudioOut } from './sfx';
import type { Train } from './train';
import type { StationInfo } from './world/station';
import type { Location } from './world/world';
import type { Interactable } from './world/zones';

/**
 * The year's high days, and the nights in between: a Christmas tree in the
 * ticket hall and a paper star in the booth all through advent, a midsummer
 * wreath in June, fireworks heard down the stairs on New Year's Eve, a Lucia
 * procession on the platform on December 13, students in white caps singing
 * in the carriages in early June, and on weekend nights a gang singing on
 * the way home and a lost high-heeled shoe. All of it follows the clock.
 */

const TREE_LIGHTS = 60;
const LUCIA = 7;
/** Seconds between walks of the Lucia procession along the platform. */
const LUCIA_SPEED = 0.45;

const hallX = (s: StationInfo, a: number) => s.cx + s.exitDir * (CAVE_HALF_L + s.escalator.run + a);

export interface FestiveEvents {
  say(message: string, seconds: number): void;
}

/** Whether a train carries a class of singing students in this ten-minute window. Everyone agrees. */
export function studentsAboard(train: number, time: number): boolean {
  return hash01(train * 31 + Math.floor(time / 600), 71) < 0.45;
}

/** Where the Lucia procession is along a platform (x from the station center) at a given time, and which way it walks. */
export function luciaPose(time: number): { x: number; dir: 1 | -1 } {
  const span = (PLATFORM_HALF_L - 14) * 2;
  const travelled = time * LUCIA_SPEED;
  const pass = Math.floor(travelled / span);
  const along = travelled - pass * span;
  const dir: 1 | -1 = pass % 2 === 0 ? 1 : -1;
  return { x: dir > 0 ? -span / 2 + along : span / 2 - along, dir };
}

/** Morning and afternoon processions on Lucia day. */
export function luciaHours(time: number): boolean {
  const c = stockholm(time);
  return c.month === 12 && c.day === 13 && ((c.hours >= 7 && c.hours < 9.5) || (c.hours >= 16 && c.hours < 19));
}

/** The platform with a lost high-heeled shoe on a weekend night and the morning after, if any. */
export function shoeStation(time: number, stations: number): number | null {
  const c = stockholm(time);
  const night = (c.weekday === 6 || c.weekday === 0) && c.hours < 9;
  if (!night) return null;
  return Math.floor(hash01(Math.floor(time / 86400), 73) * stations);
}

function christmasTree(): { group: Group; lights: Points } {
  const group = new Group();
  group.name = 'christmas-tree';
  const green = new MeshLambertMaterial({ color: 0x1f5a32 });
  for (let k = 0; k < 5; k++) {
    const r = 1.25 - k * 0.22;
    const cone = new Mesh(new ConeGeometry(r, 1.1, 12), green);
    cone.position.y = 0.75 + k * 0.62;
    group.add(cone);
  }
  const trunk = new Mesh(new CylinderGeometry(0.1, 0.12, 0.4, 8), new MeshLambertMaterial({ color: 0x5a3b22 }));
  trunk.position.y = 0.2;
  const pot = new Mesh(new CylinderGeometry(0.42, 0.34, 0.45, 14), new MeshLambertMaterial({ color: 0xb3261e }));
  pot.position.y = 0.22;
  group.add(trunk, pot);
  const star = new Mesh(starGeometry(0.22, 0.09), new MeshBasicMaterial({ color: 0xffd65a }));
  star.position.y = 3.75;
  group.add(star);
  // Warm lights spiralling up the branches.
  const positions: number[] = [];
  for (let i = 0; i < TREE_LIGHTS; i++) {
    const t = i / TREE_LIGHTS;
    const y = 0.5 + t * 3.1;
    const r = (1 - t) * 1.25 + 0.08;
    const a = t * Math.PI * 11;
    positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(TREE_LIGHTS * 3), 3).setUsage(DynamicDrawUsage));
  const lights = new Points(geo, new PointsMaterial({ size: 0.28, map: glowTexture(), vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false }));
  group.add(lights);
  return { group, lights };
}

function starGeometry(outer: number, inner: number, points = 5): ShapeGeometry {
  const shape = new Shape();
  for (let k = 0; k <= points * 2; k++) {
    const r = k % 2 ? inner : outer;
    const a = Math.PI / 2 + (k / (points * 2)) * Math.PI * 2;
    if (k === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new ShapeGeometry(shape);
}

function wreath(): Group {
  const group = new Group();
  group.name = 'midsummer-wreath';
  group.add(new Mesh(new TorusGeometry(0.42, 0.07, 8, 28), new MeshLambertMaterial({ color: 0x3d6b2f })));
  const flowers = new InstancedMesh(new SphereGeometry(0.05, 6, 4), new MeshLambertMaterial(), 26);
  const colors = [0xf4f1ea, 0xe63946, 0xf4d35e, 0x4f7cd9, 0xd66ba0];
  const dummy = new Object3D();
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0.06);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, new Color(colors[i % colors.length]));
  }
  group.add(flowers);
  // Ribbons down from the bottom.
  for (const [x, c] of [[-0.06, 0x1d4f9a], [0.06, 0xf4d35e]] as const) {
    const ribbon = new Mesh(new CylinderGeometry(0.012, 0.012, 0.6, 4), new MeshBasicMaterial({ color: c }));
    ribbon.position.set(x, -0.72, 0.04);
    group.add(ribbon);
  }
  return group;
}

/** A red high-heeled shoe, lying on its side. Local origin on the floor. */
function shoeGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  const red = rgb(0xb3162c);
  b.box({ x: -0.12, y: 0, z: -0.035 }, { x: 0.1, y: 0.02, z: 0.035 }, red);
  b.box({ x: 0.04, y: 0.02, z: -0.04 }, { x: 0.12, y: 0.07, z: 0.04 }, red);
  b.box({ x: -0.12, y: 0.02, z: -0.03 }, { x: -0.07, y: 0.07, z: 0.03 }, red);
  b.box({ x: -0.125, y: -0.09, z: -0.008 }, { x: -0.11, y: 0.0, z: 0.008 }, rgb(0x1a1a1a));
  return b.build();
}

export class Festivities {
  readonly interactables: Interactable[] = [];
  private readonly tree: { group: Group; lights: Points };
  private readonly boothStar: Group;
  private readonly wreath = wreath();
  private readonly lucia = figureMesh(LUCIA);
  private readonly candles: Points;
  private readonly hats: Mesh[] = [];
  private readonly shoe: Mesh;
  private readonly students = new Map<Train, ReturnType<typeof figureMesh>>();
  private today: Holiday = { tree: false, wreath: false, fireworks: 0 };
  private clock = 0;
  private hall: StationInfo | null = null;
  private street: Spatial | null = null;
  private choir: Spatial | null = null;
  private gang: Spatial | null = null;
  private gangInside: Spatial | null = null;
  private gangOutside: Spatial | null = null;
  private nextRocket = 0;
  private luciaUntil = 0;
  private luciaSeen = '';
  private studentsUntil = 0;
  private nextGang = 60 + Math.random() * 90;
  private gangUntil = 0;
  private shoeAt: StationInfo | null = null;

  constructor(scene: Scene, private readonly stations: StationInfo[], trains: Train[], private readonly events: FestiveEvents) {
    this.tree = christmasTree();
    this.tree.group.visible = false;
    scene.add(this.tree.group);

    this.boothStar = new Group();
    const paper = new Mesh(starGeometry(0.2, 0.08, 8), new MeshBasicMaterial({ color: 0xffd9a0 }));
    const halo = new Points(new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0.02]), 3)), new PointsMaterial({ size: 0.9, map: glowTexture(), color: 0xffc56b, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false }));
    this.boothStar.add(paper, halo);
    this.boothStar.visible = false;
    scene.add(this.boothStar);

    this.wreath.visible = false;
    scene.add(this.wreath);

    // The Lucia procession: Lucia with a crown of candles, four attendants with candles and two star boys.
    this.lucia.name = 'lucia';
    this.lucia.visible = false;
    for (let i = 0; i < LUCIA; i++) {
      const white = 0xf4f4ef;
      paintFigure(this.lucia, i, { coat: white, torso: i === 0 ? 0xb3261e : white, skin: [0xe8bd9b, 0xdba987, 0x946747][i % 3], hair: i === 0 ? 0x2f5a2f : i < 5 ? 0xd9d4a8 : white, bag: white, trousers: white, shoes: white, prop: 0xf4f1e6, back: 'none', ...(i < 5 ? { build: 'woman' as const, long: i > 0, skirt: white, legs: white } : {}) });
    }
    scene.add(this.lucia);
    const candleGeo = new BufferGeometry();
    candleGeo.setAttribute('position', new BufferAttribute(new Float32Array(9 * 3), 3).setUsage(DynamicDrawUsage));
    this.candles = new Points(candleGeo, new PointsMaterial({ size: 0.22, map: glowTexture(), color: 0xffc56b, transparent: true, blending: AdditiveBlending, depthWrite: false }));
    this.candles.frustumCulled = false;
    this.candles.visible = false;
    scene.add(this.candles);
    for (let i = 0; i < 2; i++) {
      const hat = new Mesh(new ConeGeometry(0.13, 0.55, 12), new MeshLambertMaterial({ color: 0xf4f4ef }));
      hat.visible = false;
      this.hats.push(hat);
      scene.add(hat);
    }

    this.shoe = new Mesh(shoeGeometry(), propMaterial());
    this.shoe.visible = false;
    scene.add(this.shoe);
    this.interactables.push({
      pos: this.shoe.position, radius: 1.3, prompt: text.festive.shoePrompt,
      enabled: () => this.shoe.visible,
      act: () => text.festive.shoe,
    });

    trains.forEach((train) => {
      const mesh = figureMesh(6);
      for (let i = 0; i < 6; i++) paintFigure(mesh, i, { coat: i % 2 ? 0xf2f2ee : 0x1d2230, torso: 0xf2f2ee, skin: [0xdba987, 0x946747, 0xe8bd9b][i % 3], hair: 0xf6f6f2, bag: 0x293338, trousers: i % 2 ? 0xf2f2ee : 0x1d2230, shoes: 0x1c1d20, prop: [0xe63946, 0x3a86ff, 0xf4d35e][i % 3], back: 'none', ...(i % 2 ? { build: 'woman' as const, skirt: 0xf2f2ee, legs: [0xdba987, 0x946747, 0xe8bd9b][i % 3] } : {}) });
      mesh.name = 'students';
      mesh.visible = false;
      train.group.add(mesh);
      this.students.set(train, mesh);
    });
  }

  /**
   * @param here where the listener is
   * @param riding the service index of the train the player rides, with its train, or null
   * @param occasion today's occasion
   */
  update(dt: number, time: number, here: Location, feet: Vector3, trains: Array<{ index: number; train: Train; active: boolean }>, riding: { index: number; train: Train } | null, occasion: Occasion, people: boolean, out: AudioOut | null): void {
    this.clock += dt;
    this.today = holiday(time);
    const station = here.station !== null && here.station < this.stations.length ? this.stations[here.station] : null;
    const inHall = station !== null && (here.area === 'hall' || here.area === 'escalator' || here.area === 'street') && !here.label;
    this.decorate(inHall ? station : null);
    this.fireworks(inHall ? station : null, here, out);
    this.procession(time, station, here, feet, out);
    this.graduation(time, trains, riding, occasion, out);
    this.weekendNight(time, station, here, riding, occasion, people, feet, out);
  }

  /** The tree, the booth star and the wreath follow the player from hall to hall. */
  private decorate(hall: StationInfo | null): void {
    const { tree, wreath } = this.today;
    this.tree.group.visible = tree && hall !== null;
    this.boothStar.visible = tree && hall !== null;
    this.wreath.visible = wreath && hall !== null;
    if (!hall) return;
    if (hall !== this.hall) {
      this.hall = hall;
      this.tree.group.position.set(hallX(hall, 16.4), hall.hall.y, 5.6);
      this.boothStar.position.set(hallX(hall, 12), hall.hall.y + 2.05, 7.72);
      this.boothStar.rotation.y = Math.PI;
      this.wreath.position.set(hallX(hall, 12), hall.hall.y + 2.1, 7.6);
      this.wreath.rotation.y = Math.PI;
    }
    if (this.tree.group.visible) {
      // The lights twinkle, each on its own slow beat.
      const colors = this.tree.lights.geometry.getAttribute('color') as BufferAttribute;
      for (let i = 0; i < TREE_LIGHTS; i++) {
        const k = 0.55 + 0.45 * Math.sin(this.clock * (1.3 + (i % 7) * 0.31) + i * 2.1);
        colors.setXYZ(i, 1 * k, 0.78 * k, 0.45 * k);
      }
      colors.needsUpdate = true;
    }
  }

  /** New Year's Eve: rockets whistle, bang and crackle up on the street. */
  private fireworks(hall: StationInfo | null, here: Location, out: AudioOut | null): void {
    const k = this.today.fireworks;
    const station = here.station !== null ? this.stations[here.station] : null;
    // Heard in the hall and on the escalators, and faintly on the platform below.
    const level = hall ? 1 : station && here.area === 'platform' && !here.label ? 0.25 : 0;
    if (!out || k <= 0 || !station || level <= 0) return;
    this.street ??= new Spatial(out, 5, 1, 120);
    const e = station.exit;
    this.street.setPosition({ x: e.x, y: e.sillY + 3, z: 0 });
    this.street.setLevel(level, 0.3);
    if (this.clock < this.nextRocket) return;
    this.nextRocket = this.clock + (0.4 + Math.random() * 3) / k;
    const dest = this.street.input;
    const delay = 0.9 + Math.random() * 0.6;
    tone(out, dest, 900 + Math.random() * 500, 0.02, delay, { type: 'sine', glideTo: 2600, attack: 0.05 });
    noiseBurst(out, dest, { type: 'lowpass', frequency: 420, volume: 0.6, attack: 0.005, decay: 0.9, delay, color: 'brown' });
    for (let c = 0; c < 12; c++) noiseBurst(out, dest, { type: 'highpass', frequency: 3000, volume: 0.05 + Math.random() * 0.05, decay: 0.03, delay: delay + 0.15 + Math.random() * 0.9 });
  }

  /** December 13: a Lucia procession walks the platform, singing, with candles. */
  private procession(time: number, station: StationInfo | null, here: Location, feet: Vector3, out: AudioOut | null): void {
    const on = luciaHours(time) && station !== null && (here.area === 'platform' || here.area === 'track') && !here.label;
    this.lucia.visible = on;
    this.candles.visible = on;
    for (const hat of this.hats) hat.visible = on;
    if (!on || !station) {
      this.choir?.setLevel(0, 0.5);
      return;
    }
    const { x, dir } = luciaPose(time);
    const positions = this.candles.geometry.getAttribute('position') as BufferAttribute;
    let candle = 0;
    for (let i = 0; i < LUCIA; i++) {
      // Lucia leads; the attendants follow in pairs, and the star boys walk last.
      const row = i === 0 ? 0 : Math.ceil(i / 2);
      const side = i === 0 ? 0 : i % 2 ? -0.4 : 0.4;
      const px = station.cx + x - dir * row * 1.3;
      const pz = 1.9 + side;
      const yaw = dir * Math.PI / 2;
      const star = i >= 5;
      drawFigure(this.lucia, i, { x: px, z: pz, yaw, walking: true, carry: star ? undefined : i > 0 ? 'candle' : undefined, scale: i === 0 ? 0.98 : 0.92 }, this.clock * 0.5 + i);
      if (i === 0) {
        // The crown: candles in a ring above her head.
        for (let c = 0; c < 5; c++) {
          const a = (c / 5) * Math.PI * 2;
          positions.setXYZ(candle++, px + Math.cos(a) * 0.14, PLATFORM_Y + 1.92, pz + Math.sin(a) * 0.14);
        }
      } else if (!star) {
        const hand = dir * 0.1;
        positions.setXYZ(candle++, px + hand + Math.sin(yaw) * 0.45, PLATFORM_Y + 1.18, pz + (i % 2 ? -0.25 : 0.25));
      } else {
        this.hats[i - 5].position.set(px, PLATFORM_Y + 1.98, pz);
      }
    }
    positions.needsUpdate = true;
    this.lucia.instanceMatrix.needsUpdate = true;
    const key = `${stockholm(time).hour < 12 ? 'am' : 'pm'}:${station.index}`;
    if (this.luciaSeen !== key && Math.abs(station.cx + x - feet.x) < 50) {
      this.luciaSeen = key;
      this.events.say(text.festive.lucia, 6);
    }
    if (!out) return;
    this.choir ??= new Spatial(out, 4, 1.1, 80);
    this.choir.setPosition({ x: station.cx + x - dir * 2, y: PLATFORM_Y + 1.6, z: 1.9 });
    this.choir.setLevel(1, 0.5);
    if (this.clock > this.luciaUntil) this.luciaUntil = this.clock + sing(out, this.choir.input, LUCIA_TUNE, LUCIA_STYLE, 0.2) + 2;
  }

  /** Early June: students in white caps sing, jump and wave in some of the carriages. */
  private graduation(time: number, trains: Array<{ index: number; train: Train; active: boolean }>, riding: { index: number; train: Train } | null, occasion: Occasion, out: AudioOut | null): void {
    const on = occasion === 'graduation';
    for (const { index, train, active } of trains) {
      const mesh = this.students.get(train);
      if (!mesh) continue;
      mesh.visible = on && active && studentsAboard(index, time);
      if (!mesh.visible) continue;
      for (let i = 0; i < 6; i++) {
        const bounce = Math.max(0, Math.sin(this.clock * 5 + i * 1.3)) * 0.12;
        drawFigure(mesh, i, { x: -3.2 + (i % 3) * 1.4, z: i < 3 ? 0.18 : -0.2, y: PLATFORM_Y + bounce, yaw: i < 3 ? Math.PI : 0, walking: false, arm: i % 2 ? 'wave' : undefined, carry: i % 2 ? undefined : 'balloon' }, this.clock + i);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    const singing = on && riding && studentsAboard(riding.index, time);
    if (!singing || !out) return;
    if (this.clock > this.studentsUntil) {
      if (this.studentsUntil === 0) this.events.say(text.festive.students, 5);
      this.studentsUntil = this.clock + sing(out, out.cabin, STUDENT_TUNE, STUDENT_STYLE, 0.3) + 4 + Math.random() * 6;
      // A cheer at the end.
      noiseBurst(out, out.cabin, { type: 'bandpass', frequency: 1400, q: 0.8, volume: 0.12, attack: 0.1, decay: 1.4, delay: this.studentsUntil - this.clock - 3.5, color: 'pink' });
    }
  }

  /** Weekend nights: now and then a gang sings on the way home, and there is a lost shoe on one platform. */
  private weekendNight(time: number, station: StationInfo | null, here: Location, riding: { index: number; train: Train } | null, occasion: Occasion, people: boolean, feet: Vector3, out: AudioOut | null): void {
    const shoe = shoeStation(time, this.stations.length);
    const at = shoe !== null ? this.stations[shoe] : null;
    if (at !== this.shoeAt) {
      this.shoeAt = at;
      if (at) {
        const x = at.cx + (hash01(shoe!, 74) - 0.5) * 90;
        this.shoe.position.set(x, PLATFORM_Y + 0.035, (hash01(shoe!, 75) < 0.5 ? -1 : 1) * 2.8);
        this.shoe.rotation.set(Math.PI / 2 - 0.2, hash01(shoe!, 76) * 6, 0);
      }
    }
    this.shoe.visible = at !== null && Math.abs(at.cx - feet.x) < 200;
    const among = people && occasion === 'party' && ((station !== null && here.area === 'platform') || riding !== null);
    if (!among || !out) return;
    if (this.clock > this.gangUntil && this.clock > this.nextGang) {
      this.gang = riding ? (this.gangInside ??= new Spatial(out, 3, 1.2, 60, true)) : (this.gangOutside ??= new Spatial(out, 3, 1.2, 60));
      this.gang.setPosition({ x: feet.x + (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 10), y: feet.y + 1.5, z: feet.z + (Math.random() - 0.5) * 3 });
      this.gang.setLevel(1, 0.05);
      const length = sing(out, this.gang.input, PARTY_TUNE, PARTY_STYLE, 0.1);
      // Someone whoops halfway through.
      noiseBurst(out, this.gang.input, { type: 'bandpass', frequency: 1100, sweepTo: 1800, q: 4, volume: 0.25, attack: 0.05, decay: 0.5, delay: length * 0.55 });
      this.gangUntil = this.clock + length;
      this.nextGang = this.gangUntil + 100 + Math.random() * 120;
      this.events.say(text.festive.party, 5);
    }
  }
}
