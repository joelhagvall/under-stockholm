import type { Texture } from 'three';
import { cached, canvas, finish, mulberry32 } from '../textures';
import { ellipse, poly, vault, type Vault, type WallPen } from '../stationArt';

/**
 * Painted vaults for the blue line's caves, after the real works: Akalla's
 * ochre cave with Birgit Ståhl-Nyberg's grey stoneware murals, Husby's
 * frieze of birch trunks and steamboats (Birgit Broms), Stadshagen's cracked
 * grey rock and pleated sports pictures (Lasse Lindqvist), Västra skogen's
 * tiled forms (Sivert Lindblom), Näckrosen's framed showcases and lily pond
 * (Lizzie Olsson-Arle), Huvudsta's hanging garden (Per Holmberg), Rissne's
 * history of the world in handwriting (Madeleine Dranger and Rolf H
 * Reimers), Rinkeby's gold runes (Nisse Zetterberg), Duvbo's fossils (Gösta
 * Sillén) and Hjulsta's framed paintings. Drawn from descriptions and photos
 * in the spirit of the originals, not traced.
 *
 * As in `stationArt.ts`: v = 0 and 1 are the feet of the two rock walls, 0.5
 * the crown, and `wall()` draws in meters along the station and up from the rails.
 */

type Art = { texture: Texture; period: number };

/** Sprayed rock: a flat colour mottled with soft blotches of the given tones (as `r, g, b`). */
function rockBase(v: Vault, base: string, tones: string[], blots = 240): void {
  const { ctx, period, arc, rnd, wrap } = v;
  ctx.fillStyle = base;
  ctx.fillRect(-period, 0, period * 3, arc);
  const soft = tones.map((t) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(${t}, 0.4)`);
    g.addColorStop(1, `rgba(${t}, 0)`);
    return g;
  });
  for (let i = 0; i < blots; i++) {
    const x = rnd() * period, y = rnd() * arc, rx = 0.6 + rnd() * 2.6, ry = 0.3 + rnd() * 1.1;
    const fill = soft[i % soft.length];
    wrap(() => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(rx, ry);
      ctx.fillStyle = fill;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    });
  }
}

/** Handwriting, the right way up at (x, h), in meters. */
function script(pen: WallPen, s: string, x: number, h: number, size: number, color: string): void {
  const g = pen.ctx;
  pen.wrap(() => {
    g.save();
    g.translate(x, h);
    g.scale(1, -1);
    g.fillStyle = color;
    g.font = `italic 700 ${size}px "Snell Roundhand", "Apple Chancery", "Segoe Script", "Brush Script MT", cursive`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(s, 0, 0);
    g.restore();
  });
}

/** A rectangle from its lower left corner, in wall meters. */
function rect(g: CanvasRenderingContext2D, x: number, h: number, w: number, tall: number, fill: string): void {
  g.fillStyle = fill;
  g.fillRect(x, h, w, tall);
}

// ---------------------------------------------------------------- Akalla

/**
 * The whole cave in warm yellow ochre, and on the track walls Birgit
 * Ståhl-Nyberg's stoneware pictures of everyday life: big grey, black and
 * white figures pieced together like a jigsaw, with touches of blue, yellow
 * and brown.
 */
export function akallaTexture(arcLength: number): Art {
  const period = 40;
  return { period, texture: vault('akalla', period, arcLength, 1977, (v) => {
    rockBase(v, '#dcb462', ['236, 204, 128', '160, 118, 52', '222, 184, 104']);
    const { rnd } = v;
    for (const edge of [0, 1] as const) {
      v.wall(edge, (pen) => {
        const { ctx: g, wrap: w } = pen;
        const x0 = 5 + edge * 17, len = 13, lo = 1.6, hi = 5.0;
        // The stoneware ground, a pale warm grey.
        w(() => rect(g, x0, lo, len, hi - lo, '#c4c0b6'));
        // Figures: a row of people, big heads and blocky limbs, in greys and black.
        const bodies = ['#3c3c3e', '#6e6c68', '#9a968e', '#2a2a2c', '#58565a'];
        const accents = ['#2f5f9a', '#d8b040', '#8a5a34', '#4f7a44'];
        for (let k = 0; k < 6; k++) {
          const fx = x0 + 1.1 + k * 2.1 + rnd() * 0.3, s = 1.15 + rnd() * 0.2;
          const body = bodies[(k + edge) % bodies.length], accent = accents[(k * 3 + edge) % accents.length];
          const lean = (rnd() - 0.5) * 0.3;
          w(() => {
            // Legs, a coat or dress, arms and a round head with a dark cap of hair.
            poly(g, [[fx - 0.3 * s, lo + 0.05], [fx - 0.1 * s, lo + 0.05], [fx - 0.05 * s, lo + 1.0 * s], [fx - 0.3 * s, lo + 1.0 * s]], '#2a2a2c');
            poly(g, [[fx + 0.1 * s, lo + 0.05], [fx + 0.3 * s, lo + 0.05], [fx + 0.3 * s, lo + 1.0 * s], [fx + 0.05 * s, lo + 1.0 * s]], '#4a4a4c');
            poly(g, [[fx - 0.45 * s, lo + 0.85 * s], [fx + 0.45 * s, lo + 0.85 * s], [fx + 0.35 * s + lean, lo + 1.85 * s], [fx - 0.35 * s + lean, lo + 1.85 * s]], body, '#1c1c1e', 0.03);
            poly(g, [[fx - 0.2 * s + lean, lo + 1.35 * s], [fx + 0.2 * s + lean, lo + 1.35 * s], [fx + 0.14 * s + lean, lo + 1.8 * s], [fx - 0.14 * s + lean, lo + 1.8 * s]], accent);
            poly(g, [[fx + 0.35 * s + lean, lo + 1.75 * s], [fx + 0.8 * s + lean, lo + 1.3 * s], [fx + 0.72 * s + lean, lo + 1.2 * s], [fx + 0.3 * s + lean, lo + 1.55 * s]], body, '#1c1c1e', 0.03);
            ellipse(g, fx + lean, lo + 2.12 * s, 0.26 * s, 0.3 * s, '#e8e4da', '#1c1c1e', 0.03);
            poly(g, [[fx - 0.27 * s + lean, lo + 2.15 * s], [fx + 0.27 * s + lean, lo + 2.15 * s], [fx + 0.2 * s + lean, lo + 2.42 * s], [fx - 0.2 * s + lean, lo + 2.42 * s]], '#1c1c1e');
          });
        }
        // A leaflet held up by the last figure.
        pen.text('TILLSAMMANS', x0 + len - 1.0, hi - 0.45, 0.22, '#b3261e');
        pen.text('ÄR VI STARKA', x0 + len - 1.0, hi - 0.72, 0.22, '#b3261e');
        // The joints between the pieces, like a jigsaw.
        w(() => {
          g.strokeStyle = 'rgba(40, 38, 36, 0.55)';
          g.lineWidth = 0.025;
          for (let x = x0 + 0.6; x < x0 + len; x += 0.6) {
            g.beginPath(); g.moveTo(x, lo);
            for (let h = lo + 0.3; h <= hi; h += 0.3) g.lineTo(x + Math.sin(h * 7 + x) * 0.08, h);
            g.stroke();
          }
          for (let h = lo + 0.5; h < hi; h += 0.5) {
            g.beginPath(); g.moveTo(x0, h);
            for (let x = x0 + 0.3; x <= x0 + len; x += 0.3) g.lineTo(x, h + Math.sin(x * 5 + h) * 0.07);
            g.stroke();
          }
          g.strokeStyle = '#6a5a3a'; g.lineWidth = 0.08;
          g.strokeRect(x0, lo, len, hi - lo);
        });
      });
    }
  }) };
}

// ---------------------------------------------------------------- Husby

/**
 * Pale linden-green rock, and along both track walls Birgit Broms's frieze
 * of lacquered steel panels: a pale blue ground brushed like water and sky,
 * with black and white birch trunks and dark oaks in a row and old white
 * archipelago steamers between them.
 */
export function husbyTexture(arcLength: number): Art {
  const period = 36;
  return { period, texture: vault('husby', period, arcLength, 1977, (v) => {
    rockBase(v, '#cdca84', ['226, 224, 164', '160, 156, 88', '196, 196, 120']);
    const { rnd } = v;
    const boats = ['DJURGÅRDEN', 'WAXHOLM', 'NORRSKÄR', 'SÖDERARM'];
    for (const edge of [0, 1] as const) {
      v.wall(edge, (pen) => {
        const { ctx: g, wrap: w } = pen;
        const lo = 1.7, hi = 4.4;
        // A grey band of concrete under the frieze, streaked white.
        rect(g, -period, 0.4, period * 3, lo - 0.4, '#8e8d86');
        rect(g, -period, lo - 0.25, period * 3, 0.12, '#d8d6cc');
        // The pale blue ground, brushed in long strokes.
        rect(g, -period, lo, period * 3, hi - lo, '#b6c9dd');
        for (let i = 0; i < 160; i++) {
          const x = rnd() * period, h = lo + rnd() * (hi - lo), l = 0.4 + rnd() * 1.2;
          const c = rnd() > 0.5 ? 'rgba(236, 242, 250, 0.45)' : 'rgba(120, 146, 178, 0.3)';
          w(() => ellipse(g, x, h, l, 0.04 + rnd() * 0.05, c));
        }
        // Seams between the steel panels.
        w(() => { for (let x = 0; x < period; x += 1.2) rect(g, x, lo, 0.02, hi - lo, 'rgba(90, 100, 110, 0.35)'); });
        // Birches and oaks in a rhythmic row.
        for (let x = 0.8; x < period; x += 1.3 + rnd() * 1.6) {
          const oak = rnd() < 0.3, wide = oak ? 0.35 + rnd() * 0.2 : 0.18 + rnd() * 0.22;
          const marks: Array<[number, number, number]> = [];
          for (let h = lo; h < hi + 0.4; h += 0.12 + rnd() * 0.25) marks.push([h, 0.3 + rnd() * 0.7, rnd() > 0.5 ? 1 : 0]);
          w(() => {
            rect(g, x, lo, wide, hi - lo + 0.08, oak ? '#5a5a58' : '#f2f1ec');
            for (const [h, l, side] of marks) rect(g, side ? x + wide * (1 - l) : x, h, wide * l, 0.05, oak ? '#2e2e2c' : '#1c1c1c');
          });
        }
        // Two steamboats on each wall, white with a black funnel and the flag astern.
        for (let k = 0; k < 2; k++) {
          const bx = 5 + k * 18 + edge * 7, name = boats[k + edge * 2];
          w(() => {
            const b = lo + 0.25;
            poly(g, [[bx, b + 0.35], [bx + 3.2, b + 0.35], [bx + 3.6, b + 0.75], [bx - 0.15, b + 0.75]], '#f4f3ee', '#2a2a2a', 0.03);
            rect(g, bx + 0.3, b + 0.75, 2.4, 0.35, '#f4f3ee');
            rect(g, bx + 0.6, b + 1.1, 1.6, 0.25, '#f4f3ee');
            for (let i = 0; i < 9; i++) rect(g, bx + 0.4 + i * 0.25, b + 0.83, 0.14, 0.16, '#3a3a3a');
            rect(g, bx + 1.2, b + 1.35, 0.35, 0.6, '#1c1c1c');
            for (let p = 0; p < 4; p++) ellipse(g, bx + 1.1 - p * 0.35, b + 2.05 + p * 0.1, 0.22 + p * 0.06, 0.12 + p * 0.03, 'rgba(60, 60, 60, 0.45)');
            // The Swedish flag on its staff at the stern.
            rect(g, bx - 0.05, b + 0.75, 0.03, 0.6, '#3a3a3a');
            rect(g, bx - 0.5, b + 1.05, 0.45, 0.3, '#2a5ab0');
            rect(g, bx - 0.36, b + 1.05, 0.07, 0.3, '#f2c230');
            rect(g, bx - 0.5, b + 1.17, 0.45, 0.06, '#f2c230');
          });
          pen.text(name, bx + 1.8, lo + 0.78, 0.17, '#3a3a3a', '600');
        }
      });
    }
  }) };
}

// ---------------------------------------------------------------- Stadshagen

/**
 * Bare grey rock whose cracks are traced in thin red and white lines, and on
 * the track walls Lasse Lindqvist's pleated aluminium sports pictures on red
 * steel brackets: football, a running track, ice hockey and skiing.
 */
export function stadshagenTexture(arcLength: number): Art {
  const period = 48;
  return { period, texture: vault('stadshagen', period, arcLength, 1975, (v) => {
    rockBase(v, '#6c6b67', ['150, 148, 142', '52, 51, 48', '110, 108, 102']);
    const { ctx, arc, rnd, wrap } = v;
    // The cracks, wandering over walls and vault.
    for (let i = 0; i < 46; i++) {
      const pts: Array<[number, number]> = [];
      let x = rnd() * period, y = rnd() * arc;
      const dx = (rnd() - 0.5) * 0.6, dy = (rnd() > 0.5 ? 1 : -1) * (0.3 + rnd() * 0.5);
      for (let s = 0; s < 8 + rnd() * 10; s++) {
        pts.push([x, y]);
        x += dx + (rnd() - 0.5) * 0.5;
        y += dy + (rnd() - 0.5) * 0.3;
      }
      const color = i % 3 === 0 ? '#e8e6e0' : '#b0302a', width = 0.035 + rnd() * 0.04;
      wrap(() => {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke();
      });
    }
    type Scene = (g: CanvasRenderingContext2D, x: number, h: number, l: number, t: number) => void;
    const player = (g: CanvasRenderingContext2D, x: number, h: number, shirt: string, shorts: string) => {
      rect(g, x - 0.07, h, 0.05, 0.3, '#e8c8a8'); rect(g, x + 0.03, h, 0.05, 0.3, '#e8c8a8');
      rect(g, x - 0.09, h + 0.28, 0.19, 0.14, shorts);
      rect(g, x - 0.11, h + 0.42, 0.23, 0.28, shirt);
      ellipse(g, x, h + 0.8, 0.08, 0.09, '#e8c8a8');
    };
    const football: Scene = (g, x, h, l, t) => {
      rect(g, x, h, l, t, '#3fae2a');
      for (let s = 0; s < l; s += 1.2) poly(g, [[x + s, h], [x + s + 0.6, h], [x + Math.min(l, s + 1.4), h + t], [x + Math.min(l, s + 0.8), h + t]], '#4cc034');
      for (let k = 0; k < 8; k++) {
        player(g, x + 0.6 + k * (l - 1.2) / 7, h + 0.25 + (k % 3) * 0.3, '#d8321e', '#f2f2f2');
        if (k % 3 === 1) ellipse(g, x + 0.9 + k * (l - 1.2) / 7, h + 1.3, 0.09, 0.09, '#ffffff');
      }
    };
    const track: Scene = (g, x, h, l, t) => {
      rect(g, x, h, l, t, '#d8321e');
      g.strokeStyle = '#f2f2f2'; g.lineWidth = 0.03;
      for (let lane = 0; lane < 4; lane++) {
        const inset = 0.15 + lane * 0.12;
        g.beginPath(); g.roundRect(x + inset, h + inset, l - inset * 2, t - inset * 2, (t - inset * 2) / 2); g.stroke();
      }
      g.fillStyle = '#3fae2a';
      g.beginPath(); g.roundRect(x + 0.7, h + 0.7, l - 1.4, t - 1.4, (t - 1.4) / 2); g.fill();
      for (let k = 0; k < 5; k++) player(g, x + 1 + k * 1.1, h + 0.12, ['#2a5ab0', '#f2c230', '#3a3a3a'][k % 3], '#f2f2f2');
    };
    const hockey: Scene = (g, x, h, l, t) => {
      rect(g, x, h, l, t, '#eef2f4');
      rect(g, x + l * 0.33, h, 0.08, t, '#2a5ab0'); rect(g, x + l * 0.66, h, 0.08, t, '#2a5ab0'); rect(g, x + l * 0.5, h, 0.06, t, '#d8321e');
      for (let k = 0; k < 7; k++) player(g, x + 0.5 + k * (l - 1) / 6, h + 0.2 + (k % 2) * 0.45, k % 2 ? '#f2c230' : '#1d3f8a', k % 2 ? '#1c1c1c' : '#d8321e');
      ellipse(g, x + l * 0.45, h + 0.18, 0.06, 0.03, '#1c1c1c');
    };
    const skiing: Scene = (g, x, h, l, t) => {
      rect(g, x, h, l, t, '#6aa8e0');
      poly(g, [[x, h], [x + l, h], [x + l, h + t * 0.45], [x + l * 0.6, h + t * 0.8], [x + l * 0.3, h + t * 0.55], [x, h + t * 0.7]], '#f4f6f8');
      for (let k = 0; k < 6; k++) {
        const sx = x + 0.6 + k * (l - 1.2) / 5, sh = h + 0.2 + ((k * 0.37) % 0.6);
        rect(g, sx - 0.3, sh, 0.6, 0.03, '#1c1c1c');
        poly(g, [[sx - 0.08, sh + 0.03], [sx + 0.08, sh + 0.03], [sx + 0.14, sh + 0.55], [sx - 0.02, sh + 0.55]], ['#d8321e', '#1d3f8a', '#2a2a2a'][k % 3]);
        ellipse(g, sx + 0.06, sh + 0.65, 0.07, 0.08, '#e8c8a8');
      }
    };
    const scenes: Scene[][] = [[football, track], [hockey, skiing]];
    for (const edge of [0, 1] as const) {
      v.wall(edge, ({ ctx: g, wrap: w }) => {
        scenes[edge].forEach((scene, k) => {
          const x = 4 + k * 24 + edge * 8, l = 10, h = 1.9, t = 3.1;
          w(() => {
            // Red steel brackets under the panel.
            rect(g, x - 0.2, h - 0.3, l + 0.4, 0.08, '#b3262a');
            for (const px of [x + 0.3, x + l / 2, x + l - 0.4]) rect(g, px, h - 0.9, 0.08, 0.9, '#b3262a');
            scene(g, x, h, l, t);
            // The pleats: each fold catches the light on one side.
            for (let s = 0; s < l; s += 0.16) {
              rect(g, x + s, h, 0.05, t, 'rgba(255, 255, 255, 0.12)');
              rect(g, x + s + 0.1, h, 0.05, t, 'rgba(0, 0, 0, 0.12)');
            }
          });
        });
      });
    }
  }) };
}

// ---------------------------------------------------------------- Västra skogen

/** A head in profile facing +x, as in Sivert Lindblom's silhouettes: unit height, from the neck up. */
const PROFILE: Array<[number, number]> = [
  [0, 0], [0.5, 0], [0.52, 0.18], [0.66, 0.26], [0.66, 0.34], [0.71, 0.38], [0.67, 0.42], [0.72, 0.46], [0.68, 0.52],
  [0.8, 0.62], [0.69, 0.68], [0.7, 0.8], [0.64, 0.92], [0.46, 1.0], [0.2, 0.98], [0.02, 0.84], [-0.04, 0.6], [0.06, 0.34],
];

/**
 * Dark bare rock, with Sivert Lindblom's tiled forms set into it: walls of
 * bright green tiles laid on the diagonal, scattered with blue, yellow and
 * orange, and a big black profile of a head cut through them; checkered
 * tiles in green, yellow, blue and white; and a band of small bright tiles
 * along the foot of the walls.
 */
export function vastraSkogenTexture(arcLength: number): Art {
  const period = 40;
  return { period, texture: vault('vastra-skogen', period, arcLength, 1985, (v) => {
    rockBase(v, '#57534c', ['30, 28, 26', '110, 104, 94', '70, 66, 58']);
    const { rnd } = v;
    const bright = ['#5cb030', '#4a9ad8', '#e8c030', '#e07a20', '#f0efe8', '#d8403a'];
    for (const edge of [0, 1] as const) {
      v.wall(edge, ({ ctx: g, wrap: w }) => {
        // A band of small tiles in many colours along the foot of the wall.
        const band: string[] = [];
        for (let x = 0; x < period; x += 0.1) band.push(bright[Math.floor(rnd() * bright.length)]);
        w(() => band.forEach((c, i) => rect(g, i * 0.1 + 0.01, 1.2, 0.08, 0.08, c)));
        w(() => rect(g, 0, 1.08, period, 0.07, '#6ab8e0'));
        // The green tiled wall with the profile.
        const x0 = 7 + edge * 16, l = 8, lo = 1.6, hi = 5.2, tile = 0.2;
        const dots: Array<[number, number, string]> = [];
        for (let i = 0; i < 70; i++) dots.push([x0 + rnd() * l, lo + rnd() * (hi - lo), bright[1 + Math.floor(rnd() * 3)]]);
        w(() => {
          g.save();
          g.beginPath(); g.rect(x0, lo, l, hi - lo); g.clip();
          rect(g, x0, lo, l, hi - lo, '#e8e6de');
          // Tiles on the diagonal: diamonds with pale grout between them.
          for (let a = -l; a < l * 2; a += tile) for (let b = lo - l; b < hi + l; b += tile) {
            const cx = x0 + (a + b - lo) / Math.SQRT2 * 0.7, ch = lo + (b - a - lo + l) / Math.SQRT2 * 0.7;
            if (cx < x0 - 0.2 || cx > x0 + l + 0.2 || ch < lo - 0.2 || ch > hi + 0.2) continue;
            poly(g, [[cx, ch - 0.09], [cx + 0.09, ch], [cx, ch + 0.09], [cx - 0.09, ch]], '#5cb030');
          }
          for (const [dx, dh, c] of dots) poly(g, [[dx, dh - 0.09], [dx + 0.09, dh], [dx, dh + 0.09], [dx - 0.09, dh]], c);
          // A line of orange and yellow tiles running up the wall.
          for (let k = 0; k < 18; k++) poly(g, [[x0 + l - 0.4 - k * 0.2, lo + 0.1 + k * 0.2 - 0.09], [x0 + l - 0.31 - k * 0.2, lo + 0.1 + k * 0.2], [x0 + l - 0.4 - k * 0.2, lo + 0.19 + k * 0.2], [x0 + l - 0.49 - k * 0.2, lo + 0.1 + k * 0.2]], k % 3 ? '#e07a20' : '#e8c030');
          // The black profile, head high.
          const s = 3.4, px = x0 + 1.4, ph = lo + 0.1;
          poly(g, PROFILE.map(([x, h]) => [px + x * s, ph + h * s] as [number, number]), '#1c1c1e');
          g.restore();
        });
        // A checkered form: diamonds of green, yellow, blue, white and black.
        const cx0 = 27 - edge * 8, colors = ['#5cb030', '#e8c030', '#4a9ad8', '#f0efe8', '#1c1c1e'];
        const cells: string[] = [];
        for (let i = 0; i < 60; i++) cells.push(colors[Math.floor(rnd() * colors.length)]);
        w(() => {
          let i = 0;
          for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++) {
            const x = cx0 + c * 0.42 + (r % 2) * 0.21, h = 2.1 + r * 0.42 + Math.abs(c - 5) * 0.16;
            poly(g, [[x, h - 0.21], [x + 0.21, h], [x, h + 0.21], [x - 0.21, h]], cells[i++]);
          }
        });
      });
    }
  }) };
}

// ---------------------------------------------------------------- Näckrosen

/**
 * A pale grey-white cave, with glass showcases in thick yellow, cobalt and
 * bottle-green frames along the walls (film history from Råsunda: photos and
 * drawings), and in the crown of the vault a pond of water lilies, edged
 * with pebbles set into the rock.
 */
export function nackrosenTexture(arcLength: number): Art {
  const period = 48;
  return { period, texture: vault('nackrosen', period, arcLength, 1975, (v) => {
    rockBase(v, '#d9d8d2', ['170, 168, 162', '240, 240, 236', '196, 194, 188']);
    const { ctx, arc, rnd, wrap } = v;
    // The lily pond, once a period, in the crown.
    const px = period / 2, py = arc / 2, rx = 8, ry = arc * 0.2;
    const pads: Array<[number, number, number, string]> = [];
    for (let i = 0; i < 260; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.92;
      pads.push([px + Math.cos(a) * rx * r, py + Math.sin(a) * ry * r, 0.16 + rnd() * 0.22, rnd() > 0.5 ? '#3e7a3a' : '#6aa050']);
    }
    const pebbles: Array<[number, number, number, string]> = [];
    for (let i = 0; i < 160; i++) {
      const a = rnd() * Math.PI * 2, r = 1 + rnd() * 0.12;
      pebbles.push([px + Math.cos(a) * rx * r, py + Math.sin(a) * ry * r, 0.08 + rnd() * 0.12, ['#8a7a66', '#6e6a62', '#a89884', '#5a524a'][i % 4]]);
    }
    wrap(() => {
      ellipse(ctx, px, py, rx, ry, '#6a9ad0');
      ellipse(ctx, px - 1.5, py + 0.4, rx * 0.6, ry * 0.5, 'rgba(150, 190, 230, 0.5)');
      for (const [x, y, r, c] of pads) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, 0.3, Math.PI * 2 - 0.2); ctx.closePath(); ctx.fillStyle = c; ctx.fill();
      }
      for (let i = 0; i < pads.length; i += 9) ellipse(ctx, pads[i][0] + 0.1, pads[i][1], 0.1, 0.1, i % 2 ? '#f6f2f0' : '#f0b8c8');
      for (const [x, y, r, c] of pebbles) ellipse(ctx, x, y, r, r * 0.8, c);
    });
    const frames = ['#e2b81e', '#2a58b0', '#1e4a38'];
    for (const edge of [0, 1] as const) {
      v.wall(edge, ({ ctx: g, wrap: w }) => {
        rect(g, -period, 0.9, period * 3, 0.5, '#5e5d5a');
        for (let k = 0; k < 4; k++) {
          const x = 3 + k * 12 + edge * 5, l = 4.2, lo = 2.0, t = 2.3, color = frames[(k + edge) % 3];
          const photos = k % 2 === 0;
          const shades: string[] = [];
          for (let i = 0; i < 24; i++) shades.push(['#2a2a2a', '#6a6a6a', '#9a9a96', '#4a4a48'][Math.floor(rnd() * 4)]);
          w(() => {
            rect(g, x - 0.24, lo - 0.24, l + 0.48, t + 0.48, color);
            rect(g, x, lo, l, t, '#ecebe4');
            if (photos) {
              // A collage of black and white film stills.
              let i = 0;
              for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) rect(g, x + 0.8 + c * 0.56, lo + 0.15 + r * 0.7, 0.5, 0.62, shades[i++]);
              for (let r = 0; r < 6; r++) rect(g, x + 0.08, lo + 0.2 + r * 0.24, 0.4, 0.03, '#3a3a3a');
            } else {
              // Line drawings of little figures, and a pair of striped socks.
              g.strokeStyle = '#1c1c1c'; g.lineWidth = 0.03;
              for (let f = 0; f < 3; f++) {
                const fx = x + 0.7 + f * 0.8;
                g.beginPath(); g.arc(fx, lo + 1.15, 0.12, 0, Math.PI * 2); g.moveTo(fx, lo + 1.03); g.lineTo(fx, lo + 0.55); g.lineTo(fx - 0.15, lo + 0.2); g.moveTo(fx, lo + 0.55); g.lineTo(fx + 0.15, lo + 0.2); g.moveTo(fx - 0.25, lo + 0.85); g.lineTo(fx + 0.3, lo + 0.95); g.stroke();
              }
              for (const sx of [x + l - 0.7, x + l - 0.4]) for (let s = 0; s < 6; s++) rect(g, sx, lo + 0.5 + s * 0.14, 0.2, 0.07, s % 2 ? '#c8402a' : '#e8d8b0');
            }
          });
        }
      });
    }
  }) };
}

// ---------------------------------------------------------------- Huvudsta

/**
 * Per Holmberg's hanging garden: a deep teal-green vault like foliage over
 * bare grey rock, the rock washed green down by the tracks, and along the
 * walls a frieze of red, saffron and violet rectangles.
 */
export function huvudstaTexture(arcLength: number): Art {
  const period = 30;
  return { period, texture: vault('huvudsta', period, arcLength, 1985, (v) => {
    rockBase(v, '#8f918b', ['170, 172, 166', '90, 92, 88', '120, 124, 118']);
    const { ctx, arc, rnd, wrap } = v;
    // The green foliage over the crown, its edge ragged.
    const edge0: Array<[number, number]> = [], edge1: Array<[number, number]> = [];
    for (let x = -0.5; x <= period + 0.5; x += 0.5) {
      edge0.push([x, 8.2 + Math.sin(x * 0.7) * 0.6 + (rnd() - 0.5) * 0.8]);
      edge1.push([x, arc - 8.2 - Math.sin(x * 0.55 + 2) * 0.6 - (rnd() - 0.5) * 0.8]);
    }
    const leaves: Array<[number, number, number, string]> = [];
    for (let i = 0; i < 220; i++) leaves.push([rnd() * period, 8 + rnd() * (arc - 16), 0.4 + rnd() * 1.4, ['rgba(46, 122, 100, 0.5)', 'rgba(18, 70, 56, 0.5)', 'rgba(60, 140, 110, 0.35)'][i % 3]]);
    wrap(() => {
      poly(ctx, [...edge0, ...[...edge1].reverse()], '#1f5c4c');
      for (const [x, y, r, c] of leaves) ellipse(ctx, x, y, r, r * 0.6, c);
    });
    for (const edge of [0, 1] as const) {
      v.wall(edge, ({ ctx: g, wrap: w }) => {
        // Dark bare rock low down, washed teal in patches.
        rect(g, -period, -1, period * 3, 3.3, '#4a4b48');
        for (let i = 0; i < 30; i++) {
          const x = rnd() * period, h = 0.3 + rnd() * 1.6, r = 0.5 + rnd() * 1.2;
          w(() => ellipse(g, x, h, r, r * 0.7, 'rgba(47, 120, 104, 0.55)'));
        }
        // The frieze.
        const blocks: Array<[number, number, string]> = [];
        for (let x = 0; x < period;) {
          const red = 0.7 + rnd() * 0.9;
          blocks.push([x, red, '#d42a38']);
          x += red;
          blocks.push([x, 0.05, '#3a3a8a']);
          x += 0.05;
          const yellow = 0.18 + rnd() * 0.15;
          blocks.push([x, yellow, '#e8b030']);
          x += yellow;
          blocks.push([x, 0.05, '#3a3a8a']);
          x += 0.05;
        }
        w(() => {
          for (const [x, l, c] of blocks) rect(g, x, 2.3, l, 0.42, c);
          rect(g, 0, 2.26, period, 0.04, '#3a3a8a');
          rect(g, 0, 2.72, period, 0.04, '#3a3a8a');
        });
      });
    }
  }) };
}

// ---------------------------------------------------------------- Rissne

/** Events of world history, as the handwritten timeline has them. */
const HISTORY = [
  'Egyptens första dynasti', 'Cheopspyramiden byggs', 'Hammurabis lagar', 'Troja faller', 'Rom grundas', 'Buddha föds',
  'Perikles i Aten', 'Alexander den store', 'Kinesiska muren', 'Kristus föds', 'Pompeji begravs', 'Rom faller',
  'Muhammed i Medina', 'Karl den store', 'Vikingatåg', 'Birka', 'Ansgar i Sverige', 'Korstågen', 'Djingis khan',
  'Pesten når Europa', 'Timur Lenk', 'Ibn Batuta', 'Kalmarunionen', 'Gutenberg trycker', 'Columbus', 'Luther',
  'Gustav Vasa', 'Trettioåriga kriget', 'Stormaktstiden', 'Linné', 'Franska revolutionen', 'Ångmaskinen',
  'Emigrationen', 'Rösträtt', 'Första världskriget', 'Andra världskriget', 'FN bildas', 'Månlandningen',
];

/**
 * White rock with the history of the world written along the track walls in
 * a hand of many colours, a colour to each theme, from Egypt's first
 * dynasty to 1985 ("Vi ses på 1400-talet"), above bands of colour marking
 * the centuries, and dark bare rock down by the rails.
 */
export function rissneTexture(arcLength: number): Art {
  const period = 44;
  return { period, texture: vault('rissne', period, arcLength, 1985, (v) => {
    rockBase(v, '#eceae4', ['200, 198, 190', '250, 250, 246', '220, 218, 210']);
    const { rnd } = v;
    const inks = ['#d8403a', '#2a5ab0', '#4aa040', '#7a4aa0', '#1c1c1c', '#e07a8a'];
    for (const edge of [0, 1] as const) {
      v.wall(edge, (pen) => {
        const { ctx: g, wrap: w } = pen;
        rect(g, -period, -1, period * 3, 2.1, '#3e3d3a');
        // The century bands.
        ['#2a8a7a', '#f0efe8', '#3a6ab8', '#4aa040', '#f0efe8', '#2a8a7a', '#e8c030', '#d8403a'].forEach((c, i) => rect(g, -period, 1.1 + i * 0.09, period * 3, 0.07, c));
        // Six lines of handwriting, the events running on along the wall.
        let n = edge * 19;
        for (let line = 0; line < 6; line++) {
          let x = 0.4 + rnd() * 1.5;
          while (x < period - 2.5) {
            const s = HISTORY[n++ % HISTORY.length], size = 0.36 + rnd() * 0.08;
            script(pen, s, x, 2.2 + line * 0.5, size, inks[Math.floor(rnd() * inks.length)]);
            x += s.length * size * 0.42 + 0.5 + rnd() * 0.8;
          }
        }
        // Years along the top.
        for (let k = 0; k < 4; k++) pen.text(String(1400 + (k + edge * 4) * 75), 5 + k * 11, 5.3, 0.34, '#7a4aa0', 'italic 600');
        void g; void w;
      });
    }
  }) };
}

// ---------------------------------------------------------------- Rinkeby

/** Runes of the younger futhark, as strokes on a unit staff: [x0, h0, x1, h1] segments. */
const RUNES: number[][][] = [
  [[0, 0, 0, 1], [0, 0.75, 0.4, 1], [0, 0.5, 0.4, 0.75]], // f
  [[0, 0, 0, 1], [0, 1, 0.4, 0.6], [0.4, 0.6, 0.4, 0]], // u
  [[0, 0, 0, 1], [0, 0.8, 0.35, 0.6], [0.35, 0.6, 0, 0.4]], // þ
  [[0, 0, 0, 1], [0, 0.8, 0.4, 0.6], [0, 0.6, 0.4, 0.4]], // ą
  [[0, 0, 0, 1], [0, 1, 0.35, 0.8], [0.35, 0.8, 0, 0.55], [0, 0.55, 0.4, 0]], // r
  [[0, 0, 0, 1], [0, 0.6, 0.4, 1]], // k
  [[0, 0, 0, 1], [-0.3, 0.7, 0.3, 0.3]], // h
  [[0, 0, 0, 1], [-0.3, 0.6, 0.3, 0.6]], // n
  [[0, 0, 0, 1]], // i
  [[0, 0, 0, 1], [-0.3, 0.4, 0.3, 0.8]], // a
  [[0, 0, 0.3, 0.5], [0.3, 0.5, 0, 1]], // s
  [[0, 0, 0, 1], [-0.3, 0.7, 0, 1], [0, 1, 0.3, 0.7]], // t
  [[0, 0, 0, 1], [0, 1, 0.3, 0.8], [0.3, 0.8, 0, 0.6], [0, 0.6, 0.3, 0.4], [0.3, 0.4, 0, 0.2]], // b
  [[0, 0, 0, 1], [-0.3, 0.7, 0, 1], [0, 1, 0.3, 0.7]], // m
  [[0, 0, 0, 1], [0, 1, 0.35, 0.75]], // l
  [[0, 0, 0, 1], [-0.3, 0.3, 0, 0], [0, 0, 0.3, 0.3]], // R
];

/**
 * Rust-red rock, glowing orange under the lamps, with Nisse Zetterberg's
 * gold mosaics set into it: runic inscriptions and enlarged Viking finds (the
 * Rinkeby goat, a brooch, a ship), and Lennart Gram's birds flying along the
 * walls the way the trains run.
 */
export function rinkebyTexture(arcLength: number): Art {
  const period = 36;
  return { period, texture: vault('rinkeby', period, arcLength, 1975, (v) => {
    rockBase(v, '#c0643e', ['216, 128, 88', '128, 58, 34', '200, 104, 66']);
    const { rnd } = v;
    const gold = ['#c8a040', '#e0bc58', '#a88430', '#d8b050'];
    /** A stroke of gold mosaic: small squares of slightly different golds along a line. */
    const tesserae = (g: CanvasRenderingContext2D, x0: number, h0: number, x1: number, h1: number, width: number, seed: number) => {
      const r = mulberry32(seed), n = Math.max(1, Math.round(Math.hypot(x1 - x0, h1 - h0) / 0.05));
      for (let i = 0; i <= n; i++) for (let j = -1; j <= 1; j++) {
        const t = i / n, x = x0 + (x1 - x0) * t + j * width / 3 * 0.7, h = h0 + (h1 - h0) * t + j * width / 3 * 0.7;
        rect(g, x - width / 4, h - width / 4, width / 2, width / 2, gold[Math.floor(r() * gold.length)]);
      }
    };
    for (const edge of [0, 1] as const) {
      v.wall(edge, ({ ctx: g, wrap: w }) => {
        rect(g, -period, -1, period * 3, 2.1, '#6e645c');
        // A runic inscription running along the wall.
        const text: number[] = [];
        for (let i = 0; i < 26; i++) text.push(Math.floor(rnd() * RUNES.length));
        const x0 = 2 + edge * 10;
        w(() => text.forEach((r, i) => {
          const x = x0 + i * 0.7;
          for (const [a, b, c, d] of RUNES[r]) tesserae(g, x + a * 0.7, 3.5 + b * 0.85, x + c * 0.7, 3.5 + d * 0.85, 0.12, r * 31 + i);
        }));
        // The frame lines of the band.
        w(() => { rect(g, x0 - 0.3, 3.3, 26 * 0.7 + 0.3, 0.08, gold[0]); rect(g, x0 - 0.3, 4.5, 26 * 0.7 + 0.3, 0.08, gold[0]); });
        // The Rinkeby goat, much enlarged.
        const gx = 24 - edge * 16;
        w(() => {
          poly(g, [[gx, 2.1], [gx + 0.12, 2.1], [gx + 0.2, 2.6], [gx + 1.1, 2.6], [gx + 1.2, 2.1], [gx + 1.32, 2.1], [gx + 1.32, 2.95], [gx + 1.55, 3.3], [gx + 1.75, 3.25], [gx + 1.6, 3.55], [gx + 1.35, 3.5], [gx + 1.1, 3.05], [gx + 0.1, 3.05], [gx - 0.15, 3.2], [gx, 2.9]], gold[1]);
          g.strokeStyle = gold[2]; g.lineWidth = 0.07;
          g.beginPath(); g.moveTo(gx + 1.45, 3.5); g.quadraticCurveTo(gx + 1.2, 4.0, gx + 0.9, 3.7); g.stroke();
          g.beginPath(); g.moveTo(gx + 1.62, 3.3); g.lineTo(gx + 1.7, 3.05); g.stroke();
        });
        // A round brooch, with interlace.
        const bx = gx + 4;
        w(() => {
          ellipse(g, bx, 2.8, 0.55, 0.45, gold[0], gold[2], 0.06);
          g.strokeStyle = '#7a4a26'; g.lineWidth = 0.04;
          for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(bx, 2.8, 0.45 - k * 0.12, 0.35 - k * 0.09, k * 0.6, 0, Math.PI * 2); g.stroke(); }
        });
        // Birds flying toward the next station.
        const birds: Array<[number, number, number]> = [];
        for (let i = 0; i < 10; i++) birds.push([rnd() * period, 4.3 + rnd() * 1.2, 0.2 + rnd() * 0.15]);
        w(() => {
          g.strokeStyle = '#3a2418'; g.lineWidth = 0.04; g.lineCap = 'round';
          for (const [x, h, s] of birds) { g.beginPath(); g.moveTo(x - s, h + s * 0.5); g.quadraticCurveTo(x - s * 0.4, h + s * 0.6, x, h); g.quadraticCurveTo(x + s * 0.4, h + s * 0.6, x + s, h + s * 0.5); g.stroke(); }
        });
      });
    }
  }) };
}

// ---------------------------------------------------------------- Duvbo

/**
 * Grey-brown bare rock with Gösta Sillén's pale concrete reliefs pressed into it, as if found in the rock: ragged
 * slabs filled with grids like windows, fields of dots, rows of little bones, spirals and ribs, after photos of the
 * real station. Each motif keeps to its own cell of the slab, so none crosses another.
 */
export function duvboTexture(arcLength: number): Art {
  const period = 30;
  return { period, texture: vault('duvbo', period, arcLength, 1985, (v) => {
    rockBase(v, '#5e584e', ['40, 36, 30', '120, 112, 98', '80, 74, 64']);
    const { rnd } = v;
    for (const edge of [0, 1] as const) {
      v.wall(edge, ({ ctx: g, wrap: w }) => {
        for (let k = 0; k < 2; k++) {
          const x = 2 + k * 15 + edge * 6, l = 4 + rnd() * 1.5, lo = 1.7 + rnd() * 0.3, t = 2.6 + rnd() * 0.6;
          // The slab's ragged outline.
          const outline: Array<[number, number]> = [];
          for (let a = 0; a < 16; a++) {
            const ang = (a / 16) * Math.PI * 2;
            outline.push([x + l / 2 + Math.cos(ang) * (l / 2) * (0.85 + rnd() * 0.2), lo + t / 2 + Math.sin(ang) * (t / 2) * (0.85 + rnd() * 0.2)]);
          }
          // Three cells across and two up, inside the outline, one motif each.
          const cells: Array<[number, number, number]> = [];
          const cw = (l * 0.7) / 3, ch = (t * 0.62) / 2, x0 = x + l * 0.15, y0 = lo + t * 0.19;
          for (let c = 0; c < 3; c++) for (let r = 0; r < 2; r++) cells.push([x0 + (c + 0.5) * cw, y0 + (r + 0.5) * ch, Math.floor(rnd() * 5)]);
          w(() => {
            poly(g, outline, '#c4c0b6', '#8a8780', 0.05);
            g.strokeStyle = '#6a6862'; g.fillStyle = '#6a6862'; g.lineWidth = 0.035; g.lineCap = 'round';
            const hw = cw * 0.38, hh = ch * 0.38;
            for (const [cx, cy, kind] of cells) {
              g.beginPath();
              if (kind === 0) {
                // A spiral, like an ammonite.
                for (let a = 0; a < 22; a++) { const r = 0.02 + a * Math.min(hw, hh) / 22, ang = a * 0.7; if (a) g.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); else g.moveTo(cx + r, cy); }
                g.stroke();
              } else if (kind === 1) {
                // A grid of small windows.
                for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g.fillRect(cx - hw + i * hw * 0.72, cy - hh + j * hh * 0.72, hw * 0.42, hh * 0.42);
              } else if (kind === 2) {
                // A field of dots.
                for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { g.moveTo(cx - hw + i * hw * 0.5 + 0.03, cy - hh + j * hh * 0.66); g.arc(cx - hw + i * hw * 0.5, cy - hh + j * hh * 0.66, 0.03, 0, Math.PI * 2); }
                g.fill();
              } else if (kind === 3) {
                // A row of little bones, each lying along the row.
                for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
                  const bx = cx - hw * 0.5 + i * hw, by = cy - hh * 0.4 + j * hh * 0.8, bl = hw * 0.35;
                  g.moveTo(bx - bl, by); g.lineTo(bx + bl, by);
                  g.moveTo(bx - bl + 0.04, by); g.arc(bx - bl, by, 0.04, 0, Math.PI * 2);
                  g.moveTo(bx + bl + 0.04, by); g.arc(bx + bl, by, 0.04, 0, Math.PI * 2);
                }
                g.stroke();
              } else {
                // Ribs: short arcs one above the other.
                for (let i = 0; i < 4; i++) { const ry = cy - hh + i * hh * 0.6; g.moveTo(cx - hw, ry); g.quadraticCurveTo(cx, ry + hh * 0.3, cx + hw, ry); }
                g.stroke();
              }
            }
          });
        }
      });
    }
  }) };
}

// ---------------------------------------------------------------- Hjulsta

/**
 * The plain grey cave, with the competition's paintings hung on its track
 * walls: Eva Nyberg's long demonstration marching with red flags through
 * mountains, fields and town, naive portraits in ornate gold frames, and
 * sea birds over the water.
 */
export function hjulstaTexture(arcLength: number): Art {
  const period = 44;
  return { period, texture: vault('hjulsta', period, arcLength, 1973, (v) => {
    rockBase(v, '#8c8a84', ['168, 166, 160', '74, 73, 70', '120, 118, 112']);
    const { rnd } = v;
    v.wall(0, ({ ctx: g, wrap: w }) => {
      // The demonstration, fourteen meters long.
      const x = 5, l = 16, lo = 2.0, t = 2.4;
      const people: Array<[number, number]> = [];
      for (let i = 0; i < 44; i++) people.push([x + 2 + rnd() * 12, 0.7 + rnd() * 0.35]);
      w(() => {
        rect(g, x - 0.06, lo - 0.06, l + 0.12, t + 0.12, '#2a2a2a');
        rect(g, x, lo + t * 0.45, l, t * 0.55, '#1d3f9a');
        rect(g, x, lo, l, t * 0.45, '#e8c030');
        poly(g, [[x, lo + t * 0.4], [x + 1.2, lo + t * 0.85], [x + 2.4, lo + t * 0.5], [x + 3.4, lo + t * 0.8], [x + 4.4, lo + t * 0.4]], '#1c1c1c');
        poly(g, [[x + 0.3, lo + t * 0.55], [x + 1.2, lo + t * 0.8], [x + 1.9, lo + t * 0.55]], '#f2f0ea');
        // Pink and pale town at the far end, a factory chimney.
        for (let k = 0; k < 6; k++) rect(g, x + 12.4 + k * 0.6, lo + t * 0.3, 0.5, t * (0.35 + (k % 3) * 0.1), ['#e8a0a8', '#f2e0c0', '#e8c030'][k % 3]);
        rect(g, x + 10.2, lo + t * 0.3, 0.3, t * 0.65, '#3a3a3a');
        for (const [px, s] of people) {
          ellipse(g, px, lo + 0.25 + s * 0.9, 0.07 * s * 2, 0.08 * s * 2, '#1c1c1c');
          poly(g, [[px - 0.12 * s * 2, lo + 0.1], [px + 0.12 * s * 2, lo + 0.1], [px + 0.08 * s * 2, lo + 0.2 + s * 0.8], [px - 0.08 * s * 2, lo + 0.2 + s * 0.8]], '#1c1c1c');
        }
        // The flags, waving red over the marchers.
        for (let k = 0; k < 7; k++) {
          const fx = x + 3 + k * 1.6;
          rect(g, fx, lo + 0.5, 0.04, 1.2, '#1c1c1c');
          poly(g, [[fx, lo + 1.2], [fx + 0.8, lo + 1.35], [fx + 0.9, lo + 1.62], [fx + 0.05, lo + 1.7]], '#d8201e');
        }
      });
    });
    v.wall(1, ({ ctx: g, wrap: w }) => {
      // Three portraits in ornate gold frames: blue-clad figures on patterned ground.
      for (let k = 0; k < 3; k++) {
        const x = 4 + k * 2.1, lo = 2.1, l = 1.6, t = 2.1 + (k === 2 ? 0.3 : 0);
        w(() => {
          rect(g, x - 0.14, lo - 0.14, l + 0.28, t + 0.28, '#b89640');
          rect(g, x - 0.06, lo - 0.06, l + 0.12, t + 0.12, '#8a6a28');
          rect(g, x, lo, l, t, '#d8d6d0');
          g.fillStyle = '#9a9aa6';
          for (let a = 0; a < l; a += 0.08) for (let b = 0; b < t; b += 0.08) g.fillRect(x + a + 0.02, lo + b + 0.02, 0.03, 0.03);
          const heads = k === 1 ? [0.4, 0.8, 1.2] : [0.8];
          for (const hx of heads) {
            poly(g, [[x + hx - 0.3, lo], [x + hx + 0.3, lo], [x + hx + 0.22, lo + 0.95], [x + hx - 0.22, lo + 0.95]], k === 2 ? '#8a8a90' : '#1d3fb0');
            ellipse(g, x + hx, lo + 1.28, 0.2, 0.27, '#efe0c8');
          }
        });
      }
      // Sea birds over the water.
      const x = 18, l = 6;
      const birds: Array<[number, number]> = [];
      for (let i = 0; i < 12; i++) birds.push([x + 0.3 + rnd() * (l - 0.6), 3.0 + rnd() * 1.1]);
      w(() => {
        rect(g, x - 0.08, 2.02, l + 0.16, 2.36, '#3a3a3a');
        rect(g, x, 2.1, l, 2.2, '#a8c8e0');
        rect(g, x, 2.1, l, 0.8, '#2a5a8a');
        g.strokeStyle = '#f4f4f0'; g.lineWidth = 0.05;
        for (const [bx, bh] of birds) { g.beginPath(); g.moveTo(bx - 0.2, bh + 0.08); g.quadraticCurveTo(bx - 0.08, bh + 0.12, bx, bh); g.quadraticCurveTo(bx + 0.08, bh + 0.12, bx + 0.2, bh + 0.08); g.stroke(); }
      });
      // The last harvest: a field under a low sky.
      const hx = 30, hl = 7;
      w(() => {
        rect(g, hx - 0.08, 2.02, hl + 0.16, 2.26, '#3a3a3a');
        rect(g, hx, 2.1, hl, 2.1, '#c8d8d0');
        poly(g, [[hx, 2.1], [hx + hl, 2.1], [hx + hl, 3.1], [hx + hl * 0.5, 3.3], [hx, 3.05]], '#d8b040');
        for (let k = 0; k < 10; k++) rect(g, hx + 0.3 + k * 0.65, 2.3, 0.22, 0.55, '#a88430');
      });
    });
  }) };
}

// ---------------------------------------------------------------- Kungsträdgården

/**
 * Kungsträdgården's terrazzo, after the baroque parterre: pale sage green,
 * crossed by broad bands of brick red and white running on the diagonal from
 * edge to edge, so they meet in long chevrons down the platform. One tile is
 * `KUNGS_FLOOR` meters along and the island's width across.
 */
export const KUNGS_FLOOR = 14;

export function kungsFloorTexture(): Texture {
  return cached('kungs-floor', () => {
    const W = 1024, H = 512;
    const [c, g] = canvas(W, H);
    g.fillStyle = '#7c9c80';
    g.fillRect(0, 0, W, H);
    const rnd = mulberry32(1977);
    for (let i = 0; i < 40000; i++) {
      g.fillStyle = ['#ffffff30', '#23402a33', '#b0c8a830', '#6a5a4a22'][i % 4];
      g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    // Bands from one edge to the other and back, each a red stripe with a white one beside it.
    const band = (x0: number, dir: 1 | -1) => {
      for (const dx of [-W, 0, W]) {
        g.save();
        g.translate(x0 + dx, dir > 0 ? 0 : H);
        g.scale(1, dir);
        g.transform(1, 0, W / 2 / H, 1, 0, 0);
        g.fillStyle = '#a94a3c';
        g.fillRect(0, 0, 36, H);
        g.fillStyle = '#ece8e0';
        g.fillRect(36, 0, 22, H);
        g.restore();
      }
    };
    band(0, 1);
    band(0, -1);
    band(W / 2, 1);
    band(W / 2, -1);
    return finish(c, null);
  });
}
