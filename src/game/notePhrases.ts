import { LINES } from '../landing/lines';

/**
 * The notes on the staff room boards are put together from fixed parts, never typed: a greeting, or a phrase with a
 * word in its gap. Every note is one of these, so nothing crude, hateful or personal can go up however it is spelled,
 * and the relay (`server/ghosts.ts`, `worker/hub.ts`) takes only text that is one of them. A phrase says which words
 * fit its gap: a station never goes where it could be made to sound like a place to stay away from.
 * Runs on Cloudflare too, so nothing that imports three.js.
 */

export const GAP = '___';

export type Gap = 'thing' | 'station' | 'any';

export interface Phrase { text: string; gap?: Gap }

export const PHRASES: Phrase[] = [
  { text: 'Hej alla!' },
  { text: 'God morgon, pendlare!' },
  { text: 'God natt, tunnelbanan' },
  { text: 'Ha en fin dag!' },
  { text: 'Stå till höger, gå till vänster' },
  { text: 'Vi ses på perrongen' },
  { text: 'Blippa kortet!' },
  { text: 'Någon som sett Silverpilen?' },
  { text: 'Varför står rulltrappan still?' },
  { text: 'Kaffe och bulle hjälper' },
  { text: 'Tåget är försenat igen' },
  { text: 'Bästa spelet!' },
  { text: 'Glad midsommar!' },
  { text: 'God jul!' },
  { text: 'Gott nytt år!' },
  { text: 'Glad kanelbullens dag!' },
  { text: 'Hälsningar från ___', gap: 'station' },
  { text: 'Bästa stationen: ___', gap: 'station' },
  { text: 'Vi ses vid ___', gap: 'station' },
  { text: 'Byt vid ___', gap: 'station' },
  { text: 'Nästa: ___', gap: 'station' },
  { text: 'Jag saknar ___', gap: 'any' },
  { text: 'Jag älskar ___', gap: 'any' },
  { text: '___ var här', gap: 'thing' },
  { text: 'Akta dig för ___', gap: 'thing' },
  { text: 'Leta efter ___', gap: 'thing' },
  { text: 'Glöm inte ___', gap: 'thing' },
  { text: 'Tack för ___', gap: 'thing' },
  { text: 'Vem tog ___?', gap: 'thing' },
  { text: 'Snart kommer ___', gap: 'thing' },
];

/** Things in the game, as they read in the middle of a sentence. */
export const THINGS = [
  'blå linjen', 'röda linjen', 'gröna linjen', 'Silverpilen', 'Kymlinge', 'nattåget', 'förarhytten', 'stopptavlan',
  'personalgången', 'skyddsrummet', 'tidsmaskinen', 'spärren', 'rulltrappan', 'en sittplats', 'rusningen', 'föraren',
  'kontrollanterna', 'duvorna', 'råttan', 'saxofonisten', 'dragspelaren', 'kaffet', 'kanelbullarna', 'regnet',
  'julgranen', 'luciatåget', 'studenterna', 'sommaren',
];

/** Every station, once, in Swedish order. */
export const STATIONS = [...new Set(LINES.flatMap((line) => line.stations.map((s) => s.name)))].sort((a, b) => a.localeCompare(b, 'sv'));

/** The words that fit a phrase's gap, things before stations. */
export function wordsFor(phrase: Phrase): string[] {
  if (phrase.gap === 'thing') return THINGS;
  if (phrase.gap === 'station') return STATIONS;
  if (phrase.gap === 'any') return [...THINGS, ...STATIONS];
  return [];
}

/** A phrase with `word` in its gap, capitalised when the gap opens the note. */
export function composeNote(phrase: Phrase, word = ''): string {
  if (!phrase.gap) return phrase.text;
  const fill = phrase.text.startsWith(GAP) ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  return phrase.text.replace(GAP, fill);
}

const ALLOWED = new Set(PHRASES.flatMap((p) => (p.gap ? wordsFor(p).map((w) => composeNote(p, w)) : [p.text])));

/** The note if it is one the parts can make, else null. */
export function cleanNote(raw: unknown): string | null {
  return typeof raw === 'string' && ALLOWED.has(raw) ? raw : null;
}
