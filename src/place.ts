/**
 * Where the player last stood, so the landing page can offer to continue there. The world is a pure function of
 * time, so only the player needs saving. Kept free of the game's modules, like `lang.ts`, for the landing page.
 */
export interface Place {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** The nearest station's name, for the landing page's button. */
  station: string;
  /** When it was saved, in Unix milliseconds. */
  at: number;
}

const KEY = 'under-stockholm:place';
/** An old place is forgotten: after a month the normal start is the better welcome. */
const KEEP = 30 * 24 * 3600 * 1000;

export function savedPlace(): Place | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Place | null;
    if (!p || ![p.x, p.y, p.z, p.yaw, p.at].every(Number.isFinite) || typeof p.station !== 'string') return null;
    return Date.now() - p.at < KEEP ? p : null;
  } catch {
    return null;
  }
}

export function savePlace(place: Place): void {
  try { localStorage.setItem(KEY, JSON.stringify(place)); } catch { /* Session only. */ }
}

const AGAIN = 'under-stockholm:again';

/** Asks the next load of the page to go straight back down, to the saved place (after a lost WebGL context). */
export function comeBack(): void {
  try { sessionStorage.setItem(AGAIN, '1'); } catch { /* Then the landing page offers it. */ }
}

/** Whether the page was asked to go straight back down, once. */
export function comingBack(): boolean {
  try {
    const again = sessionStorage.getItem(AGAIN) !== null;
    sessionStorage.removeItem(AGAIN);
    return again;
  } catch {
    return false;
  }
}
