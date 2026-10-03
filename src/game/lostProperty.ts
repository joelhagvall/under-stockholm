import { AdditiveBlending, BufferAttribute, BufferGeometry, CylinderGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector3, type Camera, type Scene } from 'three';
import { dayNumber } from './calendar';
import { hash01 } from './clock';
import { MeshBuilder } from './gfx/builder';
import { rgb } from './gfx/color';
import { glowTexture } from './gfx/textures';
import { text } from './i18n/text';
import { PLATFORM_Y } from './layout';
import { propMaterial } from './props';
import { Spatial, tone, type AudioOut } from './sfx';
import { benchXs, PILLAR_DXS, type StationInfo } from './world/station';
import type { Interactable } from './world/zones';

/**
 * Things people leave behind: a mitten on a bench, keys by a pillar, a
 * teddy bear by the gates, and somewhere each day a phone ringing on a bench
 * that you can answer. Every station has a couple of things lying about,
 * the same for everyone on a given day. What you pick up flies up in front of
 * you, turns once and goes into your bag (`bag.ts`), which holds a few things:
 * hand them in at the booth in any ticket hall for a finder's reward on the
 * card. Every kind you have found counts toward your collection.
 */

type Kind = keyof typeof text.lost.items;
const KINDS = Object.keys(text.lost.items) as Kind[];
const PER_STATION = 3;
const FOUND_KEY = 'under-stockholm:found';
/** How many things the bag holds before it has to be emptied at a booth. */
export const BAG_SIZE = 5;
/** Every kind of thing there is to find, the phone last. */
export const LOST_KINDS: Array<Kind | 'phone'> = [...KINDS, 'phone'];
/** The finder's reward per thing, in kronor. */
const REWARD: Record<Kind | 'phone', number> = { mitten: 10, keys: 40, umbrella: 20, teddy: 30, book: 15, sunglasses: 35, scarf: 15, hat: 15, lunchbox: 10, phone: 80 };
/** Once, for having found every kind. */
const COLLECTION_BONUS = 150;
/** The pick-up: rise off the ground, fly to the eye, turn there, then shrink into the bag. Seconds. */
const RISE = 0.16;
const FLY = 0.46;
const HOLD = 0.95;
const STOW = 1.05;

interface Spot { at: Vector3; yaw: number; place: 'bench' | 'floor' | 'hall' }
interface Item { station: number; slot: number; kind: Kind | 'phone'; spot: Spot }

const box = (b: MeshBuilder, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number) =>
  b.box({ x: x0, y: y0, z: z0 }, { x: x1, y: y1, z: z1 }, rgb(color), [], 10);

function geometryFor(kind: Kind | 'phone'): BufferGeometry {
  const b = new MeshBuilder();
  switch (kind) {
    case 'mitten':
      box(b, -0.08, 0.08, 0, 0.035, -0.06, 0.06, 0x2f5fa8);
      box(b, 0.02, 0.07, 0, 0.03, 0.06, 0.09, 0x2f5fa8);
      box(b, -0.12, -0.08, 0, 0.04, -0.065, 0.065, 0xe8e4d8);
      break;
    case 'keys': {
      const ring = new TorusGeometry(0.025, 0.004, 6, 16);
      b.geometry(ring, new Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.005, 0), rgb(0xb8bdc2));
      ring.dispose();
      box(b, 0.02, 0.08, 0, 0.004, -0.008, 0.008, 0xc9a44a);
      box(b, -0.07, -0.02, 0, 0.004, 0.01, 0.024, 0xb8bdc2);
      box(b, -0.03, 0.01, 0, 0.012, -0.05, -0.02, 0xd7263d);
      break;
    }
    case 'umbrella': {
      const shaft = new CylinderGeometry(0.035, 0.012, 0.8, 8);
      b.geometry(shaft, new Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, 0.035, 0), rgb(0x1d2230));
      shaft.dispose();
      box(b, -0.46, -0.4, 0, 0.06, -0.015, 0.015, 0x5a3b22);
      break;
    }
    case 'teddy': {
      const body = new SphereGeometry(0.09, 10, 8);
      b.geometry(body, new Matrix4().makeScale(1, 1.2, 0.9).setPosition(0, 0.1, 0), rgb(0xa9784a));
      body.dispose();
      const head = new SphereGeometry(0.07, 10, 8);
      b.geometry(head, new Matrix4().setPosition(0, 0.25, 0), rgb(0xb5845a));
      head.dispose();
      for (const z of [-0.05, 0.05]) {
        const ear = new SphereGeometry(0.025, 6, 5);
        b.geometry(ear, new Matrix4().setPosition(0, 0.31, z), rgb(0x8a5f3a));
        ear.dispose();
      }
      box(b, 0.06, 0.075, 0.24, 0.26, -0.012, 0.012, 0x1a1a1a);
      break;
    }
    case 'book':
      box(b, -0.1, 0.1, 0, 0.03, -0.07, 0.07, 0x8a2f2f);
      box(b, -0.095, 0.095, 0.003, 0.027, -0.068, 0.07, 0xf1ecd9);
      break;
    case 'sunglasses':
      for (const z of [-0.035, 0.035]) box(b, -0.02, 0.02, 0, 0.012, z - 0.028, z + 0.028, 0x111418);
      box(b, -0.005, 0.005, 0.004, 0.012, -0.01, 0.01, 0x2b2b2b);
      box(b, -0.09, -0.02, 0.004, 0.008, -0.07, -0.062, 0x2b2b2b);
      box(b, -0.09, -0.02, 0.004, 0.008, 0.062, 0.07, 0x2b2b2b);
      break;
    case 'scarf':
      for (let k = 0; k < 6; k++) box(b, -0.3 + k * 0.1, -0.2 + k * 0.1, 0, 0.02, -0.08 + (k % 2) * 0.02, 0.08 + (k % 2) * 0.02, k % 2 ? 0xc0392b : 0xe9e4d6);
      break;
    case 'hat': {
      const hat = new SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      b.geometry(hat, new Matrix4().makeScale(1, 0.9, 1), rgb(0x2f5a44));
      hat.dispose();
      const pom = new SphereGeometry(0.035, 8, 6);
      b.geometry(pom, new Matrix4().setPosition(0, 0.1, 0), rgb(0xe9e4d6));
      pom.dispose();
      break;
    }
    case 'lunchbox':
      box(b, -0.1, 0.1, 0, 0.07, -0.07, 0.07, 0x3a86ff);
      box(b, -0.1, 0.1, 0.07, 0.085, -0.07, 0.07, 0x1f4a99);
      break;
    case 'phone':
      box(b, -0.075, 0.075, 0, 0.009, -0.036, 0.036, 0x16181b);
      break;
  }
  return b.build();
}

/** What lies where today: a few things per station, and one ringing phone on the whole line. */
export function lostToday(day: number, stations: number): Array<{ station: number; slot: number; kind: Kind | 'phone'; place: Spot['place']; seed: number }> {
  const out: Array<{ station: number; slot: number; kind: Kind | 'phone'; place: Spot['place']; seed: number }> = [];
  const phone = Math.floor(hash01(day, 81) * stations);
  for (let station = 0; station < stations; station++) {
    for (let slot = 0; slot < PER_STATION; slot++) {
      const seed = Math.floor(hash01(day * 97 + station * 13 + slot, 82) * 1e6);
      const kind = station === phone && slot === 0 ? 'phone' : KINDS[seed % KINDS.length];
      const place = kind === 'phone' || slot === 0 ? 'bench' : slot === 1 ? 'floor' : 'hall';
      out.push({ station, slot, kind, place, seed });
    }
  }
  return out;
}

interface Found {
  day: number;
  keys: string[];
  total: number;
  kinds: string[];
  /** Picked up and not handed in yet. */
  bag: string[];
  /** The collection bonus has been paid. */
  complete: boolean;
}

function loadFound(): Found {
  try {
    const saved = JSON.parse(localStorage.getItem(FOUND_KEY) ?? 'null');
    if (saved && Array.isArray(saved.keys)) {
      const bag = Array.isArray(saved.bag) ? (saved.bag as string[]).filter((k) => (LOST_KINDS as string[]).includes(k)).slice(0, BAG_SIZE) : [];
      return { ...saved, kinds: Array.isArray(saved.kinds) ? saved.kinds : [], bag, complete: saved.complete === true };
    }
  } catch { /* Storage can be disabled. */ }
  return { day: -1, keys: [], total: 0, kinds: [], bag: [], complete: false };
}

export interface LostEvents {
  say(message: string, seconds: number): void;
  notice(title: string, body: string, seconds: number): void;
  /** A thing has gone into the bag; `fresh` if it is the first of its kind. */
  pocketed(kind: string, fresh: boolean): void;
  /** Everything was handed in at a booth, for this reward. */
  handedIn(reward: number): void;
  /** The player tried to pick something up with a full bag. */
  full(): void;
}

/** A thing on its way from the floor into the bag. */
interface Flight { mesh: Mesh; from: Vector3; turn: Quaternion; t: number; kind: Kind | 'phone'; fresh: boolean; size: number }

export class LostProperty {
  readonly interactables: Interactable[] = [];
  private readonly group = new Group();
  private readonly geometries = new Map<string, BufferGeometry>();
  private readonly items: Item[] = [];
  private readonly meshes = new Map<Item, Mesh>();
  private readonly found = loadFound();
  private day = -1;
  private clock = 0;
  private ring: Spatial | null = null;
  private readonly screen: Mesh;
  private readonly glow: Points;
  private answered = false;
  private out: AudioOut | null = null;
  private lastBeat = -1;
  private noticed = false;
  /** Handing in at the booths, ahead of topping up the card there (see `boot.ts`). */
  readonly booths: Interactable[] = [];
  private flight: Flight | null = null;
  /** The glow behind a thing held up to the eye. */
  private readonly halo: Points;
  private readonly held = new Vector3();
  private readonly towards = new Quaternion();
  private readonly tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.95);
  private readonly spin = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);

  constructor(scene: Scene, private readonly stations: StationInfo[], private readonly events: LostEvents) {
    this.group.name = 'lost-property';
    scene.add(this.group);
    this.screen = new Mesh(new PlaneGeometry(0.13, 0.06), new MeshBasicMaterial({ color: 0x9fd0ff }));
    this.screen.rotation.x = -Math.PI / 2;
    this.screen.visible = false;
    scene.add(this.screen);
    const geo = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
    this.glow = new Points(geo, new PointsMaterial({ size: 0.7, map: glowTexture(), color: 0x7fb8ff, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }));
    this.glow.visible = false;
    scene.add(this.glow);
    const haloGeo = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
    this.halo = new Points(haloGeo, new PointsMaterial({ size: 0.55, map: glowTexture(), color: 0xffd27a, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
    this.halo.visible = false;
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 1;
    scene.add(this.halo);
    // The prompts are getters, which have their own `this`.
    const owner = this;
    for (const s of stations) {
      for (let slot = 0; slot < PER_STATION; slot++) {
        const item: Item = { station: s.index, slot, kind: 'mitten', spot: { at: new Vector3(), yaw: 0, place: 'bench' } };
        this.items.push(item);
        this.interactables.push({
          pos: item.spot.at, radius: 1.3,
          get prompt() { return item.kind === 'phone' && owner.phoneRinging() ? text.lost.phonePrompt : owner.found.bag.length >= BAG_SIZE ? text.lost.fullPrompt : `E · ${text.lost.take} ${owner.thing(item)[1]}`; },
          enabled: () => this.present(item),
          act: () => this.take(item),
        });
      }
      // The staffed booth by the gates, where the top-up is (`fares.ts`).
      const line = s.gates;
      const booth = new Vector3(line.unpaidX - Math.sign(line.paidX - line.unpaidX) * 1.5, line.y + 1, 8.3);
      this.booths.push({
        pos: booth, radius: 1.3,
        get prompt() { return text.lost.handInPrompt.replace('{count}', String(owner.found.bag.length)); },
        enabled: () => this.found.bag.length > 0,
        act: () => this.handIn(),
      });
    }
  }

  /** Every kind found so far, over all days. */
  get kinds(): string[] {
    return this.found.kinds;
  }

  /** What is in the bag now. */
  get carried(): string[] {
    return this.found.bag;
  }

  /** The model of a kind of thing, made once and kept. */
  geometry(kind: Kind | 'phone'): BufferGeometry {
    let geo = this.geometries.get(kind);
    if (!geo) { geo = geometryFor(kind); this.geometries.set(kind, geo); }
    return geo;
  }

  /** A kind of thing, named in the world's Swedish. */
  nameOf(kind: string): string {
    return kind === 'phone' ? text.lost.phoneName : text.lost.items[kind as Kind]?.[0] ?? kind;
  }

  /** A thing's name: with the indefinite and the definite article. */
  private thing(item: Item): string[] {
    return item.kind === 'phone' ? [text.lost.phoneName, text.lost.phoneDefinite] : text.lost.items[item.kind];
  }

  private save(): void {
    try { localStorage.setItem(FOUND_KEY, JSON.stringify(this.found)); } catch { /* Session only. */ }
  }

  /** Items picked up so far, over all days. */
  get total(): number {
    return this.found.total;
  }

  private key(item: Item): string {
    return `${this.day}:${item.station}:${item.slot}`;
  }

  private present(item: Item): boolean {
    return !this.found.keys.includes(this.key(item));
  }

  private phoneRinging(): boolean {
    return !this.answered && this.clock % 45 < 12;
  }

  private take(item: Item): string {
    if (item.kind === 'phone' && this.phoneRinging()) {
      this.answered = true;
      return text.lost.phoneAnswer;
    }
    if (this.found.bag.length >= BAG_SIZE) {
      this.events.full();
      return text.lost.full;
    }
    if (this.found.day !== this.day) { this.found.day = this.day; this.found.keys = []; }
    this.found.keys.push(this.key(item));
    this.found.total++;
    const fresh = !this.found.kinds.includes(item.kind);
    if (fresh) this.found.kinds.push(item.kind);
    this.found.bag.push(item.kind);
    this.save();
    const mesh = this.meshes.get(item);
    if (mesh) mesh.visible = false;
    this.lift(item, fresh);
    const taken = text.lost.taken.replace('{item}', this.thing(item)[0]);
    // The very first find says where it goes.
    return this.found.total === 1 ? `${taken} ${text.lost.bagHint}` : taken;
  }

  /** The thing leaves the floor for the bag. One at a time: a second find finishes the first at once. */
  private lift(item: Item, fresh: boolean): void {
    if (this.flight) this.stow(this.flight);
    const geo = this.geometry(item.kind);
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const mesh = new Mesh(geo, propMaterial());
    mesh.position.copy(item.spot.at);
    mesh.rotation.y = item.spot.yaw;
    this.group.add(mesh);
    this.flight = { mesh, from: item.spot.at.clone(), turn: mesh.quaternion.clone(), t: 0, kind: item.kind, fresh, size: geo.boundingSphere!.radius };
    const out = this.out;
    // A little rising arpeggio as it jumps up.
    if (out) [72, 76, 79, 84].forEach((n, i) => tone(out, out.cabin, 440 * 2 ** ((n - 69) / 12), 0.05, 0.22, { type: 'triangle', delay: i * 0.055 }));
  }

  /** Where the flying thing is, `t` seconds after it was picked up. */
  private fly(dt: number, camera: Camera | null): void {
    const f = this.flight!;
    f.t += dt;
    if (!camera || f.t >= STOW) { this.stow(f); return; }
    const { mesh } = f;
    // Held about half a metre in front of the eye, small things made bigger and big ones smaller.
    const fit = Math.min(1.8, 0.085 / Math.max(0.02, f.size));
    camera.localToWorld(this.held.set(0, -0.03, -0.55));
    this.towards.copy(camera.quaternion).multiply(this.tilt).multiply(this.spin.setFromAxisAngle(this.up, f.t * 5));
    const ease = (x: number) => x * x * (3 - 2 * x);
    let glow = 0;
    if (f.t < RISE) {
      // A hop off the floor with a quick turn.
      const k = f.t / RISE;
      mesh.position.copy(f.from).setY(f.from.y + Math.sin(k * Math.PI / 2) * 0.28);
      mesh.quaternion.copy(f.turn).multiply(this.spin.setFromAxisAngle(this.up, k * 2));
    } else if (f.t < FLY) {
      // An arc up to the eye, turning to show its face.
      const k = ease((f.t - RISE) / (FLY - RISE));
      const sx = f.from.x, sy = f.from.y + 0.28, sz = f.from.z;
      const cx = (sx + this.held.x) / 2, cy = Math.max(sy, this.held.y) + 0.35, cz = (sz + this.held.z) / 2;
      const a = (1 - k) * (1 - k), b = 2 * k * (1 - k), c = k * k;
      mesh.position.set(a * sx + b * cx + c * this.held.x, a * sy + b * cy + c * this.held.y, a * sz + b * cz + c * this.held.z);
      mesh.quaternion.copy(f.turn).slerp(this.towards, k);
      mesh.scale.setScalar(1 + (fit - 1) * k);
      glow = k;
    } else if (f.t < HOLD) {
      // Held up and turning, with a glow behind it.
      const k = (f.t - FLY) / (HOLD - FLY);
      mesh.position.copy(this.held).addScaledVector(this.up, Math.sin(k * Math.PI) * 0.012);
      mesh.quaternion.copy(this.towards);
      mesh.scale.setScalar(fit * (1 + Math.sin(k * Math.PI) * 0.08));
      glow = 1;
    } else {
      // It shrinks away, and its picture flies on into the bag on the HUD.
      const k = ease((f.t - HOLD) / (STOW - HOLD));
      mesh.position.copy(this.held);
      mesh.quaternion.copy(this.towards);
      mesh.scale.setScalar(Math.max(0.001, fit * (1 - k)));
      glow = 1 - k;
    }
    const material = this.halo.material as PointsMaterial;
    material.opacity = glow * 0.85;
    this.halo.visible = glow > 0.01;
    if (this.halo.visible) {
      camera.localToWorld(this.held.set(0, -0.03, -0.75));
      (this.halo.geometry.getAttribute('position') as BufferAttribute).setXYZ(0, this.held.x, this.held.y, this.held.z);
      this.halo.geometry.getAttribute('position').needsUpdate = true;
    }
  }

  /** The flight ends: the thing is in the bag. */
  private stow(f: Flight): void {
    this.flight = null;
    this.group.remove(f.mesh);
    this.halo.visible = false;
    this.events.pocketed(f.kind, f.fresh);
    const out = this.out;
    // A soft thump into the bag.
    if (out) {
      tone(out, out.cabin, 180, 0.08, 0.12, { glideTo: 90 });
      tone(out, out.cabin, 1568, 0.025, 0.18, { type: 'sine', delay: 0.05 });
    }
  }

  /** Everything in the bag goes over the counter, for a finder's reward on the card. */
  private handIn(): string | void {
    const bag = this.found.bag;
    if (!bag.length) return;
    if (this.flight) this.stow(this.flight);
    const count = bag.length;
    let reward = bag.reduce((sum, kind) => sum + (REWARD[kind as Kind | 'phone'] ?? 5), 0);
    this.found.bag = [];
    const complete = !this.found.complete && LOST_KINDS.every((kind) => this.found.kinds.includes(kind));
    if (complete) { this.found.complete = true; reward += COLLECTION_BONUS; }
    this.save();
    this.events.handedIn(reward);
    const out = this.out;
    // Coins on the counter, one for each thing.
    if (out) for (let i = 0; i < count; i++) {
      tone(out, out.cabin, 1976, 0.035, 0.12, { type: 'square', delay: 0.12 + i * 0.11 });
      tone(out, out.cabin, 2637, 0.03, 0.3, { type: 'sine', delay: 0.16 + i * 0.11 });
    }
    const things = count === 1 ? text.lost.one : text.lost.many.replace('{count}', String(count));
    this.events.notice(text.lost.handedTitle, text.lost.handedIn.replace('{things}', things).replace('{reward}', String(reward - (complete ? COLLECTION_BONUS : 0))), 5);
    if (complete) window.setTimeout(() => this.events.notice(text.lost.completeTitle, text.lost.complete.replace('{bonus}', String(COLLECTION_BONUS)), 6), 5200);
  }

  /** Lays out today's things when the day changes. */
  setDay(epoch: number): void {
    const day = dayNumber(epoch);
    if (day === this.day) return;
    this.day = day;
    this.answered = false;
    for (const mesh of this.meshes.values()) this.group.remove(mesh);
    this.meshes.clear();
    lostToday(day, this.stations.length).forEach((plan, i) => {
      const item = this.items[i];
      item.kind = plan.kind;
      const s = this.stations[plan.station];
      const r = (k: number) => hash01(plan.seed, k);
      let at: Vector3;
      if (plan.place === 'bench') {
        const benches = benchXs(s.cx);
        at = new Vector3(benches[Math.floor(r(1) * benches.length)] + (r(2) - 0.5) * 1.6, PLATFORM_Y + 0.5, (r(3) < 0.5 ? -1 : 1) * 0.3);
      } else if (plan.place === 'floor') {
        const pillar = PILLAR_DXS[Math.floor(r(1) * PILLAR_DXS.length)];
        at = new Vector3(s.cx + pillar + (r(2) < 0.5 ? -1 : 1) * (0.5 + r(4) * 0.4), PLATFORM_Y + 0.005, s.platforms[s.platforms.length - 1] + (r(3) - 0.5) * 1.2);
      } else {
        const a = 13.5 + r(1) * 4;
        at = new Vector3(s.hallX(a), s.hall.y + 0.005, (r(3) - 0.5) * 10);
      }
      item.spot.at.copy(at);
      item.spot.yaw = r(5) * Math.PI * 2;
      item.spot.place = plan.place;
    });
  }

  /** @param camera the player's eye, which things fly up to when picked up */
  update(dt: number, feet: Vector3, out: AudioOut | null, camera: Camera | null = null): void {
    this.clock += dt;
    this.out = out;
    if (this.flight) this.fly(dt, camera);
    let phone: Item | null = null;
    for (const item of this.items) {
      const near = Math.abs(item.spot.at.x - feet.x) < 160 && Math.abs(item.spot.at.y - feet.y) < 20;
      let mesh = this.meshes.get(item);
      if (near && !mesh) {
        mesh = new Mesh(this.geometry(item.kind), propMaterial());
        mesh.position.copy(item.spot.at);
        mesh.rotation.y = item.spot.yaw;
        this.group.add(mesh);
        this.meshes.set(item, mesh);
      }
      if (mesh) mesh.visible = near && this.present(item);
      if (item.kind === 'phone' && mesh?.visible) phone = item;
    }
    this.updatePhone(phone, feet);
  }

  /** The phone buzzes and plays its tune now and then, its screen lighting the bench. */
  private updatePhone(phone: Item | null, feet: Vector3): void {
    const ringing = phone !== null && this.phoneRinging();
    this.screen.visible = ringing;
    this.glow.visible = ringing;
    if (!phone || !ringing) { this.ring?.setLevel(0, 0.05); return; }
    const at = phone.spot.at;
    if (!this.noticed && Math.hypot(at.x - feet.x, at.z - feet.z) < 9) {
      this.noticed = true;
      this.events.say(text.lost.ringing, 4);
    }
    this.screen.position.set(at.x, at.y + 0.011, at.z);
    this.screen.rotation.z = phone.spot.yaw;
    (this.glow.geometry.getAttribute('position') as BufferAttribute).setXYZ(0, at.x, at.y + 0.05, at.z);
    this.glow.geometry.getAttribute('position').needsUpdate = true;
    const out = this.out;
    if (!out) return;
    if (!this.ring) this.ring = new Spatial(out, 1.5, 1.5, 35);
    this.ring.setPosition({ x: at.x, y: at.y + 0.1, z: at.z });
    this.ring.setLevel(Math.hypot(at.x - feet.x, at.z - feet.z) < 40 ? 1 : 0, 0.05);
    // A little marimba tune, twice a ring.
    const beat = Math.floor((this.clock % 45) / 0.18);
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      const tuneNotes = [76, 79, 84, 79, 81, 0, 76, 0, 76, 79, 84, 88, 86, 0, 0, 0];
      const n = tuneNotes[beat % tuneNotes.length];
      if (n) tone(out, this.ring.input, 440 * 2 ** ((n - 69) / 12), 0.05, 0.16, { type: 'sine' });
    }
  }
}
