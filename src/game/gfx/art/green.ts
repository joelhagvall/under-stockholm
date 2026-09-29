import type { Texture } from 'three';
import { fbm3 } from '../noise';
import { cached, canvas, finish, mulberry32 } from '../textures';
import { vault, type WallPen } from '../stationArt';

/**
 * The green line's painted walls and vaults, after the real stations: the
 * yellow perforated panels under Fridhemsplan's rock and white vault, the
 * Strindberg enamels at Rådmansgatan, Skanstull's framed 1930s tiling, and
 * the red clinker bricks of Skarpnäck's floor. As in `stationArt.ts`, v = 0
 * and 1 are the feet of the two walls and `wall()` draws in meters along the
 * station and up from the rails.
 */

type Art = { texture: Texture; period: number };

/** Tiles of `w` by `h` meters from `x0` to `x1` and `h0` to `h1`, each a shade off `base`, on a grout ground. */
function tileRun(g: CanvasRenderingContext2D, rnd: () => number, x0: number, x1: number, h0: number, h1: number, w: number, h: number, base: [number, number, number], grout: string, spread = 12): void {
  g.fillStyle = grout;
  g.fillRect(x0, h0, x1 - x0, h1 - h0);
  const gap = Math.min(w, h) * 0.07;
  for (let y = h0; y < h1 - 0.001; y += h) {
    for (let x = x0; x < x1 - 0.001; x += w) {
      const k = Math.round((rnd() - 0.5) * spread);
      g.fillStyle = `rgb(${base[0] + k},${base[1] + k},${base[2] + k})`;
      g.fillRect(x + gap, y + gap, Math.min(w, x1 - x) - gap * 2, Math.min(h, h1 - y) - gap * 2);
    }
  }
}

// ---------------------------------------------------------------- Fridhemsplan

/**
 * Fridhemsplan's green platform (Gunnar Lené, 1952), as renovated: both track
 * walls clad in pale yellow enamelled sheet, perforated in bands for sound,
 * over a dark plinth by the rails. Over one track the vault is the bare grey
 * rock that the renovation laid open; over the other the smooth white 1952
 * vault still stands. The LED tubes over the rock are geometry (`details/green.ts`).
 */
export function fridhemsplanTexture(arcLength: number): Art {
  const period = 12;
  return { period, texture: vault('fridhemsplan-green', period, arcLength, 1952, ({ ctx, arc, rnd, wall }) => {
    // Sprayed grey rock from wall 0 to the crown, mottled darker in its hollows: noise painted small and drawn
    // large, taken round a cylinder so it wraps along the station.
    const [nc, nx] = canvas(192, 96);
    const img = nx.createImageData(192, 96);
    for (let j = 0; j < 96; j++) {
      for (let i = 0; i < 192; i++) {
        const a = (i / 192) * Math.PI * 2;
        const n = fbm3(Math.cos(a) * 3, Math.sin(a) * 3, j * 0.09, 4, 1952);
        const ridge = 1 - Math.abs(fbm3(Math.cos(a) * 7, Math.sin(a) * 7, j * 0.25, 2, 1953) - 0.5) * 2;
        const v = 52 + n * 70 - ridge ** 6 * 30;
        const k = (j * 192 + i) * 4;
        img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = v * 0.96; img.data[k + 3] = 255;
      }
    }
    nx.putImageData(img, 0, 0);
    ctx.drawImage(nc, 0, 0, period, arc / 2);
    // The old white vault on the other side, and the seam where the two meet.
    ctx.fillStyle = '#eeede7';
    ctx.fillRect(-period, arc / 2, period * 3, arc / 2);
    ctx.fillStyle = '#9a988f';
    ctx.fillRect(-period, arc / 2 - 0.04, period * 3, 0.08);

    for (const edge of [0, 1] as const) {
      wall(edge, ({ ctx: g }: WallPen) => {
        // A dark plinth by the rails.
        g.fillStyle = '#2e2f30';
        g.fillRect(-period, -1, period * 3, 1.6);
        // Panels 1.5 m wide from above the plinth nearly to the vault, each with bands of perforation.
        for (let k = 0; k < period / 1.5; k++) {
          const x = k * 1.5;
          g.fillStyle = '#c4ba72';
          g.fillRect(x, 0.6, 1.5, 3.1);
          g.fillStyle = '#f4ea9c';
          g.fillRect(x + 0.02, 0.62, 1.46, 3.06);
          g.fillStyle = 'rgba(90, 84, 40, 0.4)';
          for (const [b0, b1] of [[2.55, 3.55], [0.8, 1.3]] as const) {
            for (let y = b0; y < b1; y += 0.09) {
              for (let px = x + 0.1; px < x + 1.42; px += 0.09) {
                // An irregular scatter, as the real sheets' holes thin out toward the edges of a band.
                if (rnd() < 0.2) continue;
                g.fillRect(px, y, 0.035, 0.035);
              }
            }
          }
        }
        // A steel edge along the top of the panels.
        g.fillStyle = '#8a877e';
        g.fillRect(-period, 3.7, period * 3, 0.06);
      });
    }
  }) };
}

// ---------------------------------------------------------------- Rådmansgatan

/**
 * Rådmansgatan (1952): pale cream tiles over a dark plinth by the rails and a
 * flat white ceiling, and on the track walls Sture V Nilsson's enamels (1983):
 * white panels in thin frames with Strindberg's own drawings, a building
 * elevation with arched gates and two towers, and lines of his handwriting.
 */
export function radmansgatanTexture(arcLength: number, wallH: number): Art {
  const period = 24;
  return { period, texture: vault('radmansgatan', period, arcLength, 1983, ({ ctx, arc, rnd, wall }) => {
    ctx.fillStyle = '#efeee9';
    ctx.fillRect(-period, 0, period * 3, arc);
    const top = wallH - 0.5;
    for (const edge of [0, 1] as const) {
      wall(edge, ({ ctx: g }: WallPen) => {
        tileRun(g, rnd, 0, period, 1.0, top, 0.15, 0.15, [233, 226, 200], '#cfc8b2');
        g.fillStyle = '#4a4a46';
        g.fillRect(0, -1, period, 2.0);
        // The enamels: a row of five framed panels.
        const x0 = 8, pw = 1.5, h0 = 1.5, h1 = 3.9;
        for (let k = 0; k < 5; k++) {
          const x = x0 + k * pw;
          g.fillStyle = '#3c3c3a';
          g.fillRect(x, h0 - 0.04, pw, h1 - h0 + 0.08);
          g.fillStyle = '#e8e8e2';
          g.fillRect(x + 0.03, h0, pw - 0.06, h1 - h0);
        }
        g.strokeStyle = '#2e2e2c';
        g.lineWidth = 0.03;
        g.lineJoin = 'round';
        // The elevation, across the middle three panels: a long front of arched gates between two towers.
        const bx = x0 + 1.9, bw = 3.7, by = 2.0;
        const line = (pts: Array<[number, number]>) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
        line([[bx - 0.3, by], [bx + bw + 0.3, by]]);
        line([[bx, by], [bx, by + 0.75], [bx + bw, by + 0.75], [bx + bw, by]]);
        for (const tx of [bx + 0.35, bx + bw - 0.35]) {
          line([[tx - 0.3, by + 0.75], [tx - 0.3, by + 1.15], [tx, by + 1.35], [tx + 0.3, by + 1.15], [tx + 0.3, by + 0.75]]);
          line([[tx, by + 1.35], [tx, by + 1.55]]);
        }
        for (let k = 0; k < 6; k++) {
          const gx = bx + 0.3 + k * 0.62;
          g.beginPath();
          g.moveTo(gx, by);
          g.lineTo(gx, by + 0.35);
          g.arc(gx + 0.22, by + 0.35, 0.22, Math.PI, 0, true);
          g.lineTo(gx + 0.44, by);
          g.stroke();
        }
        // Handwriting: loose lines of script in the corners, a signature under them.
        g.lineWidth = 0.02;
        for (const [hx, hy, rows] of [[x0 + 5.4, 3.55, 4], [x0 + 0.2, 3.6, 2], [x0 + 0.3, 1.75, 1]] as const) {
          for (let r = 0; r < rows; r++) {
            g.beginPath();
            let x = hx;
            g.moveTo(x, hy - r * 0.1);
            while (x < hx + 1.5 - rnd() * 0.3) {
              const nx = x + 0.03 + rnd() * 0.05;
              g.quadraticCurveTo((x + nx) / 2, hy - r * 0.1 + (rnd() - 0.3) * 0.08, nx, hy - r * 0.1);
              x = nx;
            }
            g.stroke();
          }
        }
      });
    }
  }) };
}

// ---------------------------------------------------------------- Skanstull

/**
 * Skanstull (1933, after Berlin's U-Bahn): pale cream-yellow rectangular
 * tiles set in tall framed panels, slightly recessed, over a dark grey wall
 * by the rails, under a flat pale ceiling (its beams are geometry).
 */
export function skanstullTexture(arcLength: number, wallH: number): Art {
  const period = 7.5;
  return { period, texture: vault('skanstull', period, arcLength, 1933, ({ ctx, arc, rnd, wall }) => {
    ctx.fillStyle = '#d8d6ce';
    ctx.fillRect(-period, 0, period * 3, arc);
    const top = wallH - 0.5;
    for (const edge of [0, 1] as const) {
      wall(edge, ({ ctx: g }: WallPen) => {
        tileRun(g, rnd, 0, period, 0.9, top, 0.25, 0.125, [233, 223, 174], '#c9bf94', 10);
        g.fillStyle = '#3a3b3c';
        g.fillRect(0, -1, period, 1.9);
        // Three framed panels a period: a shadowed edge above and to one side, a lit one below and to the other.
        for (let k = 0; k < 3; k++) {
          const x = k * 2.5 + 0.25, x1 = x + 2.0, h0 = 1.3, h1 = top - 0.35;
          g.fillStyle = 'rgba(90, 80, 40, 0.35)';
          g.fillRect(x, h1 - 0.05, x1 - x, 0.05);
          g.fillRect(x, h0, 0.05, h1 - h0);
          g.fillStyle = 'rgba(255, 250, 225, 0.5)';
          g.fillRect(x, h0, x1 - x, 0.04);
          g.fillRect(x1 - 0.04, h0, 0.04, h1 - h0);
        }
      });
    }
  }) };
}

// ---------------------------------------------------------------- Skarpnäck

/** Skarpnäck's floor: red clinker pavers in stretcher bond along the platform, a meter to a repeat. */
export function clinkerTexture(): Texture {
  return cached('skarpnack-clinker', () => {
    const size = 256;
    const [c, ctx] = canvas(size, size);
    const rnd = mulberry32(1994);
    ctx.fillStyle = '#7a4232';
    ctx.fillRect(0, 0, size, size);
    const bw = size / 4, bh = size / 8;
    for (let r = 0; r < 8; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let k = -1; k < 4; k++) {
        const shade = (rnd() - 0.5) * 30;
        ctx.fillStyle = `rgb(${176 + shade},${85 + shade * 0.6},${58 + shade * 0.4})`;
        ctx.fillRect(k * bw + off + 2, r * bh + 2, bw - 4, bh - 4);
      }
    }
    // A little wear on the pavers.
    for (let s = 0; s < 900; s++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(60, 30, 20, 0.12)' : 'rgba(230, 170, 140, 0.1)';
      ctx.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 4, 1 + rnd() * 2);
    }
    return finish(c, 1.0);
  });
}

// ---------------------------------------------------------------- Thorildsplan

/** Lars Arrhenius' sprites (2008): a mushroom, a ghost, a cloud, an invader and a heart, a letter to a tile. */
const SPRITES: Record<string, string[]> = {
  mushroom: [
    '....RRRR....', '..RRWWWWRR..', '.RRWWWWWWRR.', '.RRRWWWWRRR.', 'RWWRRRRRRWWR', 'RWWWRRRRWWWR',
    'RWWRRRRRRWWR', '.RRRRRRRRRR.', '...WWKWKWW..', '...WWKWKWW..', '...WWWWWWW..', '....WWWWW...',
  ],
  ghost: [
    '....GGGG....', '..GGGGGGGG..', '.GGGGGGGGGG.', '.GWWGGGWWGGG', 'GWWBBGWWBBGG', 'GWWBBGWWBBGG',
    'GGWWGGGWWGGG', 'GGGGGGGGGGGG', 'GGGGGGGGGGGG', 'GGGGGGGGGGGG', 'GG.GGG.GGG.G', 'G...GG..GG..',
  ],
  cloud: ['....KKKK....', '...KWWWWK...', '..KWWWWWWKK.', '.KWWWWWWWWWK', 'KWWWWWWWWWWK', 'KWWWWWWWWWWK', '.KKKKKKKKKK.'],
  invader: ['..K......K..', '...K....K...', '..KKKKKKKK..', '.KK.KKKK.KK.', 'KKKKKKKKKKKK', 'K.KKKKKKKK.K', 'K.K......K.K', '...KK..KK...'],
  heart: ['.RR...RR.', 'RRRR.RRRR', 'RRRRRRRRR', 'RRRRRRRRR', '.RRRRRRR.', '..RRRRR..', '...RRR...', '....R....'],
};

/**
 * Thorildsplan's 8-bit tiles, after Lars Arrhenius' work in its underpass
 * and stairs: square white and pale blue tiles, and on them, a tile to a
 * pixel, the mushrooms, ghosts and clouds of old video games. Sixteen meters
 * square to a repeat, laid on the walls of the cutting.
 */
export function pixelTilesTexture(): Texture {
  return cached('thorildsplan-pixels', () => {
    const size = 1024;
    const N = 80;
    const px = size / N;
    const [c, ctx] = canvas(size, size);
    const rnd = mulberry32(2008);
    ctx.fillStyle = '#b8c4cc';
    ctx.fillRect(0, 0, size, size);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        ctx.fillStyle = rnd() < 0.5 ? '#dce8f0' : '#e8f0f4';
        ctx.fillRect(i * px + 1, j * px + 1, px - 2, px - 2);
      }
    }
    const colors: Record<string, string> = { R: '#d0302a', W: '#fbfbf8', K: '#141414', B: '#2a4ad0' };
    const ghosts = ['#3ac8e8', '#f4a0c8', '#e03a2a', '#f0a030'];
    // Where each sprite's top left tile goes, as (column, row) from the canvas's top, whose bottom rows are the
    // wall's lowest meters: all within reach of the eye.
    const placed: Array<[string, number, number]> = [['mushroom', 2, 66], ['cloud', 15, 63], ['ghost', 28, 67], ['invader', 42, 64], ['heart', 55, 68], ['ghost', 66, 66]];
    for (const [k, [name, ci, cj]] of placed.entries()) {
      const g = ghosts[k % ghosts.length];
      for (const [j, row] of SPRITES[name].entries()) {
        for (let i = 0; i < row.length; i++) {
          const ch = row[i];
          if (ch === '.') continue;
          ctx.fillStyle = ch === 'G' ? g : name === 'invader' ? '#2a9a4a' : colors[ch];
          ctx.fillRect(((ci + i) % N) * px + 1, (cj + j) * px + 1, px - 2, px - 2);
        }
      }
    }
    return finish(c, 16);
  });
}
