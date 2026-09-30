import {
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  EdgesGeometry,
  Euler,
  Matrix4,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { tCentralenColumnTexture, slussenScreenTexture } from '../../gfx/art/red';
import { mix, rgb, type RGB } from '../../gfx/color';
import type { Paint } from '../../gfx/builder';
import { CAVE_HALF_L, CAVE_HALF_W, PLATFORM_HALF_L, PLATFORM_Y, STATION_DESIGN, TRACK_Z, TRAIN_HALF_W } from '../../layout';
import { TILED_TOP, VAULT_TOP } from '../../lines/theme';
import type { Section } from '../section';
import type { Detail, DetailSite } from './types';

/*
 * The red line's own objects on the platforms, after the real stations.
 * Offsets along the island keep clear of what every station has there:
 * benches at 9 and 45 meters from the middle, information pillars at 12 and
 * 40, rock piers at 0, 28 and 56, signs hanging at 42 and 48.
 */

/** A three.js shape into a builder layer, placed, painted and freed. */
function solid(b: Section['lit'], geo: BufferGeometry, x: number, y: number, z: number, paint: Paint, rotation = new Euler(), scale = new Vector3(1, 1, 1)): void {
  b.geometry(geo, new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(rotation), scale), paint);
  geo.dispose();
}

/** A thin round rod from a to b. */
function rod(b: Section['lit'], a: Vector3, c: Vector3, radius: number, paint: Paint, sides = 6): void {
  const dir = new Vector3().subVectors(c, a);
  const geo = new CylinderGeometry(radius, radius, dir.length(), sides, 1, true);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize());
  b.geometry(geo, new Matrix4().compose(a.clone().addScaledVector(dir, 0.5), q, new Vector3(1, 1, 1)), paint);
  geo.dispose();
}

/** A flat strip on the floor from a to b (x, z), a little above the platform so it never fights it. */
function floorLine(b: Section['lit'], ax: number, az: number, bx: number, bz: number, width: number, paint: Paint): void {
  const len = Math.hypot(bx - ax, bz - az);
  const nx = (-(bz - az) / len) * width / 2, nz = ((bx - ax) / len) * width / 2;
  const y = PLATFORM_Y + 0.004;
  b.quad(new Vector3(ax - nx, y, az - nz), new Vector3(ax + nx, y, az + nz), new Vector3(bx + nx, y, bz + nz), new Vector3(bx - nx, y, bz - nz), paint);
}

/** The first of the offsets along the island where something `half` long fits. */
function spot(site: DetailSite, offsets: number[], half: number): number | undefined {
  const dx = offsets.find((d) => site.free(site.cx + d, half));
  return dx === undefined ? undefined : site.cx + dx;
}

/** A flat ceiling hung over the platform and tracks, with slats across it, as over Bergshamra's and Mörby's platforms. */
function slatCeiling(site: DetailSite, y: number, color: number, slat: number): void {
  const { s, cx } = site;
  const [x0, x1] = [cx - PLATFORM_HALF_L, cx + PLATFORM_HALF_L];
  const z = CAVE_HALF_W - 1.2;
  s.lit.gridQuad(new Vector3(x0, y, -z), new Vector3(x1, y, -z), new Vector3(x1, y, z), new Vector3(x0, y, z), rgb(color), 2.5);
  // Only the faces seen from below: the slats' ends are lost in the rock.
  for (let x = x0 + 0.6; x < x1; x += 1.2) s.lit.box({ x: x - 0.04, y: y - 0.16, z: -z }, { x: x + 0.04, y, z }, rgb(slat), ['py', 'pz', 'nz'], 10);
}

// ---------------------------------------------------------------- Tekniska högskolan

/**
 * Lennart Mörk's glass dodecahedron, the fifth element, hanging in the vault
 * over the island, and its outline projected in coloured lines on the floor
 * below.
 */
const tekniska: Detail = (site) => {
  const { s, physics } = site;
  const x = spot(site, [17, -17, 34, -34], 2.4);
  if (x === undefined) return;
  const y = 6.0;
  const R = 1.15;
  const glass = rgb(0xd4e2ea);
  const metal = rgb(0x5a5e62);
  const body = new DodecahedronGeometry(R, 0);
  const turn = new Euler(0.3, 0.5, 0.2);
  s.lit.geometry(body, new Matrix4().compose(new Vector3(x, y, 0), new Quaternion().setFromEuler(turn), new Vector3(1, 1, 1)), (_p, n) => mix(glass, rgb(0x8aa8c0), 0.5 - n.y * 0.4));
  // Its steel edges.
  const edges = new EdgesGeometry(body);
  body.dispose();
  const m = new Matrix4().compose(new Vector3(x, y, 0), new Quaternion().setFromEuler(turn), new Vector3(1.01, 1.01, 1.01));
  const pos = edges.getAttribute('position');
  for (let i = 0; i < pos.count; i += 2) {
    rod(s.lit, new Vector3().fromBufferAttribute(pos, i).applyMatrix4(m), new Vector3().fromBufferAttribute(pos, i + 1).applyMatrix4(m), 0.025, metal, 4);
  }
  edges.dispose();
  rod(s.lit, new Vector3(x, y + R * 0.8, 0), new Vector3(x, 8.4, 0), 0.015, metal, 4);
  s.light(x, y - 1.6, 0, rgb(0xf4f8ff), 0.6, 5);
  // The projection on the floor: two rings of ten sides and the lines between them, in the elements' colours.
  const colors = [rgb(0xe0b030), rgb(0xd2452a), rgb(0x4aa04a), rgb(0x2a6ab8)];
  for (const [k, r] of [0.9, 1.7].entries()) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, b = ((i + 1) / 10) * Math.PI * 2;
      floorLine(s.lit, x + Math.cos(a) * r, Math.sin(a) * r, x + Math.cos(b) * r, Math.sin(b) * r, 0.05, colors[(i + k) % colors.length]);
    }
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    floorLine(s.lit, x + Math.cos(a) * 0.9, Math.sin(a) * 0.9, x + Math.cos(a + 0.31) * 1.7, Math.sin(a + 0.31) * 1.7, 0.04, colors[i % colors.length]);
  }
  physics.box({ x: x - R, y: y - R, z: -R }, { x: x + R, y: y + R, z: R });
};

// ---------------------------------------------------------------- Gärdet

/** A beetle that does not exist, in the round: a shell, a head, six legs and feelers. */
function beetle(b: Section['lit'], x: number, y: number, z: number, shell: RGB, turn: number): void {
  const black = rgb(0x1a1a18);
  const q = new Euler(0, turn, 0);
  solid(b, new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), x, y, z, shell, q, new Vector3(0.16, 0.1, 0.11));
  const hx = x + Math.cos(turn) * 0.17, hz = z - Math.sin(turn) * 0.17;
  solid(b, new SphereGeometry(0.05, 8, 6), hx, y + 0.02, hz, black);
  for (let k = -1; k <= 1; k++) {
    for (const side of [-1, 1]) {
      const along = k * 0.08;
      const ax = x + Math.cos(turn) * along + Math.sin(turn) * side * 0.08, az = z - Math.sin(turn) * along + Math.cos(turn) * side * 0.08;
      const fx = ax + Math.sin(turn) * side * 0.1, fz = az + Math.cos(turn) * side * 0.1;
      rod(b, new Vector3(ax, y + 0.02, az), new Vector3(fx, y - 0.01, fz), 0.008, black, 4);
    }
  }
  for (const side of [-1, 1]) rod(b, new Vector3(hx, y + 0.03, hz), new Vector3(hx + Math.cos(turn + side * 0.5) * 0.12, y + 0.09, hz - Math.sin(turn + side * 0.5) * 0.12), 0.006, black, 4);
}

/** Karl Axel Pehrson's "Djur som inte finns": beetles in lit glass showcases on the platform. */
const gardet: Detail = (site) => {
  const { s, physics } = site;
  const frame = rgb(0x2a2826);
  const shells = [rgb(0x6b7a3a), rgb(0xb58a3a), rgb(0x3a6a5a), rgb(0x8a5a2a)];
  for (const [k, dx] of [22, -22].entries()) {
    const x = spot(site, [dx], 1);
    if (x === undefined) continue;
    const y0 = PLATFORM_Y;
    const [hx, hz, base, top] = [0.55, 0.45, 0.9, 1.75];
    s.lit.box({ x: x - hx, y: y0, z: -hz }, { x: x + hx, y: y0 + base, z: hz }, rgb(0x5a4a3e));
    s.lit.box({ x: x - hx, y: y0 + top - 0.08, z: -hz }, { x: x + hx, y: y0 + top, z: hz }, frame);
    for (const px of [-hx, hx]) for (const pz of [-hz, hz]) s.lit.box({ x: x + px - 0.02, y: y0 + base, z: pz - 0.02 }, { x: x + px + 0.02, y: y0 + top, z: pz + 0.02 }, frame);
    // A pale lit floor to the case, and two beetles on it.
    s.unlit.box({ x: x - hx + 0.03, y: y0 + base, z: -hz + 0.03 }, { x: x + hx - 0.03, y: y0 + base + 0.01, z: hz - 0.03 }, rgb(0xf2ead0));
    beetle(s.lit, x - 0.18, y0 + base + 0.02, 0.12, shells[k * 2], 0.4);
    beetle(s.lit, x + 0.2, y0 + base + 0.02, -0.14, shells[k * 2 + 1], 2.6);
    s.light(x, y0 + top - 0.15, 0, rgb(0xffe8c0), 0.8, 2.5);
    physics.box({ x: x - hx, y: y0, z: -hz }, { x: x + hx, y: y0 + top, z: hz });
  }
};

// ---------------------------------------------------------------- Bergshamra

/** The red bicycle of Bergshamra, on a slab of granite, and fossils set into the floor: ammonites and trilobites. */
const bergshamra: Detail = (site) => {
  const { s, physics, cx } = site;
  slatCeiling(site, 5.6, 0x3a3a3a, 0x555555);
  const x = spot(site, [-20, 20, -34], 1.4);
  if (x !== undefined) {
    const red = rgb(0xc0282d);
    const black = rgb(0x1c1c1c);
    const y = PLATFORM_Y + 0.25;
    s.lit.box({ x: x - 1.2, y: PLATFORM_Y, z: -0.45 }, { x: x + 1.2, y, z: 0.45 }, rgb(0x6e6c68));
    const wheel = (wx: number) => solid(s.lit, new TorusGeometry(0.33, 0.025, 6, 24), wx, y + 0.35, 0, black);
    wheel(x - 0.52);
    wheel(x + 0.52);
    const p = (dx: number, dy: number) => new Vector3(x + dx, y + dy, 0);
    const frame: Array<[Vector3, Vector3]> = [
      [p(-0.52, 0.35), p(-0.05, 0.33)], [p(-0.05, 0.33), p(0.4, 0.78)], [p(-0.05, 0.33), p(-0.15, 0.8)],
      [p(-0.15, 0.8), p(0.4, 0.78)], [p(-0.52, 0.35), p(-0.15, 0.8)], [p(0.52, 0.35), p(0.42, 0.92)],
    ];
    for (const [a, b] of frame) rod(s.lit, a, b, 0.02, red);
    rod(s.lit, p(0.42, 0.92), p(0.36, 0.95), 0.015, black);
    rod(s.lit, new Vector3(x + 0.36, y + 0.95, -0.25), new Vector3(x + 0.36, y + 0.95, 0.25), 0.014, black);
    solid(s.lit, new BoxGeometry(0.24, 0.05, 0.12), x - 0.16, y + 0.86, 0, black);
    physics.box({ x: x - 1.2, y: PLATFORM_Y, z: -0.45 }, { x: x + 1.2, y: y + 1.0, z: 0.45 });
  }
  const fossil = rgb(0x3a3630);
  // Ammonites: spirals of a stroke widening outward.
  for (const [dx, dz] of [[5, 1.6], [-6, -1.4], [17, -2.1], [-31, 1.2], [33, 2.0], [-52, -1.8], [52, 1.0]]) {
    const fx = cx + dx;
    if (!site.free(fx, 0.8)) continue;
    let [px, pz] = [fx, dz];
    for (let k = 1; k < 40; k++) {
      const a = k * 0.42, r = 0.012 * k;
      const [nx, nz] = [fx + Math.cos(a) * r, dz + Math.sin(a) * r];
      floorLine(s.lit, px, pz, nx, nz, 0.02 + k * 0.001, fossil);
      [px, pz] = [nx, nz];
    }
  }
  // Trilobites: an oval body with ribs across it.
  for (const [dx, dz] of [[-15, 2.2], [24, -1.6], [-44, 1.8]]) {
    const fx = cx + dx;
    if (!site.free(fx, 0.5)) continue;
    solid(s.lit, new CircleGeometry(0.2, 14), fx, PLATFORM_Y + 0.003, dz, fossil, new Euler(-Math.PI / 2, 0, 0), new Vector3(1.6, 1, 1));
    for (let k = -3; k <= 3; k++) floorLine(s.lit, fx + k * 0.08, dz - 0.26, fx + k * 0.08, dz + 0.26, 0.015, fossil);
  }
};

// ---------------------------------------------------------------- Mörby centrum

/** The pale slatted ceiling hung under the painted rock over Mörby centrum's platform. */
const morby: Detail = (site) => slatCeiling(site, 5.5, 0x8a8a86, 0xd8d8d2);

// ---------------------------------------------------------------- Midsommarkransen

/** The midsummer wreath the neighbours made, hanging over the platform: green leaves, red ribbons, daisies and flowers. */
const midsommarkransen: Detail = (site) => {
  const { s } = site;
  const x = spot(site, [24, -24, 16, -16], 1.3);
  if (x === undefined) return;
  const y = 4.05;
  const R = 1.05;
  const leaf = rgb(0x3a7a3a);
  solid(s.lit, new TorusGeometry(R, 0.2, 8, 32), x, y, 0, (p) => mix(leaf, rgb(0x2a5a2a), (Math.sin(p.x * 23) * Math.cos(p.z * 19) + 1) / 2), new Euler(Math.PI / 2, 0, 0));
  const flowers = [rgb(0xf4f2ea), rgb(0x3a4ab0), rgb(0x7a4aa0), rgb(0xe8c02a), rgb(0xf4f2ea)];
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    const [fx, fz] = [x + Math.cos(a) * R, Math.sin(a) * R];
    if (k % 5 === 0) {
      // A red ribbon wound round the wreath.
      solid(s.lit, new TorusGeometry(0.23, 0.04, 4, 12), fx, y, fz, rgb(0xd82a2a), new Euler(0, -a, 0));
    } else {
      solid(s.lit, new SphereGeometry(0.1, 8, 5), fx, y + 0.17, fz, flowers[k % flowers.length], new Euler(), new Vector3(1, 0.4, 1));
    }
  }
  // Three cords up to the ceiling.
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    rod(s.lit, new Vector3(x + Math.cos(a) * R, y + 0.15, Math.sin(a) * R), new Vector3(x, VAULT_TOP - 0.05, 0), 0.008, rgb(0x2a2a2a), 4);
  }
  s.light(x, y - 0.6, 0, rgb(0xfff2dc), 0.5, 4);
};

// ---------------------------------------------------------------- Aspudden

/** A bronze penguin carrying a box, life size, on a plinth of white tiles. */
const aspudden: Detail = (site) => {
  const { s, physics } = site;
  const x = spot(site, [20, -20, 33, -33], 0.8);
  if (x === undefined) return;
  const y0 = PLATFORM_Y + 0.45;
  s.lit.box({ x: x - 0.6, y: PLATFORM_Y, z: -0.6 }, { x: x + 0.6, y: y0, z: 0.6 }, (p) => ((Math.abs((p.x - x) * 10 % 1) < 0.08 || Math.abs((p.y * 10) % 1) < 0.08) ? rgb(0xc4c4c0) : rgb(0xf2f2ee)), [], 0.1);
  const bronze = rgb(0x3a3026);
  solid(s.lit, new SphereGeometry(1, 16, 12), x, y0 + 0.42, 0, bronze, new Euler(0, 0, -0.05), new Vector3(0.19, 0.4, 0.17));
  solid(s.lit, new SphereGeometry(0.11, 12, 8), x + 0.03, y0 + 0.86, 0, bronze);
  solid(s.lit, new ConeGeometry(0.035, 0.14, 8), x + 0.14, y0 + 0.85, 0, bronze, new Euler(0, 0, -Math.PI / 2));
  for (const side of [-1, 1]) {
    solid(s.lit, new SphereGeometry(1, 10, 6), x, y0 + 0.45, side * 0.17, bronze, new Euler(side * 0.25, 0, 0), new Vector3(0.05, 0.25, 0.03));
    solid(s.lit, new SphereGeometry(1, 8, 5), x + 0.05, y0 + 0.03, side * 0.07, bronze, new Euler(), new Vector3(0.09, 0.03, 0.05));
  }
  // The box in its flippers.
  s.lit.box({ x: x + 0.12, y: y0 + 0.35, z: -0.16 }, { x: x + 0.42, y: y0 + 0.6, z: 0.16 }, rgb(0x6a4a2a));
  physics.box({ x: x - 0.6, y: PLATFORM_Y, z: -0.6 }, { x: x + 0.6, y: y0 + 1.0, z: 0.6 });
};

// ---------------------------------------------------------------- Liljeholmen

/** Pillars that glow from inside, down the platform. */
const liljeholmen: Detail = (site) => {
  const { s, physics, cx, islands } = site;
  for (const zi of islands) {
    for (const dx of STATION_DESIGN.pierXs) {
      const x = cx + dx;
      if (!site.free(x, 0.5)) continue;
      const top = TILED_TOP + 0.2;
      s.unlit.box({ x: x - 0.3, y: PLATFORM_Y + 0.25, z: zi - 0.3 }, { x: x + 0.3, y: top - 0.4, z: zi + 0.3 }, rgb(0xf6eed8), ['py', 'ny']);
      s.lit.box({ x: x - 0.33, y: PLATFORM_Y, z: zi - 0.33 }, { x: x + 0.33, y: PLATFORM_Y + 0.25, z: zi + 0.33 }, rgb(0x6a6c70));
      s.lit.box({ x: x - 0.33, y: top - 0.4, z: zi - 0.33 }, { x: x + 0.33, y: top, z: zi + 0.33 }, rgb(0x6a2a26));
      s.light(x, PLATFORM_Y + 2, zi, rgb(0xfff0d0), 0.8, 6);
      physics.box({ x: x - 0.35, y: PLATFORM_Y, z: zi - 0.35 }, { x: x + 0.35, y: top, z: zi + 0.35 });
    }
  }
};

// ---------------------------------------------------------------- Slussen

/** Bengt Rafael Sundberg's blue perforated steel screens, 3 by 5 meters, along the wall between the two lines' platforms. */
const slussen: Detail = (site) => {
  const { s, cx, islands } = site;
  if (islands.length < 2) return;
  const art = s.artLayer(slussenScreenTexture());
  // Just off the face of the wall between the lines' inner tracks (see `stationSteps`).
  const face = TRACK_Z - TRAIN_HALF_W - 1.5 + 0.04;
  const [y0, y1] = [0.4, 5.4];
  for (let x = cx - CAVE_HALF_L + 4; x + 3 < cx + CAVE_HALF_L - 4; x += 3.4) {
    for (const side of [-1, 1]) {
      const z = side * face;
      const a = new Vector3(x, y0, z), b = new Vector3(x + 3, y0, z), c = new Vector3(x + 3, y1, z), d = new Vector3(x, y1, z);
      const white = rgb(0xffffff);
      art.tri(a, b, c, white, { uvs: [[0, 0], [1, 0], [1, 1]] });
      art.tri(a, c, d, white, { uvs: [[0, 0], [1, 1], [0, 1]] });
    }
  }
};

// ---------------------------------------------------------------- T-Centralen

/**
 * The columns down the 1957 platforms, clad in Oscar Brandtberg's patterned
 * tiles, and two of them the art pillars: Vera Nilsson's mosaic and Siri
 * Derkert's "Kvinnopelaren" in engraved concrete.
 */
const tCentralen: Detail = (site) => {
  const { s, physics, cx, islands } = site;
  const art = s.artLayer(tCentralenColumnTexture());
  const top = VAULT_TOP + 0.2;
  const H = 0.38;
  const white = rgb(0xffffff);
  islands.forEach((zi, k) => {
    for (const dx of STATION_DESIGN.pierXs) {
      const x = cx + dx;
      if (!site.free(x, 0.5)) continue;
      // Which skin: the brick pattern, or on the middle column of each island one of the art pillars.
      const skin = dx === 0 ? 1 + k : 0;
      const u0 = skin / 3, u1 = (skin + 1) / 3;
      const corners: Array<[number, number]> = [[-H, -H], [H, -H], [H, H], [-H, H]];
      for (let f = 0; f < 4; f++) {
        const [ax, az] = corners[f], [bx, bz] = corners[(f + 1) % 4];
        const a = new Vector3(x + ax, PLATFORM_Y, zi + az), b = new Vector3(x + bx, PLATFORM_Y, zi + bz);
        const c = new Vector3(x + bx, top, zi + bz), d = new Vector3(x + ax, top, zi + az);
        // Cut into storeys so the baked light has vertices to fall on.
        for (let j = 0; j < 4; j++) {
          const t0 = j / 4, t1 = (j + 1) / 4;
          const p0 = a.clone().lerp(d, t0), p1 = b.clone().lerp(c, t0), p2 = b.clone().lerp(c, t1), p3 = a.clone().lerp(d, t1);
          const v0 = t0 * 0.999, v1 = t1 * 0.999;
          art.tri(p0, p1, p2, white, { uvs: [[u0, v0], [u1, v0], [u1, v1]] });
          art.tri(p0, p2, p3, white, { uvs: [[u0, v0], [u1, v1], [u0, v1]] });
        }
      }
      physics.box({ x: x - H - 0.05, y: PLATFORM_Y, z: zi - H - 0.05 }, { x: x + H + 0.05, y: top, z: zi + H + 0.05 });
    }
  });
};

// ---------------------------------------------------------------- Gamla stan

/** Britta Carlström's "Svetsspets": a welded steel fence between the middle tracks, open like lace. */
const gamlaStan: Detail = (site) => {
  const { s, physics, cx } = site;
  const steel = rgb(0x3a3a3a);
  const [x0, x1] = [cx - PLATFORM_HALF_L + 2, cx + PLATFORM_HALF_L - 2];
  const [y0, y1] = [0.1, 1.5];
  const W = 0.018;
  const bar = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const nx = (-(by - ay) / len) * W, ny = ((bx - ax) / len) * W;
    s.lit.quad(new Vector3(ax - nx, ay - ny, 0), new Vector3(bx - nx, by - ny, 0), new Vector3(bx + nx, by + ny, 0), new Vector3(ax + nx, ay + ny, 0), steel);
  };
  // Top and bottom rails, posts every six meters, and between them a lattice of crossing bars with a wave through it.
  s.lit.box({ x: x0, y: y1 - 0.04, z: -0.03 }, { x: x1, y: y1 + 0.04, z: 0.03 }, steel);
  s.lit.box({ x: x0, y: y0, z: -0.02 }, { x: x1, y: y0 + 0.05, z: 0.02 }, steel);
  for (let x = x0; x <= x1 + 0.01; x += 6) s.lit.box({ x: x - 0.04, y: 0, z: -0.04 }, { x: x + 0.04, y: y1 + 0.04, z: 0.04 }, steel);
  const step = 0.45;
  for (let x = x0; x < x1 - 0.7; x += step) {
    bar(x, y0, x + 0.7, y1);
    bar(x + 0.7, y0, x, y1);
  }
  let prev = [x0, (y0 + y1) / 2];
  for (let x = x0 + 0.15; x <= x1; x += 0.15) {
    const y = (y0 + y1) / 2 + Math.sin(x * 2.4) * 0.28;
    bar(prev[0], prev[1], x, y);
    prev = [x, y];
  }
  physics.box({ x: x0, y: 0, z: -0.05 }, { x: x1, y: y1, z: 0.05 });
};

// ---------------------------------------------------------------- Östermalmstorg

/** The peace sign set into the floor, as Siri Derkert had it. */
const ostermalmstorg: Detail = (site) => {
  const { s, cx } = site;
  const ink = rgb(0x2c2a27);
  for (const dx of [18, -18, 35]) {
    const x = cx + dx;
    if (!site.free(x, 0.8)) continue;
    solid(s.lit, new RingGeometry(0.52, 0.6, 32), x, PLATFORM_Y + 0.004, 0, ink, new Euler(-Math.PI / 2, 0, 0));
    floorLine(s.lit, x - 0.56, 0, x + 0.56, 0, 0.07, ink);
    floorLine(s.lit, x, 0, x + 0.4, 0.4, 0.07, ink);
    floorLine(s.lit, x, 0, x + 0.4, -0.4, 0.07, ink);
  }
};

/** The red line's stations' own objects on the platform, by station name, after the real stations. */
export const RED_DETAILS: Record<string, Detail> = {
  'Tekniska högskolan': tekniska,
  'Gärdet': gardet,
  'Bergshamra': bergshamra,
  'Mörby centrum': morby,
  'Midsommarkransen': midsommarkransen,
  'Aspudden': aspudden,
  'Liljeholmen': liljeholmen,
  'Slussen': slussen,
  'T-Centralen': tCentralen,
  'Gamla stan': gamlaStan,
  'Östermalmstorg': ostermalmstorg,
};
