import type { Ground } from './data';

/**
 * The ground under the network view: its height above the sea on a grid over the whole metro (`terrain.json`, made by
 * `scripts/terrain.ts` from the Copernicus DEM), read between the grid's points. Past the grid's edge the land sinks
 * to the sea's level. Free of three.js.
 */

/** The file as the script writes it: each row's first height plain, each next as the step from the one before. */
export interface TerrainFile {
  west: number;
  south: number;
  step: number;
  cols: number;
  rows: number;
  heights: number[][];
}

export interface Terrain {
  west: number;
  south: number;
  step: number;
  cols: number;
  rows: number;
  /** Row by row from the south, each row from the west, in meters. */
  h: Float32Array;
}

/** How far past the grid's edge the land takes to sink to the sea, in meters. */
const FADE = 2000;

export function decodeTerrain(file: TerrainFile): Terrain {
  const { west, south, step, cols, rows } = file;
  const h = new Float32Array(cols * rows);
  file.heights.forEach((row, r) => {
    let v = 0;
    row.forEach((d, c) => { v += d; h[r * cols + c] = v; });
  });
  return { west, south, step, cols, rows, h };
}

/** The ground's height at any point east and north of T-Centralen. */
export function groundOf(t: Terrain): Ground {
  const { west, south, step, cols, rows, h } = t;
  return (east, north) => {
    const fx = (east - west) / step;
    const fy = (north - south) / step;
    const cx = Math.min(cols - 1.001, Math.max(0, fx));
    const cy = Math.min(rows - 1.001, Math.max(0, fy));
    const c = Math.floor(cx), r = Math.floor(cy);
    const u = cx - c, v = cy - r;
    const i = r * cols + c;
    const z = (h[i] * (1 - u) + h[i + 1] * u) * (1 - v) + (h[i + cols] * (1 - u) + h[i + cols + 1] * u) * v;
    const out = Math.max(fx - cx, cx - fx, fy - cy, cy - fy, 0) * step;
    return out > 0 ? z * Math.max(0, 1 - out / FADE) : z;
  };
}

/** The grid's extent in meters: west, east, south, north. */
export function extent(t: Terrain): [number, number, number, number] {
  return [t.west, t.west + (t.cols - 1) * t.step, t.south, t.south + (t.rows - 1) * t.step];
}
