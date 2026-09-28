import { expect, test } from 'bun:test';
import { Group, Vector3 } from 'three';
import { seatBays } from '../src/game/trainModel';
import { Crowd, trainPassengerPoses, crowdPose } from '../src/game/crowd';
import { C20, CROWD_LAYOUT, DOOR_HALF_W, DOOR_XS, PLATFORM_HALF_L, PLATFORM_HALF_W, STATION_DESIGN } from '../src/game/layout';

test('passengers remain inside the safe platform lanes throughout a walking cycle', () => {
  for (let time = 0; time <= 700; time += 7) {
    for (let i = 0; i < CROWD_LAYOUT.count; i++) {
      const pose = crowdPose(i, time);
      expect(Math.abs(pose.x) + 0.5).toBeLessThan(PLATFORM_HALF_L);
      expect(Math.abs(pose.z) + 0.5).toBeLessThan(PLATFORM_HALF_W - 1.1);
      expect(Math.abs(pose.z) - 0.5).toBeGreaterThan(STATION_DESIGN.pierHalfZ + 0.12);
    }
  }
});

test('walking reversals are continuous and waiting passengers stay put', () => {
  const turnTime = CROWD_LAYOUT.halfWalk * 2 / CROWD_LAYOUT.speed;
  const before = crowdPose(0, turnTime - 0.01);
  const after = crowdPose(0, turnTime + 0.01);
  expect(Math.abs(before.x - after.x)).toBeLessThan(0.02);
  expect(before.yaw).not.toBe(after.yaw);
  expect(crowdPose(1, 0)).toEqual(crowdPose(1, 500));
});

test('onboard passengers occupy seat bays and keep the aisle and doors clear', () => {
  const poses = trainPassengerPoses();
  expect(poses.length).toBeGreaterThan(8);
  for (const pose of poses) {
    expect(pose.seated).toBe(true);
    // Over a run of seats on its own side of the aisle, never out in the aisle or a doorway.
    expect(seatBays().some((bay) => pose.x > bay.a && pose.x < bay.b && Math.sign(pose.z) === bay.side && Math.abs(pose.z) >= bay.z)).toBe(true);
    for (const door of DOOR_XS) expect(Math.abs(pose.x - door)).toBeGreaterThan(DOOR_HALF_W);
  }
});

test('one toggle controls station and train passengers, which move with their train', () => {
  const host = new Group();
  const crowd = new Crowd([0], [{ group: host, stock: C20, seating: 'c20' }]);
  const mesh = host.getObjectByName('onboard-passengers')!;
  expect(mesh.visible).toBe(false);
  crowd.setEnabled(true);
  crowd.update(0, 0);
  expect(crowd.group.visible).toBe(true);
  expect(mesh.visible).toBe(true);
  host.position.set(100, 0, 6.6);
  expect(mesh.getWorldPosition(new Vector3()).toArray()).toEqual([100, 0, 6.6]);
  crowd.update(0, -1000);
  expect(mesh.visible).toBe(false);
  crowd.update(0, 100);
  expect(mesh.visible).toBe(true);
  crowd.setEnabled(false);
  expect(crowd.group.visible).toBe(false);
  expect(mesh.visible).toBe(false);
});
