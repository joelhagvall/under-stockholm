import type { Texture } from 'three';
import { ellipse, poly, vault, type Vault } from '../stationArt';
import { cached, canvas, finish, mulberry32 } from '../textures';

/**
 * The red line's station art, after the real stations: each a texture round
 * the station's cross-section (see `vault` in `stationArt.ts`: v = 0 and 1
 * are the feet of the two walls, h on a wall is meters up from the rails),
 * repeating every `period` meters along the platform. Drawn from photos and
 * descriptions in the spirit of the originals, not traced.
 */

export interface Art {
  texture: Texture;
  period: number;
}

type Ctx = CanvasRenderingContext2D;

/** A station's artwork from a painter, given the cross-section's length and how high its walls stand. */
function art(key: string, period: number, seed: number, paint: (v: Vault, wallH: number) => void) {
  return (arc: number, wallH = 5.6): Art => ({ period, texture: vault(`red-${key}-${wallH.toFixed(1)}`, period, arc, seed, (v) => paint(v, wallH)) });
}

/** How high a wall stands above the rails, from the art's `wallH` (measured from the track bed at -0.5). */
const top = (wallH: number) => wallH - 0.5;

/** A band across the whole wall (and its wraps), from h0 to h1 up. */
function band(g: Ctx, period: number, h0: number, h1: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(-period, h0, period * 3, h1 - h0);
}

/** The whole cross-section in one colour. */
function fill(v: Vault, color: string): void {
  v.ctx.fillStyle = color;
  v.ctx.fillRect(-v.period, 0, v.period * 3, v.arc);
}

/** A hex colour a little lighter or darker, as CSS. */
function shade(hex: number, amount: number): string {
  const c = [16, 8, 0].map((b) => Math.max(0, Math.min(255, Math.round(((hex >> b) & 255) + amount))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/**
 * Tiles `w` by `h` meters from x0 to x1 and h0 to h1 over grout, each coloured by `color(i, j)`. With `stagger`
 * every other row is set half a tile along. Tiles are cut at the edges, so a grid over a whole period repeats cleanly.
 */
function tileGrid(g: Ctx, x0: number, x1: number, h0: number, h1: number, w: number, h: number, grout: string, color: (i: number, j: number) => string, stagger = false, gap = 0.018): void {
  g.fillStyle = grout;
  g.fillRect(x0, h0, x1 - x0, h1 - h0);
  for (let j = 0; h0 + j * h < h1 - 0.001; j++) {
    const off = stagger && j % 2 ? w / 2 : 0;
    const y = h0 + j * h;
    const th = Math.min(h, h1 - y);
    for (let i = off ? -1 : 0; x0 + i * w + off < x1 - 0.001; i++) {
      const a = Math.max(x0, x0 + i * w + off);
      const b = Math.min(x1, x0 + (i + 1) * w + off);
      g.fillStyle = color(i, j);
      g.fillRect(a + gap / 2, y + gap / 2, b - a - gap, th - gap);
    }
  }
}

/** Text the right way up on a wall at (x, h), without wrapping: for things that sit inside the period. */
function letter(g: Ctx, s: string, x: number, h: number, size: number, color: string, font = '700'): void {
  g.save();
  g.translate(x, h);
  g.scale(1, -1);
  g.fillStyle = color;
  g.font = `${font} ${size}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(s, 0, 0);
  g.restore();
}

/** Soft blotches over sprayed rock, lighter and darker than its paint, over the whole cross-section: `colors` as r, g, b. */
function mottle(v: Vault, colors: string[], count: number, size = 1.6): void {
  const { ctx } = v;
  for (let i = 0; i < count; i++) {
    const x = v.rnd() * v.period, y = v.rnd() * v.arc, r = size * (0.4 + v.rnd());
    const color = colors[i % colors.length];
    v.wrap(() => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${color}, 0.3)`);
      g.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
  }
}

/** A stroke through the points, in meters. */
function line(g: Ctx, points: Array<[number, number]>, color: string, width: number): void {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
}

// ---------------------------------------------------------------- Karlaplan

/**
 * White enamel track walls over a black base under a white vault, and along
 * one wall Larseric Vänerlöf's photomontage "Den dagen, den sorgen": a band
 * of black and white pictures, city streets and crowds, colonnades and
 * visions of fire.
 */
export const karlaplanArt = art('karlaplan', 24, 1977, (v, wallH) => {
  fill(v, '#efeee9');
  const greys = ['#1d1d1d', '#3a3a3a', '#595959', '#7c7c7c', '#a2a2a2', '#c8c8c8', '#e4e4e4'];
  for (const edge of [0, 1] as const) {
    v.wall(edge, ({ ctx: g }) => {
      band(g, v.period, -1, 1.25, '#1b1b1c');
      // Enamel panels, 1.2 meters wide.
      tileGrid(g, 0, v.period, 1.25, top(wallH), 1.2, 1.1, '#b9b9b6', (i, j) => shade(0xefeeea, ((i * 7 + j * 3) % 5) - 2), false, 0.02);
      if (edge === 1) { band(g, v.period, 2.55, 2.68, '#1b1b1c'); return; }
      band(g, v.period, 1.98, 3.42, '#141414');
      // Frames of the montage, each its own picture.
      let x = 0;
      let k = 0;
      while (x < v.period - 0.5) {
        const w = Math.min(v.period - x, 2.2 + v.rnd() * 3);
        const [x0, x1, h0, h1] = [x + 0.03, x + w - 0.03, 2.06, 3.34];
        const sky = g.createLinearGradient(0, h0, 0, h1);
        sky.addColorStop(0, greys[3]);
        sky.addColorStop(1, greys[6]);
        g.fillStyle = sky;
        g.fillRect(x0, h0, x1 - x0, h1 - h0);
        g.save();
        g.beginPath();
        g.rect(x0, h0, x1 - x0, h1 - h0);
        g.clip();
        const kind = k % 5;
        if (kind === 0) {
          // A city street: blocks with rows of windows, and people in the foreground.
          for (let bx = x0; bx < x1; bx += 0.3 + v.rnd() * 0.4) {
            const bh = h0 + 0.4 + v.rnd() * 0.8;
            g.fillStyle = greys[1 + Math.floor(v.rnd() * 3)];
            g.fillRect(bx, h0, 0.35, bh - h0);
            g.fillStyle = greys[5];
            for (let wy = h0 + 0.3; wy < bh - 0.08; wy += 0.12) for (let wx = bx + 0.05; wx < bx + 0.3; wx += 0.09) g.fillRect(wx, wy, 0.04, 0.05);
          }
        } else if (kind === 1) {
          // A colonnade running away in perspective.
          const cx = (x0 + x1) / 2;
          for (let c = 0; c < 7; c++) {
            const t = c / 7;
            for (const s of [-1, 1]) {
              const px = cx + s * (1.1 - t * 0.9) * (x1 - x0) / 2.4;
              g.fillStyle = greys[6 - Math.floor(t * 4)];
              g.fillRect(px - 0.07 * (1 - t), h0 + 0.05 + t * 0.35, 0.14 * (1 - t) + 0.02, 1.1 - t * 0.7);
            }
          }
          g.fillStyle = greys[1];
          g.fillRect(x0, h0, x1 - x0, 0.08);
        } else if (kind === 2) {
          // Fire and falling figures, as in a vision of hell.
          const fire = g.createLinearGradient(0, h0, 0, h1);
          fire.addColorStop(0, greys[0]);
          fire.addColorStop(0.6, greys[4]);
          fire.addColorStop(1, greys[1]);
          g.fillStyle = fire;
          g.fillRect(x0, h0, x1 - x0, h1 - h0);
          for (let f = 0; f < 18; f++) {
            const fx = x0 + v.rnd() * (x1 - x0), fh = 0.3 + v.rnd() * 0.6;
            poly(g, [[fx - 0.12, h0], [fx + 0.12, h0], [fx + (v.rnd() - 0.5) * 0.2, h0 + fh]], greys[5 + (f % 2)]);
          }
          for (let f = 0; f < 5; f++) {
            const fx = x0 + 0.3 + v.rnd() * (x1 - x0 - 0.6), fy = h0 + 0.6 + v.rnd() * 0.5;
            ellipse(g, fx, fy + 0.18, 0.05, 0.05, greys[0]);
            line(g, [[fx - 0.12, fy + 0.25], [fx, fy + 0.1], [fx + 0.12, fy + 0.25]], greys[0], 0.03);
            line(g, [[fx, fy + 0.13], [fx, fy - 0.08], [fx - 0.08, fy - 0.2]], greys[0], 0.035);
          }
        } else if (kind === 3) {
          // A great globe over a crowd of heads.
          ellipse(g, (x0 + x1) / 2, h0 + 0.8, 0.45, 0.45, greys[4], greys[1], 0.03);
          for (let l = -2; l <= 2; l++) ellipse(g, (x0 + x1) / 2, h0 + 0.8 + l * 0.15, Math.sqrt(1 - (l * 0.33) ** 2) * 0.45, 0.02, greys[2]);
          for (let p = 0; p < 16; p++) {
            const px = x0 + v.rnd() * (x1 - x0);
            ellipse(g, px, h0 + 0.36, 0.07, 0.08, greys[1 + (p % 2)]);
            g.fillStyle = greys[p % 2];
            g.fillRect(px - 0.1, h0, 0.2, 0.3);
          }
        } else {
          // A face in close-up, in a man's hat.
          const cx = (x0 + x1) / 2;
          ellipse(g, cx, h0 + 0.6, 0.34, 0.42, greys[4]);
          ellipse(g, cx - 0.12, h0 + 0.68, 0.05, 0.03, greys[0]);
          ellipse(g, cx + 0.12, h0 + 0.68, 0.05, 0.03, greys[0]);
          g.fillStyle = greys[1];
          g.fillRect(cx - 0.12, h0 + 0.42, 0.24, 0.04);
          g.fillStyle = greys[0];
          g.fillRect(cx - 0.5, h0 + 0.92, 1.0, 0.07);
          g.fillRect(cx - 0.3, h0 + 0.95, 0.6, 0.28);
          g.fillStyle = greys[2];
          g.fillRect(cx - 0.6, h0, 1.2, 0.2);
        }
        g.restore();
        x += w;
        k++;
      }
    });
  }
});

// ---------------------------------------------------------------- Mälarhöjden

/**
 * Margareta Carlstedt's "Ebb och flod": 190 meters of enamel plates along
 * the track walls, a pale ground washed in blue, sky blue, grey-green and
 * ochre, flowing like water, over a black base, under a white barrel vault.
 */
export const malarhojdenArt = art('malarhojden', 24, 1965, (v) => {
  fill(v, '#eeede8');
  const washes = ['#2c5cb0', '#7ab0d8', '#8ea890', '#d8b43a', '#7ab0d8', '#2c5cb0', '#8ea890', '#d87a3a'];
  for (const edge of [0, 1] as const) {
    v.wall(edge, ({ ctx: g, wrap }) => {
      band(g, v.period, -1, 1.3, '#1c1c1e');
      band(g, v.period, 1.3, 3.55, '#dfe2e0');
      g.save();
      g.beginPath();
      g.rect(-v.period, 1.3, v.period * 3, 2.25);
      g.clip();
      // Watercolour washes: long ribbons with wavy edges, thin over thick.
      for (let i = 0; i < 70; i++) {
        const x0 = v.rnd() * v.period, len = 1.5 + v.rnd() * 5, h = 1.4 + v.rnd() * 2.05, t = 0.06 + v.rnd() * 0.32;
        const color = washes[i % washes.length];
        const alpha = 0.35 + v.rnd() * 0.5;
        const wave = v.rnd() * 6;
        wrap(() => {
          g.globalAlpha = alpha;
          g.fillStyle = color;
          g.beginPath();
          const steps = 14;
          for (let s = 0; s <= steps; s++) {
            const x = x0 + (len * s) / steps;
            const y = h + Math.sin(wave + s * 0.7) * 0.08;
            if (s) g.lineTo(x, y); else g.moveTo(x, y);
          }
          for (let s = steps; s >= 0; s--) {
            const x = x0 + (len * s) / steps;
            const taper = Math.sin((Math.PI * s) / steps);
            g.lineTo(x, h + Math.sin(wave + s * 0.9) * 0.05 + t * taper);
          }
          g.closePath();
          g.fill();
          g.globalAlpha = 1;
        });
      }
      g.restore();
      // The seams between the plates, 0.6 meters wide in two rows.
      g.fillStyle = 'rgba(90, 96, 100, 0.55)';
      for (let x = 0; x < v.period; x += 0.6) g.fillRect(x - 0.008, 1.3, 0.016, 2.25);
      band(g, v.period, 2.42, 2.435, 'rgba(90, 96, 100, 0.55)');
      band(g, v.period, 3.55, 3.6, '#b8b8b2');
    });
  }
});

// ---------------------------------------------------------------- Midsommarkransen

/**
 * Shiny tall tiles in a pale olive beige, a dark brown frieze along the top
 * of the walls and a thin blue band with a red line at sign height, under a
 * low white ceiling.
 */
export const midsommarkransenArt = art('midsommarkransen', 12, 1964, (v, wallH) => {
  fill(v, '#e6e4de');
  for (const edge of [0, 1] as const) {
    v.wall(edge, ({ ctx: g }) => {
      const h1 = top(wallH);
      tileGrid(g, 0, v.period, -0.5, h1 - 0.38, 0.06, 0.2, '#a8a283', (i, j) => shade(0xcfc9a8, ((i * 13 + j * 7) % 9) - 4), false, 0.012);
      band(g, v.period, h1 - 0.38, h1, '#5a3428');
      band(g, v.period, 2.62, 2.7, '#2a4a90');
      band(g, v.period, 2.52, 2.55, '#b8342a');
      band(g, v.period, -1, 0.9, '#3c3a34');
    });
  }
});

// ---------------------------------------------------------------- Masmo

/**
 * Rock painted charcoal, cracked with pale veins, blue-grey mesh panels low
 * along the track walls under a white band, a dark mesh ceiling, and
 * Staffan Hallström and Lasse Andréasson's "Ta ner solen i tunnelbanan":
 * pale mesh plates with a yellow sun, a procession, a rider on a white
 * horse, flags, and plates like playing cards with red diamonds.
 */
export const masmoArt = art('masmo', 30, 1972, (v, wallH) => {
  const { ctx } = v;
  // The ceiling: dark mesh with its frames.
  fill(v, '#2c2d2f');
  ctx.fillStyle = 'rgba(120, 124, 128, 0.35)';
  for (let x = 0; x < v.period; x += 0.6) ctx.fillRect(x, 0, 0.04, v.arc);
  for (let y = 0; y < v.arc; y += 1.8) ctx.fillRect(-v.period, y, v.period * 3, 0.05);
  const outline = '#1e1e1e';
  for (const edge of [0, 1] as const) {
    v.wall(edge, ({ ctx: g, wrap }) => {
      band(g, v.period, -1, top(wallH), '#39393b');
      // Pale veins where the paint has cracked.
      for (let i = 0; i < 26; i++) {
        let x = v.rnd() * v.period, h = 1.8 + v.rnd() * 3;
        const pts: Array<[number, number]> = [[x, h]];
        for (let s = 0; s < 5; s++) { x += (v.rnd() - 0.5) * 0.5; h -= 0.1 + v.rnd() * 0.3; pts.push([x, h]); }
        wrap(() => line(g, pts, 'rgba(210, 210, 204, 0.6)', 0.03));
      }
      // Mesh panels in blue-grey frames, and the white band over them.
      tileGrid(g, 0, v.period, -0.5, 1.45, 1.5, 1.95, '#3a5870', () => '#4a5c6c', false, 0.07);
      g.fillStyle = 'rgba(30, 40, 50, 0.35)';
      for (let x = 0; x < v.period; x += 0.1) g.fillRect(x, -0.4, 0.03, 1.8);
      band(g, v.period, 1.45, 1.75, '#e8e8e4');
      // A mesh plate, pale grey, with its lattice.
      const plate = (x0: number, x1: number, h0: number, h1: number) => {
        g.fillStyle = '#b4b4b0';
        g.fillRect(x0, h0, x1 - x0, h1 - h0);
        g.strokeStyle = 'rgba(70, 70, 70, 0.35)';
        g.lineWidth = 0.02;
        for (let x = x0; x < x1; x += 0.12) { g.beginPath(); g.moveTo(x, h0); g.lineTo(x + 0.3, h1); g.stroke(); }
      };
      const offset = edge * 11;
      // The procession under the sun, and the rider with the flags.
      const px = 2 + offset;
      plate(px, px + 6, 2.1, 4.4);
      ellipse(g, px + 0.8, 3.75, 0.45, 0.45, '#e8c830');
      for (let f = 0; f < 7; f++) {
        const fx = px + 1.7 + f * 0.24;
        ellipse(g, fx, 3.05, 0.07, 0.08, '#d8d6d0');
        poly(g, [[fx - 0.13, 2.3], [fx + 0.13, 2.3], [fx + 0.08, 2.98], [fx - 0.08, 2.98]], f % 3 ? '#2a2a2c' : '#5a5a5e');
      }
      poly(g, [[px + 3.8, 2.6], [px + 4.6, 2.6], [px + 4.7, 2.95], [px + 4.5, 3.05], [px + 3.7, 2.95]], '#f2f0ea', outline, 0.02);
      for (const lx of [3.85, 4.0, 4.45, 4.6]) { g.fillStyle = '#f2f0ea'; g.fillRect(px + lx, 2.25, 0.05, 0.38); }
      poly(g, [[px + 4.6, 2.95], [px + 4.85, 3.25], [px + 4.75, 3.35], [px + 4.5, 3.05]], '#f2f0ea', outline, 0.02);
      poly(g, [[px + 4.1, 2.95], [px + 4.3, 2.95], [px + 4.28, 3.35], [px + 4.12, 3.35]], '#d8b43a');
      ellipse(g, px + 4.2, 3.43, 0.07, 0.08, '#e0dcd2');
      for (const [fx, color] of [[5.2, '#c8302a'], [5.45, '#e8c830'], [5.7, '#2a5ab0']] as const) {
        g.fillStyle = '#d8d6d0';
        g.fillRect(px + fx, 2.3, 0.03, 1.5);
        poly(g, [[px + fx + 0.03, 3.3], [px + fx + 0.45, 3.45], [px + fx + 0.38, 3.8], [px + fx + 0.03, 3.8]], color);
      }
      // Plates like playing cards, a red diamond or two on white.
      for (let c = 0; c < 4; c++) {
        const cx = 10.5 + offset + c * 1.4;
        g.fillStyle = '#f4f3ef';
        g.fillRect(cx - 0.5, 2.3, 1.0, 1.6);
        for (let d = 0; d <= c % 2; d++) {
          const dy = 3.1 + (c % 2 ? (d ? 0.3 : -0.3) : 0);
          poly(g, [[cx, dy - 0.2], [cx + 0.13, dy], [cx, dy + 0.2], [cx - 0.13, dy]], '#c8302a');
        }
      }
    });
  }
});

// ---------------------------------------------------------------- Aspudden

/**
 * Under a white vault, one wall in tall tiles checkered dark teal, blue-grey
 * and pale sea green; the other in small white tiles over a dark base, with
 * Pär Gunnar Thelander's enamel leaves and flames, red, yellow, cobalt and
 * violet, at head height every few meters.
 */
export const aspuddenArt = art('aspudden', 16, 1987, (v, wallH) => {
  fill(v, '#eeece4');
  const teal = [0x2e6b78, 0x2e6b78, 0x7fa3ad, 0xb9d0cc, 0x3f7f88];
  v.wall(0, ({ ctx: g }) => {
    tileGrid(g, 0, v.period, -0.5, top(wallH) - 0.4, 0.2, 0.25, '#c8ccc6', (i, j) => shade(teal[(i * 7 + j * 3 + ((i * j) % 3)) % teal.length], ((i + j) % 3) * 4 - 4), true, 0.015);
    band(g, v.period, top(wallH) - 0.4, top(wallH), '#151515');
    band(g, v.period, -1, 0.8, '#2a2622');
  });
  v.wall(1, ({ ctx: g }) => {
    tileGrid(g, 0, v.period, -0.5, top(wallH), 0.1, 0.1, '#c4c4c0', (i, j) => shade(0xe6e6e2, ((i * 5 + j * 11) % 7) - 3), false, 0.012);
    band(g, v.period, -1, 0.8, '#2a2622');
    const colors = ['#c8201e', '#e0b020', '#2a3aa0', '#6a4aa0'];
    // The enamel shapes: tall leaves pointed at both ends, some in pairs, leaning a little.
    for (let k = 0; k < 2; k++) {
      const x = 3 + k * 8;
      for (let p = 0; p <= k; p++) {
        const lx = x + p * 0.55, color = colors[(k * 2 + p) % colors.length], lean = (p ? 0.12 : -0.08);
        g.save();
        g.translate(lx, 2.35);
        g.rotate(lean);
        g.beginPath();
        g.moveTo(0, -0.75);
        g.bezierCurveTo(0.32, -0.3, 0.28, 0.4, 0, 0.8);
        g.bezierCurveTo(-0.26, 0.4, -0.3, -0.3, 0, -0.75);
        g.fillStyle = color;
        g.fill();
        g.restore();
      }
    }
  });
});

// ---------------------------------------------------------------- Skärholmen

/**
 * White square tiles with a black band and a black base, under a flat grey
 * concrete ceiling, and Ulf Wahlberg's paintings of a New Mexico landscape
 * from sunrise to sunset along the track walls; on one wall a square mosaic
 * of black, navy and grey with a red dot.
 */
export const skarholmenArt = art('skarholmen', 20, 1990, (v) => {
  fill(v, '#b4b2ac');
  // Board marks in the concrete.
  v.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  for (let x = 0; x < v.period; x += 0.15) v.ctx.fillRect(x, 0, 0.02, v.arc);
  const skies: Array<[string, string, string]> = [['#f2a860', '#f6d8a0', '#a8c8e0'], ['#5a86c8', '#a8c8e8', '#f0e0c0'], ['#d8604a', '#f0a070', '#6a5a8a']];
  for (const edge of [0, 1] as const) {
    v.wall(edge, ({ ctx: g }) => {
      tileGrid(g, 0, v.period, -0.5, 3.6, 0.15, 0.15, '#c8c8c4', (i, j) => shade(0xeeeeec, ((i * 3 + j * 5) % 5) - 2), false, 0.012);
      band(g, v.period, -1, 0.95, '#1e1e1e');
      band(g, v.period, 3.0, 3.13, '#1e1e1e');
      // The paintings: desert, mesas and sky.
      for (let k = 0; k < 2; k++) {
        const [x0, x1, h0, h1] = [2.5 + k * 9 + edge * 2, 5.5 + k * 9 + edge * 2, 1.2, 2.9];
        const [top0, mid, low] = skies[(k + edge) % skies.length];
        const sky = g.createLinearGradient(0, h1, 0, h0);
        sky.addColorStop(0, top0);
        sky.addColorStop(0.55, mid);
        sky.addColorStop(1, low);
        g.fillStyle = sky;
        g.fillRect(x0, h0, x1 - x0, h1 - h0);
        ellipse(g, x0 + 0.8 + k * 1.2, h0 + 1.1, 0.16, 0.16, '#fff0c8');
        poly(g, [[x0, h0], [x0, h0 + 0.55], [x0 + 0.5, h0 + 0.6], [x0 + 0.6, h0 + 0.9], [x0 + 1.3, h0 + 0.9], [x0 + 1.4, h0 + 0.55], [x1, h0 + 0.45], [x1, h0]], '#b0603a');
        poly(g, [[x0, h0], [x0, h0 + 0.3], [x1, h0 + 0.22], [x1, h0]], '#d89a5a');
        g.strokeStyle = '#2a2a2a';
        g.lineWidth = 0.05;
        g.strokeRect(x0, h0, x1 - x0, h1 - h0);
      }
      if (edge === 1) {
        // The mosaic.
        const [mx, mh, s] = [8.2, 1.2, 1.7];
        g.fillStyle = '#e8e6e0';
        g.fillRect(mx, mh, s, s);
        const shards = ['#141414', '#1e2a5a', '#6a6e78', '#a8aab0', '#d8c8a8', '#141414'];
        for (let i = 0; i < 16; i++) {
          const cx = mx + v.rnd() * s, cy = mh + v.rnd() * s, r = 0.15 + v.rnd() * 0.35;
          poly(g, [[cx, cy], [Math.min(mx + s, cx + r), cy + (v.rnd() - 0.5) * r], [Math.min(mx + s, cx + r * v.rnd()), Math.min(mh + s, cy + r)]], shards[i % shards.length]);
        }
        ellipse(g, mx + s * 0.35, mh + s * 0.6, 0.08, 0.08, '#d8302a');
      }
    });
  }
});

// ---------------------------------------------------------------- Alby

/**
 * Olle Ängkvist's cave: rock painted moss green all over, and on it flowers,
 * birds, snakes, suns, running figures and squiggles in red, orange,
 * yellow, blue, sky blue, pink and white, as in a painted cave.
 */
export const albyArt = art('alby', 18, 1975, (v) => {
  fill(v, '#2f8a3a');
  mottle(v, ['20, 90, 30', '80, 170, 80'], 90, 1.4);
  const { ctx, rnd } = v;
  const colors = ['#d83a2a', '#e8742a', '#e8c83a', '#3a5ad0', '#8ab8e8', '#e89ab0', '#f2f2ea'];
  const pick = () => colors[Math.floor(rnd() * colors.length)];
  const bird = (x: number, y: number, s: number) => {
    for (let r = 0; r < 5; r++) {
      ctx.strokeStyle = colors[r % 4];
      ctx.lineWidth = 0.07 * s;
      ctx.beginPath();
      ctx.arc(x + 0.2 * s, y + 0.1 * s, (0.25 + r * 0.1) * s, Math.PI * 0.95, Math.PI * 1.65);
      ctx.stroke();
    }
    ellipse(ctx, x, y, 0.28 * s, 0.2 * s, '#3a5ad0');
    ellipse(ctx, x - 0.35 * s, y - 0.2 * s, 0.1 * s, 0.1 * s, '#3a5ad0', '#d83a2a', 0.03 * s);
    line(ctx, [[x - 0.1 * s, y + 0.2 * s], [x - 0.2 * s, y + 0.45 * s]], '#d83a2a', 0.05 * s);
    line(ctx, [[x + 0.1 * s, y + 0.2 * s], [x + 0.25 * s, y + 0.45 * s]], '#d83a2a', 0.05 * s);
  };
  const runner = (x: number, y: number, s: number, color: string) => {
    ellipse(ctx, x, y - 0.4 * s, 0.1 * s, 0.1 * s, color);
    line(ctx, [[x, y - 0.3 * s], [x + 0.05 * s, y + 0.05 * s]], color, 0.1 * s);
    line(ctx, [[x - 0.25 * s, y - 0.25 * s], [x, y - 0.18 * s], [x + 0.25 * s, y - 0.3 * s]], color, 0.07 * s);
    line(ctx, [[x - 0.2 * s, y + 0.4 * s], [x + 0.05 * s, y + 0.05 * s], [x + 0.3 * s, y + 0.3 * s], [x + 0.25 * s, y + 0.45 * s]], color, 0.08 * s);
  };
  const snake = (x: number, y: number, s: number, color: string) => {
    const pts: Array<[number, number]> = [];
    for (let k = 0; k <= 16; k++) pts.push([x + k * 0.12 * s, y + Math.sin(k * 0.8) * 0.15 * s]);
    line(ctx, pts, color, 0.07 * s);
    ellipse(ctx, x + 2 * s, y + Math.sin(12.8) * 0.15 * s, 0.09 * s, 0.07 * s, color);
  };
  const sun = (x: number, y: number, s: number) => {
    ellipse(ctx, x, y, 0.25 * s, 0.25 * s, '#e8c83a', '#d83a2a', 0.04 * s);
    for (let r = 0; r < 12; r++) {
      const a = (r / 12) * Math.PI * 2;
      line(ctx, [[x + Math.cos(a) * 0.33 * s, y + Math.sin(a) * 0.33 * s], [x + Math.cos(a) * 0.5 * s, y + Math.sin(a) * 0.5 * s]], '#e8c83a', 0.05 * s);
    }
  };
  const flower = (x: number, y: number, s: number, color: string) => {
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2;
      ellipse(ctx, x + Math.cos(a) * 0.18 * s, y + Math.sin(a) * 0.18 * s, 0.12 * s, 0.12 * s, color);
    }
    ellipse(ctx, x, y, 0.1 * s, 0.1 * s, '#e8c83a');
  };
  const squiggle = (x: number, y: number, s: number, color: string) => {
    const pts: Array<[number, number]> = [[x, y]];
    let a = rnd() * 6;
    for (let k = 0; k < 6; k++) { a += (rnd() - 0.5) * 2.4; pts.push([pts[k][0] + Math.cos(a) * 0.14 * s, pts[k][1] + Math.sin(a) * 0.14 * s]); }
    line(ctx, pts, color, 0.09 * s);
  };
  const spiral = (x: number, y: number, s: number, color: string) => {
    const pts: Array<[number, number]> = [];
    for (let k = 0; k < 30; k++) { const a = k * 0.45, r = 0.02 * s * k; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
    line(ctx, pts, color, 0.05 * s);
  };
  // Scattered densely over walls and vault, big near the platform and smaller up in the vault.
  for (let i = 0; i < 150; i++) {
    const x = rnd() * v.period, y = 1.2 + rnd() * (v.arc - 2.4);
    const s = 0.7 + rnd() * 0.9;
    const kind = i % 9;
    const color = pick();
    v.wrap(() => {
      if (kind === 0) bird(x, y, s);
      else if (kind === 1) runner(x, y, s * 1.3, color === '#3a5ad0' ? '#e8742a' : color);
      else if (kind === 2) snake(x, y, s, '#d83a2a');
      else if (kind === 3) sun(x, y, s);
      else if (kind === 4) flower(x, y, s, color);
      else if (kind === 5) spiral(x, y, s, color);
      else squiggle(x, y, s, kind === 6 ? '#f2f2ea' : kind === 7 ? '#3a5ad0' : color);
    });
  }
});

// ---------------------------------------------------------------- Universitetet

/** The first article of the Universal Declaration of Human Rights, in Swedish. */
const RIGHTS = 'ALLA MÄNNISKOR ÄR FÖDDA FRIA OCH LIKA I VÄRDE OCH RÄTTIGHETER. DE ÄR UTRUSTADE MED FÖRNUFT OCH SAMVETE OCH BÖR HANDLA GENTEMOT VARANDRA I EN ANDA AV GEMENSKAP. ';

/**
 * Françoise Schein's tiles: along both track walls, white tiles each with a
 * letter of the Declaration of Human Rights and little blue drawings among
 * them, and on one wall a long panel of dark sea-green tiles with Linnaeus's
 * journeys drawn in white: coasts, routes, plants. Grey rock above.
 */
export const universitetetArt = art('universitetet', 16, 1997, (v) => {
  fill(v, '#a8a398');
  mottle(v, ['80, 76, 70', '220, 216, 206'], 80, 1.5);
  const size = 0.18;
  let n = 0;
  for (const edge of [0, 1] as const) {
    v.wall(edge, ({ ctx: g }) => {
      band(g, v.period, -1, 0.5, '#4a4a4c');
      band(g, v.period, 3.36, 3.46, '#9aa0a4');
      tileGrid(g, 0, v.period, 0.5, 3.38, size, size, '#d0d0ca', (i, j) => shade(0xf5f5f0, ((i + j * 3) % 5) - 2), false, 0.012);
      // Letters row by row, from the top, reading along the wall.
      const cols = Math.round(v.period / size);
      for (let j = 14; j >= 0; j--) {
        for (let i = 0; i < cols; i++) {
          const ch = RIGHTS[n++ % RIGHTS.length];
          if (ch !== ' ') letter(g, ch, (i + 0.5) * size, 0.5 + (j + 0.5) * size, 0.12, j % 4 === 1 ? '#3a4a8a' : '#8a4a44', '600');
        }
      }
      // Little blue drawings over the letters: figures holding hands, houses, birds.
      for (let d = 0; d < 5; d++) {
        const x = 1 + d * 3.1 + edge * 1.4, h = 1.3 + ((d * 37) % 11) / 8;
        g.fillStyle = '#f5f5f0';
        g.fillRect(x - 0.45, h - 0.4, 0.9, 0.8);
        for (let f = 0; f < 3; f++) {
          const fx = x - 0.25 + f * 0.25;
          ellipse(g, fx, h + 0.22, 0.05, 0.05, '#2a4ab0');
          line(g, [[fx, h + 0.16], [fx, h - 0.05], [fx - 0.07, h - 0.25]], '#2a4ab0', 0.025);
          line(g, [[fx, h - 0.05], [fx + 0.07, h - 0.25]], '#2a4ab0', 0.025);
          line(g, [[fx - 0.12, h + 0.08], [fx + 0.12, h + 0.08]], '#2a4ab0', 0.02);
        }
      }
      if (edge === 1) {
        // The green panel of Linnaeus's journeys, framed in steel.
        const [x0, x1, h0, h1] = [2, 12, 0.7, 3.2];
        g.fillStyle = '#b8bcbc';
        g.fillRect(x0 - 0.08, h0 - 0.08, x1 - x0 + 0.16, h1 - h0 + 0.16);
        tileGrid(g, x0, x1, h0, h1, size, size, '#1f5a4c', (i, j) => shade(0x2f8a74, ((i * 7 + j * 5) % 9) * 3 - 12), false, 0.012);
        // Coasts: a long wobbly shore with islands.
        const shore: Array<[number, number]> = [];
        for (let k = 0; k <= 40; k++) shore.push([x0 + 0.5 + k * 0.22, h0 + 1.2 + Math.sin(k * 0.5) * 0.35 + Math.sin(k * 1.7) * 0.12]);
        line(g, shore, '#f2f2ea', 0.025);
        for (let k = 0; k < 9; k++) {
          const ix = x0 + 0.8 + k * 1.0, ih = h0 + 0.45 + (k % 3) * 0.12;
          ellipse(g, ix, ih, 0.12 + (k % 2) * 0.1, 0.07, 'rgba(0,0,0,0)', '#f2f2ea', 0.02);
        }
        // The route, dotted, with its stops and their names.
        g.setLineDash([0.06, 0.05]);
        const route: Array<[number, number]> = [];
        for (let k = 0; k <= 16; k++) route.push([x0 + 0.6 + k * 0.55, h0 + 1.9 + Math.sin(k * 0.9) * 0.25]);
        line(g, route, '#f2f2ea', 0.02);
        g.setLineDash([]);
        for (let k = 0; k <= 16; k += 3) {
          ellipse(g, route[k][0], route[k][1], 0.04, 0.04, '#f2f2ea');
          letter(g, ['Uppsala', 'Gävle', 'Umeå', 'Torneå', 'Kemi', 'Åbo'][k / 3], route[k][0], route[k][1] + 0.14, 0.09, '#f2f2ea', 'italic 500');
        }
        // A twinflower, Linnaea, in the corner.
        line(g, [[x1 - 0.8, h0 + 0.3], [x1 - 0.8, h0 + 0.9]], '#f2f2ea', 0.02);
        for (const s of [-1, 1]) ellipse(g, x1 - 0.8 + s * 0.1, h0 + 0.95, 0.05, 0.08, '#f2f2ea');
        letter(g, 'Linnés resor', x0 + 1.2, h1 - 0.2, 0.14, '#f2f2ea', 'italic 500');
      }
    });
  }
});

// ---------------------------------------------------------------- Danderyds sjukhus

/**
 * White enamel track walls over a black base, with bold black diagonals,
 * slim upright bars like wooden poles and small green figures, under a flat
 * ceiling of dark slatted panels.
 */
export const danderydArt = art('danderyd', 20, 2008, (v, wallH) => {
  fill(v, '#5c5a56');
  v.ctx.fillStyle = 'rgba(200, 196, 188, 0.3)';
  for (let x = 0; x < v.period; x += 0.12) v.ctx.fillRect(x, 0, 0.03, v.arc);
  for (const edge of [0, 1] as const) {
    v.wall(edge, ({ ctx: g, wrap }) => {
      band(g, v.period, -1, top(wallH), '#dcdad4');
      band(g, v.period, -1, 1.2, '#1e1e20');
      tileGrid(g, 0, v.period, 1.2, 3.3, 1.25, 2.1, '#b8b8b4', () => '#f2f2ee', false, 0.02);
      for (let k = 0; k < 7; k++) {
        const x = k * 2.9 + edge;
        wrap(() => {
          poly(g, [[x, 1.3], [x + 0.14, 1.3], [x + 1.44, 3.2], [x + 1.3, 3.2]], '#161616');
          if (k % 2) poly(g, [[x + 0.3, 1.3], [x + 0.36, 1.3], [x + 1.66, 3.2], [x + 1.6, 3.2]], '#161616');
          g.fillStyle = '#b89a6a';
          g.fillRect(x + 1.9, 1.25, 0.06, 2.0);
          const fx = x + 2.4, fh = 1.35;
          if (k % 3 !== 1) {
            ellipse(g, fx, fh + 0.62, 0.05, 0.06, '#5aa04a');
            poly(g, [[fx - 0.08, fh + 0.3], [fx + 0.08, fh + 0.3], [fx + 0.06, fh + 0.55], [fx - 0.06, fh + 0.55]], '#5aa04a');
            line(g, [[fx - 0.04, fh + 0.3], [fx - 0.08, fh]], '#5aa04a', 0.04);
            line(g, [[fx + 0.04, fh + 0.3], [fx + 0.1, fh]], '#5aa04a', 0.04);
            line(g, [[fx - 0.06, fh + 0.52], [fx - 0.16, fh + 0.7]], '#5aa04a', 0.03);
          }
        });
      }
    });
  }
});

// ---------------------------------------------------------------- Bergshamra

/** The elder futhark, the oldest row of runes. */
const FUTHARK = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';

/**
 * "Röster från det förflutna": dark grey rock with a long coloured line
 * along the track walls, the Rök runestone in a wall of blasted granite,
 * rows of runes round its edges, and on the other wall the oldest rune row,
 * big and pale on the rock.
 */
export const bergshamraArt = art('bergshamra', 36, 1978, (v) => {
  fill(v, '#5a5a56');
  mottle(v, ['40, 40, 38', '140, 138, 130'], 90, 1.6);
  for (const edge of [0, 1] as const) {
    v.wall(edge, ({ ctx: g, wrap }) => {
      band(g, v.period, 1.25, 1.36, '#2f8a3a');
      for (const [x, color] of [[6, '#2a5ab0'], [14, '#c8302a'], [22, '#e0b020'], [30, '#2a5ab0']] as const) {
        g.fillStyle = color;
        g.fillRect(x, 1.25, 6, 0.11);
      }
      if (edge === 0) {
        // The granite wall, and the runestone in it: a tall slab covered in rows of runes.
        const [x0, x1] = [9, 19];
        g.fillStyle = '#76746e';
        g.fillRect(x0, 1.4, x1 - x0, 3.6);
        for (let i = 0; i < 70; i++) {
          const x = x0 + 0.3 + v.rnd() * (x1 - x0 - 0.6), h = 1.6 + v.rnd() * 3.2;
          poly(g, [[x - 0.3, h - 0.2], [x + 0.25, h - 0.25], [x + 0.35, h + 0.15], [x - 0.2, h + 0.25]], i % 2 ? 'rgba(50, 48, 46, 0.35)' : 'rgba(210, 206, 198, 0.3)');
        }
        const sx = 14;
        poly(g, [[sx - 1.1, 1.5], [sx + 1.1, 1.5], [sx + 1.15, 3.9], [sx + 0.6, 4.75], [sx - 0.7, 4.65], [sx - 1.15, 3.8]], '#b2ada2', '#3a3834', 0.05);
        for (let r = 0; r < 14; r++) {
          const h = 1.75 + r * 0.2;
          let t = '';
          for (let k = 0; k < 11; k++) t += FUTHARK[Math.floor(v.rnd() * FUTHARK.length)];
          letter(g, t, sx, h, 0.17, '#34322c', '400');
        }
      } else {
        // The rune row.
        for (let k = 0; k < FUTHARK.length; k++) {
          const x = 3 + k * 1.25;
          wrap(() => letter(g, FUTHARK[k], x, 2.6, 0.8, '#d8d4c8', '400'));
        }
      }
    });
  }
});

// ---------------------------------------------------------------- Mariatorget

/**
 * Karin Björquist's walls: thousands of golden-brown ceramic rods standing
 * side by side, their glaze running from honey to umber, over a dark base
 * and under a pale vault.
 */
export const mariatorgetArt = art('mariatorget', 12, 1964, (v, wallH) => {
  fill(v, '#e9e6de');
  const { rnd } = v;
  for (const edge of [0, 1] as const) {
    v.wall(edge, ({ ctx: g }) => {
      const h1 = top(wallH) - 0.3;
      g.fillStyle = '#4a3420';
      g.fillRect(-v.period, -1, v.period * 3, h1 + 1);
      const w = 0.05;
      for (let x = 0; x < v.period - 0.001; x += w) {
        // Each rod glazed a little differently, lighter along its middle where it catches the light.
        const base = [0xd6a04a, 0xc48a3e, 0xe4b460, 0xb8803a, 0xcc9848][Math.floor(rnd() * 5)];
        const lo = -0.5 + rnd() * 0.05;
        const grad = g.createLinearGradient(x, 0, x + w, 0);
        grad.addColorStop(0, shade(base, -40));
        grad.addColorStop(0.45, shade(base, 40));
        grad.addColorStop(1, shade(base, -45));
        g.fillStyle = grad;
        g.fillRect(x + 0.004, lo, w - 0.008, h1 - lo - rnd() * 0.04);
        // Glaze pooled in bands down the rod.
        g.fillStyle = 'rgba(70, 40, 16, 0.15)';
        for (let b = 0; b < 3; b++) g.fillRect(x + 0.004, 0.5 + rnd() * 2.6, w - 0.008, 0.05 + rnd() * 0.2);
      }
      band(g, v.period, h1, top(wallH), '#3a2c22');
    });
  }
});

// ---------------------------------------------------------------- Zinkensdamm

/** Light grey walls set with small wine-red tiles in an endless pattern, under a pale vault. */
export const zinkensdammArt = art('zinkensdamm', 12, 1991, (v, wallH) => {
  fill(v, '#e2e0da');
  const reds = [0x7a2230, 0x6a1c28, 0x8a3038, 0x5a2a2a, 0x7a2230];
  for (const edge of [0, 1] as const) {
    v.wall(edge, ({ ctx: g }) => {
      // Red tiles and grey ones in a stepped pattern, the grey reading as the wall showing through.
      tileGrid(g, 0, v.period, -0.5, top(wallH) - 0.25, 0.1, 0.1, '#b8b8b4', (i, j) => {
        const grey = (i + 2 * j) % 5 === 0 || (2 * i + j) % 7 === 0;
        return grey ? shade(0xc8c8c4, ((i * j) % 5) * 3 - 6) : shade(reds[(i * 3 + j * 5) % reds.length], ((i + j) % 3) * 6 - 6);
      }, false, 0.014);
      band(g, v.period, top(wallH) - 0.25, top(wallH), '#c8c8c4');
      band(g, v.period, -1, 0.8, '#2a2526');
    });
  }
});

// ---------------------------------------------------------------- Hornstull

/**
 * Berndt Helleberg's Altamira: walls of glossy red hand-made brick with a
 * black band, and white figures as in a painted cave, bison, deer, horses
 * and hunters, running along them. A pale vault above.
 */
export const hornstullArt = art('hornstull', 16, 1964, (v, wallH) => {
  fill(v, '#e8e6e0');
  const { rnd } = v;
  const reds = [0x9a2f22, 0x7f2519, 0xb5402c, 0x8a2a1e, 0xa2382a];
  const white = '#f0ece2';
  const bison = (g: Ctx, x: number, h: number, s: number) => {
    ellipse(g, x, h + 0.45 * s, 0.55 * s, 0.3 * s, white);
    ellipse(g, x + 0.35 * s, h + 0.6 * s, 0.3 * s, 0.25 * s, white);
    ellipse(g, x + 0.6 * s, h + 0.4 * s, 0.14 * s, 0.16 * s, white);
    line(g, [[x + 0.62 * s, h + 0.56 * s], [x + 0.72 * s, h + 0.72 * s], [x + 0.64 * s, h + 0.78 * s]], white, 0.04 * s);
    for (const lx of [-0.4, -0.25, 0.25, 0.4]) line(g, [[x + lx * s, h + 0.3 * s], [x + (lx + 0.03) * s, h]], white, 0.07 * s);
    line(g, [[x - 0.55 * s, h + 0.5 * s], [x - 0.72 * s, h + 0.3 * s]], white, 0.03 * s);
  };
  const deer = (g: Ctx, x: number, h: number, s: number) => {
    ellipse(g, x, h + 0.55 * s, 0.4 * s, 0.14 * s, white);
    line(g, [[x + 0.35 * s, h + 0.6 * s], [x + 0.5 * s, h + 0.85 * s]], white, 0.06 * s);
    ellipse(g, x + 0.56 * s, h + 0.88 * s, 0.1 * s, 0.05 * s, white);
    for (const lx of [-0.3, -0.2, 0.22, 0.32]) line(g, [[x + lx * s, h + 0.5 * s], [x + (lx + (lx > 0 ? 0.08 : -0.06)) * s, h]], white, 0.035 * s);
    for (const a of [-1, 1]) line(g, [[x + 0.5 * s, h + 0.92 * s], [x + (0.45 + a * 0.12) * s, h + 1.15 * s], [x + (0.45 + a * 0.2) * s, h + 1.2 * s]], white, 0.025 * s);
  };
  const hunter = (g: Ctx, x: number, h: number, s: number) => {
    ellipse(g, x, h + 0.82 * s, 0.06 * s, 0.07 * s, white);
    line(g, [[x, h + 0.75 * s], [x + 0.02 * s, h + 0.4 * s], [x - 0.12 * s, h]], white, 0.05 * s);
    line(g, [[x + 0.02 * s, h + 0.4 * s], [x + 0.14 * s, h]], white, 0.05 * s);
    line(g, [[x - 0.3 * s, h + 0.5 * s], [x + 0.45 * s, h + 0.85 * s]], white, 0.025 * s);
  };
  for (const edge of [0, 1] as const) {
    v.wall(edge, ({ ctx: g, wrap }) => {
      tileGrid(g, 0, v.period, -0.5, top(wallH), 0.05, 0.22, '#5a1a12', () => shade(reds[Math.floor(rnd() * reds.length)], Math.round((rnd() - 0.5) * 24)), true, 0.008);
      band(g, v.period, 1.25, 1.42, '#151515');
      for (let k = 0; k < 7; k++) {
        const x = 1 + k * 2.3 + rnd() * 0.6, h = 1.8 + rnd() * 1.1, s = 0.9 + rnd() * 0.5;
        wrap(() => (k % 3 === 0 ? bison(g, x, h, s) : k % 3 === 1 ? deer(g, x, h, s) : hunter(g, x, h, s)));
      }
    });
  }
});

// ---------------------------------------------------------------- Liljeholmen

/**
 * Carl-Axel Lunding's concrete: grey cast walls in raised and sunken
 * blocks, catching the light, under a dark deck crossed by maroon beams.
 */
export const liljeholmenArt = art('liljeholmen', 18, 1964, (v, wallH) => {
  const { ctx, rnd } = v;
  fill(v, '#2e3034');
  ctx.fillStyle = '#6a2a26';
  for (let x = 0; x < v.period; x += 3) ctx.fillRect(x, 0, 0.35, v.arc);
  for (const edge of [0, 1] as const) {
    v.wall(edge, ({ ctx: g }) => {
      band(g, v.period, -1, top(wallH), '#a9a7a0');
      band(g, v.period, -1, 0.9, '#5a5a58');
      // Relief: blocks standing out, lit from above and shadowed below.
      for (let i = 0; i < 26; i++) {
        const x = rnd() * (v.period - 2), h = 1.2 + rnd() * 2.8, w = 0.4 + rnd() * 1.6, t = 0.2 + rnd() * 0.9;
        g.fillStyle = '#bdbbb4';
        g.fillRect(x, h, w, t);
        g.fillStyle = '#7c7a74';
        g.fillRect(x, h - 0.05, w, 0.05);
        g.fillRect(x + w, h - 0.05, 0.04, t);
        g.fillStyle = '#d6d4cc';
        g.fillRect(x, h + t - 0.03, w, 0.03);
      }
      // Board marks.
      g.fillStyle = 'rgba(0, 0, 0, 0.06)';
      for (let h = 1; h < top(wallH); h += 0.15) g.fillRect(-v.period, h, v.period * 3, 0.015);
    });
  }
});

// ---------------------------------------------------------------- Östermalmstorg

/**
 * Siri Derkert's "Ristningar i betong": grey concrete walls along both
 * tracks with line drawings cut dark into them: faces of women, figures,
 * a mother and child, a stave with notes running along the wall, the peace sign,
 * and words: "Tyst vår", peace. A pale vault above.
 */
export const ostermalmstorgArt = art('ostermalmstorg', 16, 1965, (v, wallH) => {
  fill(v, '#dcdad4');
  const { rnd } = v;
  const ink = '#2c2a27';
  const face = (g: Ctx, x: number, h: number, s: number) => {
    g.strokeStyle = ink;
    g.lineWidth = 0.035;
    g.beginPath();
    g.ellipse(x, h, 0.32 * s, 0.42 * s, (rnd() - 0.5) * 0.3, 0, Math.PI * 2);
    g.stroke();
    line(g, [[x - 0.15 * s, h + 0.08 * s], [x - 0.05 * s, h + 0.1 * s]], ink, 0.03);
    line(g, [[x + 0.06 * s, h + 0.1 * s], [x + 0.16 * s, h + 0.08 * s]], ink, 0.03);
    line(g, [[x, h + 0.05 * s], [x - 0.04 * s, h - 0.1 * s], [x + 0.03 * s, h - 0.12 * s]], ink, 0.025);
    line(g, [[x - 0.1 * s, h - 0.22 * s], [x + 0.1 * s, h - 0.2 * s]], ink, 0.03);
    // Hair, in a few long strokes.
    for (let k = 0; k < 4; k++) line(g, [[x - 0.3 * s, h + 0.2 * s], [x - 0.1 * s + k * 0.1 * s, h + 0.5 * s], [x + 0.35 * s, h + 0.1 * s - k * 0.12 * s]], ink, 0.025);
  };
  const figure = (g: Ctx, x: number, h: number, s: number) => {
    g.strokeStyle = ink;
    g.lineWidth = 0.03;
    g.beginPath();
    g.ellipse(x, h + 1.3 * s, 0.12 * s, 0.15 * s, 0, 0, Math.PI * 2);
    g.stroke();
    // A long dress, a round belly, arms folded round it.
    line(g, [[x - 0.08 * s, h + 1.12 * s], [x - 0.2 * s, h + 0.6 * s], [x - 0.3 * s, h]], ink, 0.03);
    line(g, [[x + 0.08 * s, h + 1.12 * s], [x + 0.28 * s, h + 0.7 * s], [x + 0.22 * s, h + 0.45 * s], [x + 0.3 * s, h]], ink, 0.03);
    line(g, [[x - 0.12 * s, h + 0.95 * s], [x + 0.1 * s, h + 0.72 * s], [x + 0.26 * s, h + 0.75 * s]], ink, 0.025);
  };
  for (const edge of [0, 1] as const) {
    v.wall(edge, ({ ctx: g, wrap, text }) => {
      band(g, v.period, -1, top(wallH), '#b2aea4');
      // Shuttering marks in the concrete: the panels were cast in boards.
      g.fillStyle = 'rgba(255, 255, 255, 0.05)';
      for (let x = 0; x < v.period; x += 0.2) g.fillRect(x, -1, 0.03, top(wallH) + 1);
      g.fillStyle = 'rgba(0, 0, 0, 0.12)';
      for (let x = 0; x < v.period; x += 3.2) g.fillRect(x, -1, 0.04, top(wallH) + 1);
      band(g, v.period, -1, 0.9, '#5e5c58');
      const o = edge * 5;
      wrap(() => {
        face(g, 2 + o, 2.7, 1.2);
        figure(g, 4.6 + o, 1.2, 1.3);
        face(g, 7 + o, 2.2, 0.9);
        face(g, 12.5 + o, 2.9, 1.1);
      });
      // A stave with notes, running along the wall.
      for (let l = 0; l < 5; l++) band(g, v.period, 3.35 + l * 0.07, 3.36 + l * 0.07, ink);
      for (let n = 0; n < 24; n++) {
        const x = n * (v.period / 24) + 0.2, h = 3.35 + ((n * 5 + edge * 3) % 9) * 0.035;
        ellipse(g, x, h, 0.045, 0.032, ink);
        g.fillStyle = ink;
        g.fillRect(x + 0.035, h, 0.012, 0.2);
      }
      // The peace sign, and a word.
      wrap(() => {
        const px = 9.8 + o * 0.4, ph = 2.3;
        g.strokeStyle = ink;
        g.lineWidth = 0.05;
        g.beginPath();
        g.arc(px, ph, 0.45, 0, Math.PI * 2);
        g.stroke();
        line(g, [[px, ph + 0.45], [px, ph - 0.45]], ink, 0.05);
        line(g, [[px, ph], [px - 0.32, ph - 0.32]], ink, 0.05);
        line(g, [[px, ph], [px + 0.32, ph - 0.32]], ink, 0.05);
      });
      text(edge ? 'FRED' : 'TYST VÅR', 14.6 - edge * 5, edge ? 1.75 : 3.0, 0.3, ink, '500');
    });
  }
});

// ---------------------------------------------------------------- Tekniska högskolan

/**
 * Lennart Mörk's elements and laws of nature: pale grey rock under a vault
 * streaked blue like sky, science drawn in dark line over the walls (orbits
 * round the sun, Newton's apple, a lever, a wave, gears after Polhem's
 * mechanical alphabet) and the Platonic solids painted big: earth a cube,
 * fire a tetrahedron, air an octahedron, water an icosahedron.
 */
export const tekniskaArt = art('tekniska', 30, 1973, (v) => {
  const { ctx, rnd } = v;
  fill(v, '#c9c6bd');
  mottle(v, ['150, 146, 138', '236, 234, 228'], 70, 1.6);
  // Blue sky over the vault's crown.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * v.period, y = v.arc * (0.3 + rnd() * 0.4);
    let px = x, py = y, a = (rnd() - 0.5) * 1.5;
    const pts: Array<[number, number]> = [[px, py]];
    for (let s = 0; s < 8; s++) { a += (rnd() - 0.5) * 0.9; px += Math.cos(a) * 0.5; py += Math.sin(a) * 0.5; pts.push([px, py]); }
    const color = i % 3 ? `rgba(40, 90, 170, ${0.4 + rnd() * 0.4})` : `rgba(250, 250, 250, ${0.5 + rnd() * 0.3})`;
    v.wrap(() => line(ctx, pts, color, 0.1 + rnd() * 0.3));
  }
  const ink = '#2a2a2a';
  /** A solid in outline and shaded faces, from its projected faces (points in meters about its centre). */
  const solid = (g: Ctx, x: number, h: number, faces: Array<Array<[number, number]>>, colors: string[]) => {
    faces.forEach((f, i) => poly(g, f.map(([a, b]) => [x + a, h + b] as [number, number]), colors[i % colors.length], ink, 0.04));
  };
  const cube = (g: Ctx, x: number, h: number, s: number) => solid(g, x, h, [
    [[-s, -s], [s * 0.3, -s * 1.2], [s * 0.3, s * 0.3], [-s, s * 0.5]],
    [[s * 0.3, -s * 1.2], [s * 1.2, -s * 0.8], [s * 1.2, s * 0.7], [s * 0.3, s * 0.3]],
    [[-s, s * 0.5], [s * 0.3, s * 0.3], [s * 1.2, s * 0.7], [-s * 0.1, s]],
  ], ['#8a6a3a', '#6e5430', '#b08a52']);
  const tetra = (g: Ctx, x: number, h: number, s: number) => solid(g, x, h, [
    [[-s, -s * 0.8], [s * 0.2, -s], [0, s * 1.1]],
    [[s * 0.2, -s], [s, -s * 0.5], [0, s * 1.1]],
  ], ['#d2452a', '#a8321e']);
  const octa = (g: Ctx, x: number, h: number, s: number) => solid(g, x, h, [
    [[-s, 0], [0, s * 0.3], [0, s * 1.2]], [[0, s * 0.3], [s, 0], [0, s * 1.2]],
    [[-s, 0], [0, s * 0.3], [0, -s * 1.2]], [[0, s * 0.3], [s, 0], [0, -s * 1.2]],
  ], ['#d8e8f2', '#bcd6e8', '#9ab8d0', '#88a8c4']);
  const icosa = (g: Ctx, x: number, h: number, s: number) => {
    const ring = Array.from({ length: 5 }, (_, k) => [Math.cos(k * 1.2566 + 0.3) * s, Math.sin(k * 1.2566 + 0.3) * s * 0.35] as [number, number]);
    const faces: Array<Array<[number, number]>> = [];
    for (let k = 0; k < 5; k++) {
      const a = ring[k], b = ring[(k + 1) % 5];
      faces.push([a, b, [0, s * 1.1]], [a, b, [0, -s * 1.1]]);
    }
    solid(g, x, h, faces, ['#2a5a9a', '#3a6ab0', '#1e4a88', '#4a7ac0']);
  };
  for (const edge of [0, 1] as const) {
    v.wall(edge, ({ ctx: g, wrap }) => {
      band(g, v.period, -1, 0.9, '#3a3a3c');
      wrap(() => {
        if (edge === 0) { cube(g, 5, 2.8, 0.9); tetra(g, 20, 2.8, 1.1); } else { octa(g, 6, 2.9, 1.0); icosa(g, 21, 2.9, 1.1); }
        // Kepler's orbits round the sun.
        const ox = 12 + edge * 2, oh = 3.0;
        ellipse(g, ox, oh, 0.2, 0.2, '#e0b030', ink, 0.03);
        for (let r = 1; r <= 3; r++) {
          g.strokeStyle = ink;
          g.lineWidth = 0.025;
          g.beginPath();
          g.ellipse(ox + r * 0.1, oh, 0.6 * r, 0.35 * r, 0.2, 0, Math.PI * 2);
          g.stroke();
          ellipse(g, ox + r * 0.1 + 0.6 * r * Math.cos(r * 2), oh + 0.35 * r * Math.sin(r * 2), 0.06, 0.06, ink);
        }
        // Newton's apple falling, with its arrow.
        const ax = 26 - edge * 12, ah = 3.6;
        ellipse(g, ax, ah, 0.16, 0.15, '#c8302a', ink, 0.025);
        line(g, [[ax, ah + 0.14], [ax + 0.05, ah + 0.25]], ink, 0.025);
        line(g, [[ax + 0.35, ah], [ax + 0.35, ah - 1.0]], ink, 0.025);
        poly(g, [[ax + 0.28, ah - 0.9], [ax + 0.42, ah - 0.9], [ax + 0.35, ah - 1.05]], ink);
        // A wave and a lever on its fulcrum.
        const wave: Array<[number, number]> = [];
        for (let k = 0; k <= 40; k++) wave.push([1 + edge * 14 + k * 0.08, 1.7 + Math.sin(k * 0.45) * 0.2]);
        line(g, wave, ink, 0.025);
        const lx = 16 - edge * 10;
        line(g, [[lx - 1.2, 1.9], [lx + 1.2, 1.5]], ink, 0.035);
        poly(g, [[lx - 0.15, 1.4], [lx + 0.15, 1.4], [lx, 1.68]], 'rgba(0,0,0,0)', ink, 0.025);
        // Gears, meshed.
        for (const [gx, gh, gr] of [[28.4 - edge * 20, 1.9, 0.35], [28.95 - edge * 20, 2.3, 0.22]] as const) {
          g.strokeStyle = ink;
          g.lineWidth = 0.025;
          g.beginPath();
          for (let t = 0; t <= 48; t++) {
            const a = (t / 48) * Math.PI * 2, r = gr * (t % 4 < 2 ? 1 : 0.82);
            if (t) g.lineTo(gx + Math.cos(a) * r, gh + Math.sin(a) * r); else g.moveTo(gx + Math.cos(a) * r, gh + Math.sin(a) * r);
          }
          g.stroke();
          ellipse(g, gx, gh, gr * 0.2, gr * 0.2, 'rgba(0,0,0,0)', ink, 0.02);
        }
      });
    });
  }
});

// ---------------------------------------------------------------- T-Centralen

/**
 * The red and green platforms of 1957, where Stockholm's metro art began.
 * Along one wall Anders Österlin and Signe Persson-Melin's "Klaravagnen":
 * white glazed tiles with figures in dark stoneware after the railway,
 * wheels, rails and signals; along the other Bengt Edenfalk and Erland
 * Melanton's wall of glass prisms in 1950s colours. Cream vaults above.
 */
export const tCentralenArt = art('t-centralen', 24, 1957, (v, wallH) => {
  fill(v, '#ece4cf');
  const { rnd } = v;
  const dark = '#3a2e26';
  const slate = '#5a6a78';
  const ochre = '#b8894a';
  v.wall(0, ({ ctx: g }) => {
    tileGrid(g, 0, v.period, -0.5, top(wallH), 0.15, 0.15, '#cfc8b4', (i, j) => shade(0xf2efe6, ((i * 5 + j * 3) % 7) - 3), false, 0.012);
    band(g, v.period, -1, 0.9, '#6a625a');
    // A wheel of eight spokes in a ring of tiles.
    const wheel = (x: number, h: number, r: number) => {
      g.strokeStyle = dark;
      g.lineWidth = 0.12;
      g.beginPath();
      g.arc(x, h, r, 0, Math.PI * 2);
      g.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        line(g, [[x, h], [x + Math.cos(a) * r, h + Math.sin(a) * r]], k % 2 ? ochre : dark, 0.14);
      }
      ellipse(g, x, h, 0.14, 0.14, slate);
    };
    // Rails running along, with sleepers.
    const rails = (x0: number, x1: number, h: number) => {
      for (let x = x0; x < x1; x += 0.3) { g.fillStyle = ochre; g.fillRect(x, h - 0.08, 0.15, 0.3); }
      g.fillStyle = dark;
      g.fillRect(x0, h, x1 - x0, 0.05);
      g.fillRect(x0, h + 0.15, x1 - x0, 0.05);
    };
    // A signal: a post with three round lamps.
    const signal = (x: number, h: number) => {
      g.fillStyle = dark;
      g.fillRect(x - 0.04, h, 0.08, 1.4);
      g.fillRect(x - 0.18, h + 1.0, 0.36, 0.9);
      for (let k = 0; k < 3; k++) ellipse(g, x, h + 1.15 + k * 0.28, 0.1, 0.1, [slate, ochre, '#f2efe6'][k]);
    };
    // A wagon on its wheels.
    const wagon = (x: number, h: number) => {
      g.fillStyle = slate;
      g.fillRect(x, h + 0.25, 2.2, 0.8);
      g.fillStyle = dark;
      g.fillRect(x - 0.05, h + 1.02, 2.3, 0.1);
      for (let k = 0; k < 4; k++) { g.fillStyle = '#f2efe6'; g.fillRect(x + 0.2 + k * 0.5, h + 0.55, 0.3, 0.3); }
      for (const wx of [0.4, 1.8]) ellipse(g, x + wx, h + 0.2, 0.18, 0.18, dark);
    };
    wheel(3, 2.4, 0.9);
    rails(5, 11, 1.4);
    signal(7.2, 1.6);
    wagon(8.5, 1.6);
    wheel(13.5, 2.5, 0.65);
    rails(15, 23, 3.1);
    signal(21.5, 1.3);
    wagon(16, 1.5);
  });
  v.wall(1, ({ ctx: g }) => {
    tileGrid(g, 0, v.period, -0.5, top(wallH), 0.15, 0.15, '#cfc8b4', (i, j) => shade(0xf2efe6, ((i * 5 + j * 3) % 7) - 3), false, 0.012);
    band(g, v.period, -1, 0.9, '#6a625a');
    // The glass prisms: small blocks of coloured glass set close, catching the light along their tops.
    const glass = [0x3aa6a0, 0xd2a53a, 0xd8634a, 0x6a7f96, 0xeeeae0, 0x3aa6a0, 0x6a7f96];
    g.fillStyle = '#4a4640';
    g.fillRect(0, 1.15, v.period, 2.3);
    for (let x = 0; x < v.period - 0.01; x += 0.12) {
      for (let h = 1.2; h < 3.4; h += 0.22) {
        const c = glass[Math.floor(rnd() * glass.length)];
        g.fillStyle = shade(c, Math.round((rnd() - 0.5) * 30));
        g.fillRect(x + 0.01, h, 0.1, 0.19);
        g.fillStyle = 'rgba(255, 255, 255, 0.35)';
        g.fillRect(x + 0.01, h + 0.15, 0.1, 0.04);
      }
    }
  });
});

/**
 * Skins for T-Centralen's columns, side by side in thirds: Oscar Brandtberg's
 * patterned tiles in brick red, ochre and grey; Vera Nilsson's mosaic pillar,
 * fields of colour and a figure in a black hat; and Siri Derkert's
 * "Kvinnopelaren", plates of concrete with figures engraved in them. Each is
 * one face of a column, bottom to top.
 */
export function tCentralenColumnTexture(): Texture {
  return cached('red-t-centralen-columns', () => {
    const [c, g] = canvas(768, 512);
    const rnd = mulberry32(1957);
    // Brandtberg: small tiles in stepped diamonds.
    const bricks = ['#9a4a34', '#c29a52', '#8c8a84', '#b8644a', '#e0d4b8'];
    for (let y = 0; y < 512; y += 12) {
      for (let x = 0; x < 256; x += 16) {
        const d = Math.abs(((x / 16 + y / 12) % 8) - 4) + Math.abs(((x / 16 - y / 12 + 64) % 8) - 4);
        g.fillStyle = bricks[(d + (rnd() < 0.1 ? 1 : 0)) % bricks.length];
        g.fillRect(x + 1, y + 1, 14, 10);
      }
    }
    // Vera Nilsson: fields of stone and glass.
    g.fillStyle = '#e8e0cc';
    g.fillRect(256, 0, 256, 512);
    const fields = ['#c8302a', '#2a4a9a', '#e0b030', '#3a8a5a', '#f2eee4', '#1e1e1e', '#d86a3a', '#5a8ac0'];
    for (let i = 0; i < 40; i++) {
      const x = 256 + rnd() * 256, y = rnd() * 512, w = 20 + rnd() * 70, h = 20 + rnd() * 90;
      g.fillStyle = fields[i % fields.length];
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w, y + rnd() * 20);
      g.lineTo(x + w - rnd() * 20, y + h);
      g.lineTo(x - rnd() * 15, y + h - rnd() * 20);
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(0, 0, 0, 0.18)';
    for (let x = 256; x < 512; x += 6) g.fillRect(x, 0, 1, 512);
    for (let y = 0; y < 512; y += 6) g.fillRect(256, y, 256, 1);
    // The figure in the black hat.
    g.fillStyle = '#e8c8a8';
    g.beginPath();
    g.ellipse(384, 150, 26, 32, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a1a1a';
    g.fillRect(340, 112, 88, 12);
    g.fillRect(360, 70, 48, 46);
    g.fillRect(350, 184, 68, 110);
    // Derkert: pale concrete plates, three to a face, with figures cut into them.
    g.fillStyle = '#b8b4aa';
    g.fillRect(512, 0, 256, 512);
    g.strokeStyle = '#2c2a27';
    g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const y0 = 8 + k * 168;
      g.lineWidth = 3;
      g.strokeRect(520, y0, 240, 160);
      g.lineWidth = 2.5;
      for (let f = 0; f < 3; f++) {
        const fx = 560 + f * 75, fy = y0 + 40;
        g.beginPath();
        g.ellipse(fx, fy, 12, 15, 0, 0, Math.PI * 2);
        g.moveTo(fx - 8, fy + 15);
        g.quadraticCurveTo(fx - 22, fy + 70, fx - 18, fy + 110);
        g.moveTo(fx + 8, fy + 15);
        g.quadraticCurveTo(fx + 24, fy + 70, fx + 18, fy + 110);
        g.moveTo(fx - 16, fy + 45);
        g.lineTo(fx + 10 + rnd() * 20, fy + 30 + rnd() * 30);
        g.stroke();
      }
    }
    return finish(c, null);
  });
}

// ---------------------------------------------------------------- Slussen

/** Pale cream tiles over a dark blue-grey base, under a low flat ceiling. */
export const slussenArt = art('slussen', 12, 1957, (v, wallH) => {
  fill(v, '#dcd8ce');
  for (const edge of [0, 1] as const) {
    v.wall(edge, ({ ctx: g }) => {
      tileGrid(g, 0, v.period, -0.5, top(wallH), 0.15, 0.15, '#c4bca8', (i, j) => shade(0xe6e0cf, ((i * 7 + j * 3) % 7) - 3), false, 0.012);
      band(g, v.period, -1, 1.25, '#34384a');
      band(g, v.period, 3.6, 3.7, '#2a4a8a');
    });
  }
});

/**
 * Bengt Rafael Sundberg's screens between Slussen's platforms: blue steel
 * plates, 3 by 5 meters, perforated with triangles that crowd closer toward
 * the top, so one sees across. The holes are painted dark: the wall behind.
 */
export function slussenScreenTexture(): Texture {
  return cached('red-slussen-screen', () => {
    const [c, g] = canvas(256, 512);
    g.fillStyle = '#2f5fa8';
    g.fillRect(0, 0, 256, 512);
    const rnd = mulberry32(1990);
    for (let row = 0; row < 26; row++) {
      // Rows of triangles, larger and closer toward the top (y = 0).
      const t = 1 - row / 26;
      const size = 6 + t * 12;
      const y = 8 + row * 19;
      for (let x = 8 + (row % 2) * size; x < 250; x += size * 2.2 - t * 6) {
        if (rnd() > 0.35 + t * 0.6) continue;
        g.fillStyle = '#10151e';
        g.beginPath();
        const up = (row + Math.round(x / size)) % 2 === 0;
        g.moveTo(x, up ? y + size : y);
        g.lineTo(x + size, up ? y + size : y);
        g.lineTo(x + size / 2, up ? y : y + size);
        g.closePath();
        g.fill();
      }
    }
    g.strokeStyle = '#1e3e78';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 250, 506);
    return finish(c, null);
  });
}

// ---------------------------------------------------------------- Gärdet

/** Draws one of Karl Axel Pehrson's "animals that do not exist": a beetle with a rounded shell, seen from above. */
function beetle(g: Ctx, x: number, h: number, s: number, shell: string, rnd: () => number): void {
  for (let k = 0; k < 3; k++) {
    for (const side of [-1, 1]) line(g, [[x + side * 0.1 * s, h + (0.1 - k * 0.15) * s], [x + side * 0.3 * s, h + (0.05 - k * 0.18) * s], [x + side * 0.38 * s, h + (-0.1 - k * 0.2) * s]], '#1a1a1a', 0.025 * s);
  }
  ellipse(g, x, h - 0.05 * s, 0.22 * s, 0.3 * s, shell, '#1a1a1a', 0.02 * s);
  line(g, [[x, h + 0.2 * s], [x, h - 0.33 * s]], '#1a1a1a', 0.015 * s);
  ellipse(g, x, h + 0.3 * s, 0.1 * s, 0.08 * s, '#2a2a22');
  for (const side of [-1, 1]) line(g, [[x + side * 0.04 * s, h + 0.36 * s], [x + side * (0.15 + rnd() * 0.1) * s, h + 0.52 * s]], '#1a1a1a', 0.015 * s);
  for (let k = 0; k < 4; k++) ellipse(g, x + (rnd() - 0.5) * 0.25 * s, h - 0.05 * s + (rnd() - 0.5) * 0.35 * s, 0.03 * s, 0.03 * s, 'rgba(255, 230, 150, 0.6)');
}

/**
 * A pale concrete vault over walls of dark brown and grey stone slabs in
 * light frames, with lit showcases set into them holding Karl Axel
 * Pehrson's fantasy beetles; the other track wall in pale enamel.
 */
export const gardetArt = art('gardet', 24, 1967, (v, wallH) => {
  fill(v, '#e6e2d8');
  const { rnd } = v;
  const shells = ['#6b7a3a', '#b58a3a', '#4a6a5a', '#8a5a2a', '#a8a040'];
  v.wall(0, ({ ctx: g }) => {
    band(g, v.period, -1, top(wallH), '#d8d4ca');
    band(g, v.period, -1, 0.9, '#3a3430');
    // Stone slabs, 2 meters wide, each its own shade of brown or grey.
    for (let x = 0; x < v.period - 0.01; x += 2) {
      const base = [0x5a4a3e, 0x6a5e52, 0x4e4640, 0x625448][Math.floor(rnd() * 4)];
      g.fillStyle = shade(base, Math.round((rnd() - 0.5) * 16));
      g.fillRect(x + 0.08, 0.95, 1.84, top(wallH) - 1.35);
      for (let i = 0; i < 20; i++) ellipse(g, x + 0.2 + rnd() * 1.6, 1.1 + rnd() * (top(wallH) - 1.7), 0.05 + rnd() * 0.15, 0.03 + rnd() * 0.06, 'rgba(0, 0, 0, 0.12)');
    }
    // Showcases every 8 meters: a lit box with a beetle on a pale ground.
    for (let k = 0; k < 3; k++) {
      const x = 3 + k * 8, h = 1.7;
      g.fillStyle = '#1e1c1a';
      g.fillRect(x - 0.55, h - 0.05, 1.1, 1.1);
      const glow = g.createRadialGradient(x, h + 0.5, 0.05, x, h + 0.5, 0.7);
      glow.addColorStop(0, '#fff6dc');
      glow.addColorStop(1, '#c8b890');
      g.fillStyle = glow;
      g.fillRect(x - 0.48, h + 0.02, 0.96, 0.96);
      beetle(g, x, h + 0.5, 0.95, shells[k % shells.length], rnd);
    }
  });
  v.wall(1, ({ ctx: g }) => {
    band(g, v.period, -1, top(wallH), '#e0ddd4');
    band(g, v.period, -1, 0.9, '#3a3430');
    tileGrid(g, 0, v.period, 0.9, top(wallH) - 0.3, 1.2, 1.2, '#b8b4aa', (i, j) => shade(0xe4e0d6, ((i * 3 + j) % 5) - 2), false, 0.02);
  });
});
