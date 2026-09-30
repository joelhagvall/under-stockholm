/**
 * The city above the network view, from OpenStreetMap (© OpenStreetMap contributors, ODbL): every building of the
 * inner city and round every station, as footprints and heights, in meters east and north of T-Centralen as in
 * `network/geo.ts`. Written as square tiles, `src/network/city/<east>_<north>.json` (the tile's south-west corner in
 * kilometers), which the network view fetches when it opens and builds from (`network/city.ts`): a file each so none
 * grows past the budget for one map file. Overpass's answers are kept in `node_modules/.cache/osm/`, so `--cached`
 * works the data over again without asking it.
 *
 *   bun scripts/osm-city.ts
 *   bun scripts/osm-city.ts --cached
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { GEO, project } from '../src/network/geo';
import { heightOf, LICENSE, overpass, simplify, type El, type Pt } from './osm-lib';

const OUT = 'src/network/city';
/** The inner city, from Hornstull to Gärdet and from Fridhemsplan's hill to Ropsten: every building. */
const INNER = '59.305,17.995,59.362,18.108';
/** Round every station further out: the buildings within this many meters. */
const RADIUS = 330;
/** Footprints are simplified to within this many meters. */
const SIMPLIFY = 2.5;
/** Buildings smaller than this, in square meters, are left out: sheds and kiosks do not show from above the city. */
const MIN_AREA = 100;
/** Corners are kept to this many meters: the city is seen from above it. */
const GRAIN = 2;
/** A tile's side, in meters. */
const TILE = 4000;

const els: El[] = [
  ...(await overpass(`(way[building](${INNER});relation[building](${INNER}););out geom tags;`, 'city-inner')),
  ...(await overpass(`(${Object.values(GEO).map(([lat, lon]) => `way[building](around:${RADIUS},${lat},${lon});`).join('')});out geom tags;`, `city-stations-${RADIUS}`)),
];

const area = (ring: Pt[]) => Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const seen = new Set<string>();
const tiles = new Map<string, number[][]>();
let kept = 0;
for (const e of els) {
  const t = e.tags;
  const key = `${e.type}${e.id}`;
  if (!t?.building || seen.has(key)) continue;
  seen.add(key);
  if (t.building === 'roof' || t.location === 'underground' || t.layer?.startsWith('-')) continue;
  const rings = e.type === 'way' ? [e.geometry] : (e.members ?? []).filter((m) => m.role === 'outer').map((m) => m.geometry);
  for (const g of rings) {
    if (!g || g.length < 4) continue;
    let ring: Pt[] = g.slice(0, -1).map((p) => { const q = project(p.lat, p.lon); return [q.east, q.north]; });
    if (area(ring) < MIN_AREA) continue;
    ring = simplify(ring, SIMPLIFY);
    if (ring.length < 3) continue;
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const tx = Math.floor(cx / TILE), ty = Math.floor(cy / TILE);
    const name = `${(tx * TILE) / 1000}_${(ty * TILE) / 1000}`;
    // Grains from the tile's corner, each corner after the first as the step from the one before.
    const m = ring.map(([x, y]) => [Math.round((x - tx * TILE) / GRAIN), Math.round((y - ty * TILE) / GRAIN)]);
    const flat = m.flatMap(([x, y], i) => (i === 0 ? [x, y] : [x - m[i - 1][0], y - m[i - 1][1]]));
    if (!tiles.has(name)) tiles.set(name, []);
    tiles.get(name)!.push([Math.round(heightOf(t)), ...flat]);
    kept++;
  }
}

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(`${OUT}/${f}`);
const format = 'bun scripts/osm-city.ts: each building is [height in meters, x, y, then each next corner as dx, dy], in `grain` meters east and north of the tile\'s south-west corner (the file\'s name, in kilometers east and north of T-Centralen)';
for (const [name, list] of [...tiles].sort()) {
  writeFileSync(`${OUT}/${name}.json`, `{\n  "license": ${JSON.stringify(LICENSE)},\n  "format": ${JSON.stringify(format)},\n  "tile": ${TILE}, "grain": ${GRAIN},\n  "buildings": [\n${list.map((b) => `    ${JSON.stringify(b)}`).join(',\n')}\n  ]\n}\n`);
  const bytes = Bun.gzipSync(Buffer.from(JSON.stringify(list))).byteLength;
  console.log(`${name}: ${list.length} buildings, ${Math.round(bytes / 1000)} kB gzip`);
}
console.log(`${kept} buildings in ${tiles.size} tiles`);
