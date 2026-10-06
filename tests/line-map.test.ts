import { expect, test } from 'bun:test';
import { stockholmEpoch } from '../src/game/clock';
import { NETWORK, networkServices, networkSlots } from '../src/game/line';
import { Operations } from '../src/game/operations';
import { parseDepartures, parseStockholm, type Sighting } from '../src/game/sl';
import { LINES } from '../src/landing/lines';
import { RealTrains } from '../src/landing/realTrains';
import { gameTrains, MAP_REACH, ROUTE_STATIONS } from '../src/landing/trains';

test('the landing copy of the lines matches the game', () => {
  const strip = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  NETWORK.lines.forEach((line, li) => {
    const landing = LINES[li];
    expect({ id: landing.id, name: landing.name, color: landing.color, trains: landing.trains, summerRest: landing.summerRest }).toEqual({ id: line.id, name: line.name, color: line.color, trains: line.trains, summerRest: line.summerRest });
    expect(landing.routes).toEqual(line.routes);
    expect(landing.stations.map(strip)).toEqual(line.stations.map((s) => strip({
      name: s.name,
      // A shared station keeps its first line's SL site.
      site: s.shared ? NETWORK.stations.find((o) => o.name === s.name && NETWORK.lines[o.line].id === s.shared)!.sl : s.sl,
      map: s.map, branch: s.branch, gap: s.gap, shared: s.shared,
      // Boardings set how long trains stand at a station; a shared one's come from its first line.
      riders: s.shared ? undefined : s.riders,
    })));
  });
});

test('the map shows the game\'s own trains on every line', () => {
  const services = networkServices(NETWORK);
  const operations = new Operations({ slots: networkSlots(NETWORK, services), timetables: services.flatMap((s) => s.timetables) });
  for (const t of [stockholmEpoch(2026, 1, 14, 8), stockholmEpoch(2026, 1, 14, 12, 7), stockholmEpoch(2026, 7, 12, 23, 30)]) {
    LINES.forEach((_, li) => {
      const inService = operations.slots.filter((slot, i) => slot.line === li && operations.inService(t, i)).length;
      expect([li, gameTrains(li, t).length]).toEqual([li, inService]);
    });
  }
});

test('game trains stay on the map and match the service pattern', () => {
  const noon = stockholmEpoch(2026, 1, 14, 12);
  for (let t = noon; t < noon + 1200; t += 7) {
    const trains = gameTrains(0, t);
    expect(trains.length).toBe(8);
    for (const tr of trains) {
      expect(tr.s).toBeGreaterThanOrEqual(-MAP_REACH - 1e-6);
      expect(tr.s).toBeLessThanOrEqual(ROUTE_STATIONS[0][tr.route].length - 1 + MAP_REACH + 1e-6);
      expect(tr.line).toBe(LINES[0].routes[tr.route].number);
      expect(tr.row).toBeGreaterThanOrEqual(0);
      expect(tr.row).toBeLessThanOrEqual(1);
      if (tr.status.kind === 'turnback') expect(tr.destination).toBeNull();
      else expect(['Hjulsta', 'Akalla', 'Kungsträdgården']).toContain(tr.destination!);
    }
  }
  // The red and green lines' trains keep to their own routes and stations too.
  for (const li of [1, 2]) {
    for (const tr of gameTrains(li, noon)) {
      expect(tr.line).toBe(LINES[li].routes[tr.route].number);
      expect(tr.row).toBeGreaterThanOrEqual(0);
      expect(tr.row).toBeLessThanOrEqual(1);
      if (tr.status.kind !== 'away') expect(LINES[li].stations[tr.status.station]).toBeDefined();
    }
  }
});

test('no game trains during the weekday night break', () => {
  // A Wednesday at 03:00.
  for (const li of [0, 1, 2]) expect(gameTrains(li, stockholmEpoch(2026, 9, 23, 3))).toEqual([]);
});

test('SL times are read as Stockholm local time', () => {
  expect(parseStockholm('2026-09-23T20:15:48')).toBe(stockholmEpoch(2026, 9, 23, 20, 15, 48));
  expect(parseStockholm('nope')).toBeNull();
});

test("only the asked lines' departures are kept", () => {
  const body = {
    departures: [
      { direction_code: 1, destination: 'Hjulsta', expected: '2026-09-23T20:12:42', state: 'ATSTOP', journey: { id: 1 }, line: { designation: '10' } },
      { direction_code: 2, destination: 'Fruängen', expected: '2026-09-23T20:12:00', state: 'ATSTOP', journey: { id: 2 }, line: { designation: '14' } },
    ],
  };
  const s = parseDepartures(1, body, new Set(['10', '11']));
  expect(s.length).toBe(1);
  expect(s[0]).toMatchObject({ journey: 1, line: '10', direction: 1, station: 1, atStop: true });
});

const base = stockholmEpoch(2026, 9, 23, 20);
const sight = (journey: number, direction: 1 | 2, station: number, offset: number, atStop = false): Sighting => ({
  journey, line: '10', direction, destination: direction === 1 ? 'Hjulsta' : 'Kungsträdgården', station, time: base + offset, atStop,
});

test('a westbound train is interpolated between the stations it lies between', () => {
  const real = new RealTrains();
  // Left T-Centralen at +0 (seen in an earlier poll), due at Rådhuset at +110 and Fridhemsplan at +220.
  real.update([sight(7, 1, 1, 0), sight(7, 1, 2, 110), sight(7, 1, 3, 220)], base - 20);
  real.update([sight(7, 1, 2, 110), sight(7, 1, 3, 220)], base + 30);
  const [t] = real.trains(base + 40);
  expect(t.status).toEqual({ kind: 'to', station: 2 });
  expect(t.s).toBeGreaterThan(1);
  expect(t.s).toBeLessThan(2);
  expect(t.row).toBe(1);
  // Within the dwell before its expected departure it stands at Rådhuset.
  expect(real.trains(base + 100)[0].status).toEqual({ kind: 'at', station: 2 });
});

test('an eastbound train is followed into Kungsträdgården, which lists no arrivals', () => {
  const real = new RealTrains();
  real.update([sight(8, 2, 1, 0)], base - 10);
  const into = real.trains(base + 40)[0];
  expect(into.status).toEqual({ kind: 'to', station: 0 });
  expect(into.row).toBe(0);
  expect(real.trains(base + 115)[0].status).toEqual({ kind: 'at', station: 0 });
  expect(real.trains(base + 600)).toEqual([]);
});

test('SL saying a train stands at a station wins', () => {
  const real = new RealTrains();
  real.update([sight(9, 1, 0, 180, true)], base);
  expect(real.trains(base + 10)[0].status).toEqual({ kind: 'at', station: 0 });
});
