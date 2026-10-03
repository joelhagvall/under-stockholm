import { expect, test } from 'bun:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { World } from '../src/game/world/world';

test('settling at a station ignores distant builds and waits for nearby queued data and paused work', () => {
  const entry = (x0: number, x1: number) => ({ x0, x1, groups: [], build: () => {} });
  const distant = entry(0, 167), nearby = entry(6000, 6200);
  const world = Object.assign(Object.create(World.prototype) as World, {
    building: { entry: distant }, paused: [], lazy: [],
  });
  expect(world.hasPendingBuild(6259)).toBe(false);
  expect(world.hasPendingBuild(50)).toBe(true);
  Object.assign(world, { paused: [{ entry: nearby }] });
  expect(world.hasPendingBuild(6259)).toBe(true);
  expect(world.hasPendingBuild(9000)).toBe(false);
  let readinessChecks = 0;
  Object.assign(world, { building: null, paused: [], lazy: [{ ...nearby, ready: () => { readinessChecks++; return false; } }] });
  expect(world.hasPendingBuild(6259)).toBe(true);
  expect(world.hasPendingBuild(9000)).toBe(false);
  expect(readinessChecks).toBe(0);
});

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

test('startup prepares the chosen view across slices and leaves distant stations queued', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: true } });
  try {
    const world = Object.assign(Object.create(World.prototype) as World, {
      group: new Group(), lazy: [], built: [], building: null, paused: [], recording: null,
      extents: new Map(), shownAt: Number.NaN, shownCount: 0, openRanges: [], warm: null,
    });
    let nearReady = false, farReady = false;
    const later = (World.prototype as unknown as { later(x0: number, x1: number, build: () => Generator<void, void>): void }).later;
    later.call(world, 0, 100, function* () { yield; yield; nearReady = true; });
    later.call(world, 6000, 6200, function* () { farReady = true; });
    const pending = world.prepare(50, 0);
    expect(nearReady).toBe(false);
    await pending;
    expect(nearReady).toBe(true);
    expect(world.hasPendingBuild(50)).toBe(false);
    expect(farReady).toBe(false);
    expect(world.hasPendingBuild(6100)).toBe(true);
    await world.prepare(6100, 0);
    expect(farReady).toBe(true);
    expect(world.hasPendingBuild(6100)).toBe(false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
