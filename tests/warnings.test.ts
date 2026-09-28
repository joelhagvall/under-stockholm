import { expect, test } from 'bun:test';
import { asNotice, forStockholm, parseWarnings, STOCKHOLM_COUNTY } from '../src/game/warnings';

const now = Date.parse('2026-12-10T12:00:00Z') / 1000;
const area = (id: number, level: string, start: string, end: string | undefined, county = STOCKHOLM_COUNTY, what = 'Snöfall') => ({
  id,
  approximateStart: start,
  approximateEnd: end,
  warningLevel: { code: level },
  eventDescription: { sv: what },
  affectedAreas: [{ id: county, sv: 'Län' }],
});
const warning = (code: string, areas: object[]) => ({ id: 1, event: { code, sv: code }, warningAreas: areas });

test('only Stockholms län is passed on, with its areas alone', () => {
  const body = [
    warning('SNOW', [area(1, 'YELLOW', '2026-12-10T06:00:00Z', undefined), area(2, 'YELLOW', '2026-12-10T06:00:00Z', undefined, 12)]),
    warning('WIND', [area(3, 'YELLOW', '2026-12-10T06:00:00Z', undefined, 14)]),
  ];
  const kept = forStockholm(body);
  expect(kept.length).toBe(1);
  expect(kept[0].warningAreas.map((a) => a.id)).toEqual([1]);
  expect(forStockholm({ not: 'a list' })).toEqual([]);
});

test('warnings in force or starting soon count, most severe first; messages, the sea and water shortage do not', () => {
  const list = parseWarnings([
    warning('SNOW', [area(10, 'YELLOW', '2026-12-10T06:00:00Z', '2026-12-11T06:00:00Z')]),
    warning('WIND', [area(11, 'ORANGE', '2026-12-10T15:00:00Z', undefined, STOCKHOLM_COUNTY, 'Mycket hårda vindbyar')]),
    warning('RAIN', [area(12, 'YELLOW', '2026-12-11T12:00:00Z', undefined)]),
    warning('RAIN', [area(13, 'YELLOW', '2026-12-09T06:00:00Z', '2026-12-10T06:00:00Z')]),
    warning('WATER_SHORTAGE', [area(14, 'MESSAGE', '2026-07-01T00:00:00Z', undefined)]),
    warning('WIND_SEA', [area(15, 'YELLOW', '2026-12-10T06:00:00Z', undefined)]),
    warning('SNOW', [area(16, 'MESSAGE', '2026-12-10T06:00:00Z', undefined)]),
  ], now);
  expect(list.map((w) => w.id)).toEqual([11, 10]);
  expect(list[0].header).toBe('Orange varning för mycket hårda vindbyar');
  expect(list[1].header).toBe('Gul varning för snöfall');
  expect(list[1].summary).toContain('Stockholms län');
});

test('a warning reads like traffic information, with an id apart from SL\'s', () => {
  const [w] = parseWarnings([warning('SNOW', [area(42, 'RED', '2026-12-10T06:00:00Z', undefined)])], now);
  const notice = asNotice(w);
  expect(notice.id).toBeGreaterThan(100_000_000);
  expect(notice.header).toBe('Röd varning för snöfall');
  expect(notice.stations).toEqual([]);
});
