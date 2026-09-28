import { Box3, BufferAttribute, BufferGeometry, Matrix3, Matrix4, Sphere, Vector3 } from 'three';
import type { RGB } from './color';

/** A flat color, or a function that paints each vertex from its position and face normal. */
export type Paint = RGB | ((p: Vector3, n: Vector3) => RGB);

export interface BakeLight {
  x: number;
  y: number;
  z: number;
  color: RGB;
  intensity: number;
  range: number;
}

export type BoxFace = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

export type UV = [number, number];

export interface TriOptions {
  /** Per-vertex normals for smooth shading. Defaults to the face normal. */
  normals?: [Vector3, Vector3, Vector3];
  /** Per-vertex texture coordinates. Defaults to a box projection in meters. */
  uvs?: [UV, UV, UV];
  /** Per-vertex colors, already painted; `paint` is then ignored. */
  colors?: [RGB, RGB, RGB];
}

/** A growable Float32Array, so building never goes through boxed JS numbers. */
class FloatList {
  private data = new Float32Array(0);
  length = 0;

  push3(a: number, b: number, c: number): void {
    if (this.length + 3 > this.data.length) this.grow();
    this.data[this.length++] = a;
    this.data[this.length++] = b;
    this.data[this.length++] = c;
  }

  push2(a: number, b: number): void {
    if (this.length + 2 > this.data.length) this.grow();
    this.data[this.length++] = a;
    this.data[this.length++] = b;
  }

  /**
   * The filled part, handed over as a view of the buffer, and the list starts empty: no copy, which for a big layer
   * would stall a build on the way, and nothing pushed afterwards can reach what was taken. The view keeps the
   * buffer's spare tail until it goes (`dropArray` in `Section`, once the GPU has it).
   */
  take(): Float32Array {
    const taken = this.data.subarray(0, this.length);
    this.data = new Float32Array(0);
    this.length = 0;
    return taken;
  }

  private grow(): void {
    const next = new Float32Array(Math.max(1024, this.data.length * 2));
    next.set(this.data);
    this.data = next;
  }
}

export interface BoxLike {
  x: number;
  y: number;
  z: number;
}

/**
 * Accumulates flat-shaded, vertex-colored triangles. Everything static in the
 * world is built through this so a whole station collapses into one draw call.
 */
export class MeshBuilder {
  private pos = new FloatList();
  private nor = new FloatList();
  private col = new FloatList();
  private uv = new FloatList();
  private readonly ab = new Vector3();
  private readonly ac = new Vector3();
  private readonly n = new Vector3();

  /** A dry builder ignores all geometry, for passes that only want colliders and positions. */
  constructor(readonly dry = false) {}

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  tri(a: Vector3, b: Vector3, c: Vector3, paint: Paint, opts?: TriOptions): void {
    if (this.dry) return;
    this.ab.subVectors(b, a);
    this.ac.subVectors(c, a);
    this.n.crossVectors(this.ab, this.ac);
    if (this.n.lengthSq() < 1e-12) return;
    this.n.normalize();
    // Box projection axis, picked from the face normal so a face never smears.
    const ax = Math.abs(this.n.x), ay = Math.abs(this.n.y), az = Math.abs(this.n.z);
    const verts = [a, b, c];
    for (let i = 0; i < 3; i++) {
      const v = verts[i];
      const n = opts?.normals?.[i] ?? this.n;
      this.pos.push3(v.x, v.y, v.z);
      this.nor.push3(n.x, n.y, n.z);
      const color = opts?.colors?.[i] ?? (typeof paint === 'function' ? paint(v, n) : paint);
      this.col.push3(color[0], color[1], color[2]);
      const uv = opts?.uvs?.[i];
      if (uv) this.uv.push2(uv[0], uv[1]);
      else if (ay >= ax && ay >= az) this.uv.push2(v.x, v.z);
      else if (ax >= az) this.uv.push2(v.z, v.y);
      else this.uv.push2(v.x, v.y);
    }
  }

  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, paint: Paint): void {
    this.tri(a, b, c, paint);
    this.tri(a, c, d, paint);
  }

  /**
   * Planar quad split into a grid of cells no larger than `cell` meters, so
   * baked lighting has enough vertices to show pools of light on big surfaces.
   */
  gridQuad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, paint: Paint, cell: number): void {
    if (this.dry) return;
    const nu = Math.max(1, Math.ceil(a.distanceTo(b) / cell));
    const nv = Math.max(1, Math.ceil(a.distanceTo(d) / cell));
    if (nu === 1 && nv === 1) {
      this.quad(a, b, c, d, paint);
      return;
    }
    // Reuse the four corners across cells instead of allocating eight vectors per cell.
    const corners = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
    const edge = new Vector3();
    const at = (out: Vector3, u: number, v: number) => {
      out.lerpVectors(a, b, u);
      edge.lerpVectors(d, c, u);
      return out.lerp(edge, v);
    };
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
        this.quad(at(corners[0], u0, v0), at(corners[1], u1, v0), at(corners[2], u1, v1), at(corners[3], u0, v1), paint);
      }
    }
  }

  /** Axis-aligned box with outward-facing faces. `skip` omits hidden faces. */
  box(min: BoxLike, max: BoxLike, paint: Paint, skip: BoxFace[] = [], cell = 2.5): void {
    if (this.dry) return;
    const x0 = min.x, y0 = min.y, z0 = min.z;
    const x1 = max.x, y1 = max.y, z1 = max.z;
    const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const faces: Record<BoxFace, Vector3[]> = {
      px: [v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), v(x1, y0, z1)],
      nx: [v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0)],
      py: [v(x0, y1, z0), v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0)],
      ny: [v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1)],
      pz: [v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)],
      nz: [v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0), v(x1, y0, z0)],
    };
    for (const key of Object.keys(faces) as BoxFace[]) {
      if (skip.includes(key)) continue;
      const [a, b, c, d] = faces[key];
      this.gridQuad(a, b, c, d, paint, cell);
    }
  }

  /** Appends any three.js geometry (indexed or not), optionally transformed. Source normals are kept, so curved geometry shades smoothly. */
  geometry(geo: BufferGeometry, matrix: Matrix4 | null, paint: Paint, preserveUvs = false): void {
    if (this.dry) return;
    const src = geo.index ? geo.toNonIndexed() : geo;
    const p = src.getAttribute('position');
    const n = src.getAttribute('normal');
    const uv = preserveUvs ? src.getAttribute('uv') : null;
    const nm = matrix ? new Matrix3().getNormalMatrix(matrix) : null;
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const va = new Vector3();
    const vb = new Vector3();
    const vc = new Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      va.fromBufferAttribute(n, i);
      vb.fromBufferAttribute(n, i + 1);
      vc.fromBufferAttribute(n, i + 2);
      if (matrix) {
        a.applyMatrix4(matrix);
        b.applyMatrix4(matrix);
        c.applyMatrix4(matrix);
      }
      if (nm) {
        va.applyMatrix3(nm).normalize();
        vb.applyMatrix3(nm).normalize();
        vc.applyMatrix3(nm).normalize();
      }
      this.tri(a, b, c, paint, {
        normals: [va, vb, vc],
        uvs: uv ? [[uv.getX(i), uv.getY(i)], [uv.getX(i + 1), uv.getY(i + 1)], [uv.getX(i + 2), uv.getY(i + 2)]] : undefined,
      });
    }
    if (src !== geo) src.dispose();
  }

  /**
   * Lets go of the vertices once they are built: a section can outlive its build (closures in its station keep
   * it), and the grown buffers would otherwise stay with it.
   */
  release(): void {
    this.pos = new FloatList();
    this.nor = new FloatList();
    this.col = new FloatList();
    this.uv = new FloatList();
  }

  /** The geometry of everything added so far. The vertices are handed over, so the builder is empty afterwards. */
  build(): BufferGeometry {
    const geo = new BufferGeometry();
    // take() hands over its array as it is. BufferAttribute keeps it without a copy.
    const position = this.pos.take();
    geo.setAttribute('position', new BufferAttribute(position, 3));
    geo.setAttribute('normal', new BufferAttribute(this.nor.take(), 3));
    geo.setAttribute('color', new BufferAttribute(this.col.take(), 3));
    geo.setAttribute('uv', new BufferAttribute(this.uv.take(), 2));
    setBounds(geo, position);
    return geo;
  }
}

/**
 * The bounding box and sphere straight from the array, as three.js would work them out (the sphere around the box's
 * middle), but in two plain passes: its own go through the attribute's accessors, several times slower on a big layer.
 */
function setBounds(geo: BufferGeometry, pos: Float32Array): void {
  if (pos.length === 0) {
    geo.boundingBox = new Box3();
    geo.boundingSphere = new Sphere();
    return;
  }
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  let r2 = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const dx = pos[i] - cx, dy = pos[i + 1] - cy, dz = pos[i + 2] - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r2) r2 = d2;
  }
  geo.boundingBox = new Box3(new Vector3(x0, y0, z0), new Vector3(x1, y1, z1));
  geo.boundingSphere = new Sphere(new Vector3(cx, cy, cz), Math.sqrt(r2));
}

/** Spatial light lookup shared by all layers and slices of a section. */
export interface PreparedLighting {
  x: Float32Array; y: Float32Array; z: Float32Array;
  range: Float32Array; range2: Float32Array; intensity: Float32Array; color: Float32Array;
  x0: number; y0: number; z0: number; nx: number; ny: number; nz: number;
  cells: Map<number, number[]>;
}

/** Lookup cell size, independent of mesh subdivision and world dimensions. */
const LIGHT_CELL = 8;

export function prepareLighting(lights: BakeLight[]): PreparedLighting {
  const sorted = [...lights].sort((a, b) => a.x - b.x);
  const n = sorted.length;
  const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n);
  const range = new Float32Array(n), range2 = new Float32Array(n), intensity = new Float32Array(n);
  const color = new Float32Array(n * 3);
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  sorted.forEach((light, k) => {
    x[k] = light.x; y[k] = light.y; z[k] = light.z;
    range[k] = light.range; range2[k] = light.range * light.range; intensity[k] = light.intensity;
    color.set(light.color, k * 3);
    // Include the rounded Float32 radius used by the actual distance test.
    const r = Math.sqrt(range2[k]);
    x0 = Math.min(x0, Math.floor((x[k] - r) / LIGHT_CELL));
    y0 = Math.min(y0, Math.floor((y[k] - r) / LIGHT_CELL));
    z0 = Math.min(z0, Math.floor((z[k] - r) / LIGHT_CELL));
    x1 = Math.max(x1, Math.floor((x[k] + r) / LIGHT_CELL));
    y1 = Math.max(y1, Math.floor((y[k] + r) / LIGHT_CELL));
    z1 = Math.max(z1, Math.floor((z[k] + r) / LIGHT_CELL));
  });
  const nx = n ? x1 - x0 + 1 : 0, ny = n ? y1 - y0 + 1 : 0, nz = n ? z1 - z0 + 1 : 0;
  const cells = new Map<number, number[]>();
  for (let k = 0; k < n; k++) {
    const r = Math.sqrt(range2[k]);
    for (let iz = Math.floor((z[k] - r) / LIGHT_CELL); iz <= Math.floor((z[k] + r) / LIGHT_CELL); iz++) {
      for (let iy = Math.floor((y[k] - r) / LIGHT_CELL); iy <= Math.floor((y[k] + r) / LIGHT_CELL); iy++) {
        for (let ix = Math.floor((x[k] - r) / LIGHT_CELL); ix <= Math.floor((x[k] + r) / LIGHT_CELL); ix++) {
          const key = (ix - x0) + nx * ((iy - y0) + ny * (iz - z0));
          const cell = cells.get(key);
          if (cell) cell.push(k);
          else cells.set(key, [k]);
        }
      }
    }
  }
  return { x, y, z, range, range2, intensity, color, x0, y0, z0, nx, ny, nz, cells };
}

/**
 * Bakes point lights into the vertex colors of a geometry built by MeshBuilder.
 * Uses |n.l| with wrap so both sides of thin surfaces pick up light, which keeps
 * the double-sided, unlit world forgiving about winding order.
 */
/** @param sky light from the open sky: full on surfaces facing up, less on walls, least underneath */
export function bakeLighting(geo: BufferGeometry, lights: BakeLight[] | PreparedLighting, ambient: RGB, from = 0, to = Infinity, sky: RGB | null = null): void {
  const pos = geo.getAttribute('position').array as Float32Array;
  const nor = geo.getAttribute('normal').array as Float32Array;
  const colAttr = geo.getAttribute('color');
  const col = colAttr.array as Float32Array;
  const prepared = Array.isArray(lights) ? prepareLighting(lights) : lights;
  const { x: lx, y: ly, z: lz, range: lr, range2: lr2, intensity: li, color: lc, x0, y0, z0, nx: cellsX, ny: cellsY, nz: cellsZ, cells } = prepared;
  const [ar, ag, ab] = ambient;
  const count = Math.min(to, pos.length / 3);
  // Neighbouring vertices mostly share a light cell, so the lookup is only redone when the cell changes.
  let lastCell = -2;
  let candidates: number[] | undefined;

  for (let i = from; i < count; i++) {
    const o = i * 3;
    const px = pos[o], py = pos[o + 1], pz = pos[o + 2];
    const nx = nor[o], ny = nor[o + 1], nz = nor[o + 2];
    let r = ar, g = ag, b = ab;
    if (sky) {
      const k = 0.5 + 0.5 * ny;
      r += sky[0] * k;
      g += sky[1] * k;
      b += sky[2] * k;
    }

    const ix = Math.floor(px / LIGHT_CELL) - x0;
    const iy = Math.floor(py / LIGHT_CELL) - y0;
    const iz = Math.floor(pz / LIGHT_CELL) - z0;
    const cell = ix >= 0 && ix < cellsX && iy >= 0 && iy < cellsY && iz >= 0 && iz < cellsZ ? ix + cellsX * (iy + cellsY * iz) : -1;
    if (cell !== lastCell) {
      candidates = cell >= 0 ? cells.get(cell) : undefined;
      lastCell = cell;
    }
    const n = candidates ? candidates.length : 0;
    for (let candidate = 0; candidate < n; candidate++) {
      const k = candidates![candidate];
      const dx = lx[k] - px, dy = ly[k] - py, dz = lz[k] - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > lr2[k]) continue;
      const d = Math.sqrt(d2) || 1e-4;
      const ndotl = Math.abs((nx * dx + ny * dy + nz * dz) / d);
      const wrap = 0.3 + 0.7 * ndotl;
      const fall = 1 - d / lr[k];
      const k2 = li[k] * wrap * fall * fall;
      r += lc[k * 3] * k2;
      g += lc[k * 3 + 1] * k2;
      b += lc[k * 3 + 2] * k2;
    }
    col[o] *= r;
    col[o + 1] *= g;
    col[o + 2] *= b;
  }
  colAttr.needsUpdate = true;
}
