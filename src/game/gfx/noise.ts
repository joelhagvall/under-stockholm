/** Deterministic integer hash mapped to [0, 1). */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h =
    Math.imul(x, 0x27d4eb2d) ^
    Math.imul(y, 0x165667b1) ^
    Math.imul(z, 0x1b873593) ^
    Math.imul(seed + 1, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Trilinear value noise in [0, 1). */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const w = smooth(z - zi);
  const c000 = hash3(xi, yi, zi, seed);
  const c100 = hash3(xi + 1, yi, zi, seed);
  const c010 = hash3(xi, yi + 1, zi, seed);
  const c110 = hash3(xi + 1, yi + 1, zi, seed);
  const c001 = hash3(xi, yi, zi + 1, seed);
  const c101 = hash3(xi + 1, yi, zi + 1, seed);
  const c011 = hash3(xi, yi + 1, zi + 1, seed);
  const c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
  return lerp(
    lerp(lerp(c000, c100, u), lerp(c010, c110, u), v),
    lerp(lerp(c001, c101, u), lerp(c011, c111, u), v),
    w,
  );
}

/** Fractal value noise in [0, 1). */
export function fbm3(x: number, y: number, z: number, octaves = 4, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x * f, y * f, z * f, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
