/**
 * The moderation for shared notes, used by the relay (`server/ghosts.ts`)
 * and by the game before it sends anything. Notes are short, plain words:
 * no links, no addresses, no phone numbers, nothing hateful or crude.
 */

export const NOTE_MAX = 80;

/** Word starts that are never allowed, Swedish and English. */
const BLOCKED = [
  'fitta', 'kuk', 'hora', 'horor', 'jävla', 'javla', 'helvete', 'knull', 'fan ', 'fuck', 'shit', 'cunt', 'bitch', 'whore', 'dick ', 'cock ', 'pussy',
  'neger', 'nigg', 'blatte', 'svartskalle', 'zigenare', 'bög', 'fag ', 'faggot', 'retard', 'mongo', 'nazi', 'hitler', 'heil', 'kill ', 'döda', 'dö ',
  'porr', 'porn', 'sex ', 'naken', 'nude', 'rape', 'våldt', 'bomb', 'skjut', 'terror',
];

/** A cleaned note, or null if it may not go up. */
export function cleanNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < 2 || text.length > NOTE_MAX) return null;
  const lower = ` ${text.toLowerCase()} `;
  if (/https?:|www\.|\.(se|com|nu|net|org|io)\b|@/.test(lower)) return null;
  if (/\d[\d\s-]{5,}\d/.test(lower)) return null;
  // Only letters, digits, spaces and ordinary punctuation.
  if (!/^[\p{L}\p{N}\s.,!?:;'"()\-–…/&+%*♥❤]+$/u.test(text)) return null;
  const words = lower.split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
  if (BLOCKED.some((b) => (b.endsWith(' ') ? words.includes(b.trim()) : words.some((w) => w.startsWith(b))))) return null;
  return text;
}
