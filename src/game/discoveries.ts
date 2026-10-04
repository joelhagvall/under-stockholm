import sv from './i18n/sv.json';
import en from './i18n/en.json';

/**
 * The discovery book: every hidden moment in the game, collected. Almost
 * everything that happens down here is told in a caption, so an entry names
 * the texts in `sv.json` that give it away, and seeing one of them on screen,
 * in Swedish or in its English override (`en.json`), counts as finding it.
 * What you have not found yet shows as a hint, so the book tells a new player
 * how much there is. Saved in the browser.
 */

const KEY = 'under-stockholm:discoveries';

export type Group = 'platform' | 'hall' | 'aboard' | 'depths' | 'mystery' | 'regulars' | 'modes';

export interface Discovery {
  id: string;
  group: Group;
  /** Paths into `sv.json` whose text marks the discovery. A path to an array or object covers everything in it. */
  texts: string[];
}

export const DISCOVERIES: Discovery[] = [
  { id: 'rat', group: 'platform', texts: ['critters.rat'] },
  { id: 'farewell', group: 'platform', texts: ['platform.farewell'] },
  { id: 'runner', group: 'platform', texts: ['platform.madeIt', 'platform.missed'] },
  { id: 'call', group: 'platform', texts: ['platform.call'] },
  { id: 'collector', group: 'platform', texts: ['platform.collector'] },
  { id: 'lost', group: 'platform', texts: ['lost.taken'] },
  { id: 'phone', group: 'platform', texts: ['lost.phoneAnswer'] },
  { id: 'express', group: 'platform', texts: ['express.caption'] },
  { id: 'lucia', group: 'platform', texts: ['festive.lucia'] },
  { id: 'shoe', group: 'platform', texts: ['festive.shoe'] },

  { id: 'pigeons', group: 'hall', texts: ['critters.pigeons'] },
  { id: 'preacher', group: 'hall', texts: ['preacher.spotted', 'preacher.caught', 'preacher.leaflet'] },
  { id: 'sax', group: 'hall', texts: ['sax.thanks'] },
  { id: 'busker', group: 'hall', texts: ['busker.thanks'] },
  { id: 'kiosk', group: 'hall', texts: ['kiosk.bought', 'kiosk.bought1975'] },
  { id: 'vendor', group: 'hall', texts: ['ambience.vendorBought', 'ambience.vendorBroke'] },
  { id: 'attendant', group: 'hall', texts: ['ambience.attendantNod'] },
  { id: 'tourists', group: 'hall', texts: ['ambience.tourist'] },
  { id: 'escalator', group: 'hall', texts: ['escalator.rule'] },
  { id: 'dodged', group: 'hall', texts: ['fares.dodged'] },

  { id: 'inspectors', group: 'aboard', texts: ['fares.boarded', 'fares.checkAsk'] },
  { id: 'fined', group: 'aboard', texts: ['fares.fined'] },
  { id: 'school', group: 'aboard', texts: ['carriage.school'] },
  { id: 'seat', group: 'aboard', texts: ['carriage.seatRuleFull'] },
  { id: 'brake', group: 'aboard', texts: ['brake.pulled'] },
  { id: 'students', group: 'aboard', texts: ['festive.students'] },
  { id: 'party', group: 'aboard', texts: ['festive.party'] },
  { id: 'prosit', group: 'aboard', texts: ['ambience.prosit'] },
  { id: 'music', group: 'aboard', texts: ['ambience.phoneMusic'] },
  { id: 'depot', group: 'aboard', texts: ['clock.depot'] },

  { id: 'trackWork', group: 'depths', texts: ['trackWork.seen'] },
  { id: 'escape', group: 'depths', texts: ['escape.locked'] },
  { id: 'staffCoffee', group: 'depths', texts: ['service.coffee'] },
  { id: 'shelter', group: 'depths', texts: ['service.crank'] },
  { id: 'key', group: 'depths', texts: ['key.taken'] },
  { id: 'alarm', group: 'depths', texts: ['key.alarm'] },
  { id: 'note', group: 'depths', texts: ['notes.posted', 'notes.local'] },
  { id: 'transfer', group: 'depths', texts: ['transfer.arrived'] },
  { id: 'lift', group: 'depths', texts: ['rush.liftComing'] },
  { id: 'rush', group: 'depths', texts: ['rush.finish'] },
  { id: 'guards', group: 'depths', texts: ['rush.guards'] },

  { id: 'silverpilen', group: 'mystery', texts: ['silverpilen.sighted', 'silverpilen.standing'] },
  { id: 'through', group: 'mystery', texts: ['silverpilen.through'] },
  { id: 'clipping', group: 'mystery', texts: ['mystery.clues.clipping'] },
  { id: 'kymlinge', group: 'mystery', texts: ['kymlinge.name', 'kymlinge.sign', 'kymlinge.clock', 'kymlinge.phone'] },
  { id: 'lastPage', group: 'mystery', texts: ['mystery.clues.lastPage'] },
  { id: 'loop', group: 'mystery', texts: ['loop.wake'] },
  { id: 'powerCut', group: 'mystery', texts: ['power.out'] },

  { id: 'regular-walker', group: 'regulars', texts: ['regulars.people.walker'] },
  { id: 'regular-guitar', group: 'regulars', texts: ['regulars.people.guitar'] },
  { id: 'regular-book', group: 'regulars', texts: ['regulars.people.book'] },
  { id: 'regular-briefcase', group: 'regulars', texts: ['regulars.people.briefcase'] },
  { id: 'regular-nurse', group: 'regulars', texts: ['regulars.people.nurse'] },
  { id: 'regular-builder', group: 'regulars', texts: ['regulars.people.builder'] },
  { id: 'regular-flowers', group: 'regulars', texts: ['regulars.people.flowers'] },
  { id: 'regular-expecting', group: 'regulars', texts: ['regulars.people.expecting'] },
  { id: 'regular-laptop', group: 'regulars', texts: ['regulars.people.laptop'] },
  { id: 'regular-student', group: 'regulars', texts: ['regulars.people.student'] },
  { id: 'regular-coffee', group: 'regulars', texts: ['regulars.people.coffee'] },
  { id: 'regular-phone', group: 'regulars', texts: ['regulars.people.phone'] },
  { id: 'recognized', group: 'regulars', texts: ['regulars.nod'] },

  { id: 'art', group: 'modes', texts: ['art.stations'] },
  { id: 'artDone', group: 'modes', texts: ['art.done'] },
  { id: 'perfect', group: 'modes', texts: ['driver.perfect'] },
  { id: 'era', group: 'modes', texts: ['era.to1975'] },
];

export const GROUPS: Group[] = ['platform', 'hall', 'aboard', 'depths', 'mystery', 'regulars', 'modes'];

/** Shorter texts only count as the whole caption; longer ones also inside a longer message. */
const WHOLE_ONLY = 24;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function lookup(path: string, root: unknown = sv): Json | undefined {
  let node: Json | undefined = root as Json;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return undefined;
    node = node[part];
  }
  return node;
}

function strings(node: Json | undefined): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(strings);
  if (node && typeof node === 'object') return Object.values(node).flatMap(strings);
  return [];
}

interface Matcher {
  id: string;
  exact?: string;
  pattern?: RegExp;
}

function matchers(): Matcher[] {
  const out: Matcher[] = [];
  for (const d of DISCOVERIES) {
    for (const path of d.texts) {
      const found = strings(lookup(path));
      if (!found.length) throw new Error(`Discovery ${d.id}: no text at ${path}`);
      for (const s of new Set([...found, ...strings(lookup(path, en))])) {
        if (!/\{\w+\}/.test(s)) { out.push({ id: d.id, exact: s }); continue; }
        // A template: the filled-in parts can be anything.
        const source = s.split(/\{\w+\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+?');
        out.push({ id: d.id, pattern: new RegExp(source) });
      }
    }
  }
  return out;
}

const MATCHERS = matchers();

/** The ids of the discoveries a message on screen gives away. */
export function discoveriesIn(message: string, list = MATCHERS): string[] {
  const ids = new Set<string>();
  for (const m of list) {
    if (m.exact !== undefined ? message === m.exact || (m.exact.length >= WHOLE_ONLY && message.includes(m.exact)) : m.pattern!.test(message)) ids.add(m.id);
  }
  return [...ids];
}

export class DiscoveryBook {
  private readonly found: Set<string>;
  /** Called once for each new discovery. */
  onFind: ((id: string) => void) | null = null;

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()) {
    let saved: unknown = [];
    try { saved = JSON.parse(storage?.getItem(KEY) ?? '[]'); } catch { /* A fresh book. */ }
    const known = new Set(DISCOVERIES.map((d) => d.id));
    this.found = new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string' && known.has(id)) : []);
  }

  /** Looks at a caption or notice as it is shown. */
  see(message: string): void {
    if (!message) return;
    for (const id of discoveriesIn(message)) this.mark(id);
  }

  mark(id: string): void {
    if (this.found.has(id) || !DISCOVERIES.some((d) => d.id === id)) return;
    this.found.add(id);
    try { this.storage?.setItem(KEY, JSON.stringify([...this.found])); } catch { /* Session only. */ }
    this.onFind?.(id);
  }

  has(id: string): boolean {
    return this.found.has(id);
  }

  get count(): number {
    return this.found.size;
  }

  get total(): number {
    return DISCOVERIES.length;
  }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
