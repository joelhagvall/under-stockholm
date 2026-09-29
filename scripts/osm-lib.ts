/**
 * What `scripts/osm.ts` (the buildings along the open-air tracks) and
 * `scripts/osm-streets.ts` (the streets out of every exit) share: asking
 * Overpass politely, the stations and their neighbours, turning the map so a
 * station's tracks run along the game's +x, and reading heights, colours and
 * roofs off OSM's tags. © OpenStreetMap contributors, ODbL.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { LINES } from '../src/landing/lines';
import { onRoute } from '../src/game/routes';

export const LICENSE = 'Map data © OpenStreetMap contributors, available under the Open Database License (ODbL): https://www.openstreetmap.org/copyright';
const CACHE = 'node_modules/.cache/osm';
/** Overpass's main server, then a mirror for when it turns us away. */
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const AGENT = 'under-stockholm/1.0 (https://understockholm.com)';
/** Round Stockholm, for finding a station by name. */
const AREA = '(59.1,17.6,59.6,18.4)';

export interface El {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{ type: string; role: string; geometry?: Array<{ lat: number; lon: number }> }>;
}

export type Pt = [number, number];

/** Asks Overpass, or with `--cached` reads its last answer to the same `key` (kept in `node_modules/.cache/osm/`). */
export async function overpass(query: string, key: string): Promise<El[]> {
  const cached = `${CACHE}/${key}.json`;
  // `--cached` works only from the cache; `--resume` asks only what it does not have yet.
  asked = false;
  if ((process.argv.includes('--cached') || process.argv.includes('--resume')) && existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8')).elements as El[];
  asked = true;
  for (let tries = 0; ; tries++) {
    const res = await fetch(OVERPASS[tries % OVERPASS.length], {
      method: 'POST',
      headers: { 'User-Agent': AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: `[out:json][timeout:120];${query}` }),
    }).catch(() => null);
    const text = res ? await res.text() : '';
    if (res?.ok && text.startsWith('{')) {
      mkdirSync(CACHE, { recursive: true });
      writeFileSync(cached, text);
      return JSON.parse(text).elements as El[];
    }
    // A bad question is not asked again.
    if (res?.status === 400) throw new Error(`Overpass: 400 ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400)}`);
    if (tries >= 5) throw new Error(`Overpass: ${res?.status ?? 'no answer'} ${text.slice(0, 200)}`);
    // Busy: wait and ask again, as its usage policy asks.
    await new Promise((r) => setTimeout(r, 15000 * (tries + 1)));
  }
}

/** Did the last question go to Overpass (not the cache)? */
let asked = false;

/** Waits after a question Overpass answered, not after one the cache did: Overpass is shared by everyone. */
export const pause = (ms = 4000) => (asked ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** A station as OSM is asked for it: by SL's site id, or by name where its node has none. */
export interface Site { site: number; name: string }
export interface Station extends Site {
  line: string;
  /** Above ground, and in the city by the water (see `StationDef.open` and `city`). */
  open: boolean;
  city: boolean;
  prev: Site | null;
  next: Site | null;
}

/** Every station the game builds (a shared one once, as its first line's), with its line and neighbours. */
export function stations(): Map<string, Station> {
  // Which stations are open lives in the game's line data (with three.js), so read it from the source.
  const open = new Set<string>();
  const city = new Set<string>();
  for (const file of ['src/game/line.ts', 'src/game/lines/red.ts', 'src/game/lines/green.ts']) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\{ name: '([^']+)'[^\n]*\bopen: true\b[^\n]*/g)) {
      open.add(m[1]);
      if (/\bcity: true\b/.test(m[0])) city.add(m[1]);
    }
  }
  const out = new Map<string, Station>();
  for (const line of LINES) {
    line.stations.forEach((s, i) => {
      if (s.shared || out.has(`${line.id}:${s.name}`)) return;
      // Neighbours on the first route through the station, in the order the game lays them along +x.
      const route = line.routes.find((r) => onRoute(s, r.number))!;
      const seq = line.stations.flatMap((t, j) => (onRoute(t, route.number) ? [j] : []));
      const k = seq.indexOf(i);
      const site = (j: number | undefined) => (j === undefined ? null : { site: line.stations[j].site, name: line.stations[j].name });
      out.set(`${line.id}:${s.name}`, { line: line.id, site: s.site, name: s.name, open: open.has(s.name), city: city.has(s.name), prev: site(seq[k - 1]), next: site(seq[k + 1]) });
    });
  }
  return out;
}

/** The Overpass statements that find `station` and its neighbours as `.all`, and the station itself as `.s`. */
export function stationQuery({ site, name, prev, next }: Station): string {
  const sites = [{ site, name }, prev, next].filter((v): v is Site => v !== null);
  const byName = (n: string) => `node[railway=station][station=subway][name="${n}"]${AREA}`;
  return `(node[railway=station][sl_stop_id~"^(${sites.map((v) => v.site).join('|')})$"];${sites.map((v) => byName(v.name) + ';').join('')})->.all;` +
    `(node.all[sl_stop_id=${site}];node.all[station=subway][name="${name}"];)->.s;.all out;`;
}

/** The node of a station among `els`, by site id or else by name. */
export function stationNode(els: El[], v: Site | null): El | undefined {
  return v ? els.find((e) => e.type === 'node' && e.tags?.sl_stop_id === String(v.site))
    ?? els.find((e) => e.type === 'node' && e.tags?.station === 'subway' && e.tags?.name === v.name) : undefined;
}

/** Words OSM names each line's tracks with. */
const LINE_WORDS: Record<string, RegExp> = { blue: /blå/i, red: /röd/i, green: /grön/i };

/**
 * The game's frame at a station: x along the tracks toward the next station, z to their right, from the line's middle
 * beside the station node. `toGame` takes latitude and longitude there, in meters. Built from the metro's rails near
 * the node (the line's own where OSM names them), sampled every 2 m.
 */
export function stationFrame(els: El[], s: Station): { toGame: (lat: number, lon: number) => Pt; heading: number } {
  const home = stationNode(els, s);
  if (!home) throw new Error(`${s.name}: no metro station with sl_stop_id ${s.site} or this name in OSM`);
  const lat0 = home.lat!, lon0 = home.lon!;
  const k = Math.cos((lat0 * Math.PI) / 180);
  /** East and north of the station node, in meters. */
  const local = (lat: number, lon: number): Pt => [(lon - lon0) * k * 111320, (lat - lat0) * 110540];
  const sample = (own: boolean) => {
    const pts: Pt[] = [];
    for (const w of els) {
      if (w.type !== 'way' || w.tags?.railway !== 'subway' || !w.geometry) continue;
      if (own && !LINE_WORDS[s.line].test(`${w.tags.name ?? ''} ${w.tags.line ?? ''}`)) continue;
      const g = w.geometry.map((p) => local(p.lat, p.lon));
      for (let i = 0; i + 1 < g.length; i++) {
        const n = Math.max(1, Math.ceil(Math.hypot(g[i + 1][0] - g[i][0], g[i + 1][1] - g[i][1]) / 2));
        for (let j = 0; j < n; j++) {
          const p: Pt = [g[i][0] + ((g[i + 1][0] - g[i][0]) * j) / n, g[i][1] + ((g[i + 1][1] - g[i][1]) * j) / n];
          if (Math.hypot(p[0], p[1]) < 120) pts.push(p);
        }
      }
    }
    return pts;
  };
  let pts = sample(true);
  if (pts.length < 10) pts = sample(false);
  if (pts.length < 10) throw new Error(`${s.name}: no metro tracks near the station in OSM`);
  const me = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const mn = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let see = 0, snn = 0, sen = 0;
  for (const [e, n] of pts) { see += (e - me) ** 2; snn += (n - mn) ** 2; sen += (e - me) * (n - mn); }
  const angle = 0.5 * Math.atan2(2 * sen, see - snn);
  let f: Pt = [Math.cos(angle), Math.sin(angle)];
  // +x runs toward the next station along the route (away from the one before).
  const a = stationNode(els, s.prev), b = stationNode(els, s.next);
  const [ae, an] = a ? local(a.lat!, a.lon!) : [0, 0];
  const [be, bn] = b ? local(b.lat!, b.lon!) : [0, 0];
  if ((be - ae) * f[0] + (bn - an) * f[1] < 0) f = [-f[0], -f[1]];
  /** To the right of +x: the game's +z (y up, x ahead, z to the right). */
  const r: Pt = [f[1], -f[0]];
  // The line's middle: across, the mean of the rails near the node; along, the station node.
  const near = pts.filter(([e, n]) => Math.abs(e * f[0] + n * f[1]) < 60);
  const z0 = near.reduce((sum, [e, n]) => sum + e * r[0] + n * r[1], 0) / Math.max(1, near.length);
  return {
    toGame: (lat, lon) => {
      const [e, n] = local(lat, lon);
      return [e * f[0] + n * f[1], e * r[0] + n * r[1] - z0];
    },
    heading: (Math.atan2(f[1], f[0]) * 180) / Math.PI,
  };
}

/** Roofs: flat, or pitched (the game raises a ridge over a four-cornered house, and keeps any other flat). */
const ROOF = { flat: 0, pitched: 1 };
const HOUSES = new Set(['house', 'detached', 'semidetached_house', 'semi', 'terrace', 'bungalow', 'cabin', 'villa']);
const PITCHED = new Set(['gabled', 'hipped', 'pitched', 'half-hipped', 'gambrel', 'mansard', 'saltbox', 'side_hipped']);

export function roofOf(t: Record<string, string>): number {
  const shape = t['roof:shape'];
  if (shape) return PITCHED.has(shape) ? ROOF.pitched : ROOF.flat;
  return HOUSES.has(t.building) ? ROOF.pitched : ROOF.flat;
}

export function heightOf(t: Record<string, string>): number {
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

export function colourOf(t: Record<string, string>): number | null {
  const c = t['building:colour']?.trim().toLowerCase();
  if (!c) return null;
  if (/^#[0-9a-f]{6}$/.test(c)) return parseInt(c.slice(1), 16);
  if (/^#[0-9a-f]{3}$/.test(c)) return parseInt(c.slice(1).split('').map((d) => d + d).join(''), 16);
  return NAMED[c] ?? null;
}

/** Douglas-Peucker on a closed ring, first point not repeated. */
export function simplify(ring: Pt[], tol: number): Pt[] {
  if (ring.length <= 4) return ring;
  const keep = new Array(ring.length).fill(false);
  const dist = (p: Pt, a: Pt, b: Pt) => {
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

/** Points in decimeters, the first as it is and each next from the one before (small numbers pack well). */
export function packed(pts: Pt[]): number[] {
  const dm = pts.map(([x, z]) => [Math.round(x * 10), Math.round(z * 10)]);
  return dm.flatMap(([x, z], i) => (i === 0 ? [x, z] : [x - dm[i - 1][0], z - dm[i - 1][1]]));
}

/** A JSON file with one entry of each list per line, so a change to one station shows as a readable diff. */
export function writeJson(path: string, head: Record<string, unknown>, lists: Record<string, unknown[]>): void {
  const top = Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  const body = Object.entries(lists).map(([k, list]) => `  ${JSON.stringify(k)}: [${list.length ? `\n${list.map((v) => `    ${JSON.stringify(v)}`).join(',\n')}\n  ` : ''}]`);
  writeFileSync(path, `{\n${[...top, ...body].join(',\n')}\n}\n`);
}
