import { STATION_SPACING, TRACK_Z, TURNBACK_REACH } from '../game/layout';
import { cutClock } from '../game/powerCut';
import { Operations } from '../game/operations';
import { layoutLines, lineTimetables, routeDistances, routeStations, serviceSlots } from '../game/routes';
import { LINES } from './lines';

export type TrainStatus =
  | { kind: 'at'; station: number }
  | { kind: 'to'; station: number }
  /** In the turnback cavern beyond a station, changing track. */
  | { kind: 'turnback'; station: number }
  /** Past the last station on the map, heading on down the line. */
  | { kind: 'away' };

/** A train as the landing map draws it, from the game or from SL. Stations are indices into its line's `stations`. */
export interface MapTrain {
  id: string;
  line: string;
  destination: string | null;
  /** Index of the route in its line's `routes`. */
  route: number;
  /** Position along the route in station steps: 0 is its first station, fractions lie between stations. */
  s: number;
  /** 0 on track 1 (outbound), 1 on track 2 (inbound), in between while crossing over. */
  row: number;
  doorsOpen: boolean;
  status: TrainStatus;
}

/** How far the map reaches beyond the outer stations, in station spacings. */
export const MAP_REACH = TURNBACK_REACH / STATION_SPACING;

/** Stations of each line's routes, east to west, as indices into the line's stations. */
export const ROUTE_STATIONS = LINES.map((line) => line.routes.map((_, r) => routeStations(line, r)));

// The game's own timetables and services (`networkServices` and `networkSlots`), so the map shows the trains you meet.
export const layout = layoutLines(LINES);
export const services = LINES.map((line, li) => lineTimetables(layout, li, line.trains));
export const operations = new Operations({ slots: serviceSlots(LINES, layout, services), timetables: services.flatMap((s) => s.timetables) });
const along = LINES.map((line) => line.routes.map((_, r) => routeDistances(line, r)));
/** Timetables name stations by global index; the map by each line's own. */
const local = layout.global.map((globals) => new Map(globals.map((g, i) => [g, i])));

/** A distance along a route (from its first station) as station steps along it. */
function steps(line: number, route: number, a: number): number {
  const d = along[line][route];
  if (a <= d[0]) return (a - d[0]) / STATION_SPACING;
  for (let k = 0; k < d.length - 1; k++) if (a <= d[k + 1]) return k + (a - d[k]) / (d[k + 1] - d[k]);
  return d.length - 1 + (a - d[d.length - 1]) / STATION_SPACING;
}

/** A departure as the hero strip shows it: the route's number, where to, and in how many seconds. */
export interface Departure {
  line: string;
  destination: string;
  seconds: number;
}

/** Next outbound departures from a station of a line in the game's own service. */
export function nextDepartures(time: number, line: number, station: number, count = 2): Departure[] {
  const deps: Departure[] = [];
  const global = layout.global[line][station];
  operations.slots.forEach((slot, i) => {
    if (slot.line !== line || !operations.inService(time, i)) return;
    const k = slot.timetable.stopIndex(global, 1);
    if (k < 0) return;
    const route = LINES[line].routes[slot.route - layout.routeBase[line]];
    deps.push({ line: route.number, destination: route.outbound, seconds: slot.timetable.secondsUntil(time + slot.offset, k) });
  });
  return deps.sort((a, b) => a.seconds - b.seconds).slice(0, count);
}

/** A line's own trains at a given time, straight from the timetables. */
export function gameTrains(line: number, time: number): MapTrain[] {
  const trains: MapTrain[] = [];
  operations.slots.forEach((slot, i) => {
    if (slot.line !== line || !operations.inService(time, i)) return;
    const route = slot.route - layout.routeBase[line];
    const timetable = slot.timetable;
    const st = timetable.stateAt(cutClock(time) + slot.offset);
    const stop = timetable.stops[st.phase === 'moving' ? st.next : st.stop];
    const station = local[line].get(stop.station)!;
    const r = LINES[line].routes[route];
    const status: TrainStatus =
      stop.kind === 'turnback' ? { kind: 'turnback', station } : st.phase === 'moving' ? { kind: 'to', station } : { kind: 'at', station };
    trains.push({
      id: `game-${i}`,
      line: r.number,
      destination: stop.kind === 'turnback' ? null : stop.track === 1 ? r.outbound : r.inbound,
      route,
      s: steps(line, route, timetable.alongAt(st.u)),
      // Where lines share a station the tracks lie further out, so only the crossing lies between the rows.
      row: Math.min(1, Math.max(0, (TRACK_Z - st.z) / (2 * TRACK_Z))),
      doorsOpen: st.doors > 0,
      status,
    });
  });
  return trains;
}
