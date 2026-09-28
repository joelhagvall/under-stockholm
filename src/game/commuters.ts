import { COMMUTER_LAYOUT as C, DOOR_XS, TRACK_Z } from './layout';
import type { PassengerPose } from './crowd';
import type { Timetable, TrainState } from './timetable';

/** A train at a station for the people getting on and off: its clock and state, and its doors (the C20's if not given). */
export interface CrowdService { time: number; state: TrainState; timetable: Timetable; doors?: number[] }
export interface CommuterPose extends PassengerPose { visible: boolean }
const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** Walk through a real doorway first, then along the platform (its middle at `platformZ`), never through a side wall. */
function route(x: number, trackZ: number, platformZ: number, door: number, progress: number, incoming: boolean): CommuterPose {
  const side = Math.sign(trackZ - platformZ);
  const p = incoming ? 1 - progress : progress;
  const crossing = clamp(p / 0.75);
  const along = clamp((p - 0.75) / 0.25);
  const startZ = trackZ - side * C.cabinZ;
  const endZ = platformZ + side * C.waitZ;
  const directionZ = Math.sign(endZ - startZ) * (incoming ? -1 : 1);
  return { x: x + door + along * C.waitOffsetX * (incoming ? -1 : 1), z: startZ + (endZ - startZ) * crossing,
    yaw: along > 0 && along < 1 ? Math.PI / 2 : directionZ > 0 ? 0 : Math.PI,
    walking: progress > 0 && progress < 1, visible: true };
}

/**
 * Two alternating cohorts retain their identity through arrival, boarding and the next trip.
 * @param platformAt the middle of the platform a train on track `z` at a station stands at (a shared station has two)
 */
export function commuterPoses({ time, state, timetable, doors = DOOR_XS }: CrowdService, platformAt: (station: number, z: number) => number = () => 0): CommuterPose[] {
  const stops = timetable.stops;
  let k = state.stop;
  // While shunting, keep people who alighted at the last terminal anchored there.
  while (stops[k].kind !== 'station') k = (k - 1 + stops.length) % stops.length;
  const stop = stops[k];
  let previous = (k - 1 + stops.length) % stops.length;
  while (stops[previous].kind !== 'station') previous = (previous - 1 + stops.length) % stops.length;
  const cycleTime = ((time % timetable.cycle) + timetable.cycle) % timetable.cycle;
  const elapsed = ((cycleTime - timetable.arrival(k)) % timetable.cycle + timetable.cycle) % timetable.cycle;
  const atStation = k === state.stop && state.phase !== 'moving';
  const ordinal = stops.slice(0, k + 1).filter((s) => s.kind === 'station').length;
  const incomingCohort = ordinal % 2;
  const x = timetable.stationX[stop.station];
  // The track the train stands on there: further out where it shares another line's station.
  const z = timetable.pose(stop.u).z || (stop.track === 1 ? TRACK_Z : -TRACK_Z);
  const platformZ = platformAt(stop.station, z);
  // The C20's doors they use, or the nearest of another stock's.
  const doorAt = (index: number) => doors.reduce((a, b) => (Math.abs(b - DOOR_XS[index]) < Math.abs(a - DOOR_XS[index]) ? b : a));
  return [0, 1].flatMap((cohort) => C.doorIndices.map((doorIndex, i) => {
    const incoming = cohort === incomingCohort;
    const progress = clamp((elapsed - (incoming ? C.boardStart : C.exitStart) - i * C.stagger) / (incoming ? C.boardDuration : C.exitDuration));
    const pose = route(x, z, platformZ, doorAt(doorIndex), progress, incoming);
    // Terminal arrivals empty the train. New passengers wait for its return on the other track.
    if ((!incoming && stops[previous].terminal) || (incoming && stop.terminal)) return { ...pose, visible: false };
    if (incoming && !atStation) return { ...pose, x: state.x + doorAt(doorIndex), z: state.z - Math.sign(z - platformZ) * C.cabinZ, walking: false };
    return pose;
  }));
}
