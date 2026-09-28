import { ShapeUtils, Vector2, Vector3 } from 'three';
import { hash01 } from '../clock';
import { mix, rgb, type RGB } from '../gfx/color';
import { fbm3 } from '../gfx/noise';
import type { MeshBuilder } from '../gfx/builder';
import type { Section } from './section';

/**
 * The real buildings round a station in the open air, from OpenStreetMap
 * (© OpenStreetMap contributors, ODbL; fetched by `scripts/osm.ts`). The map
 * is turned so the real tracks run along +x through the platform's middle,
 * and what stands within `OSM_HALF_X` of the station along the line replaces
 * the made-up blocks of flats there. The line is straight in the game and
 * curves in life, so only the neighbourhood of each station is true to it.
 *
 * Each line's buildings are a file of their own (`osm/<line>.json`), fetched
 * the first time a build near one of its stations asks for them (`OsmData`):
 * they stay out of the game's download until the player heads out into the
 * open. A build that needs them waits in the queue until they are here.
 */

/** How far along the line either side of a station's middle its real buildings reach. */
export const OSM_HALF_X = 230;
/** How far out to either side the ground is laid under them. */
const OSM_REACH = 285;

/** A station's buildings, in world coordinates. */
export interface OsmPatch {
  x0: number;
  x1: number;
  buildings: OsmBuilding[];
}

interface OsmBuilding {
  /** To the roof, or to the ridge of a pitched one. */
  height: number;
  colour: number | null;
  /** A house with a pitched roof (see `pitchedRoof`). */
  pitched: boolean;
  /** The footprint, x then z, wound so its walls face out (counterclockwise seen from above). */
  ring: number[];
  /** Its extent, for quick tests. */
  min: [number, number];
  max: [number, number];
}

/** A line's file: each station's buildings as `scripts/osm.ts` wrote them. */
type OsmFile = Record<string, Array<Array<number | null>>>;

const FACADES = [0xe8dcc0, 0xc86a4a, 0xf0e2a8, 0xe6e6e0, 0xb8c4c8, 0xd8c8a8, 0xb86a4a];
/** Villas and terraced houses: Falu red, ochre, white, pale grey and sand. */
const HOUSE_FACADES = [0x9a3a2c, 0xe0c886, 0xeeeae2, 0xc9d0d2, 0xd8b890, 0x8e3428];
const ROOF = rgb(0x3a3634);
/** Tiles and sheet metal on pitched roofs. */
const PITCHED_ROOFS = [0x5a2e26, 0x3a3634, 0x6e3a2c, 0x2e3236];
const GRASS = (p: Vector3): RGB => mix(rgb(0x4d6a34), rgb(0x7a8f48), fbm3(p.x * 0.05, 0, p.z * 0.05, 3, 311));

/** Where each line's file is served, by line id. Vite fills it in at build time; asked only when a line is wanted, so tests under Bun never reach it. */
function fileUrls(): Record<string, string> {
  const found = import.meta.glob<string>('./osm/*.json', { query: '?url', import: 'default', eager: true });
  return Object.fromEntries(Object.entries(found).map(([path, url]) => [path.replace(/^.*\/|\.json$/g, ''), url]));
}

/** The lines' files, each fetched once when first wanted. The world owns it, so it goes with the world. */
export class OsmData {
  /** Each line's stations, or null while its file is on the way. */
  private readonly files = new Map<string, OsmFile | null>();
  private urls: Record<string, string> | null = null;

  /** Are `line`'s buildings here (or is there nothing to fetch)? Starts fetching them if not. */
  ready(line: string): boolean {
    const known = this.files.get(line);
    if (known !== undefined) return known !== null;
    this.urls ??= fileUrls();
    const url = this.urls[line];
    if (!url) {
      this.files.set(line, {});
      return true;
    }
    this.files.set(line, null);
    // Offline or refused: the made-up blocks of flats stand in, rather than a build that never comes.
    fetch(url).then((r) => (r.ok ? r.json() : { stations: {} })).catch(() => ({ stations: {} }))
      .then((f: { stations?: OsmFile }) => this.files.set(line, f.stations ?? {}));
    return false;
  }

  /** The real buildings round the station `name` of `line` at `cx`, or null where there are none (or not yet). */
  patch(line: string, name: string, cx: number): OsmPatch | null {
    const raw = this.files.get(line)?.[name];
    if (!raw) return null;
    const buildings = raw.map((b): OsmBuilding => {
      // Decimeters: the first corner from the station's middle, each next from the one before.
      const ring: number[] = [];
      let x = 0, z = 0;
      for (let i = 3; i + 1 < b.length; i += 2) {
        x += b[i] as number;
        z += b[i + 1] as number;
        ring.push(cx + x / 10, z / 10);
      }
      // Walls face out when the ring runs counterclockwise seen from above (x right, z down): the shoelace sum in (x, z) negative.
      let area = 0;
      for (let i = 0; i < ring.length; i += 2) {
        const j = (i + 2) % ring.length;
        area += ring[i] * ring[j + 1] - ring[j] * ring[i + 1];
      }
      if (area > 0) {
        const flipped: number[] = [];
        for (let i = ring.length - 2; i >= 0; i -= 2) flipped.push(ring[i], ring[i + 1]);
        ring.splice(0, ring.length, ...flipped);
      }
      const xs = ring.filter((_, i) => i % 2 === 0);
      const zs = ring.filter((_, i) => i % 2 === 1);
      return { height: (b[0] as number) / 10, colour: b[1], pitched: b[2] === 1, ring, min: [Math.min(...xs), Math.min(...zs)], max: [Math.max(...xs), Math.max(...zs)] };
    });
    return { x0: cx - OSM_HALF_X, x1: cx + OSM_HALF_X, buildings };
  }
}

/** Is (`x`, `z`) within `margin` of a building in any of `patches`? */
export function nearBuilding(patches: readonly OsmPatch[], x: number, z: number, margin: number): boolean {
  for (const p of patches) {
    if (x < p.x0 - 60 || x > p.x1 + 60) continue;
    for (const b of p.buildings) {
      if (x > b.min[0] - margin && x < b.max[0] + margin && z > b.min[1] - margin && z < b.max[1] + margin) return true;
    }
  }
  return false;
}

/**
 * Builds a patch's buildings in `s`, their walls in `facade` (those whose middle lies from `x0` to `x1`, so
 * neighbouring sections share them out), and the ground under them beyond `reach`, where the usual ground ends.
 */
export function buildOsm(s: Section, facade: MeshBuilder, patch: OsmPatch, x0: number, x1: number, reach: number): void {
  if (s.dry) return;
  // The ground runs on halfway to the next station (500 m off at the least), so two neighbours' grounds meet.
  const ga = Math.max(x0, patch.x0 - 20);
  const gb = Math.min(x1, patch.x1 + 20);
  if (gb > ga) {
    for (const side of [-1, 1]) {
      const za = side * reach;
      const zb = side * OSM_REACH;
      // Wound so the grass faces up on both sides.
      const [p, q] = side > 0 ? [za, zb] : [zb, za];
      s.lit.gridQuad(new Vector3(ga, -0.3, p), new Vector3(gb, -0.3, p), new Vector3(gb, -0.3, q), new Vector3(ga, -0.3, q), GRASS, 16);
    }
  }
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), d = new Vector3();
  /** A triangle facing up, whichever way it was wound. */
  const up = (p: Vector3, q: Vector3, r: Vector3, paint: RGB) => {
    if ((q.z - p.z) * (r.x - p.x) - (q.x - p.x) * (r.z - p.z) >= 0) s.lit.tri(p, q, r, paint);
    else s.lit.tri(p, r, q, paint);
  };
  patch.buildings.forEach((bd, k) => {
    const mid = (bd.min[0] + bd.max[0]) / 2;
    if (mid < x0 || mid >= x1) return;
    const { ring } = bd;
    const pick = (list: number[], salt: number) => list[Math.floor(hash01(k * 13 + Math.round(patch.x0), salt) * list.length)];
    const colour = rgb(bd.colour ?? pick(bd.pitched ? HOUSE_FACADES : FACADES, 71));
    const roof = bd.pitched && ring.length === 8 ? pitchedRoof(ring, bd.height) : null;
    const h = roof ? roof.eaves : bd.height;
    // Walls, the facade's storeys running round the house from its first corner.
    let u = 0;
    for (let i = 0; i < ring.length; i += 2) {
      const j = (i + 2) % ring.length;
      const len = Math.hypot(ring[j] - ring[i], ring[j + 1] - ring[i + 1]);
      a.set(ring[i], -0.5, ring[i + 1]);
      b.set(ring[j], -0.5, ring[j + 1]);
      c.set(ring[j], h, ring[j + 1]);
      d.set(ring[i], h, ring[i + 1]);
      facade.tri(a, b, c, colour, { uvs: [[u, -0.5], [u + len, -0.5], [u + len, h]] });
      facade.tri(a, c, d, colour, { uvs: [[u, -0.5], [u + len, h], [u, h]] });
      u += len;
    }
    if (roof) {
      // Two slopes up to the ridge from the long sides, and plain gables under its ends, wound like the walls.
      const tiles = rgb(pick(PITCHED_ROOFS, 72));
      const [p0, p1, p2, p3] = roof.corners;
      const [r0, r1] = roof.ridge;
      up(p0, p1, r1, tiles);
      up(p0, r1, r0, tiles);
      up(p2, p3, r0, tiles);
      up(p2, r0, r1, tiles);
      s.lit.tri(p1, p2, r1, colour);
      s.lit.tri(p3, p0, r0, colour);
      return;
    }
    // A flat roof.
    const contour: Vector2[] = [];
    for (let i = 0; i < ring.length; i += 2) contour.push(new Vector2(ring[i], ring[i + 1]));
    for (const [i, j, l] of ShapeUtils.triangulateShape(contour, [])) {
      a.set(contour[i].x, h, contour[i].y);
      b.set(contour[j].x, h, contour[j].y);
      c.set(contour[l].x, h, contour[l].y);
      up(a, b, c, ROOF);
    }
  });
}

/**
 * A pitched roof over a four-cornered house `height` high to the ridge: the ridge runs the long way, between the
 * middles of the two short sides. The corners come back at the eaves, turned so the first side is a long one (the
 * ridge's first end over the fourth side, its second over the second).
 */
function pitchedRoof(ring: number[], height: number): { eaves: number; corners: Vector3[]; ridge: [Vector3, Vector3] } {
  const side = (i: number) => Math.hypot(ring[(2 * i + 2) % 8] - ring[2 * i], ring[(2 * i + 3) % 8] - ring[2 * i + 1]);
  // Start from a long side.
  const turn = side(0) + side(2) >= side(1) + side(3) ? 0 : 1;
  const short = Math.min(side(1 - turn), side(3 - turn));
  const rise = Math.min(3, 0.4 * short);
  const eaves = Math.max(2.4, height - rise);
  const corners = [0, 1, 2, 3].map((i) => new Vector3(ring[2 * ((i + turn) % 4)], eaves, ring[2 * ((i + turn) % 4) + 1]));
  const ridgeY = eaves + rise;
  const mid = (p: Vector3, q: Vector3) => new Vector3((p.x + q.x) / 2, ridgeY, (p.z + q.z) / 2);
  return { eaves, corners, ridge: [mid(corners[3], corners[0]), mid(corners[1], corners[2])] };
}
