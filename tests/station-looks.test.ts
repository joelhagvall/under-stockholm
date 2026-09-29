import { describe, expect, test } from 'bun:test';
import { Vector3 } from 'three';
import { NETWORK } from '../src/game/line';
import { OPEN_ROOFS } from '../src/game/lines/canopies';
import { BLUE_DETAILS } from '../src/game/world/details/blue';
import { GREEN_DETAILS } from '../src/game/world/details/green';
import { RED_DETAILS } from '../src/game/world/details/red';

// Every station should look like its real self (see `bun run shots` for the pictures). What a test can see without
// them: that nothing has fallen back to the look every station shares.

const DETAILS: Record<string, Record<string, unknown>> = { blue: BLUE_DETAILS, red: RED_DETAILS, green: GREEN_DETAILS };
const stations = NETWORK.stations.filter((s) => s.name !== 'Kymlinge');
const lineOf = (s: (typeof stations)[number]) => NETWORK.lines[s.line].id;

/** A theme's colours at a handful of points round a platform: two stations alike here look alike. */
function signature(s: (typeof stations)[number]): string {
  const n = new Vector3(0, 0, 1);
  const points = [[3, 0.5, 8], [17, 2.5, -8], [41, 4.5, 8], [9, 6.5, 0], [-23, 1.5, -8], [60, 3, 8]];
  const colours = points.map(([x, y, z]) => s.theme.paint(new Vector3(x, y, z), n).map((c) => Math.round(c * 50)).join('.'));
  return `${s.architecture} ${colours.join(' ')} ${JSON.stringify(s.look ?? {})} ${!!s.theme.art}`;
}

describe('station looks', () => {
  test('every open-air platform has its own roof', () => {
    const bare = stations.filter((s) => s.open && !s.city && s.lines.length === 1 && !s.canopy).map((s) => s.name);
    expect(bare).toEqual([]);
  });

  test('every roof in the table belongs to an open-air station', () => {
    const open = new Set(stations.filter((s) => s.open).map((s) => s.name));
    expect(Object.keys(OPEN_ROOFS).filter((name) => !open.has(name))).toEqual([]);
  });

  test('every station underground has something of its own: art, objects on the platform or its own finish', () => {
    const plain = stations.filter((s) => !s.open && !s.theme.art && !DETAILS[lineOf(s)][s.name] && !s.look).map((s) => s.name);
    expect(plain).toEqual([]);
  });

  test('no two stations underground look alike', () => {
    const seen = new Map<string, string>();
    const twins: string[] = [];
    for (const s of stations.filter((t) => !t.open)) {
      const key = signature(s);
      const other = seen.get(key);
      if (other) twins.push(`${other} and ${s.name}`);
      else seen.set(key, s.name);
    }
    expect(twins).toEqual([]);
  });

  test('every station with objects of its own is a real station of its line', () => {
    for (const [line, details] of Object.entries(DETAILS)) {
      const names = new Set(stations.filter((s) => lineOf(s) === line).map((s) => s.name));
      expect(Object.keys(details).filter((name) => !names.has(name))).toEqual([]);
    }
  });
});
