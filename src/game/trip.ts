import { text } from './i18n/text';
import type { Network } from './line';

/**
 * A trip the player picks, from one station to another (the pause menu's *Planera resa*, or two stations in the
 * network view): the way there as rides and changes, the fewest changes first, and a guide that follows the player
 * along it, saying which train to take, how many stations are left and where to change. It only reads where the
 * player is and which train they ride: the trains keep to the timetable, or to SL, as ever.
 */

/** One ride: aboard any train of `routes` (global indices) from `from` to `to`, on `track` (1 toward +x, outbound). */
export interface Leg {
  line: number;
  from: number;
  to: number;
  track: 1 | 2;
  routes: number[];
  /** Stations from `from` to `to`, `to` counted. */
  stops: number;
}

export interface Trip {
  /** The station names picked, as the player reads them. */
  from: string;
  to: string;
  legs: Leg[];
}

/** What a change costs against riding on, in seconds: a trip with one change fewer wins unless it is far slower. */
const CHANGE = 300;
/** Walking a passage between two lines' stations of the same name. */
const WALK = 240;
/** A train's average speed between stations, in m/s (for weighing one way against another). */
const SPEED = 15;

/** Every station's global index with this name: T-Centralen is a station on the blue line and one on the red and green. */
const named = (net: Network, name: string) => net.stations.flatMap((s, i) => (s.name === name ? [i] : []));

/** The way from one station to another by name, the fewest changes first, or null if there is none (or both are one). */
export function planTrip(net: Network, from: string, to: string): Trip | null {
  if (from === to) return null;
  const sources = named(net, from);
  const targets = new Set(named(net, to));
  if (!sources.length || !targets.size) return null;
  const n = net.stations.length;
  const cost = new Array<number>(n).fill(Infinity);
  const back: Array<{ prev: number; ride: { route: number; track: 1 | 2 } | null } | null> = new Array(n).fill(null);
  const done = new Array<boolean>(n).fill(false);
  for (const s of sources) cost[s] = 0;
  // Dijkstra over stations: a ride from any station to any other along a route is one step, so every change costs.
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && cost[i] < Infinity && (u < 0 || cost[i] < cost[u])) u = i;
    if (u < 0) return null;
    if (targets.has(u)) break;
    done[u] = true;
    const relax = (v: number, c: number, ride: { route: number; track: 1 | 2 } | null) => {
      if (done[v] || c >= cost[v]) return;
      cost[v] = c;
      back[v] = { prev: u, ride };
    };
    net.layout.routes.forEach((route, r) => {
      const k = route.stations.indexOf(u);
      if (k < 0) return;
      route.stations.forEach((v, j) => {
        if (j === k) return;
        const [a, b] = j > k ? [k, j] : [j, k];
        let seconds = Math.abs(route.along[j] - route.along[k]) / SPEED;
        for (let m = a + 1; m < b; m++) seconds += route.dwells[m];
        relax(v, cost[u] + CHANGE + seconds, { route: r, track: j > k ? 1 : 2 });
      });
    });
    const name = net.stations[u].name;
    net.stations.forEach((s, v) => { if (v !== u && s.name === name) relax(v, cost[u] + WALK, null); });
  }
  // The station reached first, walked back to where it started.
  let at = [...targets].reduce((a, b) => (cost[b] < cost[a] ? b : a));
  const legs: Leg[] = [];
  while (back[at]) {
    const step = back[at]!;
    if (step.ride) {
      const line = net.layout.routes[step.ride.route].line;
      legs.unshift(legBetween(net, line, step.prev, at, step.ride.track));
    }
    at = step.prev;
  }
  return { from, to, legs };
}

/** The ride from `from` to `to` on a line, with every route of the line that takes it. */
function legBetween(net: Network, line: number, from: number, to: number, track: 1 | 2): Leg {
  const routes: number[] = [];
  let stops = Infinity;
  net.layout.routes.forEach((route, r) => {
    if (route.line !== line) return;
    const a = route.stations.indexOf(from);
    const b = route.stations.indexOf(to);
    if (a < 0 || b < 0 || (b > a) !== (track === 1)) return;
    routes.push(r);
    stops = Math.min(stops, Math.abs(b - a));
  });
  return { line, from, to, track, routes, stops };
}

/** The trains a leg takes, as the boards name them: "10 Hjulsta eller 11 Akalla". */
export function legTrains(net: Network, leg: Leg): string {
  // Routes to the same end are one: "10 eller 11 Kungsträdgården".
  const byEnd = new Map<string, string[]>();
  for (const r of leg.routes) {
    const route = net.routes[r];
    const end = leg.track === 1 ? route.outbound : route.inbound;
    byEnd.set(end, [...(byEnd.get(end) ?? []), route.number]);
  }
  const names = [...byEnd].map(([end, numbers]) => `${list(numbers)} ${end}`);
  return list(names);
}

/** "a", "a eller b", "a, b eller c". */
const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} ${text.trip.or} ${items[items.length - 1]}` : items[0]);

/** A line as said in a sentence: "röda linjen", "the red line". */
const lineName = (net: Network, line: number) => (text.trip.lines as Record<string, string>)[net.lines[line].id ?? ''] ?? net.lines[line].name.toLowerCase();

const format = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));

/** "3 stationer" or "1 station". */
const count = (n: number) => format(n === 1 ? text.trip.station : text.trip.stations, { n });

/** The whole way in a sentence: "11 Akalla till Västra skogen, sedan 10 Hjulsta till Rinkeby". */
export function tripSummary(net: Network, trip: Trip): string {
  return trip.legs.map((leg, i) => {
    const stop = net.stations[leg.to].name;
    // A ride to the end of the line needs no "to": the trains say where.
    const end = leg.routes.every((r) => (leg.track === 1 ? net.routes[r].outbound : net.routes[r].inbound) === stop);
    const ride = format(end ? text.trip.legEnd : text.trip.leg, { trains: legTrains(net, leg), stop, count: count(leg.stops) });
    if (i === 0) return ride;
    const before = trip.legs[i - 1];
    const then = before.to !== leg.from ? text.trip.thenWalk : before.line !== leg.line ? text.trip.thenLine : text.trip.then;
    return format(then, { line: lineName(net, leg.line), ride });
  }).join(', ');
}

/** Where the player is, once a second: aboard a train in service, or on foot at a station. */
export interface TripView {
  /** The train ridden: an id, the station it stands at (null between stations) and the ones it calls at next, up to its turnback. */
  aboard: { train: number; at: number | null; ahead: number[] } | null;
  /** Aboard something else that is not in service (Silverpilen, the driver's cab): nothing to say. */
  elsewhere: boolean;
  /** The station the player is at on foot, and whether on its platform. */
  station: number | null;
  platform: boolean;
  /** When the next train that takes the current leg leaves its first station: seconds, and that time on the clock. */
  wait?: Wait | null;
}

export interface Wait {
  seconds: number;
  clock: string;
}

/** How long until the next train, as said to the player: "om 4 min", "nu", or the time when it is far off (the night break). */
export function waitText(wait: Wait): string {
  if (wait.seconds < 20) return text.trip.now;
  if (wait.seconds > 45 * 60) return format(text.trip.at, { time: wait.clock });
  return format(text.trip.inMinutes, { n: Math.ceil(wait.seconds / 60) });
}

export interface TripUpdate {
  /** The line under the station's name in the HUD: where the trip goes and what to do now. */
  status: string;
  /** A caption to show once, or null. */
  say: string | null;
  done: boolean;
}

/** Follows the player along a trip, a step at a time. */
export class TripGuide {
  private leg = 0;
  /** The train the player last rode, and whether it was taking them the right way. */
  private ridden: { train: number; good: boolean } | null = null;
  private readonly said = new Set<string>();
  done = false;

  constructor(private readonly net: Network, public trip: Trip) {}

  /** The leg the player is on now. */
  get current(): Leg {
    return this.trip.legs[this.leg];
  }

  private name(i: number): string {
    return this.net.stations[i].name;
  }

  /** A caption, once per trip and leg. */
  private once(key: string, message: string): string | null {
    const k = `${this.leg}:${key}`;
    if (this.said.has(k)) return null;
    this.said.add(k);
    return message;
  }

  private update(status: string, say: string | null = null): TripUpdate {
    return { status: `${format(text.trip.heading, { station: this.trip.to })} · ${status}`, say, done: this.done };
  }

  /** What to do next, after getting off at `leg`'s end. */
  private changeText(): string {
    const leg = this.current;
    const walk = this.trip.legs[this.leg - 1].to !== leg.from;
    return format(walk ? text.trip.changeWalk : text.trip.change, { line: lineName(this.net, leg.line), trains: legTrains(this.net, leg) });
  }

  step(view: TripView): TripUpdate {
    if (this.done) return this.update(text.trip.arrivedShort);
    const leg = this.current;
    const last = this.leg === this.trip.legs.length - 1;
    const stop = this.name(leg.to);
    if (view.aboard) {
      const { train, at, ahead } = view.aboard;
      if (at !== null && this.name(at) === stop) {
        this.ridden = { train, good: true };
        const off = last ? text.trip.offHere : format(text.trip.offChange, { trains: legTrains(this.net, this.trip.legs[this.leg + 1]) });
        return this.update(off, this.once('off', `${stop}. ${off}.`));
      }
      const k = ahead.findIndex((s) => this.name(s) === stop);
      if (k >= 0) {
        this.ridden = { train, good: true };
        if (k === 0) return this.update(format(text.trip.next, { stop }), this.once('next', format(last ? text.trip.nextSay : text.trip.nextChange, { stop })));
        return this.update(format(text.trip.left, { count: count(k + 1), stop }));
      }
      // Aboard and not going there: carried past it, or on the wrong train.
      const passed = this.ridden?.train === train && this.ridden.good;
      const message = passed ? format(text.trip.passed, { stop }) : format(text.trip.wrong, { trains: legTrains(this.net, leg) });
      return this.update(message, this.once(`${passed ? 'passed' : 'wrong'}:${train}`, message));
    }
    if (view.elsewhere) return this.update(format(text.trip.left, { count: count(leg.stops), stop }));
    this.ridden = null;
    const here = view.station;
    if (here !== null && this.name(here) === stop) {
      if (last) {
        this.done = true;
        return this.update(text.trip.arrivedShort, format(text.trip.arrived, { station: this.trip.to }));
      }
      this.leg++;
      return this.update(format(text.trip.board, { trains: legTrains(this.net, this.current) }), this.changeText());
    }
    // Off somewhere else on the way, or out of it: the way on from here.
    if (here !== null && view.platform && this.name(here) !== this.name(leg.from)) {
      const again = planTrip(this.net, this.name(here), this.trip.to);
      if (again) {
        this.trip = again;
        this.leg = 0;
        this.said.clear();
        return this.update(format(text.trip.board, { trains: legTrains(this.net, this.current) }), format(text.trip.replanned, { station: this.trip.to, way: tripSummary(this.net, again) }));
      }
    }
    if (here !== null && this.name(here) === this.name(leg.from)) {
      // At a station the line shares with another, walked over from one of the same name: which line is the one to take.
      const other = this.net.stations[here].line !== leg.line && !this.net.stations[here].lines.includes(leg.line);
      const board = other ? format(text.trip.walk, { line: lineName(this.net, leg.line), trains: legTrains(this.net, leg) }) : format(text.trip.board, { trains: legTrains(this.net, leg) });
      return this.update(view.wait ? `${board} · ${waitText(view.wait)}` : board);
    }
    return this.update(format(text.trip.goTo, { station: this.name(leg.from) }));
  }
}
