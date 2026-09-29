import { CAVE_HALF_L, CAVERN_LEN, LANE, STATION_SPACING, TAIL_TUBE } from './layout';
import type { ServiceSlot } from './operations';
import { stationDwell, Timetable } from './timetable';

/**
 * The network's shape as plain data: which stations each route serves, where
 * they lie, and the timetables that run them. No three.js here: the landing
 * page draws its live map from this too.
 *
 * The whole network is one straight corridor along x. Each line is laid out
 * along its first unshifted route (the primary), and every other route's own
 * stations (a branch) are built elsewhere along x, clear of everything else.
 * Where a route leaves the stretch it shares for its branch, it crosses a
 * portal halfway through the tunnel between the two: the branch side is a
 * copy of the shared side's tunnel, built with the same seed and moved along
 * x, so a train crossing between them sees no change (see `World`).
 */

export interface RouteData {
  number: string;
  outbound: string;
  inbound: string;
  /** This route's own stations lie elsewhere along x, reached through a portal. */
  shifted?: boolean;
}

export interface StationData {
  name: string;
  /** The route, or routes, this station alone lies on (route numbers). Without one it is shared by every route of the line. */
  branch?: string | readonly string[];
  /** Meters from the previous station on its routes, when not `STATION_SPACING`. */
  gap?: number;
  /** Two levels, one per direction (see `STACK`): track 1's island right under track 2's. Only on a station two lines share. */
  stacked?: boolean;
  /** The same station as this earlier line's (by `id`) of this name: its trains call there on tracks of their own, beyond that line's (see `LANE`). */
  shared?: string;
  /** Weekday boardings: the busier the station, the longer trains stand there (`stationDwell`). A shared station takes the earlier line's. */
  riders?: number;
}

export interface LineShape {
  id?: string;
  stations: readonly StationData[];
  routes: readonly RouteData[];
  /** Trains on the line's longest route, give or take one (see `lineTimetables`). */
  trains?: number;
  /** Services (the line's own index) that rest on the summer timetable. By default every third train on each route. */
  summerRest?: readonly number[];
}

/** Does a station lie on route `number`? */
export function onRoute(station: StationData, number: string): boolean {
  const b = station.branch;
  return b === undefined || (typeof b === 'string' ? b === number : b.includes(number));
}

/** Station indices along a route, from the east terminal outward. */
export function routeStations(line: LineShape, route: number): number[] {
  const number = line.routes[route].number;
  return line.stations.flatMap((s, i) => (onRoute(s, number) ? [i] : []));
}

/** Where each station of a route lies along it, from its first station. */
export function routeDistances(line: LineShape, route: number): number[] {
  const out: number[] = [];
  let x = 0;
  routeStations(line, route).forEach((i, k) => {
    if (k > 0) x += line.stations[i].gap ?? STATION_SPACING;
    out.push(x);
  });
  return out;
}

export interface RouteLayout {
  line: number;
  /** Index of the route within its line. */
  local: number;
  number: string;
  /** Global station indices, east to west. */
  stations: number[];
  /** Each station's distance along the route. */
  along: number[];
  /** World x minus distance along, per station: it changes only across a portal. */
  offsets: number[];
  /** How far outside the usual tracks the route runs at each station (see `LANE`). */
  lanes: number[];
  /** A terminal where the line goes on: trains turn on a siding between the tracks. */
  siding: { east: boolean; west: boolean };
  /** Per station, whether it lies on two levels (`StationData.stacked`). */
  stacked: boolean[];
  /** Seconds the doors stand open at each station. */
  dwells: number[];
}

/**
 * A portal: the route runs from `anchor` (already built) toward `far`, which
 * lies elsewhere along x. The tunnel on the far side is a copy of the
 * anchor's tunnel in the same direction, built at the anchor and moved
 * `shift` along x, and in from the anchor's lane to the far one. Where the
 * anchor has no such tunnel of its own (a line joining another's shared
 * stations), a stub of it is built at the anchor, closed beyond sight.
 */
export interface Portal {
  anchor: number;
  far: number;
  /** +1 when the far station follows the anchor along the route (lies west of it), -1 when it comes before. */
  dir: 1 | -1;
  shift: number;
  /** The tracks' lane on the far side (the link's own `lane` is the anchor's). */
  farLane: number;
  stub: boolean;
}

/** A tunnel between neighbouring stations, `a` east of `b` along the routes that run through it. */
export interface Link {
  a: number;
  b: number;
  gap: number;
  /** How far outside the usual tracks its tubes lie (at the anchor, for a portal). */
  lane: number;
  /** Global route indices. */
  routes: number[];
  portal: Portal | null;
}

export interface NetworkLayout {
  /** World x of every station center, by global index. */
  x: number[];
  /** Global index of each line's first station, and of its first route. */
  stationBase: number[];
  routeBase: number[];
  routes: RouteLayout[];
  links: Link[];
  /** The line each station belongs to (the first to serve it). */
  lineOf: number[];
  /** Each line's stations, in its own order, as global indices (shared ones are an earlier line's). */
  global: number[][];
}

/** Clear space kept between stretches built next to each other along x, beyond what the camera sees. */
const CLEAR = 500;
/** Beyond a terminal with a cavern: the tail tubes and the cavern. */
const TAIL = CAVE_HALF_L + TAIL_TUBE + CAVERN_LEN;
const ceilTo = (v: number, step: number) => Math.ceil(v / step) * step;
const floorTo = (v: number, step: number) => Math.floor(v / step) * step;

/**
 * Lays out every line along x. The first line starts at zero and runs toward
 * +x along its primary route (the first one not shifted); every other
 * route's own stretches of stations (runs) are packed beyond what is built
 * so far, with room for the copy of the tunnel they branch off through.
 * Each further line goes to whichever side keeps the world smallest, and a
 * line that shares stations with an earlier one is laid out around them.
 */
export function layoutLines(lines: readonly LineShape[]): NetworkLayout {
  const x: number[] = [];
  const lineOf: number[] = [];
  const order: number[] = [];
  const stationBase: number[] = [];
  const routeBase: number[] = [];
  const global: number[][] = [];
  const routes: RouteLayout[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  let placed = 0;
  const allSeqs: number[][] = [];
  const riders: Array<number | undefined> = [];
  const stackedOf: boolean[] = [];
  for (const [li, line] of lines.entries()) {
    stationBase.push(x.length);
    routeBase.push(routes.length);
    const map = line.stations.map((s) => {
      if (s.shared) {
        const earlier = lines.findIndex((l) => l.id === s.shared);
        const k = earlier >= 0 && earlier < li ? lines[earlier].stations.findIndex((o) => o.name === s.name && !o.shared) : -1;
        if (k < 0) throw new Error(`${s.name} is shared with no earlier line ${s.shared}`);
        return global[earlier][k];
      }
      x.push(NaN);
      lineOf.push(li);
      order.push(-1);
      riders.push(s.riders);
      stackedOf.push(!!s.stacked);
      return x.length - 1;
    });
    global.push(map);
    const seqs = line.routes.map((_, r) => routeStations(line, r).map((i) => map[i]));
    const alongs = line.routes.map((_, r) => routeDistances(line, r));
    allSeqs.push(...seqs);
    const beyond = (i: number, side: -1 | 1) => allSeqs.some((seq) => {
      const k = seq.indexOf(i);
      return k >= 0 && k + side >= 0 && k + side < seq.length;
    });
    // Room a station needs around it: its cave, or its cave and cavern where the line ends.
    const reach = (i: number, side: -1 | 1) => (beyond(i, side) ? CAVE_HALF_L : TAIL);
    const primary = line.routes.findIndex((r) => !r.shifted);
    if (primary < 0) throw new Error('A line needs one route that is not shifted');
    // Which way this line's stretches are packed: away from the world's middle.
    let side = 1;
    const pseq = seqs[primary];
    if (pseq.every((i) => Number.isNaN(x[i]))) {
      const first = pseq[0];
      const last = pseq[pseq.length - 1];
      const min = alongs[primary][0] - reach(first, -1);
      const max = alongs[primary][pseq.length - 1] + reach(last, 1);
      const base = li === 0 ? 0 : placeSide(min, max, lo, hi);
      side = base < 0 ? -1 : 1;
      pseq.forEach((i, k) => {
        x[i] = alongs[primary][k] + base;
        order[i] = placed++;
      });
      lo = Math.min(lo, min + base);
      hi = Math.max(hi, max + base);
    }
    for (const r of [primary, ...seqs.keys()].filter((v, k, all) => all.indexOf(v) === k)) {
      const seq = seqs[r];
      const along = alongs[r];
      let k = 0;
      while (k < seq.length) {
        if (!Number.isNaN(x[seq[k]])) { k++; continue; }
        let end = k;
        while (end < seq.length && Number.isNaN(x[seq[end]])) end++;
        // A run of new stations, k..end-1, next to an anchor already built.
        const before = k > 0 ? seq[k - 1] : -1;
        const after = end < seq.length ? seq[end] : -1;
        if (before >= 0 && after >= 0) throw new Error(`Route ${line.routes[r].number} leaves and rejoins its line`);
        if (before < 0 && after < 0) throw new Error(`Route ${line.routes[r].number} shares no station with the line`);
        const anchor = before >= 0 ? before : after;
        const ka = before >= 0 ? k - 1 : end;
        const natural = (j: number) => x[anchor] + along[j] - along[ka];
        // The run itself, and the copy of the anchor's tunnel up to the anchor's cave.
        const rmin = Math.min(natural(k) - reach(seq[k], -1), before >= 0 ? x[anchor] + CAVE_HALF_L : Infinity);
        const rmax = Math.max(natural(end - 1) + reach(seq[end - 1], 1), after >= 0 ? x[anchor] - CAVE_HALF_L : -Infinity);
        const up = ceilTo(hi + CLEAR - rmin, 1000);
        const down = floorTo(lo - CLEAR - rmax, 1000);
        // A line of its own packs away from the middle; one around shared stations wherever keeps the world smallest.
        const shift = li === 0 || !pseq.some((i) => lineOf[i] !== li) ? (side > 0 ? up : down)
          : Math.max(Math.abs(lo), Math.abs(rmax + up)) <= Math.max(Math.abs(rmin + down), Math.abs(hi)) ? up : down;
        for (let j = k; j < end; j++) {
          x[seq[j]] = natural(j) + shift;
          order[seq[j]] = placed++;
        }
        lo = Math.min(lo, rmin + shift);
        hi = Math.max(hi, rmax + shift);
        k = end;
      }
    }
    for (const [r, seq] of seqs.entries()) {
      routes.push({
        line: li,
        local: r,
        number: line.routes[r].number,
        stations: seq,
        along: alongs[r],
        offsets: seq.map((i, k) => x[i] - alongs[r][k]),
        lanes: seq.map((i) => (lineOf[i] === li ? 0 : LANE)),
        siding: { east: beyond(seq[0], -1), west: beyond(seq[seq.length - 1], 1) },
        stacked: seq.map((i) => stackedOf[i]),
        dwells: seq.map((i) => stationDwell(riders[i])),
      });
    }
  }

  const links: Link[] = [];
  const byKey = new Map<string, Link>();
  for (const [r, route] of routes.entries()) {
    for (let k = 0; k + 1 < route.stations.length; k++) {
      const a = route.stations[k];
      const b = route.stations[k + 1];
      const shifted = route.offsets[k] !== route.offsets[k + 1] || route.lanes[k] !== route.lanes[k + 1];
      const anchorK = order[a] < order[b] ? k : k + 1;
      const farK = anchorK === k ? k + 1 : k;
      const lane = route.lanes[anchorK];
      const key = `${a}-${b}-${lane}`;
      const known = byKey.get(key);
      if (known) { known.routes.push(r); continue; }
      const gap = route.along[k + 1] - route.along[k];
      const link: Link = {
        a, b, gap, lane, routes: [r],
        portal: shifted ? {
          anchor: route.stations[anchorK], far: route.stations[farK], dir: anchorK === k ? 1 : -1,
          shift: route.offsets[farK] - route.offsets[anchorK], farLane: route.lanes[farK], stub: false,
        } : null,
      };
      byKey.set(key, link);
      links.push(link);
    }
  }
  // A portal copies the anchor's own tunnel in its direction; where there is none, it gets a stub.
  for (const l of links) {
    if (!l.portal) continue;
    const { anchor, dir } = l.portal;
    l.portal.stub = !links.some((o) => !o.portal && o.lane === l.lane && o.gap === l.gap && (dir > 0 ? o.a : o.b) === anchor);
  }
  return { x, stationBase, routeBase, routes, links, lineOf, global };
}

/** Where a line spanning `min`..`max` (in its own frame) starts, beside what is built from `lo` to `hi`. */
function placeSide(min: number, max: number, lo: number, hi: number): number {
  const after = ceilTo(hi + CLEAR - min, 1000);
  const before = floorTo(lo - CLEAR - max, 1000);
  const reach = (base: number) => Math.max(Math.abs(Math.min(lo, min + base)), Math.abs(Math.max(hi, max + base)));
  return reach(before) < reach(after) ? before : after;
}

/** World x of every station center of a single line, laid out on its own. */
export function stationPositions(line: LineShape): number[] {
  return layoutLines([line]).x;
}

/** How long a train waits at least in a turnback before the next one on its route is due. */
const TURNBACK_MARGIN = 60;

/** One line's service: a timetable per route, and the trains that run each. */
export interface LineService {
  timetables: Timetable[];
  /** Seconds between two trains on the same route. */
  headway: number;
  /** Trains per route. */
  counts: number[];
  /**
   * The line's services in running order: each with its route (index within
   * the line) and clock offset. Consecutive services on the shared trunk are
   * `headway / routes` apart, the routes taking turns.
   */
  services: Array<{ route: number; offset: number }>;
}

/**
 * The timetables of one line's routes. Routes share the trunk (the stations
 * every route serves), so they keep to one rhythm there: on the trunk the
 * routes take turns, a train every `headway / routes` seconds on each track,
 * and trains never meet. A route's branches differ in length, so each route
 * waits out the difference, modulo its headway, in its turnbacks: the west
 * end's wait lines it up for the trunk eastbound, the east end's for the
 * trunk westbound. The longest route sets the headway: `trains` trains on
 * it, or a count close by that leaves every wait short enough for the
 * turnback to be clear before the next train on its route comes.
 */
export function lineTimetables(layout: NetworkLayout, line: number, trains = 3): LineService {
  const routes = layout.routes.filter((r) => r.line === line);
  const shape = (r: RouteLayout, layover = { west: 0, east: 0 }) => ({ stations: r.stations, along: r.along, offsets: r.offsets, lanes: r.lanes, stacked: r.stacked, layover, siding: r.siding, dwells: r.dwells });
  const plain = routes.map((r) => new Timetable(layout.x, shape(r)));
  const trunk = routes[0].stations.filter((i) => routes.every((r) => r.stations.includes(i)));
  const [east, west] = [trunk[0], trunk[trunk.length - 1]];
  const at = (t: Timetable, station: number, track: 1 | 2) => t.arrival(t.stopIndex(station, track));
  // Seconds from the trunk's west end westbound to its west end eastbound, and around the east end likewise.
  const westOut = plain.map((t) => at(t, west, 2) - at(t, west, 1));
  const eastOut = plain.map((t) => t.cycle - at(t, east, 2) + at(t, east, 1));
  const longest = plain.reduce((m, t, r) => (t.cycle > plain[m].cycle ? r : m), 0);
  const mod = (a: number, n: number) => ((a % n) + n) % n;
  const waits = (headway: number) => routes.map((_, r) => ({ west: mod(westOut[longest] - westOut[r], headway), east: mod(eastOut[longest] - eastOut[r], headway) }));
  let count = trains;
  for (const candidate of [trains, trains + 1, trains - 1, trains + 2, trains - 2].filter((c) => c >= 2)) {
    const headway = plain[longest].cycle / candidate;
    if (waits(headway).every((w) => Math.max(w.west, w.east) < headway - TURNBACK_MARGIN)) { count = candidate; break; }
  }
  const headway = plain[longest].cycle / count;
  const layovers = waits(headway);
  const timetables = routes.map((r, i) => (layovers[i].west || layovers[i].east ? new Timetable(layout.x, shape(r, layovers[i])) : plain[i]));
  const counts = timetables.map((t) => Math.round(t.cycle / headway));
  // Route r's trains reach the trunk's east end westbound `r * step` after the longest route's.
  const R = routes.length;
  const step = headway / R;
  const services: LineService['services'] = [];
  for (let j = 0; j < Math.max(...counts); j++) {
    for (let r = 0; r < R; r++) {
      if (j >= counts[r]) continue;
      const align = at(timetables[r], east, 1) - at(timetables[0], east, 1);
      services.push({ route: r, offset: mod((j * R + r) * step + align, timetables[r].cycle) });
    }
  }
  return { timetables, headway, counts, services };
}

/** One timetable per route of a single line (see `lineTimetables`). */
export function routeTimetables(line: LineShape): Timetable[] {
  return lineTimetables(layoutLines([line]), 0, line.trains).timetables;
}

/**
 * Every train slot of the network for `Operations`: each line's services, then its `spares[line]` spare trains that
 * only SL's real trains drive (see `realService.ts`). The game and the landing map both build their trains from this,
 * so they show the same ones.
 */
export function serviceSlots(lines: readonly LineShape[], layout: NetworkLayout, services: readonly LineService[], spares: readonly number[] = []): ServiceSlot[] {
  const slots: ServiceSlot[] = [];
  lines.forEach((line, li) => {
    const routeBase = layout.routeBase[li];
    const rest = line.summerRest;
    const perRoute = new Map<number, number>();
    services[li].services.forEach((s, k) => {
      const j = perRoute.get(s.route) ?? 0;
      perRoute.set(s.route, j + 1);
      slots.push({
        timetable: services[li].timetables[s.route], offset: s.offset, route: routeBase + s.route, line: li,
        summerRest: rest ? rest.includes(k) : j % 3 === 1,
      });
    });
    const own = slots.length - services[li].services.length;
    for (let k = 0; k < (spares[li] ?? 0); k++) slots.push({ ...slots[own + (k % services[li].services.length)], spare: true, summerRest: false });
  });
  return slots;
}
