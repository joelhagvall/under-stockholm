import { expect, test } from 'bun:test';
import { cabinSeats, nearestSeat, rideMotion } from '../src/game/journey';
import { trainPassengerPoses } from '../src/game/crowd';
import { commuterPoses } from '../src/game/commuters';
import { COMMUTER_LAYOUT as C, DOOR_XS, PLATFORM_HALF_W, TRACK_Z, TRAIN_HALF_W } from '../src/game/layout';
import { BLUE_LINE, routeTimetables } from '../src/game/line';

const timetable = routeTimetables(BLUE_LINE)[1];
const stop = timetable.stopIndex(1, 1);
const arrival = timetable.arrival(stop);
const posesAt = (time: number) => commuterPoses({ time, state: timetable.stateAt(time), timetable });

test('seat interaction selects a nearby free seat and never an occupied one', () => {
  const occupied = trainPassengerPoses();
  const seat = nearestSeat(2.6, 0, occupied)!;
  expect(seat).not.toBeNull();
  expect(occupied.some((p) => Math.abs(p.x - seat.x) < 0.2 && p.z === seat.z)).toBe(false);
  expect(nearestSeat(0, 0, cabinSeats())).toBeNull();
  expect(nearestSeat(200, 0, [])).toBeNull();
});

test('ride motion is bounded, reversible with braking and disabled by comfort mode', () => {
  expect(rideMotion(50, 22, 1, 0, false)).toEqual({ y: 0, roll: 0, pitch: 0 });
  for (const value of Object.values(rideMotion(50, 0, 0, 1, true))) expect(value).toBeCloseTo(0);
  expect(rideMotion(0, 10, 1, 0, true).roll).toBeGreaterThan(0);
  expect(rideMotion(0, 10, -1, 0, true).roll).toBeLessThan(0);
  for (let x = 0; x < 1000; x += 3) {
    const motion = rideMotion(x, 22, 1.1, x, true);
    expect(Math.abs(motion.roll)).toBeLessThan(0.02);
    expect(Math.abs(motion.pitch)).toBeLessThan(0.02);
    expect(Math.abs(motion.y)).toBeLessThan(0.02);
  }
});

test('commuters cross only through fully open doors and stand clear before closing', () => {
  for (const track of [1, 2] as const) {
    const k = timetable.stopIndex(1, track);
    const start = timetable.arrival(k);
    for (let t = 0; t < timetable.stopDuration(k); t += 0.1) {
      const state = timetable.stateAt(start + t);
      for (const pose of posesAt(start + t).filter((p) => p.visible)) {
        const localZ = Math.abs(pose.z - state.z);
        if (Math.abs(localZ - TRAIN_HALF_W) < 0.35) {
          expect(state.doors).toBe(1);
          expect(DOOR_XS.some((x) => Math.abs(pose.x - state.x - x) < 0.1)).toBe(true);
        }
        if (state.phase === 'closing') {
          expect(pose.walking).toBe(false);
          expect(localZ < 1 || Math.abs(pose.z) < PLATFORM_HALF_W - 0.5).toBe(true);
        }
      }
    }
  }
});

test('arriving passengers retain positions and alighted passengers stay on the platform after departure', () => {
  const before = posesAt(arrival - 0.001);
  const after = posesAt(arrival + 0.001);
  // At T-Centralen, the second cohort are the passengers who boarded at Kungsträdgården.
  for (let i = 0; i < C.doorIndices.length; i++) {
    expect(Math.abs(before[i + C.doorIndices.length].x - after[i + C.doorIndices.length].x)).toBeLessThan(0.001);
    expect(Math.abs(before[i + C.doorIndices.length].z - after[i + C.doorIndices.length].z)).toBeLessThan(0.001);
  }
  const departure = arrival + timetable.stopDuration(stop);
  const atDeparture = posesAt(departure);
  const later = posesAt(departure + 10);
  for (let i = 0; i < C.doorIndices.length; i++) {
    expect(later[i + C.doorIndices.length].x).toBe(atDeparture[i + C.doorIndices.length].x);
    expect(Math.abs(later[i + C.doorIndices.length].z)).toBe(C.waitZ);
    expect(later[i].x).toBeGreaterThan(atDeparture[i].x);
    expect(later[i].z).toBe(TRACK_Z - C.cabinZ);
  }
});

test('terminal departures leave commuting passengers behind and sampling is deterministic', () => {
  const end = timetable.stopIndex(timetable.route[timetable.route.length - 1], 1);
  const time = timetable.arrival(end) + timetable.stopDuration(end) + 1;
  const poses = posesAt(time);
  expect(poses.filter((p) => p.visible).every((p) => Math.abs(p.z) === C.waitZ)).toBe(true);
  expect(posesAt(time)).toEqual(posesAt(time + timetable.cycle));
});


test('waiting passengers leave space for the people getting off', () => {
  for (let local = 0; local < timetable.stopDuration(stop); local += 0.1) {
    const poses = posesAt(arrival + local);
    for (let i = 0; i < C.doorIndices.length; i++) {
      const a = poses[i], b = poses[i + C.doorIndices.length];
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.65);
    }
  }
});
