import sv from './i18n/sv.json';
import { text } from './i18n/text';

/**
 * The Silverpilen mystery: clues scattered through the staff spaces that
 * lead on to Kymlinge. An old newspaper clipping in the staff room at
 * T-Centralen, a driver's logbook in the shelter under Rådhuset, words
 * scratched into the wall of the service corridor at Kungsträdgården, the
 * stopped clock at Kymlinge, and the logbook's last page, locked in a cabinet
 * there. What you have found is kept in the browser.
 */

export type Clue = keyof typeof sv.mystery.clues;
const KEY = 'under-stockholm:clues';
export const CLUES = Object.keys(sv.mystery.clues) as Clue[];

class Mystery {
  private readonly found = new Set<Clue>();
  /** Set by the game: show a clue as it is found. */
  onFind: ((title: string, body: string, first: boolean) => void) | null = null;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      if (Array.isArray(saved)) for (const c of saved) if (CLUES.includes(c)) this.found.add(c);
    } catch { /* A fresh case. */ }
  }

  has(clue: Clue): boolean {
    return this.found.has(clue);
  }

  get count(): number {
    return this.found.size;
  }

  /** Reads a clue: shows it in the player's language, notes it down, and returns nothing (the notice says it all). */
  read(clue: Clue): void {
    const first = !this.found.has(clue);
    this.found.add(clue);
    try { localStorage.setItem(KEY, JSON.stringify([...this.found])); } catch { /* Session only. */ }
    const [title, body] = text.mystery.clues[clue];
    this.onFind?.(title, body, first);
  }
}

export const mystery = new Mystery();
