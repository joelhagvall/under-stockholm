import sv from './i18n/sv.json';
import { text } from './i18n/text';

/**
 * The art walk: a plaque on every platform about the station's art, in the
 * style of SL's guided art tours, read aloud when you stop to read it. The
 * plaque on the wall and the voice stay Swedish, the caption follows the
 * player's language. The stations you have read are saved, and the pause menu
 * keeps count.
 */

const KEY = 'under-stockholm:art-walk';
type Stations = typeof sv.art.stations;

const entry = (stations: Stations, station: string): [string, string] | null => {
  const found = (stations as Record<string, string[]>)[station];
  return found ? [found[0], found[1]] : null;
};

class ArtWalk {
  private readonly read = new Set<string>();
  total = 0;
  /** Set by the game: caption a plaque (in the player's language) and speak it (`spoken`, always Swedish). */
  onRead: ((title: string, body: string, progress: string, spoken: string) => void) | null = null;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      if (Array.isArray(saved)) for (const s of saved) this.read.add(String(s));
    } catch { /* A fresh walk. */ }
  }

  /** The plaque's title and text for a station, if it has one, in Swedish as on the wall. */
  plaque(station: string): [string, string] | null {
    return entry(sv.art.stations, station);
  }

  get count(): number {
    return this.read.size;
  }

  visit(station: string): string | void {
    const plaque = this.plaque(station);
    if (!plaque) return;
    const [title, body] = entry(text.art.stations, station) ?? plaque;
    const first = !this.read.has(station);
    this.read.add(station);
    try { localStorage.setItem(KEY, JSON.stringify([...this.read])); } catch { /* Session only. */ }
    const progress = this.read.size >= this.total && first ? text.art.done : text.art.progress.replace('{count}', String(this.read.size)).replace('{total}', String(this.total));
    this.onRead?.(title, body, progress, `${plaque[0]}. ${plaque[1]}`);
  }
}

export const artWalk = new ArtWalk();
