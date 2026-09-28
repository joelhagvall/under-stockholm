import { expect, test } from 'bun:test';
import { Vector3 } from 'three';
import { MeshBuilder, type Paint } from '../src/game/gfx/builder';

test('subdivided geometry preserves positions, normals, paint and UVs', () => {
  const a = new Vector3(-3, 1, 2), b = new Vector3(4, 2, 2);
  const c = new Vector3(5, 3, 8), d = new Vector3(-2, 2, 7);
  const paint: Paint = (p, n) => [p.x / 10, p.z / 10, Math.abs(n.y)];
  const actual = new MeshBuilder();
  actual.gridQuad(a, b, c, d, paint, 2);
  const reference = new MeshBuilder();
  const nu = Math.ceil(a.distanceTo(b) / 2), nv = Math.ceil(a.distanceTo(d) / 2);
  const at = (u: number, v: number) => new Vector3().lerpVectors(a, b, u).lerp(new Vector3().lerpVectors(d, c, u), v);
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      reference.quad(at(i / nu, j / nv), at((i + 1) / nu, j / nv), at((i + 1) / nu, (j + 1) / nv), at(i / nu, (j + 1) / nv), paint);
    }
  }
  const geo = actual.build(), expected = reference.build();
  for (const key of ['position', 'normal', 'color', 'uv']) {
    expect(geo.getAttribute(key).array).toEqual(expected.getAttribute(key).array);
  }
  expect(geo.boundingBox).toEqual(expected.boundingBox);
  expect(geo.boundingSphere).toEqual(expected.boundingSphere);
});

test('a build hands its vertices over: the builder starts empty, and the builds never share memory', () => {
  const builder = new MeshBuilder();
  builder.tri(new Vector3(), new Vector3(1, 0, 0), new Vector3(0, 1, 0), [1, 1, 1]);
  const first = builder.build();
  expect(builder.vertexCount).toBe(0);
  first.getAttribute('color').setX(0, 0.25);
  builder.tri(new Vector3(), new Vector3(2, 0, 0), new Vector3(0, 2, 0), [1, 0, 0]);
  const second = builder.build();
  expect(first.getAttribute('position').count).toBe(3);
  expect(second.getAttribute('position').count).toBe(3);
  expect(second.getAttribute('position').getX(1)).toBe(2);
  expect(second.getAttribute('color').getX(0)).toBe(1);
  expect(first.getAttribute('color').getX(0)).toBe(0.25);
  // No copy: the geometry's array is the builder's own buffer, sized to what was filled.
  expect(first.getAttribute('position').array.length).toBe(9);
});
