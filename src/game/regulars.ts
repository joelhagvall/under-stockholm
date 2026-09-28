import { dayNumber } from './calendar';
import { hash01, stockholm, stockholmEpoch } from './clock';
import type { Back, Build, Carry } from './figures';

/**
 * The regulars: the same people in the same places every weekday. Each has a look, a station, a time and a track,
 * and takes the first train that comes after they reach the platform, so missing it means it really left. Their
 * weeks have texture: a sick day now and then, a few weeks off in the summer, a haircut every couple of months, a
 * cast for six weeks, and for one of them a bump that turns into a pram. All of it comes from the date and a seed,
 * the same for everyone. No three.js.
 */

export type Trait = 'walker' | 'guitar' | 'book' | 'briefcase' | 'coffee' | 'phone' | 'flowers' | 'hivis' | 'scrubs' | 'laptop' | 'student' | 'expecting';

export interface Regular {
  id: string;
  station: string;
  /** Weekday minutes after midnight when they reach the platform. */
  arrive: number;
  track: 1 | 2;
  /** Meters along the platform from its middle where they wait. */
  wait: number;
  build: Build;
  trait: Trait;
  coat: number;
  skin: number;
  hair: number;
  trousers: number;
  long?: boolean;
  skirt?: number;
  /** Hand-written, with a name in the discovery book; the others are generated, one per station. */
  named: boolean;
  /** Stations ridden before getting off. */
  ride: number;
}

const SKINS = [0xf1c9a5, 0xe8bd9b, 0xdba987, 0xc68c64, 0x946747, 0x634432, 0x4a3122];
const HAIRS = [0x1b1b1b, 0x2b2b2b, 0x382a25, 0x6b4a2e, 0x8a7052, 0xb8935a, 0xd9c27a, 0x8a8f94, 0xc9c9c9];
const COATS = [0x2b3a4a, 0x3d4a3a, 0x5a3440, 0x1f2a36, 0x6b5a45, 0x2e6e5e, 0x753e45, 0x44546a, 0x1b1d22, 0x8a6f4d];

/** The ones with a name, in the discovery book. */
export const NAMED: Regular[] = [
  { id: 'walker', station: 'Västra skogen', arrive: 7 * 60 + 42, track: 2, wait: -8, build: 'woman', trait: 'walker', coat: 0x6b5a45, skin: 0xe8bd9b, hair: 0xc9c9c9, trousers: 0x3a3d40, skirt: 0x44546a, named: true, ride: 3 },
  { id: 'guitar', station: 'Solna centrum', arrive: 8 * 60 + 5, track: 2, wait: 14, build: 'man', trait: 'guitar', coat: 0x1b1d22, skin: 0xdba987, hair: 0x382a25, trousers: 0x243049, named: true, ride: 4 },
  { id: 'book', station: 'Rådhuset', arrive: 7 * 60 + 55, track: 1, wait: -20, build: 'man', trait: 'book', coat: 0x2b3a4a, skin: 0xf1c9a5, hair: 0x8a8f94, trousers: 0x303a48, named: true, ride: 5 },
  { id: 'briefcase', station: 'Kungsträdgården', arrive: 16 * 60 + 40, track: 1, wait: 30, build: 'woman', trait: 'briefcase', coat: 0x1f2a36, skin: 0x946747, hair: 0x1b1b1b, trousers: 0x1f2a36, long: true, named: true, ride: 6 },
  { id: 'nurse', station: 'Skarpnäck', arrive: 6 * 60 + 52, track: 2, wait: 5, build: 'woman', trait: 'scrubs', coat: 0x6fa8c7, skin: 0xc68c64, hair: 0x2b2b2b, trousers: 0x6fa8c7, long: true, named: true, ride: 7 },
  { id: 'builder', station: 'Hässelby strand', arrive: 6 * 60 + 38, track: 1, wait: -30, build: 'man', trait: 'hivis', coat: 0x3a3d40, skin: 0xe8bd9b, hair: 0xb8935a, trousers: 0x243049, named: true, ride: 9 },
  { id: 'flowers', station: 'Gamla stan', arrive: 10 * 60 + 15, track: 1, wait: 0, build: 'man', trait: 'flowers', coat: 0x5a3440, skin: 0xf1c9a5, hair: 0xc9c9c9, trousers: 0x3a3d40, named: true, ride: 2 },
  { id: 'expecting', station: 'Fruängen', arrive: 8 * 60 + 12, track: 2, wait: 10, build: 'woman', trait: 'expecting', coat: 0x2e6e5e, skin: 0xdba987, hair: 0x8a7052, trousers: 0x303a48, long: true, named: true, ride: 5 },
  { id: 'laptop', station: 'Kista', arrive: 17 * 60 + 8, track: 2, wait: -12, build: 'man', trait: 'laptop', coat: 0x44546a, skin: 0x634432, hair: 0x1b1b1b, trousers: 0x1f2a36, named: true, ride: 6 },
  { id: 'student', station: 'Universitetet', arrive: 15 * 60 + 25, track: 2, wait: 22, build: 'woman', trait: 'student', coat: 0x753e45, skin: 0xf1c9a5, hair: 0xd9c27a, trousers: 0x243049, long: true, named: true, ride: 4 },
  { id: 'coffee', station: 'Odenplan', arrive: 7 * 60 + 28, track: 2, wait: -4, build: 'man', trait: 'coffee', coat: 0x8a6f4d, skin: 0xe8bd9b, hair: 0x6b4a2e, trousers: 0x303a48, named: true, ride: 3 },
  { id: 'phone', station: 'Liljeholmen', arrive: 8 * 60 + 40, track: 1, wait: 18, build: 'woman', trait: 'phone', coat: 0x3d4a3a, skin: 0x4a3122, hair: 0x1b1b1b, trousers: 0x1b1d22, long: true, named: true, ride: 4 },
];

const TRAITS: Trait[] = ['coffee', 'phone', 'book', 'briefcase', 'student', 'laptop', 'phone', 'coffee'];

/** One more per station, generated from its name: a morning or an afternoon commuter. */
export function generated(stations: string[]): Regular[] {
  const named = new Set(NAMED.map((r) => r.station));
  return stations.filter((s, i) => !named.has(s) && stations.indexOf(s) === i).map((station) => {
    const seed = [...station].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    const r = (n: number) => hash01(seed, 800 + n);
    const woman = r(1) < 0.5;
    const morning = r(2) < 0.7;
    return {
      id: `r${seed.toString(36)}`, station, named: false,
      arrive: Math.floor(morning ? 6.5 * 60 + r(3) * 150 : 15 * 60 + r(3) * 150),
      track: r(4) < 0.5 ? 1 : 2, wait: Math.round((r(5) - 0.5) * 70), build: woman ? 'woman' : 'man',
      trait: TRAITS[Math.floor(r(6) * TRAITS.length)], coat: COATS[Math.floor(r(7) * COATS.length)],
      skin: SKINS[Math.floor(r(8) * SKINS.length)], hair: HAIRS[Math.floor(r(9) * HAIRS.length)],
      trousers: [0x303a48, 0x243049, 0x1f2a36, 0x3a3d40][Math.floor(r(10) * 4)], long: woman && r(11) < 0.6,
      ride: 2 + Math.floor(r(12) * 6),
    } satisfies Regular;
  });
}

const seedOf = (r: Regular) => [...r.id].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 11);

export interface RegularDay {
  /** Here today at all. */
  present: boolean;
  why?: 'weekend' | 'sick' | 'holiday' | 'leave';
  /** Epoch seconds when they reach the platform today. */
  arrive: number;
  /** Changes every couple of months: a haircut. */
  haircut: number;
  /** An arm in a cast, six weeks a year. */
  cast: boolean;
  /** Expecting, then a pram: the one arc that runs over years. */
  expecting: boolean;
  pram: boolean;
}

/** Days in the arc of the one who is expecting: months of a bump, a few months' leave, then a year with a pram. */
const ARC = { bump: 150, leave: 90, pram: 365, rest: 480 };
const ARC_DAYS = ARC.bump + ARC.leave + ARC.pram + ARC.rest;

/** A regular's day, from the date. */
export function regularDay(r: Regular, epoch: number): RegularDay {
  const c = stockholm(epoch);
  const day = dayNumber(epoch);
  const seed = seedOf(r);
  const jitter = (hash01(day, seed % 997) - 0.5) * 150;
  const arrive = stockholmEpoch(c.year, c.month, c.day, 0) + r.arrive * 60 + jitter;
  const haircut = Math.floor((day + (seed % 50)) / 56);
  const year = c.year;
  // Six weeks in a cast, in some years.
  const castStart = Math.floor(hash01(year, seed % 887) * 330);
  const dayOfYear = Math.floor((Date.UTC(c.year, c.month - 1, c.day) - Date.UTC(c.year, 0, 1)) / 86400000);
  const cast = hash01(year, (seed % 883) + 1) < 0.35 && dayOfYear >= castStart && dayOfYear < castStart + 42;
  let expecting = false;
  let pram = false;
  let leave = false;
  if (r.trait === 'expecting') {
    const a = ((day + (seed % ARC_DAYS)) % ARC_DAYS + ARC_DAYS) % ARC_DAYS;
    expecting = a < ARC.bump;
    leave = a >= ARC.bump && a < ARC.bump + ARC.leave;
    pram = a >= ARC.bump + ARC.leave && a < ARC.bump + ARC.leave + ARC.pram;
  }
  const base = { arrive, haircut, cast, expecting, pram };
  if (c.weekday === 0 || c.weekday === 6) return { ...base, present: false, why: 'weekend' };
  // Three or four weeks off in the summer, starting some time in July.
  const holidayStart = Date.UTC(c.year, 6, 1 + Math.floor(hash01(year, seed % 877) * 21));
  const holidayEnd = holidayStart + (21 + Math.floor(hash01(year, (seed % 877) + 1) * 8)) * 86400000;
  const today = Date.UTC(c.year, c.month - 1, c.day);
  if (today >= holidayStart && today < holidayEnd) return { ...base, present: false, why: 'holiday' };
  if (leave) return { ...base, present: false, why: 'leave' };
  if (hash01(day, (seed % 991) + 3) < 0.04) return { ...base, present: false, why: 'sick' };
  return { ...base, present: true };
}

/** What the look carries for a trait. */
export function traitLook(t: Trait): { back: Back; carry?: Carry; torso?: number } {
  switch (t) {
    case 'guitar': return { back: 'guitar' };
    case 'book': return { back: 'none', carry: 'paper' };
    case 'briefcase': return { back: 'none', carry: 'briefcase' };
    case 'coffee': return { back: 'none', carry: 'coffee' };
    case 'phone': return { back: 'none', carry: 'phone' };
    case 'flowers': return { back: 'none', carry: 'flowers' };
    case 'hivis': return { back: 'backpack', torso: 0xf2c91d };
    case 'scrubs': return { back: 'none', carry: 'handbag' };
    case 'laptop': return { back: 'backpack' };
    case 'student': return { back: 'backpack', carry: 'phone' };
    case 'expecting': return { back: 'none', carry: 'handbag' };
    case 'walker': return { back: 'none' };
  }
}
