import type { Group, Mesh, MeshBasicMaterial } from 'three';
import { rgb } from '../gfx/color';
import type { Physics } from '../physics';
import { Section } from './section';
import { streetFrame, type StreetAt } from './street';
import { streetOrigin, streetOsmSteps, type StreetFile } from './streetOsm';

const OPEN_AMBIENT = rgb(0x4a4a4a);

/** Where each street file is served, by key: Vite fills the list in at build time (a static list, not a build's). */
let URLS: Record<string, string> | null = null;
function fileUrls(): Record<string, string> {
  if (URLS) return URLS;
  let found: Record<string, string> = {};
  // Under Bun (the tests) there is no Vite to fill it in, and no street files.
  try {
    found = import.meta.glob<string>('./osm/streets/*.json', { query: '?url', import: 'default', eager: true });
  } catch { /* No files. */ }
  URLS = Object.fromEntries(Object.entries(found).map(([path, url]) => [path.replace(/^.*\//, '').replace(/\.json$/, ''), url]));
  return URLS;
}

/** Is there a street file for `key` (see `osmKey.ts`)? Its street is then laid out for the real city round it. */
export function hasStreetFile(key: string): boolean {
  return key in fileUrls();
}

/**
 * The real city round each street, built when the player comes near (a lazy build in `World`): each street's file
 * fetched the first time it is wanted, used for one build and let go, and fetched again (from the browser's cache)
 * when the street is built again.
 */
export class StreetLayers {
  /** Each street's file: here, on the way (null), or none to be had (false). */
  private readonly files = new Map<string, StreetFile | null | false>();

  constructor(private readonly physics: Physics) {}

  /** Is the street's file here (or none to be had)? Starts fetching it if not. */
  ready(key: string): boolean {
    const known = this.files.get(key);
    if (known !== undefined) return known !== null;
    const url = fileUrls()[key];
    if (!url) {
      this.files.set(key, false);
      return true;
    }
    this.files.set(key, null);
    // Offline or refused: the square stands on its own, rather than a build that never comes.
    fetch(url).then((r) => (r.ok ? r.json() : false)).catch(() => false).then((f: StreetFile | false) => this.files.set(key, f));
    return false;
  }

  /**
   * Builds the city round the street at `at` (the station's middle at `cx`), from its file, and lets the file go.
   * The lit windows fade in with the square's own (`windowsOf`). Null without a file.
   */
  *build(key: string, cx: number, at: StreetAt, seed: number, windowsOf: () => Mesh | null, rank = 0): Generator<void, { group: Group; release(): void } | null> {
    const file = this.files.get(key);
    this.files.delete(key);
    if (!file) return null;
    const f = streetFrame(at);
    const { ox, oz, turn } = streetOrigin(file, cx, f, rank);
    yield;
    const s = new Section(`street-osm-${key}`, OPEN_AMBIENT, false, true);
    // In the open, walls a little wider than the same houses along the tracks below, which stand into the street.
    const built = yield* streetOsmSteps(s, this.physics, file, { y: f.y, ox, oz, turn, square: f.square, clear: f.hall ? [f.hall] : [], walk: f.walk, inflate: at.door ? 0.3 : 0, seed });
    yield;
    const group = yield* s.finishSteps();
    const windows = built.windows;
    if (windows) {
      const m = windows.material as MeshBasicMaterial;
      windows.onBeforeRender = () => {
        m.opacity = (windowsOf()?.material as MeshBasicMaterial | undefined)?.opacity ?? 0;
      };
    }
    return { group, release: () => { for (const c of built.colliders) this.physics.remove(c); } };
  }
}
