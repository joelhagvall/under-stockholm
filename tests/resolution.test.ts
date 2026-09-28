import { describe, expect, test } from 'bun:test';
import { AdaptiveResolution } from '../src/game/resolution';

/** Runs `frames` frames of `ms` each, the given work in each, and returns the level after. */
function run(r: AdaptiveResolution, frames: number, ms: number | ((level: number) => number), workMs = 3, clock = { now: 0 }): number {
  for (let i = 0; i < frames; i++) {
    const frame = typeof ms === 'number' ? ms : ms(r.level);
    clock.now += frame;
    r.frame(frame, workMs, clock.now);
  }
  return r.level;
}

describe('adaptive resolution', () => {
  test('a GPU that cannot keep up gets fewer pixels, and keeps them while they help', () => {
    const r = new AdaptiveResolution();
    // 30 ms at full size, 20 ms one notch down: the notch helps and stays.
    expect(run(r, 200, (level) => (level === 0 ? 30 : 20))).toBe(1);
  });

  test('a browser held at 30 fps keeps full resolution', () => {
    const r = new AdaptiveResolution();
    const clock = { now: 0 };
    // The notch is tried once, does not help and is given back; after that 33 ms is the screen's own pace.
    run(r, 200, 33.3, 3, clock);
    expect(r.level).toBe(0);
    expect(run(r, 2000, 33.3, 3, clock)).toBe(0);
  });

  test('frames held up by the game itself do not lower it', () => {
    const r = new AdaptiveResolution();
    // A station built on the way: 40 ms frames, nearly all of it the game's own work.
    expect(run(r, 200, 40, 35)).toBe(0);
  });

  test('a phone whose frames wander either side of the line is lowered', () => {
    const r = new AdaptiveResolution();
    let i = 0;
    // About 40 fps, never 30 slow frames in a row; one notch down it keeps up.
    expect(run(r, 300, (level) => (level === 0 ? [20, 27, 29][i++ % 3] : 16))).toBe(1);
  });

  test('a single hitch among quick frames does not lower it', () => {
    const r = new AdaptiveResolution();
    let i = 0;
    expect(run(r, 600, () => (++i % 30 === 0 ? 200 : 16.7))).toBe(0);
  });

  test('gets its pixels back after a minute of headroom', () => {
    const r = new AdaptiveResolution();
    const clock = { now: 0 };
    run(r, 100, (level) => (level === 0 ? 30 : 20), 3, clock);
    expect(r.level).toBe(1);
    expect(run(r, 4200, 16.7, 3, clock)).toBe(0);
  });
});
