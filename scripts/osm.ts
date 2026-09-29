/**
 * The buildings round the stations in the open air, from OpenStreetMap
 * (© OpenStreetMap contributors, ODbL). For each station named on the command
 * line it asks Overpass once for the station (by its SL site id), the metro's
 * tracks and every building within `RADIUS`, turns the map so the real tracks
 * run along the game's +x through the platform's middle, keeps what stands
 * clear of the tracks and writes the footprints and heights into one file
 * per line, `src/game/world/osm/<line>.json`, which the game fetches when the
 * player comes near and builds from (`world/osm.ts`). Stations already in a
 * file keep their data unless named again. Overpass's answers are kept in
 * `node_modules/.cache/osm/`, so `--cached` works the data over again without
 * asking it.
 *
 *   bun scripts/osm.ts Alvik
 *   bun scripts/osm.ts --all        (every open station outside the city)
 *   bun scripts/osm.ts --all --cached
 *
 * The files are data from OSM, so they are ODbL too: see their `license`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { colourOf, heightOf, LICENSE, overpass, packed, pause, roofOf, simplify, stationFrame, stationQuery, stations as allStations, type Pt, type Station } from './osm-lib';

const OUT = 'src/game/world/osm';
/** How far round the station buildings are fetched, in meters. */
const RADIUS = 330;
/** Kept along the tracks either side of the station's middle: less than half the usual 500 m between stations. */
const HALF_X = 230;
/** Kept out to either side. */
const MAX_Z = 280;
/** Nothing may stand closer to the line's middle than this: the fences are at 10.5 m. */
const CLEAR_Z = 14;
/** Footprints are simplified to within this many meters. */
const SIMPLIFY = 0.6;

/**
 * A building as the game gets it: its height in decimeters (to the ridge, for a pitched roof), its facade colour or
 * null, its roof (0 flat, 1 pitched), then its footprint (`packed`).
 */
type Building = [number, number | null, number, ...number[]];

async function fetchStation(s: Station): Promise<Building[]> {
  const els = await overpass(`${stationQuery(s)}(way[building](around.s:${RADIUS});way[railway=subway](around.s:${RADIUS}););out geom tags;`, String(s.site));
  const { toGame, heading } = stationFrame(els, s);
  const out: Array<{ id: number; b: Building }> = [];
  for (const w of els) {
    const t = w.tags;
    if (w.type !== 'way' || !t?.building || !w.geometry || w.geometry.length < 4) continue;
    if (t.building === 'roof' || t.building === 'train_station' || t.location === 'underground' || t.layer?.startsWith('-')) continue;
    let ring: Pt[] = w.geometry.slice(0, -1).map((p) => toGame(p.lat, p.lon));
    const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
    const cx = xs.reduce((s, v) => s + v, 0) / xs.length;
    if (Math.abs(cx) > HALF_X || Math.max(...zs.map(Math.abs)) > MAX_Z) continue;
    // Clear of the tracks: nothing in or across the band down the middle.
    if (Math.min(...zs) < CLEAR_Z && Math.max(...zs) > -CLEAR_Z) continue;
    ring = simplify(ring, SIMPLIFY);
    out.push({ id: w.id, b: [Math.round(heightOf(t) * 10), colourOf(t), roofOf(t), ...packed(ring)] });
  }
  out.sort((p, q) => p.id - q.id);
  console.log(`${s.name}: ${out.length} buildings, tracks at ${heading.toFixed(0)}° from east`);
  return out.map((o) => o.b);
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
/** Open stations outside the city, by name. */
const stations = new Map([...allStations().values()].filter((s) => s.open && !s.city).map((s) => [s.name, s]));
const names = process.argv.includes('--all') ? [...stations.keys()] : args;
if (names.length === 0) {
  console.error('Name the stations, or --all. Open stations: ' + [...stations.keys()].join(', '));
  process.exit(1);
}
const FORMAT = 'bun scripts/osm.ts: each building is [height, facade colour or null, roof (0 flat, 1 pitched), x, z, then each next corner as dx, dz], in decimeters from the station\'s middle with x along the tracks';
const files = new Map<string, Record<string, Building[]>>();
const fileOf = (line: string) => {
  if (!files.has(line)) {
    const path = `${OUT}/${line}.json`;
    files.set(line, existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).stations : {});
  }
  return files.get(line)!;
};
const failed: string[] = [];
for (const [k, name] of names.entries()) {
  const s = stations.get(name);
  if (!s) throw new Error(`${name} is not an open station outside the city`);
  try {
    fileOf(s.line)[name] = await fetchStation(s);
  } catch (err) {
    console.error(`${name}: ${(err as Error).message.slice(0, 300)}`);
    failed.push(name);
  }
  if (k < names.length - 1) await pause();
}
mkdirSync(OUT, { recursive: true });
for (const [line, data] of files) {
  const sorted = Object.fromEntries(Object.entries(data).sort(([p], [q]) => p.localeCompare(q, 'sv')));
  writeStations(`${OUT}/${line}.json`, sorted);
  console.log(`Wrote ${OUT}/${line}.json: ${Object.keys(data).length} stations`);
}
if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exit(1);
}

/** The line's file: one building per line, so a change to one station shows as a readable diff. */
function writeStations(path: string, data: Record<string, Building[]>): void {
  const body = Object.entries(data).map(([name, bs]) => `    ${JSON.stringify(name)}: [\n${bs.map((b) => `      ${JSON.stringify(b)}`).join(',\n')}\n    ]`).join(',\n');
  writeFileSync(path, `{\n  "license": ${JSON.stringify(LICENSE)},\n  "format": ${JSON.stringify(FORMAT)},\n  "stations": {\n${body}\n  }\n}\n`);
}
