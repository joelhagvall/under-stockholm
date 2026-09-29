/**
 * Where the metro really lies: every station's latitude, longitude and depth, and the water around the city.
 * Hand-collected and approximate (a few tens of meters for positions; depths rounded to the nearest five meters,
 * negative for a station up on a bridge or embankment). Inline numbers, not an asset file, and free of three.js
 * so the landing page and the long exposure can use it.
 */

/** [latitude, longitude, meters below ground]. A station two lines share has one entry per name. */
export const GEO: Record<string, readonly [number, number, number]> = {
  // Blue line.
  'Kungsträdgården': [59.3307, 18.0735, 34],
  'T-Centralen': [59.3313, 18.0598, 30],
  'Rådhuset': [59.3303, 18.0419, 27],
  'Fridhemsplan': [59.3326, 18.029, 32],
  'Stadshagen': [59.3371, 18.017, 26],
  'Västra skogen': [59.3475, 18.004, 30],
  'Solna centrum': [59.3588, 17.999, 20],
  'Näckrosen': [59.3667, 17.9832, 25],
  'Hallonbergen': [59.3754, 17.969, 20],
  'Kista': [59.403, 17.9422, -5],
  'Husby': [59.4104, 17.9256, 25],
  'Akalla': [59.4146, 17.9127, 20],
  'Huvudsta': [59.3496, 17.9853, 25],
  'Solna strand': [59.3541, 17.974, 15],
  'Sundbybergs centrum': [59.3608, 17.9722, 25],
  'Duvbo': [59.3677, 17.9644, 25],
  'Rissne': [59.3757, 17.9398, 20],
  'Rinkeby': [59.388, 17.9286, 25],
  'Tensta': [59.3946, 17.9018, 25],
  'Hjulsta': [59.3963, 17.8878, 15],
  // Red line.
  'Ropsten': [59.3573, 18.1024, -5],
  'Gärdet': [59.347, 18.0994, 15],
  'Karlaplan': [59.3389, 18.0906, 20],
  'Mörby centrum': [59.3985, 18.0359, 15],
  'Danderyds sjukhus': [59.392, 18.0413, 15],
  'Bergshamra': [59.3808, 18.0364, 15],
  'Universitetet': [59.3655, 18.0548, 0],
  'Tekniska högskolan': [59.3456, 18.0716, 20],
  'Stadion': [59.3428, 18.0818, 20],
  'Östermalmstorg': [59.3349, 18.074, 25],
  'Gamla stan': [59.3232, 18.0674, -5],
  'Slussen': [59.3195, 18.0722, 5],
  'Mariatorget': [59.317, 18.0632, 15],
  'Zinkensdamm': [59.3177, 18.05, 20],
  'Hornstull': [59.3158, 18.034, 25],
  'Liljeholmen': [59.3106, 18.023, -5],
  'Aspudden': [59.3064, 18.0014, 10],
  'Örnsberg': [59.3055, 17.9893, 0],
  'Axelsberg': [59.3044, 17.9755, 0],
  'Mälarhöjden': [59.3009, 17.9573, 35],
  'Bredäng': [59.2948, 17.9338, 0],
  'Sätra': [59.2849, 17.9213, 0],
  'Skärholmen': [59.2771, 17.907, 5],
  'Vårberg': [59.2759, 17.8903, 0],
  'Vårby gård': [59.2645, 17.8844, 0],
  'Masmo': [59.2497, 17.8802, 25],
  'Fittja': [59.2475, 17.861, -5],
  'Alby': [59.2395, 17.8453, 25],
  'Hallunda': [59.2433, 17.8254, 20],
  'Norsborg': [59.2437, 17.8144, 5],
  'Midsommarkransen': [59.3017, 18.012, 15],
  'Telefonplan': [59.2982, 17.9972, 15],
  'Hägerstensåsen': [59.2955, 17.9791, 0],
  'Västertorp': [59.2914, 17.9667, 0],
  'Fruängen': [59.2856, 17.965, 0],
  // Green line.
  'Hässelby strand': [59.3613, 17.8322, 0],
  'Hässelby gård': [59.3669, 17.8437, 0],
  'Johannelund': [59.3679, 17.8575, 0],
  'Vällingby': [59.3632, 17.872, 0],
  'Råcksta': [59.3548, 17.8818, 0],
  'Blackeberg': [59.3483, 17.8829, 0],
  'Islandstorget': [59.3458, 17.894, 0],
  'Ängbyplan': [59.3419, 17.9072, 0],
  'Åkeshov': [59.3421, 17.9249, 0],
  'Brommaplan': [59.3384, 17.9393, 0],
  'Abrahamsberg': [59.3366, 17.9529, 0],
  'Stora mossen': [59.3345, 17.9661, 0],
  'Alvik': [59.3336, 17.9802, -5],
  'Kristineberg': [59.3327, 18.0033, 0],
  'Thorildsplan': [59.3318, 18.0155, 0],
  'S:t Eriksplan': [59.3396, 18.037, 15],
  'Odenplan': [59.343, 18.0496, 15],
  'Rådmansgatan': [59.3405, 18.0587, 15],
  'Hötorget': [59.3355, 18.0634, 12],
  'Medborgarplatsen': [59.3143, 18.0736, 15],
  'Skanstull': [59.3079, 18.0763, 10],
  'Gullmarsplan': [59.2991, 18.0808, 0],
  'Globen': [59.2943, 18.0776, 0],
  'Enskede gård': [59.2893, 18.0703, 0],
  'Sockenplan': [59.2833, 18.0708, 0],
  'Svedmyra': [59.2773, 18.0672, 0],
  'Stureby': [59.2748, 18.0558, 0],
  'Bandhagen': [59.2703, 18.0495, 0],
  'Högdalen': [59.2638, 18.043, 0],
  'Rågsved': [59.2565, 18.028, 0],
  'Hagsätra': [59.2627, 18.0125, 0],
  'Skärmarbrink': [59.2954, 18.0906, 0],
  'Hammarbyhöjden': [59.2948, 18.1047, 0],
  'Björkhagen': [59.2913, 18.1155, 0],
  'Kärrtorp': [59.2845, 18.1144, 0],
  'Bagarmossen': [59.2762, 18.1315, 5],
  'Skarpnäck': [59.2667, 18.1333, 15],
  'Blåsut': [59.2902, 18.0908, 0],
  'Sandsborg': [59.2847, 18.0923, 0],
  'Skogskyrkogården': [59.2792, 18.0955, 0],
  'Tallkrogen': [59.2711, 18.0853, 0],
  'Gubbängen': [59.2627, 18.0819, 0],
  'Hökarängen': [59.2578, 18.0825, 0],
  'Farsta': [59.2435, 18.0931, 0],
  'Farsta strand': [59.2349, 18.1017, 0],
};

/** Where a line's platforms lie deeper than the first line's at a shared station, in meters (the red and green lines pass over the blue at T-Centralen). */
export const SHARED_DEPTH: Record<string, Record<string, number>> = {
  'T-Centralen': { red: 15, green: 10 },
  'Fridhemsplan': { green: 15 },
};

/**
 * The water, as rough polygons of [latitude, longitude]: Mälaren and Riddarfjärden in the west, Saltsjön and
 * Lilla Värtan in the east, and the lakes and inlets between. Simplified to a few points each.
 */
export const WATER: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // Mälaren, from Riddarfjärden out past the western suburbs.
  [[59.3262, 18.066], [59.3268, 18.045], [59.3262, 18.025], [59.325, 18.005], [59.329, 17.99], [59.33, 17.97], [59.329, 17.945], [59.333, 17.92],
    [59.337, 17.895], [59.345, 17.87], [59.355, 17.84], [59.358, 17.8], [59.34, 17.76], [59.3, 17.72], [59.24, 17.74], [59.236, 17.8],
    [59.245, 17.84], [59.255, 17.865], [59.268, 17.878], [59.28, 17.902], [59.29, 17.925], [59.298, 17.955], [59.303, 17.985], [59.314, 18.01],
    [59.3165, 18.03], [59.3185, 18.045], [59.3195, 18.06], [59.322, 18.068]],
  // Strömmen and Saltsjön, east of Gamla stan, with Djurgården left as land.
  [[59.3262, 18.067], [59.33, 18.078], [59.3318, 18.09], [59.33, 18.1], [59.326, 18.095], [59.323, 18.11], [59.323, 18.14], [59.328, 18.17],
    [59.33, 18.2], [59.31, 18.2], [59.316, 18.13], [59.3185, 18.09], [59.32, 18.075], [59.3225, 18.07]],
  // Lilla Värtan, past Ropsten.
  [[59.345, 18.12], [59.35, 18.106], [59.356, 18.107], [59.365, 18.112], [59.38, 18.13], [59.38, 18.2], [59.335, 18.2], [59.338, 18.15]],
  // Brunnsviken.
  [[59.35, 18.05], [59.353, 18.045], [59.362, 18.04], [59.372, 18.035], [59.372, 18.043], [59.362, 18.052], [59.352, 18.058]],
  // Årstaviken and Hammarby sjö.
  [[59.312, 18.03], [59.313, 18.05], [59.308, 18.065], [59.306, 18.08], [59.304, 18.11], [59.302, 18.11], [59.304, 18.08], [59.306, 18.06], [59.309, 18.04], [59.31, 18.028]],
  // Ulvsundasjön and Bällstaviken.
  [[59.33, 17.985], [59.34, 17.985], [59.352, 17.975], [59.358, 17.968], [59.357, 17.962], [59.345, 17.977], [59.335, 17.978]],
  // Edsviken.
  [[59.38, 18.0], [59.42, 17.99], [59.42, 17.997], [59.38, 18.01]],
];

/** The origin of the network's meters: T-Centralen. */
const ORIGIN = GEO['T-Centralen'];
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((ORIGIN[0] * Math.PI) / 180);

/** Meters east and north of T-Centralen. */
export function project(lat: number, lon: number): { east: number; north: number } {
  return { east: (lon - ORIGIN[1]) * M_PER_DEG_LON, north: (lat - ORIGIN[0]) * M_PER_DEG_LAT };
}
