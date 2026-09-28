import text from './i18n/sv.json';
import { rgb, mix } from './gfx/color';
import { coolLamp, grain, pattern, warmLamp, type Theme } from './lines/theme';
import { GREEN_LINE } from './lines/green';
import { RED_LINE } from './lines/red';
import { fbm3 } from './gfx/noise';
import { vineTexture } from './gfx/textures';
import { hallonbergenTexture, solnaCentrumTexture, tenstaTexture } from './gfx/stationArt';
import { ESC_RISE, JUNCTION_RUN, KYMLINGE_AFTER, KYMLINGE_RUN } from './layout';
import type { ServiceSlot } from './operations';
import { layoutLines, lineTimetables, onRoute, serviceSlots, type LineService, type NetworkLayout, type RouteData, type StationData } from './routes';

export { layoutLines, lineTimetables, onRoute, routeDistances, routeStations, routeTimetables, stationPositions } from './routes';

export type { Theme } from './lines/theme';

export interface StationDef extends StationData {
  name: string;
  /** Site id in SL's Transport API, for real trains (`sl.ts`). Only the blue line runs real trains. */
  sl?: number;
  /** Where the station sits on the network map: 0 to 1 across (west to east) and down (north to south). */
  map: [number, number];
  /** Above ground in reality: built in the open air (see `outdoor.ts`). */
  open?: boolean;
  /** How far the open air reaches from an open station toward its neighbours before the line goes into a tunnel, when not the usual. */
  openReach?: number;
  /** An open station in the middle of the city by the water: bridges, Riddarfjärden and the skyline instead of fences and suburbs (see `city.ts`). */
  city?: boolean;
  /**
   * How a tiled station is finished (see `station.ts`): a low barrel `vault`
   * or a `flat` ceiling, a terrazzo `floor` in this colour, and `columns`
   * down the platform.
   */
  look?: { ceiling?: 'vault' | 'flat'; floor?: number; columns?: 'square' | 'round' | 'none'; columnColor?: number };
  /** Boardings on a weekday, from SL's "Fakta om SL och regionen 2019" or estimated in its spirit. Sets how crowded the station is. */
  riders: number;
  /**
   * How far the escalators climb from the platform to the ticket hall, in meters: deep in the rock on the blue line,
   * a short flight under the green line's inner city. Without one, `ESC_RISE`. Open stations keep the default.
   */
  rise?: number;
  /** The station's build: most are rock caves, `tiles` a tiled box from the 1950s. */
  architecture: 'garden' | 'vines' | 'strata' | 'harbour' | 'sport' | 'forest' | 'rock' | 'redSky' | 'cubes' | 'drawings' | 'kinship' | 'tiles';
  exits: string;
  /** Spoken after the station name on arrival. */
  transfer?: string;
  /** What lies behind the staff door at the far platform end (end stations lead to the turnback cavern). */
  service?: 'staff' | 'shelter';
  /** A pedestrian passage off the ticket hall, where a busker plays. */
  passage?: string;
  theme: Theme;
}

/** An earlier line's station that this line's trains call at too (see `LANE`). */
export interface SharedStation extends StationData {
  shared: LineDef['id'];
  /** Where this line's own map draws it. */
  map: [number, number];
}

export type RouteDef = RouteData;

export interface LineDef {
  id: 'blue' | 'red' | 'green';
  /** Line numbers shown as bullets on signage. */
  bullets: string[];
  name: string;
  color: string;
  routes: RouteDef[];
  /** Stations in world order: each route's own stations toward the east, the trunk, then each route's own stations toward the west (see `routes.ts`). */
  stations: Array<StationDef | SharedStation>;
  /** A station that never opened, on a route's tunnel `after` meters beyond station `from`. */
  ghost?: { name: string; route: string; from: string; after: number };
  /** Trains on the longest route (see `lineTimetables`). */
  trains?: number;
  /** Services (the line's own index) that rest on the summer timetable. By default every third train on each route. */
  summerRest?: number[];
}

/** A station of the network, with its line. Global indices run through the lines in order. */
export interface NetStation extends StationDef {
  /** The line it belongs to (the first to serve it). */
  line: number;
  /** Index within that line. */
  local: number;
  /** Every line whose trains call here: its own, and any sharing it. */
  lines: number[];
}

export interface NetRoute extends RouteDef {
  line: number;
  local: number;
}

/**
 * Every line, as one list of stations and one of routes with global indices,
 * and where everything lies along x (see `routes.ts`). The blue line comes
 * first, so its indices are the same as on its own.
 */
export interface Network {
  lines: LineDef[];
  stations: NetStation[];
  routes: NetRoute[];
  layout: NetworkLayout;
  /** World x of every station center, by global index. */
  x: number[];
}

export function buildNetwork(lines: LineDef[]): Network {
  const layout = layoutLines(lines);
  return {
    lines,
    stations: lines.flatMap((line, li) => line.stations.flatMap((s, local) => (s.shared ? [] : [{
      ...(s as StationDef), line: li, local,
      lines: [...new Set(layout.global.flatMap((g, lj) => (g.includes(layout.global[li][local]) ? [lj] : [])))],
    }]))),
    routes: lines.flatMap((line, li) => line.routes.map((r, local) => ({ ...r, line: li, local }))),
    layout,
    x: layout.x,
  };
}

/** Each line's timetables and services (see `lineTimetables`). */
export function networkServices(net: Network): LineService[] {
  return net.lines.map((line, li) => lineTimetables(net.layout, li, line.trains));
}

/** Global station indices along a global route, east to west. */
export function netRouteStations(net: Network, route: number): number[] {
  return net.layout.routes[route].stations;
}

/** Global index of a station on a line, by name, or -1. */
export function stationIndex(net: Network, name: string, line = 0): number {
  return net.stations.findIndex((s) => s.line === line && s.name === name);
}

/** The line a station, or a route, belongs to. */
export const lineOf = (net: Network, station: number): LineDef => net.lines[net.stations[station].line];

/** World x of the ghost station's center. */
export function ghostX(net: Network): number {
  const li = net.lines.findIndex((l) => l.ghost);
  const ghost = net.lines[li].ghost!;
  return net.x[stationIndex(net, ghost.from, li)] + ghost.after;
}

/** Where a route's trains are going on a track. */
export function serviceDestination(net: Network, route: number, track: 1 | 2): { number: string; name: string } {
  const r = net.routes[route];
  return { number: r.number, name: track === 1 ? r.outbound : r.inbound };
}

/**
 * How busy a station is next to its line's typical (median) station, from
 * real boardings. The square root keeps quiet stations quiet but never empty,
 * and lets T-Centralen fill up well before rush hour peaks.
 */
export function ridership(net: Network, station: number): number {
  const line = net.stations[station].line;
  const all = net.stations.filter((s) => s.line === line).map((s) => s.riders).sort((a, b) => a - b);
  const mid = all.length % 2 ? all[(all.length - 1) / 2] : (all[all.length / 2 - 1] + all[all.length / 2]) / 2;
  return Math.sqrt(net.stations[station].riders / mid);
}

/** Does some route end at this station, on this track? */
export function isLineTerminal(net: Network, station: number, track: 1 | 2): boolean {
  return net.layout.routes.some((r) => r.stations[track === 1 ? r.stations.length - 1 : 0] === station);
}

/** A station at the end of any route. */
export function isTerminal(net: Network, station: number): boolean {
  return isLineTerminal(net, station, 1) || isLineTerminal(net, station, 2);
}

/**
 * Where the line ends at a station: -1 when nothing runs on toward -x
 * (east), 1 toward +x (west), 0 when it runs on both ways. Trains turn in a
 * cavern beyond that end.
 */
export function lineEnd(net: Network, station: number): -1 | 0 | 1 {
  const links = net.layout.links;
  if (!links.some((l) => l.b === station)) return -1;
  if (!links.some((l) => l.a === station)) return 1;
  return 0;
}

/** A station built in the open air. */
export function isOutdoor(net: Network, station: number): boolean {
  return !!net.stations[station].open;
}

/** How far a station's escalators climb to its ticket hall (see `StationDef.rise`): an open station's, the usual. */
export function stationRise(net: Network, station: number): number {
  return isOutdoor(net, station) ? ESC_RISE : net.stations[station].rise ?? ESC_RISE;
}

/** The routes that serve a station. */
export function stationRoutes(net: Network, station: number): NetRoute[] {
  const s = net.stations[station];
  return net.routes.filter((r) => r.line === s.line && onRoute(s, r.number));
}


const garden: Theme = {
  ambient: rgb(0x42483f),
  lamp: warmLamp,
  // Kungsträdgården (Ulrik Samuelson): a blotchy moss-green ceiling, raw grey
  // rock walls, and between them a red and white candy-striped moulding that
  // snakes along the whole station.
  paint: (p) => {
    const border = 4.5 + Math.sin(p.x * 0.16) * 0.38 + Math.sin(p.x * 0.05 + 1) * 0.25;
    const grain = fbm3(p.x * 0.55, p.y * 0.7, p.z * 0.55, 4, 3);
    const blotch = fbm3(p.x * 0.18, p.y * 0.25, p.z * 0.18, 3, 4);
    if (p.y > border + 0.34) return mix(mix(rgb(0x2f5a30), rgb(0x5f8a45), blotch), rgb(0x1f3f24), grain * 0.35);
    if (p.y > border) return Math.floor((p.x * 0.7 - p.y * 1.4) / 0.28) & 1 ? rgb(0xb8322a) : rgb(0xf2efe6);
    return mix(rgb(0x55575a), rgb(0x8f8e88), grain);
  },
};

const vines: Theme = {
  ambient: rgb(0x555b68),
  lamp: coolLamp,
  // The vault itself is textured (see `art`); this paints end walls and trims.
  paint: (p) => (p.y < 2.1 ? rgb(0x1a4b95) : rgb(0xeef0f2)),
  art: (arcLength) => ({ texture: vineTexture(20, arcLength), period: 20 }),
};

const strata: Theme = {
  ambient: rgb(0x514038),
  lamp: warmLamp,
  // Rådhuset's grotto: warm terracotta sprayed concrete, fairly uniform,
  // darkening toward the track bed.
  paint: (p) => {
    const base = rgb(0xb57353);
    const light = rgb(0xe7a17b);
    const dark = rgb(0x85503a);
    const mottle = fbm3(p.x * 0.14, p.y * 0.3, p.z * 0.14, 4, 11);
    const col = mix(base, light, mottle * 1.1 - 0.1);
    return p.y < 1.8 ? mix(col, dark, 0.55) : mix(col, dark, fbm3(p.x * 0.02, p.y * 0.06, p.z * 0.02, 2, 5) * 0.3);
  },
};

const harbour: Theme = {
  ambient: rgb(0x414440),
  lamp: coolLamp,
  paint: (p) => {
    const stone = fbm3(p.x * 0.22, p.y * 0.35, p.z * 0.22, 4, 21);
    return mix(rgb(0x535a51), rgb(0xb8b3a0), stone);
  },
};

const sport: Theme = {
  ambient: rgb(0x474d55),
  lamp: coolLamp,
  // Stadshagen, by the sports ground: pale blue-grey rock over a red running-track band.
  paint: (p) => {
    const grain = fbm3(p.x * 0.4, p.y * 0.6, p.z * 0.4, 4, 31);
    if (p.y < 0.9) return mix(rgb(0x3d3f42), rgb(0x55575a), grain);
    if (p.y < 2.5) return mix(rgb(0xa8472f), rgb(0xc25a3c), grain);
    if (p.y > 4.15 && p.y < 4.35) return rgb(0x2a9d8f);
    return mix(rgb(0x9aa7b3), rgb(0xd3dbe2), grain);
  },
};

const forest: Theme = {
  ambient: rgb(0x3d4a3c),
  lamp: warmLamp,
  // Västra skogen, the western forest: dark green rock with pale birch trunks.
  paint: (p) => {
    const grain = fbm3(p.x * 0.3, p.y * 0.5, p.z * 0.3, 4, 41);
    const trunk = (p.x / 2.6 + fbm3(p.x * 0.05, 0, p.z * 0.05, 2, 42) * 3) % 1;
    if (p.y > 0.6 && p.y < 6.5 && trunk > 0 && trunk < 0.2) return Math.sin(p.y * 9 + p.x * 3) > 0.9 ? rgb(0x2a2a28) : rgb(0xe8e4d8);
    return mix(rgb(0x243b2a), rgb(0x4f6b45), grain);
  },
};


// Solna centrum (Anders Åberg and Karl-Olov Björk): a burning red evening sky
// over a dark green spruce forest, painted round the vault (see `stationArt.ts`).
const redSky: Theme = { ...pattern(0x4a3230, warmLamp, (p) => {
  const g = grain(p, 51);
  const ridge = 3.4 + Math.abs(((p.x * 0.55 + p.z * 0.3) % 2.4) - 1.2) * 1.5 + Math.sin(p.x * 0.09) * 0.4;
  if (p.y > ridge) return mix(rgb(0xa82a1c), rgb(0xe0572f), (p.y - ridge) / 3 + g * 0.3);
  if (p.y > 1.2) return mix(rgb(0x173d24), rgb(0x2f5b35), g);
  return mix(rgb(0x2a2b28), rgb(0x44443e), g);
}), art: (arc) => solnaCentrumTexture(arc) };

// Näckrosen: pale water with floating lily pads.
const lilies = pattern(0x46524f, coolLamp, (p) => {
  const g = grain(p, 52, 0.3);
  const cell = (v: number) => v - Math.floor(v) - 0.5;
  const pad = Math.hypot(cell(p.x / 2.3 + Math.floor(p.y / 1.9) * 0.37), cell(p.y / 1.9)) < 0.23 + g * 0.06;
  if (pad && p.y > 1.2) return fbm3(p.x, p.y, p.z, 2, 53) > 0.62 ? rgb(0xf2d6de) : mix(rgb(0x3f7a47), rgb(0x5d9658), g);
  return mix(rgb(0x7fa9a4), rgb(0xb9d3cc), g);
});

// Hallonbergen (Elis Eriksson and Gösta Wallmark): enlarged children's drawings
// on white walls and vaults (see `stationArt.ts`).
const crayons: Theme = { ...pattern(0x5a5a58, coolLamp, (p) => mix(rgb(0xe4e2da), rgb(0xf6f5f0), grain(p, 54))), art: (arc) => hallonbergenTexture(arc) };

// Kista: dark blue rock with thin bright traces, like a circuit board.
const circuit = pattern(0x353d4c, coolLamp, (p) => {
  const g = grain(p, 55);
  const tx = Math.abs((p.x * 0.8) % 1.6 - 0.8) < 0.035 && Math.sin(p.y * 1.3 + p.x) > -0.2;
  const ty = Math.abs((p.y * 1.1 + Math.floor(p.x * 0.8) * 0.4) % 1.3 - 0.65) < 0.035;
  if (p.y > 1.2 && (tx || ty)) return rgb(0x7fd6e8);
  return mix(rgb(0x1d2a45), rgb(0x34466a), g);
});

// Husby: warm ochre rock with blue flowers low on the walls.
const meadow = pattern(0x4d4436, warmLamp, (p) => {
  const g = grain(p, 56);
  const flower = p.y < 3 && p.y > 1.2 && fbm3(p.x * 2.5, p.y * 2.5, p.z * 2.5, 2, 57) > 0.7;
  if (flower) return rgb(0x3b6fd1);
  return mix(rgb(0xa77b3e), rgb(0xd1a45f), g);
});

// Akalla: tiled panels of everyday life at eye height on pale rock.
const tiles = pattern(0x4d4a44, warmLamp, (p) => {
  const g = grain(p, 58);
  if (p.y > 1.3 && p.y < 3.7) {
    const panel = Math.floor(p.x / 3.2);
    const edge = Math.abs(p.x / 0.2 - Math.round(p.x / 0.2)) < 0.08 || Math.abs(p.y / 0.2 - Math.round(p.y / 0.2)) < 0.08;
    if (edge) return rgb(0xe8e2d2);
    const k = fbm3(p.x * 0.9, p.y * 0.9, panel, 2, 59);
    return [rgb(0x2f5f8f), rgb(0xd8b24a), rgb(0xb5533c), rgb(0x5f8a4e), rgb(0xeae3d2)][Math.floor(k * 7) % 5];
  }
  return mix(rgb(0x9b958a), rgb(0xcac4b6), g);
});

// Huvudsta: grey-blue stone with a gold band.
const goldBand = pattern(0x3f444c, coolLamp, (p) => {
  const g = grain(p, 60);
  if (p.y > 3.9 && p.y < 4.25) return rgb(0xc9a23a);
  return mix(rgb(0x4d5b6b), rgb(0x8795a3), g);
});

// Solna strand: raw dark grey sprayed concrete, left bare so that Takashi
// Naraha's sky-blue cloud cubes stand out of it (see `stationDetails.ts`).
const sky = pattern(0x4a4b4c, coolLamp, (p) => {
  const g = grain(p, 61, 0.5);
  return mix(rgb(0x55565a), rgb(0x7a7a76), g);
});

// Sundbybergs centrum: warm yellow rock, striped low.
const sunny = pattern(0x514a38, warmLamp, (p) => {
  const g = grain(p, 62);
  if (p.y < 2 && Math.floor(p.x / 0.6) % 2 === 0) return mix(rgb(0x8c3d2a), rgb(0xa9503a), g);
  return mix(rgb(0xc9a44a), rgb(0xe6c878), g);
});

// Duvbo: under water, deep blue green with rising bubbles.
const underwater = pattern(0x2e4447, coolLamp, (p) => {
  const g = grain(p, 63);
  const bubble = fbm3(p.x * 3, p.y * 1.4 - p.x * 0.2, p.z * 3, 2, 64) > 0.73;
  if (bubble && p.y > 1.4) return rgb(0xbfe6ea);
  return mix(rgb(0x0f4a52), rgb(0x2d7d7a), g * 0.8 + p.y / 30);
});

// Rissne: a timeline of history along a dark band, with year marks.
const timeline = pattern(0x48463f, warmLamp, (p) => {
  const g = grain(p, 65);
  if (p.y > 2.3 && p.y < 2.9) return Math.abs((p.x % 5) - 2.5) < 0.05 ? rgb(0xf0e6c8) : rgb(0x2b2622);
  if (p.y > 2.9 && p.y < 3.05) return rgb(0xb8402c);
  return mix(rgb(0xb3ab98), rgb(0xd9d2bf), g);
});

// Rinkeby: gold glints on dark rock, like buried treasure.
const treasure = pattern(0x33302a, warmLamp, (p) => {
  const g = grain(p, 66, 0.6);
  if (fbm3(p.x * 2, p.y * 2, p.z * 2, 2, 67) > 0.72) return rgb(0xd9b347);
  return mix(rgb(0x1f2a2a), rgb(0x3a4a44), g);
});

// Tensta (Helga Henschen, "En ros till invandrarna"): naive animals, plants,
// a rose and a sun on white, and solidarity in eighteen languages (see `stationArt.ts`).
const mural: Theme = { ...pattern(0x57524c, warmLamp, (p) => {
  const g = grain(p, 68, 0.25);
  if (p.y < 1.3) return mix(rgb(0xd9d4c8), rgb(0xe9e4d8), g);
  return mix(rgb(0xece9e0), rgb(0xf7f5ef), g);
}), art: (arc) => tenstaTexture(arc) };

// Hjulsta: dark rock with wheel-like rings.
const wheels = pattern(0x3a3c40, coolLamp, (p) => {
  const g = grain(p, 69);
  const r = Math.hypot(((p.x % 6) + 6) % 6 - 3, p.y - 4);
  if (Math.abs(r - 2.2) < 0.1 || Math.abs(r - 1.2) < 0.08) return rgb(0xf08a24);
  return mix(rgb(0x2e3238), rgb(0x505760), g);
});

/** The blue line: the shared trunk from Kungsträdgården, then the branches to Akalla (11) and Hjulsta (10). */
export const BLUE_LINE: LineDef = {
  id: 'blue',
  bullets: ['10', '11'],
  name: 'Blå linjen',
  color: '#1c63c4',
  routes: [
    { number: '10', outbound: 'Hjulsta', inbound: 'Kungsträdgården', shifted: true },
    { number: '11', outbound: 'Akalla', inbound: 'Kungsträdgården' },
  ],
  ghost: { name: 'Kymlinge', route: '11', from: 'Hallonbergen', after: KYMLINGE_AFTER },
  stations: [
    { name: 'Kungsträdgården', map: [0.565, 0.445], sl: 9340, riders: 9850, rise: 30, architecture: 'garden', exits: 'Kungsträdgården · Arsenalsgatan', theme: garden },
    {
      name: 'T-Centralen',
      map: [0.5, 0.45],
      sl: 9001,
      riders: 39800,
      rise: 21,
      architecture: 'vines',
      exits: 'Vasagatan · Centralstation',
      transfer: text.announcements.tCentralenTransfer,
      service: 'staff',
      passage: text.busker.passage,
      theme: vines,
    },
    { name: 'Rådhuset', map: [0.455, 0.455], sl: 9309, riders: 13100, rise: 19, architecture: 'strata', exits: 'Kungsholmsgatan · Stadshuset', service: 'shelter', theme: strata },
    { name: 'Fridhemsplan', map: [0.41, 0.445], sl: 9115, riders: 20250, rise: 21, architecture: 'harbour', exits: 'Drottningholmsvägen · S:t Eriksgatan', transfer: text.announcements.fridhemsplanTransfer, theme: harbour },
    { name: 'Stadshagen', map: [0.38, 0.415], sl: 9307, riders: 14050, rise: 11, architecture: 'sport', exits: 'Stadshagsvägen · Mariedalsvägen', theme: sport },
    { name: 'Västra skogen', map: [0.35, 0.385], sl: 9306, riders: 7850, rise: 33, architecture: 'forest', exits: 'Västra skogen · Solna', theme: forest },
    // The branches. Their `riders` are estimates in the same spirit, not SL's figures.
    { name: 'Solna centrum', map: [0.345, 0.33], sl: 9305, riders: 11000, rise: 23, architecture: 'redSky', exits: 'Solna centrum · Solna stadshus', branch: '11', gap: JUNCTION_RUN, theme: redSky },
    { name: 'Näckrosen', map: [0.335, 0.285], sl: 9304, riders: 4000, rise: 13, architecture: 'rock', exits: 'Filmstaden · Råsundavägen', branch: '11', theme: lilies },
    { name: 'Hallonbergen', map: [0.32, 0.24], sl: 9303, riders: 6000, rise: 20, architecture: 'drawings', exits: 'Hallonbergens centrum', branch: '11', theme: crayons },
    // Up on its viaduct in the open, between the tunnels from Hallonbergen and to Husby.
    { name: 'Kista', map: [0.3, 0.19], sl: 9302, riders: 16000, architecture: 'rock', exits: 'Kista Galleria · Kista centrum', branch: '11', gap: KYMLINGE_RUN, open: true, theme: circuit },
    { name: 'Husby', map: [0.28, 0.15], sl: 9301, riders: 5500, rise: 30, architecture: 'rock', exits: 'Husby centrum', branch: '11', theme: meadow },
    { name: 'Akalla', map: [0.26, 0.11], sl: 9300, riders: 5000, rise: 12, architecture: 'rock', exits: 'Akalla centrum', branch: '11', theme: tiles },
    { name: 'Huvudsta', map: [0.315, 0.37], sl: 9327, riders: 4500, rise: 17, architecture: 'rock', exits: 'Huvudsta centrum', branch: '10', gap: JUNCTION_RUN, theme: goldBand },
    { name: 'Solna strand', map: [0.29, 0.355], sl: 9326, riders: 3000, rise: 20, architecture: 'cubes', exits: 'Solna strand · Huvudstaleden', branch: '10', theme: sky },
    { name: 'Sundbybergs centrum', map: [0.26, 0.335], sl: 9325, riders: 10000, rise: 18, architecture: 'rock', exits: 'Sundbybergs torg · Pendeltåg', branch: '10', transfer: text.announcements.sundbybergTransfer, theme: sunny },
    { name: 'Duvbo', map: [0.23, 0.315], sl: 9324, riders: 2500, rise: 30, architecture: 'rock', exits: 'Duvbo', branch: '10', theme: underwater },
    { name: 'Rissne', map: [0.2, 0.295], sl: 9323, riders: 4500, rise: 24, architecture: 'rock', exits: 'Rissne centrum', branch: '10', theme: timeline },
    { name: 'Rinkeby', map: [0.17, 0.275], sl: 9322, riders: 8000, rise: 21, architecture: 'rock', exits: 'Rinkeby torg', branch: '10', theme: treasure },
    { name: 'Tensta', map: [0.14, 0.255], sl: 9321, riders: 7000, rise: 13, architecture: 'kinship', exits: 'Tensta centrum', branch: '10', theme: mural },
    { name: 'Hjulsta', map: [0.11, 0.235], sl: 9320, riders: 3000, rise: 13, architecture: 'rock', exits: 'Hjulsta', branch: '10', theme: wheels },
  ],
  trains: 4,
  summerRest: [2, 5],
};

/** The whole metro. */
export const NETWORK = buildNetwork([BLUE_LINE, RED_LINE, GREEN_LINE]);

/** Every train slot of the network for `Operations` (see `serviceSlots`). */
export function networkSlots(net: Network, services: LineService[], spares: readonly number[] = []): ServiceSlot[] {
  return serviceSlots(net.lines, net.layout, services, spares);
}
