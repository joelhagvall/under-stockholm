import { Color } from 'three';

/** Linear-space RGB triplet, ready to be written into a vertex color attribute. */
export type RGB = [number, number, number];

const tmp = new Color();
const known = new Map<number, RGB>();

/** Converts an sRGB hex color into linear RGB. Cached, since paint functions call it per vertex: treat the result as read-only. */
export function rgb(hex: number): RGB {
  let c = known.get(hex);
  if (!c) {
    tmp.setHex(hex);
    c = [tmp.r, tmp.g, tmp.b];
    known.set(hex, c);
  }
  return c;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function scale(a: RGB, s: number): RGB {
  return [a[0] * s, a[1] * s, a[2] * s];
}
