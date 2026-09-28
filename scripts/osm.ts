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
import { LINES } from '../src/landing/lines';
import { onRoute } from '../src/game/routes';

const OUT = 'src/game/world/osm';
const CACHE = 'node_modules/.cache/osm';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const AGENT = 'under-stockholm/1.0 (https://understockholm.com)';
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

interface El {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

/**
 * A building as the game gets it: its height in decimeters (to the ridge, for a pitched roof), its facade colour or
 * null, its roof (`ROOF`), then its footprint in decimeters, x then z, the first corner from the station's middle and
 * each next from the one before (small numbers pack well).
 */
type Building = [number, number | null, number, ...number[]];

/** Roofs: flat, or pitched (the game raises a ridge over a four-cornered house, and keeps any other flat). */
const ROOF = { flat: 0, pitched: 1 };
const HOUSES = new Set(['house', 'detached', 'semidetached_house', 'semi', 'terrace', 'bungalow', 'cabin', 'villa']);
const PITCHED = new Set(['gabled', 'hipped', 'pitched', 'half-hipped', 'gambrel', 'mansard', 'saltbox', 'side_hipped']);

function roofOf(t: Record<string, string>): number {
  const shape = t['roof:shape'];
  if (shape) return PITCHED.has(shape) ? ROOF.pitched : ROOF.flat;
  return HOUSES.has(t.building) ? ROOF.pitched : ROOF.flat;
}

async function overpass(query: string, key: string): Promise<El[]> {
  const cached = `${CACHE}/${key}.json`;
  if (process.argv.includes('--cached') && existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8')).elements as El[];
  for (let tries = 0; ; tries++) {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: `[out:json][timeout:90];${query}` }),
    });
    const text = await res.text();
    if (res.ok && text.startsWith('{')) {
      mkdirSync(CACHE, { recursive: true });
      writeFileSync(cached, text);
      return JSON.parse(text).elements as El[];
    }
    if (tries >= 4) throw new Error(`Overpass: ${res.status} ${text.slice(0, 300)}`);
    // Busy: wait and ask again, as its usage policy asks.
    await new Promise((r) => setTimeout(r, 15000 * (tries + 1)));
  }
}

/** A station as OSM is asked for it: by SL's site id, or by name where its node has none. */
interface Site { site: number; name: string }
interface Open extends Site { line: string; prev: Site | null; next: Site | null }

/** Open stations outside the city, with their line and the stations either side on one of their routes, by SL site id. */
function openStations(): Map<string, Open> {
  // Which stations are open lives in the game's line data (with three.js), so read it from the source.
  const open = new Set<string>();
  for (const file of ['src/game/line.ts', 'src/game/lines/red.ts', 'src/game/lines/green.ts']) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\{ name: '([^']+)'[^\n]*\bopen: true\b[^\n]*/g)) {
      if (!/\bcity: true\b/.test(m[0])) open.add(m[1]);
    }
  }
  const out = new Map<string, Open>();
  for (const line of LINES) {
    line.stations.forEach((s, i) => {
      if (!open.has(s.name) || out.has(s.name)) return;
      // Neighbours on the first route through the station, in the order the game lays them along +x.
      const route = line.routes.find((r) => onRoute(s, r.number))!;
      const seq = line.stations.flatMap((t, j) => (onRoute(t, route.number) ? [j] : []));
      const k = seq.indexOf(i);
      const site = (j: number | undefined) => (j === undefined ? null : { site: line.stations[j].site, name: line.stations[j].name });
      out.set(s.name, { line: line.id, site: s.site, name: s.name, prev: site(seq[k - 1]), next: site(seq[k + 1]) });
    });
  }
  return out;
}

function heightOf(t: Record<string, string>): number {
  const num = (v: string | undefined) => {
    const n = v === undefined ? NaN : parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const h = num(t.height);
  if (h) return Math.min(h, 120);
  const levels = num(t['building:levels']);
  if (levels) return levels * 3 + 1 + (num(t['roof:levels']) ?? 0) * 1.5;
  switch (t.building) {
    case 'house': case 'detached': case 'semidetached_house': case 'semi': case 'terrace': return 7;
    case 'shed': case 'garage': case 'garages': case 'hut': case 'roof': case 'kiosk': case 'carport': return 3;
    case 'retail': case 'commercial': case 'industrial': case 'warehouse': case 'supermarket': return 7;
    case 'church': return 16;
    case 'office': case 'hotel': return 18;
    default: return 12;
  }
}

const NAMED: Record<string, number> = {
  white: 0xece8e0, beige: 0xe0d0b0, yellow: 0xe8cf84, red: 0xa8483a, brown: 0x8a5a3c, grey: 0xa8a8a2, gray: 0xa8a8a2,
  orange: 0xd8864a, pink: 0xe0a898, green: 0x8aa088, blue: 0x8aa0b8, black: 0x3a3a3a, tan: 0xd2b48c,
};

function colourOf(t: Record<string, string>): number | null {
  const c = t['building:colour']?.trim().toLowerCase();
  if (!c) return null;
  if (/^#[0-9a-f]{6}$/.test(c)) return parseInt(c.slice(1), 16);
  if (/^#[0-9a-f]{3}$/.test(c)) return parseInt(c.slice(1).split('').map((d) => d + d).join(''), 16);
  return NAMED[c] ?? null;
}

/** Douglas-Peucker on a closed ring, first point not repeated. */
function simplify(ring: Array<[number, number]>, tol: number): Array<[number, number]> {
  if (ring.length <= 4) return ring;
  const keep = new Array(ring.length).fill(false);
  const dist = (p: [number, number], a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    return Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / len;
  };
  const run = (i: number, j: number) => {
    let best = -1, far = 0;
    for (let k = i + 1; k < j; k++) {
      const d = dist(ring[k], ring[i], ring[j % ring.length]);
      if (d > far) { far = d; best = k; }
    }
    if (best >= 0 && far > tol) { keep[best] = true; run(i, best); run(best, j); }
  };
  // Split at the point farthest from the first, so the ring's two halves simplify on their own.
  let opposite = 1;
  for (let k = 1; k < ring.length; k++) if (Math.hypot(ring[k][0] - ring[0][0], ring[k][1] - ring[0][1]) > Math.hypot(ring[opposite][0] - ring[0][0], ring[opposite][1] - ring[0][1])) opposite = k;
  keep[0] = keep[opposite] = true;
  run(0, opposite);
  run(opposite, ring.length);
  const out = ring.filter((_, k) => keep[k]);
  return out.length >= 3 ? out : ring;
}

async function fetchStation({ name, site, prev, next }: Open): Promise<Building[]> {
  const sites = [{ site, name }, prev, next].filter((v): v is Site => v !== null);
  // Round Stockholm, for finding a station by name.
  const AREA = '(59.1,17.6,59.6,18.4)';
  const byName = (n: string) => `node[railway=station][station=subway][name="${n}"]${AREA}`;
  const els = await overpass(
    `(node[railway=station][sl_stop_id~"^(${sites.map((v) => v.site).join('|')})$"];${sites.map((v) => byName(v.name) + ';').join('')})->.all;` +
    `(node.all[sl_stop_id=${site}];node.all[station=subway][name="${name}"];)->.s;` +
    `.all out;` +
    `(way[building](around.s:${RADIUS});way[railway=subway](around.s:${RADIUS}););out geom tags;`,
    String(site),
  );
  const node = (v: Site | null) => v && (els.find((e) => e.type === 'node' && e.tags?.sl_stop_id === String(v.site))
    ?? els.find((e) => e.type === 'node' && e.tags?.station === 'subway' && e.tags?.name === v.name));
  const home = node({ site, name });
  if (!home) throw new Error(`${name}: no metro station with sl_stop_id ${site} or this name in OSM`);
  const lat0 = home.lat!, lon0 = home.lon!;
  const k = Math.cos((lat0 * Math.PI) / 180);
  /** East and north of the station node, in meters. */
  const local = (lat: number, lon: number): [number, number] => [(lon - lon0) * k * 111320, (lat - lat0) * 110540];

  // The tracks' direction: the main axis of the metro's rails within reach of the platform, sampled every 2 m.
  const pts: Array<[number, number]> = [];
  for (const w of els) {
    if (w.type !== 'way' || w.tags?.railway !== 'subway' || !w.geometry) continue;
    const g = w.geometry.map((p) => local(p.lat, p.lon));
    for (let i = 0; i + 1 < g.length; i++) {
      const n = Math.max(1, Math.ceil(Math.hypot(g[i + 1][0] - g[i][0], g[i + 1][1] - g[i][1]) / 2));
      for (let j = 0; j < n; j++) {
        const p: [number, number] = [g[i][0] + ((g[i + 1][0] - g[i][0]) * j) / n, g[i][1] + ((g[i + 1][1] - g[i][1]) * j) / n];
        if (Math.hypot(p[0], p[1]) < 120) pts.push(p);
      }
    }
  }
  if (pts.length < 10) throw new Error(`${name}: no metro tracks near the station in OSM`);
  const me = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const mn = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let see = 0, snn = 0, sen = 0;
  for (const [e, n] of pts) { see += (e - me) ** 2; snn += (n - mn) ** 2; sen += (e - me) * (n - mn); }
  const angle = 0.5 * Math.atan2(2 * sen, see - snn);
  let f: [number, number] = [Math.cos(angle), Math.sin(angle)];
  // +x runs toward the next station along the route (away from the one before).
  const a = node(prev), b = node(next);
  const [ae, an] = a ? local(a.lat!, a.lon!) : [0, 0];
  const [be, bn] = b ? local(b.lat!, b.lon!) : [0, 0];
  if ((be - ae) * f[0] + (bn - an) * f[1] < 0) f = [-f[0], -f[1]];
  /** To the right of +x: the game's +z (y up, x ahead, z to the right). */
  const r: [number, number] = [f[1], -f[0]];
  // The line's middle: across, the mean of the rails near the node; along, the station node.
  const near = pts.filter(([e, n]) => Math.abs(e * f[0] + n * f[1]) < 60);
  const z0 = near.reduce((s, [e, n]) => s + e * r[0] + n * r[1], 0) / Math.max(1, near.length);
  const toGame = ([e, n]: [number, number]): [number, number] => [e * f[0] + n * f[1], e * r[0] + n * r[1] - z0];

  const out: Array<{ id: number; b: Building }> = [];
  for (const w of els) {
    const t = w.tags;
    if (w.type !== 'way' || !t?.building || !w.geometry || w.geometry.length < 4) continue;
    if (t.building === 'roof' || t.building === 'train_station' || t.location === 'underground' || t.layer?.startsWith('-')) continue;
    let ring = w.geometry.slice(0, -1).map((p) => toGame(local(p.lat, p.lon)));
    const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
    const cx = xs.reduce((s, v) => s + v, 0) / xs.length;
    if (Math.abs(cx) > HALF_X || Math.max(...zs.map(Math.abs)) > MAX_Z) continue;
    // Clear of the tracks: nothing in or across the band down the middle.
    if (Math.min(...zs) < CLEAR_Z && Math.max(...zs) > -CLEAR_Z) continue;
    ring = simplify(ring, SIMPLIFY);
    const dm = ring.map(([x, z]) => [Math.round(x * 10), Math.round(z * 10)]);
    const coords = dm.flatMap(([x, z], i) => (i === 0 ? [x, z] : [x - dm[i - 1][0], z - dm[i - 1][1]]));
    out.push({ id: w.id, b: [Math.round(heightOf(t) * 10), colourOf(t), roofOf(t), ...coords] });
  }
  out.sort((p, q) => p.id - q.id);
  console.log(`${name}: ${out.length} buildings, tracks at ${((Math.atan2(f[1], f[0]) * 180) / Math.PI).toFixed(0)}° from east`);
  return out.map((o) => o.b);
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const stations = openStations();
const names = process.argv.includes('--all') ? [...stations.keys()] : args;
if (names.length === 0) {
  console.error('Name the stations, or --all. Open stations: ' + [...stations.keys()].join(', '));
  process.exit(1);
}
const LICENSE = 'Map data © OpenStreetMap contributors, available under the Open Database License (ODbL): https://www.openstreetmap.org/copyright';
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
    console.error(`${name}: ${(err as Error).message}`);
    failed.push(name);
  }
  // Overpass is shared by everyone: a pause between questions.
  if (!process.argv.includes('--cached') && k < names.length - 1) await new Promise((r) => setTimeout(r, 4000));
}
mkdirSync(OUT, { recursive: true });
for (const [line, data] of files) {
  // One building per line, so a change to one station shows as a readable diff.
  const body = Object.entries(data).sort(([p], [q]) => p.localeCompare(q, 'sv'))
    .map(([name, bs]) => `    ${JSON.stringify(name)}: [\n${bs.map((b) => `      ${JSON.stringify(b)}`).join(',\n')}\n    ]`).join(',\n');
  writeFileSync(`${OUT}/${line}.json`, `{\n  "license": ${JSON.stringify(LICENSE)},\n  "format": ${JSON.stringify(FORMAT)},\n  "stations": {\n${body}\n  }\n}\n`);
  console.log(`Wrote ${OUT}/${line}.json: ${Object.keys(data).length} stations`);
}
if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exit(1);
}
