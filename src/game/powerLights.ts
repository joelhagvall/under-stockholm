import {
  AdditiveBlending,
  BufferGeometry,
  ConeGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
  type Material,
  type Scene,
} from 'three';
import { glowTexture } from './gfx/textures';
import { PLATFORM_HALF_L, PLATFORM_Y } from './layout';

/**
 * The light in a power cut. The world is baked and unlit, so the dark and the phone torches are a small patch to
 * the shared world materials (`torchify`): while `uCut` is up, every surface is scaled down to the emergency light
 * and lit again inside a few torch cones, one of them the player's own. Other passengers' beams show as faint
 * cones in the air, and the green exit signs glow at the platform ends. One uniform set for the whole world, so
 * it costs a branch per pixel when the power is on.
 */

export const TORCHES = 8;

const uniforms = {
  uCut: { value: 0 },
  uTorchCount: { value: 0 },
  uTorchPos: { value: Array.from({ length: TORCHES }, () => new Vector3()) },
  uTorchDir: { value: Array.from({ length: TORCHES }, () => new Vector3(0, 0, -1)) },
  uTorchPower: { value: new Array<number>(TORCHES).fill(0) },
};

const patched = new WeakSet<Material>();

/** Makes a world material go dark in a power cut and take the torches' light. Idempotent. */
export function torchify<T extends Material>(material: T): T {
  // A clone keeps the flag in its user data but not the patch, so remember the patched ones here.
  if (patched.has(material)) return material;
  patched.add(material);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTorchWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
vec4 torchWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
torchWorld = instanceMatrix * torchWorld;
#endif
vTorchWorld = (modelMatrix * torchWorld).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vTorchWorld;
uniform float uCut;
uniform int uTorchCount;
uniform vec3 uTorchPos[${TORCHES}];
uniform vec3 uTorchDir[${TORCHES}];
uniform float uTorchPower[${TORCHES}];`)
      .replace('#include <opaque_fragment>', `if (uCut > 0.0) {
  vec3 torch = vec3(0.0);
  for (int i = 0; i < ${TORCHES}; i++) {
    if (i >= uTorchCount) break;
    vec3 d = vTorchWorld - uTorchPos[i];
    float dist = max(length(d), 0.05);
    float cone = smoothstep(0.8, 0.95, dot(d / dist, uTorchDir[i]));
    torch += vec3(1.0, 0.96, 0.88) * cone * uTorchPower[i] / (1.0 + dist * dist * 0.06);
  }
  // The emergency light: a faint green cast from the exit signs.
  vec3 emergency = vec3(0.007, 0.011, 0.008);
  outgoingLight *= mix(vec3(1.0), emergency + torch * 1.8, uCut);
}
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'torch';
  return material;
}

/** A torch: a hand and where it points, and how strong (0 to 1). */
export interface Torch {
  pos: Vector3;
  dir: Vector3;
  power: number;
}

const MAX_BEAMS = TORCHES - 1;
const BEAM_LENGTH = 7;

/** The torches' uniforms, the other passengers' visible beams and the exit signs' glow. */
export class PowerLights {
  private readonly beams: InstancedMesh;
  private readonly exits: Points;
  private readonly matrix = new Matrix4();
  private readonly q = new Quaternion();
  private readonly up = new Vector3(0, 0, 1);
  private readonly one = new Vector3(1, 1, 1);

  constructor(scene: Scene) {
    // A cone with its tip at the origin, opening along +z, bright at the tip and fading out.
    const cone = new ConeGeometry(1.5, BEAM_LENGTH, 18, 1, true);
    cone.translate(0, -BEAM_LENGTH / 2, 0);
    cone.rotateX(-Math.PI / 2);
    const pos = cone.getAttribute('position');
    const colors: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const k = Math.max(0, 1 - pos.getZ(i) / BEAM_LENGTH) ** 2;
      colors.push(k, k * 0.97, k * 0.9);
    }
    cone.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.beams = new InstancedMesh(cone, new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.11, blending: AdditiveBlending, depthWrite: false, fog: false }), MAX_BEAMS);
    this.beams.frustumCulled = false;
    this.beams.count = 0;
    this.beams.visible = false;
    scene.add(this.beams);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(12), 3));
    this.exits = new Points(geo, new PointsMaterial({ size: 1.4, map: glowTexture(), color: 0x3cff8a, transparent: true, blending: AdditiveBlending, depthWrite: false }));
    this.exits.frustumCulled = false;
    this.exits.visible = false;
    scene.add(this.exits);
  }

  /**
   * @param level how far the lights are out, 0 to 1 (flickering on the way)
   * @param torches the player's torch first, then the others' (the first `MAX_BEAMS` of those get a visible beam)
   * @param station the nearest station's middle and its platforms' walls, for the exit signs
   */
  update(level: number, torches: Torch[], station: { cx: number; walls: number[] } | null): void {
    uniforms.uCut.value = level;
    const n = Math.min(TORCHES, torches.length);
    uniforms.uTorchCount.value = level > 0 ? n : 0;
    for (let i = 0; i < n; i++) {
      uniforms.uTorchPos.value[i].copy(torches[i].pos);
      uniforms.uTorchDir.value[i].copy(torches[i].dir).normalize();
      uniforms.uTorchPower.value[i] = torches[i].power;
    }
    this.beams.visible = level > 0.5;
    let b = 0;
    for (let i = 1; i < n && b < MAX_BEAMS; i++) {
      if (torches[i].power < 0.05) continue;
      this.q.setFromUnitVectors(this.up, uniforms.uTorchDir.value[i]);
      this.matrix.compose(torches[i].pos, this.q, this.one);
      this.beams.setMatrixAt(b++, this.matrix);
    }
    this.beams.count = b;
    this.beams.instanceMatrix.needsUpdate = true;
    this.exits.visible = level > 0.5 && station !== null;
    if (station) {
      const p = this.exits.geometry.getAttribute('position') as Float32BufferAttribute;
      let k = 0;
      for (const end of [-1, 1]) for (const z of station.walls.slice(0, 2)) p.setXYZ(k++, station.cx + end * (PLATFORM_HALF_L - 1.5), PLATFORM_Y + 2.7, z);
      p.needsUpdate = true;
      this.exits.geometry.setDrawRange(0, k);
    }
  }
}

/** A direction from yaw (around y, 0 facing -z as the camera does) and pitch. */
export function aim(yaw: number, pitch: number, out = new Vector3()): Vector3 {
  return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

