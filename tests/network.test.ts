import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';
import { CONNECTORS, NETWORK } from '../src/game/line';
import { LINES } from '../src/landing/lines';
import { GEO, project, SHARED_DEPTH, WATER } from '../src/network/geo';
import { allRoutes, depthOf, LINE_POINTS, linePoints, STATIONS, trainPoint } from '../src/network/data';
import { decodeTerrain, extent, groundOf, type TerrainFile } from '../src/network/terrain';

test('every station of every line has a place, and nothing else does', () => {
  const names = new Set(LINES.flatMap((l) => l.stations.map((s) => s.name)));
  for (const name of names) expect(GEO[name], name).toBeDefined();
  for (const name of Object.keys(GEO)) expect(names.has(name), name).toBe(true);
  expect(STATIONS.length).toBe(names.size);
  expect(STATIONS.find((s) => s.name === 'T-Centralen')!.lines).toEqual([0, 1, 2]);
});

test('the real map and the schematic one agree on which way is which', () => {
  const pts = LINE_POINTS.flat();
  const corr = (a: number[], b: number[]) => {
    const ma = a.reduce((x, y) => x + y) / a.length;
    const mb = b.reduce((x, y) => x + y) / b.length;
    const cov = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0);
    return cov / Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0) * b.reduce((s, y) => s + (y - mb) ** 2, 0));
  };
  expect(corr(pts.map((p) => p.geo.east), pts.map((p) => p.schematic.east))).toBeGreaterThan(0.9);
  expect(corr(pts.map((p) => p.geo.north), pts.map((p) => p.schematic.north))).toBeGreaterThan(0.9);
  // Neighbouring stations lie between a few hundred meters and a few kilometers apart.
  for (const line of allRoutes(0)) for (const route of line) for (let k = 1; k < route.length; k++) {
    const d = Math.hypot(route[k].east - route[k - 1].east, route[k].north - route[k - 1].north);
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(4000);
  }
  for (const poly of WATER) expect(poly.length).toBeGreaterThanOrEqual(3);
});

test('a train at a platform sits at the station, between stations it lies between them', () => {
  const route = allRoutes(0)[0][1];
  const at = trainPoint(route, 3, 0.5);
  expect(at.east).toBeCloseTo(route[3].east);
  expect(at.north).toBeCloseTo(route[3].north);
  const mid = trainPoint(route, 3.5, 0.5);
  expect(mid.east).toBeCloseTo((route[3].east + route[4].east) / 2);
  // The two tracks lie apart.
  const a = trainPoint(route, 3.5, 0);
  const b = trainPoint(route, 3.5, 1);
  expect(Math.hypot(a.east - b.east, a.north - b.north)).toBeGreaterThan(20);
});

test('every station lies about as deep as the game builds it', () => {
  // The game's escalators climb `rise` to a hall 8.5 m under the street; 7 is the least it builds, not a depth.
  for (const s of NETWORK.stations) {
    if (s.rise === undefined || s.rise <= 7 || s.open) continue;
    const id = LINES[s.line].id;
    expect(Math.abs((SHARED_DEPTH[s.name]?.[id] ?? GEO[s.name][2]) - (s.rise + 8.5)), `${s.name} (${id})`).toBeLessThan(5);
  }
});

const terrain = decodeTerrain(JSON.parse(readFileSync('src/network/terrain.json', 'utf8')) as TerrainFile);
const ground = groundOf(terrain);

test('the ground reaches past every station, with the water at the bottom and the hills above it', () => {
  const [w, e, s, n] = extent(terrain);
  for (const [name, [lat, lon]] of Object.entries(GEO)) {
    const p = project(lat, lon);
    expect(p.east > w + 1000 && p.east < e - 1000 && p.north > s + 1000 && p.north < n - 1000, name).toBe(true);
  }
  const at = (lat: number, lon: number) => { const p = project(lat, lon); return ground(p.east, p.north); };
  // Riddarfjärden and Saltsjön; Östermalm's hill round KTH and Vita bergen on Södermalm.
  expect(at(59.324, 18.055)).toBeLessThan(1);
  expect(at(59.3215, 18.095)).toBeLessThan(1);
  expect(at(59.3456, 18.0716)).toBeGreaterThan(15);
  expect(at(59.3125, 18.083)).toBeGreaterThan(15);
  // Far out the land sinks to the sea.
  expect(ground(60_000, 60_000)).toBe(0);
});

test('Kungsträdgården lies far under the sea, Tekniska högskolan up in its hill', () => {
  const points = linePoints(ground);
  const y = (line: number, name: string) => points[line][LINES[line].stations.findIndex((st) => st.name === name)].geo.y;
  expect(y(0, 'Kungsträdgården')).toBeLessThan(-15);
  expect(y(1, 'Tekniska högskolan')).toBeGreaterThan(0);
  expect(depthOf('Tekniska högskolan', 1)).toBeGreaterThan(10);
});

test('between two stations underground the tunnel stays under the ground', () => {
  const routes = allRoutes(0, linePoints(ground));
  for (const line of routes) for (const route of line) for (let s = 0; s < route.length - 1; s += 0.1) {
    const a = route[Math.floor(s)], b = route[Math.floor(s) + 1];
    if (a.depth <= 0 || b.depth <= 0) continue;
    const p = trainPoint(route, s, 0.5, { ground, share: 1 });
    expect(p.y).toBeLessThanOrEqual(ground(p.east, p.north) - Math.min(8, p.depth) + 1e-6);
  }
});

test('the city\'s buildings each stand in their own tile with a height and at least three corners', () => {
  const files = readdirSync('src/network/city').filter((f) => f.endsWith('.json'));
  expect(files.length).toBeGreaterThan(5);
  let count = 0;
  for (const f of files) {
    const data = JSON.parse(readFileSync(`src/network/city/${f}`, 'utf8')) as { tile: number; grain: number; buildings: number[][] };
    for (const b of data.buildings) {
      expect(b[0]).toBeGreaterThan(0);
      expect(b.length % 2).toBe(1);
      expect(b.length).toBeGreaterThanOrEqual(7);
      // Its first corner lies in the tile, give or take a building.
      expect(b[1] * data.grain).toBeGreaterThan(-200);
      expect(b[1] * data.grain).toBeLessThan(data.tile + 200);
      count++;
    }
  }
  expect(count).toBeGreaterThan(5000);
});

test('each end of the connecting track lies in a tunnel of its line, leaving toward the station further along x', () => {
  expect(CONNECTORS.map((c) => c.line).sort()).toEqual(['blue', 'green']);
  for (const c of CONNECTORS) {
    const li = NETWORK.lines.findIndex((l) => l.id === c.line);
    const at = (name: string) => NETWORK.stations.findIndex((st) => st.line === li && st.name === name);
    const [a, b] = [at(c.from), at(c.to)];
    expect(a >= 0 && b >= 0, `${c.from}, ${c.to}`).toBe(true);
    // The world builds only a branch toward +x, in a tunnel the layout has between the two.
    expect(NETWORK.layout.links.some((l) => l.a === a && l.b === b && !l.portal), `${c.from} to ${c.to}`).toBe(true);
    expect(NETWORK.stations[b].open ?? false).toBe(false);
  }
});
