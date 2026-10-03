import { expect, test } from 'bun:test';
import { BufferAttribute, BufferGeometry } from 'three';
import { bakeLighting, prepareLighting, type BakeLight } from '../src/game/gfx/builder';

function fixture() {
  const lights: BakeLight[] = Array.from({ length: 25 }, (_, k) => ({
    x: k * 5.3 - 60, y: (k % 4) * 6 - 10, z: (k % 5) * 12 - 24,
    range: 5.5 + k % 6, intensity: 0.4 + k / 20, color: [0.8, 0.9, 1],
  }));
  const points = [-1000, -64, -8, 0, 8, 24, 1000].flatMap((x) => [-16, 0, 8, 16].flatMap((y) => [-24, 0, 24].map((z) => [x, y, z])));
  // Include exact light centers and range boundaries, including cells with negative coordinates.
  for (const l of lights) points.push([l.x, l.y, l.z], [l.x + l.range, l.y, l.z], [l.x - l.range, l.y, l.z]);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(points.flat()), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(points.flatMap(() => [0, 1, 0])), 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(points.flatMap(() => [0.4, 0.6, 0.8])), 3));
  return { geo, lights };
}

test('spatial lighting matches a brute-force bake at cell edges, outside cells and inside overlapping lights', () => {
  const { geo, lights } = fixture();
  const p = geo.getAttribute('position'), expected = geo.getAttribute('color').array.slice();
  for (let i = 0; i < p.count; i++) {
    const sum = [0.1, 0.2, 0.3];
    for (const l of lights) {
      const dx = Math.fround(l.x) - p.getX(i), dy = Math.fround(l.y) - p.getY(i), dz = Math.fround(l.z) - p.getZ(i);
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > Math.fround(l.range * l.range)) continue;
      const d = Math.sqrt(d2) || 1e-4;
      const fall = 1 - d / Math.fround(l.range);
      const k = Math.fround(l.intensity) * (0.3 + 0.7 * Math.abs(dy / d)) * fall * fall;
      for (let c = 0; c < 3; c++) sum[c] += Math.fround(l.color[c]) * k;
    }
    for (let c = 0; c < 3; c++) expected[i * 3 + c] *= sum[c];
  }
  bakeLighting(geo, prepareLighting(lights), [0.1, 0.2, 0.3]);
  const actual = geo.getAttribute('color').array;
  for (let i = 0; i < actual.length; i++) expect(actual[i]).toBeCloseTo(expected[i], 6);
});

test('sliced lighting reuses its lookup and matches a complete bake', () => {
  const { geo, lights } = fixture();
  const sliced = geo.clone(), lookup = prepareLighting(lights);
  bakeLighting(geo, lights, [0.2, 0.2, 0.2]);
  for (let from = 0; from < sliced.getAttribute('position').count; from += 13) bakeLighting(sliced, lookup, [0.2, 0.2, 0.2], from, from + 13);
  expect(sliced.getAttribute('color').array).toEqual(geo.getAttribute('color').array);
});

test('unlit regions receive only ambient light when no lamps exist', () => {
  const { geo } = fixture();
  bakeLighting(geo, [], [0.5, 0.25, 0.125]);
  const c = geo.getAttribute('color');
  expect(c.getX(0)).toBeCloseTo(0.2, 6);
  expect(c.getY(0)).toBeCloseTo(0.15, 6);
  expect(c.getZ(0)).toBeCloseTo(0.1, 6);
});

test('shared positions preserve each normal and paint, and later bakes use their own lights and daylight', () => {
  const geo = new BufferGeometry();
  const normals = [[1, 0, 0], [1, 0, 0], [0, 1, 0], [0, 1, 0], [1, 0, 0], [1, 0, 0]];
  const colors = [[0.2, 0.4, 0.6], [0.3, 0.5, 0.7], [0.5, 0.2, 0.4], [0.7, 0.3, 0.5], [0.6, 0.4, 0.2], [0.8, 0.6, 0.3]];
  geo.setAttribute('position', new BufferAttribute(new Float32Array(normals.flatMap(() => [0, 0, 0])), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(normals.flat()), 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(colors.flat()), 3));
  const lights: BakeLight[] = [{ x: 3, y: 4, z: 0, color: [1, 0.5, 0.25], intensity: 1, range: 10 }];
  for (const lit of [true, false]) {
    const actual = geo.clone();
    const sky: [number, number, number] = lit ? [0.2, 0.4, 0.6] : [0.6, 0.3, 0.1];
    bakeLighting(actual, lit ? lights : [], [0.1, 0.2, 0.3], 0, Infinity, sky);
    for (let i = 0; i < normals.length; i++) {
      const alone = new BufferGeometry();
      alone.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3));
      alone.setAttribute('normal', new BufferAttribute(new Float32Array(normals[i]), 3));
      alone.setAttribute('color', new BufferAttribute(new Float32Array(colors[i]), 3));
      bakeLighting(alone, lit ? lights : [], [0.1, 0.2, 0.3], 0, Infinity, sky);
      expect(actual.getAttribute('color').array.slice(i * 3, i * 3 + 3)).toEqual(alone.getAttribute('color').array);
    }
  }
});
