import text from '../i18n/sv.json';
import { mix, rgb, type RGB } from '../gfx/color';
import { fbm3 } from '../gfx/noise';
import { JUNCTION_RUN } from '../layout';
import type { LineDef } from '../line';
import { coolLamp, grain, pattern, rock, TILED_BOTTOM, TILED_WALL_H, tiles, VAULT_WALL_H, warmLamp, type Theme } from './theme';
import { fridhemsplanTexture, radmansgatanTexture, skanstullTexture } from '../gfx/art/green';

/*
 * The green line: routes 17 (Åkeshov to Skarpnäck), 18 (Alvik to Farsta
 * strand) and 19 (Hässelby strand to Hagsätra), listed from the west so that
 * through the city it runs south along +x beside the red line, whose
 * T-Centralen, Gamla stan and Slussen it shares (see `LANE`). The routes
 * share the trunk from Alvik to Gullmarsplan; 18 turns back on a siding
 * before Alvik and 17 before Åkeshov. South of Gullmarsplan they part: 19
 * to Hagsätra, and 17 and 18 together to Skärmarbrink, where they part too.
 * The inner city stations are the tiled boxes of the 1950s; most of the
 * line runs in the open, which comes later (`open`). Boardings are estimates.
 */

// Thorildsplan: tiles laid out as the pixels of an old arcade game.
const arcade: Theme = pattern(0x3e3f4a, coolLamp, (p, n) => {
  const u = Math.abs(n.x) > 0.7 ? p.z : p.x;
  const cx = Math.floor(u / 0.2);
  const cy = Math.floor(p.y / 0.2);
  if (p.y > 1.4 && p.y < 3.8) {
    const k = fbm3(cx * 0.35, cy * 0.35, 0, 1, 121);
    if (k > 0.66) return rgb(0xf2d13b);
    if (k < 0.24) return [rgb(0xd8342b), rgb(0x2f9fe0), rgb(0xf29ac2)][((cx >> 3) % 3 + 3) % 3];
  }
  return (cx + cy) & 1 ? rgb(0x10122a) : rgb(0x171a38);
});


// Skarpnäck (1994): one wide vault of sprayed rock painted deep oxide red, walls and all, darker down by the rails.
const redCave: Theme = pattern(0x4a2620, warmLamp, (p) => mix(mix(rgb(0x5e1a10), rgb(0xa13c24), grain(p, 124)), rgb(0x2e0e08), Math.max(0, (1.4 - p.y) / 2.4)));

// Bagarmossen (1994, Gert Marcus): an all-grey cave, pale grey rock over a black lower wall (with its band of glass, `details/green.ts`).
const greyCave: Theme = pattern(0x44464a, coolLamp, (p) => (p.y < 2.2 ? mix(rgb(0x262728), rgb(0x3a3b3c), grain(p, 126)) : mix(rgb(0x5e5f5e), rgb(0x8e8f8d), grain(p, 127))));

/** A tiled 1950s box whose walls are a painted artwork, its end walls and columns in the wall's colour. */
const painted = (ambient: number, lamp: RGB, wall: number, art: (arc: number, wallH: number) => ReturnType<NonNullable<Theme['art']>>, ceiling = 0xefeee9, top: number = TILED_WALL_H): Theme => ({
  ...pattern(ambient, lamp, (p) => (p.y < 1.0 ? rgb(0x4a4a46) : p.y > top ? rgb(ceiling) : rgb(wall))),
  art: (arc, wallH = TILED_WALL_H - TILED_BOTTOM) => art(arc, wallH),
});

// Fridhemsplan's green platform: yellow perforated panels under a vault half bare rock, half the white 1952 vault.
const fridhemsplan = painted(0x4e4c46, coolLamp, 0xe0d78e, fridhemsplanTexture, 0x5c5b58, VAULT_WALL_H);
// Rådmansgatan: pale cream tiles and Strindberg's drawings on white enamel.
const radmansgatan = painted(0x56564e, warmLamp, 0xe9e2c8, radmansgatanTexture);
// Skanstull: framed cream-yellow tiles over a dark plinth.
const skanstull = painted(0x55544c, warmLamp, 0xe9dfae, skanstullTexture);
// Hötorget: glossy tiles in seven shades of pale blue and blue-green, floor to ceiling.
const hotorget = tiles(0x5a6466, coolLamp, { tile: 0xb9d2d2, seed: 153, size: 0.18, ceiling: 0xf2f2ee, frieze: { colors: [0xcfe0de, 0xc4dada, 0xb9d2d2, 0xafcacc, 0xa5c3c6, 0xd6e6e2, 0xbfd8d4], from: -1, to: 6 } });
// Medborgarplatsen: mustard-yellow tiles over a black band by the rails, under an off-white vault.
const medborgarplatsen = tiles(0x5a5446, warmLamp, { tile: 0xd4b13a, low: 0x1c1c1c, dado: 1.25, seed: 149, size: 0.15, ceiling: 0xe6e3da });

/** Tiled boxes of the 1950s, each in its own colour. */
const box = (tile: number, low: number, seed: number, accent?: number): Theme =>
  tiles(0x52555a, seed % 2 ? warmLamp : coolLamp, { tile, low, dado: 1.3, seed, ...(accent ? { accent, band: [3.4, 3.6] as [number, number] } : {}) });

export const GREEN_LINE: LineDef = {
  id: 'green',
  bullets: ['17', '18', '19'],
  name: 'Gröna linjen',
  color: '#2e8b57',
  trains: 8,
  routes: [
    { number: '17', outbound: 'Skarpnäck', inbound: 'Åkeshov', shifted: true },
    { number: '18', outbound: 'Farsta strand', inbound: 'Alvik', shifted: true },
    { number: '19', outbound: 'Hagsätra', inbound: 'Hässelby strand' },
  ],
  stations: [
    // Route 19 from Hässelby strand.
    { name: 'Hässelby strand', map: [0.032, 0.27], sl: 9100, riders: 5000, architecture: 'tiles', exits: 'Hässelby strand', halls: [{ end: 'inbound', from: 60, down: true }], branch: '19', open: true, theme: box(0xdfe4ea, 0x3a5a7a, 170) },
    { name: 'Hässelby gård', map: [0.042, 0.3], sl: 9101, riders: 5000, architecture: 'tiles', exits: 'Hässelby gård', halls: [{ end: 'inbound', from: 60, down: true }], branch: '19', open: true, theme: box(0xe6e2d8, 0x7a6a5a, 169) },
    { name: 'Johannelund', map: [0.052, 0.33], sl: 9102, riders: 2000, architecture: 'tiles', exits: 'Johannelund', halls: [{ end: 'outbound', from: 20, down: true }], branch: '19', open: true, theme: box(0xe2e6e0, 0x5a7a6a, 168) },
    { name: 'Vällingby', map: [0.065, 0.36], sl: 9103, riders: 14000, architecture: 'tiles', exits: 'Vällingby centrum', halls: [{ end: 'outbound' }], branch: '19', open: true, theme: box(0xe8e6de, 0x2a6a8a, 167, 0xd8342b) },
    { name: 'Råcksta', map: [0.085, 0.38], sl: 9104, riders: 3500, architecture: 'tiles', exits: 'Råcksta', halls: [{ end: 'inbound', from: 60, down: true }], branch: '19', open: true, theme: box(0xe0e4e0, 0x5a6a5a, 166) },
    { name: 'Blackeberg', map: [0.105, 0.4], sl: 9105, riders: 4500, architecture: 'tiles', exits: 'Blackebergs centrum', halls: [{ end: 'outbound' }], branch: '19', open: true, theme: box(0xe8e2d6, 0x8a5a4a, 165) },
    { name: 'Islandstorget', map: [0.125, 0.42], sl: 9106, riders: 4000, architecture: 'tiles', exits: 'Islandstorget', halls: [{ end: 'inbound' }], branch: '19', open: true, theme: box(0xdfe4e8, 0x4a6a8a, 164) },
    { name: 'Ängbyplan', map: [0.145, 0.44], sl: 9107, riders: 2500, architecture: 'tiles', exits: 'Ängbyplan', halls: [{ end: 'inbound', from: 60, down: true }], branch: '19', open: true, theme: box(0xe6e4dc, 0x6a6a5a, 163) },
    // Routes 17 and 19; 17 turns on a siding beyond Åkeshov, 18 beyond Alvik.
    { name: 'Åkeshov', map: [0.165, 0.458], sl: 9108, riders: 2500, architecture: 'tiles', exits: 'Åkeshov', halls: [{ end: 'outbound', from: 60, down: true }], branch: ['17', '19'], open: true, theme: box(0xe0e6e0, 0x5a7a5a, 162) },
    { name: 'Brommaplan', map: [0.19, 0.466], sl: 9109, riders: 10000, open: true, architecture: 'tiles', exits: 'Brommaplan', halls: [{ end: 'inbound', from: 60, down: true }], branch: ['17', '19'], theme: box(0xe8e4d8, 0x8a6a3a, 161) },
    { name: 'Abrahamsberg', map: [0.22, 0.468], sl: 9110, riders: 3000, open: true, architecture: 'tiles', exits: 'Abrahamsberg', halls: [{ end: 'inbound', from: 60, down: true }], branch: ['17', '19'], theme: box(0xe0e4e8, 0x4a5a6a, 160) },
    { name: 'Stora mossen', map: [0.25, 0.468], sl: 9111, riders: 3000, open: true, architecture: 'tiles', exits: 'Stora mossen', halls: [{ end: 'outbound', from: 60, down: true }], branch: ['17', '19'], theme: box(0xe6e2d8, 0x7a6a4a, 159) },
    // The trunk through the city. T-Centralen, Gamla stan and Slussen are the red line's stations, shared.
    { name: 'Alvik', map: [0.28, 0.468], sl: 9112, riders: 15000, architecture: 'tiles', exits: 'Alviks torg', halls: [{ end: 'inbound', from: 60, down: true }, { end: 'outbound' }], open: true, transfer: text.announcements.alvikTransfer, theme: box(0xe4e6e0, 0x4a6a5a, 158) },
    { name: 'Kristineberg', map: [0.32, 0.462], sl: 9113, riders: 5000, gap: 900, architecture: 'tiles', exits: 'Kristineberg', halls: [{ end: 'inbound', from: 60, down: true }], open: true, theme: box(0xe0e4e6, 0x5a6a7a, 157) },
    { name: 'Thorildsplan', map: [0.36, 0.458], sl: 9114, riders: 4000, architecture: 'tiles', exits: 'Thorildsplan', halls: [{ end: 'outbound', from: 60, down: true }], open: true, theme: arcade },
    // Fridhemsplan's green platform (1952): one vault over the island, half bare grey rock and half the old white vault, over yellow perforated panels.
    { name: 'Fridhemsplan', map: [0.405, 0.438], sl: 9115, riders: 15000, rise: 10, architecture: 'tiles', exits: 'Drottningholmsvägen · S:t Eriksgatan', halls: [{ end: 'outbound', incline: true, exits: 'S:t Eriksgatan' }, { end: 'inbound', incline: true, exits: 'Drottningholmsvägen' }], transfer: text.announcements.otherMetro,
      look: { ceiling: 'vault', floor: 0x9a9894, columns: 'none' }, theme: fridhemsplan },
    // S:t Eriksplan (1952): a plain white tiled box without art, a low flat ceiling on one row of pale square columns.
    { name: 'S:t Eriksplan', map: [0.428, 0.395], sl: 9116, riders: 15000, rise: 7, architecture: 'tiles', exits: 'S:t Eriksplan · Atlasgatan', halls: [{ end: 'inbound' }, { end: 'outbound', incline: true }], look: { ceiling: 'flat', floor: 0xcfccc4, columns: 'none' }, theme: tiles(0x56585a, coolLamp, { tile: 0xe6e4dc, low: 0x5a5c5a, dado: 1.1, seed: 155, size: 0.15, ceiling: 0xeeeeea }) },
    // Odenplan: a shallow white vault over pale grey-green tiles, and a glass art case behind red railings on the platform.
    { name: 'Odenplan', map: [0.455, 0.378], sl: 9117, riders: 20000, rise: 7, architecture: 'tiles', exits: 'Odenplan · Karlbergsvägen', halls: [{ end: 'outbound', exits: 'Karlbergsvägen' }, { end: 'inbound', corridor: 10, exits: 'Västmannagatan' }], transfer: text.announcements.pendeltagTransfer, look: { ceiling: 'vault', floor: 0xd8cfbf, columns: 'none' }, theme: tiles(0x585c5a, coolLamp, { tile: 0xc9d3cc, low: 0x6a706c, dado: 1.0, seed: 154, size: 0.15, ceiling: 0xf0efe9 }) },
    // Rådmansgatan (1952): pale tiles, yellow tiled square columns under a flat ceiling, and Strindberg's drawings on white enamel.
    { name: 'Rådmansgatan', map: [0.482, 0.38], sl: 9118, riders: 12000, rise: 7, architecture: 'tiles', exits: 'Sveavägen · Rådmansgatan', halls: [{ end: 'inbound', corridor: 40, incline: true, exits: 'Sveavägen' }, { end: 'outbound' }], look: { ceiling: 'flat', floor: 0xcfcfca, columns: 'none' }, theme: radmansgatan },
    // Hötorget (1952): glossy tiles in seven shades of pale blue on the walls and square columns, and Gun Gordillo's loops of white neon under the ceiling.
    { name: 'Hötorget', map: [0.505, 0.405], sl: 9119, riders: 20000, rise: 7, architecture: 'tiles', exits: 'Hötorget · Kungsgatan', halls: [{ end: 'inbound', incline: true, exits: 'Tunnelgatan' }, { end: 'outbound', corridor: 30, exits: 'Malmskillnadsgatan' }, { end: 'outbound', from: -8 }], look: { ceiling: 'flat', floor: 0xcbbfaa, columns: 'none' }, theme: hotorget },
    { name: 'T-Centralen', shared: 'red', map: [0.507, 0.447] },
    { name: 'Gamla stan', shared: 'red', map: [0.513, 0.505] },
    { name: 'Slussen', shared: 'red', map: [0.522, 0.555] },
    // Medborgarplatsen (1933): mustard tiles over a black band, a low off-white vault, and Gunnar Söderström's blue columns striped in colour.
    { name: 'Medborgarplatsen', map: [0.54, 0.59], sl: 9191, riders: 20000, rise: 7, architecture: 'tiles', exits: 'Medborgarplatsen · Götgatan', halls: [{ end: 'outbound', corridor: 15, exits: 'Folkungagatan' }, { end: 'inbound', from: 10, exits: 'Götgatan' }], look: { ceiling: 'vault', floor: 0xd9d9d4, columns: 'none' }, theme: medborgarplatsen },
    // Skanstull (1933): framed cream-yellow tiles, a flat beamed ceiling on round white columns flared at the top.
    { name: 'Skanstull', map: [0.553, 0.625], sl: 9190, riders: 15000, rise: 7, architecture: 'tiles', exits: 'Götgatan · Ringvägen', halls: [{ end: 'outbound', exits: 'Ringvägen' }, { end: 'inbound', corridor: 10, exits: 'Götgatan' }], look: { ceiling: 'flat', floor: 0x9a9a96, columns: 'none' }, theme: skanstull },
    { name: 'Gullmarsplan', map: [0.57, 0.67], sl: 9189, riders: 18000, gap: 800, architecture: 'tiles', exits: 'Gullmarsplan · Johanneshov', halls: [{ end: 'outbound' }], open: true, transfer: text.announcements.tvarbanaTransfer, theme: box(0xe6e2d8, 0x7a5a3a, 147) },
    // Route 19 toward Hagsätra.
    { name: 'Globen', map: [0.56, 0.71], sl: 9168, riders: 5000, gap: JUNCTION_RUN, architecture: 'tiles', exits: 'Globen · Arenavägen', halls: [{ end: 'inbound' }, { end: 'outbound' }], branch: '19', open: true, transfer: text.announcements.tvarbanaTransfer, theme: box(0xe4e6ea, 0x3a4a6a, 146) },
    { name: 'Enskede gård', map: [0.55, 0.74], sl: 9167, riders: 2000, architecture: 'tiles', exits: 'Enskede gård', halls: [{ end: 'inbound' }], branch: '19', open: true, theme: box(0xe0e4e0, 0x5a6a5a, 145) },
    { name: 'Sockenplan', map: [0.54, 0.77], sl: 9166, riders: 3000, architecture: 'tiles', exits: 'Sockenplan', halls: [{ end: 'inbound' }], branch: '19', open: true, theme: box(0xe8e0d4, 0x8a6a5a, 144) },
    { name: 'Svedmyra', map: [0.53, 0.8], sl: 9165, riders: 3000, architecture: 'tiles', exits: 'Svedmyra', halls: [{ end: 'outbound', from: 20, down: true }], branch: '19', open: true, theme: box(0xe2e6e0, 0x5a7a5a, 143) },
    { name: 'Stureby', map: [0.52, 0.83], sl: 9164, riders: 3000, architecture: 'tiles', exits: 'Stureby', halls: [{ end: 'outbound', from: 60, down: true }], branch: '19', open: true, theme: box(0xe6e4dc, 0x7a7a5a, 142) },
    { name: 'Bandhagen', map: [0.51, 0.86], sl: 9163, riders: 5000, architecture: 'tiles', exits: 'Bandhagens centrum', halls: [{ end: 'outbound', from: 60, down: true }], branch: '19', open: true, theme: box(0xdfe2e6, 0x5a6a7a, 141) },
    { name: 'Högdalen', map: [0.5, 0.89], sl: 9162, riders: 7000, architecture: 'tiles', exits: 'Högdalens centrum', halls: [{ end: 'outbound' }], branch: '19', open: true, theme: box(0xe8e2d6, 0x9a5a4a, 140) },
    { name: 'Rågsved', map: [0.49, 0.92], sl: 9161, riders: 5000, architecture: 'tiles', exits: 'Rågsveds centrum', halls: [{ end: 'outbound', from: 20, down: true }], branch: '19', open: true, theme: box(0xe0e4dc, 0x6a7a5a, 139) },
    { name: 'Hagsätra', map: [0.48, 0.95], sl: 9160, riders: 6000, architecture: 'tiles', exits: 'Hagsätra centrum', halls: [{ end: 'inbound', from: 60, down: true }], branch: '19', open: true, theme: box(0xe4e0d4, 0x8a6a4a, 138) },
    // Routes 17 and 18 together, then 17 toward Skarpnäck.
    { name: 'Skärmarbrink', map: [0.6, 0.695], sl: 9188, riders: 3500, gap: JUNCTION_RUN, architecture: 'tiles', exits: 'Skärmarbrink', halls: [{ end: 'outbound' }], branch: ['17', '18'], open: true, theme: box(0xe6e6e0, 0x6a6a6a, 137) },
    { name: 'Hammarbyhöjden', map: [0.63, 0.684], sl: 9144, riders: 5000, gap: JUNCTION_RUN, architecture: 'tiles', exits: 'Hammarbyhöjden', halls: [{ end: 'inbound' }, { end: 'outbound', from: 60, down: true }], branch: '17', open: true, theme: box(0xe8e2d4, 0x9a7a5a, 128) },
    { name: 'Björkhagen', map: [0.66, 0.684], sl: 9143, riders: 4000, architecture: 'tiles', exits: 'Björkhagen', halls: [{ end: 'outbound', from: 20, down: true }], branch: '17', open: true, theme: box(0xe0e6dc, 0x6a8a5a, 127) },
    { name: 'Kärrtorp', map: [0.69, 0.688], sl: 9142, riders: 4000, open: true, architecture: 'rock', exits: 'Kärrtorps centrum', halls: [{ end: 'outbound', from: 60, down: true }], branch: '17', theme: rock(0x46483e, warmLamp, 0x606a48, 0x9aa478, 126) },
    // Bagarmossen (1994): a grey rock cave over black lower walls, along them a glowing band of glass in blue, violet and green.
    { name: 'Bagarmossen', map: [0.72, 0.695], sl: 9141, riders: 6000, rise: 11, architecture: 'rock', exits: 'Bagarmossens centrum', halls: [{ end: 'inbound', incline: true }], branch: '17', look: { floor: 0x9a9a98, columns: 'none' }, theme: greyCave },
    // Skarpnäck (1994): one wide rock vault painted red, walls and all, over red clinker, with Richard Nonas' granite benches.
    { name: 'Skarpnäck', map: [0.75, 0.705], sl: 9140, riders: 6000, rise: 17, architecture: 'rock', exits: 'Skarpnäcks centrum', halls: [{ end: 'inbound', incline: true }], branch: '17', look: { floor: 0xb0553a, columns: 'none' }, theme: redCave },
    // Route 18 toward Farsta strand.
    { name: 'Blåsut', map: [0.61, 0.73], sl: 9187, riders: 3500, gap: JUNCTION_RUN, architecture: 'tiles', exits: 'Blåsut', halls: [{ end: 'outbound', from: 60, down: true }], branch: '18', open: true, theme: box(0xdce4ec, 0x3a5a8a, 136) },
    { name: 'Sandsborg', map: [0.62, 0.76], sl: 9186, riders: 3000, architecture: 'tiles', exits: 'Sandsborg', halls: [{ end: 'outbound', from: 60, down: true }], branch: '18', open: true, theme: box(0xe8e0d0, 0x9a6a4a, 135) },
    { name: 'Skogskyrkogården', map: [0.63, 0.79], sl: 9185, riders: 2500, architecture: 'tiles', exits: 'Skogskyrkogården', halls: [{ end: 'inbound', from: 60, down: true }], branch: '18', open: true, theme: box(0xe4e4e0, 0x4a5a4a, 134) },
    { name: 'Tallkrogen', map: [0.64, 0.82], sl: 9184, riders: 3000, architecture: 'tiles', exits: 'Tallkrogen', halls: [{ end: 'outbound', from: 60, down: true }], branch: '18', open: true, theme: box(0xdfe2dc, 0x5a6a4a, 133) },
    { name: 'Gubbängen', map: [0.65, 0.85], sl: 9183, riders: 5000, architecture: 'tiles', exits: 'Gubbängens centrum', halls: [{ end: 'outbound', from: 60, down: true }, { end: 'inbound' }], branch: '18', open: true, theme: box(0xe8e4d8, 0x7a6a4a, 132) },
    { name: 'Hökarängen', map: [0.66, 0.88], sl: 9182, riders: 5000, architecture: 'tiles', exits: 'Hökarängens centrum', halls: [{ end: 'outbound', from: 60, down: true }, { end: 'inbound', from: 60, down: true }], branch: '18', open: true, theme: box(0xe0e6e0, 0x5a7a6a, 131) },
    { name: 'Farsta', map: [0.67, 0.91], sl: 9181, riders: 12000, architecture: 'tiles', exits: 'Farsta centrum', halls: [{ end: 'outbound', from: 20, down: true }], branch: '18', open: true, theme: box(0xe6e0d0, 0x8a5a3a, 130) },
    { name: 'Farsta strand', map: [0.68, 0.94], sl: 9180, riders: 5000, architecture: 'tiles', exits: 'Farsta strand', branch: '18', open: true, transfer: text.announcements.pendeltagTransfer, theme: box(0xdfe4e8, 0x4a6a8a, 129) },
  ],
};
