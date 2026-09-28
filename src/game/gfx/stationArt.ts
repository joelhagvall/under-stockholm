import type { Texture } from 'three';
import { CAVE_BOTTOM } from '../layout';
import { cached, canvas, finish, mulberry32 } from './textures';

/**
 * Painted vaults for the stations with the best-known art, after the real
 * works: Solna centrum's red sky over the spruce forest (Anders Åberg and
 * Karl-Olov Björk), Tensta's rose to the immigrants (Helga Henschen),
 * Hallonbergen's children's drawings (Elis Eriksson and Gösta Wallmark), and
 * Takashi Naraha's cloud cubes at Solna strand. Drawn from descriptions in
 * the spirit of the originals, not traced from photos.
 *
 * A vault texture runs round the cave's cross-section: v = 0 and v = 1 are
 * the foot of the two rock walls behind the tracks, v = 0.5 the crown. It
 * repeats every `period` meters along the station.
 */

/** Texels along one period of the artwork. 1536 keeps flat shapes crisp at a third less memory than 2048. */
const SIZE = 1536;

/** Draws on a wall in meters: x along the platform, h up from the rails. */
export interface WallPen {
  ctx: CanvasRenderingContext2D;
  /** Draws `fn` three times, a period apart, so shapes wrap seamlessly. */
  wrap(fn: () => void): void;
  /** Text the right way up at (x, h), in meters. */
  text(s: string, x: number, h: number, size: number, color: string, font?: string): void;
}

interface Vault {
  ctx: CanvasRenderingContext2D;
  period: number;
  arc: number;
  rnd: () => number;
  /** Drawing on one of the two walls (0, 1) with x along the wall and h up from the rails, the same way up on both. */
  wall(edge: 0 | 1, draw: (pen: WallPen) => void): void;
  /** Drawing in raw vault meters: x along, y round the arc from wall 0. */
  wrap(fn: () => void): void;
}

function vault(key: string, period: number, arcLength: number, seed: number, paint: (v: Vault) => void): Texture {
  return cached(`${key}-${period}-${arcLength.toFixed(1)}`, () => {
    const [c, ctx] = canvas(SIZE, SIZE);
    const px = SIZE / period;
    const py = SIZE / arcLength;
    const base = () => ctx.setTransform(px, 0, 0, py, 0, 0);
    base();
    const wrapAt = (fn: () => void) => {
      for (const dx of [-period, 0, period]) {
        ctx.save();
        ctx.translate(dx, 0);
        fn();
        ctx.restore();
      }
    };
    const v: Vault = {
      ctx, period, arc: arcLength, rnd: mulberry32(seed),
      wrap: wrapAt,
      wall(edge, draw) {
        ctx.save();
        // Wall 0 rises with v and wall 1 falls with it; seen from the platform, both run
        // against u, so each is mirrored along the station to read the right way round.
        if (edge === 0) ctx.transform(-1, 0, 0, 1, period, -CAVE_BOTTOM);
        else ctx.transform(1, 0, 0, -1, 0, arcLength + CAVE_BOTTOM);
        draw({
          ctx,
          wrap: wrapAt,
          text(s, x, h, size, color, font = '700') {
            wrapAt(() => {
              ctx.save();
              ctx.translate(x, h);
              ctx.scale(1, -1);
              ctx.fillStyle = color;
              ctx.font = `${font} ${size}px system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(s, 0, 0);
              ctx.restore();
            });
          },
        });
        ctx.restore();
      },
    };
    paint(v);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // A little paint grain over rough rock.
    const img = ctx.getImageData(0, 0, SIZE, SIZE);
    const d = img.data;
    const rnd = mulberry32(seed + 1);
    for (let i = 0; i < d.length; i += 4) {
      const g = (rnd() - 0.5) * 12;
      d[i] += g; d[i + 1] += g; d[i + 2] += g;
    }
    ctx.putImageData(img, 0, 0);
    return finish(c, null);
  });
}

/** A filled polygon from [x, h] points. */
function poly(ctx: CanvasRenderingContext2D, points: Array<[number, number]>, fill: string, stroke?: string, width = 0.04): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.stroke(); }
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, width = 0.04): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

// ---------------------------------------------------------------- Solna centrum

/**
 * A burning red evening sky over the whole vault, above a dark green spruce
 * forest that runs the length of both walls, with scenes of 1970s Sweden
 * painted into it: red cottages, a factory, a clear-cut, an empty community
 * hall and a crop-dusting plane.
 */
export function solnaCentrumTexture(arcLength: number): { texture: Texture; period: number } {
  const period = 40;
  return { period, texture: vault('solna-centrum', period, arcLength, 1975, ({ ctx, arc, rnd, wrap, wall }) => {
    const sky = ctx.createLinearGradient(0, 0, 0, arc);
    sky.addColorStop(0, '#e0632f');
    sky.addColorStop(0.2, '#c93a27');
    sky.addColorStop(0.5, '#9d1b22');
    sky.addColorStop(0.8, '#c93a27');
    sky.addColorStop(1, '#e0632f');
    ctx.fillStyle = sky;
    ctx.fillRect(-period, 0, period * 3, arc);
    // Brushy streaks of cloud in the sky.
    for (let i = 0; i < 60; i++) {
      const x = rnd() * period, y = arc * (0.25 + rnd() * 0.5), w = 2 + rnd() * 6;
      wrap(() => ellipse(ctx, x, y, w, 0.12 + rnd() * 0.2, 'rgba(255, 170, 110, 0.18)'));
    }

    for (const edge of [0, 1] as const) {
      wall(edge, ({ ctx: g, wrap: w }) => {
        // Bare black sprayed concrete down by the rails.
        g.fillStyle = '#23241f';
        g.fillRect(-period, -1, period * 3, 2.6);
        // Ground under the trees.
        g.fillStyle = '#1b3a24';
        g.fillRect(-period, 1.5, period * 3, 0.6);
        const clearcut = { x0: 26, x1: 31 };
        // Three rows of spruces, darkest at the back.
        for (const [shade, base, tall] of [['#15321f', 1.9, 2.8], ['#1e4a2b', 1.7, 2.3], ['#2d6a3a', 1.5, 1.8]] as const) {
          for (let x = 0; x < period; x += 0.5 + rnd() * 0.45) {
            if (x > clearcut.x0 && x < clearcut.x1) continue;
            const hgt = tall * (0.7 + rnd() * 0.45);
            // A spruce: a narrow cone, about a third as wide as it is tall.
            const half = hgt * (0.17 + rnd() * 0.05);
            const pts: Array<[number, number]> = [[x - half, base]];
            const tiers = 6;
            for (let t = 0; t < tiers; t++) {
              const y = base + (hgt * t) / tiers;
              const wdt = half * (1 - t / tiers);
              pts.push([x - wdt, y], [x - wdt * 0.45, y + hgt / tiers * 0.35]);
            }
            pts.push([x, base + hgt]);
            for (let t = tiers - 1; t >= 0; t--) {
              const y = base + (hgt * t) / tiers;
              const wdt = half * (1 - t / tiers);
              pts.push([x + wdt * 0.45, y + hgt / tiers * 0.35], [x + wdt, y]);
            }
            w(() => poly(g, pts, shade));
          }
        }
        // The clear-cut: stumps on a bare slope.
        w(() => {
          poly(g, [[clearcut.x0, 1.5], [clearcut.x1, 1.5], [clearcut.x1 - 0.4, 2.4], [clearcut.x0 + 0.6, 2.2]], '#6b5a3a');
          for (let s = 0; s < 14; s++) {
            const x = clearcut.x0 + 0.4 + ((s * 0.37) % (clearcut.x1 - clearcut.x0 - 0.8));
            const y = 1.55 + ((s * 0.21) % 0.6);
            g.fillStyle = '#c9a36a';
            g.fillRect(x, y, 0.1, 0.08);
          }
        });
        // A red cottage with white corners and a carved porch.
        const cottage = (x: number) => w(() => {
          poly(g, [[x, 1.6], [x + 1.3, 1.6], [x + 1.3, 2.3], [x, 2.3]], '#a3261b');
          poly(g, [[x - 0.1, 2.3], [x + 1.4, 2.3], [x + 0.65, 2.75]], '#2b2b2b');
          for (const cx of [x, x + 1.24]) { g.fillStyle = '#f2ede2'; g.fillRect(cx, 1.6, 0.06, 0.7); }
          g.fillStyle = '#f2ede2';
          g.fillRect(x + 0.25, 1.9, 0.25, 0.22);
          g.fillRect(x + 0.8, 1.9, 0.25, 0.22);
          poly(g, [[x + 0.5, 1.6], [x + 0.8, 1.6], [x + 0.8, 2.0], [x + 0.65, 2.1], [x + 0.5, 2.0]], '#f2ede2');
        });
        cottage(4);
        cottage(19.5);
        // The empty community hall, its windows boarded up.
        w(() => {
          poly(g, [[9, 1.6], [11.4, 1.6], [11.4, 2.5], [9, 2.5]], '#d8b94a');
          poly(g, [[8.9, 2.5], [11.5, 2.5], [10.2, 2.95]], '#4a3a2a');
          for (let k = 0; k < 3; k++) {
            g.fillStyle = '#6b5236';
            g.fillRect(9.3 + k * 0.7, 1.9, 0.4, 0.35);
            g.strokeStyle = '#3a2a1a'; g.lineWidth = 0.04;
            g.beginPath(); g.moveTo(9.3 + k * 0.7, 1.9); g.lineTo(9.7 + k * 0.7, 2.25); g.stroke();
          }
        });
        // A factory with smoking chimneys.
        w(() => {
          poly(g, [[34, 1.55], [37.5, 1.55], [37.5, 2.4], [36.3, 2.7], [35.1, 2.4], [34, 2.7]], '#5a5f63');
          for (const cx of [34.6, 36.9]) {
            g.fillStyle = '#44484b';
            g.fillRect(cx, 2.4, 0.22, 1.5);
            for (let p = 0; p < 6; p++) ellipse(g, cx + 0.1 + p * 0.35, 4.0 + p * 0.28, 0.3 + p * 0.08, 0.18 + p * 0.05, 'rgba(70, 60, 60, 0.55)');
          }
        });
        // A crop-duster spraying over the treetops.
        w(() => {
          const x = 14, y = 4.6;
          poly(g, [[x, y], [x + 1.1, y + 0.08], [x + 1.25, y + 0.25], [x + 0.1, y + 0.18]], '#e8e2c8');
          poly(g, [[x + 0.45, y + 0.12], [x + 0.75, y + 0.12], [x + 0.9, y - 0.35], [x + 0.6, y - 0.35]], '#e8e2c8');
          for (let p = 0; p < 8; p++) ellipse(g, x - 0.3 - p * 0.35, y - 0.1 - p * 0.12, 0.25 + p * 0.06, 0.12 + p * 0.03, 'rgba(235, 230, 205, 0.45)');
        });
      });
    }
  }) };
}

// ---------------------------------------------------------------- Tensta

/** "Solidaritet", the title of Helga Henschen's work, in eighteen languages. */
export const TENSTA_WORDS = [
  'SOLIDARITET', 'SOLIDARITY', 'SOLIDARIDAD', 'SOLIDARITÉ', 'SOLIDARITÄT', 'SOLIDARIETÀ', 'SOLIDARNOŚĆ', 'DAYANIŞMA', 'SOLIDAARISUUS',
  'تضامن', 'همبستگی', 'ΑΛΛΗΛΕΓΓΥΗ', 'СОЛИДАРНОСТЬ', 'SOLIDARIEDADE', 'SOLIDARNOST', 'SOLIDARITATE', 'SZOLIDARITÁS', 'SOLIDARITEIT',
];

/**
 * White walls and vault with naive, colourful paintings: climbing plants, a
 * big pink rose, an orange sun and animals (an elephant, a moose, a lion, a
 * horse, penguins above a walrus), and along both track walls panels with
 * "solidarity" in eighteen languages, each in its own colour.
 */
export function tenstaTexture(arcLength: number): { texture: Texture; period: number } {
  const period = 36;
  return { period, texture: vault('tensta', period, arcLength, 1975, ({ ctx, arc, rnd, wrap, wall }) => {
    ctx.fillStyle = '#f7f5ef';
    ctx.fillRect(-period, 0, period * 3, arc);
    // Leaves drifting over the vault.
    for (let i = 0; i < 90; i++) {
      const x = rnd() * period, y = arc * (0.2 + rnd() * 0.6), a = rnd() * Math.PI * 2, l = 0.3 + rnd() * 0.4;
      const color = ['#3f9a4a', '#2f7d3b', '#7cbf55'][i % 3];
      wrap(() => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(l / 2, -l * 0.35, l, 0); ctx.quadraticCurveTo(l / 2, l * 0.35, 0, 0);
        ctx.fillStyle = color; ctx.fill(); ctx.restore();
      });
    }
    const panelColors = ['#e63946', '#f28c1c', '#2a9d8f', '#3a86ff', '#8d5fd3', '#e8407a', '#2f7d3b', '#d8a31a', '#264653'];
    for (const edge of [0, 1] as const) {
      wall(edge, ({ ctx: g, wrap: w, text }) => {
        g.fillStyle = '#e9e4d8';
        g.fillRect(-period, -1, period * 3, 1.6);
        // Nine panels a wall, eighteen words a period.
        for (let k = 0; k < 9; k++) {
          const x = 2 + k * 4;
          const color = panelColors[(k + edge * 4) % panelColors.length];
          w(() => { g.fillStyle = color; g.fillRect(x - 1.4, 1.6, 2.8, 0.75); });
          text(TENSTA_WORDS[k + edge * 9], x, 1.98, 0.36, '#ffffff');
        }
        // Climbing plants between the panels.
        for (let k = 0; k < 9; k++) {
          const x = 4 + k * 4;
          w(() => {
            g.strokeStyle = '#2f7d3b'; g.lineWidth = 0.07; g.lineCap = 'round';
            g.beginPath(); g.moveTo(x, 1.3); g.bezierCurveTo(x + 0.4, 2.2, x - 0.4, 3.2, x + 0.2, 4.2); g.stroke();
            for (let l = 0; l < 6; l++) {
              const y = 1.6 + l * 0.45, s = l % 2 ? 1 : -1;
              g.save(); g.translate(x + s * 0.1, y); g.rotate(s * 0.7);
              g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(s * 0.2, 0.18, s * 0.42, 0); g.quadraticCurveTo(s * 0.2, -0.18, 0, 0);
              g.fillStyle = '#3f9a4a'; g.fill(); g.restore();
            }
          });
        }
        const outline = '#1a1a1a';
        // The rose.
        w(() => {
          const x = 7.5 + edge * 14, y = 3.5;
          g.strokeStyle = '#2f7d3b'; g.lineWidth = 0.08;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.1, 2.5); g.stroke();
          for (let r = 5; r > 0; r--) ellipse(g, x, y, 0.18 * r, 0.15 * r, r % 2 ? '#e8407a' : '#c92a63', outline, 0.03);
        });
        // The sun.
        w(() => {
          const x = 17 - edge * 8, y = 4.1;
          g.strokeStyle = '#f28c1c'; g.lineWidth = 0.08;
          for (let r = 0; r < 16; r++) {
            const a = (r / 16) * Math.PI * 2;
            g.beginPath(); g.moveTo(x + Math.cos(a) * 0.75, y + Math.sin(a) * 0.75); g.lineTo(x + Math.cos(a) * 1.1, y + Math.sin(a) * 1.1); g.stroke();
          }
          ellipse(g, x, y, 0.62, 0.62, '#f28c1c', outline, 0.03);
        });
        // An elephant.
        w(() => {
          const x = 12 + edge * 12, y = 2.7;
          ellipse(g, x, y + 0.5, 0.9, 0.55, '#9a9fa6', outline);
          ellipse(g, x + 0.95, y + 0.75, 0.42, 0.38, '#9a9fa6', outline);
          g.strokeStyle = '#9a9fa6'; g.lineWidth = 0.18; g.lineCap = 'round';
          g.beginPath(); g.moveTo(x + 1.25, y + 0.7); g.quadraticCurveTo(x + 1.5, y + 0.2, x + 1.35, y); g.stroke();
          for (const lx of [-0.6, -0.25, 0.3, 0.65]) { g.fillStyle = '#9a9fa6'; g.fillRect(x + lx, y - 0.25, 0.22, 0.5); }
          ellipse(g, x + 1.05, y + 0.85, 0.05, 0.05, outline);
        });
        // A moose.
        w(() => {
          const x = 27 - edge * 20, y = 2.8;
          ellipse(g, x, y + 0.55, 0.85, 0.4, '#6b4a2e', outline);
          poly(g, [[x + 0.7, y + 0.7], [x + 1.25, y + 1.05], [x + 1.45, y + 0.8], [x + 0.85, y + 0.45]], '#6b4a2e', outline);
          for (const lx of [-0.55, -0.3, 0.35, 0.6]) { g.fillStyle = '#6b4a2e'; g.fillRect(x + lx, y - 0.35, 0.12, 0.65); }
          g.strokeStyle = '#d8c7a0'; g.lineWidth = 0.06;
          for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + 1.15, y + 1.05); g.lineTo(x + 1.15 + s * 0.35, y + 1.45); g.lineTo(x + 1.15 + s * 0.2, y + 1.3); g.stroke(); }
        });
        // A lion with a big mane.
        w(() => {
          const x = 31 + edge * 2, y = 3.1;
          ellipse(g, x - 0.7, y + 0.35, 0.75, 0.35, '#d8a31a', outline);
          ellipse(g, x, y + 0.6, 0.55, 0.55, '#b8651a', outline);
          ellipse(g, x, y + 0.6, 0.32, 0.32, '#e0b94a', outline);
          for (const lx of [-1.2, -0.3]) { g.fillStyle = '#d8a31a'; g.fillRect(x + lx, y - 0.25, 0.14, 0.5); }
        });
        // Penguins huddled above a walrus.
        w(() => {
          const x = 1.5 + edge * 16, y = 2.6;
          ellipse(g, x + 0.6, y + 0.35, 0.95, 0.4, '#8a5a3a', outline);
          g.fillStyle = '#f2ede2'; g.fillRect(x + 1.35, y + 0.1, 0.06, 0.35); g.fillRect(x + 1.48, y + 0.1, 0.06, 0.35);
          for (let p = 0; p < 5; p++) {
            ellipse(g, x + p * 0.32, y + 1.15, 0.13, 0.28, '#1a1a1a');
            ellipse(g, x + p * 0.32, y + 1.1, 0.08, 0.2, '#f7f5ef');
          }
        });
      });
    }
  }) };
}

// ---------------------------------------------------------------- Hallonbergen

/**
 * A white cave covered in enlarged children's drawings: wobbly figures,
 * houses under a sun, cars, fantastic beasts, rockets and handwritten words,
 * in black line with patches of bright crayon.
 */
export function hallonbergenTexture(arcLength: number): { texture: Texture; period: number } {
  const period = 32;
  return { period, texture: vault('hallonbergen', period, arcLength, 1985, ({ ctx, arc, rnd, wall }) => {
    ctx.fillStyle = '#f6f5f0';
    ctx.fillRect(-period, 0, period * 3, arc);
    const colors = ['#d8342c', '#2b5fb3', '#f2c230', '#3f9a4a', '#e8318a'];
    const ink = '#1d1d1d';
    // A wobbly line: children's lines shake.
    const shaky = (g: CanvasRenderingContext2D, points: Array<[number, number]>, width = 0.06) => {
      g.strokeStyle = ink; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      points.forEach(([x, y], i) => {
        const jx = (rnd() - 0.5) * 0.05, jy = (rnd() - 0.5) * 0.05;
        if (i) g.lineTo(x + jx, y + jy); else g.moveTo(x, y);
      });
      g.stroke();
    };
    const figure = (g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) => {
      ellipse(g, x, y + 1.6 * s, 0.28 * s, 0.3 * s, '#f6f5f0', ink, 0.05);
      ellipse(g, x - 0.1 * s, y + 1.66 * s, 0.03 * s, 0.03 * s, ink);
      ellipse(g, x + 0.1 * s, y + 1.66 * s, 0.03 * s, 0.03 * s, ink);
      g.strokeStyle = ink; g.lineWidth = 0.04; g.beginPath(); g.arc(x, y + 1.58 * s, 0.14 * s, Math.PI * 1.15, Math.PI * 1.85, false); g.stroke();
      poly(g, [[x - 0.35 * s, y + 0.5 * s], [x + 0.35 * s, y + 0.5 * s], [x + 0.2 * s, y + 1.3 * s], [x - 0.2 * s, y + 1.3 * s]], color, ink, 0.05);
      shaky(g, [[x - 0.15 * s, y + 0.5 * s], [x - 0.25 * s, y]]);
      shaky(g, [[x + 0.15 * s, y + 0.5 * s], [x + 0.25 * s, y]]);
      shaky(g, [[x - 0.2 * s, y + 1.2 * s], [x - 0.7 * s, y + 1.5 * s], [x - 0.8 * s, y + 1.75 * s]]);
      shaky(g, [[x + 0.2 * s, y + 1.2 * s], [x + 0.7 * s, y + 1.0 * s]]);
    };
    const house = (g: CanvasRenderingContext2D, x: number, y: number) => {
      poly(g, [[x, y], [x + 1.6, y], [x + 1.6, y + 1.2], [x, y + 1.2]], '#f6f5f0', ink, 0.06);
      poly(g, [[x - 0.15, y + 1.2], [x + 1.75, y + 1.2], [x + 0.8, y + 2]], colors[0], ink, 0.06);
      poly(g, [[x + 0.6, y], [x + 1.0, y], [x + 1.0, y + 0.7], [x + 0.6, y + 0.7]], colors[1], ink, 0.05);
      poly(g, [[x + 0.2, y + 0.75], [x + 0.5, y + 0.75], [x + 0.5, y + 1.02], [x + 0.2, y + 1.02]], colors[2], ink, 0.05);
      g.strokeStyle = ink; g.lineWidth = 0.05;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x + 1.3, y + 1.6 + k * 0.12); g.lineTo(x + 1.3 + (rnd() - 0.5) * 0.3, y + 1.72 + k * 0.12); g.stroke(); }
    };
    const sun = (g: CanvasRenderingContext2D, x: number, y: number) => {
      ellipse(g, x, y, 0.45, 0.45, colors[2], ink, 0.06);
      for (let r = 0; r < 10; r++) { const a = (r / 10) * Math.PI * 2; shaky(g, [[x + Math.cos(a) * 0.55, y + Math.sin(a) * 0.55], [x + Math.cos(a) * 0.9, y + Math.sin(a) * 0.9]]); }
    };
    const car = (g: CanvasRenderingContext2D, x: number, y: number, color: string) => {
      poly(g, [[x, y + 0.25], [x + 2, y + 0.25], [x + 2, y + 0.7], [x + 1.4, y + 0.75], [x + 1.15, y + 1.1], [x + 0.45, y + 1.1], [x + 0.25, y + 0.75], [x, y + 0.7]], color, ink, 0.06);
      for (const wx of [0.45, 1.55]) ellipse(g, x + wx, y + 0.25, 0.24, 0.24, ink);
    };
    const beast = (g: CanvasRenderingContext2D, x: number, y: number, color: string) => {
      ellipse(g, x, y + 0.9, 1.1, 0.5, color, ink, 0.06);
      for (let l = 0; l < 6; l++) shaky(g, [[x - 0.8 + l * 0.32, y + 0.5], [x - 0.85 + l * 0.32 + (rnd() - 0.5) * 0.2, y]]);
      shaky(g, [[x + 0.9, y + 1.1], [x + 1.3, y + 1.8], [x + 1.6, y + 2.1]], 0.1);
      ellipse(g, x + 1.7, y + 2.15, 0.25, 0.18, color, ink, 0.05);
      ellipse(g, x + 1.78, y + 2.2, 0.04, 0.04, ink);
      for (let s = 0; s < 5; s++) poly(g, [[x - 0.6 + s * 0.3, y + 1.35], [x - 0.45 + s * 0.3, y + 1.65], [x - 0.3 + s * 0.3, y + 1.35]], colors[(s + 1) % colors.length], ink, 0.04);
    };
    const rocket = (g: CanvasRenderingContext2D, x: number, y: number) => {
      poly(g, [[x, y], [x + 0.5, y], [x + 0.5, y + 1.5], [x + 0.25, y + 2], [x, y + 1.5]], '#f6f5f0', ink, 0.06);
      poly(g, [[x, y], [x - 0.3, y - 0.2], [x, y + 0.5]], colors[0], ink, 0.05);
      poly(g, [[x + 0.5, y], [x + 0.8, y - 0.2], [x + 0.5, y + 0.5]], colors[0], ink, 0.05);
      ellipse(g, x + 0.25, y + 1.1, 0.14, 0.14, colors[1], ink, 0.04);
      for (let f = 0; f < 3; f++) poly(g, [[x + 0.05 + f * 0.15, y], [x + 0.2 + f * 0.15, y], [x + 0.12 + f * 0.15, y - 0.45 - rnd() * 0.2]], colors[f % 2 ? 2 : 0]);
    };
    for (const edge of [0, 1] as const) {
      wall(edge, ({ ctx: g, wrap: w, text }) => {
        w(() => {
          figure(g, 2 + edge * 3, 1.5, 1.1, colors[(edge + 1) % 5]);
          house(g, 5 + edge * 2, 1.5);
          sun(g, 9.5, 4.2);
          car(g, 11 - edge * 1.5, 1.4, colors[3 + edge]);
          beast(g, 16 + edge * 2, 1.6, colors[4 - edge * 3]);
          figure(g, 21, 1.6, 1.3, colors[2]);
          figure(g, 22.3, 1.6, 0.8, colors[0]);
          rocket(g, 25.5 - edge * 2, 2);
          house(g, 28, 1.5 + edge * 0.3);
        });
        text(edge ? 'MAMMA' : 'HALLONBERGEN', 14 - edge * 6, 4.4, 0.55, '#1d1d1d', '600 italic');
        text(edge ? 'JAG OCH PAPPA' : 'HEJ!', 24 + edge * 3, 4.3, 0.45, '#d8342c', '600 italic');
      });
    }
    // More drawings scattered over the crown of the vault.
    for (let i = 0; i < 10; i++) {
      const x = 1.5 + i * 3.1, y = arc * (0.42 + ((i * 37) % 17) / 100);
      ctx.save();
      ctx.translate(0, 0);
      const draw = i % 3 === 0 ? () => sun(ctx, x, y) : i % 3 === 1 ? () => beast(ctx, x, y - 1, colors[i % 5]) : () => figure(ctx, x, y - 1, 1, colors[(i + 2) % 5]);
      for (const dx of [-period, 0, period]) { ctx.save(); ctx.translate(dx, 0); draw(); ctx.restore(); }
      ctx.restore();
    }
  }) };
}

/** An engraved hopscotch, like the one copied from a schoolyard onto Hallonbergen's platform. */
export function hopscotchTexture(): Texture {
  return cached('hopscotch', () => {
    const [c, g] = canvas(512, 1024);
    // A slab of pale stone, with the grid cut into it.
    g.fillStyle = '#bdbab2';
    g.fillRect(0, 0, 512, 1024);
    const rnd = mulberry32(1982);
    for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() > 0.5 ? '#ffffff30' : '#3a3a3a22'; g.fillRect(rnd() * 512, rnd() * 1024, 2, 2); }
    g.strokeStyle = 'rgba(40, 40, 44, 0.85)';
    g.lineWidth = 7;
    g.fillStyle = 'rgba(40, 40, 44, 0.85)';
    g.font = '600 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const box = (x: number, y: number, w: number, h: number, label: string) => {
      g.strokeRect(x, y, w, h);
      g.fillText(label, x + w / 2, y + h / 2);
    };
    // 1, 2, 3 in a column, 4-5 side by side, 6, 7-8 side by side, and HIMMEL at the top.
    box(156, 880, 200, 130, '1');
    box(156, 750, 200, 130, '2');
    box(156, 620, 200, 130, '3');
    box(56, 490, 200, 130, '4');
    box(256, 490, 200, 130, '5');
    box(156, 360, 200, 130, '6');
    box(56, 230, 200, 130, '7');
    box(256, 230, 200, 130, '8');
    g.beginPath(); g.arc(256, 230, 200, Math.PI, 0); g.stroke();
    g.font = '600 52px system-ui, sans-serif';
    g.fillText('HIMMEL', 256, 150);
    const t = finish(c, null);
    return t;
  });
}

// ---------------------------------------------------------------- Solna strand

/** A sky-blue cube face with drifting white clouds, for Takashi Naraha's "Himmelen av kub". */
export function cloudCubeTexture(): Texture {
  return cached('cloud-cube', () => {
    const [c, g] = canvas(512, 512);
    const sky = g.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#5f9bd6');
    sky.addColorStop(1, '#8fc0ea');
    g.fillStyle = sky;
    g.fillRect(0, 0, 512, 512);
    const rnd = mulberry32(1985);
    for (let k = 0; k < 7; k++) {
      const x = rnd() * 512, y = rnd() * 512, s = 50 + rnd() * 70;
      for (let p = 0; p < 7; p++) {
        const g2 = g.createRadialGradient(x + (rnd() - 0.5) * s * 1.6, y + (rnd() - 0.5) * s * 0.5, 0, x, y, s);
        g2.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        g2.addColorStop(1, 'rgba(255, 255, 255, 0)');
        g.fillStyle = g2;
        g.beginPath(); g.arc(x + (rnd() - 0.5) * s * 1.4, y + (rnd() - 0.5) * s * 0.4, s * (0.5 + rnd() * 0.5), 0, Math.PI * 2); g.fill();
      }
    }
    return finish(c, null);
  });
}
