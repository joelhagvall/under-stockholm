import { type Scene, type Vector3 } from 'three';
import { drawFigure, figureMesh, hideFigure, paintFigure } from './figures';
import { passengerLook } from './crowd';
import { escalatorHeight, escalatorRun, onEscalatorTread } from './escalatorMotion';
import text from './i18n/sv.json';
import { ESC_ANGLE, ESC_DESIGN, ESC_RISE, ESC_SPEED } from './layout';
import { playRecording } from './recordings';
import { Spatial, type AudioOut } from './sfx';
import type { EscalatorZone } from './world/escalator';

/**
 * The Stockholm escalator rule: stand on the right, walk on the left. People
 * ride the nearest escalators; the standers keep right and the walkers pass on
 * the left. Stand still on the left yourself and the walker behind you stops,
 * says "ursäkta", then sighs, and finally tells you how it works here.
 */

/** Figures per lane: two standing on the right, two walking on the left. */
const PER_LANE = 4;
const BELT = ESC_SPEED * Math.cos(ESC_ANGLE);
const WALK = 0.75;
/** Lateral offset from the lane center to either half of the tread. */
const SIDE = ESC_DESIGN.treadWidth / 4;
const GAP = 1.1;
/** How long the walker waits behind you before each complaint, in seconds. */
const COMPLAINTS = [0.8, 5, 11];
/** Level of the recorded sigh behind you. */
const SIGH = 0.7;

interface Rider {
  lane: 1 | -1;
  walker: boolean;
  /** Distance travelled along the flight, 0 at the start (bottom for the up lane). */
  s: number;
  /** Seconds to wait before stepping on again. */
  wait: number;
}

export interface EscalatorEvents {
  say(message: string, seconds: number): void;
  speak(message: string, pitch: number, rate: number): void;
}

/** Which way is right for someone riding a lane of an escalator whose wall is at `dir`. */
export const rightSide = (dir: 1 | -1, lane: 1 | -1) => dir * lane;

/** Where a player stands on an escalator lane, if they are on one: distance along the travel direction and side (+ right). */
export function laneSpot(esc: EscalatorZone, p: Vector3): { lane: 1 | -1; s: number; right: number } | null {
  const along = (p.x - esc.wallX) * esc.dir;
  const z = p.z - esc.z;
  if (along < 0 || along > esc.run || !onEscalatorTread(z)) return null;
  if (Math.abs(p.y - escalatorHeight(along, esc.rise, esc.base)) > 0.6) return null;
  const lane: 1 | -1 = z > 0 ? 1 : -1;
  return { lane, s: lane > 0 ? along : esc.run - along, right: (z - lane * ESC_DESIGN.laneCenter) * rightSide(esc.dir, lane) };
}

export class EscalatorLife {
  private readonly mesh = figureMesh(PER_LANE * 2);
  private readonly riders: Rider[] = [];
  private escalator: EscalatorZone | null = null;
  private clock = 0;
  private blocked = 0;
  private complaints = 0;
  private asked = false;
  private voice: Spatial | null = null;

  constructor(scene: Scene, private readonly events: EscalatorEvents) {
    this.mesh.name = 'escalator-riders';
    this.mesh.visible = false;
    scene.add(this.mesh);
    for (const lane of [1, -1] as const) {
      for (let k = 0; k < PER_LANE; k++) {
        const walker = k % 2 === 1;
        this.riders.push({ lane, walker, s: (k / PER_LANE) * escalatorRun(ESC_RISE), wait: 0 });
      }
    }
    this.riders.forEach((_, i) => paintFigure(this.mesh, i, passengerLook(i, 50)));
  }

  /**
   * @param escalators every station's escalators; the nearest one is peopled
   * @param busy per escalator, 0 (empty) to 1 (rush hour): how many ride
   */
  /** @param past the time machine's 1975: nobody is on a phone */
  update(dt: number, escalators: EscalatorZone[], feet: Vector3, people: boolean, running: boolean, busyAt: number[], out: AudioOut | null, past = false): void {
    this.clock += dt;
    let esc: EscalatorZone | null = null;
    for (const e of escalators) if (!esc || Math.abs(e.wallX - feet.x) < Math.abs(esc.wallX - feet.x)) esc = e;
    const busy = esc ? busyAt[escalators.indexOf(esc)] ?? 0 : 0;
    const near = esc !== null && Math.abs(esc.wallX + esc.dir * esc.run / 2 - feet.x) < 90;
    this.mesh.visible = people && near && busy > 0.05;
    if (!this.mesh.visible || !esc) { this.blocked = 0; return; }
    if (esc !== this.escalator) {
      this.escalator = esc;
      this.riders.forEach((r, i) => { r.s = ((i % PER_LANE) / PER_LANE) * esc.run; r.wait = 0; });
    }
    const player = laneSpot(esc, feet);
    const count = Math.max(1, Math.round(PER_LANE * Math.min(1, busy + 0.25)));
    let blocker: Rider | null = null;

    this.riders.forEach((r, i) => {
      if (i % PER_LANE >= count) { hideFigure(this.mesh, i); return; }
      const moving = running && r.lane !== esc.stoppedLane;
      const belt = moving ? BELT : 0;
      // On a stopped escalator everyone walks, and nobody complains about it.
      const walking = r.walker || !moving;
      const ahead = (o: Rider) => o !== r && o.lane === r.lane && o.walker === r.walker && o.wait <= 0;
      if (r.wait > 0) {
        r.wait -= dt;
        // Nobody steps on until the one before has moved clear of the first step.
        if (r.wait <= 0 && this.riders.some((o) => ahead(o) && o.s < GAP)) r.wait = 0.2;
        hideFigure(this.mesh, i);
        return;
      }
      // Standing on a running step you ride with it; keeping your distance only holds back your own walking,
      // otherwise the steps would slide on under someone held still and they would seem to walk backwards.
      const riding = r.s + belt * dt;
      let s = riding + (walking ? WALK * dt : 0);
      // Walkers keep a step behind whoever is ahead on their side: other riders, or you on the left.
      for (const o of this.riders) {
        if (!ahead(o) || o.s <= r.s) continue;
        s = Math.min(s, Math.max(riding, o.s - GAP));
      }
      if (r.walker && moving && player && player.lane === r.lane && player.right < SIDE * 0.5 && player.s > r.s) {
        const limit = player.s - GAP;
        if (s > limit) {
          // You ride with the belt too, so this holds them at the belt's pace; only someone walking against it stops them.
          s = Math.max(r.s, limit);
          if (player.s - r.s < GAP + 0.4) blocker = r;
        }
      }
      // Held up, a walker stands still on their step instead of treading air.
      const stepping = walking && s - r.s - belt * dt > WALK * dt * 0.3;
      r.s = s;
      if (r.s > esc.run) {
        // Stepped off at the far end; someone new steps on at the start a little later.
        r.s = 0;
        r.wait = 1.5 + ((i * 7.3 + this.clock) % 4);
        hideFigure(this.mesh, i);
        return;
      }
      const along = r.lane > 0 ? r.s : esc.run - r.s;
      const right = rightSide(esc.dir, r.lane);
      const travel = esc.dir * r.lane;
      const phoning = !walking && !past && i % 3 === 0;
      drawFigure(this.mesh, i, {
        x: esc.wallX + esc.dir * along,
        y: escalatorHeight(along, esc.rise, esc.base),
        z: esc.z + r.lane * ESC_DESIGN.laneCenter + right * (walking ? -SIDE : SIDE),
        yaw: travel * Math.PI / 2,
        walking: stepping && blocker !== r,
        arm: phoning ? 'phone' : undefined,
        carry: phoning ? 'phone' : undefined,
      }, this.clock + i);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.complain(dt, blocker, esc, out);
  }

  /** Ursäkta, a sigh, then the rule spelled out. Stepping right earns a quiet thank you. */
  private complain(dt: number, blocker: Rider | null, esc: EscalatorZone, out: AudioOut | null): void {
    if (!blocker) {
      if (this.asked && this.blocked > 0) this.events.say(text.escalator.thanks, 2);
      this.blocked = 0;
      this.complaints = 0;
      this.asked = false;
      return;
    }
    this.blocked += dt;
    if (this.complaints >= COMPLAINTS.length || this.blocked < COMPLAINTS[this.complaints]) return;
    const step = this.complaints++;
    this.asked = true;
    const along = blocker.lane > 0 ? blocker.s : esc.run - blocker.s;
    if (out) {
      this.voice ??= new Spatial(out, 1.5, 1.3, 30);
      this.voice.setPosition({ x: esc.wallX + esc.dir * along, y: escalatorHeight(along, esc.rise, esc.base) + 1.6, z: esc.z + blocker.lane * ESC_DESIGN.laneCenter });
      this.voice.setLevel(1, 0.01);
    }
    if (step === 0) {
      this.events.say(text.escalator.excuse, 3);
      this.events.speak(text.escalator.excuseSpoken, 1, 1.05);
    } else if (step === 1) {
      this.events.say(text.escalator.sigh, 3);
      if (out && this.voice) playRecording(out, this.voice.input, 'sigh', SIGH);
    } else {
      this.events.say(text.escalator.rule, 4);
      this.events.speak(text.escalator.ruleSpoken, 0.9, 1.1);
    }
  }
}
