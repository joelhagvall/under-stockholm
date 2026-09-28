/** What a gamepad can do in the game, wired up in `boot.ts`. */
export interface PadActions {
  move(forward: number, side: number, running: boolean): void;
  look(dx: number, dy: number): void;
  jump(): void;
  use(): void;
  sit(): void;
  map(): void;
  help(): void;
  /** Start: pause, or resume from the menu. */
  pause(): void;
  throttle(delta: number): void;
  doors(): void;
  brake(): void;
  stopDriving(): void;
  connected(on: boolean): void;
}

const DEAD = 0.18;
/** Full right stick turns this many mouse pixels a second (about 150 degrees a second at the default sensitivity). */
const LOOK_SPEED = 1200;

// The standard mapping's buttons.
const A = 0, B = 1, X = 2, Y = 3, LB = 4, LT = 6, RT = 7, BACK = 8, START = 9, L3 = 10, UP = 12, DOWN = 13;

/** A stick's axis past the dead zone, rescaled to start at 0. */
function axis(v: number): number {
  const a = Math.abs(v);
  return a < DEAD ? 0 : Math.sign(v) * (a - DEAD) / (1 - DEAD);
}

/**
 * The Gamepad API, polled once a frame from the main loop: left stick walks, right stick looks,
 * the face buttons jump, use and sit, Start pauses. In driver mode the triggers work the controller.
 */
export class Gamepads {
  private prev: boolean[] = [];
  private index: number | null = null;
  private readonly supported = typeof navigator !== 'undefined' && 'getGamepads' in navigator;

  constructor(private readonly actions: PadActions) {
    if (!this.supported) return;
    window.addEventListener('gamepadconnected', (e) => {
      this.index = e.gamepad.index;
      actions.connected(true);
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index !== this.index) return;
      this.index = null;
      this.prev = [];
      actions.move(0, 0, false);
      actions.connected(false);
    });
  }

  get active(): boolean {
    return this.index !== null;
  }

  /**
   * @param playing false while paused: only Start is read, to resume
   */
  poll(dt: number, playing: boolean, driving: boolean): void {
    if (this.index === null) return;
    const pad = navigator.getGamepads()[this.index];
    if (!pad) return;
    const down = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    const before = this.prev;
    const pressed = (i: number) => !!down[i] && !before[i];
    this.prev = down;
    if (pressed(START)) { this.actions.pause(); return; }
    if (!playing) return;
    const a = this.actions;
    if (driving) {
      a.move(0, 0, false);
      if (pressed(RT) || pressed(UP)) a.throttle(1);
      if (pressed(LT) || pressed(DOWN)) a.throttle(-1);
      if (pressed(X) || pressed(A)) a.doors();
      if (pressed(B)) a.brake();
      if (pressed(BACK)) a.stopDriving();
    } else {
      a.move(-axis(pad.axes[1] ?? 0), axis(pad.axes[0] ?? 0), !!down[LB] || !!down[L3]);
      if (pressed(A)) a.jump();
      if (pressed(X)) a.use();
      if (pressed(B)) a.sit();
      if (pressed(Y)) a.map();
      if (pressed(BACK)) a.help();
    }
    // A gentle curve: small deflections aim finely, a full one turns fast.
    const lx = axis(pad.axes[2] ?? 0);
    const ly = axis(pad.axes[3] ?? 0);
    if (lx || ly) a.look(lx * Math.abs(lx) * LOOK_SPEED * dt, ly * Math.abs(ly) * LOOK_SPEED * 0.75 * dt);
  }
}
