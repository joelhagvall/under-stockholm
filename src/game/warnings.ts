import type { Disruption } from './disruptions';
import text from './i18n/sv.json';
import { relayFeed } from './relay';

/**
 * SMHI's weather warnings for Stockholms län (open data, no key), read through the relay.
 * A yellow, orange or red warning is read out by the train speaker between
 * stations and shown on the boards, like SL's own traffic information, and
 * while one for rain, snow or thunder is in force most passengers come down
 * wet with umbrellas. Only warnings still in force, or starting within a few
 * hours, count; stale data shows nothing.
 * No three.js here: the relay imports it.
 */

/** SMHI's id for Stockholms län. */
export const STOCKHOLM_COUNTY = 1;
const POLL = 600;
/** Seconds without a successful poll before the warnings are dropped. */
const STALE = 60 * 60;
/** Warnings starting this soon are announced already. */
const AHEAD = 6 * 60 * 60;
/** Kept apart from SL's deviation case ids, which share the announcement keys. */
const ID_BASE = 1_000_000_000;

type Level = 'YELLOW' | 'ORANGE' | 'RED';
const LEVELS: Record<Level, number> = { YELLOW: 1, ORANGE: 2, RED: 3 };
/** Events that matter to someone taking the metro. Sea levels, water shortage and fire risk do not. */
const EVENTS = ['THUNDER', 'WIND', 'STRONG_COOLING', 'SNOW', 'BLACK_ICE', 'RAIN', 'HIGH_TEMPERATURES', 'FLOODING'] as const;
type WarningEvent = (typeof EVENTS)[number];
const WET: ReadonlySet<WarningEvent> = new Set(['THUNDER', 'SNOW', 'RAIN']);

export interface WeatherWarning {
  id: number;
  event: WarningEvent;
  level: Level;
  /** Epoch seconds. */
  start: number;
  end: number;
  header: string;
  summary: string;
}

interface ApiArea {
  id?: number;
  approximateStart?: string;
  approximateEnd?: string;
  warningLevel?: { code?: string };
  eventDescription?: { sv?: string };
  affectedAreas?: Array<{ id?: number }>;
}

interface ApiWarning {
  event?: { code?: string; sv?: string };
  warningAreas?: ApiArea[];
}

const inCounty = (a: ApiArea) => !!a.affectedAreas?.some((c) => c.id === STOCKHOLM_COUNTY);

/** SMHI's list cut down to the areas in Stockholms län and the fields read here, for the relay to pass on. */
export function forStockholm(body: unknown): Array<ApiWarning & { warningAreas: ApiArea[] }> {
  if (!Array.isArray(body)) return [];
  return (body as ApiWarning[])
    .map((w) => ({
      event: { code: w.event?.code, sv: w.event?.sv },
      warningAreas: (w.warningAreas ?? []).filter(inCounty).map((a) => ({
        id: a.id,
        approximateStart: a.approximateStart,
        approximateEnd: a.approximateEnd,
        warningLevel: { code: a.warningLevel?.code },
        eventDescription: { sv: a.eventDescription?.sv },
        affectedAreas: [{ id: STOCKHOLM_COUNTY }],
      })),
    }))
    .filter((w) => w.warningAreas.length);
}

/** Warnings for Stockholms län that matter at `now` (epoch seconds), most severe first. */
export function parseWarnings(body: unknown, now: number): WeatherWarning[] {
  const out: WeatherWarning[] = [];
  for (const w of forStockholm(body)) {
    const event = w.event?.code as WarningEvent;
    if (!EVENTS.includes(event)) continue;
    for (const a of w.warningAreas) {
      const level = a.warningLevel?.code as Level;
      if (!(level in LEVELS) || a.id === undefined) continue;
      const start = Date.parse(a.approximateStart ?? '') / 1000;
      const end = a.approximateEnd ? Date.parse(a.approximateEnd) / 1000 : Infinity;
      if (!Number.isFinite(start) || start > now + AHEAD || end <= now) continue;
      const what = (a.eventDescription?.sv ?? '').trim().toLowerCase() || text.warnings.events[event];
      out.push({
        id: a.id, event, level, start, end,
        header: text.warnings.header.replace('{level}', text.warnings.levels[level]).replace('{event}', what),
        summary: `${start > now ? text.warnings.later : text.warnings.now} ${text.warnings.advice[event]}`,
      });
    }
  }
  return out.sort((a, b) => LEVELS[b.level] - LEVELS[a.level] || a.start - b.start);
}

/** A warning as traffic information, for the boards and the train speaker. */
export const asNotice = (w: WeatherWarning): Disruption => ({ id: ID_BASE + w.id, header: w.header, summary: w.summary, stations: [], lines: [], weight: LEVELS[w.level] });

export class Warnings {
  private list: WeatherWarning[] = [];
  private lastOk = -Infinity;
  private wait = 0;

  /** @param forced debug: a made-up warning for one of SMHI's event codes (`?warning=SNOW`) */
  constructor(forced: string | null) {
    const event = forced?.toUpperCase() as WarningEvent;
    if (forced && EVENTS.includes(event)) {
      const header = text.warnings.header.replace('{level}', text.warnings.levels.YELLOW).replace('{event}', text.warnings.events[event]);
      this.list = [{ id: 0, event, level: 'YELLOW', start: 0, end: Infinity, header, summary: `${text.warnings.now} ${text.warnings.advice[event]}` }];
      this.lastOk = Infinity;
    } else void this.poll();
  }

  /** Warnings in force or coming soon, or none once the data has gone stale. */
  get active(): WeatherWarning[] {
    const now = Date.now() / 1000;
    return now - this.lastOk < STALE ? this.list.filter((w) => w.end > now) : [];
  }

  get notices(): Disruption[] {
    return this.active.map(asNotice);
  }

  /** Rain, snow or thunder bad enough for a warning, right now. */
  get wet(): boolean {
    const now = Date.now() / 1000;
    return this.active.some((w) => WET.has(w.event) && w.start <= now);
  }

  update(dt: number): void {
    this.wait += dt;
    if (this.wait >= POLL && this.lastOk !== Infinity) { this.wait = 0; void this.poll(); }
  }

  private async poll(): Promise<void> {
    try {
      // Only through the relay, so SMHI sees one poll however many play. Without one there are no warnings.
      const cached = await relayFeed<unknown>('warnings');
      if (!cached) return;
      this.list = parseWarnings(cached.data, Date.now() / 1000);
      this.lastOk = cached.at;
    } catch {
      // Keep the last warnings until they go stale.
    }
  }
}
