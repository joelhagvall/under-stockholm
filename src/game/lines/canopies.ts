import type { CanopyDef } from '../world/canopy';

/*
 * What stands over each open-air platform, after photos of the real stations: the roof's shape, how much of the
 * platform it covers (from the end with the main hall), the colours of its underside and steel, and the platform's
 * surface. The 1950s stations mostly have a roof of sheet or boarding on one row of posts over part of the platform,
 * the Farsta and Hagsätra lines Peter Celsing's butterfly roofs with white boarded undersides, the southwest's 1960s
 * and 70s stations long flat roofs whose steel is painted one bold colour each. Kept apart from the lines' station
 * lists and joined to them by name in `buildNetwork`.
 */
export const OPEN_ROOFS: Record<string, CanopyDef> = {
  // The blue line.
  Kista: { roof: 'flat', under: 0xa8a8a4, top: 0x6a6c6e, eaves: 0x86b4c8, posts: 0x9a968e, floor: 0x7a7a78 },

  // The red line.
  Ropsten: { roof: 'flat', cover: [0, 0.9], under: 0x1c1c1c, eaves: 0xf2f2f2, posts: 0x8a8a8a, floor: 0x7d7d7a },
  Örnsberg: { roof: 'flat', cover: [0, 0.18], under: 0x3e2c20, top: 0x2a2a2a, eaves: 0x7a4030, posts: 0x3a3a3a, lanterns: 0x4a4e52, floor: 0x55575a, building: 0x7a4030, cutting: { kind: 'rock', side: 1 } },
  Axelsberg: { deck: 0x2e2e2e, floor: 0x6a6a68, cutting: { kind: 'concrete' } },
  Bredäng: { roof: 'flat', cover: [0, 0.9], under: 0x3e2c20, top: 0x3a3a3a, eaves: 0x3e2c20, posts: 0x8a9aa8, screens: 0x5a5e62, floor: 0x7a7c80 },
  Sätra: { roof: 'flat', cover: [0, 0.9], under: 0xdcdcd8, eaves: 0x8a8e92, posts: 0x8a8e92, floor: 0x6a6c70, building: 0x3a5cc8 },
  Vårberg: { roof: 'flat', cover: [0, 0.5], under: 0xa8aaac, eaves: 0x3a3e44, posts: 0x3a3e44, floor: 0x6a6c6e, building: 0xe8d23a, cutting: { kind: 'rock', side: -1 } },
  'Vårby gård': { roof: 'flat', cover: [0, 0.9], under: 0xdcdedf, eaves: 0x1e1e1e, posts: 0x1e1e1e, screens: 0x1e1e1e, floor: 0x8a8c8e },
  Fittja: { roof: 'flat', cover: [0, 0.85], under: 0xd8dadc, eaves: 0x2e3a3a, posts: 0x243030, screens: 0x243030, floor: 0x8a8c8e },
  Hallunda: { roof: 'flat', under: 0xdcdee0, eaves: 0x7cc03e, posts: 0x7cc03e, lanterns: 0x7cc03e, screens: 0x1e1e1e, floor: 0x7e8084 },
  Norsborg: { roof: 'flat', cover: [0, 0.8], under: 0xe0e0de, eaves: 0xd0702e, posts: 0xd0702e, lanterns: 0xd0702e, floor: 0x7e8084, screens: 0xd0702e, cutting: { kind: 'concrete' } },
  Telefonplan: { roof: 'flat', cover: [0, 0.4], under: 0x2a2a2a, top: 0x1e1e1e, eaves: 0x1e1e1e, posts: 0xc89a30, lanterns: 0xc89a30, floor: 0x5e6064, building: 0xd8a83a, cutting: { kind: 'rock' } },
  Hägerstensåsen: { roof: 'flat', cover: [0, 0.9], under: 0xeeeeea, top: 0x2a2a2a, eaves: 0x6a2e24, posts: 0x6a2e24, floor: 0x6a6c70, building: 0x8a2a22 },
  Västertorp: { roof: 'butterfly', cover: [0, 0.9], under: 0xe8dcb4, top: 0x3a3a3a, eaves: 0xe0d0a0, posts: 0x1e2e5a, floor: 0x8a8c8e, building: 0xeeece6 },
  Fruängen: { roof: 'flat', cover: [0, 0.5], under: 0xc8cacc, eaves: 0x6a6e72, posts: 0x6a6e72, floor: 0x8a8a88 },

  // The green line, west.
  'Hässelby strand': { roof: 'flat', cover: [0, 0.6], under: 0x4b4f55, eaves: 0x8a2c24, posts: 0x8a2c24, lanterns: 0x8a2c24, floor: 0x8e8f8c, building: 0xeeeeea },
  'Hässelby gård': { roof: 'flat', cover: [0, 0.75], under: 0x9ea3a6, eaves: 0x6f757a, posts: 0x6f757a, floor: 0x8f8f8b },
  Johannelund: { roof: 'none', lanterns: 0x5a6068, floor: 0x7d7e7c, building: 0x7c877f },
  Vällingby: { deck: 0x6a6966, walls: 0x2f4a3f, floor: 0x858581 },
  Råcksta: { roof: 'butterfly', cover: [0.1, 0.6], under: 0x2d3134, top: 0x2d3134, eaves: 0x2d3134, posts: 0x3a3f44, screens: 0x3a3f44, floor: 0x8b8c89 },
  Blackeberg: { roof: 'butterfly', cover: [0, 0.6], under: 0x33373b, top: 0x33373b, eaves: 0x33373b, posts: 0x3a3f44, floor: 0x8a8b88, building: 0xb5b1a8, cutting: { kind: 'rock' } },
  Islandstorget: { roof: 'flat', cover: [0, 0.25], under: 0xb3b7b9, eaves: 0x5b6670, posts: 0x5b6670, lanterns: 0x5b6670, floor: 0x5f6163 },
  Ängbyplan: { roof: 'flat', cover: [0.25, 0.75], under: 0x3a3431, eaves: 0x8e3b2b, posts: 0x8e3b2b, lanterns: 0x8e3b2b, screens: 0x8e3b2b, floor: 0x7a7b79 },
  Åkeshov: { roof: 'flat', cover: [0, 0.5], under: 0xaeb2b4, eaves: 0x2e5a45, posts: 0x2e5a45, lanterns: 0x2e5a45, floor: 0x8a8b88 },
  Brommaplan: { roof: 'butterfly', cover: [0.3, 0.7], under: 0x3a3e43, top: 0x3a3e43, eaves: 0x3a3e43, posts: 0x3a3f44, screens: 0x3a3f44, floor: 0x8a8b88 },
  Abrahamsberg: { roof: 'flat', cover: [0, 0.9], under: 0xb7bcbf, eaves: 0x3d4a5a, posts: 0x3d4a5a, floor: 0x8d8e8b },
  'Stora mossen': { roof: 'flat', cover: [0.2, 0.7], under: 0x2b3038, top: 0x2b3038, eaves: 0xe0622a, posts: 0x34393f, screens: 0x34393f, floor: 0x8a8b88, building: 0x6f9a8c },
  Alvik: { roof: 'flat', cover: [0, 0.9], under: 0x9fa4a8, eaves: 0x5e6368, posts: 0x5e6368, floor: 0x8e8e8a, building: 0xd8b25a },
  Kristineberg: { roof: 'none', lanterns: 0x5a6068, floor: 0x9a9a96 },
  Thorildsplan: { roof: 'flat', cover: [0, 0.25], under: 0xb3b7b9, eaves: 0x2a5fa8, posts: 0x5a6068, floor: 0x8a8a86, cutting: { kind: 'concrete', height: 4 } },

  // The green line, south.
  Gullmarsplan: { deck: 0x55585a, floor: 0x8c8c88 },
  // The arena, 110 m across and 85 m high, a little nearer than OpenStreetMap has it so it shows through the haze.
  Globen: { roof: 'flat', cover: [0, 0.85], under: 0x9aa0a4, eaves: 0x1f4f9a, posts: 0x1f4f9a, lanterns: 0x1f4f9a, floor: 0x8e8e8a, globe: [9, -125, 52, 28], cutting: { kind: 'rock', side: 1, height: 3.5 } },
  'Enskede gård': { roof: 'butterfly', cover: [0, 0.8], under: 0xe8e6df, top: 0x3a3a3a, eaves: 0x2b2d2f, posts: 0x2b2d2f, floor: 0x8a8a86 },
  Sockenplan: { roof: 'butterfly', cover: [0, 0.6], under: 0xe8e6df, top: 0x3a3a3a, eaves: 0x26282a, posts: 0x26282a, floor: 0x909090 },
  Svedmyra: { roof: 'butterfly', cover: [0.1, 0.7], under: 0xe8e6df, top: 0x3a3a3a, eaves: 0x2a2c2e, posts: 0x2a2c2e, screens: 0x2a2c2e, floor: 0x9a9a96, building: 0xefe6c8 },
  Stureby: { roof: 'butterfly', cover: [0.1, 0.7], under: 0xebe9e2, top: 0x3a3a3a, eaves: 0x5a5e62, posts: 0x5a5e62, floor: 0x8a8a86 },
  Bandhagen: { roof: 'butterfly', cover: [0.2, 0.8], under: 0x9ea3a6, eaves: 0x3a3f3c, posts: 0x3a3f3c, floor: 0x9a9a96, building: 0x2e4a38 },
  Högdalen: { roof: 'flat', cover: [0, 0.8], under: 0x4a5566, top: 0x4a5566, eaves: 0x4a5566, posts: 0x4a4d50, floor: 0x8a8a86, building: 0x8a8e92 },
  Rågsved: { roof: 'butterfly', cover: [0.3, 0.65], under: 0xe8e6df, top: 0x3a3a3a, eaves: 0x2a2c2e, posts: 0x2a2c2e, floor: 0x8a8a86, cutting: { kind: 'rock', side: 1, height: 5 } },
  Hagsätra: { roof: 'gable', cover: [0, 0.9], rows: 2, under: 0xe9e7e0, top: 0x3a3a3a, eaves: 0x2c2e30, posts: 0x2c2e30, floor: 0x7e7e7a },
  Skärmarbrink: { roof: 'butterfly', cover: [0.2, 0.8], under: 0x9ea3a6, eaves: 0x3a3f44, posts: 0x3a3f44, floor: 0x8a8a86, building: 0x1e2f6e, cutting: { kind: 'rock', height: 5 } },
  Hammarbyhöjden: { roof: 'butterfly', cover: [0.2, 0.7], rows: 2, under: 0x9ea3a6, eaves: 0x4a4d50, posts: 0x4a4d50, floor: 0xa8483a, building: 0x6a3a2e, cutting: { kind: 'rock', height: 3.5 } },
  Björkhagen: { roof: 'butterfly', cover: [0.25, 0.75], under: 0xa4a9ac, eaves: 0x2f7f8f, posts: 0x2f7f8f, lanterns: 0x2f7f8f, floor: 0x7e7e7c },
  Kärrtorp: { roof: 'butterfly', cover: [0.1, 0.6], under: 0xa4a9ac, eaves: 0x2f7f8f, posts: 0x2f7f8f, lanterns: 0x2f7f8f, floor: 0x8a8a86, cutting: { kind: 'rock', side: -1, height: 4 } },
  Blåsut: { roof: 'butterfly', cover: [0, 0.6], under: 0xe8e6df, top: 0x3a3a3a, eaves: 0x2a2c2e, posts: 0x3a3d40, screens: 0x1e1e1e, floor: 0x9a9a96 },
  Sandsborg: { roof: 'flat', cover: [0, 0.6], under: 0xa4a9ac, eaves: 0x7b2323, posts: 0x7b2323, lanterns: 0x7b2323, screens: 0x7b2323, floor: 0xa8a8a4, building: 0x7a2a2a },
  Skogskyrkogården: { roof: 'butterfly', cover: [0, 0.4], under: 0x2f2a26, top: 0x2f2a26, eaves: 0x1e1e1e, posts: 0x1e1e1e, lanterns: 0x1e1e1e, floor: 0x8a8a86 },
  Tallkrogen: { roof: 'butterfly', cover: [0.3, 0.65], under: 0xe8e6df, top: 0x3a3a3a, eaves: 0x2a2c2e, posts: 0x2a2c2e, lanterns: 0x7a3a2a, floor: 0x8a8a86 },
  Gubbängen: { roof: 'butterfly', cover: [0, 0.6], under: 0xe8e6df, top: 0x3a3a3a, eaves: 0x3a3d40, posts: 0x3a3d40, floor: 0x8a8a86 },
  Hökarängen: { roof: 'butterfly', cover: [0, 0.85], rows: 2, under: 0xe8e6df, top: 0x3a3a3a, eaves: 0x4a4d50, posts: 0x4a4d50, floor: 0x8e8e8a },
  Farsta: { roof: 'butterfly', cover: [0.1, 0.8], under: 0x6a6e72, eaves: 0x2a2c2e, posts: 0x2a2c2e, floor: 0x8a8a86, building: 0x2a5fb0 },
  'Farsta strand': { deck: 0x3a3c3e, walls: 0x5a6a5e, floor: 0x7a7a78 },
};
