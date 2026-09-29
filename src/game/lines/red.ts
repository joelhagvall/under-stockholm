import text from '../i18n/sv.json';
import { mix, rgb, type RGB } from '../gfx/color';
import {
  albyArt, aspuddenArt, bergshamraArt, danderydArt, gardetArt, hornstullArt, karlaplanArt, liljeholmenArt, malarhojdenArt, mariatorgetArt, masmoArt, midsommarkransenArt, ostermalmstorgArt,
  skarholmenArt, slussenArt, stadionArt, tCentralenArt, tekniskaArt, universitetetArt, zinkensdammArt,
} from '../gfx/art/red';
import { JUNCTION_RUN } from '../layout';
import type { LineDef } from '../line';
import { coolLamp, grain, pattern, rock, tiles, warmLamp, type Theme } from './theme';

/*
 * The red line: routes 13 (Ropsten to Norsborg) and 14 (Mörby centrum to
 * Fruängen) share the trunk from Östermalmstorg through the city to
 * Liljeholmen and branch at both ends. Boardings are estimates in the spirit
 * of SL's figures, not SL's own. The underground stations follow the real
 * ones: their walls, colours and signature art (see `gfx/art/red.ts`, and the
 * objects on their platforms in `world/details/red.ts`).
 */

// Mörby centrum (Karin Ek and Gösta Wessel): white rock whose bumps are painted as their own shadows, pink seen
// from one end of the platform and grey-green from the other.
const shadows: Theme = pattern(0x5e5a5a, coolLamp, (p, n) => {
  const white = mix(rgb(0xe8e4dc), rgb(0xf6f3ec), grain(p, 89));
  return n.x > 0 ? mix(white, rgb(0xe0a0b0), n.x * 1.6 - 0.15) : mix(white, rgb(0x8fa392), -n.x * 1.6 - 0.15);
});

/** A theme whose walls carry an artwork, and `paint` where the art does not reach: end walls, piers, columns. */
const painted = (ambient: number, lamp: RGB, paint: Theme['paint'], art: NonNullable<Theme['art']>): Theme => ({ ...pattern(ambient, lamp, paint), art });
/** A plain colour for the end walls of a station whose walls are all artwork. */
const flat = (hex: number) => () => rgb(hex);

// Universitetet (Françoise Schein): the Declaration of Human Rights letter by letter on white tiles, Linnaeus's journeys on sea green.
const rights = painted(0x4e5258, coolLamp, (p) => mix(rgb(0x98938a), rgb(0xb8b3a8), grain(p, 79)), universitetetArt);
// Bergshamra: dark rock, the Rök runestone and the oldest rune row.
const runes = painted(0x444442, coolLamp, (p) => mix(rgb(0x4a4a46), rgb(0x6a6a64), grain(p, 90)), bergshamraArt);
// Danderyds sjukhus: white enamel with black diagonals and green figures, under dark slats.
const hospital = painted(0x5a5e62, coolLamp, flat(0xdcdad4), danderydArt);
// Karlaplan (Larseric Vänerlöf): white enamel, and a long band of black and white photomontage.
const montage = painted(0x56585a, coolLamp, flat(0xe6e4de), karlaplanArt);
// Mälarhöjden (Margareta Carlstedt): "Ebb och flod", enamel washed in blues and ochre, under a white vault.
const tide = painted(0x50545a, coolLamp, flat(0xe8e6e0), malarhojdenArt);
// Midsommarkransen: shiny beige stick tiles under a brown frieze.
const wreath = painted(0x565246, coolLamp, flat(0xcfc9a8), midsommarkransenArt);
// Masmo: charcoal rock, blue-grey mesh, a dark mesh ceiling and the sun brought down into the metro.
const sunDown = painted(0x3a3c40, coolLamp, flat(0x3a3a3c), masmoArt);
// Aspudden: teal checker tiles on one side, white tiles with enamel leaves on the other.
const leaves = painted(0x4e5452, coolLamp, flat(0xe6e6e2), aspuddenArt);
// Skärholmen (Ulf Wahlberg): white tiles with black bands, and the desert from sunrise to sunset.
const desert = painted(0x52524e, coolLamp, flat(0xeeeeec), skarholmenArt);
// Stadion (Enno Hallek and Åke Pallarp): the whole grotto marbled sky blue; the rainbow is a detail (see `details/red.ts`).
const sky = painted(0x46566a, coolLamp, (p) => mix(rgb(0x4f86c4), rgb(0x9cc6ea), grain(p, 71, 0.3)), stadionArt);
// Tekniska högskolan (Lennart Mörk): pale rock under a blue sky, the elements and the laws of nature.
const science = painted(0x4e5258, coolLamp, (p) => (p.y > 6.5 ? mix(rgb(0x5a86c0), rgb(0xd8dce0), grain(p, 74, 0.25)) : mix(rgb(0xb8b5ac), rgb(0xd8d6ce), grain(p, 74))), tekniskaArt);
// Gärdet: brown stone slabs with lit showcases of beetles that do not exist (Karl Axel Pehrson).
const beetles = painted(0x4c4640, warmLamp, flat(0xd8d4ca), gardetArt);
// Östermalmstorg (Siri Derkert): grey concrete with line drawings cut into it.
const derkert = painted(0x56554f, warmLamp, flat(0xb2aea4), ostermalmstorgArt);
// T-Centralen (1957): Klaravagnen's railway figures on white tiles, and the wall of glass prisms.
const klara = painted(0x5a5a58, warmLamp, flat(0xece4cf), tCentralenArt);
// Slussen: cream tiles over a dark blue-grey base; the blue screens between the platforms are a detail.
const sluice = painted(0x50555a, warmLamp, flat(0xe6e0cf), slussenArt);
// Mariatorget (Karin Björquist): walls of golden-brown ceramic rods.
const rods = painted(0x5a5044, warmLamp, flat(0xa8783a), mariatorgetArt);
// Zinkensdamm: wine-red tiles on light grey.
const wine = painted(0x524a48, coolLamp, flat(0xc8c8c4), zinkensdammArt);
// Hornstull (Berndt Helleberg): red glazed brick, a black band and white animals as at Altamira.
const altamira = painted(0x54443e, warmLamp, flat(0x9a2f22), hornstullArt);
// Liljeholmen (Carl-Axel Lunding): concrete reliefs under a dark deck on maroon beams; the pillars glow (see `details/red.ts`).
const reliefs = painted(0x46484c, coolLamp, flat(0xa9a7a0), liljeholmenArt);
// Telefonplan (Bo Samuelsson): ochre-yellow clinker with fields of green spelling the name in Morse.
const morse = pattern(0x4a4640, warmLamp, (p) => {
  const g = grain(p, 84);
  const k = ((p.x % 9) + 9) % 9;
  if ((k > 1 && k < 1.6) || (k > 2.2 && k < 2.5) || (k > 5 && k < 6.2)) return mix(rgb(0x2e7a5a), rgb(0x3a8a66), g);
  return mix(rgb(0xc89a30), rgb(0xe0b448), g);
});
// Alby (Olle Ängkvist): rock painted moss green all over, and bright figures as in a painted cave.
const jungle = painted(0x34402f, warmLamp, (p) => mix(rgb(0x267a30), rgb(0x3a9a44), grain(p, 85)), albyArt);

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
    // Gärdet: a pale concrete vault, walls of brown and grey stone slabs with lit showcases of beetles, a terracotta floor.
    { name: 'Gärdet', map: [0.665, 0.34], sl: 9221, riders: 6000, rise: 18, architecture: 'tiles', exits: 'Värtavägen · Gärdet', halls: [{ end: 'inbound', corridor: 60, incline: true, exits: 'Tegeluddsvägen' }, { end: 'outbound', incline: true, exits: 'Brantingsgatan · Askrikegatan' }], branch: '13', look: { ceiling: 'vault', floor: 0x9a5a42, columns: 'none' },
      theme: beetles },
    // Karlaplan: a white vault over white enamel, a band of black and white photomontage along one wall, a dark floor.
    { name: 'Karlaplan', map: [0.615, 0.38], sl: 9222, riders: 9000, rise: 15, architecture: 'tiles', exits: 'Karlaplan · Valhallavägen', halls: [{ end: 'inbound', incline: true, exits: 'Valhallavägen' }, { end: 'outbound', incline: true, exits: 'Karlaplan' }], branch: '13', look: { ceiling: 'vault', floor: 0x55575a, columns: 'none' },
      theme: montage },
    // Route 14 toward Mörby centrum.
    // Mörby centrum: white rock painted as its own shadows, pink one way and grey-green the other, under a slatted ceiling.
    { name: 'Mörby centrum', map: [0.585, 0.07], sl: 9200, riders: 8000, rise: 13, architecture: 'rock', exits: 'Mörby centrum', halls: [{ end: 'outbound', incline: true }], branch: '14', look: { floor: 0x5a5c5e }, theme: shadows },
    // Danderyds sjukhus (1978): a clean box under dark slats, white enamel with black diagonals over a black base, round grey columns.
    { name: 'Danderyds sjukhus', map: [0.582, 0.125], sl: 9201, riders: 9000, rise: 7, architecture: 'tiles', exits: 'Danderyds sjukhus', halls: [{ end: 'inbound', exits: 'Entrévägen' }, { end: 'outbound', corridor: 40, exits: 'Mörbygårdsvägen' }], branch: '14', look: { ceiling: 'flat', floor: 0xd8d6d0, columns: 'round', columnColor: 0x9aa0a4 },
      theme: hospital },
    // Bergshamra: a dark rock cave under a slatted ceiling, the Rök runestone, a red bicycle and fossils in the floor.
    { name: 'Bergshamra', map: [0.577, 0.18], sl: 9202, riders: 4000, rise: 12, architecture: 'rock', exits: 'Bergshamra centrum', halls: [{ end: 'inbound', exits: 'Björnstigen' }, { end: 'outbound', corridor: 30 }], branch: '14', look: { floor: 0x3c3e40 }, theme: runes },
    // Universitetet: grey rock over white tiles lettered with human rights, Linnaeus's journeys on sea green, a dark floor.
    { name: 'Universitetet', map: [0.568, 0.24], sl: 9203, riders: 12000, rise: 17, architecture: 'rock', exits: 'Stockholms universitet', halls: [{ end: 'outbound', incline: true }], branch: '14', transfer: text.announcements.roslagsbanaTransfer, look: { floor: 0x4e5054 }, theme: rights },
    // Tekniska högskolan: pale rock under a blue sky, science on the walls and a glass dodecahedron in the vault.
    { name: 'Tekniska högskolan', map: [0.558, 0.31], sl: 9204, riders: 12000, rise: 10, architecture: 'rock', exits: 'Valhallavägen · KTH', halls: [{ end: 'outbound', incline: true, exits: 'Danderydsgatan' }, { end: 'inbound', incline: true, exits: 'Valhallavägen' }], branch: '14', transfer: text.announcements.roslagsbanaTransfer, look: { floor: 0x3a3c40 }, theme: science },
    // Stadion: the whole grotto marbled sky blue, and a rainbow over the opening in a rock wall down the island.
    { name: 'Stadion', map: [0.553, 0.36], sl: 9205, riders: 6000, rise: 22, architecture: 'rock', exits: 'Valhallavägen · Stadion', halls: [{ end: 'inbound', corridor: 40, incline: true, exits: 'Stadion · Idrottshögskolan' }, { end: 'outbound', incline: true, exits: 'Karlavägen · Nybrogatan' }], branch: '14', look: { floor: 0x3e4046 }, theme: sky },
    // The trunk through the city.
    // Östermalmstorg: grey concrete walls with Siri Derkert's drawings cut into them, peace signs in the floor.
    { name: 'Östermalmstorg', map: [0.548, 0.405], sl: 9206, riders: 25000, rise: 30, architecture: 'tiles', exits: 'Stureplan · Östermalmstorg', halls: [{ end: 'outbound', corridor: 60, incline: true, exits: 'Norrmalmstorg · Stureplan' }, { end: 'inbound', incline: true, exits: 'Sibyllegatan' }], gap: JUNCTION_RUN, look: { ceiling: 'vault', floor: 0x8a8884, columns: 'none' }, theme: derkert },
    // T-Centralen's red and green platforms (1957): low cream vaults, Klaravagnen and the glass prisms, patterned tile columns.
    { name: 'T-Centralen', stacked: true, map: [0.497, 0.453], sl: 9001, riders: 45000, rise: 7, architecture: 'tiles', exits: 'Vasagatan · Centralstation', halls: [{ end: 'inbound', incline: true, exits: 'Sergels torg' }, { end: 'inbound', from: -55, exits: 'Vasagatan · Centralstationen' }], transfer: text.announcements.tCentralenTransfer,
      look: { ceiling: 'vault', floor: 0xe2dccf, columns: 'none' },
      theme: klara },
    // Gamla stan, under Centralbron: a concrete roof on steel columns, cement mosaic after medieval weavings in brick red and
    // ochre (Göran Dahl), and a lace of welded steel between the tracks (Britta Carlström).
    { name: 'Gamla stan', map: [0.503, 0.51], sl: 9193, riders: 12000, architecture: 'tiles', exits: 'Gamla stan · Riddarholmen', open: true, city: true, openReach: 420, transfer: text.announcements.otherMetro,
      look: { ceiling: 'flat', floor: 0xb8c2cc, columns: 'round', columnColor: 0x8a9098 },
      theme: tiles(0x55504a, warmLamp, { tile: 0xe6dcc8, seed: 92, size: 0.2, ceiling: 0x8e8c86, frieze: { colors: [0x9c3b2a, 0xc8993f, 0x3e2c22, 0xe6dcc8, 0x9c3b2a], from: 1.2, to: 3.6 } }) },
    // Slussen, covered under the old deck: a low flat ceiling, golden terrazzo, pale blue-grey tiles over a dark blue base. The bridge to Gamla stan runs in from the open air.
    { name: 'Slussen', map: [0.512, 0.56], sl: 9192, riders: 25000, rise: 7, architecture: 'tiles', exits: 'Götgatan · Södermalmstorg', halls: [{ end: 'outbound', exits: 'Götgatan' }, { end: 'outbound', from: -60, exits: 'Ryssgården' }], transfer: text.announcements.slussenTransfer,
      look: { ceiling: 'flat', floor: 0xe9cf86, columns: 'square', columnColor: 0x3a3a3c },
      theme: sluice },
    // Mariatorget: a pale vault and walls of golden-brown ceramic rods.
    { name: 'Mariatorget', map: [0.475, 0.58], sl: 9297, riders: 12000, rise: 12, architecture: 'tiles', exits: 'Hornsgatan · Swedenborgsgatan', halls: [{ end: 'inbound', incline: true, exits: 'Wollmar Yxkullsgatan' }, { end: 'outbound', corridor: 30, incline: true, exits: 'Torkel Knutssonsgatan' }], look: { ceiling: 'vault', floor: 0xc8c6c0, columns: 'none', split: true },
      theme: rods },
    // Zinkensdamm: a pale vault over wine-red tiles on grey, and a brick-red floor.
    { name: 'Zinkensdamm', map: [0.44, 0.59], sl: 9296, riders: 8000, rise: 11, architecture: 'tiles', exits: 'Ringvägen · Hornsgatan', halls: [{ end: 'inbound', from: -10, incline: true, exits: 'Ringvägen' }], look: { ceiling: 'vault', floor: 0x8a4a38, columns: 'none' },
      theme: wine },
    // Hornstull: a pale vault over red glazed brick with white cave-painting animals.
    { name: 'Hornstull', map: [0.405, 0.6], sl: 9295, riders: 12000, rise: 7, architecture: 'tiles', exits: 'Långholmsgatan · Hornstull', halls: [{ end: 'outbound', corridor: 60, incline: true, exits: 'Långholmsgatan' }, { end: 'inbound', exits: 'Hornsbruksgatan' }], look: { ceiling: 'vault', floor: 0x5a5a5c, columns: 'none', split: true },
      theme: altamira },
    // Liljeholmen: covered, under a building deck: a dark ceiling on maroon beams, concrete reliefs, glowing pillars, a green floor.
    { name: 'Liljeholmen', map: [0.375, 0.635], sl: 9294, riders: 18000, rise: 7, architecture: 'tiles', exits: 'Liljeholmstorget', halls: [{ end: 'outbound' }, { end: 'inbound', exits: 'Liljeholmsvägen' }], gap: 800, transfer: text.announcements.tvarbanaTransfer, look: { ceiling: 'flat', floor: 0x7a9a86, columns: 'none' },
      theme: reliefs },
    // Route 13 toward Norsborg.
    // Aspudden: a white vault, teal checker tiles on one wall, enamel leaves on white tiles on the other, a bronze penguin.
    { name: 'Aspudden', map: [0.345, 0.665], sl: 9293, riders: 5000, rise: 11, architecture: 'tiles', exits: 'Aspudden', halls: [{ end: 'outbound', exits: 'Schlytersvägen' }], branch: '13', gap: JUNCTION_RUN, look: { ceiling: 'vault', floor: 0xb8b6b0, columns: 'none', split: true },
      theme: leaves },
    { name: 'Örnsberg', map: [0.315, 0.685], sl: 9292, riders: 3000, architecture: 'rock', exits: 'Örnsberg', halls: [{ end: 'inbound' }], branch: '13', open: true, theme: rock(0x484848, coolLamp, 0x606468, 0xa0a4a8, 99) },
    { name: 'Axelsberg', map: [0.285, 0.705], sl: 9291, riders: 3000, architecture: 'rock', exits: 'Axelsberg', halls: [{ end: 'inbound' }], branch: '13', open: true, theme: rock(0x4a4640, warmLamp, 0x7a6048, 0xb09878, 100) },
    // Mälarhöjden, deep in the rock: a white barrel vault, the blue enamel frieze along the tracks, a brick-red floor.
    { name: 'Mälarhöjden', map: [0.255, 0.725], sl: 9290, riders: 3000, rise: 24, architecture: 'tiles', exits: 'Mälarhöjden', halls: [{ end: 'inbound', exits: 'Hägerstensvägen · Slättgårdsvägen' }], branch: '13', look: { ceiling: 'vault', floor: 0x7a4232, columns: 'none', split: true }, theme: tide },
    { name: 'Bredäng', map: [0.225, 0.745], sl: 9289, riders: 7000, architecture: 'rock', exits: 'Bredängs centrum', halls: [{ end: 'inbound', from: 60, down: true }], branch: '13', open: true, theme: rock(0x484640, warmLamp, 0x6a6a5a, 0xaaa890, 102) },
    { name: 'Sätra', map: [0.195, 0.765], sl: 9288, riders: 4500, architecture: 'rock', exits: 'Sätra centrum', halls: [{ end: 'outbound' }], branch: '13', open: true, theme: rock(0x46443f, warmLamp, 0x746650, 0xb2a288, 103) },
    // Skärholmen, under the centre: a flat concrete ceiling, white tiles with black bands, desert paintings, a brick-red floor.
    { name: 'Skärholmen', map: [0.17, 0.795], sl: 9287, riders: 12000, rise: 7, architecture: 'tiles', exits: 'Skärholmens centrum', halls: [{ end: 'inbound', incline: true, exits: 'Bussterminalen' }, { end: 'outbound', from: -5, exits: 'Skärholmens centrum' }], branch: '13', look: { ceiling: 'flat', floor: 0xa0553a, columns: 'none' },
      theme: desert },
    { name: 'Vårberg', map: [0.15, 0.825], sl: 9286, riders: 4500, architecture: 'rock', exits: 'Vårbergs centrum', halls: [{ end: 'outbound' }], branch: '13', open: true, theme: rock(0x46483e, warmLamp, 0x5a7044, 0x9ab078, 105) },
    { name: 'Vårby gård', map: [0.13, 0.855], sl: 9285, riders: 3500, architecture: 'rock', exits: 'Vårby gård', halls: [{ end: 'outbound', from: 60, down: true }], branch: '13', open: true, theme: rock(0x44484a, coolLamp, 0x586878, 0x98a8b8, 106) },
    // Masmo: charcoal rock under a dark mesh ceiling, blue-grey mesh along the tracks and painted mesh plates.
    { name: 'Masmo', map: [0.11, 0.88], sl: 9284, riders: 3000, rise: 24, architecture: 'tiles', exits: 'Masmo', halls: [{ end: 'outbound', from: -10 }], branch: '13', look: { ceiling: 'flat', floor: 0x6e7072, columns: 'none' },
      theme: sunDown },
    { name: 'Fittja', map: [0.09, 0.9], sl: 9283, riders: 6000, architecture: 'rock', exits: 'Fittja centrum', halls: [{ end: 'inbound' }], branch: '13', open: true, theme: rock(0x484642, warmLamp, 0x6a5a4a, 0xa89880, 107) },
    // Alby: moss green rock covered in bright painted figures.
    { name: 'Alby', map: [0.07, 0.92], sl: 9282, riders: 6000, rise: 16, architecture: 'rock', exits: 'Alby centrum', halls: [{ end: 'inbound', corridor: 15, exits: 'Tingstorget' }], branch: '13', look: { floor: 0xc8c6be }, theme: jungle },
    { name: 'Hallunda', map: [0.05, 0.94], sl: 9281, riders: 5000, architecture: 'rock', exits: 'Hallunda centrum', halls: [{ end: 'inbound' }], branch: '13', open: true, theme: rock(0x4a443c, warmLamp, 0x8a5a38, 0xc88a58, 108) },
    { name: 'Norsborg', map: [0.03, 0.96], sl: 9280, riders: 4500, architecture: 'rock', exits: 'Norsborg', halls: [{ end: 'inbound' }], branch: '13', open: true, theme: rock(0x46464a, coolLamp, 0x5a5e66, 0x9aa0a8, 109) },
    // Route 14 toward Fruängen.
    // Midsommarkransen: shiny beige tiles under a low vault and a dark floor; a midsummer wreath hangs over the platform.
    { name: 'Midsommarkransen', map: [0.37, 0.69], sl: 9264, riders: 6000, rise: 12, architecture: 'tiles', exits: 'Tellusborgsvägen · Midsommarkransen', halls: [{ end: 'inbound', from: -5, exits: 'Tegelbruksvägen' }], branch: '14', gap: JUNCTION_RUN, look: { ceiling: 'vault', floor: 0x4a4a4e, columns: 'none', split: true },
      theme: wreath },
    { name: 'Telefonplan', map: [0.362, 0.73], sl: 9263, riders: 7000, architecture: 'rock', exits: 'Telefonplan · Konstfack', halls: [{ end: 'outbound' }], branch: '14', open: true, theme: morse },
    { name: 'Hägerstensåsen', map: [0.354, 0.77], sl: 9262, riders: 4500, architecture: 'rock', exits: 'Hägerstensåsen', halls: [{ end: 'inbound' }, { end: 'outbound' }], branch: '14', open: true, theme: rock(0x44463e, warmLamp, 0x606a48, 0xa0a878, 110) },
    { name: 'Västertorp', map: [0.346, 0.81], sl: 9261, riders: 4500, architecture: 'rock', exits: 'Västertorps centrum', halls: [{ end: 'outbound' }, { end: 'inbound' }], branch: '14', open: true, theme: rock(0x4a4640, warmLamp, 0x7a6450, 0xb49c80, 111) },
    { name: 'Fruängen', map: [0.338, 0.85], sl: 9260, riders: 7500, architecture: 'rock', exits: 'Fruängens centrum', halls: [{ end: 'outbound', from: 60, down: true }], branch: '14', open: true, theme: rock(0x444448, coolLamp, 0x585c66, 0x98a0aa, 112) },
  ],
};
