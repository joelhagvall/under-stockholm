import { expect, test } from 'bun:test';
import { GUARD_CASES, pickCase, pickPost } from '../src/game/guard';
import { Scene } from 'three';
import { GhostWalker, ghostWalk, GhostWalkState, WALK_STOPS } from '../src/game/ghostWalk';
import { NETWORK } from '../src/game/line';
import { lineStock } from '../src/game/trainModel';
import sv from '../src/game/i18n/sv.json';
import en from '../src/game/i18n/en.json';

const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const ROUTES = [[0, 1, 2, 3, 4, 5, 6, 7], [10, 11, 3, 12]];

test('the radio sends you here or at most three stops along a route through you', () => {
  expect(pickPost(3, ROUTES, sequence(0))).toBe(3);
  for (let k = 0; k < 40; k++) {
    const post = pickPost(3, ROUTES, sequence(0.9, k / 40));
    expect([0, 1, 2, 4, 5, 6, 10, 11, 12]).toContain(post);
  }
});

test('a station on no route keeps the case at home', () => {
  expect(pickPost(99, ROUTES, sequence(0.9, 0.5))).toBe(99);
});

test('the same kind of case never comes twice running', () => {
  for (let k = 0; k < 40; k++) expect(pickCase('music', sequence(k / 40))).not.toBe('music');
});

test('every case is told in both languages', () => {
  for (const kind of GUARD_CASES) {
    for (const key of ['call', 'prompt', 'done'] as const) {
      expect(sv.guard.cases[kind][key]).toBeTruthy();
      expect(en.guard.cases[kind][key]).toBeTruthy();
    }
    expect(sv.guard.cases[kind].prompt.startsWith('E · ')).toBe(true);
  }
});

test('the ghost walk goes round every stop, is told at each and is remembered', () => {
  expect(sv.ghostWalk.stops.length).toBe(WALK_STOPS.length);
  expect(en.ghostWalk.stops.length).toBe(WALK_STOPS.length);
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  const walk = new GhostWalkState(storage);
  expect(walk.active).toBe(false);
  walk.start();
  for (let i = 0; i < WALK_STOPS.length; i++) {
    expect(walk.waitingAt(i)).toBe(true);
    walk.advance();
  }
  expect(walk.active).toBe(false);
  expect(walk.done).toBe(true);
  expect(new GhostWalkState(storage).done).toBe(true);
});

test('the watchman is drawn only near Kymlinge', () => {
  const scene = new Scene();
  const walker = new GhostWalker(scene, 1000);
  const mesh = scene.getObjectByName('ghost-walker')!;
  ghostWalk.start();
  for (let i = 0; i < 4; i++) walker.update(1, 1000);
  expect(mesh.visible).toBe(true);
  walker.update(1, 5000);
  expect(mesh.visible).toBe(false);
  ghostWalk.step = -1;
});

test('the blue line keeps its C30s in the summer timetable', () => {
  const blue = NETWORK.lines.find((l) => l.id === 'blue')!;
  for (const slot of blue.summerRest ?? []) expect(lineStock('blue', slot)).toBe('c20');
});

test('the red line is all C30s, every third blue train one, the green line none', () => {
  expect([0, 1, 2, 3].map((slot) => lineStock('red', slot))).toEqual(['c30', 'c30', 'c30', 'c30']);
  expect([0, 1, 2, 3, 4, 5].map((slot) => lineStock('blue', slot))).toEqual(['c20', 'c30', 'c20', 'c20', 'c30', 'c20']);
  expect([0, 1, 2].map((slot) => lineStock('green', slot))).toEqual(['c20', 'c20', 'c20']);
});
