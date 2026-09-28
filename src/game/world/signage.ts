import { Mesh, Vector3 } from 'three';
import { createCanvasSign, fitText, FONT, SIGN_BG, SIGN_FG, signMesh, type CanvasSign } from '../gfx/signs';
import { SIGN_LAYOUT } from '../layout';
import type { Section } from './section';

export function textSign(text: string, pxW: number, pxH: number, bg = SIGN_BG, fg = SIGN_FG): CanvasSign {
  return createCanvasSign(pxW, pxH, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    fitText(ctx, text, w - 40, 700, h * 0.55);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

/** Adds a sign plane facing the given direction (unit vector in the xz plane). */
export function place(section: Section, sign: CanvasSign, w: number, h: number, pos: Vector3, facing: Vector3): Mesh {
  if (section.dry) return new Mesh();
  const mesh = signMesh(sign.material, w, h);
  mesh.position.copy(pos).addScaledVector(facing, SIGN_LAYOUT.faceGap);
  mesh.rotation.y = Math.atan2(facing.x, facing.z);
  section.extras.add(mesh);
  return mesh;
}

/** Green emergency exit sign with a running figure, as used in Swedish public spaces. */
export function exitSign(label = 'Nödutgång'): CanvasSign {
  return createCanvasSign(512, 192, (ctx, w, h) => {
    ctx.fillStyle = '#16804a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Door outline and a running figure heading into it.
    ctx.lineWidth = 7;
    ctx.strokeRect(36, 30, 74, 132);
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.arc(152, 54, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(146, 76); ctx.lineTo(128, 118);
    ctx.moveTo(128, 118); ctx.lineTo(150, 140); ctx.lineTo(142, 168);
    ctx.moveTo(128, 118); ctx.lineTo(108, 142); ctx.lineTo(86, 138);
    ctx.moveTo(140, 88); ctx.lineTo(166, 104); ctx.lineTo(186, 94);
    ctx.moveTo(140, 88); ctx.lineTo(116, 98); ctx.lineTo(104, 116);
    ctx.stroke();
    ctx.font = `700 54px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    fitText(ctx, label, w - 232, 700, 54);
    ctx.fillText(label, 214, h / 2 + 2);
  });
}

/** The Swedish civil defence shelter mark: a blue triangle on orange. */
export function shelterSign(): CanvasSign {
  return createCanvasSign(256, 320, (ctx, w, h) => {
    ctx.fillStyle = '#f08a1c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1c4a9a';
    ctx.beginPath();
    ctx.moveTo(w / 2, 34);
    ctx.lineTo(w - 36, 214);
    ctx.lineTo(36, 214);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#10151c';
    ctx.font = `800 40px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, 'SKYDDSRUM', w - 24, 800, 40);
    ctx.fillText('SKYDDSRUM', w / 2, 266);
  });
}

/** Rough white house paint on plywood or rock. */
export function paintedSign(text: string, pxW: number, pxH: number, board: string | null = '#8a6a45'): CanvasSign {
  return createCanvasSign(pxW, pxH, (ctx, w, h) => {
    if (board) {
      ctx.fillStyle = board;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#00000022';
      for (let y = 6; y < h; y += 11) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(w * 0.3, y + 4, w * 0.6, y - 3, w, y + 2); ctx.stroke(); }
    } else ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f1efe6';
    fitText(ctx, text, w - 60, 800, h * 0.62);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Several offset passes give the letters a brushed, uneven edge.
    for (let i = 0; i < 6; i++) {
      ctx.globalAlpha = 0.35;
      ctx.fillText(text, w / 2 + Math.sin(i * 2.1) * 2.5, h / 2 + Math.cos(i * 1.7) * 2.5);
    }
    ctx.globalAlpha = 1;
    // Drips.
    for (let i = 0; i < 9; i++) {
      const x = w * 0.15 + (w * 0.7 * ((i * 37) % 100)) / 100;
      ctx.fillRect(x, h * 0.7, 3, 10 + ((i * 53) % 30));
    }
  });
}
