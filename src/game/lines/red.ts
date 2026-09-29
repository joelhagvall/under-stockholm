import text from '../i18n/sv.json';
import { mix, rgb } from '../gfx/color';
import { fbm3 } from '../gfx/noise';
import { JUNCTION_RUN } from '../layout';
import type { LineDef } from '../line';
import { coolLamp, drawings, grain, pattern, rock, tiles, warmLamp, type Theme } from './theme';

/*
 * The red line: routes 13 (Ropsten to Norsborg) and 14 (Mörby centrum to
 * Fruängen) share the trunk from Östermalmstorg through the city to
 * Liljeholmen and branch at both ends. Boardings are estimates in the spirit
 * of SL's figures, not SL's own. Most art is freely interpreted; the stations
 * named with their artists follow the real work.
 */

// Stadion (Åke Pallarp and Enno Hallek): a sky-blue grotto with a rainbow arching over the platform.
const rainbow: Theme = pattern(0x46566a, coolLamp, (p) => {
  const g = grain(p, 71, 0.3);
  const r = Math.hypot(p.x % 60 - 30 + (p.x < 0 ? 60 : 0), p.y + 4);
  const band = (r - 9) / 0.55;
  if (band > 0 && band < 7 && p.y > 2.2) return [rgb(0xd8342b), rgb(0xf08a24), rgb(0xf2d13b), rgb(0x3e9e4a), rgb(0x2f6fd0), rgb(0x3a3a9c), rgb(0x7a3d9c)][Math.floor(band)];
  return mix(rgb(0x3f7fc2), rgb(0x8cc0ea), g);
});


// Tekniska högskolan (Lennart Mörk): pale rock marbled in blue, like a sky of science.
const science: Theme = pattern(0x4a5060, coolLamp, (p) => {
  const g = grain(p, 74, 0.25);
  const vein = Math.abs(fbm3(p.x * 0.12, p.y * 0.2, p.z * 0.12, 3, 75) - 0.5) < 0.09;
  return vein && p.y > 2 ? mix(rgb(0x1f4a9a), rgb(0x3a6ab8), g) : mix(rgb(0xc8d0d8), rgb(0xeef0f2), g);
});

// Mörby centrum: pale rock, and low down vertical stripes in every colour.
const stripes: Theme = pattern(0x5a5650, warmLamp, (p, n) => {
  const g = grain(p, 89);
  const u = Math.abs(n.x) > 0.7 ? p.z : p.x;
  if (p.y > 0.8 && p.y < 3.2) return [rgb(0xd8342b), rgb(0xf08a24), rgb(0xf2d13b), rgb(0x3e9e4a), rgb(0x2f6fd0), rgb(0x7a3d9c), rgb(0xe8a0b8)][((Math.floor(u / 0.5) % 7) + 7) % 7];
  return mix(rgb(0xd8d0c8), rgb(0xf2ece4), g);
});

// Universitetet: white rock over a plinth of blue tiles.
const bluePlinth: Theme = pattern(0x4e5258, coolLamp, (p) => (p.y < 3.4 ? mix(rgb(0x2a58a0), rgb(0x3a6ab8), grain(p, 78)) : mix(rgb(0xc8c8c4), rgb(0xecece8), grain(p, 79))));






// Telefonplan: cables in bright colours run along the rock, as from the old telephone works.
const cables = pattern(0x3b3e44, coolLamp, (p) => {
  const g = grain(p, 84);
  const k = Math.floor((p.y + Math.sin(p.x * 0.3) * 0.2) / 0.25);
  if (p.y > 2.2 && p.y < 3.5 && Math.abs(((p.y + Math.sin(p.x * 0.3) * 0.2) / 0.25) % 1 - 0.5) < 0.18) return [rgb(0xd8342b), rgb(0x2f6fd0), rgb(0xf2d13b), rgb(0x3e9e4a), rgb(0xeeeeee)][((k % 5) + 5) % 5];
  return mix(rgb(0x2c3036), rgb(0x4d535c), g);
});

// Alby: rock painted dark green and covered in flowers, red, blue, purple and yellow.
const jungle = pattern(0x34402f, warmLamp, (p) => {
  const g = grain(p, 85);
  const f = fbm3(p.x * 1.1, p.y * 1.1, p.z * 1.1, 2, 86);
  if (f > 0.68 && p.y > 1.2) return [rgb(0xd6402f), rgb(0x3b6fd1), rgb(0x8a4ab8), rgb(0xf2c53b)][Math.floor(fbm3(p.x * 0.3, p.y * 0.3, p.z * 0.3, 1, 87) * 8) % 4];
  return mix(rgb(0x163d20), rgb(0x2f6a30), g);
});


export const RED_LINE: LineDef = {
  id: 'red',
  bullets: ['13', '14'],
  name: 'Röda linjen',
  color: '#d7263d',
  trains: 6,
  routes: [
    { number: '13', outbound: 'Norsborg', inbound: 'Ropsten' },
    { number: '14', outbound: 'Fruängen', inbound: 'Mörby centrum', shifted: true },
  ],
  stations: [
    // Route 13 toward Ropsten.
    { name: 'Ropsten', map: [0.7, 0.3], sl: 9220, riders: 12000, architecture: 'rock', exits: 'Ropsten · Lidingöbron', halls: [{ end: 'outbound', from: 60, down: true }, { end: 'inbound', from: 60, down: true }], branch: '13', open: true, transfer: text.announcements.ropstenTransfer, theme: rock(0x44474a, coolLamp, 0x585d62, 0x9aa1a6, 88) },
    // Gärdet: a white concrete vault, walls of brown and grey stone, a terracotta floor and bright paintings.
    { name: 'Gärdet', map: [0.665, 0.34], sl: 9221, riders: 6000, rise: 18, architecture: 'tiles', exits: 'Värtavägen · Gärdet', halls: [{ end: 'inbound', corridor: 60, incline: true, exits: 'Tegeluddsvägen' }, { end: 'outbound', incline: true, exits: 'Brantingsgatan · Askrikegatan' }], branch: '13', look: { ceiling: 'vault', floor: 0x9a5a42, columns: 'none' },
      theme: tiles(0x4c4640, warmLamp, { tile: 0x8a7a68, low: 0x6a5e52, dado: 1.2, size: 0.6, seed: 77, ceiling: 0xe6e3dc, frieze: { colors: [0xd8342b, 0x2f6fd0, 0xf2c53b, 0x3e9e4a, 0x8a7a68, 0x8a7a68], from: 1.4, to: 2.8 } }) },
    // Karlaplan: a white vault over walls of pale green glazed tiles, with a band of black and white photographs.
    { name: 'Karlaplan', map: [0.615, 0.38], sl: 9222, riders: 9000, rise: 15, architecture: 'tiles', exits: 'Karlaplan · Valhallavägen', halls: [{ end: 'inbound', incline: true, exits: 'Valhallavägen' }, { end: 'outbound', incline: true, exits: 'Karlaplan' }], branch: '13', look: { ceiling: 'vault', floor: 0x9a9a98, columns: 'none' },
      theme: tiles(0x4e524c, coolLamp, { tile: 0xb9d2b2, low: 0x7fa878, dado: 0.8, seed: 76, ceiling: 0xecece6, frieze: { colors: [0x1e1e1e, 0x6a6a6a, 0xb8b8b8, 0xe8e8e8], from: 2.3, to: 3.3 } }) },
    // Route 14 toward Mörby centrum.
    // Mörby centrum: a pale rock cave, its walls striped low down in every colour.
    { name: 'Mörby centrum', map: [0.585, 0.07], sl: 9200, riders: 8000, rise: 13, architecture: 'rock', exits: 'Mörby centrum', halls: [{ end: 'outbound', incline: true }], branch: '14', look: { floor: 0x5a5c60 }, theme: stripes },
    // Danderyds sjukhus (1978): a clean box, a flat lit ceiling, white tiles over a black base and a speckled white floor.
    { name: 'Danderyds sjukhus', map: [0.582, 0.125], sl: 9201, riders: 9000, rise: 7, architecture: 'tiles', exits: 'Danderyds sjukhus', halls: [{ end: 'inbound', exits: 'Entrévägen' }, { end: 'outbound', corridor: 40, exits: 'Mörbygårdsvägen' }], branch: '14', look: { ceiling: 'flat', floor: 0xeceae4, columns: 'none' },
      theme: tiles(0x5a5e62, coolLamp, { tile: 0xe8ecee, low: 0x2a2c30, dado: 0.9, seed: 81, ceiling: 0xd8dadc }) },
    // Bergshamra: a grey rock cave with a dark stone floor.
    { name: 'Bergshamra', map: [0.577, 0.18], sl: 9202, riders: 4000, rise: 12, architecture: 'rock', exits: 'Bergshamra centrum', halls: [{ end: 'inbound', exits: 'Björnstigen' }, { end: 'outbound', corridor: 30 }], branch: '14', look: { floor: 0x55585a }, theme: rock(0x3e4240, coolLamp, 0x5a5c5a, 0x9a9c98, 90) },
    // Universitetet: white rock over walls tiled blue, and a dark polished floor.
    { name: 'Universitetet', map: [0.568, 0.24], sl: 9203, riders: 12000, rise: 17, architecture: 'rock', exits: 'Stockholms universitet', halls: [{ end: 'outbound', incline: true }], branch: '14', transfer: text.announcements.roslagsbanaTransfer, look: { floor: 0x3a3c40 }, theme: bluePlinth },
    { name: 'Tekniska högskolan', map: [0.558, 0.31], sl: 9204, riders: 12000, rise: 10, architecture: 'rock', exits: 'Valhallavägen · KTH', halls: [{ end: 'outbound', incline: true, exits: 'Danderydsgatan' }, { end: 'inbound', incline: true, exits: 'Valhallavägen' }], branch: '14', transfer: text.announcements.roslagsbanaTransfer, look: { floor: 0x8a8c8e }, theme: science },
    { name: 'Stadion', map: [0.553, 0.36], sl: 9205, riders: 6000, rise: 22, architecture: 'rock', exits: 'Valhallavägen · Stadion', halls: [{ end: 'inbound', corridor: 40, incline: true, exits: 'Stadion · Idrottshögskolan' }, { end: 'outbound', incline: true, exits: 'Karlavägen · Nybrogatan' }], branch: '14', theme: rainbow },
    // The trunk through the city.
    { name: 'Östermalmstorg', map: [0.548, 0.405], sl: 9206, riders: 25000, rise: 30, architecture: 'tiles', exits: 'Stureplan · Östermalmstorg', halls: [{ end: 'outbound', corridor: 60, incline: true, exits: 'Norrmalmstorg · Stureplan' }, { end: 'inbound', incline: true, exits: 'Sibyllegatan' }], gap: JUNCTION_RUN, look: { ceiling: 'vault', floor: 0xbcb8b0, columns: 'none' }, theme: drawings(0x56554f, warmLamp, 72) },
    // T-Centralen's red and green platforms (1957): low cream vaults, white tiles and a long ceramic frieze along the tracks.
    { name: 'T-Centralen', map: [0.497, 0.453], sl: 9001, riders: 45000, rise: 7, architecture: 'tiles', exits: 'Vasagatan · Centralstation', halls: [{ end: 'inbound', incline: true, exits: 'Sergels torg' }, { end: 'inbound', from: -55, exits: 'Vasagatan · Centralstationen' }], transfer: text.announcements.tCentralenTransfer,
      look: { ceiling: 'vault', floor: 0xe2dccf, columns: 'square', columnColor: 0x2e3136 },
      theme: tiles(0x5a5a58, warmLamp, { tile: 0xeef0ec, seed: 91, ceiling: 0xece2cc, frieze: { colors: [0x2f5f8f, 0x4f8f6f, 0x8a5a3a, 0xc9a45a, 0x3a7fa8, 0xe8e2d0], from: 1.5, to: 2.7 } }) },
    // Gamla stan, under Centralbron: a concrete roof on steel columns, medieval weave on the walls over blue tiles, and mosaic floors (Göran Dahl).
    { name: 'Gamla stan', map: [0.503, 0.51], sl: 9193, riders: 12000, architecture: 'tiles', exits: 'Gamla stan · Riddarholmen', open: true, city: true, openReach: 420, transfer: text.announcements.otherMetro,
      look: { ceiling: 'flat', floor: 0xb8c2cc, columns: 'round', columnColor: 0x8a9098 },
      theme: tiles(0x55504a, warmLamp, { tile: 0x4f9fc4, seed: 92, size: 0.2, ceiling: 0x8f8d88, frieze: { colors: [0xa0523c, 0xd8c3a0, 0xb8704f, 0xe6d6b8, 0x8a4a34], from: 2.0, to: 4.6 } }) },
    // Slussen, covered under the old deck: a low flat ceiling, golden terrazzo, pale blue-grey tiles over a dark blue base. The bridge to Gamla stan runs in from the open air.
    { name: 'Slussen', map: [0.512, 0.56], sl: 9192, riders: 25000, rise: 7, architecture: 'tiles', exits: 'Götgatan · Södermalmstorg', halls: [{ end: 'outbound', exits: 'Götgatan' }, { end: 'outbound', from: -60, exits: 'Ryssgården' }], transfer: text.announcements.slussenTransfer,
      look: { ceiling: 'flat', floor: 0xe9cf86, columns: 'square', columnColor: 0x2a4a8a },
      theme: tiles(0x50555a, coolLamp, { tile: 0xb9c6ce, low: 0x223f78, dado: 1.3, seed: 93, size: 0.15, ceiling: 0xe8e2d2 }) },
    // Mariatorget: a white vault and walls of golden vertical slats.
    { name: 'Mariatorget', map: [0.475, 0.58], sl: 9297, riders: 12000, rise: 12, architecture: 'tiles', exits: 'Hornsgatan · Swedenborgsgatan', halls: [{ end: 'inbound', incline: true, exits: 'Wollmar Yxkullsgatan' }, { end: 'outbound', corridor: 30, incline: true, exits: 'Torkel Knutssonsgatan' }], look: { ceiling: 'vault', floor: 0xc8c8c4, columns: 'none' },
      theme: tiles(0x56524a, warmLamp, { tile: 0xc8a050, size: 0.12, seed: 94, ceiling: 0xeceae4, frieze: { colors: [0xc8a050, 0xa87a30, 0xe0b868, 0xb88a40], from: 0.3, to: 3.7 } }) },
    // Zinkensdamm: a vault over grey-brown tiles, a brick-red floor and bright paintings.
    { name: 'Zinkensdamm', map: [0.44, 0.59], sl: 9296, riders: 8000, rise: 11, architecture: 'tiles', exits: 'Ringvägen · Hornsgatan', halls: [{ end: 'inbound', from: -10, incline: true, exits: 'Ringvägen' }], look: { ceiling: 'vault', floor: 0xa0553a, columns: 'none' },
      theme: tiles(0x4e4a46, warmLamp, { tile: 0x8a8078, size: 0.25, seed: 95, ceiling: 0xdcd8d0, frieze: { colors: [0xd8342b, 0xf2c53b, 0x2f6fd0, 0xe8a0b8, 0x8a8078, 0x8a8078, 0x8a8078], from: 1.5, to: 3.0 } }) },
    // Hornstull: a white vault over a dark blue, speckled wall.
    { name: 'Hornstull', map: [0.405, 0.6], sl: 9295, riders: 12000, rise: 7, architecture: 'tiles', exits: 'Långholmsgatan · Hornstull', halls: [{ end: 'outbound', corridor: 60, incline: true, exits: 'Långholmsgatan' }, { end: 'inbound', exits: 'Hornsbruksgatan' }], look: { ceiling: 'vault', floor: 0xd8d6d0, columns: 'none' },
      theme: tiles(0x44465a, coolLamp, { tile: 0x3a3a6a, size: 0.5, seed: 96, ceiling: 0xe4e2dc, frieze: { colors: [0x3a3a6a, 0x4a4a7a, 0x2a2a5a, 0x6a6a9a], from: 0, to: 3.8 } }) },
    // Liljeholmen: covered, under a building deck: a dark flat ceiling on red beams, grey walls.
    { name: 'Liljeholmen', map: [0.375, 0.635], sl: 9294, riders: 18000, rise: 7, architecture: 'tiles', exits: 'Liljeholmstorget', halls: [{ end: 'outbound' }, { end: 'inbound', exits: 'Liljeholmsvägen' }], gap: 800, transfer: text.announcements.tvarbanaTransfer, look: { ceiling: 'flat', floor: 0xb8bcb8, columns: 'square', columnColor: 0xa0302a },
      theme: tiles(0x44464a, coolLamp, { tile: 0x9a9ea2, size: 0.6, seed: 97, ceiling: 0x3a3c40 }) },
    // Route 13 toward Norsborg.
    // Aspudden: a white vault over walls striped in dark teal tiles.
    { name: 'Aspudden', map: [0.345, 0.665], sl: 9293, riders: 5000, rise: 11, architecture: 'tiles', exits: 'Aspudden', halls: [{ end: 'outbound', exits: 'Schlytersvägen' }], branch: '13', gap: JUNCTION_RUN, look: { ceiling: 'vault', floor: 0xc8c6c0, columns: 'none' },
      theme: tiles(0x44504e, coolLamp, { tile: 0x2f6f78, size: 0.2, seed: 98, ceiling: 0xeceae4, frieze: { colors: [0x2f6f78, 0x3f8a8f, 0x1f5a64, 0x5aa0a0], from: 0, to: 3.8 } }) },
    { name: 'Örnsberg', map: [0.315, 0.685], sl: 9292, riders: 3000, architecture: 'rock', exits: 'Örnsberg', halls: [{ end: 'inbound' }], branch: '13', open: true, theme: rock(0x484848, coolLamp, 0x606468, 0xa0a4a8, 99) },
    { name: 'Axelsberg', map: [0.285, 0.705], sl: 9291, riders: 3000, architecture: 'rock', exits: 'Axelsberg', halls: [{ end: 'inbound' }], branch: '13', open: true, theme: rock(0x4a4640, warmLamp, 0x7a6048, 0xb09878, 100) },
    { name: 'Mälarhöjden', map: [0.255, 0.725], sl: 9290, riders: 3000, architecture: 'rock', exits: 'Mälarhöjden', halls: [{ end: 'inbound' }], branch: '13', open: true, theme: rock(0x42484c, coolLamp, 0x4a6a80, 0x9ab8c8, 101) },
    { name: 'Bredäng', map: [0.225, 0.745], sl: 9289, riders: 7000, architecture: 'rock', exits: 'Bredängs centrum', halls: [{ end: 'inbound', from: 60, down: true }], branch: '13', open: true, theme: rock(0x484640, warmLamp, 0x6a6a5a, 0xaaa890, 102) },
    { name: 'Sätra', map: [0.195, 0.765], sl: 9288, riders: 4500, architecture: 'rock', exits: 'Sätra centrum', halls: [{ end: 'outbound' }], branch: '13', open: true, theme: rock(0x46443f, warmLamp, 0x746650, 0xb2a288, 103) },
    // Skärholmen, under the centre: a flat ceiling, white tiles with a dark band, a brick-red floor and brick columns.
    { name: 'Skärholmen', map: [0.17, 0.795], sl: 9287, riders: 12000, rise: 7, architecture: 'tiles', exits: 'Skärholmens centrum', halls: [{ end: 'inbound', incline: true, exits: 'Bussterminalen' }, { end: 'outbound', from: -5, exits: 'Skärholmens centrum' }], branch: '13', look: { ceiling: 'flat', floor: 0xa0553a, columns: 'square', columnColor: 0x8a4a38 },
      theme: tiles(0x50504c, warmLamp, { tile: 0xeeeeea, accent: 0x2a2c30, band: [2.0, 2.25], seed: 104, ceiling: 0xe0dcd4 }) },
    { name: 'Vårberg', map: [0.15, 0.825], sl: 9286, riders: 4500, architecture: 'rock', exits: 'Vårbergs centrum', halls: [{ end: 'outbound' }], branch: '13', open: true, theme: rock(0x46483e, warmLamp, 0x5a7044, 0x9ab078, 105) },
    { name: 'Vårby gård', map: [0.13, 0.855], sl: 9285, riders: 3500, architecture: 'rock', exits: 'Vårby gård', halls: [{ end: 'outbound', from: 60, down: true }], branch: '13', open: true, theme: rock(0x44484a, coolLamp, 0x586878, 0x98a8b8, 106) },
    // Masmo: a long dark hall under a slatted ceiling.
    { name: 'Masmo', map: [0.11, 0.88], sl: 9284, riders: 3000, rise: 24, architecture: 'tiles', exits: 'Masmo', halls: [{ end: 'outbound', from: -10 }], branch: '13', look: { ceiling: 'flat', floor: 0xa8aaa8, columns: 'none' },
      theme: tiles(0x3a3c40, coolLamp, { tile: 0x3c3e42, size: 0.6, seed: 105, ceiling: 0x8a8c8e }) },
    { name: 'Fittja', map: [0.09, 0.9], sl: 9283, riders: 6000, architecture: 'rock', exits: 'Fittja centrum', halls: [{ end: 'inbound' }], branch: '13', open: true, theme: rock(0x484642, warmLamp, 0x6a5a4a, 0xa89880, 107) },
    { name: 'Alby', map: [0.07, 0.92], sl: 9282, riders: 6000, rise: 16, architecture: 'rock', exits: 'Alby centrum', halls: [{ end: 'inbound', corridor: 15, exits: 'Tingstorget' }], branch: '13', theme: jungle },
    { name: 'Hallunda', map: [0.05, 0.94], sl: 9281, riders: 5000, architecture: 'rock', exits: 'Hallunda centrum', halls: [{ end: 'inbound' }], branch: '13', open: true, theme: rock(0x4a443c, warmLamp, 0x8a5a38, 0xc88a58, 108) },
    { name: 'Norsborg', map: [0.03, 0.96], sl: 9280, riders: 4500, architecture: 'rock', exits: 'Norsborg', halls: [{ end: 'inbound' }], branch: '13', open: true, theme: rock(0x46464a, coolLamp, 0x5a5e66, 0x9aa0a8, 109) },
    // Route 14 toward Fruängen.
    // Midsommarkransen: beige tiles under a low vault; a midsummer wreath hangs in the hall.
    { name: 'Midsommarkransen', map: [0.37, 0.69], sl: 9264, riders: 6000, rise: 12, architecture: 'tiles', exits: 'Tellusborgsvägen · Midsommarkransen', halls: [{ end: 'inbound', from: -5, exits: 'Tegelbruksvägen' }], branch: '14', gap: JUNCTION_RUN, look: { ceiling: 'vault', floor: 0xc8c4bc, columns: 'none' },
      theme: tiles(0x524c42, warmLamp, { tile: 0xd6caa8, seed: 82, ceiling: 0xeae6dc, frieze: { colors: [0xe0402c, 0xf2c53b, 0x3e9e4a, 0x2f6fd0, 0xd6caa8, 0xd6caa8], from: 1.6, to: 3.2 } }) },
    { name: 'Telefonplan', map: [0.362, 0.73], sl: 9263, riders: 7000, architecture: 'rock', exits: 'Telefonplan · Konstfack', halls: [{ end: 'outbound' }], branch: '14', open: true, theme: cables },
    { name: 'Hägerstensåsen', map: [0.354, 0.77], sl: 9262, riders: 4500, architecture: 'rock', exits: 'Hägerstensåsen', halls: [{ end: 'inbound' }, { end: 'outbound' }], branch: '14', open: true, theme: rock(0x44463e, warmLamp, 0x606a48, 0xa0a878, 110) },
    { name: 'Västertorp', map: [0.346, 0.81], sl: 9261, riders: 4500, architecture: 'rock', exits: 'Västertorps centrum', halls: [{ end: 'outbound' }, { end: 'inbound' }], branch: '14', open: true, theme: rock(0x4a4640, warmLamp, 0x7a6450, 0xb49c80, 111) },
    { name: 'Fruängen', map: [0.338, 0.85], sl: 9260, riders: 7500, architecture: 'rock', exits: 'Fruängens centrum', halls: [{ end: 'outbound', from: 60, down: true }], branch: '14', open: true, theme: rock(0x444448, coolLamp, 0x585c66, 0x98a0aa, 112) },
  ],
};
