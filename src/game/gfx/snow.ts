import type { Material } from 'three';

/**
 * Snow lying on the open air: a patch to the open-air materials that whitens every surface facing up (the ground, the
 * grass, roofs, the tops of fences and the streets round the exits) as far as `setSnowCover` says, set by the weather
 * (`weather.ts`). The baked layers keep no normals, so the slope comes from the surface's own change in position
 * across the pixel, in view space, which stays precise however far out on the line the player is; seen from below a
 * surface faces down, so a roof's underside stays bare. Dark asphalt takes less of it, as a road turns to slush.
 * Chains onto any patch already there (`torchify`). The snow is only compiled in while it snows, so a dry day costs
 * nothing: the shader is rebuilt when the weather turns to snow or away from it (`setSnowCover`).
 */
const snowCover = { value: 0 };

/** The open air's few shared materials, which live as long as the page. */
const patched = new Set<Material>();

/** How much snow lies, 0 to 1. */
export function setSnowCover(amount: number): void {
  if (amount > 0 !== snowCover.value > 0) for (const m of patched) m.needsUpdate = true;
  snowCover.value = amount;
}

export function snowify<T extends Material>(material: T): T {
  if (patched.has(material)) return material;
  patched.add(material);
  const before = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    if (snowCover.value <= 0) return;
    shader.uniforms.uSnow = snowCover;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSnowView;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSnowView = mvPosition.xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSnow;\nvarying vec3 vSnowView;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 facing = normalize(cross(dFdx(vSnowView), dFdy(vSnowView)));
  float up = dot(facing, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
  float lit = dot(vColor.rgb, vec3(0.299, 0.587, 0.114));
  float lying = uSnow * smoothstep(0.55, 0.85, up) * mix(0.55, 1.0, smoothstep(0.06, 0.3, lit));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * vec3(0.9, 0.92, 0.95) * clamp(0.55 + lit * 1.2, 0.0, 1.3), lying);
}`);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}${snowCover.value > 0 ? '-snow' : ''}`;
  return material;
}
