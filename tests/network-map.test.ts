import { expect, test } from 'bun:test';
import { NETWORK } from '../src/game/line';

// The HUD map colours each stretch by the line whose trains run on it (`Hud.mapLinks`).
const lineOfLink = (routes: readonly number[]) => [...new Set(routes.map((r) => NETWORK.routes[r].line))];

test('every stretch of the map belongs to one line, which calls at both its ends', () => {
  for (const { a, b, routes } of NETWORK.layout.links) {
    const lines = lineOfLink(routes);
    expect([NETWORK.stations[a].name, NETWORK.stations[b].name, lines.length]).toEqual([NETWORK.stations[a].name, NETWORK.stations[b].name, 1]);
    expect(NETWORK.stations[a].lines).toContain(lines[0]);
    expect(NETWORK.stations[b].lines).toContain(lines[0]);
  }
});

test('red and green each have their own stretch through the city, the green one green', () => {
  const name = (i: number) => NETWORK.stations[i].name;
  const green = NETWORK.lines.findIndex((l) => l.id === 'green');
  const red = NETWORK.lines.findIndex((l) => l.id === 'red');
  for (const [from, to] of [['T-Centralen', 'Gamla stan'], ['Gamla stan', 'Slussen']]) {
    const stretch = NETWORK.layout.links.filter((l) => [name(l.a), name(l.b)].sort().join() === [from, to].sort().join());
    expect(stretch.map((l) => lineOfLink(l.routes)[0]).sort()).toEqual([red, green].sort());
  }
  const medborgarplatsen = NETWORK.layout.links.find((l) => [name(l.a), name(l.b)].includes('Medborgarplatsen') && [name(l.a), name(l.b)].includes('Slussen'))!;
  expect(lineOfLink(medborgarplatsen.routes)).toEqual([green]);
});
