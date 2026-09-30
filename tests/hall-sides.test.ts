import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import data from './data/osm-entrances.json';
import { hallDir, isOutdoor, NETWORK } from '../src/game/line';
import { streetKey } from '../src/game/world/osmKey';
import { hallStreetX } from '../src/game/world/world';

/**
 * The stations' halls against where OpenStreetMap has their entrances (`data/osm-entrances.json`, from
 * `bun scripts/osm-streets.ts --all --entrances`): a way in clearly out toward one end has a hall coming up that way,
 * and a hall comes up where there is a way in. Only the side is compared: OSM measures from the station's node, which
 * often stands at an entrance rather than over the platform's middle, so distances say little.
 */
const ENTRANCES = (data as { stations: Record<string, number[][]> }).stations;
/** Out along the tracks this far from the node, an entrance is clearly toward that end. */
const CLEAR = 100;
/** A hall may come up this far past the node on the other side of it and still be at an entrance near the middle. */
const MIDDLE = 40;
/** Where the game knowingly differs from OSM's entrances, and why. */
const KNOWN: Record<string, string> = {
  'red:T-Centralen': 'the Vasagatan hall reaches Vasagatan and the Central station through the long passage west, not over the platform',
  'green:Globen': 'OSM has only the north entrance, not the south one at Arenavägen',
  'green:Farsta strand': 'the station\'s own entrance is at Stieg Trenters torg; OSM\'s unnamed one 170 m west is not',
};

describe('halls on the side of the real entrances', () => {
  for (const [i, s] of NETWORK.stations.entries()) {
    const key = `${NETWORK.lines[s.line].id}:${s.name}`;
    const entrances = (ENTRANCES[key] ?? []).filter(([x, z]) => Math.abs(x) < 400 && Math.abs(z) < 160);
    if (!entrances.length || !s.halls || KNOWN[key]) continue;
    test(key, () => {
      const halls = s.halls!.map((h, k) => hallStreetX(NETWORK, i, h, k));
      for (const [x] of entrances) {
        if (Math.abs(x) > CLEAR) expect(halls.some((h) => Math.sign(h) === Math.sign(x)), `an entrance ${Math.round(x)} m out, and no hall that way`).toBe(true);
      }
      for (const h of halls) expect(entrances.some(([x]) => Math.sign(h) * x > -MIDDLE), `a hall at ${Math.round(h)} m, and no entrance that way`).toBe(true);
    });
  }
  test('every station the game builds has its entrances listed', () => {
    for (const s of NETWORK.stations) expect(ENTRANCES[`${NETWORK.lines[s.line].id}:${s.name}`]).toBeDefined();
  });
});

describe('the city round each hall', () => {
  // Underground each end a hall comes up at has its street file, in the open the station one (see `osmKey.ts`); the
  // stations in the city by the water have their skyline made by hand.
  for (const [i, s] of NETWORK.stations.entries()) {
    if (s.city) continue;
    const line = NETWORK.lines[s.line].id;
    test(`${line}:${s.name}`, () => {
      const keys = isOutdoor(NETWORK, i) ? [streetKey(line, s.name, null)] : [...new Set((s.halls ?? []).map((h) => streetKey(line, s.name, hallDir(h))))];
      for (const key of keys) expect(existsSync(`src/game/world/osm/streets/${key}.json`), `${key}.json`).toBe(true);
    });
  }
});
