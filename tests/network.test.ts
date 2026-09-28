import { expect, test } from 'bun:test';
import { LINES } from '../src/landing/lines';
import { GEO, WATER } from '../src/network/geo';
import { allRoutes, LINE_POINTS, STATIONS, trainPoint } from '../src/network/data';

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
