import { expect, test } from 'bun:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { World } from '../src/game/world/world';

test('nearby geometry stays visible across movement and newly streamed groups are culled immediately', () => {
  // Exercise public visibility updates without constructing the entire procedural line.
  const world = Object.assign(Object.create(World.prototype) as World, {
    group: new Group(), lazy: [], built: [], building: null, paused: [], recording: null, extents: new Map(), shownAt: Number.NaN, shownCount: 0, openRanges: [],
  });
  const section = (x: number) => {
    const mesh = new Mesh(new BoxGeometry(20, 20, 20), new MeshBasicMaterial());
    mesh.position.x = x;
    world.group.add(mesh);
    return mesh;
  };
  const origin = section(0), distant = section(1000);
  world.ensureBuilt(0);
  expect(origin.visible).toBe(true);
  expect(distant.visible).toBe(false);
  const streamed = section(2000);
  world.ensureBuilt(0);
  expect(streamed.visible).toBe(false);
  world.ensureBuilt(1000);
  expect(origin.visible).toBe(false);
  expect(distant.visible).toBe(true);
  world.ensureBuilt(2000);
  expect(distant.visible).toBe(false);
  expect(streamed.visible).toBe(true);
});

test('a stretch built far away is taken down, freed and built again on the way back', () => {
  const world = Object.assign(Object.create(World.prototype) as World, {
    group: new Group(), lazy: [], built: [], building: null, paused: [], recording: null, extents: new Map(), shownAt: Number.NaN, shownCount: 0, openRanges: [], warm: null,
  });
  let builds = 0;
  let disposed = 0;
  const later = (World.prototype as unknown as { later(x0: number, x1: number, build: () => Generator<void, void>): void }).later;
  later.call(world, 0, 100, function* (this: World) {
    builds++;
    const geo = new BoxGeometry(20, 20, 20);
    geo.addEventListener('dispose', () => disposed++);
    const mesh = new Mesh(geo, new MeshBasicMaterial());
    mesh.position.x = 50;
    yield* (World.prototype as unknown as { add(g: Mesh): Generator<void, void> }).add.call(world, mesh);
  }.bind(world));
  world.ensureBuilt(50);
  expect(builds).toBe(1);
  expect(world.group.children.length).toBe(1);
  // Far off: taken down and freed.
  world.ensureBuilt(5000);
  expect(world.group.children.length).toBe(0);
  expect(disposed).toBe(1);
  // Back again: built anew.
  world.ensureBuilt(50);
  expect(builds).toBe(2);
  expect(world.group.children.length).toBe(1);
});

test('an underground station\'s second hall is hidden from the open air, where it would float over the hill', () => {
  const world = Object.assign(Object.create(World.prototype) as World, {
    group: new Group(), lazy: [], built: [], building: null, paused: [], recording: null, extents: new Map(), shownAt: Number.NaN, shownCount: 0, openRanges: [[-300, -100]],
  });
  const hall = new Mesh(new BoxGeometry(20, 20, 20), new MeshBasicMaterial());
  hall.userData.underground = true;
  world.group.add(hall);
  world.ensureBuilt(-150);
  expect(hall.visible).toBe(false);
  world.ensureBuilt(0);
  expect(hall.visible).toBe(true);
});
