import { escalatorHeight, escalatorRun, escalatorSlope, onEscalatorTread } from '../escalatorMotion';
import { Box3, Group, Vector3, type InstancedMesh, type Material, type Mesh, type MeshBasicMaterial, type Object3D } from 'three';
import { rgb } from '../gfx/color';
import { withoutSigns } from '../gfx/signs';
import {
  CAVE_HALF_L,
  CAVE_HALF_W,
  LANE,
  ESC_ANGLE,
  ESC_HALF_W,
  ESC_HEADROOM,
  ESC_SPEED,
  HALL_LEN,
  PLATFORM_HALF_L,
  PLATFORM_HALF_W,
  PLATFORM_Y,
  STREET,
  UNDERPASS_DEPTH,
  TAIL_TUBE,
  CAVERN_LEN,
  TRACK_Z,
  TUBE_BOTTOM,
  TUBE_HALF_W,
  TUBE_TOP,
  TUBE_WALL_H,
} from '../layout';
import { ghostX, hallDir, isOutdoor, lineEnd, stationRise, type HallDef, type Network } from '../line';
import { buildOpenTrack, buildOpenTurnback, buildTunnelMouth, OPEN } from './outdoor';
import { OSM_HALF_X, OsmData, type OsmPatch } from './osm';
import { buildBridge, buildCity, cityAnchors } from './city';
import type { Link } from '../routes';
import { LOADING_SLICE_MS, nextFrame } from '../frames';
import type { Physics } from '../physics';
import { addTrack, buildSiding, buildTubes, buildTurnback, tubeSteps, PAINT, type TubePlace } from './parts';
import { buildGraffiti } from './graffiti';
import { Section, sharedMaterials } from './section';
import { shifted } from './shifted';
import { Walkway } from './walkway';
import { buildStation, stationSteps, type HallInfo, type ServiceDoor, type StationInfo } from './station';
import { buildServiceWing, SERVICE_DOOR, type ServiceWing } from './service';
import { buildKymlinge, kymlingeSteps, type KymlingeBuild } from './kymlinge';
import { beltVelocity, setTravelatorTime } from './travelator';
import { PASSABLE } from './incline';
import { archProfile, wallWithHoles } from './shapes';
import { inZone, type Area, type Interactable, type Zone } from './zones';

export type { Area } from './zones';

export interface Location {
  station: number | null;
  area: Area;
  /** A specific name for places off the timetable (a staff room, Kymlinge). */
  label?: string;
}

/** Runs a stepped build to the end, for what is built at start. */
function drain<T>(steps: Generator<unknown, T>): T {
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

/** Colliders are laid once, in the dry pass; the late pass builds geometry only. */
const NO_PHYSICS = { box: () => undefined, tiltedBox: () => undefined } as unknown as Physics;
/** What lights the open air besides the sky. */
const OPEN_AMBIENT = rgb(0x4a4a4a);

/** A range with pieces cut out of it. */
function without([from, to]: [number, number], cuts: Array<[number, number]>): Array<[number, number]> {
  let pieces: Array<[number, number]> = [[from, to]];
  for (const [c0, c1] of cuts) pieces = pieces.flatMap(([a, b]) => (c1 <= a || c0 >= b ? [[a, b]] : [[a, Math.max(a, c0)], [Math.min(b, c1), b]].filter(([p, q]) => q - p > 1)) as Array<[number, number]>);
  return pieces;
}

/** Geometry built when the player comes near, from x0 to x1: at once, or in steps spread over frames. */
interface Lazy {
  x0: number;
  x1: number;
  build(): void | Generator<void, unknown>;
  /** What the build added to the world, to take down again when the player is far away. */
  groups: Object3D[];
  /** Lets go of what the rest of the game was handed from the build, when it is taken down. */
  release?(): void;
  /** False while something the build needs is still on the way (a line's real buildings): it waits in the queue. */
  ready?(): boolean;
}

/** How close the player must be before a lazy stretch is built. Riding at line speed, that is almost a minute ahead. */
const BUILD_REACH = 1200;
/** How far into a tunnel the open air still reaches: its fog and light, and what is hidden from it. */
const OPEN_FADE = 40;
/** Within this along x an inclined lift is moved every frame; beyond it no one can see or ride it. */
const INCLINE_REACH = 250;
/** Rock kept between the top of a station's street stairs and the nearest open air, in meters. */
const ESCALATOR_CLEARANCE = 10;
/** Lazily built stretches this far from the player are taken down and their memory freed, to be built again on the way back. */
const EVICT_REACH = 2600;
/** Sections further than this from the player are hidden. The camera sees 185 m, so nothing visible is ever hidden. */
const SHOW_REACH = 400;
/** How far the player moves between two passes over what to show. */
const SHOW_STEP = 40;
/** Within this, a section missing is built at once, frame or no frame. */
const MUST_REACH = 150;
/** Within this, a missing section gets a few milliseconds of every frame until it is done. */
const NEAR_REACH = 400;
/** Meshes with more vertices than this are warmed on the GPU in a step of their own. */
const WARM_ALONE = 20_000;

/**
 * The whole network, as one straight corridor along x (see `routes.ts`): the
 * blue line's trunk from Kungsträdgården to Västra skogen, its branches, and
 * every other line beside it. The blue trunk is built first, in slices
 * (`World.load`). Everything else is laid out at once too (colliders, zones
 * and sign positions), but its geometry is only built when the player comes
 * near, which keeps loading and memory in check.
 */
export class World {
  readonly group = new Group();
  readonly stations: StationInfo[] = [];
  readonly stationX: number[];
  readonly zones: Zone[] = [];
  readonly interactables: Interactable[] = [];
  kymlinge!: KymlingeBuild;
  kymlingeX!: number;
  /** Passages between two lines' stations that lie apart along x. */
  readonly walkways: Walkway[] = [];
  /** Where the line runs in the open air, as ranges of x. */
  readonly openRanges: Array<[number, number]> = [];
  /** The real buildings round the stations in the open (see `osm.ts`), fetched a line at a time. */
  private readonly osm = new OsmData();
  /** The stations in the open outside the city, where real buildings may stand. */
  private readonly osmSites: Array<{ line: string; name: string; x: number }>;
  /** False at night, when the escalators stand still. */
  escalatorsRunning = true;
  private readonly liftCarry = new Vector3();
  private readonly updaters: Array<(dt: number) => void> = [];
  private readonly lazy: Lazy[] = [];
  /**
   * Uploads an object's geometry and textures to the GPU, set by whoever owns
   * the renderer, so a freshly built section does not stall its first frame.
   */
  warm: ((object: Object3D) => void) | null = null;
  /** A lazy build in progress, advanced one step per frame. */
  private building: { entry: Lazy; steps: Generator<void, unknown> } | null = null;
  /** Where the walkway the player walks in leads (`keepUp`): built ahead of them, and not taken down. */
  private ahead: number | null = null;
  /** Builds set aside half done for something nearer, to go on with afterwards. */
  private paused: Array<{ entry: Lazy; steps: Generator<void, unknown> }> = [];
  /** Lazy stretches that are built, and the one whose build step is running. */
  private readonly built: Lazy[] = [];
  private recording: Lazy | null = null;
  /** World x extent of each top-level group, for hiding what is far away. */
  private readonly extents = new Map<Object3D, [number, number]>();
  private shownAt = Number.NaN;
  private shownCount = 0;

  private constructor(readonly net: Network) {
    this.stationX = net.x;
    this.osmSites = net.stations.flatMap((def, i) => (isOutdoor(net, i) && !def.city ? [{ line: net.lines[def.line].id, name: def.name, x: net.x[i] }] : []));
  }

  /** The stations whose real buildings reach into `x0`..`x1`, or into `x0 + dx`..`x1 + dx` for a stretch built there and moved `dx` along x. */
  private osmSitesAt(x0: number, x1: number, dx = 0) {
    return this.osmSites.filter((s) => s.x + OSM_HALF_X > x0 + dx && s.x - OSM_HALF_X < x1 + dx);
  }

  /** The real buildings reaching into a stretch (see `osmSitesAt`), where it is built: those not here yet are left out. */
  private osmAt(x0: number, x1: number, dx = 0): OsmPatch[] {
    return this.osmSitesAt(x0, x1, dx).flatMap((s) => this.osm.patch(s.line, s.name, s.x - dx) ?? []);
  }

  /** For a lazy build of a stretch: are the real buildings reaching into it here? The first ask fetches them. */
  private osmReady(x0: number, x1: number, dx = 0): (() => boolean) | undefined {
    const lines = [...new Set(this.osmSitesAt(x0, x1, dx).map((s) => s.line))];
    return lines.length ? () => lines.map((l) => this.osm.ready(l)).every(Boolean) : undefined;
  }

  /** Builds the blue trunk at once. */
  static create(physics: Physics, net: Network): World {
    const world = new World(net);
    drain(world.build(physics));
    return world;
  }

  /**
   * Builds the blue trunk a slice at a time, handing control back to the
   * browser between slices so a loading screen can show `progress` (0 to 1).
   */
  static async load(physics: Physics, net: Network, progress: (fraction: number) => void, sliceMs = LOADING_SLICE_MS): Promise<World> {
    const world = new World(net);
    const steps = world.build(physics);
    let sliceStart = performance.now();
    for (;;) {
      const r = steps.next();
      if (r.done) break;
      if (typeof r.value === 'number') progress(r.value);
      if (performance.now() - sliceStart > sliceMs) {
        await nextFrame();
        sliceStart = performance.now();
      }
    }
    progress(1);
    return world;
  }

  /** Portal tunnels by the far station, where their copies are built. */
  get portals(): Link[] {
    return this.net.layout.links.filter((l) => l.portal);
  }

  /**
   * The junction a tunnel starts from, when it is one of the tunnels a portal
   * copies: its anchor station. Such tunnels share one seed and no side
   * rooms, so every copy of them matches.
   */
  private junctionOf(link: Link): number | null {
    if (link.portal) return link.portal.anchor;
    for (const p of this.portals) {
      const { anchor, dir } = p.portal!;
      if ((dir > 0 ? link.a : link.b) === anchor && link.gap === p.gap) return anchor;
    }
    return null;
  }

  /** Lays out the whole network and builds the blue trunk, yielding the fraction done after each part. */
  private *build(physics: Physics): Generator<number | void, void> {
    const net = this.net;
    const xs = this.stationX;
    // The blue trunk is built behind the loading screen; everything else when the player comes near.
    const eager = (i: number) => net.stations[i].line === 0 && !net.stations[i].branch;
    // Progress is weighed by roughly how long each part of the trunk takes to build.
    const WEIGHT = { station: 8, wing: 1, tunnel: 3, turnback: 1 };
    const eagerStations = net.stations.map((_, i) => i).filter(eager);
    const eagerLinks = net.layout.links.filter((l) => eager(l.a) && eager(l.b));
    const total = eagerStations.length * (WEIGHT.station + WEIGHT.wing)
      + eagerLinks.length * WEIGHT.tunnel + eagerStations.filter((i) => lineEnd(net, i) !== 0).length * WEIGHT.turnback;
    let done = 0;
    const part = (weight: number) => (done += weight) / total;

    // An underground station's escalator shaft, the hall at its top and the stairwell up to the street run out beyond
    // its end wall: never toward open air that starts closer than that, where the tunnel mouth and the hill above it
    // would cut through them, or they would stand over the open tracks.
    const openBeyond = new Set<string>();
    for (const link of net.layout.links) {
      if (link.portal) continue;
      const { a, b } = link;
      const x0 = xs[a] + CAVE_HALF_L;
      const x1 = xs[b] - CAVE_HALF_L;
      const reach = (i: number) => net.stations[i].openReach ?? 160;
      const stretches = this.stretches(x0, x1, isOutdoor(net, a), isOutdoor(net, b), this.junctionOf(link) !== null, reach(a), reach(b));
      const clear = (i: number, dir: 1 | -1) => hallReach(net, i, dir) + ESCALATOR_CLEARANCE;
      if (stretches.some((st) => st.open && st.from < x0 + clear(a, 1))) openBeyond.add(`${a}:1`);
      if (stretches.some((st) => st.open && st.to > x1 - clear(b, -1))) openBeyond.add(`${b}:-1`);
    }

    // Every station's halls are checked before any is built, so a mistake in the data names all it breaks at once.
    const problems = net.stations.flatMap((_, i) => hallProblems(net, i, openBeyond));
    if (problems.length) throw new Error(`Halls that do not fit: ${problems.join('; ')}`);
    for (const [i, def] of net.stations.entries()) {
      const end = lineEnd(net, i);
      const kind = end !== 0 ? 'cavern' : def.service ?? 'staff';
      const clue = def.line === 0 ? CLUES[def.name as keyof typeof CLUES] : undefined;
      const ends = hallEnds(net, i, openBeyond);
      // The staff door: at the end trains turn back beyond, or else the one without the main hall. Where a hall stands
      // there too, it goes beside the escalators; a plain staff room with nothing the game needs is left out instead.
      const main = def.halls ? hallDir(def.halls[0]) : ends[0];
      const wingDir = kind === 'cavern' ? end as 1 | -1 : -main as 1 | -1;
      const side = ends.includes(wingDir);
      const add = (station: StationInfo, wing: ServiceWing) => {
        this.stations.push(station);
        this.zones.push(...station.zones, ...wing.zones);
        this.interactables.push(...station.interactables, ...wing.interactables);
      };
      // A shared station has no staff door, so no service wing behind it; nor does one in the open.
      const shared = def.lines.length > 1 || isOutdoor(net, i) || (side && !needsWing(net, i));
      const service: ServiceDoor | null = shared ? null : { dir: wingDir, side };
      if (isOutdoor(net, i)) this.openRanges.push([xs[i] - CAVE_HALF_L, xs[i] + CAVE_HALF_L]);
      const noWing: ServiceWing = { group: new Group(), zones: [], interactables: [] };
      if (eager(i)) {
        const { group, extra, info } = yield* stationSteps(physics, net, i, xs[i], ends, service);
        this.group.add(group);
        for (const g of extra) this.group.add(g);
        yield part(WEIGHT.station);
        const wing = shared ? noWing : buildServiceWing(physics, i, xs[i], -wingDir as 1 | -1, kind, false, clue, side);
        this.group.add(wing.group);
        if (wing.update) this.updaters.push(wing.update);
        add(info, wing);
        yield part(WEIGHT.wing);
        continue;
      }
      const { info } = withoutSigns(() => buildStation(physics, net, i, xs[i], ends, service, true));
      const wing = shared ? noWing : withoutSigns(() => buildServiceWing(physics, i, xs[i], -wingDir as 1 | -1, kind, true, clue, side));
      add(info, wing);
      // What the dry pass handed the station, to go back to when the built one is taken down, so its meshes can go.
      const dry: StationInfo = { ...info, halls: info.halls.map((h) => ({ ...h, exit: { ...h.exit } })), inclines: [] };
      const open = isOutdoor(net, i) && !def.city;
      this.later(xs[i] - CAVE_HALF_L - 60, xs[i] + CAVE_HALF_L + 60, function* (this: World) {
        const osm = open ? this.osm.patch(net.lines[def.line].id, def.name, xs[i]) : null;
        const built = yield* stationSteps(NO_PHYSICS, net, i, xs[i], ends, service, false, osm);
        adopt(info, built.info);
        yield* this.add(built.group);
        for (const g of built.extra) yield* this.add(g);
        if (shared) return;
        yield* this.add(buildServiceWing(NO_PHYSICS, i, xs[i], -wingDir as 1 | -1, kind, false, clue, side).group);
      }.bind(this), () => adopt(info, dry), open ? this.osmReady(xs[i], xs[i]) : undefined);
      yield;
    }

    // Each walkway joins its two stations' ends.
    for (const s of this.stations) {
      for (const w of s.walkways) {
        const back = this.stations[w.to]?.walkways.find((o) => o.to === s.index);
        if (back && s.index < w.to) this.walkways.push(new Walkway(w.end, back.end));
      }
    }

    // Tunnels between neighbours, built once where routes share them.
    const tunnelAmbient = rgb(0x121214);
    const kymlingeX = ghostX(net);
    this.kymlingeX = kymlingeX;
    for (const link of net.layout.links) {
      const { a, b } = link;
      const junction = this.junctionOf(link);
      // Tunnels at a junction share a seed per junction (the blue line's being the first).
      const rank = junction === null ? -1 : [...new Set(this.portals.map((p) => p.portal!.anchor))].indexOf(junction);
      const seed = rank >= 0 ? 900 + rank * 17 : 100 + b * 7;
      const tunnel = (from: number, to: number, part: number, withPhysics: boolean, place: TubePlace = { lane: link.lane }) => function* (this: World, dry: boolean): Generator<void, Group> {
        const s = new Section(`tunnel-${a}-${b}-${part}`, tunnelAmbient, dry);
        // Colliders come from the pass with real physics; so do the zones and doors that go with them.
        const extras = yield* tubeSteps(s, withPhysics ? physics : NO_PHYSICS, from, to, seed + part, to - from > 300 && junction === null, place);
        if (withPhysics) {
          this.zones.push(...extras.zones);
          this.interactables.push(...extras.interactables);
        }
        // Graffiti is sprayed in the usual pair of tubes only.
        if (!dry && !place.lane && !place.sides) {
          yield;
          buildGraffiti(s, from, to, rank >= 0 ? 9 + rank : b + part * 31);
        }
        return yield* s.finishSteps();
      }.bind(this);
      if (link.portal) {
        this.portalCopy(physics, link, tunnelAmbient, (from, to, place) => tunnel(from, to, 0, false, place));
        yield;
        continue;
      }
      const x0 = xs[a] + CAVE_HALF_L;
      const x1 = xs[b] - CAVE_HALF_L;
      // A route that ends where its line goes on turns on a siding in the tunnel beyond (see `buildSiding`).
      const siding = this.sidingIn(link);
      const reach = (i: number) => net.stations[i].openReach ?? 160;
      const stretches = this.stretches(x0, x1, isOutdoor(net, a), isOutdoor(net, b), junction !== null, reach(a), reach(b));
      // By the water in the city, between two stations both lines share, the open air is one wide bridge under all four tracks.
      const city = !!(net.stations[a].city || net.stations[b].city);
      const wide = net.stations[a].lines.length > 1 && net.stations[b].lines.length > 1;
      if (siding) this.siding(physics, siding[0], siding[1], eager(a) && eager(b), tunnelAmbient, 300 + a * 13, stretches.some((st) => st.open && st.from <= siding[0] && st.to >= siding[1]));
      // Where the line runs in the open, a fenced track bed with a tunnel mouth where it meets the tubes.
      for (const [k, st] of stretches.entries()) {
        if (!st.open) continue;
        const mouths: Array<[number, 1 | -1]> = [];
        if (k > 0) mouths.push([st.from, 1]);
        if (k < stretches.length - 1) mouths.push([st.to, -1]);
        // The second line's tracks on a wide bridge: only the rails, the rest is the first line's.
        if (link.lane) this.laneTracks(st.from, st.to, link.lane);
        else this.openStretch(physics, st.from, st.to, mouths, seed + k, 0, city ? { wide } : null);
        yield;
      }
      const cuts: Array<[number, number]> = [...(kymlingeX > x0 && kymlingeX < x1 ? [[kymlingeX - CAVE_HALF_L, kymlingeX + CAVE_HALF_L] as [number, number]] : []), ...(siding ? [siding] : [])];
      const parts: Array<[number, number]> = stretches.filter((st) => !st.open).flatMap((st) => without([st.from, st.to], cuts));
      for (const [index, [from, to]] of parts.entries()) {
        if (eager(a) && eager(b)) {
          this.group.add(yield* tunnel(from, to, index, true)(false));
          yield part(WEIGHT.tunnel);
        } else {
          drain(tunnel(from, to, index, true)(true));
          const make = tunnel(from, to, index, false);
          this.later(from, to, function* (this: World) { yield* this.add(yield* make(false)); }.bind(this));
          yield;
        }
      }
    }

    // Turnback caverns beyond the ends of each line (or, in the open, tracks on to buffer stops).
    for (const i of net.stations.keys()) {
      const dir = lineEnd(net, i);
      if (dir === 0) continue;
      const wall = xs[i] + dir * CAVE_HALF_L;
      if (isOutdoor(net, i)) {
        const far = wall + dir * (TAIL_TUBE + CAVERN_LEN);
        const [t0, t1] = [Math.min(wall, far), Math.max(wall, far)];
        const make = function* (dry: boolean, osm: OsmPatch[] = []): Generator<void, Group> {
          const s = new Section(`turnback-${i}`, OPEN_AMBIENT, dry, true);
          buildOpenTurnback(s, dry ? physics : NO_PHYSICS, wall, dir, TAIL_TUBE + CAVERN_LEN, 200 + i * 11, osm);
          yield;
          return yield* s.finishSteps();
        };
        drain(make(true));
        this.openRanges.push([t0, t1]);
        this.later(t0, t1, function* (this: World) { yield* this.add(yield* make(false, this.osmAt(t0, t1))); }.bind(this), undefined, this.osmReady(t0, t1));
        yield;
        continue;
      }
      // Colliders come from the dry pass, or from the one build of a turnback built at once.
      const make = (dry: boolean) => {
        const s = new Section(`turnback-${i}`, tunnelAmbient, dry);
        buildTurnback(s, dry || eager(i) ? physics : NO_PHYSICS, wall, dir, TAIL_TUBE, CAVERN_LEN, 200 + i * 11, { door: SERVICE_DOOR });
        return s.finish();
      };
      if (eager(i)) {
        this.group.add(make(false));
        yield part(WEIGHT.turnback);
      } else {
        make(true);
        const far = wall + dir * (TAIL_TUBE + CAVERN_LEN);
        this.later(Math.min(wall, far), Math.max(wall, far), function* (this: World) { yield* this.add(make(false)); }.bind(this));
        yield;
      }
    }

    // Kymlinge, in the tunnel between Hallonbergen and Kista.
    this.kymlinge = withoutSigns(() => buildKymlinge(physics, kymlingeX, true));
    this.zones.push(...this.kymlinge.zones);
    this.interactables.push(...this.kymlinge.interactables);
    let flicker: ((time: number) => void) | null = null;
    this.later(kymlingeX - CAVE_HALF_L, kymlingeX + CAVE_HALF_L, function* (this: World) {
      const k = yield* kymlingeSteps(NO_PHYSICS, kymlingeX);
      yield* this.add(k.group);
      flicker = k.update;
    }.bind(this), () => { flicker = null; });
    this.kymlinge.update = (time) => flicker?.(time);
  }

  /**
   * Which parts of the way between two stations' caves, from `x0` (at the
   * first station) to `x1`, lie in the open: near a station above ground, all
   * of it between two, and where one is below ground a tunnel mouth well
   * short of it. At a junction the middle is always covered, so its portal
   * lies deep in a tunnel (see `routes.ts`).
   */
  private stretches(x0: number, x1: number, aOpen: boolean, bOpen: boolean, junction: boolean, aReach = 160, bReach = 160): Array<{ from: number; to: number; open: boolean }> {
    const COVER = 180;
    const mid = (x0 + x1) / 2;
    const cuts: Array<{ from: number; to: number; open: boolean }> = [];
    if (junction) {
      cuts.push({ from: x0, to: mid - COVER, open: aOpen }, { from: mid - COVER, to: mid + COVER, open: false }, { from: mid + COVER, to: x1, open: bOpen });
    } else if (aOpen && bOpen) cuts.push({ from: x0, to: x1, open: true });
    else if (aOpen) {
      // A tunnel mouth where the open air ends, and never right at the next station's wall.
      const mouth = Math.min(x0 + aReach, x1 - 20, aReach > 160 ? Infinity : (x0 + x1) / 2);
      cuts.push({ from: x0, to: mouth, open: true }, { from: mouth, to: x1, open: false });
    } else if (bOpen) {
      const mouth = Math.max(x1 - bReach, x0 + 20, bReach > 160 ? -Infinity : (x0 + x1) / 2);
      cuts.push({ from: x0, to: mouth, open: false }, { from: mouth, to: x1, open: true });
    }
    else cuts.push({ from: x0, to: x1, open: false });
    // Neighbours of the same kind become one.
    const out: typeof cuts = [];
    for (const c of cuts) {
      if (c.to - c.from < 0.5) continue;
      const last = out[out.length - 1];
      if (last && last.open === c.open) last.to = c.to;
      else out.push({ ...c });
    }
    return out;
  }

  /**
   * An open-air stretch of track, with tunnel mouths at `mouths` (x, and the
   * way out into the open), built at `x0`..`x1` and moved `dx` along x. In the
   * `city` it is a bridge over the water with the skyline around, `wide`
   * enough for both lines' tracks where they share the way.
   */
  private openStretch(physics: Physics, x0: number, x1: number, mouths: Array<[number, 1 | -1]>, seed: number, dx = 0, city: { wide: boolean } | null = null): void {
    const tracks = city?.wide ? [-TRACK_Z - LANE, -TRACK_Z, TRACK_Z, TRACK_Z + LANE] : [-TRACK_Z, TRACK_Z];
    const halfW = city?.wide ? CAVE_HALF_W + LANE + 0.5 : OPEN.fenceZ;
    // Built in stages with a bake per layer, so a stretch built on the way costs a frame per stage, not all at once.
    const net = this.net;
    const make = function* (dry: boolean, osm: OsmPatch[] = []): Generator<void, Group> {
      const s = new Section(`open-${Math.round(x0)}`, OPEN_AMBIENT, dry, true);
      const p = dry ? shifted(physics, dx) : NO_PHYSICS;
      if (city) {
        buildBridge(s, p, x0, x1, halfW, city.wide ? [-TRACK_Z, TRACK_Z] : tracks);
        yield;
        buildCity(s, x0, x1, halfW, cityAnchors(net));
      } else buildOpenTrack(s, p, x0, x1, seed, osm);
      yield;
      for (const [x, dir] of mouths) buildTunnelMouth(s, p, x, dir, tracks, halfW + 1, !!city);
      yield;
      const group = yield* s.finishSteps();
      group.position.x = dx;
      return group;
    };
    drain(make(true));
    this.openRanges.push([x0 + dx, x1 + dx]);
    this.later(x0 + dx, x1 + dx, function* (this: World) { yield* this.add(yield* make(false, city ? [] : this.osmAt(x0, x1, dx))); }.bind(this), undefined, city ? undefined : this.osmReady(x0, x1, dx));
  }

  /** The second line's rails where both lines cross the open air on one wide bridge. */
  private laneTracks(x0: number, x1: number, lane: number): void {
    const make = (dry: boolean) => {
      const s = new Section(`lane-${Math.round(x0)}`, OPEN_AMBIENT, dry, true);
      for (const side of [-1, 1]) addTrack(s, x0, x1, side * (TRACK_Z + lane), true);
      return s.finish();
    };
    this.later(x0, x1, function* (this: World) { yield* this.add(make(false)); }.bind(this));
  }

  /**
   * How much of the open sky someone at `p` sees, 0 to 1: all of it in the
   * open, fading out over the first stretch of a tunnel, none underground or
   * indoors.
   */
  outdoorAt(p: Vector3): number {
    if (p.y > PLATFORM_Y + ESC_HEADROOM + 2) return 0;
    let best = 0;
    for (const [x0, x1] of this.openRanges) {
      const d = Math.max(0, x0 - p.x, p.x - x1);
      if (d < OPEN_FADE) best = Math.max(best, 1 - d / OPEN_FADE);
    }
    return best;
  }

  /** The hall of `station` nearest `x`: its main one, or the second at the other end of the platform. */
  hallNear(station: number, x: number): HallInfo {
    const halls = this.stations[station].halls;
    return halls.length > 1 && Math.abs(x - halls[1].bounds.x0) < Math.abs(x - halls[0].bounds.x0) ? halls[1] : halls[0];
  }

  /** How much sky someone at `p` sees on the street over `station`: all of it up there, less down in the cut. */
  streetOpen(station: number, p: Vector3): number {
    const e = this.hallNear(station, p.x).exit;
    // Out of a door in the open, the street is open all over.
    if (e.cut === 0) return 1;
    return Math.min(1, Math.max(0.4, 0.4 + (0.6 * (p.y - e.sillY)) / (e.top - e.sillY)));
  }

  /** Shows the street over `station` (null for none) nearest `x` and hides the rest: only the one you are at is ever in view. */
  showStreet(station: number | null, x: number): void {
    const near = station === null ? null : this.hallNear(station, x);
    // Every frame, as a street built on the way comes in hidden.
    for (const s of this.stations) {
      for (const hall of s.halls) {
        const group = hall.exit.street?.group;
        if (group) group.visible = hall === near;
      }
    }
  }

  /** The siding cavern in a tunnel, as world x from and to, if a route turns there. */
  private sidingIn(link: Link): [number, number] | null {
    const xs = this.stationX;
    for (const r of this.net.layout.routes) {
      const last = r.stations[r.stations.length - 1];
      if (r.siding.west && last === link.a) return [xs[link.a] + CAVE_HALF_L + TAIL_TUBE, xs[link.a] + CAVE_HALF_L + TAIL_TUBE + CAVERN_LEN];
      if (r.siding.east && r.stations[0] === link.b) return [xs[link.b] - CAVE_HALF_L - TAIL_TUBE - CAVERN_LEN, xs[link.b] - CAVE_HALF_L - TAIL_TUBE];
    }
    return null;
  }

  private siding(physics: Physics, x0: number, x1: number, now: boolean, ambient: ReturnType<typeof rgb>, seed: number, open = false): void {
    const make = (dry: boolean) => {
      const s = new Section('siding', open ? OPEN_AMBIENT : ambient, dry, open);
      buildSiding(s, dry || now ? physics : NO_PHYSICS, x0, x1, seed, open);
      return s.finish();
    };
    if (now) { this.group.add(make(false)); return; }
    make(true);
    this.later(x0, x1, function* (this: World) { yield* this.add(make(false)); }.bind(this));
  }

  /** Where a portal's copy of the anchor's tunnel is built from, before it is moved: `x0` to `x1` beside the anchor. */
  private portalBase(link: Link): { x0: number; x1: number } {
    const { anchor, dir } = link.portal!;
    const xa = this.stationX[anchor];
    return dir > 0 ? { x0: xa + CAVE_HALF_L, x1: xa + link.gap - CAVE_HALF_L } : { x0: xa - link.gap + CAVE_HALF_L, x1: xa - CAVE_HALF_L };
  }

  /**
   * The far side of a portal: the same geometry as the anchor's tunnel in the
   * same direction, built beside the anchor and moved `shift` along x to the
   * far station, so a train crossing between them at the portal sees no
   * change. A wall closes the copy's end at the anchor, well out of sight of
   * the portal.
   */
  private portalCopy(physics: Physics, link: Link, ambient: ReturnType<typeof rgb>, make: (from: number, to: number, place: TubePlace) => (dry: boolean) => Generator<void, Group>): void {
    const { shift, dir, farLane, stub } = link.portal!;
    const lane = link.lane;
    const { x0, x1 } = this.portalBase(link);
    /** Tubes from `from` to `to` (closed at `capX` if it is one of their ends), built at the anchor and moved by `dx` and, per side, `dz` (in from the anchor's lane to the far one). */
    const closed = (capX: number, dx: number, pieces: Array<{ sides: Array<-1 | 1>; dz: number }>, from = x0, to = x1) => {
      const capped = capX === from || capX === to;
      for (const { sides, dz } of pieces) {
        buildTubes(new Section('portal-copy', ambient, true), shifted(physics, dx, dz), from, to, 900, false, { lane, sides });
        if (capped) for (const side of sides) {
          const zc = side * (TRACK_Z + lane) + dz;
          const lo = capX > (from + to) / 2 ? capX - 0.5 : capX - 1;
          physics.box({ x: lo + dx, y: -1, z: zc - TUBE_HALF_W - 1 }, { x: lo + 1.5 + dx, y: TUBE_TOP + 1, z: zc + TUBE_HALF_W + 1 });
        }
        this.later(from + dx, to + dx, function* (this: World) {
          const group = yield* make(from, to, { lane, sides })(false);
          if (capped) {
            const cap = new Section('portal-cap', ambient);
            const inward = capX > (from + to) / 2 ? -0.5 : 0.5;
            for (const side of sides) wallWithHoles(cap.lit, capX + inward, archProfile(side * (TRACK_Z + lane), TUBE_HALF_W, TUBE_WALL_H, TUBE_TOP, TUBE_BOTTOM, 10), [], PAINT.tunnelRock);
            group.add(cap.finish());
          }
          group.position.set(dx, 0, dz);
          yield* this.add(group);
        }.bind(this));
      }
    };
    // The far side: closed at the anchor's end, well out of sight of the portal.
    const change = lane - farLane;
    const capX = dir > 0 ? x0 : x1;
    if (change) closed(capX, shift, [{ sides: [-1], dz: change }, { sides: [1], dz: -change }]);
    else {
      // In the open like its original, the middle covered around the portal (see `stretches`).
      const { anchor, far } = link.portal!;
      const [openA, openB] = dir > 0 ? [isOutdoor(this.net, anchor), isOutdoor(this.net, far)] : [isOutdoor(this.net, far), isOutdoor(this.net, anchor)];
      const stretches = this.stretches(x0, x1, openA, openB, true);
      for (const [k, st] of stretches.entries()) {
        if (!st.open) { closed(capX, shift, [{ sides: [-1, 1], dz: 0 }], st.from, st.to); continue; }
        const mouths: Array<[number, 1 | -1]> = [];
        if (k > 0) mouths.push([st.from, 1]);
        if (k < stretches.length - 1) mouths.push([st.to, -1]);
        this.openStretch(physics, st.from, st.to, mouths, 900 + k, shift);
      }
    }
    // Where the anchor has no such tunnel of its own, a stub of it, closed at its far end.
    if (stub) closed(dir > 0 ? x1 : x0, 0, [{ sides: [-1, 1], dz: 0 }]);
  }

  /** The stretch of a tunnel that is its own (for a portal, its copy by the far station), as world x. */
  tunnelExtent(link: Link): { x0: number; x1: number } {
    if (!link.portal) return { x0: this.stationX[link.a] + CAVE_HALF_L, x1: this.stationX[link.b] - CAVE_HALF_L };
    const { x0, x1 } = this.portalBase(link);
    const { shift, dir } = link.portal;
    const portal = (x0 + x1) / 2 + shift;
    return dir > 0 ? { x0: portal - 400, x1: x1 + shift } : { x0: x0 + shift, x1: portal + 400 };
  }

  /** Adds a lazily built group and warms it on the GPU. */
  private *add(group: Object3D): Generator<void, void> {
    this.group.add(group);
    this.recording?.groups.push(group);
    yield* this.warmSteps(group);
  }

  /** Runs one step of a lazy build, noting what it adds. */
  private step(entry: Lazy, steps: Generator<void, unknown>): boolean {
    this.recording = entry;
    try {
      return !!steps.next().done;
    } finally {
      this.recording = null;
    }
  }

  /** Takes down what was built for stretches far from `x`, frees its memory and queues it to be built again. */
  private evict(x: number): void {
    for (const entry of [...this.built]) {
      const off = (at: number) => Math.max(0, entry.x0 - at, at - entry.x1);
      if (this.building?.entry === entry || this.paused.some((p) => p.entry === entry) || off(x) < EVICT_REACH || (this.ahead !== null && off(this.ahead) < EVICT_REACH)) continue;
      for (const group of entry.groups) {
        this.group.remove(group);
        this.extents.delete(group);
        freeMemory(group);
      }
      entry.groups = [];
      entry.release?.();
      this.built.splice(this.built.indexOf(entry), 1);
      this.lazy.push(entry);
    }
  }

  /** Warms a new group's meshes on the GPU: each big mesh in a step of its own, then everything else together. */
  private *warmSteps(group: Object3D): Generator<void, void> {
    if (!this.warm) return;
    const big: Object3D[] = [];
    group.traverse((o) => {
      const geo = (o as Mesh).geometry;
      if (geo && (geo.getAttribute('position')?.count ?? 0) > WARM_ALONE) big.push(o);
    });
    for (const mesh of big) {
      yield;
      this.warm(mesh);
    }
    yield;
    this.warm(group);
  }

  private later(x0: number, x1: number, build: Lazy['build'], release?: Lazy['release'], ready?: Lazy['ready']): void {
    this.lazy.push({ x0, x1, build, groups: [], release, ready });
  }

  /**
   * Advances the build in progress by one step, or starts the nearest waiting
   * stretch within reach of `x`. One step per call, so the cost is spread over
   * frames. A waiting stretch within reach while another build is under way
   * further off (a teleport) is built at once.
   */
  /**
   * One step of building toward `x`: on with the build under way if it lies within `reach`, else the nearest thing
   * within reach is started, and a build further off is set aside to go on with later. False when nothing within
   * reach is left to build.
   */
  private buildNear(x: number, reach: number): boolean {
    const off = (e: Lazy) => Math.max(0, e.x0 - x, x - e.x1);
    const current = this.building;
    if (current && off(current.entry) < reach) {
      if (this.step(current.entry, current.steps)) this.building = this.paused.pop() ?? null;
      return true;
    }
    let best: Lazy | null = null;
    let distance = Infinity;
    for (const l of this.lazy) {
      const d = off(l);
      if (d < reach && d < distance && (!l.ready || l.ready())) { best = l; distance = d; }
    }
    if (!best) {
      // Something set aside may be what is near now.
      const i = this.paused.findIndex((p) => off(p.entry) < reach);
      if (i < 0) return false;
      if (current) this.paused.push(current);
      this.building = this.paused.splice(i, 1)[0];
      return true;
    }
    this.lazy.splice(this.lazy.indexOf(best), 1);
    this.built.push(best);
    this.recording = best;
    const steps = best.build();
    this.recording = null;
    if (!steps) return true;
    if (current) this.paused.push(current);
    this.building = this.step(best, steps) ? this.paused.pop() ?? null : { entry: best, steps };
    return true;
  }

  /**
   * Per frame: what lies within `MUST_REACH` of `x` is built now, whatever it takes; what lies within `NEAR_REACH`
   * gets up to `budget` milliseconds of building, so a train running ahead of the lazy builds costs a little every
   * frame instead of one long stall.
   */
  keepUp(x: number, budget = 6, ahead: number | null = null): void {
    this.ahead = ahead;
    while (this.buildNear(x, MUST_REACH));
    const until = performance.now() + budget;
    while (performance.now() < until && this.buildNear(x, NEAR_REACH));
    // The far end of a walkway is one step away past its middle, however far off it is built: build it on the way.
    if (ahead !== null) while (performance.now() < until && this.buildNear(ahead, MUST_REACH));
    this.show(x);
  }

  /** Builds everything near `x` right away, e.g. after a teleport. */
  ensureBuilt(x: number): void {
    while (this.buildNear(x, NEAR_REACH));
    this.show(x);
  }

  update(dt: number, time: number, focusX?: number): void {
    for (const u of this.updaters) u(dt);
    this.kymlinge.update(time);
    if (focusX !== undefined) {
      this.buildNear(focusX, BUILD_REACH);
      this.show(focusX);
    }
  }

  /** Shows the sections within `SHOW_REACH` of `x` and hides the rest, whenever the player has moved `SHOW_STEP`. */
  private show(x: number): void {
    if (this.shownCount === this.group.children.length && Math.abs(x - this.shownAt) < SHOW_STEP) return;
    this.evict(x);
    this.shownAt = x;
    this.shownCount = this.group.children.length;
    const open = this.openRanges.some(([x0, x1]) => x > x0 - OPEN_FADE && x < x1 + OPEN_FADE);
    for (const child of this.group.children) {
      let extent = this.extents.get(child);
      if (!extent) {
        child.updateMatrixWorld(true);
        const box = new Box3().setFromObject(child);
        extent = box.isEmpty() ? [-Infinity, Infinity] : [box.min.x, box.max.x];
        this.extents.set(child, extent);
      }
      // An underground station's second hall stands high over the tunnels: from the open air it would show over the
      // hill at the tunnel mouth, where nothing of it could really be seen.
      child.visible = x > extent[0] - SHOW_REACH && x < extent[1] + SHOW_REACH && !(child.userData.underground && open);
    }
  }

  /** The nearest usable thing within reach of the feet, if any. */
  interactableNear(p: Vector3): Interactable | null {
    let best: Interactable | null = null;
    let distance = Infinity;
    for (const it of this.interactables) {
      // The distance first: asking whether a thing is usable can cost more, and most are far away.
      const d = Math.hypot(it.pos.x - p.x, (it.pos.y - p.y - 1) * 0.6, it.pos.z - p.z);
      if (d >= it.radius || d >= distance) continue;
      if (it.enabled && !it.enabled()) continue;
      best = it;
      distance = d;
    }
    return best;
  }

  locate(p: Vector3): Location {
    for (const z of this.zones) if (inZone(z, p)) return { station: z.station, area: z.area, label: z.label };
    for (const s of this.stations) {
      for (const { wallX, dir, z, run, base } of s.escalators) {
        const along = (p.x - wallX) * dir;
        if (along > 0 && along < run && Math.abs(p.z - z) < ESC_HALF_W && p.y > base - 0.2) {
          return { station: s.index, area: 'escalator' };
        }
      }
      for (const lift of s.inclines) if (lift.contains(p)) return { station: s.index, area: 'escalator' };
      // Beyond an open-air station's fences, up the stairs from a hall under the tracks: the street.
      if (s.outdoor && Math.abs(p.x - s.cx) <= CAVE_HALF_L && Math.abs(p.z) > OPEN.fenceZ + 0.2 && p.y > -1 && p.y < 9) return { station: s.index, area: 'street' };
      for (const { exit, bounds, corridor } of s.halls) {
        // Up on the street, or on the flight up to it out beyond the hall's end wall.
        const street = exit.street;
        if (street && p.x >= street.x0 && p.x <= street.x1 && p.y > bounds.y + 2 && (p.y > street.y - 1 || p.x < bounds.x0 || p.x > bounds.x1)) return { station: s.index, area: 'street' };
        if (p.x >= bounds.x0 && p.x <= bounds.x1 && p.y > bounds.y - 1) return { station: s.index, area: 'hall' };
        if (corridor && p.x >= corridor.x0 && p.x <= corridor.x1 && Math.abs(p.z) < corridor.halfWidth + 0.5 && p.y > bounds.y - 1) return { station: s.index, area: 'hall' };
      }
      if (Math.abs(p.x - s.cx) <= CAVE_HALF_L && p.y < 9) {
        const onPlatform = s.platforms.some((zc) => Math.abs(p.z - zc) <= PLATFORM_HALF_W + 0.05) && p.y > PLATFORM_Y - 0.3;
        return { station: s.index, area: onPlatform ? 'platform' : 'track' };
      }
    }
    return { station: null, area: 'tunnel' };
  }

  /**
   * Walking through a portal's copy toward its anchor, past the portal, leads
   * on into the anchor's own tunnel: the Hjulsta side of the junction tunnel
   * into the Akalla side, which continues to Västra skogen. Returns how far
   * to move someone on foot at `p`, or 0.
   */
  junctionWalk(p: Vector3): { dx: number; dz: number } | null {
    if (p.y >= TUBE_TOP) return null;
    for (const link of this.portals) {
      const { x0, x1 } = this.portalBase(link);
      const { shift, dir, farLane } = link.portal!;
      if (Math.abs(Math.abs(p.z) - TRACK_Z - farLane) >= TUBE_HALF_W + 0.5) continue;
      const x = (x0 + x1) / 2 + shift;
      if (dir > 0 ? p.x < x && p.x > x - 60 : p.x > x && p.x < x + 60) return { dx: -shift, dz: Math.sign(p.z) * (link.lane - farLane) };
    }
    return null;
  }

  /** Where the walkway someone at `p` walks in leads, along x (its far end's door), or null outside the walkways. */
  walkwayAhead(p: Vector3): number | null {
    for (const w of this.walkways) {
      const door = w.ahead(p);
      if (door) return door.x;
    }
    return null;
  }

  /** Where someone on foot at `p` goes on to, past the middle of a walkway, and how much they turn; or null. */
  walkwayCross(p: Vector3): { to: Vector3; turn: number } | null {
    for (const w of this.walkways) {
      const across = w.cross(p);
      if (across) return across;
    }
    return null;
  }

  /** Escalator belt velocity at a point (zero off the escalators). The +z lane goes up. */
  escalatorVelocity(p: Vector3, out: Vector3): Vector3 {
    out.set(0, 0, 0);
    if (this.escalatorsRunning === false) return out;
    for (const s of this.stations) for (const esc of s.escalators) {
      const { wallX, dir } = esc;
      const along = (p.x - wallX) * dir;
      if (along <= 0.1 || along >= esc.run - 0.1 || !onEscalatorTread(p.z - esc.z)) continue;
      const surface = escalatorHeight(along, esc.rise, esc.base);
      if (p.y < surface - 0.4 || p.y > surface + 0.6) continue;
      const lane = p.z > esc.z ? 1 : -1;
      if (lane === esc.stoppedLane) return out;
      out.set(dir, escalatorSlope(along, esc.rise), 0).multiplyScalar(ESC_SPEED * Math.cos(ESC_ANGLE) * lane);
      return out;
    }
    return out;
  }

  /** Belt velocity along z on the moving walkways in the passages (zero elsewhere, and at night). */
  travelatorVelocity(p: Vector3): number {
    for (const s of this.stations) {
      const pass = s.passage;
      if (!pass || p.x < pass.bounds.x0 || p.x > pass.bounds.x1) continue;
      return beltVelocity(p, pass.X, pass.bounds.y, pass.bounds.z0, this.escalatorsRunning);
    }
    return 0;
  }

  /**
   * Moves the inclined lifts to `time` and returns how far the one someone with their feet at `feet` stands in
   * carried them (zero outside every cabin). A lift far from them is left where it was: its cabin follows from the
   * time alone, so it is right again when they come near.
   */
  inclines(time: number, feet: Vector3): Vector3 {
    this.liftCarry.set(0, 0, 0);
    for (const s of this.stations) {
      for (const lift of s.inclines) {
        if (Math.abs(feet.x - lift.wallX) > INCLINE_REACH) { lift.hide(); continue; }
        const inside = lift.holds(feet);
        const wasOpen = lift.pose.open > PASSABLE;
        lift.update(time);
        if (inside) this.liftCarry.copy(lift.delta);
        // Doors closing on someone in the doorway see them in, as a lift's doors would open again for them.
        else if (wasOpen && lift.pose.open <= PASSABLE) {
          const at = lift.doorway(feet);
          if (at !== 0) this.liftCarry.set(lift.dir * (at < 0 ? 0.6 : -0.6), 0, 0);
        }
      }
    }
    return this.liftCarry;
  }

  updateEscalators(time: number, playerX: number): void {
    for (const station of this.stations) for (const esc of station.escalators) esc.update(time, playerX);
    setTravelatorTime(time);
  }

  /** Can someone standing on the track at `p` climb onto the platform here? */
  canClimb(p: Vector3): { station: number; z: number } | null {
    for (const s of this.stations) {
      if (Math.abs(p.x - s.cx) > PLATFORM_HALF_L - 0.5) continue;
      for (const zc of s.platforms) {
        const az = Math.abs(p.z - zc);
        if (p.y < PLATFORM_Y - 0.3 && az > PLATFORM_HALF_W && az < PLATFORM_HALF_W + 1.4) {
          return { station: s.index, z: zc + Math.sign(p.z - zc) * (PLATFORM_HALF_W - 0.6) };
        }
      }
    }
    return null;
  }

  nearestStation(x: number): StationInfo {
    let best = this.stations[0];
    for (const s of this.stations) if (Math.abs(s.cx - x) < Math.abs(best.cx - x)) best = s;
    return best;
  }
}

/**
 * Frees the GPU buffers and textures of a group taken out of the world. The
 * shared world materials and their textures stay; anything shared that is
 * freed here is simply uploaded again by whatever still uses it.
 */
function freeMemory(group: Object3D): void {
  const shared = new Set<Material>(sharedMaterials());
  group.traverse((o) => {
    const mesh = o as Mesh;
    mesh.geometry?.dispose();
    // An instanced mesh keeps its instances' matrices in buffers of its own (an escalator's treads).
    if ((o as InstancedMesh).isInstancedMesh) (o as InstancedMesh).dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of materials) if (!shared.has(m)) (m as MeshBasicMaterial).map?.dispose();
  });
}

/**
 * Which ends of a station its halls stand at, the main one first: where its real plan has them (`StationDef.halls`),
 * or else one where there is room for it (see `hallProblems`).
 */
function hallEnds(net: Network, i: number, openBeyond: ReadonlySet<string>): Array<1 | -1> {
  const def = net.stations[i];
  if (def.halls) return def.halls.filter((h) => h.from === undefined).map((h) => hallDir(h));
  // Where the line ends toward +x, trains turn back beyond the far end, so the escalators face -x; so they do at an
  // underground station with open air just beyond its +x end.
  const end = lineEnd(net, i);
  const toOpen = !isOutdoor(net, i) && openBeyond.has(`${i}:1`) && !openBeyond.has(`${i}:-1`) && end !== -1;
  return [end === 1 || toOpen ? -1 : 1];
}

/**
 * What is wrong with a station's halls as its data has them: underground, a hall never stands toward open air closer
 * than its shaft, hall and street stairs reach. At the end of the staff door or a turnback, the door goes beside the
 * escalators (`SIDE_DOOR`).
 */
function hallProblems(net: Network, i: number, openBeyond: ReadonlySet<string>): string[] {
  const def = net.stations[i];
  if (!def.halls) return [];
  const underground = !isOutdoor(net, i);
  const problems: string[] = [];
  const at = (e: number) => (e > 0 ? 'outbound' : 'inbound');
  for (const e of new Set(def.halls.map((h) => hallDir(h)))) {
    if (underground && openBeyond.has(`${i}:${e}`)) problems.push(`${def.name}: a hall toward open air closer than its stairs reach (${at(e)})`);
  }
  const ends = def.halls.filter((h) => h.from === undefined).map((h) => hallDir(h));
  if (new Set(ends).size < ends.length) problems.push(`${def.name}: two halls at one end`);
  const downs = def.halls.filter((h) => h.down);
  if (def.halls.some((h) => h.from !== undefined && !h.down) && (!underground || def.architecture !== 'tiles')) problems.push(`${def.name}: a way up from along the platform needs a tiled ceiling to climb through`);
  if (downs.length && (underground || def.lines.length > 1 || def.city)) problems.push(`${def.name}: a hall under the tracks is for a line's own station in the open`);
  if (downs.some((h) => h.from === undefined || Math.abs(h.from) > PLATFORM_HALF_L - 4)) problems.push(`${def.name}: a hall under the tracks needs its escalators' top on the platform`);
  // Every hall and its street stand at one height: their stretches along x must not overlap; nor may two halls under
  // the tracks, nor stand beyond the station's own ground.
  const overlap = (spans: Array<[number, number]>) => spans.sort((p, q) => p[0] - q[0]).some((sp, k) => k > 0 && sp[0] < spans[k - 1][1]);
  if (overlap(def.halls.filter((h) => !h.down).map((h) => hallSpan(net, i, h)))) problems.push(`${def.name}: two halls over each other`);
  const under = downs.map((h) => underSpan(h));
  if (overlap(under)) problems.push(`${def.name}: two halls under the tracks over each other`);
  if (under.some(([a, b]) => a < -CAVE_HALF_L || b > CAVE_HALF_L)) problems.push(`${def.name}: a hall under the tracks beyond the station`);
  return problems;
}

/** Where a hall and the street over it stand along x, from the station's middle, as meters from its center. */
function hallSpan(net: Network, i: number, hall: HallDef): [number, number] {
  const d = hallDir(hall);
  const start = d * ((hall.from ?? CAVE_HALF_L) + escalatorRun(stationRise(net, i)) + (hall.corridor ?? 0));
  const end = start + d * (HALL_LEN + STREET.road.far + STREET.depth);
  return [Math.min(start - d * STREET.square.a0, end), Math.max(start - d * STREET.square.a0, end)];
}

/** Where a hall under the tracks lies along x, from the station's middle: from the foot of its escalators, the hall under the platform. */
function underSpan(hall: HallDef): [number, number] {
  const d = hallDir(hall);
  const mouth = d * (hall.from! - escalatorRun(UNDERPASS_DEPTH));
  return [Math.min(mouth, mouth - d * HALL_LEN), Math.max(mouth, mouth - d * HALL_LEN)];
}

/**
 * How far past its end wall toward `dir` a station's halls reach, with their shafts and the stairs up to the street:
 * where there is no hall that way, nothing (without a plan, the one hall the layout may put there).
 */
function hallReach(net: Network, i: number, dir: 1 | -1): number {
  const run = escalatorRun(stationRise(net, i));
  const halls = net.stations[i].halls ?? [{ end: dir > 0 ? 'outbound' : 'inbound' } as HallDef];
  const reaches = halls.filter((h) => hallDir(h) === dir && !h.down).map((h) => (h.from ?? CAVE_HALF_L) + run + (h.corridor ?? 0) + STREET.stairTop - CAVE_HALF_L);
  return Math.max(0, ...reaches);
}

/** Clues for the Silverpilen mystery, behind the staff doors on the blue trunk. */
const CLUES = { 'T-Centralen': 'clipping', 'Rådhuset': 'logbook', 'Kungsträdgården': 'scratches' } as const;

/** Does something stand behind the station's staff door that the game needs: a turnback, a shelter or a clue? */
function needsWing(net: Network, i: number): boolean {
  const def = net.stations[i];
  return lineEnd(net, i) !== 0 || !!def.service || (def.line === 0 && def.name in CLUES);
}

/**
 * Hands the meshes of a late-built station to the info the rest of the game
 * already holds, and replays what was last drawn on its boards and clocks.
 */
function adopt(info: StationInfo, built: StationInfo): void {
  const stopped = info.escalator.stoppedLane;
  info.escalators = built.escalators;
  info.escalator = built.escalator;
  for (const esc of info.escalators) esc.stoppedLane = stopped;
  // The halls' exits and the lifts' colliders are the dry pass's, which stay: the streets and cabins come and go.
  info.halls.forEach((hall, k) => { hall.exit.street = built.halls[k].exit.street; });
  info.inclines.forEach((lift, k) => { lift.view = built.inclines[k]?.view ?? null; });
  info.tube = built.tube;
  info.clutter = built.clutter;
  const departures = info.lastDepartures;
  const time = info.lastTime;
  // Noted on the station's own info, which outlives the built one, to replay when it is built again.
  info.setDepartures = (rows, notice, banner) => {
    info.lastDepartures = [rows, notice, banner];
    built.setDepartures(rows, notice, banner);
  };
  info.setTime = (clock) => {
    info.lastTime = clock;
    built.setTime(clock);
  };
  if (departures) info.setDepartures(...departures);
  if (time) info.setTime(time);
}
