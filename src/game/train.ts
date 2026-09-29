import type RAPIER from '@dimforge/rapier3d';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { createCanvasSign, fitText, FONT, MONO, redraw, signMesh, type CanvasSign } from './gfx/signs';
import { detailTexture, doorLeafTexture } from './gfx/textures';
import { CAB_DEPTH, CABIN_DESIGN as I, DOOR_HALF_W, DOOR_TOP, TRAIN_ROOF, type Stock } from './layout';
import { CAB_X, FLOOR, L, NOSE, seatBays, seatStyle, stockOf, trainModel, W, wallSegments, type SeatStyle, type TrainVariant } from './trainModel';
import { headlightBeam } from './headlights';
import type { Physics } from './physics';

// Double-sided: the hand-built nose quads do not share one winding order.
const exteriorMaterial = new MeshLambertMaterial({ vertexColors: true, map: detailTexture(), side: DoubleSide });
/**
 * Glass reads as glass: looked at straight on you see through it, tinted; toward a glancing angle it turns pale and
 * shiny, as real windows do, so a carriage seen along the platform shows its windows rather than holes.
 */
function glassy<T extends MeshBasicMaterial>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vGlance;')
      .replace('#include <project_vertex>', `#include <project_vertex>
vec3 glassWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vec3 glassNormal = normalize(mat3(modelMatrix) * normal);
vGlance = 1.0 - abs(dot(glassNormal, normalize(cameraPosition - glassWorld)));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlance;')
      .replace('#include <opaque_fragment>', `float glance = vGlance * vGlance * vGlance;
outgoingLight = mix(outgoingLight, vec3(0.74, 0.8, 0.85), glance * 0.6);
diffuseColor.a = mix(diffuseColor.a, 0.82, glance);
#include <opaque_fragment>`);
  };
  return material;
}
const glassMaterial = glassy(new MeshBasicMaterial({ color: 0x34495a, transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide }));
const headMaterial = new MeshBasicMaterial({ color: 0xfff6e0 });
const tailMaterial = new MeshBasicMaterial({ color: 0xff2a1a });
// Transparent for the tinted window in the leaf (see `doorLeafTexture`); the rest of the leaf is opaque in the texture.
const doorMaterial = new MeshLambertMaterial({ map: doorLeafTexture(), transparent: true });
const interiorDoorMaterial = new MeshBasicMaterial({ map: doorLeafTexture(true), color: 0xe0e5e8, transparent: true });
const doorEdgeMaterial = new MeshBasicMaterial({ color: 0x727b82 });
/** The time machine's old green trains have plain green doors. */
const retroDoorMaterial = new MeshLambertMaterial({ color: 0x4d8a5c });

const CLEAR_GLASS = { color: 0x34495a, opacity: 0.32 };
const FOGGED_GLASS = { color: 0xc3ccd0, opacity: 0.55 };

/** Winter mist on the windows of every C20: 0 clear, 1 fully fogged. */
export function setWindowFog(amount: number): void {
  const k = Math.max(0, Math.min(1, amount));
  glassMaterial.color.setHex(CLEAR_GLASS.color).lerp(tmpColor.setHex(FOGGED_GLASS.color), k);
  glassMaterial.opacity = CLEAR_GLASS.opacity + (FOGGED_GLASS.opacity - CLEAR_GLASS.opacity) * k;
}
const tmpColor = new Color();

/** The older stock's groups of four, which have no displays inside. */
const classicStyle = (style: SeatStyle) => style === 'classic' || style === 'classic30';

/** Silverpilen gets private materials so it can flicker and fade on its own. */
function variantMaterials(variant: TrainVariant) {
  if (variant !== 'silver') return { exterior: exteriorMaterial, glass: glassMaterial, door: doorMaterial };
  return {
    exterior: new MeshLambertMaterial({ vertexColors: true, map: detailTexture(), side: DoubleSide, transparent: true }),
    glass: glassy(new MeshBasicMaterial({ color: 0x2c3b36, transparent: true, opacity: 0.4, depthWrite: false, side: DoubleSide })),
    door: new MeshLambertMaterial({ color: 0xb4b8bb, transparent: true }),
  };
}

/** Amber dot-matrix text on black, as on the C20's signs. */
function drawDestination(sign: CanvasSign, text: string): void {
  redraw(sign, (ctx, w, h) => {
    ctx.fillStyle = '#050607';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffb444';
    fitText(ctx, text, w - 24, 700, 50, MONO);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

const displays = new Map<Stock['id'], BufferGeometry>();

/** The dot-matrix displays over every gangway and every cab door, facing into the sections: one mesh per stock. */
function displayGeometry(stock: Stock): BufferGeometry {
  const built = displays.get(stock.id);
  if (built) return built;
  const w = I.displayWidth / 2, h = I.displayHeight / 2;
  const position: number[] = [];
  const uv: number[] = [];
  /** A display at `x` facing +x (1) or -x (-1). Seen from the front, +x's right is -z. */
  const add = (x: number, y: number, facing: 1 | -1) => {
    const left = facing * w, right = -facing * w;
    const corners = [[left, y - h, 0, 0], [right, y - h, 1, 0], [right, y + h, 1, 1], [left, y - h, 0, 0], [right, y + h, 1, 1], [left, y + h, 0, 1]];
    for (const [z, cy, u, v] of corners) {
      position.push(x, cy, z);
      uv.push(u, v);
    }
  };
  for (const gx of stock.articulations) {
    add(gx - 0.31, I.displayY, -1);
    add(gx + 0.31, I.displayY, 1);
  }
  add(-CAB_X + 0.012, I.cabDisplayY, 1);
  add(CAB_X - 0.012, I.cabDisplayY, -1);
  // Over the closed cab doors where two units are coupled.
  for (const gx of stock.couplings) for (const end of [-1, 1] as const) add(gx + end * (CAB_DEPTH + 0.012), I.cabDisplayY, end);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  displays.set(stock.id, geometry);
  return geometry;
}

interface DoorCollider {
  collider: RAPIER.Collider;
  side: -1 | 1;
}

/** A train of two or three units: visuals, colliders, doors and displays. */
export class Train {
  readonly group = new Group();
  /** Its units, sections and doors: the C30's on the red line, else the C20's. */
  readonly stock: Stock;
  /**
   * Colliders are parentless and moved by hand. Attaching them to a kinematic
   * body makes Rapier's character controller stall on the train floor.
   */
  private readonly colliders: Array<{ collider: RAPIER.Collider; x: number; y: number; z: number }> = [];
  /** The seats' colliders, among `colliders`: they change with the stock (see `setLook`). */
  private seatColliders: RAPIER.Collider[] = [];
  /** The dot-matrix displays inside, which only the C20 has. */
  private readonly displays: Mesh;
  readonly position = new Vector3();
  readonly previous = new Vector3();
  private readonly doorColliders: DoorCollider[] = [];
  private readonly leaves: InstancedMesh;
  private readonly heads: Group[] = [];
  /** The destination, number and information signs outside, which only show near to. */
  private readonly signs = new Group();
  /** Loose things inside (the rolling can, the newspaper): drawn with the inside, near to. */
  readonly aboard = new Group();
  private readonly destSign: CanvasSign;
  /** The displays inside, which say where the train goes ("Mot Hjulsta") rather than repeat the sign outside. */
  private readonly insideSign: CanvasSign;
  private readonly infoSign: CanvasSign;
  private readonly logoSign: CanvasSign;
  private destText = '';
  private insideText = '';
  private infoText = '';
  private doorOpen = -1;
  private doorSide: -1 | 1 = -1;
  private headDir = 0;
  private readonly beams: Group[] = [];
  private readonly tails: Group[] = [];
  private interior: Group;
  private readonly exteriorMesh: Mesh;
  private readonly glassMesh: Mesh;
  private look: TrainVariant;
  private readonly doorLook: Material;
  private readonly fadeMaterials: Material[] = [];
  private readonly interiorColors: Array<{ material: MeshBasicMaterial; base: Color }> = [];
  private active = true;
  private opacity = 1;

  /**
   * @param baseY rail height: 0 on the blue line, higher for the red and green line platforms above it
   * @param boardable false for trains you can only watch: their doors open but their doorways stay blocked
   */
  constructor(private readonly physics: Physics, readonly id: number, readonly variant: TrainVariant = 'c20', readonly baseY = 0, private readonly boardable = true) {
    const model = trainModel(variant);
    const mats = variantMaterials(variant);
    this.stock = stockOf(variant);
    this.look = variant;
    this.interior = model.interior.clone();
    this.exteriorMesh = new Mesh(model.exterior, mats.exterior);
    this.glassMesh = new Mesh(model.glass, mats.glass);
    this.group.add(this.exteriorMesh, this.interior, this.glassMesh);
    this.collectInterior();
    if (variant === 'silver') this.fadeMaterials.push(mats.exterior, mats.door, ...this.interiorColors.map((entry) => entry.material));

    this.leaves = new InstancedMesh(new BoxGeometry(DOOR_HALF_W, DOOR_TOP - FLOOR, 0.05), [doorEdgeMaterial, doorEdgeMaterial, doorEdgeMaterial, doorEdgeMaterial, mats.door, interiorDoorMaterial], this.stock.doors.length * 4);
    this.doorLook = mats.door;
    this.group.add(this.leaves);
    for (const end of [-1, 1]) {
      const beam = headlightBeam(L + NOSE, 1.73, 0.83);
      beam.scale.x = end;
      beam.visible = false;
      this.beams.push(beam);
      this.group.add(beam);
      const tail = headlightBeam(L + NOSE, 1.73, 0.83, true);
      tail.scale.x = end;
      tail.visible = false;
      this.tails.push(tail);
      this.group.add(tail);
    }

    const lamp = new CylinderGeometry(0.078, 0.078, 0.04, 20);
    lamp.rotateZ(Math.PI / 2);
    for (const end of [-1, 1]) {
      const g = new Group();
      for (const z of [-0.83, 0.83]) {
        const m = new Mesh(lamp, headMaterial);
        m.position.set(end * (L + NOSE + 0.04), 1.73, z);
        g.add(m);
      }
      this.heads.push(g);
      this.group.add(g);
    }

    this.destSign = createCanvasSign(512, 80);
    this.insideSign = createCanvasSign(512, 80);
    this.infoSign = createCanvasSign(512, 96);
    // The car number, on a transparent plate for the nose and the sides. No operator's logo: the game is not SL's.
    this.logoSign = createCanvasSign(256, 96, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 40px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${2100 + id}`, w / 2, h / 2 + 1);
    });
    this.logoSign.material.transparent = true;
    for (const end of [-1, 1]) {
      const m = signMesh(this.destSign.material, 1.5, 0.24);
      // At the top of the windshield mask.
      m.position.set(end * (L + NOSE + 0.03), 3.19, 0);
      m.rotation.order = 'YXZ';
      m.rotation.y = (end * Math.PI) / 2;
      this.signs.add(m);
      const logo = signMesh(this.logoSign.material, 0.8, 0.3);
      logo.position.set(end * (L + NOSE + 0.03), 1.4, 0);
      logo.rotation.y = (end * Math.PI) / 2;
      this.signs.add(logo);
    }
    for (const cx of this.stock.units) {
      for (const side of [-1, 1]) {
        const badge = signMesh(this.logoSign.material, 0.65, 0.24);
        badge.position.set(cx + 8.8, 1.68, side * (W + 0.025));
        badge.rotation.y = side > 0 ? 0 : Math.PI;
        this.signs.add(badge);
        const destination = signMesh(this.destSign.material, 1.55, 0.24);
        destination.position.set(cx + 2.6, 3.2, side * (W + 0.025));
        destination.rotation.y = side > 0 ? 0 : Math.PI;
        this.signs.add(destination);
      }
      for (const f of [-1, 1]) {
        const m = signMesh(this.infoSign.material, 1.1, 0.21);
        m.position.set(cx + f * 0.02, 3.12, 0);
        m.rotation.y = (f * Math.PI) / 2;
        this.signs.add(m);
      }
    }
    this.group.add(this.signs, this.aboard);
    // Inside, the destination also shows over every gangway and cab door.
    this.displays = new Mesh(displayGeometry(this.stock), this.insideSign.material);
    this.displays.visible = !classicStyle(seatStyle(variant));
    this.group.add(this.displays);

    const add = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => this.addCollider(x0, x1, y0, y1, z0, z1);
    // The floor reaches out over the platform gap so feet never catch in it.
    add(-L, L, 0.4, FLOOR, -W - 0.12, W + 0.12);
    add(-L, L, TRAIN_ROOF - 0.1, TRAIN_ROOF + 0.2, -W, W);
    for (const end of [-1, 1]) add(end > 0 ? CAB_X : -L, end > 0 ? L : -CAB_X, FLOOR, TRAIN_ROOF, -W, W);
    // Two cabs back to back where the units are coupled: no way through.
    for (const gx of this.stock.couplings) add(gx - CAB_DEPTH, gx + CAB_DEPTH, FLOOR, TRAIN_ROOF, -W, W);
    for (const side of [-1, 1] as const) {
      const z0 = side > 0 ? W - 0.1 : -W;
      const z1 = side > 0 ? W : -W + 0.1;
      for (const [a, b] of wallSegments(this.stock)) add(a, b, FLOOR, TRAIN_ROOF, z0, z1);
      for (const d of this.stock.doors) {
        const collider = add(d - DOOR_HALF_W, d + DOOR_HALF_W, FLOOR, TRAIN_ROOF, z0, z1);
        this.doorColliders.push({ collider, side });
        // Glass draught screens beside the doors.
        for (const e of [-1, 1]) {
          const za = Math.min(side * 0.74, side * (W - 0.1));
          const zb = Math.max(side * 0.74, side * (W - 0.1));
          add(Math.min(d + e * 0.72, d + e * 0.8), Math.max(d + e * 0.72, d + e * 0.8), FLOOR, 2.85, za, zb);
        }
      }
    }
    this.addSeatColliders();
    this.setDoors(0, -1);
  }

  private addCollider(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): RAPIER.Collider {
    const local = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 };
    const collider = this.physics.world.createCollider(this.physics.R.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2).setTranslation(local.x, local.y, local.z));
    this.colliders.push({ collider, ...local });
    return collider;
  }

  /** Colliders for the seats of the current stock, in place of any from before. */
  private addSeatColliders(): void {
    for (const collider of this.seatColliders) {
      this.physics.world.removeCollider(collider, false);
      this.colliders.splice(this.colliders.findIndex((c) => c.collider === collider), 1);
    }
    this.seatColliders = seatBays(this.seating).map(({ a, b, side, z }) => this.addCollider(a, b, FLOOR, FLOOR + 0.46, Math.min(side * z, side * W), Math.max(side * z, side * W)));
  }

  /** How the train is furnished, which changes with its stock. */
  get seating(): SeatStyle {
    return seatStyle(this.look);
  }

  private collectInterior(): void {
    this.interiorColors.length = 0;
    this.interior.traverse((child) => {
      const material = (child as Mesh).material as MeshBasicMaterial | undefined;
      if (material?.color && !this.interiorColors.some((entry) => entry.material === material)) this.interiorColors.push({ material, base: material.color.clone() });
    });
  }

  /** Changes how the train looks: today's, or the time machine's old green trains (on its own stock's layout). */
  setLook(era: 'c20' | 'retro'): void {
    if (this.variant === 'silver') return;
    const c30 = this.stock.id === 'c30';
    const variant: TrainVariant = era === 'retro' ? (c30 ? 'retro30' : 'retro') : c30 ? 'c30' : 'c20';
    if (variant === this.look) return;
    this.look = variant;
    const model = trainModel(variant);
    this.exteriorMesh.geometry = model.exterior;
    this.glassMesh.geometry = model.glass;
    const next = model.interior.clone();
    next.visible = this.interiorShown;
    this.group.remove(this.interior);
    this.interior = next;
    this.group.add(next);
    this.collectInterior();
    (this.leaves.material as Material[])[4] = era === 'retro' ? retroDoorMaterial : this.doorLook;
    this.displays.visible = this.interiorShown && !classicStyle(this.seating);
    this.addSeatColliders();
    for (const collider of this.seatColliders) collider.setEnabled(this.solid);
    this.placeColliders();
  }

  /** Out of service: hidden and without colliders. */
  setActive(active: boolean): void {
    // Out of service it leaves the scene: three.js would otherwise still work out where its hundred parts are
    // every frame, hidden or not. (It may have been put in the scene after it went out of service.)
    if (!active && this.group.parent) { this.home = this.group.parent; this.group.removeFromParent(); }
    if (active === this.active) return;
    this.active = active;
    this.group.visible = active;
    if (active && this.home && !this.group.parent) this.home.add(this.group);
    this.applySolid();
  }

  /** Far from the player a train's colliders rest: there is nothing out there to hit, and Rapier need not move them. */
  setNear(near: boolean): void {
    if (near === this.near) return;
    this.near = near;
    if (this.active) this.applySolid();
  }

  /**
   * Far off only the body is drawn: the seats, poles and displays inside would be smaller than a pixel through the
   * windows, and are most of a train's triangles, and its signs, each a draw call of its own, could not be read.
   */
  setInteriorShown(shown: boolean): void {
    if (shown === this.interiorShown) return;
    this.interiorShown = shown;
    this.interior.visible = shown;
    this.signs.visible = shown;
    this.aboard.visible = shown;
    this.displays.visible = shown && !classicStyle(this.seating);
  }

  private interiorShown = true;
  private near = true;
  /** Where the group goes back in when the train returns to service. */
  private home: Object3D | null = null;

  private get solid(): boolean {
    return this.active && this.near;
  }

  private applySolid(): void {
    const solid = this.solid;
    for (const c of this.colliders) c.collider.setEnabled(solid);
    if (!solid) return;
    this.placeColliders();
    const open = this.doorOpen;
    this.doorOpen = -1;
    this.setDoors(Math.max(0, open), this.doorSide);
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Fades the whole train (Silverpilen vanishing into the dark). */
  setOpacity(opacity: number): void {
    const o = Math.round(opacity * 40) / 40;
    if (o === this.opacity) return;
    this.opacity = o;
    for (const m of this.fadeMaterials) {
      m.opacity = o;
      m.transparent = o < 1;
      m.depthWrite = o >= 1;
      m.needsUpdate = true;
    }
    for (const beam of [...this.beams, ...this.tails]) beam.scale.y = o;
  }

  /** Scales the cabin's baked light, 1 = normal. */
  setInteriorLight(level: number): void {
    for (const { material, base } of this.interiorColors) material.color.copy(base).multiplyScalar(level);
  }

  /** @param y the rail's height, where it is not the usual (the lower level of a two-level station) */
  setPose(x: number, z: number, y = 0): void {
    this.previous.copy(this.position);
    this.position.set(x, this.baseY + y, z);
    this.group.position.copy(this.position);
    // A train out of service, or far away, has its colliders disabled; they catch up when it returns.
    if (!this.solid || this.previous.equals(this.position)) return;
    this.placeColliders();
  }

  private placeColliders(): void {
    const { x, y, z } = this.position;
    for (const c of this.colliders) c.collider.setTranslation({ x: x + c.x, y: y + c.y, z: z + c.z });
  }

  /** Teleports without leaving a delta (used on spawn). */
  place(x: number, z: number, y = 0): void {
    this.previous.set(Number.NaN, 0, 0);
    this.setPose(x, z, y);
    this.previous.copy(this.position);
  }

  get delta(): Vector3 {
    return new Vector3().subVectors(this.position, this.previous);
  }

  /** Door openness 0..1 on the given side (-1 or +1 in train-local z). */
  setDoors(openness: number, side: -1 | 1): void {
    const o = Math.round(openness * 50) / 50;
    if (o === this.doorOpen && side === this.doorSide) return;
    this.doorOpen = o;
    this.doorSide = side;
    const m = new Matrix4();
    let i = 0;
    const leafW = DOOR_HALF_W;
    for (const s of [-1, 1] as const) {
      const open = s === side ? o : 0;
      for (const d of this.stock.doors) {
        for (const half of [-1, 1]) {
          const x = d + half * (leafW / 2 + open * leafW * 0.95);
          m.makeRotationY(s > 0 ? 0 : Math.PI).setPosition(x, (FLOOR + DOOR_TOP) / 2, s * (W + 0.02));
          this.leaves.setMatrixAt(i++, m);
        }
      }
    }
    this.leaves.instanceMatrix.needsUpdate = true;
    for (const dc of this.doorColliders) dc.collider.setEnabled(this.solid && !(this.boardable && dc.side === side && o > 0.6));
  }

  get doorsOpen(): number {
    return this.doorOpen;
  }

  get openSide(): -1 | 1 {
    return this.doorSide;
  }

  /** +1 when heading toward +x. Swaps head and tail lights. */
  setHeading(dir: 1 | -1): void {
    if (dir === this.headDir) return;
    this.headDir = dir;
    this.heads[1].children.forEach((c) => ((c as Mesh).material = dir > 0 ? headMaterial : tailMaterial));
    this.heads[0].children.forEach((c) => ((c as Mesh).material = dir > 0 ? tailMaterial : headMaterial));
    this.beams[1].visible = dir > 0;
    this.beams[0].visible = dir < 0;
    this.tails[1].visible = dir < 0;
    this.tails[0].visible = dir > 0;
  }

  /** The sign outside, and the displays inside (the same unless given). */
  setDestination(text: string, inside = text): void {
    if (text !== this.destText) {
      this.destText = text;
      drawDestination(this.destSign, text);
    }
    if (inside !== this.insideText) {
      this.insideText = inside;
      drawDestination(this.insideSign, inside);
    }
  }

  setInfo(text: string): void {
    if (text === this.infoText) return;
    this.infoText = text;
    redraw(this.infoSign, (ctx, w, h) => {
      ctx.fillStyle = '#0a1a33';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      fitText(ctx, text, w - 24, 600, 48);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 2);
    });
  }

  /** Is a point (feet position) inside the passenger cabin, using the given train position? */
  containsFeet(p: Vector3, at: Vector3 = this.position): boolean {
    const y = p.y - at.y;
    return Math.abs(p.x - at.x) < L - 0.1 && Math.abs(p.z - at.z) < W + 0.05 && y > FLOOR - 0.3 && y < TRAIN_ROOF;
  }

  /** Does the train body overlap someone standing on the track at `p` (feet)? */
  hits(p: Vector3): boolean {
    const y = p.y - this.position.y;
    return Math.abs(p.x - this.position.x) < L + NOSE + 0.3 && Math.abs(p.z - this.position.z) < W + 0.35 && y < FLOOR - 0.2 && y > -2;
  }
}
