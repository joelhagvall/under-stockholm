import { CylinderGeometry, Matrix4, SphereGeometry, Vector3 } from 'three';
import text from '../i18n/sv.json';
import type { MeshBuilder } from '../gfx/builder';
import { rgb } from '../gfx/color';
import { createCanvasSign, fitText } from '../gfx/signs';
import type { Physics } from '../physics';
import type { Section } from './section';
import { place } from './signage';

/**
 * The newsagent kiosk in the ticket hall, against the wall beside the exit
 * stairs: a counter with a coffee machine and a glass case of cinnamon buns,
 * shelves of sweets and magazines, and a neon sign that tints the floor.
 * Built into the hall's baked layers; the clerk and the coffee are in
 * `coffee.ts`.
 */

/** Along the hall from the escalator top (`a`) and across it (`z`). */
export const KIOSK = { a0: 20.6, a1: 25.4, wallZ: -8.95, counterZ: -6.75, counterH: 1.05 };

/**
 * How much further along the hall the kiosk stands: past the door in its wall where a hall under the tracks has its
 * way out on the kiosk's side (`across`, see `world/station.ts`), so it does not stand in the way.
 */
export const kioskShift = (across?: 1 | -1): number => (across === -1 ? 6 : 0);

let neon: ReturnType<typeof createCanvasSign> | null = null;

function neonSign() {
  // A blank from a dry pass is never kept.
  if (!neon || neon.canvas.width === 1) neon = createCanvasSign(1024, 192, (ctx, w, h) => {
    ctx.fillStyle = '#12090b';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, text.kiosk.name, w - 120, 800, 118);
    // A soft halo under crisp tubes.
    ctx.shadowColor = '#ff3d5a';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#ff5c74';
    ctx.fillText(text.kiosk.name, w / 2, h / 2 + 4);
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffe3e8';
    ctx.fillText(text.kiosk.name, w / 2, h / 2 + 4);
  });
  return neon;
}

/**
 * @param X world x at `a` meters into the hall
 * @param Y the hall floor
 */
export function buildKiosk(s: Section, physics: Physics, X: (a: number) => number, Y: number): void {
  const { a0, a1, wallZ, counterZ, counterH } = KIOSK;
  const box = (b: MeshBuilder, pa0: number, pa1: number, y0: number, y1: number, z0: number, z1: number, color: number, collide = false) => {
    const min = { x: Math.min(X(pa0), X(pa1)), y: y0, z: Math.min(z0, z1) };
    const max = { x: Math.max(X(pa0), X(pa1)), y: y1, z: Math.max(z0, z1) };
    b.box(min, max, rgb(color));
    if (collide) physics.box(min, max);
  };
  // Counter with a dark top and a red front.
  box(s.lit, a0, a1, Y, Y + counterH - 0.05, counterZ - 0.6, counterZ, 0xb3162c, true);
  box(s.lit, a0 - 0.05, a1 + 0.05, Y + counterH - 0.05, Y + counterH, counterZ - 0.65, counterZ + 0.05, 0x2b2d31);
  // Side walls, a roof and the back shelves.
  for (const a of [a0 - 0.1, a1]) box(s.lit, a, a + 0.1, Y, Y + 2.9, wallZ, counterZ + 0.05, 0x2b2d31, true);
  box(s.lit, a0 - 0.1, a1 + 0.1, Y + 2.9, Y + 3.05, wallZ, counterZ + 0.2, 0x2b2d31);
  physics.box({ x: Math.min(X(a0), X(a1)), y: Y, z: wallZ }, { x: Math.max(X(a0), X(a1)), y: Y + 2.9, z: counterZ - 0.6 });
  const products = [0xe63946, 0xf4d35e, 0x3a86ff, 0x2ec4b6, 0xf15bb5, 0xff8c42, 0xffffff, 0x6a4c93];
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = Y + 0.5 + shelf * 0.5;
    box(s.lit, a0, a1, y - 0.02, y, wallZ, wallZ + 0.4, 0x8d8980);
    for (let k = 0; k < 16; k++) {
      const pa = a0 + 0.1 + k * 0.29;
      const h = 0.18 + ((k * 7 + shelf * 3) % 5) * 0.04;
      box(s.lit, pa, pa + 0.24, y, y + h, wallZ + 0.05, wallZ + 0.32, products[(k + shelf * 3) % products.length]);
    }
  }
  // Magazines in a rack on the counter's end.
  for (let k = 0; k < 5; k++) box(s.lit, a1 - 0.45, a1 - 0.1, Y + counterH, Y + counterH + 0.36, counterZ - 0.55 + k * 0.1, counterZ - 0.5 + k * 0.1, products[(k * 3 + 1) % products.length]);
  // A coffee machine and a glass case of buns.
  box(s.lit, a0 + 0.3, a0 + 0.8, Y + counterH, Y + counterH + 0.6, counterZ - 0.55, counterZ - 0.2, 0x1c1f24);
  s.unlit.box({ x: Math.min(X(a0 + 0.42), X(a0 + 0.68)), y: Y + counterH + 0.4, z: counterZ - 0.195 }, { x: Math.max(X(a0 + 0.42), X(a0 + 0.68)), y: Y + counterH + 0.5, z: counterZ - 0.19 }, rgb(0x7fd6e8));
  box(s.lit, a0 + 1.2, a0 + 2.2, Y + counterH, Y + counterH + 0.02, counterZ - 0.5, counterZ - 0.1, 0xd8d2c3);
  const bun = new SphereGeometry(0.07, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let k = 0; k < 8; k++) {
    const pa = a0 + 1.32 + (k % 4) * 0.24;
    const z = counterZ - 0.4 + Math.floor(k / 4) * 0.2;
    s.lit.geometry(bun, new Matrix4().makeScale(1, 0.7, 1).setPosition(X(pa), Y + counterH + 0.02, z), (p) => rgb(p.y > Y + counterH + 0.06 ? 0xe9e4d6 : 0xb07a3c));
  }
  bun.dispose();
  const cup = new CylinderGeometry(0.04, 0.032, 0.1, 10);
  for (let k = 0; k < 4; k++) s.lit.geometry(cup, new Matrix4().setPosition(X(a0 + 0.95), Y + counterH + 0.05 + k * 0.1, counterZ - 0.4), rgb(0xf4f1ea));
  cup.dispose();
  // The neon sign above the counter, and its pink glow on the floor.
  place(s, neonSign(), 3.6, 0.68, new Vector3(X((a0 + a1) / 2), Y + 2.62, counterZ + 0.21), new Vector3(0, 0, 1));
  s.light(X((a0 + a1) / 2), Y + 2.2, counterZ + 1.2, rgb(0xff6f8a), 0.9, 6);
  s.light(X((a0 + a1) / 2), Y + 2.4, counterZ - 1, rgb(0xfff1d6), 0.8, 5);
}
