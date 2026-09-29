import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, SRGBColorSpace, Vector3 } from 'three';
import { hash01 } from '../clock';
import { dayNumber, escalatorOutOfOrder } from '../calendar';
import { rgb } from '../gfx/color';
import type { MeshBuilder } from '../gfx/builder';
import { drawEscalatorNotice, drawLostCat, drawPoster, drawSticker, STICKERS } from '../gfx/posters';
import { CAVE_HALF_L, DOOR_XS, ESC_HALF_W, ESC_HEADROOM, PLATFORM_HALF_W, PLATFORM_Y, STATION_DESIGN } from '../layout';
import type { Section } from './section';
import { era } from '../era';

/**
 * The small things that make a station look used: gum trodden into the stone,
 * a snus tin left on a bench, stickers on the pillars and bins, a lost cat
 * notice in the ticket hall, posters that change every day and the notice
 * over the escalators. The flat things share one canvas atlas per station,
 * drawn into a baked art layer, so they cost a single draw call.
 */

const ATLAS_W = 2048;
const ATLAS_H = 640;
const POSTER = { w: 256, h: 384, slots: 6 };
const CAT = { x: 1536, y: 0, w: 256, h: 384 };
const STICKER = { y: 384, size: 128 };
const NOTICE = { y: 512, w: 1024, h: 96 };

/** Poster frames on the rock walls, between the name boards. */
const POSTER_DXS = [-48, -24, 0, 24, 48];
const POSTER_SIZE = { w: 1.3, h: 1.95, y: PLATFORM_Y + 1.55 };

export interface StationClutter {
  /** Redraws the daily posters and the escalator notices. Cheap to call often. `broken` overrides the day's escalator. */
  setDay(epoch: number, broken?: boolean): void;
  /** The A-frame signs by a stopped escalator, shown on its days. */
  readonly outOfOrder: Group;
}

export interface ClutterPlace {
  index: number;
  cx: number;
  exitDir: 1 | -1;
  benches: number[];
  pillars: number[];
  /** Hall coordinates: world x at `a` meters from the escalator top. */
  hallX: (a: number) => number;
  /** The ticket hall's floor. */
  hallY: number;
  hallHalfW: number;
  /** The platform's middle (of a shared station's two, the one to litter), and the walls' posters. */
  platformZ?: number;
  wallZ?: number;
  /** False where there are no walls beside the tracks to hang posters on (in the open air). */
  posters?: boolean;
  /** False where the escalators start out on the platform instead of at its end wall: no notice hangs there. */
  endWall?: boolean;
}

/**
 * A textured quad on a surface with normal `n`, mapped to a pixel rectangle of the atlas.
 * `lift` is its gap to the surface: decals that may overlap need different lifts or they z-fight.
 */
function decal(b: MeshBuilder, center: Vector3, n: Vector3, w: number, h: number, px: number, py: number, pw: number, ph: number, roll = 0, lift = 0.006): void {
  const up = new Vector3(0, 1, 0);
  const right = new Vector3().crossVectors(n.clone().negate(), up).normalize();
  const vUp = up.clone();
  if (roll) {
    const c = Math.cos(roll), s = Math.sin(roll);
    const r2 = right.clone().multiplyScalar(c).addScaledVector(vUp, s);
    vUp.multiplyScalar(c).addScaledVector(right, -s);
    right.copy(r2);
  }
  const at = (sx: number, sy: number) => center.clone().addScaledVector(right, sx * w / 2).addScaledVector(vUp, sy * h / 2).addScaledVector(n, lift);
  const u0 = px / ATLAS_W, u1 = (px + pw) / ATLAS_W;
  const v1 = 1 - py / ATLAS_H, v0 = 1 - (py + ph) / ATLAS_H;
  const white = rgb(0xffffff);
  const bl = at(-1, -1), br = at(1, -1), tr = at(1, 1), tl = at(-1, 1);
  b.tri(bl, br, tr, white, { uvs: [[u0, v0], [u1, v0], [u1, v1]] });
  b.tri(bl, tr, tl, white, { uvs: [[u0, v0], [u1, v1], [u0, v1]] });
}

/** A small dark blot trodden into the floor. */
function gum(b: MeshBuilder, x: number, y: number, z: number, r: number, shade: number): void {
  const c = new Vector3(x, y, z);
  const paint = rgb(shade);
  const sides = 7;
  for (let k = 0; k < sides; k++) {
    const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
    b.tri(c, new Vector3(x + Math.cos(a1) * r, y, z + Math.sin(a1) * r), new Vector3(x + Math.cos(a0) * r, y, z + Math.sin(a0) * r), paint);
  }
}

export function buildClutter(s: Section, place: ClutterPlace): StationClutter {
  if (s.dry) return { setDay() {}, outOfOrder: new Group() };
  const { index, cx, exitDir: e } = place;
  const pz = place.platformZ ?? 0;
  const r = (k: number) => hash01(index * 1000 + k, 23);

  // Chewing gum: most of it by the benches and where the doors open.
  const floorY = PLATFORM_Y + 0.006;
  let k = 0;
  for (const bx of place.benches) {
    for (let i = 0; i < 14; i++, k++) {
      const x = bx + (r(k) - 0.5) * 4.2;
      const z = (r(k + 500) - 0.5) * 3.2;
      if (Math.abs(z) < 0.6 && Math.abs(x - bx) < 1.2) continue;
      gum(s.floor, x, floorY, pz + z, 0.018 + r(k + 900) * 0.022, r(k + 1300) < 0.5 ? 0x3c3a36 : 0x55524c);
    }
  }
  for (const d of DOOR_XS) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++, k++) {
        const x = cx + d + (r(k) - 0.5) * 1.8;
        const z = side * (PLATFORM_HALF_W - 0.3 - r(k + 500) * 1.4);
        gum(s.floor, x, floorY, pz + z, 0.016 + r(k + 900) * 0.02, r(k + 1300) < 0.5 ? 0x3c3a36 : 0x4d4a45);
      }
    }
  }

  // Snus: an empty tin on a bench and a used pouch under it.
  const bench = place.benches[Math.floor(r(2000) * place.benches.length)];
  const tin = new CylinderGeometry(0.034, 0.034, 0.022, 16);
  const tinSide = r(2001) < 0.5 ? -1 : 1;
  s.lit.geometry(tin, new Matrix4().setPosition(bench + (r(2002) - 0.5) * 1.4, PLATFORM_Y + 0.511, pz + tinSide * 0.32), (_p, n) => (n.y > 0.5 ? rgb(r(2003) < 0.5 ? 0x1d3b6e : 0x121417) : rgb(0xd8dadc)));
  tin.dispose();
  s.lit.box({ x: bench - 1.5, y: PLATFORM_Y, z: pz + tinSide * 0.8 }, { x: bench - 1.465, y: PLATFORM_Y + 0.008, z: pz + tinSide * 0.8 + 0.02 }, rgb(0xe6e1d3));

  // The atlas: posters, the lost cat, stickers and the escalator notices.
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  drawLostCat(ctx, CAT.x, CAT.y, CAT.w, CAT.h);
  for (let i = 0; i < STICKERS; i++) drawSticker(ctx, i * STICKER.size + 4, STICKER.y + 4, STICKER.size - 8, i);
  const layer = s.artLayer(texture, true);

  // Posters face the platform from both rock walls.
  const wallZ = place.wallZ ?? STATION_DESIGN.nameBoardZ;
  let slot = 0;
  for (const side of place.posters === false ? [] : [-1, 1]) {
    for (const dx of POSTER_DXS) {
      const x = cx + dx;
      const n = new Vector3(0, 0, -side);
      s.lit.box({ x: x - POSTER_SIZE.w / 2 - 0.05, y: POSTER_SIZE.y - POSTER_SIZE.h / 2 - 0.05, z: side * wallZ - 0.02 }, { x: x + POSTER_SIZE.w / 2 + 0.05, y: POSTER_SIZE.y + POSTER_SIZE.h / 2 + 0.05, z: side * wallZ + 0.02 }, rgb(0x2b2e33));
      const p = slot++ % POSTER.slots;
      decal(layer, new Vector3(x, POSTER_SIZE.y, side * wallZ - side * 0.02), n, POSTER_SIZE.w, POSTER_SIZE.h, p * POSTER.w, 0, POSTER.w, POSTER.h);
    }
  }

  // Stickers on the information pillars and litter bins, at hand height.
  k = 3000;
  // The second sticker on a pillar face may overlap the first, so it sits on top of it.
  const sticker = (center: Vector3, n: Vector3, layerIndex = 0) => {
    const id = Math.floor(r(k++) * STICKERS);
    const size = 0.08 + r(k++) * 0.05;
    decal(layer, center, n, size, size, id * STICKER.size, STICKER.y, STICKER.size, STICKER.size, (r(k++) - 0.5) * 0.6, 0.006 + layerIndex * 0.004);
  };
  for (const dx of place.pillars) {
    const px = cx + dx;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) sticker(new Vector3(px + (r(k++) - 0.5) * 0.4, PLATFORM_Y + 1.0 + r(k++) * 0.35, pz + side * 0.3), new Vector3(0, 0, side), i);
    }
    sticker(new Vector3(px + 0.3, PLATFORM_Y + 1.7 + r(k++) * 0.5, pz + (r(k++) - 0.5) * 0.4), new Vector3(1, 0, 0));
  }
  for (const bx of place.benches) {
    const lx = bx + 1.6;
    if (r(k++) < 0.4) continue;
    sticker(new Vector3(lx + 0.225, PLATFORM_Y + 0.45 + r(k++) * 0.3, pz + (r(k++) - 0.5) * 0.25), new Vector3(1, 0, 0));
    if (r(k++) < 0.5) sticker(new Vector3(lx + (r(k++) - 0.5) * 0.25, PLATFORM_Y + 0.45 + r(k++) * 0.3, pz + 0.225), new Vector3(0, 0, 1));
  }

  // The lost cat, taped to the hall wall beside the line map.
  const hx = place.hallX;
  const W = place.hallHalfW;
  decal(layer, new Vector3(hx(9.2), place.hallY + 1.55, -W + 0.02), new Vector3(0, 0, 1), 0.36, 0.54, CAT.x, CAT.y, CAT.w, CAT.h, 0.03);

  // Notices over the escalator, at the bottom (facing the platform) and at the top (facing the hall).
  const wallX = cx + e * CAVE_HALF_L;
  if (place.endWall !== false) decal(layer, new Vector3(wallX - e * 0.03, PLATFORM_Y + ESC_HEADROOM + 0.45, pz), new Vector3(-e, 0, 0), 3.2, 0.3, 0, NOTICE.y, NOTICE.w, NOTICE.h);
  decal(layer, new Vector3(hx(0) + e * 0.03, place.hallY + ESC_HEADROOM + 0.4, 0), new Vector3(e, 0, 0), 3.2, 0.3, NOTICE.w, NOTICE.y, NOTICE.w, NOTICE.h);

  // A-frame signs beside the stopped down escalator (the -z lane), top and bottom.
  const outOfOrder = new Group();
  outOfOrder.name = 'escalator-out-of-order';
  outOfOrder.visible = false;
  const frameMaterial = new MeshBasicMaterial({ map: texture, color: 0xd9d9d9 });
  const legMaterial = new MeshBasicMaterial({ color: 0x3a3a3c });
  for (const [x, y, facing, z0] of [[wallX - e * 1.2, PLATFORM_Y, -e, pz], [hx(0) + e * 1.2, place.hallY, e, 0]] as const) {
    const board = new Mesh(new BoxGeometry(0.02, 0.5, 0.9), [legMaterial, legMaterial, legMaterial, legMaterial, legMaterial, legMaterial]);
    board.position.set(x, y + 0.75, z0 - ESC_HALF_W + 0.55);
    outOfOrder.add(board);
    const face = new Mesh(new BoxGeometry(0.001, 0.44, 0.84), frameMaterial);
    face.position.set(x + facing * 0.012, y + 0.75, z0 - ESC_HALF_W + 0.55);
    // Only the facing side shows the notice texture.
    const uv = face.geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * NOTICE.w) / ATLAS_W, 1 - (NOTICE.y + (1 - uv.getY(i)) * NOTICE.h) / ATLAS_H);
    outOfOrder.add(face);
    for (const dz of [-0.4, 0.4]) {
      const leg = new Mesh(new BoxGeometry(0.03, 1.0, 0.03), legMaterial);
      leg.position.set(x, y + 0.5, z0 - ESC_HALF_W + 0.55 + dz);
      outOfOrder.add(leg);
    }
  }
  s.extras.add(outOfOrder);

  let drawnDay = -1;
  let drawnBroken: boolean | null = null;
  let drawnEra = era.get();
  return {
    outOfOrder,
    setDay(epoch, real) {
      const day = dayNumber(epoch);
      const broken = real ?? escalatorOutOfOrder(epoch, index);
      if (day === drawnDay && broken === drawnBroken && era.get() === drawnEra) return;
      const date = new Date(day * 86400000);
      const bunDay = date.getUTCMonth() === 9 && date.getUTCDate() === 4;
      if (day !== drawnDay || era.get() !== drawnEra) {
        drawnEra = era.get();
        for (let p = 0; p < POSTER.slots; p++) {
          const seed = Math.floor(hash01(day * 31 + p, index + 90) * 1e9);
          drawPoster(ctx, p * POSTER.w, 0, POSTER.w, POSTER.h, seed, day, bunDay && p === 2 && !era.past ? 'Kanelbullens dag' : undefined, era.past);
        }
      }
      drawEscalatorNotice(ctx, 0, NOTICE.y, NOTICE.w, NOTICE.h, broken);
      drawEscalatorNotice(ctx, NOTICE.w, NOTICE.y, NOTICE.w, NOTICE.h, broken);
      drawnDay = day;
      drawnBroken = broken;
      outOfOrder.visible = broken;
      texture.needsUpdate = true;
    },
  };
}
