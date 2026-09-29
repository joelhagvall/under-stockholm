import { LINES } from '../landing/lines';
import { KYMLINGE_AFTER, STATION_SPACING } from '../game/layout';
import { Silverpilen } from '../game/silverpilen';
import { layout, MAP_REACH, ROUTE_STATIONS, services, type MapTrain } from '../landing/trains';
import { GEO, project, SHARED_DEPTH } from './geo';

/**
 * The whole network in two shapes at once: true geography (meters east and north of T-Centralen, and depth below
 * ground) and the schematic SL map, flat. Everything the network view and the long exposure draw is a point in
 * both, blended by `morph` (0 geography, 1 schematic). Free of three.js.
 */

export interface NetPoint {
  east: number;
  north: number;
  /** Meters below ground (negative above). */
  depth: number;
}

/** How wide the schematic map is spread, in meters, so it covers about the same ground as the real city. */
const SCHEMATIC = 24_000;
/** The schematic map's T-Centralen, which lies at the origin like the real one. */
const CENTER = LINES[0].stations[1].map;
/** Meters per station step beyond a line's end, into the turnback. */
const REACH_STEP = 450;
/** Half the distance between the two tracks' trains, in meters. */
export const TRACK_SIDE = 22;

export interface NetStation {
  name: string;
  /** Every line calling here, by index into `LINES`. */
  lines: number[];
  geo: NetPoint;
  schematic: NetPoint;
}

export function depthOf(name: string, line: number): number {
  return SHARED_DEPTH[name]?.[LINES[line].id] ?? GEO[name]?.[2] ?? 0;
}

function geoPoint(name: string, line: number): NetPoint {
  const g = GEO[name];
  if (!g) throw new Error(`No position for ${name}`);
  const p = project(g[0], g[1]);
  return { ...p, depth: depthOf(name, line) };
}

function schematicPoint(map: readonly [number, number]): NetPoint {
  return { east: (map[0] - CENTER[0]) * SCHEMATIC, north: -(map[1] - CENTER[1]) * SCHEMATIC, depth: 0 };
}

/** Per line, per station of that line (its own index): the point in both shapes. */
export const LINE_POINTS: Array<Array<{ geo: NetPoint; schematic: NetPoint }>> = LINES.map((line, li) =>
  line.stations.map((s) => ({ geo: geoPoint(s.name, li), schematic: schematicPoint(s.map) })));

/** Every station once, by name: T-Centralen appears on all three lines but is one place. */
export const STATIONS: NetStation[] = (() => {
  const byName = new Map<string, NetStation>();
  LINES.forEach((line, li) => line.stations.forEach((s, i) => {
    const known = byName.get(s.name);
    if (known) { if (!known.lines.includes(li)) known.lines.push(li); return; }
    byName.set(s.name, { name: s.name, lines: [li], geo: LINE_POINTS[li][i].geo, schematic: LINE_POINTS[li][i].schematic });
  }));
  return [...byName.values()];
})();

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function blend(p: { geo: NetPoint; schematic: NetPoint }, morph: number): NetPoint {
  return { east: lerp(p.geo.east, p.schematic.east, morph), north: lerp(p.geo.north, p.schematic.north, morph), depth: lerp(p.geo.depth, p.schematic.depth, morph) };
}

/** A route's stations as points, east to west. */
export function routePoints(line: number, route: number, morph: number): NetPoint[] {
  return ROUTE_STATIONS[line][route].map((i) => blend(LINE_POINTS[line][i], morph));
}

/**
 * Where a train `s` station steps along its route lies: between two stations piecewise, so a train at a platform
 * sits exactly at the station, and past the ends straight on into the turnback. `row` moves it to its track's side.
 */
export function trainPoint(points: NetPoint[], s: number, row: number): NetPoint {
  const n = points.length - 1;
  const t = Math.min(n + MAP_REACH, Math.max(-MAP_REACH, s));
  let p: NetPoint;
  let dx: number;
  let dy: number;
  if (t <= 0 || t >= n) {
    const [a, b] = t <= 0 ? [points[1], points[0]] : [points[n - 1], points[n]];
    const len = Math.hypot(b.east - a.east, b.north - a.north) || 1;
    dx = (b.east - a.east) / len;
    dy = (b.north - a.north) / len;
    const k = (t <= 0 ? -t : t - n) * REACH_STEP;
    p = { east: b.east + dx * k, north: b.north + dy * k, depth: b.depth };
  } else {
    const k = Math.floor(t);
    const f = t - k;
    const a = points[k];
    const b = points[k + 1];
    p = { east: lerp(a.east, b.east, f), north: lerp(a.north, b.north, f), depth: lerp(a.depth, b.depth, f) };
    const len = Math.hypot(b.east - a.east, b.north - a.north) || 1;
    dx = (b.east - a.east) / len;
    dy = (b.north - a.north) / len;
  }
  // Track 1 on one side of the line, track 2 on the other.
  const side = (row - 0.5) * 2 * TRACK_SIDE;
  return { east: p.east - dy * side, north: p.north + dx * side, depth: p.depth };
}

/** A train's point, given every route's points for the current morph (`routes[line][route]`). */
export function placeTrain(routes: NetPoint[][][], line: number, train: MapTrain): NetPoint {
  return trainPoint(routes[line][train.route], train.s, train.row);
}

/** Every route's points, `[line][route]`. */
export function allRoutes(morph: number): NetPoint[][][] {
  return LINES.map((line, li) => line.routes.map((_, r) => routePoints(li, r, morph)));
}

// Silverpilen, the ghost train: once an hour down the Akalla branch to Kymlinge, where it fades (see `silverpilen.ts`).
const GHOST_ROUTE = LINES[0].routes.findIndex((r) => r.number === '11');
const ghostStations = ROUTE_STATIONS[0][GHOST_ROUTE].map((i) => layout.x[layout.global[0][i]]);
const hallonbergen = LINES[0].stations.findIndex((st) => st.name === 'Hallonbergen');
const silver = new Silverpilen(services[0].timetables[GHOST_ROUTE], services[0].headway / LINES[0].routes.length, layout.x[layout.global[0][hallonbergen]] + KYMLINGE_AFTER);

/** Station steps along the Akalla route for a world x on it. */
function stepsAt(x: number): number {
  const xs = ghostStations;
  if (x <= xs[0]) return (x - xs[0]) / STATION_SPACING;
  for (let k = 0; k < xs.length - 1; k++) if (x <= xs[k + 1]) return k + (x - xs[k]) / (xs[k + 1] - xs[k]);
  return xs.length - 1 + (x - xs[xs.length - 1]) / STATION_SPACING;
}

/** Silverpilen as a map train, with how visible it is, or null when it is not running. */
export function silverTrain(time: number): (MapTrain & { opacity: number }) | null {
  const st = silver.stateAt(time);
  if (!st || st.opacity < 0.02) return null;
  return {
    id: `silver-${st.run}`, line: '11', destination: null, route: GHOST_ROUTE, s: stepsAt(st.x), row: 1, doorsOpen: st.doors > 0,
    status: { kind: 'away' }, opacity: st.opacity,
  };
}
