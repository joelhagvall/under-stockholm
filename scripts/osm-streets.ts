/**
 * The streets out of every station's exit, from OpenStreetMap (© OpenStreetMap
 * contributors, ODbL). For each station it asks Overpass for the station, the
 * metro's tracks and its entrances (`railway=subway_entrance`), then for the
 * buildings, roads, parks, woods, water and trees round them, turns the map so
 * the tracks run along the game's +x (as `scripts/osm.ts` does), and writes a
 * file per exit into `src/game/world/osm/streets/`, which the game fetches
 * when it builds that street (`world/streetOsm.ts`).
 *
 * Underground a station gets a file per end it may come out at: round the
 * entrance furthest out that way, with the others that way for a second hall
 * at the same end, and the game lays the city so the hall's entrance is where
 * its stairs come up. In the open (and in the city by the water) one
 * file round the station itself, laid as the buildings along the tracks are.
 *
 *   bun scripts/osm-streets.ts Odenplan "T-Centralen"
 *   bun scripts/osm-streets.ts --all
 *   bun scripts/osm-streets.ts --all --cached      (from Overpass's last answers)
 *   bun scripts/osm-streets.ts --all --resume      (asking only what it has not asked yet)
 *   bun scripts/osm-streets.ts --line green        (one line's stations)
 *   bun scripts/osm-streets.ts --all --entrances   (only where every station's entrances are: `ENTRANCES`)
 *
 * The files are data from OSM, so they are ODbL too: see their `license`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { streetKey } from '../src/game/world/osmKey';
import { colourOf, heightOf, LICENSE, overpass, packed, pause, roofOf, simplify, stationFrame, stationQuery, stations as allStations, writeJson, type Pt, type Station } from './osm-lib';

const OUT = 'src/game/world/osm/streets';
/**
 * Where every station's entrances are, in the same frame as the street files: what `tests/hall-sides.test.ts` checks
 * the stations' halls against. The game itself never reads it.
 */
const ENTRANCES = 'tests/data/osm-entrances.json';
/** Round an exit: buildings whose middle lies this close, and roads, parks and water within a square this far out. */
const R = 260;
/** In the open: along the tracks either side of the station (the next is 500 m off at the least), and out to either side. */
const OPEN = { x: 250, z: 300 };
/** How far out along its way an exit may lie: further, and it is likely the next station's. */
const EXIT_REACH = 280;
const SIMPLIFY = 0.6;

/** Kinds of ground, as the game paints them. */
const AREA = { grass: 0, wood: 1, water: 2, paved: 3, asphalt: 4, sand: 5 } as const;
/** Kinds of way: a road for cars, a pedestrian street, a path. */
const ROAD = { road: 0, pedestrian: 1, path: 2 } as const;

interface Region { cx: number; cz: number; hx: number; hz: number; round: boolean }

const WIDTHS: Record<string, [number, number]> = {
  motorway: [ROAD.road, 14], trunk: [ROAD.road, 13], primary: [ROAD.road, 13], secondary: [ROAD.road, 11], tertiary: [ROAD.road, 9],
  motorway_link: [ROAD.road, 8], trunk_link: [ROAD.road, 8], primary_link: [ROAD.road, 8], secondary_link: [ROAD.road, 7], tertiary_link: [ROAD.road, 7],
  unclassified: [ROAD.road, 7], residential: [ROAD.road, 7], living_street: [ROAD.road, 6], service: [ROAD.road, 4.5], busway: [ROAD.road, 7],
  pedestrian: [ROAD.pedestrian, 7], footway: [ROAD.path, 2.5], path: [ROAD.path, 2.5], cycleway: [ROAD.path, 2.5], bridleway: [ROAD.path, 2.5], track: [ROAD.path, 3],
};

function areaKind(t: Record<string, string>): number | null {
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.water) return AREA.water;
  if (t.natural === 'wood' || t.natural === 'scrub' || t.landuse === 'forest') return AREA.wood;
  if (t.leisure === 'playground') return AREA.sand;
  if (t.amenity === 'parking') return AREA.asphalt;
  if (t.highway === 'pedestrian' || t.place === 'square') return AREA.paved;
  if (t.leisure || t.landuse || t.natural) return AREA.grass;
  return null;
}

// ---- Geometry in the game's frame, in meters. ----

/** Joins open chains end to end into closed rings (the ways of a multipolygon come in any order and direction). */
function rings(chains: Pt[][]): Pt[][] {
  const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
  const open = chains.filter((c) => c.length > 1).map((c) => [...c]);
  const out: Pt[][] = [];
  while (open.length) {
    let ring = open.pop()!;
    for (let grew = true; grew && !same(ring[0], ring[ring.length - 1]);) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const c = open[i];
        const end = ring[ring.length - 1];
        if (same(c[0], end)) ring = ring.concat(c.slice(1));
        else if (same(c[c.length - 1], end)) ring = ring.concat([...c].reverse().slice(1));
        else if (same(c[c.length - 1], ring[0])) ring = c.concat(ring.slice(1));
        else if (same(c[0], ring[0])) ring = [...c].reverse().concat(ring.slice(1));
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) out.push(ring.slice(0, -1));
  }
  return out;
}

/** Sutherland-Hodgman: a ring cut to the rectangle. */
function clipRing(ring: Pt[], x0: number, x1: number, z0: number, z1: number): Pt[] {
  let pts = ring;
  const edges: Array<[(p: Pt) => boolean, (a: Pt, b: Pt) => Pt]> = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= z0, (a, b) => [a[0] + ((b[0] - a[0]) * (z0 - a[1])) / (b[1] - a[1]), z0]],
    [(p) => p[1] <= z1, (a, b) => [a[0] + ((b[0] - a[0]) * (z1 - a[1])) / (b[1] - a[1]), z1]],
  ];
  for (const [inside, cut] of edges) {
    const out: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i];
      if (inside(b)) {
        if (!inside(a)) out.push(cut(a, b));
        out.push(b);
      } else if (inside(a)) out.push(cut(a, b));
    }
    pts = out;
    if (pts.length < 3) return [];
  }
  return pts;
}

function area(ring: Pt[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    s += ax * bz - bx * az;
  }
  return s / 2;
}

/** The middle of a ring's corners. */
const middle = (ring: Pt[]): Pt => [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];

function inside(p: Pt, ring: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/** The parts of a polyline within the rectangle, each cut where it crosses the edge (Liang-Barsky per segment). */
function clipLine(line: Pt[], x0: number, x1: number, z0: number, z1: number): Pt[][] {
  const parts: Pt[][] = [];
  let cur: Pt[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const dx = bx - ax, dz = bz - az;
    let t0 = 0, t1 = 1;
    let ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
      if (p === 0) { if (q < 0) ok = false; continue; }
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
    if (!ok || t0 > t1) {
      if (cur.length > 1) parts.push(cur);
      cur = [];
      continue;
    }
    const a: Pt = [ax + dx * t0, az + dz * t0], b: Pt = [ax + dx * t1, az + dz * t1];
    if (!cur.length) cur.push(a);
    cur.push(b);
    if (t1 < 1) {
      parts.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) parts.push(cur);
  return parts;
}

/**
 * The sea within the rectangle, from the coastline (land on the left of its ways in OSM; turned into the game's frame,
 * which is mirrored, the water lies on the left in x and z). Each stretch of coast that crosses the rectangle is closed
 * along its edge, counterclockwise, to where the next comes in.
 */
function sea(coast: Pt[][], x0: number, x1: number, z0: number, z1: number): Pt[][] {
  const W = x1 - x0, H = z1 - z0, P = 2 * (W + H);
  const eps = 0.01;
  /** Where on the edge a point lies, counterclockwise from (x0, z0). */
  const along = ([x, z]: Pt): number => {
    if (Math.abs(z - z0) < eps) return x - x0;
    if (Math.abs(x - x1) < eps) return W + (z - z0);
    if (Math.abs(z - z1) < eps) return W + H + (x1 - x);
    return 2 * W + H + (z1 - z);
  };
  const onEdge = ([x, z]: Pt) => Math.abs(x - x0) < eps || Math.abs(x - x1) < eps || Math.abs(z - z0) < eps || Math.abs(z - z1) < eps;
  const corners: Array<[number, Pt]> = [[0, [x0, z0]], [W, [x1, z0]], [W + H, [x1, z1]], [2 * W + H, [x0, z1]]];
  const parts = coast.flatMap((c) => clipLine(c, x0, x1, z0, z1)).filter((p) => onEdge(p[0]) && onEdge(p[p.length - 1]));
  const out: Pt[][] = [];
  const used = new Set<number>();
  for (let s = 0; s < parts.length; s++) {
    if (used.has(s)) continue;
    const poly: Pt[] = [];
    let c = s;
    for (let guard = 0; guard <= parts.length; guard++) {
      used.add(c);
      poly.push(...parts[c]);
      const tOut = along(parts[c][parts[c].length - 1]);
      let next = -1, best = Infinity;
      for (let d = 0; d < parts.length; d++) {
        if (used.has(d) && d !== s) continue;
        const gap = (along(parts[d][0]) - tOut + P) % P;
        if (gap < best) { best = gap; next = d; }
      }
      if (next < 0) break;
      // The corners passed on the way round.
      for (const [t, p] of [...corners, ...corners.map(([t, p]) => [t + P, p] as [number, Pt])]) {
        const u = t - tOut;
        if (u > 0 && u < best) poly.push(p);
      }
      if (next === s) break;
      c = next;
    }
    if (poly.length >= 3) out.push(poly);
  }
  return out;
}

// ---- A station. ----

interface Exit { key: string; entrance: Pt | null; entrances: Pt[]; region: Region }

/** Every entrance round a station, by `line:name`, in meters (see `ENTRANCES`). */
const found = new Map<string, Pt[]>();

/** The station and its entrances, in the game's frame: the first thing asked about each station. */
async function entrancesOf(s: Station) {
  const first = await overpass(`${stationQuery(s)}(way[railway=subway](around.s:350);node[railway=subway_entrance](around.s:450););out geom tags;`, `streets-${s.line}-${s.site}-a`);
  const frame = stationFrame(first, s);
  const entrances = first.filter((e) => e.type === 'node' && e.tags?.railway === 'subway_entrance').map((e) => frame.toGame(e.lat!, e.lon!));
  found.set(`${s.line}:${s.name}`, entrances);
  return { ...frame, entrances };
}

async function fetchStation(s: Station): Promise<Array<{ exit: Exit; data: Record<string, unknown> }>> {
  const tag = `streets-${s.line}-${s.site}`;
  const { toGame, heading, entrances } = await entrancesOf(s);
  const exits: Exit[] = [];
  if (s.open || s.city) exits.push({ key: streetKey(s.line, s.name, null), entrance: null, entrances: [], region: { cx: 0, cz: 0, hx: OPEN.x, hz: OPEN.z, round: false } });
  else {
    for (const end of [1, -1] as const) {
      // The entrance furthest out toward this end, or a made-up one 110 m out where OSM has none there.
      const out = entrances.filter(([x, z]) => end * x > -30 && end * x < EXIT_REACH && Math.abs(z) < 160).sort((a, b) => end * b[0] - end * a[0]);
      const entrance: Pt = out[0] ?? [end * 110, 0];
      // The others that way, for a second hall at the same end: each well apart from those before it, and within reach.
      const others: Pt[] = [];
      for (const p of out.slice(1)) if (Math.hypot(p[0] - entrance[0], p[1] - entrance[1]) < R - 60 && [entrance, ...others].every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 40)) others.push(p);
      exits.push({ key: streetKey(s.line, s.name, end), entrance, entrances: others, region: { cx: entrance[0], cz: entrance[1], hx: R, hz: R, round: true } });
    }
  }
  const reach = Math.min(800, Math.max(...exits.map(({ region: r }) => Math.hypot(r.cx, r.cz) + Math.hypot(r.hx, r.hz))) + 20);
  await pause();
  const els = await overpass(
    `${stationQuery(s)}(` +
    `way[building](around.s:${reach});relation[building](around.s:${reach});` +
    `way[highway](around.s:${reach});` +
    `way[leisure~"^(park|garden|playground|pitch|common|dog_park|golf_course)$"](around.s:${reach});` +
    `way[landuse~"^(grass|recreation_ground|meadow|forest|cemetery|allotments|village_green|flowerbed|park)$"](around.s:${reach});` +
    `way[natural~"^(water|wood|scrub|grassland|heath)$"](around.s:${reach});way[waterway=riverbank](around.s:${reach});` +
    `way[amenity=parking](around.s:${reach});way[place=square](around.s:${reach});` +
    `way[natural=coastline](around.s:${reach + 400});` +
    `node[natural=tree](around.s:${reach});` +
    `);out geom tags;` +
    `(relation[leisure~"^(park|garden)$"](around.s:${reach})(if:count_members()<300);relation[landuse~"^(grass|forest|cemetery|recreation_ground)$"](around.s:${reach})(if:count_members()<300);` +
    `relation[natural=wood](around.s:${reach})(if:count_members()<300);relation[place=square](around.s:${reach}););out geom tags;` +
    `relation[natural=water](around.s:${reach});out ids tags;`,
    `${tag}-b`,
  );
  // Overpass leaves out a relation's members at this level of detail: each (a building, a park, a lake such as Mälaren)
  // is asked for whole, once, to be cut to size here.
  const g = (geom: Array<{ lat: number; lon: number }>) => geom.map((p) => toGame(p.lat, p.lon));
  const parts = new Map<number, { outer: Pt[][]; inner: Pt[][] }>();
  for (const rel of els.filter((e) => e.type === 'relation')) {
    const whole = await relationWhole(rel.id);
    const ring = (inner: boolean) => rings(whole.filter((m) => (m.role === 'inner') === inner).map((m) => m.pts.map(([lat, lon]) => toGame(lat, lon))));
    parts.set(rel.id, { outer: ring(false), inner: ring(true) });
  }
  // The coast as long chains, each way joined to the next where one ends and the next begins.
  const coast = joinChains(els.filter((e) => e.type === 'way' && e.tags?.natural === 'coastline' && e.geometry).map((e) => g(e.geometry!)));

  const results: Array<{ exit: Exit; data: Record<string, unknown> }> = [];
  for (const exit of exits) {
    const { cx, cz, hx, hz, round } = exit.region;
    const [x0, x1, z0, z1] = [cx - hx, cx + hx, cz - hz, cz + hz];
    const within = ([x, z]: Pt) => (round ? Math.hypot(x - cx, z - cz) <= R : x >= x0 && x <= x1 && z >= z0 && z <= z1);
    const mid = (ring: Pt[]): Pt => [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];

    // Buildings: the outline of each (a multipolygon's outer rings), whole where its middle is within reach.
    const buildings: Array<{ id: number; b: Array<number | null> }> = [];
    let built = 0;
    for (const e of els) {
      const t = e.tags;
      if (!t?.building || t.building === 'roof' || t.building === 'no' || t.location === 'underground' || t.layer?.startsWith('-')) continue;
      const outlines = e.type === 'way' && e.geometry ? [g(e.geometry).slice(0, -1)]
        : e.type === 'relation' ? parts.get(e.id)?.outer ?? [] : [];
      for (const ring of outlines) {
        if (ring.length < 3 || !within(mid(ring))) continue;
        const simple = simplify(ring, SIMPLIFY);
        if (Math.hypot(...mid(simple).map((v, k) => v - (k ? cz : cx)) as Pt) < 150) built += Math.abs(area(simple));
        buildings.push({ id: e.id, b: [Math.round(heightOf(t) * 10), colourOf(t), roofOf(t), ...packed(simple)] });
      }
    }
    buildings.sort((p, q) => p.id - q.id);

    // Roads, cut to the square, with the names of the streets.
    const names: string[] = [];
    const roads: Array<{ id: number; r: number[] }> = [];
    for (const e of els) {
      const t = e.tags;
      if (e.type !== 'way' || !t?.highway || !e.geometry || t.area === 'yes' || t.tunnel === 'yes' || t.covered === 'yes' || t.layer?.startsWith('-') || t.footway === 'sidewalk') continue;
      const kind = WIDTHS[t.highway];
      if (!kind) continue;
      const lanes = parseFloat(t.lanes ?? '');
      const width = kind[0] === ROAD.road && lanes > 2 ? Math.max(kind[1], lanes * 3.2) : kind[1];
      const name = kind[0] !== ROAD.path ? t.name ?? null : null;
      let n = -1;
      if (name) {
        n = names.indexOf(name);
        if (n < 0) n = names.push(name) - 1;
      }
      for (const part of clipLine(g(e.geometry), x0, x1, z0, z1)) roads.push({ id: e.id, r: [kind[0], Math.round(width * 10), n, ...packed(part)] });
    }
    roads.sort((p, q) => p.id - q.id);

    // Ground: parks, woods, squares and water, cut to the square; holes for the islands in a lake.
    const areas: Array<{ id: number; a: number[] }> = [];
    const addArea = (id: number, kind: number, outer: Pt[], inner: Pt[][]) => {
      const o = clipRing(outer, x0, x1, z0, z1);
      if (o.length < 3 || Math.abs(area(o)) < 4) return;
      // A hole cut to the square often runs along its edge, so it is judged by its middle, not a corner. An island that
      // covers all of it (Kungsholmen in Mälaren) leaves no water.
      const holes = inner.map((h) => clipRing(h, x0, x1, z0, z1)).filter((h) => h.length >= 3 && Math.abs(area(h)) > 1 && inside(middle(h), o));
      if (holes.reduce((sum, h) => sum + Math.abs(area(h)), 0) > 0.97 * Math.abs(area(o))) return;
      areas.push({ id, a: [kind, ...[o, ...holes].flatMap((ring) => [ring.length, ...packed(ring)])] });
    };
    for (const e of els) {
      const kind = e.tags ? areaKind(e.tags) : null;
      if (kind === null || e.tags?.building || (e.tags?.highway && e.tags.area !== 'yes' && e.tags.highway !== 'pedestrian')) continue;
      if (e.type === 'way' && e.geometry && e.geometry.length >= 4) {
        const ring = g(e.geometry);
        if (Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 0.1) addArea(e.id, kind, ring.slice(0, -1), []);
      } else if (e.type === 'relation') {
        const whole = parts.get(e.id);
        for (const outer of whole?.outer ?? []) addArea(e.id, kind, outer, whole!.inner);
      }
    }
    for (const ring of sea(coast, x0, x1, z0, z1)) areas.push({ id: 0, a: [AREA.water, ring.length, ...packed(ring)] });
    areas.sort((p, q) => p.id - q.id);

    const trees = els.filter((e) => e.type === 'node' && e.tags?.natural === 'tree').map((e) => toGame(e.lat!, e.lon!)).filter(within).slice(0, 600);
    // Dense enough to be the city: paved between the houses; else grass.
    const urban = built / (Math.PI * 150 * 150) > 0.24;
    results.push({
      exit,
      data: {
        entrance: exit.entrance && exit.entrance.map((v) => Math.round(v * 10)),
        ...(exit.entrances.length ? { entrances: exit.entrances.map((p) => p.map((v) => Math.round(v * 10))) } : {}),
        urban,
        names,
        trees: packed(trees),
        buildings: buildings.map((b) => b.b),
        roads: roads.map((r) => r.r),
        areas: areas.map((a) => a.a),
      },
    });
    console.log(`${exit.key}: ${buildings.length} buildings, ${roads.length} roads (${names.slice(0, 4).join(', ')}${names.length > 4 ? ', …' : ''}), ${areas.length} areas, ${trees.length} trees, ${Math.round((100 * built) / (Math.PI * 150 * 150))}% built${urban ? ' (city)' : ''}; tracks at ${heading.toFixed(0)}°${exit.entrance ? `, exit at ${exit.entrance.map((v) => v.toFixed(0)).join(', ')}` : ''}`);
  }
  return results;
}

/** Joins ways that follow on from each other (the coast is drawn in one direction throughout). */
function joinChains(chains: Pt[][]): Pt[][] {
  const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
  const open = chains.map((c) => [...c]);
  for (let joined = true; joined;) {
    joined = false;
    for (let i = 0; i < open.length && !joined; i++) {
      for (let j = 0; j < open.length; j++) {
        if (i === j || !same(open[i][open[i].length - 1], open[j][0])) continue;
        open[i] = open[i].concat(open[j].slice(1));
        open.splice(j, 1);
        joined = true;
        break;
      }
    }
  }
  return open;
}

/** A relation's member ways, whole (Overpass's answer kept by relation), as latitude and longitude. */
const lakes = new Map<number, Array<{ role: string; pts: Array<[number, number]> }>>();
async function relationWhole(id: number): Promise<Array<{ role: string; pts: Array<[number, number]> }>> {
  if (!lakes.has(id)) {
    const [rel] = await overpass(`relation(${id});out geom;`, `lake-${id}`);
    lakes.set(id, (rel?.members ?? []).filter((m) => m.type === 'way' && m.geometry).map((m) => ({ role: m.role, pts: m.geometry!.map((p) => [p.lat, p.lon] as [number, number]) })));
  }
  return lakes.get(id)!;
}

const wanted = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--line');
const all = [...allStations().values()];
const lineArg = process.argv.indexOf('--line');
const line = lineArg >= 0 ? process.argv[lineArg + 1] : null;
const chosen = process.argv.includes('--all') ? all : line ? all.filter((s) => s.line === line) : all.filter((s) => wanted.includes(s.name) || wanted.includes(`${s.line}:${s.name}`));
if (!chosen.length) {
  console.error('Name the stations (a name, or line:name), or --all.');
  process.exit(1);
}
const FORMAT = 'bun scripts/osm-streets.ts. In decimeters from the station\'s middle with x along the tracks; a list of points is [x, z, then each next as dx, dz]. '
  + 'entrance: where the stairs come up (underground); entrances: others the same way, further in, for more halls at that end. buildings: [height, facade colour or null, roof (0 flat, 1 pitched), ...outline]. '
  + 'roads: [kind (0 road, 1 pedestrian, 2 path), width, index in names or -1, ...line]. areas: [kind (0 grass, 1 wood, 2 water, 3 paved, 4 asphalt, 5 sand), then per ring (outer first, then holes) its count of points and the points]. trees: points.';
mkdirSync(OUT, { recursive: true });
const failed: string[] = [];
const onlyEntrances = process.argv.includes('--entrances');
for (const [k, s] of chosen.entries()) {
  try {
    if (onlyEntrances) {
      await entrancesOf(s);
      continue;
    }
    for (const { exit, data } of await fetchStation(s)) {
      const { buildings, roads, areas, ...head } = data as { buildings: unknown[]; roads: unknown[]; areas: unknown[] };
      writeJson(`${OUT}/${exit.key}.json`, { license: LICENSE, format: FORMAT, ...head }, { buildings, roads, areas });
    }
  } catch (err) {
    console.error(`${s.line}:${s.name}: ${(err as Error).message.slice(0, 300)}`);
    failed.push(`${s.line}:${s.name}`);
  }
  if (k < chosen.length - 1) await pause();
}
// The entrances of the stations asked about, merged into those of the rest.
if (found.size) {
  const before = existsSync(ENTRANCES) ? (JSON.parse(readFileSync(ENTRANCES, 'utf8')) as { stations: Record<string, number[][]> }).stations : {};
  const stations = { ...before, ...Object.fromEntries([...found].map(([key, list]) => [key, list.map((p) => p.map((v) => Math.round(v)))])) };
  const sorted = Object.keys(stations).sort().map((key) => `    ${JSON.stringify(key)}: ${JSON.stringify(stations[key])}`);
  writeFileSync(ENTRANCES, `{\n  "license": ${JSON.stringify(LICENSE)},\n  "format": "bun scripts/osm-streets.ts --entrances. Per station (line:name), its entrances (railway=subway_entrance) in meters from its middle, x along the tracks toward the next station as the game lays them, z across.",\n  "stations": {\n${sorted.join(',\n')}\n  }\n}\n`);
}
if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exit(1);
}
