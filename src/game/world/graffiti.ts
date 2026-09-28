import { BufferGeometry, CanvasTexture, Float32BufferAttribute, Mesh, MeshBasicMaterial, SRGBColorSpace } from 'three';
import { hash01 } from '../clock';
import { TRACK_Z, TUBE_HALF_W } from '../layout';
import type { Section } from './section';

/**
 * Tags and old pieces on the tunnel rock. They sit near the tunnel lamps, so
 * from a moving train they flash past in the dark and are gone.
 */

const CELL = 256;
const COLS = 4;
const ROWS = 2;
const WORDS = ['KYM', 'BLÅ', 'NOIZ', 'RAZ', 'DEPÅ', 'SILVR', 'T10', 'OMG'];
const COLORS = [['#e94f37', '#fbeee0'], ['#3fa7d6', '#111111'], ['#f2c14e', '#1b1b1b'], ['#9b5de5', '#f1f1f1'], ['#00bb77', '#0b0b0b'], ['#f15bb5', '#fff3b0'], ['#e0e0e0', '#222222'], ['#ff8c42', '#2b2b2b']];

let material: MeshBasicMaterial | null = null;

function graffitiMaterial(): MeshBasicMaterial {
  if (material) return material;
  const c = document.createElement('canvas');
  c.width = CELL * COLS;
  c.height = CELL * ROWS;
  const ctx = c.getContext('2d')!;
  WORDS.forEach((word, i) => {
    const x = (i % COLS) * CELL;
    const y = Math.floor(i / COLS) * CELL;
    const [fill, outline] = COLORS[i];
    ctx.save();
    ctx.translate(x + CELL / 2, y + CELL / 2);
    ctx.rotate((hash01(i, 3) - 0.5) * 0.35);
    ctx.font = `900 ${word.length > 4 ? 70 : 96}px Impact, "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (i % 3 === 0) {
      // A quick tag: one thin, slanted line of paint.
      ctx.strokeStyle = fill;
      ctx.lineWidth = 7;
      ctx.font = `italic 700 88px "Brush Script MT", "Segoe Script", cursive`;
      ctx.strokeText(word.toLowerCase(), 0, 0);
      ctx.beginPath();
      ctx.moveTo(-90, 46);
      ctx.bezierCurveTo(-30, 70, 40, 30, 100, 52);
      ctx.stroke();
    } else {
      // A piece: outlined block letters with a shadow and drips.
      ctx.lineWidth = 18;
      ctx.strokeStyle = outline;
      ctx.strokeText(word, 6, 6);
      ctx.strokeText(word, 0, 0);
      ctx.fillStyle = fill;
      ctx.fillText(word, 0, 0);
      ctx.fillStyle = fill;
      for (let d = 0; d < 6; d++) ctx.fillRect(-80 + hash01(i * 10 + d, 4) * 160, 30, 4, 12 + hash01(i * 10 + d, 5) * 40);
    }
    ctx.restore();
  });
  const texture = new CanvasTexture(c);
  texture.colorSpace = SRGBColorSpace;
  material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, color: 0x8d8a86 });
  return material;
}

/** Graffiti along both tubes between x0 and x1, near the lamps (every 25 m). */
export function buildGraffiti(s: Section, x0: number, x1: number, seed: number): void {
  const position: number[] = [];
  const uv: number[] = [];
  const first = Math.ceil(x0 / 25) * 25;
  let k = 0;
  for (const zc of [-TRACK_Z, TRACK_Z]) {
    for (let lamp = first; lamp < x1; lamp += 25, k++) {
      if (hash01(seed * 131 + k, 8) > 0.6) continue;
      const word = Math.floor(hash01(seed * 131 + k, 9) * WORDS.length);
      const w = 1.4 + hash01(seed * 131 + k, 10) * 1.6;
      const h = w * 0.62;
      const x = lamp + (hash01(seed * 131 + k, 11) - 0.5) * 8;
      if (x - w / 2 < x0 + 2 || x + w / 2 > x1 - 2) continue;
      // Either the outer or the inner tube wall, a little in front of the rock.
      const outer = hash01(seed * 131 + k, 12) < 0.5 ? 1 : -1;
      const z = zc + Math.sign(zc) * outer * (TUBE_HALF_W - 0.8);
      const y = 0.95 + hash01(seed * 131 + k, 13) * 0.5;
      const u0 = (word % COLS) / COLS, u1 = u0 + 1 / COLS;
      const v1 = 1 - Math.floor(word / COLS) / ROWS, v0 = v1 - 1 / ROWS;
      // Readable from inside the tube: left edge toward the viewer's left.
      const facing = -Math.sign(z - zc);
      const xl = x - (w / 2) * facing, xr = x + (w / 2) * facing;
      position.push(xl, y, z, xr, y, z, xr, y + h, z, xl, y, z, xr, y + h, z, xl, y + h, z);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    }
  }
  if (!position.length) return;
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(position, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mesh = new Mesh(geo, graffitiMaterial());
  mesh.name = 'graffiti';
  mesh.renderOrder = 1;
  s.extras.add(mesh);
}
