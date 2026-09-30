import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { Vector2 } from 'three';
import { STREET } from '../src/game/layout';
import { streetFrame } from '../src/game/world/street';
import { insideRing, reaches, streetOrigin, type StreetFile } from '../src/game/world/streetOsm';

const DIR = 'src/game/world/osm/streets';

/** A file's outlines as the game lays them round the top of the stairs: buildings, and water. */
function laid(file: StreetFile, e: 1 | -1, rank: number) {
  const frame = streetFrame({ hx: 0, hallY: 0, e, door: false, osm: true });
  const { ox, oz, turn } = streetOrigin(file, 0, frame, rank);
  const c = Math.cos(turn), s = Math.sin(turn);
  const ring = (list: ReadonlyArray<number | null>, k: number, n: number) => {
    const out: Vector2[] = [];
    let x = 0, z = 0;
    for (let i = 0; i < n; i++) {
      x += list[k + 2 * i] as number;
      z += list[k + 2 * i + 1] as number;
      out.push(new Vector2(ox + (c * x - s * z) / 10, oz + (s * x + c * z) / 10));
    }
    return out;
  };
  // As the game builds them: none that comes within a metre of the square (see `streetOsmSteps`).
  const q = frame.square;
  const buildings = file.buildings.map((b) => ring(b, 3, (b.length - 3) / 2)).filter((r) => !reaches(r, { x0: q.x0 - 1, x1: q.x1 + 1, z0: q.z0 - 1, z1: q.z1 + 1 }));
  // Water with its islands: each area's rings, the outer one first.
  const water = file.areas.filter((a) => a[0] === 2).map((a) => {
    const rings: Vector2[][] = [];
    for (let k = 1; k < a.length; k += 1 + 2 * a[k]) rings.push(ring(a, k + 1, a[k]));
    return rings;
  });
  return { frame, buildings, water };
}

describe('the city round each exit', () => {
  const files = readdirSync(DIR).filter((f) => /-[np]x\.json$/.test(f));
  test('there are exits to look at', () => expect(files.length).toBeGreaterThan(50));
  for (const name of files) {
    test(name, () => {
      const file = JSON.parse(readFileSync(`${DIR}/${name}`, 'utf8')) as StreetFile;
      const e = name.endsWith('-px.json') ? 1 : -1;
      // Each hall that way comes up at an entrance of its own: the one furthest out, then the others.
      for (let rank = 0; rank <= (file.entrances?.length ?? 0); rank++) {
        const { frame, buildings, water } = laid(file, e, rank);
        // The stairs come up on dry land, and no house stands in the way just ahead of the square.
        for (let a = STREET.stairTop - 6; a <= STREET.square.a1 + 4; a += 1) {
          for (const z of [-2, 0, 2]) {
            const x = frame.X(a);
            expect(water.some(([outer, ...holes]) => insideRing(outer, x, z) && !holes.some((h) => insideRing(h, x, z)))).toBe(false);
            if (a > STREET.square.a1) expect(buildings.some((r) => insideRing(r, x, z))).toBe(false);
          }
        }
      }
    });
  }
});
