import { hash01, stockholm, stockholmEpoch } from './clock';

/**
 * The power cut: a couple of times a year the power goes for a few minutes, for everyone at once. When is a pure
 * function of the date. The trains coast to a stop wherever they are and stand dark; when the power comes back
 * they pull away and run a little fast until they are back on time. That too is a function of the clock (a warp
 * of the timetable clock, `cutClock`), so every player sees the same trains stand in the same places.
 * No three.js: the landing page's map warps its trains the same way.
 */

export interface Cut {
  start: number;
  end: number;
}

/** About this many cuts a year. */
const PER_YEAR = 2.5;
/** Seconds for a train's clock to run down to a stop, and to wind up again. */
export const COAST = 14;
/** How much faster than the timetable the trains run afterwards, until they are back on time. */
const CATCH_UP = 0.08;
const DAY = 86400;

/** The cut on a given Stockholm date, if there is one: in the daytime, four to seven minutes. */
export function cutOn(year: number, month: number, day: number): Cut | null {
  const n = Math.floor(stockholmEpoch(year, month, day, 12) / DAY);
  if (hash01(n, 7331) >= PER_YEAR / 365) return null;
  const start = stockholmEpoch(year, month, day, 7) + Math.floor(hash01(n, 7332) * 15 * 3600);
  return { start, end: start + 240 + Math.floor(hash01(n, 7333) * 180) };
}

/** A made-up cut, for `?stromavbrott` and headless checks. Only this visitor sees it. */
let forced: Cut | null = null;
export function forceCut(start: number, seconds = 150): void {
  forced = { start, end: start + seconds };
}

const byDay = new Map<number, Cut | null>();
function cutFor(epoch: number): Cut | null {
  const key = Math.floor(epoch / DAY);
  if (!byDay.has(key)) {
    const c = stockholm(epoch);
    byDay.set(key, cutOn(c.year, c.month, c.day));
  }
  return byDay.get(key)!;
}

/** The cut going on at `epoch`, or the last one before it that the trains are still catching up after. */
function nearestCut(epoch: number): Cut | null {
  if (forced && epoch >= forced.start - 1 && epoch < forced.end + catchUpSeconds(forced) + COAST) return forced;
  for (const t of [epoch, epoch - DAY]) {
    const c = cutFor(t);
    if (c && epoch >= c.start - 1 && epoch < c.end + catchUpSeconds(c) + COAST) return c;
  }
  return null;
}

/** Timetable seconds lost to a cut: running down and winding up again cost half a coast each, together one. */
const lost = (c: Cut) => c.end - c.start;
const catchUpSeconds = (c: Cut) => lost(c) / CATCH_UP;

/** Whether the lights are out at `epoch`. */
export function powerOut(epoch: number): Cut | null {
  const c = nearestCut(epoch);
  return c && epoch >= c.start && epoch < c.end ? c : null;
}

/**
 * The timetable clock at game time `epoch`: the same as `epoch` except around a cut, where it runs down to a
 * standstill, stands, winds up again and then runs a little fast until it has caught up.
 */
export function cutClock(epoch: number): number {
  const c = nearestCut(epoch);
  if (!c || epoch <= c.start) return epoch;
  const u = epoch - c.start;
  // Running down: the rate falls from 1 to 0 over COAST seconds.
  if (u < COAST) return c.start + u - (u * u) / (2 * COAST);
  const stood = c.start + COAST / 2;
  if (epoch < c.end) return stood;
  const w = epoch - c.end;
  // Winding up again, from 0 back to 1.
  if (w < COAST) return stood + (w * w) / (2 * COAST);
  // Then a little fast until the lag is gone.
  return epoch - Math.max(0, lost(c) - CATCH_UP * (w - COAST));
}

/** How fast the timetable clock runs at `epoch`, next to game time: 0 while standing, 1 normally. */
export function cutRate(epoch: number): number {
  const c = nearestCut(epoch);
  if (!c || epoch <= c.start) return 1;
  const u = epoch - c.start;
  if (u < COAST) return 1 - u / COAST;
  if (epoch < c.end) return 0;
  const w = epoch - c.end;
  if (w < COAST) return w / COAST;
  return cutClock(epoch) < epoch ? 1 + CATCH_UP : 1;
}
