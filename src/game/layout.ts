/**
 * World layout. The line runs along +x, stations are centered on the x axis,
 * and each station has an island platform between two tracks.
 * Units are meters, y is up, rail top is y = 0.
 */

export const PLATFORM_Y = 1.1; // platform surface and train floor
export const TRACK_Z = 6.6; // track centerline distance from the line axis
/**
 * The side of the line axis a train heading `dir` (1 toward +x) runs on. As on
 * all of SL's metro, trains keep left: track 1, west toward +x, lies at z < 0,
 * and track 2, back east, at z > 0.
 */
export const trackSide = (dir: number): 1 | -1 => (dir > 0 ? -1 : 1);
/**
 * Where two lines share a station (T-Centralen, Gamla stan, Slussen), the
 * second line's tracks lie this much further out than the first's, with an
 * island platform between each pair: red inside, green outside, and one
 * direction of both lines on each platform.
 */
export const LANE = 2 * TRACK_Z;
export const PLATFORM_HALF_W = 5;
export const PLATFORM_HALF_L = 72.5;

export const CAVE_HALF_L = 80;
export const CAVE_HALF_W = 11;
export const CAVE_WALL_H = 4.5;
export const CAVE_TOP = 8.2;
export const CAVE_BOTTOM = -0.5;

export const TUBE_HALF_W = 2.5;
export const TUBE_WALL_H = 3.4;
export const TUBE_TOP = 5.4;
export const TUBE_BOTTOM = -0.3;
/** Inner and outer tube wall offsets from the line axis. */
export const TUBE_INNER = TRACK_Z - TUBE_HALF_W; // 4.1
export const TUBE_OUTER = TRACK_Z + TUBE_HALF_W; // 9.1

/** Station centers are this far apart. Real distances are compressed. */
export const STATION_SPACING = 500;

/** Turnback cavern beyond the outermost stations. */
export const TAIL_TUBE = 20; // short single-track tubes between cave and cavern
export const CAVERN_LEN = 200;
export const CAVERN_HALF_W = 10;
export const CAVERN_WALL_H = 4;
export const CAVERN_TOP = 7.5;
/** Where a train stands while it changes track, measured from the station center. */
export const TURNBACK_REACH = CAVE_HALF_L + TAIL_TUBE + 120;

/**
 * Where a line branches, every tunnel out of the junction station is
 * `JUNCTION_RUN` long: the blue line's west of Västra skogen, toward Solna
 * centrum (11) and Huvudsta (10). A branch is built elsewhere along x, so the
 * whole world stays one straight corridor: its trains cross between two
 * copies of the junction tunnel halfway along, where the tunnels are
 * identical for longer than the fog reaches (see `routes.ts` and `world.ts`).
 */
export const JUNCTION_RUN = 1000;

/**
 * Kymlinge, the station that never opened, lies in the tunnel between
 * Hallonbergen and Kista on the Akalla branch. Trains run straight through;
 * only Silverpilen stops.
 */
export const KYMLINGE_RUN = 1200; // Hallonbergen to Kista
export const KYMLINGE_AFTER = 600; // Hallonbergen to Kymlinge's center
/** Silverpilen fades out this far beyond Kymlinge's center, well before Kista. */
export const SILVER_VANISH = CAVE_HALF_L + 170;

/** Escalator shaft from the cave end wall up to the ticket hall. */
export const ESC_ANGLE = (30 * Math.PI) / 180;
/** The escalators' climb from platform to ticket hall where a station names none (see `StationDef.rise`). */
export const ESC_RISE = 12;
export const ESC_LANDING = 1.25;
export const ESC_HALF_W = 2.6;
export const ESC_HEADROOM = 3.9;
export const ESC_SPEED = 0.75;
export const ESC_DESIGN = {
  laneCenter: 1.18, treadWidth: 1.12, stepPitch: 0.4, stepDepth: 0.26,
  groovePitch: 0.035, grooveWidth: 0.009, grooveHeight: 0.006,
  railWidth: 0.28, railHeight: 1, railRadius: 0.42, railEnd: 0.65,
  handrailRadius: 0.055, panelGap: 0.025, skirtHeight: 0.14,
  combLength: 0.25, combHeight: 0.012, panelLength: 1.4,
  lightSpacing: 3.5, lightHalfWidth: 1.8, fixtureDepth: 0.08,
  updateDistance: 170, indicatorRadius: 0.055,
};

/**
 * An inclined lift (snedbanehiss) in a narrow shaft of its own beside the escalators, on their +z side, from the
 * escalators' wall (`z0`) to just short of the track tube (`z1`). Its cabin (`length` along x) keeps a level floor on
 * the escalators' line, so it stands level with the platform and the hall at its two stops (see `world/incline.ts`).
 */
export const INCLINE = {
  z0: ESC_HALF_W + ESC_DESIGN.railWidth, z1: 4, length: 2.4, height: 2.3, wall: 0.1,
  /** Top speed along x, and how fast it gets there. */
  speed: 1.6, accel: 0.5,
  /** Seconds the doors stand open at each stop, and how long they take to move. */
  dwell: 12, doors: 0.8,
};

/**
 * The staff door beside the escalators, where a ticket hall's take the end wall's middle (see `world/service.ts`): on
 * the platform across `z0` to `z1`, the side away from an inclined lift, onto a narrow passage that steps down to the
 * trackbed from `down` to `flat` and turns in under the rising escalator shaft at `turn` to the service corridor, which
 * starts `start` from the end wall.
 */
export const SIDE_DOOR = { z0: -3.85, z1: -2.9, height: 2.2, down: 3, flat: 4.6, turn: 7, start: 8.8 };

export const CABIN_DESIGN = {
  seatAisle: 0.46, seatEdge: 0.04, cushionDepth: 0.59, cushionHeight: 0.14,
  cushionY: 0.43, seatRadius: 0.055, backThickness: 0.12, backHeight: 0.78,
  backY: 0.87, backOffset: 0.34, backLean: 0.14, shellThickness: 0.045,
  shellOffset: 0.075, pedestalWidth: 0.22, pedestalHeight: 0.32,
  poleRadius: 0.026, railY: 2.98, seatHandleHeight: 0.32,
  lightY: 3.19, lightZ: 0.95, lightWidth: 0.21, lightLength: 2.25, lightPitch: 2.55,
  ceilingPanelY: 3.34, ceilingPanelWidth: 1.25, ceilingSeam: 0.014,
  ventilationY: 3.07, ventilationWidth: 0.07,
  columnRadius: 0.2,
  posterWidth: 0.34, posterHeight: 0.48, posterY: 2.66,
  screenInset: 0.015, thresholdDepth: 0.22, thresholdHeight: 0.008,
  // The renovated C20's side seats: single seats along the wall on a dark plinth, their backs `sideBackZ` in from it.
  sideDepth: 0.6, sideWidth: 0.46, sideBackHeight: 0.66, sideBackY: 0.82, sideBackZ: 0.16, sideBackLean: 0.06,
  plinthHeight: 0.3, plinthDepth: 0.34,
  // The flex areas' lean bar, out from the wall, and their pictogram plate below it.
  leanBarY: 0.92, leanBarLowY: 0.66, leanBarOut: 0.14, flexSignY: 0.42,
  // Grab handles standing off the door columns, from `gripLow` to `gripHigh` above the floor.
  gripLow: 0.95, gripHigh: 1.9, gripOut: 0.07,
  // Dot-matrix displays over the gangways and the cab door, their centres at `displayY` above the rail.
  displayWidth: 1.1, displayHeight: 0.15, displayY: 3.28, cabDisplayY: 3.22,
  // Grey pleats down the gangway walls and the round turntable plate in their floor.
  pleatPitch: 0.06, turntableRadius: 0.55,
};

export const HALL_LEN = 32;
export const HALL_HALF_W = 9;
export const HALL_H = 7;

/**
 * The street over an underground station's ticket hall (`world/street.ts`), measured like the hall: `a` along it from
 * the escalator end, `z` across. The exit stairs climb to a landing inside the hall, then a second flight in an open
 * cut beyond its end wall comes up on a square between houses, with a road across its far end.
 */
export const STREET = {
  /** Street level over the hall's floor: the hall's ceiling and a metre and a half of ground over it. */
  above: HALL_H + 1.5,
  /** Where the second flight comes up (30 steps of 0.17 by 0.35 from the landing at the end wall). */
  stairTop: HALL_LEN + 10.5,
  /** The square, from the house behind it to the pavement, `halfW` either side. */
  square: { a0: 6, a1: 47, halfW: 12 },
  /** The road, the far pavement's edge where the houses across it stand, and how far it runs either way. */
  road: { a0: 50, a1: 58, far: 61, halfLen: 48 },
  /** The houses' depth beyond the road and at its ends. */
  depth: 14,
  /** In the open, the hall stands over the tracks and its door opens onto the street, this far over the hall's floor (the landing at the top of its stairs): the door's height and half width. */
  door: 3.4,
  doorHeight: 3.2,
  doorHalfW: 2.5,
};

/**
 * How far below the platform a hall under the tracks lies, at a station in the open: its stairs, as deep as an
 * underground hall's under its street, come up to the grass beside the tracks (see `world/station.ts`).
 */
export const UNDERPASS_DEPTH = PLATFORM_Y + STREET.above + 0.3;

/**
 * A station up on a viaduct (`CanopyDef.viaduct`): the ground lies as far below the tracks as a hall under them, so
 * that hall stands on it and opens straight out, and the deck runs on over the neighbouring stretches, the ground
 * rising back to the tracks' level within `ramp` meters (or by a tunnel mouth, if one comes sooner).
 */
export const VIADUCT = {
  /** How far the ground lies below its usual level (`-0.3`, just under the rails). */
  drop: STREET.above,
  ramp: 160,
  /** The deck's underside, and the parapet's top over the rails. */
  deckBottom: -1.4,
  parapet: 1.0,
  /** Piers this far apart along the deck, a pair across it, each this far from the middle and this thick. */
  pierStep: 20,
  pierZ: 7.5,
  pierHalf: 0.6,
};

/**
 * The tiled passage off T-Centralen's ticket hall toward the commuter trains
 * at City. `a0`/`a1` are measured along the hall, `length` out from its side
 * wall. The gate line to the commuter trains stands `gateSetback` before the
 * end wall, and the busker sits `buskerZ` in.
 */
export const PASSAGE_LAYOUT = { a0: 3, a1: 10, length: 150, height: 3.2, gateSetback: 9, buskerZ: 14 };

/**
 * Moving walkways along both walls of the passage, from `z0` to `z1` in from
 * the hall: toward City on the `a0` side, back on the `a1` side. The crowd
 * keeps to the walkway between their balustrades.
 */
export const TRAVELATOR_LAYOUT = { z0: 32, z1: 112, width: 1.2, wall: 0.1, rail: 0.14, speed: 0.65 };

/**
 * The red and green line platforms at T-Centralen, reached from the City
 * passage: a hall beside the blue line, with its rails at `railY`, low
 * enough for the tunnels to pass under the passage. `from`/`to` are x
 * relative to T-Centralen's center. Two island platforms (green, then red)
 * sit at `green` and `red` in z; a mezzanine at passage level runs along the
 * hall's end wall with stairs down to both.
 */
export const TRANSFER_LAYOUT = {
  from: -70, to: 90, railY: 6, zc: 46, halfW: 20.5, green: 36, red: 56,
  corridor: { z0: 34.5, z1: 37.5, height: 3.2 },
  mezzanine: { depth: 6, z0: 33.6, z1: 58.4 },
  stair: { run: 12, halfW: 1.1 },
  tube: 150,
};

/**
 * Rush hour in the passage. Up to `count` commuters are simulated within
 * `window` meters of the player, and `background` cheap silhouettes fill the
 * passage beyond. Densest from `denseFrom` meters in, clear of the busker.
 */
export const RUSH_LAYOUT = {
  count: 200,
  background: 240,
  window: 13,
  radius: 0.25,
  playerRadius: 0.3,
  speed: 1.25,
  denseFrom: 16,
  denseRamp: 20,
  shoveReach: 1.4,
  punchReach: 1.2,
  shoveCooldown: 0.45,
  talkCooldown: 1.8,
};

/** A train is 138 m whatever its stock, so it stops at the same place on every platform. */
export const TRAIN_HALF_L = 69;
export const TRAIN_HALF_W = 1.5;
/** How far the rounded cab nose reaches past the body end. */
export const TRAIN_NOSE = 0.8;
export const TRAIN_ROOF = 3.6;

/**
 * A train's stock: its units, their sections and doors. Passengers walk through the sections of a unit over a
 * gangway at each `articulation`; where two units are `coupled`, each has its cab, and there is no way through.
 */
export interface Stock {
  id: 'c20' | 'c30';
  /** The middle of each unit, along the train. */
  units: number[];
  sections: Array<{ center: number; halfLength: number; doors: number[] }>;
  /** Every door along one side. */
  doors: number[];
  /** Gangways between the sections of a unit. */
  articulations: number[];
  /** Where two units meet, cab to cab. */
  couplings: number[];
}

/** Three C20 units, each with A/M/B sections and 2/3/2 doors per side. */
const C20_UNITS = [-46, 0, 46];
export const C20: Stock = {
  id: 'c20',
  units: C20_UNITS,
  sections: C20_UNITS.flatMap((unit) => [
    { center: unit - 15.5, halfLength: 7.5, doors: [unit - 18, unit - 11] },
    { center: unit, halfLength: 8, doors: [unit - 5.2, unit, unit + 5.2] },
    { center: unit + 15.5, halfLength: 7.5, doors: [unit + 11, unit + 18] },
  ]),
  doors: [],
  articulations: C20_UNITS.flatMap((unit) => [unit - 8, unit + 8]),
  couplings: [-23, 23],
};
C20.doors = C20.sections.flatMap((section) => section.doors);

/**
 * Two C30 units of four sections, each section with three doors a side, and open gangways between them: the red
 * line's trains since 2020. Scaled a little, 69 m a unit instead of 70, to the C20's train length.
 */
const C30_UNITS = [-34.5, 34.5];
export const C30: Stock = {
  id: 'c30',
  units: C30_UNITS,
  sections: C30_UNITS.flatMap((unit) => [-25.875, -8.625, 8.625, 25.875].map((dx) => ({
    center: unit + dx, halfLength: 8.625, doors: [unit + dx - 5.2, unit + dx, unit + dx + 5.2],
  }))),
  doors: [],
  articulations: C30_UNITS.flatMap((unit) => [unit - 17.25, unit, unit + 17.25]),
  couplings: [0],
};
C30.doors = C30.sections.flatMap((section) => section.doors);

/** The C20's layout, for code about the blue and green lines' trains or any train at all. */
export const CAR_CENTERS = C20.units;
export const CAR_HALF_L = 23;
export const TRAIN_SECTIONS = C20.sections;
export const ARTICULATION_XS = C20.articulations;
export const COUPLING_XS = C20.couplings;
export const TRAIN_JOINT_HALF_W = 0.36;
export const TRAIN_END_TRIM = 0.65;
/** How deep a cab is, from the body end to its bulkhead. */
export const CAB_DEPTH = 2.3;
export const DOOR_HALF_W = 0.65;
export const DOOR_TOP = 3.0;
export const DOOR_XS = C20.doors;

/**
 * The seating. In the renovated C20 and the C30, between two doors one wall
 * has a row of up to `sideRow` single seats along the wall, `sidePitch`
 * apart, starting past a door column at `column` from the door's centre, and
 * the other wall groups of four. What is left of a long row's wall is a flex
 * area for prams and wheelchairs, and at the gangways one side is always a
 * flex area. A flex area is at least `flexMin` long, and one at a gangway
 * takes at most `flexLength`. The older stock has groups of four all along,
 * and a group is two rows facing each other across a knee gap:
 * group seat centres are `rowSpacing` apart, and a row's backrest and shell
 * reach `rowBack` behind its centre. Groups start at the glass screen
 * `screen` from a door's centre; a space too short for a whole group but
 * longer than `singleRow` gets one row.
 */
export const SEAT_LAYOUT = {
  rowSpacing: 1.6, rowBack: 0.48, screen: 0.82, singleRow: 1.05,
  column: 1.07, sidePitch: 0.5, sideRow: 6, flexMin: 1.2, flexLength: 1.5,
};

export const CROWD_LAYOUT = {
  seatedForwardOffset: 0.04,
  count: 20,
  waitingZ: 3.05,
  walkingZ: 2.2,
  halfWalk: 52,
  speed: 0.65,
  visibleDistance: 150,
};

/** Keep sign faces outside their housings and the most protruding rock. */
export const SIGN_LAYOUT = { faceGap: 0.015, displayHalfDepth: 0.05, rockClearance: 0.12 };
export const STATION_ROCK_INSET = 0.85;

/** Repeated station fixtures, kept clear of the boarding paths. */
export const STATION_DESIGN = {
  lightingY: 4.5,
  lightingZ: 3.25,
  pierXs: [-56, -28, 0, 28, 56],
  pierHalfX: 1.7,
  pierHalfZ: 0.8,
  corniceY: 4.9,
  nameBoardY: 3.05,
  nameBoardZ: CAVE_HALF_W - STATION_ROCK_INSET - SIGN_LAYOUT.rockClearance,
  displayY: 3.65,
  galleryZ: 1.1,
  birdY: 5.7,
  birdHalfSpan: 1.65,
  portalRim: 0.38,
};

/** Passenger interaction and restrained camera suspension. */
export const RIDE_LAYOUT = {
  seatReach: 1.6,
  seatedEye: 1.25,
  swayAngle: 0.008,
  accelerationLean: 0.009,
  bounce: 0.012,
  railSpacing: 12.5,
};

export const COMMUTER_LAYOUT = {
  doorIndices: [2, 7, 12, 17],
  cabinZ: 0.65,
  waitZ: 3.3,
  waitOffsetX: 1.25,
  exitStart: 2.1,
  exitDuration: 1.8,
  boardStart: 4.7,
  boardDuration: 2.4,
  stagger: 0.2,
};

/**
 * The wall down the middle of a split island (`look.split`): two platform tunnels, one per track, joined by a middle
 * vault and cross passages. The openings stand where the island's middle carries benches, pillars, clocks, signs and
 * displays, so nothing moves; `end` is where the wall stops toward each platform end.
 */
export const SPLIT = {
  half: 0.6,
  openings: [[-20, 20], [-53, -37], [37, 53]] as ReadonlyArray<readonly [number, number]>,
  end: 60,
};

/** An open-air platform's roof (`world/canopy.ts`): its height, reach and posts. */
export const CANOPY = {
  /** The roof's underside, just over the lamp rail. */
  y: STATION_DESIGN.lightingY + 0.3,
  thick: 0.22,
  /** Half its width across the island. */
  halfW: 4.3,
  /** How far a butterfly's wings or a gable's ridge rise over the eaves. */
  pitch: 0.55,
  postHalf: 0.12,
  /** Where its posts stand along the island, from the middle: clear of the benches, pillars, signs and displays. */
  postXs: [-66, -56, -34, -22, 0, 22, 34, 56, 66],
  /** Beyond the roof, lamp posts carrying the lamp rail and two lanterns each, this far apart. */
  lanternStep: 12,
  /** A concrete deck over the whole station (a town centre built over the tracks): its underside. */
  deckY: 6.2,
  /** A cutting's walls: how far beyond the fences they stand, and the length of each block of rock. */
  cutGap: 1.5,
  cutStep: 2,
};
