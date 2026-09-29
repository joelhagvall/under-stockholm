import { expect, test } from 'bun:test';
import { NOSE } from '../src/game/trainModel';
import { TRACK_Z, TRAIN_HALF_L, TRAIN_HALF_W } from '../src/game/layout';
import { BLUE_LINE, ghostX, NETWORK, routeTimetables } from '../src/game/line';
import { Operations, TRAIN_COUNT } from '../src/game/operations';
import { Silverpilen } from '../src/game/silverpilen';

const routes = routeTimetables(BLUE_LINE);
const operations = new Operations(routes);
const ghostRoute = BLUE_LINE.routes.findIndex((r) => r.number === BLUE_LINE.ghost.route);
const kymlinge = ghostX(NETWORK);
const silver = new Silverpilen(routes[ghostRoute], routes[0].cycle / TRAIN_COUNT, kymlinge);

test('Silverpilen keeps well clear of every regular train on track 1, on both routes', () => {
  const clearance = 2 * (TRAIN_HALF_L + NOSE) + 20;
  for (let hour = 493000; hour < 493030; hour++) {
    const start = silver.runStart(hour);
    for (let t = start; t < start + silver.duration(hour); t += 0.5) {
      const s = silver.stateAt(t);
      expect(s).not.toBeNull();
      for (let i = 0; i < TRAIN_COUNT; i++) {
        const r = operations.timetableOf(i).stateAt(t + operations.offsets[i]);
        if (Math.abs(r.z + TRACK_Z) < 2 * TRAIN_HALF_W + 0.3) expect(Math.abs(r.x - s!.x)).toBeGreaterThan(clearance);
      }
    }
  }
});

test('each run stops at one station, then at Kymlinge, then vanishes before Kista', () => {
  const kista = BLUE_LINE.stations.findIndex((s) => s.name === 'Kista');
  for (const hour of [493101, 493102, 493103]) {
    const start = silver.runStart(hour);
    const stops = new Set<string>();
    let last = -Infinity;
    for (let t = start; t < start + silver.duration(hour); t += 0.25) {
      const s = silver.stateAt(t)!;
      expect(s.x).toBeGreaterThanOrEqual(last - 1e-6);
      last = s.x;
      if (s.phase === 'dwell') stops.add(String(s.at));
      if (s.opacity > 0.05) expect(s.x + TRAIN_HALF_L).toBeLessThan(routes[ghostRoute].stationX[kista] - 80);
    }
    expect([...stops]).toEqual([String(silver.stopStation(hour)), 'kymlinge']);
    expect(last).toBeGreaterThan(kymlinge);
    expect(silver.stateAt(start + silver.duration(hour) + 1)).toBeNull();
    expect(BLUE_LINE.stations[silver.stopStation(hour)].branch ?? '11').toBe('11');
  }
});

test('runs happen once an hour and never overlap', () => {
  for (let hour = 493000; hour < 493100; hour++) {
    const end = silver.runStart(hour) + silver.duration(hour);
    expect(silver.runStart(hour)).toBeGreaterThanOrEqual(hour * 3600);
    expect(end).toBeLessThan(silver.runStart(hour + 1));
  }
});
