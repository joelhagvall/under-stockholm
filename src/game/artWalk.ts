import text from './i18n/sv.json';

/**
 * The art walk: a plaque on every platform about the station's art, in the
 * style of SL's guided art tours, read aloud when you stop to read it. The
 * stations you have read are saved, and the pause menu keeps count.
 */

const KEY = 'under-stockholm:art-walk';
type Stations = typeof text.art.stations;

class ArtWalk {
  private readonly read = new Set<string>();
  total = 0;
  /** Set by the game: speak and caption a plaque. */
  onRead: ((title: string, body: string, progress: string) => void) | null = null;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      if (Array.isArray(saved)) for (const s of saved) this.read.add(String(s));
    } catch { /* A fresh walk. */ }
  }

  /** The plaque's title and text for a station, if it has one. */
  plaque(station: string): [string, string] | null {
    const entry = (text.art.stations as Record<string, string[]>)[station as keyof Stations];
    return entry ? [entry[0], entry[1]] : null;
  }

  get count(): number {
    return this.read.size;
  }

  visit(station: string): string | void {
    const plaque = this.plaque(station);
    if (!plaque) return;
    const first = !this.read.has(station);
    this.read.add(station);
    try { localStorage.setItem(KEY, JSON.stringify([...this.read])); } catch { /* Session only. */ }
    const progress = this.read.size >= this.total && first ? text.art.done : text.art.progress.replace('{count}', String(this.read.size)).replace('{total}', String(this.total));
    this.onRead?.(plaque[0], plaque[1], progress);
  }
}

export const artWalk = new ArtWalk();
