import { expect, test } from 'bun:test';
import { stockholmEpoch } from '../src/game/clock';
import { NETWORK, networkServices } from '../src/game/line';
import { parseDepartures } from '../src/game/sl';
import { LINES } from '../src/landing/lines';
import { departures, journeyId, localTime, parseTripUpdates, readTimetable, serviceStart, splitCsv, unzip, type TripUpdate } from '../server/gtfs';

/**
 * A zip of CSV files, deflated as SL's export is. CRCs are left at zero: the reader does not check them. With
 * `descriptors`, as SL writes it: sizes left out of the local headers and given in a data descriptor after each file.
 */
function zip(files: Record<string, string>, descriptors = false): Uint8Array {
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  const encoder = new TextEncoder();
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(text);
    const data = Bun.deflateSync(raw);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(6, descriptors ? 0x808 : 0, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(18, descriptors ? 0 : data.length, true);
    lv.setUint32(22, descriptors ? 0 : raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const descriptor = new Uint8Array(descriptors ? 16 : 0);
    if (descriptors) {
      const dv = new DataView(descriptor.buffer);
      dv.setUint32(0, 0x08074b50, true);
      dv.setUint32(8, data.length, true);
      dv.setUint32(12, raw.length, true);
    }
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    parts.push(local, data, descriptor);
    directory.push(central);
    offset += local.length + data.length + descriptor.length;
  }
  const size = directory.reduce((n, d) => n + d.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, directory.length, true);
  ev.setUint16(10, directory.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...directory, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

const STATIONS = LINES[0].stations;
const station = (name: string) => STATIONS.findIndex((s) => s.name === name);
const site = (name: string) => STATIONS[station(name)].site;
const platform = (name: string) => `9022001${String(station(name)).padStart(6, '0')}001`;

// Thursday 24 September 2026. Trip A leaves Kungsträdgården for Akalla at 12:00; trip B runs Akalla to
// Kungsträdgården after midnight on the same service day; the bus shares a stop name and must be ignored, and trip C's
// service ended before the days kept.
const DATE = '20260924';
const aStops = ['Kungsträdgården', 'T-Centralen', 'Rådhuset', 'Fridhemsplan', 'Stadshagen', 'Västra skogen', 'Solna centrum', 'Näckrosen', 'Hallonbergen', 'Kista', 'Husby', 'Akalla'];
const at = (base: number, i: number) => {
  const t = base + i * 120;
  const hh = String(Math.floor(t / 3600)).padStart(2, '0');
  const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
  return `${hh}:${mm}:00`;
};
const FILES = {
  'feed_info.txt': 'feed_id,feed_publisher_name,feed_publisher_url,feed_lang,feed_version\nSE-sl,Samtrafiken,https://x,sv,2026-09-24\n',
  'routes.txt': 'route_id,agency_id,route_short_name,route_long_name,route_type,route_desc\nR10,A,10,Blå linjen,401,x\nR11,A,11,"Blå linjen, norr",401,x\nB1,A,1,,700,blåbuss\n',
  'trips.txt': 'route_id,service_id,trip_id,trip_headsign,trip_short_name,direction_id\nR11,S,A,,,0\nR11,S,B,,,1\nB1,S,BUS,,,0\nR11,OTHER,C,,,0\n',
  'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nS,0,0,0,0,0,0,0,20260901,20261231\nOTHER,0,0,0,0,0,0,1,20260801,20260920\n',
  'calendar_dates.txt': `service_id,date,exception_type\nS,${DATE},1\n`,
  'stops.txt': ['stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,platform_code', ...aStops.map((n) => `${platform(n)},${n},0,0,0,,1`), 'KYM,Kymlinge norrut,0,0,0,,', 'BUSSTOP,T-Centralen,0,0,0,,'].join('\n'),
  'stop_times.txt': [
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
    ...aStops.map((n, i) => `A,${at(12 * 3600, i)},${at(12 * 3600, i)},${platform(n)},${i + 1}`),
    // A timing point between Kista and Husby, as SL's line 11 trips have, listed last: stops go by sequence, not file order.
    `A,${at(12 * 3600, 9)},${at(12 * 3600, 9)},KYM,10.5`,
    ...[...aStops].reverse().map((n, i) => `B,${at(24 * 3600 + 600, i)},${at(24 * 3600 + 600, i)},${platform(n)},${i + 1}`),
    `BUS,12:00:00,12:00:00,BUSSTOP,1`,
    `C,12:00:00,12:00:00,${platform('Kungsträdgården')},1`,
    `C,12:02:00,12:02:00,${platform('T-Centralen')},2`,
  ].join('\n'),
};

const noon = stockholmEpoch(2026, 9, 24, 12);

test('CSV fields may be quoted', () => {
  expect(splitCsv('a,"b, c","say ""hi""",')).toEqual(['a', 'b, c', 'say "hi"', '']);
});

test('the timetable keeps the blue line, its stations and its service days', async () => {
  const table = await readTimetable(zip(FILES), noon);
  expect(table.version).toBe('2026-09-24');
  expect(table.trips.map((t) => t.id).sort()).toEqual(['A', 'B']);
  const a = table.trips.find((t) => t.id === 'A')!;
  expect(a).toMatchObject({ line: '11', direction: 1, destination: 'Akalla', dates: [DATE] });
  // Akalla, where it ends, is not a departure; the timing point is not a station.
  expect(a.stops.map((s) => STATIONS.find((x) => x.site === s[0])!.name)).toEqual(aStops.slice(0, -1));
  const b = table.trips.find((t) => t.id === 'B')!;
  expect(b).toMatchObject({ direction: 2, destination: 'Kungsträdgården' });
  expect(b.stops[0][3]).toBe(24 * 3600 + 600);
});

test('the export is read as it downloads, in any chunks, skipping the files the timetable does not need', async () => {
  const whole = await readTimetable(zip(FILES), noon);
  // SL's layout: data descriptors, and the shapes (most of the archive) among the files.
  const bytes = zip({ 'shapes.txt': 'shape_id,shape_pt_lat\n' + 'PK,1\n'.repeat(5000), ...FILES }, true);
  for (const size of [1, 7, 300, 65536]) {
    const stream = new ReadableStream<Uint8Array>({
      start(c) { for (let i = 0; i < bytes.length; i += size) c.enqueue(bytes.slice(i, i + size)); c.close(); },
    });
    expect({ ...(await readTimetable(stream, noon)), fetched: 0 }).toEqual({ ...whole, fetched: 0 });
  }
  const files = await unzip(new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }));
  expect(files.has('shapes.txt')).toBe(false);
  expect([...files.keys()].sort()).toEqual(Object.keys(FILES).sort());
});

test('GTFS days count from noon minus twelve hours', () => {
  expect(serviceStart(DATE)).toBe(noon - 12 * 3600);
  expect(localTime(noon + 61)).toBe('2026-09-24T12:01:01');
});

test('scheduled departures read like the Transport API, after midnight too', async () => {
  const table = await readTimetable(zip(FILES), noon);
  const lists = departures(table, [], noon - 300);
  const first = lists[site('Kungsträdgården')].departures[0];
  expect(first).toMatchObject({ direction_code: 1, destination: 'Akalla', expected: '2026-09-24T12:00:00', scheduled: '2026-09-24T12:00:00', state: 'EXPECTED', line: { designation: '11' } });
  // The game's parser takes it as it takes SL's answer.
  expect(parseDepartures(station('Kungsträdgården'), lists[site('Kungsträdgården')], new Set(['10', '11']))[0]).toMatchObject({ direction: 1, time: noon, atStop: false });
  expect(lists[site('Akalla')].departures.filter((d) => d.destination === 'Akalla')).toEqual([]);
  // Trip B's 00:10 departure from Akalla belongs to the 24th, so at 00:05 on the 25th it is found through yesterday.
  const late = departures(table, [], stockholmEpoch(2026, 9, 25, 0, 5));
  expect(late[site('Akalla')].departures[0]).toMatchObject({ direction_code: 2, expected: '2026-09-25T00:10:00' });
});

test('realtime moves a trip under way and drops the stops it has passed', async () => {
  const table = await readTimetable(zip(FILES), noon);
  const seq = (name: string) => aStops.indexOf(name) + 1;
  const now = noon + 3 * 120 + 30;
  const update: TripUpdate = {
    tripId: 'A', canceled: false, stops: [
      // Standing at Fridhemsplan, 90 s late; the delay then holds until Kista says otherwise.
      { sequence: seq('Fridhemsplan'), arrival: { time: noon + 3 * 120 + 20 }, departure: { time: noon + 3 * 120 + 90 }, skipped: false },
      { sequence: seq('Kista'), departure: { delay: 30 }, skipped: false },
      { sequence: seq('Husby'), skipped: true },
    ],
  };
  const lists = departures(table, [update], now);
  const of = (name: string) => lists[site(name)].departures.filter((d) => d.journey.id === journeyId('A', DATE));
  expect(of('Rådhuset')).toEqual([]);
  expect(of('Fridhemsplan')[0]).toMatchObject({ state: 'ATSTOP', expected: localTime(noon + 3 * 120 + 90) });
  expect(of('Stadshagen')[0].expected).toBe(localTime(noon + 4 * 120 + 90));
  expect(of('Kista')[0].expected).toBe(localTime(noon + 9 * 120 + 30));
  expect(of('Husby')).toEqual([]);
  expect(departures(table, [{ tripId: 'A', canceled: true, stops: [] }], now)[site('Stadshagen')].departures).toEqual([]);
});

/** Protobuf encoding, just enough to build a feed by hand. */
const varint = (n: number | bigint): number[] => {
  let v = BigInt.asUintN(64, BigInt(n));
  const out: number[] = [];
  while (v >= 0x80n) { out.push(Number(v & 0x7fn) | 0x80); v >>= 7n; }
  out.push(Number(v));
  return out;
};
const field = (n: number, value: number | bigint) => [...varint(n * 8), ...varint(value)];
const message = (n: number, body: number[]) => [...varint(n * 8 + 2), ...varint(body.length), ...body];
const text = (n: number, s: string) => message(n, [...new TextEncoder().encode(s)]);

test('TripUpdates decode, negative delays and all', () => {
  const stop = [...field(1, 7), ...message(2, [...field(1, -45), ...field(2, 1790249047)]), ...message(3, field(1, 30)), ...text(4, '9022001003031001'), ...field(99, 5)];
  const update = [...message(1, [...text(1, '14010000733559520'), ...field(4, 0)]), ...message(2, stop), ...message(2, [...field(1, 8), ...field(5, 1)])];
  const feed = new Uint8Array([...message(1, [...text(1, '2.0'), ...field(3, 1790249000)]), ...message(2, [...text(1, 'e1'), ...message(3, update)]), ...message(2, [...text(1, 'e2'), ...message(3, message(1, [...text(1, 'X'), ...field(4, 3)]))])]);
  expect(parseTripUpdates(feed)).toEqual([
    { tripId: '14010000733559520', canceled: false, stops: [
      { sequence: 7, arrival: { delay: -45, time: 1790249047 }, departure: { delay: 30 }, stopId: '9022001003031001', skipped: false },
      { sequence: 8, skipped: true },
    ] },
    { tripId: 'X', canceled: true, stops: [] },
  ]);
});

test('a cut or broken feed throws instead of hanging or parsing in part', () => {
  const whole = [...message(2, [...text(1, 'e1'), ...message(3, message(1, text(1, 'X')))])];
  expect(parseTripUpdates(new Uint8Array(whole))).toEqual([{ tripId: 'X', canceled: false, stops: [] }]);
  for (let cut = 1; cut < whole.length; cut++) expect(() => parseTripUpdates(new Uint8Array(whole.slice(0, cut)))).toThrow('Truncated protobuf');
  for (const bytes of [[0x80], Array(8).fill(0x80), [0x12, 0xff], [0x12, 0x05, 0x1a], [0x09, 1, 2]]) {
    expect(() => parseTripUpdates(new Uint8Array(bytes))).toThrow('Truncated protobuf');
  }
});

test('length prefixes cannot move backwards or exceed a message or the int32 limit', () => {
  for (const length of [-1, -(1n << 63n), 0x80000000, 1n << 53n]) {
    for (const tag of [0x0a, 0x12]) {
      expect(() => parseTripUpdates(new Uint8Array([tag, ...varint(length)]))).toThrow('Invalid protobuf length');
    }
    // A trip id is a string, so its length must have the same checks as embedded and skipped messages.
    const trip = message(2, message(3, message(1, [0x0a, ...varint(length)])));
    expect(() => parseTripUpdates(new Uint8Array(trip))).toThrow('Invalid protobuf length');
  }
  for (const bytes of [[0x0a, 1], message(2, [0x0a, 1]), message(2, [0x1a, 1])]) {
    expect(() => parseTripUpdates(new Uint8Array(bytes))).toThrow('Truncated protobuf');
  }
});

test('varints reject more than ten bytes and a tenth byte that overflows 64 bits', () => {
  for (const value of [...[2, 0x7f, 0x80].map((last) => [...Array(9).fill(0x80), last]), [...Array(10).fill(0x80), 0]]) {
    expect(() => parseTripUpdates(new Uint8Array(value))).toThrow('Invalid protobuf varint');
    expect(() => parseTripUpdates(new Uint8Array([0x08, ...value]))).toThrow('Invalid protobuf varint');
  }
});

test('valid ten-byte negative delays and empty skipped messages still decode', () => {
  for (const delay of [-2147483648, -45, -1, 0, 2147483647]) {
    const update = [...message(1, text(1, 'X')), ...message(2, message(3, field(1, delay)))];
    const feed = new Uint8Array([...message(1, []), ...field(99, -1), ...message(2, message(3, update))]);
    expect(parseTripUpdates(feed)).toEqual([{ tripId: 'X', canceled: false, stops: [{ departure: { delay }, skipped: false }] }]);
  }
});

test('journey ids are numbers that tell trips and days apart', () => {
  const a = journeyId('14010000733559520', DATE);
  expect(Number.isSafeInteger(a)).toBe(true);
  expect(journeyId('14010000733559520', DATE)).toBe(a);
  expect(journeyId('14010000733559521', DATE)).not.toBe(a);
  expect(journeyId('14010000733559520', '20260925')).not.toBe(a);
});

test('track 1 runs toward each route\'s outbound terminal, the direction the relay calls 1', () => {
  const lines = networkServices(NETWORK);
  for (const route of NETWORK.routes) {
    const tt = lines[route.line].timetables[route.local];
    const track1 = tt.stops.filter((s) => s.kind === 'station' && s.track === 1).map((s) => NETWORK.stations[s.station].name);
    expect([route.number, track1[track1.length - 1]]).toEqual([route.number, route.outbound]);
    expect([route.number, track1[0]]).toEqual([route.number, route.inbound]);
  }
});

test('every metro station has its own SL site, but for the stations two lines build apart', () => {
  for (const s of NETWORK.stations) expect([s.name, typeof s.sl]).toEqual([s.name, 'number']);
  const byName = new Map<string, Set<number>>();
  for (const s of NETWORK.stations) byName.set(s.name, (byName.get(s.name) ?? new Set()).add(s.sl!));
  for (const [name, sites] of byName) expect([name, sites.size]).toEqual([name, 1]);
  expect(new Set(NETWORK.stations.map((s) => s.sl)).size).toBe(byName.size);
});
