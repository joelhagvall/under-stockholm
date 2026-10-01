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

const NEWER = 'under-stockholm:newer';

/** What the landing page was opening: the game (with `launch`'s arguments) or a view by name. */
export interface Opening {
  view?: string;
  showcase?: boolean;
  again?: boolean;
  station?: string;
  life?: boolean;
}

/**
 * Whether `err` is a chunk of an earlier build that is no longer there: a page left open across a deploy asks for
 * files the new one replaced. A missing physics binary can arrive as HTML or a 404's text, which fails WASM's
 * magic bytes instead of the module import. Other compile errors still go through the normal error report.
 */
export const staleBuild = (err: unknown): boolean =>
  /dynamically imported module|Importing a module script failed|Unable to preload CSS/.test(String(err)) ||
  /(?:WebAssembly|wasm).*?(?:expected magic word|failed to match magic number)/i.test(String(err));

/**
 * Loads the page again, from the current build, to open `what` once it is up. False, and nothing done, when it did so
 * within the last minute: the files are missing for some other reason, and the page says so instead.
 */
export function reloadForNewer(what: Opening): boolean {
  try {
    const last = JSON.parse(sessionStorage.getItem(NEWER) ?? 'null') as { at?: number } | null;
    if (last?.at && Date.now() - last.at < 60_000) return false;
    sessionStorage.setItem(NEWER, JSON.stringify({ at: Date.now(), what }));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

/** What the page was opening when it was loaded again for a newer build, once. */
export function reopening(): Opening | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(NEWER) ?? 'null') as { at: number; what?: Opening } | null;
    if (!saved?.what) return null;
    // The time stays, so a page that fails again within the minute does not go round.
    sessionStorage.setItem(NEWER, JSON.stringify({ at: saved.at }));
    return saved.what;
  } catch {
    return null;
  }
}
