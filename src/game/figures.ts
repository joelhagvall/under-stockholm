import { CapsuleGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshLambertMaterial, Object3D, type Material } from 'three';
import { PLATFORM_Y } from './layout';

/**
 * Stylized people built from capsules: one instanced draw for a whole group.
 * Passengers, inspectors, the busker, the night cleaner and the ghosts of
 * other players all share this. Men, women and children differ in build and
 * hair; a look can add a skirt, a guitar case instead of a backpack and a
 * thing in the hand, all within the same sixteen parts.
 */

export const PARTS = 16;

export interface FigurePose {
  x: number;
  z: number;
  yaw: number;
  walking: boolean;
  seated?: boolean;
  /** Feet height; defaults to the platform. */
  y?: number;
  /** Carries a folded umbrella. */
  umbrella?: boolean;
  /** What the right hand holds. Its colour is the look's `prop`. */
  carry?: Carry;
  /** Body size; children are about 0.6. */
  scale?: number;
  /** Overrides the build the figure was painted with. */
  build?: Build;
  /** A faster, longer stride. */
  running?: boolean;
  /**
   * The right arm: waving, gripping an overhead rail, fanning the face, or held up in front (a phone, a paper, a
   * saxophone: say which with `carry`). `pray` takes both arms: palms together in front of the chest.
   */
  arm?: 'wave' | 'hold' | 'fan' | 'phone' | 'pray';
  /** Head tilt toward the right shoulder, in radians (dozing against a window). */
  lean?: number;
  /** Head turn relative to the body, replacing the idle glances. */
  look?: number;
  /** Lean of the whole body forward (+) or back, pivoting at the feet. */
  sway?: number;
}

export type Carry = 'umbrella' | 'bag' | 'lantern' | 'flowers' | 'paper' | 'map' | 'balloon' | 'candle'
  | 'handbag' | 'briefcase' | 'shopping' | 'bluebag' | 'coffee' | 'phone';

export type Build = 'man' | 'woman' | 'child';
/** What is on the back: a backpack (coloured `bag`), nothing, or a guitar case. */
export type Back = 'backpack' | 'none' | 'guitar';

export interface FigureLook {
  coat: number;
  skin: number;
  /** Hair, or a hat. */
  hair: number;
  bag: number;
  trousers: number;
  shoes: number;
  /** The torso can differ from the sleeves, e.g. a high-visibility vest. */
  torso?: number;
  prop?: number;
  build?: Build;
  /** Long hair, to the shoulders. */
  long?: boolean;
  /** A skirt or dress over the thighs, and what shows below it (tights or bare legs). */
  skirt?: number;
  legs?: number;
  back?: Back;
  /** What the right hand holds when the pose does not say. */
  carry?: Carry;
}

interface Shape {
  build: Build;
  long: boolean;
  skirt: boolean;
  back: Back;
  carry?: Carry;
}

/** The shape each figure was painted with, per mesh. */
const shapes = new WeakMap<InstancedMesh, Shape[]>();

let geometry: CapsuleGeometry | null = null;
let material: MeshLambertMaterial | null = null;

export function figureMesh(count: number, mat?: Material): InstancedMesh {
  // Three rings per cap and eight around: round enough for the look, and a crowd of 200 is a third lighter than at 4 and 10.
  geometry ??= new CapsuleGeometry(0.5, 1, 3, 8);
  material ??= new MeshLambertMaterial({ color: 0xffffff });
  const mesh = new InstancedMesh(geometry, mat ?? material, count * PARTS);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // Visibility is bounded explicitly because the instance transforms move.
  mesh.frustumCulled = false;
  return mesh;
}

const color = new Color();

export function paintFigure(mesh: InstancedMesh, i: number, look: FigureLook): void {
  const colors = [look.torso ?? look.coat, look.skin, look.skin, look.hair, look.bag];
  for (let side = 0; side < 2; side++) colors.push(look.coat, look.skin, look.skirt ?? look.trousers, look.legs ?? look.trousers, look.shoes);
  colors.push(look.prop ?? 0x1c1f24);
  colors.forEach((c, part) => mesh.setColorAt(i * PARTS + part, color.setHex(c)));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  let list = shapes.get(mesh);
  if (!list) shapes.set(mesh, (list = []));
  list[i] = { build: look.build ?? 'man', long: look.long ?? false, skirt: look.skirt !== undefined, back: look.back ?? 'backpack', carry: look.carry };
}

/** The phone arm: held out at chest height, in front of the body. */
const PHONE_FORWARD = -0.95;
const PHONE_IN = -0.3;
/** The phone above the fist. */
const PHONE_OFFSET = [-0.01, 0.09, 0.02] as const;

/** Where the screen of a phone held in the phone pose is, in the figure's own coordinates, for its glow. */
export function phoneScreen(seated: boolean): [number, number, number] {
  const dx = Math.sin(PHONE_IN);
  const dy = -Math.cos(PHONE_IN) * Math.cos(PHONE_FORWARD);
  const dz = -Math.cos(PHONE_IN) * Math.sin(PHONE_FORWARD);
  return [0.24 + dx * 0.6 + PHONE_OFFSET[0], 1.39 + (seated ? -0.31 : 0) + dy * 0.6 + PHONE_OFFSET[1], dz * 0.6 + PHONE_OFFSET[2]];
}

const root = new Object3D();
const part = new Object3D();
const matrix = new Matrix4();
const hidden = new Matrix4().makeScale(0, 0, 0);

/**
 * Draws only the first `figures` figures of a mesh. Hidden figures are scaled to nothing but their triangles are
 * still sent through the GPU, so a mesh with its last figures unused should stop before them.
 */
export function drawCount(mesh: InstancedMesh, figures: number): void {
  mesh.count = Math.max(0, Math.min(figures * PARTS, mesh.instanceMatrix.count));
}

export function hideFigure(mesh: InstancedMesh, i: number): void {
  for (let p = 0; p < PARTS; p++) mesh.setMatrixAt(i * PARTS + p, hidden);
}

/** Poses figure `i`. `clock` drives gait, glances and dozing. */
export function drawFigure(mesh: InstancedMesh, i: number, pose: FigurePose, clock: number): void {
  const shape = shapes.get(mesh)?.[i];
  const build = pose.build ?? shape?.build ?? 'man';
  const woman = build === 'woman';
  const child = build === 'child';
  const size = pose.scale ?? (child ? 0.6 : pose.seated ? 1 : (woman ? 0.9 : 0.95) + (i % 4) * 0.04);
  /** Shoulders, and a child's larger head. */
  const shoulder = woman ? 0.215 : 0.24;
  const head = child ? 1.2 : 1;
  const sit = pose.seated ? -0.31 : 0;
  const stride = pose.running ? 0.55 : 0.3;
  const gait = pose.walking ? Math.sin(clock * (pose.running ? 7 : 3.5) + i) * stride : 0;
  root.position.set(pose.x, pose.y ?? PLATFORM_Y, pose.z);
  root.rotation.set(pose.sway ?? 0, pose.yaw, 0, 'YXZ');
  root.scale.setScalar(size);
  root.updateMatrix();
  let partIndex = i * PARTS;
  const lean = pose.lean ?? 0;
  const add = (px: number, py: number, pz: number, width: number, height: number, depth: number, angle = 0, roll = 0) => {
    part.position.set(px, py, pz);
    part.rotation.set(angle, 0, roll);
    const slot = partIndex % PARTS;
    if (slot === 2 || slot === 3) {
      part.rotation.y = pose.look ?? Math.sin(clock * 0.35 + i * 2) * 0.18;
      if (pose.seated && i % 4 === 0 && !lean) part.rotation.x = 0.15 + Math.sin(clock * 0.6) * 0.06;
      if (lean) {
        // The head rests toward the right shoulder, pivoting at the neck.
        part.rotation.z = -lean;
        part.position.x += Math.sin(lean) * (py - 1.46 - sit);
        part.position.y -= (1 - Math.cos(lean)) * (py - 1.46 - sit);
      }
    }
    part.scale.set(width, height / 2, depth);
    part.updateMatrix();
    matrix.multiplyMatrices(root.matrix, part.matrix);
    mesh.setMatrixAt(partIndex++, matrix);
  };
  add(0, 1.12 + sit, 0, woman ? 0.37 : 0.4, 0.6, woman ? 0.24 : 0.25);
  add(0, 1.46 + sit, 0, 0.11, 0.13, 0.11);
  const hy = 1.61 + sit + (head - 1) * 0.14;
  add(0, hy, 0, 0.23 * head, 0.29 * head, 0.23 * head);
  if (shape?.long) add(0, hy - 0.02, -0.035, 0.26 * head, 0.37 * head, 0.25 * head);
  else add(0, hy + 0.1 * head, -0.018, 0.24 * head, 0.13 * head, 0.235 * head);
  const back = shape?.back ?? 'backpack';
  if (back === 'guitar') add(0.03, 1.05 + sit * 0.4, -0.21, 0.3, 1.05, 0.12, 0, 0.14);
  else if (back === 'backpack') add(0, 1.15 + sit, -0.19, 0.28, 0.38, 0.17);
  else add(0, 0, 0, 0, 0, 0);
  let hand = { x: shoulder, y: 0.87 + sit, z: -Math.sin(gait) * 0.4 };
  for (const side of [-1, 1]) {
    const swing = side * gait;
    if (pose.arm === 'pray') {
      // Each arm runs from the shoulder in to the hands, which meet in front of the chest.
      const sy = 1.39 + sit;
      const tip = { x: side * 0.035, y: 1.2 + sit, z: 0.27 };
      const ux = tip.x - side * shoulder;
      const uy = tip.y - sy;
      const uz = tip.z;
      const length = Math.hypot(ux, uy, uz);
      add(side * shoulder + ux / 2, sy + uy / 2, uz / 2, 0.1, length, 0.11, Math.atan2(-uz, -uy), Math.asin(ux / length));
      add(tip.x, tip.y + 0.04, tip.z, 0.07, 0.16, 0.09);
      hand = tip;
    } else if (side > 0 && pose.arm) {
      // A raised or bent right arm, from the shoulder along direction d.
      let a = Math.PI;
      let b = 0;
      if (pose.arm === 'wave') b = 0.35 + Math.sin(clock * 9 + i) * 0.4;
      if (pose.arm === 'fan') { a = -Math.PI * 0.74; b = Math.sin(clock * 11 + i) * 0.25; }
      if (pose.arm === 'phone') { a = PHONE_FORWARD; b = PHONE_IN; }
      const dx = Math.sin(b);
      const dy = -Math.cos(b) * Math.cos(a);
      const dz = -Math.cos(b) * Math.sin(a);
      const sy = 1.39 + sit;
      add(shoulder + dx * 0.26, sy + dy * 0.26, dz * 0.26, 0.11, 0.52, 0.12, a, b);
      hand = { x: shoulder + dx * 0.6, y: sy + dy * 0.6, z: dz * 0.6 };
      add(hand.x, hand.y, hand.z, 0.09, 0.13, 0.095);
    } else {
      add(side * shoulder, 1.13 + sit, -Math.sin(swing) * 0.2, 0.11, 0.52, 0.12, -swing);
      add(side * shoulder, 0.87 + sit, -Math.sin(swing) * 0.4, 0.09, 0.13, 0.095);
    }
    // A skirt: the thighs widen and meet, and hardly swing.
    const skirt = shape?.skirt ?? false;
    if (pose.seated) {
      if (skirt) add(side * 0.09, 0.55, 0.1, 0.21, 0.44, 0.2, Math.PI / 2);
      else add(side * 0.105, 0.54, 0.12, 0.14, 0.42, 0.15, Math.PI / 2);
      add(side * 0.105, 0.28, 0.32, 0.14, 0.44, 0.15);
      add(side * 0.105, 0.075, 0.38, 0.15, 0.12, 0.25);
    } else {
      const sin = Math.sin(swing), cos = Math.cos(swing);
      if (skirt) add(side * 0.085, 0.72, -0.21 * Math.sin(swing * 0.3), 0.22, 0.46, 0.25, swing * 0.3);
      else add(side * 0.105, 0.9 - 0.21 * cos, -0.21 * sin, 0.14, 0.42, 0.15, swing);
      add(side * 0.105, 0.9 - 0.63 * cos, -0.63 * sin, 0.14, 0.42, 0.15, swing);
      add(side * 0.105, 0.9 - 0.825 * cos, 0.05 - 0.84 * sin, 0.15, 0.12, 0.28);
    }
  }
  // A pose's own prop wins; a raised arm is busy, so the everyday one is left out.
  const carry = pose.carry ?? (pose.umbrella ? 'umbrella' : pose.arm ? undefined : shape?.carry);
  /** Bags stand on the floor beside someone sitting down. */
  const bagAt = (width: number, height: number, depth: number) => {
    if (pose.seated) add(0.3, height / 2 + 0.02, 0.28, width, height, depth);
    else add(hand.x + width / 3, hand.y - height / 2 - 0.02, hand.z, width, height, depth);
  };
  // A folded umbrella hangs from the right hand, swinging with the arm.
  if (carry === 'umbrella' && !pose.seated && !pose.arm) add(0.25, 0.47, -Math.sin(gait) * 0.4, 0.05, 0.82, 0.05, gait * 0.4);
  else if (carry === 'bag') add(hand.x + 0.02, hand.y - 0.24, hand.z, 0.2, 0.34, 0.13);
  else if (carry === 'lantern') add(hand.x + 0.02, hand.y - 0.2, hand.z, 0.2, 0.2, 0.2);
  else if (carry === 'flowers') add(hand.x - 0.1, hand.y + 0.12, hand.z + 0.12, 0.17, 0.36, 0.17, 0.5);
  else if (carry === 'paper') add(hand.x, hand.y + 0.08, hand.z + 0.04, 0.24, 0.32, 0.02);
  else if (carry === 'map') add(hand.x - 0.2, hand.y + 0.16, hand.z + 0.22, 0.5, 0.36, 0.02, -0.5);
  else if (carry === 'balloon') add(hand.x, hand.y + 0.95 + Math.sin(clock * 1.3 + i) * 0.05, hand.z + Math.sin(clock * 0.9 + i) * 0.06, 0.3, 0.36, 0.3);
  else if (carry === 'candle') add(hand.x, hand.y + 0.12, hand.z + 0.05, 0.04, 0.24, 0.04);
  else if (carry === 'handbag') add(hand.x + 0.03, hand.y - 0.13, hand.z, 0.09, 0.22, 0.28);
  else if (carry === 'briefcase') bagAt(0.08, 0.3, 0.44);
  else if (carry === 'shopping') bagAt(0.2, 0.42, 0.3);
  else if (carry === 'bluebag') bagAt(0.26, 0.5, 0.56);
  else if (carry === 'coffee') add(hand.x, hand.y + 0.09, hand.z + 0.03, 0.085, 0.14, 0.085);
  // Upright above the fist, tilted so the screen faces the eyes.
  else if (carry === 'phone') add(hand.x + PHONE_OFFSET[0], hand.y + PHONE_OFFSET[1], hand.z + PHONE_OFFSET[2], 0.085, 0.17, 0.03, 0.7);
  else mesh.setMatrixAt(partIndex, hidden);
}
