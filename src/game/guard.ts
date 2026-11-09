import { ConeGeometry, Mesh, MeshBasicMaterial, Vector3, type InstancedMesh, type Scene } from 'three';
import { drawFigure, drawCount, figureMesh, paintFigure, type FigureLook, type FigurePose } from './figures';
import sv from './i18n/sv.json';
import { text } from './i18n/text';
import { PLATFORM_HALF_W, PLATFORM_Y } from './layout';
import { beep, type AudioOut } from './sfx';
import type { StationInfo } from './world/station';
import type { Interactable } from './world/zones';

/**
 * On duty as a security guard (ordningsvakt): the radio calls you to something on a platform, here or a few stops
 * away, you get there on the trains and sort it out by talking to whoever it is. One case at a time, kept to this
 * player like the driver's cab, so nothing here needs to agree with anyone else's game.
 */

export type GuardCase = keyof typeof sv.guard.cases;
export const GUARD_CASES = Object.keys(sv.guard.cases) as GuardCase[];

const TOTAL_KEY = 'under-stockholm:guard';
/** Seconds of quiet between one case and the radio's next. */
const NEXT_CALL = 6;
/** How often the next case is on the station you are already at. */
const SAME_STATION = 0.3;
/** How far along from a bench a case stands: within the two metres `StationInfo.benches` keeps clear of the ways up. */
const BESIDE_BENCH = 2;
/** The furthest the radio sends you, in stops along a route you can ride. */
const REACH = 3;

/** How each case stands. `edge` puts them just inside the platform's edge. */
const POSES: Record<GuardCase, Partial<FigurePose> & { edge?: boolean }> = {
  smoker: { arm: 'fan' },
  music: { arm: 'phone', carry: 'phone' },
  edge: { edge: true },
  child: { arm: 'wave', build: 'child', scale: 0.6 },
  singer: { arm: 'wave', sway: 0.08 },
  dozing: { lean: 0.5, look: 0 },
};

const COATS = [0x8a2f2f, 0x2f5a44, 0xc98f2e, 0x3a4f7a, 0x6b4f7a];

/** The station for the next case: often this one, otherwise one to three stops along a route through it. */
export function pickPost(from: number, routes: number[][], rng: () => number): number {
  if (rng() < SAME_STATION) return from;
  const near = new Set<number>();
  for (const route of routes) {
    const at = route.indexOf(from);
    if (at < 0) continue;
    for (let d = 1; d <= REACH; d++) for (const station of [route[at - d], route[at + d]]) if (station !== undefined && station !== from) near.add(station);
  }
  const list = [...near];
  return list.length ? list[Math.floor(rng() * list.length)] : from;
}

/** The next kind of case, never the same twice running. */
export function pickCase(last: GuardCase | null, rng: () => number): GuardCase {
  const left = GUARD_CASES.filter((c) => c !== last);
  return left[Math.floor(rng() * left.length)];
}

interface Case {
  kind: GuardCase;
  station: StationInfo;
  x: number;
  y: number;
  z: number;
}

export interface GuardEvents {
  notice(title: string, body: string, seconds: number): void;
}

export interface GuardReadout {
  call: string;
  /** The station, or how far away the case is once on the right one. */
  where: string;
  count: number;
}

const loadTotal = () => {
  try { return Math.max(0, Number(localStorage.getItem(TOTAL_KEY)) || 0); } catch { return 0; }
};

export class Guard {
  readonly interactable: Interactable;
  active = false;
  /** Every case ever handled, kept in the browser. */
  total = loadTotal();
  private shift = 0;
  private current: Case | null = null;
  private last: GuardCase | null = null;
  private wait = 0;
  private clock = 0;
  private readonly at = new Vector3();
  private readonly person: InstancedMesh = figureMesh(1);
  private readonly marker = new Mesh(new ConeGeometry(0.22, 0.42, 4), new MeshBasicMaterial({ color: 0xffd23a }));

  constructor(scene: Scene, private readonly stations: StationInfo[], private readonly routes: number[][], private readonly events: GuardEvents, private readonly rng: () => number = Math.random) {
    this.person.name = 'guard-case';
    this.person.visible = false;
    drawCount(this.person, 1);
    this.marker.rotation.x = Math.PI;
    this.marker.visible = false;
    scene.add(this.person, this.marker);
    const owner = this;
    this.interactable = {
      pos: this.at, radius: 2.4,
      get prompt() { return owner.current ? text.guard.cases[owner.current.kind].prompt : ''; },
      enabled: () => this.active && this.current !== null,
      act: () => this.handle(),
    };
  }

  /**
   * @param here the nearest station: the first case is there, so the job starts at once.
   * @param onStation whether the player is in it, rather than out in a tunnel, a staff room or at Kymlinge.
   */
  start(here: number, onStation: boolean): void {
    if (this.active) return;
    this.active = true;
    this.shift = 0;
    this.last = null;
    this.wait = 0;
    this.post(here);
    const first = onStation ? text.guard.firstHere : text.guard.firstAway.replace('{station}', this.stations[here].name);
    this.events.notice(text.guard.title, `${text.guard.intro} ${first}`, 9);
  }

  /** Goes off duty, with a word on how the shift went. Quiet when something else took over. */
  stop(quiet = false): void {
    if (!this.active) return;
    this.active = false;
    this.current = null;
    this.person.visible = false;
    this.marker.visible = false;
    if (!quiet) this.events.notice(text.guard.title, text.guard.off.replace('{count}', String(this.shift)), 6);
  }

  update(dt: number, feet: Vector3, here: number, out: AudioOut | null): void {
    if (!this.active) return;
    this.clock += dt;
    if (!this.current) {
      this.wait -= dt;
      if (this.wait > 0) return;
      this.post(here);
      if (out) beep(out, true);
      this.events.notice(text.guard.radio, this.callText(), 7);
    }
    const c = this.current;
    if (!c) return;
    // Nothing to draw from further off than the platform is long.
    const near = Math.abs(feet.x - c.x) < 160;
    this.person.visible = near;
    this.marker.visible = near;
    if (!near) return;
    const { edge: _edge, ...pose } = POSES[c.kind];
    drawFigure(this.person, 0, { x: c.x, z: c.z, y: c.y, yaw: Math.atan2(feet.x - c.x, feet.z - c.z), walking: false, ...pose }, this.clock);
    this.person.instanceMatrix.needsUpdate = true;
    this.marker.position.set(c.x, c.y + (POSES[c.kind].scale ? 1.5 : 2.3) + Math.sin(this.clock * 3) * 0.08, c.z);
    this.marker.rotation.y = this.clock * 2;
  }

  /** @param onStation as for `start`: only then is a case on the nearest station "here". */
  readout(feet: Vector3, here: number, onStation: boolean): GuardReadout {
    const c = this.current;
    if (!c) return { call: text.guard.waiting, where: '', count: this.shift };
    return {
      call: text.guard.cases[c.kind].call,
      where: onStation && c.station.index === here ? text.guard.here.replace('{distance}', String(Math.round(Math.hypot(feet.x - c.x, feet.z - c.z)))) : c.station.name,
      count: this.shift,
    };
  }

  private callText(): string {
    const c = this.current!;
    return text.guard.call.replace('{case}', text.guard.cases[c.kind].call).replace('{station}', c.station.name);
  }

  private post(here: number): void {
    const station = this.stations[this.shift === 0 && this.last === null ? here : pickPost(here, this.routes, this.rng)];
    const kind = pickCase(this.last, this.rng);
    this.last = kind;
    const island = Math.floor(this.rng() * station.platforms.length);
    const benches = station.benches.length ? station.benches : [station.cx];
    const side = this.rng() < 0.5 ? -1 : 1;
    const pose = POSES[kind];
    const c: Case = {
      kind, station,
      x: benches[Math.floor(this.rng() * benches.length)] - BESIDE_BENCH,
      y: station.levels[island] + PLATFORM_Y,
      z: station.platforms[island] + side * (pose.edge ? PLATFORM_HALF_W - 0.45 : 1.4),
    };
    this.current = c;
    this.at.set(c.x, c.y + 1, c.z);
    const look: FigureLook = {
      coat: COATS[Math.floor(this.rng() * COATS.length)], skin: 0xe2b896, hair: 0x3a2a1c, bag: 0x2b2b2b, trousers: 0x2b3340, shoes: 0x1a1a1a,
      build: pose.build ?? (this.rng() < 0.5 ? 'man' : 'woman'), back: 'none', prop: 0x16181b,
    };
    paintFigure(this.person, 0, look);
  }

  private handle(): string | void {
    const c = this.current;
    if (!c) return;
    this.current = null;
    this.person.visible = false;
    this.marker.visible = false;
    this.wait = NEXT_CALL;
    this.shift++;
    this.total++;
    try { localStorage.setItem(TOTAL_KEY, String(this.total)); } catch { /* Session only. */ }
    return text.guard.cases[c.kind].done;
  }
}
