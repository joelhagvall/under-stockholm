import {
  AdditiveBlending,
  type BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  type Texture,
  Vector3,
} from 'three';
import { bakeLighting, MeshBuilder, prepareLighting, type BakeLight, type Fold } from '../gfx/builder';
import type { RGB } from '../gfx/color';
import { detailTexture, floorTexture, glowTexture, tactileTexture } from '../gfx/textures';
import { torchify } from '../powerLights';

let shared: Record<'detail' | 'floor' | 'tactile' | 'unlit', MeshBasicMaterial> | null = null;

/** Unlit, vertex-colored, fogged materials for the baked world. */
export function worldMaterials() {
  if (!shared) {
    const make = (map?: Texture) => torchify(new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, map: map ?? null }));
    shared = {
      detail: make(detailTexture()),
      floor: make(floorTexture()),
      tactile: make(tactileTexture()),
      unlit: make(),
    };
  }
  return shared;
}

const artMaterials = new Map<Texture, MeshBasicMaterial>();

/** Light from the sky on open-air surfaces, before daylight scales it. */
const OPEN_SKY: RGB = [0.62, 0.64, 0.68];

/**
 * The open air's own copies of the world materials: out there the light
 * comes from the sky, so `setDaylight` scales them with the time of day,
 * while the lamps (the unlit layer) keep shining.
 */
let open: Record<'detail' | 'floor' | 'tactile' | 'unlit', MeshBasicMaterial> | null = null;
const openArt = new Map<Texture, MeshBasicMaterial>();
let daylight = 1;

function openMaterials() {
  if (!open) {
    const w = worldMaterials();
    open = { detail: torchify(w.detail.clone()), floor: torchify(w.floor.clone()), tactile: torchify(w.tactile.clone()), unlit: w.unlit };
    for (const m of [open.detail, open.floor, open.tactile]) m.color.setScalar(daylight);
  }
  return open;
}

/** Every material shared by more than one section: the world's and the open air's. */
export function sharedMaterials(): MeshBasicMaterial[] {
  // Only those already made: asking must not make them.
  const art = [...artMaterials.values(), ...openArt.values()].filter((m) => !m.userData.owned);
  return [...(shared ? Object.values(shared) : []), ...(open ? [open.detail, open.floor, open.tactile] : []), ...art];
}

/** How bright the open air is, 0 to 1 (see `Sky`). */
export function setDaylight(level: number): void {
  if (Math.abs(level - daylight) < 0.002) return;
  daylight = level;
  if (open) for (const m of [open.detail, open.floor, open.tactile]) m.color.setScalar(level);
  for (const m of openArt.values()) m.color.setScalar(level);
}

/** Vertices baked per step of `finishSteps`: small enough that a lazy build's step fits in a frame (30 000 made one in four steps over 16 ms). */
const BAKE_CHUNK = 5_000;

/** Shared world materials, including artwork layers, for global light level changes. */
export function worldMaterialList(): MeshBasicMaterial[] {
  return [...Object.values(worldMaterials()), ...artMaterials.values()];
}

/**
 * A chunk of the world (a station, a tunnel, a turnback cavern). Geometry in
 * the lit layers gets point lights baked into its vertex colors; `unlit` is
 * emissive stuff like lamp fixtures. `extras` holds signs and other meshes.
 */
export class Section {
  /** Rock, concrete, metal: modulated by a fine grain texture. */
  readonly lit: MeshBuilder;
  /** Stone floor slabs. */
  readonly floor: MeshBuilder;
  /** Tactile guidance strips. */
  readonly tactile: MeshBuilder;
  readonly unlit: MeshBuilder;
  readonly lights: BakeLight[] = [];
  readonly extras = new Group();
  private readonly art = new Map<Texture, MeshBuilder>();
  private readonly owned = new Set<Texture>();
  private readonly glows: number[] = [];

  /**
   * @param dry skip all geometry and signs: the pass only lays colliders and
   * works out positions, and the real geometry is built later (see `World`)
   */
  /**
   * @param outdoor in the open air: lit by the sky (see `setDaylight`) rather
   * than only by its lamps, and not dimmed with the stations at night
   */
  constructor(readonly name: string, readonly ambient: RGB, readonly dry = false, readonly outdoor = false) {
    this.lit = new MeshBuilder(dry);
    this.floor = new MeshBuilder(dry);
    this.tactile = new MeshBuilder(dry);
    this.unlit = new MeshBuilder(dry);
  }

  private fold: Fold | null = null;

  /**
   * Moves what is built from now on wherever `fold` takes it (see `Fold`), lights and signs too (`foldExtras`), or
   * stops with null.
   */
  setFold(fold: Fold | null): void {
    this.fold = fold;
    for (const b of [this.lit, this.floor, this.tactile, this.unlit, ...this.art.values()]) b.fold = fold;
  }

  /** The signs, clocks and displays in `extras` that the fold takes, moved and turned to face the mirrored way. */
  foldExtras(): void {
    const fold = this.fold;
    if (!fold) return;
    for (const child of this.extras.children) {
      if (!fold.takes(child.position)) continue;
      fold.move(child.position);
      child.rotation.y = Math.PI - child.rotation.y;
    }
  }

  light(x: number, y: number, z: number, color: RGB, intensity: number, range: number): void {
    if (this.dry) return;
    if (this.fold?.takes({ x, y, z })) {
      const p = new Vector3(x, y, z);
      this.fold.move(p);
      ({ x, y, z } = p);
    }
    this.lights.push({ x, y, z, color, intensity, range });
  }

  /** A soft halo sprite, e.g. around a lamp. */
  glow(x: number, y: number, z: number): void {
    if (this.fold?.takes({ x, y, z })) {
      const p = new Vector3(x, y, z);
      this.fold.move(p);
      ({ x, y, z } = p);
    }
    this.glows.push(x, y, z);
  }

  /**
   * A lit layer painted with an artwork texture (explicit UVs expected). `owned` for a texture made for this section
   * alone (a station's clutter atlas): it is freed with the section, and its material with it.
   */
  artLayer(texture: Texture, owned = false): MeshBuilder {
    let b = this.art.get(texture);
    if (!b) {
      b = new MeshBuilder(this.dry);
      b.fold = this.fold;
      this.art.set(texture, b);
    }
    if (owned) this.owned.add(texture);
    return b;
  }

  /**
   * Bakes and batches the layers. With `own`, the meshes get private material
   * copies (vehicles use this, so their light can change independently).
   */
  finish(own = false): Group {
    const steps = this.finishSteps(own);
    let r = steps.next();
    while (!r.done) r = steps.next();
    return r.value;
  }

  /** `finish` one layer per step, so a lazy build can spread the baking over frames. */
  *finishSteps(own = false): Generator<void, Group> {
    const group = new Group();
    group.name = this.name;
    const shared = worldMaterials();
    const m = own ? { detail: torchify(shared.detail.clone()), floor: torchify(shared.floor.clone()), tactile: torchify(shared.tactile.clone()), unlit: torchify(shared.unlit.clone()) } : this.outdoor ? openMaterials() : shared;
    const { ambient } = this;
    const lights = prepareLighting(this.lights);
    const sky = this.outdoor ? OPEN_SKY : null;
    const add = function* (b: MeshBuilder, material: MeshBasicMaterial, bake: boolean): Generator<void, void> {
      const count = b.vertexCount;
      if (count === 0) return;
      const geo = b.build();
      b.release();
      // Packing a big layer's arrays is a stage of its own before the baking starts.
      if (bake && count > BAKE_CHUNK) yield;
      if (bake) {
        for (let from = 0; from < count; from += BAKE_CHUNK) {
          bakeLighting(geo, lights, ambient, from, from + BAKE_CHUNK, sky);
          yield;
        }
      }
      // MeshBasicMaterial uses the baked colors, never the original surface normals.
      geo.deleteAttribute('normal');
      const mesh = centered(new Mesh(geo, material));
      // A world section is never changed once baked, so its arrays only need to reach the GPU (a vehicle's are shared by its copies).
      if (!own) for (const attribute of Object.values(geo.attributes)) (attribute as BufferAttribute).onUpload(dropArray);
      group.add(mesh);
    };
    yield* add(this.lit, m.detail, true);
    yield* add(this.floor, m.floor, true);
    yield* add(this.tactile, m.tactile, true);
    for (const [tex, b] of this.art) {
      const cache = this.outdoor ? openArt : artMaterials;
      let mat = own ? undefined : cache.get(tex);
      if (!mat) {
        mat = torchify(new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, map: tex }));
        if (this.outdoor) mat.color.setScalar(daylight);
        if (!own) cache.set(tex, mat);
        // Kept in the cache while it lives, so night and daylight reach it; let go with its texture when the section is freed.
        if (!own && this.owned.has(tex)) {
          const material = mat;
          material.userData.owned = true;
          tex.addEventListener('dispose', function drop() {
            tex.removeEventListener('dispose', drop);
            cache.delete(tex);
            material.dispose();
          });
        }
      }
      yield* add(b, mat, true);
    }
    yield* add(this.unlit, m.unlit, false);
    if (this.glows.length) {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(this.glows, 3));
      const pts = new Points(geo, haloMaterial());
      group.add(centered(pts));
    }
    group.add(this.extras);
    return group;
  }
}

const NO_VERTICES = new Float32Array(0);

/**
 * Frees an attribute's copy in memory once the GPU has it. The bounding box and sphere are worked out before, and
 * nothing reads the vertices again; a lost WebGL context cannot upload them anew, so the game reloads then (`boot.ts`).
 */
function dropArray(this: BufferAttribute): void {
  this.array = NO_VERTICES;
}

/**
 * Moves a mesh's origin to the middle of its geometry along x. The GPU works
 * in 32-bit floats, and a vertex tens of kilometres from the world origin,
 * as the far lines are, would shake by millimetres as the camera moves; kept
 * small, only the mesh's position (in double precision) is large.
 */
function centered<T extends Mesh | Points>(mesh: T): T {
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const cx = Math.round((box.min.x + box.max.x) / 2);
  if (cx !== 0) {
    // One pass over the vertices, and the bounds move with them: `geo.translate` would go over a big layer three
    // more times (the matrix, then the box and the sphere again), a stall of its own in a build on the way.
    const position = geo.getAttribute('position') as BufferAttribute;
    const array = position.array as Float32Array;
    for (let i = 0; i < array.length; i += 3) array[i] -= cx;
    position.needsUpdate = true;
    box.min.x -= cx;
    box.max.x -= cx;
    if (geo.boundingSphere) geo.boundingSphere.center.x -= cx;
    mesh.position.x += cx;
  }
  return mesh;
}

let halo: PointsMaterial | null = null;

function haloMaterial(): PointsMaterial {
  if (!halo) {
    halo = new PointsMaterial({
      size: 2.2,
      map: glowTexture(),
      color: 0xfff1d6,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    });
  }
  return halo;
}
