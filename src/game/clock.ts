/**
 * Wall-clock helpers. Game time is Unix epoch seconds, so every visitor sees
 * the same trains at the same moment and the metro follows Stockholm's day.
 */

export const STOCKHOLM = { timeZone: 'Europe/Stockholm', lat: 59.33, lon: 18.07 };

export interface WallClock {
  year: number;
  /** 1..12 */
  month: number;
  day: number;
  /** 0 = Sunday .. 6 = Saturday */
  weekday: number;
  hour: number;
  minute: number;
  second: number;
  /** Hours since local midnight, with fractions. */
  hours: number;
}

let offsetFormat: Intl.DateTimeFormat | null = null;
const offsets = new Map<number, number>();

/** Stockholm's UTC offset in seconds at an instant, cached per hour. */
function offsetAt(epoch: number): number {
  const hour = Math.floor(epoch / 3600);
  const cached = offsets.get(hour);
  if (cached !== undefined) return cached;
  offsetFormat ??= new Intl.DateTimeFormat('en-US', {
    timeZone: STOCKHOLM.timeZone, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  });
  const parts: Record<string, number> = {};
  for (const p of offsetFormat.formatToParts(new Date(hour * 3600 * 1000))) if (p.type !== 'literal') parts[p.type] = Number(p.value);
  const local = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second) / 1000;
  const offset = local - hour * 3600;
  if (offsets.size > 64) offsets.clear();
  offsets.set(hour, offset);
  return offset;
}

export function stockholm(epoch: number): WallClock {
  const d = new Date((epoch + offsetAt(epoch)) * 1000);
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const second = d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay(),
    hour, minute, second: Math.floor(second), hours: hour + minute / 60 + second / 3600,
  };
}

/** Epoch seconds for a Stockholm local date and time. */
export function stockholmEpoch(year: number, month: number, day: number, hour: number, minute = 0, second = 0): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second) / 1000;
  // Two passes settle the offset, also across a daylight saving switch.
  let epoch = naive - offsetAt(naive);
  epoch = naive - offsetAt(epoch);
  return epoch;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatClock(epoch: number): string {
  const c = stockholm(epoch);
  return `${pad2(c.hour)}:${pad2(c.minute)}`;
}

/**
 * The metro rests between 01:00 and 05:00 on weekday nights. The nights
 * after Friday and Saturday have all-night service.
 */
export function serviceOpen(epoch: number): boolean {
  const c = stockholm(epoch);
  if (c.hour < 1 || c.hour >= 5) return true;
  return c.weekday === 6 || c.weekday === 0;
}

/**
 * SL's summer timetable, from midsummer to mid August: fewer trains, and a
 * half-empty city where tourists outnumber commuters.
 */
export function summerTimetable(epoch: number): boolean {
  const c = stockholm(epoch);
  return (c.month === 6 && c.day >= 23) || c.month === 7 || (c.month === 8 && c.day <= 16);
}

/** Busy periods, 0 (empty night) to 1 (rush hour). */
export function busyness(epoch: number): number {
  const c = stockholm(epoch);
  // Stockholm is on holiday in July: the rush hours all but vanish.
  if (c.month === 7) return busynessOf(c, epoch) * 0.6;
  return busynessOf(c, epoch);
}

function busynessOf(c: WallClock, epoch: number): number {
  const h = c.hours;
  const weekend = c.weekday === 0 || c.weekday === 6;
  const bump = (center: number, width: number) => Math.exp(-(((h - center) / width) ** 2));
  if (!serviceOpen(epoch)) return 0;
  const base = h >= 6 && h < 23 ? 0.35 : h >= 5 && h < 6 ? 0.15 : 0.1;
  const rush = weekend ? bump(14, 3.5) * 0.35 : Math.max(bump(7.9, 0.9), bump(16.9, 1.1));
  const nightlife = weekend && (h > 22 || h < 4) ? 0.3 : 0;
  return Math.min(1, base + rush * 0.65 + nightlife);
}

/** Approximate solar elevation over Stockholm, in degrees. */
export function sunElevation(epoch: number): number {
  const rad = Math.PI / 180;
  const d = epoch / 86400 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = ((gmst + STOCKHOLM.lon / 15) * 15) * rad - ra;
  const lat = STOCKHOLM.lat * rad;
  return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha)) / rad;
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

export function season(epoch: number): Season {
  const m = stockholm(epoch).month;
  if (m === 12 || m <= 2) return 'winter';
  if (m <= 5) return 'spring';
  if (m <= 8) return 'summer';
  return 'autumn';
}

/** Small deterministic hash in [0, 1), for schedules everyone must agree on. */
export function hash01(n: number, seed = 0): number {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed + 7, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
