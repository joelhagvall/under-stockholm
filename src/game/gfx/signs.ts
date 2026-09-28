import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Material,
} from 'three';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export interface CanvasSign {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  material: MeshBasicMaterial;
}

let signsOff = false;

/** While off, signs are 1 px blanks that are never drawn: for dry world passes (see `Section`). */
export function withoutSigns<T>(build: () => T): T {
  signsOff = true;
  try { return build(); } finally { signsOff = false; }
}

export function createCanvasSign(pxW: number, pxH: number, draw?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): CanvasSign {
  const canvas = document.createElement('canvas');
  const blank = signsOff;
  canvas.width = blank ? 1 : pxW;
  canvas.height = blank ? 1 : pxH;
  if (blank) draw = undefined;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  draw?.(ctx, pxW, pxH);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new MeshBasicMaterial({ map: texture });
  return { canvas, ctx, texture, material };
}

export function redraw(sign: CanvasSign, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void {
  if (sign.canvas.width === 1) return;
  draw(sign.ctx, sign.canvas.width, sign.canvas.height);
  sign.texture.needsUpdate = true;
}

export function signMesh(material: Material, w: number, h: number, doubleSided = false): Mesh {
  const mesh = new Mesh(new PlaneGeometry(w, h), material);
  if (doubleSided) {
    (material as MeshBasicMaterial).side = DoubleSide;
  }
  return mesh;
}

/** Round line bullet, like the numbered circles on metro signage. */
export function drawBullet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, label: string, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${Math.round(r * 1.05)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + r * 0.05);
}

export function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, weight: number, size: number, family = FONT): void {
  ctx.font = `${weight} ${size}px ${family}`;
  const width = ctx.measureText(text).width;
  if (size <= 8 || width <= maxW) return;
  // The largest fitting two-pixel step. Text grows almost in proportion to its size, so the first width gives a
  // close guess, and a measure or two either side settles it (setting a font is the slow part).
  const high = Math.ceil((size - 8) / 2);
  const fits = (step: number) => {
    ctx.font = `${weight} ${size - step * 2}px ${family}`;
    return ctx.measureText(text).width <= maxW;
  };
  let step = Math.min(high, Math.max(1, Math.ceil((size - (size * maxW) / width) / 2)));
  while (step < high && !fits(step)) step++;
  while (step > 1 && fits(step - 1)) step--;
  ctx.font = `${weight} ${size - step * 2}px ${family}`;
}

/** Splits text into at most `max` lines that fit `width` in the current font; the last line takes whatever is left. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width && lines.length < max - 1) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  lines.push(line);
  return lines;
}

export const SIGN_BG = '#10325f';
export const SIGN_FG = '#ffffff';
