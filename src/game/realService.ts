import { covers, fetchDepartures, JourneyStore, parseDepartures, STALE, type Journey } from './sl';
import { DEPARTURE_HOLD, DOOR_SLIDE, DOOR_WARNING, type Timetable, type Track } from './timetable';

/**
 * Real trains: SL's live metro driving the game's trains, line by line.
 *
 * Every consumer of the timetable (doors, announcements, commuters, fares,
 * sound) already works from `timetable.stateAt(clock)`. So a real journey is
 * not a new kind of train; it is a warped clock on its route's timetable
 * (on the blue line 10 or 11, and so on). Each run walks the loop from one
 * turnback cavern to the other: outbound trains appear in the cavern at the
 * inbound end, stop at every station and end in the cavern beyond the outbound
 * terminal (Hjulsta or Akalla on the blue line); inbound trains come out of that
 * cavern and end at the inbound terminal (Kungsträdgården). At a platform the clock pauses with the doors open until
 * SL's expected departure. In the tunnel it runs slower so the train arrives
 * in time for the next one, since the game's stations are closer together
 * than the real ones.
 *
 * Plans only change where a real train would absorb it: once a train has
 * left a station its run to the next one is fixed, and new data only moves
 * its departure while it stands at a platform. A rider never feels a jump.
 */

/** Extra seconds at the first station of a run: outbound trains wait at the inbound terminal, inbound ones pull straight in. */
const FIRST_WAIT: Record<Track, number> = { 1: 90, 2: 10 };
/** At most this much extra standing time at a station; beyond it the tunnel run slows down instead. */
const DWELL_EXTRA = 25;
/** How much a tunnel run may be stretched or squeezed compared with the timetable. */
const MAX_STRETCH = 3;
const MIN_STRETCH = 0.75;
/** Beyond this the clock pauses in the middle of the dwell, just before the doors start closing. */
const CLOSE_LEAD = DEPARTURE_HOLD + DOOR_WARNING + DOOR_SLIDE + 0.05;
const POLL = 30_000;

export interface RealClock {
  /** Timetable clock for this train: `timetable.stateAt(clock)` is where it is. */
  clock: number;
  /** Index of the route (and timetable) the journey runs on. */
  route: number;
  /** Timetable seconds per real second right now (0 while held at a platform). */
  rate: number;
  journey: Journey;
}

class Run {
  pos = 0;
  moving = false;
  hopReal = 0;
  /** Extra seconds held at the current stop, fixed once the doors start closing. */
  pause: number | null = null;
  ended = false;
  slot = -1;

  constructor(readonly journey: Journey, readonly tt: Timetable, readonly route: number, readonly seq: number[], readonly base: number, public since: number) {}
}

export class RealSchedule {
  readonly store = new JourneyStore();
  private readonly runs = new Map<number, Run>();
  private readonly finished = new Set<number>();
  private readonly slots: (Run | null)[];
  private readonly timetables: Timetable[];

  /**
   * @param timetables one per route
   * @param lines the line number of each route; journeys on other lines are ignored
   */
  constructor(timetables: Timetable | Timetable[], slotCount: number, private readonly lines: readonly string[] = []) {
    this.timetables = Array.isArray(timetables) ? timetables : [timetables];
    this.slots = Array.from({ length: slotCount }, () => null);
  }

  /** The route a journey runs on, or -1. */
  private routeOf(j: Journey): number {
    return this.timetables.length === 1 ? 0 : this.lines.indexOf(j.line);
  }

  /** The loop's stops for one direction: east cavern, track 1 stations, west cavern (both tracks), track 2 stations, east cavern. */
  private sequence(tt: Timetable, direction: 1 | 2): number[] {
    const n = tt.route.length;
    const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
    return direction === 1 ? range(0, n + 2) : range(n + 2, 2 * n + 4);
  }

  /** The run driving train `slot`, if any. */
  slot(slot: number, time: number): RealClock | null {
    const run = this.slots[slot];
    if (!run) return null;
    return { ...this.clockOf(run, time), route: run.route, journey: run.journey };
  }

  /** Advances every run to `time`, starts runs for journeys that have begun and frees finished ones. */
  update(time: number): void {
    for (const j of this.store.journeys.values()) {
      if (this.runs.has(j.id) || this.finished.has(j.id)) continue;
      const route = this.routeOf(j);
      if (route < 0) continue;
      const tt = this.timetables[route];
      const seq = this.sequence(tt, j.direction);
      // A distinct clock range per journey keeps announcement and inspection keys apart.
      const run = new Run(j, tt, route, seq, tt.cycle * (j.id % 50021), 0);
      run.since = this.target(run, 0) - tt.stopDuration(seq[0]);
      if (!Number.isFinite(run.since) || run.since > time) continue;
      // First seen mid-journey: replay it from the cavern with what is known now.
      this.advance(run, time, false);
      if (run.ended) { this.finished.add(j.id); continue; }
      const free = this.slots.indexOf(null);
      if (free < 0) continue;
      run.slot = free;
      this.slots[free] = run;
      this.runs.set(j.id, run);
    }
    for (const run of this.runs.values()) {
      this.advance(run, time, true);
      if (!run.ended) continue;
      this.slots[run.slot] = null;
      this.runs.delete(run.journey.id);
      this.finished.add(run.journey.id);
    }
    for (const id of this.finished) if (!this.store.journeys.has(id)) this.finished.delete(id);
  }

  /** The next real train due at a station on a track, in seconds until it leaves. */
  nextDeparture(station: number, track: Track, time: number): { journey: Journey; departs: number } | null {
    return this.nextDepartures(station, track, time, 1)[0] ?? null;
  }

  /** The next `count` journeys to leave a station on a track, soonest first, as the platform boards list them. */
  nextDepartures(station: number, track: Track, time: number, count: number): Array<{ journey: Journey; departs: number }> {
    const found: Array<{ journey: Journey; departs: number }> = [];
    for (const j of this.store.journeys.values()) {
      if (j.direction !== track) continue;
      const route = this.routeOf(j);
      if (route < 0 || !this.timetables[route].serves(station)) continue;
      const run = this.runs.get(j.id);
      if (this.finished.has(j.id)) continue;
      if (run && this.passed(run, station)) continue;
      const departs = this.stationTime(j, station) - time;
      // A journey SL has listed nowhere near yet has no time here, and must not win the comparison.
      if (!Number.isFinite(departs) || departs < -30) continue;
      found.push({ journey: j, departs });
    }
    return found.sort((a, b) => a.departs - b.departs).slice(0, count);
  }

  private passed(run: Run, station: number): boolean {
    const p = run.seq.findIndex((k) => run.tt.stops[k].kind === 'station' && run.tt.stops[k].station === station);
    return run.pos > p || (run.pos === p && run.moving);
  }

  private dep(tt: Timetable, k: number): number {
    return tt.arrival(k) + tt.stopDuration(k);
  }

  private hopGame(tt: Timetable, k: number): number {
    return tt.arrival(k + 1) - this.dep(tt, k);
  }

  private pausePoint(tt: Timetable, k: number): number {
    const held = tt.stopDuration(k);
    return tt.stops[k].kind === 'station' ? held - CLOSE_LEAD : held;
  }

  /** Real departure wanted from `run.seq[p]`. */
  private target(run: Run, p: number): number {
    const k = run.seq[p];
    const stop = run.tt.stops[k];
    if (stop.kind === 'station') return this.stationTime(run.journey, stop.station);
    if (p !== 0) return Infinity;
    // Leave the cavern so as to reach the first station with some waiting time to spare.
    const first = run.seq[1];
    return this.target(run, 1) - run.tt.stopDuration(first) - FIRST_WAIT[run.journey.direction] - this.hopGame(run.tt, k);
  }

  /** SL's expected departure, or an estimate from the nearest station SL did list. */
  stationTime(j: Journey, station: number): number {
    const known = j.times[station];
    if (known !== undefined) return known;
    const route = this.timetables[Math.max(0, this.routeOf(j))].route;
    const order = j.direction === 1 ? route : [...route].reverse();
    const n = order.length;
    const at = order.indexOf(station);
    if (at < 0) return NaN;
    for (let d = 1; d < n; d++) {
      const before = order[at - d];
      if (before !== undefined && j.times[before] !== undefined) {
        let t = j.times[before]!;
        for (let i = at - d; i < at; i++) t += this.store.gap(order[i], order[i + 1]);
        return t;
      }
      const after = order[at + d];
      if (after !== undefined && j.times[after] !== undefined) {
        let t = j.times[after]!;
        for (let i = at + d; i > at; i--) t -= this.store.gap(order[i], order[i - 1]);
        return t;
      }
    }
    return NaN;
  }

  /** Real duration of the run from the current stop to the next, fixed when the train leaves. */
  private plannedHop(run: Run, depart: number): number {
    const k = run.seq[run.pos];
    const next = run.seq[run.pos + 1];
    const game = this.hopGame(run.tt, k);
    const stops = run.tt.stops;
    if (stops[k].kind === 'turnback' || stops[next].kind === 'turnback') return game;
    const extra = this.target(run, run.pos + 1) - depart - (game + run.tt.stopDuration(next));
    const real = extra >= 0 ? game + Math.max(0, extra - DWELL_EXTRA) : game + extra;
    return Math.min(game * MAX_STRETCH, Math.max(game * MIN_STRETCH, real));
  }

  /**
   * Steps a run through its stops up to `time`. `live` runs are advanced
   * frame by frame: if new data asks a train to leave earlier than it already
   * has waited, it starts closing its doors now rather than jumping.
   */
  private advance(run: Run, time: number, live: boolean): void {
    const tt = run.tt;
    while (!run.ended) {
      const k = run.seq[run.pos];
      if (run.moving) {
        if (time < run.since + run.hopReal) return;
        run.since += run.hopReal;
        run.pos++;
        run.moving = false;
        run.pause = null;
        // Reaching the far cavern ends the run: the train goes on out of the game, or out of service.
        if (run.pos === run.seq.length - 1) run.ended = true;
        continue;
      }
      const held = tt.stopDuration(k);
      if (run.pause === null) {
        const wanted = Math.max(0, this.target(run, run.pos) - (run.since + held)) || 0;
        const waited = time - run.since - this.pausePoint(tt, k);
        if (!(waited >= wanted)) return;
        run.pause = live ? Math.max(wanted, waited) : wanted;
      }
      const depart = run.since + held + run.pause;
      if (time < depart) return;
      run.hopReal = this.plannedHop(run, depart);
      run.since = depart;
      run.moving = true;
    }
  }

  private clockOf(run: Run, time: number): { clock: number; rate: number } {
    const tt = run.tt;
    const k = run.seq[run.pos];
    if (run.moving) {
      const game = this.hopGame(tt, k);
      const f = Math.min(1, Math.max(0, (time - run.since) / run.hopReal));
      return { clock: run.base + this.dep(tt, k) + f * game, rate: game / run.hopReal };
    }
    const held = tt.stopDuration(k);
    const pausePoint = this.pausePoint(tt, k);
    const extra = run.pause ?? (Math.max(0, this.target(run, run.pos) - (run.since + held)) || 0);
    const e = time - run.since;
    if (e < pausePoint) return { clock: run.base + tt.arrival(k) + e, rate: 1 };
    if (e < pausePoint + extra) return { clock: run.base + tt.arrival(k) + pausePoint, rate: 0 };
    return { clock: run.base + tt.arrival(k) + Math.min(held, e - extra), rate: 1 };
  }
}

/** One line's part in real mode. */
export interface RealLine {
  /** The line's route timetables, and each route's number. */
  timetables: Timetable[];
  routes: readonly string[];
  /** Trains the line can put on the track. */
  slots: number;
  /** Whether each station of the network (by global index) is one of this line's. */
  stations: readonly boolean[];
}

/**
 * Polls SL while real trains are wanted, once for every line, and says which lines have data fresh enough to drive
 * the game. A line SL sends nothing for (no feed from the relay, or too few of its stations) keeps to the timetable.
 */
export class RealTrains {
  readonly schedules: RealSchedule[];
  private readonly lineSets: ReadonlySet<string>[];
  private readonly lastOk: number[];
  private readonly stationCounts: number[];
  private enabled = false;
  private timer = 0;
  private inFlight = false;
  failed = false;

  /** @param sites every station's SL site id, by global index */
  constructor(private readonly lines: readonly RealLine[], private readonly sites: readonly number[]) {
    this.schedules = lines.map((l) => new RealSchedule(l.timetables, l.slots, l.routes));
    this.lineSets = lines.map((l) => new Set(l.routes));
    this.lastOk = lines.map(() => -Infinity);
    this.stationCounts = lines.map((l) => l.stations.filter(Boolean).length);
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    clearInterval(this.timer);
    if (!on) return;
    void this.poll();
    this.timer = window.setInterval(() => void this.poll(), POLL);
  }

  /** Real trains are wanted and SL recently sent some for line `line`. */
  live(line: number): boolean {
    return this.enabled && Date.now() / 1000 - this.lastOk[line] < STALE;
  }

  private async poll(): Promise<void> {
    if (this.inFlight || document.hidden) return;
    this.inFlight = true;
    try {
      const { lists, at } = await fetchDepartures(this.sites);
      this.lines.forEach((line, li) => {
        // A station shared by lines has one site, so each line reads it for its own trains only.
        const sightings = lists.flatMap((body, i) => (line.stations[i] ? parseDepartures(i, body, this.lineSets[li]) : []));
        this.schedules[li].store.update(sightings, at);
        if (covers(sightings, this.stationCounts[li])) this.lastOk[li] = at;
      });
      this.failed = false;
    } catch (err) {
      console.warn(err);
      this.failed = true;
    } finally {
      this.inFlight = false;
    }
  }
}
