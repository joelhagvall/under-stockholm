import type { Object3D, Vector3 } from 'three';

/**
 * The staff key, found on a hook in the civil defence shelter under
 * Rådhuset. It opens doors that are otherwise locked: the alarmed emergency
 * exits up to the street, and a cabinet at Kymlinge. Kept in the browser.
 */

const KEY = 'under-stockholm:staff-key';

type Exit = (from: Vector3) => void;

class StaffKey {
  private held = false;
  /** Things to hide once the key is taken: the key on its hook. */
  readonly meshes: Object3D[] = [];
  /** Set by the game: walk someone out through an emergency exit. */
  onExit: Exit | null = null;

  constructor() {
    try { this.held = localStorage.getItem(KEY) === 'yes'; } catch { /* Not held. */ }
  }

  get has(): boolean {
    return this.held;
  }

  take(): void {
    this.held = true;
    for (const m of this.meshes) m.visible = false;
    try { localStorage.setItem(KEY, 'yes'); } catch { /* Session only. */ }
  }

  /** Registers the key's mesh on its hook, shown until it is taken. */
  hang(mesh: Object3D): void {
    mesh.visible = !this.held;
    this.meshes.push(mesh);
  }

  /** Opens an alarmed exit, if the key is held. Returns whether it did. */
  exit(from: Vector3): boolean {
    if (!this.held || !this.onExit) return false;
    this.onExit(from);
    return true;
  }
}

export const staffKey = new StaffKey();
