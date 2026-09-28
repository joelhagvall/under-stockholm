import { expect, test } from 'bun:test';
import { TouchGestures } from '../src/game/touchGestures';

test('two thumbs can walk and look independently, releasing look keeps walking', () => {
  const input = new TouchGestures();
  expect(input.startMove(1, 100, 200, 40)).toBe(true);
  expect(input.startLook(2, 300, 100)).toBe(true);
  input.move(1, 100, 160);
  expect(input.forward).toBeCloseTo(1);
  expect(input.move(2, 320, 90)).toEqual({ dx: 20, dy: -10 });
  expect(input.forward).toBeCloseTo(1);
  input.end(2);
  expect(input.forward).toBeCloseTo(1);
  expect(input.move(2, 900, 900)).toBeNull();
  input.end(1);
  expect(input.forward).toBe(0);
  expect(input.side).toBe(0);
});

test('a small stick deflection walks slowly, diagonal and out-of-bounds drags cannot increase maximum speed', () => {
  const input = new TouchGestures();
  input.startMove(1, 0, 0, 40);
  input.move(1, 2, 0);
  expect(input.side).toBe(0);
  input.move(1, 20, 0);
  expect(input.side).toBeGreaterThan(0);
  expect(input.side).toBeLessThan(0.5);
  input.move(1, 400, -400);
  expect(Math.hypot(input.side, input.forward)).toBeCloseTo(1);
  expect(input.side).toBeCloseTo(input.forward);
});

test('extra fingers cannot steal the stick or camera and cannot stop another pointer', () => {
  const input = new TouchGestures();
  input.startMove(4, 0, 0, 40);
  input.move(4, 40, 0);
  expect(input.startLook(4, 20, 20)).toBe(false);
  expect(input.startMove(5, 0, 0, 40)).toBe(false);
  expect(input.startLook(5, 100, 100)).toBe(true);
  expect(input.startLook(6, 200, 200)).toBe(false);
  input.end(6);
  expect(input.side).toBe(1);
  expect(input.move(5, 101, 102)).toEqual({ dx: 1, dy: 2 });
});

test('cancel, pause and rotation resets stop held movement and discard stale camera coordinates', () => {
  const input = new TouchGestures();
  input.startMove(1, 0, 0, 40);
  input.startLook(2, 20, 20);
  input.move(1, 0, -40);
  input.reset();
  expect(input.forward).toBe(0);
  expect(input.move(2, 1000, 1000)).toBeNull();
  expect(input.startMove(3, 0, 0, 40)).toBe(true);
  expect(input.startLook(4, 600, 300)).toBe(true);
  expect(input.move(4, 601, 302)).toEqual({ dx: 1, dy: 2 });
});
