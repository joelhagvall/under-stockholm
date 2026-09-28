import { CircleGeometry, CylinderGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import text from '../i18n/sv.json';
import type { Paint } from '../gfx/builder';
import { mix, rgb } from '../gfx/color';
import { fbm3, noise3 } from '../gfx/noise';
import { createCanvasSign, fitText, redraw } from '../gfx/signs';
import {
  CAVE_BOTTOM,
  CAVE_HALF_L,
  CAVE_HALF_W,
  CAVE_TOP,
  CAVE_WALL_H,
  PLATFORM_HALF_L,
  PLATFORM_HALF_W,
  PLATFORM_Y,
  STATION_ROCK_INSET,
  TRACK_Z,
  TUBE_BOTTOM,
  TUBE_HALF_W,
  TUBE_INNER,
  TUBE_OUTER,
  TUBE_TOP,
  TUBE_WALL_H,
} from '../layout';
import type { Physics } from '../physics';
import { addTrack, PAINT } from './parts';
import { Section } from './section';
import { archHole, archProfile, extrudeRockSteps, rectHole, wallWithHoles } from './shapes';
import { paintedSign, place, textSign } from './signage';
import { drawClock } from './station';
import type { Interactable, Zone } from './zones';
import { mystery } from '../mystery';
import { staffKey } from '../staffKey';

/**
 * Kymlinge: built for a suburb that never came, never opened, never lit.
 * Raw rock, a rough concrete platform and a few work lamps, in the tunnel
 * between Hallonbergen and Kista. The Akalla trains run straight through
 * without stopping; only Silverpilen does. Reached on foot through the
 * tunnel from either side, or aboard Silverpilen.
 */

const RAW_ROCK: Paint = (p) => {
  const n = fbm3(p.x * 0.3, p.y * 0.45, p.z * 0.3, 4, 77);
  const streak = Math.max(0, noise3(p.x * 0.08, p.y * 2.4, p.z * 0.08, 78) - 0.62) * 1.6;
  return mix(mix(rgb(0x3d3c39), rgb(0x76736b), n), rgb(0x2a2724), streak);
};
const ROUGH_CONCRETE: Paint = (p, n) => {
  const k = noise3(p.x * 1.7, p.y * 1.7, p.z * 1.7, 79);
  return n.y > 0.5 ? mix(rgb(0x77746c), rgb(0x8f8b82), k) : mix(rgb(0x5d5b56), rgb(0x6f6c65), k);
};
/** Concrete block infill where an escalator shaft was meant to be. */
const BLOCKWORK: Paint = (p) => {
  const row = Math.floor(p.y / 0.2);
  const col = Math.floor((p.z + (row & 1) * 0.2) / 0.4);
  return mix(rgb(0x807c73), rgb(0x9b978d), ((row * 13 + col * 7) % 5) / 5);
};
const BULB = rgb(0xffcf8a);

export interface KymlingeBuild {
  group: Group;
  zones: Zone[];
  interactables: Interactable[];
  spawn: Vector3;
  update(time: number): void;
}

export function buildKymlinge(physics: Physics, kx: number, dry = false): KymlingeBuild {
  const steps = kymlingeSteps(physics, kx, dry);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

/** Incremental construction for trains approaching the unopened station. */
export function* kymlingeSteps(physics: Physics, kx: number, dry = false): Generator<void, KymlingeBuild> {
  const s = new Section('kymlinge', rgb(0x2c2a26), dry);
  const xa = kx - CAVE_HALF_L;
  const xb = kx + CAVE_HALF_L;
  const zones: Zone[] = [];
  const interactables: Interactable[] = [];

  const profile = archProfile(0, CAVE_HALF_W, CAVE_WALL_H, CAVE_TOP, CAVE_BOTTOM, 36, 0.8);
  yield* extrudeRockSteps(s.lit, profile, xa, xb, { step: 0.6, amplitude: 1.7, inset: STATION_ROCK_INSET, rounds: 4.2, seed: 1977 }, RAW_ROCK);
  for (const end of [-1, 1] as const) {
    const wx = kx + end * CAVE_HALF_L;
    wallWithHoles(s.lit, wx, profile, [-TRACK_Z, TRACK_Z].map((zc) => archHole(zc, TUBE_HALF_W, TUBE_WALL_H, TUBE_TOP, TUBE_BOTTOM)), RAW_ROCK);
    const xo0 = end > 0 ? wx : wx - 1;
    const xo1 = end > 0 ? wx + 1 : wx;
    physics.box({ x: xo0, y: -1, z: -CAVE_HALF_W - 1 }, { x: xo1, y: 14, z: -TUBE_OUTER });
    physics.box({ x: xo0, y: -1, z: -TUBE_INNER }, { x: xo1, y: 14, z: TUBE_INNER });
    physics.box({ x: xo0, y: -1, z: TUBE_OUTER }, { x: xo1, y: 14, z: CAVE_HALF_W + 1 });
    physics.box({ x: xo0, y: TUBE_TOP, z: -TUBE_OUTER }, { x: xo1, y: 14, z: TUBE_OUTER });
  }
  // The escalator shaft was blasted, then bricked up.
  const bx = xb - 0.06;
  const hole = rectHole(-2.6, 2.6, PLATFORM_Y, PLATFORM_Y + 3.9);
  s.lit.quad(new Vector3(bx, hole[0][1], hole[0][0]), new Vector3(bx, hole[1][1], hole[1][0]), new Vector3(bx, hole[2][1], hole[2][0]), new Vector3(bx, hole[3][1], hole[3][0]), BLOCKWORK);
  place(s, paintedSign(text.kymlinge.noExit, 512, 128, '#7a5b3a'), 1.8, 0.45, new Vector3(bx - 0.02, PLATFORM_Y + 2.2, 0), new Vector3(-1, 0, 0));

  // Trackbed and both through tracks, with spare sleepers stacked against the far wall.
  s.lit.box({ x: xa, y: -0.5, z: -CAVE_HALF_W }, { x: xb, y: 0, z: CAVE_HALF_W }, PAINT.ballast, ['ny']);
  for (const zc of [-TRACK_Z, TRACK_Z]) addTrack(s, xa, xb, zc, true);
  const stackZ = -CAVE_HALF_W + 1.2;
  for (let x = xa + 6; x < xb - 6; x += 23) {
    for (let k = 0; k < 5; k++) s.lit.box({ x: x - 1.25, y: k * 0.13, z: stackZ - 0.12 - (k & 1) * 0.3 }, { x: x + 1.25, y: k * 0.13 + 0.12, z: stackZ + 0.12 - (k & 1) * 0.3 }, PAINT.sleeper);
    physics.box({ x: x - 1.25, y: 0, z: stackZ - 0.45 }, { x: x + 1.25, y: 0.65, z: stackZ + 0.15 });
  }

  // A rough slab platform, never tiled.
  const p0 = kx - PLATFORM_HALF_L;
  const p1 = kx + PLATFORM_HALF_L;
  s.lit.box({ x: p0, y: 0, z: -PLATFORM_HALF_W }, { x: p1, y: PLATFORM_Y, z: PLATFORM_HALF_W }, ROUGH_CONCRETE, [], 1.5);
  physics.box({ x: xa, y: -1, z: -CAVE_HALF_W }, { x: xb, y: -0.02, z: CAVE_HALF_W });
  physics.box({ x: p0, y: -1, z: -PLATFORM_HALF_W }, { x: p1, y: PLATFORM_Y, z: PLATFORM_HALF_W });
  physics.box({ x: xa, y: -1, z: CAVE_HALF_W }, { x: xb, y: 14, z: CAVE_HALF_W + 1 });
  physics.box({ x: xa, y: -1, z: -CAVE_HALF_W - 1 }, { x: xb, y: 14, z: -CAVE_HALF_W });
  for (const end of [-1, 1]) {
    // Rough steps at both platform ends, so you can climb up from the track.
    const x = kx + end * PLATFORM_HALF_L;
    for (let k = 0; k < 4; k++) {
      const top = PLATFORM_Y - (k + 1) * PLATFORM_Y / 4;
      if (top <= 0) break;
      const a = x + end * k * 0.35;
      const b = x + end * (k + 1) * 0.35;
      s.lit.box({ x: Math.min(a, b), y: 0, z: -1 }, { x: Math.max(a, b), y: top, z: 1 }, ROUGH_CONCRETE);
      physics.box({ x: Math.min(a, b), y: 0, z: -1 }, { x: Math.max(a, b), y: top, z: 1 });
    }
  }

  yield;
  // Work lamps hang on cables along the middle. Some have burned out.
  let flicker: Mesh | null = null;
  for (let i = 0, x = p0 + 8; x < p1 - 4; x += 15, i++) {
    s.lit.box({ x: x - 0.01, y: 3.5, z: -0.01 }, { x: x + 0.01, y: CAVE_TOP, z: 0.01 }, rgb(0x1a1a1a));
    const dead = i === 2 || i === 6;
    if (i === 4) {
      flicker = new Mesh(new SphereGeometry(0.1, 10, 8), new MeshBasicMaterial({ color: 0xffcf8a }));
      flicker.position.set(x, 3.42, 0);
      s.extras.add(flicker);
      s.light(x, 3.3, 0, BULB, 0.35, 8);
      continue;
    }
    const bulb = new SphereGeometry(0.1, 10, 8);
    (dead ? s.lit : s.unlit).geometry(bulb, new Matrix4().setPosition(x, 3.42, 0), dead ? rgb(0x3a3630) : BULB);
    bulb.dispose();
    if (!dead) s.light(x, 3.3, 0, BULB, 1.05, 11);
  }
  s.light(kx, 5.5, TRACK_Z, BULB, 0.4, 14);

  // Hand-painted name on the rock above the track, and the enamel sign that never went up.
  const painted = paintedSign(text.kymlinge.name.toUpperCase(), 1024, 192, null);
  painted.material.transparent = true;
  for (const x of [kx - 30, kx + 26]) place(s, painted, 6, 1.1, new Vector3(x, 3.4, CAVE_HALF_W - STATION_ROCK_INSET - 0.3), new Vector3(0, 0, -1));
  const enamel = createCanvasSign(1024, 192, (ctx, w, h) => {
    ctx.fillStyle = '#244f8f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e8ecef';
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = '#eef1f3';
    fitText(ctx, text.kymlinge.name, w - 120, 600, 110);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.kymlinge.name, w / 2, h / 2 + 4);
    // Dust and chips.
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = i % 3 ? 'rgba(120, 110, 95, 0.25)' : 'rgba(20, 20, 20, 0.5)';
      const r = 2 + ((i * 37) % 9);
      ctx.fillRect((i * 173) % w, (i * 91) % h, r, r * 0.7);
    }
  });
  const leaning = place(s, enamel, 3, 0.56, new Vector3(kx + 12, PLATFORM_Y + 0.62, -PLATFORM_HALF_W + 1.2), new Vector3(0, 0, 1));
  leaning.rotation.x = -0.28;
  s.lit.box({ x: kx + 10.4, y: PLATFORM_Y, z: -PLATFORM_HALF_W + 0.9 }, { x: kx + 13.6, y: PLATFORM_Y + 0.05, z: -PLATFORM_HALF_W + 1.25 }, rgb(0x2b2b2b));
  interactables.push({ pos: new Vector3(kx + 12, PLATFORM_Y + 0.8, -PLATFORM_HALF_W + 1.6), radius: 1.8, prompt: text.kymlinge.signPrompt, act: () => text.kymlinge.sign });

  yield;
  // A clock that stopped before anyone arrived.
  const face = createCanvasSign(256, 256);
  const stopped = { hour: 3, minute: 47, second: 12 };
  redraw(face, (ctx, w, h) => drawClock(ctx, w, h, stopped));
  face.material.transparent = true;
  for (const f of [-1, 1]) {
    const m = new Mesh(new CircleGeometry(0.34, 32), face.material);
    m.position.set(kx - 6 + f * 0.07, 3.85, 0);
    m.rotation.y = (f * Math.PI) / 2;
    s.extras.add(m);
  }
  const ring = new CylinderGeometry(0.37, 0.37, 0.12, 32);
  s.lit.geometry(ring, new Matrix4().makeRotationZ(Math.PI / 2).setPosition(kx - 6, 3.85, 0), rgb(0x2a2c30));
  ring.dispose();
  s.lit.box({ x: kx - 6.02, y: 4.2, z: -0.02 }, { x: kx - 5.98, y: CAVE_TOP, z: 0.02 }, rgb(0x2a2c30));
  interactables.push({ pos: new Vector3(kx - 6, PLATFORM_Y + 1, 0), radius: 2, prompt: text.kymlinge.clockPrompt, act: () => { mystery.read('clock'); return text.kymlinge.clock; } });

  // An emergency phone that still has a line to somewhere.
  s.lit.box({ x: kx + 30 - 0.3, y: PLATFORM_Y, z: -0.3 }, { x: kx + 30 + 0.3, y: PLATFORM_Y + 2.2, z: 0.3 }, rgb(0x2b3037));
  physics.box({ x: kx + 30 - 0.3, y: PLATFORM_Y, z: -0.3 }, { x: kx + 30 + 0.3, y: PLATFORM_Y + 2.2, z: 0.3 });
  s.lit.box({ x: kx + 30 - 0.36, y: PLATFORM_Y + 1, z: -0.16 }, { x: kx + 30 - 0.3, y: PLATFORM_Y + 1.5, z: 0.16 }, rgb(0x2a7a45));
  place(s, textSign('Nödtelefon', 256, 64, '#1f7a3d'), 0.34, 0.085, new Vector3(kx + 30 - 0.365, PLATFORM_Y + 1.6, 0), new Vector3(-1, 0, 0));
  interactables.push({ pos: new Vector3(kx + 29.4, PLATFORM_Y + 1.2, 0), radius: 1.3, prompt: text.kymlinge.phonePrompt, act: () => (mystery.has('lastPage') ? text.mystery.phoneAfter : text.kymlinge.phone) });
  // A steel cabinet by the phone, locked with a staff lock. The logbook's last page is inside.
  s.lit.box({ x: kx + 32, y: PLATFORM_Y, z: -0.45 }, { x: kx + 32.9, y: PLATFORM_Y + 1.9, z: 0.45 }, rgb(0x4a5057));
  s.lit.box({ x: kx + 32.9, y: PLATFORM_Y + 0.95, z: 0.25 }, { x: kx + 32.94, y: PLATFORM_Y + 1.1, z: 0.32 }, rgb(0xc9a44a));
  physics.box({ x: kx + 32, y: PLATFORM_Y, z: -0.45 }, { x: kx + 32.9, y: PLATFORM_Y + 1.9, z: 0.45 });
  interactables.push({
    pos: new Vector3(kx + 33.4, PLATFORM_Y + 1, 0), radius: 1.3, prompt: text.mystery.cabinetPrompt,
    act: () => { if (!staffKey.has) return text.mystery.cabinetLocked; mystery.read('lastPage'); },
  });

  // Builders' leftovers: cable drums, sawhorses and a tarp-covered pile.
  for (const [dx, dz] of [[-44, 2.4], [-41.6, 2.6], [36, -2.6]] as const) {
    const drum = new CylinderGeometry(0.75, 0.75, 0.6, 18);
    s.lit.geometry(drum, new Matrix4().makeRotationX(Math.PI / 2).setPosition(kx + dx, PLATFORM_Y + 0.75, dz), rgb(0x6b4f33));
    drum.dispose();
    physics.box({ x: kx + dx - 0.75, y: PLATFORM_Y, z: dz - 0.3 }, { x: kx + dx + 0.75, y: PLATFORM_Y + 1.5, z: dz + 0.3 });
  }
  for (const dx of [-20, -16.5]) {
    s.lit.box({ x: kx + dx - 0.9, y: PLATFORM_Y + 0.75, z: -0.08 }, { x: kx + dx + 0.9, y: PLATFORM_Y + 0.85, z: 0.08 }, rgb(0xc98f2e));
    for (const lx of [-0.8, 0.8]) s.lit.box({ x: kx + dx + lx - 0.04, y: PLATFORM_Y, z: -0.3 }, { x: kx + dx + lx + 0.04, y: PLATFORM_Y + 0.75, z: 0.3 }, rgb(0x6b4f33));
  }
  s.lit.box({ x: kx + 50, y: PLATFORM_Y, z: -2.8 }, { x: kx + 53.5, y: PLATFORM_Y + 1.1, z: -1 }, rgb(0x2c4a3a));
  physics.box({ x: kx + 50, y: PLATFORM_Y, z: -2.8 }, { x: kx + 53.5, y: PLATFORM_Y + 1.1, z: -1 });
  // A lone bench, grey with dust.
  for (let slat = -2; slat <= 2; slat++) s.lit.box({ x: kx - 26.1, y: PLATFORM_Y + 0.42, z: slat * 0.12 - 0.045 }, { x: kx - 23.9, y: PLATFORM_Y + 0.5, z: slat * 0.12 + 0.045 }, rgb(0x6d665c));
  for (const lx of [-0.9, 0.9]) s.lit.box({ x: kx - 25 + lx - 0.05, y: PLATFORM_Y, z: -0.3 }, { x: kx - 25 + lx + 0.05, y: PLATFORM_Y + 0.42, z: 0.3 }, rgb(0x3a3d40));
  physics.box({ x: kx - 26.1, y: PLATFORM_Y, z: -0.35 }, { x: kx - 23.9, y: PLATFORM_Y + 0.5, z: 0.35 });

  const spawn = new Vector3(kx - 10, PLATFORM_Y, -1.5);
  zones.push({ min: { x: p0, y: PLATFORM_Y - 0.3, z: -PLATFORM_HALF_W - 0.05 }, max: { x: p1, y: 9, z: PLATFORM_HALF_W + 0.05 }, station: null, area: 'platform', label: text.kymlinge.name });
  zones.push({ min: { x: xa, y: -1, z: -CAVE_HALF_W }, max: { x: xb, y: 9, z: CAVE_HALF_W }, station: null, area: 'track', label: text.kymlinge.name });

  const group = yield* s.finishSteps();
  const bulb = flicker;
  return {
    group, zones, interactables, spawn,
    update(time) {
      if (!bulb) return;
      const f = noise3(time * 7, 0, 0, 5);
      const k = f > 0.55 ? 1 : f > 0.4 ? 0.35 : 0.08;
      (bulb.material as MeshBasicMaterial).color.setRGB(k, k * 0.81, k * 0.54);
    },
  };
}
