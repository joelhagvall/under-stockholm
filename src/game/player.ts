import type RAPIER from '@dimforge/rapier3d';
import { PerspectiveCamera, Vector3 } from 'three';
import { RIDE_LAYOUT } from './layout';
import { rideMotion } from './journey';
import type { Seat } from './journey';
import type { Physics } from './physics';
import { settings } from './settings';

const RADIUS = 0.3;
const HALF_HEIGHT = 0.55;
const CENTER = HALF_HEIGHT + RADIUS; // capsule center above the feet
const EYE = 1.62;
const WALK = 4.4;
const RUN = 9;
const GRAVITY = 20;
const JUMP = 6.4; // about a meter of lift: enough for benches, bins and gates
const LOOK = 0.0022;
/** A mouse move larger than this, in pixels, out of a much smaller one, is taken for the browser's glitch. */
const MOUSE_LEAP = 250;

/** First-person walker on a Rapier kinematic character controller. */
export class Player {
  readonly camera: PerspectiveCamera;
  readonly feet = new Vector3();
  yaw = 0;
  pitch = 0;
  enabled = false;
  private vy = 0;
  private grounded = false;
  private jumpQueued = false;
  private readonly keys = new Set<string>();
  private touchForward = 0;
  private touchSide = 0;
  private touchRunning = false;
  private padForward = 0;
  private padSide = 0;
  private padRunning = false;
  private readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  private bob = 0;
  seated = false;
  /** The way the seat faces, while seated: the view turns freely from it. */
  seatYaw = 0;
  private seatOffsetZ = 0;
  private eyeHeight = EYE;
  /** How tall the player is next to an adult: a child sits lower (see `life.ts`). */
  eyeScale = 1;
  private cameraSeatZ = 0;
  private ride = { distance: 0, speed: 0, acceleration: 0, enabled: false };
  private shake = 0;
  private shakeTime = 0;
  /** In driver mode the camera sits in the cab while the capsule rides behind the bulkhead. */
  driveEye: Vector3 | null = null;
  /** Velocity from outside, e.g. a crowd pressing in. It goes through the controller, so walls still stop it. */
  readonly push = new Vector3();
  /** Walking speed factor, lowered while wading through a crowd. */
  pace = 1;
  private lurchAmount = 0;
  /** How far the player walked on their own feet in the last update, and whether they ran. */
  stepped = 0;
  running = false;

  sit(seat: Seat, trainX: number, trainZ: number, floorY: number): void {
    // The collision capsule stays in the aisle, while the view moves onto the cushion.
    this.teleport(new Vector3(trainX + seat.x, floorY + 0.03, trainZ), seat.yaw);
    this.seated = true;
    this.seatYaw = seat.yaw;
    this.seatOffsetZ = seat.z;
    this.jumpQueued = false;
  }

  /** The seat's offset from the aisle, while seated. */
  get seatSide(): number {
    return this.seated ? this.seatOffsetZ : 0;
  }

  stand(): void {
    this.seated = false;
    this.seatOffsetZ = 0;
    this.jumpQueued = false;
  }

  setRide(distance: number, speed: number, acceleration: number, enabled: boolean): void {
    this.ride = { distance, speed, acceleration, enabled };
  }

  /** A short shake of the view, e.g. when a train passes the other way (camera only). */
  jolt(strength: number): void {
    this.shake = Math.max(this.shake, strength);
  }

  /** A stagger of the view on foot, e.g. after a shove in a crowd (camera only). */
  lurch(strength: number): void {
    this.lurchAmount = Math.max(this.lurchAmount, strength);
  }

  constructor(physics: Physics, spawn: Vector3, yaw: number) {
    // Nothing past the fog's far end (175 m) is visible, so the camera stops just beyond it.
    this.camera = new PerspectiveCamera(72, 1, 0.05, 185);
    this.camera.rotation.order = 'YXZ';
    const R = physics.R;
    this.collider = physics.world.createCollider(R.ColliderDesc.capsule(HALF_HEIGHT, RADIUS));
    this.controller = physics.world.createCharacterController(0.02);
    this.controller.enableAutostep(0.36, 0.15, false);
    this.controller.enableSnapToGround(0.35);
    this.controller.setMaxSlopeClimbAngle((42 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((50 * Math.PI) / 180);
    this.controller.setSlideEnabled(true);
    this.teleport(spawn, yaw);

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.target instanceof HTMLElement && e.target.closest('button, input, select, textarea, a')) return;
      this.keys.add(e.code);
      if (e.code === settings.key('jump') && !e.repeat) {
        this.jumpQueued = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.resetInput());
    // Browsers now and then report a captured mouse's movement as one leap across the screen out of nowhere (Chrome
    // on Windows, and the first move after the mouse is taken), and the view would snap round. A leap far beyond the
    // move before it is dropped; a real flick builds up over a few moves and gets through.
    let before = 0;
    document.addEventListener('pointerlockchange', () => { before = 0; });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || !document.pointerLockElement) return;
      const size = Math.max(Math.abs(e.movementX), Math.abs(e.movementY));
      const leap = size > MOUSE_LEAP && size > before * 4;
      before = size;
      if (!leap) this.look(e.movementX, e.movementY);
    });
  }

  look(dx: number, dy: number): void {
    const k = LOOK * settings.value.sensitivity;
    this.yaw -= dx * k;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * k));
  }

  setTouchMovement(forward: number, side: number): void {
    this.touchForward = forward;
    this.touchSide = side;
  }

  setTouchRunning(running: boolean): void { this.touchRunning = running; }

  /** A gamepad's left stick and run button, set every frame while one is connected. */
  setPadMovement(forward: number, side: number, running: boolean): void {
    this.padForward = forward;
    this.padSide = side;
    this.padRunning = running;
  }

  jump(): void { if (this.enabled) this.jumpQueued = true; }

  resetInput(): void {
    this.keys.clear();
    this.touchForward = this.touchSide = this.padForward = this.padSide = 0;
    this.touchRunning = this.padRunning = this.jumpQueued = false;
  }

  teleport(feet: Vector3, yaw?: number): void {
    this.stand();
    this.eyeHeight = EYE;
    this.cameraSeatZ = 0;
    this.feet.copy(feet);
    if (yaw !== undefined) {
      this.yaw = yaw;
      this.pitch = 0;
    }
    this.vy = 0;
    this.collider.setTranslation({ x: feet.x, y: feet.y + CENTER, z: feet.z });
  }

  /** Moves the player rigidly with a train or other carrier, without collision. */
  carry(delta: Vector3): void {
    if (delta.lengthSq() === 0) return;
    this.feet.add(delta);
    this.collider.setTranslation({ x: this.feet.x, y: this.feet.y + CENTER, z: this.feet.z });
  }

  /** Whether the key bound to an action is held (the right Shift runs too). */
  private held(action: 'forward' | 'back' | 'left' | 'right' | 'run'): boolean {
    const code = settings.key(action);
    return this.keys.has(code) || (code === 'ShiftLeft' && this.keys.has('ShiftRight'));
  }

  private get isRunning(): boolean {
    return this.touchRunning || this.padRunning || this.held('run');
  }

  /** Walks with collision. Moving floors (trains, escalators) use `carry` instead. */
  update(dt: number): void {
    const move = new Vector3();
    if (this.enabled && !this.seated && !this.driveEye) {
      const f = this.touchForward + this.padForward + (this.held('forward') || this.keys.has('ArrowUp') ? 1 : 0) - (this.held('back') || this.keys.has('ArrowDown') ? 1 : 0);
      const s = this.touchSide + this.padSide + (this.held('right') || this.keys.has('ArrowRight') ? 1 : 0) - (this.held('left') || this.keys.has('ArrowLeft') ? 1 : 0);
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      move.set(-sin * f + cos * s, 0, -cos * f - sin * s);
      const magnitude = Math.min(1, move.length());
      if (magnitude > 0) move.normalize().multiplyScalar(magnitude * (this.isRunning ? RUN : WALK) * this.pace);
    }
    const walking = move.lengthSq() > 0;
    if (this.enabled && !this.seated && !this.driveEye) move.add(this.push);

    if (this.jumpQueued && this.grounded && this.enabled && !this.seated && !this.driveEye) {
      this.vy = JUMP;
      this.grounded = false;
    } else {
      // No push into the floor while standing: the controller's cast then met the floor at once and stopped a step
      // dead about once a second. Snapping to the ground keeps the feet on stairs and slopes going down.
      this.vy = this.grounded ? 0 : this.vy - GRAVITY * dt;
    }
    this.jumpQueued = false;
    const desired = { x: move.x * dt, y: this.vy * dt, z: move.z * dt };
    this.controller.computeColliderMovement(this.collider, desired);
    const m = this.controller.computedMovement();
    this.grounded = this.vy <= 0 && this.controller.computedGrounded();
    if (this.grounded) this.vy = 0;
    // Bumping into a ceiling ends the jump.
    if (this.vy > 0 && m.y < desired.y * 0.5) this.vy = 0;
    // The feet are kept in double precision: far from the world origin Rapier's 32-bit position would round a slow step away.
    this.feet.set(this.feet.x + m.x, this.feet.y + m.y, this.feet.z + m.z);
    this.collider.setTranslation({ x: this.feet.x, y: this.feet.y + CENTER, z: this.feet.z });
    this.stepped = walking && this.grounded ? Math.hypot(m.x, m.z) : 0;
    this.running = this.isRunning;

    this.bob = walking && this.grounded ? this.bob + dt * (this.running ? 15 : 11) : this.bob * 0.9;
    const bobY = Math.sin(this.bob) * 0.035;
    const blend = 1 - Math.exp(-dt * 9);
    this.eyeHeight += ((this.seated ? RIDE_LAYOUT.seatedEye : EYE) * this.eyeScale - this.eyeHeight) * blend;
    this.cameraSeatZ += (this.seatOffsetZ - this.cameraSeatZ) * blend;
    const motion = rideMotion(this.ride.distance, this.ride.speed, this.ride.acceleration, this.yaw, this.ride.enabled);
    this.shakeTime += dt;
    this.shake *= Math.exp(-dt * 5);
    const shake = this.ride.enabled ? this.shake : 0;
    const jitter = shake * (Math.sin(this.shakeTime * 47) + Math.sin(this.shakeTime * 31) * 0.6);
    this.lurchAmount *= Math.exp(-dt * 3.5);
    const lurch = this.lurchAmount * Math.sin(this.shakeTime * 8);
    if (this.driveEye) this.camera.position.copy(this.driveEye).y += motion.y;
    else this.camera.position.set(this.feet.x, this.feet.y + this.eyeHeight + bobY + motion.y + jitter * 0.012, this.feet.z + this.cameraSeatZ);
    this.camera.rotation.set(this.pitch + motion.pitch + lurch * 0.03, this.yaw, motion.roll + jitter * 0.01 + lurch * 0.07);
  }
}
