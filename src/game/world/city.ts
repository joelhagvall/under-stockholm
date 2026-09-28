import { BoxGeometry, ConeGeometry, CylinderGeometry, Matrix4, Vector3, type Texture } from 'three';
import { hash01 } from '../clock';
import { cached, canvas, finish } from '../gfx/textures';
import { mix, rgb, type RGB } from '../gfx/color';
import { fbm3 } from '../gfx/noise';
import type { Network } from '../line';
import type { Physics } from '../physics';
import { facadeTexture } from './outdoor';
import { addTrack } from './parts';
import type { Section } from './section';

/**
 * The inner city by the water, where the red and green lines come out of the
 * rock between T-Centralen and Slussen and cross to Gamla stan on low
 * bridges: four tracks on a deck over the water, Riddarfjärden to the west
 * with Riddarholmen's church spire and the City Hall tower, Gamla stan's
 * yellow and ochre facades to the east with the German Church's copper
 * spire, and Södermalm's cliffs rising at Slussen.
 *
 * The line runs south along +x here, so west (Riddarfjärden) is +z and east
 * (the old town) is -z. Landmarks are placed from the three stations, and
 * each section builds those whose place along x falls within it.
 */

/** Where T-Centralen, Gamla stan and Slussen lie along x. */
export interface CityAnchors {
  tc: number;
  gs: number;
  sl: number;
}

const WATER_Y = -3;
const WATER = (p: Vector3): RGB => mix(rgb(0x5a7c98), rgb(0x9ab4c8), fbm3(p.x * 0.02, 0, p.z * 0.03, 3, 501) * 0.7 + fbm3(p.x * 0.3, 0, p.z * 0.1, 2, 502) * 0.3);
const BRICK = (p: Vector3): RGB => mix(rgb(0x8a3e2a), rgb(0xa8543a), fbm3(p.x * 0.2, p.y * 0.3, p.z * 0.2, 3, 503));
const ROCK = (p: Vector3): RGB => mix(rgb(0x55524c), rgb(0x7a766c), fbm3(p.x * 0.05, p.y * 0.08, p.z * 0.05, 4, 504));
const OLD_TOWN = [0xe8c86a, 0xd98a3a, 0xebdcbc, 0xd9a090, 0xc8704a, 0xf0d890, 0xd8b890];

/** Where the three stations lie, from the red line (whose stations the green line shares). */
export function cityAnchors(net: Network): CityAnchors {
  const at = (name: string) => net.x[net.stations.findIndex((s) => s.name === name && s.line === 1)];
  return { tc: at('T-Centralen'), gs: at('Gamla stan'), sl: at('Slussen') };
}

/** Railings along both edges of a deck `halfW` wide, from `x0` to `x1`. */
export function railings(s: Section, physics: Physics, x0: number, x1: number, halfW: number): void {
  for (const side of [-1, 1]) {
    const z = side * (halfW - 0.1);
    for (const y of [0.5, 1.15]) s.lit.box({ x: x0, y, z: z - 0.04 }, { x: x1, y: y + 0.07, z: z + 0.04 }, rgb(0x3a4a58), [], 6);
    for (let x = Math.ceil(x0 / 2.5) * 2.5; x < x1; x += 2.5) s.lit.box({ x: x - 0.03, y: 0, z: z - 0.03 }, { x: x + 0.03, y: 1.2, z: z + 0.03 }, rgb(0x2e3a46));
    physics.box({ x: x0, y: 0, z: Math.min(z, z + side) }, { x: x1, y: 2, z: Math.max(z, z + side) });
  }
}

/**
 * A low bridge from `x0` to `x1` carrying tracks at `trackZs`: a concrete deck
 * `halfW` either side, piers down into the water, railings along the edges.
 */
export function buildBridge(s: Section, physics: Physics, x0: number, x1: number, halfW: number, trackZs: number[]): void {
  s.lit.box({ x: x0, y: -1.4, z: -halfW }, { x: x1, y: -0.3, z: halfW }, (_p, n) => (n.y > 0.5 ? rgb(0x5a534b) : rgb(0x8a857c)), [], 4);
  s.lit.box({ x: x0, y: -0.3, z: -halfW + 0.6 }, { x: x1, y: 0, z: halfW - 0.6 }, (p) => mix(rgb(0x3f3a35), rgb(0x5a534b), fbm3(p.x * 3, 0, p.z * 3, 2, 505)), ['ny'], 4);
  for (const zc of trackZs) addTrack(s, x0, x1, zc, true);
  physics.box({ x: x0, y: -1.4, z: -halfW }, { x: x1, y: -0.02, z: halfW });
  for (let x = Math.ceil(x0 / 30) * 30; x < x1; x += 30) {
    s.lit.box({ x: x - 1.2, y: WATER_Y - 1, z: -halfW + 1 }, { x: x + 1.2, y: -1.4, z: halfW - 1 }, (_p, n) => (Math.abs(n.y) > 0.5 ? rgb(0x6a655c) : rgb(0x9a958a)));
  }
  railings(s, physics, x0, x1, halfW);
}

/** The water, the islands and the skyline around a stretch from `x0` to `x1` (the bridge or station itself is `halfW` wide). */
export function buildCity(s: Section, x0: number, x1: number, halfW: number, at: CityAnchors): void {
  const within = (x: number) => x >= x0 && x < x1;
  // Riddarfjärden to the west, the whole way.
  s.lit.gridQuad(v(x0, WATER_Y, 330), v(x1, WATER_Y, 330), v(x1, WATER_Y, halfW), v(x0, WATER_Y, halfW), WATER, 12);
  // To the east: Gamla stan's quays north of the station, open water toward Slussen's locks south of it.
  const quay = Math.min(x1, Math.max(x0, at.gs + 60));
  if (quay > x0) s.lit.gridQuad(v(x0, WATER_Y, -halfW), v(quay, WATER_Y, -halfW), v(quay, WATER_Y, -34), v(x0, WATER_Y, -34), WATER, 12);
  if (x1 > quay) s.lit.gridQuad(v(quay, WATER_Y, -halfW), v(x1, WATER_Y, -halfW), v(x1, WATER_Y, -140), v(quay, WATER_Y, -140), WATER, 12);

  // Gamla stan's houses along the quay, five or six storeys, their roofs tiled dark or green with copper.
  const facade = s.artLayer(oldFacadeTexture());
  for (let x = Math.floor(at.tc / 18) * 18; x < at.gs + 60; x += 18) {
    if (!within(x)) continue;
    const r = (k: number) => hash01(Math.round(x), 510 + k);
    const w = 14 + r(1) * 5;
    const h = 15 + Math.floor(r(2) * 3) * 3;
    const z0 = -38 - r(3) * 4;
    const z1 = z0 - 16;
    facade.box({ x: x - w / 2, y: 0, z: z1 }, { x: x + w / 2, y: h, z: z0 }, rgb(OLD_TOWN[Math.floor(r(4) * OLD_TOWN.length)]), ['py', 'ny'], 3);
    roof(s, x - w / 2, x + w / 2, z1, z0, h, r(5) < 0.35 ? 0x4f8a74 : 0x5a3a30);
    // The quay in front of them.
    s.lit.box({ x: x - 9, y: WATER_Y, z: -36 }, { x: x + 9, y: 0, z: z0 }, (p) => mix(rgb(0x7a7468), rgb(0x9a9486), fbm3(p.x * 0.4, p.y, p.z * 0.4, 2, 511)), ['ny'], 6);
  }
  // Centralbron alongside, from just past the Central Station to Slussen.
  const [b0, b1] = [Math.max(x0, at.tc + 100), Math.min(x1, at.sl - 40)];
  if (b1 > b0) centralbron(s, b0, b1);
  // The German Church's tall green copper spire over the rooftops.
  if (within(at.gs - 60)) spire(s, at.gs - 60, -95, 34, 10, 0xe6dcc0, 0x4a8a70, 56);

  // Riddarholmen across the channel to the west, with its church and palaces.
  const holm = [at.gs - 230, at.gs + 40];
  for (let x = Math.max(x0, holm[0]); x < Math.min(x1, holm[1]); x += 30) {
    const w = Math.min(30, Math.min(x1, holm[1]) - x);
    s.lit.box({ x, y: WATER_Y, z: 72 }, { x: x + w, y: 1, z: 170 }, (p) => mix(rgb(0x6a6a5e), rgb(0x8a8a7a), fbm3(p.x * 0.1, 0, p.z * 0.1, 2, 512)), ['ny'], 8);
    if (hash01(Math.round(x), 513) < 0.7) {
      const h = 16 + hash01(Math.round(x), 514) * 8;
      facade.box({ x: x + 2, y: 1, z: 80 }, { x: x + w - 2, y: h, z: 100 }, rgb([0xebdcbc, 0xe8c86a, 0xd8b890][Math.floor(hash01(Math.round(x), 515) * 3)]), ['py', 'ny'], 3);
      roof(s, x + 2, x + w - 2, 80, 100, h, 0x3a3432);
    }
  }
  if (within(at.gs - 120)) {
    // Riddarholmen Church: a long brick nave and its open cast-iron spire.
    const cx = at.gs - 120;
    s.lit.box({ x: cx - 35, y: 1, z: 118 }, { x: cx + 35, y: 22, z: 140 }, BRICK, ['ny'], 4);
    s.lit.box({ x: cx - 35, y: 22, z: 118 }, { x: cx + 35, y: 27, z: 140 }, rgb(0x4f8a74), ['ny']);
    spire(s, cx + 38, 129, 46, 12, 0x9a4a36, 0x24262a, 50);
  }

  // The City Hall, far off across the water to the north-west: brick, and its tower with the three crowns.
  if (within(at.tc + 150)) {
    const cx = at.tc + 150;
    s.lit.box({ x: cx - 60, y: WATER_Y, z: 290 }, { x: cx + 60, y: 1, z: 330 }, rgb(0x6a6a5e), ['ny'], 12);
    s.lit.box({ x: cx - 55, y: 1, z: 295 }, { x: cx + 40, y: 30, z: 325 }, BRICK, ['ny'], 6);
    s.lit.box({ x: cx - 55, y: 30, z: 295 }, { x: cx + 40, y: 34, z: 325 }, rgb(0x4f8a74), ['ny']);
    s.lit.box({ x: cx + 40, y: 1, z: 300 }, { x: cx + 56, y: 88, z: 316 }, BRICK, ['ny'], 6);
    s.lit.box({ x: cx + 42, y: 88, z: 302 }, { x: cx + 54, y: 98, z: 314 }, rgb(0x5a8a76), ['ny']);
    const crowns = new CylinderGeometry(1.2, 0.8, 2.4, 8);
    for (const dz of [-2.5, 0, 2.5]) s.lit.geometry(crowns, new Matrix4().makeTranslation(cx + 48, 100.5, 308 + dz), rgb(0xe8c050));
    crowns.dispose();
  }

  // Södermalm's cliffs across the water to the south-west of Slussen, houses along the top.
  // Trees and bushes grow on the rock between the bare slabs.
  const cliff = (p: Vector3): RGB => mix(ROCK(p), mix(rgb(0x3a5a2c), rgb(0x5a7a3a), fbm3(p.x * 0.3, p.y * 0.3, p.z * 0.3, 2, 523)), Math.min(1, Math.max(0, fbm3(p.x * 0.06, p.y * 0.08, p.z * 0.06, 3, 524) * 1.6 - 0.35)));
  const [c0, c1] = [at.sl - 220, at.sl + 40];
  for (let x = Math.max(x0, c0); x < Math.min(x1, c1); x += 20) {
    const r = (k: number) => hash01(Math.round(x), 520 + k);
    // Lower toward both ends, so the cliff rises out of the water instead of standing as a block.
    const h = (8 + r(1) * 8) + 16 * Math.min(1, (x - c0) / 60, (c1 - x - 20) / 60);
    const z0 = 170 + r(2) * 20 - Math.max(0, x - (at.sl - 120)) * 0.5;
    s.lit.box({ x, y: WATER_Y, z: z0 }, { x: x + 20, y: h, z: 300 }, cliff, ['ny'], 5);
    const hz = z0 + 12 + r(3) * 10;
    facade.box({ x: x + 2, y: h, z: hz }, { x: x + 18, y: h + 12 + r(4) * 6, z: hz + 14 }, rgb(OLD_TOWN[Math.floor(r(5) * OLD_TOWN.length)]), ['ny', 'py'], 3);
    roof(s, x + 2, x + 18, hz, hz + 14, h + 12 + r(4) * 6, 0x5a3a30);
  }
}

/** An old town house's facade: plastered wall, tall windows with pale frames, a cornice every storey. */
export function oldFacadeTexture(): Texture {
  return cached('old-facade', () => {
    const [c, ctx] = canvas(64, 64);
    ctx.fillStyle = '#ece6d8';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#f8f4ea';
    ctx.fillRect(18, 8, 28, 44);
    ctx.fillStyle = '#2c343c';
    ctx.fillRect(21, 11, 22, 38);
    ctx.fillStyle = '#e8e2d4';
    ctx.fillRect(31, 11, 2, 38);
    ctx.fillRect(21, 26, 22, 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 58, 64, 6);
    return finish(c, 3.2);
  });
}

/** A pitched roof along x over a house from `z0` to `z1`, its ridge 4 m over the eaves at `y`. */
function roof(s: Section, x0: number, x1: number, z0: number, z1: number, y: number, colour: number): void {
  const [za, zb] = [Math.min(z0, z1), Math.max(z0, z1)];
  const zm = (za + zb) / 2;
  const ridge = new Vector3(0, y + 4, zm);
  const paint = rgb(colour);
  const a0 = new Vector3(x0, y, za), a1 = new Vector3(x1, y, za), r0 = ridge.clone().setX(x0), r1 = ridge.clone().setX(x1);
  const b0 = new Vector3(x0, y, zb), b1 = new Vector3(x1, y, zb);
  s.lit.quad(a0, r0, r1, a1, paint);
  s.lit.quad(b0, b1, r1, r0, paint);
  s.lit.tri(a0, b0, r0, paint);
  s.lit.tri(a1, r1, b1, paint);
}

/**
 * The station's ticket hall of the 1950s, a concrete block bridging all four
 * tracks from `x0` to `x1` on piers beyond the outer tracks: rows of windows
 * under a flat roof. The escalator shafts come up through its floor between
 * the `shafts` (ranges of z), and the hall's door out onto the street goes
 * through its end wall at `x1` (`door`: from `y0` to `y1`, `halfW` either side).
 */
export function cityHouse(s: Section, physics: Physics, x0: number, x1: number, shafts: Array<[number, number]>, door: { y0: number; y1: number; halfW: number }): void {
  const [xa, xb] = [Math.min(x0, x1), Math.max(x0, x1)];
  // Clear of the trains on the outer tracks (at 2 * LANE - TRACK_Z out, 1.5 m wide).
  const W = 23.6;
  const y0 = 5.4;
  const top = 21.5;
  const facade = s.artLayer(facadeTexture());
  const wall = rgb(0xd8d2c4);
  facade.box({ x: xa, y: y0, z: -W }, { x: xb, y: top, z: -W + 0.5 }, wall, [], 3);
  facade.box({ x: xa, y: y0, z: W - 0.5 }, { x: xb, y: top, z: W }, wall, [], 3);
  // The end walls stand between the long ones, so no two faces share a corner's plane.
  for (const [a, b, atDoor] of [[xa, xa + 0.5, x1 < x0], [xb - 0.5, xb, x1 > x0]] as const) {
    if (!atDoor) { facade.box({ x: a, y: y0, z: -W + 0.5 }, { x: b, y: top, z: W - 0.5 }, wall, [], 3); continue; }
    for (const side of [-1, 1]) facade.box({ x: a, y: y0, z: Math.min(side * door.halfW, side * (W - 0.5)) }, { x: b, y: top, z: Math.max(side * door.halfW, side * (W - 0.5)) }, wall, [], 3);
    // Under the door a little lower than the landing it meets, so their tops do not share a plane.
    facade.box({ x: a, y: y0, z: -door.halfW }, { x: b, y: door.y0 - 0.02, z: door.halfW }, wall, [], 3);
    facade.box({ x: a, y: door.y1, z: -door.halfW }, { x: b, y: top, z: door.halfW }, wall, [], 3);
  }
  // A thin flat roof reaching out a little past the walls, but not at the door, where the street's houses stand against it.
  s.lit.box({ x: x1 < x0 ? xa : xa - 0.8, y: top, z: -W - 0.8 }, { x: x1 > x0 ? xb : xb + 0.8, y: top + 0.5, z: W + 0.8 }, rgb(0x8a8680), [], 4);
  // Its underside over the tracks, open where the escalators come up, and a beam along each side.
  let z = -W;
  for (const [s0, s1] of [...shafts].sort((a, b) => a[0] - b[0])) {
    if (s0 > z) s.lit.box({ x: xa, y: y0 - 0.6, z }, { x: xb, y: y0, z: s0 }, rgb(0x9a958a), [], 4);
    z = s1;
  }
  s.lit.box({ x: xa, y: y0 - 0.6, z }, { x: xb, y: y0, z: W }, rgb(0x9a958a), [], 4);
  const pier = rgb(0xa8a498);
  for (const side of [-1, 1]) {
    const [za, zb] = side > 0 ? [W - 1.2, W] : [-W, -W + 1.2];
    s.lit.box({ x: xa, y: y0 - 1.4, z: za }, { x: xb, y: y0 - 0.6, z: zb }, pier, [], 4);
    const n = Math.max(1, Math.round((xb - xa) / 9));
    for (let i = 0; i <= n; i++) {
      const x = Math.min(xb - 0.5, Math.max(xa + 0.5, xa + ((xb - xa) * i) / n));
      s.lit.box({ x: x - 0.5, y: WATER_Y, z: za }, { x: x + 0.5, y: y0 - 1.4, z: zb }, pier, [], 4);
      physics.box({ x: x - 0.5, y: -1, z: za }, { x: x + 0.5, y: y0, z: zb });
    }
  }
}

/**
 * Centralbron, the motorway bridge that runs beside the tracks from the
 * Central Station past Gamla stan to Södermalm: a long concrete deck on
 * piers, between the line and the old town's quay.
 */
function centralbron(s: Section, x0: number, x1: number): void {
  const [z0, z1] = [-35, -24];
  const deck = 6.2;
  s.lit.box({ x: x0, y: deck - 1.4, z: z0 }, { x: x1, y: deck, z: z1 }, (_p, n) => (n.y > 0.5 ? rgb(0x4a4744) : rgb(0xa29e94)), [], 6);
  for (const z of [z0, z1 - 0.3]) s.lit.box({ x: x0, y: deck, z }, { x: x1, y: deck + 1, z: z + 0.3 }, rgb(0xb4b0a6), [], 6);
  for (let x = Math.ceil(x0 / 36) * 36; x < x1; x += 36) {
    for (const z of [z0 + 2, z1 - 2]) s.lit.box({ x: x - 0.9, y: WATER_Y, z: z - 0.9 }, { x: x + 0.9, y: deck - 1.4, z: z + 0.9 }, rgb(0x9a968c));
  }
}

/** A church tower: a square shaft `w` wide and `h` high, and a spire of `spireH` on top. */
function spire(s: Section, x: number, z: number, h: number, w: number, wall: number, roof: number, spireH: number): void {
  s.lit.box({ x: x - w / 2, y: 0, z: z - w / 2 }, { x: x + w / 2, y: h, z: z + w / 2 }, rgb(wall), ['ny'], 5);
  const cone = new ConeGeometry(w * 0.55, spireH, 8);
  s.lit.geometry(cone, new Matrix4().makeTranslation(x, h + spireH / 2, z), rgb(roof));
  cone.dispose();
  const cap = new BoxGeometry(w * 0.8, 3, w * 0.8);
  s.lit.geometry(cap, new Matrix4().makeTranslation(x, h + 1.5, z), rgb(roof));
  cap.dispose();
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
