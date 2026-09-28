import { CROWD_LAYOUT, RIDE_LAYOUT } from './layout';
import { cabinSeatLayout, type SeatStyle } from './trainModel';

/** Where someone sits, and the camera's yaw looking the way the seat faces. */
export interface Seat { x: number; z: number; yaw: number }

const seats = new Map<SeatStyle, Seat[]>();

/** Shared seat centers for interaction and occupancy checks, for the renovated C20 or the older stock. */
export function cabinSeats(style: SeatStyle = 'c20'): Seat[] {
  let list = seats.get(style);
  if (!list) {
    list = cabinSeatLayout(style).map(({ x, z, fx, fz }) => ({
      x: x + fx * CROWD_LAYOUT.seatedForwardOffset,
      z: z + fz * CROWD_LAYOUT.seatedForwardOffset,
      yaw: Math.atan2(-fx, -fz),
    }));
    seats.set(style, list);
  }
  return list;
}

/** A seated figure's yaw: figures face +z at yaw 0, the camera -z. */
export function sitterYaw(seat: Seat): number {
  return seat.yaw + Math.PI;
}

/** The seat right beside this one, facing the same way: the other pad of the pair, or the next side seat. */
export function seatBeside(seat: Seat, style: SeatStyle = 'c20'): Seat | null {
  let best: Seat | null = null;
  let distance = 0.6;
  for (const other of cabinSeats(style)) {
    if (other === seat || Math.abs(Math.cos(other.yaw - seat.yaw) - 1) > 1e-6) continue;
    const d = Math.hypot(other.x - seat.x, other.z - seat.z);
    if (d < distance) { best = other; distance = d; }
  }
  return best;
}

export function nearestSeat(x: number, z: number, occupied: readonly { x: number; z: number }[], style: SeatStyle = 'c20'): Seat | null {
  let best: Seat | null = null;
  let distance = RIDE_LAYOUT.seatReach;
  for (const seat of cabinSeats(style)) {
    if (occupied.some((person) => Math.abs(person.x - seat.x) < 0.2 && Math.abs(person.z - seat.z) < 0.2)) continue;
    const d = Math.hypot(seat.x - x, seat.z - z);
    if (d < distance) { best = seat; distance = d; }
  }
  return best;
}

/** Small camera-only suspension movement, sampled by distance, never applied to physics. */
export function rideMotion(distance: number, speed: number, acceleration: number, yaw: number, enabled: boolean) {
  if (!enabled) return { y: 0, roll: 0, pitch: 0 };
  const strength = Math.min(1, Math.max(0, speed / 18));
  const lateral = Math.sin(distance * 0.24) * RIDE_LAYOUT.swayAngle * strength;
  const lean = Math.max(-1.2, Math.min(1.2, acceleration)) * RIDE_LAYOUT.accelerationLean;
  return {
    y: (Math.sin(distance * 0.48) + Math.sin(distance * 1.7) * 0.2) * RIDE_LAYOUT.bounce * strength,
    roll: lateral * Math.sin(yaw) + lean * Math.cos(yaw),
    pitch: lateral * Math.cos(yaw) - lean * Math.sin(yaw),
  };
}
