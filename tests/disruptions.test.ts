import { expect, test } from 'bun:test';
import { firstSentence, forStation, parseDisruptions, facilityOf } from '../src/game/disruptions';
import { BLUE_LINE, NETWORK, ridership } from '../src/game/line';

const now = Date.parse('2026-09-25T12:00:00+02:00') / 1000;
const message = (id: number, header: string, from: string, upto: string, stops: string[] = [], importance = 2) => ({
  deviation_case_id: id,
  publish: { from, upto },
  priority: { importance_level: importance, influence_level: 3, urgency_level: 1 },
  message_variants: [{ header, details: `${header} på grund av tekniskt fel.\n\nResenärer hänvisas till angränsande stationer.`, language: 'sv' }],
  scope: { stop_areas: stops.map((name) => ({ id: 1, name, type: 'METROSTN' })), lines: [{ designation: '11', transport_mode: 'METRO' }] },
});

test('only messages published right now are kept, most important first', () => {
  const list = parseDisruptions([
    message(1, 'Avstängd hiss vid Akalla', '2026-09-20T11:00:00+02:00', '2026-10-01T12:00:00+02:00', ['Akalla']),
    message(2, 'Extrainsatta avgångar', '2026-09-26T09:45:00+02:00', '2026-09-26T23:59:00+02:00'),
    message(3, 'Signalfel vid Fridhemsplan', '2026-09-25T11:30:00+02:00', '2026-09-25T13:00:00+02:00', ['Fridhemsplan'], 5),
  ], now);
  expect(list.map((d) => d.id)).toEqual([3, 1]);
  expect(list[0].summary).toBe('Signalfel vid Fridhemsplan på grund av tekniskt fel.');
  expect(parseDisruptions({ error: 'nope' }, now)).toEqual([]);
});

test("a station's board shows its own messages first", () => {
  const list = parseDisruptions([
    message(1, 'Avstängd hiss vid Akalla', '2026-09-20T11:00:00+02:00', '2026-10-01T12:00:00+02:00', ['Akalla'], 5),
    message(3, 'Avstängd rulltrappa vid Rådhuset', '2026-09-25T11:30:00+02:00', '2026-09-25T13:00:00+02:00', ['Rådhuset']),
  ], now);
  expect(forStation(list, 'Rådhuset').map((d) => d.id)).toEqual([3, 1]);
  expect(forStation(list, 'Stadshagen').map((d) => d.id)).toEqual([1, 3]);
});

test('long details are cut to one speakable sentence', () => {
  expect(firstSentence('Kort. Mer text.')).toBe('Kort.');
  expect(firstSentence('ord '.repeat(80)).length).toBeLessThanOrEqual(222);
});

test('real boardings make T-Centralen the busiest station and quiet stations stay quiet but never empty', () => {
  const weights = BLUE_LINE.stations.map((_, i) => ridership(NETWORK, i));
  const byName = (name: string) => weights[BLUE_LINE.stations.findIndex((s) => s.name === name)];
  expect(Math.max(...weights)).toBe(byName('T-Centralen'));
  expect(Math.min(...weights)).toBe(byName('Duvbo'));
  expect(byName('Västra skogen')).toBeLessThan(byName('Fridhemsplan'));
  expect(byName('Duvbo')).toBeGreaterThan(0.5);
});

test('broken escalators and lifts are told apart from traffic messages', () => {
  const now = Date.parse('2026-09-23T12:00:00Z') / 1000;
  const message = (header: string, type?: string) => ({
    deviation_case_id: header.length, publish: { from: '2026-09-23T00:00:00Z', upto: '2026-09-24T00:00:00Z' },
    categories: type ? [{ group: 'FACILITY', type }] : undefined,
    message_variants: [{ language: 'sv', header, details: 'Mer information.' }], scope: { stop_areas: [{ name: 'Rådhuset' }] },
  });
  const list = parseDisruptions([message('Avstängd rulltrappa vid Rådhuset'), message('Avstängd hiss vid Rådhuset', 'LIFT'), message('Signalfel')], now);
  expect(list.map((d) => d.facility)).toEqual(['escalator', 'lift', undefined]);
  expect(facilityOf({ categories: [{ group: 'FACILITY', type: 'ESCALATOR' }] }, 'Ur funktion')).toBe('escalator');
});
