import type RAPIER from '@dimforge/rapier3d';
import type { BoxLike } from './gfx/builder';

export type Rapier = typeof RAPIER;

export async function loadRapier(): Promise<Rapier> {
  // Vite streams the separate WASM binary instead of parsing and decoding it as JavaScript.
  const mod = await import('@dimforge/rapier3d');
  // LinkedIn's in-app browser on iOS once handed back the module without its default export. The default is only the
  // namespace itself, so fall back to it; if even that lacks World, read the live bindings again a moment later.
  for (let attempt = 0; ; attempt++) {
    const rapier = (mod.default ?? mod) as Rapier | undefined;
    if (rapier?.World) return rapier;
    if (attempt) throw new Error(`Rapier loaded without World: ${Object.keys(mod).slice(0, 8).join(',') || 'empty'}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** What the game does with a static collider once made: switch it on and off, or move it. */
export type StaticCollider = Pick<RAPIER.Collider, 'setEnabled' | 'setTranslation'>;

/** A box, turned about the z axis (`angleZ`) or about the y axis (`angleY`). */
interface Shape { center: BoxLike; half: BoxLike; angleZ: number; angleY?: number }

/** A static collider asked for before Rapier is up: kept as a shape, and made for real in `Physics.attach`. */
class PendingCollider implements StaticCollider {
  private enabled = true;
  private at: RAPIER.Vector | null = null;
  collider: RAPIER.Collider | null = null;

  constructor(readonly shape: Shape) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.collider?.setEnabled(enabled);
  }

  setTranslation(at: RAPIER.Vector): void {
    this.at = { x: at.x, y: at.y, z: at.z };
    this.collider?.setTranslation(at);
  }

  made(collider: RAPIER.Collider): void {
    this.collider = collider;
    if (this.at) collider.setTranslation(this.at);
    if (!this.enabled) collider.setEnabled(false);
  }
}

/**
 * Thin wrapper over a Rapier world. No dynamic bodies: static geometry, hand-moved train colliders and a character.
 * Stepping only refreshes the broad phase. It can be made before Rapier has loaded, so the world is built while the
 * WASM binary still downloads: static boxes asked for until then are queued and made in `attach`. Everything else
 * (`world`, `R`) needs Rapier and throws before it.
 */
export class Physics {
  private rapier: Rapier | null = null;
  private rapierWorld: RAPIER.World | null = null;
  private pending: PendingCollider[] = [];

  constructor(R?: Rapier) {
    if (R) this.attach(R);
  }

  get R(): Rapier {
    if (!this.rapier) throw new Error('Physics used before Rapier loaded');
    return this.rapier;
  }

  get world(): RAPIER.World {
    if (!this.rapierWorld) throw new Error('Physics used before Rapier loaded');
    return this.rapierWorld;
  }

  /** Takes Rapier once it has loaded, and makes every static box asked for before. */
  attach(R: Rapier): void {
    this.rapier = R;
    this.rapierWorld = new R.World({ x: 0, y: 0, z: 0 });
    for (const p of this.pending) p.made(this.make(p.shape));
    this.pending = [];
  }

  /** Static axis-aligned box from min/max corners. */
  box(min: BoxLike, max: BoxLike): StaticCollider {
    return this.add({
      center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
      half: { x: (max.x - min.x) / 2, y: (max.y - min.y) / 2, z: (max.z - min.z) / 2 },
      angleZ: 0,
    });
  }

  /** Static box rotated about the z axis (used for inclined escalator and stair surfaces). */
  tiltedBox(center: BoxLike, half: BoxLike, angleZ: number): StaticCollider {
    return this.add({ center, half, angleZ });
  }

  /** Static box turned about the y axis by `angleY`, its x half along the direction (cos, -sin) in x and z: a wall that runs at a slant. */
  turnedBox(center: BoxLike, half: BoxLike, angleY: number): StaticCollider {
    return this.add({ center, half, angleZ: 0, angleY });
  }

  /** Takes a static collider away again, for what a lazy build laid and its teardown lets go of. */
  remove(collider: StaticCollider): void {
    if (collider instanceof PendingCollider) {
      if (collider.collider) this.world.removeCollider(collider.collider, false);
      else this.pending.splice(this.pending.indexOf(collider), 1);
      return;
    }
    this.world.removeCollider(collider as RAPIER.Collider, false);
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  private add(shape: Shape): StaticCollider {
    if (this.rapier) return this.make(shape);
    const pending = new PendingCollider({ center: { ...shape.center }, half: { ...shape.half }, angleZ: shape.angleZ, angleY: shape.angleY });
    this.pending.push(pending);
    return pending;
  }

  private make({ center, half, angleZ, angleY }: Shape): RAPIER.Collider {
    const desc = this.R.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(center.x, center.y, center.z);
    if (angleZ) desc.setRotation({ x: 0, y: 0, z: Math.sin(angleZ / 2), w: Math.cos(angleZ / 2) });
    else if (angleY) desc.setRotation({ x: 0, y: Math.sin(angleY / 2), z: 0, w: Math.cos(angleY / 2) });
    return this.world.createCollider(desc);
  }
}
