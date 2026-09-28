import { expect, test } from 'bun:test';
import { Express } from '../src/game/express';
import { TRAIN_HALF_L, TRAIN_NOSE } from '../src/game/layout';
import { BLUE_LINE, routeTimetables, stationPositions } from '../src/game/line';
import { Operations, TRAIN_COUNT } from '../src/game/operations';

const routes = routeTimetables(BLUE_LINE);
const operations = new Operations(routes);
const express = new Express(operations, stationPositions(BLUE_LINE));

test('the empty train runs now and then and never meets a regular train', () => {
  const start = Date.UTC(2026, 8, 23, 6) / 1000;
  let runs = 0;
  for (let t = start; t < start + 12 * 3600; t += 1) {
    const e = express.stateAt(t);
    if (!e) continue;
    runs++;
    for (let i = 0; i < TRAIN_COUNT; i++) {
      if (!operations.inService(t, i)) continue;
      const r = operations.timetableOf(i).stateAt(t + operations.offsets[i]);
      if (Math.abs(r.z - e.z) < 2) expect(Math.abs(r.x - e.x)).toBeGreaterThan(2 * (TRAIN_HALF_L + TRAIN_NOSE) + 20);
    }
  }
  // Most half hours find a gap.
  expect(runs).toBeGreaterThan(12 * 2 * 0.5 * 20);
});
