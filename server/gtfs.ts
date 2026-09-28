// SL's metro from Trafiklab's GTFS Regional feeds, for the relay's `feeds/sl` (server/feeds.ts).
//
// Realtime alone is not enough: TripUpdates only carry trips that have started, and only their stops still ahead.
// So, the standard GTFS pattern: once a day the static timetable (sl.zip, about 48 MB) is read for the metro's
// trips (every line in the game's network), and every realtime fetch moves those trips' times to what SL expects now. The result has the same shape as
// SL's Transport API answer, so the game and the landing map read it without knowing where it came from.
// See docs/DRIFT.md, section 4, for the quotas and the data.

import { pad2, stockholm, stockholmEpoch } from '../src/game/clock';
import { LINES } from '../src/landing/lines';

export const GTFS_STATIC = 'https://opendata.samtrafiken.se/gtfs/sl/sl.zip';
export const GTFS_REALTIME = 'https://opendata.samtrafiken.se/gtfs-rt/sl/TripUpdates.pb';
/** Every metro station's Transport API site id, by name: a name is one site, even where two lines have their own platforms. */
const SITES = new Map(LINES.flatMap((l) => l.stations.map((s) => [s.name, s.site] as const)));
/** Each route's outbound terminal: direction 1 is toward it, as the game's track 1 and SL's blue line `direction_code`. */
const OUTBOUND = new Map(LINES.flatMap((l) => l.routes.map((r) => [r.number, r.outbound] as const)));
const METRO = '401';
/** Service days before and after the download kept in the timetable, so one failed daily download changes nothing. */
const KEEP_DAYS = { before: 1, after: 7 };
/** How far ahead departures are listed, like the Transport API. */
const HORIZON = 60 * 60;
/** Per station, line and direction: an hour of a route every ten minutes. */
const PER_LINE = 6;

/** A stop of a trip: the station's site id, then seconds from the service day's start. */
type Stop = [site: number, sequence: number, arrival: number, departure: number];

export interface Trip {
  id: string;
  line: string;
  /** 1 toward the route's outbound terminal (Hjulsta, Akalla, Norsborg...), 2 back. */
  direction: 1 | 2;
  destination: string;
  /** Service days it runs, YYYYMMDD. */
  dates: string[];
  /** Every station it departs from, in order; the terminal it ends at is left out. */
  stops: Stop[];
}

export interface Timetable {
  /** SL's `feed_version`, the date of the export. */
  version: string;
  /** When it was downloaded, epoch ms. */
  fetched: number;
  trips: Trip[];
}

// ---- Reading the zip ----

/** The files the timetable is read from. The rest of the export (shapes.txt alone is 34 MB of 48) is never kept. */
const WANTED = new Set(['feed_info.txt', 'routes.txt', 'trips.txt', 'calendar.txt', 'calendar_dates.txt', 'stops.txt', 'stop_times.txt']);

interface ZipFile { method: number; data: Uint8Array }

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
/** Bytes held back at the end of each chunk, so a header split over two chunks is still found. */
const CARRY = 30 + 255;

const concat = (parts: Uint8Array[]): Uint8Array => {
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

/** A GTFS file's name, as a header would carry it: nothing else looks like one by chance. */
const plausible = (name: string) => /^[a-z_]{1,40}\.txt$/.test(name);

/**
 * The wanted files of a zip, compressed, read from a stream in one pass so the whole archive never sits in memory
 * (a Durable Object has 128 MB). SL's export sets its sizes in data descriptors after each file, not in the headers,
 * so a file ends where the next header begins: a local header, or the central directory once the files are done,
 * each only taken for one when it names a GTFS file.
 */
export async function unzip(stream: ReadableStream<Uint8Array>): Promise<Map<string, ZipFile>> {
  const files = new Map<string, ZipFile>();
  const decoder = new TextDecoder();
  let current: { name: string; method: number; descriptor: boolean; parts: Uint8Array[] | null } | null = null;
  let carry: Uint8Array = new Uint8Array(0);
  let done = false;
  const keep = (bytes: Uint8Array) => { if (bytes.length && current?.parts) current.parts.push(bytes.slice()); };
  const close = () => {
    if (current?.parts) {
      let data = concat(current.parts);
      // The data descriptor after the file: signature, CRC and two sizes (16 bytes), or without its signature (12).
      if (current.descriptor) {
        const at = data.length - 16;
        const signed = at >= 0 && data[at] === 0x50 && data[at + 1] === 0x4b && data[at + 2] === 0x07 && data[at + 3] === 0x08;
        data = data.subarray(0, data.length - (signed ? 16 : 12));
      }
      files.set(current.name, { method: current.method, data });
    }
    current = null;
  };
  const reader = stream.getReader();
  for (;;) {
    const { value, done: end } = await reader.read();
    if (done) { if (end) break; continue; }
    const buf = end ? carry : concat([carry, value]);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let from = 0;
    let at = 0;
    let held = end ? buf.length : Math.max(0, buf.length - CARRY);
    for (; at + 4 <= buf.length && !done; at++) {
      if (buf[at] !== 0x50 || buf[at + 1] !== 0x4b) continue;
      const signature = view.getUint32(at, true);
      if (signature === LOCAL && at + 30 <= buf.length) {
        const nameLength = view.getUint16(at + 26, true);
        const extra = view.getUint16(at + 28, true);
        const start = at + 30 + nameLength + extra;
        if (start > buf.length) { held = Math.min(held, at); break; }
        const name = decoder.decode(buf.subarray(at + 30, at + 30 + nameLength));
        const method = view.getUint16(at + 8, true);
        if (!plausible(name) || (method !== 0 && method !== 8)) continue;
        keep(buf.subarray(from, at));
        close();
        current = { name, method, descriptor: (view.getUint16(at + 6, true) & 8) !== 0, parts: WANTED.has(name) ? [] : null };
        from = start;
        at = start - 1;
      } else if (signature === CENTRAL && at + 46 <= buf.length) {
        const nameLength = view.getUint16(at + 28, true);
        if (at + 46 + nameLength > buf.length) { held = Math.min(held, at); break; }
        if (!plausible(decoder.decode(buf.subarray(at + 46, at + 46 + nameLength)))) continue;
        // The files are done; what follows is their directory.
        keep(buf.subarray(from, at));
        close();
        done = true;
        from = buf.length;
      }
    }
    if (done) { carry = new Uint8Array(0); if (end) break; continue; }
    held = Math.max(held, from);
    keep(buf.subarray(from, held));
    carry = buf.slice(held);
    if (end) break;
  }
  if (!done) close();
  if (!files.size) throw new Error('Not a zip file');
  return files;
}

/** The rows of a CSV file from the zip, as objects keyed by the header, streamed so a 140 MB file never sits in memory. */
async function* csvRows(files: Map<string, ZipFile>, name: string): AsyncGenerator<Record<string, string>> {
  const entry = files.get(name);
  if (!entry) throw new Error(`${name} missing from the timetable`);
  const data = entry.data;
  let stream: ReadableStream<Uint8Array> = new ReadableStream({ start(c) { c.enqueue(data); c.close(); } });
  // The DOM types disagree about the buffer type of Uint8Array; the stream carries bytes either way.
  if (entry.method === 8) stream = stream.pipeThrough<Uint8Array>(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  else if (entry.method !== 0) throw new Error(`${name}: unsupported compression ${entry.method}`);
  let header: string[] | null = null;
  let rest = '';
  const decoder = new TextDecoder();
  const row = (line: string) => {
    const cells = splitCsv(line.replace(/\r$/, ''));
    if (!header) { header = cells.map((c) => c.replace(/^﻿/, '')); return null; }
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  };
  for await (const chunk of stream) {
    const lines = (rest + decoder.decode(chunk, { stream: true })).split('\n');
    rest = lines.pop()!;
    for (const line of lines) if (line) { const r = row(line); if (r) yield r; }
  }
  rest += decoder.decode();
  if (rest) { const r = row(rest); if (r) yield r; }
}

/** One CSV line, with quoted fields. */
export function splitCsv(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { cells.push(cell); cell = ''; }
    else cell += c;
  }
  cells.push(cell);
  return cells;
}

// ---- The static timetable ----

/** GTFS times count from noon minus twelve hours, and may pass 24:00:00. */
const seconds = (time: string) => {
  const [h, m, s] = time.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
};

const dateKey = (epoch: number) => {
  const d = stockholm(epoch);
  return `${d.year}${pad2(d.month)}${pad2(d.day)}`;
};

/** The epoch second a service day's times count from. */
export function serviceStart(date: string): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(4, 6));
  const d = Number(date.slice(6, 8));
  return stockholmEpoch(y, m, d, 12) - 12 * 3600;
}

/**
 * Reads the metro's trips out of SL's GTFS export, for the service days around `now` (epoch seconds): the zip as it
 * downloads, or all of it at once.
 */
export async function readTimetable(zip: Uint8Array | ReadableStream<Uint8Array>, now: number): Promise<Timetable> {
  const bytes = zip;
  const files = await unzip(bytes instanceof Uint8Array ? new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) : bytes);
  const rows = (name: string) => csvRows(files, name);

  let version = '';
  for await (const r of rows('feed_info.txt')) version = r.feed_version ?? '';

  const lineOf = new Map<string, string>();
  for await (const r of rows('routes.txt')) if (r.route_type === METRO && OUTBOUND.has(r.route_short_name)) lineOf.set(r.route_id, r.route_short_name);

  const tripInfo = new Map<string, { line: string; service: string; direction: string }>();
  for await (const r of rows('trips.txt')) {
    const line = lineOf.get(r.route_id);
    if (line) tripInfo.set(r.trip_id, { line, service: r.service_id, direction: r.direction_id });
  }
  const services = new Set([...tripInfo.values()].map((t) => t.service));

  // The service days to keep, and which of them each service runs on.
  const days: string[] = [];
  for (let d = -KEEP_DAYS.before; d <= KEEP_DAYS.after; d++) days.push(dateKey(now + d * 86400));
  const weekday = (date: string) => ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8))).getUTCDay()];
  const runs = new Map<string, Set<string>>();
  for (const s of services) runs.set(s, new Set());
  for await (const r of rows('calendar.txt')) {
    const set = runs.get(r.service_id);
    if (set) for (const day of days) if (day >= r.start_date && day <= r.end_date && r[weekday(day)] === '1') set.add(day);
  }
  for await (const r of rows('calendar_dates.txt')) {
    const set = runs.get(r.service_id);
    if (!set || !days.includes(r.date)) continue;
    if (r.exception_type === '1') set.add(r.date);
    else if (r.exception_type === '2') set.delete(r.date);
  }

  // Platforms by name: only metro trips are read, so a name is a station of the network or a timing point (Kymlinge).
  const nameOf = new Map<string, string>();
  for await (const r of rows('stops.txt')) if (SITES.has(r.stop_name)) nameOf.set(r.stop_id, r.stop_name);

  const calls = new Map<string, Array<{ sequence: number; name: string | undefined; arrival: number; departure: number }>>();
  for await (const r of rows('stop_times.txt')) {
    if (!tripInfo.has(r.trip_id)) continue;
    let list = calls.get(r.trip_id);
    if (!list) calls.set(r.trip_id, (list = []));
    list.push({ sequence: Number(r.stop_sequence), name: nameOf.get(r.stop_id), arrival: seconds(r.arrival_time), departure: seconds(r.departure_time) });
  }
  for (const list of calls.values()) list.sort((a, b) => a.sequence - b.sequence);

  // GTFS numbers directions per route without saying which is which: the one whose trips end at the outbound terminal is 1.
  const outward = new Map<string, string>();
  for (const [id, info] of tripInfo) {
    const known = calls.get(id)?.filter((c) => c.name);
    if (known?.length && known[known.length - 1].name === OUTBOUND.get(info.line)) outward.set(info.line, info.direction);
  }

  const trips: Trip[] = [];
  for (const [id, info] of tripInfo) {
    const dates = [...(runs.get(info.service) ?? [])].sort();
    const list = calls.get(id);
    if (!dates.length || !list || !outward.has(info.line)) continue;
    const known = list.filter((c) => c.name);
    if (known.length < 2) continue;
    const terminal = list[list.length - 1].sequence;
    trips.push({
      id,
      line: info.line,
      direction: info.direction === outward.get(info.line) ? 1 : 2,
      destination: known[known.length - 1].name!,
      dates,
      stops: known.filter((c) => c.sequence !== terminal).map((c) => [SITES.get(c.name!)!, c.sequence, c.arrival, c.departure]),
    });
  }
  return { version, fetched: Date.now(), trips };
}

// ---- Realtime: a small protobuf reader for GTFS-realtime TripUpdates ----

interface StopUpdate { sequence?: number; stopId?: string; arrival?: { time?: number; delay?: number }; departure?: { time?: number; delay?: number }; skipped: boolean }
export interface TripUpdate { tripId: string; canceled: boolean; stops: StopUpdate[] }

class Reader {
  at = 0;
  constructor(readonly bytes: Uint8Array, readonly end = bytes.length) {}
  /** A varint as a signed 64-bit number: int32 and int64 fields send negative values as ten bytes of two's complement. */
  varint(): number {
    let result = 0;
    let scale = 1;
    for (let i = 0; i < 7; i++) {
      const b = this.bytes[this.at++];
      result += (b & 0x7f) * scale;
      if (b < 0x80) return result;
      scale *= 128;
    }
    // Past 49 bits a double loses precision, so finish in BigInt.
    let big = BigInt(result);
    let shift = 49n;
    for (;;) {
      const b = this.bytes[this.at++];
      big |= BigInt(b & 0x7f) << shift;
      if (b < 0x80) return Number(BigInt.asIntN(64, big));
      shift += 7n;
    }
  }
  /** Calls `field` with each field number and wire type until the end; `field` reads or skips the value. */
  each(field: (n: number, wire: number) => void): void {
    while (this.at < this.end) {
      const key = this.varint();
      field(Math.floor(key / 8), key & 7);
    }
  }
  sub(): Reader {
    const length = this.varint();
    const r = new Reader(this.bytes, this.at + length);
    r.at = this.at;
    this.at += length;
    return r;
  }
  string(): string {
    const r = this.sub();
    return new TextDecoder().decode(this.bytes.subarray(r.at, r.end));
  }
  skip(wire: number): void {
    if (wire === 0) this.varint();
    else if (wire === 1) this.at += 8;
    else if (wire === 2) {
      // Read the length first: `this.at += this.varint()` would add it to the position before the length.
      const length = this.varint();
      this.at += length;
    }
    else if (wire === 5) this.at += 4;
    else throw new Error(`Unsupported protobuf wire type ${wire}`);
  }
}

function stopTimeEvent(r: Reader): { time?: number; delay?: number } {
  const event: { time?: number; delay?: number } = {};
  r.each((n, wire) => {
    if (n === 1 && wire === 0) event.delay = r.varint();
    else if (n === 2 && wire === 0) event.time = r.varint();
    else r.skip(wire);
  });
  return event;
}

/** Every trip update in a GTFS-realtime FeedMessage (FeedMessage.entity = 2, FeedEntity.trip_update = 3). */
export function parseTripUpdates(bytes: Uint8Array): TripUpdate[] {
  const updates: TripUpdate[] = [];
  const feed = new Reader(bytes);
  feed.each((n, wire) => {
    if (n !== 2 || wire !== 2) return feed.skip(wire);
    const entity = feed.sub();
    entity.each((m, w) => {
      if (m !== 3 || w !== 2) return entity.skip(w);
      const update = tripUpdate(entity.sub());
      if (update.tripId) updates.push(update);
    });
  });
  return updates;
}

/** TripUpdate: trip = 1 (TripDescriptor: trip_id = 1, schedule_relationship = 4), stop_time_update = 2. */
function tripUpdate(r: Reader): TripUpdate {
  const update: TripUpdate = { tripId: '', canceled: false, stops: [] };
  r.each((n, wire) => {
    if (n === 1 && wire === 2) {
      const trip = r.sub();
      trip.each((m, w) => {
        if (m === 1 && w === 2) update.tripId = trip.string();
        else if (m === 4 && w === 0) update.canceled = trip.varint() === 3;
        else trip.skip(w);
      });
    } else if (n === 2 && wire === 2) update.stops.push(stopTimeUpdate(r.sub()));
    else r.skip(wire);
  });
  return update;
}

/** StopTimeUpdate: stop_sequence = 1, arrival = 2, departure = 3, stop_id = 4, schedule_relationship = 5 (1 is SKIPPED). */
function stopTimeUpdate(r: Reader): StopUpdate {
  const stop: StopUpdate = { skipped: false };
  r.each((n, wire) => {
    if (n === 1 && wire === 0) stop.sequence = r.varint();
    else if (n === 2 && wire === 2) stop.arrival = stopTimeEvent(r.sub());
    else if (n === 3 && wire === 2) stop.departure = stopTimeEvent(r.sub());
    else if (n === 4 && wire === 2) stop.stopId = r.string();
    else if (n === 5 && wire === 0) stop.skipped = r.varint() === 1;
    else r.skip(wire);
  });
  return stop;
}

// ---- Departures, as SL's Transport API lists them ----

/** The fields of a Transport API departure the game reads (`ApiDeparture` in src/game/sl.ts). */
export interface Departure {
  direction_code: 1 | 2;
  destination: string;
  expected: string;
  scheduled: string;
  state: 'ATSTOP' | 'EXPECTED';
  journey: { id: number };
  line: { designation: string };
}

/** Local Stockholm time without an offset, as the Transport API writes it: 2026-09-23T20:15:48. */
export function localTime(epoch: number): string {
  const d = stockholm(epoch);
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}T${pad2(d.hour)}:${pad2(d.minute)}:${pad2(d.second)}`;
}

/**
 * A journey id that fits a JavaScript number: trip ids have 17 digits, and the same trip runs on other days.
 * FNV-1a over 64 bits, kept to 53.
 */
export function journeyId(trip: string, date: string): number {
  let h = 0xcbf29ce484222325n;
  for (const c of `${trip}/${date}`) h = BigInt.asUintN(64, (h ^ BigInt(c.charCodeAt(0))) * 0x100000001b3n);
  return Number(h & 0x1fffffffffffffn);
}

/**
 * Every metro station's coming departures at `now` (epoch seconds), keyed by its Transport API site id:
 * scheduled times, moved to SL's expected times for trips under way. A trip under way has passed the stops its
 * update no longer lists.
 */
export function departures(timetable: Timetable, updates: readonly TripUpdate[], now: number): Record<number, { departures: Departure[] }> {
  const live = new Map(updates.map((u) => [u.tripId, u]));
  const lists = new Map<number, Departure[]>([...new Set(SITES.values())].map((site) => [site, []]));
  // A trip after midnight belongs to the day before.
  for (const date of [dateKey(now - 86400), dateKey(now)]) {
    const start = serviceStart(date);
    for (const trip of timetable.trips) {
      if (!trip.dates.includes(date)) continue;
      const first = start + trip.stops[0][3];
      const last = start + trip.stops[trip.stops.length - 1][3];
      if (first > now + HORIZON || last < now - HORIZON) continue;
      const update = live.get(trip.id);
      if (update?.canceled) continue;
      const bySequence = new Map(update?.stops.map((s) => [s.sequence, s]));
      const ahead = update ? Math.min(...update.stops.map((s) => s.sequence ?? Infinity)) : -Infinity;
      const id = journeyId(trip.id, date);
      // A delay holds until the next stop that says otherwise, as GTFS-realtime asks.
      let delay = 0;
      for (const [site, sequence, arrival, departure] of trip.stops) {
        if (sequence < ahead) continue;
        const u = bySequence.get(sequence);
        if (u?.skipped) continue;
        if (u?.departure?.time !== undefined) delay = u.departure.time - (start + departure);
        else if (u?.departure?.delay !== undefined) delay = u.departure.delay;
        else if (u?.arrival?.time !== undefined) delay = u.arrival.time - (start + arrival);
        else if (u?.arrival?.delay !== undefined) delay = u.arrival.delay;
        const arrives = u?.arrival?.time ?? start + arrival + delay;
        const expected = Math.max(arrives, start + departure + delay);
        if (expected < now - 30 || expected > now + HORIZON) continue;
        lists.get(site)!.push({
          direction_code: trip.direction,
          destination: trip.destination,
          expected: localTime(expected),
          scheduled: localTime(start + departure),
          state: update && arrives <= now && now < expected ? 'ATSTOP' : 'EXPECTED',
          journey: { id },
          line: { designation: trip.line },
        });
      }
    }
  }
  const out: Record<number, { departures: Departure[] }> = {};
  for (const [site, list] of lists) {
    list.sort((a, b) => a.expected.localeCompare(b.expected));
    const count = new Map<string, number>();
    out[site] = {
      departures: list.filter((d) => {
        const key = `${d.line.designation}/${d.direction_code}`;
        const n = count.get(key) ?? 0;
        count.set(key, n + 1);
        return n < PER_LINE;
      }),
    };
  }
  return out;
}
