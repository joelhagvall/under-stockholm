import { CapsuleGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshLambertMaterial, Vector3, type Scene } from 'three';
import { hash01, stockholm } from './clock';
import { carryFor, passengerLook, type CrowdConditions } from './crowd';
import { drawFigure, figureMesh, hideFigure, paintFigure, PARTS, type Carry } from './figures';
import sv from './i18n/sv.json';
import { text } from './i18n/text';
import { RUSH_LAYOUT as R, TRAVELATOR_LAYOUT as V } from './layout';
import { loopNoise, thump, type AudioOut } from './sfx';
import type { Passage } from './world/station';
import type { Interactable } from './world/zones';

/**
 * Rush hour in the passage from the blue line toward the commuter trains at
 * City. Up to 200 commuters are simulated around the player: they walk both
 * ways, keep right, queue, sidestep and press on each other and on you. Push
 * into them and they complain; shove them (E) and some start an argument and
 * shove back. Hit someone (Q) and they go down in a heap, hotheads hit back,
 * and after a few punches the guards walk you out. Past the simulated window,
 * cheap silhouettes fill the passage.
 *
 * The crowd is local to each visitor: only its size and flow follow the
 * clock, since other players cannot see who you elbowed.
 */

const OFF = 0;
const WAITING = 1;
const WALKING = 2;

const CELL = 1;
const MAX_CELLS = Math.ceil(R.window * 2) + 8;
const BEST_KEY = 'under-stockholm:rush-best';

export interface RushEvents {
  say(message: string, seconds: number): void;
  speak(message: string, pitch: number, rate: number): void;
  lurch(strength: number): void;
  /** The guards walk the player out to the ticket hall. */
  escort(to: Vector3, yaw: number): void;
}

/** How long someone who is hit stays down, and how many punches the guards tolerate. */
const DOWN = 3.2;
const GUARDS_AT = 3;

/** How crowded the passage is at `busy` (0 night, 1 rush hour): the number of simulated commuters. */
export function rushCount(busy: number): number {
  if (busy <= 0.02) return 0;
  const level = Math.max(0, (busy - 0.15) / 0.85) ** 1.3;
  return Math.round(R.count * Math.min(1, Math.max(0.06, level)));
}

/** Relative crowd density along the passage, `u` meters in from the hall: thin by the busker, packed beyond. */
export function rushProfile(u: number): number {
  const t = Math.min(1, Math.max(0, (u - R.denseFrom) / R.denseRamp));
  return 0.15 + 0.85 * t * t * (3 - 2 * t);
}

const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class RushHour {
  readonly interactable: Interactable;
  /** Velocity the crowd presses on the player with (see `Player.push`). */
  readonly push = new Vector3();
  /** How freely the player walks: 1 in the open, lower in the crush. */
  pace = 1;
  /** Debug: a fixed busyness instead of the clock's. */
  forceBusy: number | null = null;
  shoves = 0;
  fights = 0;
  punches = 0;

  private readonly mesh = figureMesh(R.count);
  private readonly far: InstancedMesh;
  private readonly x = new Float32Array(R.count);
  private readonly z = new Float32Array(R.count);
  private readonly vx = new Float32Array(R.count);
  private readonly vz = new Float32Array(R.count);
  private readonly yaw = new Float32Array(R.count);
  private readonly pref = new Float32Array(R.count);
  private readonly lane = new Float32Array(R.count);
  private readonly anger = new Float32Array(R.count);
  private readonly stun = new Float32Array(R.count);
  private readonly muck = new Float32Array(R.count);
  private readonly blocked = new Float32Array(R.count);
  private readonly clear = new Float32Array(R.count);
  private readonly down = new Float32Array(R.count);
  private readonly retaliate = new Float32Array(R.count);
  private readonly dir = new Int8Array(R.count);
  private readonly state = new Uint8Array(R.count);
  /** Where a waiting commuter comes in: -1 at the window's hall end, 1 at the far end. */
  private readonly entry = new Int8Array(R.count);
  private readonly shovedBack = new Uint8Array(R.count);
  private readonly carries: Array<Carry | undefined> = [];
  private readonly head = new Int32Array(MAX_CELLS);
  private readonly next = new Int32Array(R.count);

  private readonly xl: number;
  private readonly xr: number;
  private readonly zMin: number;
  private readonly zMax: number;
  private readonly reach = new Vector3();
  private readonly kick = new Vector3();
  private readonly last = new Vector3();
  private readonly matrix = new Matrix4();
  private readonly hidden = new Matrix4().makeScale(0, 0, 0);
  private readonly color = new Color();
  private shown = false;
  private busy = 0;
  /** The time machine's 1975: nobody is on a phone. */
  private past = false;
  private share = 0.5;
  private target = 0;
  private clock = 0;
  private hoursAt = -1;
  private talkReady = 0;
  private shoveReady = 0;
  private canShove = false;
  private wMin = 0;
  private wMax = 0;
  private lookKey = '';
  private out: AudioOut | null = null;
  private murmur: { gain: GainNode; filters: BiquadFilterNode[] } | null = null;
  private murmurAt = 0;
  private runStart: number | null = null;
  /** The player's facing on the floor, from the last frame. */
  private fx = 0;
  private fz = -1;
  private nearby = 0;
  /** Recent punches; it cools off over time. */
  private heat = 0;

  constructor(scene: Scene, private readonly passage: Passage, private readonly events: RushEvents, touch = false) {
    const b = passage.bounds;
    this.xl = b.x0 + R.radius + 0.05;
    this.xr = b.x1 - R.radius - 0.05;
    this.zMin = b.z0 - 1;
    this.zMax = passage.gateZ - 1.2;
    this.mesh.name = 'rush-hour';
    this.mesh.visible = false;
    scene.add(this.mesh);

    // Silhouettes further off: a body and a head each, one draw for all.
    this.far = new InstancedMesh(new CapsuleGeometry(0.5, 1, 3, 8), new MeshLambertMaterial({ color: 0xffffff }), R.background * 2);
    this.far.instanceMatrix.setUsage(DynamicDrawUsage);
    this.far.frustumCulled = false;
    this.far.name = 'rush-hour-far';
    this.far.visible = false;
    scene.add(this.far);
    this.setConditions({ busy: 0, season: 'autumn', wet: false });

    this.interactable = {
      pos: this.reach,
      radius: 1,
      // Punching is keyboard and mouse only.
      prompt: () => (touch ? text.rush.shovePrompt : text.rush.punchPrompt),
      enabled: () => this.canShove,
      act: () => this.shove(),
    };
  }

  /** Clothes and bags for the season, the weather and the day; how busy it is. */
  setConditions(c: CrowdConditions): void {
    this.busy = c.busy;
    this.past = c.past ?? false;
    const key = `${c.season}|${c.wet}|${c.storm ?? false}|${c.occasion ?? ''}|${c.past ?? false}`;
    if (key === this.lookKey) return;
    this.lookKey = key;
    for (let i = 0; i < R.count; i++) {
      paintFigure(this.mesh, i, passengerLook(i, 7, c));
      this.carries[i] = carryFor(i, c);
    }
    for (let k = 0; k < R.background; k++) {
      const look = passengerLook(k, 3, c);
      this.far.setColorAt(k * 2, this.color.setHex(look.coat));
      this.far.setColorAt(k * 2 + 1, this.color.setHex(look.hair));
    }
    if (this.far.instanceColor) this.far.instanceColor.needsUpdate = true;
  }

  update(dt: number, time: number, feet: Vector3, yaw: number, out: AudioOut | null): void {
    this.clock += dt;
    this.out = out;
    this.push.set(0, 0, 0);
    this.pace = 1;
    this.canShove = false;
    const b = this.passage.bounds;
    const inside = feet.x > b.x0 - 4 && feet.x < b.x1 + 4 && feet.y > b.y - 1.5 && feet.y < b.y + 3 && feet.z > b.z0 - 14 && feet.z < b.z1 + 1;
    const busy = this.forceBusy ?? this.busy;
    this.target = rushCount(busy);
    if (this.clock - this.hoursAt > 1) {
      this.hoursAt = this.clock;
      // Mornings pour off the commuter trains toward the metro, evenings the other way.
      this.share = stockholm(time).hours < 12 ? 0.3 : 0.65;
    }
    if (!inside || this.target === 0) {
      if (this.shown) this.hide();
      this.murmurLevel(0);
      this.runStart = null;
      return;
    }

    const pz = clamp(feet.z, this.zMin, this.zMax);
    this.wMin = Math.max(this.zMin, pz - R.window);
    this.wMax = Math.min(this.zMax, pz + R.window);
    if (!this.shown) this.fill();
    const moved = dt > 0 ? Math.hypot(feet.x - this.last.x, feet.z - this.last.z) / dt : 0;
    this.last.copy(feet);

    this.admit();
    this.buildGrid();
    this.steer(dt, feet);
    this.buildGrid();
    this.separate(feet, moved, dt);
    this.moods(dt, feet);
    this.retire();
    this.draw(feet, yaw);
    this.background(pz);
    this.progress(feet, busy);
    this.murmurLevel(Math.min(1, this.nearby / 40) * 0.09);

    this.kick.multiplyScalar(Math.exp(-dt * 6));
    this.heat = Math.max(0, this.heat - dt / 25);
    this.push.add(this.kick);
    if (this.push.length() > 4) this.push.setLength(4);
    this.reach.set(feet.x, feet.y + 1, feet.z);
  }

  /** The player's elbow: pushes whoever is right in front aside. */
  shove(): string | void {
    if (this.clock < this.shoveReady) return;
    this.shoveReady = this.clock + R.shoveCooldown;
    const px = this.reach.x, pz = this.reach.z;
    const fx = this.fx, fz = this.fz;
    let hit = 0;
    for (let i = 0; i < R.count; i++) {
      if (this.state[i] !== WALKING || this.down[i] > 0) continue;
      const dx = this.x[i] - px, dz = this.z[i] - pz;
      const d = Math.hypot(dx, dz);
      if (d > R.shoveReach || d < 1e-3 || (dx * fx + dz * fz) / d < 0.45) continue;
      // Aside, away from the line you are walking along.
      const side = dx * -fz + dz * fx >= 0 ? 1 : -1;
      this.vx[i] = fx * 1.4 - fz * side * 2.2;
      this.vz[i] = fz * 1.4 + fx * side * 2.2;
      this.stun[i] = 0.9;
      this.anger[i] += 0.8;
      if (this.muck[i] > 0) {
        if (Math.random() < 0.55) this.shoveBack(i);
        else { this.muck[i] = 0; this.talk(i, sv.rush.backOff); }
      } else if (this.hothead(i) && this.anger[i] > 1) this.startMuck(i);
      else if (hit === 0) this.talk(i, sv.rush.shoved);
      if (++hit >= 4) break;
    }
    if (hit === 0) return;
    this.shoves++;
    this.kick.x += fx * 1.2;
    this.kick.z += fz * 1.2;
    this.events.lurch(0.25);
    if (this.out) thump(this.out, 0.3, 150);
  }

  /** A punch at whoever is right in front: they go down, bystanders back off, someone may hit back. */
  punch(): void {
    if (!this.shown || this.clock < this.shoveReady) return;
    this.shoveReady = this.clock + R.shoveCooldown * 1.5;
    const px = this.reach.x, pz = this.reach.z;
    let target = -1;
    let best = R.punchReach;
    for (let i = 0; i < R.count; i++) {
      if (this.state[i] !== WALKING || this.down[i] > 0) continue;
      const dx = this.x[i] - px, dz = this.z[i] - pz;
      const d = Math.hypot(dx, dz);
      if (d < best && d > 1e-3 && (dx * this.fx + dz * this.fz) / d > 0.6) { best = d; target = i; }
    }
    this.events.lurch(0.35);
    if (target < 0) return;
    const i = target;
    this.punches++;
    this.heat += 1;
    // Knocked flat on their back, away from you.
    this.yaw[i] = Math.atan2(px - this.x[i], pz - this.z[i]);
    this.down[i] = DOWN;
    this.muck[i] = 0;
    this.vx[i] = this.fx * 1.5;
    this.vz[i] = this.fz * 1.5;
    this.anger[i] = 2;
    if (this.hothead(i) || i % 17 === 0) this.retaliate[i] = DOWN + 0.3;
    if (this.out) thump(this.out, 0.6, 240);
    // Everyone around shrinks back, and a hothead friend steps in.
    let friend = false;
    for (let j = 0; j < R.count; j++) {
      if (j === i || this.state[j] !== WALKING || this.down[j] > 0) continue;
      const dx = this.x[j] - px, dz = this.z[j] - pz;
      const d = Math.hypot(dx, dz);
      if (d > 2.6 || d < 1e-3) continue;
      this.vx[j] = (dx / d) * 1.8;
      this.vz[j] = (dz / d) * 1.8;
      this.stun[j] = 0.6;
      this.anger[j] += 0.6;
      if (!friend && this.hothead(j) && d < 2) { friend = true; this.retaliate[j] = 0.8; this.muck[j] = 2; }
    }
    this.talk(i, sv.rush.punched, true);
    if (this.heat >= GUARDS_AT) this.guards();
  }

  /** The guards have seen enough: out to the ticket hall. */
  private guards(): void {
    this.heat = 0;
    const b = this.passage.bounds;
    this.events.say(text.rush.guards, 7);
    this.events.escort(new Vector3((b.x0 + b.x1) / 2, b.y, b.z0 - 4), 0);
  }

  /** Someone hits the player back, if they are still close enough. */
  private hitBack(i: number): void {
    const dx = this.reach.x - this.x[i], dz = this.reach.z - this.z[i];
    const d = Math.hypot(dx, dz);
    if (d > 1.8) { this.talk(i, sv.rush.comeHere, true); return; }
    this.fights++;
    this.kick.x += (dx / Math.max(0.1, d)) * 7;
    this.kick.z += (dz / Math.max(0.1, d)) * 7;
    this.events.lurch(1.5);
    if (this.out) thump(this.out, 0.7, 200);
    this.talk(i, sv.rush.hitBack, true);
  }

  /** The walkable width at `z`: between the moving walkways' balustrades where they run, wall to wall elsewhere. */
  private lanes(z: number): [number, number] {
    const b = this.passage.bounds;
    const along = z - b.z0;
    if (along < V.z0 - 0.8 || along > V.z1 + 0.8) return [this.xl, this.xr];
    const inset = V.wall + V.width + V.rail;
    return [this.xl + inset, this.xr - inset];
  }

  private hothead(i: number): boolean {
    return i % 5 === 0;
  }

  private hide(): void {
    this.shown = false;
    this.mesh.visible = false;
    this.far.visible = false;
    this.state.fill(OFF);
  }

  private park(i: number, state: typeof OFF | typeof WAITING): void {
    this.state[i] = state;
    hideFigure(this.mesh, i);
  }

  private spawn(i: number, z: number): void {
    this.state[i] = WALKING;
    const [xl, xr] = this.lanes(z);
    this.x[i] = xl + Math.random() * (xr - xl);
    this.z[i] = z;
    this.vx[i] = 0;
    this.vz[i] = this.dir[i] * this.pref[i];
    this.yaw[i] = this.dir[i] > 0 ? 0 : Math.PI;
    this.anger[i] = this.stun[i] = this.muck[i] = this.blocked[i] = this.down[i] = this.retaliate[i] = 0;
    this.shovedBack[i] = 0;
  }

  /** Fresh commuters, spread through the window by the density profile. */
  private fill(): void {
    this.shown = true;
    this.mesh.visible = true;
    this.far.visible = true;
    const want = this.allowed();
    for (let i = 0; i < R.count; i++) {
      this.dir[i] = Math.random() < this.share ? 1 : -1;
      this.pref[i] = R.speed * (0.8 + Math.random() * 0.4);
      this.lane[i] = Math.random() * 2 - 1;
      this.park(i, i < this.target ? WAITING : OFF);
      this.entry[i] = this.dir[i] > 0 ? -1 : 1;
    }
    let placed = 0;
    for (let i = 0; i < this.target && placed < want; i++) {
      for (let tries = 0; tries < 8; tries++) {
        const z = this.wMin + Math.random() * (this.wMax - this.wMin);
        if (Math.random() < rushProfile(z - this.passage.bounds.z0)) { this.spawn(i, z); placed++; break; }
      }
    }
  }

  /** How many commuters belong in the window right now. */
  private allowed(): number {
    let sum = 0;
    for (let k = 0; k < 8; k++) sum += rushProfile(this.wMin + (this.wMax - this.wMin) * (k + 0.5) / 8 - this.passage.bounds.z0);
    return Math.round(this.target * (sum / 8) * (this.wMax - this.wMin) / (R.window * 2));
  }

  /** Waiting commuters step in at the window's edges while there is room. */
  private admit(): void {
    let walking = 0;
    for (let i = 0; i < R.count; i++) if (this.state[i] === WALKING) walking++;
    const want = this.allowed();
    for (let i = 0; i < this.target && walking < want; i++) {
      if (this.state[i] === OFF) this.state[i] = WAITING;
      if (this.state[i] !== WAITING) continue;
      // A few at a time, so they do not arrive in a clump.
      if (Math.random() > 0.35) continue;
      this.spawn(i, this.entry[i] < 0 ? this.wMin + Math.random() * 0.6 : this.wMax - Math.random() * 0.6);
      walking++;
    }
  }

  /** Commuters who leave the window wait to come back in at the other end. */
  private retire(): void {
    for (let i = 0; i < R.count; i++) {
      if (this.state[i] !== WALKING) continue;
      const out = this.z[i] > this.wMax + 0.3 ? 1 : this.z[i] < this.wMin - 0.3 ? -1 : 0;
      if (!out) continue;
      this.park(i, i < this.target ? WAITING : OFF);
      this.entry[i] = -out;
    }
  }

  private cell(z: number): number {
    return clamp(Math.floor((z - this.wMin + 3) / CELL), 0, MAX_CELLS - 1);
  }

  private buildGrid(): void {
    this.head.fill(-1);
    for (let i = 0; i < R.count; i++) {
      if (this.state[i] !== WALKING) continue;
      const c = this.cell(this.z[i]);
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }

  /** Where each commuter wants to go: forward, a little to the right, around whoever is in the way. */
  private steer(dt: number, feet: Vector3): void {
    const busker = this.passage.busker;
    for (let i = 0; i < R.count; i++) {
      if (this.state[i] !== WALKING) continue;
      const [xl, xr] = this.lanes(this.z[i]);
      const mid = (xl + xr) / 2;
      const half = (xr - xl) / 2;
      const d = this.dir[i];
      // Facing +z your right hand is toward -x: keep right, loosely.
      let side = (mid - d * 0.3 * half + this.lane[i] * 0.45 * half - this.x[i]) * 0.5;
      let clear = 1;
      const c = this.cell(this.z[i]);
      for (let cc = Math.max(0, c - 1); cc <= Math.min(MAX_CELLS - 1, c + 2); cc++) {
        for (let j = this.head[cc]; j >= 0; j = this.next[j]) {
          if (j === i) continue;
          const ahead = (this.z[j] - this.z[i]) * d;
          const across = this.x[j] - this.x[i];
          if (ahead <= 0 || ahead > 1.3 || Math.abs(across) > 0.55) continue;
          if (this.dir[j] === d) clear = Math.min(clear, (ahead - 0.5) / 0.8);
          else {
            clear = Math.min(clear, (ahead - 0.5) / 0.8 + 0.3);
            side += -d * 0.8 + (across > 0 ? -0.3 : 0.3);
          }
        }
      }
      // The player is in the way too, and people behind you want past.
      const ahead = (feet.z - this.z[i]) * d;
      const across = feet.x - this.x[i];
      if (ahead > 0 && ahead < 1.6 && Math.abs(across) < 0.6) {
        clear = Math.min(clear, (ahead - 0.55) / 0.8);
        side += across > 0 ? -0.7 : 0.7;
        this.blocked[i] += dt;
      } else this.blocked[i] = Math.max(0, this.blocked[i] - dt * 2);
      if (Math.abs(busker.z - this.z[i]) < 1.5) side += (this.x[i] - busker.x > 0 ? 1 : -1) * 0.8;
      clear = clamp(clear, 0.05, 1);
      this.clear[i] = clear;
      const lying = this.down[i] > 0;
      const want = lying || this.stun[i] > 0 || this.muck[i] > 0 ? 0 : this.pref[i] * clear;
      if (lying) side = 0;
      const k = Math.min(1, dt * (lying ? 5 : this.stun[i] > 0 ? 1.5 : 4));
      this.vx[i] += (clamp(side, -0.8, 0.8) - this.vx[i]) * k;
      this.vz[i] += (d * want - this.vz[i]) * k;
      this.x[i] += this.vx[i] * dt;
      this.z[i] += this.vz[i] * dt;
    }
  }

  /** Bodies do not overlap: the crowd presses apart, and presses on you. */
  private separate(feet: Vector3, playerSpeed: number, dt: number): void {
    const min = R.radius * 2;
    const weight = (i: number) => (this.stun[i] > 0 ? 1.6 : this.muck[i] > 0 ? 0.3 : 1);
    for (let i = 0; i < R.count; i++) {
      if (this.state[i] !== WALKING) continue;
      const c = this.cell(this.z[i]);
      for (let cc = Math.max(0, c - 1); cc <= Math.min(MAX_CELLS - 1, c + 1); cc++) {
        for (let j = this.head[cc]; j >= 0; j = this.next[j]) {
          if (j <= i) continue;
          const dx = this.x[j] - this.x[i], dz = this.z[j] - this.z[i];
          const d2 = dx * dx + dz * dz;
          if (d2 >= min * min || d2 < 1e-8) continue;
          const d = Math.sqrt(d2);
          const overlap = (min - d) / d;
          const wi = weight(i), wj = weight(j);
          const si = wi / (wi + wj);
          this.x[i] -= dx * overlap * si;
          this.z[i] -= dz * overlap * si;
          this.x[j] += dx * overlap * (1 - si);
          this.z[j] += dz * overlap * (1 - si);
        }
      }
    }

    const reach = R.radius + R.playerRadius;
    const fx = this.fx, fz = this.fz;
    let ahead = 0;
    this.nearby = 0;
    const busker = this.passage.busker;
    for (let i = 0; i < R.count; i++) {
      if (this.state[i] !== WALKING) continue;
      const dx = this.x[i] - feet.x, dz = this.z[i] - feet.z;
      const d = Math.hypot(dx, dz);
      const lying = this.down[i] > 0;
      if (d < reach && d > 1e-4 && !lying) {
        const overlap = reach - d;
        // Most give way; someone arguing with you stands firm and leans in.
        const give = this.muck[i] > 0 ? 0.25 : this.stun[i] > 0 ? 0.95 : 0.7;
        this.x[i] += (dx / d) * overlap * give;
        this.z[i] += (dz / d) * overlap * give;
        this.push.x -= (dx / d) * overlap * (1 - give) * 10;
        this.push.z -= (dz / d) * overlap * (1 - give) * 10;
        if (playerSpeed > 0.5) {
          const before = this.anger[i];
          this.anger[i] += dt * 1.2;
          if (before < 0.5 && this.anger[i] >= 0.5 && Math.random() < 0.6) this.talk(i, sv.rush.bump);
          if (this.hothead(i) && this.anger[i] > 1.1 && this.muck[i] <= 0) this.startMuck(i);
        }
      }
      if (d < 8) this.nearby++;
      if (!lying && d < 1.1 && d > 1e-4 && (dx * fx + dz * fz) / d > 0.3) ahead += 1.1 - d;
      if (!lying && d < R.shoveReach && d > 1e-4 && (dx * fx + dz * fz) / d > 0.45) this.canShove = true;
      // Walls and the busker.
      this.x[i] = clamp(this.x[i], ...this.lanes(this.z[i]));
      const bx = this.x[i] - busker.x, bz = this.z[i] - busker.z;
      const bd = Math.hypot(bx, bz);
      if (bd < 0.75 && bd > 1e-4) {
        this.x[i] = busker.x + (bx / bd) * 0.75;
        this.z[i] = busker.z + (bz / bd) * 0.75;
      }
      this.x[i] = clamp(this.x[i], ...this.lanes(this.z[i]));
    }
    this.pace = clamp(1 / (1 + ahead * 0.9), 0.28, 1);
  }

  private moods(dt: number, feet: Vector3): void {
    for (let i = 0; i < R.count; i++) {
      if (this.state[i] !== WALKING) continue;
      this.stun[i] = Math.max(0, this.stun[i] - dt);
      this.anger[i] = Math.max(0, this.anger[i] - dt * 0.12);
      this.down[i] = Math.max(0, this.down[i] - dt);
      if (this.retaliate[i] > 0) {
        this.retaliate[i] -= dt;
        if (this.retaliate[i] <= 0) this.hitBack(i);
      }
      if (this.muck[i] > 0) {
        this.muck[i] -= dt;
        const d = Math.hypot(this.x[i] - feet.x, this.z[i] - feet.z);
        // After a couple of seconds of words, a hothead still in your face shoves you back.
        if (this.muck[i] > 0 && this.muck[i] < 2.5 && d < 0.9 && !this.shovedBack[i]) this.shoveBack(i);
        if (this.muck[i] <= 0) this.anger[i] = 0.3;
      }
      if (this.blocked[i] > 2.5) {
        this.blocked[i] = 0;
        this.talk(i, sv.rush.passBy);
      }
    }
  }

  private startMuck(i: number): void {
    this.muck[i] = 4.5;
    this.shovedBack[i] = 0;
    this.fights++;
    this.talk(i, sv.rush.muck, true);
  }

  private shoveBack(i: number): void {
    this.shovedBack[i] = 1;
    const dx = this.reach.x - this.x[i], dz = this.reach.z - this.z[i];
    const d = Math.max(0.1, Math.hypot(dx, dz));
    this.kick.x += (dx / d) * 5;
    this.kick.z += (dz / d) * 5;
    this.muck[i] = Math.min(this.muck[i], 1);
    this.events.lurch(0.9);
    if (this.out) thump(this.out, 0.4, 120);
    this.talk(i, sv.rush.shoveBack, true);
  }

  private talk(i: number, lines: string[], urgent = false): void {
    if (!urgent && this.clock < this.talkReady) return;
    this.talkReady = this.clock + R.talkCooldown;
    const line = pick(lines);
    this.events.say(line, 2.6);
    this.events.speak(line, 0.75 + (i % 6) * 0.1, 1.15);
  }

  private draw(feet: Vector3, yaw: number): void {
    this.fx = -Math.sin(yaw);
    this.fz = -Math.cos(yaw);
    let top = 0;
    for (let i = 0; i < R.count; i++) {
      if (this.state[i] !== WALKING) continue;
      top = i + 1;
      const speed = Math.hypot(this.vx[i], this.vz[i]);
      const mucking = this.muck[i] > 0;
      const lying = this.down[i] > 0;
      const phoning = !mucking && !this.past && i % 11 === 3;
      let heading = lying ? this.yaw[i] : this.dir[i] > 0 ? 0 : Math.PI;
      if (mucking && !lying) heading = Math.atan2(feet.x - this.x[i], feet.z - this.z[i]);
      else if (!lying && speed > 0.3 && this.stun[i] <= 0) heading = Math.atan2(this.vx[i], this.vz[i]);
      const turn = Math.atan2(Math.sin(heading - this.yaw[i]), Math.cos(heading - this.yaw[i]));
      this.yaw[i] += turn * Math.min(1, 0.15 + (mucking ? 0.2 : 0));
      drawFigure(this.mesh, i, {
        x: this.x[i], y: this.passage.bounds.y, z: this.z[i], yaw: this.yaw[i],
        walking: speed > 0.12 && !mucking && !lying,
        carry: lying ? undefined : phoning ? 'phone' : this.carries[i],
        arm: lying ? undefined : mucking ? 'wave' : phoning ? 'phone' : undefined,
        look: mucking ? 0 : undefined,
        // Down on the back fast, then slowly up again.
        sway: lying ? -1.45 * Math.min(1, (DOWN - this.down[i]) / 0.3, this.down[i] / 0.7)
          : this.stun[i] > 0 ? -0.35 * this.stun[i] : this.clear[i] < 0.4 ? 0.07 : 0,
        scale: i % 17 === 0 ? 1.1 : undefined,
      }, this.clock);
    }
    this.mesh.count = Math.max(top, 1) * PARTS;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Silhouettes walking the rest of the passage, outside the simulated window. */
  private background(pz: number): void {
    const b = this.passage.bounds;
    const span = this.zMax - this.zMin;
    const level = Math.min(1, this.target / R.count);
    const hidden = this.hidden;
    for (let k = 0; k < R.background; k++) {
      const h = (n: number) => hash01(k, n + 60);
      const dir = h(1) < this.share ? 1 : -1;
      const z = this.zMin + fract(h(2) + dir * (0.9 + h(3) * 0.5) * this.clock / span) * span;
      const visible = Math.abs(z - pz) > R.window - 0.5 && h(4) < level * rushProfile(z - b.z0);
      if (!visible) {
        this.far.setMatrixAt(k * 2, hidden);
        this.far.setMatrixAt(k * 2 + 1, hidden);
        continue;
      }
      const x = this.xl + h(5) * (this.xr - this.xl);
      const size = 0.92 + h(6) * 0.16;
      const bob = Math.abs(Math.sin(this.clock * 5.5 + k)) * 0.04;
      this.far.setMatrixAt(k * 2, this.matrix.makeScale(0.42 * size, 0.68 * size, 0.28 * size).setPosition(x, b.y + 0.9 * size + bob, z));
      this.far.setMatrixAt(k * 2 + 1, this.matrix.makeScale(0.23 * size, 0.145 * size, 0.23 * size).setPosition(x, b.y + 1.63 * size + bob, z));
    }
    this.far.instanceMatrix.needsUpdate = true;
  }

  /** Times a run from the hall end to the gates, at rush hour. */
  private progress(feet: Vector3, busy: number): void {
    const b = this.passage.bounds;
    const inPassage = feet.x > b.x0 && feet.x < b.x1 && feet.z > b.z0;
    if (!inPassage || feet.z < b.z0 + 12) {
      this.runStart = inPassage && busy >= 0.6 ? this.clock : null;
      if (this.runStart !== null) { this.shoves = 0; this.fights = 0; this.punches = 0; }
      return;
    }
    if (this.runStart === null || feet.z < this.passage.gateZ - 1.5) return;
    const seconds = this.clock - this.runStart;
    this.runStart = null;
    let best = Infinity;
    try { best = Number(localStorage.getItem(BEST_KEY) ?? Infinity) || Infinity; } catch { /* No record kept. */ }
    const record = seconds < best;
    if (record) try { localStorage.setItem(BEST_KEY, String(Math.round(seconds))); } catch { /* Session only. */ }
    const summary = text.rush.finish.replace('{time}', minutes(seconds)).replace('{shoves}', String(this.shoves)).replace('{fights}', String(this.fights)).replace('{punches}', String(this.punches));
    this.events.say(`${summary} ${record ? text.rush.record : text.rush.best.replace('{time}', minutes(best))}`, 8);
  }

  private murmurLevel(level: number): void {
    const out = this.out;
    if (!out) return;
    if (!this.murmur) {
      if (level <= 0) return;
      // Voices blur into a murmur: pink noise through two wandering formants.
      const gain = out.ctx.createGain();
      gain.gain.value = 0;
      const filters = [480, 1150].map((f) => {
        const filter = out.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = f;
        filter.Q.value = 1.4;
        loopNoise(out, 'pink').connect(filter).connect(gain);
        return filter;
      });
      gain.connect(out.bus);
      this.murmur = { gain, filters };
    }
    const t = out.ctx.currentTime;
    this.murmur.gain.gain.setTargetAtTime(level, t, 0.4);
    if (level > 0 && this.clock > this.murmurAt) {
      this.murmurAt = this.clock + 0.12;
      this.murmur.filters[0].frequency.setTargetAtTime(380 + Math.random() * 320, t, 0.05);
      this.murmur.filters[1].frequency.setTargetAtTime(900 + Math.random() * 700, t, 0.05);
    }
  }
}

function fract(v: number): number {
  return v - Math.floor(v);
}
