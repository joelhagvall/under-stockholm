import { SIGN_LAYOUT, STATION_ROCK_INSET } from '../layout';
import sv from '../i18n/sv.json';
import { text } from '../i18n/text';
import { BoxGeometry, CircleGeometry, CylinderGeometry, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three';
import { brokenTube } from '../calendar';
import { buildClutter, type StationClutter } from './clutter';
import { escalatorSteps, type EscalatorZone } from './escalator';
import { inclineSteps, type InclineZone } from './incline';
import { escalatorHeight, escalatorRun } from '../escalatorMotion';
import { foldedPhysics, shiftZ } from './shifted';
import { buildWalkway, WALKWAY, walkwayZones, type WalkwayEnd } from './walkway';
import { FLAT, OPEN, openGround, type Clearing, type Ground } from './outdoor';
import type { OsmPatch } from './osm';
import { buildCity, cityAnchors, cityHouse, railings } from './city';
import type { BoxFace, MeshBuilder, Paint } from '../gfx/builder';
import { mix, rgb, type RGB } from '../gfx/color';
import { createCanvasSign, drawBullet, fitText, FONT, MONO, redraw, SIGN_BG, SIGN_FG, type CanvasSign } from '../gfx/signs';
import {
  STATION_DESIGN,
  CAVE_BOTTOM,
  CAVE_HALF_L,
  CAVE_HALF_W,
  CANOPY,
  SPLIT,
  STACK,
  VIADUCT,
  CAVE_TOP,
  CAVE_WALL_H,
  ESC_ANGLE,
  ESC_DESIGN,
  ESC_LANDING,
  ESC_HALF_W,
  ESC_HEADROOM,
  HALL_H,
  HALL_HALF_W,
  HALL_LEN,
  INCLINE,
  PASSAGE_LAYOUT,
  UNDERPASS_DEPTH,
  SIDE_DOOR,
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
import { hallDir, isOutdoor, onRoute, routeStations, stationRise, viaductAt, type HallDef, type LineDef, type Network } from '../line';
import type { Physics } from '../physics';
import { addTrack, PAINT } from './parts';
import { Section } from './section';
import { terrazzoTexture, tileTexture } from '../gfx/textures';
import { drawPoster } from '../gfx/posters';
import { hash01 } from '../clock';
import type { Interactable, Zone } from './zones';
import { stationArchitecture } from './stationDetails';
import { stationOwnDetails } from './details';
import { buildCanopy, buildCutting, buildDeck, buildGlobe, buildLanterns, buildViaduct, canopySpans, covered } from './canopy';
import { TILED_WALL_H, TILED_TOP, VAULT_WALL_H, VAULT_TOP } from '../lines/theme';
import { archHole, archProfile, extrudeRockSteps, profileLength, rectHole, wallWithHoles, type ProfilePoint } from './shapes';
import { place, textSign } from './signage';
import { buildStreet, type Street } from './street';
import { hasStreetFile } from './streetLayers';
import { streetKey } from './osmKey';
import { buildServiceAccess, SERVICE_DOOR } from './service';
import { buildKiosk, kioskShift } from './kiosk';
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
  /** The way out goes across the tracks' line instead, to this side, up stairs out of a hall under a station in the open. */
  across?: 1 | -1;
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

/** A ticket hall, at one end of the platform (see `StationDef.halls`): the main one, or a station's second. */
export interface HallInfo {
  /** Which way along x the hall lies from the platform. */
  dir: 1 | -1;
  /** The hall's extent along x and its floor. */
  bounds: { x0: number; x1: number; y: number };
  gates: GateLine;
  exit: StreetExit;
  /** World x at `a` meters along the hall from its wall toward the platform. */
  x(a: number): number;
  /** The passage between the top of the escalators and the hall, where the station has a long one: along x, and its half width. */
  corridor: { x0: number; x1: number; halfWidth: number } | null;
}

export interface StationInfo {
  index: number;
  name: string;
  cx: number;
  /** Built in the open air: beyond its fences, where a hall under the tracks has its stairs come up, is the street. */
  outdoor: boolean;
  /** How far below its usual level the ground beside it lies: 0, or as far as a hall under the tracks, under a viaduct. */
  ground: number;
  exitDir: 1 | -1;
  /** The escalators up from the platform (the first of them where there are two). */
  escalator: EscalatorZone;
  escalators: EscalatorZone[];
  /** Where each island platform's middle lies: z = 0, or both of a shared station's (see `LANE`). */
  platforms: number[];
  /** Each island's rail height, as `platforms`: 0, or under the other at a two-level station (see `STACK`). */
  levels: number[];
  /** Every track along a platform, as the departure boards list them: `setDepartures` takes each one's rows, in this order, by `number`. */
  platformTracks: Array<{ z: number; y: number; track: 1 | 2; line: number; number: number }>;
  /** How far the escalators climb from the platform to the ticket hall (see `StationDef.rise`). */
  rise: number;
  /** The ticket halls, the main one first: a station with a hall at each end of the platform has two. */
  halls: HallInfo[];
  /** The main hall's extent along x and its floor (`halls[0].bounds`). */
  hall: { x0: number; x1: number; y: number };
  gates: GateLine;
  exit: StreetExit;
  /** World x at `a` meters along the main hall (`halls[0].x`). */
  hallX(a: number): number;
  /** The inclined lifts beside the escalators, where the station has them. */
  inclines: InclineZone[];
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
    ctx.fillText(sv.driver.stopSign.toUpperCase(), w / 2, h * 0.36);
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
    ctx.fillText(sv.art.heading, 20, 32);
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
 * an escalator shaft at the exit end and a ticket hall at the top; where the
 * station has two halls (`ends`, the main one first), the same at the other
 * end too.
 */
/** @param dry lay colliders and work out positions only (see `Section`) */
/** Where a station's staff door is: the platform end (`dir` along x), and whether it stands beside the escalators there. */
export interface ServiceDoor {
  dir: 1 | -1;
  side: boolean;
}

export function buildStation(physics: Physics, net: Network, index: number, cx: number, ends: ReadonlyArray<1 | -1>, service: ServiceDoor | null, dry = false): StationBuild {
  const steps = stationSteps(physics, net, index, cx, ends, service, dry);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

export interface StationBuild {
  group: Group;
  /**
   * Every hall but the main one, with its escalators and street, a group of its own: shown by its own reach, so a
   * neighbour's hall coming close does not bring the whole of its cave into view.
   */
  extra: Group[];
  info: StationInfo;
}

/**
 * `buildStation` in steps: the rock, the furnishing, the escalators, the hall
 * and then one baked layer at a time, so a station built while the player
 * rides toward it spreads its cost over several frames. `osm`, for a station
 * in the open, is the real buildings round it.
 */
/** @param service the staff door, or null where there is none (a shared station, one in the open) */
export function* stationSteps(physics: Physics, net: Network, index: number, cx: number, ends: ReadonlyArray<1 | -1>, service: ServiceDoor | null, dry = false, osm: OsmPatch | null = null): Generator<void, StationBuild> {
  const def = net.stations[index];
  const line = net.lines[def.line];
  // Above ground: a platform under a canopy, fences and the open air instead of a cave.
  const outdoor = isOutdoor(net, index);
  const s = new Section(def.name, outdoor ? OPEN_AMBIENT : def.theme.ambient, dry, outdoor);
  // Up on a viaduct the ground lies as low as a hall under the tracks: the hall stands on it and opens straight out.
  const viaduct = viaductAt(net, index);
  const ground: Ground = viaduct ? () => -VIADUCT.drop : FLAT;
  const theme = def.theme;
  // Each hall and the way up to it, from the station's plan (or the one end the layout picks): underground a long
  // passage from the escalators to the hall, and an inclined lift beside them, not where two lines share the station
  // (its escalators come up in wings). A hall reached from along the platform climbs up through the ceiling instead
  // (`HallDef.from`). Every hall but the main one is built into a section of its own (see `StationBuild.extra`).
  const plans: readonly HallDef[] = def.halls ?? [{ end: ends[0] > 0 ? 'outbound' : 'inbound' }];
  const twin = def.lines.length > 1;
  // T-Centralen's red and green platforms, a level per direction (see `STACK`): built as the shared station is, then
  // track 1's half (z < 0) folded under the other, mirrored and dropped, as it is built.
  const stacked = twin && !outdoor && !!def.stacked;
  // The halls up at the top stand whole, over either level: a hall over the platform lies within the fold's reach.
  const hallPhysics = physics;
  if (stacked) {
    const inCave = (x: number, slack: number) => Math.abs(x - cx) <= CAVE_HALF_L + slack;
    s.setFold({ takes: (v) => v.z < -0.01 && inCave(v.x, 0.01) && v.y < STACK.top, move: (v) => { v.z = -v.z; v.y -= STACK.drop; } });
    physics = foldedPhysics(physics, (v) => v.z < -0.01 && inCave(v.x, 1.5) && v.y < STACK.top, STACK.drop);
  }
  // Underground, as deep as the station lies; in the open air, up to a hall over the tracks.
  const rise = stationRise(net, index);
  const run = escalatorRun(rise);
  const hallY = PLATFORM_Y + rise;
  const downRun = escalatorRun(UNDERPASS_DEPTH);
  const ways = plans.map((plan, k) => {
    const dir = hallDir(plan);
    // From along the platform: underground up through the ceiling, in the open up past the roof.
    const inner = plan.from !== undefined && !plan.down;
    // In the open, down to a hall under the tracks, whose stairs come up at the side beyond the fences.
    const down = outdoor && !twin && !def.city && !!plan.down;
    const under = down ? underHall(plan, k) : null;
    const foot = cx + dir * (inner || down ? plan.from! : CAVE_HALF_L);
    const corridor = outdoor || twin ? 0 : plan.corridor ?? 0;
    // Up from the foot toward `dir` to a hall beyond the escalators; or from a hall under the tracks up to the foot.
    const flight = under
      ? { wx: cx + under.hx, rise: UNDERPASS_DEPTH, run: downRun, base: PLATFORM_Y - UNDERPASS_DEPTH }
      : { wx: foot, rise, run, base: PLATFORM_Y };
    return {
      dir, inner, down, foot, corridor, flight,
      /** Where the hall starts, which way it runs from there and its floor. */
      hx: under ? flight.wx : foot + dir * (run + corridor),
      hallDir: under ? under.dir : dir,
      hallY: under ? flight.base : hallY,
      incline: !outdoor && !!plan.incline,
      exits: plan.exits ?? def.exits,
      /** The side a hall under the tracks has its stairs up on (see `underHall`). */
      across: under?.across,
      square: under ? { ...under.square, x0: cx + under.square.x0, x1: cx + under.square.x1 } : undefined,
      // Under the ground a hall is lit as underground, not by the sky.
      section: down ? new Section(`${def.name}-under-${k + 1}`, theme.ambient, dry) : k === 0 ? s : new Section(`${def.name}-hall-${k + 1}`, outdoor ? OPEN_AMBIENT : theme.ambient, dry, outdoor),
    };
  });
  /** Where a hall under the tracks has its stairs come up: a square beside them, bare of grass and trees. */
  const squares: Clearing[] = ways.flatMap((w) => (w.square ? [w.square] : []));
  /** Where escalators go down from the island to a hall under the tracks, the island and its trackbed open round them. */
  const openings = ways.filter((w) => w.down).map((w) => {
    const { wx, base } = w.flight;
    // From where the tube's roof sinks below the trackbed to the top of the flight.
    const a = ESC_LANDING + (-0.5 - ESC_HEADROOM - base) / Math.tan(ESC_ANGLE);
    const [x0, x1] = [wx + w.dir * a, w.foot].sort((p, q) => p - q);
    return { x0, x1, way: w, a };
  });
  const OPENING = ESC_HALF_W + ESC_DESIGN.railWidth;
  /** Calls `whole` for the stretches of `x0` to `x1` clear of openings, and `open` for those an opening takes. */
  const around = (x0: number, x1: number, whole: (a: number, b: number) => void, open: (a: number, b: number) => void, list: ReadonlyArray<{ x0: number; x1: number }> = openings) => {
    let from = x0;
    for (const o of [...list].sort((p, q) => p.x0 - q.x0)) {
      if (o.x1 <= from || o.x0 >= x1) continue;
      if (o.x0 > from) whole(from, o.x0);
      open(Math.max(from, o.x0), Math.min(x1, o.x1));
      from = Math.min(x1, o.x1);
    }
    if (from < x1) whole(from, x1);
  };
  /** The halls at the platform's ends, through their end walls. */
  const endWays = ways.filter((w) => !w.inner && !w.down);
  const hallEnds = endWays.map((w) => w.dir);
  const e = ways[0].hallDir;
  /** The platform's ends without a hall: fenced off, with a warning. */
  const bares = ([-1, 1] as const).filter((d) => !hallEnds.includes(d));
  /** Steps down from the fenced end to the staff door in the middle of its end wall. */
  const steps = !!service && !service.side && bares.includes(service.dir);
  /**
   * Along x, where a way up or down from along the platform stands on it: the island kept clear, with room to walk on
   * where its escalators start.
   */
  const innerSpans = ways.filter((w) => w.inner || w.down).map((w) => (w.inner
    ? [w.foot - w.dir * 6, w.foot + w.dir * (run + 1)]
    : [w.flight.wx - w.dir, w.foot + w.dir * 6]).sort((p, q) => p - q) as [number, number]);
  // At a two-level station, stairs down through the upper island's floor to the lower one, each running outward.
  const stairRun = Math.round(STACK.drop / STACK.riser) * STACK.tread;
  const stairWells = (stacked ? STACK.stairs : []).map((dx) => {
    const [x0, x1] = [cx + dx, cx + dx + Math.sign(dx) * stairRun].sort((p, q) => p - q);
    return { x0, x1, top: cx + dx, dir: Math.sign(dx) as 1 | -1 };
  });
  innerSpans.push(...stairWells.map((w) => [w.x0 - 1, w.x1 + 1] as [number, number]));
  /** Is the island clear for something `half` long either side of `x`? */
  const free = (x: number, half = 0) => !innerSpans.some(([x0, x1]) => x + half > x0 && x - half < x1);
  /** Stretches of the island a station's own detail stands on (see `DetailSite.claim`): clocks and the plaque keep off them. */
  const claimed: Array<[number, number]> = [];
  const clear = (x: number, half = 0) => free(x, half) && !claimed.some(([x0, x1]) => x + half > x0 && x - half < x1);
  const benches = benchXs(cx).filter((x) => free(x, 2));
  /** The information pillars along the island, as offsets from the middle. */
  const pillars = PILLAR_DXS.filter((dx) => free(cx + dx, 0.4));
  const xa = cx - CAVE_HALF_L;
  const xb = cx + CAVE_HALF_L;

  // A station shared by two lines has four tracks and two island platforms:
  // its own line's tracks inside, the other's beyond them (see `LANE`).
  const halfW = twin ? CAVE_HALF_W + LANE : CAVE_HALF_W;
  const islands = twin ? [-LANE, LANE] : [0];
  const trackZs = twin ? [-TRACK_Z - LANE, -TRACK_Z, TRACK_Z, TRACK_Z + LANE] : [-TRACK_Z, TRACK_Z];
  /** The islands with escalators up to the halls: at a two-level station only the upper; the lower has its stairs. */
  const upIslands = stacked ? islands.filter((z) => z > 0) : islands;
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
  // The rock round the cave stops under the lowest hall: one reached from along the platform stands over it.
  const rockTop = Math.min(14, ...ways.map((w) => w.hallY)) - 0.05;
  if (tiled && !outdoor) for (const side of [-1, 1]) physics.box({ x: xa, y: -1, z: Math.min(side * outer, side * halfW) }, { x: xb, y: rockTop, z: Math.max(side * outer, side * halfW) });
  // Where a way up from along the platform climbs through the ceiling: from where its tube's roof meets the ceiling to
  // where its floor has passed it, around the escalators (and a lift beside them). A collar closes the rest.
  // In a rock cave, through the crown of the vault.
  const ceilingY = vaulted ? VAULT_TOP : tiled ? TILED_TOP : CAVE_TOP;
  const holes = ways.filter((w) => w.inner).flatMap((w) => islands.map((zi) => {
    const a0 = ESC_LANDING + (ceilingY - 0.2 - ESC_HEADROOM - PLATFORM_Y) / Math.tan(ESC_ANGLE);
    // Past where the truss under the flight has cleared the ceiling (see `escalatorSteps`).
    const a1 = ESC_LANDING + (ceilingY + 0.2 + ESC_DESIGN.stepDepth + 0.9 - PLATFORM_Y) / Math.tan(ESC_ANGLE);
    const [x0, x1] = [w.foot + w.dir * a0, w.foot + w.dir * a1].sort((p, q) => p - q);
    const side = ESC_HALF_W + ESC_DESIGN.railWidth;
    return { way: w, zi, x0, x1, low: w.foot + w.dir * a0, z0: zi - side - 0.4, z1: zi + (w.incline ? INCLINE.z1 : side) + 0.4, lift: w.incline ? INCLINE.z1 : ESC_HALF_W };
  }));
  for (const h of holes) {
    // The collar: flat strips of ceiling beside the tube, a little past the opening's ragged edge, and a plate over
    // its low end.
    const paint = theme.paint;
    const [x0, x1] = [h.x0 - 0.4, h.x1 + 0.4];
    // Up to the tube's own walls, whose faces the collar's leave out.
    s.lit.box({ x: x0, y: ceilingY - 0.02, z: h.z0 - 0.6 }, { x: x1, y: ceilingY + 0.3, z: h.zi - ESC_HALF_W }, paint, ['pz']);
    s.lit.box({ x: x0, y: ceilingY - 0.02, z: h.zi + h.lift }, { x: x1, y: ceilingY + 0.3, z: h.z1 + 0.6 }, paint, ['nz']);
    s.lit.box({ x: Math.min(h.low, h.low - h.way.dir * 0.35), y: ceilingY - 0.02, z: h.zi - ESC_HALF_W }, { x: Math.max(h.low, h.low - h.way.dir * 0.35), y: ceilingY + 0.3, z: h.zi + h.lift }, paint);
  }
  const cuts = holes.map((h) => ({ x0: h.x0, x1: h.x1, z0: h.z0, z1: h.z1 }));
  // The stairs come down through the lower level's vault, which is built as track 1's half before it is folded under.
  for (const w of stairWells) cuts.push({ x0: w.x0 - 0.3, x1: w.x1 + 0.3, z0: -LANE - OPENING - 0.3, z1: -LANE + OPENING + 0.3 });
  for (const profile of outdoor ? [] : profiles) {
    // The artwork is painted (and cached) in the dry pass already, behind the loading screen: painted on the way it
    // would hold up a frame for as long as 50 ms, and far longer on a phone.
    const art = theme.art?.(profileLength(profile), wallTop - CAVE_BOTTOM);
    if (dry) continue;
    if (art) yield* extrudeRockSteps(s.artLayer(art.texture), profile, xa, xb, { ...rock, artPeriod: art.period, cuts }, rgb(0xf4f4f4));
    else yield* extrudeRockSteps(s.lit, profile, xa, xb, { ...rock, cuts }, theme.paint);
    yield;
  }

  // In the open air, a station building stands over the escalator at each hall's end.
  if (outdoor) for (const zi of islands) for (const e of hallEnds) {
    const wx = cx + e * CAVE_HALF_L;
    const B = { half: PLATFORM_HALF_W - 0.4, top: PLATFORM_Y + ESC_HEADROOM + 2.2 };
    const front: ProfilePoint[] = [
      { z: zi - B.half, y: 0, nz: -1, ny: 0 }, { z: zi - B.half, y: B.top, nz: -1, ny: 0 },
      { z: zi + B.half, y: B.top, nz: 1, ny: 0 }, { z: zi + B.half, y: 0, nz: 1, ny: 0 },
    ];
    wallWithHoles(s.lit, wx, front, [rectHole(zi - ESC_HALF_W, zi + ESC_HALF_W, PLATFORM_Y, PLATFORM_Y + ESC_HEADROOM)], rgb(def.canopy?.building ?? 0xb8b2a6));
    const xo0 = e > 0 ? wx : wx - 1;
    const xo1 = e > 0 ? wx + 1 : wx;
    physics.box({ x: xo0, y: -1, z: zi - B.half }, { x: xo1, y: B.top, z: zi - ESC_HALF_W });
    physics.box({ x: xo0, y: -1, z: zi + ESC_HALF_W }, { x: xo1, y: B.top, z: zi + B.half });
    physics.box({ x: xo0, y: PLATFORM_Y + ESC_HEADROOM, z: zi - ESC_HALF_W }, { x: xo1, y: B.top, z: zi + ESC_HALF_W });
  }

  // End walls: tunnel mouths on both, the escalator openings at each hall's end.
  for (const end of outdoor ? [] : [-1, 1] as const) {
    const wx = cx + end * CAVE_HALF_L;
    const holes = trackZs.map((zc) => archHole(zc, TUBE_HALF_W, TUBE_WALL_H, TUBE_TOP, TUBE_BOTTOM));
    // Openings below the tubes' top: the escalators (and an inclined lift's door), or the staff door (a shared station
    // has none).
    const openings: Array<[number, number, number]> = [];
    const way = endWays.find((w) => w.dir === end);
    if (way) for (const zc of upIslands) openings.push([zc - ESC_HALF_W, zc + ESC_HALF_W, PLATFORM_Y + ESC_HEADROOM]);
    if (service?.dir === end) openings.push(service.side ? [SIDE_DOOR.z0, SIDE_DOOR.z1, PLATFORM_Y + SIDE_DOOR.height] : [-SERVICE_DOOR.halfWidth, SERVICE_DOOR.halfWidth, SERVICE_DOOR.height]);
    if (way?.incline) for (const zc of upIslands) openings.push([...liftAcross(zc), PLATFORM_Y + INCLINE.height - 0.15]);
    for (const [z0, z1, top] of openings) holes.push(rectHole(z0, z1, way ? PLATFORM_Y : 0, top));
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
      if (z0 > z) physics.box({ x: xo0, y: -1, z }, { x: xo1, y: rockTop, z: z0 });
      physics.box({ x: xo0, y: top, z: z0 }, { x: xo1, y: rockTop, z: z1 });
      z = Math.max(z, z1);
    }
    physics.box({ x: xo0, y: -1, z }, { x: xo1, y: rockTop, z: halfW + 1 });
  }

  // Each stage below ends with a yield, so a station built on the way stays within a frame per stage.
  yield;
  // Trackbed, tracks and the island platforms.
  around(xa, xb, (a, b) => s.lit.box({ x: a, y: -0.5, z: -halfW }, { x: b, y: 0, z: halfW }, PAINT.ballast, ['ny']), (a, b) => {
    for (const side of [-1, 1]) s.lit.box({ x: a, y: -0.5, z: Math.min(side * OPENING, side * halfW) }, { x: b, y: 0, z: Math.max(side * OPENING, side * halfW) }, PAINT.ballast, ['ny']);
  });
  // In the city by the water, railings and Riddarfjärden; elsewhere fences and the suburbs.
  if (outdoor && def.city) {
    railings(s, physics, xa, xb, halfW);
    yield;
    buildCity(s, xa, xb, halfW, cityAnchors(net));
  } else if (outdoor) {
    openGround(s, physics, xa, xb, index * 17 + 5, true, osm ? [osm] : [], squares, ground);
    if (def.canopy?.cutting) buildCutting(s, physics, def.canopy.cutting, xa, xb, squares);
    if (viaduct) {
      // Open over the escalators down through the island, and no pier where a hall stands under the deck.
      const holes = openings.flatMap((o) => islands.map((zi) => ({ x0: o.x0, x1: o.x1, z0: zi - OPENING, z1: zi + OPENING })));
      const halls = ways.filter((w) => w.down).map((w) => {
        const [h0, h1] = [w.hx, w.hx + w.hallDir * HALL_LEN].sort((p, q) => p - q);
        return { x0: h0 - 1, x1: h1 + 1, z0: -HALL_HALF_W - 1, z1: HALL_HALF_W + 1 };
      });
      buildViaduct(s, physics, xa, xb, ground, holes, halls);
    }
  }
  yield;
  for (const zc of trackZs) addTrack(s, xa, xb, zc, true);
  yield;
  const p0 = hallEnds.includes(-1) ? xa : cx - PLATFORM_HALF_L;
  const p1 = hallEnds.includes(1) ? xb : cx + PLATFORM_HALF_L;
  if (stacked) {
    // Open over the stairs down through the upper island (the lower level's trackbed is folded from track 1's half).
    around(xa, xb, (a, b) => physics.box({ x: a, y: -1, z: -halfW }, { x: b, y: -0.02, z: halfW }), (a, b) => {
      physics.box({ x: a, y: -1, z: -halfW }, { x: b, y: -0.02, z: LANE - OPENING });
      physics.box({ x: a, y: -1, z: LANE + OPENING }, { x: b, y: -0.02, z: halfW });
    }, stairWells);
  } else around(xa, xb, (a, b) => physics.box({ x: a, y: -1, z: -halfW }, { x: b, y: -0.02, z: halfW }), (a, b) => {
    for (const side of [-1, 1]) physics.box({ x: a, y: -1, z: Math.min(side * OPENING, side * halfW) }, { x: b, y: -0.02, z: Math.max(side * OPENING, side * halfW) });
  });
  physics.box({ x: xa, y: -1, z: halfW }, { x: xb, y: 14, z: halfW + 1 });
  physics.box({ x: xa, y: -1, z: -halfW - 1 }, { x: xb, y: 14, z: -halfW });
  const farEnd = (bare: 1 | -1) => (bare > 0 ? p1 : p0);
  // Platform surface, from the center out: stone slabs, a tactile strip,
  // more slabs, then a pale edge line.
  const W = PLATFORM_HALF_W;
  for (const zi of islands) {
    // The upper island of a two-level station opens over its stairs down.
    const cutsHere = stacked && zi > 0 ? [...openings, ...stairWells] : openings;
    const top = (b: MeshBuilder, z0: number, z1: number, paint: RGB) => {
      for (const side of [-1, 1]) {
        const slab = (x0: number, x1: number, from: number) => {
          if (from >= z1) return;
          const a = zi + side * from;
          const c = zi + side * z1;
          b.box({ x: x0, y: PLATFORM_Y - 0.02, z: Math.min(a, c) }, { x: x1, y: PLATFORM_Y, z: Math.max(a, c) }, paint, ['ny', 'pz', 'nz', 'px', 'nx']);
        };
        around(p0, p1, (x0, x1) => slab(x0, x1, z0), (x0, x1) => slab(x0, x1, Math.max(z0, OPENING)), cutsHere);
      }
    };
    // Stone slabs, or poured terrazzo in the station's colour.
    const slabs = def.look?.floor !== undefined ? s.artLayer(terrazzoTexture()) : s.floor;
    // In the open a tint of the slabs' own grey: asphalt and concrete darker, a red tile floor red.
    const slab = def.look?.floor !== undefined ? rgb(def.look.floor) : outdoor && def.canopy?.floor !== undefined ? mix(rgb(def.canopy.floor), SLAB, 0.45) : SLAB;
    // Kungsträdgården's parterre is laid over the slabs as its own detail (`details/blue.ts`).
    top(slabs, 0, W - 1.1, slab);
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
    around(p0, p1, (a, b) => physics.box({ x: a, y: -1, z: zi - PLATFORM_HALF_W }, { x: b, y: PLATFORM_Y, z: zi + PLATFORM_HALF_W }), (a, b) => {
      for (const side of [-1, 1]) physics.box({ x: a, y: -1, z: Math.min(zi + side * OPENING, zi + side * PLATFORM_HALF_W) }, { x: b, y: PLATFORM_Y, z: Math.max(zi + side * OPENING, zi + side * PLATFORM_HALF_W) });
    }, cutsHere);
    for (const o of openings) buildPlatformOpening(s, physics, o.way.flight, o.way.dir, o.a, OPENING);
    if (stacked && zi > 0) for (const w of stairWells) buildLevelStairs(s, physics, w.top, w.dir, zi, stairRun, OPENING);

    // Fence and warning at the far platform end. On a station's own island a
    // gate in the middle stands open onto steps down to the staff door.
    for (const bare of bares) for (const side of [-1, 1]) {
      const fx = farEnd(bare);
      const z0 = zi + side * PLATFORM_HALF_W;
      const z1 = zi + side * (steps && service!.dir === bare ? SERVICE_GATE + 0.04 : 0);
      s.lit.box({ x: fx - 0.05, y: PLATFORM_Y, z: Math.min(z0, z1) }, { x: fx + 0.05, y: PLATFORM_Y + 1.1, z: Math.max(z0, z1) }, rgb(0xd9b93b));
      physics.box({ x: fx - 0.1, y: PLATFORM_Y, z: Math.min(z0, z1) }, { x: fx + 0.1, y: PLATFORM_Y + 2.2, z: Math.max(z0, z1) });
    }
  }
  if (twin && !outdoor) {
    // A wall between the two lines' inner tracks, up to the ceiling (under vaults, the ground between them).
    if (!vaulted) s.lit.box({ x: xa, y: 0, z: -inner }, { x: xb, y: TILED_TOP + 0.2, z: inner }, theme.paint);
    physics.box({ x: xa, y: -1, z: -inner }, { x: xb, y: rockTop, z: inner });
  }
  yield;
  if (steps) buildServiceAccess(s, physics, cx, -service!.dir as 1 | -1);
  const warn = textSign('Obehöriga äga ej tillträde', 768, 128, '#f2f2f2', '#b3261e');
  for (const bare of bares) for (const zi of islands) {
    const fx = farEnd(bare);
    place(s, warn, 2.8, 0.47, new Vector3(fx - bare * 0.08, PLATFORM_Y + 1.5, zi), new Vector3(-bare, 0, 0));
    if (steps && service!.dir === bare) for (const z of [-1.3, 1.3]) s.lit.box({ x: fx - 0.03, y: PLATFORM_Y + 1.1, z: z - 0.03 }, { x: fx + 0.03, y: PLATFORM_Y + 1.28, z: z + 0.03 }, rgb(0xd9b93b));
  }

  // Paired continuous fluorescent troughs frame each boarding side. In the open they run only under the roof, and a
  // bare rail carries the signs on beyond it, from lamp post to lamp post.
  const lampColor = theme.lamp;
  const RAIL = STATION_DESIGN.lightingY;
  const ownRoof = outdoor && !twin && def.canopy?.deck === undefined;
  const roofSpans = ownRoof ? canopySpans(def.canopy, p0 + 4, p1 - 4, ways[0].dir) : [[p0, p1] as const];
  const roofed = (x: number, half = 0) => !ownRoof || covered(roofSpans, x, half);
  /** Where the lamps' hangers end: the cave's roof, a roof in the open or a deck. */
  const hangTop = !outdoor ? CAVE_TOP : def.canopy?.deck !== undefined ? CANOPY.deckY : CANOPY.y;
  const tubeXs: number[] = [];
  for (let x = p0 + 3; x < p1 - 2; x += 4.5) tubeXs.push(x);
  // An inclined lift beside a way up from along the platform takes the +z trough's place over it.
  const liftSpans = ways.filter((w) => w.inner && w.incline).map((w) => [Math.min(w.foot, w.foot + w.dir * run) - 2.5, Math.max(w.foot, w.foot + w.dir * run) + 1] as const);
  const lit = (x: number, side: number, half = 0) => side < 0 || !liftSpans.some(([x0, x1]) => x + half > x0 && x - half < x1);
  // One tube flickers and hums: it has its own material instead of the baked layer.
  let broken = brokenTube(index, tubeXs.length);
  while (!lit(tubeXs[broken], 1, 2)) broken = (broken + 1) % tubeXs.length;
  const tube = new Mesh(new BoxGeometry(3.9, 0.045, 0.19), new MeshBasicMaterial({ color: 0xf2f5ee }));
  tube.name = 'flickering-tube';
  tube.position.set(tubeXs[broken], RAIL - 0.0225, islands[islands.length - 1] + STATION_DESIGN.lightingZ);
  s.extras.add(tube);
  for (const [k0, zi] of islands.entries()) {
    for (const side of [-1, 1]) {
      const z = zi + side * STATION_DESIGN.lightingZ;
      // The trough, in pieces round a lift's shaft.
      let from = p0;
      for (const [x0, x1] of side > 0 ? [...liftSpans].sort((a, b) => a[0] - b[0]) : []) {
        if (x0 > from) s.lit.box({ x: from, y: RAIL, z: z - 0.19 }, { x: Math.min(x0, p1), y: RAIL + 0.2, z: z + 0.19 }, rgb(0x555b5b));
        from = Math.max(from, x1);
      }
      if (from < p1) {
        if (ownRoof) {
          s.lit.box({ x: from, y: RAIL + 0.08, z: z - 0.05 }, { x: p1, y: RAIL + 0.16, z: z + 0.05 }, rgb(0x555b5b));
          for (const [a, b] of roofSpans) if (b > from) s.lit.box({ x: Math.max(from, a), y: RAIL, z: z - 0.19 }, { x: Math.min(p1, b), y: RAIL + 0.2, z: z + 0.19 }, rgb(0x555b5b));
        } else s.lit.box({ x: from, y: RAIL, z: z - 0.19 }, { x: p1, y: RAIL + 0.2, z: z + 0.19 }, rgb(0x555b5b));
      }
      for (const [k, x] of tubeXs.entries()) {
        if (!lit(x, side, 2) || !roofed(x, 2)) continue;
        if (side > 0 && k === broken && k0 === islands.length - 1) { s.light(x, RAIL - 0.2, z, lampColor, 0.4, 8); continue; }
        s.unlit.box({ x: x - 1.95, y: RAIL - 0.045, z: z - 0.095 }, { x: x + 1.95, y: RAIL, z: z + 0.095 }, rgb(0xf2f5ee));
        s.light(x, RAIL - 0.2, z, lampColor, 0.62, 8);
        s.light(x, RAIL + 0.6, z, lampColor, 0.65, 10);
      }
      for (let x = p0 + 5; x < p1; x += 14) {
        if (!lit(x, side, 0.2) || !roofed(x, 0.2)) continue;
        s.lit.box({ x: x - 0.025, y: RAIL + 0.2, z: z - 0.025 }, { x: x + 0.025, y: hangTop, z: z + 0.025 }, PAINT.fixture);
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
    if (twin) for (const zi of islands) {
      for (const dx of STATION_DESIGN.pierXs.filter((d) => free(cx + d, 0.3))) {
        const geo = new CylinderGeometry(0.12, 0.12, roofY - PLATFORM_Y, 10);
        s.lit.geometry(geo, new Matrix4().setPosition(cx + dx, (roofY + PLATFORM_Y) / 2, zi), post);
        geo.dispose();
        physics.box({ x: cx + dx - 0.15, y: PLATFORM_Y, z: zi - 0.15 }, { x: cx + dx + 0.15, y: roofY, z: zi + 0.15 });
      }
    }
    // Elsewhere the station's own roof, over as much of the platform as the real one covers (`canopy.ts`), or a deck
    // over it all.
    else if (def.canopy?.deck !== undefined) buildDeck(s, physics, def.canopy, xa, xb, halfW, islands, free, lampColor);
    else for (const zi of islands) {
      if (zi === islands[0] && def.canopy?.globe) buildGlobe(s, cx, def.canopy.globe);
      buildCanopy(s, physics, def.canopy, zi, cx, roofSpans, free);
      buildLanterns(s, physics, def.canopy, zi, p0, p1, roofSpans, free, lampColor);
    }
  } else if (tiled) {
    // Columns down each island, up to the ceiling: square and tiled, round, or none.
    const kind = def.look?.columns ?? 'square';
    const paint = def.look?.columnColor !== undefined ? rgb(def.look.columnColor) : theme.paint;
    const top = (vaulted ? VAULT_TOP : TILED_TOP) + 0.2;
    for (const zi of islands) {
      for (const dx of kind === 'none' ? [] : STATION_DESIGN.pierXs) {
        const x = cx + dx;
        if (!free(x, 0.5)) continue;
        if (kind === 'round') {
          const geo = new CylinderGeometry(0.22, 0.22, top - PLATFORM_Y, 16);
          s.lit.geometry(geo, new Matrix4().setPosition(x, (top + PLATFORM_Y) / 2, zi), paint);
          geo.dispose();
        } else s.lit.box({ x: x - 0.35, y: PLATFORM_Y, z: zi - 0.35 }, { x: x + 0.35, y: top, z: zi + 0.35 }, paint);
        physics.box({ x: x - 0.4, y: PLATFORM_Y, z: zi - 0.4 }, { x: x + 0.4, y: top, z: zi + 0.4 });
      }
    }
  } else stationArchitecture(s, physics, def, cx, e, free, (x, half) => claimed.push([x - half, x + half]));
  // Two platform tunnels joined by a middle vault: a wall down the island between its openings, up into the ceiling.
  if (def.look?.split && !outdoor && !twin) {
    // Well into the rock over a cave's rough crown, or through a tiled ceiling, flat or vaulted: its top is never seen.
    const top = tiled ? Math.max(VAULT_TOP, TILED_TOP) + 1.5 : CAVE_TOP + 3;
    const cuts = [...SPLIT.openings.map(([a, b]) => [cx + a, cx + b] as const)].sort((p, q) => p[0] - q[0]);
    let from = cx - SPLIT.end;
    for (const [a, b] of [...cuts, [cx + SPLIT.end, Infinity] as const]) {
      // In runs round a way up from along the platform, where the island stays clear.
      let run: number | null = null;
      for (let x = from; x <= a; x += 1) {
        const clear = x < a && free(Math.min(a, x + 0.5), 0.5);
        if (clear && run === null) run = x;
        if ((!clear || x + 1 > a) && run !== null) {
          const x2 = clear ? a : x;
          for (const zi of islands) {
            s.lit.box({ x: run, y: PLATFORM_Y, z: zi - SPLIT.half }, { x: x2, y: top, z: zi + SPLIT.half }, theme.paint, [], 1.5);
            physics.box({ x: run, y: PLATFORM_Y, z: zi - SPLIT.half }, { x: x2, y: top, z: zi + SPLIT.half });
          }
          run = null;
        }
      }
      from = b;
    }
  }
  yield;
  // The station's own sculptures, showcases and fittings (`details/`), a stage of their own.
  stationOwnDetails(line.id, { s, physics, def, cx, exitDir: e, islands, outdoor, tiled, free, claim: (x, half) => claimed.push([x - half, x + half]) });
  yield;
  if (!outdoor) for (let x = p0 + 6; x < p1; x += 9) {
    for (const side of [-1, 1]) s.light(x, vaulted ? VAULT_WALL_H - 0.4 : STATION_DESIGN.corniceY, side * (halfW - 1.6), lampColor, 0.75, 8);
  }

  yield;
  // Benches along each platform's center.
  for (const zi of islands) {
    for (const bx of benches) {
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
    for (const dx of pillars) {
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
    const ax = [cx + 4.5, cx - 4.5, cx + 24].find((x) => clear(x, 0.6)) ?? cx + 4.5;
    const zi = islands[0];
    s.lit.box({ x: ax - 0.04, y: PLATFORM_Y, z: zi - 0.04 }, { x: ax + 0.04, y: PLATFORM_Y + 1.9, z: zi + 0.04 }, rgb(0x2a2c30));
    s.lit.box({ x: ax - 0.5, y: PLATFORM_Y + 0.9, z: zi - 0.05 }, { x: ax + 0.5, y: PLATFORM_Y + 2.2, z: zi + 0.05 }, rgb(0x1d2a3a));
    physics.box({ x: ax - 0.5, y: PLATFORM_Y, z: zi - 0.06 }, { x: ax + 0.5, y: PLATFORM_Y + 2.2, z: zi + 0.06 });
    const sign = artSign(def.name, plaque[0], plaque[1]);
    for (const side of [-1, 1]) place(s, sign, 0.94, 1.24, new Vector3(ax, PLATFORM_Y + 1.55, zi + side * 0.05), new Vector3(0, 0, side));
    artInteractables.push({ pos: new Vector3(ax, PLATFORM_Y + 1, zi), radius: 1.9, prompt: () => text.art.prompt, act: () => artWalk.visit(def.name) });
  }

  // Hanging clocks showing the real time.
  const clocks: CanvasSign[] = [];
  for (const zi of islands) {
    for (const dx of [-18, 18].filter((d) => clear(cx + d, 0.5))) {
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
      // Under a roof it hangs from it; in the open beyond the roof it stands on a pole.
      if (roofed(x, 0.5)) s.lit.box({ x: x - 0.02, y: 4.2, z: zi - 0.02 }, { x: x + 0.02, y: ownRoof ? CANOPY.y : RAIL, z: zi + 0.02 }, PAINT.fixture);
      else {
        s.lit.box({ x: x - 0.05, y: PLATFORM_Y, z: zi - 0.05 }, { x: x + 0.05, y: 3.48, z: zi + 0.05 }, PAINT.fixture);
        physics.box({ x: x - 0.08, y: PLATFORM_Y, z: zi - 0.08 }, { x: x + 0.08, y: 3.48, z: zi + 0.08 });
      }
    }
  }

  // Transfer sign, readable when walking toward the exit.
  if (def.transfer) {
    const text = def.transfer.replace(/^Byte till /, 'Byte: ').replace(/\.$/, '');
    const sign = textSign(`↑ ${text}`, 1024, 128, '#f2f2f2', '#10325f');
    for (const zi of islands) {
      const tx = [cx + e * 6, cx - e * 6, cx + e * 30].find((x) => free(x, 0.3)) ?? cx + e * 6;
      place(s, sign, 5, 0.62, new Vector3(tx, 3.75, zi), new Vector3(-e, 0, 0));
      s.lit.box({ x: tx + e * 0.01 - 0.01, y: 3.44, z: zi - 2.5 }, { x: tx + e * 0.01 + 0.01, y: 4.06, z: zi + 2.5 }, rgb(0x2a2c30));
      s.lit.box({ x: tx - 0.02, y: 4.06, z: zi - 0.02 }, { x: tx + 0.02, y: RAIL, z: zi + 0.02 }, PAINT.fixture);
    }
  }

  // Stop marks where a train's nose comes to rest, one per track, for drivers, on its far side from the platform.
  for (const tz of trackZs) {
    const dir = tz < 0 ? 1 : -1;
    const x = cx + dir * (TRAIN_HALF_L + TRAIN_NOSE);
    const z = tz + Math.sign(tz - islandOf(tz)) * 2.05;
    s.lit.box({ x: x - 0.04, y: 0, z: z - 0.04 }, { x: x + 0.04, y: 2.4, z: z + 0.04 }, rgb(0x2a2c30));
    physics.box({ x: x - 0.05, y: 0, z: z - 0.05 }, { x: x + 0.05, y: 2.4, z: z + 0.05 });
    place(s, stopMark(), 0.5, 0.62, new Vector3(x, 2.55, z), new Vector3(-dir, 0, 0));
  }

  for (const way of ways) {
    // Toward an end, near its wall; toward a way up from along the platform, over the escalators' foot.
    const bx = way.inner ? way.foot - way.dir * 1.5 : cx + way.dir * 62;
    if (!way.inner && !free(bx, 0.3)) continue;
    const exitBoard = textSign('↑ ' + way.exits, 1024, 128, '#f4d03f', '#1c2025');
    for (const zi of islands) place(s, exitBoard, 5.8, 0.72, new Vector3(bx, 3.8, zi), new Vector3(-way.dir, 0, 0));
  }

  yield;
  // Station name boards on the walls above the tracks (and on the middle wall of a shared station).
  const board = nameBoard(def.name, line);
  const boardZ = halfW - (CAVE_HALF_W - STATION_DESIGN.nameBoardZ);
  for (const x of STATION_DESIGN.nameBoardDxs.map((dx) => cx + dx)) {
    for (const side of [-1, 1]) {
      // Outdoors they hang from the canopy's edges, facing the tracks.
      // Outdoors they hang from the roof's eaves, and beyond the roof stand on two posts.
      if (outdoor) {
        for (const zi of islands) {
          const z = zi + side * 4.36;
          place(s, board, 3.6, 0.55, new Vector3(x, STATION_DESIGN.lightingY - 0.2, z), new Vector3(0, 0, side));
          const eave = def.canopy?.roof === 'butterfly' ? CANOPY.y + CANOPY.pitch : CANOPY.y;
          const roofedHere = roofed(x, 1.9);
          if (roofedHere && eave - STATION_DESIGN.lightingY < 0.2) continue;
          for (const dx of [-1.5, 1.5]) {
            const [y0, y1] = roofedHere ? [STATION_DESIGN.lightingY + 0.05, eave] : [PLATFORM_Y, STATION_DESIGN.lightingY + 0.05];
            s.lit.box({ x: x + dx - 0.03, y: y0, z: z - side * 0.08 - 0.03 }, { x: x + dx + 0.03, y: y1, z: z - side * 0.08 + 0.03 }, PAINT.fixture);
            if (!roofedHere) physics.box({ x: x + dx - 0.06, y: PLATFORM_Y, z: z - side * 0.08 - 0.06 }, { x: x + dx + 0.06, y: y1, z: z - side * 0.08 + 0.06 });
          }
        }
        continue;
      }
      place(s, board, STATION_DESIGN.nameBoardHalfX * 2, 0.64, new Vector3(x, STATION_DESIGN.nameBoardY, side * boardZ), new Vector3(0, 0, -side));
      if (twin) place(s, board, STATION_DESIGN.nameBoardHalfX * 2, 0.64, new Vector3(x, STATION_DESIGN.nameBoardY, side * (TRACK_Z - TRAIN_HALF_W - 1.5 + 0.02)), new Vector3(0, 0, side));
    }
  }

  // Hanging direction signs. Trains keep left: track 1 (z < 0) runs west, track 2 (z > 0) east.
  // At a shared station each island has one direction of both lines.
  const lineAt = (z: number) => (twin && Math.abs(z) > TRACK_Z + 1 ? net.lines[def.lines.find((l) => l !== def.line)!] : line);
  const toward = (on: LineDef, end: 'outbound' | 'inbound') => {
    const serving = on.routes.filter((route) => on === line ? onRoute(def, route.number) : true).filter((route) => route[end] !== def.name);
    const names = [...new Set(serving.map((route) => route[end]))];
    return names.map((name) => `${serving.filter((route) => route[end] === name).map((route) => route.number).join('/')} ${name}`).join(' · ');
  };
  /** A track's number and where its trains go, or that they end here. */
  const trackText = (z: number) => {
    const where = toward(lineAt(z), z < 0 ? 'outbound' : 'inbound');
    return { number: twin ? trackZs.indexOf(z) + 1 : z < 0 ? 1 : 2, where: where || 'Slutstation' };
  };
  for (const zi of islands) {
    const [lo, hi] = trackZs.filter((z) => islandOf(z) === zi).sort((a, b) => a - b);
    // Folded under the other level (`STACK`), the island is mirrored: its tracks change sides.
    const [L, R] = stacked && zi < 0 ? [trackText(lo), trackText(hi)] : [trackText(hi), trackText(lo)];
    // Seen looking toward -x, +z is on the viewer's left.
    const faceNegX = directionFace(`← Spår ${L.number}  ${L.where}`, `${R.where}  Spår ${R.number} →`);
    // Seen looking toward +x, -z is on the viewer's left.
    const facePosX = directionFace(`← Spår ${R.number}  ${R.where}`, `${L.where}  Spår ${L.number} →`);
    // Halfway between the piers at 28 and 56, clear of their flared tops and of the canopy posts.
    for (const dx of [-42, 42].filter((d) => free(cx + d, 3.3))) {
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
  /** Where a track or an island built on track 1's half of a two-level station ends up, folded under the other: z, y. */
  const folded = (z: number): [number, number] => (stacked && z < 0 ? [-z, -STACK.drop] : [z, 0]);
  const platformTracks = trackZs.map((z) => ({ z: folded(z)[0], y: folded(z)[1], track: (z < 0 ? 1 : 2) as 1 | 2, line: net.lines.indexOf(lineAt(z)), number: trackText(z).number })).sort((a, b) => a.number - b.number);
  const displays: Array<{ sign: CanvasSign; tracks: number[] }> = [];
  for (const zi of islands) {
    const tracks = platformTracks.flatMap((t, k) => (islandOf(t.z) === zi ? [k] : []));
    for (const dx of [-48, 48].filter((d) => free(cx + d, 1.4))) {
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
  // An escalator up from each island at each hall's end; a shared station's are built in sections of their own and
  // moved out to its islands.
  const escalators: EscalatorZone[] = [];
  /** What goes with each hall's group: the main one's with the station's. */
  const wayGroups: Group[][] = ways.map(() => []);
  const inclines: InclineZone[] = [];
  for (const [k, way] of ways.entries()) {
    const { wx, rise, run, base } = way.flight;
    const ws = way.section;
    // Through an end wall an inclined shaft; from along the platform a slim tube up through the ceiling, or down
    // through a hole in the platform.
    const tall = !outdoor && !way.inner;
    for (const zi of upIslands) {
      if (zi === 0) { escalators.push(yield* escalatorSteps(ws, physics, wx, way.dir, rise, tall, base)); continue; }
      const es = new Section(`${def.name}-escalator`, theme.ambient, dry);
      const zone = yield* escalatorSteps(es, shiftZ(physics, zi), wx, way.dir, rise, tall, base);
      zone.z = zi;
      escalators.push(zone);
      const g = yield* es.finishSteps();
      g.position.z = zi;
      wayGroups[k].push(g);
    }
    // In a rock cave the flight from along the platform climbs out of the rock left between the platform tunnels: under
    // it, from where its underside leaves the floor up into the crown, the rock stands solid.
    if (way.inner && !tiled && !outdoor) for (const zi of upIslands) rockUnder(ws, physics, wx, way.dir, rise, zi, way.incline, theme.paint);
    for (const [n, zi] of (way.incline ? upIslands : []).entries()) {
      inclines.push(yield* inclineSteps(ws, physics, wx, way.dir, rise, hash01(index * 3 + k, 811 + n), way.corridor > 0 ? 0.5 : 0, zi, zi < 0 ? -1 : 1));
    }
    // A long way from the top of the escalators to the hall: a tiled passage.
    if (way.corridor > 0) buildCorridor(ws, hallPhysics, wx + way.dir * run, way.dir, way.corridor, way.hallY, way.incline);
  }
  const escalator = escalators[0];
  yield;
  // The same station on another line, where it lies elsewhere along x: a walkway leads there.
  const partners = net.stations.flatMap((o, oi) => (o.name === def.name && oi !== index && !o.lines.includes(def.line) && !def.lines.includes(o.line) ? [oi] : []));
  const doorA = twin ? 8.2 : 5;
  const halls: HallInfo[] = [];
  let passage: Passage | null = null;
  for (const [k, way] of ways.entries()) {
    const d = way.hallDir;
    const { hx, hallY } = way;
    // The main hall has the walkway to the other line and the passage; the second hall only its gates and stairs.
    const main = k === 0;
    const hall = buildHall(way.section, hallPhysics, line, def, index, hx, hallY, d, upIslands.filter((z) => z !== 0), main && partners.length && !def.passage ? doorA : null,
      { main, exits: way.exits, mouth: hallMouth(way), incline: way.incline, across: way.across, level: viaduct });
    if (main) passage = hall.passage;
    if (way.across) {
      // Its stairs come up on a little square beside the tracks, beyond the fence.
      buildSquare(s, physics, squares[ways.filter((w) => w.down).indexOf(way)], way.across, def.name, viaduct);
    } else {
      // Up the stairs from the hall, the street: a section of its own in the open air, shown only at the station. In
      // the open the hall's door opens straight onto it.
      const ss = new Section(`${def.name}-street${main ? '' : `-${k + 1}`}`, OPEN_AMBIENT, dry, true);
      // Among the real city where OpenStreetMap has it (not by the water in the city, whose skyline is made by hand).
      const osm = !def.city && hasStreetFile(streetKey(line.id, def.name, outdoor ? null : d));
      const street = buildStreet(ss, hallPhysics, index, way.exits, hx, hallY, d, outdoor ? def.name : null, k, osm);
      yield;
      const streetGroup = yield* ss.finishSteps();
      streetGroup.visible = false;
      wayGroups[k].push(streetGroup);
      hall.exit.street = { ...street, group: dry ? null : streetGroup };
    }
    halls.push({
      dir: d, bounds: hall.bounds, gates: hall.gates, exit: hall.exit,
      x: (a) => hx + d * a,
      corridor: way.corridor > 0 ? { x0: Math.min(hx, hx - d * way.corridor), x1: Math.max(hx, hx - d * way.corridor), halfWidth: corridorHalfWidth(way.incline) } : null,
    });
    // In the city the hall over the tracks is a low building of its own, standing on the station roof.
    if (outdoor && def.city) cityHouse(way.section, physics, cx + d * CAVE_HALF_L, hx + d * (HALL_LEN + 0.6), islands.map((z) => [z - ESC_HALF_W - 0.4, z + ESC_HALF_W + 0.4] as [number, number]),
      { y0: hallY + STREET.door, y1: hallY + STREET.door + STREET.doorHeight, halfW: STREET.doorHalfW });
    yield;
  }
  const hall = halls[0];
  const walkways = partners.map((to) => {
    // Out through the City passage's side opening, or a door in the hall's +z wall.
    const end: WalkwayEnd = passage
      ? { door: new Vector3(passage.X(PASSAGE_LAYOUT.a0), hallY, (TRANSFER_LAYOUT.corridor.z0 + TRANSFER_LAYOUT.corridor.z1) / 2), u: new Vector3(-e, 0, 0), side: 1 }
      : { door: new Vector3(hall.x(doorA), hallY, HALL_HALF_W), u: new Vector3(0, 0, 1), side: 1, wall: 0.5 };
    const there = net.stations[to];
    const names = there.lines.map((li) => net.lines[li].name.toLowerCase());
    // From the blue line's T-Centralen, and back to it, the way is Blå gången, painted blue.
    const blue = !!def.passage || !!there.passage;
    buildWalkway(s, hallPhysics, end, dry ? '' : `↑ ${sv.transfer.to} ${names.join(` ${sv.transfer.and} `)}`, blue);
    return { to, end };
  });
  yield;
  // The main hall's own floor (under the tracks, for one reached down through the island), and whether its escalators
  // start at the platform's end wall, where the notice over their foot hangs.
  const clutter = buildClutter(s, { index, cx, exitDir: e, benches, pillars, hallX: hall.x, hallY: ways[0].hallY, hallHalfW: HALL_HALF_W, platformZ: islands[islands.length - 1], wallZ: boardZ, posters: !outdoor, endWall: !ways[0].inner && !ways[0].down });
  yield;

  let departureKey = '';
  const info: StationInfo = {
    index,
    name: def.name,
    cx,
    outdoor,
    ground: viaduct ? -VIADUCT.drop : 0,
    exitDir: e,
    escalator,
    escalators,
    platforms: islands.map((z) => folded(z)[0]),
    levels: islands.map((z) => folded(z)[1]),
    platformTracks,
    rise,
    halls,
    hall: hall.bounds,
    gates: hall.gates,
    exit: hall.exit,
    hallX: hall.x,
    inclines,
    passage,
    walkways,
    spawn: new Vector3([cx - e * 20, cx + e * 20, cx - e * 40].find((x) => free(x, 1)) ?? cx - e * 20, PLATFORM_Y, islands[islands.length - 1] + 2.2),
    zones: [...(passage ? [passage.zone] : []), ...walkways.flatMap((w) => walkwayZones(w.end, index, def.passage ? sv.transfer.blueWay : `${sv.transfer.way} ${net.stations[w.to].lines.map((li) => net.lines[li].name.toLowerCase()).join(` ${sv.transfer.and} `)}`))],
    interactables: [...(passage ? passage.interactables : []), ...artInteractables.map((it) => {
      const [z, y] = folded(it.pos.z);
      return y ? { ...it, pos: new Vector3(it.pos.x, it.pos.y + y, z) } : it;
    })],
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
  s.foldExtras();
  const group = yield* s.finishSteps();
  for (const g of wayGroups[0]) group.add(g);
  const extra: Group[] = [];
  for (const [k, way] of ways.entries()) {
    if (way.section === s) continue;
    const g = yield* way.section.finishSteps();
    for (const c of wayGroups[k]) g.add(c);
    // A hall under the ground, and the flight down to it, is only drawn where one could see into it: out beyond the
    // platform's end it lies in view along the tracks, where it could never really be seen (see `World.underSight`).
    // Under a viaduct it stands on the ground in plain sight.
    if (way.down && !viaduct) g.userData.under = { top: way.foot };
    // Up at an underground station's hall level it would float over a neighbour's open air (see `World.show`).
    if (!outdoor) g.userData.underground = true;
    extra.push(g);
  }
  return { group, extra, info };
}

interface HallBuild {
  bounds: { x0: number; x1: number; y: number };
  gates: GateLine;
  exit: StreetExit;
  passage: Passage | null;
}

const PASSAGE = PASSAGE_LAYOUT;

/**
 * How the way up opens into a hall's wall toward the platform, as openings across it (z from, z to, height): the
 * escalators and an inclined lift's door, or the passage that leads from them.
 */
function hallMouth(way: { corridor: number; incline: boolean }): Array<[number, number, number]> {
  if (way.corridor > 0) {
    const w = corridorHalfWidth(way.incline);
    return [[-w, w, ESC_HEADROOM]];
  }
  return [[-ESC_HALF_W, ESC_HALF_W, ESC_HEADROOM], ...(way.incline ? [[INCLINE.z0, INCLINE.z1, INCLINE.height - 0.15] as [number, number, number]] : [])];
}

/** Across z, where an inclined lift runs beside the escalators of the island at `zc`: away from the tracks between two islands. */
function liftAcross(zc: number): [number, number] {
  return zc < 0 ? [zc - INCLINE.z1, zc - INCLINE.z0] : [zc + INCLINE.z0, zc + INCLINE.z1];
}

/** A passage from the escalators to the hall: as wide as the shaft and a little more, and over the inclined lift beside it too. */
function corridorHalfWidth(incline: boolean): number {
  return incline ? INCLINE.z1 : ESC_HALF_W + 0.4;
}

/**
 * A long tiled passage at the hall's level, from the top of the escalators at `x0` a `length` along `e` to the hall,
 * as at the stations whose halls lie far from their platforms. A lintel closes the escalator shaft's high end over it.
 */
function buildCorridor(s: Section, physics: Physics, x0: number, e: 1 | -1, length: number, Y: number, incline: boolean): void {
  const W = corridorHalfWidth(incline);
  const H = ESC_HEADROOM;
  const X = (a: number) => x0 + e * a;
  const WALL = hallWall(Y);
  const box = (a0: number, a1: number, y0: number, y1: number, z0: number, z1: number, paint: Parameters<typeof s.lit.box>[2], collide = true, skip: BoxFace[] = [], cell?: number) => {
    const min = { x: Math.min(X(a0), X(a1)), y: y0, z: z0 };
    const max = { x: Math.max(X(a0), X(a1)), y: y1, z: z1 };
    s.lit.box(min, max, paint, skip, cell);
    if (collide) physics.box(min, max);
  };
  box(0, length, Y - 0.5, Y, -W, W, HALL_FLOOR, true, [], 3);
  box(0, length, Y + H, Y + H + 0.3, -W, W, rgb(0xe9e6de), true, [], 3);
  for (const side of [-1, 1]) box(0, length, Y, Y + H, Math.min(side * W, side * (W + 0.3)), Math.max(side * W, side * (W + 0.3)), WALL, true, [], 3);
  // Where the escalators (and the lift) come in: the wall between them and the lintel over the shaft's high end. Its
  // faces along the shafts' own walls are left out, as at the hall.
  const L = 0.5;
  box(0, L, Y + H, Y + HALL_H, -ESC_HALF_W, ESC_HALF_W, WALL, true, ['pz', 'nz']);
  box(0, L, Y, Y + H, -W, -ESC_HALF_W, WALL, true, ['pz']);
  if (incline) {
    box(0, L, Y, Y + H, ESC_HALF_W, INCLINE.z0, WALL, true, ['pz', 'nz']);
    box(0, L, Y + INCLINE.height - 0.15, Y + H, INCLINE.z0, INCLINE.z1, WALL, true, ['ny', 'pz', 'nz']);
  } else box(0, L, Y, Y + H, ESC_HALF_W, W, WALL, true, ['nz']);
  for (let a = 3; a < length - 1; a += 6) {
    s.unlit.box({ x: X(a) - 1, y: Y + H - 0.06, z: -0.3 }, { x: X(a) + 1, y: Y + H, z: 0.3 }, PAINT.lampCool);
    s.light(X(a), Y + H - 0.7, 0, rgb(0xf4f6ff), 0.85, 10);
  }
}

/**
 * The rock under a flight that climbs from along a rock cave's platform (`HallDef.from`), beside the escalators and an
 * inclined lift if there is one: two faces down each side and its colliders, from where the underside of the flight
 * (its steps and the truss under them) leaves the floor to where it has gone up into the crown.
 */
function rockUnder(s: Section, physics: Physics, wx: number, e: 1 | -1, rise: number, zi: number, incline: boolean, paint: Paint): void {
  const TRUSS = 0.9;
  const under = (a: number) => escalatorHeight(a, rise) - ESC_DESIGN.stepDepth - TRUSS;
  const run = escalatorRun(rise);
  const side = ESC_HALF_W + ESC_DESIGN.railWidth;
  const [z0, z1] = [zi - side, zi + (incline ? INCLINE.z1 : side)];
  // Along the flight in steps, from its foot to where the underside is well into the rock.
  const step = 1.5;
  let a0 = 0;
  while (a0 < run && under(a0) < PLATFORM_Y) a0 += 0.25;
  /** A quad facing `facing`, whichever way the flight runs. */
  const face = (a: Vector3, b: Vector3, c: Vector3, d: Vector3, facing: Vector3) => {
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(d, a));
    if (n.dot(facing) < 0) s.lit.quad(a, d, c, b, paint);
    else s.lit.quad(a, b, c, d, paint);
  };
  const DOWN = new Vector3(0, -1, 0);
  for (let a = a0; a < run && under(a) < CAVE_TOP + 1.5; a += step) {
    const b = Math.min(run, a + step);
    const [xa, xb] = [wx + e * a, wx + e * b];
    // Its sides, down to the floor, and its underside, a little under the truss's.
    for (const z of [z0, z1]) {
      face(new Vector3(xa, PLATFORM_Y, z), new Vector3(xb, PLATFORM_Y, z), new Vector3(xb, under(b), z), new Vector3(xa, under(a), z), new Vector3(0, 0, z === z0 ? -1 : 1));
    }
    const [ya, yb] = [under(a) - 0.03, under(b) - 0.03];
    face(new Vector3(xa, ya, z0), new Vector3(xb, yb, z0), new Vector3(xb, yb, z1), new Vector3(xa, ya, z1), DOWN);
    physics.box({ x: Math.min(xa, xb), y: PLATFORM_Y, z: z0 }, { x: Math.max(xa, xb), y: under(a), z: z1 });
  }
}

/** The square the side stairs come up on: this far either side of them along x, and on past their top. */
const SQUARE = { halfX: 10, beyond: 8 };

/** A hall under the tracks as `underHall` places it, along x from the station's middle. */
export interface UnderHall {
  /** Where its escalators start down from the island. */
  top: number;
  /** Where the hall starts, at their foot, and which way it runs on from there. */
  hx: number;
  dir: 1 | -1;
  /** The side of the tracks its stairs come up on, and the square there. */
  across: 1 | -1;
  square: Clearing;
}

/**
 * A hall under the tracks at a station in the open (`HallDef.down`), the `k`th of its plan. Its escalators climb toward
 * `end` from the hall to their top on the island, `from` meters from the middle: with `from` positive the hall lies
 * under the platform toward its middle; negative, the flight runs down past the platform's other end to a hall
 * beyond it, under the neighbouring stretch (see `World`). Its stairs come up on the main hall's +z, a second one's
 * -z, unless its plan says (`beside`).
 */
export function underHall(plan: HallDef, k: number): UnderHall {
  const up = hallDir(plan);
  const top = up * plan.from!;
  const hx = top - up * escalatorRun(UNDERPASS_DEPTH);
  const dir = -up as 1 | -1;
  const across = (plan.beside === 2 ? -1 : plan.beside === 1 ? 1 : k === 0 ? 1 : -1) as 1 | -1;
  const x = hx + dir * (ACROSS.a0 + ACROSS.a1) / 2;
  const out = HALL_HALF_W + 0.5 + SIDE_STAIRS_OUT + SQUARE.beyond;
  const [z0, z1] = [across * OPEN.fenceZ, across * out].sort((p, q) => p - q);
  return { top, hx, dir, across, square: { x0: x - SQUARE.halfX, x1: x + SQUARE.halfX, z0, z1 } };
}

/**
 * Round an opening in the island where escalators go down to a hall under the tracks: railings along it, from where
 * the flight's tube sinks below the trackbed (`a` along the flight from `flight.wx`, climbing toward `dir`) to where
 * its roof stands a meter over the platform, and a barrier across its far end.
 */
function buildPlatformOpening(s: Section, physics: Physics, flight: { wx: number; base: number }, dir: 1 | -1, a: number, half: number): void {
  const x = (along: number) => flight.wx + dir * along;
  const end = ESC_LANDING + (PLATFORM_Y + 1 - ESC_HEADROOM - flight.base) / Math.tan(ESC_ANGLE);
  const steel = rgb(0x8e969c);
  const [x0, x1] = [x(a), x(end)].sort((p, q) => p - q);
  const H = 1.1;
  for (const side of [-1, 1]) {
    const z = side * (half + 0.05);
    for (const y of [0.5, H - 0.05]) s.lit.box({ x: x0, y: PLATFORM_Y + y, z: z - 0.03 }, { x: x1, y: PLATFORM_Y + y + 0.05, z: z + 0.03 }, steel);
    for (let px = x0; px <= x1 + 0.01; px += 1.5) s.lit.box({ x: px - 0.03, y: PLATFORM_Y, z: z - 0.03 }, { x: px + 0.03, y: PLATFORM_Y + H, z: z + 0.03 }, steel);
  }
  const xe = x(a);
  for (const y of [0.5, H - 0.05]) s.lit.box({ x: xe - 0.03, y: PLATFORM_Y + y, z: -half }, { x: xe + 0.03, y: PLATFORM_Y + y + 0.05, z: half }, steel);
  physics.box({ x: xe - 0.05, y: PLATFORM_Y, z: -half }, { x: xe + 0.05, y: PLATFORM_Y + H, z: half });
}

/**
 * The square a hall under the tracks has its side stairs come up on (`square`, on `side`): paving round the stairs'
 * cut, a fence along its three outer edges, a lamp and a sign with the station's name.
 */
/**
 * Stairs from a two-level station's upper island down to the lower one (`STACK`), as through the real one's floor:
 * from `top` running `dir` along the island at `zi`, `run` long, in a well `half` wide either side with railings round
 * it up on the upper floor and walls down to where the lower level's vault opens round it.
 */
function buildLevelStairs(s: Section, physics: Physics, top: number, dir: 1 | -1, zi: number, run: number, half: number): void {
  const n = Math.round(STACK.drop / STACK.riser);
  const riser = STACK.drop / n;
  const tread = run / n;
  const low = PLATFORM_Y - STACK.drop;
  const stone = (_p: Vector3, nv: Vector3): RGB => (nv.y > 0.5 ? rgb(0x8f8b83) : rgb(0x6c6a64));
  const w = half - 0.15;
  const x = (a: number) => top + dir * a;
  const span = (a: number, b: number) => [Math.min(x(a), x(b)), Math.max(x(a), x(b))] as const;
  for (let k = 0; k < n; k++) {
    const [x0, x1] = span(k * tread, (k + 1) * tread);
    const y = PLATFORM_Y - (k + 1) * riser;
    s.lit.box({ x: x0, y: low - 0.3, z: zi - w }, { x: x1, y, z: zi + w }, stone);
    const nose = dir > 0 ? x0 : x1 - 0.05;
    s.lit.box({ x: nose, y: y - 0.01, z: zi - w }, { x: nose + 0.05, y: y + 0.004, z: zi + w }, rgb(0xd9b93b));
  }
  // A ramp for a steady walk down, under the steps' edges.
  const length = Math.hypot(run, STACK.drop);
  const angle = -dir * Math.atan2(STACK.drop, run);
  const mid = new Vector3(x(run / 2), PLATFORM_Y - STACK.drop / 2, zi);
  const normal = new Vector3(-Math.sin(angle), Math.cos(angle), 0);
  physics.tiltedBox(mid.addScaledVector(normal, -0.15), { x: length / 2 + 0.1, y: 0.15, z: w }, angle);
  // The well: walls either side and at its far end, from under the lower vault's crown up to the upper floor.
  const wall = rgb(0xdad6cc);
  const y0 = VAULT_TOP - STACK.drop - 0.6;
  const [a0, a1] = span(0, run);
  for (const side of [-1, 1]) {
    const z = zi + side * half;
    s.lit.box({ x: a0, y: y0, z: Math.min(z, z + side * 0.2) }, { x: a1, y: PLATFORM_Y - 0.02, z: Math.max(z, z + side * 0.2) }, wall, [], 1.5);
    // A frame round the well where it comes through the lower vault, over the edge of its opening.
    s.lit.box({ x: a0 - 0.5, y: y0, z: Math.min(z, z + side * 0.9) }, { x: a1 + 0.5, y: y0 + 0.3, z: Math.max(z, z + side * 0.9) }, wall);
  }
  const far = x(run);
  for (const [xe, out] of [[far, dir], [top, -dir]] as const) {
    const [e0, e1] = [xe, xe + out * 0.9].sort((p, q) => p - q);
    s.lit.box({ x: e0, y: y0, z: zi - half - 0.9 }, { x: e1, y: y0 + 0.3, z: zi + half + 0.9 }, wall);
  }
  s.lit.box({ x: Math.min(far, far + dir * 0.2), y: y0, z: zi - half }, { x: Math.max(far, far + dir * 0.2), y: PLATFORM_Y - 0.02, z: zi + half }, wall, [], 1.5);
  // Railings round the opening up on the upper island, open at the top of the stairs.
  const rail = rgb(0x5e6468);
  for (const side of [-1, 1]) {
    const z = zi + side * (half + 0.05);
    s.lit.box({ x: a0, y: PLATFORM_Y + 0.95, z: z - 0.03 }, { x: a1, y: PLATFORM_Y + 1.02, z: z + 0.03 }, rail);
    for (let k = 0; k <= run; k += run / 6) s.lit.box({ x: x(k) - 0.03, y: PLATFORM_Y, z: z - 0.03 }, { x: x(k) + 0.03, y: PLATFORM_Y + 0.95, z: z + 0.03 }, rail);
    physics.box({ x: a0, y: PLATFORM_Y, z: z - 0.05 }, { x: a1, y: PLATFORM_Y + 1.05, z: z + 0.05 });
  }
  s.lit.box({ x: far - 0.03, y: PLATFORM_Y + 0.95, z: zi - half }, { x: far + 0.03, y: PLATFORM_Y + 1.02, z: zi + half }, rail);
  physics.box({ x: far - 0.05, y: PLATFORM_Y, z: zi - half }, { x: far + 0.05, y: PLATFORM_Y + 1.05, z: zi + half });
  for (const a of [run * 0.3, run * 0.75]) s.light(x(a), PLATFORM_Y - STACK.drop * (a / run) + 2.2, zi, rgb(0xfff2dc), 0.8, 7);
}

/** @param level under a viaduct: the square lies as low as the hall, reached through its door, with no stairs up */
function buildSquare(s: Section, physics: Physics, square: Clearing, side: 1 | -1, name: string, level = false): void {
  const Y = -0.28 - (level ? VIADUCT.drop : 0);
  const mid = (square.x0 + square.x1) / 2;
  const half = (ACROSS.a1 - ACROSS.a0) / 2;
  const land = HALL_HALF_W + 0.5 + SIDE_STAIRS.first * SIDE_STAIRS.run + SIDE_STAIRS.landing;
  const out = HALL_HALF_W + 0.5 + SIDE_STAIRS_OUT;
  const [cz0, cz1] = [side * land, side * out].sort((p, q) => p - q);
  const paving = (p: Vector3): RGB => ((Math.floor(p.x / 0.8) + Math.floor(p.z / 0.8)) & 1 ? rgb(0x8f8b83) : rgb(0x9d9990));
  const slab = (x0: number, x1: number, z0: number, z1: number) => {
    if (x1 <= x0 || z1 <= z0) return;
    s.lit.box({ x: x0, y: Y - 0.3, z: z0 }, { x: x1, y: Y, z: z1 }, paving, ['ny'], 2);
    physics.box({ x: x0, y: Y - 0.3, z: z0 }, { x: x1, y: Y, z: z1 });
  };
  if (level) {
    // Paved all over, from the hall's side wall out: no stairs come up through it.
    const inner = side * (HALL_HALF_W + 0.5);
    slab(square.x0, square.x1, Math.min(inner, side > 0 ? square.z1 : square.z0), Math.max(inner, side > 0 ? square.z1 : square.z0));
  } else {
    slab(square.x0, square.x1, square.z0, cz0);
    slab(square.x0, square.x1, cz1, square.z1);
    slab(square.x0, mid - half, cz0, cz1);
    slab(mid + half, square.x1, cz0, cz1);
  }
  // A fence round the outer edges, the tracks' own along the inner one.
  const far = side > 0 ? square.z1 : square.z0;
  const fence = rgb(0x6a746e);
  const post = rgb(0x4a524e);
  const edge = (x0: number, x1: number, z0: number, z1: number) => {
    for (const y of [0.55, OPEN.fenceH - 0.05]) s.lit.box({ x: x0 - 0.03, y: Y + y, z: z0 - 0.03 }, { x: x1 + 0.03, y: Y + y + 0.06, z: z1 + 0.03 }, fence);
    physics.box({ x: x0 - 0.1, y: Y, z: z0 - 0.1 }, { x: x1 + 0.1, y: Y + OPEN.fenceH, z: z1 + 0.1 });
    const length = Math.hypot(x1 - x0, z1 - z0);
    for (let k = 0; k <= length; k += 3) {
      const [px, pz] = [x0 + (x1 - x0) * k / length, z0 + (z1 - z0) * k / length];
      s.lit.box({ x: px - 0.035, y: Y, z: pz - 0.035 }, { x: px + 0.035, y: Y + OPEN.fenceH, z: pz + 0.035 }, post);
    }
  };
  edge(square.x0, square.x0, square.z0, square.z1);
  edge(square.x1, square.x1, square.z0, square.z1);
  edge(square.x0, square.x1, far, far);
  // A lamp over the stairs' top, and a sign on a post by them.
  const lampZ = side * (out + 3);
  s.lit.box({ x: mid + half + 2 - 0.06, y: Y, z: lampZ - 0.06 }, { x: mid + half + 2 + 0.06, y: Y + 4.5, z: lampZ + 0.06 }, rgb(0x3b4046));
  s.unlit.box({ x: mid + half + 1.6, y: Y + 4.4, z: lampZ - 0.15 }, { x: mid + half + 2.4, y: Y + 4.5, z: lampZ + 0.15 }, rgb(0xfff2d8));
  s.light(mid + half + 2, Y + 4, lampZ, rgb(0xfff2d8), 1, 12);
  s.lit.box({ x: mid - half - 1 - 0.05, y: Y, z: lampZ - 0.05 }, { x: mid - half - 1 + 0.05, y: Y + 2.6, z: lampZ + 0.05 }, rgb(0x3b4046));
  if (!s.dry) {
    const sign = textSign(`T  ${name}`, 768, 128, '#1c63c4', '#ffffff');
    for (const f of [-1, 1]) place(s, sign, 2.4, 0.4, new Vector3(mid - half - 1 + f * 0.06, Y + 2.9, lampZ), new Vector3(f, 0, 0));
  }
}

/** A hall's way out at its side, under a station in the open: a door from `a0` to `a1` along it, `door` high (see `buildSideStairs`). */
const ACROSS = { a0: 20, a1: 25, door: 3.5 };
/** The side stairs: a first flight to a landing under a ceiling, then a second in an open cut up to the ground. */
const SIDE_STAIRS = { first: 20, landing: 2, second: 30, run: 0.35, riser: 0.17, headroom: 3.2 };

/** How far out from a hall's side wall its side stairs reach, where they come up. */
export const SIDE_STAIRS_OUT = (SIDE_STAIRS.first + SIDE_STAIRS.second) * SIDE_STAIRS.run + SIDE_STAIRS.landing;

/**
 * Stairs out of the side of a hall under the tracks, from its wall at `zw` on `side` up to the ground beyond the
 * fences: a flight to a landing under the ground, and a second flight in an open cut, with a parapet round its top.
 * `X` maps meters along the hall to x; the hall's floor is at `Y`, the ground `Y + 8.5` over it.
 */
function buildSideStairs(s: Section, physics: Physics, X: (a: number) => number, Y: number, zw: number, side: 1 | -1): void {
  const S = SIDE_STAIRS;
  const [a0, a1] = [ACROSS.a0 + 0.3, ACROSS.a1 - 0.3];
  const Z = (d: number) => side * (zw + d);
  const box = (d0: number, d1: number, y0: number, y1: number, b0: number, b1: number, paint: Parameters<typeof s.lit.box>[2], collide = true) => {
    const min = { x: Math.min(X(b0), X(b1)), y: y0, z: Math.min(Z(d0), Z(d1)) };
    const max = { x: Math.max(X(b0), X(b1)), y: y1, z: Math.max(Z(d0), Z(d1)) };
    s.lit.box(min, max, paint);
    if (collide) physics.box(min, max);
  };
  const concrete = rgb(0x9a9ea3);
  const wall = hallWall(Y);
  const first = S.first * S.run;
  const land = first + S.landing;
  const out = land + S.second * S.run;
  const ground = Y + STREET.above;
  for (let k = 0; k < S.first; k++) box(k * S.run, (k + 1) * S.run, Y - 0.5, Y + (k + 1) * S.riser, a0, a1, STEP);
  box(first, land, Y - 0.5, Y + S.first * S.riser, a0, a1, STEP);
  const riser = (ground - (Y + S.first * S.riser)) / S.second;
  for (let k = 0; k < S.second; k++) box(land + k * S.run, land + (k + 1) * S.run, Y, Y + S.first * S.riser + (k + 1) * riser, a0, a1, STEP);
  // The walls either side: up to the ceiling over the first flight and the landing, and on past the ground as a
  // parapet round the cut.
  const ceiling = Y + S.first * S.riser + S.headroom;
  for (const [b0, b1] of [[ACROSS.a0, a0], [a1, ACROSS.a1]]) {
    box(0, land, Y - 0.5, ceiling, b0, b1, wall);
    box(land, out, Y + 2, ground + 1, b0, b1, concrete);
  }
  box(0, land, ceiling, ceiling + 0.3, ACROSS.a0, ACROSS.a1, rgb(0xe9e6de));
  // Across the cut's inner end, from the ceiling up past the ground.
  box(land - 0.3, land, ceiling, ground + 1, a0, a1, concrete);
  for (const d of [first / 2, land - 1, land + 4]) s.light(X((ACROSS.a0 + ACROSS.a1) / 2), Math.min(ceiling - 0.4, ground - 1), Z(d), rgb(0xeef3ff), 0.8, 9);
}

function buildHall(s: Section, physics: Physics, line: LineDef, def: Network['stations'][number], index: number, hx: number, hallY: number, e: 1 | -1, wings: number[], walkwayDoor: number | null,
  opts: { main: boolean; exits: string; mouth: Array<[number, number, number]>; incline?: boolean; across?: 1 | -1; level?: boolean }): HallBuild {
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
  // its own, and its roof stays whole; so does the ceiling of a hall under the tracks, whose stairs go out at its side.
  const across = opts.across;
  const well = !s.outdoor && !across;
  // The slab stops at the stairwell's walls, which run down through it: no two faces in one plane.
  box(0, well ? OPEN_A - 0.3 : HALL_LEN, Y + HALL_H, Y + HALL_H + 0.5, -W, W, rgb(0xe9e6de));
  if (well) for (const side of [-1, 1]) box(OPEN_A - 0.3, HALL_LEN, Y + HALL_H, Y + HALL_H + 0.5, Math.min(side * 2.8, side * W), Math.max(side * 2.8, side * W), rgb(0xe9e6de));
  // A shared station's escalators come up in wings off either side of the hall, from `0` to `ARM` along it.
  const ARM = 6;
  const wing = (side: number) => wings.some((z) => Math.sign(z) === side);
  if (def.passage && opts.main) {
    box(0, PASSAGE.a0, Y, Y + HALL_H, W, W + 0.5, HALL_WALL);
    box(PASSAGE.a1, HALL_LEN, Y, Y + HALL_H, W, W + 0.5, HALL_WALL);
    box(PASSAGE.a0, PASSAGE.a1, Y + PASSAGE.height, Y + HALL_H, W, W + 0.5, HALL_WALL);
  } else if (walkwayDoor !== null) {
    // An opening onto the walkway to the other line.
    const [d0, d1] = [walkwayDoor - WALKWAY.half, walkwayDoor + WALKWAY.half];
    box(wing(1) ? ARM + 0.5 : 0, d0, Y, Y + HALL_H, W, W + 0.5, HALL_WALL);
    box(d1, HALL_LEN, Y, Y + HALL_H, W, W + 0.5, HALL_WALL);
    box(d0, d1, Y + WALKWAY.height, Y + HALL_H, W, W + 0.5, HALL_WALL);
  } else if (across !== 1) box(wing(1) ? ARM + 0.5 : 0, HALL_LEN, Y, Y + HALL_H, W, W + 0.5, HALL_WALL);
  // Beside a wing, the side wall starts behind the wing's end wall, so their faces do not share its plane.
  if (across !== -1) box(wing(-1) ? ARM + 0.5 : 0, HALL_LEN, Y, Y + HALL_H, -W - 0.5, -W, HALL_WALL);
  // Out at the side: a door in the side wall onto stairs that climb away from the tracks, up to the ground beside them.
  const side = across ?? 0;
  if (across) {
    const [z0, z1] = [Math.min(side * W, side * (W + 0.5)), Math.max(side * W, side * (W + 0.5))];
    box(0, ACROSS.a0, Y, Y + HALL_H, z0, z1, HALL_WALL);
    box(ACROSS.a1, HALL_LEN, Y, Y + HALL_H, z0, z1, HALL_WALL);
    box(ACROSS.a0, ACROSS.a1, Y + ACROSS.door, Y + HALL_H, z0, z1, HALL_WALL);
    // Under a viaduct the hall stands on the ground, and its door opens straight out onto the square.
    if (!opts.level) buildSideStairs(s, physics, X, Y, W + 0.5, across);
  }
  // Underground the end wall is open over the landing, where the stairs go on up to the street; in the open a door in it
  // opens onto the street, level with the landing. With the way out at the side, it is whole.
  const D = STREET.doorHalfW;
  for (const side of [-1, 1]) box(HALL_LEN, HALL_LEN + 0.5, Y, Y + HALL_H, side * D, side * W, HALL_WALL);
  // Under the door the landing fills the wall (below).
  if (!well) box(HALL_LEN, HALL_LEN + 0.5, across ? Y : Y + STREET.door + STREET.doorHeight, Y + HALL_H, -D, D, HALL_WALL);
  if (wings.length) box(-0.5, 0, Y, Y + HALL_H, -W, W, HALL_WALL);
  else {
    // The shafts' (or the passage's) own walls and ceiling line the openings, so the jambs and the lintels leave those
    // faces out.
    const mouths = [...opts.mouth].sort((p, q) => p[0] - q[0]);
    let z = -W;
    for (const [z0, z1, top] of mouths) {
      if (z0 > z) box(-0.5, 0, Y, Y + HALL_H, z, z0, HALL_WALL, true, z > -W ? ['nz', 'pz'] : ['pz']);
      box(-0.5, 0, Y + top, Y + HALL_H, z0, z1, HALL_WALL, true, ['ny']);
      z = z1;
    }
    box(-0.5, 0, Y, Y + HALL_H, z, W, HALL_WALL, true, ['nz']);
  }
  for (const zw of wings) {
    const side = Math.sign(zw);
    // Wide enough for an inclined lift beside the escalators, on the wing's outer side.
    const outer = zw + side * (opts.incline ? INCLINE.z1 + 0.3 : ESC_HALF_W + 1);
    const [z0, z1] = [Math.min(side * W, outer), Math.max(side * W, outer)];
    box(0, ARM, Y - 0.5, Y, z0, z1, HALL_FLOOR);
    box(0, ARM, Y + HALL_H, Y + HALL_H + 0.5, z0, z1, rgb(0xe9e6de));
    box(0, ARM, Y, Y + HALL_H, Math.min(outer, outer + side * 0.5), Math.max(outer, outer + side * 0.5), HALL_WALL);
    box(ARM, ARM + 0.5, Y, Y + HALL_H, z0, z1, HALL_WALL);
    // The wing's end wall, open where the escalator (and the lift) comes up.
    const openings: Array<[number, number, number]> = [[zw - ESC_HALF_W, zw + ESC_HALF_W, ESC_HEADROOM], ...(opts.incline ? [[...liftAcross(zw), INCLINE.height - 0.15] as [number, number, number]] : [])];
    let z = z0;
    for (const [o0, o1, top] of openings.sort((p, q) => p[0] - q[0])) {
      if (o0 > z) box(-0.5, 0, Y, Y + HALL_H, z, o0, HALL_WALL, true, z > z0 ? ['nz', 'pz'] : ['pz']);
      box(-0.5, 0, Y + top, Y + HALL_H, o0, o1, HALL_WALL, true, ['ny']);
      z = o1;
    }
    if (z < z1) box(-0.5, 0, Y, Y + HALL_H, z, z1, HALL_WALL, true, ['nz']);
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

  if (opts.main) buildKiosk(s, physics, (a) => X(a + kioskShift(across)), Y);

  // Stairs up to a landing; underground a second flight goes on up to the street, in the open doorway a painted street.
  const steps = across ? 0 : 20;
  for (let k = 0; k < steps; k++) {
    box(19 + k * 0.35, 19 + (k + 1) * 0.35, Y, Y + (k + 1) * 0.17, -2.5, 2.5, STEP);
  }
  // The landing, and in the open its threshold through the door.
  if (!across) box(26, well ? HALL_LEN : HALL_LEN + 0.5, Y, Y + 3.4, -2.5, 2.5, STEP);
  for (const side of across ? [] : [-1, 1]) {
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
  const exit = textSign('↑ Utgång · ' + opts.exits, 1024, 128, '#f3cd36', '#181c23');
  place(s, exit, 6.4, 0.8, new Vector3(X(18.8), Y + 5.2, 0), toward);
  const trains = textSign(`Till tågen  ·  ${line.bullets.join(' ')}`, 768, 128);
  place(s, trains, 4, 0.67, new Vector3(X(12), Y + 4.6, 0), away);
  place(s, (s.extras.userData.lineMap as CanvasSign | undefined) ?? lineMap(line, def.local), 5.6, 2.45, new Vector3(X(6), Y + 2.6, -W + 0.02), new Vector3(0, 0, 1));
  const booth = textSign('Spärrexpedition', 512, 96, '#1f2a36');
  place(s, booth, 2.4, 0.45, new Vector3(X(12), Y + 2.9, 7.65), new Vector3(0, 0, -1));

  const passage = def.passage && opts.main ? buildPassage(s, physics, def.passage, index, X, Y, W) : null;

  return {
    bounds: { x0: Math.min(X(0), X(HALL_LEN)), x1: Math.max(X(0), X(HALL_LEN)), y: Y },
    gates: {
      paidX: X(ga), unpaidX: X(gb), y: Y,
      passages: Array.from({ length: 10 }, (_, k) => -6.75 + k * 1.5), halfWidth: 0.575, flapHeight: 0.92,
    },
    exit: across
      ? { street: null, x: X((ACROSS.a0 + ACROSS.a1) / 2), dir: e, sillY: Y + (opts.level ? 0 : STREET.above), halfWidth: 2.2, height: 3, stairX: X(ACROSS.a0), open: 0, top: Y + (opts.level ? 0 : STREET.above) + 3, cut: 0, across }
      : { street: null, x: doorX, dir: e, sillY: Y + 3.4, halfWidth: 2.2, height: top - (Y + 3.4), stairX: X(19), open: well ? HALL_LEN - OPEN_A : 0, top, cut: well ? STREET.stairTop - HALL_LEN : 0 },
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
  place(s, textSign(sv.transfer.fromPassage, 1024, 112, SIGN_BG), 2.8, 0.3, new Vector3(X(a0 + 0.02), Y + height - 0.35, (side.z0 + side.z1) / 2), new Vector3(Math.sign(X(a1) - X(a0)), 0, 0));
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
  const cityWay = textSign(sv.rush.toCity, 1024, 112, SIGN_BG);
  const hallWay = textSign(sv.rush.toBlue, 1024, 112, SIGN_BG);
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
  place(s, textSign(sv.rush.city, 1024, 128, '#c2185b'), 4.4, 0.55, new Vector3(X(mid), Y + height - 0.45, zg - 0.9), toCity);

  // Beyond the gates: two lift doors in the end wall and the commuter trains' destinations.
  const LIFT = rgb(0x9aa3ab);
  for (const a of [a0 + 1.3, a1 - 1.3]) {
    box(s.lit, a - 0.6, a + 0.6, Y, Y + 2.25, z1 - 0.06, z1, LIFT, false);
    box(s.lit, a - 0.01, a + 0.01, Y, Y + 2.2, z1 - 0.08, z1 - 0.06, rgb(0x5c646b), false);
    s.unlit.box({ x: X(a + 0.75) - 0.05, y: Y + 1.05, z: z1 - 0.04 }, { x: X(a + 0.75) + 0.05, y: Y + 1.15, z: z1 }, rgb(0xf2c94c));
  }
  place(s, textSign(sv.rush.lift, 1024, 112, SIGN_BG), 3.6, 0.4, new Vector3(X(mid), Y + 2.55, z1 - 0.02), toCity);
  place(s, textSign(sv.rush.north, 1024, 96, '#1c2025', '#f6c956'), 3.8, 0.36, new Vector3(X(mid), Y + 2.98, z1 - 0.02), toCity);
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
      { pos: reader, radius: 2.2, prompt: () => text.rush.gatePrompt, act: () => text.rush.gateRed },
      { pos: new Vector3(X(mid), Y + 1, z1 - 1), radius: 2.4, prompt: () => text.rush.liftPrompt, act: () => text.rush.liftComing },
    ],
  };
}
