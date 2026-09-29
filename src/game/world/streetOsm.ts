import { ConeGeometry, CylinderGeometry, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, ShapeUtils, SphereGeometry, Vector2, Vector3 } from 'three';
import { hash01 } from '../clock';
import { MeshBuilder } from '../gfx/builder';
import { mix, rgb, type RGB } from '../gfx/color';
import { fbm3 } from '../gfx/noise';
import type { Physics, StaticCollider } from '../physics';
import { oldFacadeTexture } from './city';
import { facadeTexture } from './outdoor';
import type { Section } from './section';
import { place, textSign } from './signage';
import type { Rect } from './street';

/**
 * The real city round an exit, from OpenStreetMap (© OpenStreetMap
 * contributors, ODbL; fetched by `scripts/osm-streets.ts`): the buildings,
 * the streets with their names, parks, woods, water and trees, laid round the
 * square that `street.ts` builds at the top of the stairs. Underground the map
 * is moved so the real entrance lies where the stairs come up; in the open it
 * lies as the buildings along the tracks do, so those that stand taller than
 * the street is high stay hidden inside their twins up here.
 *
 * The ground is laid in layers a few centimetres apart (the base, then parks,
 * then squares, water, paths and roads on top), all under the square's paving,
 * which the colliders follow.
 */

/** A street file as `scripts/osm-streets.ts` writes it: see its `format`. */
export interface StreetFile {
  entrance: [number, number] | null;
  urban: boolean;
  names: string[];
  trees: number[];
  buildings: Array<Array<number | null>>;
  roads: number[][];
  areas: number[][];
}


export interface StreetPlace {
  /** Street level: the square's paving. */
  y: number;
  /** World x and z of the data's origin, the station's middle as the file has it. */
  ox: number;
  oz: number;
  /** The square: the ground round it is laid up to its edge, and nothing is built on it. */
  square: Rect;
  /** More kept clear of buildings (a hall's own building). */
  clear: Rect[];
  /** Where one can walk: the walls within it get colliders. */
  walk: Rect;
  /** Walls moved out this far (in the open, over the buildings along the tracks). */
  inflate: number;
  /** A number of the street's own, for the choices made by chance. */
  seed: number;
}

export interface StreetOsm {
  colliders: StaticCollider[];
  /** Lit windows, faded in as it gets dark with the square's own. */
  windows: Mesh | null;
}

/** How far out the ground is laid from the middle of the square: the fog closes in before. */
const GROUND_REACH = 420;
/** Heights of the ground's layers under the paving. */
const LAYER = { base: -0.25, grass: -0.2, wood: -0.18, paved: -0.15, water: -0.12, path: -0.09, road: -0.05 };
const PAVING = (p: Vector3): RGB => mix(rgb(0xa8a49c), rgb(0xc4c0b6), fbm3(p.x * 0.4, 0, p.z * 0.4, 2, 601));
const ASPHALT = (p: Vector3): RGB => mix(rgb(0x37383b), rgb(0x4b4c50), fbm3(p.x * 0.3, 0, p.z * 0.3, 3, 602));
const PLINTH = (p: Vector3): RGB => mix(rgb(0x6c665e), rgb(0x857e74), fbm3(p.x * 0.3, p.y * 0.3, p.z * 0.3, 2, 603));
const GRASS = (p: Vector3): RGB => mix(rgb(0x4d6a34), rgb(0x7a8f48), fbm3(p.x * 0.05, 0, p.z * 0.05, 3, 311) * 0.8 + fbm3(p.x * 0.6, 0, p.z * 0.6, 1, 312) * 0.25);
const WOOD = (p: Vector3): RGB => mix(rgb(0x2e4a26), rgb(0x46603a), fbm3(p.x * 0.08, 0, p.z * 0.08, 3, 313));
const WATER = (p: Vector3): RGB => mix(rgb(0x5a7c98), rgb(0x9ab4c8), fbm3(p.x * 0.02, 0, p.z * 0.03, 3, 501) * 0.7 + fbm3(p.x * 0.3, 0, p.z * 0.1, 2, 502) * 0.3);
const GRAVEL = (p: Vector3): RGB => mix(rgb(0xa89c86), rgb(0xc2b8a2), fbm3(p.x * 0.5, 0, p.z * 0.5, 2, 604));
const SAND = (p: Vector3): RGB => mix(rgb(0xd2c29a), rgb(0xe2d6b2), fbm3(p.x * 0.5, 0, p.z * 0.5, 2, 605));
/** By area kind (see the file's `format`): paint and height. */
const GROUNDS: Array<[(p: Vector3) => RGB, number]> = [[GRASS, LAYER.grass], [WOOD, LAYER.wood], [WATER, LAYER.water], [PAVING, LAYER.paved], [ASPHALT, LAYER.paved], [SAND, LAYER.paved]];
/** Inner city plaster, as on the square's own houses; the suburbs' blocks of flats; villas. */
const PLASTER = [0xe0bf6a, 0xebdcbc, 0xd08a4a, 0xd9a090, 0xc6bfae, 0xe6cf98, 0xb86a4a, 0xd8d0bc];
const FLATS = [0xe8dcc0, 0xc86a4a, 0xf0e2a8, 0xe6e6e0, 0xb8c4c8, 0xd8c8a8, 0xb86a4a];
const HOUSES = [0x9a3a2c, 0xe0c886, 0xeeeae2, 0xc9d0d2, 0xd8b890, 0x8e3428];
const TIN = rgb(0x5c6064);
const PITCHED_ROOFS = [0x5a2e26, 0x3a3634, 0x6e3a2c, 0x2e3236];
const WINDOW_LIGHT = [0xffd89a, 0xfff0c8, 0xffc574, 0xf4e6d0];
/** Each facade texture's tile, and where the glass sits in it, in meters (see `oldFacadeTexture`, `facadeTexture`). */
const GLASS = { old: { tile: 3.2, u0: 1.05, u1: 2.15, v0: 0.75, v1: 2.65 }, flats: { tile: 3, u0: 0.66, u1: 2.34, v0: 0.84, v1: 2.25 } };
/** A stone ground floor with shop windows, in the city. */
const PLINTH_H = 3.8;
const LAMP = rgb(0xffe2b0);

/** Unpacks a list of points (decimeters, each from the one before) from `k` on, `n` of them, into world meters. */
function points(list: ReadonlyArray<number | null>, k: number, n: number, ox: number, oz: number): Vector2[] {
  const out: Vector2[] = [];
  let x = 0, z = 0;
  for (let i = 0; i < n; i++) {
    x += list[k + 2 * i] as number;
    z += list[k + 2 * i + 1] as number;
    out.push(new Vector2(ox + x / 10, oz + z / 10));
  }
  return out;
}

const hits = (r: Rect, x0: number, x1: number, z0: number, z1: number) => x1 > r.x0 && x0 < r.x1 && z1 > r.z0 && z0 < r.z1;
const within = (r: Rect, x: number, z: number, margin = 0) => x > r.x0 - margin && x < r.x1 + margin && z > r.z0 - margin && z < r.z1 + margin;

/** Where the file's origin goes: underground, so its entrance lies at the top of the stairs (`stairs`, world x at z = 0). */
export function streetOrigin(file: StreetFile, cx: number, stairs: number): { ox: number; oz: number } {
  if (!file.entrance) return { ox: cx, oz: 0 };
  return { ox: stairs - file.entrance[0] / 10, oz: -file.entrance[1] / 10 };
}

/**
 * The real city round a street, into `s`, with colliders for the walls one can walk up to in `physics`: in steps, the
 * ground, the roads and every so many buildings each a step of their own, so a street built on the way costs a little
 * each frame.
 */
export function* streetOsmSteps(s: Section, physics: Physics, file: StreetFile, at: StreetPlace): Generator<void, StreetOsm> {
  const { y: G, ox, oz, square: SQ, walk } = at;
  const cx = (SQ.x0 + SQ.x1) / 2, cz = (SQ.z0 + SQ.z1) / 2;
  const colliders: StaticCollider[] = [];
  const r = (k: number, salt: number) => hash01(at.seed * 7919 + k, salt);

  // The base, out to the fog, round the square.
  const base = file.urban ? PAVING : GRASS;
  const [X0, X1, Z0, Z1] = [cx - GROUND_REACH, cx + GROUND_REACH, cz - GROUND_REACH, cz + GROUND_REACH];
  const flat = (b: MeshBuilder, x0: number, x1: number, z0: number, z1: number, y: number, paint: (p: Vector3) => RGB, cell: number) => {
    if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return;
    b.gridQuad(new Vector3(x0, y, z0), new Vector3(x0, y, z1), new Vector3(x1, y, z1), new Vector3(x1, y, z0), paint, cell);
  };
  const yb = G + LAYER.base;
  flat(s.lit, X0, X1, Z0, SQ.z0, yb, base, 12);
  flat(s.lit, X0, X1, SQ.z1, Z1, yb, base, 12);
  flat(s.lit, X0, SQ.x0, SQ.z0, SQ.z1, yb, base, 12);
  flat(s.lit, SQ.x1, X1, SQ.z0, SQ.z1, yb, base, 12);

  /** A flat polygon (outer ring, then holes) facing up at `y`, unless it lies under the square. */
  const polygon = (rings: Vector2[][], y: number, paint: (p: Vector3) => RGB) => {
    const [outer, ...holes] = rings;
    if (outer.length < 3) return;
    const all = [...outer, ...holes.flat()];
    const a = new Vector3(), b = new Vector3(), c = new Vector3();
    for (const [i, j, k] of ShapeUtils.triangulateShape(outer, holes)) {
      a.set(all[i].x, y, all[i].y);
      b.set(all[j].x, y, all[j].y);
      c.set(all[k].x, y, all[k].y);
      if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) >= 0) s.lit.tri(a, b, c, paint);
      else s.lit.tri(a, c, b, paint);
    }
  };

  yield;
  // Parks, woods, water and squares.
  for (const area of file.areas) {
    const kind = area[0];
    const rings: Vector2[][] = [];
    for (let k = 1; k < area.length;) {
      const n = area[k];
      rings.push(points(area, k + 1, n, ox, oz));
      k += 1 + 2 * n;
    }
    const [paint, dy] = GROUNDS[kind] ?? GROUNDS[0];
    polygon(rings, G + dy, paint);
  }

  yield;
  // Roads, pedestrian streets and paths: a strip along each, overlapping at the bends.
  const roadPaint = [ASPHALT, PAVING, GRAVEL];
  const roadY = [LAYER.road, LAYER.road, LAYER.path];
  const roads = file.roads.map((road) => ({ kind: road[0], width: road[1] / 10, name: road[2], line: points(road, 3, (road.length - 3) / 2, ox, oz) }));
  for (const { kind, width, line } of roads) {
    const y = G + roadY[kind];
    const w = width / 2;
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i], b = line[i + 1];
      const d = b.clone().sub(a);
      const len = d.length();
      if (len < 0.01) continue;
      d.divideScalar(len);
      // Reaching past each end by half the width, so a bend has no gap.
      const ext = i + 2 < line.length ? w : 0;
      const pre = i > 0 ? w : 0;
      const [ax, az] = [a.x - d.x * pre, a.y - d.y * pre];
      const [bx, bz] = [b.x + d.x * ext, b.y + d.y * ext];
      const [nx, nz] = [-d.y * w, d.x * w];
      const p = [new Vector3(ax + nx, y, az + nz), new Vector3(bx + nx, y, bz + nz), new Vector3(bx - nx, y, bz - nz), new Vector3(ax - nx, y, az - nz)];
      const up = (p[1].z - p[0].z) * (p[2].x - p[0].x) - (p[1].x - p[0].x) * (p[2].z - p[0].z) >= 0;
      const cells = within(walk, (ax + bx) / 2, (az + bz) / 2, 40) ? 4 : 30;
      if (up) s.lit.gridQuad(p[0], p[1], p[2], p[3], roadPaint[kind], cells);
      else s.lit.gridQuad(p[3], p[2], p[1], p[0], roadPaint[kind], cells);
    }
  }

  // Buildings: walls with the facade's storeys running round from the first corner, a stone ground floor in the city,
  // flat tin roofs or pitched ones over houses, and colliders on the walls within reach.
  const texture = file.urban ? oldFacadeTexture() : facadeTexture();
  const glass = file.urban ? GLASS.old : GLASS.flats;
  const facade = s.artLayer(texture);
  const lit = s.dry ? null : new MeshBuilder();
  const walls: Array<{ a: Vector2; b: Vector2; n: Vector2 }> = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), d = new Vector3();
  const up = (p: Vector3, q: Vector3, t: Vector3, paint: RGB) => {
    if ((q.z - p.z) * (t.x - p.x) - (q.x - p.x) * (t.z - p.z) >= 0) s.lit.tri(p, q, t, paint);
    else s.lit.tri(p, t, q, paint);
  };
  yield;
  for (const [k, bd] of file.buildings.entries()) {
    if (k % 40 === 39) yield;
    let ring = points(bd, 3, (bd.length - 3) / 2, ox, oz);
    // Outside in: walls face out when the ring runs counterclockwise seen from above (the shoelace sum in x, z negative).
    let sum = 0;
    for (let i = 0; i < ring.length; i++) sum += ring[i].x * ring[(i + 1) % ring.length].y - ring[(i + 1) % ring.length].x * ring[i].y;
    if (sum > 0) ring.reverse();
    if (at.inflate) ring = inflated(ring, at.inflate);
    const xs = ring.map((p) => p.x), zs = ring.map((p) => p.y);
    const [bx0, bx1, bz0, bz1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    if ([SQ, ...at.clear].some((q) => hits(q, bx0 - 1, bx1 + 1, bz0 - 1, bz1 + 1))) continue;
    const height = (bd[0] as number) / 10;
    const pitched = bd[2] === 1 && ring.length === 4;
    const kind = pitched ? HOUSES : file.urban ? PLASTER : FLATS;
    const colour = rgb((bd[1] as number | null) ?? kind[Math.floor(r(k, 71) * kind.length)]);
    const roof = pitched ? pitchedRoof(ring, height, G) : null;
    const top = G + (roof ? roof.eaves : height);
    const plinth = file.urban && height > 6 ? G + PLINTH_H : G - 0.5;
    const near = Math.hypot((bx0 + bx1) / 2 - cx, (bz0 + bz1) / 2 - cz) < 160;
    let u = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const len = p.distanceTo(q);
      if (len < 0.05) continue;
      const n = new Vector2(-(q.y - p.y) / len, (q.x - p.x) / len);
      walls.push({ a: p, b: q, n });
      if (plinth > G) {
        a.set(p.x, G - 0.5, p.y); b.set(q.x, G - 0.5, q.y); c.set(q.x, plinth, q.y); d.set(p.x, plinth, p.y);
        s.lit.tri(a, b, c, PLINTH);
        s.lit.tri(a, c, d, PLINTH);
        // Shop windows and doors along the ground floor, lit from inside.
        for (let v = 1.2, m = 0; v + 2.6 < len - 0.8; v += 4, m++) {
          const door = hash01(k * 17 + i * 5 + m, 610) < 0.3;
          const paint = door ? rgb(0x3a2e26) : hash01(k * 17 + i * 5 + m, 611) < 0.8 ? rgb(0xf2d9a6) : rgb(0x2c3036);
          const [y0, y1] = door ? [G, G + 2.5] : [G + 0.6, G + 3.1];
          const f = (t: number, y: number) => new Vector3(p.x + ((q.x - p.x) * t) / len + n.x * 0.04, y, p.y + ((q.y - p.y) * t) / len + n.y * 0.04);
          s.unlit.quad(f(v, y0), f(v + 2.6, y0), f(v + 2.6, y1), f(v, y1), paint);
        }
      }
      a.set(p.x, plinth, p.y); b.set(q.x, plinth, q.y); c.set(q.x, top, q.y); d.set(p.x, top, p.y);
      facade.tri(a, b, c, colour, { uvs: [[u, plinth], [u + len, plinth], [u + len, top]] });
      facade.tri(a, c, d, colour, { uvs: [[u, plinth], [u + len, top], [u, top]] });
      // After dark some windows are lit, on a mesh the weather fades in: the glass of the facade's own tiles.
      if (lit && near) {
        for (let t = Math.ceil((u - glass.u0) / glass.tile); t * glass.tile + glass.u1 <= u + len; t++) {
          for (let row = Math.ceil((Math.max(plinth, G + 0.5) - glass.v0) / glass.tile); row * glass.tile + glass.v1 <= top - 0.3; row++) {
            const h = k * 997 + t * 31 + row;
            if (hash01(h, 630) > 0.3) continue;
            const paint = rgb(WINDOW_LIGHT[Math.floor(hash01(h, 631) * WINDOW_LIGHT.length)]);
            const [s0, s1] = [t * glass.tile + glass.u0 - u, t * glass.tile + glass.u1 - u];
            const [y0, y1] = [row * glass.tile + glass.v0, row * glass.tile + glass.v1];
            const f = (w: number, y: number) => new Vector3(p.x + ((q.x - p.x) * w) / len + n.x * 0.05 - ox, y, p.y + ((q.y - p.y) * w) / len + n.y * 0.05 - oz);
            lit.quad(f(s0, y0), f(s1, y0), f(s1, y1), f(s0, y1), paint);
          }
        }
      }
      u += len;
      // A wall one can walk up to stops one.
      if (within(walk, p.x, p.y, 4) || within(walk, q.x, q.y, 4)) {
        colliders.push(physics.turnedBox({ x: (p.x + q.x) / 2, y: G + 3, z: (p.y + q.y) / 2 }, { x: len / 2, y: 3.5, z: 0.25 }, Math.atan2(-(q.y - p.y), q.x - p.x)));
      }
    }
    if (roof) {
      const tiles = rgb(PITCHED_ROOFS[Math.floor(r(k, 72) * PITCHED_ROOFS.length)]);
      const [p0, p1, p2, p3] = roof.corners;
      const [r0, r1] = roof.ridge;
      up(p0, p1, r1, tiles);
      up(p0, r1, r0, tiles);
      up(p2, p3, r0, tiles);
      up(p2, r0, r1, tiles);
      s.lit.tri(p1, p2, r1, colour);
      s.lit.tri(p3, p0, r0, colour);
      continue;
    }
    const all = ring.map((p) => new Vector3(p.x, top, p.y));
    for (const [i, j, l] of ShapeUtils.triangulateShape(ring, [])) up(all[i], all[j], all[l], file.urban ? TIN : rgb(0x3a3634));
  }
  yield;

  // Trees where OSM has them, clear of the square.
  const m = new Matrix4();
  const trunk = new CylinderGeometry(0.18, 0.26, 2.8, 5);
  const crown = new SphereGeometry(2.4, 7, 5);
  const pine = new ConeGeometry(2.1, 7.5, 7);
  for (const [k, t] of points(file.trees, 0, file.trees.length / 2, ox, oz).entries()) {
    if ([SQ, ...at.clear].some((q) => within(q, t.x, t.y, 1))) continue;
    s.lit.geometry(trunk, m.makeTranslation(t.x, G + 1.2, t.y), rgb(0x4e3e30));
    if (!file.urban && r(k, 73) < 0.3) s.lit.geometry(pine, m.makeTranslation(t.x, G + 5.4, t.y), mix(rgb(0x1f4028), rgb(0x345a34), r(k, 74)));
    else s.lit.geometry(crown, m.makeScale(1, 1.15, 1).setPosition(t.x, G + 4.8, t.y), mix(rgb(0x4a7a30), rgb(0x86a846), r(k, 74)));
  }
  trunk.dispose();
  crown.dispose();
  pine.dispose();

  // Street lamps along the roads one can walk to, every 28 m, on alternate sides.
  let lamps = 0;
  for (const { kind, width, line } of roads) {
    if (kind === 2) continue;
    let carry = 14;
    for (let i = 0; i + 1 < line.length && lamps < 24; i++) {
      const a0 = line[i], a1 = line[i + 1];
      const len = a0.distanceTo(a1);
      for (let t = carry; t < len && lamps < 24; t += 28) {
        const dir = a1.clone().sub(a0).divideScalar(len);
        const side = (lamps % 2) * 2 - 1;
        const x = a0.x + dir.x * t - dir.y * side * (width / 2 + 0.8);
        const z = a0.y + dir.y * t + dir.x * side * (width / 2 + 0.8);
        if (!within(walk, x, z) || [SQ, ...at.clear].some((q) => within(q, x, z, 1))) continue;
        s.lit.box({ x: x - 0.07, y: G, z: z - 0.07 }, { x: x + 0.07, y: G + 5.4, z: z + 0.07 }, rgb(0x2e3238));
        s.unlit.box({ x: x - 0.25, y: G + 5.1, z: z - 0.18 }, { x: x + 0.25, y: G + 5.3, z: z + 0.18 }, LAMP);
        s.light(x, G + 5, z, rgb(0xffdca8), 1.1, 13);
        colliders.push(physics.box({ x: x - 0.12, y: G, z: z - 0.12 }, { x: x + 0.12, y: G + 3, z: z + 0.12 }));
        lamps++;
      }
      carry = Math.max(0, carry - len);
    }
  }

  // The streets' names, in white on blue, on the nearest house at each corner of the square's neighbourhood.
  if (!s.dry) streetSigns(s, roads, walls, file.names, cx, cz, G);

  let windows: Mesh | null = null;
  if (lit && lit.vertexCount) {
    const geo = lit.build();
    geo.deleteAttribute('normal');
    windows = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }));
    windows.position.set(ox, 0, oz);
    s.extras.add(windows);
  }
  return { colliders, windows };
}

/** A sign with each street's name within reach: on the wall of a house along it, or else on a post by the kerb. */
function streetSigns(s: Section, roads: Array<{ kind: number; width: number; name: number; line: Vector2[] }>, walls: Array<{ a: Vector2; b: Vector2; n: Vector2 }>, names: string[], cx: number, cz: number, G: number): void {
  const centre = new Vector2(cx, cz);
  const best = new Map<number, { p: Vector2; d: Vector2; width: number; dist: number }>();
  for (const road of roads) {
    if (road.name < 0) continue;
    for (let i = 0; i + 1 < road.line.length; i++) {
      const a = road.line[i], b = road.line[i + 1];
      const ab = b.clone().sub(a);
      const len = ab.length();
      if (len < 1) continue;
      const t = Math.max(0, Math.min(1, centre.clone().sub(a).dot(ab) / (len * len)));
      const p = a.clone().addScaledVector(ab, t);
      const dist = p.distanceTo(centre);
      const known = best.get(road.name);
      if (dist < 110 && (!known || dist < known.dist)) best.set(road.name, { p, d: ab.divideScalar(len), width: road.width, dist });
    }
  }
  for (const [name, { p, d, width }] of [...best].sort((x, y) => x[1].dist - y[1].dist).slice(0, 6)) {
    const sign = textSign(names[name], 512, 96, '#1d3f8c', '#ffffff');
    // The wall nearest the kerb that runs along the street.
    let wall: { at: Vector2; n: Vector2 } | null = null;
    let near = Infinity;
    for (const w of walls) {
      const ab = w.b.clone().sub(w.a);
      const len = ab.length();
      if (len < 3 || Math.abs(ab.dot(d)) / len < 0.9) continue;
      const t = Math.max(0.1, Math.min(0.9, p.clone().sub(w.a).dot(ab) / (len * len)));
      const at = w.a.clone().addScaledVector(ab, t);
      const off = at.distanceTo(p);
      // Facing the street, a pavement's width back from the kerb.
      if (off < width / 2 + 0.5 || off > width / 2 + 14 || w.n.dot(p.clone().sub(at)) <= 0) continue;
      if (off < near) { near = off; wall = { at, n: w.n }; }
    }
    if (wall) {
      place(s, sign, 2.2, 0.42, new Vector3(wall.at.x, G + 3.4, wall.at.y), new Vector3(wall.n.x, 0, wall.n.y));
      continue;
    }
    // No house there: a post at the kerb, the name on both faces across the street's line.
    const side = new Vector2(-d.y, d.x);
    const at = p.clone().addScaledVector(side, width / 2 + 1.2);
    s.lit.box({ x: at.x - 0.05, y: G, z: at.y - 0.05 }, { x: at.x + 0.05, y: G + 3.2, z: at.y + 0.05 }, rgb(0x5a6068));
    for (const f of [1, -1]) place(s, sign, 1.6, 0.3, new Vector3(at.x, G + 3, at.y), new Vector3(side.x * f, 0, side.y * f));
  }
}

/** A ring moved out by `by` at every corner (mitred, and never more than twice as far at a sharp one). */
function inflated(ring: Vector2[], by: number): Vector2[] {
  const n = ring.length;
  const normal = (p: Vector2, q: Vector2) => {
    const len = p.distanceTo(q) || 1;
    return new Vector2(-(q.y - p.y) / len, (q.x - p.x) / len);
  };
  return ring.map((p, i) => {
    const n0 = normal(ring[(i + n - 1) % n], p), n1 = normal(p, ring[(i + 1) % n]);
    // Along the bisector, as far as keeps both walls `by` out: `by` over the cosine of half the turn.
    const m = n0.clone().add(n1);
    const half = m.length() / 2;
    return half < 0.05 ? p.clone().addScaledVector(n1, by) : p.clone().addScaledVector(m.normalize(), Math.min(2 * by, by / half));
  });
}

/** A pitched roof over a four-cornered house, as over the ones along the tracks (see `osm.ts`), at street level `G`. */
function pitchedRoof(ring: Vector2[], height: number, G: number): { eaves: number; corners: Vector3[]; ridge: [Vector3, Vector3] } {
  const side = (i: number) => ring[i].distanceTo(ring[(i + 1) % 4]);
  const turn = side(0) + side(2) >= side(1) + side(3) ? 0 : 1;
  const short = Math.min(side(1 - turn), side(3 - turn));
  const rise = Math.min(3, 0.4 * short);
  const eaves = Math.max(2.4, height - rise);
  const corners = [0, 1, 2, 3].map((i) => new Vector3(ring[(i + turn) % 4].x, G + eaves, ring[(i + turn) % 4].y));
  const mid = (p: Vector3, q: Vector3) => new Vector3((p.x + q.x) / 2, G + eaves + rise, (p.z + q.z) / 2);
  return { eaves, corners, ridge: [mid(corners[3], corners[0]), mid(corners[1], corners[2])] };
}
