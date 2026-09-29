import { BoxGeometry, CylinderGeometry, Euler, LatheGeometry, Matrix4, Quaternion, Vector2, Vector3, type BufferGeometry } from 'three';
import { KUNGS_FLOOR, kungsFloorTexture } from '../../gfx/art/blue';
import type { MeshBuilder, Paint } from '../../gfx/builder';
import { mix, rgb, type RGB } from '../../gfx/color';
import { cloudCubeTexture } from '../../gfx/stationArt';
import { CANOPY, PLATFORM_HALF_L, PLATFORM_HALF_W, PLATFORM_Y, STATION_DESIGN } from '../../layout';
import type { Detail, DetailSite } from './types';

/** Where the columns of a single-vault station stand along the island: clear of benches, pillars, signs and displays. */
const COLUMN_XS = CANOPY.postXs;
/** A Y column's fork, and where its arms meet the lamp troughs. */
const FORK_Y = 3.0;
const ARM_TOP = STATION_DESIGN.lightingY + 0.2;
/** A duct along the crown of the vault: its axis. */
const DUCT_Y = 5.7;
/** The part of the island's width laid with its own floor, inside the tactile strips. */
const FLOOR_HALF = PLATFORM_HALF_W - 1.1;

/** A three.js geometry placed, painted and freed. */
function solid(b: MeshBuilder, geo: BufferGeometry, matrix: Matrix4, paint: Paint): void {
  b.geometry(geo, matrix, paint);
  geo.dispose();
}

const place = (x: number, y: number, z: number, rotation = new Euler(), scale = new Vector3(1, 1, 1)) =>
  new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(rotation), scale);

/** A box in its own frame, placed by `m`, each face painted by its own (local) normal. */
function faceBox(b: MeshBuilder, m: Matrix4, min: Vector3, max: Vector3, paint: (nx: number, ny: number, nz: number) => RGB): void {
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(m);
  const [x0, y0, z0, x1, y1, z1] = [min.x, min.y, min.z, max.x, max.y, max.z];
  b.quad(v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), v(x1, y0, z1), paint(1, 0, 0));
  b.quad(v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0), paint(-1, 0, 0));
  b.quad(v(x0, y1, z0), v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0), paint(0, 1, 0));
  b.quad(v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1), paint(0, -1, 0));
  b.quad(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1), paint(0, 0, 1));
  b.quad(v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0), v(x1, y0, z0), paint(0, 0, -1));
}

/** The stretches of the platform that are free for things laid on the floor, in steps of a meter. */
function freeSpans(site: DetailSite): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const x0 = site.cx - PLATFORM_HALF_L + 0.5, x1 = site.cx + PLATFORM_HALF_L - 0.5;
  let from: number | null = null;
  for (let x = x0; x <= x1; x += 1) {
    const ok = site.free(x + 0.5, 0.5) && x + 1 <= x1;
    if (ok && from === null) from = x;
    if (!ok && from !== null) { spans.push([from, x]); from = null; }
  }
  if (from !== null) spans.push([from, x1]);
  return spans;
}

/** A duct along the crown of the vault, the length of the platform. */
function duct(site: DetailSite, z: number, y: number, radius: number, color: RGB): void {
  const len = PLATFORM_HALF_L * 2;
  solid(site.s.lit, new CylinderGeometry(radius, radius, len, 14, Math.ceil(len / 3), true), place(site.cx, y, z, new Euler(0, 0, Math.PI / 2)), color);
}

/**
 * Columns down the middle of the island, as in the single-vault stations of
 * 1985: a post forking into a Y whose arms carry the lamp troughs, and with
 * `stem` the post going on up to the duct.
 */
function yColumns(site: DetailSite, color: RGB, stem: boolean): void {
  const { s, physics, cx, islands, free } = site;
  const rise = ARM_TOP - FORK_Y, reach = STATION_DESIGN.lightingZ;
  const arm = Math.hypot(rise, reach), tilt = Math.atan2(reach, rise);
  for (const zi of islands) for (const dx of COLUMN_XS) {
    const x = cx + dx;
    if (!free(x, 0.5)) continue;
    s.lit.box({ x: x - 0.11, y: PLATFORM_Y, z: zi - 0.11 }, { x: x + 0.11, y: stem ? DUCT_Y : FORK_Y + 0.1, z: zi + 0.11 }, color, [], 1);
    for (const side of [-1, 1]) {
      solid(s.lit, new BoxGeometry(0.16, arm, 0.16), place(x, FORK_Y + rise / 2, zi + side * reach / 2, new Euler(side * tilt, 0, 0)), color);
    }
    physics.box({ x: x - 0.15, y: PLATFORM_Y, z: zi - 0.15 }, { x: x + 0.15, y: FORK_Y + 0.4, z: zi + 0.15 });
  }
}

/** Plain columns straight up to the duct, as at Duvbo. */
function posts(site: DetailSite, color: RGB): void {
  const { s, physics, cx, islands, free } = site;
  for (const zi of islands) for (const dx of COLUMN_XS) {
    const x = cx + dx;
    if (!free(x, 0.5)) continue;
    s.lit.box({ x: x - 0.12, y: PLATFORM_Y, z: zi - 0.12 }, { x: x + 0.12, y: DUCT_Y, z: zi + 0.12 }, color, [], 1);
    // A strut from the post out to each lamp trough.
    for (const side of [-1, 1]) {
      const reach = STATION_DESIGN.lightingZ, rise = DUCT_Y - 0.3 - (STATION_DESIGN.lightingY + 0.2);
      solid(s.lit, new BoxGeometry(0.1, Math.hypot(rise, reach), 0.1), place(x, STATION_DESIGN.lightingY + 0.2 + rise / 2, zi + side * reach / 2, new Euler(-side * Math.atan2(reach, rise), 0, 0)), color);
    }
    physics.box({ x: x - 0.16, y: PLATFORM_Y, z: zi - 0.16 }, { x: x + 0.16, y: FORK_Y, z: zi + 0.16 });
  }
}

/** Strips laid on the floor across the island (at `z0` to `z1` from its middle), wherever it is free. */
function floorStrips(site: DetailSite, bands: Array<[number, number]>, color: RGB): void {
  const y = PLATFORM_Y + 0.005;
  for (const zi of site.islands) for (const [a, b] of freeSpans(site)) {
    for (const [z0, z1] of bands) site.s.lit.box({ x: a, y: y - 0.004, z: zi + z0 }, { x: b, y, z: zi + z1 }, color, ['ny', 'px', 'nx', 'pz', 'nz']);
  }
}

// ---------------------------------------------------------------- the stations

/** Kungsträdgården: the parterre floor, green crossed by red and white on the diagonal. */
const kungstradgarden: Detail = (site) => {
  const art = site.s.artLayer(kungsFloorTexture());
  const y = PLATFORM_Y + 0.004;
  for (const zi of site.islands) for (const [a, b] of freeSpans(site)) {
    const uv = (x: number, z: number): [number, number] => [(x - site.cx) / KUNGS_FLOOR, (z - zi + PLATFORM_HALF_W) / (PLATFORM_HALF_W * 2)];
    const corner = (x: number, z: number) => new Vector3(x, y, z);
    // In pieces a few meters long, so the baked light has vertices to land on.
    for (let x = a; x < b; x += 3) {
      const x1 = Math.min(b, x + 3);
      for (const [z0, z1] of [[zi - FLOOR_HALF, zi], [zi, zi + FLOOR_HALF]]) {
        art.tri(corner(x, z0), corner(x, z1), corner(x1, z1), rgb(0xffffff), { uvs: [uv(x, z0), uv(x, z1), uv(x1, z1)] });
        art.tri(corner(x, z0), corner(x1, z1), corner(x1, z0), rgb(0xffffff), { uvs: [uv(x, z0), uv(x1, z1), uv(x1, z0)] });
      }
    }
  }
};

/** Rådhuset: the stepped stone drum of a chimney foundation round the middle pier, and hay measures in concrete. */
const radhuset: Detail = ({ s, physics, cx, free }) => {
  if (free(cx, 2.6)) {
    // A plinth of three steps, then the drum itself in courses of stone, and a cornice.
    const courses = (p: Vector3) => mix(rgb(0x938b7e), rgb(0x6e675e), (Math.floor((p.y - PLATFORM_Y) / 0.2) % 2) * 0.35 + Math.abs(Math.sin(p.x * 3.3 + p.z * 2.1)) * 0.15);
    let y = PLATFORM_Y;
    for (const [r, h] of [[2.5, 0.2], [2.35, 0.2], [2.2, 0.2], [2.05, 1.6], [2.18, 0.16], [2.0, 0.24]]) {
      solid(s.lit, new CylinderGeometry(r, r, h, 32, Math.max(1, Math.round(h / 0.2))), place(cx, y + h / 2, 0), courses);
      y += h;
    }
    physics.box({ x: cx - 2.5, y: PLATFORM_Y, z: -2.5 }, { x: cx + 2.5, y, z: 2.5 });
  }
  // The "parmar": boxes of planks (cast in concrete) with hay spilling out of the top.
  for (const dx of [-20, 20]) {
    const x = cx + dx;
    if (!free(x, 1)) continue;
    for (let k = 0; k < 5; k++) {
      const y = PLATFORM_Y + k * 0.2, inset = k % 2 ? 0.02 : 0;
      s.lit.box({ x: x - 0.65 + inset, y, z: -0.55 + inset }, { x: x + 0.65 - inset, y: y + 0.19, z: 0.55 - inset }, k % 2 ? rgb(0x8a7a62) : rgb(0x9a8a70), [], 1);
    }
    for (let k = 0; k < 9; k++) {
      const hx = x - 0.5 + (k % 3) * 0.5, hz = -0.35 + Math.floor(k / 3) * 0.35;
      solid(s.lit, new CylinderGeometry(0.02, 0.2, 0.3 + (k % 2) * 0.15, 6), place(hx, PLATFORM_Y + 1.1, hz, new Euler((k % 3 - 1) * 0.3, 0, (k % 2 - 0.5) * 0.4)), rgb(0xc8b060));
    }
    physics.box({ x: x - 0.7, y: PLATFORM_Y, z: -0.6 }, { x: x + 0.7, y: PLATFORM_Y + 1.1, z: 0.6 });
  }
};

/** Fridhemsplan: a Blekinge boat under its red-brown sail in a glass showcase over blue wave tiles. */
const fridhemsplan: Detail = ({ s, physics, cx, exitDir, free }) => {
  const bx = cx - exitDir * 18;
  if (!free(bx, 3)) return;
  const hx = 2.6, hz = 0.8, base = PLATFORM_Y + 0.75, top = PLATFORM_Y + 3.4;
  // The tiled base, in waves of blue.
  s.lit.box({ x: bx - hx, y: PLATFORM_Y, z: -hz }, { x: bx + hx, y: base, z: hz }, (p) => mix(rgb(0x2f5fa8), rgb(0x5a88c8), Math.sin(p.x * 6 + Math.sin(p.y * 12) * 1.5) * 0.5 + 0.5), [], 0.25);
  // The case's black frame, and a pale back of splashed plaster seen through the glass.
  const frame = rgb(0x1c1c1e);
  for (const x of [-hx, -hx / 3, hx / 3, hx]) for (const z of [-hz, hz]) s.lit.box({ x: bx + x - 0.04, y: base, z: z - 0.04 }, { x: bx + x + 0.04, y: top, z: z + 0.04 }, frame);
  for (const y of [base, top - 0.08]) s.lit.box({ x: bx - hx, y, z: -hz }, { x: bx + hx, y: y + 0.08, z: hz }, frame);
  // The boat: a tarred hull, a mast, and the sail on its yard.
  const hull = rgb(0x6a4a2c), keel = base + 0.1, deck = base + 0.55;
  const w = (t: number) => 0.5 * Math.pow(Math.sin(Math.PI * t), 0.6);
  const n = 12, len = 3.8;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, x0 = bx - len / 2 + t0 * len, x1 = bx - len / 2 + t1 * len;
    const rise0 = Math.pow(Math.abs(t0 - 0.5) * 2, 3) * 0.3, rise1 = Math.pow(Math.abs(t1 - 0.5) * 2, 3) * 0.3;
    for (const side of [-1, 1]) {
      const a = new Vector3(x0, keel + rise0, 0), b = new Vector3(x1, keel + rise1, 0);
      const c = new Vector3(x1, deck + rise1, side * w(t1)), d = new Vector3(x0, deck + rise0, side * w(t0));
      s.lit.quad(a, b, c, d, hull);
      s.lit.quad(a, d, c, b, hull);
    }
  }
  s.lit.box({ x: bx - 0.03, y: keel, z: -0.03 }, { x: bx + 0.03, y: top - 0.15, z: 0.03 }, rgb(0x8a6a44));
  s.lit.box({ x: bx - 1.2, y: top - 0.35, z: -0.025 }, { x: bx + 1.2, y: top - 0.3, z: 0.025 }, rgb(0x8a6a44));
  const sail = rgb(0xb04a36);
  const sa = new Vector3(bx - 1.15, top - 0.33, 0), sb = new Vector3(bx + 1.15, top - 0.33, 0), sc = new Vector3(bx + 1.35, deck + 0.35, 0.05), sd = new Vector3(bx - 1.3, deck + 0.4, 0.05);
  s.lit.quad(sa, sb, sc, sd, sail);
  s.lit.quad(sa, sd, sc, sb, sail);
  s.light(bx, top - 0.3, 0, rgb(0xfff0d8), 0.8, 4);
  physics.box({ x: bx - hx - 0.1, y: PLATFORM_Y, z: -hz - 0.1 }, { x: bx + hx + 0.1, y: top, z: hz + 0.1 });
};

/** Västra skogen: turned black stone bollards whose outline is a face in profile, each with a pale stripe down it. */
const vastraSkogen: Detail = ({ s, physics, cx, free }) => {
  // The profile, turned: neck, chin, lips, nose, brow and the crown of the head.
  const outline = [[0, 0], [0.42, 0], [0.46, 0.08], [0.4, 0.22], [0.5, 0.34], [0.44, 0.44], [0.5, 0.52], [0.46, 0.6], [0.6, 0.72], [0.46, 0.8], [0.5, 0.94], [0.42, 1.06], [0.26, 1.16], [0, 1.2]].map(([r, h]) => new Vector2(r, h));
  [[-34, -2.4], [-20, 2.4], [20, -2.4], [34, 2.4]].forEach(([dx, z]) => {
    const x = cx + dx;
    if (!free(x, 0.8)) return;
    solid(s.lit, new LatheGeometry(outline, 20), place(x, PLATFORM_Y, z), (p) => (Math.abs(p.x - x + 0.12) < 0.035 && p.z * Math.sign(z) < z * Math.sign(z) ? rgb(0xd8d4c4) : rgb(0x1c1c1e)));
    physics.box({ x: x - 0.6, y: PLATFORM_Y, z: z - 0.6 }, { x: x + 0.6, y: PLATFORM_Y + 1.2, z: z + 0.6 });
  });
};

/** Huvudsta: Y columns and a silver duct, painted cylinders hanging from the green vault, and green lines across the floor. */
const huvudsta: Detail = (site) => {
  const { s, cx } = site;
  yColumns(site, rgb(0x3a3c3e), true);
  duct(site, 0, DUCT_Y + 0.45, 0.45, rgb(0xb8bcbe));
  // Per Holmberg's cylinders, in harlequin diamonds of red, yellow, purple and black, hung on wires.
  const colors = [rgb(0xd42a38), rgb(0xe8b030), rgb(0x5a3a8a), rgb(0x1c1c1c)];
  const sides = 8, rings = 6, r = 0.2, len = 1.5;
  [-60, -47, -33, -19, -6, 6, 19, 33, 47, 60].forEach((dx, k) => {
    const x = cx + dx, z = k % 2 ? 5.2 : -5.2, bottom = 5.0 + (k % 3) * 0.3;
    const at = (i: number, j: number) => new Vector3(x + Math.cos((i / sides) * Math.PI * 2) * r, bottom + (j / rings) * len, z + Math.sin((i / sides) * Math.PI * 2) * r);
    for (let i = 0; i < sides; i++) for (let j = 0; j < rings; j++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      s.lit.tri(a, c, b, colors[(i + j + k) % 4]);
      s.lit.tri(a, d, c, colors[(i + j + k + 2) % 4]);
    }
    for (let i = 0; i < sides; i++) s.lit.tri(new Vector3(x, bottom, z), at(i, 0), at(i + 1, 0), colors[3]);
    s.lit.box({ x: x - 0.01, y: bottom + len, z: z - 0.01 }, { x: x + 0.01, y: 7.0, z: z + 0.01 }, rgb(0x3a3a3a));
  });
  // Thin bright green lines laid across the dark floor on the diagonal.
  const y = PLATFORM_Y + 0.005, half = 0.02, green = rgb(0x48c070);
  for (const zi of site.islands) for (const [a, b] of freeSpans(site)) {
    for (const dir of [-1, 1]) for (let x = a; x + FLOOR_HALF * 2 <= b; x += 1.6) {
      const z0 = zi - FLOOR_HALF * dir, z1 = zi + FLOOR_HALF * dir, x1 = x + FLOOR_HALF * 2;
      const p = [new Vector3(x - half, y, z0), new Vector3(x + half, y, z0), new Vector3(x1 + half, y, z1), new Vector3(x1 - half, y, z1)];
      s.lit.quad(p[0], p[3], p[2], p[1], green);
      s.lit.quad(p[0], p[1], p[2], p[3], green);
    }
  }
};

/** Solna strand: white Y columns under a silver duct, and one of the sky cubes come down onto the platform, on its corner. */
const solnaStrand: Detail = (site) => {
  const { s, physics, cx, exitDir, free } = site;
  yColumns(site, rgb(0xecece8), true);
  duct(site, 0, DUCT_Y + 0.45, 0.45, rgb(0xbfc3c6));
  const x = cx - exitDir * 12, size = 1.5;
  if (!free(x, 1.5)) return;
  const rotation = new Euler(0.62, 0.5, 0.35);
  const m = place(0, 0, 0, rotation);
  let low = Infinity;
  for (const cx0 of [-1, 1]) for (const cy of [-1, 1]) for (const cz of [-1, 1]) low = Math.min(low, new Vector3(cx0, cy, cz).multiplyScalar(size / 2).applyMatrix4(m).y);
  const geo = new BoxGeometry(size, size, size);
  s.artLayer(cloudCubeTexture()).geometry(geo, place(x, PLATFORM_Y - low - 0.02, 0, rotation), rgb(0xffffff), true);
  geo.dispose();
  physics.box({ x: x - 1.1, y: PLATFORM_Y, z: -1.1 }, { x: x + 1.1, y: PLATFORM_Y - low * 2, z: 1.1 });
};

/**
 * Sundbybergs centrum: two of the six building facades standing on the
 * platform, the billowing red brick of the Kronan crispbread factory and the
 * blue wooden bazaar with its flag.
 */
const sundbyberg: Detail = ({ s, physics, cx, exitDir, free }) => {
  const bx = cx + exitDir * 20;
  if (free(bx, 3)) {
    // A brick wall bellying out like a sail, with dark windows: a grid bent by a bulge.
    const len = 5, tall = 3.6, nx = 12, ny = 8;
    const at = (i: number, j: number, side: number) => {
      const u = i / nx, v = j / ny;
      return new Vector3(bx - len / 2 + u * len, PLATFORM_Y + v * tall, side * 0.2 + Math.sin(Math.PI * u) * Math.sin(Math.PI * v * 0.9) * 0.55);
    };
    const brick = (p: Vector3) => mix(rgb(0x8a4a30), rgb(0xa85a3a), Math.abs(Math.sin(p.y * 13.3 + Math.floor(p.y * 4.2) * 1.7 + p.x * 3.1)));
    for (const side of [-1, 1]) for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const a = at(i, j, side), b = at(i + 1, j, side), c = at(i + 1, j + 1, side), d = at(i, j + 1, side);
      const window = j >= 3 && j <= 5 && i % 3 === 1;
      const paint = window ? rgb(0x22262a) : brick;
      if (side > 0) s.lit.quad(a, b, c, d, paint); else s.lit.quad(a, d, c, b, paint);
    }
    for (const x of [bx - len / 2, bx + len / 2]) s.lit.box({ x: x - 0.1, y: PLATFORM_Y, z: -0.22 }, { x: x + 0.1, y: PLATFORM_Y + tall, z: 0.22 }, rgb(0x7a4028));
    physics.box({ x: bx - len / 2 - 0.1, y: PLATFORM_Y, z: -0.3 }, { x: bx + len / 2 + 0.1, y: PLATFORM_Y + tall, z: 0.8 });
  }
  const wx = cx - exitDir * 20;
  if (free(wx, 2.5)) {
    const blue = rgb(0x2a6a8a), white = rgb(0xece8e0), top = PLATFORM_Y + 3.0;
    s.lit.box({ x: wx - 2, y: PLATFORM_Y, z: -0.25 }, { x: wx + 2, y: top, z: 0.25 }, (p) => (Math.abs(Math.sin(p.x * 16)) > 0.93 ? mix(blue, rgb(0x1a4a64), 0.6) : blue), [], 0.1);
    // A gable over the front, white trim, windows and the flag on its pole.
    for (const side of [-1, 1]) {
      const z = side * 0.26;
      const a = new Vector3(wx - 2.1, top, z), b = new Vector3(wx + 2.1, top, z), c = new Vector3(wx, top + 1.1, z);
      if (side > 0) s.lit.tri(a, b, c, blue); else s.lit.tri(a, c, b, blue);
      for (const k of [-1, 0, 1]) s.lit.box({ x: wx + k * 1.2 - 0.35, y: PLATFORM_Y + 1.3, z: z - 0.02 }, { x: wx + k * 1.2 + 0.35, y: PLATFORM_Y + 2.4, z: z + 0.02 }, k ? rgb(0x22262a) : white);
    }
    s.lit.box({ x: wx - 2.1, y: top - 0.08, z: -0.3 }, { x: wx + 2.1, y: top + 0.04, z: 0.3 }, white);
    s.lit.box({ x: wx - 0.03, y: top + 1.0, z: -0.03 }, { x: wx + 0.03, y: top + 2.2, z: 0.03 }, white);
    s.lit.box({ x: wx + 0.03, y: top + 1.7, z: -0.01 }, { x: wx + 0.9, y: top + 2.15, z: 0.01 }, rgb(0xc8302a));
    physics.box({ x: wx - 2.1, y: PLATFORM_Y, z: -0.3 }, { x: wx + 2.1, y: top, z: 0.3 });
  }
};

/** Duvbo: red columns and a red duct down the middle, over a floor striped along its length in white and dark grey. */
const duvbo: Detail = (site) => {
  const red = rgb(0xb8282e);
  posts(site, red);
  duct(site, 0, DUCT_Y + 0.4, 0.4, red);
  const bands: Array<[number, number]> = [];
  const w = (FLOOR_HALF * 2) / 7;
  for (let k = 0; k < 7; k += 2) bands.push([-FLOOR_HALF + k * w, -FLOOR_HALF + (k + 1) * w]);
  floorStrips(site, bands, rgb(0xdcdcd8));
};

/** Rissne: white Y columns, and a big salmon-pink duct along one side of the vault. */
const rissne: Detail = (site) => {
  yColumns(site, rgb(0xecece8), false);
  duct(site, 5.2, 6.2, 0.5, rgb(0xd8908c));
};

/** Rinkeby: Sven Sahlberg's "Roslagsros", a gilded sun of oars hanging in the vault. */
const rinkeby: Detail = ({ s, cx, exitDir, free }) => {
  const x = cx + exitDir * 14, y = 5.7, gold = rgb(0xd8b04a);
  if (!free(x, 1)) return;
  solid(s.lit, new CylinderGeometry(0.42, 0.42, 0.12, 24), place(x, y, 0, new Euler(0, 0, Math.PI / 2)), gold);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, r = 0.42 + 0.4;
    const rot = new Euler(a, 0, 0);
    solid(s.lit, new BoxGeometry(0.04, 0.8, 0.05), place(x, y + Math.cos(a) * r, Math.sin(a) * -r, rot), gold);
    const rb = 0.42 + 0.8 + 0.18;
    solid(s.lit, new BoxGeometry(0.03, 0.36, 0.16), place(x, y + Math.cos(a) * rb, Math.sin(a) * -rb, rot), mix(gold, rgb(0xf0d078), 0.4));
  }
  s.lit.box({ x: x - 0.01, y: y + 1.6, z: -0.01 }, { x: x + 0.01, y: 7.4, z: 0.01 }, rgb(0x3a3a3a));
  s.light(x + 0.8, y - 0.6, 0, rgb(0xffd890), 0.7, 3.5);
  s.light(x - 0.8, y - 0.6, 0, rgb(0xffd890), 0.7, 3.5);
};

/**
 * Kista: Lars Erik Falk's "Modul", clusters of long aluminium channels in
 * rows along the platform, leaning the same way, bare silver outside and red
 * inside, the longest reaching up past the roof.
 */
const kista: Detail = ({ s, physics, cx, islands, free }) => {
  const silver = rgb(0xc4c8cc), red = rgb(0xc8202a);
  const lean = (17 * Math.PI) / 180;
  const w = 0.4, d = 0.18, t = 0.015;
  [[-28, 1.6], [-16, -1.6], [16, 1.6], [28, -1.6]].forEach(([dx, zo], c) => {
    const x0 = cx + dx;
    if (!free(x0, 1.5)) return;
    for (const zi of islands) {
      // A row across the island, each channel open toward -x and leaning that way.
      for (let k = 0; k < 5; k++) {
        const len = [6.2, 4.4, 7.4, 3.6, 5.4][(k + c) % 5];
        const m = new Matrix4().compose(new Vector3(x0 + (k % 2) * 0.35, PLATFORM_Y, zi + zo + (k - 2) * 0.5), new Quaternion().setFromEuler(new Euler(lean, -Math.PI / 2, 0, 'YXZ')), new Vector3(1, 1, 1));
        // The channel: a web and two flanges, painted red where they face into it.
        faceBox(s.lit, m, new Vector3(-w / 2, 0, -d / 2), new Vector3(w / 2, len, -d / 2 + t), (nx, _ny, nz) => (nz > 0.5 && nx === 0 ? red : silver));
        faceBox(s.lit, m, new Vector3(-w / 2, 0, -d / 2), new Vector3(-w / 2 + t, len, d / 2), (nx) => (nx > 0.5 ? red : silver));
        faceBox(s.lit, m, new Vector3(w / 2 - t, 0, -d / 2), new Vector3(w / 2, len, d / 2), (nx) => (nx < -0.5 ? red : silver));
      }
      physics.box({ x: x0 - 1.2, y: PLATFORM_Y, z: zi + zo - 1.3 }, { x: x0 + 0.6, y: PLATFORM_Y + 2.4, z: zi + zo + 1.3 });
    }
  });
};

/** The blue line's stations' own objects on the platform, by station name, after the real stations. */
export const BLUE_DETAILS: Record<string, Detail> = {
  Kungsträdgården: kungstradgarden,
  Rådhuset: radhuset,
  Fridhemsplan: fridhemsplan,
  'Västra skogen': vastraSkogen,
  Huvudsta: huvudsta,
  'Solna strand': solnaStrand,
  'Sundbybergs centrum': sundbyberg,
  Duvbo: duvbo,
  Rissne: rissne,
  Rinkeby: rinkeby,
  Kista: kista,
};
