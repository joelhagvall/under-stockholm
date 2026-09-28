import { hash01, stockholm, type WallClock } from './clock';

/**
 * Days and occasions. Everything here is a pure function of the clock, so
 * every visitor sees the same broken escalator, the same Friday bags and the
 * same cinnamon bun day.
 */

/** Stockholm calendar day as a whole number (days since 1970-01-01, local). */
export function dayNumber(epoch: number): number {
  const c = stockholm(epoch);
  return Math.floor(Date.UTC(c.year, c.month - 1, c.day) / 86400000);
}

export type Occasion = 'buns' | 'crayfish' | 'friday' | 'sunday' | 'party' | 'graduation' | 'lucia' | null;

/** What the passengers carry and wear today, beyond the season. */
export function occasion(epoch: number): Occasion {
  const c = stockholm(epoch);
  if (c.month === 12 && c.day === 13 && c.hours >= 6 && c.hours < 21) return 'lucia';
  if (c.month === 10 && c.day === 4 && c.hours >= 7) return 'buns';
  if (c.month === 8 && (c.hours >= 19 || c.hours < 2)) return 'crayfish';
  // Early June: students in white caps, fresh out of school, all afternoon.
  if (c.month === 6 && c.day <= 14 && c.weekday >= 1 && c.weekday <= 5 && c.hours >= 11 && c.hours < 19) return 'graduation';
  if (c.weekday === 5 && c.hours >= 14 && c.hours < 21) return 'friday';
  if (weekendNight(c)) return 'party';
  if (c.weekday === 0 && c.hours >= 6.5 && c.hours < 11) return 'sunday';
  return null;
}

/** Friday and Saturday nights, from ten until four: on the way home from the pub. */
function weekendNight(c: WallClock): boolean {
  if ((c.weekday === 5 || c.weekday === 6) && c.hours >= 22) return true;
  return (c.weekday === 6 || c.weekday === 0) && c.hours < 4;
}

export interface Holiday {
  /** A Christmas tree in the ticket halls and a paper star in the booth, all through advent and Christmas. */
  tree: boolean;
  /** A midsummer wreath on the booth, all through June. */
  wreath: boolean;
  /** Fireworks up on the street, heard down the stairs: 0 (none) to 1 (midnight on New Year's Eve). */
  fireworks: number;
}

export function holiday(epoch: number): Holiday {
  const c = stockholm(epoch);
  const tree = (c.month === 12 && c.day >= 1) || (c.month === 1 && c.day <= 13);
  let fireworks = 0;
  // Minutes from midnight on New Year's Eve.
  const m = c.month === 12 && c.day === 31 ? (c.hours - 24) * 60 : c.month === 1 && c.day === 1 ? c.hours * 60 : Infinity;
  if (m > -6 * 60 && m < 120) fireworks = m < -10 ? 0.15 + 0.2 * (1 + m / 360) : m < 25 ? 1 : Math.max(0.1, 1 - (m - 25) / 100);
  return { tree, wreath: c.month === 6, fireworks };
}

/** Stuffy carriages and open windows in July. */
export function summerHeat(c: WallClock): boolean {
  return c.month === 7;
}

/** Share of days a station's down escalator stands still. */
const OUT_OF_ORDER = 0.14;

/** Whether a station's down escalator is out of order on the day of `epoch`. */
export function escalatorOutOfOrder(epoch: number, station: number): boolean {
  return hash01(dayNumber(epoch) * 7919 + station * 104729, 300) < OUT_OF_ORDER;
}

/** The station whose up escalator squeaks, changing each week. */
export function squeakyEscalator(epoch: number, stations: number): number {
  return Math.floor(hash01(Math.floor(dayNumber(epoch) / 7), 41) * stations);
}

/** Which fluorescent tube in a station flickers. It is always the same one. */
export function brokenTube(station: number, tubes: number): number {
  return Math.floor(hash01(station, 77) * tubes);
}

/** Cold enough outside for breath, mist and sparks. */
export const isCold = (temperature: number) => temperature < 2;
