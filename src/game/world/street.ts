import { CylinderGeometry, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import { hash01 } from '../clock';
import { MeshBuilder, type BoxFace } from '../gfx/builder';
import { mix, rgb, type RGB } from '../gfx/color';
import { fbm3 } from '../gfx/noise';
import { HALL_LEN, STREET } from '../layout';
import type { Physics } from '../physics';
import { oldFacadeTexture } from './city';
import type { Section } from './section';
import { place, textSign } from './signage';

/**
 * Up on the street at a station: a paved square between plastered houses of
 * five and six storeys, a road with parked cars and a zebra crossing across its
 * far end, the houses beyond, and SL's T on a pole. Over an underground
 * station the exit stairs come up in a railed opening in the square; at one in
 * the open the hall stands over the tracks, and its door opens straight onto
 * the square, set in the front of the house behind it. It is shut in on every
 * side, so the view ends on house fronts and the sky. Built into a section of
 * its own in the open air, so the daylight reaches it (`setDaylight`), and shown
 * only while the player is up at that station (`World.showStreet`).
 */

/** The street over a station, in world x, and what was built of it. */
export interface Street {
  x0: number;
  x1: number;
  /** Street level. */
  y: number;
  /** The street's section, once built for real; hidden unless the player is at its station. */
  group: Object3D | null;
  /** Snow lying on the ground, faded in while it snows (see `weather.ts`). */
  snow: Mesh | null;
  /** Lit windows, faded in as it gets dark. */
  windows: Mesh | null;
}

const PAVING = (p: Vector3): RGB => mix(rgb(0xb4b0a8), rgb(0xd0ccc2), fbm3(p.x * 0.4, 0, p.z * 0.4, 2, 601));
const ASPHALT = (p: Vector3): RGB => mix(rgb(0x37383b), rgb(0x4b4c50), fbm3(p.x * 0.3, 0, p.z * 0.3, 3, 602));
const PLINTH = (p: Vector3): RGB => mix(rgb(0x6c665e), rgb(0x857e74), fbm3(p.x * 0.3, p.y * 0.3, p.z * 0.3, 2, 603));
const CONCRETE = rgb(0x9a9ea3);
/** Inner city plaster: ochre, cream, rust, pink, grey. */
const PLASTER = [0xe0bf6a, 0xebdcbc, 0xd08a4a, 0xd9a090, 0xc6bfae, 0xe6cf98, 0xb86a4a, 0xd8d0bc];
const CARS = [0x2a3a5a, 0x8a1e1e, 0xd8d8d4, 0x1c1c1e, 0x5a6a72, 0x2e4a3a];
const LAMP = rgb(0xffe2b0);
/** The old facade texture's tile, and where the glass sits in it (see `oldFacadeTexture`). */
const TILE = 3.2;
const GLASS = { u0: 1.05, u1: 2.15, v0: 0.75, v1: 2.65 };
const WINDOW_LIGHT = [0xffd89a, 0xfff0c8, 0xffc574, 0xf4e6d0];

/**
 * Builds the street into `s` (an outdoor section) for the hall that starts at `hx` and runs in `e`, with its floor at
 * `hallY`, with colliders in `physics`, and a street sign naming the first of `exits`. Over an underground hall the
 * street lies `STREET.above` over it; with `door` (a hall in the open) it lies level with the landing at the top of the
 * hall's stairs, and the square starts at the hall's end wall, `door` naming the station over it.
 */
export function buildStreet(s: Section, physics: Physics, index: number, exits: string, hx: number, hallY: number, e: 1 | -1, door: string | null = null): Street {
  const { square: SQ, road: R } = STREET;
  const G = hallY + (door !== null ? STREET.door : STREET.above);
  // Measured along the hall, as underground; out of a door the square starts at the end wall's outer face.
  const shift = door !== null ? HALL_LEN + 0.5 - SQ.a0 : 0;
  const X = (a: number) => hx + e * (a + shift);
  const r = (k: number) => hash01(index * 131 + k, 600);
  const box = (b: MeshBuilder, a0: number, a1: number, y0: number, y1: number, z0: number, z1: number, paint: Parameters<MeshBuilder['box']>[2], collide = false, skip: BoxFace[] = [], cell = 2.5) => {
    const min = { x: Math.min(X(a0), X(a1)), y: y0, z: Math.min(z0, z1) };
    const max = { x: Math.max(X(a0), X(a1)), y: y1, z: Math.max(z0, z1) };
    b.box(min, max, paint, skip, cell);
    if (collide) physics.box(min, max);
  };
  /** An upward face at `y`, split into cells so the lamps' pools show. */
  const ground = (b: MeshBuilder, a0: number, a1: number, z0: number, z1: number, y: number, paint: Parameters<MeshBuilder['box']>[2], cell = 3) => {
    const [x0, x1] = [Math.min(X(a0), X(a1)), Math.max(X(a0), X(a1))];
    const [za, zb] = [Math.min(z0, z1), Math.max(z0, z1)];
    b.gridQuad(new Vector3(x0, y, za), new Vector3(x0, y, zb), new Vector3(x1, y, zb), new Vector3(x1, y, za), paint, cell);
    physics.box({ x: x0, y: y - 0.5, z: za }, { x: x1, y, z: zb });
  };

  // The square, open over the stairs underground: the cut runs from the far wall of the hall's stairwell to the top step.
  const well = { a0: 22.7, a1: STREET.stairTop, z: 2.8 };
  // The paving stops at the kerbs, whose tops lie level with it: two faces in one plane flicker.
  const K = 0.15;
  if (door) ground(s.floor, SQ.a0, R.a0 - K, -SQ.halfW, SQ.halfW, G, PAVING);
  else {
    ground(s.floor, SQ.a0, well.a0, -SQ.halfW, SQ.halfW, G, PAVING);
    for (const side of [-1, 1]) ground(s.floor, well.a0, well.a1, side * well.z, side * SQ.halfW, G, PAVING);
    ground(s.floor, well.a1, R.a0 - K, -SQ.halfW, SQ.halfW, G, PAVING);
  }
  // Pavements along the road, a kerb above it.
  for (const side of [-1, 1]) ground(s.floor, SQ.a1, R.a0 - K, side * SQ.halfW, side * R.halfLen, G, PAVING);
  ground(s.floor, R.a1 + K, R.far, -R.halfLen, R.halfLen, G, PAVING);
  for (const a of [R.a0, R.a1]) box(s.lit, a - K, a + K, G - 0.5, G, -R.halfLen, R.halfLen, rgb(0x9a968e), true, ['ny'], 6);
  ground(s.lit, R.a0, R.a1, -R.halfLen, R.halfLen, G - 0.15, ASPHALT, 4);
  // A dashed line down the middle, and a zebra crossing from the square.
  for (let z = -R.halfLen + 2; z < R.halfLen - 3; z += 6) if (Math.abs(z + 1.5) > 4) box(s.lit, 53.9, 54.1, G - 0.15, G - 0.14, z, z + 3, rgb(0xd8d8d0), false, ['ny']);
  for (let z = -2.25; z < 2.3; z += 1) box(s.lit, R.a0 + 0.3, R.a1 - 0.3, G - 0.15, G - 0.14, z, z + 0.5, rgb(0xe4e4dc), false, ['ny']);

  // A parapet and railing round the opening, open where the stairs come up.
  const rail = rgb(0x3a4a58);
  if (!door) for (const side of [-1, 1]) {
    const [z0, z1] = [side * 2.5, side * well.z];
    // Behind the end parapet, not through it, so no two faces share its plane.
    box(s.lit, well.a0 + 0.3, well.a1, G, G + 0.35, z0, z1, CONCRETE, true, ['ny']);
    box(s.lit, well.a0, well.a1, G + 1.02, G + 1.08, side * 2.62, side * 2.68, rail, false);
    for (let a = well.a0 + 0.2; a <= well.a1; a += 1.6) box(s.lit, a - 0.03, a + 0.03, G + 0.35, G + 1.02, side * 2.62, side * 2.68, rail);
    physics.box({ x: Math.min(X(well.a0), X(well.a1)), y: G, z: Math.min(z0, z1) }, { x: Math.max(X(well.a0), X(well.a1)), y: G + 1.2, z: Math.max(z0, z1) });
  }
  if (!door) {
    box(s.lit, well.a0, well.a0 + 0.3, G, G + 0.35, -well.z, well.z, CONCRETE, true, ['ny']);
    box(s.lit, well.a0 + 0.12, well.a0 + 0.18, G + 1.02, G + 1.08, -well.z, well.z, rail, false);
    physics.box({ x: Math.min(X(well.a0), X(well.a0 + 0.3)), y: G, z: -well.z }, { x: Math.max(X(well.a0), X(well.a0 + 0.3)), y: G + 1.2, z: well.z });
  }

  // SL's T on its pole beside the stairs, or beside the door, lit from inside: a blue T on white in a blue ring, one face
  // toward the square and one toward the road. The white disc stands a little proud of the ring, and the T of the white.
  const tz = -(well.z + 0.8);
  const ta = door ? SQ.a0 + 2.5 : well.a1 - 1;
  box(s.lit, ta - 0.06, ta + 0.06, G, G + 3.2, tz - 0.06, tz + 0.06, rgb(0x5a6068), true);
  const SL_BLUE = rgb(0x1e5ab4);
  const m = new Matrix4();
  for (const [radius, thick, paint] of [[0.5, 0.1, SL_BLUE], [0.42, 0.12, rgb(0xffffff)]] as const) {
    const disc = new CylinderGeometry(radius, radius, thick, 28);
    s.unlit.geometry(disc, m.makeRotationZ(Math.PI / 2).setPosition(X(ta), G + 3.7, tz), paint);
    disc.dispose();
  }
  for (const face of [-1, 1]) {
    const a = ta + face * 0.07;
    box(s.unlit, a - 0.01, a + 0.01, G + 3.86, G + 3.96, tz - 0.27, tz + 0.27, SL_BLUE);
    box(s.unlit, a - 0.01, a + 0.01, G + 3.44, G + 3.9, tz - 0.05, tz + 0.05, SL_BLUE);
  }
  s.light(X(ta), G + 3.7, tz, rgb(0xf4f6ff), 0.5, 5);

  // Houses round it all, their ground floors of stone with shop windows and doors toward the street; after dark
  // some of the windows above are lit, on a mesh of their own that the weather fades in (`weather.ts`).
  const facade = s.artLayer(oldFacadeTexture());
  const lit = s.dry ? null : new MeshBuilder();
  const windowsOn = (k: number, front: string, at: number, out: number, from: number, to: number, h: number) => {
    if (!lit) return;
    const alongA = front[0] === 'z';
    // The texture is laid by world position: along x on a face across z, along z on a face across x.
    const [u0, u1] = alongA ? [Math.min(X(from), X(to)), Math.max(X(from), X(to))] : [Math.min(from, to), Math.max(from, to)];
    const face = alongA ? at + out * 0.75 : X(at) + e * out * 0.75 - hx;
    for (let t = Math.ceil(u0 / TILE); (t + 1) * TILE <= u1; t++) {
      for (let row = Math.ceil((G + 3.8) / TILE); (row + 1) * TILE <= G + h; row++) {
        const n = k * 997 + t * 31 + row;
        if (hash01(n, 630) > 0.38) continue;
        const paint = rgb(WINDOW_LIGHT[Math.floor(hash01(n, 631) * WINDOW_LIGHT.length)]);
        const [a, b] = [t * TILE + GLASS.u0, t * TILE + GLASS.u1];
        const [y0, y1] = [row * TILE + GLASS.v0, row * TILE + GLASS.v1];
        if (alongA) lit.quad(new Vector3(a - hx, y0, face), new Vector3(b - hx, y0, face), new Vector3(b - hx, y1, face), new Vector3(a - hx, y1, face), paint);
        else lit.quad(new Vector3(face, y0, a), new Vector3(face, y0, b), new Vector3(face, y1, b), new Vector3(face, y1, a), paint);
      }
    }
  };
  let houseNo = 0;
  /** A house from `a0` to `a1` and between `za` and `zb`, its fronts named by side (`z0` the lesser z, `z1` the greater). */
  const house = (a0: number, a1: number, za: number, zb: number, fronts: Array<'a0' | 'a1' | 'z0' | 'z1'>) => {
    const [z0, z1] = [Math.min(za, zb), Math.max(za, zb)];
    const k = houseNo++;
    const h = 15 + Math.floor(r(k * 5) * 4) * 2.4;
    const plaster = rgb(PLASTER[Math.floor(r(k * 5 + 1) * PLASTER.length)]);
    box(s.lit, a0, a1, G, G + 3.8, z0, z1, PLINTH, true, ['ny', 'py'], 3);
    box(facade, a0, a1, G + 3.8, G + h, z0, z1, plaster, false, ['ny', 'py'], 3);
    physics.box({ x: Math.min(X(a0), X(a1)), y: G + 3.8, z: Math.min(z0, z1) }, { x: Math.max(X(a0), X(a1)), y: G + h, z: Math.max(z0, z1) });
    // A cornice, and the roof's dark tin just showing over it. Where two houses meet their cornices overlap, so each
    // reaches out and hangs down a little further than the last, and no two faces share a plane.
    const lip = 0.22 + (k % 3) * 0.03;
    box(s.lit, a0 - lip, a1 + lip, G + h - (k % 3) * 0.03, G + h + 0.4, z0 - lip, z1 + lip, mix(plaster, rgb(0xf0ece2), 0.5), false);
    box(s.lit, a0 + 1.5, a1 - 1.5, G + h + 0.45, G + h + 2.2, z0 + 1.5, z1 - 1.5, rgb(0x5c6064), false, ['ny']);
    for (const front of fronts) {
      const alongA = front[0] === 'z';
      const [from, to] = alongA ? [a0, a1] : [z0, z1];
      const at = front === 'a0' ? a0 : front === 'a1' ? a1 : front === 'z0' ? z0 : z1;
      const out = front.endsWith('0') ? -0.04 : 0.04;
      windowsOn(k, front, at, out, from, to, h);
      for (let u = from + 1.2, n = 0; u + 2.6 < to - 0.8; u += 4, n++) {
        const door = hash01(k * 17 + n, 610) < 0.3;
        const paint = door ? rgb(0x3a2e26) : hash01(k * 17 + n, 611) < 0.8 ? rgb(0xf2d9a6) : rgb(0x2c3036);
        const top = door ? G + 2.5 : G + 3.1;
        const bottom = door ? G : G + 0.6;
        if (alongA) box(s.unlit, u, u + 2.6, bottom, top, at + out, at + out * 1.5, paint);
        else box(s.unlit, at + out, at + out * 1.5, bottom, top, u, u + 2.6, paint);
      }
    }
  };
  // Behind the square, and down both its sides; the corner houses turn onto the road. Out of a door, the house behind
  // is the hall's own front: a stone ground floor with the way in, plaster above, the hall behind it.
  if (door) {
    const k = houseNo++;
    const h = 18;
    const plaster = rgb(PLASTER[Math.floor(r(k * 5 + 1) * PLASTER.length)]);
    const [f0, f1] = [SQ.a0, SQ.a0 + 0.4];
    const top = G + STREET.doorHeight;
    for (const side of [-1, 1]) box(s.lit, f0, f1, G, G + 3.8, side * STREET.doorHalfW, side * SQ.halfW, PLINTH, true, ['ny', 'py'], 3);
    box(s.lit, f0, f1, top, G + 3.8, -STREET.doorHalfW, STREET.doorHalfW, PLINTH, true, ['py'], 3);
    box(facade, f0, f1, G + 3.8, G + h, -SQ.halfW, SQ.halfW, plaster, true, ['ny', 'py'], 3);
    box(s.lit, f0, f1 + 0.25, G + h, G + h + 0.4, -SQ.halfW, SQ.halfW, mix(plaster, rgb(0xf0ece2), 0.5), false, ['ny']);
    windowsOn(k, 'a1', f1, 0.04, -SQ.halfW, SQ.halfW, h);
    // The station's name over the door, as on SL's entrances.
    const over = textSign(`T  ${door}`, 1024, 128, '#1e5ab4', '#ffffff');
    place(s, over, 4.6, 0.58, new Vector3(X(f1 + 0.03), top + 0.45, 0), new Vector3(e, 0, 0));
  } else house(SQ.a0 - STREET.depth, SQ.a0, -SQ.halfW, SQ.halfW, ['a1']);
  for (const side of [-1, 1]) {
    const inner = side * SQ.halfW;
    const f = side > 0 ? 'z0' : 'z1';
    house(SQ.a0, 20, inner, side * (SQ.halfW + STREET.depth), [f]);
    house(20, 34, inner, side * (SQ.halfW + STREET.depth), [f]);
    house(34, SQ.a1, inner, side * R.halfLen, [f, 'a1']);
    // Across each end of the road, so it ends on a house front.
    house(SQ.a1, R.far, side * R.halfLen, side * (R.halfLen + STREET.depth), [f]);
  }
  // The row across the road.
  for (let z = -R.halfLen - STREET.depth; z < R.halfLen + STREET.depth; ) {
    const w = Math.min(R.halfLen + STREET.depth - z, 11 + r(40 + houseNo) * 7);
    house(R.far, R.far + STREET.depth, z, z + w, ['a0']);
    z += w;
  }

  // Street lamps along the pavements and round the square.
  const lamp = (a: number, z: number, armToward: number) => {
    box(s.lit, a - 0.07, a + 0.07, G, G + 5.4, z - 0.07, z + 0.07, rgb(0x2e3238), true);
    box(s.lit, Math.min(a, a + armToward * 1.2), Math.max(a, a + armToward * 1.2), G + 5.3, G + 5.4, z - 0.04, z + 0.04, rgb(0x2e3238));
    const ha = a + armToward * 1.2;
    box(s.unlit, ha - 0.25, ha + 0.25, G + 5.1, G + 5.3, z - 0.18, z + 0.18, LAMP);
    s.light(X(ha), G + 5, z, rgb(0xffdca8), 1.1, 13);
  };
  for (let z = -R.halfLen + 8; z < R.halfLen; z += 16) {
    lamp(R.a0 - 1.2, z, 1);
    lamp(R.a1 + 1.2, z + 8, -1);
  }
  for (const side of [-1, 1]) {
    lamp(12, side * (SQ.halfW - 1.2), -side);
    lamp(30, side * (SQ.halfW - 1.2), -side);
  }

  // Benches and planters with small spruces on the square.
  const spruce = new CylinderGeometry(0, 0.8, 2.2, 7);
  for (const side of [-1, 1]) {
    for (const a of [14, 26]) {
      const z = side * 7.5;
      box(s.lit, a - 1.1, a + 1.1, G, G + 0.8, z - 1.1, z + 1.1, CONCRETE, true, ['ny']);
      s.lit.geometry(spruce, m.makeTranslation(X(a), G + 1.9, z), mix(rgb(0x22422c), rgb(0x365c3a), r(50 + a + side)));
    }
    const bz = side * 9.5;
    box(s.lit, 19, 22, G + 0.42, G + 0.5, bz - 0.25, bz + 0.25, rgb(0x6a4a32), true);
    box(s.lit, 19, 22, G + 0.5, G + 0.95, bz + side * 0.22, bz + side * 0.28, rgb(0x6a4a32));
    for (const a of [19.3, 21.7]) box(s.lit, a - 0.05, a + 0.05, G, G + 0.42, bz - 0.25, bz + 0.25, rgb(0x2e3238));
  }
  spruce.dispose();

  // Cars parked along both kerbs, clear of the crossing.
  for (const [lane, dir] of [[R.a0 + 1.2, 1], [R.a1 - 1.2, -1]] as const) {
    for (let z = -R.halfLen + 4; z < R.halfLen - 5; z += 5.5) {
      const n = Math.round(z * 3 + lane);
      if (Math.abs(z) < 7 || hash01(index * 7 + n, 620) < 0.35) continue;
      const colour = rgb(CARS[Math.floor(hash01(index * 7 + n, 621) * CARS.length)]);
      box(s.lit, lane - 0.9, lane + 0.9, G - 0.15 + 0.3, G - 0.15 + 1.0, z, z + 4.3, colour, true, ['ny']);
      box(s.lit, lane - 0.8, lane + 0.8, G - 0.15 + 1.0, G - 0.15 + 1.5, z + 1.1 - dir * 0.2, z + 3.4 - dir * 0.2, rgb(0x20262c), false, ['ny']);
      for (const wz of [z + 0.8, z + 3.5]) box(s.lit, lane - 0.95, lane + 0.95, G - 0.15, G - 0.15 + 0.6, wz - 0.32, wz + 0.32, rgb(0x16181a), false, ['ny']);
    }
  }

  // The street's name on the corner house, in white on blue.
  const name = exits.split('·')[0].trim();
  const sign = textSign(name, 512, 96, '#1d3f8c', '#ffffff');
  place(s, sign, 2.2, 0.42, new Vector3(X(SQ.a1 + 0.02), G + 3.4, SQ.halfW + 1.8), new Vector3(e, 0, 0));
  place(s, sign, 2.2, 0.42, new Vector3(X(SQ.a1 + 0.02), G + 3.4, -SQ.halfW - 1.8), new Vector3(e, 0, 0));

  // Snow on the ground, and slush on the road: its own mesh, so the weather can fade it (see `weather.ts`).
  let snow: Mesh | null = null;
  if (!s.dry) {
    const b = new MeshBuilder();
    const flat = (a0: number, a1: number, z0: number, z1: number, y: number, paint: RGB) => {
      const [x0, x1] = [Math.min(X(a0), X(a1)) - hx, Math.max(X(a0), X(a1)) - hx];
      const [za, zb] = [Math.min(z0, z1), Math.max(z0, z1)];
      b.quad(new Vector3(x0, y, za), new Vector3(x0, y, zb), new Vector3(x1, y, zb), new Vector3(x1, y, za), paint);
    };
    const white = rgb(0xffffff);
    const lift = G + 0.02;
    if (door) flat(SQ.a0 + 0.4, R.a0, -SQ.halfW, SQ.halfW, lift, white);
    else {
      flat(SQ.a0, well.a0, -SQ.halfW, SQ.halfW, lift, white);
      for (const side of [-1, 1]) flat(well.a0, well.a1, side * well.z, side * SQ.halfW, lift, white);
      flat(well.a1, R.a0, -SQ.halfW, SQ.halfW, lift, white);
    }
    for (const side of [-1, 1]) flat(SQ.a1, R.a0, side * SQ.halfW, side * R.halfLen, lift, white);
    flat(R.a1, R.far, -R.halfLen, R.halfLen, lift, white);
    flat(R.a0, R.a1, -R.halfLen, R.halfLen, G - 0.13, rgb(0x9aa0a6));
    const geo = b.build();
    geo.deleteAttribute('normal');
    snow = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }));
    snow.position.x = hx;
    s.extras.add(snow);
  }
  let windows: Mesh | null = null;
  if (lit) {
    const geo = lit.build();
    geo.deleteAttribute('normal');
    windows = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }));
    windows.position.x = hx;
    s.extras.add(windows);
  }

  const ends = [X(door ? SQ.a0 : SQ.a0 - STREET.depth), X(R.far + STREET.depth)];
  return { x0: Math.min(...ends), x1: Math.max(...ends), y: G, group: null, snow, windows };
}
