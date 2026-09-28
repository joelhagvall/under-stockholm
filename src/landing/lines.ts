import { JUNCTION_RUN, KYMLINGE_RUN } from '../game/layout';
import type { LineShape, RouteData, StationData } from '../game/routes';

/**
 * The metro as the landing page sees it: names, branches, routes, SL site ids,
 * weekday boardings (they set the trains' stops) and places on the network map, without the station themes in `game/line.ts`
 * (which pull in three.js). tests/line-map.test.ts keeps the two in step.
 */

export interface LandingStation extends StationData {
  /** Site id in SL's Transport API; a shared station has its first line's. */
  site: number;
  /** Where the station sits on the network map: 0 to 1 across (west to east) and down (north to south). */
  map: readonly [number, number];
}

export interface LandingLine extends LineShape {
  id: 'blue' | 'red' | 'green';
  name: string;
  color: string;
  routes: RouteData[];
  stations: LandingStation[];
}

export const LINES: LandingLine[] = [
  {
    id: 'blue', name: 'Blå linjen', color: '#1c63c4', trains: 4, summerRest: [2, 5],
    routes: [
      { number: '10', outbound: 'Hjulsta', inbound: 'Kungsträdgården', shifted: true },
      { number: '11', outbound: 'Akalla', inbound: 'Kungsträdgården' },
    ],
    stations: [
      { name: 'Kungsträdgården', site: 9340, riders: 9850, map: [0.565, 0.445] },
      { name: 'T-Centralen', site: 9001, riders: 39800, map: [0.5, 0.45] },
      { name: 'Rådhuset', site: 9309, riders: 13100, map: [0.455, 0.455] },
      { name: 'Fridhemsplan', site: 9115, riders: 20250, map: [0.41, 0.445] },
      { name: 'Stadshagen', site: 9307, riders: 14050, map: [0.38, 0.415] },
      { name: 'Västra skogen', site: 9306, riders: 7850, map: [0.35, 0.385] },
      { name: 'Solna centrum', site: 9305, riders: 11000, map: [0.345, 0.33], branch: '11', gap: JUNCTION_RUN },
      { name: 'Näckrosen', site: 9304, riders: 4000, map: [0.335, 0.285], branch: '11' },
      { name: 'Hallonbergen', site: 9303, riders: 6000, map: [0.32, 0.24], branch: '11' },
      { name: 'Kista', site: 9302, riders: 16000, map: [0.3, 0.19], branch: '11', gap: KYMLINGE_RUN },
      { name: 'Husby', site: 9301, riders: 5500, map: [0.28, 0.15], branch: '11' },
      { name: 'Akalla', site: 9300, riders: 5000, map: [0.26, 0.11], branch: '11' },
      { name: 'Huvudsta', site: 9327, riders: 4500, map: [0.315, 0.37], branch: '10', gap: JUNCTION_RUN },
      { name: 'Solna strand', site: 9326, riders: 3000, map: [0.29, 0.355], branch: '10' },
      { name: 'Sundbybergs centrum', site: 9325, riders: 10000, map: [0.26, 0.335], branch: '10' },
      { name: 'Duvbo', site: 9324, riders: 2500, map: [0.23, 0.315], branch: '10' },
      { name: 'Rissne', site: 9323, riders: 4500, map: [0.2, 0.295], branch: '10' },
      { name: 'Rinkeby', site: 9322, riders: 8000, map: [0.17, 0.275], branch: '10' },
      { name: 'Tensta', site: 9321, riders: 7000, map: [0.14, 0.255], branch: '10' },
      { name: 'Hjulsta', site: 9320, riders: 3000, map: [0.11, 0.235], branch: '10' },
    ],
  },
  {
    id: 'red', name: 'Röda linjen', color: '#d7263d', trains: 6,
    routes: [
      { number: '13', outbound: 'Norsborg', inbound: 'Ropsten' },
      { number: '14', outbound: 'Fruängen', inbound: 'Mörby centrum', shifted: true },
    ],
    stations: [
      { name: 'Ropsten', site: 9220, riders: 12000, map: [0.7, 0.3], branch: '13' },
      { name: 'Gärdet', site: 9221, riders: 6000, map: [0.665, 0.34], branch: '13' },
      { name: 'Karlaplan', site: 9222, riders: 9000, map: [0.615, 0.38], branch: '13' },
      { name: 'Mörby centrum', site: 9200, riders: 8000, map: [0.585, 0.07], branch: '14' },
      { name: 'Danderyds sjukhus', site: 9201, riders: 9000, map: [0.582, 0.125], branch: '14' },
      { name: 'Bergshamra', site: 9202, riders: 4000, map: [0.577, 0.18], branch: '14' },
      { name: 'Universitetet', site: 9203, riders: 12000, map: [0.568, 0.24], branch: '14' },
      { name: 'Tekniska högskolan', site: 9204, riders: 12000, map: [0.558, 0.31], branch: '14' },
      { name: 'Stadion', site: 9205, riders: 6000, map: [0.553, 0.36], branch: '14' },
      { name: 'Östermalmstorg', site: 9206, riders: 25000, map: [0.548, 0.405], gap: JUNCTION_RUN },
      { name: 'T-Centralen', site: 9001, riders: 45000, map: [0.497, 0.453] },
      { name: 'Gamla stan', site: 9193, riders: 12000, map: [0.503, 0.51] },
      { name: 'Slussen', site: 9192, riders: 25000, map: [0.512, 0.56] },
      { name: 'Mariatorget', site: 9297, riders: 12000, map: [0.475, 0.58] },
      { name: 'Zinkensdamm', site: 9296, riders: 8000, map: [0.44, 0.59] },
      { name: 'Hornstull', site: 9295, riders: 12000, map: [0.405, 0.6] },
      { name: 'Liljeholmen', site: 9294, riders: 18000, map: [0.375, 0.635], gap: 800 },
      { name: 'Aspudden', site: 9293, riders: 5000, map: [0.345, 0.665], branch: '13', gap: JUNCTION_RUN },
      { name: 'Örnsberg', site: 9292, riders: 3000, map: [0.315, 0.685], branch: '13' },
      { name: 'Axelsberg', site: 9291, riders: 3000, map: [0.285, 0.705], branch: '13' },
      { name: 'Mälarhöjden', site: 9290, riders: 3000, map: [0.255, 0.725], branch: '13' },
      { name: 'Bredäng', site: 9289, riders: 7000, map: [0.225, 0.745], branch: '13' },
      { name: 'Sätra', site: 9288, riders: 4500, map: [0.195, 0.765], branch: '13' },
      { name: 'Skärholmen', site: 9287, riders: 12000, map: [0.17, 0.795], branch: '13' },
      { name: 'Vårberg', site: 9286, riders: 4500, map: [0.15, 0.825], branch: '13' },
      { name: 'Vårby gård', site: 9285, riders: 3500, map: [0.13, 0.855], branch: '13' },
      { name: 'Masmo', site: 9284, riders: 3000, map: [0.11, 0.88], branch: '13' },
      { name: 'Fittja', site: 9283, riders: 6000, map: [0.09, 0.9], branch: '13' },
      { name: 'Alby', site: 9282, riders: 6000, map: [0.07, 0.92], branch: '13' },
      { name: 'Hallunda', site: 9281, riders: 5000, map: [0.05, 0.94], branch: '13' },
      { name: 'Norsborg', site: 9280, riders: 4500, map: [0.03, 0.96], branch: '13' },
      { name: 'Midsommarkransen', site: 9264, riders: 6000, map: [0.37, 0.69], branch: '14', gap: JUNCTION_RUN },
      { name: 'Telefonplan', site: 9263, riders: 7000, map: [0.362, 0.73], branch: '14' },
      { name: 'Hägerstensåsen', site: 9262, riders: 4500, map: [0.354, 0.77], branch: '14' },
      { name: 'Västertorp', site: 9261, riders: 4500, map: [0.346, 0.81], branch: '14' },
      { name: 'Fruängen', site: 9260, riders: 7500, map: [0.338, 0.85], branch: '14' },
    ],
  },
  {
    id: 'green', name: 'Gröna linjen', color: '#2e8b57', trains: 8,
    routes: [
      { number: '17', outbound: 'Skarpnäck', inbound: 'Åkeshov', shifted: true },
      { number: '18', outbound: 'Farsta strand', inbound: 'Alvik', shifted: true },
      { number: '19', outbound: 'Hagsätra', inbound: 'Hässelby strand' },
    ],
    stations: [
      { name: 'Hässelby strand', site: 9100, riders: 5000, map: [0.032, 0.27], branch: '19' },
      { name: 'Hässelby gård', site: 9101, riders: 5000, map: [0.042, 0.3], branch: '19' },
      { name: 'Johannelund', site: 9102, riders: 2000, map: [0.052, 0.33], branch: '19' },
      { name: 'Vällingby', site: 9103, riders: 14000, map: [0.065, 0.36], branch: '19' },
      { name: 'Råcksta', site: 9104, riders: 3500, map: [0.085, 0.38], branch: '19' },
      { name: 'Blackeberg', site: 9105, riders: 4500, map: [0.105, 0.4], branch: '19' },
      { name: 'Islandstorget', site: 9106, riders: 4000, map: [0.125, 0.42], branch: '19' },
      { name: 'Ängbyplan', site: 9107, riders: 2500, map: [0.145, 0.44], branch: '19' },
      { name: 'Åkeshov', site: 9108, riders: 2500, map: [0.165, 0.458], branch: ['17', '19'] },
      { name: 'Brommaplan', site: 9109, riders: 10000, map: [0.19, 0.466], branch: ['17', '19'] },
      { name: 'Abrahamsberg', site: 9110, riders: 3000, map: [0.22, 0.468], branch: ['17', '19'] },
      { name: 'Stora mossen', site: 9111, riders: 3000, map: [0.25, 0.468], branch: ['17', '19'] },
      { name: 'Alvik', site: 9112, riders: 15000, map: [0.28, 0.468] },
      { name: 'Kristineberg', site: 9113, riders: 5000, map: [0.32, 0.462], gap: 900 },
      { name: 'Thorildsplan', site: 9114, riders: 4000, map: [0.36, 0.458] },
      { name: 'Fridhemsplan', site: 9115, riders: 15000, map: [0.405, 0.438] },
      { name: 'S:t Eriksplan', site: 9116, riders: 15000, map: [0.428, 0.395] },
      { name: 'Odenplan', site: 9117, riders: 20000, map: [0.455, 0.378] },
      { name: 'Rådmansgatan', site: 9118, riders: 12000, map: [0.482, 0.38] },
      { name: 'Hötorget', site: 9119, riders: 20000, map: [0.505, 0.405] },
      { name: 'T-Centralen', site: 9001, map: [0.507, 0.447], shared: 'red' },
      { name: 'Gamla stan', site: 9193, map: [0.513, 0.505], shared: 'red' },
      { name: 'Slussen', site: 9192, map: [0.522, 0.555], shared: 'red' },
      { name: 'Medborgarplatsen', site: 9191, riders: 20000, map: [0.54, 0.59] },
      { name: 'Skanstull', site: 9190, riders: 15000, map: [0.553, 0.625] },
      { name: 'Gullmarsplan', site: 9189, riders: 18000, map: [0.57, 0.67], gap: 800 },
      { name: 'Globen', site: 9168, riders: 5000, map: [0.56, 0.71], branch: '19', gap: JUNCTION_RUN },
      { name: 'Enskede gård', site: 9167, riders: 2000, map: [0.55, 0.74], branch: '19' },
      { name: 'Sockenplan', site: 9166, riders: 3000, map: [0.54, 0.77], branch: '19' },
      { name: 'Svedmyra', site: 9165, riders: 3000, map: [0.53, 0.8], branch: '19' },
      { name: 'Stureby', site: 9164, riders: 3000, map: [0.52, 0.83], branch: '19' },
      { name: 'Bandhagen', site: 9163, riders: 5000, map: [0.51, 0.86], branch: '19' },
      { name: 'Högdalen', site: 9162, riders: 7000, map: [0.5, 0.89], branch: '19' },
      { name: 'Rågsved', site: 9161, riders: 5000, map: [0.49, 0.92], branch: '19' },
      { name: 'Hagsätra', site: 9160, riders: 6000, map: [0.48, 0.95], branch: '19' },
      { name: 'Skärmarbrink', site: 9188, riders: 3500, map: [0.6, 0.695], branch: ['17', '18'], gap: JUNCTION_RUN },
      { name: 'Hammarbyhöjden', site: 9144, riders: 5000, map: [0.63, 0.684], branch: '17', gap: JUNCTION_RUN },
      { name: 'Björkhagen', site: 9143, riders: 4000, map: [0.66, 0.684], branch: '17' },
      { name: 'Kärrtorp', site: 9142, riders: 4000, map: [0.69, 0.688], branch: '17' },
      { name: 'Bagarmossen', site: 9141, riders: 6000, map: [0.72, 0.695], branch: '17' },
      { name: 'Skarpnäck', site: 9140, riders: 6000, map: [0.75, 0.705], branch: '17' },
      { name: 'Blåsut', site: 9187, riders: 3500, map: [0.61, 0.73], branch: '18', gap: JUNCTION_RUN },
      { name: 'Sandsborg', site: 9186, riders: 3000, map: [0.62, 0.76], branch: '18' },
      { name: 'Skogskyrkogården', site: 9185, riders: 2500, map: [0.63, 0.79], branch: '18' },
      { name: 'Tallkrogen', site: 9184, riders: 3000, map: [0.64, 0.82], branch: '18' },
      { name: 'Gubbängen', site: 9183, riders: 5000, map: [0.65, 0.85], branch: '18' },
      { name: 'Hökarängen', site: 9182, riders: 5000, map: [0.66, 0.88], branch: '18' },
      { name: 'Farsta', site: 9181, riders: 12000, map: [0.67, 0.91], branch: '18' },
      { name: 'Farsta strand', site: 9180, riders: 5000, map: [0.68, 0.94], branch: '18' },
    ],
  },
];
