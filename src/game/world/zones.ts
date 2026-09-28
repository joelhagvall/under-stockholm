import type { Vector3 } from 'three';
import type { BoxLike } from '../gfx/builder';

export type Area = 'platform' | 'track' | 'escalator' | 'hall' | 'street' | 'tunnel' | 'service' | 'transfer';

/** A named box of space that `World.locate` reports before the generic station areas. */
export interface Zone {
  min: BoxLike;
  max: BoxLike;
  station: number | null;
  area: Area;
  label: string;
}

/** Something the player can use with E (or the touch Use button) when close. */
export interface Interactable {
  pos: Vector3;
  radius: number;
  prompt: string;
  /** Returns a caption to show, if any. */
  act(): string | void;
  enabled?(): boolean;
  /** Shown even to a seated player, ahead of the hint to stand up (an inspector asking for the ticket). */
  urgent?: boolean;
}

export function inZone(z: Zone, p: Vector3): boolean {
  return p.x >= z.min.x && p.x <= z.max.x && p.y >= z.min.y && p.y <= z.max.y && p.z >= z.min.z && p.z <= z.max.z;
}
