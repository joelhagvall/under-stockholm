import { BufferAttribute, BufferGeometry, CanvasTexture, Float32BufferAttribute, ShapeUtils, SRGBColorSpace, Vector2 } from 'three';
import type { Ground } from './data';
import { project, WATER } from './geo';
import { extent, type Terrain } from './terrain';

/**
 * The city over the network view, in meters (x east, y up from the sea, z south), for a group the view scales down
 * and stretches upward: the ground with its hills and water, the buildings, and the face of the cut through them.
 */

/** Land and water drawn on the ground: the water from the heights where the grid reaches, else the rough polygons. */
export function groundTexture(reach: number, terrain: Terrain | null, ground: Ground): CanvasTexture {
  const size = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const px = (m: number) => ((m + reach) / (2 * reach)) * size;
  g.fillStyle = '#121a26';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#050b16';
  for (const poly of WATER) {
    g.beginPath();
    poly.forEach(([lat, lon], i) => {
      const p = project(lat, lon);
      if (i) g.lineTo(px(p.east), px(-p.north)); else g.moveTo(px(p.east), px(-p.north));
    });
    g.closePath();
    g.fill();
  }
  if (terrain) {
    // Inside the grid the heights know the shores better: the sea and the lakes lie at its bottom.
    const [w, e, s, n] = extent(terrain);
    const x0 = Math.floor(px(w)), x1 = Math.ceil(px(e)), y0 = Math.floor(px(-n)), y1 = Math.ceil(px(-s));
    const img = g.getImageData(x0, y0, x1 - x0, y1 - y0);
    const m = (2 * reach) / size;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const east = (x0 + x + 0.5) * m - reach, north = -((y0 + y + 0.5) * m - reach);
      const water = ground(east, north) < 0.6;
      const o = (y * img.width + x) * 4;
      img.data[o] = water ? 0x05 : 0x12; img.data[o + 1] = water ? 0x0b : 0x1a; img.data[o + 2] = water ? 0x16 : 0x26;
    }
    g.putImageData(img, x0, y0);
  }
  g.strokeStyle = 'rgba(160, 190, 230, 0.07)';
  g.lineWidth = 1;
  for (let m = -reach; m <= reach; m += 1000) {
    g.beginPath(); g.moveTo(px(m), 0); g.lineTo(px(m), size); g.stroke();
    g.beginPath(); g.moveTo(0, px(m)); g.lineTo(size, px(m)); g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * The ground as a sheet over the whole square `reach` out, fine where the grid has heights and coarse beyond, shaded
 * by its slopes as if lit from the north-west, with the ground texture's coordinates.
 */
export function groundGeometry(reach: number, terrain: Terrain | null, ground: Ground): BufferGeometry {
  const axis = (lo: number, hi: number, step: number) => {
    const out: number[] = [];
    for (let v = -reach; v < lo; v += 2000) out.push(v);
    for (let v = lo; v <= hi + 1e-6; v += step) out.push(v);
    for (let v = hi + 2000; v < reach; v += 2000) out.push(v);
    out.push(reach);
    return out;
  };
  const [w, e, s, n] = terrain ? extent(terrain) : [0, 0, 0, 0];
  const xs = terrain ? axis(w, e, terrain.step) : [-reach, reach];
  const ns = terrain ? axis(s, n, terrain.step) : [-reach, reach];
  const pos = new Float32Array(xs.length * ns.length * 3);
  const uv = new Float32Array(xs.length * ns.length * 2);
  const col = new Float32Array(xs.length * ns.length * 3);
  const d = 60;
  ns.forEach((north, j) => xs.forEach((east, i) => {
    const k = j * xs.length + i;
    const h = ground(east, north);
    pos.set([east, h, -north], k * 3);
    uv.set([(east + reach) / (2 * reach), (north + reach) / (2 * reach)], k * 2);
    // Light from the north-west, the slopes as steep as the view draws them at its steepest.
    const gx = (ground(east + d, north) - ground(east - d, north)) / (2 * d) * 8;
    const gn = (ground(east, north + d) - ground(east, north - d)) / (2 * d) * 8;
    const lit = Math.max(0.35, Math.min(1.6, 1 + (-gx + gn) * 0.7 + Math.min(h, 60) / 150));
    col.set([lit, lit, lit * 1.05], k * 3);
  }));
  const index: number[] = [];
  for (let j = 0; j < ns.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const a = j * xs.length + i, b = a + 1, c = a + xs.length, dd = c + 1;
    index.push(a, dd, b, a, c, dd);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

/** A tile of buildings as `scripts/osm-city.ts` writes it. */
export interface CityTile {
  tile: number;
  grain: number;
  buildings: number[][];
}

/**
 * A tile's buildings as one mesh: walls and flat roofs, each standing on the lowest ground under its corners, the
 * walls lighter toward the top and by which way they face, the roofs lightest. `name` is the file's, its south-west
 * corner in kilometers.
 */
export function cityGeometry(name: string, data: CityTile, ground: Ground): BufferGeometry {
  const [ox, oy] = name.split('_').map((v) => Number(v) * 1000);
  const pos: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  const corner = new Vector2();
  for (const b of data.buildings) {
    const height = b[0];
    const ring: Vector2[] = [];
    let x = 0, y = 0;
    for (let k = 1; k + 1 < b.length; k += 2) {
      x += b[k];
      y += b[k + 1];
      ring.push(new Vector2(ox + x * data.grain, oy + y * data.grain));
    }
    if (ring.length < 3) continue;
    let base = Infinity;
    for (const p of ring) base = Math.min(base, ground(p.x, p.y));
    base -= 1;
    const top = base + height + 1;
    // Walls.
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], c = ring[(k + 1) % ring.length];
      corner.subVectors(c, a).normalize();
      // Facing: the outward normal's share toward the north-west light, either way round the ring.
      const lit = 0.55 + 0.25 * Math.abs(corner.y * -0.7 + corner.x * 0.7);
      const i = pos.length / 3;
      pos.push(a.x, base, -a.y, c.x, base, -c.y, c.x, top, -c.y, a.x, top, -a.y);
      const lo = lit * 0.35;
      col.push(lo, lo, lo * 1.1, lo, lo, lo * 1.1, lit, lit, lit * 1.1, lit, lit, lit * 1.1);
      index.push(i, i + 1, i + 2, i, i + 2, i + 3);
    }
    // The roof.
    const i = pos.length / 3;
    for (const p of ring) { pos.push(p.x, top, -p.y); col.push(1, 1, 1.08); }
    for (const [a, c, d] of ShapeUtils.triangulateShape(ring, [])) index.push(i + a, i + c, i + d);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

/** Points along the face of the cut. */
export const SECTION_POINTS = 400;
/** How deep the face of the cut reaches, in meters under the sea. */
const SECTION_FLOOR = 70;

/** The face of the cut and the line of the ground along its top, for `section` to fill. */
export function sectionGeometry(): { face: BufferGeometry; edge: BufferGeometry } {
  const face = new BufferGeometry();
  face.setAttribute('position', new BufferAttribute(new Float32Array(SECTION_POINTS * 2 * 3), 3));
  face.setAttribute('color', new BufferAttribute(new Float32Array(SECTION_POINTS * 2 * 4), 4));
  const index: number[] = [];
  for (let k = 0; k < SECTION_POINTS - 1; k++) {
    const a = k * 2;
    index.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  face.setIndex(index);
  const edge = new BufferGeometry();
  edge.setAttribute('position', new BufferAttribute(new Float32Array(SECTION_POINTS * 3), 3));
  return { face, edge };
}

/**
 * Fills the face of the cut: a wall through (`east`, `north`) along (`dx`, `dn`) for `half` meters either way, from
 * the ground down to under the deepest station, the soil warm at the top and the rock fading into the dark below, the
 * water a band of blue over it.
 */
export function section(geo: { face: BufferGeometry; edge: BufferGeometry }, ground: Ground, east: number, north: number, dx: number, dn: number, half: number): void {
  const pos = geo.face.getAttribute('position') as BufferAttribute;
  const col = geo.face.getAttribute('color') as BufferAttribute;
  const line = geo.edge.getAttribute('position') as BufferAttribute;
  for (let k = 0; k < SECTION_POINTS; k++) {
    const s = (k / (SECTION_POINTS - 1) * 2 - 1) * half;
    const e = east + dx * s, n = north + dn * s;
    const h = ground(e, n);
    const water = h < 0.6;
    pos.setXYZ(k * 2, e, h, -n);
    pos.setXYZ(k * 2 + 1, e, -SECTION_FLOOR, -n);
    line.setXYZ(k, e, h, -n);
    // Fading out toward the ends, so the wall has no edge.
    const end = Math.min(1, (1 - Math.abs(s) / half) * 5);
    if (water) col.setXYZW(k * 2, 0.16, 0.34, 0.6, 0.55 * end);
    else col.setXYZW(k * 2, 0.5, 0.42, 0.33, 0.45 * end);
    col.setXYZW(k * 2 + 1, 0.2, 0.22, 0.26, 0);
  }
  pos.needsUpdate = col.needsUpdate = line.needsUpdate = true;
  geo.face.computeBoundingSphere();
  geo.edge.computeBoundingSphere();
}
