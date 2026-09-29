import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, Object3D, Points, PointsMaterial, Sphere, Vector3 } from 'three';
import { CAVE_HALF_L, COMMUTER_LAYOUT, CROWD_LAYOUT as C, DOOR_XS, ESC_DESIGN, ESC_RISE, PLATFORM_Y, RIDE_LAYOUT, TRAIN_HALF_L, type Stock } from './layout';
import { commuterPoses, type CrowdService } from './commuters';
import { hash01, type Season } from './clock';
import type { Occasion } from './calendar';
import { escalatorHeight, escalatorRun } from './escalatorMotion';
import { drawCount, drawFigure, figureMesh, hideFigure, paintFigure, PARTS, phoneScreen, type Carry, type FigureLook, type FigurePose } from './figures';
import { glowTexture } from './gfx/textures';
import { cabinSeats, sitterYaw } from './journey';
import type { SeatStyle } from './trainModel';
import { carrierGeometry, dogGeometry, pramGeometry, propMaterial, suitcaseGeometry, type DogBuild } from './props';

const coats = [0x304052, 0x916b4d, 0x52645a, 0x753e45, 0xc0b5a2, 0x232933];
const summer = [0x6d8fb3, 0xe0d7c3, 0x7fa37a, 0xc76a5a, 0xf2efe6, 0x44546a];
const skins = [0xdba987, 0x946747, 0xe8bd9b, 0x634432];
/** Brown, dark brown, blond, black, red and grey. */
const hairs = [0x382a25, 0x8a7052, 0xd9c27a, 0x1c1a19, 0x9c4a2a, 0xb8b2aa];
const skirts = [0x2b2f3a, 0x7a2e3a, 0x3f5a4a, 0xc9a472, 0x5a4a7a];
const handbags = [0x6b2430, 0x1b1d22, 0xa0522d, 0xd4a373];
const hats = [0xb3362f, 0x1f2c48, 0x8a8f94, 0x2f5a44];
/** Crayfish party paper hats. */
const paperHats = [0xe63946, 0xf4d35e, 0x3a86ff];
const sporty = [0x2ec4b6, 0xff5e5b, 0x3a86ff];
/** Glitter in the hair on a Saturday night. */
const glitter = [0xf2d16b, 0xff5fa2, 0xc0c8d8, 0x9b5de5];
const balloons = [0xe63946, 0x3a86ff, 0xf4d35e, 0x2ec4b6, 0xf15bb5];

export interface CrowdConditions {
  /** 0 = empty night, 1 = rush hour. */
  busy: number;
  season: Season;
  /** Rain or snow outside: umbrellas come down into the metro. */
  wet: boolean;
  /** An SMHI warning for rain, snow or thunder: most passengers come down wet. */
  storm?: boolean;
  /** What today brings: Friday bags, cinnamon buns, crayfish parties or a quiet Sunday. */
  occasion?: Occasion;
  /** July: stuffy carriages, fanning with newspapers. */
  heat?: boolean;
  /** The summer timetable: the city is half empty and tourists with maps and sun hats take over. */
  tourists?: boolean;
  /** The time machine's 1975: brown, mustard and orange, and newspapers instead of phones. */
  past?: boolean;
}

const seventies = [0x6b4a2e, 0xc9a13a, 0xd9772b, 0x5a6b2e, 0x7a2e2e, 0xe2d2b0];

/** Tourists, on the summer timetable: every third passenger. */
export const isTourist = (i: number, conditions?: CrowdConditions) => !!conditions?.tourists && i % 3 === 0;

/** Station roles, by figure index. */
const JOGGER = 0;
const FLOWERS = 1;
const DOG_OWNER = 2;
const CHILD = 4;
const PARENT = 8;
const PRAM_OWNER = 14;
/** A second child, walking hand in hand with a parent on the move. */
const CHILD2 = 16;
const PARENT2 = 9;

/** Who brings which pet, per station: dogs, and a cat or rabbit in a carrier. Walkers take their dogs along. */
type Pet = { owner: number; kind: DogBuild | 'cat' | 'rabbit' };
const DOG_COATS = [0xa8743f, 0x1d1b1a, 0xe9dcc4, 0x6b4a2b, 0x9a9a98, 0xd9a55c];
export function petsFor(station: number): Pet[] {
  const r = (salt: number) => hash01(station, salt);
  const dogs: DogBuild[] = ['medium', 'small', 'large'];
  const pets: Pet[] = [{ owner: DOG_OWNER, kind: dogs[Math.floor(r(51) * 3)] }, { owner: 6, kind: dogs[Math.floor(r(52) * 3)] }];
  if (r(53) < 0.6) pets.push({ owner: 11, kind: r(54) < 0.65 ? 'cat' : 'rabbit' });
  if (r(55) < 0.5) pets.push({ owner: 15, kind: 'small' });
  return pets;
}

/** What passenger `i` carries today, if anything. */
export function carryFor(i: number, conditions?: CrowdConditions): Carry | undefined {
  switch (conditions?.occasion) {
    case 'friday': if (i % 4 === 1) return 'bag'; break;
    case 'buns': if (i % 3 === 2) return 'bag'; break;
    case 'crayfish': if (i % 4 === 1) return 'lantern'; break;
    case 'sunday': if (i === FLOWERS) return 'flowers'; break;
    case 'graduation': if (i % 4 === 0) return 'balloon'; break;
  }
  if (isTourist(i, conditions) && i % 2 === 0) return 'map';
  if (conditions?.storm) return i % 3 !== 0 ? 'umbrella' : undefined;
  return conditions?.wet && i % 3 === 1 ? 'umbrella' : undefined;
}

/** Clothing for passenger `i`, dressed for the season and the day. */
export function passengerLook(i: number, seed: number, conditions?: CrowdConditions): FigureLook {
  const k = i + seed;
  const warm = conditions?.season === 'summer';
  const cold = conditions?.season === 'winter';
  // Who this is, the same every day: build, hair, skirt, what they carry on the back and in the hand.
  const r = (salt: number) => hash01(i * 97 + seed * 13, salt);
  const woman = r(1) < 0.5;
  const look: FigureLook = {
    coat: (warm ? summer : coats)[k % coats.length],
    skin: skins[k % skins.length],
    hair: cold && k % 2 === 0 ? hats[(k >> 1) % hats.length] : hairs[Math.floor(r(6) * hairs.length)],
    bag: 0x293338,
    trousers: warm && k % 3 === 0 ? 0x8f8a7c : 0x303a48,
    shoes: 0x242629,
    prop: k % 2 ? 0x1b1d22 : 0x6b2430,
    build: woman ? 'woman' : 'man',
    long: woman && r(2) < 0.75,
    back: r(4) < 0.4 ? 'backpack' : r(4) < 0.96 ? 'none' : 'guitar',
  };
  if (woman && r(3) < 0.35) {
    look.skirt = skirts[Math.floor(r(7) * skirts.length)];
    look.legs = warm ? look.skin : 0x2a2a30;
  }
  if (look.back === 'guitar') look.bag = 0x1b1b1b;
  const everyday = r(5);
  const own: Carry | undefined = woman
    ? (everyday < 0.45 ? 'handbag' : everyday < 0.55 ? 'shopping' : everyday < 0.63 ? 'coffee' : everyday < 0.66 ? 'bluebag' : undefined)
    : (everyday < 0.14 ? 'briefcase' : everyday < 0.22 ? 'shopping' : everyday < 0.3 ? 'coffee' : everyday < 0.33 ? 'bluebag' : undefined);
  // No coffee to go in 1975.
  look.carry = conditions?.past && own === 'coffee' ? undefined : own;
  if (look.carry === 'handbag') look.prop = handbags[Math.floor(r(8) * handbags.length)];
  if (look.carry === 'briefcase') look.prop = 0x3a2a1c;
  if (look.carry === 'shopping') look.prop = 0xc9a472;
  if (look.carry === 'bluebag') look.prop = 0x1f5fbf;
  if (look.carry === 'coffee') look.prop = 0xf1ede4;
  const carry = carryFor(i, conditions);
  // Today's own thing (an umbrella, a Friday bag, flowers) takes the hand.
  if (carry) look.carry = carry;
  const occasion = conditions?.occasion;
  if (occasion === 'crayfish' && k % 3 === 0) look.hair = paperHats[k % paperHats.length];
  if (carry === 'bag') look.prop = occasion === 'buns' ? 0xe9d9b8 : 0xc9a472;
  if (carry === 'lantern') look.prop = 0xf2a93b;
  if (carry === 'flowers') look.prop = 0xd6336c;
  if (carry === 'balloon') look.prop = balloons[k % balloons.length];
  // Students in white caps and white dresses or dark suits.
  if (occasion === 'graduation' && i % 4 === 0) Object.assign(look, { hair: 0xf6f6f2, coat: k % 2 ? 0xf2f2ee : 0x1d2230, torso: k % 2 ? 0xf2f2ee : 0xf2f2ee });
  if (occasion === 'party' && k % 2 === 0) look.hair = glitter[k % glitter.length];
  if (conditions?.past) {
    look.coat = seventies[k % seventies.length];
    look.trousers = k % 2 ? 0x3b4a6b : 0x5a3b22;
    if (k % 4 === 1) look.hair = 0x2a1d14;
  }
  if (isTourist(i, conditions)) {
    // Bright rain jackets, sun hats and big backpacks.
    look.coat = [0xf4d35e, 0xe63946, 0x3a86ff, 0x2ec4b6][k % 4];
    if (k % 2) look.hair = 0xd9c27a;
    look.bag = [0xe76f51, 0x264653, 0x6a4c93][k % 3];
    look.back = 'backpack';
    if (carry === 'map') look.prop = 0xf1ecd9;
  }
  return look;
}

/** Waiting passengers stay behind the tactile line; walkers use clear parallel lanes. */
export function crowdPose(index: number, time: number): { x: number; z: number; yaw: number; walking: boolean } {
  const side = index % 2 ? -1 : 1;
  const walking = index % 3 === 0;
  if (!walking) return { x: -63 + index * 6.6, z: side * C.waitingZ, yaw: side > 0 ? 0 : Math.PI, walking };
  const span = C.halfWalk * 2;
  const distance = ((time * C.speed + index * 17) % (span * 2) + span * 2) % (span * 2);
  const forward = distance < span;
  return { x: -C.halfWalk + (forward ? distance : span * 2 - distance), z: side * C.walkingZ, yaw: forward ? Math.PI / 2 : -Math.PI / 2, walking };
}

/**
 * A Sunday jogger: along the platform to the exit end, then up the up
 * escalator two steps at a time, and gone. Local to the station center:
 * the escalator starts at `foot` (at the end wall without one), and one
 * that climbs up to the platform from a hall below it has no jogger.
 */
export function joggerPose(time: number, exitDir: 1 | -1, esc: { rise: number; run: number; foot?: number; base?: number }): FigurePose | null {
  if (esc.base !== undefined && esc.base < PLATFORM_Y) return null;
  const period = 150;
  const run = 3.6;
  const t = ((time % period) + period) % period;
  const foot = esc.foot ?? exitDir * CAVE_HALF_L;
  const start = -exitDir * 58;
  const wall = foot - exitDir * 0.6;
  const platform = Math.abs(wall - start) / run;
  const yaw = exitDir * Math.PI / 2;
  if (t < platform) {
    const x = start + exitDir * t * run;
    // Veer from the walking lane onto the up lane just before the escalator.
    const toLane = Math.min(1, Math.max(0, (Math.abs(x - start) - (Math.abs(wall - start) - 8)) / 8));
    return { x, z: C.walkingZ + (ESC_DESIGN.laneCenter - C.walkingZ) * toLane, yaw, walking: true, running: true };
  }
  const along = (t - platform) * 1.9;
  if (along > esc.run) return null;
  return { x: foot + exitDir * along, y: escalatorHeight(along, esc.rise), z: ESC_DESIGN.laneCenter, yaw, walking: true, running: true };
}

/** Around a whole train, in its own frame: everyone aboard is inside it. */
const aboardBounds = new Sphere(new Vector3(0, PLATFORM_Y + 1, 0), TRAIN_HALF_L + 3);

export type PassengerPose = FigurePose;

/** What the crowd needs of a train: where to put its passengers, and how it is laid out and furnished. */
export interface CrowdTrain {
  group: Group;
  stock: Stock;
  readonly seating: SeatStyle;
}

/** How many seats along there are per seated passenger. */
const PASSENGER_SPREAD = 7;

/** Occupy actual seat centers, with a sparse distribution and a clear center aisle. */
export function trainPassengerPoses(style: SeatStyle = 'c20'): PassengerPose[] {
  // One seat in every few has someone in it, so nobody sits right beside anyone.
  return cabinSeats(style).filter((_, index) => index % PASSENGER_SPREAD === 0).map((seat) => (
    { x: seat.x, z: seat.z, yaw: sitterYaw(seat), walking: false, seated: true }
  ));
}

/** The passenger dozing against the window, on a seat the others leave free. */
export function sleeperPose(style: SeatStyle = 'c20'): PassengerPose {
  const taken = trainPassengerPoses(style);
  const free = cabinSeats(style).filter((s) => !taken.some((p) => Math.abs(p.x - s.x) < 0.2 && Math.abs(p.z - s.z) < 0.2));
  const seat = free[Math.min(free.length - 1, 9)];
  return { x: seat.x, z: seat.z, yaw: sitterYaw(seat), walking: false, seated: true };
}

const occupied = new Map<SeatStyle, PassengerPose[]>();

/** Every seat a passenger figure occupies, so the player is never offered it. */
export function occupiedSeatPoses(style: SeatStyle = 'c20'): PassengerPose[] {
  let poses = occupied.get(style);
  if (!poses) {
    poses = [...trainPassengerPoses(style), sleeperPose(style)];
    occupied.set(style, poses);
  }
  return poses;
}

/** Seated passengers with a phone light up blue in the dark tunnel. */
const hasPhone = (i: number) => i % 3 === 1;
/** In July some fan themselves with the free newspaper. */
const fans = (i: number) => i % 3 === 2;

/** A point on a figure, from its local coordinates. */
function figurePoint(pose: FigurePose, lx: number, ly: number, lz: number): [number, number, number] {
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  return [pose.x + lx * c + lz * s, (pose.y ?? PLATFORM_Y) + ly, pose.z - lx * s + lz * c];
}

let phoneMaterial: PointsMaterial | null = null;

function phoneGlows(seats: PassengerPose[]): Points {
  // The soft sprite needs a canvas; headless tests build crowds without one.
  phoneMaterial ??= new PointsMaterial({ size: 0.28, map: typeof document === 'undefined' ? null : glowTexture(), vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false });
  const position: number[] = [];
  const color: number[] = [];
  seats.forEach((pose, i) => {
    if (!hasPhone(i)) return;
    // The screen in the hand, and its blue light on the face above it.
    position.push(...figurePoint(pose, ...phoneScreen(true)));
    color.push(0.55, 0.75, 1);
    position.push(...figurePoint(pose, 0.06, 1.3, 0.16));
    color.push(0.12, 0.24, 0.5);
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(position, 3));
  geo.setAttribute('color', new Float32BufferAttribute(color, 3));
  const points = new Points(geo, phoneMaterial);
  points.name = 'phone-glow';
  return points;
}

interface StationCrowd {
  x: number;
  index: number;
  exitDir: 1 | -1;
  /** Its escalators' climb and reach, for the jogger. */
  escalator: { rise: number; run: number; foot?: number; base?: number };
  mesh: InstancedMesh;
  seed: number;
  /** Pets beside their owners; a walker's dog trots along. */
  pets: Array<{ owner: number; mesh: Mesh; carrier: boolean }>;
  pram: Mesh;
  suitcases: InstancedMesh | null;
  /** How busy this station is next to the line's typical one, from real boardings (`ridership` in `line.ts`). */
  weight: number;
  /** How many of its passengers are waiting right now. */
  shown: number;
}

interface TrainCrowd {
  host: Group;
  /** Its stock and furnishing, which set where its passengers sit and stand. */
  train: CrowdTrain;
  seats: PassengerPose[];
  sleeper: PassengerPose;
  mesh: InstancedMesh;
  commuters: InstancedMesh;
  /** The child at the front, two standing passengers and the sleeper. */
  extras: InstancedMesh;
  pram: Mesh;
  /** A dog lying by the doors on some trains. */
  dog: Mesh | null;
  phones: Points;
  rail: number;
  bump: number;
}

/** Decorative passengers, one instanced draw per visible station or train. */
export class Crowd {
  readonly group = new Group();
  private readonly stations: StationCrowd[] = [];
  private readonly trains: TrainCrowd[] = [];
  private readonly matrix = new Matrix4();
  private readonly dummy = new Object3D();
  private clock = 0;
  private conditions: CrowdConditions | undefined;

  /**
   * @param suitcaseStation the station whose walkers pull rolling suitcases (T-Centralen, for the Arlanda Express)
   * @param weights per station, how busy it is next to the line's typical station (1)
   * @param platforms per station, the middle of each island platform (a shared station has two); the crowd waits on the last
   * @param escalators per station, how far its escalators climb and reach
   */
  constructor(stationX: number[], trains: CrowdTrain[] = [], exitDirs: Array<1 | -1> = [], suitcaseStation = -1, weights: number[] = [], private readonly platforms: number[][] = [], escalators: Array<{ rise: number; run: number; foot?: number; base?: number }> = []) {
    this.group.name = 'passengers';
    this.group.visible = false;
    const makeMesh = (count: number, seed: number) => {
      const mesh = figureMesh(count);
      for (let i = 0; i < count; i++) paintFigure(mesh, i, passengerLook(i, seed));
      return mesh;
    };
    // Pet geometry is shared: a few coats of each kind of dog, and the two carriers.
    const petGeos = new Map<string, BufferGeometry>();
    const petGeo = (kind: Pet['kind'], coat: number) => {
      const key = `${kind}:${coat}`;
      let geo = petGeos.get(key);
      if (!geo) petGeos.set(key, (geo = kind === 'cat' || kind === 'rabbit' ? carrierGeometry(kind, coat) : dogGeometry(coat, kind)));
      return geo;
    };
    const pramGeo = pramGeometry();
    stationX.forEach((x, station) => {
      const mesh = makeMesh(C.count, station);
      mesh.position.x = x;
      mesh.position.z = platforms[station]?.[platforms[station].length - 1] ?? 0;
      const pets = petsFor(station).map(({ owner, kind }, n) => {
        const coats = kind === 'cat' ? [0xd98c3a, 0x2a2826, 0x8f8a84] : kind === 'rabbit' ? [0xf4f1ea, 0x9c7b5a] : DOG_COATS;
        const pet = new Mesh(petGeo(kind, coats[Math.floor(hash01(station * 7 + n, 56) * coats.length)]), propMaterial());
        mesh.add(pet);
        return { owner, mesh: pet, carrier: kind === 'cat' || kind === 'rabbit' };
      });
      const pram = new Mesh(pramGeo, propMaterial());
      const parent = crowdPose(PRAM_OWNER, 0);
      pram.position.set(parent.x - 0.95, PLATFORM_Y, parent.z + 0.1);
      pram.rotation.y = -Math.PI / 2;
      mesh.add(pram);
      let suitcases: InstancedMesh | null = null;
      if (station === suitcaseStation) {
        suitcases = new InstancedMesh(suitcaseGeometry(), propMaterial(), Math.ceil(C.count / 3));
        suitcases.frustumCulled = false;
        mesh.add(suitcases);
      }
      this.stations.push({ x, index: station, exitDir: exitDirs[station] ?? 1, escalator: escalators[station] ?? { rise: ESC_RISE, run: escalatorRun(ESC_RISE) }, mesh, seed: station, pets, pram, suitcases, weight: weights[station] ?? 1, shown: C.count });
      this.group.add(mesh);
    });
    // Room for the passengers of any stock and furnishing (see `setSeating`).
    const capacity = Math.max(...(['c20', 'classic', 'c30', 'classic30'] as const).map((style) => trainPassengerPoses(style).length));
    trains.forEach((train, index) => {
      const host = train.group;
      const seats = trainPassengerPoses(train.seating);
      const doorNear = (x: number) => train.stock.doors.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
      const mesh = makeMesh(capacity, index + 4);
      drawCount(mesh, seats.length);
      mesh.name = 'onboard-passengers';
      // Aboard, everyone stays inside the train: one sphere around it bounds them, so a train behind you costs nothing.
      mesh.frustumCulled = true;
      mesh.boundingSphere = aboardBounds;
      seats.forEach((pose, i) => drawFigure(mesh, i, pose, this.clock));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = false;
      host.add(mesh);
      const extras = makeMesh(4, index + 30);
      extras.name = 'onboard-extras';
      extras.frustumCulled = true;
      extras.boundingSphere = aboardBounds;
      extras.visible = false;
      host.add(extras);
      const pram = new Mesh(pramGeo, propMaterial());
      pram.position.set(doorNear(DOOR_XS[10]) - 0.05, PLATFORM_Y, -1.02);
      pram.visible = false;
      host.add(pram);
      const phones = phoneGlows(seats);
      phones.visible = false;
      host.add(phones);
      // Every third train has a dog standing by the doors, out of the way of the seats.
      let dog: Mesh | null = null;
      if (index % 3 === 1) {
        dog = new Mesh(petGeo(index % 2 ? 'large' : 'medium', DOG_COATS[index % DOG_COATS.length]), propMaterial());
        dog.position.set(doorNear(DOOR_XS[5]) - 0.2, PLATFORM_Y, 0.85);
        dog.rotation.y = 0;
        dog.scale.y = 0.75;
        dog.visible = false;
        host.add(dog);
      }
      const commuters = makeMesh(COMMUTER_LAYOUT.doorIndices.length * 2, index + 20);
      commuters.name = 'boarding-passengers';
      commuters.visible = false;
      this.group.add(commuters);
      this.trains.push({ host, train, seats, sleeper: sleeperPose(train.seating), mesh, commuters, extras, pram, dog, phones, rail: 0, bump: 0 });
    });
  }

  /** The trains' seated passengers move to the seats of the stock they run: the renovated C20 or the time machine's older cars. */
  setSeating(): void {
    for (const t of this.trains) {
      t.seats = trainPassengerPoses(t.train.seating);
      t.sleeper = sleeperPose(t.train.seating);
      drawCount(t.mesh, t.seats.length);
      t.seats.forEach((pose, i) => drawFigure(t.mesh, i, pose, this.clock));
      t.mesh.instanceMatrix.needsUpdate = true;
      // The phone glows follow the passengers to their new seats.
      const phones = phoneGlows(t.seats);
      phones.visible = t.phones.visible;
      t.phones.geometry.dispose();
      t.phones.removeFromParent();
      t.host.add(phones);
      t.phones = phones;
    }
  }

  setEnabled(enabled: boolean): void {
    this.group.visible = enabled;
    if (!enabled) for (const t of this.trains) { t.mesh.visible = t.extras.visible = t.pram.visible = t.phones.visible = false; if (t.dog) t.dog.visible = false; }
  }

  /** How many people wait on each platform, and what they wear and carry. */
  setConditions(conditions: CrowdConditions): void {
    const previous = this.conditions;
    this.conditions = conditions;
    for (const st of this.stations) {
      const count = Math.round(2 + (C.count - 2) * Math.min(1, Math.max(0, conditions.busy * st.weight)));
      // A Sunday morning: almost empty.
      st.shown = conditions.occasion === 'sunday' ? Math.min(count, 4) : count;
    }
    if (previous && previous.season === conditions.season && previous.occasion === conditions.occasion && previous.wet === conditions.wet && previous.storm === conditions.storm && previous.heat === conditions.heat && previous.tourists === conditions.tourists && previous.past === conditions.past) return;
    const sunday = conditions.occasion === 'sunday';
    for (const { mesh, seed } of this.stations) {
      for (let i = 0; i < C.count; i++) {
        const look = passengerLook(i, seed, conditions);
        if (i === CHILD) Object.assign(look, { coat: 0xe63946, hair: 0xf4d35e, trousers: 0x3a86ff, build: 'child', long: seed % 2 === 0, back: 'backpack', bag: 0x2ec4b6, carry: undefined, skirt: undefined, legs: undefined });
        if (i === CHILD2) Object.assign(look, { coat: [0x3a86ff, 0xf4a261, 0x2ec4b6][seed % 3], hair: hairs[seed % 3], trousers: 0x303a48, build: 'child', long: seed % 2 === 1, back: 'none', carry: undefined, skirt: undefined, legs: undefined });
        if (sunday && i === JOGGER) Object.assign(look, { coat: sporty[seed % 3], torso: sporty[(seed + 1) % 3], trousers: 0x1b1d22, hair: 0x2b2b2b, bag: sporty[seed % 3] });
        paintFigure(mesh, i, look);
      }
    }
    this.trains.forEach(({ mesh, commuters, extras }, index) => {
      for (let i = 0; i < mesh.instanceMatrix.count; i++) {
        const look = passengerLook(i, index + 4, conditions);
        if (conditions.heat && fans(i)) look.prop = 0xe8e4da;
        paintFigure(mesh, i, look);
      }
      for (let i = 0; i < COMMUTER_LAYOUT.doorIndices.length * 2; i++) paintFigure(commuters, i, passengerLook(i, index + 20, conditions));
      for (let i = 0; i < 4; i++) paintFigure(extras, i, passengerLook(i, index + 30, conditions));
      paintFigure(extras, 0, { ...passengerLook(0, index + 30, conditions), coat: 0xf4a261, hair: 0x8a5a36, trousers: 0x3a86ff, build: 'child', back: 'none', carry: undefined, skirt: undefined, legs: undefined });
    });
  }

  update(dt: number, playerX: number, services?: Array<CrowdService | null>): void {
    if (!this.group.visible) return;
    this.clock += dt;
    const conditions = this.conditions;
    const heat = conditions?.heat ?? false;
    const sunday = conditions?.occasion === 'sunday';

    // Which stations see a train pull out of track 2, the child's side, right now (for the waving child).
    const departing = new Set<number>();
    if (services) {
      for (const svc of services) {
        if (!svc) continue;
        const timetable = svc.timetable;
        const stop = timetable.stops[svc.state.stop];
        if (stop.kind !== 'station' || stop.track !== 2) continue;
        const leaving = svc.state.phase === 'closing' || svc.state.phase === 'waiting' || (svc.state.phase === 'moving' && Math.abs(svc.state.x - timetable.stationX[stop.station]) < 150);
        if (leaving) departing.add(stop.station);
      }
    }

    for (const st of this.stations) {
      const { x, mesh } = st;
      mesh.visible = Math.abs(x - playerX) < C.visibleDistance && st.shown > 0;
      if (!mesh.visible) continue;
      const shown = (i: number) => i < st.shown;
      let suitcase = 0;
      let last = -1;
      for (let i = 0; i < C.count; i++) {
        const child2 = i === CHILD2;
        if ((!shown(i) && !child2) || (i === CHILD && !shown(PARENT)) || (child2 && !shown(PARENT2))) { hideFigure(mesh, i); continue; }
        const carry = carryFor(i, conditions);
        let pose: FigurePose = { ...crowdPose(i, this.clock), carry };
        if (i === CHILD) {
          const parent = crowdPose(PARENT, this.clock);
          pose = { ...pose, x: parent.x + 0.75, z: parent.z, scale: 0.6, arm: departing.has(st.index) ? 'wave' : undefined, look: departing.has(st.index) ? 0.6 : undefined };
        }
        if (child2) {
          // Hand in hand, on the parent's right.
          const parent = crowdPose(PARENT2, this.clock);
          const [cx, , cz] = figurePoint(parent, 0.5, 0, 0.05);
          pose = { ...parent, x: cx, z: cz, scale: 0.58 };
        }
        if (sunday && i === JOGGER) {
          const jog = joggerPose(this.clock + st.index * 37, st.exitDir, st.escalator);
          if (!jog) { hideFigure(mesh, i); continue; }
          pose = jog;
        }
        this.draw(mesh, i, pose);
        last = i;
        // Rolling suitcases behind the walkers heading for the airport train.
        if (st.suitcases && pose.walking && !(sunday && i === JOGGER)) {
          const dir = Math.sin(pose.yaw);
          // Pulled in the right hand, leaning toward whoever pulls it.
          this.dummy.position.set(pose.x - dir * 0.62, PLATFORM_Y, pose.z - dir * 0.22);
          this.dummy.rotation.set(0, pose.yaw - Math.PI / 2, -0.22);
          this.dummy.updateMatrix();
          st.suitcases.setMatrixAt(suitcase++, this.dummy.matrix);
        }
      }
      if (st.suitcases) {
        this.matrix.makeScale(0, 0, 0);
        for (let k = suitcase; k < st.suitcases.count; k++) st.suitcases.setMatrixAt(k, this.matrix);
        st.suitcases.instanceMatrix.needsUpdate = true;
      }
      for (const pet of st.pets) {
        pet.mesh.visible = shown(pet.owner) && !(sunday && pet.owner === JOGGER);
        if (!pet.mesh.visible) continue;
        const owner = crowdPose(pet.owner, this.clock);
        // A dog walks a little ahead on the owner's left; a carrier stands on the floor beside them.
        const [px, , pz] = figurePoint(owner, pet.carrier ? 0.5 : -0.75, 0, pet.carrier ? 0.05 : owner.walking ? 0.55 : 0.1);
        pet.mesh.position.set(px, PLATFORM_Y + (owner.walking ? Math.abs(Math.sin(this.clock * 7 + pet.owner)) * 0.025 : 0), pz);
        // Dogs look where their owner looks; a carrier stands side on, its barred front along the platform.
        pet.mesh.rotation.y = owner.yaw - (pet.carrier ? 0 : Math.PI / 2);
      }
      st.pram.visible = shown(PRAM_OWNER) && !sunday;
      drawCount(mesh, last + 1);
      mesh.instanceMatrix.needsUpdate = true;
    }

    const cabX = TRAIN_HALF_L - 2.3;
    this.trains.forEach((t, index) => {
      const { host, mesh, commuters, extras } = t;
      const distance = Math.abs(host.position.x - playerX);
      const near = host.visible && distance < C.visibleDistance + TRAIN_HALF_L;
      mesh.visible = extras.visible = near;
      t.phones.visible = near && !conditions?.past;
      t.pram.visible = near && index % 2 === 0;
      if (t.dog) t.dog.visible = near;
      const service = services?.[index];
      // Out of service, or too far off for anyone aboard or getting off to be seen: nothing more to work out.
      if (!host.visible || distance > C.visibleDistance + TRAIN_HALF_L + 60) { commuters.visible = false; return; }
      // Heading and acceleration along the track, for the child at the front and the standing passengers.
      let heading = 1;
      let along = 0;
      if (service) {
        const timetable = service.timetable;
        const st = service.state;
        heading = timetable.stops[st.phase === 'moving' ? st.next : st.stop].track === 1 ? 1 : -1;
        if (near) along = (timetable.stateAt(service.time + 0.1).speed - st.speed) / 0.1 * heading;
        const rail = Math.floor(st.u / RIDE_LAYOUT.railSpacing);
        if (rail !== t.rail && st.speed > 1) t.bump = 1;
        t.rail = rail;
      }
      t.bump = Math.max(0, t.bump - dt * 6);
      if (near) {
        // A seated passenger occasionally looks around or nods off. Some are on their phones, and in July some fan themselves.
        // In 1975 the ones on their phones read the paper instead.
        const past = conditions?.past ?? false;
        t.seats.forEach((pose, i) => this.draw(mesh, i, heat && fans(i) ? { ...pose, arm: 'fan', carry: 'paper' } : hasPhone(i) ? { ...pose, arm: 'phone', carry: past ? 'paper' : 'phone' } : pose));
        mesh.instanceMatrix.needsUpdate = true;
        const inertia = Math.max(-0.16, Math.min(0.16, -along * 0.07));
        this.draw(extras, 0, { x: heading * (cabX - 0.45), z: -0.3, yaw: heading * Math.PI / 2, walking: false, scale: 0.6, arm: 'phone', carry: past ? 'paper' : 'phone', look: Math.sin(this.clock * 0.7) * 0.3 });
        const doors = t.train.stock.doors;
        const doorNear = (x: number) => doors.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
        this.draw(extras, 1, { x: doorNear(DOOR_XS[5]) + 1.05, z: 0.22, yaw: Math.PI / 2, walking: false, arm: 'hold', sway: inertia + Math.sin(this.clock * 0.9) * 0.01 });
        this.draw(extras, 2, { x: doorNear(DOOR_XS[10]) - 0.95, z: -0.35, yaw: Math.PI / 2, walking: false, sway: inertia * 0.7 });
        if (index % 2) hideFigure(extras, 2);
        // The sleeper's head rests on the glass and knocks gently at every rail joint.
        const window = Math.sign(-Math.sin(t.sleeper.yaw) * t.sleeper.z) || 1;
        this.draw(extras, 3, { ...t.sleeper, lean: window * (0.42 + t.bump * 0.1 * Math.sin(t.bump * 20)) });
        extras.instanceMatrix.needsUpdate = true;
      }
      if (!service) { commuters.visible = false; return; }
      const poses = commuterPoses({ ...service, doors: t.train.stock.doors }, (station, z) => (this.platforms[station] ?? [0]).reduce((best, p) => (Math.abs(p - z) < Math.abs(best - z) ? p : best)));
      commuters.visible = poses.some((pose) => pose.visible && Math.abs(pose.x - playerX) < C.visibleDistance);
      if (!commuters.visible) return;
      let lastCommuter = -1;
      poses.forEach((pose, i) => {
        if (pose.visible) { this.draw(commuters, i, { ...pose, carry: carryFor(i, conditions) }); lastCommuter = i; }
        else {
          this.matrix.makeScale(0, 0, 0);
          for (let p = 0; p < PARTS; p++) commuters.setMatrixAt(i * PARTS + p, this.matrix);
        }
      });
      drawCount(commuters, lastCommuter + 1);
      commuters.instanceMatrix.needsUpdate = true;
    });
  }

  /**
   * Where a few of the passengers near the player hold their phones, in world space, nearest first: the waiting
   * passengers of the nearest station, or the seated ones of `train` when the player rides it. For torches in a
   * power cut.
   */
  holders(playerX: number, count: number, train: Group | null = null): Array<{ x: number; y: number; z: number; yaw: number }> {
    if (!this.group.visible) return [];
    const out: Array<{ x: number; y: number; z: number; yaw: number }> = [];
    if (train) {
      const v = new Vector3();
      for (const seat of this.trains.find((t) => t.host === train)?.seats ?? []) {
        v.set(seat.x + Math.sin(seat.yaw) * 0.3, PLATFORM_Y + 0.95, seat.z + Math.cos(seat.yaw) * 0.3);
        train.localToWorld(v);
        out.push({ x: v.x, y: v.y, z: v.z, yaw: seat.yaw + train.rotation.y });
      }
    } else {
      let st: StationCrowd | null = null;
      for (const c of this.stations) if (c.mesh.visible && (!st || Math.abs(c.x - playerX) < Math.abs(st.x - playerX))) st = c;
      if (!st) return [];
      for (let i = 0; i < st.shown; i++) {
        if (i === CHILD || i === CHILD2) continue;
        const pose = crowdPose(i, this.clock);
        if (pose.walking) continue;
        out.push({ x: st.x + pose.x, y: PLATFORM_Y + 1.3, z: st.mesh.position.z + pose.z, yaw: pose.yaw });
      }
    }
    return out.sort((a, b) => Math.abs(a.x - playerX) - Math.abs(b.x - playerX)).slice(0, count);
  }

  private draw(mesh: InstancedMesh, i: number, pose: PassengerPose): void {
    drawFigure(mesh, i, pose, this.clock);
  }
}
