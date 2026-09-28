import { relayFeed } from './relay';

/**
 * Real traffic information for the blue line from SL's deviations API (no
 * key), read through the relay: closed lifts, extra departures, signal faults. The boards
 * show the headers and the train speaker reads them out. Messages are only
 * trusted while polls keep succeeding; stale data shows nothing, so the game
 * never announces a fault that SL has already cleared.
 */

const POLL = 120;
/** Seconds without a successful poll before the messages are dropped. */
const STALE = 15 * 60;

export interface Disruption {
  id: number;
  header: string;
  /** First sentence of the details, for the speaker. */
  summary: string;
  /** Station names the message is about (empty for the whole line). */
  stations: string[];
  /** Higher is more important. */
  weight: number;
  /** A broken escalator or lift at the stations named, rather than a traffic problem. */
  facility?: 'escalator' | 'lift';
}

interface ApiMessage {
  deviation_case_id?: number;
  publish?: { from?: string; upto?: string };
  priority?: { importance_level?: number; influence_level?: number };
  message_variants?: Array<{ header?: string; details?: string; language?: string }>;
  scope?: { stop_areas?: Array<{ name?: string }> };
  categories?: Array<{ group?: string; type?: string }>;
}

/** Whether a message is about a broken escalator or lift, from its category or its wording. */
export function facilityOf(m: { categories?: Array<{ group?: string; type?: string }> }, text: string): 'escalator' | 'lift' | undefined {
  const type = m.categories?.find((c) => c.group === 'FACILITY')?.type?.toUpperCase();
  if (type === 'ESCALATOR' || /rulltrapp/i.test(text)) return 'escalator';
  if (type === 'LIFT' || type === 'ELEVATOR' || /\bhiss/i.test(text)) return 'lift';
  return undefined;
}

/** The first sentence, with line breaks flattened and the length capped for speech. */
export function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const end = flat.search(/[.!?](\s|$)/);
  const sentence = end < 0 ? flat : flat.slice(0, end + 1);
  return sentence.length > 220 ? `${sentence.slice(0, sentence.lastIndexOf(' ', 217))} …` : sentence;
}

/** Messages published at `now` (epoch seconds) that have a Swedish text, most important first. */
export function parseDisruptions(body: unknown, now: number): Disruption[] {
  if (!Array.isArray(body)) return [];
  const out: Disruption[] = [];
  for (const m of body as ApiMessage[]) {
    const from = Date.parse(m.publish?.from ?? '') / 1000;
    const upto = Date.parse(m.publish?.upto ?? '') / 1000;
    if (from > now || upto < now) continue;
    const sv = m.message_variants?.find((v) => v.language === 'sv');
    const header = sv?.header?.trim();
    if (!sv || !header || m.deviation_case_id === undefined) continue;
    out.push({
      id: m.deviation_case_id,
      header,
      summary: firstSentence(sv.details ?? ''),
      stations: (m.scope?.stop_areas ?? []).map((a) => a.name ?? '').filter(Boolean),
      weight: (m.priority?.importance_level ?? 0) * 10 + (m.priority?.influence_level ?? 0),
      facility: facilityOf(m, `${header} ${sv.details ?? ''}`),
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

/** Messages for one station's board: its own first, then the rest of the line. */
export function forStation(list: Disruption[], station: string): Disruption[] {
  return [...list.filter((d) => d.stations.includes(station)), ...list.filter((d) => !d.stations.includes(station))];
}

export class Disruptions {
  private list: Disruption[] = [];
  private lastOk = -Infinity;
  private wait = 0;

  /** @param forced debug: one made-up message instead of SL's (`?disruption=...`) */
  constructor(private readonly forced: string | null) {
    if (forced) this.list = [{ id: 0, header: forced, summary: '', stations: [], weight: 99 }];
    else void this.poll();
  }

  /** Current messages, or none once the data has gone stale. */
  get active(): Disruption[] {
    return this.forced || Date.now() / 1000 - this.lastOk < STALE ? this.list : [];
  }

  /** Traffic messages for the train speaker: not the ones about escalators and lifts. */
  get traffic(): Disruption[] {
    return this.active.filter((d) => !d.facility);
  }

  /** Whether SL reports an escalator out of order at a station right now. */
  escalatorOut(station: string): boolean {
    return this.active.some((d) => d.facility === 'escalator' && d.stations.includes(station));
  }

  update(dt: number): void {
    if (this.forced) return;
    this.wait += dt;
    if (this.wait >= POLL) { this.wait = 0; void this.poll(); }
  }

  private async poll(): Promise<void> {
    try {
      // Only through the relay, so SL sees one poll however many play. Without one there is no traffic information.
      const cached = await relayFeed<unknown>('deviations');
      if (!cached) return;
      this.list = parseDisruptions(cached.data, Date.now() / 1000);
      this.lastOk = cached.at;
    } catch {
      // Keep the last messages until they go stale.
    }
  }
}
