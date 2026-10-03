import { type InstancedMesh, type Vector3 } from 'three';
import { hash01, stockholm, summerTimetable } from './clock';
import { occupiedSeatPoses, passengerLook } from './crowd';
import { drawFigure, figureMesh, hideFigure, paintFigure } from './figures';
import sv from './i18n/sv.json';
import { text } from './i18n/text';
import { cabinSeats, seatBeside, sitterYaw, type Seat } from './journey';
import { PLATFORM_Y } from './layout';
import { Spatial, tone, type AudioOut } from './sfx';
import type { TrainState } from './timetable';
import { seatStock, unitAisle, type SeatStyle } from './trainModel';
import type { Train } from './train';

/**
 * Life inside the carriages: a school class in high-visibility vests
 * filling a whole car while their teacher counts them, again and again, and
 * the Stockholm seat rule, which the player can feel: nobody sits next to
 * you while there is an empty pair of seats left. As the carriage fills up
 * at rush hour, someone finally does, and looks out of the window the whole
 * way.
 */

const CHILDREN = 14;
/** Figures for the seats around a seated player: enough for every seat within reach, and the neighbour last. */
const FILLERS = 32;

export interface CarriageService {
  index: number;
  train: Train;
  active: boolean;
  state: TrainState | null;
}

/** School days in term time, nine to two: some trains carry a class on an outing. Everyone agrees which. */
export function schoolTrip(train: number, time: number): boolean {
  const c = stockholm(time);
  if (c.weekday === 0 || c.weekday === 6 || c.hours < 9 || c.hours >= 14 || summerTimetable(time) || c.month === 7) return false;
  return hash01(train * 17 + Math.floor(time / 900), 101) < 0.25;
}

interface Class {
  children: InstancedMesh;
}

const classSeats = new Map<SeatStyle, Seat[]>();

/** Where a school class sits: the free seats in the middle of the middle car, or of the C30's second unit (its middle is two cabs). */
function seatsForClass(style: SeatStyle): Seat[] {
  let seats = classSeats.get(style);
  if (!seats) {
    const taken = occupiedSeatPoses(style);
    const stock = seatStock(style);
    const mid = stock.units[Math.floor(stock.units.length / 2)];
    seats = cabinSeats(style).filter((s) => Math.abs(s.x - mid) < 7.6 && !taken.some((p) => Math.abs(p.x - s.x) < 0.2 && Math.abs(p.z - s.z) < 0.2));
    classSeats.set(style, seats);
  }
  return seats;
}

export class CarriageLife {
  private readonly classes = new Map<Train, Class>();
  private readonly fillers = figureMesh(FILLERS);
  private clock = 0;
  private chatter: Spatial | null = null;
  private nextChatter = 0;
  private nextCount = 0;
  private count = 0;
  private told = '';
  /** The seat rule: how full the player's carriage has become since they sat down. */
  private seated: { train: Train; stops: number; seat: Seat; last: number } | null = null;
  private neighbour = false;

  constructor(trains: Train[], private readonly events: { say(message: string, seconds: number): void; speak(message: string, pitch: number, rate: number): void }) {
    for (const train of trains) {
      const children = figureMesh(CHILDREN + 1);
      children.name = 'school-trip';
      for (let i = 0; i < CHILDREN; i++) {
        const look = passengerLook(i, 60);
        paintFigure(children, i, { ...look, torso: i % 3 ? 0xd8e53a : 0xf08a24, bag: [0xe63946, 0x3a86ff, 0x2ec4b6][i % 3] });
      }
      paintFigure(children, CHILDREN, { coat: 0x2f5a44, torso: 0xd8e53a, skin: 0xdba987, hair: 0x6b4a2e, bag: 0x293338, trousers: 0x303a48, shoes: 0x242629 });
      children.visible = false;
      train.group.add(children);
      this.classes.set(train, { children });
    }
    this.fillers.name = 'seat-rule';
    this.fillers.visible = false;
    for (let i = 0; i < FILLERS; i++) paintFigure(this.fillers, i, passengerLook(i, 77));
  }

  /** @param people passengers are shown (the same toggle as the platform crowds) */
  update(dt: number, time: number, services: CarriageService[], riding: Train | null, busy: number, seat: Seat | null, feet: Vector3, people: boolean, out: AudioOut | null): void {
    this.clock += dt;
    for (const svc of services) {
      if (people) this.drawClass(svc, time, riding, feet, out);
      else this.classes.get(svc.train)!.children.visible = false;
    }
    this.seatRule(services, riding, busy, people ? seat : null);
  }

  private drawClass(svc: CarriageService, time: number, riding: Train | null, feet: Vector3, out: AudioOut | null): void {
    const c = this.classes.get(svc.train);
    if (!c) return;
    const on = svc.active && schoolTrip(svc.index, time) && Math.abs(svc.train.position.x - feet.x) < 250;
    c.children.visible = on;
    if (!on) return;
    for (let i = 0; i < CHILDREN; i++) {
      const seats = seatsForClass(svc.train.seating);
      const s = seats[i % seats.length];
      if (i < seats.length && i < 9) {
        drawFigure(c.children, i, { x: s.x, z: s.z, yaw: sitterYaw(s), walking: false, seated: true, scale: 0.62, look: Math.sin(this.clock * 0.9 + i * 2) * 0.6 }, this.clock + i);
      } else {
        // The rest stand in the aisle and fidget.
        const k = i - 9;
        drawFigure(c.children, i, { x: -5.4 + k * 2.4, z: (k % 2 ? 0.2 : -0.2), yaw: k % 2 ? Math.PI : 0, walking: false, scale: 0.6, arm: k % 3 === 0 ? 'wave' : 'hold', y: PLATFORM_Y + Math.max(0, Math.sin(this.clock * 4 + k)) * 0.05 }, this.clock + i);
      }
    }
    // The teacher walks the aisle, counting heads.
    const walk = Math.sin(this.clock * 0.25) * 6;
    drawFigure(c.children, CHILDREN, { x: walk, z: 0, yaw: Math.cos(this.clock * 0.25) > 0 ? Math.PI / 2 : -Math.PI / 2, walking: true, arm: 'hold' }, this.clock);
    c.children.instanceMatrix.needsUpdate = true;
    if (riding !== svc.train) return;
    const key = `${svc.index}:${Math.floor(time / 900)}`;
    if (this.told !== key) {
      this.told = key;
      this.count = 0;
      this.events.say(text.carriage.school, 5);
    }
    if (this.clock > this.nextCount) {
      this.nextCount = this.clock + 7 + Math.random() * 5;
      const line = sv.carriage.counting[this.count++ % sv.carriage.counting.length];
      this.events.say(line, 3.5);
      this.events.speak(line.replace(/[”"]/g, ''), 1.05, 1.05);
    }
    if (out && this.clock > this.nextChatter) {
      this.nextChatter = this.clock + 0.12 + Math.random() * 0.3;
      this.chatter ??= new Spatial(out, 2, 1.2, 40, true);
      this.chatter.setPosition({ x: svc.train.position.x + (Math.random() - 0.5) * 12, y: PLATFORM_Y + 1, z: svc.train.position.z + (Math.random() - 0.5) * 2 });
      this.chatter.setLevel(1, 0.01);
      // High, quick voices: little rising and falling syllables.
      const f = 520 + Math.random() * 420;
      tone(out, this.chatter.input, f, 0.012, 0.09 + Math.random() * 0.08, { type: 'triangle', glideTo: f * (0.8 + Math.random() * 0.5), attack: 0.01 });
    }
  }

  /**
   * While the player sits, people who board at rush hour take the empty
   * seats around them first; only once no free pair is left does someone sit
   * down right beside them.
   */
  private seatRule(services: CarriageService[], riding: Train | null, busy: number, seat: Seat | null): void {
    if (!riding || !seat) {
      if (this.seated) this.fillers.removeFromParent();
      this.seated = null;
      this.neighbour = false;
      this.fillers.visible = false;
      return;
    }
    if (!this.seated || this.seated.train !== riding || this.seated.seat !== seat) {
      this.seated = { train: riding, stops: 0, seat, last: -1 };
      this.neighbour = false;
      riding.group.add(this.fillers);
    }
    const state = services.find((s) => s.train === riding)?.state;
    // Count each station stop once, when the doors have opened.
    if (state && state.phase === 'dwell' && state.stop !== this.seated.last) {
      this.seated.last = state.stop;
      if (busy > 0.45) {
        this.seated.stops++;
        if (this.seated.stops === 1) this.events.say(text.carriage.seatRuleEmpty, 5);
      }
    }
    // Free seats near the player, all but the one right beside theirs.
    const style = riding.seating;
    const taken = occupiedSeatPoses(style);
    const free = (s: Seat) => !taken.some((p) => Math.abs(p.x - s.x) < 0.2 && Math.abs(p.z - s.z) < 0.2);
    const beside = seatBeside(seat, style);
    const aisle = unitAisle(riding.stock, seat.x);
    const around = cabinSeats(style)
      .filter((s) => s !== seat && s !== beside && Math.abs(s.x - seat.x) < 9 && s.x > aisle.a && s.x < aisle.b && free(s))
      .sort((a, b) => Math.abs(a.x - seat.x) - Math.abs(b.x - seat.x))
      .slice(0, FILLERS - 1);
    const filled = Math.min(around.length, this.seated.stops * 5);
    this.fillers.visible = filled > 0;
    for (let i = 0; i < FILLERS; i++) {
      const s = around[around.length - 1 - i];
      if (i < filled && s) drawFigure(this.fillers, i, { x: s.x, z: s.z, yaw: sitterYaw(s), walking: false, seated: true }, this.clock + i);
      else hideFigure(this.fillers, i);
    }
    // Every other seat is taken: someone sits down beside you, reluctantly.
    const full = filled >= around.length;
    if (beside && free(beside) && full && this.seated.stops >= 3 && !this.neighbour) {
      this.neighbour = true;
      this.events.say(text.carriage.seatRuleFull, 6);
    }
    if (this.neighbour && beside) {
      // In a group they look out of the window, on the side seats straight ahead, away from you.
      const look = Math.abs(beside.z - seat.z) > 0.1 ? Math.sign(seat.z) * 0.7 : 0;
      drawFigure(this.fillers, FILLERS - 1, { x: beside.x, z: beside.z, yaw: sitterYaw(beside), walking: false, seated: true, look }, this.clock);
    }
    this.fillers.instanceMatrix.needsUpdate = true;
  }
}
