/**
 * The time machine: the year the metro looks like. In 1975 the trains are
 * the old green ones, the departure boards are split-flap displays, the
 * posters and the clothes are of their time and nobody has a phone. The
 * clock and the timetable stay the same. Saved in the browser.
 */

export type Era = 'now' | '1975';

const KEY = 'under-stockholm:era';
let current: Era = 'now';
try { if (localStorage.getItem(KEY) === '1975') current = '1975'; } catch { /* The present. */ }
const listeners: Array<(era: Era) => void> = [];

export const era = {
  get: (): Era => current,
  /** Back in 1975. */
  get past(): boolean {
    return current === '1975';
  },
  /** @param save false for a visit that should not be remembered (the showcase) */
  set(next: Era, save = true): void {
    if (next === current) return;
    current = next;
    if (save) try { localStorage.setItem(KEY, next); } catch { /* Session only. */ }
    for (const l of listeners) l(next);
  },
  on(listener: (era: Era) => void): void {
    listeners.push(listener);
  },
};
