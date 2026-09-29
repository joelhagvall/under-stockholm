import { CylinderGeometry, Matrix4, Quaternion, SphereGeometry, Vector3, type BufferGeometry } from 'three';
import { clinkerTexture, pixelTilesTexture } from '../../gfx/art/green';
import type { MeshBuilder, Paint } from '../../gfx/builder';
import { mix, rgb, type RGB } from '../../gfx/color';
import { noise3 } from '../../gfx/noise';
import { mulberry32 } from '../../gfx/textures';
import { CANOPY, CAVE_HALF_L, CAVE_HALF_W, PLATFORM_HALF_L, PLATFORM_HALF_W, PLATFORM_Y, STATION_ROCK_INSET } from '../../layout';
import { hallDir } from '../../line';
import { canopySpans, covered } from '../canopy';
import { OPEN } from '../outdoor';
import { coolLamp, TILED_TOP, VAULT_TOP, VAULT_WALL_H, warmLamp } from '../../lines/theme';
import type { Detail, DetailSite } from './types';

/** The walls of a green line station's box or vault, from the line's axis (its stations have one island). */
const WALL_Z = CAVE_HALF_W - STATION_ROCK_INSET;

/**
 * Where the tiled boxes' columns stand along the island, from the middle: every eight to twelve meters, as the
 * real rows, and clear of the benches, the information pillars and everything that hangs over the island
 * (clocks at 18, transfer signs, direction signs, departure displays and exit boards).
 */
const COLUMN_DXS = [-67, -56, -35, -27, -15, 0, 15, 27, 35, 56, 67];

/** A three.js geometry into a builder layer, placed by `matrix`, and let go. */
function put(b: MeshBuilder, geo: BufferGeometry, matrix: Matrix4, paint: Paint): void {
  b.geometry(geo, matrix, paint);
  geo.dispose();
}

/** An upright cylinder (or cone, `r1` at the top) from `y0` to `y1`. */
function upright(b: MeshBuilder, x: number, z: number, y0: number, y1: number, r0: number, r1: number, segments: number, paint: Paint, open = false): void {
  put(b, new CylinderGeometry(r1, r0, y1 - y0, segments, 1, open), new Matrix4().setPosition(x, (y0 + y1) / 2, z), paint);
}

/** A round bar from `a` to `b`, `r0` thick at `a` and `r1` at `b`. */
function rod(builder: MeshBuilder, a: Vector3, b: Vector3, r0: number, r1: number, segments: number, paint: Paint): void {
  const d = new Vector3().subVectors(b, a);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize());
  put(builder, new CylinderGeometry(r1, r0, d.length(), segments, 1), new Matrix4().compose(a.clone().addScaledVector(d, 0.5), q, new Vector3(1, 1, 1)), paint);
}

/** A thin line along `pts` as two crossed ribbons, so it reads from any side: a neon tube, an LED bar. */
function tube(b: MeshBuilder, pts: Vector3[], width: number, color: RGB): void {
  const h = width / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1];
    const dx = q.x - p.x, dz = q.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    // Across the line in the horizontal, and straight up.
    const ax = (-dz / len) * h, az = (dx / len) * h;
    b.quad(new Vector3(p.x - ax, p.y, p.z - az), new Vector3(q.x - ax, q.y, q.z - az), new Vector3(q.x + ax, q.y, q.z + az), new Vector3(p.x + ax, p.y, p.z + az), color);
    b.quad(new Vector3(p.x, p.y - h, p.z), new Vector3(q.x, q.y - h, q.z), new Vector3(q.x, q.y + h, q.z), new Vector3(p.x, p.y + h, p.z), color);
  }
}

/** The height of a vaulted station's ceiling `z` from the axis (the vault is half an ellipse on its walls). */
const vaultY = (z: number) => VAULT_WALL_H + (VAULT_TOP - VAULT_WALL_H) * Math.sqrt(Math.max(0, 1 - (z / WALL_Z) ** 2));

/** A row of columns down the island, up into the ceiling at `top`: square ones `half` across, or round ones. */
function columns(site: DetailSite, top: number, half: number, round: boolean, paint: Paint, dxs: readonly number[] = COLUMN_DXS): number[] {
  const { s, physics, cx } = site;
  const xs: number[] = [];
  for (const zi of site.islands) {
    for (const dx of dxs) {
      const x = cx + dx;
      if (!site.free(x, half + 0.3)) continue;
      xs.push(x);
      if (round) upright(s.lit, x, zi, PLATFORM_Y, top, half, half, 16, paint, true);
      else s.lit.box({ x: x - half, y: PLATFORM_Y, z: zi - half }, { x: x + half, y: top, z: zi + half }, paint, ['py', 'ny'], 1.2);
      physics.box({ x: x - half - 0.05, y: PLATFORM_Y, z: zi - half - 0.05 }, { x: x + half + 0.05, y: top, z: zi + half + 0.05 });
    }
  }
  return xs;
}

/** Glossy tiles on a column: a little lighter on the faces toward the lamps along the platform. */
const glazed = (color: number): Paint => (_p, n) => mix(rgb(color), rgb(0xffffff), Math.abs(n.x) * 0.12);

// ---------------------------------------------------------------- The tiled boxes

/** S:t Eriksplan: one row of pale square columns, nothing else: it is one of the few stations without art. */
function stEriksplan(site: DetailSite): void {
  columns(site, TILED_TOP + 0.2, 0.33, false, glazed(0xd8d8d4));
}

/** Rådmansgatan: square columns clad in small pale yellow tiles. */
function radmansgatan(site: DetailSite): void {
  columns(site, TILED_TOP + 0.2, 0.36, false, glazed(0xe6d68a));
}

/**
 * Hötorget: square columns in the same pale blue tiles as the walls, and Gun Gordillo's neon (1998): 103 lines of
 * white neon in five tones of white, looping and crossing loosely under the ceiling at different heights. Drawn
 * unlit, as the brightest thing in the station, with their glow baked onto the ceiling.
 */
function hotorget(site: DetailSite): void {
  const { s, cx, free } = site;
  columns(site, TILED_TOP + 0.2, 0.36, false, glazed(0xbcd6d6));
  const whites = [0xffffff, 0xf2f6ff, 0xfff4e4, 0xe8f2ff, 0xfffaf2].map(rgb);
  const rnd = mulberry32(1998);
  // The ceiling falls toward the walls: keep each loop under it.
  const ceiling = (z: number) => 5.1 + 0.6 * Math.sqrt(Math.max(0, 1 - (z / WALL_Z) ** 2)) - 0.12;
  const LOOPS = 46;
  for (let k = 0; k < LOOPS; k++) {
    // Each line wanders along the platform for ten to twenty meters, swinging across it and now and then turning
    // a full loop where its swing outruns its way along.
    const x0 = cx - 72 + (136 * (k + rnd())) / LOOPS;
    const len = 10 + rnd() * 10;
    const dir = rnd() < 0.5 ? 1 : -1;
    const z0 = (rnd() - 0.5) * 10;
    const swing = 1.5 + rnd() * 3.5;
    const turns = 0.8 + rnd() * 1.4;
    const loop = rnd() * 2.2;
    const phase = rnd() * Math.PI * 2;
    const y0 = 4.95 + rnd() * 0.35;
    const color = whites[k % whites.length];
    const pts: Vector3[] = [];
    const flush = () => {
      if (pts.length > 1) tube(s.unlit, pts, 0.045, color);
      pts.length = 0;
    };
    const N = 20;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = t * Math.PI * 2 * turns + phase;
      const x = x0 + dir * (t * len + Math.sin(a) * loop);
      const z = Math.max(-8.5, Math.min(8.5, z0 + Math.cos(a) * swing));
      const y = Math.min(ceiling(z), y0 + Math.sin(t * Math.PI * 3 + phase) * 0.15);
      // Not through the opening where the escalators climb up through the ceiling from the platform.
      if (!free(x, 0.5) && Math.abs(z) < 3.5) { flush(); continue; }
      pts.push(new Vector3(x, y, z));
    }
    flush();
  }
  // Their cool glow on the ceiling and the tiles.
  for (let x = cx - 64; x <= cx + 64; x += 16) for (const z of [-4.5, 4.5]) s.light(x, 5.0, z, coolLamp, 0.35, 7);
}

/**
 * Medborgarplatsen: Gunnar Söderström's columns (1979), round and enamelled bright blue, ringed with stripes of red,
 * yellow, green and white at different heights.
 */
function medborgarplatsen(site: DetailSite): void {
  const R = 0.26;
  const xs = columns(site, VAULT_TOP + 0.2, R, true, rgb(0x1f3fa8));
  const stripes: Array<[number, number, number]> = [
    [0.9, 1.05, 0xd8342b], [1.12, 1.2, 0xf2f0e8], [1.28, 1.5, 0xf2c230], [2.1, 2.2, 0x2a9a4a], [2.28, 2.36, 0xd8342b],
    [2.9, 3.15, 0xf2f0e8], [3.25, 3.32, 0xf2c230], [3.8, 3.95, 0x2a9a4a], [4.05, 4.2, 0xd8342b],
  ];
  for (const zi of site.islands) {
    for (const [k, x] of xs.entries()) {
      // Each column's rings a little higher or lower than its neighbour's.
      const lift = ((k * 7) % 5) * 0.12 - 0.24;
      for (const [a, b, c] of stripes) upright(site.s.lit, x, zi, PLATFORM_Y + a + lift, PLATFORM_Y + b + lift, R + 0.006, R + 0.006, 16, rgb(c), true);
    }
  }
}

/**
 * Skanstull: round white enamelled columns that flare into the ceiling, under a flat ceiling of deep transverse
 * beams on one beam along the columns, as the 1933 box was built.
 */
function skanstull(site: DetailSite): void {
  const { s, cx } = site;
  const R = 0.24;
  const white = rgb(0xeef0ee);
  const xs = columns(site, TILED_TOP + 0.2, R, true, white);
  for (const zi of site.islands) for (const x of xs) upright(s.lit, x, zi, 4.4, TILED_TOP, R, 0.62, 16, white, true);
  const beam = rgb(0xd8d6ce);
  for (const zi of site.islands) s.lit.box({ x: cx - CAVE_HALF_L + 0.1, y: 5.15, z: zi - 0.3 }, { x: cx + CAVE_HALF_L - 0.1, y: TILED_TOP + 0.1, z: zi + 0.3 }, beam, ['py', 'px', 'nx'], 4);
  for (let x = cx - CAVE_HALF_L + 2; x < cx + CAVE_HALF_L - 1; x += 3.6) {
    s.lit.box({ x: x - 0.16, y: 5.0, z: -WALL_Z + 0.05 }, { x: x + 0.16, y: TILED_TOP + 0.1, z: WALL_Z - 0.05 }, beam, ['py', 'pz', 'nz'], 4);
  }
}

/**
 * Odenplan: Yorgo Turac's glass case (1996), where newly graduated artists show their work in turn: an octagonal
 * glazed kiosk with a red cornice and roof, on a dais behind red iron railings in the middle of the platform.
 */
function odenplan(site: DetailSite): void {
  const { s, physics, cx } = site;
  const x = [cx, cx - 6, cx + 6].find((c) => site.free(c, 3.2));
  if (x === undefined) return;
  const red = rgb(0xb8452a);
  const dark = rgb(0x2a2c2e);
  for (const zi of site.islands) {
    const HX = 2.8, HZ = 1.9;
    // The dais.
    s.lit.box({ x: x - HX, y: PLATFORM_Y, z: zi - HZ }, { x: x + HX, y: PLATFORM_Y + 0.14, z: zi + HZ }, rgb(0x5a2e26), ['ny']);
    // Railings round it: posts, a top rail and a middle rail, and a scroll in each bay.
    const top = PLATFORM_Y + 1.05;
    for (const [ax, az, bx, bz] of [[-HX, -HZ, HX, -HZ], [-HX, HZ, HX, HZ], [-HX, -HZ, -HX, HZ], [HX, -HZ, HX, HZ]] as const) {
      const alongX = az === bz;
      for (const y of [top - 0.05, PLATFORM_Y + 0.55, PLATFORM_Y + 0.2]) {
        s.lit.box({ x: x + Math.min(ax, bx) - 0.03, y, z: zi + Math.min(az, bz) - 0.03 }, { x: x + Math.max(ax, bx) + 0.03, y: y + 0.05, z: zi + Math.max(az, bz) + 0.03 }, red);
      }
      const n = Math.round((alongX ? 2 * HX : 2 * HZ) / 0.35);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const px = x + ax + (bx - ax) * t, pz = zi + az + (bz - az) * t;
        const w = i % 4 === 0 ? 0.035 : 0.015;
        s.lit.box({ x: px - w, y: PLATFORM_Y + 0.14, z: pz - w }, { x: px + w, y: i % 4 === 0 ? top + 0.08 : top, z: pz + w }, red);
      }
    }
    physics.box({ x: x - HX - 0.05, y: PLATFORM_Y, z: zi - HZ - 0.05 }, { x: x + HX + 0.05, y: top + 0.1, z: zi + HZ + 0.05 });
    // The kiosk: a plinth, eight glass sides between dark frames, a red cornice and a low red roof with a finial.
    const R = 1.2;
    const y0 = PLATFORM_Y + 0.14;
    upright(s.lit, x, zi, y0, y0 + 0.35, R + 0.08, R + 0.08, 8, dark);
    upright(s.lit, x, zi, y0 + 0.35, y0 + 2.75, R, R, 8, (p) => mix(rgb(0x55666c), rgb(0x9fb2b6), Math.max(0, (p.y - y0 - 0.35) / 2.4) * 0.6));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const px = x + Math.sin(a) * R, pz = zi + Math.cos(a) * R;
      s.lit.box({ x: px - 0.04, y: y0 + 0.35, z: pz - 0.04 }, { x: px + 0.04, y: y0 + 2.75, z: pz + 0.04 }, dark);
    }
    upright(s.lit, x, zi, y0 + 2.75, y0 + 3.05, R + 0.2, R + 0.25, 8, red);
    upright(s.lit, x, zi, y0 + 3.05, y0 + 3.4, R + 0.2, 0.3, 8, rgb(0x8a3222));
    upright(s.lit, x, zi, y0 + 3.4, y0 + 3.65, 0.08, 0.02, 6, dark);
    physics.box({ x: x - R - 0.3, y: PLATFORM_Y, z: zi - R - 0.3 }, { x: x + R + 0.3, y: y0 + 3.4, z: zi + R + 0.3 });
    // Lit from within.
    s.light(x, y0 + 2.2, zi, warmLamp, 0.6, 4);
  }
}

// ---------------------------------------------------------------- The rock stations

/**
 * Fridhemsplan's green platform: over the half of the vault that is bare rock, the renovation hung rows of long LED
 * tubes, each a little askew, so the rows read as lines drawn diagonally across the rock.
 */
function fridhemsplan(site: DetailSite): void {
  const { s, cx } = site;
  const color = rgb(0xf6f8ff);
  // The rock is over the +z track (the texture's wall 0 side); the white vault over -z keeps the ordinary lamps.
  for (const [r, z] of [1.2, 3.9, 6.3, 8.4].entries()) {
    for (let x = cx - 72 + r * 1.4; x < cx + 70; x += 3.4) {
      const za = z - 0.25, zb = z + 0.25;
      tube(s.unlit, [new Vector3(x, vaultY(za) - 0.08, za), new Vector3(x + 2.3, vaultY(zb) - 0.08, zb)], 0.07, color);
    }
    for (let x = cx - 66; x <= cx + 66; x += 22) s.light(x, vaultY(z) - 0.4, z, coolLamp, 0.35, 7);
  }
}

/**
 * Bagarmossen: Gert Marcus' band of light (1994) along both track walls: 114 backlit glass panels at head height on
 * a black lower wall, shading along the station from blue through violet and magenta on one side and from green to
 * blue on the other. Unlit, with their coloured glow baked onto the rock and the platform's edge.
 */
function bagarmossen(site: DetailSite): void {
  const { s, physics, cx } = site;
  const X0 = cx - PLATFORM_HALF_L + 1, X1 = cx + PLATFORM_HALF_L - 1;
  const PANELS = 57;
  const pw = (X1 - X0) / PANELS;
  const B0 = 2.35, B1 = 3.3;
  const ramps: Record<number, number[]> = { [-1]: [0x1c2cc8, 0x3326c0, 0x5424a8, 0x842494, 0xa8206a], 1: [0x0f8a48, 0x0f8472, 0x1a5ca8, 0x1c30c4, 0x2a22c0] };
  const along = (side: number, t: number): RGB => {
    const ramp = ramps[side].map(rgb);
    const f = Math.max(0, Math.min(0.9999, t)) * (ramp.length - 1);
    const k = Math.floor(f);
    return mix(ramp[k], ramp[k + 1], f - k);
  };
  const frame = rgb(0x1a1b1c);
  for (const side of [-1, 1]) {
    const zw = side * (WALL_Z - 0.03);
    const zg = side * (WALL_Z - 0.07);
    // The black wall, smooth from the track bed up to the top of the band.
    s.lit.box({ x: cx - CAVE_HALF_L + 0.3, y: -0.5, z: Math.min(zw, zw - side * 0.03) }, { x: cx + CAVE_HALF_L - 0.3, y: B1 + 0.12, z: Math.max(zw, zw - side * 0.03) }, (p) => mix(rgb(0x18191a), rgb(0x2a2b2c), noise3(p.x * 0.3, p.y * 0.6, 0, 9)), [side > 0 ? 'pz' : 'nz'], 3);
    physics.box({ x: cx - CAVE_HALF_L, y: -1, z: Math.min(zw, side * CAVE_HALF_W) }, { x: cx + CAVE_HALF_L, y: B1 + 0.12, z: Math.max(zw, side * CAVE_HALF_W) });
    for (let i = 0; i < PANELS; i++) {
      const a = X0 + i * pw + 0.04, b = X0 + (i + 1) * pw - 0.04;
      const ca = along(side, (a - X0) / (X1 - X0)), cb = along(side, (b - X0) / (X1 - X0));
      // Each pane shades from its neighbour's colour into the next one's.
      s.unlit.quad(new Vector3(a, B0, zg), new Vector3(b, B0, zg), new Vector3(b, B1, zg), new Vector3(a, B1, zg), (p) => mix(ca, cb, (p.x - a) / (b - a)));
      s.lit.box({ x: b, y: B0 - 0.02, z: Math.min(zg, zw) }, { x: b + 0.08, y: B1 + 0.02, z: Math.max(zg, zw) }, frame);
    }
    for (const y of [B0 - 0.06, B1]) s.lit.box({ x: X0, y, z: Math.min(zg - side * 0.02, zw) }, { x: X1, y: y + 0.06, z: Math.max(zg - side * 0.02, zw) }, frame, [], 6);
    for (let x = X0 + 6; x < X1; x += 11) s.light(x, (B0 + B1) / 2, side * (WALL_Z - 0.6), along(side, (x - X0) / (X1 - X0)), 0.5, 6);
  }
}

/**
 * Skarpnäck: a floor of red clinker, and Richard Nonas' granite benches (1994) down the middle of the platform:
 * rough grey slabs set as low tables, each on two legs.
 */
function skarpnack(site: DetailSite): void {
  const { s, physics, cx, exitDir: e } = site;
  // The clinker over the platform's slabs, leaving its tactile strips and edge.
  const clinker = s.artLayer(clinkerTexture());
  const p0 = Math.min(cx - e * PLATFORM_HALF_L, cx + e * CAVE_HALF_L);
  const p1 = Math.max(cx - e * PLATFORM_HALF_L, cx + e * CAVE_HALF_L);
  const W = PLATFORM_HALF_W;
  const y = PLATFORM_Y + 0.006;
  for (const zi of site.islands) {
    for (const [z0, z1] of [[-(W - 1.1), W - 1.1], [W - 0.7, W - 0.14], [-(W - 0.14), -(W - 0.7)]] as const) {
      clinker.gridQuad(new Vector3(p0, y, zi + z0), new Vector3(p0, y, zi + z1), new Vector3(p1, y, zi + z1), new Vector3(p1, y, zi + z0), rgb(0xffffff), 2.5);
    }
  }
  const granite: Paint = (p) => mix(rgb(0x6e6c66), rgb(0x9e9c94), noise3(p.x * 3, p.y * 3, p.z * 3, 1994) * 0.8 + noise3(p.x * 11, p.y * 11, p.z * 11, 1995) * 0.3);
  for (const zi of site.islands) {
    for (const dx of [-65, -59, -50.5, -36.5, -33.5, -21.5, -16, 16, 21.5, 33.5, 36.5, 50.5, 59, 65]) {
      const x = cx + dx;
      if (!site.free(x, 1.2)) continue;
      // Slightly askew, as the slabs lie where they were set down.
      const tilt = (noise3(x, 0, 0, 7) - 0.5) * 0.08;
      s.lit.box({ x: x - 1.05, y: PLATFORM_Y + 0.44, z: zi - 0.36 + tilt }, { x: x + 1.05, y: PLATFORM_Y + 0.64, z: zi + 0.36 + tilt }, granite, [], 0.6);
      for (const lx of [-1, 1]) s.lit.box({ x: x + lx * 0.78 - 0.22, y: PLATFORM_Y, z: zi - 0.32 }, { x: x + lx * 0.78 + 0.22, y: PLATFORM_Y + 0.44, z: zi + 0.32 }, granite, ['py'], 0.6);
      physics.box({ x: x - 1.05, y: PLATFORM_Y, z: zi - 0.4 }, { x: x + 1.05, y: PLATFORM_Y + 0.64, z: zi + 0.4 });
    }
  }
}

// ---------------------------------------------------------------- In the open

/** Where the platform ends and what its roof covers, as the station lays them out (`stationSteps`). */
function openLayout(site: DetailSite): { p0: number; p1: number; spans: ReadonlyArray<readonly [number, number]> } {
  const { def, cx } = site;
  const plans = def.halls ?? [];
  const ends = plans.filter((h) => !h.down).map(hallDir);
  const p0 = ends.includes(-1) ? cx - CAVE_HALF_L : cx - PLATFORM_HALF_L;
  const p1 = ends.includes(1) ? cx + CAVE_HALF_L : cx + PLATFORM_HALF_L;
  const spans = def.canopy?.deck !== undefined ? [[p0, p1] as const] : canopySpans(def.canopy, p0 + 4, p1 - 4, plans[0] ? hallDir(plans[0]) : 1);
  return { p0, p1, spans };
}

/**
 * Along the island's middle, the first of `dxs` (from the station's middle) where something `half` long fits
 * clear of the roof's posts, the lamp posts beyond it, the benches and their bins, the information pillars, the
 * art walk's plaque and windbreaks, and, for something `tall`, of what hangs over the island. Each spot taken is
 * kept clear of the next by `gap`.
 */
function spots(site: DetailSite, dxs: readonly number[], half: number, count: number, tall = false, gap = 2): number[] {
  const { cx, def } = site;
  const { p0, p1, spans } = openLayout(site);
  const lanterns: number[] = [];
  for (let x = p0 + CANOPY.lanternStep / 2; x < p1; x += CANOPY.lanternStep) if (!covered(spans, x, 1)) lanterns.push(x - cx);
  const keep: Array<[number, number]> = [
    ...CANOPY.postXs.map((d) => [d, 0.4] as [number, number]),
    ...lanterns.map((d) => [d, 0.4] as [number, number]),
    ...[-40, -12, 12, 40].map((d) => [d, 0.7] as [number, number]),
    ...[-45, -9, 9, 45].map((d) => [d + 0.35, 1.6] as [number, number]),
    ...[-4.5, 4.5, 24].map((d) => [d, 0.6] as [number, number]),
    ...(def.canopy?.screens !== undefined ? [-36, -22, 22, 36].map((d) => [d, 2.1] as [number, number]) : []),
    ...(tall ? [[-18, 0.5], [18, 0.5], [-42, 0.6], [42, 0.6], [-48, 1.4], [48, 1.4], [-62, 0.5], [62, 0.5], [-6, 0.5], [6, 0.5], [-30, 0.5], [30, 0.5]] as Array<[number, number]> : []),
  ];
  const taken: number[] = [];
  for (const dx of dxs) {
    if (taken.length >= count) break;
    const x = cx + dx;
    if (x - half < p0 + 1 || x + half > p1 - 1 || !site.free(x, half + 0.3)) continue;
    if (keep.some(([c, r]) => Math.abs(dx - c) < half + r)) continue;
    if (taken.some((t) => Math.abs(t - x) < 2 * half + gap)) continue;
    taken.push(x);
  }
  return taken;
}

/** A person in cast metal, `m` placing their feet (facing +x, up +y): standing, or sitting on something at knee height. */
function person(b: MeshBuilder, m: Matrix4, paint: Paint, sitting = false): void {
  const at = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(m);
  const hip = sitting ? 0.46 : 0.88;
  for (const side of [-1, 1]) {
    if (sitting) {
      rod(b, at(0, hip, side * 0.1), at(0.44, hip, side * 0.1), 0.08, 0.07, 6, paint);
      rod(b, at(0.44, hip, side * 0.1), at(0.46, 0, side * 0.1), 0.065, 0.055, 6, paint);
    } else rod(b, at(0, hip, side * 0.1), at(0.02, 0, side * 0.1), 0.08, 0.055, 6, paint);
    rod(b, at(0, hip + 0.55, side * 0.21), at(0.08, hip + 0.02, side * 0.24), 0.05, 0.04, 6, paint);
  }
  rod(b, at(0, hip - 0.04, 0), at(0, hip + 0.6, 0), 0.17, 0.2, 8, paint);
  put(b, new SphereGeometry(0.11, 8, 6), new Matrix4().setPosition(at(0.01, hip + 0.76, 0)), paint);
}

const BRONZE = (p: Vector3): RGB => mix(rgb(0x2e2c28), rgb(0x5a5040), noise3(p.x * 5, p.y * 5, p.z * 5, 31) * 0.7);
const PATINA = (p: Vector3): RGB => mix(rgb(0x2f5a4a), rgb(0x5e8a74), noise3(p.x * 4, p.y * 4, p.z * 4, 32));
const CONCRETE: Paint = (p) => mix(rgb(0x8e8b84), rgb(0xb2aea4), noise3(p.x * 2, p.y * 2, p.z * 2, 33));

/**
 * Högdalen: Birgitta Muhr's "Uppväxter" (2002), three bronze tulips two and a half meters tall, green stems and
 * leaves under glossy red flowers, each in a circle of cobbles on the platform.
 */
function hogdalen(site: DetailSite): void {
  const { s, physics } = site;
  const xs = spots(site, [-58, -50.5, 58, 50.5, -66, 66, -26.5, 26.5, -33, 33], 1.0, 3, true, 5);
  const red = rgb(0xc8261e);
  for (const zi of site.islands) {
    for (const [k, x] of xs.entries()) {
      const z = zi + (k % 2 ? 0.8 : -0.8);
      upright(s.lit, x, z, PLATFORM_Y, PLATFORM_Y + 0.03, 0.95, 0.95, 18, (p) => mix(rgb(0x7a7670), rgb(0xa8a49a), noise3(p.x * 9, 0, p.z * 9, 34)));
      // The stem leans and bends: three bars, thinner toward the flower.
      const lean = k % 2 ? -1 : 1;
      const pts = [new Vector3(x, PLATFORM_Y, z), new Vector3(x + lean * 0.12, PLATFORM_Y + 0.9, z + 0.05), new Vector3(x + lean * 0.35, PLATFORM_Y + 1.8, z + 0.1), new Vector3(x + lean * 0.7, PLATFORM_Y + 2.45, z + 0.12)];
      for (let i = 0; i < 3; i++) rod(s.lit, pts[i], pts[i + 1], 0.07 - i * 0.012, 0.058 - i * 0.012, 7, PATINA);
      // A long leaf up from the foot, a pointed blade.
      const leaf = [new Vector3(x - lean * 0.05, PLATFORM_Y + 0.05, z), new Vector3(x - lean * 0.3, PLATFORM_Y + 0.8, z - 0.02), new Vector3(x - lean * 0.12, PLATFORM_Y + 1.7, z)];
      s.lit.tri(leaf[0], new Vector3(x - lean * 0.45, PLATFORM_Y + 0.7, z + 0.04), leaf[2], PATINA);
      s.lit.tri(leaf[0], leaf[2], leaf[1], PATINA);
      // The flower: a cup of petals, open at the top, three dark stamens in it.
      const top = pts[3];
      put(s.lit, new SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7), new Matrix4().compose(new Vector3(top.x, top.y + 0.42, top.z), new Quaternion(), new Vector3(1, 1.3, 1)), red);
      for (let a = 0; a < 3; a++) {
        const ang = (a / 3) * Math.PI * 2;
        rod(s.lit, new Vector3(top.x, top.y + 0.1, top.z), new Vector3(top.x + Math.cos(ang) * 0.08, top.y + 0.62, top.z + Math.sin(ang) * 0.08), 0.02, 0.035, 5, rgb(0x1e1c1a));
      }
      physics.box({ x: x - 0.25, y: PLATFORM_Y, z: z - 0.25 }, { x: x + 0.25, y: PLATFORM_Y + 2.2, z: z + 0.25 });
    }
  }
}

/**
 * Bandhagen: Freddy Fraek's work (1983): a raw block of pale Öland limestone standing in a frame of dark steel,
 * a low dark wall edged in bronze before it, and his giant copper folding ruler, bent over as it is over the
 * entrance, its numerals in red.
 */
function bandhagen(site: DetailSite): void {
  const { s, physics } = site;
  const [stone, ruler] = [spots(site, [-58, 58, -50.5, 50.5, -26.5, 26.5, -66, 66], 1.6, 1, true), spots(site, [-66, 66, -33, 33, -50.5, 50.5, 26.5], 0.5, 1, true)];
  const steel = rgb(0x2e3032);
  for (const zi of site.islands) {
    for (const x of stone) {
      // The block, a little askew, in its frame.
      put(s.lit, new CylinderGeometry(0.62, 0.7, 1.9, 5), new Matrix4().compose(new Vector3(x, PLATFORM_Y + 0.95, zi), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.12), new Vector3(1, 1, 0.7)), (p) => mix(rgb(0xc8c6bc), rgb(0xe4e2d8), noise3(p.x * 3, p.y * 3, p.z * 3, 35)));
      // A plate behind it and one at an end, a roof over it and a sill under it: open to the rest.
      s.lit.box({ x: x - 0.94, y: PLATFORM_Y, z: zi - 0.8 }, { x: x + 0.94, y: PLATFORM_Y + 2.3, z: zi - 0.74 }, steel);
      const xe = x + Math.sign(x - site.cx || 1) * 0.91;
      s.lit.box({ x: xe - 0.03, y: PLATFORM_Y, z: zi - 0.8 }, { x: xe + 0.03, y: PLATFORM_Y + 2.3, z: zi + 0.78 }, steel);
      s.lit.box({ x: x - 0.94, y: PLATFORM_Y + 2.3, z: zi - 0.8 }, { x: x + 0.94, y: PLATFORM_Y + 2.38, z: zi + 0.78 }, steel);
      s.lit.box({ x: x - 0.94, y: PLATFORM_Y, z: zi - 0.8 }, { x: x + 0.94, y: PLATFORM_Y + 0.08, z: zi + 0.78 }, steel, ['ny']);
      // The low wall, edged in bronze.
      s.lit.box({ x: x - 1.5, y: PLATFORM_Y, z: zi - 1.4 }, { x: x + 1.5, y: PLATFORM_Y + 0.75, z: zi - 1.15 }, rgb(0x3a3c3e));
      s.lit.box({ x: x - 1.52, y: PLATFORM_Y + 0.75, z: zi - 1.42 }, { x: x + 1.52, y: PLATFORM_Y + 0.8, z: zi - 1.13 }, rgb(0x9a7a3a));
      physics.box({ x: x - 0.95, y: PLATFORM_Y, z: zi - 0.8 }, { x: x + 0.95, y: PLATFORM_Y + 2.38, z: zi + 0.8 });
      physics.box({ x: x - 1.52, y: PLATFORM_Y, z: zi - 1.42 }, { x: x + 1.52, y: PLATFORM_Y + 0.8, z: zi - 1.13 });
    }
    for (const [k, x] of ruler.entries()) {
      // Up three and a half meters, over a meter and a half, and down again half a meter: a folding ruler's links.
      const copper = rgb(0x8a5a3a);
      const z = zi + (k ? 1.2 : -1.2);
      const d = k ? -1 : 1;
      const H = PLATFORM_Y + 3.5;
      s.lit.box({ x: x - 0.1, y: PLATFORM_Y, z: z - 0.08 }, { x: x + 0.1, y: H, z: z + 0.08 }, copper);
      s.lit.box({ x: Math.min(x, x + d * 1.6), y: H - 0.2, z: z - 0.08 }, { x: Math.max(x, x + d * 1.6), y: H, z: z + 0.08 }, copper);
      s.lit.box({ x: x + d * 1.6 - 0.1, y: H - 0.7, z: z - 0.08 }, { x: x + d * 1.6 + 0.1, y: H, z: z + 0.08 }, copper);
      // The joints between the links, and the red numerals on the faces.
      for (let y = PLATFORM_Y + 0.5; y < H - 0.3; y += 0.5) for (const f of [-1, 1]) s.lit.box({ x: x - 0.06, y, z: z + f * 0.081 - 0.004 }, { x: x + 0.06, y: y + 0.12, z: z + f * 0.081 + 0.004 }, rgb(0xd0402a));
      for (let y = PLATFORM_Y + 1; y < H; y += 1) s.lit.box({ x: x - 0.105, y: y - 0.01, z: z - 0.085 }, { x: x + 0.105, y: y + 0.01, z: z + 0.085 }, rgb(0x5a3a26));
      physics.box({ x: x - 0.12, y: PLATFORM_Y, z: z - 0.1 }, { x: x + 0.12, y: H, z: z + 0.1 });
    }
  }
}

/**
 * Skogskyrkogården: Hans Bartos' carved pine furniture (1975), two big throne-like armchairs facing each other
 * across a low table, beside the pines of the Woodland Cemetery.
 */
function skogskyrkogarden(site: DetailSite): void {
  const { s, physics } = site;
  const pine: Paint = (p) => mix(rgb(0xa8642c), rgb(0xd09050), noise3(p.x * 2, p.y * 9, p.z * 2, 36));
  for (const zi of site.islands) {
    for (const x of spots(site, [-26.5, 26.5, -50.5, 50.5, -58, 58, -14.8, 14.8], 2.6, 1)) {
      // The table between them.
      s.lit.box({ x: x - 0.55, y: PLATFORM_Y, z: zi - 0.4 }, { x: x + 0.55, y: PLATFORM_Y + 0.28, z: zi + 0.4 }, pine);
      s.lit.box({ x: x - 0.75, y: PLATFORM_Y + 0.28, z: zi - 0.55 }, { x: x + 0.75, y: PLATFORM_Y + 0.5, z: zi + 0.55 }, pine);
      for (const side of [-1, 1]) {
        // An armchair: a thick seat, arms of solid timber and a tall back, cut from whole logs.
        const c = x + side * 1.75;
        const back = c + side * 0.55;
        s.lit.box({ x: c - 0.5, y: PLATFORM_Y, z: zi - 0.55 }, { x: c + 0.5, y: PLATFORM_Y + 0.5, z: zi + 0.55 }, pine);
        for (const dz of [-0.55, 0.4]) s.lit.box({ x: c - 0.5, y: PLATFORM_Y + 0.5, z: zi + dz }, { x: c + 0.5, y: PLATFORM_Y + 0.85, z: zi + dz + 0.15 }, pine);
        s.lit.box({ x: Math.min(back, back + side * 0.3), y: PLATFORM_Y, z: zi - 0.6 }, { x: Math.max(back, back + side * 0.3), y: PLATFORM_Y + 1.75, z: zi + 0.6 }, pine);
        physics.box({ x: Math.min(c - 0.5, back + side * 0.3), y: PLATFORM_Y, z: zi - 0.6 }, { x: Math.max(c + 0.5, back + side * 0.3), y: PLATFORM_Y + 1.75, z: zi + 0.6 });
      }
      physics.box({ x: x - 0.75, y: PLATFORM_Y, z: zi - 0.55 }, { x: x + 0.75, y: PLATFORM_Y + 0.5, z: zi + 0.55 });
    }
  }
}

/**
 * Hökarängen: Hanns Karlewski's panels (1995), a row of big lacquered metal boards down the platform under the
 * roof, each in two colours side by side: blue and orange, yellow and blue, red and teal, green, purple and yellow.
 */
function hokarangen(site: DetailSite): void {
  const { s, physics } = site;
  const { spans } = openLayout(site);
  const pairs = [[0x1f8fc0, 0xe8741a], [0xf2c830, 0x2a5ab0], [0xd0302a, 0x1f9a9a], [0x3aa048, 0x7ac040], [0x6a3a9a, 0xf2d040]];
  const candidates: number[] = [];
  for (let dx = -66; dx <= 66; dx += 3) candidates.push(dx);
  const xs = spots(site, candidates, 0.2, 14, true, 5).filter((x) => covered(spans, x, 0.2));
  for (const zi of site.islands) {
    for (const [k, x] of xs.entries()) {
      const [a, b] = pairs[k % pairs.length].map(rgb);
      const y0 = PLATFORM_Y + 1.0, y1 = PLATFORM_Y + 2.7;
      s.lit.box({ x: x - 0.03, y: y0, z: zi - 0.7 }, { x: x + 0.03, y: y1, z: zi }, a, [], 1);
      s.lit.box({ x: x - 0.03, y: y0, z: zi }, { x: x + 0.03, y: y1, z: zi + 0.7 }, b, [], 1);
      // On two legs from the platform.
      for (const dz of [-0.62, 0.62]) s.lit.box({ x: x - 0.03, y: PLATFORM_Y, z: zi + dz - 0.03 }, { x: x + 0.03, y: y0, z: zi + dz + 0.03 }, rgb(0x3a3d40));
      physics.box({ x: x - 0.06, y: PLATFORM_Y, z: zi - 0.72 }, { x: x + 0.06, y: y1, z: zi + 0.72 });
    }
  }
}

/**
 * Kärrtorp: Björn Olsén's "Ljuslådor med hemliga tecken" (1994), light boxes on posts, rounded frames of metal
 * round glowing glass, each with a secret sign drawn on it.
 */
function karrtorp(site: DetailSite): void {
  const { s, physics } = site;
  const glows = [0xe8f0c8, 0xf2e0b0, 0xd0e8f0, 0xe0f0d8].map(rgb);
  const ink = [0x2a8a5a, 0x3a5ab0, 0xc0502a, 0x6a3a9a].map(rgb);
  const xs = spots(site, [-58, 58, -50.5, 50.5, -33, 33, -26.5, 26.5, -66, 66, -15, 15], 0.45, 4, false, 6);
  for (const zi of site.islands) {
    for (const [k, x] of xs.entries()) {
      const y0 = PLATFORM_Y + 1.25, y1 = PLATFORM_Y + 2.35;
      s.lit.box({ x: x - 0.25, y: PLATFORM_Y, z: zi - 0.25 }, { x: x + 0.25, y: PLATFORM_Y + 0.3, z: zi + 0.25 }, CONCRETE);
      s.lit.box({ x: x - 0.05, y: PLATFORM_Y + 0.3, z: zi - 0.05 }, { x: x + 0.05, y: y0, z: zi + 0.05 }, rgb(0x9a9ea2));
      // The frame, thick round its glass on both faces.
      s.lit.box({ x: x - 0.12, y: y0 - 0.06, z: zi - 0.38 }, { x: x + 0.12, y: y1 + 0.06, z: zi + 0.38 }, rgb(0xb4b8bc), ['px', 'nx']);
      for (const f of [-1, 1]) {
        const fx = x + f * 0.125;
        s.lit.box({ x: Math.min(fx, fx + f * 0.02), y: y0 - 0.06, z: zi - 0.38 }, { x: Math.max(fx, fx + f * 0.02), y: y1 + 0.06, z: zi - 0.28 }, rgb(0xb4b8bc));
        s.lit.box({ x: Math.min(fx, fx + f * 0.02), y: y0 - 0.06, z: zi + 0.28 }, { x: Math.max(fx, fx + f * 0.02), y: y1 + 0.06, z: zi + 0.38 }, rgb(0xb4b8bc));
        s.unlit.quad(new Vector3(fx, y0, zi - 0.28), new Vector3(fx, y0, zi + 0.28), new Vector3(fx, y1, zi + 0.28), new Vector3(fx, y1, zi - 0.28), glows[k % glows.length]);
        // The sign: three strokes, a hook, a bar and a tail, different on every box.
        const r = mulberry32(1994 + k * 7 + (f > 0 ? 1 : 0));
        const gx = fx + f * 0.005;
        let py = y0 + 0.2 + r() * 0.2, pz = zi + (r() - 0.5) * 0.3;
        for (let n = 0; n < 3; n++) {
          const ny = Math.min(y1 - 0.12, Math.max(y0 + 0.12, py + (r() - 0.3) * 0.5)), nz = Math.min(0.2, Math.max(-0.2, pz - zi + (r() - 0.5) * 0.35)) + zi;
          const len = Math.hypot(ny - py, nz - pz) || 1;
          const oy = ((nz - pz) / len) * 0.04, oz = (-(ny - py) / len) * 0.04;
          s.unlit.quad(new Vector3(gx, py - oy, pz - oz), new Vector3(gx, ny - oy, nz - oz), new Vector3(gx, ny + oy, nz + oz), new Vector3(gx, py + oy, pz + oz), ink[(k + n) % ink.length]);
          py = ny; pz = nz;
        }
      }
      s.light(x, (y0 + y1) / 2, zi, glows[k % glows.length], 0.3, 3);
      physics.box({ x: x - 0.25, y: PLATFORM_Y, z: zi - 0.4 }, { x: x + 0.25, y: y1 + 0.06, z: zi + 0.4 });
    }
  }
}

/**
 * Globen: Joanna Troikowicz' "Isfantasi" (1989), a long fence of cast white concrete panels in a rough, frozen
 * relief along Palmfeltsvägen, set with sections of green corrugated sheet, just beyond the tracks.
 */
function globen(site: DetailSite): void {
  const { s, cx } = site;
  // On the side away from the rock cutting.
  const side = site.def.canopy?.cutting?.side ? -site.def.canopy.cutting.side : -1;
  const z0 = side * (OPEN.fenceZ + 0.5);
  const ice: Paint = (p) => {
    const n = noise3(p.x * 1.6, p.y * 1.6, 0, 37);
    const ridge = 1 - Math.abs(noise3(p.x * 0.9, p.y * 2.2, 0, 38) - 0.5) * 2;
    return mix(rgb(0xc4c8ca), rgb(0xfafcfc), n * 0.5 + ridge ** 3 * 0.5);
  };
  const rnd = mulberry32(1989);
  for (let k = 0, x = cx - 72; x < cx + 70; k++, x += 2.6) {
    const green = k % 4 === 3;
    const h = green ? 1.9 : 2.3 + (k % 3) * 0.15;
    s.lit.box({ x, y: -0.3, z: Math.min(z0, z0 + side * 0.18) }, { x: x + 2.5, y: h, z: Math.max(z0, z0 + side * 0.18) }, green ? (p) => (Math.floor(p.x * 8) % 2 ? rgb(0x3a7a4a) : rgb(0x2e6a3e)) : ice, [side > 0 ? 'pz' : 'nz', 'ny'], 0.5);
    if (green) continue;
    // The frozen relief: slabs of ice standing out of the panel's face at odd heights.
    for (let i = 0; i < 4; i++) {
      const a = x + 0.1 + rnd() * 2.0, w = 0.2 + rnd() * 0.4, y0 = rnd() * 1.2, y1 = Math.min(h - 0.1, y0 + 0.5 + rnd() * 1.2);
      s.lit.box({ x: a, y: y0, z: Math.min(z0, z0 - side * (0.08 + rnd() * 0.1)) }, { x: Math.min(x + 2.45, a + w), y: y1, z: Math.max(z0, z0 - side * 0.08) }, ice, [side > 0 ? 'pz' : 'nz'], 1);
    }
  }
}

/**
 * Thorildsplan: the 8-bit tiles of Lars Arrhenius (2008), a tile to a pixel, here on the concrete walls of the
 * cutting the station lies in (the real ones are in its underpass and stairs), on the side away from its hall.
 */
function thorildsplan(site: DetailSite): void {
  const { s, cx, def } = site;
  const cut = def.canopy?.cutting;
  if (!cut || cut.kind !== 'concrete') return;
  const main = def.halls?.[0];
  // The side the hall's stairs come up on has a square instead of wall.
  const side = main?.down ? (main.beside === 1 ? -1 : 1) : 1;
  for (const z of cut.side ? [cut.side] : [-side]) {
    const zf = z * (OPEN.fenceZ + CANOPY.cutGap - 0.02);
    const b = s.artLayer(pixelTilesTexture());
    b.gridQuad(new Vector3(cx - 70, 0, zf), new Vector3(cx + 70, 0, zf), new Vector3(cx + 70, 3.6, zf), new Vector3(cx - 70, 3.6, zf), rgb(0xffffff), 4);
  }
}

/**
 * Kristineberg: Carina Wallert's "Resande med djur" (1991), dark bronze travellers with their animals on low
 * concrete plinths: a woman sitting with a dog lying at her feet, and a man standing with a bird on his arm.
 */
function kristineberg(site: DetailSite): void {
  const { s, physics } = site;
  const xs = spots(site, [-26.5, 26.5, -50.5, 50.5, -58, 58, -15, 15], 1.1, 2, false, 6);
  for (const zi of site.islands) {
    for (const [k, x] of xs.entries()) {
      s.lit.box({ x: x - 1.0, y: PLATFORM_Y, z: zi - 0.55 }, { x: x + 1.0, y: PLATFORM_Y + 0.35, z: zi + 0.55 }, CONCRETE);
      const base = PLATFORM_Y + 0.35;
      if (k === 0) {
        s.lit.box({ x: x - 0.55, y: base, z: zi - 0.25 }, { x: x - 0.1, y: base + 0.42, z: zi + 0.25 }, CONCRETE);
        person(s.lit, new Matrix4().setPosition(x - 0.35, base, zi), BRONZE, true);
        // The dog: a long body, head up, lying at her feet.
        rod(s.lit, new Vector3(x + 0.15, base + 0.16, zi + 0.2), new Vector3(x + 0.85, base + 0.16, zi + 0.2), 0.13, 0.11, 8, BRONZE);
        rod(s.lit, new Vector3(x + 0.85, base + 0.18, zi + 0.2), new Vector3(x + 0.98, base + 0.42, zi + 0.2), 0.07, 0.06, 6, BRONZE);
        rod(s.lit, new Vector3(x + 0.98, base + 0.42, zi + 0.2), new Vector3(x + 1.12, base + 0.38, zi + 0.2), 0.06, 0.03, 6, BRONZE);
      } else {
        person(s.lit, new Matrix4().makeRotationY(Math.PI).setPosition(x, base, zi), BRONZE);
        put(s.lit, new SphereGeometry(0.1, 8, 6), new Matrix4().compose(new Vector3(x - 0.25, base + 1.35, zi - 0.3), new Quaternion(), new Vector3(1.6, 0.8, 0.8)), BRONZE);
      }
      physics.box({ x: x - 1.0, y: PLATFORM_Y, z: zi - 0.55 }, { x: x + 1.0, y: PLATFORM_Y + 1.9, z: zi + 0.55 });
    }
  }
}

/**
 * Sockenplan: Sture Collin's "Dårarnas båt" (1990), a boat of raw concrete topped with grey cobbles, crowded with
 * small dark bronze figures, and beside it a rough granite block on a stone post.
 */
function sockenplan(site: DetailSite): void {
  const { s, physics } = site;
  for (const zi of site.islands) {
    for (const x of spots(site, [-50.5, 50.5, -58, 58, -26.5, 26.5], 2.6, 1)) {
      // The hull: a long box narrowing to a stem at each end.
      const hull = new CylinderGeometry(0.75, 0.55, 4.4, 8, 1);
      put(s.lit, hull, new Matrix4().compose(new Vector3(x - 0.4, PLATFORM_Y + 0.55, zi), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2), new Vector3(1, 1, 0.8)), CONCRETE);
      s.lit.box({ x: x - 2.2, y: PLATFORM_Y + 1.05, z: zi - 0.45 }, { x: x + 1.4, y: PLATFORM_Y + 1.15, z: zi + 0.45 }, (p) => mix(rgb(0x6a6864), rgb(0x9a9890), noise3(p.x * 8, 0, p.z * 8, 39)));
      const rnd = mulberry32(1990);
      for (let k = 0; k < 7; k++) {
        const fx = x - 2 + k * 0.5, fz = zi + (rnd() - 0.5) * 0.5;
        const m = new Matrix4().compose(new Vector3(fx, PLATFORM_Y + 1.15, fz), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rnd() * Math.PI * 2), new Vector3(0.4, 0.4, 0.4));
        person(s.lit, m, BRONZE);
      }
      // The granite block on its post.
      s.lit.box({ x: x + 2.0, y: PLATFORM_Y, z: zi - 0.15 }, { x: x + 2.3, y: PLATFORM_Y + 1.3, z: zi + 0.15 }, CONCRETE);
      put(s.lit, new CylinderGeometry(0.4, 0.45, 0.6, 5), new Matrix4().setPosition(x + 2.15, PLATFORM_Y + 1.6, zi), (p) => mix(rgb(0x6e6a64), rgb(0x9a968e), noise3(p.x * 4, p.y * 4, p.z * 4, 40)));
      physics.box({ x: x - 2.6, y: PLATFORM_Y, z: zi - 0.62 }, { x: x + 1.8, y: PLATFORM_Y + 1.5, z: zi + 0.62 });
      physics.box({ x: x + 1.7, y: PLATFORM_Y, z: zi - 0.45 }, { x: x + 2.6, y: PLATFORM_Y + 1.9, z: zi + 0.45 });
    }
  }
}

/** Svedmyra: Torgny Larsson's bronze (1991), a tall green spindle like a leaf bud about to open. */
function svedmyra(site: DetailSite): void {
  const { s, physics } = site;
  for (const zi of site.islands) {
    for (const x of spots(site, [-26.5, 26.5, -50.5, 50.5, -33, 33], 0.5, 1, true)) {
      s.lit.box({ x: x - 0.35, y: PLATFORM_Y, z: zi - 0.35 }, { x: x + 0.35, y: PLATFORM_Y + 0.25, z: zi + 0.35 }, CONCRETE);
      upright(s.lit, x, zi, PLATFORM_Y + 0.25, PLATFORM_Y + 1.1, 0.05, 0.26, 12, PATINA);
      upright(s.lit, x, zi, PLATFORM_Y + 1.1, PLATFORM_Y + 2.8, 0.26, 0.02, 12, PATINA);
      physics.box({ x: x - 0.35, y: PLATFORM_Y, z: zi - 0.35 }, { x: x + 0.35, y: PLATFORM_Y + 2.8, z: zi + 0.35 });
    }
  }
}

/** Stureby: Carin Ellberg's bronze (2012), a tall green figure twisting up like a tree, holding up two lamps. */
function stureby(site: DetailSite): void {
  const { s, physics } = site;
  for (const zi of site.islands) {
    for (const x of spots(site, [-26.5, 26.5, -50.5, 50.5, -33, 33], 0.6, 1, true)) {
      const pts = [new Vector3(x, PLATFORM_Y, zi), new Vector3(x + 0.15, PLATFORM_Y + 0.9, zi - 0.1), new Vector3(x - 0.1, PLATFORM_Y + 1.8, zi + 0.12), new Vector3(x + 0.05, PLATFORM_Y + 2.4, zi)];
      for (let i = 0; i < 3; i++) rod(s.lit, pts[i], pts[i + 1], 0.16 - i * 0.04, 0.12 - i * 0.03, 8, PATINA);
      for (const d of [-1, 1]) {
        const hand = new Vector3(x + d * 0.45, PLATFORM_Y + 3.0, zi + d * 0.15);
        rod(s.lit, pts[3], hand, 0.07, 0.05, 6, PATINA);
        put(s.unlit, new SphereGeometry(0.14, 10, 8), new Matrix4().setPosition(hand.x, hand.y + 0.12, hand.z), rgb(0xfff0c8));
        s.light(hand.x, hand.y + 0.1, hand.z, warmLamp, 0.3, 4);
      }
      physics.box({ x: x - 0.3, y: PLATFORM_Y, z: zi - 0.3 }, { x: x + 0.3, y: PLATFORM_Y + 2.5, z: zi + 0.3 });
    }
  }
}

/** Rågsved: Björn Selder's "Fågel grön" (1983), a dark bronze bird of fat rounded lobes high on a pole. */
function ragsved(site: DetailSite): void {
  const { s, physics } = site;
  const { spans } = openLayout(site);
  for (const zi of site.islands) {
    const x = spots(site, [-58, 58, -66, 66, -50.5, 50.5, -26.5, 26.5], 0.8, 8, true).find((c) => !covered(spans, c, 1.5));
    if (x === undefined) continue;
    const top = PLATFORM_Y + 5.2;
    upright(s.lit, x, zi, PLATFORM_Y, top, 0.07, 0.06, 8, rgb(0x3a3c3e));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      put(s.lit, new SphereGeometry(0.45, 10, 8), new Matrix4().compose(new Vector3(x + Math.cos(a) * 0.5, top + 0.3 + (k % 2) * 0.2, zi + Math.sin(a) * 0.5), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -a), new Vector3(1.5, 0.75, 0.9)), BRONZE);
    }
    physics.box({ x: x - 0.1, y: PLATFORM_Y, z: zi - 0.1 }, { x: x + 0.1, y: top, z: zi + 0.1 });
  }
}

/** Björkhagen: Lenka Jonesson's work (1991), open cubes of rusty steel, each holding birch trunks set diagonally. */
function bjorkhagen(site: DetailSite): void {
  const { s, physics } = site;
  const rust: Paint = (p) => mix(rgb(0x5a2c16), rgb(0x8a4a26), noise3(p.x * 6, p.y * 6, p.z * 6, 41));
  const birch: Paint = (p) => (noise3(p.x * 3, p.y * 7, p.z * 3, 42) > 0.72 ? rgb(0x2a2826) : rgb(0xe8e4da));
  for (const zi of site.islands) {
    for (const x of spots(site, [-26.5, 26.5, -50.5, 50.5, -58, 58, -33, 33], 0.8, 2, false, 8)) {
      const H = 0.65, y0 = PLATFORM_Y + 0.3;
      s.lit.box({ x: x - 0.75, y: PLATFORM_Y, z: zi - 0.75 }, { x: x + 0.75, y: y0, z: zi + 0.75 }, CONCRETE);
      // The twelve edges of the cube.
      for (const a of [-1, 1]) for (const b of [-1, 1]) {
        s.lit.box({ x: x + a * H - 0.03, y: y0, z: zi + b * H - 0.03 }, { x: x + a * H + 0.03, y: y0 + 2 * H, z: zi + b * H + 0.03 }, rust);
        for (const y of [y0, y0 + 2 * H]) {
          s.lit.box({ x: x - H, y, z: zi + b * H - 0.03 }, { x: x + H, y: y + 0.06, z: zi + b * H + 0.03 }, rust);
          s.lit.box({ x: x + a * H - 0.03, y, z: zi - H }, { x: x + a * H + 0.03, y: y + 0.06, z: zi + H }, rust);
        }
      }
      for (const d of [-0.3, 0, 0.3]) rod(s.lit, new Vector3(x - H + 0.05, y0 + 0.08, zi + d), new Vector3(x + H - 0.05, y0 + 2 * H - 0.05, zi + d * 0.6), 0.08, 0.06, 8, birch);
      physics.box({ x: x - 0.75, y: PLATFORM_Y, z: zi - 0.75 }, { x: x + 0.75, y: y0 + 2 * H + 0.06, z: zi + 0.75 });
    }
  }
}

/** Gubbängen: Ragnhild Alexandersson's "Väktare" (1994), two tall slender bronze guardians, forked at the top like long ears. */
function gubbangen(site: DetailSite): void {
  const { s, physics } = site;
  for (const zi of site.islands) {
    for (const x of spots(site, [-26.5, 26.5, -50.5, 50.5, -33, 33, -58, 58], 0.4, 2, true, 6)) {
      s.lit.box({ x: x - 0.3, y: PLATFORM_Y, z: zi - 0.3 }, { x: x + 0.3, y: PLATFORM_Y + 0.4, z: zi + 0.3 }, CONCRETE);
      const neck = new Vector3(x, PLATFORM_Y + 2.6, zi);
      rod(s.lit, new Vector3(x, PLATFORM_Y + 0.4, zi), neck, 0.11, 0.06, 8, BRONZE);
      for (const d of [-1, 1]) rod(s.lit, neck, new Vector3(x + d * 0.08, PLATFORM_Y + 3.3, zi + d * 0.2), 0.05, 0.02, 6, BRONZE);
      physics.box({ x: x - 0.3, y: PLATFORM_Y, z: zi - 0.3 }, { x: x + 0.3, y: PLATFORM_Y + 2.6, z: zi + 0.3 });
    }
  }
}

/**
 * Enskede gård: Maria Miesenberger's "Ögonblick i rörelse" (2012), life-size figures cast in aluminium hanging and
 * falling under the roof, high over the heads of the passengers.
 */
function enskedeGard(site: DetailSite): void {
  const { s } = site;
  const { spans } = openLayout(site);
  const metal: Paint = (_p, n) => mix(rgb(0x8a8e92), rgb(0xd8dce0), 0.5 + n.y * 0.4);
  for (const zi of site.islands) {
    const xs = spots(site, [-26.5, 26.5, -15, 15, -33, 33, -52, 52, -3, 3], 1.0, 4, true, 6).filter((x) => covered(spans, x, 1));
    for (const [k, x] of xs.entries()) {
      // Each in its own fall: lying out flat, head down, or turning.
      const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), [Math.PI / 2, Math.PI * 0.8, -Math.PI / 2.4, Math.PI][k % 4]);
      const m = new Matrix4().compose(new Vector3(x, PLATFORM_Y + 3.0 + (k % 2) * 0.3, zi + (k % 2 ? 0.5 : -0.5)), turn, new Vector3(1, 1, 1));
      person(s.lit, m, metal);
    }
  }
}

/** Skärmarbrink: Carl Magnus' bronzes (1990), open angular frames of square bronze bars, a Z and a triangle, on concrete plinths. */
function skarmarbrink(site: DetailSite): void {
  const { s, physics } = site;
  for (const zi of site.islands) {
    for (const [k, x] of spots(site, [-26.5, 26.5, -50.5, 50.5, -33, 33, -58, 58], 0.7, 2, false, 6).entries()) {
      s.lit.box({ x: x - 0.6, y: PLATFORM_Y, z: zi - 0.4 }, { x: x + 0.6, y: PLATFORM_Y + 0.4, z: zi + 0.4 }, CONCRETE);
      const y = PLATFORM_Y + 0.4;
      const pts = k % 2
        ? [new Vector3(x - 0.5, y, zi), new Vector3(x + 0.5, y, zi), new Vector3(x, y + 1.6, zi), new Vector3(x - 0.5, y, zi)]
        : [new Vector3(x - 0.5, y + 1.5, zi), new Vector3(x + 0.5, y + 1.5, zi), new Vector3(x - 0.5, y, zi), new Vector3(x + 0.5, y, zi)];
      for (let i = 0; i < 3; i++) rod(s.lit, pts[i], pts[i + 1], 0.05, 0.05, 4, BRONZE);
      physics.box({ x: x - 0.6, y: PLATFORM_Y, z: zi - 0.4 }, { x: x + 0.6, y: y + 1.6, z: zi + 0.4 });
    }
  }
}

/** The green line's stations' own objects on the platform, by station name, after the real stations. */
export const GREEN_DETAILS: Record<string, Detail> = {
  'S:t Eriksplan': stEriksplan,
  Odenplan: odenplan,
  Rådmansgatan: radmansgatan,
  Hötorget: hotorget,
  Medborgarplatsen: medborgarplatsen,
  Skanstull: skanstull,
  Fridhemsplan: fridhemsplan,
  Bagarmossen: bagarmossen,
  Skarpnäck: skarpnack,
  Högdalen: hogdalen,
  Bandhagen: bandhagen,
  Skogskyrkogården: skogskyrkogarden,
  Hökarängen: hokarangen,
  Kärrtorp: karrtorp,
  Globen: globen,
  Thorildsplan: thorildsplan,
  Kristineberg: kristineberg,
  Sockenplan: sockenplan,
  Svedmyra: svedmyra,
  Stureby: stureby,
  Rågsved: ragsved,
  Björkhagen: bjorkhagen,
  Gubbängen: gubbangen,
  'Enskede gård': enskedeGard,
  Skärmarbrink: skarmarbrink,
};
