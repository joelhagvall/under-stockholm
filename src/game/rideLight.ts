import { AdditiveBlending, CanvasTexture, DoubleSide, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, SRGBColorSpace, type Material } from 'three';
import { drawFigure, figureMesh, paintFigure } from './figures';
import { PLATFORM_Y, TRAIN_HALF_L } from './layout';
import type { Train } from './train';
import { W, WIN_HI, WIN_LO } from './trainModel';

/**
 * Two things you only see riding through the dark: the tunnel lamps, every
 * 25 meters on the outer wall, throw a warm patch through the windows that
 * slides back through the carriage, over the floor and the far wall; and in
 * the black glass you see the carriage mirrored, and yourself in it.
 *
 * The interior lighting is baked, so the sweeping light is a set of soft
 * additive patches moved every frame. The reflection is the carriage drawn
 * again, dimmed and mirrored in the plane of each window, squeezed into the
 * gap before the tunnel wall so the rock never cuts it off.
 */

const LAMP_SPACING = 25;
const PATCHES = 8;
/** Depth of the mirrored carriage outside the glass, as a share of its real depth. */
const SQUEEZE = 0.3;
/**
 * You are mirrored on your own, at full depth, so your reflection turns as you do; squeezed like the carriage you would
 * be a flat cut-out that always faces you. It stands at least this far outside the glass, so it never reaches back in.
 */
const SELF_OUT = 0.35;
/** How far your reflection's head turns from your shoulders while you sit. */
const HEAD_TURN = 1.3;

function softTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 32, 2, 64, 32, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

interface Mirror {
  side: number;
  group: Group;
  /** Your own reflection: a plain mirror, not squeezed. */
  selfGroup: Group;
  self: ReturnType<typeof figureMesh>;
}

/** The player, as their reflection needs them. */
export interface Rider {
  feet: { x: number; y: number; z: number };
  /** Where they look. */
  yaw: number;
  seated: boolean;
  /** While seated: the way the seat faces, and how far the seat lies from the aisle the feet stand in. */
  seatYaw: number;
  seatSide: number;
}

export class RideLight {
  private readonly patches: InstancedMesh;
  private readonly material: MeshBasicMaterial;
  private readonly dummy = new Object3D();
  private host: Train | null = null;
  private readonly mirrors = new Map<Train, Mirror[]>();
  private level = 0;
  private reflect = 0;
  private readonly dimmed = new Map<Material, Material>();
  /** Your reflection's material, one for every mirror: a new one per mirror would pile up in `dimmed`. */
  private selfMaterial: Material | null = null;

  constructor() {
    this.material = new MeshBasicMaterial({ map: softTexture(), color: 0xffcf8a, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    this.patches = new InstancedMesh(new PlaneGeometry(1, 1), this.material, PATCHES * 2);
    this.patches.name = 'tunnel-lamp-light';
    this.patches.frustumCulled = false;
    this.patches.renderOrder = 3;
  }

  /**
   * @param train the train the player rides, or null
   * @param dark riding through a tunnel, where the lamps and the reflections show
   * @param speed the train's speed, m/s
   * @param rider the player, for their own reflection
   */
  update(dt: number, train: Train | null, dark: boolean, speed: number, rider: Rider): void {
    if (train !== this.host) {
      if (this.host) {
        this.host.group.remove(this.patches);
        for (const m of this.mirrors.get(this.host) ?? []) m.group.visible = m.selfGroup.visible = false;
      }
      this.host = train;
      if (train) train.group.add(this.patches);
    }
    this.level += ((dark && speed > 2 ? 1 : 0) - this.level) * Math.min(1, dt * 3);
    this.reflect += ((dark ? 1 : 0) - this.reflect) * Math.min(1, dt * 2);
    if (!train) return;
    this.sweep(train);
    this.mirror(train, rider);
  }

  /** Forgets the reflections, e.g. after the trains change stock; they are rebuilt from the new interiors. */
  reset(): void {
    for (const [train, mirrors] of this.mirrors) {
      for (const m of mirrors) {
        train.group.remove(m.group, m.selfGroup);
        // Your reflection's instances live in buffers of its own; the carriage copies share theirs with the train.
        m.self.dispose();
      }
    }
    this.mirrors.clear();
  }

  /** The lamps' light, falling through the outer windows and sliding back as the train runs on. */
  private sweep(train: Train): void {
    this.patches.visible = this.level > 0.02;
    this.material.opacity = 0.55 * this.level;
    if (!this.patches.visible) return;
    const x = train.position.x;
    // The lamps hang on the outer tube wall: the +z side on track 1, the -z side on track 2.
    const outer = train.position.z > 0 ? 1 : -1;
    const first = Math.ceil((x - TRAIN_HALF_L) / LAMP_SPACING) * LAMP_SPACING;
    let n = 0;
    for (let lamp = first; lamp < x + TRAIN_HALF_L && n < PATCHES; lamp += LAMP_SPACING, n++) {
      const lx = lamp - x;
      // A slanting patch across the floor from the window side...
      this.dummy.position.set(lx, PLATFORM_Y + 0.02, outer * 0.35);
      this.dummy.rotation.set(-Math.PI / 2, 0, 0);
      this.dummy.scale.set(2.6, 2.4, 1);
      this.dummy.updateMatrix();
      this.patches.setMatrixAt(n * 2, this.dummy.matrix);
      // ...and up the far wall and its windows.
      this.dummy.position.set(lx + 0.6, (WIN_LO + WIN_HI) / 2 - 0.3, -outer * (W - 0.12));
      this.dummy.rotation.set(0, Math.PI / 2, 0);
      this.dummy.scale.set(1.2, 2.2, 1);
      this.dummy.updateMatrix();
      this.patches.setMatrixAt(n * 2 + 1, this.dummy.matrix);
    }
    const hidden = new Object3D();
    hidden.scale.setScalar(0);
    hidden.updateMatrix();
    for (let k = n * 2; k < PATCHES * 2; k++) this.patches.setMatrixAt(k, hidden.matrix);
    this.patches.instanceMatrix.needsUpdate = true;
  }

  /** The carriage mirrored in each side's glass, with you standing in it. */
  private mirror(train: Train, rider: Rider): void {
    let mirrors = this.mirrors.get(train);
    if (!mirrors) {
      mirrors = [-1, 1].map((side) => this.makeMirror(train, side));
      this.mirrors.set(train, mirrors);
    }
    const show = this.reflect > 0.05;
    // Where you are in the carriage: on the cushion while seated, though your feet stay in the aisle.
    const x = rider.feet.x - train.position.x;
    const z = rider.feet.z - train.position.z + rider.seatSide;
    // Figures face +z at yaw 0, the camera -z. Seated, your shoulders keep to the seat and only your head follows your eyes.
    const turn = Math.atan2(Math.sin(rider.yaw - rider.seatYaw), Math.cos(rider.yaw - rider.seatYaw));
    const body = (rider.seated ? rider.seatYaw : rider.yaw) + Math.PI;
    const look = rider.seated ? Math.max(-HEAD_TURN, Math.min(HEAD_TURN, turn)) : 0;
    for (const m of mirrors) {
      m.group.visible = m.selfGroup.visible = show;
      if (!show) continue;
      m.selfGroup.position.z = m.side * W + m.side * Math.max(SELF_OUT, SQUEEZE * Math.abs(m.side * W - z));
      drawFigure(m.self, 0, { x, y: rider.feet.y, z: 0, yaw: body, look, walking: false, seated: rider.seated }, 0);
      m.self.instanceMatrix.needsUpdate = true;
    }
    for (const material of this.dimmed.values()) (material as MeshBasicMaterial).opacity = 0.3 * this.reflect;
  }

  private makeMirror(train: Train, side: number): Mirror {
    const group = new Group();
    group.name = 'window-reflection';
    // Mirror in the plane z = side * W, squeezed into the gap outside it.
    group.scale.set(1, 1, -SQUEEZE);
    group.position.z = side * W * (1 + SQUEEZE);
    const sources = train.group.children.filter((c) => c.name.startsWith('train-interior') || c.name === 'onboard-passengers');
    for (const source of sources) {
      const copy = source.clone();
      copy.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh && !Array.isArray(mesh.material)) mesh.material = this.dim(mesh.material);
      });
      // The seated passengers move with their own instance data; the copy shares it.
      if ((source as InstancedMesh).isInstancedMesh) {
        (copy as InstancedMesh).instanceMatrix = (source as InstancedMesh).instanceMatrix;
        (copy as InstancedMesh).instanceColor = (source as InstancedMesh).instanceColor;
      }
      group.add(copy);
    }
    this.selfMaterial ??= this.dim(new MeshBasicMaterial({ color: 0xffffff }));
    const self = figureMesh(1, this.selfMaterial);
    paintFigure(self, 0, { coat: 0x3a4250, skin: 0xc79a78, hair: 0x2b2b2b, bag: 0x3a4250, trousers: 0x2a3140, shoes: 0x1b1d22 });
    const selfGroup = new Group();
    selfGroup.name = 'window-reflection-self';
    selfGroup.scale.set(1, 1, -1);
    selfGroup.add(self);
    group.visible = selfGroup.visible = false;
    train.group.add(group, selfGroup);
    return { side, group, selfGroup, self };
  }

  /** A dim, see-through copy of a material for the reflection. */
  private dim(material: Material): Material {
    let copy = this.dimmed.get(material);
    if (!copy) {
      copy = material.clone();
      copy.transparent = true;
      copy.depthWrite = false;
      (copy as MeshBasicMaterial).opacity = 0;
      copy.side = DoubleSide;
      this.dimmed.set(material, copy);
    }
    return copy;
  }
}
