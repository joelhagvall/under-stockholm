/**
 * Real headlines for the newspapers in the game, from P4 Stockholm's open
 * Atom feed at Sveriges Radio, read through the relay like every live feed
 * (`relay.ts`, `server/feeds.ts`), so SR is asked twice an hour however many
 * play. Like a printed morning paper, today's edition carries yesterday's
 * news: the feed covers about two days, so yesterday's stories stay in it all
 * day and every visitor gets the same front page. Only calm headlines make it
 * to print: anything about crime, death, violence or disaster is dropped.
 * Without a relay, the papers keep their made-up headlines.
 * No three.js here: the relay imports it.
 */

import { dayNumber } from './calendar';
import { hash01 } from './clock';
import { relayFeed } from './relay';

export interface Story {
  title: string;
  /** Epoch seconds. */
  published: number;
}

/** Heavy topics, matched anywhere in a word so compounds like "mordbrand" and "Polisutredning" are caught too. */
const HEAVY_PARTS = [
  'mord', 'död', 'våld', 'grip', 'misstänk', 'åtal', 'brott', 'polis', 'attack', 'terror', 'bomb', 'spräng',
  'explosion', 'skjut', 'skott', 'kniv', 'misshandel', 'olyck', 'omkom', 'skadad', 'skadade', 'krig', 'fängelse',
  'häkta', 'dömd', 'döms', 'fusk', 'brand', 'hotad', 'hotade', 'hotades', 'kris', 'ebola', 'pandemi', 'epidemi',
  'narkotika', 'kriminal', 'gäng', 'offer', 'larm', 'svält', 'katastrof',
];

/** Short stems that only count at the start of a word ("rån" but not "från"). */
const HEAVY_WORDS = ['eld', 'hot', 'rån', 'sex', 'dör', 'dött', 'dog', 'slåss', 'slog', 'frias', 'friad', 'revs'];

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Entries of an Atom feed, in feed order. The feed's own title is skipped. */
export function parseHeadlines(xml: string): Story[] {
  const stories: Story[] = [];
  for (const [, entry] of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/.exec(entry);
    const published = Date.parse(/<published>([^<]*)<\/published>/.exec(entry)?.[1] ?? '') / 1000;
    if (title && Number.isFinite(published)) stories.push({ title: decode(title[1]).replace(/\s+/g, ' ').trim(), published });
  }
  return stories;
}

/** Whether a headline is light enough for the paper on the seat. */
export function isCalm(headline: string): boolean {
  if (headline.length < 12 || headline.length > 70) return false;
  // Live blog recaps ("Detta har hänt: ...") are not headlines.
  if (/^detta har hänt/i.test(headline)) return false;
  const words = headline.toLowerCase().split(/[^\p{L}\d]+/u).filter(Boolean);
  return !words.some((word) => HEAVY_PARTS.some((part) => word.includes(part)) || HEAVY_WORDS.some((stem) => word.startsWith(stem)));
}

/**
 * The calm headlines for the edition of Stockholm day `day`: those published
 * the day before. If yesterday is missing from the feed, anything older than
 * today; failing that, whatever is calm.
 */
export function edition(stories: Story[], day: number): string[] {
  const calm = stories.filter((s) => isCalm(s.title));
  const yesterday = calm.filter((s) => dayNumber(s.published) === day - 1);
  const older = calm.filter((s) => dayNumber(s.published) < day);
  const chosen = yesterday.length ? yesterday : older.length ? older : calm;
  return [...new Set(chosen.map((s) => s.title))];
}

/** FNV-1a, for ranking headlines by their own text. */
function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h;
}

/**
 * One paper's headline. Each headline gets a score from its own text and the
 * day, and paper `k` takes the k-th best, so the choice only changes if that
 * very headline leaves the feed, not when others come and go.
 */
export function pickHeadline(news: string[], day: number, paper: number): string {
  const ranked = [...news].sort((a, b) => hash01(hashText(a), day) - hash01(hashText(b), day));
  return ranked[paper % ranked.length];
}

let today: { day: number; load: Promise<string[] | null> } | null = null;

/** The day's edition, fetched once per Stockholm day and shared by every newspaper in the game. */
export function headlinesFor(day: number): Promise<string[] | null> {
  if (today?.day !== day) today = { day, load: fetchHeadlines(day) };
  return today.load;
}

/** The edition for `day`, or null if there is no relay, it has no copy, or nothing is calm. */
export async function fetchHeadlines(day: number): Promise<string[] | null> {
  const cached = await relayFeed<Story[]>('news');
  if (!cached) return null;
  const news = edition(cached.data, day);
  return news.length ? news : null;
}
