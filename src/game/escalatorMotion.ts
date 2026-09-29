import { ESC_ANGLE, ESC_DESIGN as E, ESC_LANDING, ESC_SPEED, PLATFORM_Y } from './layout';

/** How far along x an escalator climbing `rise` meters reaches: the thirty-degree flight and a landing at each end. */
export function escalatorRun(rise: number): number {
  return rise / Math.tan(ESC_ANGLE) + ESC_LANDING * 2;
}

/** A level run-in and run-out, with the thirty-degree flight between them, from `base` (the platform, or a hall below it). */
export function escalatorHeight(along: number, rise: number, base = PLATFORM_Y): number {
  return base + Math.min(rise, Math.max(0, (along - ESC_LANDING) * Math.tan(ESC_ANGLE)));
}

export function escalatorSlope(along: number, rise: number): number {
  return along > ESC_LANDING && along < escalatorRun(rise) - ESC_LANDING ? Math.tan(ESC_ANGLE) : 0;
}

export function escalatorStepAlong(index: number, time: number, lane: number): number {
  const phase = ((time * ESC_SPEED * Math.cos(ESC_ANGLE) * lane) % E.stepPitch + E.stepPitch) % E.stepPitch;
  return (index - 1) * E.stepPitch + phase;
}

export function onEscalatorTread(z: number): boolean {
  return Math.abs(Math.abs(z) - E.laneCenter) < E.treadWidth / 2;
}
