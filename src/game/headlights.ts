import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { glowTexture } from './gfx/textures';

/**
 * The first sign of a train in a dark tunnel: its headlights pooling on the
 * trackbed and two long glints running ahead along the rail tops. Additive,
 * unlit geometry that travels with the train, so it costs no real-time light.
 */

const BEAM_LENGTH = 70;
const GLINT_LENGTH = 150;

let fade: Texture | null = null;

/** Horizontal falloff: bright at u = 0, gone at u = 1. */
function fadeTexture(): Texture {
  if (fade) return fade;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(256, 16);
  for (let x = 0; x < 256; x++) {
    const u = x / 255;
    const a = Math.pow(1 - u, 2.2) * Math.min(1, u * 14);
    for (let y = 0; y < 16; y++) {
      const v = Math.sin((y + 0.5) / 16 * Math.PI);
      const i = (y * 256 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * a * v);
    }
  }
  ctx.putImageData(img, 0, 0);
  fade = new CanvasTexture(c);
  fade.colorSpace = SRGBColorSpace;
  return fade;
}

let shared: { beam: MeshBasicMaterial; flare: PointsMaterial } | null = null;
let red: { beam: MeshBasicMaterial; flare: PointsMaterial } | null = null;

function materials() {
  shared ??= {
    beam: new MeshBasicMaterial({ color: 0xfff1d8, map: fadeTexture(), vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false }),
    flare: new PointsMaterial({ size: 1.4, map: glowTexture(), color: 0xfff3dc, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false }),
  };
  return shared;
}

/** Tail lights: a faint red wash behind the train that shrinks into the dark as it leaves. */
function tailMaterials() {
  red ??= {
    beam: new MeshBasicMaterial({ color: 0x8a1a0e, map: fadeTexture(), vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false }),
    flare: new PointsMaterial({ size: 0.9, map: glowTexture(), color: 0xff3a22, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false }),
  };
  return red;
}

let beamGeometry: BufferGeometry | null = null;

/** The trackbed pool and both rail glints in one geometry, strength in the vertex colors. */
function beam(noseX: number): BufferGeometry {
  if (beamGeometry) return beamGeometry;
  const parts: Array<{ length: number; width: number; y: number; z: number; strength: number }> = [
    { length: BEAM_LENGTH, width: 2.8, y: 0.14, z: 0, strength: 0.22 },
    { length: GLINT_LENGTH, width: 0.09, y: 0.285, z: -0.72, strength: 0.75 },
    { length: GLINT_LENGTH, width: 0.09, y: 0.285, z: 0.72, strength: 0.75 },
  ];
  const position: number[] = [];
  const uv: number[] = [];
  const color: number[] = [];
  const index: number[] = [];
  parts.forEach((p, i) => {
    const x0 = noseX, x1 = noseX + p.length, z0 = p.z - p.width / 2, z1 = p.z + p.width / 2;
    position.push(x0, p.y, z0, x1, p.y, z0, x1, p.y, z1, x0, p.y, z1);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let k = 0; k < 4; k++) color.push(p.strength, p.strength, p.strength);
    index.push(i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2);
  });
  beamGeometry = new BufferGeometry();
  beamGeometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  beamGeometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  beamGeometry.setAttribute('color', new Float32BufferAttribute(color, 3));
  beamGeometry.setIndex(index);
  beamGeometry.computeBoundingSphere();
  return beamGeometry;
}

/**
 * Headlight effects for one train end, pointing toward +x in local space.
 * Mirror it with `scale.x = -1` for the other end.
 */
export function headlightBeam(noseX: number, lampY: number, lampZ: number, tail = false): Group {
  const m = tail ? tailMaterials() : materials();
  const group = new Group();
  group.name = tail ? 'tail-lights' : 'headlights';
  const lit = new Mesh(beam(noseX), m.beam);
  lit.renderOrder = 1;
  group.add(lit);
  const flares = new BufferGeometry();
  flares.setAttribute('position', new Float32BufferAttribute([noseX + 0.08, lampY, -lampZ, noseX + 0.08, lampY, lampZ], 3));
  group.add(new Points(flares, m.flare));
  return group;
}
