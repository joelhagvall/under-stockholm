import { Mesh, type Scene, type Vector3 } from 'three';
import { dayNumber } from './calendar';
import { hash01, stockholm } from './clock';
import { drawCount, drawFigure, figureMesh, paintFigure, type FigurePose } from './figures';
import text from './i18n/sv.json';
import { cabinSeats, sitterYaw } from './journey';
import { CAVE_HALF_L, DOOR_XS, PLATFORM_HALF_W, PLATFORM_Y } from './layout';
import type { Operations } from './operations';
import { pramGeometry, propMaterial, walkerGeometry } from './props';
import { generated, NAMED, regularDay, traitLook, type Regular, type RegularDay } from './regulars';
import type { Timetable } from './timetable';
import type { Train } from './train';
import { occupiedSeatPoses } from './crowd';
import type { StationInfo } from './world/station';

/**
 * The regulars on the platform and aboard: each walks down from the escalator at their time, waits at their
 * spot, boards the first train that comes on their track and rides it a few stations. The player's recognition
 * is kept locally: after a few days near one of them they start to nod, later they say good morning.
 */

const MAX = 8;
const KEY = 'under-stockholm:regulars';
/** Seconds near someone in a day before it counts as a day you saw each other. */
const NEAR_SECONDS = 4;
const NEAR = 5;
const NOD_DAYS = 3;
const GREET_DAYS = 6;

export interface RegularService {
  index: number;
  train: Train;
  timetable: Timetable;
  active: boolean;
}

export interface RegularEvents {
  /** `aboard`: said on a train, beside the player there, rather than out on the platform. */
  say(message: string, seconds: number, aboard: boolean): void;
  /** @param aboard said by someone in the carriage with the player, not out on the platform */
  speak(message: string, pitch: number, rate: number, aboard: boolean): void;
  /** Counts a line for the discovery book without showing it. */
  seen(message: string): void;
}

interface Memory { days: number[]; cut: number }

const format = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');
const people = text.regulars.names as Record<string, string>;
const firsts = text.regulars.people as Record<string, string>;

/** Where a regular is at a moment: on the platform, aboard a train, or nowhere to be seen. */
type Place =
  | { kind: 'platform'; pose: FigurePose }
  | { kind: 'aboard'; train: Train; pose: FigurePose }
  | null;

interface Plan {
  day: number;
  today: RegularDay;
  /** Their train: the service, when it reaches the platform and when it leaves again, and when they get off. */
  service: number;
  arrives: number;
  departs: number;
  alights: number;
}

export class RegularLife {
  private readonly mesh = figureMesh(MAX);
  private readonly walker = new Mesh(walkerGeometry(), propMaterial());
  private readonly pram = new Mesh(pramGeometry(0x5a3440), propMaterial());
  private readonly all: Regular[];
  private readonly byStation = new Map<number, Regular[]>();
  private readonly plans = new Map<string, { day: number; plan: Plan | null }>();
  private readonly painted: string[] = new Array(MAX).fill('');
  private readonly near = new Map<string, number>();
  private readonly told = new Set<string>();
  private memory: Record<string, Memory> = {};
  private clock = 0;

  /**
   * @param stationOf a station's index by name, or -1
   */
  constructor(scene: Scene, stationNames: string[], stationOf: (name: string) => number, private readonly operations: Operations, private readonly events: RegularEvents) {
    this.mesh.name = 'regulars';
    this.mesh.visible = false;
    scene.add(this.mesh, this.walker, this.pram);
    this.walker.visible = this.pram.visible = false;
    this.all = [...NAMED, ...generated(stationNames)];
    for (const r of this.all) {
      const i = stationOf(r.station);
      if (i < 0) continue;
      const list = this.byStation.get(i) ?? [];
      list.push(r);
      this.byStation.set(i, list);
    }
    try { this.memory = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Memory>; } catch { /* Strangers. */ }
  }

  /** How many days the player has been near a regular. */
  known(id: string): number {
    return this.memory[id]?.days.length ?? 0;
  }

  /**
   * @param station the station the player is at (on or near its platform), or null
   * @param riding the train the player is aboard, if any
   * @param live false when SL drives the trains: then the regulars only wait, board and are gone
   */
  update(dt: number, time: number, station: StationInfo | null, feet: Vector3, services: RegularService[], riding: Train | null, show: boolean, live: boolean): void {
    this.clock += dt;
    this.mesh.visible = show;
    this.walker.visible = this.pram.visible = false;
    if (!show) return;
    let slot = 0;
    const seen = new Set<string>();
    const candidates: Array<{ r: Regular; station: number }> = [];
    if (station) for (const r of this.byStation.get(station.index) ?? []) candidates.push({ r, station: station.index });
    // Those riding the player's train, from wherever they got on.
    if (riding) {
      for (const [index, list] of this.byStation) {
        if (index === station?.index) continue;
        for (const r of list) {
          const plan = this.plan(r, index, time);
          if (plan && time > plan.departs - 5 && time < plan.alights && services.find((s) => s.index === plan.service)?.train === riding) candidates.push({ r, station: index });
        }
      }
    }
    for (const { r, station: si } of candidates) {
      if (slot >= MAX) break;
      const plan = this.plan(r, si, time);
      if (!plan) continue;
      const place = this.place(r, plan, time, station && station.index === si ? station : null, services, live);
      if (!place) continue;
      if (place.kind === 'aboard' && Math.abs(place.train.position.x - feet.x) > 160) continue;
      this.meet(r, plan, place.pose, feet, time, dt);
      this.paint(slot, r, plan.today);
      drawFigure(this.mesh, slot, place.pose, this.clock + slot * 2.3);
      this.props(r, plan.today, place.pose);
      slot++;
      seen.add(r.id);
    }
    for (let i = slot; i < MAX; i++) this.painted[i] = '';
    drawCount(this.mesh, slot);
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const id of this.near.keys()) if (!seen.has(id)) this.near.delete(id);
  }

  /** Today's plan for a regular, worked out once a day from the timetable. */
  private plan(r: Regular, station: number, time: number): Plan | null {
    const day = dayNumber(time);
    const key = `${r.id}:${station}`;
    const known = this.plans.get(key);
    if (known && known.day === day) return known.plan;
    const today = regularDay(r, time);
    const make = (): Plan | null => {
      if (!today.present) return null;
      const next = this.operations.nextArrival(today.arrive, station, r.track, 3600);
      if (!next) return null;
      const slot = this.operations.slots[next.service];
      const tt = slot.timetable;
      const k = tt.stopIndex(station, r.track);
      const arrives = today.arrive + next.eta;
      const departs = arrives + tt.stopDuration(k);
      // A few stations on, or the end of the line if that comes first.
      let to = k;
      for (let n = 0; n < r.ride; n++) {
        const s = tt.stops[(to + 1) % tt.stops.length];
        if (s.kind !== 'station' || s.track !== r.track) break;
        to = (to + 1) % tt.stops.length;
      }
      const alights = departs + tt.secondsUntil(departs + slot.offset, to);
      return { day, today, service: next.service, arrives, departs, alights };
    };
    const plan = make();
    this.plans.set(key, { day, plan });
    return plan;
  }

  /** Where they are right now. */
  private place(r: Regular, plan: Plan, time: number, s: StationInfo | null, services: RegularService[], live: boolean): Place {
    const slow = r.trait === 'walker' ? 0.55 : 1.15;
    if (s) {
      const track = s.platformTracks.find((t) => t.track === r.track) ?? s.platformTracks[0];
      const island = s.platforms.reduce((best, z) => (Math.abs(z - track.z) < Math.abs(best - track.z) ? z : best));
      const side = Math.sign(track.z - island) || 1;
      const spot = { x: s.cx + r.wait, z: island + side * (PLATFORM_HALF_W - 1.5) };
      const foot = { x: s.cx + s.exitDir * (CAVE_HALF_L - 3), z: island + side * 0.8 };
      const walk = Math.hypot(spot.x - foot.x, spot.z - foot.z) / slow;
      const facing = side > 0 ? 0 : Math.PI;
      // The door of the train they will take nearest their spot: a C30's on the red line.
      const doors = services.find((x) => x.index === plan.service)?.train.stock.doors ?? DOOR_XS;
      const door = doors.reduce((best, d) => (Math.abs(s.cx + d - spot.x) < Math.abs(s.cx + best - spot.x) ? d : best));
      const doorAt = { x: s.cx + door, z: island + side * (PLATFORM_HALF_W - 0.7) };
      const busy = r.trait === 'book' || r.trait === 'phone' || r.trait === 'student' ? { arm: 'phone' as const } : {};
      const t0 = plan.today.arrive - walk;
      if (time < t0) return null;
      // Down from the escalator to their spot.
      if (time < plan.today.arrive) {
        const f = (time - t0) / walk;
        return { kind: 'platform', pose: { x: foot.x + (spot.x - foot.x) * f, z: foot.z + (spot.z - foot.z) * f, yaw: Math.atan2(spot.x - foot.x, spot.z - foot.z), walking: true } };
      }
      // Waiting, then over to the doors once the train is in.
      const toDoor = Math.hypot(doorAt.x - spot.x, doorAt.z - spot.z) / slow;
      const boarding = plan.departs - 5;
      if (time < plan.arrives + 2) return { kind: 'platform', pose: { x: spot.x, z: spot.z, yaw: facing, walking: false, ...busy } };
      if (time < boarding) {
        const f = Math.min(1, (time - plan.arrives - 2) / toDoor);
        return { kind: 'platform', pose: { x: spot.x + (doorAt.x - spot.x) * f, z: spot.z + (doorAt.z - spot.z) * f, yaw: f < 1 ? Math.atan2(doorAt.x - spot.x, doorAt.z - spot.z) : facing, walking: f < 1 } };
      }
    }
    if (live || time >= plan.alights || time < plan.departs - 5) return null;
    // Aboard: in the same seat every day, near the door they got on by.
    const svc = services.find((x) => x.index === plan.service);
    if (!svc || !svc.active) return null;
    const style = svc.train.seating;
    const taken = occupiedSeatPoses(style);
    const free = cabinSeats(style).filter((c) => !taken.some((p) => Math.abs(p.x - c.x) < 0.2 && Math.abs(p.z - c.z) < 0.2));
    const seat = free[Math.floor(hash01([...r.id].length * 97 + r.arrive, 71) * free.length)];
    if (!seat) return null;
    const p = svc.train.position;
    return { kind: 'aboard', train: svc.train, pose: { x: p.x + seat.x, y: p.y + PLATFORM_Y, z: p.z + seat.z, yaw: sitterYaw(seat), walking: false, seated: true, ...(r.trait === 'book' || r.trait === 'phone' ? { arm: 'phone' as const } : {}) } };
  }

  /** Paints a slot for a regular, with today's haircut and cast. */
  private paint(slot: number, r: Regular, today: RegularDay): void {
    const key = `${r.id}:${today.haircut}:${today.cast}`;
    if (this.painted[slot] === key) return;
    this.painted[slot] = key;
    const look = traitLook(r.trait);
    // A haircut: a little shorter or longer, a touch lighter or darker.
    const cut = hash01(today.haircut, 61 + r.arrive % 50);
    const shade = (c: number, k: number) => {
      const f = 0.85 + k * 0.3;
      return (Math.min(255, Math.round(((c >> 16) & 255) * f)) << 16) | (Math.min(255, Math.round(((c >> 8) & 255) * f)) << 8) | Math.min(255, Math.round((c & 255) * f));
    };
    paintFigure(this.mesh, slot, {
      coat: today.cast ? 0xe9e6de : r.coat, torso: look.torso ?? (today.cast ? r.coat : undefined), skin: r.skin, hair: shade(r.hair, cut), bag: 0x1b1d22,
      trousers: r.trousers, shoes: 0x242629, build: r.build, long: r.build === 'woman' ? (r.long ?? false) !== (cut > 0.85) : false,
      skirt: r.skirt, legs: r.skirt ? 0x2a2a30 : undefined, back: look.back, carry: look.carry, prop: r.trait === 'flowers' ? 0xd94a6a : r.trait === 'coffee' ? 0xf1ecd9 : 0x16181b,
    });
  }

  /** The walker in front of her, the pram in front of the one who had a baby. */
  private props(r: Regular, today: RegularDay, pose: FigurePose): void {
    const prop = r.trait === 'walker' ? this.walker : r.trait === 'expecting' && today.pram ? this.pram : null;
    if (!prop || pose.seated) return;
    prop.visible = true;
    prop.position.set(pose.x + Math.sin(pose.yaw) * 0.55, pose.y ?? PLATFORM_Y, pose.z + Math.cos(pose.yaw) * 0.55);
    prop.rotation.y = pose.yaw - Math.PI / 2;
  }

  /** Being near each other: a day seen, and then what they do about it. */
  private meet(r: Regular, plan: Plan, pose: FigurePose, feet: Vector3, time: number, dt: number): void {
    if (Math.hypot(pose.x - feet.x, pose.z - feet.z) > NEAR || Math.abs((pose.y ?? PLATFORM_Y) - feet.y) > 2) return;
    const t = (this.near.get(r.id) ?? 0) + dt;
    this.near.set(r.id, t);
    if (t < NEAR_SECONDS) return;
    const mem = this.memory[r.id] ?? { days: [], cut: plan.today.haircut };
    const first = !mem.days.includes(plan.day);
    if (first) {
      mem.days = [...mem.days, plan.day].slice(-30);
      this.memory[r.id] = mem;
      try { localStorage.setItem(KEY, JSON.stringify(this.memory)); } catch { /* Forgotten tomorrow. */ }
    }
    const days = mem.days.length;
    // Someone who knows you looks your way.
    if (days >= NOD_DAYS) pose.look = Math.max(-1, Math.min(1, ((Math.atan2(feet.x - pose.x, feet.z - pose.z) - pose.yaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI));
    const name = people[r.id] ?? text.regulars.someone;
    const once = (what: string, message: string, seconds = 5) => {
      const k = `${r.id}:${plan.day}:${what}`;
      if (this.told.has(k)) return false;
      this.told.add(k);
      this.events.say(message, seconds, !!pose.seated);
      return true;
    };
    if (days === 1 && r.named) { once('first', firsts[r.id]); return; }
    // A haircut or a cast shows on the figure; nobody needs to say so.
    if (plan.today.haircut !== mem.cut) mem.cut = plan.today.haircut;
    if (days >= GREET_DAYS) {
      const morning = stockholm(time).hours < 10;
      const line = morning ? text.regulars.morning : text.regulars.hello;
      if (once('greet', format(text.regulars.greets, { name, line }), 4)) this.events.speak(line, r.build === 'woman' ? 1.15 : 0.85, 1, !!pose.seated);
      return;
    }
    // The nod shows as a turn of the head; the book still counts it.
    const nod = `${r.id}:${plan.day}:nod`;
    if (days >= NOD_DAYS && !this.told.has(nod)) { this.told.add(nod); this.events.seen(format(text.regulars.nod, { name })); }
  }
}
