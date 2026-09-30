import type { CanopyDef } from './world/canopy';
import { OPEN_ROOFS } from './lines/canopies';
import text from './i18n/sv.json';
import { rgb, mix } from './gfx/color';
import { coolLamp, grain, pattern, warmLamp, type Theme } from './lines/theme';
import { GREEN_LINE } from './lines/green';
import { RED_LINE } from './lines/red';
import { fbm3 } from './gfx/noise';
import { vineTexture } from './gfx/textures';
import { hallonbergenTexture, solnaCentrumTexture, tenstaTexture } from './gfx/stationArt';
import { akallaTexture, duvboTexture, hjulstaTexture, husbyTexture, huvudstaTexture, nackrosenTexture, rinkebyTexture, rissneTexture, stadshagenTexture, vastraSkogenTexture } from './gfx/art/blue';
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
   * down the platform. In a rock cave, `columns: 'none'` leaves out the rock
   * piers: one wide span. `split` divides the island lengthwise with a wall
   * (rock, or the station's tiles) up to the ceiling, as in the stations
   * built as two platform tunnels joined by a middle vault (`SPLIT`).
   */
  look?: { ceiling?: 'vault' | 'flat'; floor?: number; columns?: 'square' | 'round' | 'none'; columnColor?: number; split?: boolean };
  /** In the open, what stands over the platform, as the real station has it (see `world/canopy.ts`). */
  canopy?: CanopyDef;
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
  /**
   * The station's ticket halls as its real plan has them, the main one first (see `HallDef`): at most one at each end
   * of the platform, and any number reached from along it. Without them the layout picks an end for one hall. Where a
   * hall takes the end the staff door would have, the door moves beside its escalators (`SIDE_DOOR`), or a plain staff
   * room is left out.
   */
  halls?: readonly HallDef[];
  /** Spoken after the station name on arrival. */
  transfer?: string;
  /** What lies behind the staff door at the far platform end (end stations lead to the turnback cavern). */
  service?: 'staff' | 'shelter';
  /** A pedestrian passage off the ticket hall, where a busker plays. */
  passage?: string;
  theme: Theme;
}

/** A ticket hall, and the way up to it (see `StationDef.halls`). */
export interface HallDef {
  /**
   * Which way its escalators climb: toward the line's inbound terminus (-x) or its outbound one (+x). They start from
   * that end of the platform, through its end wall, unless `from` says otherwise.
   */
  end: 'inbound' | 'outbound';
  /**
   * Where the escalators start instead, out on the platform: this many meters from its middle toward `end` (negative on
   * the other side of the middle). They climb up through the ceiling, tiled or the rock's crown, to a hall over the
   * station, as to a mezzanine. In the open, where the hall is `down`, where the escalators go down from instead.
   */
  from?: number;
  /**
   * In the open: the hall is under the tracks, as at most stations out there. From `from` the escalators go down away
   * from `end`, to a hall whose stairs come up beside the tracks, beyond the fences: with `from` positive toward the
   * middle, to a hall under the platform; negative, out past the platform's other end, to a hall under the open track
   * beyond it, as at most suburban stations (`end` is still the way they climb back).
   */
  down?: boolean;
  /** Which side of the tracks a hall under them has its stairs up on (1: +z, 2: -z), whichever track runs there. */
  beside?: 1 | 2;
  /** Meters of level passage from the top of the escalators to the hall, where the real walk is long. */
  corridor?: number;
  /** An inclined lift, a snedbanehiss, running beside the escalators. */
  incline?: boolean;
  /** What its exit signs name, when not the station's `exits`. */
  exits?: string;
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
      // An open-air station's roof, from the table of them (`lines/canopies.ts`) unless its entry has its own.
      canopy: (s as StationDef).canopy ?? ((s as StationDef).open ? OPEN_ROOFS[s.name] : undefined),
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

/** Up on a viaduct (`CanopyDef.viaduct`): an open station of one line, away from the city by the water. */
export function viaductAt(net: Network, station: number): boolean {
  const s = net.stations[station];
  return !!s.open && s.lines.length === 1 && !s.city && !!s.canopy?.viaduct;
}

/** How far a station's escalators climb to its ticket hall (see `StationDef.rise`): an open station's, the usual. */
export function stationRise(net: Network, station: number): number {
  return isOutdoor(net, station) ? ESC_RISE : net.stations[station].rise ?? ESC_RISE;
}

/** Which way along x a hall's end of the platform lies. */
export function hallDir(hall: HallDef): 1 | -1 {
  return hall.end === 'outbound' ? 1 : -1;
}

/** A station's hall at one end of its platform (`dir` along x), if its plan has one there. */
export function hallAt(net: Network, station: number, dir: 1 | -1): HallDef | undefined {
  return net.stations[station].halls?.find((h) => hallDir(h) === dir);
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
  paint: (p) => (p.y < 2.1 ? rgb(0x1a4b95) : rgb(0xebe3cc)),
  art: (arcLength) => ({ texture: vineTexture(20, arcLength), period: 20 }),
};

const strata: Theme = {
  ambient: rgb(0x514038),
  lamp: warmLamp,
  // Rådhuset (Sigvard Olsson): the whole grotto in the rust-pink earth of the
  // Atlas mountains, over a low grey concrete plinth along the walls.
  paint: (p) => {
    const base = rgb(0xb86a48);
    const light = rgb(0xd68e6a);
    const dark = rgb(0x7a4028);
    const mottle = fbm3(p.x * 0.14, p.y * 0.3, p.z * 0.14, 4, 11);
    const col = mix(base, light, mottle * 1.1 - 0.1);
    if (p.y < 1.5 && Math.abs(p.z) > 8) return mix(rgb(0x7a7570), rgb(0x9a958e), mottle);
    return mix(col, dark, fbm3(p.x * 0.02, p.y * 0.06, p.z * 0.02, 2, 5) * 0.3 + (p.y < 2.2 ? 0.15 : 0));
  },
};

const harbour: Theme = {
  ambient: rgb(0x48403a),
  lamp: warmLamp,
  // Fridhemsplan (Ingegerd Möller): natural brown-grey rock with warm streaks,
  // some stretches of it painted off-white and splashed with blue and red, as
  // round the showcase of the red-sailed boat (see `stationDetails.ts`).
  paint: (p) => {
    const stone = fbm3(p.x * 0.22, p.y * 0.35, p.z * 0.22, 4, 21);
    const streak = Math.sin(p.x * 0.9 + p.y * 2.2 + stone * 4) * 0.5 + 0.5;
    const col = mix(mix(rgb(0x55483c), rgb(0x8a7560), stone), rgb(0x9a8266), streak * 0.3);
    if (p.y > 1.4 && p.y < 5 && Math.abs(p.z) > 8 && fbm3(p.x * 0.04, 0, p.z * 0.04, 2, 22) > 0.6) {
      const splash = fbm3(p.x * 1.6, p.y * 1.6, p.z * 1.6, 2, 23);
      return splash > 0.72 ? rgb(0x3a5ab0) : splash < 0.24 ? rgb(0xb04a36) : mix(rgb(0xd8d4cc), rgb(0xc8c2b8), stone);
    }
    return col;
  },
};

// Stadshagen (Lasse Lindqvist): grey rock with its cracks traced in red and
// white, and pleated sports pictures on the track walls (see `art/blue.ts`).
const sport: Theme = { ...pattern(0x46474a, coolLamp, (p) => mix(rgb(0x45443f), rgb(0x8a8984), grain(p, 31))), art: (arc) => stadshagenTexture(arc) };

// Västra skogen (Sivert Lindblom): dark bare rock with tiled forms and black
// profiles (see `art/blue.ts`, and the profile bollards in `details/blue.ts`).
const forest: Theme = { ...pattern(0x3c3a37, coolLamp, (p) => mix(rgb(0x363430), rgb(0x5e5a52), grain(p, 41))), art: (arc) => vastraSkogenTexture(arc) };


// Solna centrum (Anders Åberg and Karl-Olov Björk): a burning red evening sky
// over a dark green spruce forest, painted round the vault (see `stationArt.ts`).
const redSky: Theme = { ...pattern(0x4a3230, warmLamp, (p) => {
  const g = grain(p, 51);
  const ridge = 3.4 + Math.abs(((p.x * 0.55 + p.z * 0.3) % 2.4) - 1.2) * 1.5 + Math.sin(p.x * 0.09) * 0.4;
  if (p.y > ridge) return mix(rgb(0xa82a1c), rgb(0xe0572f), (p.y - ridge) / 3 + g * 0.3);
  if (p.y > 1.2) return mix(rgb(0x173d24), rgb(0x2f5b35), g);
  return mix(rgb(0x2a2b28), rgb(0x44443e), g);
}), art: (arc) => solnaCentrumTexture(arc) };

// Näckrosen (Lizzie Olsson-Arle): a pale grey-white cave with framed
// showcases along the walls, and a lily pond painted in the vault (see `art/blue.ts`).
const lilies: Theme = { ...pattern(0x55555a, coolLamp, (p) => mix(rgb(0xb4b3ae), rgb(0xdedcd6), grain(p, 52, 0.3))), art: (arc) => nackrosenTexture(arc) };

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

// Husby (Birgit Broms): the pale linden green of Lill-Jansskogen in spring,
// with a frieze of birch trunks and steamboats on the track walls (see `art/blue.ts`).
const linden: Theme = { ...pattern(0x4f4f3c, warmLamp, (p) => mix(rgb(0xa8a360), rgb(0xd6d38e), grain(p, 56))), art: (arc) => husbyTexture(arc) };

// Akalla (Birgit Ståhl-Nyberg): the whole cave in warm yellow ochre, with
// grey stoneware pictures of everyday life on the walls (see `art/blue.ts`).
const ochre: Theme = { ...pattern(0x5a4a30, warmLamp, (p) => mix(rgb(0xa07a38), rgb(0xe2c070), grain(p, 58))), art: (arc) => akallaTexture(arc) };

// Huvudsta (Per Holmberg): a teal-green hanging garden over bare grey rock,
// a coloured frieze along the walls (see `art/blue.ts`), Y-shaped columns and
// harlequin cylinders hanging from the vault (see `details/blue.ts`).
const hangingGarden: Theme = { ...pattern(0x3e4a46, coolLamp, (p) => (p.y > 6.4 ? mix(rgb(0x1f5c4c), rgb(0x2e7a64), grain(p, 60)) : mix(rgb(0x5e5f5c), rgb(0x9a9c96), grain(p, 60)))), art: (arc) => huvudstaTexture(arc) };

// Solna strand (Takashi Naraha): the rock sprayed almost black, left bare so
// that the sky-blue cloud cubes break out of it (see `stationDetails.ts`).
const sky = pattern(0x3a3b3e, coolLamp, (p) => {
  const g = grain(p, 61, 0.5);
  if (p.y < 1.9 && Math.abs(p.z) > 8) return mix(rgb(0x1e1e20), rgb(0x2c2c2e), g);
  return mix(rgb(0x252527), rgb(0x4a4a4c), g);
});

// Sundbybergs centrum (Lars Kleen, Michael Söderlundh, Peter Tillberg): a
// dusty rose vault over dark natural rock, and building facades standing on
// the platform (see `details/blue.ts`).
const rose = pattern(0x4a3a36, warmLamp, (p) => {
  const g = grain(p, 62);
  if (p.y < 3.4 && Math.abs(p.z) > 8) return mix(rgb(0x2a2927), rgb(0x4a4744), g);
  return mix(rgb(0x7e5040), rgb(0xc2907a), g * 0.8 + 0.2);
});

// Duvbo (Gösta Sillén): dark rock with pale fossil reliefs (see `art/blue.ts`),
// under a red duct on red columns (see `details/blue.ts`).
const fossils: Theme = { ...pattern(0x38383a, coolLamp, (p) => mix(rgb(0x2c2c2a), rgb(0x4a4a46), grain(p, 63))), art: (arc) => duvboTexture(arc) };

// Rissne (Madeleine Dranger and Rolf H Reimers): a white station with the
// history of the world handwritten along the track walls (see `art/blue.ts`).
const timeline: Theme = { ...pattern(0x5c5a56, coolLamp, (p) => mix(rgb(0xd4d2cc), rgb(0xf0eee8), grain(p, 65))), art: (arc) => rissneTexture(arc) };

// Rinkeby (Nisse Zetterberg): rust-red rock with gold mosaics of runes and
// Viking finds (see `art/blue.ts`), and a gilded sun of oars in the vault (see `details/blue.ts`).
const treasure: Theme = { ...pattern(0x553428, warmLamp, (p) => mix(rgb(0x803a22), rgb(0xd88058), grain(p, 66, 0.6))), art: (arc) => rinkebyTexture(arc) };

// Tensta (Helga Henschen, "En ros till invandrarna"): naive animals, plants,
// a rose and a sun on white, and solidarity in eighteen languages (see `stationArt.ts`).
const mural: Theme = { ...pattern(0x57524c, warmLamp, (p) => {
  const g = grain(p, 68, 0.25);
  if (p.y < 1.3) return mix(rgb(0xd9d4c8), rgb(0xe9e4d8), g);
  return mix(rgb(0xece9e0), rgb(0xf7f5ef), g);
}), art: (arc) => tenstaTexture(arc) };

// Hjulsta: the plain grey cave, with paintings hung on its track walls (see `art/blue.ts`).
const paintings: Theme = { ...pattern(0x4a4a48, coolLamp, (p) => mix(rgb(0x4a4946), rgb(0xa8a6a0), grain(p, 69))), art: (arc) => hjulstaTexture(arc) };

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
    { name: 'Kungsträdgården', map: [0.565, 0.445], sl: 9340, riders: 9850, rise: 26, architecture: 'garden', exits: 'Kungsträdgården · Arsenalsgatan', halls: [{ end: 'outbound', from: 37, incline: true, exits: 'Jakobsgatan' }, { end: 'inbound', corridor: 16, incline: true, exits: 'Arsenalsgatan' }], look: { split: true }, theme: garden },
    {
      name: 'T-Centralen',
      map: [0.5, 0.45],
      sl: 9001,
      riders: 39800,
      rise: 21,
      architecture: 'vines',
      // Each track has a platform tunnel of its own, joined by the middle vaults.
      look: { split: true },
      exits: 'Vasagatan · Centralstation',
      halls: [{ end: 'outbound', exits: 'Vasagatan' }, { end: 'inbound', incline: true, exits: 'Sergels torg' }],
      transfer: text.announcements.tCentralenTransfer,
      service: 'staff',
      passage: text.busker.passage,
      theme: vines,
    },
    { name: 'Rådhuset', map: [0.455, 0.455], sl: 9309, riders: 13100, rise: 19, architecture: 'strata', look: { split: true }, exits: 'Kungsholmsgatan · Stadshuset', halls: [{ end: 'outbound', incline: true, exits: 'Polhemsgatan · Bergsgatan' }, { end: 'inbound', from: 36, corridor: 45, exits: 'Kungsklippan' }], service: 'shelter', theme: strata },
    { name: 'Fridhemsplan', map: [0.41, 0.445], sl: 9115, riders: 20250, rise: 21, architecture: 'harbour', look: { split: true }, exits: 'Drottningholmsvägen · S:t Eriksgatan', halls: [{ end: 'outbound', corridor: 18, incline: true, exits: 'Fridhemsgatan' }], transfer: text.announcements.fridhemsplanTransfer, theme: harbour },
    { name: 'Stadshagen', map: [0.38, 0.415], sl: 9307, riders: 14050, rise: 11, architecture: 'sport', look: { split: true }, exits: 'Stadshagsvägen · Mariedalsvägen', halls: [{ end: 'outbound', incline: true, exits: 'Sankt Göransgatan' }, { end: 'inbound', incline: true, exits: 'Stadshagens idrottsplats' }], theme: sport },
    { name: 'Västra skogen', map: [0.35, 0.385], sl: 9306, riders: 7850, rise: 33, architecture: 'forest', exits: 'Västra skogen · Solna', halls: [{ end: 'outbound', from: -51 }], theme: forest },
    // The branches. Their `riders` are estimates in the same spirit, not SL's figures.
    { name: 'Solna centrum', map: [0.345, 0.33], sl: 9305, riders: 11000, rise: 23, architecture: 'redSky', exits: 'Solna centrum · Solna stadshus', halls: [{ end: 'outbound', incline: true, exits: 'Frösundaleden' }, { end: 'inbound', from: 45 }], branch: '11', gap: JUNCTION_RUN, transfer: text.announcements.tvarbanaTransfer, look: { floor: 0xb8b8b4, split: true }, theme: redSky },
    { name: 'Näckrosen', map: [0.335, 0.285], sl: 9304, riders: 4000, rise: 13, architecture: 'rock', look: { split: true }, exits: 'Filmstaden · Råsundavägen', halls: [{ end: 'outbound', incline: true, exits: 'Storskogstorget' }, { end: 'inbound', corridor: 45, incline: true, exits: 'Råsundavägen' }], branch: '11', theme: lilies },
    { name: 'Hallonbergen', map: [0.32, 0.24], sl: 9303, riders: 6000, rise: 20, architecture: 'drawings', exits: 'Hallonbergens centrum', halls: [{ end: 'outbound', incline: true, exits: 'Lötsjövägen' }], branch: '11', theme: crayons },
    // Up on its viaduct in the open, between the tunnels from Hallonbergen and to Husby.
    { name: 'Kista', map: [0.3, 0.19], sl: 9302, riders: 16000, architecture: 'rock', exits: 'Kista Galleria · Kista centrum', halls: [{ end: 'inbound', from: -61, down: true }, { end: 'outbound', from: -55, down: true }], branch: '11', gap: KYMLINGE_RUN, open: true, theme: circuit },
    { name: 'Husby', map: [0.28, 0.15], sl: 9301, riders: 5500, rise: 30, architecture: 'rock', look: { split: true }, exits: 'Husby centrum', halls: [{ end: 'outbound', from: 33, incline: true }, { end: 'inbound', incline: true }], branch: '11', theme: linden },
    { name: 'Akalla', map: [0.26, 0.11], sl: 9300, riders: 5000, rise: 12, architecture: 'rock', look: { split: true }, exits: 'Akalla centrum', halls: [{ end: 'outbound', corridor: 10, incline: true }, { end: 'inbound', incline: true }], branch: '11', theme: ochre },
    { name: 'Huvudsta', map: [0.315, 0.37], sl: 9327, riders: 4500, rise: 17, architecture: 'rock', exits: 'Huvudsta centrum', halls: [{ end: 'outbound', incline: true }], branch: '10', gap: JUNCTION_RUN, look: { floor: 0x3a3b3d, columns: 'none' }, theme: hangingGarden },
    { name: 'Solna strand', map: [0.29, 0.355], sl: 9326, riders: 3000, rise: 20, architecture: 'cubes', exits: 'Solna strand · Huvudstaleden', halls: [{ end: 'outbound', incline: true }], branch: '10', look: { floor: 0xb4b4b0, columns: 'none' }, theme: sky },
    { name: 'Sundbybergs centrum', map: [0.26, 0.335], sl: 9325, riders: 10000, rise: 18, architecture: 'rock', exits: 'Sundbybergs torg · Pendeltåg', halls: [{ end: 'inbound', incline: true }, { end: 'outbound', incline: true, exits: 'Prästgårdsgatan' }], branch: '10', transfer: text.announcements.sundbybergTransfer, look: { floor: 0x8a4c44, split: true }, theme: rose },
    { name: 'Duvbo', map: [0.23, 0.315], sl: 9324, riders: 2500, rise: 19, architecture: 'rock', exits: 'Duvbo', halls: [{ end: 'inbound', incline: true, exits: 'Tulegatan' }], branch: '10', look: { floor: 0x55565a, columns: 'none' }, theme: fossils },
    { name: 'Rissne', map: [0.2, 0.295], sl: 9323, riders: 4500, rise: 24, architecture: 'rock', exits: 'Rissne centrum', halls: [{ end: 'outbound', incline: true, exits: 'Rissne torg' }], branch: '10', look: { floor: 0xe6e0d4, columns: 'none' }, theme: timeline },
    { name: 'Rinkeby', map: [0.17, 0.275], sl: 9322, riders: 8000, rise: 21, architecture: 'rock', look: { split: true }, exits: 'Rinkeby torg', halls: [{ end: 'inbound', incline: true }], branch: '10', theme: treasure },
    { name: 'Tensta', map: [0.14, 0.255], sl: 9321, riders: 7000, rise: 13, architecture: 'kinship', exits: 'Tensta centrum', halls: [{ end: 'outbound', incline: true }, { end: 'inbound', from: 37, exits: 'Tenstagången' }], branch: '10', look: { floor: 0x2a2a2c, split: true }, theme: mural },
    { name: 'Hjulsta', map: [0.11, 0.235], sl: 9320, riders: 3000, rise: 13, architecture: 'rock', exits: 'Hjulsta', halls: [{ end: 'inbound', corridor: 15, incline: true }], branch: '10', theme: paintings },
  ],
  trains: 4,
  summerRest: [2, 5],
};

/** The whole metro. */
export const NETWORK = buildNetwork([BLUE_LINE, RED_LINE, GREEN_LINE]);

/**
 * The track that joins the green line to the blue: it leaves the green line past Thorildsplan toward Fridhemsplan and
 * meets the blue line between Rådhuset and Fridhemsplan. No train in service takes it: in each tunnel it is a switch
 * in a cavern of its own and a tube leading off into the dark (`buildConnector`), and in the network view a thin line
 * between the two. Each end names its line, its tunnel's two stations and the one the branch leaves toward, `to`.
 */
export const CONNECTORS: ReadonlyArray<{ line: LineDef['id']; from: string; to: string }> = [
  { line: 'blue', from: 'Rådhuset', to: 'Fridhemsplan' },
  { line: 'green', from: 'Thorildsplan', to: 'Fridhemsplan' },
];

/** Every train slot of the network for `Operations` (see `serviceSlots`). */
export function networkSlots(net: Network, services: LineService[], spares: readonly number[] = []): ServiceSlot[] {
  return serviceSlots(net.lines, net.layout, services, spares);
}
