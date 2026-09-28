import { SIGN_LAYOUT, STATION_ROCK_INSET } from '../layout';
import text from '../i18n/sv.json';
import { BoxGeometry, CircleGeometry, CylinderGeometry, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three';
import { brokenTube } from '../calendar';
import { buildClutter, type StationClutter } from './clutter';
import { escalatorSteps, type EscalatorZone } from './escalator';
import { shiftZ } from './shifted';
import { buildWalkway, WALKWAY, walkwayZones, type WalkwayEnd } from './walkway';
import { openGround } from './outdoor';
import type { OsmPatch } from './osm';
import { buildCity, cityAnchors, cityHouse, railings } from './city';
import type { BoxFace, MeshBuilder } from '../gfx/builder';
import { rgb, type RGB } from '../gfx/color';
import { createCanvasSign, drawBullet, fitText, FONT, MONO, redraw, SIGN_BG, SIGN_FG, type CanvasSign } from '../gfx/signs';
import {
  STATION_DESIGN,
  CAVE_BOTTOM,
  CAVE_HALF_L,
  CAVE_HALF_W,
  CAVE_TOP,
  CAVE_WALL_H,
  ESC_HALF_W,
  ESC_HEADROOM,
  HALL_H,
  HALL_HALF_W,
  HALL_LEN,
  PASSAGE_LAYOUT,
  STREET,
  TRANSFER_LAYOUT,
  PLATFORM_HALF_L,
  PLATFORM_HALF_W,
  PLATFORM_Y,
  TRACK_Z,
  TRAIN_HALF_L,
  TRAIN_HALF_W,
  TRAIN_NOSE,
  LANE,
  TUBE_BOTTOM,
  TUBE_HALF_W,
  TUBE_TOP,
  TUBE_WALL_H,
} from '../layout';
import { isOutdoor, onRoute, routeStations, stationRise, type LineDef, type Network } from '../line';
import type { Physics } from '../physics';
import { addTrack, PAINT } from './parts';
import { Section } from './section';
import { gardenFloorTexture, terrazzoTexture, tileTexture } from '../gfx/textures';
import { drawPoster } from '../gfx/posters';
import { hash01 } from '../clock';
import type { Interactable, Zone } from './zones';
import { stationArchitecture } from './stationDetails';
import { TILED_WALL_H, TILED_TOP, VAULT_WALL_H, VAULT_TOP } from '../lines/theme';
import { archHole, archProfile, extrudeRockSteps, profileLength, rectHole, wallWithHoles, type ProfilePoint } from './shapes';
import { place, textSign } from './signage';
import { buildStreet, type Street } from './street';
import { buildServiceAccess, SERVICE_DOOR } from './service';
import { buildKiosk } from './kiosk';
import { buildTravelators } from './travelator';
import { artWalk } from '../artWalk';
import { era } from '../era';

const SERVICE_GATE = 0.6;
/** What lights an open-air station besides the sky and its lamps. */
const OPEN_AMBIENT = rgb(0x4a4a4a);

/** One platform clock that has always been two minutes fast. Nobody has fixed it. */
const FAST_CLOCK = { station: 2, clock: 0, minutes: 2 };

function fastBy(clock: ClockFace, minutes: number): ClockFace {
  const total = (clock.hour * 60 + clock.minute + minutes) % (24 * 60);
  return { hour: Math.floor(total / 60), minute: total % 60, second: clock.second };
}

/** Information pillars, relative to the station center. */
export const PILLAR_DXS = [-40, -12, 12, 40];

/** Bench centers along the platform, clear of the piers. Each has a litter bin at +1.6. */
export function benchXs(cx: number): number[] {
  const xs: number[] = [];
  for (let k = -3; k <= 3; k++) {
    const bx = cx + k * 18 + 9;
    if (Math.abs(bx - cx) > 60) continue;
    if (STATION_DESIGN.pierXs.some((x) => Math.abs(bx - cx - x) < 4)) continue;
    xs.push(bx);
  }
  return xs;
}

/** A row on a platform board: one train, or a word for a track with none (then `line` is empty). */
export interface DepartureRow {
  /** The track's number on the platform signs. */
  track: number;
  /** The route number, as SL's boards lead with it. */
  line: string;
  destination: string;
  eta: string;
}

/** The amber of SL's LED boards. */
const AMBER = '#ffab2e';

export interface DepartureNotice {
  title: string;
  detail: string;
}

export interface ClockFace {
  hour: number;
  minute: number;
  second: number;
}

/** Ticket gates across the hall. The paid side faces the escalators. */
export interface GateLine {
  /** World x of the gate line's paid and unpaid faces. */
  paidX: number;
  unpaidX: number;
  y: number;
  /** Passage centers (z) and their half width. */
  passages: number[];
  halfWidth: number;
  /** Height of the flaps; the posts beside them are a little taller. */
  flapHeight: number;
}

/** The way out at the top of the exit stairs: up onto the street underground, out through a door onto it in the open. */
export interface StreetExit {
  /** The street, once the station is built (the dry pass leaves it null). */
  street: Street | null;
  /** World x of the doorway plane, and the direction out of the station. */
  x: number;
  dir: 1 | -1;
  sillY: number;
  halfWidth: number;
  height: number;
  /** Stair foot, in world x. */
  stairX: number;
  /** The top of the stairs is open to the sky: this far in from the doorway, and the sky this high. */
  open: number;
  top: number;
  /** How far out the open cut of the second flight runs beyond the doorway, up to the street (0 without one). */
  cut: number;
}

/** A passage off the ticket hall toward the commuter trains, with a spot for a busker. */
export interface Passage {
  busker: Vector3;
  /** The direction the busker faces. */
  yaw: number;
  zone: Zone;
  /** The walkable floor between the tiled walls: from the hall (`z0`) to the end wall (`z1`). */
  bounds: { x0: number; x1: number; z0: number; z1: number; y: number };
  /** World z of the gate line to the commuter trains. */
  gateZ: number;
  interactables: Interactable[];
  /** World x at `a` meters across the passage (see `PASSAGE_LAYOUT`). */
  X: (a: number) => number;
}

export interface StationInfo {
  index: number;
  name: string;
  cx: number;
  exitDir: 1 | -1;
  /** The escalators up from the platform (the first of them where there are two). */
  escalator: EscalatorZone;
  escalators: EscalatorZone[];
  /** Where each island platform's middle lies: z = 0, or both of a shared station's (see `LANE`). */
  platforms: number[];
  /** Every track along a platform, as the departure boards list them: `setDepartures` takes each one's rows, in this order, by `number`. */
  platformTracks: Array<{ z: number; track: 1 | 2; line: number; number: number }>;
  /** How far the escalators climb from the platform to the ticket hall (see `StationDef.rise`). */
  rise: number;
  /** The ticket hall's extent along x and its floor. */
  hall: { x0: number; x1: number; y: number };
  gates: GateLine;
  exit: StreetExit;
  passage: Passage | null;
  spawn: Vector3;
  zones: Zone[];
  interactables: Interactable[];
  /** Walkways from the ticket hall to the same station on another line (see `walkway.ts`): that station, and this end. */
  walkways: Array<{ to: number; end: WalkwayEnd }>;
  /** Posters, stickers and notices that change with the day. */
  clutter: StationClutter;
  /** The one fluorescent tube that flickers, with its own material. */
  tube: Mesh;
  /** @param banner red text in the header: the last trains in the evening, or SL's traffic information */
  setDepartures(rows: DepartureRow[], notice?: DepartureNotice | null, banner?: string): void;
  /** Redraws the platform clocks. */
  setTime(clock: ClockFace): void;
  /** What the boards and clocks last showed, for a station whose geometry is built later. */
  lastDepartures?: [DepartureRow[], DepartureNotice | null | undefined, string | undefined];
  lastTime?: ClockFace;
}

const SLAB = rgb(0xffffff);
const EDGE = rgb(0xece8dc);
const PLATFORM_SIDE = rgb(0x4f4c47);
const BENCH_WOOD = rgb(0x8a5a36);
const BENCH_METAL = rgb(0x2e4a75);
/** A ticket hall's walls: a dark blue dado, pale above it. */
const hallWall = (floorY: number) => (p: Vector3): RGB => (p.y - floorY < 1.2 ? rgb(0x39516e) : rgb(0xd9d5ca));
const HALL_FLOOR = (p: Vector3): RGB => ((Math.floor(p.x / 1.2) + Math.floor(p.z / 1.2)) & 1 ? rgb(0x8d8980) : rgb(0x7a766e));
const GATE = (_p: Vector3, n: Vector3): RGB => (n.y > 0.5 ? rgb(0x2a2d31) : rgb(0xaab1b8));
/** The card readers on the gates: a yellow pad on a dark base. */
const READER = (_p: Vector3, n: Vector3): RGB => (n.y > 0.5 ? rgb(0xf2c230) : rgb(0x1d2024));
const STEP = (_p: Vector3, n: Vector3): RGB => (n.y > 0.5 ? rgb(0x8a857c) : rgb(0xc9b04a));
/** Along the hall, where the exit stairs open to the sky: the stairs climb from 19 to 26, the landing runs on to the end. */
const OPEN_A = 23;

function nameBoard(name: string, line: LineDef): CanvasSign {
  return createCanvasSign(1024, 192, (ctx, w, h) => {
    ctx.fillStyle = SIGN_BG;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f7f7f3';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = line.color;
    ctx.fillRect(0, 0, 12, h);
    ctx.fillRect(w - 12, 0, 12, h);
    ctx.fillStyle = '#171c23';
    fitText(ctx, name, w - 90, 500, 112);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, w / 2, h / 2 + 3);
  });
}

function directionFace(left: string, right: string): CanvasSign {
  return createCanvasSign(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = SIGN_BG;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff22';
    ctx.fillRect(w / 2 - 2, 14, 4, h - 28);
    ctx.fillStyle = SIGN_FG;
    ctx.textBaseline = 'middle';
    fitText(ctx, left, w / 2 - 40, 600, 46);
    ctx.textAlign = 'left';
    ctx.fillText(left, 24, h / 2);
    fitText(ctx, right, w / 2 - 40, 600, 46);
    ctx.textAlign = 'right';
    ctx.fillText(right, w - 24, h / 2);
  });
}

/** The time machine's 1975: a split-flap board, white letters on black flaps. */
function drawFlaps(ctx: CanvasRenderingContext2D, w: number, h: number, rows: DepartureRow[], notice?: DepartureNotice | null): void {
  ctx.fillStyle = '#0b0c0d';
  ctx.fillRect(0, 0, w, h);
  // One train per track, as the old boards had it.
  const first = rows.filter((r, i) => rows.findIndex((o) => o.track === r.track) === i);
  const lines = notice ? [notice.title, notice.detail] : first.slice(0, 2).map((r) => `${r.track} ${r.line} ${r.destination}`.replace(/ +/g, ' ').padEnd(22).slice(0, 22) + r.eta.padStart(6).slice(-6));
  const cols = 28;
  const cw = (w - 40) / cols;
  const ch = h / 2 - 34;
  lines.forEach((line, row) => {
    const text = line.toUpperCase().padEnd(cols).slice(0, cols);
    const y = 24 + row * (ch + 20);
    for (let k = 0; k < cols; k++) {
      const x = 20 + k * cw;
      ctx.fillStyle = '#1d1f22';
      ctx.fillRect(x + 1, y, cw - 2, ch);
      ctx.fillStyle = '#0b0c0d';
      ctx.fillRect(x + 1, y + ch / 2 - 1, cw - 2, 2);
      const c = text[k];
      if (c === ' ') continue;
      ctx.fillStyle = '#f1efe6';
      ctx.font = `700 ${Math.round(ch * 0.78)}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c, x + cw / 2, y + ch / 2 + 2);
    }
  });
}

export function drawDepartures(ctx: CanvasRenderingContext2D, w: number, h: number, rows: DepartureRow[], notice?: DepartureNotice | null, banner?: string): void {
  if (era.past) { drawFlaps(ctx, w, h, rows, notice); return; }
  ctx.fillStyle = '#07090a';
  ctx.fillRect(0, 0, w, h);
  if (notice) {
    // Night: one line of amber text on the dark board.
    ctx.fillStyle = AMBER;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, notice.title, w - 60, 600, 54, MONO);
    ctx.fillText(notice.title, w / 2, h * 0.38);
    ctx.fillStyle = '#c99a3a';
    fitText(ctx, notice.detail, w - 60, 500, 40, MONO);
    ctx.fillText(notice.detail, w / 2, h * 0.72);
    ctx.fillStyle = '#11161538';
    for (let x = 0; x < w; x += 5) ctx.fillRect(x, 0, 1, h);
    return;
  }
  // SL's boards are all amber on black: each track's next trains, route number first, the minutes at the right edge.
  const ticker = banner ? h * 0.2 : 0;
  const rowH = (h - ticker - 16) / Math.max(rows.length, 2);
  const size = Math.min(56, Math.round(rowH * 0.72));
  ctx.textBaseline = 'middle';
  rows.forEach((r, i) => {
    const y = 8 + rowH * (i + 0.5);
    const first = i === 0 || rows[i - 1].track !== r.track;
    // A hairline between the tracks' groups; the track number stands dim beside its first row.
    if (first && i > 0) {
      ctx.fillStyle = '#3a2a10';
      ctx.fillRect(20, 8 + rowH * i - 1, w - 40, 2);
    }
    ctx.fillStyle = '#8a6424';
    ctx.textAlign = 'left';
    ctx.font = `600 ${Math.round(size * 0.6)}px ${MONO}`;
    if (first) ctx.fillText(String(r.track), 20, y);
    ctx.fillStyle = AMBER;
    ctx.font = `700 ${size}px ${MONO}`;
    ctx.fillText(r.line, 64, y);
    ctx.textAlign = 'right';
    ctx.fillText(r.eta, w - 24, y);
    const eta = ctx.measureText(r.eta).width;
    const from = r.line ? 64 + size * 2.1 : 64;
    ctx.textAlign = 'left';
    fitText(ctx, r.destination, w - 24 - eta - 30 - from, 700, size, MONO);
    ctx.fillText(r.destination, from, y);
  });
  // The bottom line carries the notices: the last trains, a disruption, the weather.
  if (banner) {
    ctx.fillStyle = '#3a2a10';
    ctx.fillRect(20, h - ticker - 2, w - 40, 2);
    ctx.fillStyle = '#d99a2b';
    ctx.textAlign = 'center';
    fitText(ctx, banner, w - 48, 600, Math.round(ticker * 0.6), MONO);
    ctx.fillText(banner, w / 2, h - ticker / 2);
  }
  // A subtle pixel matrix gives the amber display the familiar LED surface.
  ctx.fillStyle = '#11161538';
  for (let x = 0; x < w; x += 5) ctx.fillRect(x, 0, 1, h);
}

export function drawClock(ctx: CanvasRenderingContext2D, w: number, h: number, date: ClockFace): void {
  const r = w / 2;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#f7f7f4';
  ctx.beginPath();
  ctx.arc(r, r, r - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(r, r);
  ctx.fillStyle = '#16181b';
  for (let i = 0; i < 60; i++) {
    const long = i % 5 === 0;
    ctx.save();
    ctx.rotate((i / 60) * Math.PI * 2);
    ctx.fillRect(long ? -4 : -1.5, -r + 10, long ? 8 : 3, long ? 26 : 10);
    ctx.restore();
  }
  const hand = (angle: number, len: number, width: number, color: string) => {
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.fillRect(-width / 2, -len, width, len + 14);
    ctx.restore();
  };
  const s = date.second;
  const m = date.minute + s / 60;
  const hr = (date.hour % 12) + m / 60;
  hand((hr / 12) * Math.PI * 2, r * 0.5, 12, '#16181b');
  hand((m / 60) * Math.PI * 2, r * 0.75, 8, '#16181b');
  hand((s / 60) * Math.PI * 2, r * 0.8, 3, '#c0392b');
  ctx.restore();
}

let stopMarkSign: CanvasSign | null = null;

/** A white stop board with the train type it applies to. */
function stopMark(): CanvasSign {
  stopMarkSign ??= createCanvasSign(160, 200, (ctx, w, h) => {
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#141414';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText(text.driver.stopSign.toUpperCase(), w / 2, h * 0.36);
    ctx.font = `700 46px ${FONT}`;
    ctx.fillText('C20', w / 2, h * 0.68);
  });
  return stopMarkSign;
}

/**
 * Where each station of a line sits on its line map, in a `w` x `h` frame:
 * the stations' places on the network map, stretched to fill the frame.
 * Also used for the platforms' line maps.
 */
export function mapLayout(line: LineDef, w: number, h: number): Array<{ x: number; y: number; label: 'above' | 'below' }> {
  const xs = line.stations.map((s) => s.map[0]);
  const ys = line.stations.map((s) => s.map[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return line.stations.map((s, i) => ({
    x: w * 0.07 + (w * 0.86 * (s.map[0] - x0)) / (x1 - x0 || 1),
    y: h * 0.3 + (h * 0.55 * (s.map[1] - y0)) / (y1 - y0 || 1),
    label: i % 2 ? 'below' : 'above',
  }));
}

/** The whole network map's size, in pixels of the HUD map (which shows a window of it around the player). */
export const NETWORK_MAP = { w: 1500, h: 1150 };

/** Where each station of the network sits on the HUD map, in `NETWORK_MAP` pixels. */
export function networkMapLayout(net: Network): Array<{ x: number; y: number; label: 'above' | 'below' }> {
  return net.stations.map((s, i) => ({ x: s.map[0] * NETWORK_MAP.w, y: s.map[1] * NETWORK_MAP.h, label: i % 2 ? 'below' : 'above' }));
}

function lineMap(line: LineDef, here: number): CanvasSign {
  return createCanvasSign(1024, 448, (ctx, w, h) => {
    ctx.fillStyle = '#f4f2ec';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1b1b1b';
    ctx.font = `700 40px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(line.name, 36, 26);
    line.bullets.forEach((b, i, all) => drawBullet(ctx, w - 70 - (all.length - 1 - i) * 62, 52, 26, b, line.color));
    const spots = mapLayout(line, w, h);
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [r] of line.routes.entries()) {
      const path = routeStations(line, r);
      ctx.beginPath();
      path.forEach((i, k) => (k ? ctx.lineTo(spots[i].x, spots[i].y) : ctx.moveTo(spots[i].x, spots[i].y)));
      ctx.stroke();
    }
    line.stations.forEach((s, i) => {
      const { x, y, label } = spots[i];
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#1b1b1b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, i === here ? 15 : 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1b1b1b';
      ctx.font = `${i === here ? 700 : 500} ${i === here ? 24 : 19}px ${FONT}`;
      ctx.save();
      ctx.translate(x, y + (label === 'above' ? -18 : 18));
      ctx.rotate(-0.5);
      ctx.textAlign = label === 'above' ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.name, label === 'above' ? 0 : 0, 0);
      ctx.restore();
    });
    const ghost = line.ghost && spots[line.stations.findIndex((s) => s.name === line.ghost!.from)];
    if (ghost && line.ghost) {
      ctx.fillStyle = '#9a968c';
      ctx.font = `italic 500 16px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`(${line.ghost.name})`, ghost.x + 12, ghost.y + 24);
    }
    const me = spots[here];
    if (me) {
      ctx.fillStyle = '#c0392b';
      ctx.font = `700 22px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('Du är här', me.x, me.y + (me.label === 'above' ? 22 : -46));
    }
  });
}

/** The art walk plaque: a heading, the station, a title and the text. */
function artSign(station: string, title: string, body: string): CanvasSign {
  return createCanvasSign(384, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f4f2ec';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1d2a3a';
    ctx.fillRect(0, 0, w, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 22px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.art.heading, 20, 32);
    ctx.fillStyle = '#1d2a3a';
    ctx.textBaseline = 'top';
    ctx.font = `500 18px ${FONT}`;
    ctx.fillText(station, 20, 82);
    fitText(ctx, title, w - 40, 800, 34);
    ctx.fillText(title, 20, 108);
    ctx.font = `400 17px ${FONT}`;
    let y = 160;
    let line = '';
    for (const word of body.split(' ')) {
      if (line && ctx.measureText(line + word).width > w - 40) { ctx.fillText(line.trim(), 20, y); line = ''; y += 23; }
      line += word + ' ';
    }
    ctx.fillText(line.trim(), 20, y);
  });
}

/**
 * Builds one cave station: rock vault, island platform, tracks, lamps, signs,
 * an escalator shaft at the exit end and a ticket hall at the top.
 */
/** @param dry lay colliders and work out positions only (see `Section`) */
export function buildStation(physics: Physics, net: Network, index: number, cx: number, exitDir: 1 | -1, dry = false): StationBuild {
  const steps = stationSteps(physics, net, index, cx, exitDir, dry);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

export interface StationBuild {
  group: Group;
  info: StationInfo;
}

/**
 * `buildStation` in steps: the rock, the furnishing, the escalators, the hall
 * and then one baked layer at a time, so a station built while the player
 * rides toward it spreads its cost over several frames. `osm`, for a station
 * in the open, is the real buildings round it.
 */
export function* stationSteps(physics: Physics, net: Network, index: number, cx: number, exitDir: 1 | -1, dry = false, osm: OsmPatch | null = null): Generator<void, StationBuild> {
  const def = net.stations[index];
  const line = net.lines[def.line];
  // Above ground: a platform under a canopy, fences and the open air instead of a cave.
  const outdoor = isOutdoor(net, index);
  const s = new Section(def.name, outdoor ? OPEN_AMBIENT : def.theme.ambient, dry, outdoor);
  const e = exitDir;
  const theme = def.theme;
  const xa = cx - CAVE_HALF_L;
  const xb = cx + CAVE_HALF_L;

  // A station shared by two lines has four tracks and two island platforms:
  // its own line's tracks inside, the other's beyond them (see `LANE`).
  const twin = def.lines.length > 1;
  const halfW = twin ? CAVE_HALF_W + LANE : CAVE_HALF_W;
  const islands = twin ? [-LANE, LANE] : [0];
  const trackZs = twin ? [-TRACK_Z - LANE, -TRACK_Z, TRACK_Z, TRACK_Z + LANE] : [-TRACK_Z, TRACK_Z];
  /** The island a track's doors open onto. */
  const islandOf = (z: number) => islands.reduce((best, zc) => (Math.abs(zc - z) < Math.abs(best - z) ? zc : best));

  // Rock vault: blasted rock, sprayed and painted. Stations with an artwork
  // get it as a texture mapped along the vault.
  // A tiled box has straight walls where the rock's deepest bulge would reach, and a low, nearly flat ceiling.
  const tiled = def.architecture === 'tiles';
  const vaulted = tiled && def.look?.ceiling === 'vault';
  // A shared station's two halves each get their own vault, over a platform and its two tracks, with solid ground between.
  const inner = TRACK_Z - TRAIN_HALF_W - 1.5;
  const outer = halfW - STATION_ROCK_INSET;
  const profiles = vaulted
    ? (twin ? [-1, 1].map((side) => archProfile(side * (inner + outer) / 2, (outer - inner) / 2, VAULT_WALL_H, VAULT_TOP, CAVE_BOTTOM, 44, 0.3)) : [archProfile(0, outer, VAULT_WALL_H, VAULT_TOP, CAVE_BOTTOM, 44, 0.3)])
    : [tiled ? archProfile(0, outer, TILED_WALL_H, TILED_TOP, CAVE_BOTTOM, 44, 0.3) : archProfile(0, halfW, CAVE_WALL_H, CAVE_TOP, CAVE_BOTTOM, 44, 0.6)];
  const wallTop = vaulted ? VAULT_WALL_H : tiled ? TILED_WALL_H : CAVE_WALL_H;
  const rock = tiled
    ? { step: 0.3, amplitude: 0, smooth: true, seed: index * 13 + 3 }
    : { step: 0.48, amplitude: 1.55, inset: STATION_ROCK_INSET, rounds: 4.8, seed: index * 13 + 3 };
  if (tiled && !outdoor) for (const side of [-1, 1]) physics.box({ x: xa, y: -1, z: Math.min(side * outer, side * halfW) }, { x: xb, y: 14, z: Math.max(side * outer, side * halfW) });
  for (const profile of outdoor ? [] : profiles) {
    // The artwork is painted (and cached) in the dry pass already, behind the loading screen: painted on the way it
    // would hold up a frame for as long as 50 ms, and far longer on a phone.
    const art = theme.art?.(profileLength(profile), wallTop - CAVE_BOTTOM);
    if (dry) continue;
    if (art) yield* extrudeRockSteps(s.artLayer(art.texture), profile, xa, xb, { ...rock, artPeriod: art.period }, rgb(0xf4f4f4));
    else yield* extrudeRockSteps(s.lit, profile, xa, xb, rock, theme.paint);
    yield;
  }

  // In the open air, a station building stands over the escalator at the exit end.
  if (outdoor) for (const zi of islands) {
    const wx = cx + e * CAVE_HALF_L;
    const B = { half: PLATFORM_HALF_W - 0.4, top: PLATFORM_Y + ESC_HEADROOM + 2.2 };
    const front: ProfilePoint[] = [
      { z: zi - B.half, y: 0, nz: -1, ny: 0 }, { z: zi - B.half, y: B.top, nz: -1, ny: 0 },
      { z: zi + B.half, y: B.top, nz: 1, ny: 0 }, { z: zi + B.half, y: 0, nz: 1, ny: 0 },
    ];
    wallWithHoles(s.lit, wx, front, [rectHole(zi - ESC_HALF_W, zi + ESC_HALF_W, PLATFORM_Y, PLATFORM_Y + ESC_HEADROOM)], rgb(0xb8b2a6));
    const xo0 = e > 0 ? wx : wx - 1;
    const xo1 = e > 0 ? wx + 1 : wx;
    physics.box({ x: xo0, y: -1, z: zi - B.half }, { x: xo1, y: B.top, z: zi - ESC_HALF_W });
    physics.box({ x: xo0, y: -1, z: zi + ESC_HALF_W }, { x: xo1, y: B.top, z: zi + B.half });
    physics.box({ x: xo0, y: PLATFORM_Y + ESC_HEADROOM, z: zi - ESC_HALF_W }, { x: xo1, y: B.top, z: zi + ESC_HALF_W });
  }

  // End walls: tunnel mouths on both, the escalator openings at the exit end.
  for (const end of outdoor ? [] : [-1, 1] as const) {
    const wx = cx + end * CAVE_HALF_L;
    const holes = trackZs.map((zc) => archHole(zc, TUBE_HALF_W, TUBE_WALL_H, TUBE_TOP, TUBE_BOTTOM));
    // Openings below the tubes' top: the escalators, or the staff door (a shared station has none).
    const openings: Array<[number, number, number]> = [];
    if (end === e) for (const zc of islands) openings.push([zc - ESC_HALF_W, zc + ESC_HALF_W, PLATFORM_Y + ESC_HEADROOM]);
    else if (!twin) openings.push([-SERVICE_DOOR.halfWidth, SERVICE_DOOR.halfWidth, SERVICE_DOOR.height]);
    for (const [z0, z1, top] of openings) holes.push(rectHole(z0, z1, end === e ? PLATFORM_Y : 0, top));
    // Each vault's end wall takes the openings within it.
    for (const profile of profiles) {
      const lo = Math.min(...profile.map((p) => p.z));
      const hi = Math.max(...profile.map((p) => p.z));
      wallWithHoles(s.lit, wx, profile, holes.filter((h) => h.every(([hz]) => hz > lo && hz < hi)), theme.paint);
    }

    const xo0 = end > 0 ? wx : wx - 1;
    const xo1 = end > 0 ? wx + 1 : wx;
    // Solid wall between the openings, and lintels over them up to the tubes' top.
    const gaps = [...trackZs.map((zc) => [zc - TUBE_HALF_W, zc + TUBE_HALF_W, TUBE_TOP]), ...openings].sort((a, b) => a[0] - b[0]);
    let z = -halfW - 1;
    for (const [z0, z1, top] of gaps) {
      if (z0 > z) physics.box({ x: xo0, y: -1, z }, { x: xo1, y: 14, z: z0 });
      physics.box({ x: xo0, y: top, z: z0 }, { x: xo1, y: 14, z: z1 });
      z = Math.max(z, z1);
    }
    physics.box({ x: xo0, y: -1, z }, { x: xo1, y: 14, z: halfW + 1 });
  }

  // Each stage below ends with a yield, so a station built on the way stays within a frame per stage.
  yield;
  // Trackbed, tracks and the island platforms.
  s.lit.box({ x: xa, y: -0.5, z: -halfW }, { x: xb, y: 0, z: halfW }, PAINT.ballast, ['ny']);
  // In the city by the water, railings and Riddarfjärden; elsewhere fences and the suburbs.
  if (outdoor && def.city) {
    railings(s, physics, xa, xb, halfW);
    yield;
    buildCity(s, xa, xb, halfW, cityAnchors(net));
  } else if (outdoor) openGround(s, physics, xa, xb, index * 17 + 5, true, osm ? [osm] : []);
  yield;
  for (const zc of trackZs) addTrack(s, xa, xb, zc, true);
  yield;
  const p0 = e > 0 ? cx - PLATFORM_HALF_L : xa;
  const p1 = e > 0 ? xb : cx + PLATFORM_HALF_L;
  physics.box({ x: xa, y: -1, z: -halfW }, { x: xb, y: -0.02, z: halfW });
  physics.box({ x: xa, y: -1, z: halfW }, { x: xb, y: 14, z: halfW + 1 });
  physics.box({ x: xa, y: -1, z: -halfW - 1 }, { x: xb, y: 14, z: -halfW });
  const farEnd = e > 0 ? p0 : p1;
  // Platform surface, from the center out: stone slabs, a tactile strip,
  // more slabs, then a pale edge line.
  const W = PLATFORM_HALF_W;
  for (const zi of islands) {
    const top = (b: MeshBuilder, z0: number, z1: number, paint: RGB) => {
      for (const side of [-1, 1]) {
        const a = zi + side * z0;
        const c = zi + side * z1;
        b.box({ x: p0, y: PLATFORM_Y - 0.02, z: Math.min(a, c) }, { x: p1, y: PLATFORM_Y, z: Math.max(a, c) }, paint, ['ny', 'pz', 'nz', 'px', 'nx']);
      }
    };
    // Stone slabs, or poured terrazzo in the station's colour.
    const slabs = def.look?.floor !== undefined ? s.artLayer(terrazzoTexture()) : s.floor;
    const slab = def.look?.floor !== undefined ? rgb(def.look.floor) : SLAB;
    top(def.architecture === 'garden' ? s.artLayer(gardenFloorTexture()) : slabs, 0, W - 1.1, slab);
    top(s.tactile, W - 1.1, W - 0.7, rgb(0xffffff));
    top(slabs, W - 0.7, W - 0.14, slab);
    top(s.lit, W - 0.14, W, EDGE);
    // The platform lip overhangs the track slightly and casts a dark shadow line: the body under the lip is set back
    // behind the dark faces, so no two faces share the edge's plane.
    s.lit.box({ x: p0, y: PLATFORM_Y - 0.25, z: zi - W }, { x: p1, y: PLATFORM_Y - 0.02, z: zi + W }, PLATFORM_SIDE, ['py', 'ny']);
    s.lit.box({ x: p0, y: 0, z: zi - W + 0.25 }, { x: p1, y: PLATFORM_Y - 0.25, z: zi + W - 0.25 }, PLATFORM_SIDE, ['py', 'ny']);
    for (const side of [-1, 1]) {
      const z = zi + side * W;
      s.lit.box({ x: p0, y: 0, z: Math.min(z, z - side * 0.25) }, { x: p1, y: PLATFORM_Y - 0.25, z: Math.max(z, z - side * 0.25) }, rgb(0x1c1b1a), ['py']);
    }
    physics.box({ x: p0, y: -1, z: zi - PLATFORM_HALF_W }, { x: p1, y: PLATFORM_Y, z: zi + PLATFORM_HALF_W });

    // Fence and warning at the far platform end. On a station's own island a
    // gate in the middle stands open onto steps down to the staff door.
    for (const side of [-1, 1]) {
      const z0 = zi + side * PLATFORM_HALF_W;
      const z1 = zi + side * (twin || outdoor ? 0 : SERVICE_GATE + 0.04);
      s.lit.box({ x: farEnd - 0.05, y: PLATFORM_Y, z: Math.min(z0, z1) }, { x: farEnd + 0.05, y: PLATFORM_Y + 1.1, z: Math.max(z0, z1) }, rgb(0xd9b93b));
      physics.box({ x: farEnd - 0.1, y: PLATFORM_Y, z: Math.min(z0, z1) }, { x: farEnd + 0.1, y: PLATFORM_Y + 2.2, z: Math.max(z0, z1) });
    }
  }
  if (twin && !outdoor) {
    // A wall between the two lines' inner tracks, up to the ceiling (under vaults, the ground between them).
    if (!vaulted) s.lit.box({ x: xa, y: 0, z: -inner }, { x: xb, y: TILED_TOP + 0.2, z: inner }, theme.paint);
    physics.box({ x: xa, y: -1, z: -inner }, { x: xb, y: 14, z: inner });
  }
  yield;
  if (!twin && !outdoor) buildServiceAccess(s, physics, cx, e);
  const warn = textSign('Obehöriga äga ej tillträde', 768, 128, '#f2f2f2', '#b3261e');
  for (const zi of islands) {
    place(s, warn, 2.8, 0.47, new Vector3(farEnd + e * 0.08, PLATFORM_Y + 1.5, zi), new Vector3(e, 0, 0));
    if (!twin && !outdoor) for (const z of [-1.3, 1.3]) s.lit.box({ x: farEnd - 0.03, y: PLATFORM_Y + 1.1, z: z - 0.03 }, { x: farEnd + 0.03, y: PLATFORM_Y + 1.28, z: z + 0.03 }, rgb(0xd9b93b));
  }

  // Paired continuous fluorescent troughs frame each boarding side.
  const lampColor = theme.lamp;
  const RAIL = STATION_DESIGN.lightingY;
  const tubeXs: number[] = [];
  for (let x = p0 + 3; x < p1 - 2; x += 4.5) tubeXs.push(x);
  // One tube flickers and hums: it has its own material instead of the baked layer.
  const broken = brokenTube(index, tubeXs.length);
  const tube = new Mesh(new BoxGeometry(3.9, 0.045, 0.19), new MeshBasicMaterial({ color: 0xf2f5ee }));
  tube.name = 'flickering-tube';
  tube.position.set(tubeXs[broken], RAIL - 0.0225, islands[islands.length - 1] + STATION_DESIGN.lightingZ);
  s.extras.add(tube);
  for (const [k0, zi] of islands.entries()) {
    for (const side of [-1, 1]) {
      const z = zi + side * STATION_DESIGN.lightingZ;
      s.lit.box({ x: p0, y: RAIL, z: z - 0.19 }, { x: p1, y: RAIL + 0.2, z: z + 0.19 }, rgb(0x555b5b));
      for (const [k, x] of tubeXs.entries()) {
        if (side > 0 && k === broken && k0 === islands.length - 1) { s.light(x, RAIL - 0.2, z, lampColor, 0.4, 8); continue; }
        s.unlit.box({ x: x - 1.95, y: RAIL - 0.045, z: z - 0.095 }, { x: x + 1.95, y: RAIL, z: z + 0.095 }, rgb(0xf2f5ee));
        s.light(x, RAIL - 0.2, z, lampColor, 0.62, 8);
        s.light(x, RAIL + 0.6, z, lampColor, 0.65, 10);
      }
      for (let x = p0 + 5; x < p1; x += 14) {
        s.lit.box({ x: x - 0.025, y: RAIL + 0.2, z: z - 0.025 }, { x: x + 0.025, y: CAVE_TOP, z: z + 0.025 }, PAINT.fixture);
        s.lit.box({ x: x - 0.15, y: RAIL - 0.28, z: z - 0.12 }, { x: x + 0.15, y: RAIL, z: z + 0.12 }, rgb(0x24282d));
      }
    }
  }
  yield;
  if (outdoor) {
    // A canopy over the platform on steel posts.
    const roofY = STATION_DESIGN.lightingY + 0.3;
    const post = def.look?.columnColor !== undefined ? rgb(def.look.columnColor) : rgb(0x4a5058);
    // A shared station in the open, as Gamla stan, has one concrete roof on beams over all four tracks.
    if (twin) {
      s.lit.box({ x: p0 + 4, y: roofY + 0.4, z: -halfW + 1 }, { x: p1 - 4, y: roofY + 0.75, z: halfW - 1 }, (_p, n) => (n.y < -0.5 ? rgb(0xa8a49a) : rgb(0x6a665e)), [], 4);
      for (let x = p0 + 6; x < p1 - 4; x += 6) s.lit.box({ x: x - 0.2, y: roofY - 0.1, z: -halfW + 1 }, { x: x + 0.2, y: roofY + 0.4, z: halfW - 1 }, rgb(0x8a867c));
      for (const zc of [-halfW + 1.5, halfW - 1.5]) {
        for (const dx of STATION_DESIGN.pierXs) {
          const geo = new CylinderGeometry(0.18, 0.18, roofY + 0.4, 10);
          s.lit.geometry(geo, new Matrix4().setPosition(cx + dx, (roofY + 0.4) / 2, zc), rgb(0x8a9098));
          geo.dispose();
          physics.box({ x: cx + dx - 0.2, y: 0, z: zc - 0.2 }, { x: cx + dx + 0.2, y: roofY, z: zc + 0.2 });
        }
      }
    }
    for (const zi of islands) {
      if (!twin) {
        s.lit.box({ x: p0 + 4, y: roofY, z: zi - 4.3 }, { x: p1 - 4, y: roofY + 0.22, z: zi + 4.3 }, (_p, n) => (n.y < -0.5 ? rgb(0xd8d4cc) : rgb(0x5a5c5e)));
        s.lit.box({ x: p0 + 4, y: roofY - 0.35, z: zi - 4.35 }, { x: p1 - 4, y: roofY + 0.22, z: zi - 4.25 }, rgb(0x2f3438));
        s.lit.box({ x: p0 + 4, y: roofY - 0.35, z: zi + 4.25 }, { x: p1 - 4, y: roofY + 0.22, z: zi + 4.35 }, rgb(0x2f3438));
      }
      for (const dx of STATION_DESIGN.pierXs) {
        const geo = new CylinderGeometry(0.12, 0.12, roofY - PLATFORM_Y, 10);
        s.lit.geometry(geo, new Matrix4().setPosition(cx + dx, (roofY + PLATFORM_Y) / 2, zi), post);
        geo.dispose();
        physics.box({ x: cx + dx - 0.15, y: PLATFORM_Y, z: zi - 0.15 }, { x: cx + dx + 0.15, y: roofY, z: zi + 0.15 });
      }
    }
  } else if (tiled) {
    // Columns down each island, up to the ceiling: square and tiled, round, or none.
    const kind = def.look?.columns ?? 'square';
    const paint = def.look?.columnColor !== undefined ? rgb(def.look.columnColor) : theme.paint;
    const top = (vaulted ? VAULT_TOP : TILED_TOP) + 0.2;
    for (const zi of islands) {
      for (const dx of kind === 'none' ? [] : STATION_DESIGN.pierXs) {
        const x = cx + dx;
        if (kind === 'round') {
          const geo = new CylinderGeometry(0.22, 0.22, top - PLATFORM_Y, 16);
          s.lit.geometry(geo, new Matrix4().setPosition(x, (top + PLATFORM_Y) / 2, zi), paint);
          geo.dispose();
        } else s.lit.box({ x: x - 0.35, y: PLATFORM_Y, z: zi - 0.35 }, { x: x + 0.35, y: top, z: zi + 0.35 }, paint);
        physics.box({ x: x - 0.4, y: PLATFORM_Y, z: zi - 0.4 }, { x: x + 0.4, y: top, z: zi + 0.4 });
      }
    }
  } else stationArchitecture(s, physics, def, cx, e);
  if (!outdoor) for (let x = p0 + 6; x < p1; x += 9) {
    for (const side of [-1, 1]) s.light(x, vaulted ? VAULT_WALL_H - 0.4 : STATION_DESIGN.corniceY, side * (halfW - 1.6), lampColor, 0.75, 8);
  }

  yield;
  // Benches along each platform's center.
  for (const zi of islands) {
    for (const bx of benchXs(cx)) {
      for (let slat = -4; slat <= 4; slat++) {
        s.lit.box({ x: bx - 1.1, y: PLATFORM_Y + 0.42, z: zi + slat * 0.12 - 0.045 }, { x: bx + 1.1, y: PLATFORM_Y + 0.5, z: zi + slat * 0.12 + 0.045 }, BENCH_WOOD);
      }
      s.lit.box({ x: bx - 1.1, y: PLATFORM_Y + 0.5, z: zi - 0.06 }, { x: bx + 1.1, y: PLATFORM_Y + 1.0, z: zi + 0.06 }, BENCH_WOOD);
      for (const lx of [-0.9, 0.9]) {
        s.lit.box({ x: bx + lx - 0.05, y: PLATFORM_Y, z: zi - 0.4 }, { x: bx + lx + 0.05, y: PLATFORM_Y + 0.42, z: zi + 0.4 }, BENCH_METAL);
      }
      physics.box({ x: bx - 1.1, y: PLATFORM_Y, z: zi - 0.55 }, { x: bx + 1.1, y: PLATFORM_Y + 1.0, z: zi + 0.55 });
      // Litter bin at the bench end.
      const lx = bx + 1.6;
      s.lit.box({ x: lx - 0.22, y: PLATFORM_Y, z: zi - 0.22 }, { x: lx + 0.22, y: PLATFORM_Y + 0.85, z: zi + 0.22 }, rgb(0x3b4a44));
      s.lit.box({ x: lx - 0.25, y: PLATFORM_Y + 0.85, z: zi - 0.25 }, { x: lx + 0.25, y: PLATFORM_Y + 0.92, z: zi + 0.25 }, rgb(0x6f7a75));
      physics.box({ x: lx - 0.25, y: PLATFORM_Y, z: zi - 0.25 }, { x: lx + 0.25, y: PLATFORM_Y + 0.92, z: zi + 0.25 });
    }
  }

  yield;
  // Information pillars with a line map, an emergency phone and an extinguisher.
  const pillarMap = lineMap(line, def.local);
  s.extras.userData.lineMap = pillarMap;
  const phone = textSign('Nödtelefon', 256, 64, '#1f7a3d');
  for (const zi of islands) {
    for (const dx of PILLAR_DXS) {
      const px = cx + dx;
      s.lit.box({ x: px - 0.3, y: PLATFORM_Y, z: zi - 0.3 }, { x: px + 0.3, y: PLATFORM_Y + 2.6, z: zi + 0.3 }, rgb(0x27313c));
      physics.box({ x: px - 0.3, y: PLATFORM_Y, z: zi - 0.3 }, { x: px + 0.3, y: PLATFORM_Y + 2.6, z: zi + 0.3 });
      for (const side of [-1, 1]) {
        place(s, pillarMap, 0.54, 0.24, new Vector3(px, PLATFORM_Y + 1.75, zi + side * 0.305), new Vector3(0, 0, side));
      }
      s.lit.box({ x: px + 0.3, y: PLATFORM_Y + 0.9, z: zi - 0.14 }, { x: px + 0.36, y: PLATFORM_Y + 1.45, z: zi + 0.14 }, rgb(0xb3261e));
      s.lit.box({ x: px - 0.36, y: PLATFORM_Y + 1.0, z: zi - 0.16 }, { x: px - 0.3, y: PLATFORM_Y + 1.5, z: zi + 0.16 }, rgb(0x2a7a45));
      place(s, phone, 0.34, 0.085, new Vector3(px - 0.365, PLATFORM_Y + 1.6, zi), new Vector3(-1, 0, 0));
    }
  }

  // The art walk's plaque, on a stand in the middle of the platform.
  const plaque = artWalk.plaque(def.name);
  const artInteractables: Interactable[] = [];
  if (plaque) {
    const ax = cx + 4.5;
    const zi = islands[0];
    s.lit.box({ x: ax - 0.04, y: PLATFORM_Y, z: zi - 0.04 }, { x: ax + 0.04, y: PLATFORM_Y + 1.9, z: zi + 0.04 }, rgb(0x2a2c30));
    s.lit.box({ x: ax - 0.5, y: PLATFORM_Y + 0.9, z: zi - 0.05 }, { x: ax + 0.5, y: PLATFORM_Y + 2.2, z: zi + 0.05 }, rgb(0x1d2a3a));
    physics.box({ x: ax - 0.5, y: PLATFORM_Y, z: zi - 0.06 }, { x: ax + 0.5, y: PLATFORM_Y + 2.2, z: zi + 0.06 });
    const sign = artSign(def.name, plaque[0], plaque[1]);
    for (const side of [-1, 1]) place(s, sign, 0.94, 1.24, new Vector3(ax, PLATFORM_Y + 1.55, zi + side * 0.05), new Vector3(0, 0, side));
    artInteractables.push({ pos: new Vector3(ax, PLATFORM_Y + 1, zi), radius: 1.9, prompt: text.art.prompt, act: () => artWalk.visit(def.name) });
  }

  // Hanging clocks showing the real time.
  const clocks: CanvasSign[] = [];
  for (const zi of islands) {
    for (const dx of [-18, 18]) {
      const face = createCanvasSign(256, 256);
      clocks.push(face);
      const x = cx + dx;
      for (const f of [-1, 1]) {
        const m = new Mesh(new CircleGeometry(0.34, 32), face.material);
        m.position.set(x + f * 0.07, 3.85, zi);
        m.rotation.y = (f * Math.PI) / 2;
        s.extras.add(m);
      }
      const ring = new CylinderGeometry(0.37, 0.37, 0.12, 32);
      s.lit.geometry(ring, new Matrix4().makeRotationZ(Math.PI / 2).setPosition(x, 3.85, zi), rgb(0x2a2c30));
      ring.dispose();
      s.lit.box({ x: x - 0.02, y: 4.2, z: zi - 0.02 }, { x: x + 0.02, y: RAIL, z: zi + 0.02 }, PAINT.fixture);
    }
  }

  // Transfer sign, readable when walking toward the exit.
  if (def.transfer) {
    const text = def.transfer.replace(/^Byte till /, 'Byte: ').replace(/\.$/, '');
    const sign = textSign(`↑ ${text}`, 1024, 128, '#f2f2f2', '#10325f');
    for (const zi of islands) {
      place(s, sign, 5, 0.62, new Vector3(cx + e * 6, 3.75, zi), new Vector3(-e, 0, 0));
      s.lit.box({ x: cx + e * 6 + e * 0.01 - 0.01, y: 3.44, z: zi - 2.5 }, { x: cx + e * 6 + e * 0.01 + 0.01, y: 4.06, z: zi + 2.5 }, rgb(0x2a2c30));
      s.lit.box({ x: cx + e * 6 - 0.02, y: 4.06, z: zi - 0.02 }, { x: cx + e * 6 + 0.02, y: RAIL, z: zi + 0.02 }, PAINT.fixture);
    }
  }

  // Stop marks where a train's nose comes to rest, one per track, for drivers, on its far side from the platform.
  for (const tz of trackZs) {
    const track = tz > 0 ? 1 : -1;
    const x = cx + track * (TRAIN_HALF_L + TRAIN_NOSE);
    const z = tz + Math.sign(tz - islandOf(tz)) * 2.05;
    s.lit.box({ x: x - 0.04, y: 0, z: z - 0.04 }, { x: x + 0.04, y: 2.4, z: z + 0.04 }, rgb(0x2a2c30));
    physics.box({ x: x - 0.05, y: 0, z: z - 0.05 }, { x: x + 0.05, y: 2.4, z: z + 0.05 });
    place(s, stopMark(), 0.5, 0.62, new Vector3(x, 2.55, z), new Vector3(-track, 0, 0));
  }

  const exitBoard = textSign('↑ ' + def.exits, 1024, 128, '#f4d03f', '#1c2025');
  for (const zi of islands) place(s, exitBoard, 5.8, 0.72, new Vector3(cx + e * 62, 3.8, zi), new Vector3(-e, 0, 0));

  yield;
  // Station name boards on the walls above the tracks (and on the middle wall of a shared station).
  const board = nameBoard(def.name, line);
  const boardZ = halfW - (CAVE_HALF_W - STATION_DESIGN.nameBoardZ);
  for (let x = cx - 60; x <= cx + 60; x += 24) {
    for (const side of [-1, 1]) {
      // Outdoors they hang from the canopy's edges, facing the tracks.
      if (outdoor) { for (const zi of islands) place(s, board, 3.6, 0.55, new Vector3(x, STATION_DESIGN.lightingY - 0.2, zi + side * 4.36), new Vector3(0, 0, side)); continue; }
      place(s, board, 4.2, 0.64, new Vector3(x, STATION_DESIGN.nameBoardY, side * boardZ), new Vector3(0, 0, -side));
      if (twin) place(s, board, 4.2, 0.64, new Vector3(x, STATION_DESIGN.nameBoardY, side * (TRACK_Z - TRAIN_HALF_W - 1.5 + 0.02)), new Vector3(0, 0, side));
    }
  }

  // Hanging direction signs. Track 1 (z > 0) runs west, track 2 (z < 0) east.
  // At a shared station each island has one direction of both lines.
  const lineAt = (z: number) => (twin && Math.abs(z) > TRACK_Z + 1 ? net.lines[def.lines.find((l) => l !== def.line)!] : line);
  const toward = (on: LineDef, end: 'outbound' | 'inbound') => {
    const serving = on.routes.filter((route) => on === line ? onRoute(def, route.number) : true).filter((route) => route[end] !== def.name);
    const names = [...new Set(serving.map((route) => route[end]))];
    return names.map((name) => `${serving.filter((route) => route[end] === name).map((route) => route.number).join('/')} ${name}`).join(' · ');
  };
  /** A track's number and where its trains go, or that they end here. */
  const trackText = (z: number) => {
    const where = toward(lineAt(z), z > 0 ? 'outbound' : 'inbound');
    return { number: twin ? trackZs.length - trackZs.indexOf(z) : z > 0 ? 1 : 2, where: where || 'Slutstation' };
  };
  for (const zi of islands) {
    const [lo, hi] = trackZs.filter((z) => islandOf(z) === zi).sort((a, b) => a - b);
    const L = trackText(hi);
    const R = trackText(lo);
    // Seen looking toward -x, +z is on the viewer's left.
    const faceNegX = directionFace(`← Spår ${L.number}  ${L.where}`, `${R.where}  Spår ${R.number} →`);
    // Seen looking toward +x, -z is on the viewer's left.
    const facePosX = directionFace(`← Spår ${R.number}  ${R.where}`, `${L.where}  Spår ${L.number} →`);
    // Halfway between the piers at 28 and 56, clear of their flared tops and of the canopy posts.
    for (const dx of [-42, 42]) {
      const pos = new Vector3(cx + dx, 3.7, zi);
      place(s, faceNegX, 6.4, 0.8, pos.clone().add(new Vector3(0.02, 0, 0)), new Vector3(1, 0, 0));
      place(s, facePosX, 6.4, 0.8, pos.clone().add(new Vector3(-0.02, 0, 0)), new Vector3(-1, 0, 0));
      for (const rz of [-2.8, 2.8]) {
        s.lit.box({ x: cx + dx - 0.03, y: 4.1, z: zi + rz - 0.03 }, { x: cx + dx + 0.03, y: RAIL, z: zi + rz + 0.03 }, PAINT.fixture);
      }
    }
  }

  yield;
  // Departure displays: each island's shows the trains due on its two tracks.
  const platformTracks = trackZs.map((z) => ({ z, track: (z > 0 ? 1 : 2) as 1 | 2, line: net.lines.indexOf(lineAt(z)), number: trackText(z).number })).sort((a, b) => a.number - b.number);
  const displays: Array<{ sign: CanvasSign; tracks: number[] }> = [];
  for (const zi of islands) {
    const tracks = platformTracks.flatMap((t, k) => (islandOf(t.z) === zi ? [k] : []));
    for (const dx of [-48, 48]) {
      // Tall enough for two trains a track and a line of notices under them.
      const disp = createCanvasSign(1024, 320);
      displays.push({ sign: disp, tracks: tracks.map((k) => platformTracks[k].number) });
      for (const f of [-1, 1]) {
        place(s, disp, 2.6, 0.81, new Vector3(cx + dx + f * SIGN_LAYOUT.displayHalfDepth, 3.6, zi), new Vector3(f, 0, 0));
      }
      s.lit.box({ x: cx + dx - SIGN_LAYOUT.displayHalfDepth, y: 3.17, z: zi - 1.35 }, { x: cx + dx + SIGN_LAYOUT.displayHalfDepth, y: 4.03, z: zi + 1.35 }, PAINT.fixture);
      for (const rz of [-1.1, 1.1]) {
        s.lit.box({ x: cx + dx - 0.03, y: 4.03, z: zi + rz - 0.03 }, { x: cx + dx + 0.03, y: RAIL, z: zi + rz + 0.03 }, PAINT.fixture);
      }
    }
  }

  yield;
  // An escalator up from each island; a shared station's are built in sections of their own and moved out to its islands.
  const escalators: EscalatorZone[] = [];
  const escalatorGroups: Group[] = [];
  // Underground, as deep as the station lies; in the open air, up to a hall over the tracks.
  const rise = stationRise(net, index);
  const hallY = PLATFORM_Y + rise;
  for (const zi of islands) {
    if (zi === 0) { escalators.push(yield* escalatorSteps(s, physics, cx + e * CAVE_HALF_L, e, rise, !outdoor)); continue; }
    const es = new Section(`${def.name}-escalator`, theme.ambient, dry);
    const zone = yield* escalatorSteps(es, shiftZ(physics, zi), cx + e * CAVE_HALF_L, e, rise, !outdoor);
    zone.z = zi;
    escalators.push(zone);
    const g = yield* es.finishSteps();
    g.position.z = zi;
    escalatorGroups.push(g);
  }
  const escalator = escalators[0];
  const hx = cx + e * (CAVE_HALF_L + escalator.run);
  yield;
  // The same station on another line, where it lies elsewhere along x: a walkway leads there.
  const partners = net.stations.flatMap((o, oi) => (o.name === def.name && oi !== index && !o.lines.includes(def.line) && !def.lines.includes(o.line) ? [oi] : []));
  const doorA = twin ? 8.2 : 5;
  const hall = buildHall(s, physics, line, def, index, hx, hallY, e, islands.filter((z) => z !== 0), partners.length && !def.passage ? doorA : null);
  // Up the stairs from the hall, the street: a section of its own in the open air, shown only at the station. In the open
  // the hall's door opens straight onto it.
  const ss = new Section(`${def.name}-street`, OPEN_AMBIENT, dry, true);
  const street = buildStreet(ss, physics, index, def.exits, hx, hallY, e, outdoor ? def.name : null);
  yield;
  const streetGroup = yield* ss.finishSteps();
  streetGroup.visible = false;
  hall.exit.street = { ...street, group: dry ? null : streetGroup };
  yield;
  const walkways = partners.map((to) => {
    // Out through the City passage's side opening, or a door in the hall's +z wall.
    const end: WalkwayEnd = hall.passage
      ? { door: new Vector3(hall.passage.X(PASSAGE_LAYOUT.a0), hallY, (TRANSFER_LAYOUT.corridor.z0 + TRANSFER_LAYOUT.corridor.z1) / 2), u: new Vector3(-e, 0, 0), side: 1 }
      : { door: new Vector3(hx + e * doorA, hallY, HALL_HALF_W), u: new Vector3(0, 0, 1), side: 1, wall: 0.5 };
    const there = net.stations[to];
    const names = there.lines.map((li) => net.lines[li].name.toLowerCase());
    // From the blue line's T-Centralen, and back to it, the way is Blå gången, painted blue.
    const blue = !!def.passage || !!there.passage;
    buildWalkway(s, physics, end, dry ? '' : `↑ ${text.transfer.to} ${names.join(` ${text.transfer.and} `)}`, blue);
    return { to, end };
  });
  yield;
  const clutter = buildClutter(s, { index, cx, exitDir: e, benches: benchXs(cx), pillars: PILLAR_DXS, hallX: (a) => hx + e * a, hallY, hallHalfW: HALL_HALF_W, platformZ: islands[islands.length - 1], wallZ: boardZ, posters: !outdoor });
  yield;
  // In the city the hall over the tracks is a low building of its own, standing on the station roof.
  if (outdoor && def.city) cityHouse(s, physics, cx + e * CAVE_HALF_L, hx + e * (HALL_LEN + 0.6), islands.map((z) => [z - ESC_HALF_W - 0.4, z + ESC_HALF_W + 0.4] as [number, number]),
    { y0: hallY + STREET.door, y1: hallY + STREET.door + STREET.doorHeight, halfW: STREET.doorHalfW });

  let departureKey = '';
  const info: StationInfo = {
    index,
    name: def.name,
    cx,
    exitDir: e,
    escalator,
    escalators,
    platforms: islands,
    platformTracks,
    rise,
    hall: hall.bounds,
    gates: hall.gates,
    exit: hall.exit,
    passage: hall.passage,
    walkways,
    spawn: new Vector3(cx - e * 20, PLATFORM_Y, islands[islands.length - 1] + 2.2),
    zones: [...(hall.passage ? [hall.passage.zone] : []), ...walkways.flatMap((w) => walkwayZones(w.end, index, def.passage ? text.transfer.blueWay : `${text.transfer.way} ${net.stations[w.to].lines.map((li) => net.lines[li].name.toLowerCase()).join(` ${text.transfer.and} `)}`))],
    interactables: [...(hall.passage ? hall.passage.interactables : []), ...artInteractables],
    clutter,
    tube,
    setDepartures(rows, notice, banner) {
      info.lastDepartures = [rows, notice, banner];
      const key = JSON.stringify([rows, notice, banner, era.get()]);
      if (key === departureKey) return;
      departureKey = key;
      for (const d of displays) redraw(d.sign, (ctx, w, h) => drawDepartures(ctx, w, h, rows.filter((r) => d.tracks.includes(r.track)), notice, banner));
    },
    setTime(clock) {
      info.lastTime = clock;
      clocks.forEach((c, k) => redraw(c, (ctx, w, h) => drawClock(ctx, w, h, index === FAST_CLOCK.station && k === FAST_CLOCK.clock ? fastBy(clock, FAST_CLOCK.minutes) : clock)));
    },
  };
  const group = yield* s.finishSteps();
  for (const g of escalatorGroups) group.add(g);
  group.add(streetGroup);
  return { group, info };
}

interface HallBuild {
  bounds: { x0: number; x1: number; y: number };
  gates: GateLine;
  exit: StreetExit;
  passage: Passage | null;
}

const PASSAGE = PASSAGE_LAYOUT;

function buildHall(s: Section, physics: Physics, line: LineDef, def: Network['stations'][number], index: number, hx: number, hallY: number, e: 1 | -1, wings: number[] = [], walkwayDoor: number | null = null): HallBuild {
  const Y = hallY;
  const HALL_WALL = hallWall(Y);
  const W = HALL_HALF_W;
  const X = (a: number) => hx + e * a;
  const box = (a0: number, a1: number, y0: number, y1: number, z0: number, z1: number, paint: Parameters<typeof s.lit.box>[2], collide = true, skip: BoxFace[] = []) => {
    const min = { x: Math.min(X(a0), X(a1)), y: y0, z: z0 };
    const max = { x: Math.max(X(a0), X(a1)), y: y1, z: z1 };
    s.lit.box(min, max, paint, skip);
    if (collide) physics.box(min, max);
  };

  box(0, HALL_LEN, Y - 0.5, Y, -W, W, HALL_FLOOR);
  // The ceiling, open over the top of the exit stairs underground (see below). Above ground the hall is a building of
  // its own, and its roof stays whole.
  const well = !s.outdoor;
  // The slab stops at the stairwell's walls, which run down through it: no two faces in one plane.
  box(0, well ? OPEN_A - 0.3 : HALL_LEN, Y + HALL_H, Y + HALL_H + 0.5, -W, W, rgb(0xe9e6de));
  if (well) for (const side of [-1, 1]) box(OPEN_A - 0.3, HALL_LEN, Y + HALL_H, Y + HALL_H + 0.5, Math.min(side * 2.8, side * W), Math.max(side * 2.8, side * W), rgb(0xe9e6de));
  // A shared station's escalators come up in wings off either side of the hall, from `0` to `ARM` along it.
  const ARM = 6;
  const wing = (side: number) => wings.some((z) => Math.sign(z) === side);
  if (def.passage) {
    box(0, PASSAGE.a0, Y, Y + HALL_H, W, W + 0.5, HALL_WALL);
    box(PASSAGE.a1, HALL_LEN, Y, Y + HALL_H, W, W + 0.5, HALL_WALL);
    box(PASSAGE.a0, PASSAGE.a1, Y + PASSAGE.height, Y + HALL_H, W, W + 0.5, HALL_WALL);
  } else if (walkwayDoor !== null) {
    // An opening onto the walkway to the other line.
    const [d0, d1] = [walkwayDoor - WALKWAY.half, walkwayDoor + WALKWAY.half];
    box(wing(1) ? ARM + 0.5 : 0, d0, Y, Y + HALL_H, W, W + 0.5, HALL_WALL);
    box(d1, HALL_LEN, Y, Y + HALL_H, W, W + 0.5, HALL_WALL);
    box(d0, d1, Y + WALKWAY.height, Y + HALL_H, W, W + 0.5, HALL_WALL);
  } else box(wing(1) ? ARM + 0.5 : 0, HALL_LEN, Y, Y + HALL_H, W, W + 0.5, HALL_WALL);
  // Beside a wing, the side wall starts behind the wing's end wall, so their faces do not share its plane.
  box(wing(-1) ? ARM + 0.5 : 0, HALL_LEN, Y, Y + HALL_H, -W - 0.5, -W, HALL_WALL);
  // Underground the end wall is open over the landing, where the stairs go on up to the street; in the open a door in it
  // opens onto the street, level with the landing.
  const D = STREET.doorHalfW;
  for (const side of [-1, 1]) box(HALL_LEN, HALL_LEN + 0.5, Y, Y + HALL_H, side * D, side * W, HALL_WALL);
  // Under the door the landing fills the wall (below).
  if (!well) box(HALL_LEN, HALL_LEN + 0.5, Y + STREET.door + STREET.doorHeight, Y + HALL_H, -D, D, HALL_WALL);
  if (wings.length) box(-0.5, 0, Y, Y + HALL_H, -W, W, HALL_WALL);
  else {
    // The escalator shaft's own walls and ceiling line the opening, so the jambs and the lintel leave those faces out.
    box(-0.5, 0, Y, Y + HALL_H, -W, -ESC_HALF_W, HALL_WALL, true, ['pz']);
    box(-0.5, 0, Y, Y + HALL_H, ESC_HALF_W, W, HALL_WALL, true, ['nz']);
    box(-0.5, 0, Y + ESC_HEADROOM, Y + HALL_H, -ESC_HALF_W, ESC_HALF_W, HALL_WALL, true, ['ny']);
  }
  for (const zw of wings) {
    const side = Math.sign(zw);
    const outer = zw + side * (ESC_HALF_W + 1);
    const [z0, z1] = [Math.min(side * W, outer), Math.max(side * W, outer)];
    box(0, ARM, Y - 0.5, Y, z0, z1, HALL_FLOOR);
    box(0, ARM, Y + HALL_H, Y + HALL_H + 0.5, z0, z1, rgb(0xe9e6de));
    box(0, ARM, Y, Y + HALL_H, Math.min(outer, outer + side * 0.5), Math.max(outer, outer + side * 0.5), HALL_WALL);
    box(ARM, ARM + 0.5, Y, Y + HALL_H, z0, z1, HALL_WALL);
    // The wing's end wall, open where the escalator comes up.
    const [e0, e1] = [zw - ESC_HALF_W, zw + ESC_HALF_W];
    box(-0.5, 0, Y, Y + HALL_H, z0, Math.max(z0, Math.min(e0, e1)), HALL_WALL);
    box(-0.5, 0, Y, Y + HALL_H, Math.min(z1, Math.max(e0, e1)), z1, HALL_WALL);
    box(-0.5, 0, Y + ESC_HEADROOM, Y + HALL_H, Math.min(e0, e1), Math.max(e0, e1), HALL_WALL);
    for (const a of [1.5, 4.5]) {
      s.unlit.box({ x: X(a) - 1, y: Y + HALL_H - 0.08, z: zw - 0.3 }, { x: X(a) + 1, y: Y + HALL_H - 0.02, z: zw + 0.3 }, PAINT.lampCool);
      s.light(X(a), Y + HALL_H - 0.8, zw, rgb(0xf4f6ff), 0.9, 13);
    }
  }

  // Ticket gates with a staffed booth on one side.
  const ga = 11.2;
  const gb = 12.8;
  for (let z = -7.5; z <= 7.5; z += 1.5) {
    box(ga, gb, Y, Y + 1.05, z - 0.175, z + 0.175, GATE);
    for (const a of [ga - 0.02, gb + 0.02]) {
      const xa = X(a);
      s.unlit.box({ x: xa - 0.02, y: Y + 0.8, z: z - 0.06 }, { x: xa + 0.02, y: Y + 0.92, z: z + 0.06 }, rgb(0x35d07f));
    }
  }
  box(ga, gb, Y, Y + 1.05, -W, -7.675, GATE);
  // SL's yellow readers on the unpaid end of each cabinet, for the card, a bank card or a phone.
  for (let z = -7.5; z < 7.5; z += 1.5) box(gb - 0.42, gb - 0.12, Y + 1.05, Y + 1.1, z + 0.02, z + 0.16, READER, false);
  // The staffed booth: a counter, corner posts and a roof around a glass front, so you can see who sits inside.
  const BOOTH = rgb(0x8d99a4);
  box(ga - 1, gb + 1, Y, Y + 1.15, 7.675, 7.9, BOOTH, false);
  box(ga - 1, gb + 1, Y + 2.3, Y + 2.6, 7.675, W, BOOTH, false);
  for (const [a0, a1] of [[ga - 1, ga - 0.9], [gb + 0.9, gb + 1]]) box(a0, a1, Y, Y + 2.3, 7.675, W, BOOTH, false);
  box(ga - 0.9, gb + 0.9, Y, Y + 0.01, 7.9, W, rgb(0x5a5f66), false);
  // Desk, a stool and a screen for the attendant.
  box(ga - 0.8, gb + 0.8, Y + 0.95, Y + 1.0, 7.9, 8.35, rgb(0xd8d2c3), false);
  box(11.85, 12.15, Y, Y + 0.72, 8.55, 8.85, rgb(0x2b2e33), false);
  box(12.25, 12.75, Y + 1.0, Y + 1.36, 8.1, 8.14, rgb(0x1c1f24), false);
  s.unlit.box({ x: Math.min(X(12.28), X(12.72)), y: Y + 1.03, z: 8.095 }, { x: Math.max(X(12.28), X(12.72)), y: Y + 1.33, z: 8.1 }, rgb(0x6f9fd8));
  s.light(X(12), Y + 2.2, 8.4, rgb(0xf4f6ff), 0.6, 4);
  physics.box({ x: Math.min(X(ga - 1), X(gb + 1)), y: Y, z: 7.675 }, { x: Math.max(X(ga - 1), X(gb + 1)), y: Y + 2.6, z: W });
  const glass = new Mesh(new PlaneGeometry(gb - ga + 1.8, 1.15), new MeshBasicMaterial({ color: 0xbfd6e6, transparent: true, opacity: 0.22, depthWrite: false, side: DoubleSide }));
  glass.position.set(X((ga + gb) / 2), Y + 1.725, 7.8);
  s.extras.add(glass);

  buildKiosk(s, physics, X, Y);

  // Stairs up to a landing; underground a second flight goes on up to the street, in the open doorway a painted street.
  const steps = 20;
  for (let k = 0; k < steps; k++) {
    box(19 + k * 0.35, 19 + (k + 1) * 0.35, Y, Y + (k + 1) * 0.17, -2.5, 2.5, STEP);
  }
  // The landing, and in the open its threshold through the door.
  box(26, well ? HALL_LEN : HALL_LEN + 0.5, Y, Y + 3.4, -2.5, 2.5, STEP);
  for (const side of [-1, 1]) {
    box(19, HALL_LEN, Y + 3.4, Y + 4.4, side * 2.5 - 0.04, side * 2.5 + 0.04, rgb(0x6b6f75), false);
  }
  // Over the top of the stairs the ceiling is open to the sky, as at a street entrance: concrete walls rise past the
  // ceiling to the street, and snow and rain fall in (see `weather.ts`). Beyond the end wall the second flight climbs
  // in an open cut to the street above (`street.ts`).
  const top = well ? Y + STREET.above : Y + STREET.door + STREET.doorHeight;
  if (well) {
    const concrete = rgb(0x9a9ea3);
    for (const side of [-1, 1]) {
      const [z0, z1] = [Math.min(side * 2.5, side * 2.8), Math.max(side * 2.5, side * 2.8)];
      box(OPEN_A, HALL_LEN + 0.5, Y + HALL_H, top, z0, z1, concrete, false);
      box(HALL_LEN + 0.5, STREET.stairTop, Y + 3.4, top, z0, z1, concrete);
    }
    box(OPEN_A - 0.3, OPEN_A, Y + HALL_H, top, -2.8, 2.8, concrete, false);
    const flight = 30;
    const rise = (top - (Y + 3.4)) / flight;
    const run = (STREET.stairTop - HALL_LEN) / flight;
    for (let k = 0; k < flight; k++) box(HALL_LEN + k * run, HALL_LEN + (k + 1) * run, Y + 3.4, Y + 3.4 + (k + 1) * rise, -2.5, 2.5, STEP);
    for (const side of [-1, 1]) box(HALL_LEN, STREET.stairTop, top - 1.6, top - 1.54, side * 2.44, side * 2.5, rgb(0x6b6f75), false);
    s.light(X((OPEN_A + HALL_LEN) / 2), Y + HALL_H, 0, rgb(0xeef3ff), 0.9, 12);
    s.light(X((HALL_LEN + STREET.stairTop) / 2), top - 1, 0, rgb(0xeef3ff), 0.8, 10);
  }
  const doorX = X(HALL_LEN) - e * 0.03;
  s.light(X(HALL_LEN - 2), Y + 5, 0, rgb(0xfff2d8), 1.2, 14);

  for (let a = 3; a < HALL_LEN; a += 6) {
    for (const z of [-4.5, 4.5]) {
      s.unlit.box({ x: X(a) - 1, y: Y + HALL_H - 0.08, z: z - 0.3 }, { x: X(a) + 1, y: Y + HALL_H - 0.02, z: z + 0.3 }, PAINT.lampCool);
      s.light(X(a), Y + HALL_H - 0.8, z, rgb(0xf4f6ff), 0.9, 13);
    }
  }

  const toward = new Vector3(-e, 0, 0);
  const away = new Vector3(e, 0, 0);
  const name = nameBoard(def.name, line);
  place(s, name, 6.4, 1.2, new Vector3(X(12), Y + 4.6, 0), toward);
  const exit = textSign('↑ Utgång · ' + def.exits, 1024, 128, '#f3cd36', '#181c23');
  place(s, exit, 6.4, 0.8, new Vector3(X(18.8), Y + 5.2, 0), toward);
  const trains = textSign(`Till tågen  ·  ${line.bullets.join(' ')}`, 768, 128);
  place(s, trains, 4, 0.67, new Vector3(X(12), Y + 4.6, 0), away);
  place(s, (s.extras.userData.lineMap as CanvasSign | undefined) ?? lineMap(line, def.local), 5.6, 2.45, new Vector3(X(6), Y + 2.6, -W + 0.02), new Vector3(0, 0, 1));
  const booth = textSign('Spärrexpedition', 512, 96, '#1f2a36');
  place(s, booth, 2.4, 0.45, new Vector3(X(12), Y + 2.9, 7.65), new Vector3(0, 0, -1));

  const passage = def.passage ? buildPassage(s, physics, def.passage, index, X, Y, W) : null;

  return {
    bounds: { x0: Math.min(X(0), X(HALL_LEN)), x1: Math.max(X(0), X(HALL_LEN)), y: Y },
    gates: {
      paidX: X(ga), unpaidX: X(gb), y: Y,
      passages: Array.from({ length: 10 }, (_, k) => -6.75 + k * 1.5), halfWidth: 0.575, flapHeight: 0.92,
    },
    exit: { street: null, x: doorX, dir: e, sillY: Y + 3.4, halfWidth: 2.2, height: top - (Y + 3.4), stairX: X(19), open: well ? HALL_LEN - OPEN_A : 0, top, cut: well ? STREET.stairTop - HALL_LEN : 0 },
    passage,
  };
}

/**
 * A long tiled pedestrian passage off the hall toward the commuter trains at
 * City. It ends at a gate line and two lifts that never come.
 */
function buildPassage(s: Section, physics: Physics, label: string, index: number, X: (a: number) => number, Y: number, W: number): Passage {
  const { a0, a1, length, height, gateSetback, buskerZ } = PASSAGE;
  const z0 = W;
  const z1 = W + length;
  const zg = z1 - gateSetback;
  const mid = (a0 + a1) / 2;
  const tiles = s.artLayer(tileTexture());
  const box = (b: MeshBuilder, pa0: number, pa1: number, y0: number, y1: number, pz0: number, pz1: number, paint: Parameters<MeshBuilder['box']>[2], collide = true) => {
    const min = { x: Math.min(X(pa0), X(pa1)), y: y0, z: pz0 };
    const max = { x: Math.max(X(pa0), X(pa1)), y: y1, z: pz1 };
    b.box(min, max, paint);
    if (collide) physics.box(min, max);
  };
  // Floor and ceiling stop at the a0 wall's face: the walkway out through the side opening brings its own, at the same
  // heights, and two faces in one plane flicker.
  box(s.lit, a0, a1 + 0.3, Y - 0.5, Y, z0, z1 + 0.3, HALL_FLOOR);
  box(s.lit, a0, a1 + 0.3, Y + height, Y + height + 0.4, z0, z1 + 0.3, rgb(0xe9e6de));
  // A side opening onto the red and green lines' mezzanine (see `transfer.ts`).
  const side = TRANSFER_LAYOUT.corridor;
  box(tiles, a0 - 0.3, a0, Y, Y + height, z0, side.z0, rgb(0xffffff));
  box(tiles, a0 - 0.3, a0, Y, Y + height, side.z1, z1, rgb(0xffffff));
  if (side.height < height) box(tiles, a0 - 0.3, a0, Y + side.height, Y + height, side.z0, side.z1, rgb(0xffffff));
  place(s, textSign(text.transfer.fromPassage, 1024, 112, SIGN_BG), 2.8, 0.3, new Vector3(X(a0 + 0.02), Y + height - 0.35, (side.z0 + side.z1) / 2), new Vector3(Math.sign(X(a1) - X(a0)), 0, 0));
  box(tiles, a1, a1 + 0.3, Y, Y + height, z0, z1, rgb(0xffffff));
  box(tiles, a0, a1, Y, Y + height, z1, z1 + 0.3, rgb(0xffffff));
  // A blue band at hand height, broken by the side opening.
  for (const [pz0, pz1] of [[z0, side.z0], [side.z1, z1]]) box(s.lit, a0, a0 + 0.02, Y + 1.25, Y + 1.45, pz0, pz1, rgb(0x1f5aa6), false);
  box(s.lit, a1 - 0.02, a1, Y + 1.25, Y + 1.45, z0, z1, rgb(0x1f5aa6), false);
  const toCity = new Vector3(0, 0, -1);
  const toHall = new Vector3(0, 0, 1);
  place(s, textSign(`↑ ${label}`, 1024, 112, SIGN_BG), 4.4, 0.48, new Vector3(X(mid), Y + height - 0.4, z0 + 0.3), toCity);
  for (let z = z0 + 4; z < z1 - 1; z += 6) {
    s.unlit.box({ x: X(mid) - 0.9, y: Y + height - 0.06, z: z - 0.15 }, { x: X(mid) + 0.9, y: Y + height, z: z + 0.15 }, PAINT.lampCool);
    s.light(X(mid), Y + height - 0.5, z, rgb(0xf4f6ff), 0.8, 9);
  }

  // Hanging direction signs, one face for each way.
  const cityWay = textSign(text.rush.toCity, 1024, 112, SIGN_BG);
  const hallWay = textSign(text.rush.toBlue, 1024, 112, SIGN_BG);
  for (let z = z0 + 34; z < zg - 10; z += 36) {
    box(s.lit, mid - 1.9, mid + 1.9, Y + height - 0.72, Y + height - 0.2, z - 0.04, z + 0.04, PAINT.fixture, false);
    place(s, cityWay, 3.6, 0.4, new Vector3(X(mid), Y + height - 0.46, z - 0.04), toCity);
    place(s, hallWay, 3.6, 0.4, new Vector3(X(mid), Y + height - 0.46, z + 0.04), toHall);
  }

  // Made-up event posters along the walls, a new set every day.
  const day = Math.floor(Date.now() / 86400000);
  const posters = [0, 1, 2].map((p) => createCanvasSign(256, 384, (ctx, w, h) => drawPoster(ctx, 0, 0, w, h, Math.floor(hash01(day * 17 + p, 404) * 1e9), day)));
  [0, 1, 2, 3, 4, 5].forEach((k) => {
    const z = z0 + 44 + k * 17;
    const left = k % 2 === 0;
    const a = left ? a0 : a1;
    place(s, posters[k % 3], 1.2, 1.8, new Vector3(X(a) + (left ? 1 : -1) * Math.sign(X(a1) - X(a0)) * 0.01, Y + 1.55, z), new Vector3(Math.sign(X(a1) - X(a0)) * (left ? 1 : -1), 0, 0));
  });

  buildTravelators(s, physics, X, Y, z0);

  // The gate line to the commuter trains: posts and closed glass flaps.
  const gateFace = zg - 0.8;
  const posts = Math.round((a1 - a0 - 0.6) / 1.1) + 1;
  for (let k = 0; k < posts; k++) {
    const a = a0 + 0.3 + k * 1.1;
    box(s.lit, a - 0.15, a + 0.15, Y, Y + 1.05, zg - 0.8, zg + 0.8, GATE, false);
    s.unlit.box({ x: X(a) - 0.06, y: Y + 0.8, z: gateFace - 0.02 }, { x: X(a) + 0.06, y: Y + 0.92, z: gateFace }, rgb(0xd0453a));
    if (k < posts - 1) box(s.lit, a + 0.15, a + 0.95, Y + 0.3, Y + 0.92, zg - 0.01, zg + 0.01, rgb(0xbfd6e6), false);
  }
  physics.box({ x: Math.min(X(a0), X(a1)), y: Y, z: zg - 0.8 }, { x: Math.max(X(a0), X(a1)), y: Y + 1.05, z: zg + 0.8 });
  place(s, textSign(text.rush.city, 1024, 128, '#c2185b'), 4.4, 0.55, new Vector3(X(mid), Y + height - 0.45, zg - 0.9), toCity);

  // Beyond the gates: two lift doors in the end wall and the commuter trains' destinations.
  const LIFT = rgb(0x9aa3ab);
  for (const a of [a0 + 1.3, a1 - 1.3]) {
    box(s.lit, a - 0.6, a + 0.6, Y, Y + 2.25, z1 - 0.06, z1, LIFT, false);
    box(s.lit, a - 0.01, a + 0.01, Y, Y + 2.2, z1 - 0.08, z1 - 0.06, rgb(0x5c646b), false);
    s.unlit.box({ x: X(a + 0.75) - 0.05, y: Y + 1.05, z: z1 - 0.04 }, { x: X(a + 0.75) + 0.05, y: Y + 1.15, z: z1 }, rgb(0xf2c94c));
  }
  place(s, textSign(text.rush.lift, 1024, 112, SIGN_BG), 3.6, 0.4, new Vector3(X(mid), Y + 2.55, z1 - 0.02), toCity);
  place(s, textSign(text.rush.north, 1024, 96, '#1c2025', '#f6c956'), 3.8, 0.36, new Vector3(X(mid), Y + 2.98, z1 - 0.02), toCity);
  const reader = new Vector3(X(mid), Y + 1, gateFace - 0.3);

  const busker = new Vector3(X(a1 - 0.8), Y, z0 + buskerZ);
  return {
    busker,
    yaw: Math.atan2(X(a0) - X(a1), 0),
    zone: { min: { x: Math.min(X(a0), X(a1)), y: Y - 1, z: z0 }, max: { x: Math.max(X(a0), X(a1)), y: Y + height, z: z1 }, station: index, area: 'hall', label },
    bounds: { x0: Math.min(X(a0), X(a1)), x1: Math.max(X(a0), X(a1)), z0, z1, y: Y },
    gateZ: zg,
    X,
    interactables: [
      { pos: reader, radius: 2.2, prompt: text.rush.gatePrompt, act: () => text.rush.gateRed },
      { pos: new Vector3(X(mid), Y + 1, z1 - 1), radius: 2.4, prompt: text.rush.liftPrompt, act: () => text.rush.liftComing },
    ],
  };
}
