import text from '../i18n/sv.json';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { wrapText } from './signs';

/**
 * Procedural textures, drawn on canvases at startup. Nothing is loaded from
 * disk, and nothing is traced from photos of the real stations.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

export function finish(c: HTMLCanvasElement, repeatMeters: number | null, srgb = true): Texture {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  if (repeatMeters) t.repeat.set(1 / repeatMeters, 1 / repeatMeters);
  return t;
}

/** Tileable multi-octave value noise in [0, 1], `size` x `size`. */
function tileNoise(size: number, cells: number[], weights: number[], seed: number): Float32Array {
  const rnd = mulberry32(seed);
  const out = new Float32Array(size * size);
  let norm = 0;
  cells.forEach((n, o) => {
    const grid = Array.from({ length: n * n }, rnd);
    const w = weights[o];
    norm += w;
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * n;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * n;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const at = (i: number, j: number) => grid[((j % n) * n + (i % n)) | 0];
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        out[y * size + x] += (a + (b - a) * sy) * w;
      }
    }
  });
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

const cache = new Map<string, Texture>();

export function cached(key: string, make: () => Texture): Texture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** Fine grain for rock, concrete and metal. Mostly near white so it only modulates. */
export function detailTexture(): Texture {
  return cached('detail', () => {
    const size = 256;
    const [c, ctx] = canvas(size, size);
    const n = tileNoise(size, [4, 16, 64, 128], [0.35, 0.3, 0.2, 0.15], 11);
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < n.length; i++) {
      const v = Math.round(200 + n[i] * 55);
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return finish(c, 2.5);
  });
}

/** Stone floor slabs, 0.6 m square, with grout and terrazzo speckle. */
export function floorTexture(): Texture {
  return cached('floor', () => {
    const size = 512;
    const tiles = 4;
    const [c, ctx] = canvas(size, size);
    const rnd = mulberry32(5);
    const t = size / tiles;
    for (let j = 0; j < tiles; j++) {
      for (let i = 0; i < tiles; i++) {
        const k = 103 + Math.round(rnd() * 12);
        ctx.fillStyle = `rgb(${k}, ${k + 1}, ${k + 2})`;
        ctx.fillRect(i * t, j * t, t, t);
      }
    }
    for (let s = 0; s < 9000; s++) {
      const k = rnd();
      ctx.fillStyle = k < 0.5 ? 'rgba(90, 86, 80, 0.35)' : k < 0.85 ? 'rgba(235, 232, 225, 0.4)' : 'rgba(150, 110, 90, 0.35)';
      const r = 0.6 + rnd() * 1.6;
      ctx.fillRect(rnd() * size, rnd() * size, r, r);
    }
    ctx.fillStyle = 'rgba(205, 207, 201, 0.5)';
    for (let i = 0; i <= tiles; i++) {
      ctx.fillRect(i * t - 0.6, 0, 1.2, size);
      ctx.fillRect(0, i * t - 0.6, size, 1.2);
    }
    return finish(c, 2.4);
  });
}

/** Pale terrazzo: stone chips in cement, polished. Tinted by the station's floor colour. */
export function terrazzoTexture(): Texture {
  return cached('terrazzo', () => {
    const size = 512;
    const [c, ctx] = canvas(size, size);
    const rnd = mulberry32(17);
    ctx.fillStyle = 'rgb(232, 230, 224)';
    ctx.fillRect(0, 0, size, size);
    for (let s = 0; s < 14000; s++) {
      const k = rnd();
      ctx.fillStyle = k < 0.45 ? 'rgba(150, 146, 138, 0.5)' : k < 0.8 ? 'rgba(255, 255, 250, 0.6)' : k < 0.93 ? 'rgba(110, 100, 90, 0.5)' : 'rgba(60, 58, 55, 0.5)';
      const r = 0.8 + rnd() * 2.6;
      ctx.fillRect(rnd() * size, rnd() * size, r, r * (0.6 + rnd() * 0.8));
    }
    // Brass strips between the poured fields.
    ctx.fillStyle = 'rgba(170, 150, 100, 0.55)';
    ctx.fillRect(0, 0, size, 2);
    ctx.fillRect(0, 0, 2, size);
    return finish(c, 2.4);
  });
}

/** Ribbed tactile guidance strip. */
export function tactileTexture(): Texture {
  return cached('tactile', () => {
    const [c, ctx] = canvas(128, 128);
    ctx.fillStyle = '#d9d6cf';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#a9a59c';
    for (let i = 0; i < 4; i++) ctx.fillRect(i * 32 + 10, 0, 12, 128);
    return finish(c, 0.4);
  });
}

/** Soft radial sprite for light halos. */
export function glowTexture(): Texture {
  return cached('glow', () => {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.25, 'rgba(255, 255, 255, 0.45)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  });
}

/** A soft puff with no bright core, for mist and haze: the halo's core reads as a lamp. */
export function puffTexture(): Texture {
  return cached('puff', () => {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    g.addColorStop(0.5, 'rgba(255, 255, 255, 0.25)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  });
}

/**
 * Blue botanical vines on a white painted vault: an original design in the
 * spirit of T-Centralen's blue platforms. Mapped with u along the platform
 * (repeating every `period` meters) and v over the vault's cross-section
 * (0 at the left wall foot, 1 at the right wall foot, `arcLength` meters).
 */
export function vineTexture(period: number, arcLength: number): Texture {
  return cached(`vines-${period}-${arcLength.toFixed(1)}`, () => {
    const W = 2048;
    const H = 2048;
    // Drawn in 2048 px units, rendered at three quarters: the flat shapes stay crisp at half the memory.
    const S = 0.75;
    const [c, ctx] = canvas(W * S, H * S);
    const pxPerM = W / period;
    // Draw in "meter-true" pixel units, squashed vertically onto the canvas.
    const ky = H / (arcLength * pxPerM);
    const fullH = arcLength * pxPerM;
    const rnd = mulberry32(1975);

    // Cream, as Ultvedt's vaults are, not white.
    ctx.fillStyle = '#ebe3cc';
    ctx.fillRect(0, 0, W * S, H * S);
    ctx.setTransform(S, 0, 0, S * ky, 0, 0);

    // Mottled paint over rough rock.
    for (let i = 0; i < 700; i++) {
      const x = rnd() * W;
      const y = rnd() * fullH;
      const r = 20 + rnd() * 120;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tone = rnd() < 0.5 ? '214, 204, 180' : '250, 245, 230';
      g.addColorStop(0, `rgba(${tone}, 0.18)`);
      g.addColorStop(1, `rgba(${tone}, 0)`);
      ctx.fillStyle = g;
      for (const dx of [-W, 0, W]) {
        ctx.save();
        ctx.translate(dx, 0);
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.restore();
      }
    }

    const blues = ['#1b4f9c', '#2462b6', '#163f80', '#2a6dc4'];
    const band = 2.4 * pxPerM;

    // Deep blue lower walls with a ragged top edge.
    const drawBand = (top: boolean) => {
      ctx.fillStyle = '#1a4b95';
      ctx.beginPath();
      const y0 = top ? 0 : fullH;
      ctx.moveTo(0, y0);
      for (let x = 0; x <= W; x += 16) {
        const wave = Math.sin((x / W) * Math.PI * 2 * 7) * 0.18 + Math.sin((x / W) * Math.PI * 2 * 17 + 1.3) * 0.08;
        const h = band * (1 + wave);
        ctx.lineTo(x, top ? h : fullH - h);
      }
      ctx.lineTo(W, y0);
      ctx.closePath();
      ctx.fill();
    };
    drawBand(true);
    drawBand(false);

    const leaf = (x: number, y: number, angle: number, len: number, color: string) => {
      for (const dx of [-W, 0, W]) {
        ctx.save();
        ctx.translate(x + dx, y);
        ctx.rotate(angle);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(len * 0.5, -len * 0.38, len, 0);
        ctx.quadraticCurveTo(len * 0.5, len * 0.38, 0, 0);
        ctx.fill();
        ctx.restore();
      }
    };

    // Broad, paired leaves follow calm sweeping branches, rather than fine ivy.
    const stem = (x: number, y: number, direction: number, bend: number) => {
      const length = fullH * 0.43;
      const points: Array<[number, number]> = [];
      const steps = 28;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        points.push([x + Math.sin(t * 2.1) * bend, y + direction * t * length]);
      }
      ctx.strokeStyle = '#245782';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      for (const shift of [-W, 0, W]) {
        ctx.beginPath();
        points.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px + shift, py) : ctx.lineTo(px + shift, py));
        ctx.stroke();
      }
      for (let i = 2; i < steps; i += 2) {
        const [px, py] = points[i];
        const [nx, ny] = points[i + 1];
        const angle = Math.atan2(ny - py, nx - px);
        const taper = Math.sin((i / steps) * Math.PI) * 0.65 + 0.5;
        for (const side of [-1, 1]) {
          leaf(px, py, angle + side * 0.98, (105 + rnd() * 32) * taper, blues[i % blues.length]);
        }
      }
    };
    for (let i = 0; i < 8; i++) {
      const fromTop = i % 2 === 0;
      stem((i / 8) * W, fromTop ? band * 0.6 : fullH - band * 0.6, fromTop ? 1 : -1, (i % 3 - 1) * 300 + 90);
    }

    // Per Olof Ultvedt's silhouettes of the workers who built the station, life size in flat blue,
    // standing on the blue band: with a shovel, a drill, a pick, a plank on the shoulder, and resting.
    const worker = (x: number, pose: number, fromTop: boolean) => {
      const m = pxPerM;
      for (const dx of [-W, 0, W]) {
        ctx.save();
        // Feet on the band, head toward the crown of the vault.
        ctx.translate(x + dx, fromTop ? band : fullH - band);
        ctx.scale(m, fromTop ? m : -m);
        ctx.fillStyle = '#1f4e9c';
        ctx.strokeStyle = '#1f4e9c';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const limb = (pts: Array<[number, number]>, w: number) => {
          ctx.lineWidth = w;
          ctx.beginPath();
          pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.stroke();
        };
        // Legs, torso, head and a helmet brim.
        const lean = [0.05, 0.25, 0.18, 0, -0.05][pose];
        limb([[-0.14, 0], [-0.08 + lean * 0.3, 0.85]], 0.15);
        limb([[0.16, 0], [0.08 + lean * 0.3, 0.85]], 0.15);
        limb([[lean * 0.3, 0.85], [lean, 1.42]], 0.34);
        ctx.beginPath(); ctx.arc(lean * 1.05, 1.62, 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(lean * 1.05 - 0.17, 1.66, 0.34, 0.04);
        if (pose === 0) {
          // Leaning on a shovel.
          limb([[lean, 1.35], [0.4, 1.0]], 0.1);
          limb([[0.45, 0.02], [0.4, 1.3]], 0.05);
          ctx.fillRect(0.33, 0, 0.24, 0.26);
        } else if (pose === 1) {
          // Bent over a rock drill.
          limb([[lean, 1.35], [0.5, 1.05]], 0.1);
          limb([[0.52, 1.2], [0.55, 0.0]], 0.08);
          ctx.fillRect(0.4, 1.05, 0.3, 0.22);
        } else if (pose === 2) {
          // Swinging a pick overhead.
          limb([[lean, 1.38], [0.35, 1.85]], 0.1);
          limb([[0.1, 2.1], [0.7, 1.6]], 0.05);
          limb([[0.55, 1.95], [0.85, 1.55]], 0.06);
        } else if (pose === 3) {
          // A plank on the shoulder.
          limb([[0, 1.38], [0.25, 1.5]], 0.1);
          ctx.fillRect(-0.9, 1.45, 1.9, 0.09);
        } else {
          // Resting, hands on the hips.
          limb([[-0.02, 1.38], [-0.28, 1.1], [-0.12, 0.9]], 0.1);
          limb([[0.02, 1.38], [0.28, 1.1], [0.12, 0.9]], 0.1);
        }
        ctx.restore();
      }
    };
    for (let k = 0; k < 5; k++) worker(((k + 0.3) / 5) * W, k, k % 2 === 0);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Paint grain.
    const img = ctx.getImageData(0, 0, W * S, H * S);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = (rnd() - 0.5) * 14;
      d[i] += g;
      d[i + 1] += g;
      d[i + 2] += g;
    }
    ctx.putImageData(img, 0, 0);

    const t = finish(c, null);
    return t;
  });
}

/**
 * Plain woven seat fabric, neutral grey so the vertex color gives the seat
 * its colour: the cushions, and every seat without a pattern.
 */
export function weaveTexture(): Texture {
  return cached('weave', () => {
    const size = 256;
    const [c, ctx] = canvas(size, size);
    const rnd = mulberry32(2020);
    ctx.fillStyle = '#e4e4e4';
    ctx.fillRect(0, 0, size, size);
    // Fine warp and weft, then flecks of a heathered yarn.
    for (let i = 0; i < size; i += 2) {
      ctx.fillStyle = `rgba(0, 0, 0, ${0.05 + rnd() * 0.05})`;
      ctx.fillRect(0, i, size, 1);
      ctx.fillRect(i, 0, 1, size);
    }
    for (let i = 0; i < 5000; i++) {
      const g = rnd() < 0.5 ? 255 : 150;
      ctx.fillStyle = `rgba(${g}, ${g}, ${g}, 0.35)`;
      ctx.fillRect(rnd() * size, rnd() * size, 2, 1);
    }
    return finish(c, 0.25);
  });
}

/**
 * The renovated C20's seat backs: rows of large triangles in two shades, in
 * the spirit of SL's fabric, drawn once per back (the seat's own UVs) and
 * tinted by the vertex color. `contrast` is the dark shade's brightness: the
 * yellow priority seats have a quieter pattern than the navy ones.
 */
export function seatBackTexture(contrast: number): Texture {
  return cached(`seat-back-${contrast}`, () => {
    const size = 256;
    const [c, ctx] = canvas(size, size);
    const rnd = mulberry32(2024);
    const light = '#ffffff';
    const d = Math.round(255 * contrast);
    const dark = `rgb(${d}, ${d}, ${d})`;
    const rows = 4;
    const h = size / rows;
    const w = size / 2;
    for (let r = 0; r < rows; r++) {
      const y0 = r * h, y1 = y0 + h;
      // Triangles pointing up and down in turn, each row shifted by half a triangle.
      for (let k = -2; k < 5; k++) {
        const x = k * (w / 2) + (r % 2) * (w / 2);
        const up = (k + r) % 2 === 0;
        ctx.fillStyle = up ? dark : light;
        ctx.beginPath();
        if (up) { ctx.moveTo(x, y1); ctx.lineTo(x + w / 2, y0); ctx.lineTo(x + w, y1); }
        else { ctx.moveTo(x, y0); ctx.lineTo(x + w / 2, y1); ctx.lineTo(x + w, y0); }
        ctx.closePath();
        ctx.fill();
      }
    }
    // The weave over the whole pattern.
    for (let i = 0; i < size; i += 2) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
      ctx.fillRect(0, i, size, 1);
    }
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = `rgba(0, 0, 0, ${rnd() * 0.12})`;
      ctx.fillRect(rnd() * size, rnd() * size, 2, 1);
    }
    return finish(c, null);
  });
}

/** The flex area's pictograms under its lean bar: a pram and a wheelchair, white on dark grey. */
export function flexSignTexture(): Texture {
  return cached('flex-sign', () => {
    const [c, ctx] = canvas(256, 128);
    ctx.fillStyle = '#3c4146';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Pram: a hood and basket, a handle and two wheels.
    ctx.beginPath();
    ctx.moveTo(24, 58);
    ctx.lineTo(96, 58);
    ctx.arc(64, 58, 32, 0, Math.PI * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(40, 58);
    ctx.arc(64, 58, 24, Math.PI, Math.PI * 1.5);
    ctx.lineTo(64, 58);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(96, 58);
    ctx.lineTo(108, 30);
    ctx.stroke();
    for (const x of [44, 88]) { ctx.beginPath(); ctx.arc(x, 104, 9, 0, Math.PI * 2); ctx.stroke(); }
    // Wheelchair: the sitter's head and body, the seat and a large wheel.
    ctx.beginPath(); ctx.arc(176, 26, 10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(172, 44);
    ctx.lineTo(172, 76);
    ctx.lineTo(206, 76);
    ctx.lineTo(220, 104);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(172, 88, 26, Math.PI * 0.15, Math.PI * 1.35); ctx.stroke();
    return finish(c, null);
  });
}

/** Line map strip above the train windows: white band with the blue line and station dots. */
export function routeMapTexture(): Texture {
  return cached('route-map', () => {
    const [c, ctx] = canvas(1024, 64);
    ctx.fillStyle = '#f2f1ec';
    ctx.fillRect(0, 0, 1024, 64);
    ctx.strokeStyle = '#1c63c4';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(24, 32);
    ctx.lineTo(1000, 32);
    ctx.stroke();
    const rnd = mulberry32(10);
    for (let x = 70; x < 1000; x += 90 + Math.round(rnd() * 40)) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, 32, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1c63c4';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    const t = finish(c, null);
    // One tile spans 12 m along the car and the 9 cm strip height.
    t.repeat.set(1 / 12, 1 / 0.09);
    return t;
  });
}

/** Speckled grey vinyl flooring for the trains. */
export function vinylTexture(): Texture {
  return cached('vinyl', () => {
    const size = 512;
    const [c, ctx] = canvas(size, size);
    const rnd = mulberry32(77);
    ctx.fillStyle = '#a4a29b';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 14000; i++) {
      const k = rnd();
      ctx.fillStyle = k < 0.4 ? '#8a8880' : k < 0.8 ? '#b8b6ae' : '#cbc9c2';
      ctx.fillRect(rnd() * size, rnd() * size, 2, 2);
    }
    return finish(c, 1.2);
  });
}

/** Sliding door leaf: SL blue panel, dark rounded window, rubber edge and a push button. */
export function doorLeafTexture(interior = false): Texture {
  return cached(interior ? 'door-interior' : 'door-leaf', () => {
    const [c, ctx] = canvas(256, 512);
    ctx.fillStyle = interior ? '#c9cdd0' : '#2a7cc8';
    ctx.fillRect(0, 0, 256, 512);
    const shade = ctx.createLinearGradient(0, 0, 256, 0);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0.22)');
    shade.addColorStop(0.5, 'rgba(255, 255, 255, 0.07)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 256, 512);
    // Window with rounded corners and a pale frame.
    const wx = 48, wy = 40, ww = 160, wh = 216, wr = 18;
    ctx.fillStyle = '#c8ced4';
    ctx.beginPath();
    ctx.roundRect(wx - 6, wy - 6, ww + 12, wh + 12, wr + 6);
    ctx.fill();
    // Tinted glass: the leaf is see-through here (its materials are transparent).
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.roundRect(wx, wy, ww, wh, wr);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(20, 30, 40, 0.34)';
    ctx.beginPath();
    ctx.roundRect(wx, wy, ww, wh, wr);
    ctx.fill();
    const glass = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
    glass.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    glass.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.roundRect(wx, wy, ww, wh, wr);
    ctx.fill();
    // Rubber meeting edges.
    ctx.fillStyle = '#1e2228';
    ctx.fillRect(0, 0, 12, 512);
    ctx.fillRect(244, 0, 12, 512);
    // Door open button.
    ctx.fillStyle = '#3aa35c';
    ctx.beginPath();
    ctx.arc(128, 310, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e8ebee';
    ctx.lineWidth = 4;
    ctx.stroke();
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

/** Door columns inside the train: grey with perforated speaker panels and a red emergency panel. */
export function columnTexture(): Texture {
  return cached('column', () => {
    const [c, ctx] = canvas(256, 512);
    ctx.fillStyle = '#c9cbcd';
    ctx.fillRect(0, 0, 256, 512);
    const shade = ctx.createLinearGradient(0, 0, 256, 0);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0.16)');
    shade.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 256, 512);
    // Perforated speaker panels.
    ctx.fillStyle = 'rgba(70, 74, 80, 0.8)';
    for (const py of [30, 380]) {
      for (let y = py; y < py + 100; y += 10) {
        for (let x = 34; x < 222; x += 10) {
          ctx.beginPath();
          ctx.arc(x, y, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Red emergency panel.
    ctx.fillStyle = '#b3261e';
    ctx.fillRect(74, 190, 108, 120);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(86, 204, 84, 10);
    ctx.fillRect(86, 222, 60, 6);
    ctx.fillRect(86, 234, 72, 6);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

/** A generated passenger-information poster in the reference's slim wall frames. */
export function cabinPosterTexture(): Texture {
  return cached('cabin-poster', () => {
    const [c, ctx] = canvas(512, 512);
    ctx.fillStyle = '#f1f1eb'; ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#1b619e'; ctx.fillRect(0, 0, 512, 190);
    ctx.fillStyle = '#ffffff'; ctx.font = '600 48px system-ui';
    ctx.textAlign = 'center'; ctx.fillText(text.cabinPoster.title, 256, 115);
    ctx.fillStyle = '#263d4c'; ctx.font = '24px system-ui';
    text.cabinPoster.lines.forEach((line, i) => ctx.fillText(line, 256, 280 + i * 55));
    return finish(c, null);
  });
}

/** White metro wall tiles with grey grout, 0.6 m per repeat. */
export function tileTexture(): Texture {
  return cached('tiles', () => {
    const [c, ctx] = canvas(256, 256);
    const rnd = mulberry32(31);
    const n = 4;
    const t = 256 / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = 232 + Math.round(rnd() * 14);
        ctx.fillStyle = `rgb(${k}, ${k + 1}, ${k + 2})`;
        ctx.fillRect(i * t, j * t, t, t);
        const g = ctx.createLinearGradient(i * t, j * t, i * t + t, j * t + t);
        g.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
        g.addColorStop(1, 'rgba(160, 165, 170, 0.18)');
        ctx.fillStyle = g;
        ctx.fillRect(i * t, j * t, t, t);
      }
    }
    ctx.fillStyle = '#9a9a94';
    for (let k = 0; k <= n; k++) {
      ctx.fillRect(k * t - 2, 0, 4, 256);
      ctx.fillRect(0, k * t - 2, 256, 4);
    }
    return finish(c, 0.6);
  });
}

/** A free newspaper page, loose on the platform. Shows a made-up headline until `setNewspaperHeadline` gives it today's. */
export function newspaperTexture(): Texture {
  return cached('newspaper', () => {
    const [c] = canvas(256, 192);
    drawNewspaperPage(c, text.newspaper.headlines[0]);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  });
}

/** Redraws the loose pages with a real headline (see `news.ts`), or the made-up one for null. */
export function setNewspaperHeadline(headline: string | null): void {
  const t = newspaperTexture();
  drawNewspaperPage(t.image as HTMLCanvasElement, headline ?? text.newspaper.headlines[0]);
  t.needsUpdate = true;
}

function drawNewspaperPage(c: HTMLCanvasElement, headline: string): void {
  const ctx = c.getContext('2d')!;
  const rnd = mulberry32(8);
  ctx.fillStyle = '#e9e5da';
  ctx.fillRect(0, 0, 256, 192);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(0, 0, 256, 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 20px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.newspaper.name, 10, 16);
  ctx.fillStyle = '#1b1b1b';
  // Short headlines fill one big line; longer ones wrap onto two smaller lines and push the photo down.
  ctx.font = '800 17px system-ui, sans-serif';
  let lines = [headline];
  if (ctx.measureText(headline).width > 236) {
    ctx.font = '800 14px system-ui, sans-serif';
    lines = wrapText(ctx, headline, 236, 2);
  }
  lines.forEach((line, i) => ctx.fillText(line, 10, (lines.length > 1 ? 42 : 46) + i * 15, 236));
  const top = lines.length > 1 ? 68 : 60;
  ctx.fillStyle = '#8a8f94';
  // The photo fills the first column only.
  ctx.fillRect(10, top, 72, 130 - top);
  for (let col = 0; col < 3; col++) {
    for (let y = top + 2; y < 184; y += 5) {
      if (col === 0 && y < 134) continue;
      ctx.fillStyle = `rgba(40, 40, 40, ${0.35 + rnd() * 0.3})`;
      ctx.fillRect(10 + col * 82, y, 70 - rnd() * 14, 2);
    }
  }
}

