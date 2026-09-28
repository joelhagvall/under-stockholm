import { Mesh, type Scene } from 'three';
import type { Era } from './era';
import { drawFigure, figureMesh, hideFigure, paintFigure, type FigureLook } from './figures';
import { cabinSeats, seatBeside, sitterYaw, type Seat } from './journey';
import { PLATFORM_Y } from './layout';
import { pramGeometry, propMaterial, walkerGeometry } from './props';
import type { SeatStyle } from './trainModel';

/**
 * A life on the blue line: one ride from Kungsträdgården to Akalla where every station is a stretch of years, from
 * 1975 to 2050. You start as a child holding a parent's hand and end with a walker; the carriage, the trains and
 * the posters change with the years (`era.ts`), and the stranger across the aisle ages with you. No words but the
 * station names and the years on the boards. The scenes are planned here; `boot.ts` stages them.
 */

export const LIFE_FIRST = 1975;
export const LIFE_LAST = 2050;
/** Seconds of each station: from just before the train stops until the doors have been open a while. */
export const LIFE_BEFORE = 10;
export const LIFE_AFTER = 6;

export type Age = 'child' | 'boy' | 'teen' | 'student' | 'parent' | 'parentOlder' | 'suit' | 'grandparent' | 'old';

export interface LifeScene {
  year: number;
  age: Age;
  era: Era;
  /** The player's eye height next to an adult's. */
  eye: number;
}

const AGES: Age[] = ['child', 'boy', 'teen', 'teen', 'student', 'parent', 'parentOlder', 'suit', 'suit', 'grandparent', 'grandparent', 'old'];

/** One scene per station of the ride, the years spread evenly between the first and the last. */
export function lifeScenes(stations: number): LifeScene[] {
  return Array.from({ length: stations }, (_, k) => {
    const f = stations > 1 ? k / (stations - 1) : 0;
    const year = Math.round(LIFE_FIRST + f * (LIFE_LAST - LIFE_FIRST));
    const age = AGES[Math.min(AGES.length - 1, Math.round(f * (AGES.length - 1)))];
    return { year, age, era: year < 1995 ? '1975' : 'now', eye: age === 'child' ? 0.72 : age === 'boy' ? 0.84 : age === 'old' ? 0.93 : 1 };
  });
}

/** The stranger across the aisle: dark hair turning grey, then white, and one day the seat is empty. */
export function strangerLook(year: number): FigureLook | null {
  if (year >= LIFE_LAST) return null;
  const f = (year - LIFE_FIRST) / (LIFE_LAST - LIFE_FIRST);
  const grey = Math.round(0x2b + f * (0xd8 - 0x2b));
  return { coat: year < 1995 ? 0x6b5a45 : year < 2025 ? 0x2b3a4a : 0x5a3440, skin: 0xe8bd9b, hair: (grey << 16) | (grey << 8) | Math.min(255, grey + 6), bag: 0x1b1d22, trousers: 0x3a3d40, shoes: 0x242629, build: 'woman', long: f < 0.6, back: 'none', carry: f > 0.7 ? 'handbag' : 'paper', prop: 0x16181b };
}

/** Who sits beside you, and what stands in the aisle, at each age. */
function company(age: Age): { beside: 'parent' | 'child' | 'grandchild' | null; aisle: 'pram' | 'walker' | null } {
  switch (age) {
    case 'child': return { beside: 'parent', aisle: null };
    case 'parent': return { beside: null, aisle: 'pram' };
    case 'parentOlder': return { beside: 'child', aisle: null };
    case 'grandparent': return { beside: 'grandchild', aisle: null };
    case 'old': return { beside: null, aisle: 'walker' };
    default: return { beside: null, aisle: null };
  }
}

const PARENT: FigureLook = { coat: 0x8a6f4d, skin: 0xe8bd9b, hair: 0x6b4a2e, bag: 0x1b1d22, trousers: 0x3d4a3a, shoes: 0x242629, build: 'woman', long: true, back: 'none', carry: 'handbag', prop: 0x6b2430 };
const CHILD: FigureLook = { coat: 0xe63946, skin: 0xe8bd9b, hair: 0xb8935a, bag: 0x3a86ff, trousers: 0x243049, shoes: 0x242629, build: 'child', back: 'backpack' };

/** The people and things around the player's seat, drawn in the train's frame. */
export class LifeCompany {
  private readonly mesh = figureMesh(2);
  private readonly pram = new Mesh(pramGeometry(0x2c4a7a), propMaterial());
  private readonly walker = new Mesh(walkerGeometry(), propMaterial());
  private painted = '';
  private clock = 0;

  constructor(scene: Scene) {
    this.mesh.name = 'life';
    this.mesh.visible = false;
    this.pram.visible = this.walker.visible = false;
    scene.add(this.mesh, this.pram, this.walker);
  }

  hide(): void {
    this.mesh.visible = this.pram.visible = this.walker.visible = false;
  }

  /** @param at the train's position; `seat` is the player's, in the train's frame */
  update(dt: number, scene: LifeScene, at: { x: number; y: number; z: number }, seat: Seat, style: SeatStyle): void {
    this.clock += dt;
    this.mesh.visible = true;
    const { beside, aisle } = company(scene.age);
    const stranger = strangerLook(scene.year);
    const key = `${scene.year}:${beside}`;
    if (key !== this.painted) {
      this.painted = key;
      if (beside) paintFigure(this.mesh, 0, beside === 'parent' ? PARENT : CHILD);
      if (stranger) paintFigure(this.mesh, 1, stranger);
    }
    const next = beside ? seatBeside(seat, style) : null;
    if (next) drawFigure(this.mesh, 0, { x: at.x + next.x, y: at.y + PLATFORM_Y, z: at.z + next.z, yaw: sitterYaw(next), walking: false, seated: true, scale: beside === 'parent' ? 1 : 0.62, arm: beside === 'parent' ? 'hold' : undefined, look: beside === 'parent' ? -0.4 : 0.3 }, this.clock);
    else hideFigure(this.mesh, 0);
    // Across from you: the nearest seat facing yours, over the knee gap of a group or across the aisle.
    const across = cabinSeats(style)
      .filter((c) => Math.cos(c.yaw - seat.yaw) < -0.9 && (seat.x - c.x) * Math.sin(seat.yaw) + (seat.z - c.z) * Math.cos(seat.yaw) > 0.3)
      .sort((a, b) => Math.hypot(a.x - seat.x, a.z - seat.z) - Math.hypot(b.x - seat.x, b.z - seat.z))[0];
    if (stranger && across) drawFigure(this.mesh, 1, { x: at.x + across.x, y: at.y + PLATFORM_Y, z: at.z + across.z, yaw: sitterYaw(across), walking: false, seated: true, arm: scene.year < 2010 ? 'phone' : undefined, lean: scene.year > 2040 ? 0.15 : 0 }, this.clock + 3);
    else hideFigure(this.mesh, 1);
    this.mesh.instanceMatrix.needsUpdate = true;
    // Out in the aisle beside your seat, pointing the way the train goes, the handle toward you.
    const ahead = Math.sign(Math.sin(sitterYaw(seat))) || 1;
    const place = (m: Mesh, show: boolean) => {
      m.visible = show;
      if (!show) return;
      m.position.set(at.x + seat.x + ahead * 0.9, at.y + PLATFORM_Y, at.z + seat.z * 0.15);
      m.rotation.y = ahead > 0 ? 0 : Math.PI;
    };
    place(this.pram, aisle === 'pram');
    place(this.walker, aisle === 'walker');
  }
}
