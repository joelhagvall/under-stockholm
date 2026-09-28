import type { Location, World } from './world/world';

/**
 * Where you have been. Every platform, ticket hall, escalator, tunnel and
 * named room counts as a place; the map fills in as you visit them, and the
 * pause menu keeps the tally. Saved in the browser.
 */

const KEY = 'under-stockholm:explored';

export interface Explored {
  /** Stations where you have stood on the platform. */
  stations: Set<number>;
  /** Tunnels you have been through, as "a-b" station pairs. */
  tunnels: Set<string>;
}

export class Exploration {
  private readonly visited: Set<string>;
  private readonly all: Set<string>;
  private readonly pairs: Array<{ a: number; b: number; x0: number; x1: number; key: string }> = [];

  constructor(world: World) {
    let saved: string[] = [];
    try { saved = JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { /* A fresh start. */ }
    this.visited = new Set(Array.isArray(saved) ? saved : []);
    this.all = new Set<string>();
    for (const s of world.stations) for (const area of ['platform', 'hall', 'escalator', ...(s.exit.street ? ['street'] : [])]) this.all.add(`${s.index}:${area}`);
    for (const z of world.zones) this.all.add(this.zoneKey(z.station, z.label));
    // A tunnel through a portal counts where its copy is built, by the far station (see `World.tunnelExtent`).
    for (const link of world.net.layout.links) {
      const { a, b } = link;
      const key = `${a}-${b}`;
      const { x0, x1 } = world.tunnelExtent(link);
      this.pairs.push({ a, b, x0, x1, key: `tunnel:${key}` });
      this.all.add(`tunnel:${key}`);
    }
  }

  private zoneKey(station: number | null, label: string): string {
    return `zone:${station ?? '-'}:${label}`;
  }

  /** Marks where the player is. Returns the name of a newly found named place, if any. */
  visit(here: Location, x: number): string | null {
    let key: string | null = null;
    let named: string | null = null;
    if (here.label) {
      key = this.zoneKey(here.station, here.label);
      named = here.label;
    } else if (here.station !== null && (here.area === 'platform' || here.area === 'hall' || here.area === 'escalator' || here.area === 'street')) key = `${here.station}:${here.area}`;
    else if (here.area === 'tunnel') key = this.pairs.find((p) => x > p.x0 && x < p.x1)?.key ?? null;
    if (!key || this.visited.has(key) || !this.all.has(key)) return null;
    this.visited.add(key);
    try { localStorage.setItem(KEY, JSON.stringify([...this.visited])); } catch { /* Session only. */ }
    return named;
  }

  get count(): number {
    let n = 0;
    for (const k of this.visited) if (this.all.has(k)) n++;
    return n;
  }

  get total(): number {
    return this.all.size;
  }

  /** For the map: stations and tunnels seen so far. */
  explored(): Explored {
    const stations = new Set<number>();
    const tunnels = new Set<string>();
    for (const k of this.visited) {
      const m = k.match(/^(\d+):/);
      if (m) stations.add(Number(m[1]));
      if (k.startsWith('tunnel:')) tunnels.add(k.slice(7));
    }
    return { stations, tunnels };
  }
}
