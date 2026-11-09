import { AdditiveBlending, MeshBasicMaterial, Vector3, type InstancedMesh, type Scene } from 'three';
import { drawCount, drawFigure, figureMesh, paintFigure } from './figures';
import sv from './i18n/sv.json';
import { text } from './i18n/text';
import { PLATFORM_HALF_W, PLATFORM_Y } from './layout';
import type { Interactable } from './world/zones';

/**
 * The ghost walk at Kymlinge: light the night watchman's lantern and he shows himself further along the platform,
 * fading when you reach him and coming back at the next place on his round. At the last one you tell him he can go
 * home, and the clock that stopped at 03.47 starts. Like the rest of the mystery, what you have done is kept in the
 * browser. The state is apart from the figure because Kymlinge's lazy builds read it and must not hold on to anything.
 */

const DONE_KEY = 'under-stockholm:ghost-walk';
/** Where he stands on each stop of his round, from the middle of the platform. */
export const WALK_STOPS = [
  { dx: -25, dz: 0.9 },
  { dx: -18.2, dz: 0.9 },
  { dx: 12, dz: -PLATFORM_HALF_W + 2.4 },
  { dx: 28.6, dz: 1.1 },
  { dx: -6, dz: 1.6 },
] as const;
/** The texts of the stops, in the order of his round. */
type Stop = (typeof sv.ghostWalk.stops)[number];
const FADE_SECONDS = 1.4;
const SHOWN = 0.6;
const NEAR = 200;

/** Index of the stop by the leaning sign, the phone and the clock, whose own use gives way while he waits there. */
export const SIGN_STOP = 2;
export const PHONE_STOP = 3;
export const CLOCK_STOP = 4;

export class GhostWalkState {
  /** The stop he is at, or -1 when the walk is not under way. */
  step = -1;
  done = false;

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
    try { this.done = storage?.getItem(DONE_KEY) === '1'; } catch { /* A fresh walk. */ }
  }

  get active(): boolean {
    return this.step >= 0;
  }

  /** Whether he is waiting at this stop of the round. */
  waitingAt(stop: number): boolean {
    return this.step === stop;
  }

  start(): void {
    this.step = 0;
  }

  /** On to the next stop; the walk is over after the last. */
  advance(): void {
    if (this.step < 0) return;
    this.step++;
    if (this.step < WALK_STOPS.length) return;
    this.step = -1;
    this.done = true;
    try { this.storage?.setItem(DONE_KEY, '1'); } catch { /* Session only. */ }
  }
}

const browserStorage = (): Storage | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

export const ghostWalk = new GhostWalkState(browserStorage());

/** The watchman himself and the use of each stop. Lives with the scene, not with Kymlinge's lazy builds. */
export class GhostWalker {
  readonly interactables: Interactable[] = [];
  private readonly mesh: InstancedMesh;
  private readonly material = new MeshBasicMaterial({ color: 0xcfe2ff, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
  private shownAt = -1;
  private opacity = 0;
  private clock = 0;

  constructor(scene: Scene, private readonly kx: number) {
    this.mesh = figureMesh(1, this.material);
    this.mesh.name = 'ghost-walker';
    this.mesh.visible = false;
    drawCount(this.mesh, 1);
    paintFigure(this.mesh, 0, { coat: 0xffffff, skin: 0xffffff, hair: 0xdfe8ff, bag: 0xffffff, trousers: 0xc8d6f0, shoes: 0xa8b8d8, build: 'man', back: 'none', prop: 0xffe2a0 });
    scene.add(this.mesh);
    WALK_STOPS.forEach((stop, i) => {
      this.interactables.push({
        pos: new Vector3(kx + stop.dx, PLATFORM_Y + 1, stop.dz), radius: 2.4,
        prompt: () => (text.ghostWalk.stops[i] as Stop)[0],
        enabled: () => ghostWalk.waitingAt(i) && this.shownAt === i && this.opacity > SHOWN * 0.7,
        act: () => { const said = (text.ghostWalk.stops[i] as Stop)[1]; ghostWalk.advance(); return said; },
      });
    });
    this.interactables.push({
      pos: new Vector3(kx - 7, PLATFORM_Y + 1, -1.6), radius: 1.8,
      prompt: () => (ghostWalk.done ? text.ghostWalk.again : text.ghostWalk.prompt),
      enabled: () => !ghostWalk.active,
      act: () => { ghostWalk.start(); return text.ghostWalk.intro; },
    });
  }

  /** @param feetX along the line: from further off than the platform is long he costs nothing to draw. */
  update(dt: number, feetX: number): void {
    this.clock += dt;
    // Fades out when he has moved on in the round, and comes back at the next stop.
    const target = ghostWalk.active && this.shownAt === ghostWalk.step ? SHOWN : 0;
    const step = (SHOWN / FADE_SECONDS) * dt;
    this.opacity = target > this.opacity ? Math.min(target, this.opacity + step) : Math.max(target, this.opacity - step);
    if (this.opacity === 0) {
      if (!ghostWalk.active) { this.mesh.visible = false; this.shownAt = -1; return; }
      this.shownAt = ghostWalk.step;
    }
    const stop = WALK_STOPS[this.shownAt];
    this.mesh.visible = stop !== undefined && Math.abs(feetX - this.kx) < NEAR;
    if (!stop || !this.mesh.visible) return;
    this.material.opacity = this.opacity * (0.85 + 0.15 * Math.sin(this.clock * 9));
    drawFigure(this.mesh, 0, { x: this.kx + stop.dx, z: stop.dz, y: PLATFORM_Y, yaw: Math.PI / 2, walking: false, arm: 'hold', carry: 'lantern' }, this.clock);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
