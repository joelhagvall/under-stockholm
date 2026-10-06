import { expect, test } from 'bun:test';
import { serviceOpen, stockholm, stockholmEpoch } from '../src/game/clock';
import { BLUE_LINE, routeTimetables } from '../src/game/line';
import { dateAt, daytime, silverStop, weekdayAt } from '../src/game/showcase';
import { Silverpilen } from '../src/game/silverpilen';
import { trunkHeadway } from './blue';

// A Sunday in late September, a little after eleven at night.
const sundayNight = stockholmEpoch(2026, 9, 27, 23, 10);

test('the tour shows trains by day', () => {
  const day = daytime(sundayNight);
  expect(stockholm(day).hours).toBe(13);
  expect(stockholm(day).day).toBe(28);
  const noon = stockholmEpoch(2026, 9, 28, 12, 0);
  expect(daytime(noon)).toBe(noon);
});

test('rush hour and night work fall on weekdays', () => {
  const rush = stockholm(weekdayAt(sundayNight, 8, 10));
  expect([rush.weekday, rush.hour, rush.minute]).toEqual([1, 8, 10]);
  // A weeknight at twenty to three, when the trains rest.
  const night = weekdayAt(sundayNight, 2, 40);
  expect(stockholm(night).weekday).toBeGreaterThanOrEqual(1);
  expect(stockholm(night).weekday).toBeLessThanOrEqual(5);
  expect(serviceOpen(night)).toBe(false);
});

test('dates land on the day, this year', () => {
  const lucia = stockholm(dateAt(sundayNight, 12, 13, 7, 50));
  expect([lucia.year, lucia.month, lucia.day, lucia.hour, lucia.minute]).toEqual([2026, 12, 13, 7, 50]);
});

test('the tour finds Silverpilen with its doors opening', () => {
  const timetables = routeTimetables(BLUE_LINE);
  const route = BLUE_LINE.routes.findIndex((r) => r.number === BLUE_LINE.ghost.route);
  const silver = new Silverpilen(timetables[route], trunkHeadway, 5000);
  const from = stockholmEpoch(2026, 9, 28, 13, 0);
  const stop = silverStop(silver, from);
  expect(stop).not.toBeNull();
  expect(stop!.time).toBeGreaterThanOrEqual(from);
  const s = silver.stateAt(stop!.time);
  expect(s?.phase).toBe('opening');
  expect(s?.at).toBe(stop!.station);
});
