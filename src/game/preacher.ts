import { BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, Vector3, type Scene } from 'three';
import { dayNumber } from './calendar';
import { hash01, serviceOpen, stockholm } from './clock';
import { drawFigure, figureMesh, paintFigure } from './figures';
import { createCanvasSign, fitText } from './gfx/signs';
import text from './i18n/sv.json';
import { TRAIN_HALF_W } from './layout';
import { noiseBurst, Spatial, type AudioOut } from './sfx';
import type { Train } from './train';
import type { StationInfo } from './world/station';
import type { Location } from './world/world';
import type { Interactable } from './world/zones';

/**
 * A street preacher in T-Centralen's ticket hall, an invented character in
 * the spirit of the ones every metro rider has met. She stands on the
 * street side of the gates with a hand-painted sign and a Bible, preaching
 * to nobody in particular. Come within a dozen meters and she comes running
 * after you, calling out, the way you went: through the gates, down the
 * escalators and onto your train while its doors are open. Outrun her by far
 * enough or leave on a train without her and she gives up. If she catches
 * you, she takes you by the arm and you get the whole sermon. Taking one of her
 * leaflets calms her down. Now and then a teenager cuts through the hall and
 * she runs after them instead, all the way to the gates. Her days and hours
 * are the same for everyone; the chases are yours alone.
 */

/** Where she stands, along the hall from the escalator top (`a`) and across it (`z`). */
const HOME = { a: 14.6, z: 3.4 };
/** The street side of the gates, where she stays: from the gates to the end wall. */
const AREA = { a0: 13.3, a1: 31.4, halfW: 8.4 };
const NOTICE = 12;
const SPEED = 3.9;
const CATCH = 1.5;
/** She gives up when you are this far ahead of her along the way you ran, or after this long. */
const GIVE_UP = { distance: 30, seconds: 60 };
const REST = 60;
/**
 * Someone else to run after: a teenager walks in from the street end toward the gates, bolts when she comes, and is
 * through the gates before she catches up. Seconds between them, and where they walk.
 */
const PASSER = { every: [35, 70], from: 30.8, z: 4.6, notice: 8, walk: 1.4, run: 4.6, gone: AREA.a0 - 7 };
/** How near you must be to hear her calls when she is after someone else. */
const HEARD = 25;
/** Once she has ridden off on a train she cannot walk home; she is back at her spot as soon as you are this far away. */
const OUT_OF_SIGHT = 35;
/** How far off a train's middle she stands once aboard, clear of the doors. */
const INSIDE = TRAIN_HALF_W - 0.6;

/** A step of your way: on the ground, or inside a train (then relative to it, so it moves with the train). */
interface Step {
  p: Vector3;
  on: Train | null;
}

/** Whether she is out preaching: most days, late morning to early evening, while the trains run. */
export function preaching(epoch: number): boolean {
  const c = stockholm(epoch);
  if (!serviceOpen(epoch) || c.hours < 10 || c.hours >= 19) return false;
  return hash01(dayNumber(epoch), 161) < 0.7;
}

type Mood = 'preaching' | 'chasing' | 'hunting' | 'sermon' | 'calm';

function signBoard() {
  return createCanvasSign(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#efe6cf';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#b3161c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, text.preacher.sign[0], w - 50, 900, 76, 'Georgia, "Times New Roman", serif');
    ctx.fillText(text.preacher.sign[0], w / 2, h * 0.33);
    ctx.fillStyle = '#1b1b1b';
    fitText(ctx, text.preacher.sign[1], w - 60, 800, 44, 'Georgia, "Times New Roman", serif');
    ctx.fillText(text.preacher.sign[1], w / 2, h * 0.72);
  });
}

export class Preacher {
  readonly interactable: Interactable;
  private readonly figure = figureMesh(1);
  /** The teenager she runs after, when one cuts through the hall. */
  private readonly runner = figureMesh(1);
  private passer: { a: number; running: boolean } | null = null;
  private nextPasser = 20;
  /**
   * Where you ran while she chases you: she runs the same way, so she goes wherever you go without walking through
   * walls, through the gates, down the escalators and onto the train, if its doors are still open.
   */
  private trail: Step[] = [];
  /** The train she rides, and where in it she stands. */
  private on: Train | null = null;
  /** The train she is aboard, if any. */
  get train(): Train | null {
    return this.on;
  }
  private readonly local = new Vector3();
  /** She has ridden a train since she left her spot, so the way home is not one she can walk back. */
  private travelled = false;
  private lost = false;
  /** Where she has run since she left her spot, and the same way reversed while she walks home. */
  private way: Vector3[] = [];
  private back: Vector3[] = [];
  private readonly last = new Vector3();
  private readonly home = new Vector3();
  private readonly sign = new Group();
  private readonly pos = new Vector3();
  private readonly hall: StationInfo | null;
  private mood: Mood = 'preaching';
  private yaw = 0;
  private clock = 0;
  private since = 0;
  private rest = 0;
  private nextLine = 0;
  private line = 0;
  private placed = false;
  private voice: Spatial | null = null;
  private lastStep = 0;
  /** How freely the player can walk while she holds them with her sermon. */
  pace = 1;

  constructor(scene: Scene, stations: StationInfo[], private readonly events: {
    say(message: string, seconds: number): void;
    speak(message: string, pitch: number, rate: number): void;
    lurch(strength: number): void;
    /** A train's doors are open, so she can get on or off it. */
    doorsOpen(train: Train): boolean;
  }) {
    this.hall = stations.find((s) => s.name === 'T-Centralen') ?? null;
    paintFigure(this.figure, 0, { coat: 0x4a2f4f, torso: 0x6b2430, skin: 0xe2b89a, hair: 0x9a9aa0, bag: 0x2a2320, trousers: 0x2b2d33, shoes: 0x1a1a1a, prop: 0x1b1b1b, build: 'woman', skirt: 0x3a2a3f, legs: 0x2b2d33, back: 'none' });
    this.figure.name = 'street-preacher';
    this.figure.visible = false;
    scene.add(this.figure);
    paintFigure(this.runner, 0, { coat: 0x2d2f36, torso: 0x2d2f36, skin: 0xd9ae8c, hair: 0x3a2a1e, bag: 0x1c1d22, trousers: 0x3b4a66, shoes: 0xe8e8e4, build: 'man', back: 'none' });
    this.runner.name = 'fleeing-teenager';
    this.runner.visible = false;
    scene.add(this.runner);
    // A hand-painted sign on a stick, held up high.
    const stick = new Mesh(new CylinderGeometry(0.02, 0.02, 1.9, 6), new MeshLambertMaterial({ color: 0x7a5a36 }));
    stick.position.y = 0.95;
    const board = new Mesh(new PlaneGeometry(0.9, 0.45), signBoard().material);
    board.position.y = 2.05;
    (board.material as MeshBasicMaterial).side = DoubleSide;
    const back = new Mesh(new BoxGeometry(0.92, 0.47, 0.02), new MeshLambertMaterial({ color: 0x8a6a45 }));
    back.position.set(0, 2.05, -0.015);
    this.sign.add(stick, back, board);
    this.sign.visible = false;
    scene.add(this.sign);
    this.interactable = {
      pos: this.pos, radius: 1.8,
      get prompt() { return text.preacher.prompt; },
      enabled: () => this.figure.visible && this.mood !== 'calm',
      act: () => this.calm(),
    };
  }

  private x(a: number): number {
    const s = this.hall!;
    return s.hallX(a);
  }

  /** Takes a leaflet: she beams, blesses you and goes back to her spot. */
  private calm(): string {
    this.giveUp(null, REST);
    this.mood = 'calm';
    this.pace = 1;
    return text.preacher.leaflet;
  }

  /** @param train the train the player is aboard, if any */
  update(dt: number, time: number, here: Location, feet: Vector3, train: Train | null, out: AudioOut | null): void {
    this.clock += dt;
    this.pace = 1;
    const s = this.hall;
    const on = s !== null && preaching(time);
    const inHall = on && here.station === s!.index && here.area === 'hall' && !here.label && Math.abs(feet.y - s!.hall.y) < 2;
    this.figure.visible = on && Math.abs(feet.x - this.pos.x) < 150;
    this.sign.visible = this.figure.visible;
    if (!on || !s) { this.placed = false; this.passer = null; this.runner.visible = false; return; }
    // Aboard a train she goes where it goes.
    if (this.on) this.pos.copy(this.on.position).add(this.local);
    if (!this.placed || (this.lost && this.pos.distanceTo(feet) > OUT_OF_SIGHT)) {
      this.placed = true;
      this.pos.set(this.x(HOME.a), s.hall.y, HOME.z);
      this.home.copy(this.pos);
      this.mood = 'preaching';
      this.trail.length = 0;
      this.way.length = 0;
      this.back.length = 0;
      this.on = null;
      this.travelled = this.lost = false;
    }
    const dx = feet.x - this.pos.x;
    const dz = feet.z - this.pos.z;
    const distance = Math.hypot(dx, feet.y - this.pos.y, dz);
    this.rest = Math.max(0, this.rest - dt);
    const along = (feet.x - this.x(0)) * s.exitDir;
    const reachable = inHall && along > AREA.a0 - 0.5 && along < AREA.a1;

    if (this.mood === 'calm' && this.rest <= 0) this.mood = 'preaching';

    // Now and then someone cuts through the hall, while you are near enough to see it.
    const passerX = () => this.x(this.passer!.a);
    if (!this.passer && this.figure.visible && this.mood === 'preaching' && !this.back.length && !this.lost && this.rest <= 0 && this.clock > this.nextPasser && Math.abs(feet.x - this.pos.x) < 60) {
      this.passer = { a: PASSER.from, running: false };
    }
    if (this.passer) {
      this.passer.a -= (this.passer.running ? PASSER.run : PASSER.walk) * dt;
      const near = Math.hypot(passerX() - this.pos.x, PASSER.z - this.pos.z);
      if (this.mood === 'preaching' && !this.back.length && !this.lost && !this.passer.running && near < PASSER.notice) {
        this.mood = 'hunting';
        this.passer.running = true;
        this.since = 0;
        this.nextLine = 0;
        if (distance < HEARD) this.events.say(text.preacher.passer, 3);
      }
      if (this.passer.a < PASSER.gone) {
        this.passer = null;
        this.nextPasser = this.clock + PASSER.every[0] + Math.random() * (PASSER.every[1] - PASSER.every[0]);
      }
    }

    if ((this.mood === 'preaching' || this.mood === 'hunting') && !this.lost && reachable && distance < NOTICE && this.rest <= 0) {
      this.mood = 'chasing';
      this.since = 0;
      this.nextLine = 0;
      this.back.length = 0;
      this.trail.length = 0;
      this.last.copy(feet);
      this.events.say(text.preacher.spotted, 3);
    }
    if (this.mood === 'chasing') {
      this.since += dt;
      // She runs the way you ran: through the gates, down the escalators, along the platform, onto the train.
      const jumped = this.last.distanceTo(feet) > 4 + 25 * dt;
      this.last.copy(feet);
      const step: Step = train ? { p: feet.clone().sub(train.position), on: train } : { p: feet.clone(), on: null };
      const end = this.trail[this.trail.length - 1];
      const far = end ? end.on !== step.on || end.p.distanceTo(step.p) > 0.4 : this.pos.distanceTo(feet) > 0.4;
      if (!jumped && far) this.trail.push(step);
      // You are on a train she is not on, and its doors have shut: it leaves without her.
      const missed = train !== null && this.on !== train && !this.events.doorsOpen(train);
      if (missed) {
        this.giveUp(distance < HEARD ? text.preacher.missed : null, REST * 0.5);
      } else if (jumped || this.ahead() > GIVE_UP.distance || this.since > GIVE_UP.seconds) {
        this.giveUp(distance < HEARD ? text.preacher.gaveUp : null, REST * 0.5);
      } else if (distance < CATCH) {
        // Caught in a train's doorway, she steps in with you.
        if (train && this.on !== train) this.board(train);
        this.mood = 'sermon';
        this.since = 0;
        this.nextLine = 0;
        this.trail.length = 0;
        this.events.lurch(0.6);
        this.events.say(text.preacher.caught, 5);
      } else {
        this.shortcut();
        const caught = this.trail.length ? this.chaseAlong(SPEED, dt) : (this.moveToward(feet.x, feet.y, feet.z, SPEED, dt), true);
        if (!caught) this.giveUp(distance < HEARD ? text.preacher.missed : null, REST * 0.5);
        this.footstep(out);
      }
    } else if (this.mood === 'hunting') {
      // After the teenager, through the gates and all, until they are gone down the escalators.
      if (!this.passer) this.giveUp(distance < HEARD ? text.preacher.gaveUp : null, REST * 0.5);
      else {
        this.moveToward(passerX(), s.hall.y, PASSER.z, SPEED, dt);
        this.footstep(out);
      }
    } else if (this.mood === 'sermon') {
      this.since += dt;
      // Step onto a train mid-sermon and she comes too, while the doors are open.
      if (train && this.on !== train && this.events.doorsOpen(train)) this.board(train);
      // She keeps you there, close, for the whole of it.
      this.pace = 0.35;
      if (distance > 3.2 || this.since > 20) {
        this.giveUp(text.preacher.amen, REST);
      }
    } else if (this.back.length) {
      // Home again the way she came, at a walk.
      this.follow(this.back, 1.4, dt, false);
    } else if (!this.lost) {
      // Back to her spot, slowly.
      this.moveToward(this.x(HOME.a), s.hall.y, HOME.z, 1.1, dt);
      this.clamp();
    }

    // What she calls out: to the hall in general, after someone, or straight at you.
    const running = this.mood === 'chasing' || this.mood === 'hunting';
    const heard = this.mood === 'hunting' ? distance < HEARD : this.mood !== 'preaching' || distance < 18;
    if (this.figure.visible && this.clock > this.nextLine && heard && !this.back.length) {
      const lines = running ? text.preacher.chase : this.mood === 'sermon' ? text.preacher.sermon : text.preacher.preach;
      const line = lines[this.line++ % lines.length];
      this.nextLine = this.clock + (this.mood === 'preaching' ? 9 + Math.random() * 6 : 3.2 + Math.random() * 1.5);
      if (this.mood !== 'calm') {
        this.events.say(`”${line}”`, 3.5);
        this.events.speak(line, 1.25, running ? 1.2 : 1.05);
      }
    }

    // Standing, she turns to whoever is near.
    if (this.mood === 'sermon' || (!running && !this.back.length && distance < 18)) this.yaw = Math.atan2(dx, dz);
    const moving = running || this.back.length > 0 || (this.mood !== 'sermon' && Math.hypot(this.pos.x - this.x(HOME.a), this.pos.z - HOME.z) > 0.2);
    // Her hands stay folded in prayer, whatever she is doing.
    drawFigure(this.figure, 0, {
      x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, walking: moving, running,
      arm: 'pray', sway: this.mood === 'sermon' ? 0.12 : 0,
    }, this.clock);
    this.figure.instanceMatrix.needsUpdate = true;
    // The teenager, heading for the gates: toward the escalators, the way the hall runs back.
    this.runner.visible = this.figure.visible && this.passer !== null;
    if (this.passer) {
      drawFigure(this.runner, 0, { x: passerX(), y: s.hall.y, z: PASSER.z, yaw: -s.exitDir * Math.PI / 2, walking: true, running: this.passer.running, build: 'man' }, this.clock * 1.3);
      this.runner.instanceMatrix.needsUpdate = true;
    }
    // The sign rides on her left shoulder.
    const left = this.yaw + Math.PI / 2;
    this.sign.position.set(this.pos.x + Math.sin(left) * 0.3, this.pos.y, this.pos.z + Math.cos(left) * 0.3);
    this.sign.rotation.set(0, this.yaw, moving ? Math.sin(this.clock * 6) * 0.06 : 0);
  }

  /**
   * Stops the chase and heads home the way she came, first saying why if you can hear it. After a train ride there is
   * no walking back: she stays where she is until you are out of sight, then she is at her spot again.
   */
  private giveUp(message: string | null, rest: number): void {
    this.mood = 'preaching';
    this.rest = rest;
    this.trail.length = 0;
    this.lost = this.travelled || this.on !== null;
    this.back = this.lost ? [] : this.way.reverse();
    this.way = [];
    if (message) this.events.say(message, 4);
  }

  /** Gets on: caught in the doorway she may stand on the platform edge, so she steps in past the doors. */
  private board(train: Train): void {
    this.on = train;
    this.travelled = true;
    this.local.copy(this.pos).sub(train.position);
    this.local.z = Math.max(-INSIDE, Math.min(INSIDE, this.local.z));
    this.pos.copy(train.position).add(this.local);
  }

  /**
   * Skips the start of your way while a later step of it is nearer to her: seen coming toward her, she runs at
   * you, not first to where you were when she saw you. Only on the same floor and footing, so never down a stair.
   */
  private shortcut(): void {
    while (this.trail.length > 1) {
      const [a, b] = this.trail;
      if (a.on !== this.on || b.on !== this.on) return;
      const next = this.where(b);
      if (Math.abs(next.y - this.pos.y) > 0.5 || this.pos.distanceTo(next) > this.pos.distanceTo(this.where(a))) return;
      this.trail.shift();
    }
  }

  private where(step: Step): Vector3 {
    return step.on ? step.on.position.clone().add(step.p) : step.p;
  }

  /** How far ahead of her you are, along the way you ran. */
  private ahead(): number {
    let d = 0;
    let from: Vector3 = this.pos;
    for (const step of this.trail) {
      const p = this.where(step);
      d += from.distanceTo(p);
      from = p;
    }
    return d;
  }

  /**
   * Runs along your way. She gets on or off a train only while its doors are open: aboard, she waits for them;
   * on the platform, doors closing in front of her mean the train has gone without her (false).
   */
  private chaseAlong(speed: number, dt: number): boolean {
    let budget = speed * dt;
    while (this.trail.length && budget > 0) {
      const step = this.trail[0];
      if (step.on !== this.on && !this.events.doorsOpen(step.on ?? this.on!)) return this.on !== null;
      const target = this.where(step);
      const d = this.pos.distanceTo(target);
      this.face(target);
      if (d <= budget) {
        budget -= d;
        this.pos.copy(target);
        this.on = step.on;
        this.trail.shift();
      } else {
        this.pos.lerp(target, budget / d);
        budget = 0;
      }
      if (this.on) {
        this.travelled = true;
        this.local.copy(this.pos).sub(this.on.position);
      } else if (!this.travelled) {
        const end = this.way[this.way.length - 1] ?? this.home;
        if (end.distanceTo(this.pos) > 0.5) this.way.push(this.pos.clone());
      }
    }
    return true;
  }

  /** Runs along points, dropping each as she reaches it; `mark` keeps her own way so she can walk it back. */
  private follow(points: Vector3[], speed: number, dt: number, mark = true): void {
    let budget = speed * dt;
    while (points.length && budget > 0) {
      const p = points[0];
      const d = this.pos.distanceTo(p);
      if (d <= budget) {
        budget -= d;
        this.face(p);
        this.pos.copy(p);
        points.shift();
      } else {
        this.face(p);
        this.pos.lerp(p, budget / d);
        budget = 0;
      }
      const end = this.way[this.way.length - 1] ?? this.home;
      if (mark && end.distanceTo(this.pos) > 0.5) this.way.push(this.pos.clone());
    }
  }

  private face(p: Vector3): void {
    if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) > 0.01) this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  private moveToward(x: number, y: number, z: number, speed: number, dt: number): void {
    const target = new Vector3(x, y, z);
    const d = this.pos.distanceTo(target);
    if (d < 0.05) return;
    this.face(target);
    this.pos.lerp(target, Math.min(1, (speed * dt) / d));
    if (this.on) { this.local.copy(this.pos).sub(this.on.position); return; }
    const end = this.way[this.way.length - 1] ?? this.home;
    if (!this.travelled && this.mood !== 'preaching' && this.mood !== 'calm' && end.distanceTo(this.pos) > 0.5) this.way.push(this.pos.clone());
  }

  /** She keeps to the street side of the gates at her spot, off the stairs and out of the kiosk. */
  private clamp(): void {
    const s = this.hall!;
    let a = (this.pos.x - this.x(0)) * s.exitDir;
    a = Math.max(AREA.a0, Math.min(AREA.a1, a));
    let z = Math.max(-AREA.halfW, Math.min(AREA.halfW, this.pos.z));
    if (a > 18.6 && Math.abs(z) < 2.9) z = z < 0 ? -2.9 : 2.9;
    if (a > 20.2 && a < 25.8 && z < -6) z = -6;
    this.pos.x = this.x(a);
    this.pos.y = s.hall.y;
    this.pos.z = z;
  }

  private footstep(out: AudioOut | null): void {
    if (!out || this.clock - this.lastStep < 0.28) return;
    this.lastStep = this.clock;
    this.voice ??= new Spatial(out, 2, 1.3, 40);
    this.voice.setPosition({ x: this.pos.x, y: this.pos.y, z: this.pos.z });
    this.voice.setLevel(1, 0.01);
    noiseBurst(out, this.voice.input, { type: 'bandpass', frequency: 2200, q: 1.5, volume: 0.12, decay: 0.04 });
  }
}
