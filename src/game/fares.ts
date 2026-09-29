import { CanvasTexture, DoubleSide, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry, SRGBColorSpace, Vector3, type Scene } from 'three';
import { formatClock, hash01 } from './clock';
import { drawFigure, figureMesh, hideFigure, paintFigure } from './figures';
import text from './i18n/sv.json';
import { PLATFORM_Y, TRACK_Z, TRAIN_HALF_L } from './layout';
import { unitAisle } from './trainModel';
import type { Physics, StaticCollider } from './physics';
import { beep, type AudioOut } from './sfx';
import type { Timetable, TrainState } from './timetable';
import type { Train } from './train';
import type { GateLine, StationInfo } from './world/station';
import type { Interactable } from './world/zones';

/**
 * Ticket gates, the SL card and the people who check it. Tap in at the gates
 * with the card, or a bank card or phone when its balance runs short (or jump
 * them), and now and then a pair of ticket inspectors boards a train and works
 * its way down the carriage.
 */

export const TICKET_PRICE = 42;
export const TICKET_MINUTES = 75;
export const PENALTY = 1850;
const OPEN_SECONDS = 3.2;
const INSPECTION_CHANCE = 0.18;
const CARD_KEY = 'under-stockholm:card';

const format = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));

interface Card { balance: number; debt: number }

function loadCard(): Card {
  try {
    const saved = JSON.parse(localStorage.getItem(CARD_KEY) ?? 'null') as Card | null;
    if (saved && Number.isFinite(saved.balance) && Number.isFinite(saved.debt)) return saved;
  } catch { /* Storage can be disabled. */ }
  return { balance: 300, debt: 0 };
}

interface GateState {
  station: StationInfo;
  /** Which gate line: the station's index twice over, plus one for its second hall's. */
  key: number;
  line: GateLine;
  mesh: InstancedMesh;
  colliders: StaticCollider[];
  open: number[];
  openness: number[];
  /** A tap opened this passage for the player, rather than the exit sensor. */
  paid: boolean[];
}

/** Whether inspectors ride a given train between a station stop and the next. Everyone agrees on this. */
export function inspectorsAboard(service: number, loop: number, stop: number): boolean {
  return hash01(service * 7919 + loop * 131 + stop, 61) < INSPECTION_CHANCE;
}

export interface FareService {
  index: number;
  train: Train;
  time: number;
  state: TrainState;
  active: boolean;
  timetable: Timetable;
}

export interface FareEvents {
  say(text: string, seconds?: number): void;
  notice(title: string, body: string, seconds?: number): void;
  /** Takes the player off a train onto the platform. */
  escort(to: Vector3, yaw: number): void;
}

function flapTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(190, 215, 230, 0.55)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(0, 40, 128, 18);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 124, 124);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export class Fares {
  readonly interactables: Interactable[] = [];
  private readonly gates: GateState[] = [];
  private readonly card = loadCard();
  private validUntil: number;
  /** Did the player's latest entry through the gates go through a tap? */
  private dodged = false;
  private side = new Map<number, number>();
  private readonly dummy = new Object3D();
  private readonly inspectors = new Map<Train, InstancedMesh>();
  private readonly walk = new Map<string, number>();
  private readonly doors = new Map<string, number>();
  private readonly checked = new Set<string>();
  private readonly warned = new Set<string>();
  private escort: { train: Train; after: number } | null = null;
  /** An inspector has asked to see the ticket and waits for the player to show it. */
  private asking: { key: string; train: Train; stop: number; since: number; reminded: boolean } | null = null;
  private readonly askPos = new Vector3();
  private out: AudioOut | null = null;
  private now = 0;

  constructor(scene: Scene, physics: Physics, stations: StationInfo[], trains: Train[], start: number, private readonly events: FareEvents) {
    // You arrived by metro before the game began, with a fresh ticket.
    this.validUntil = start + TICKET_MINUTES * 60;
    const material = new MeshBasicMaterial({ map: flapTexture(), transparent: true, side: DoubleSide, depthWrite: false });
    for (const station of stations) for (const [k, hall] of station.halls.entries()) {
      const line = hall.gates;
      const mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, line.passages.length * 2);
      scene.add(mesh);
      const mid = (line.paidX + line.unpaidX) / 2;
      const colliders = line.passages.map((z) => physics.box({ x: mid - 0.04, y: line.y, z: z - line.halfWidth }, { x: mid + 0.04, y: line.y + line.flapHeight, z: z + line.halfWidth }));
      const state: GateState = { station, key: station.index * 2 + k, line, mesh, colliders, open: line.passages.map(() => 0), openness: line.passages.map(() => 0), paid: line.passages.map(() => false) };
      this.gates.push(state);
      line.passages.forEach((z, i) => {
        const dir = Math.sign(line.paidX - line.unpaidX);
        this.interactables.push({
          pos: new Vector3(line.unpaidX - dir * 0.35, line.y + 1, z), radius: 0.95, prompt: text.fares.tapPrompt,
          enabled: () => state.open[i] <= 0,
          act: () => this.tap(state, i),
        });
      });
      this.drawFlaps(state);
      // The staffed booth tops up the card.
      const booth = new Vector3(line.unpaidX - Math.sign(line.paidX - line.unpaidX) * 1.5, line.y + 1, 8.3);
      this.interactables.push({ pos: booth, radius: 1.3, prompt: text.fares.topUpPrompt, act: () => this.topUp() });
    }
    for (const train of trains) {
      const mesh = figureMesh(2);
      for (let i = 0; i < 2; i++) paintFigure(mesh, i, { coat: 0x1e2a3a, torso: 0xd8e53a, skin: i ? 0xe0b28e : 0x8d6346, hair: i ? 0x6b4a2e : 0x1b1b1b, bag: 0x1e2a3a, trousers: 0x1c2331, shoes: 0x111214, prop: 0x2b2b2b });
      mesh.name = 'inspectors';
      mesh.visible = false;
      train.group.add(mesh);
      this.inspectors.set(train, mesh);
    }
    // Holding out the card when asked: E, or the touch Use button.
    this.interactables.push({ pos: this.askPos, radius: 3.2, prompt: text.fares.showPrompt, urgent: true, enabled: () => this.asking !== null, act: () => this.show() });
  }

  get valid(): boolean {
    return !this.dodged && this.now < this.validUntil;
  }

  /** One line for the pause menu. */
  statusLine(): string {
    const ticket = this.valid ? format(text.fares.valid, { time: formatClock(this.validUntil) }) : text.fares.ticketless;
    return this.card.debt > 0 ? `${ticket} · ${format(text.fares.debt, { amount: this.card.debt.toLocaleString('sv-SE') })}` : ticket;
  }

  private save(): void {
    try { localStorage.setItem(CARD_KEY, JSON.stringify(this.card)); } catch { /* Session only. */ }
  }

  private tap(state: GateState, i: number): string {
    const now = this.now;
    if (now < this.validUntil) {
      this.openPassage(state, i, true);
      if (this.out) beep(this.out, true);
      return format(text.fares.valid, { time: formatClock(this.validUntil) });
    }
    this.validUntil = now + TICKET_MINUTES * 60;
    this.openPassage(state, i, true);
    if (this.out) beep(this.out, true);
    // The yellow reader takes a contactless bank card or phone as well: with the SL card short, that pays instead.
    if (this.card.balance < TICKET_PRICE) return format(text.fares.chargedBank, { time: formatClock(this.validUntil) });
    this.card.balance -= TICKET_PRICE;
    this.save();
    return format(text.fares.charged, { balance: this.card.balance, time: formatClock(this.validUntil) });
  }

  private openPassage(state: GateState, i: number, paid: boolean): void {
    state.open[i] = OPEN_SECONDS;
    state.paid[i] = paid || state.paid[i];
    state.colliders[i].setEnabled(false);
  }

  private drawFlaps(state: GateState): void {
    const { line, mesh } = state;
    const mid = (line.paidX + line.unpaidX) / 2;
    const height = line.flapHeight - 0.28;
    line.passages.forEach((z, i) => {
      const o = state.openness[i];
      for (const side of [-1, 1]) {
        // Each flap retracts into its post.
        const width = (line.halfWidth - 0.03) * (1 - o * 0.92);
        const post = z + side * line.halfWidth;
        this.dummy.position.set(mid, line.y + 0.28 + height / 2, post - side * width / 2);
        this.dummy.rotation.set(0, Math.PI / 2, 0);
        this.dummy.scale.set(width, height, 1);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), this.dummy.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  update(dt: number, time: number, feet: Vector3, riding: FareService | null, services: FareService[], out: AudioOut | null): void {
    this.now = time;
    this.out = out;
    for (const state of this.gates) {
      const { line } = state;
      const dir = Math.sign(line.paidX - line.unpaidX);
      const mid = (line.paidX + line.unpaidX) / 2;
      const inHall = Math.abs(feet.y - line.y) < 2.5 && Math.abs(feet.x - mid) < 12 && Math.abs(feet.z) < 9;
      let changed = false;
      line.passages.forEach((z, i) => {
        // Exit sensor: the flaps open for anyone leaving the paid side.
        const approach = (feet.x - mid) * dir;
        if (inHall && approach > 0.2 && approach < 1.6 && Math.abs(feet.z - z) < line.halfWidth && state.open[i] <= 0) this.openPassage(state, i, false);
        if (state.open[i] > 0) {
          const inside = inHall && Math.abs(feet.z - z) < line.halfWidth + 0.1 && Math.abs(feet.x - mid) < 0.9;
          state.open[i] = inside ? Math.max(state.open[i], 0.6) : state.open[i] - dt;
          if (state.open[i] <= 0) { state.colliders[i].setEnabled(true); state.paid[i] = false; }
        }
        const target = state.open[i] > 0 ? 1 : 0;
        const before = state.openness[i];
        state.openness[i] += Math.sign(target - before) * Math.min(Math.abs(target - before), dt * 4);
        if (state.openness[i] !== before) changed = true;
      });
      if (changed) this.drawFlaps(state);

      // Crossing from the street side into the paid area.
      if (!inHall) { this.side.delete(state.key); continue; }
      const side = Math.sign((feet.x - mid) * dir) || 1;
      const previous = this.side.get(state.key);
      this.side.set(state.key, side);
      if (previous === -1 && side === 1) {
        const passage = line.passages.findIndex((z) => Math.abs(feet.z - z) < line.halfWidth + 0.15);
        const legit = passage >= 0 && state.open[passage] > 0 && state.paid[passage];
        this.dodged = !legit;
        if (!legit) this.events.say(text.fares.dodged, 5);
      }
    }
    this.updateInspectors(dt, feet, riding, services);
  }

  private segment(s: FareService): { key: string; loop: number; stop: number; boarding: boolean } | null {
    const timetable = s.timetable;
    const k = s.state.stop;
    const stop = timetable.stops[k];
    if (stop.kind !== 'station' || stop.terminal) return null;
    const loop = Math.floor(s.time / timetable.cycle);
    const key = `${s.index}:${loop}:${k}`;
    if (!inspectorsAboard(s.index, loop, k)) return null;
    // While the doors open, the previous pair is stepping off; this pair boards once they are open.
    if (s.state.phase === 'opening') return null;
    return { key, loop, stop: k, boarding: s.state.phase !== 'moving' };
  }

  private updateInspectors(dt: number, feet: Vector3, riding: FareService | null, services: FareService[]): void {
    let asked = false;
    for (const s of services) {
      const mesh = this.inspectors.get(s.train)!;
      const seg = s.active ? this.segment(s) : null;
      mesh.visible = seg !== null;
      if (!seg) continue;
      const side = s.state.z > 0 ? -1 : 1;
      const mine = riding?.train === s.train;
      const localPlayer = feet.x - s.train.position.x;
      // A rider sees them board a few doors away, which leaves time to move down the train.
      let door = this.doors.get(seg.key);
      const doors = s.train.stock.doors;
      if (door === undefined) {
        // Aboard, they board your own unit: there is no way through from the next one.
        const { a, b } = unitAisle(s.train.stock, localPlayer);
        const own = mine ? doors.filter((d) => d > a && d < b) : doors;
        const target = mine ? localPlayer + (localPlayer > (a + b) / 2 ? -30 : 30) : doors[Math.floor(hash01(s.index * 997 + seg.loop * 17 + seg.stop, 67) * doors.length)];
        door = own.reduce((p, q) => (Math.abs(q - target) < Math.abs(p - target) ? q : p));
        this.doors.set(seg.key, door);
      }
      const aisle = unitAisle(s.train.stock, door);
      if (mine && !this.warned.has(seg.key) && seg.boarding) {
        this.warned.add(seg.key);
        this.events.say(text.fares.boarded, 5);
      }
      let x = this.walk.get(seg.key) ?? door;
      if (!seg.boarding) {
        // Down the aisle, toward the player if they are aboard.
        const target = Math.max(aisle.a + 0.5, Math.min(aisle.b - 0.5, mine ? localPlayer : -Math.sign(door) * TRAIN_HALF_L * 0.8));
        x += Math.sign(target - x) * Math.min(Math.abs(target - x), dt * (mine ? 1.2 : 0.55));
        this.walk.set(seg.key, x);
      }
      const walking = !seg.boarding && (!mine || Math.abs(localPlayer - x) > 1.2);
      const facing = mine ? Math.sign(localPlayer - x) || 1 : -Math.sign(door) || 1;
      for (let i = 0; i < 2; i++) {
        const offset = (i ? -1 : 1) * 0.3;
        const pose = seg.boarding
          ? { x: door + offset * 1.5, z: side * 0.95, yaw: side > 0 ? 0 : Math.PI, walking: false, y: PLATFORM_Y }
          : { x: x - facing * i * 0.9, z: offset, yaw: facing > 0 ? Math.PI / 2 : -Math.PI / 2, walking, y: PLATFORM_Y };
        drawFigure(mesh, i, pose, performance.now() / 1000);
      }
      mesh.instanceMatrix.needsUpdate = true;

      // The check itself: they ask, and wait for the card.
      if (mine && !seg.boarding && !this.checked.has(seg.key) && Math.abs(localPlayer - x) < 2.5) {
        this.checked.add(seg.key);
        this.asking = { key: seg.key, train: s.train, stop: seg.stop, since: this.now, reminded: false };
        this.events.notice(text.fares.checkTitle, text.fares.checkAsk, 6);
      }
      if (this.asking?.key === seg.key) {
        asked = true;
        this.askPos.set(s.train.position.x + x, feet.y + 1, s.train.position.z);
        if (!this.asking.reminded && this.now - this.asking.since > 10) {
          this.asking.reminded = true;
          this.events.say(text.fares.checkRemind, 5);
        }
      }
    }
    // Off the train, or they stepped off at a station: the question is gone with them.
    if (this.asking && (!asked || riding?.train !== this.asking.train)) this.asking = null;
    // Once hidden they stay hidden until the next journey draws them, so this costs nothing on the frames between.
    for (const [train, mesh] of this.inspectors) if (mesh.visible && !services.some((s) => s.train === train && s.active)) { mesh.visible = false; for (let i = 0; i < 2; i++) hideFigure(mesh, i); mesh.instanceMatrix.needsUpdate = true; }

    // After a fine, the inspectors walk you off at the next station.
    if (this.escort) {
      const s = services.find((service) => service.train === this.escort!.train);
      if (!s || riding?.train !== s.train) { this.escort = null; return; }
      if (s.state.stop !== this.escort.after && (s.state.phase === 'dwell' || s.state.phase === 'opening')) {
        const z = Math.sign(s.state.z) * (TRACK_Z - 2.9);
        const door = s.train.stock.doors.reduce((a, b) => (Math.abs(b - (feet.x - s.train.position.x)) < Math.abs(a - (feet.x - s.train.position.x)) ? b : a));
        this.escort = null;
        this.events.escort(new Vector3(s.train.position.x + door, PLATFORM_Y, z), s.state.z > 0 ? 0 : Math.PI);
        this.events.say(text.fares.escorted, 5);
      }
    }
  }

  /** The player holds out the card to the inspector who asked for it. */
  private show(): string | void {
    const asking = this.asking;
    if (!asking) return;
    this.asking = null;
    if (this.out) beep(this.out, this.valid);
    if (this.valid) {
      this.events.notice(text.fares.checkTitle, text.fares.checkOk, 4);
      return;
    }
    this.card.debt += PENALTY;
    this.save();
    this.dodged = false;
    this.validUntil = Math.min(this.validUntil, this.now);
    this.events.notice(text.fares.checkTitle, text.fares.fined, 6);
    this.escort = { train: asking.train, after: asking.stop };
  }

  /** Pays for something with the card. False if the balance is too low. */
  spend(amount: number): boolean {
    if (this.card.balance < amount) return false;
    this.card.balance -= amount;
    this.save();
    return true;
  }

  /** Top up the card at the booth. */
  topUp(amount = 200): string {
    this.card.balance += amount;
    this.save();
    if (this.out) beep(this.out, true);
    return format(text.fares.toppedUp, { amount, balance: this.card.balance });
  }
}
