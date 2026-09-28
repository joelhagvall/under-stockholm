import type { Texture, Vector3 } from 'three';
import { mix, rgb, type RGB } from '../gfx/color';
import { fbm3 } from '../gfx/noise';
import { cached, canvas, finish, mulberry32 } from '../gfx/textures';

export interface Theme {
  paint: (p: Vector3, n: Vector3) => RGB;
  /** Optional painted artwork for the vault, given the vault's cross-section length. */
  /** Optional painted artwork for the vault, given the vault's cross-section length and how high its walls stand before the ceiling. */
  art?: (arcLength: number, wall?: number) => { texture: Texture; period: number };
  ambient: RGB;
  lamp: RGB;
}

export const warmLamp = rgb(0xffefdb);
export const coolLamp = rgb(0xf1f5ff);

/** A theme from a flat-ish rock color, for the stations whose art is freely interpreted. */
export const pattern = (ambient: number, lamp: RGB, paint: Theme['paint']): Theme => ({ ambient: rgb(ambient), lamp, paint });
export const grain = (p: Vector3, seed: number, scale = 0.4) => fbm3(p.x * scale, p.y * scale * 1.4, p.z * scale, 4, seed);

/** Sprayed rock mottled between two colors. */
export const rock = (ambient: number, lamp: RGB, dark: number, light: number, seed: number): Theme =>
  pattern(ambient, lamp, (p) => mix(rgb(dark), rgb(light), grain(p, seed)));

/**
 * A tiled wall, as in the 1950s stations: square tiles of `size` meters with
 * pale grout, each a little different in shade, up the walls of a box
 * station, under a plain painted ceiling. Below `dado` the tiles take the
 * darker `low` color; a `band` of `accent` runs at the given height. The
 * tiles are a texture along the walls (vertex colors are far too coarse for
 * grout lines); end walls and columns get the plain colors.
 */
export function tiles(ambient: number, lamp: RGB, o: { tile: number; low?: number; dado?: number; accent?: number; band?: [number, number]; size?: number; seed: number; ceiling?: number; frieze?: { colors: number[]; from: number; to: number } }): Theme {
  const size = o.size ?? 0.3;
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  const colorAt = (y: number) => (o.band && y > o.band[0] && y < o.band[1] ? o.accent ?? o.tile : y < (o.dado ?? -1) ? o.low ?? o.tile : o.tile);
  const theme = pattern(ambient, lamp, (p) => mix(rgb(colorAt(p.y)), rgb(0xd8d6ce), 0.12));
  theme.art = (arcLength, wallH = TILED_WALL_H - TILED_BOTTOM) => ({
    period: size * 4,
    texture: cached(`tiles:${o.seed}:${arcLength.toFixed(2)}:${wallH.toFixed(2)}`, () => {
      // One column of four tiles along x, and the whole cross-section down: wall, ceiling, wall.
      const W = 64;
      const H = 1024;
      const [c, ctx] = canvas(W, H);
      const rnd = mulberry32(o.seed);
      const perM = H / arcLength;
      const wall = wallH;
      // Ceiling first, then tile each wall from its foot (v = 0 and v = 1) up.
      ctx.fillStyle = hex(o.ceiling ?? 0xecebe6);
      ctx.fillRect(0, 0, W, H);
      for (const side of [0, 1]) {
        for (let y = 0; y < wall; y += size) {
          for (let k = 0; k < 4; k++) {
            const shade = Math.round((rnd() - 0.5) * 14);
            const at = TILED_BOTTOM + y + size / 2;
            // A ceramic frieze: a band of tiles in many colours, as along T-Centralen's tracks.
            const f = o.frieze && at > o.frieze.from && at < o.frieze.to ? o.frieze.colors[Math.floor(rnd() * o.frieze.colors.length)] : null;
            const hexColor = f ?? colorAt(at);
            ctx.fillStyle = `rgb(${[16, 8, 0].map((b) => Math.max(0, Math.min(255, ((hexColor >> b) & 255) + shade))).join(',')})`;
            const v0 = y * perM;
            const v1 = Math.min(wall, y + size) * perM;
            const top = side === 0 ? v0 : H - v1;
            ctx.fillRect((k * W) / 4 + 1, top + 1, W / 4 - 2, v1 - v0 - 2);
          }
        }
        const edge = side === 0 ? wall * perM : H - wall * perM;
        ctx.fillStyle = hex(0x9a978e);
        ctx.fillRect(0, edge - 2, W, 4);
      }
      return finish(c, null);
    }),
  });
  return theme;
}

/** The tiled box stations' walls: from the track bed up to where the ceiling starts. */
export const TILED_BOTTOM = -0.5;
export const TILED_WALL_H = 5.1;
export const TILED_TOP = 5.7;
/** The low barrel vaults of a vaulted tiled station (T-Centralen's red and green platforms). */
export const VAULT_WALL_H = 3.8;
export const VAULT_TOP = 6.6;

/**
 * Pale concrete walls with black lines drawn into them, as Siri Derkert's at
 * Östermalmstorg: loose figures and faces, under a plain concrete vault.
 */
export function drawings(ambient: number, lamp: RGB, seed: number): Theme {
  const theme = pattern(ambient, lamp, (p) => mix(rgb(0xd6d0c4), rgb(0xe6e1d6), grain(p, seed, 0.5)));
  theme.art = (arcLength, wallH = TILED_WALL_H - TILED_BOTTOM) => ({
    period: 12,
    texture: cached(`drawings:${seed}:${arcLength.toFixed(2)}:${wallH.toFixed(2)}`, () => {
      const W = 512;
      const H = 1024;
      const [c, ctx] = canvas(W, H);
      const rnd = mulberry32(seed);
      const perM = H / arcLength;
      ctx.fillStyle = '#cfc9bd';
      ctx.fillRect(0, 0, W, H);
      // Shuttering marks in the concrete.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
      for (let x = 0; x < W; x += W / 12) ctx.fillRect(x, 0, 2, H);
      ctx.strokeStyle = '#1c1c1c';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const side of [0, 1]) {
        const lo = 1.3 * perM;
        const hi = (wallH - 0.2) * perM;
        for (let k = 0; k < 26; k++) {
          ctx.lineWidth = 1.5 + rnd() * 2.5;
          ctx.beginPath();
          let x = rnd() * W;
          let y = lo + rnd() * (hi - lo);
          ctx.moveTo(x, side === 0 ? y : H - y);
          for (let n = 0; n < 5; n++) {
            const x2 = x + (rnd() - 0.5) * 120;
            const y2 = Math.max(lo, Math.min(hi, y + (rnd() - 0.5) * 90));
            ctx.quadraticCurveTo(x + (rnd() - 0.5) * 80, side === 0 ? y + (rnd() - 0.5) * 80 : H - y - (rnd() - 0.5) * 80, x2, side === 0 ? y2 : H - y2);
            x = x2;
            y = y2;
          }
          ctx.stroke();
        }
      }
      return finish(c, null);
    }),
  });
  return theme;
}
