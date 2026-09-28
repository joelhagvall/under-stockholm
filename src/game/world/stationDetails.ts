import { BoxGeometry, CylinderGeometry, Euler, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three';
import { rgb, mix } from '../gfx/color';
import { noise3 } from '../gfx/noise';
import { vineTexture } from '../gfx/textures';
import { cloudCubeTexture, hopscotchTexture } from '../gfx/stationArt';
import { mulberry32 } from '../gfx/textures';
import { CAVE_HALF_L, CAVE_HALF_W, CAVE_TOP, PLATFORM_HALF_L, PLATFORM_HALF_W, PLATFORM_Y, STATION_DESIGN as D, STATION_ROCK_INSET, TRACK_Z, TUBE_HALF_W, TUBE_TOP, TUBE_WALL_H } from '../layout';
import type { StationDef } from '../line';
import type { Physics } from '../physics';
import type { Section } from './section';

/** Station-specific architecture stays in the baked layers, including all small details. */
export function stationArchitecture(s: Section, physics: Physics, def: StationDef, cx: number, exitDir: 1 | -1 = 1): void {
  platformArt(s, physics, def, cx, exitDir);
  const stone = rgb(0xc9c5b8);
  const red = rgb(0xab4437);
  const green = rgb(0x355b49);
  const metal = rgb(0x707b80);
  for (const dx of D.pierXs) {
    const x = cx + dx;
    if (def.architecture === 'garden') {
      // Classical fragments and fluted columns recall the excavated palace garden.
      for (const [y, radius, height, color] of [
        [PLATFORM_Y + 0.12, 0.9, 0.24, green],
        [PLATFORM_Y + 0.34, 0.72, 0.2, stone],
        [D.corniceY - 0.12, 0.78, 0.25, red],
        [D.corniceY + 0.08, 0.92, 0.15, stone],
      ] as const) {
        const geo = new CylinderGeometry(radius, radius, height, 20);
        s.lit.geometry(geo, new Matrix4().setPosition(x, y, 0), color);
        geo.dispose();
      }
      const y0 = PLATFORM_Y + 0.44;
      const y1 = D.corniceY - 0.24;
      const column = new CylinderGeometry(0.43, 0.57, y1 - y0, 24, 12);
      s.lit.geometry(column, new Matrix4().setPosition(x, (y0 + y1) / 2, 0), (p) => {
        const flute = Math.cos(Math.atan2(p.z, p.x - x) * 12);
        return mix(stone, rgb(0x858a77), flute * 0.18 + 0.18);
      });
      column.dispose();
      physics.box({ x: x - 0.9, y: PLATFORM_Y, z: -0.9 }, { x: x + 0.9, y: D.corniceY + 0.2, z: 0.9 });
    } else {
      // Irregular rock piers flare into the ceiling, breaking up the oversized tube silhouette.
      const rings: Vector3[][] = [];
      const levels = 16;
      const sides = 20;
      for (let j = 0; j <= levels; j++) {
        const t = j / levels;
        const y = PLATFORM_Y + t * (CAVE_TOP - PLATFORM_Y + 0.35);
        const flare = Math.pow(Math.max(0, (t - 0.44) / 0.56), 2) * 2.5;
        rings.push(Array.from({ length: sides }, (_, k) => {
          const a = k / sides * Math.PI * 2;
          const rough = (noise3(x + Math.cos(a) * 2, y * 1.1, Math.sin(a) * 2, 17) - 0.5) * 0.22;
          return new Vector3(x + Math.cos(a) * (D.pierHalfX + flare + rough), y, Math.sin(a) * (D.pierHalfZ + flare + rough));
        }));
      }
      for (let j = 0; j < levels; j++) {
        for (let k = 0; k < sides; k++) {
          const n = (k + 1) % sides;
          if (def.architecture === 'vines') {
            const layer = s.artLayer(vineTexture(20, 36));
            const a = rings[j][k], b = rings[j][n], c = rings[j + 1][n], d = rings[j + 1][k];
            const u0 = k / sides * 0.6, u1 = (k + 1) / sides * 0.6;
            const v0 = j / levels * 0.4, v1 = (j + 1) / levels * 0.4;
            layer.tri(a, b, c, rgb(0xffffff), { uvs: [[u0, v0], [u1, v0], [u1, v1]] });
            layer.tri(a, c, d, rgb(0xffffff), { uvs: [[u0, v0], [u1, v1], [u0, v1]] });
            continue;
          }
          s.lit.quad(rings[j][k], rings[j][n], rings[j + 1][n], rings[j + 1][k], (p, normal) => {
            return def.theme.paint(p, normal);
          });
        }
      }
      physics.box({ x: x - D.pierHalfX - 0.12, y: PLATFORM_Y, z: -D.pierHalfZ - 0.12 }, { x: x + D.pierHalfX + 0.12, y: D.corniceY, z: D.pierHalfZ + 0.12 });
    }
  }

  if (def.architecture === 'strata') {
    // Blockwork around the tunnel mouths recalls the station's archaeological motifs.
    for (const end of [-1, 1]) {
      const x = cx + end * (CAVE_HALF_L - 0.08);
      for (const track of [-TRACK_Z, TRACK_Z]) {
        for (let i = 0; i < 15; i++) {
          const a = i / 15 * Math.PI + 0.013;
          const b = (i + 1) / 15 * Math.PI - 0.013;
          const point = (angle: number, rim: number) => new Vector3(x, TUBE_WALL_H + Math.sin(angle) * (TUBE_TOP - TUBE_WALL_H + rim), track + Math.cos(angle) * (TUBE_HALF_W + rim));
          s.lit.quad(point(a, 0), point(b, 0), point(b, D.portalRim), point(a, D.portalRim), mix(stone, rgb(0x976a50), i % 3 * 0.12));
        }
      }
    }
  }

  if (def.architecture === 'harbour') {
    // Museum-like recesses with beach stones and a suspended timber seabird.
    const birdX = cx + 18;
    const y = D.birdY;
    const timber = rgb(0x92714e);
    for (const side of [-1, 1]) {
      s.lit.quad(new Vector3(birdX - 0.55, y, side * 0.1), new Vector3(birdX + 0.32, y + 0.14, side * 0.18), new Vector3(birdX - 0.4, y + 0.28, side * D.birdHalfSpan), new Vector3(birdX - 0.7, y + 0.18, side * D.birdHalfSpan), timber);
    }
    const body = new CylinderGeometry(0.15, 0.08, 1.4, 8);
    s.lit.geometry(body, new Matrix4().makeRotationZ(Math.PI / 2).setPosition(birdX, y, 0), timber);
    body.dispose();
    s.lit.box({ x: birdX - 0.009, y, z: -0.009 }, { x: birdX + 0.009, y: CAVE_TOP, z: 0.009 }, metal);
    for (const dx of [-35, 35]) {
      const x = cx + dx;
      s.lit.box({ x: x - 1.4, y: PLATFORM_Y, z: -0.35 }, { x: x + 1.4, y: PLATFORM_Y + 0.75, z: 0.35 }, rgb(0x3a454b));
      s.lit.box({ x: x - 1.4, y: PLATFORM_Y + 0.75, z: -0.3 }, { x: x + 1.4, y: PLATFORM_Y + 1.8, z: 0.3 }, rgb(0xbbb7a6));
      for (const side of [-1, 1]) {
        const z = side * 0.36;
        s.lit.box({ x: x - 1.45, y: PLATFORM_Y + 0.7, z: z - 0.03 }, { x: x + 1.45, y: PLATFORM_Y + 0.78, z: z + 0.03 }, metal);
        s.lit.box({ x: x - 1.45, y: PLATFORM_Y + 1.8, z: z - 0.03 }, { x: x + 1.45, y: PLATFORM_Y + 1.88, z: z + 0.03 }, metal);
        for (let k = -3; k <= 3; k++) {
          const geo = new CylinderGeometry(0.1, 0.18, 0.14 + Math.abs(k) * 0.02, 7);
          s.lit.geometry(geo, new Matrix4().makeRotationX(Math.PI / 2).setPosition(x + k * 0.32, PLATFORM_Y + 1.13, z), mix(stone, green, Math.abs(k) / 4));
          geo.dispose();
        }
      }
      physics.box({ x: x - 1.45, y: PLATFORM_Y, z: -0.42 }, { x: x + 1.45, y: PLATFORM_Y + 1.88, z: 0.42 });
    }
  }
}

/** A solid shape from a three.js geometry, placed and painted. */
function solid(s: Section, geo: BoxGeometry | CylinderGeometry | SphereGeometry, x: number, y: number, z: number, color: ReturnType<typeof rgb>, rotation = new Euler(), scale = new Vector3(1, 1, 1)): void {
  s.lit.geometry(geo, new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(rotation), scale), color);
  geo.dispose();
}

/**
 * The art that stands on the platforms, after the real stations: Kungsträdgården's
 * red urns and palace torsos, Solna centrum's moose in a lit showcase, Hallonbergen's
 * hopscotch and shocking-pink railings, and Solna strand's cloud cubes.
 */
function platformArt(s: Section, physics: Physics, def: StationDef, cx: number, exitDir: 1 | -1): void {
  const y0 = PLATFORM_Y;
  if (def.architecture === 'garden') {
    const red = rgb(0xb8322a);
    const marble = rgb(0xf2efe6);
    // Two big red urns on red plinths flank the far end of the platform.
    const ux = cx - exitDir * 20;
    for (const z of [-1.1, 1.1]) {
      s.lit.box({ x: ux - 0.4, y: y0, z: z - 0.4 }, { x: ux + 0.4, y: y0 + 1.0, z: z + 0.4 }, red);
      solid(s, new CylinderGeometry(0.2, 0.26, 0.14, 20), ux, y0 + 1.07, z, red);
      solid(s, new CylinderGeometry(0.5, 0.22, 0.7, 24), ux, y0 + 1.49, z, red);
      solid(s, new CylinderGeometry(0.54, 0.5, 0.1, 24), ux, y0 + 1.89, z, red);
      for (const side of [-1, 1]) solid(s, new CylinderGeometry(0.05, 0.05, 0.3, 8), ux + side * 0.5, y0 + 1.6, z, red, new Euler(0, 0, side * 0.5));
      physics.box({ x: ux - 0.55, y: y0, z: z - 0.55 }, { x: ux + 0.55, y: y0 + 1.95, z: z + 0.55 });
    }
    // Torsos from the Makalös palace on white plinths, one painted red.
    [[cx + exitDir * 20, marble], [cx - 34, marble], [cx + 34, red]].forEach(([x, color], k) => {
      const tx = x as number;
      const c = color as ReturnType<typeof rgb>;
      s.lit.box({ x: tx - 0.35, y: y0, z: -0.35 }, { x: tx + 0.35, y: y0 + 1.1, z: 0.35 }, marble);
      solid(s, new CylinderGeometry(0.26, 0.2, 0.62, 16), tx, y0 + 1.45, 0, c, new Euler(0, k, 0), new Vector3(1, 1, 0.7));
      solid(s, new SphereGeometry(0.3, 16, 10), tx, y0 + 1.76, 0, c, new Euler(0, k, 0), new Vector3(1.25, 0.45, 0.8));
      solid(s, new CylinderGeometry(0.07, 0.08, 0.14, 10), tx, y0 + 1.92, 0, c);
      solid(s, new SphereGeometry(0.14, 14, 10), tx, y0 + 2.1, 0, c, new Euler(0, k, 0), new Vector3(0.9, 1.1, 1));
      physics.box({ x: tx - 0.45, y: y0, z: -0.45 }, { x: tx + 0.45, y: y0 + 2.25, z: 0.45 });
    });
  }

  if (def.architecture === 'redSky') {
    // The moose, life size, in front of a darkened shop window in a lit showcase.
    const mx = cx + exitDir * 20;
    const frame = rgb(0x2a2b2e);
    const hx = 1.8, hz = 0.85, top = 2.9;
    s.lit.box({ x: mx - hx, y: y0, z: -hz }, { x: mx + hx, y: y0 + 0.35, z: hz }, frame);
    s.lit.box({ x: mx - hx, y: y0 + top - 0.2, z: -hz }, { x: mx + hx, y: y0 + top, z: hz }, frame);
    for (const x of [-hx, hx]) for (const z of [-hz, hz]) s.lit.box({ x: mx + x - 0.05, y: y0, z: z - 0.05 }, { x: mx + x + 0.05, y: y0 + top, z: z + 0.05 }, frame);
    // The dark shop window at the back, and the moose in front of it, facing along the platform.
    s.lit.box({ x: mx - hx + 0.05, y: y0 + 0.35, z: -hz + 0.05 }, { x: mx + hx - 0.05, y: y0 + top - 0.2, z: -hz + 0.15 }, rgb(0x14161a));
    const coat = rgb(0x4e3522);
    const dark = rgb(0x2e2016);
    const antler = rgb(0xcdb893);
    const z = 0.1;
    const ellipsoid = (x: number, y: number, rx: number, ry: number, rz: number, color: typeof coat, tilt = 0) =>
      solid(s, new SphereGeometry(1, 18, 12), mx + x, y0 + y, z, color, new Euler(0, 0, tilt), new Vector3(rx, ry, rz));
    // A deep body with a high shoulder hump, sloping down to the rump.
    ellipsoid(-0.15, 1.55, 0.95, 0.42, 0.36, coat, 0.08);
    ellipsoid(0.45, 1.78, 0.45, 0.36, 0.33, coat);
    // Neck, the long heavy head held low, the droopy muzzle and the dewlap under the throat.
    solid(s, new CylinderGeometry(0.17, 0.22, 0.55, 12), mx + 0.85, y0 + 1.78, z, coat, new Euler(0, 0, -0.9));
    ellipsoid(1.22, 1.72, 0.32, 0.16, 0.15, coat, -0.45);
    ellipsoid(1.47, 1.56, 0.13, 0.12, 0.12, dark, -0.45);
    ellipsoid(1.05, 1.45, 0.05, 0.16, 0.05, dark);
    for (const az of [-1, 1]) {
      ellipsoid(1.08, 1.93, 0.1, 0.05, 0.04, coat, 0.4);
      // Broad, flat palmate antlers with tines along their rims.
      solid(s, new SphereGeometry(1, 14, 8), mx + 1.0, y0 + 2.05, z + az * 0.38, antler, new Euler(az * 0.35, 0, 0.15), new Vector3(0.24, 0.05, 0.3));
      for (let t = 0; t < 4; t++) solid(s, new CylinderGeometry(0.018, 0.025, 0.16, 6), mx + 0.88 + t * 0.08, y0 + 2.14, z + az * (0.5 + t * 0.03), antler);
    }
    // Long thin legs with knobbly knees, and a stub of a tail.
    for (const [lx, lz] of [[-0.8, -0.16], [-0.8, 0.16], [0.5, -0.16], [0.5, 0.16]]) {
      solid(s, new CylinderGeometry(0.07, 0.06, 0.75, 8), mx + lx, y0 + 1.05, z + lz, coat);
      solid(s, new CylinderGeometry(0.05, 0.045, 0.72, 8), mx + lx + 0.03, y0 + 0.36, z + lz, dark);
    }
    ellipsoid(-1.08, 1.62, 0.06, 0.1, 0.05, coat);
    s.light(mx, y0 + top - 0.35, z, rgb(0xffe2b0), 0.9, 4);
    physics.box({ x: mx - hx - 0.1, y: y0, z: -hz - 0.1 }, { x: mx + hx + 0.1, y: y0 + top, z: hz + 0.1 });
  }

  if (def.architecture === 'drawings') {
    // The hopscotch cut into the platform, copied from a schoolyard.
    const art = s.artLayer(hopscotchTexture());
    const hx = cx + exitDir * 20;
    const y = y0 + 0.004;
    const [x0, x1, z0, z1] = [hx - 2, hx + 2, -1.0, 1.0];
    art.tri(new Vector3(x0, y, z0), new Vector3(x1, y, z0), new Vector3(x1, y, z1), rgb(0xffffff), { uvs: [[0, 0], [0, 1], [1, 1]] });
    art.tri(new Vector3(x0, y, z0), new Vector3(x1, y, z1), new Vector3(x0, y, z1), rgb(0xffffff), { uvs: [[0, 0], [1, 1], [1, 0]] });
    // Shocking-pink railings at the far end of the platform.
    const pink = rgb(0xe8318a);
    const far = cx - exitDir * PLATFORM_HALF_L;
    for (const side of [-1, 1]) {
      const z = side * (PLATFORM_HALF_W - 0.35);
      const xa = Math.min(far, far + exitDir * 6), xb = Math.max(far, far + exitDir * 6);
      s.lit.box({ x: xa, y: y0 + 1.02, z: z - 0.03 }, { x: xb, y: y0 + 1.1, z: z + 0.03 }, pink);
      s.lit.box({ x: xa, y: y0 + 0.5, z: z - 0.02 }, { x: xb, y: y0 + 0.56, z: z + 0.02 }, pink);
      for (let x = xa; x <= xb + 0.01; x += 1.5) s.lit.box({ x: x - 0.03, y: y0, z: z - 0.03 }, { x: x + 0.03, y: y0 + 1.1, z: z + 0.03 }, pink);
      physics.box({ x: xa, y: y0, z: z - 0.06 }, { x: xb, y: y0 + 1.1, z: z + 0.06 });
    }
  }

  if (def.architecture === 'cubes') {
    // Takashi Naraha's sky: blue cubes painted with clouds, set into the bare rock
    // of the walls and the vault at odd angles, like windows cut into the sky.
    const art = s.artLayer(cloudCubeTexture());
    const rnd = mulberry32(1985 + Math.round(cx));
    // The rock face of the vault at a height, or at a distance out from the middle (see `archProfile`).
    const wallZ = (y: number) => CAVE_HALF_W * Math.sqrt(1 - Math.min(1, Math.max(0, (y - 4.5) / (CAVE_TOP - 4.5))) ** 2) - STATION_ROCK_INSET;
    const roofY = (z: number) => 4.5 + (CAVE_TOP - 4.5) * Math.sqrt(1 - Math.min(1, (z / CAVE_HALF_W) ** 2)) - STATION_ROCK_INSET;
    const cube = (x: number, y: number, z: number, size: number) => {
      const geo = new BoxGeometry(size, size, size);
      const rot = new Euler((rnd() - 0.5) * 0.9, rnd() * Math.PI, (rnd() - 0.5) * 0.9);
      art.geometry(geo, new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(rot), new Vector3(1, 1, 1)), rgb(0xffffff), true);
      geo.dispose();
    };
    for (const side of [-1, 1]) {
      for (let k = 0; k < 8; k++) {
        const x = cx - CAVE_HALF_L + 12 + k * 19 + (rnd() - 0.5) * 6;
        const y = 2.6 + rnd() * 3.2;
        const size = 1.2 + rnd() * 0.7;
        // Half sunk into the rock, half out in the air.
        cube(x, y, side * (wallZ(y) - size * 0.2), size);
      }
    }
    for (let k = 0; k < 5; k++) {
      const z = (rnd() - 0.5) * 6;
      const size = 1.3 + rnd() * 0.5;
      cube(cx - 60 + k * 30 + (rnd() - 0.5) * 8, roofY(z) - size * 0.2, z, size);
    }
  }
}
