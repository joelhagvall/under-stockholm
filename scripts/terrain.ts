/**
 * The lie of the land under the network view: the ground's height above the sea on a grid over the whole metro, read
 * from the Copernicus DEM GLO-30 as the open data registry on AWS serves it (a GeoTIFF per degree square; © DLR e.V.
 * 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA).
 * The model is the top of whatever stands there, so a grey opening (the lowest round each point, then the highest
 * round that) about a block wide shaves off the houses and keeps the hills, and each grid cell takes the mean of that.
 * Written to `src/network/terrain.json`, which the network view fetches when it opens (`network/terrain.ts`). The
 * squares (some 30 MB each) are kept in `node_modules/.cache/terrain/`; `--fresh` fetches them again.
 *
 *   bun scripts/terrain.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { GEO, project } from '../src/network/geo';

const OUT = 'src/network/terrain.json';
const CACHE = 'node_modules/.cache/terrain';
/** Meters between the grid's points. */
const STEP = 150;
/** How far past the outermost stations the grid reaches, in meters. */
const MARGIN = 3000;
const AGENT = 'under-stockholm/1.0 (https://understockholm.com)';

// The inverse of `project`: meters east and north of T-Centralen back to latitude and longitude.
const ORIGIN = GEO['T-Centralen'];
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((ORIGIN[0] * Math.PI) / 180);
const unproject = (east: number, north: number): [number, number] => [ORIGIN[0] + north / M_PER_DEG_LAT, ORIGIN[1] + east / M_PER_DEG_LON];

const pts = Object.values(GEO).map(([lat, lon]) => project(lat, lon));
const snap = (v: number, up: boolean) => (up ? Math.ceil(v / STEP) : Math.floor(v / STEP)) * STEP;
const west = snap(Math.min(...pts.map((p) => p.east)) - MARGIN, false);
const east = snap(Math.max(...pts.map((p) => p.east)) + MARGIN, true);
const south = snap(Math.min(...pts.map((p) => p.north)) - MARGIN, false);
const north = snap(Math.max(...pts.map((p) => p.north)) + MARGIN, true);
const cols = (east - west) / STEP + 1;
const rows = (north - south) / STEP + 1;

/** A TIFF tag's values. */
function tags(file: Uint8Array): Map<number, number[]> {
  const v = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const le = file[0] === 0x49;
  const u16 = (at: number) => v.getUint16(at, le), u32 = (at: number) => v.getUint32(at, le);
  const ifd = u32(4);
  const out = new Map<number, number[]>();
  for (let i = 0; i < u16(ifd); i++) {
    const at = ifd + 2 + i * 12;
    const type = u16(at + 2), count = u32(at + 4);
    const size = type === 3 ? 2 : type === 12 ? 8 : 4;
    const base = count * size <= 4 ? at + 8 : u32(at + 8);
    out.set(u16(at), Array.from({ length: count }, (_, k) => (type === 3 ? u16(base + k * 2) : type === 12 ? v.getFloat64(base + k * 8, le) : u32(base + k * 4))));
  }
  return out;
}

/**
 * One of the Copernicus DEM's degree squares: a tiled, deflated TIFF of 32-bit floats with the floating-point predictor,
 * as its heights, its size and where it lies.
 */
function decodeDem(file: Uint8Array): { width: number; height: number; west: number; top: number; dx: number; dy: number; h: Float32Array } {
  const t = tags(file);
  const [width, height] = [t.get(256)![0], t.get(257)![0]];
  const [tw, th] = [t.get(322)![0], t.get(323)![0]];
  if (t.get(258)![0] !== 32 || t.get(259)![0] !== 8 || t.get(339)![0] !== 3) throw new Error('Only deflated 32-bit float TIFFs');
  const predictor = t.get(317)?.[0] ?? 1;
  const offsets = t.get(324)!, counts = t.get(325)!;
  const across = Math.ceil(width / tw);
  const h = new Float32Array(width * height);
  const bytes = new DataView(new ArrayBuffer(4));
  offsets.forEach((offset, k) => {
    const raw = inflateSync(file.subarray(offset, offset + counts[k]));
    const tx = (k % across) * tw, ty = Math.floor(k / across) * th;
    const rowBytes = tw * 4;
    for (let y = 0; y < th; y++) {
      const row = raw.subarray(y * rowBytes, (y + 1) * rowBytes);
      if (predictor === 3) for (let i = 1; i < rowBytes; i++) row[i] = (row[i] + row[i - 1]) & 255;
      if (ty + y >= height) continue;
      for (let x = 0; x < tw && tx + x < width; x++) {
        // The predictor keeps each float's bytes in planes, the most significant first.
        if (predictor === 3) for (let b = 0; b < 4; b++) bytes.setUint8(b, row[b * tw + x]);
        else for (let b = 0; b < 4; b++) bytes.setUint8(3 - b, row[x * 4 + b]);
        h[(ty + y) * width + tx + x] = bytes.getFloat32(0);
      }
    }
  });
  const scale = t.get(33550)!, tie = t.get(33922)!;
  return { width, height, west: tie[3] - tie[0] * scale[0], top: tie[4] + tie[1] * scale[1], dx: scale[0], dy: scale[1], h };
}

/** The degree squares, by their south-west corner. */
const squares = new Map<string, ReturnType<typeof decodeDem>>();
async function square(lat: number, lon: number): Promise<ReturnType<typeof decodeDem>> {
  const name = `Copernicus_DSM_COG_10_N${String(lat).padStart(2, '0')}_00_E${String(lon).padStart(3, '0')}_00_DEM`;
  const known = squares.get(name);
  if (known) return known;
  const path = `${CACHE}/${name}.tif`;
  if (process.argv.includes('--fresh') || !existsSync(path)) {
    console.log(`fetching ${name}`);
    const res = await fetch(`https://copernicus-dem-30m.s3.amazonaws.com/${name}/${name}.tif`, { headers: { 'User-Agent': AGENT } });
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(path, new Uint8Array(await res.arrayBuffer()));
  }
  const dem = decodeDem(new Uint8Array(readFileSync(path)));
  squares.set(name, dem);
  return dem;
}

/** The height at a latitude and longitude, from the pixel it falls in. */
async function heightAt(lat: number, lon: number): Promise<number> {
  const d = await square(Math.floor(lat), Math.floor(lon));
  const x = Math.min(d.width - 1, Math.max(0, Math.floor((lon - d.west) / d.dx)));
  const y = Math.min(d.height - 1, Math.max(0, Math.floor((d.top - lat) / d.dy)));
  return d.h[y * d.width + x];
}

// The model sampled every `STEP / SUB` meters (about its own 30), none of it lower than the water.
const SUB = 5;
const fw = cols * SUB, fh = rows * SUB;
const fine = new Float32Array(fw * fh);
for (let j = 0; j < fh; j++) {
  for (let i = 0; i < fw; i++) {
    const [lat, lon] = unproject(west + ((i + 0.5) / SUB - 0.5) * STEP, south + ((j + 0.5) / SUB - 0.5) * STEP);
    fine[j * fw + i] = Math.max(0, await heightAt(lat, lon));
  }
  if (j % 100 === 0) process.stdout.write(`${j}/${fh} `);
}
console.log();

/** The lowest (or highest) value within `r` samples of each, across and then along. */
function filter(h: Float32Array, r: number, pick: (a: number, b: number) => number): Float32Array {
  const across = new Float32Array(h.length);
  for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
    let v = h[j * fw + i];
    for (let k = Math.max(0, i - r); k <= Math.min(fw - 1, i + r); k++) v = pick(v, h[j * fw + k]);
    across[j * fw + i] = v;
  }
  const out = new Float32Array(h.length);
  for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
    let v = across[j * fw + i];
    for (let k = Math.max(0, j - r); k <= Math.min(fh - 1, j + r); k++) v = pick(v, across[k * fw + i]);
    out[j * fw + i] = v;
  }
  return out;
}
// A grey opening about a block wide takes the houses off and leaves the hills; then each grid point the mean of its cell.
const bare = filter(filter(fine, 2, Math.min), 2, Math.max);
const ground = new Float32Array(cols * rows);
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  let sum = 0;
  for (let j = 0; j < SUB; j++) for (let i = 0; i < SUB; i++) sum += bare[(r * SUB + j) * fw + c * SUB + i];
  ground[r * cols + c] = sum / (SUB * SUB);
}
// Each row as whole meters, the first plain and each next as the difference from the one before: small numbers pack well.
const heights: number[][] = [];
for (let r = 0; r < rows; r++) {
  const row = Array.from(ground.subarray(r * cols, (r + 1) * cols), (v) => Math.round(v));
  heights.push(row.map((v, c) => (c === 0 ? v : v - row[c - 1])));
}
const license = 'Heights from the Copernicus DEM GLO-30: © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved';
const format = 'bun scripts/terrain.ts: the ground\'s height above the sea in whole meters, a row per `step` meters north from `south`, each row from `west` east, its first height plain and each next as the difference from the one before; meters east and north of T-Centralen as in network/geo.ts';
writeFileSync(OUT, `{\n  "license": ${JSON.stringify(license)},\n  "format": ${JSON.stringify(format)},\n  "west": ${west}, "south": ${south}, "step": ${STEP}, "cols": ${cols}, "rows": ${rows},\n  "heights": [\n${heights.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]\n}\n`);
console.log(`${OUT}: ${cols} x ${rows}, highest ${Math.max(...ground).toFixed(0)} m, ${Math.round(Bun.gzipSync(readFileSync(OUT)).byteLength / 1000)} kB gzip`);
