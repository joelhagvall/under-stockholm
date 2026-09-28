import { hash01 } from '../clock';
import { fitText, FONT } from './signs';

/**
 * Made-up posters, stickers and notes for the station walls. Everything is
 * drawn from a seed, so a given day and station always look the same.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

const ACTS = ['Tunnelseende', 'Blå Timmen', 'Kalla Drag', 'Mälarljus', 'Sista Tåget', 'Nattljus', 'Rulltrappan', 'Perrongkören', 'Elsa Grå', 'Kasper Vind', 'Spårvagnarna', 'Stilla Havet'];
const SHOWS = ['Ljus under jord', 'Berget inifrån', 'Blått och betong', 'Sten, sax, stad', 'Det som rör sig', 'Tysta rum', 'Vinterljus', 'Staden sover aldrig'];
const PLAYS = ['Hamlet på Söder', 'Fröken Julie', 'Kärlek i rusningstid', 'Vänta på tåget', 'Allt om min granne'];
const VENUES = ['Söderhallen', 'Norra Salen', 'Galleri Perrong', 'Slusshuset', 'Scen Västra', 'Klubb Källaren', 'Lilla Scenen', 'Konsthallen Berget'];
const PALETTES: Array<[string, string, string]> = [
  ['#1b2a4a', '#f2c14e', '#f7f3e8'],
  ['#e94f37', '#1c1c1c', '#f6f1e7'],
  ['#2e6e5e', '#f4d35e', '#ffffff'],
  ['#f6f1e7', '#d7263d', '#1b1b1b'],
  ['#3d2b56', '#ff8c61', '#fbeee0'],
  ['#0b6e99', '#ffffff', '#ffd23f'],
  ['#111111', '#e0e0e0', '#ff5e5b'],
  ['#ffd23f', '#1b1b1b', '#1b1b1b'],
];

/** The time machine's 1975: brown, orange and mustard, and acts of the day (all made up). */
const ACTS_1975 = ['Gröna Vågen', 'Proggkören', 'Hötorgsbandet', 'Järvafältets Blås', 'Discokungarna', 'Syster Sol', 'Bandet från Tensta', 'Rymdorkestern'];
const SHOWS_1975 = ['Den nya staden', 'Rymdåldern', 'Konst för alla', 'Betong och grönska', 'Framtiden är här'];
const PALETTES_1975: Array<[string, string, string]> = [
  ['#d9772b', '#3b2a1e', '#f6ead2'],
  ['#6b4a2e', '#e8b04a', '#f6ead2'],
  ['#c9a13a', '#5a2e1e', '#2a1d14'],
  ['#2e6e6a', '#f0c35c', '#f6ead2'],
  ['#f2e3c2', '#b3491f', '#3b2a1e'],
];

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): number {
  let line = '';
  for (const word of text.split(' ')) {
    if (line && ctx.measureText(line + word).width > maxW) { ctx.fillText(line.trim(), x, y); line = ''; y += lineH; }
    line += word + ' ';
  }
  ctx.fillText(line.trim(), x, y);
  return y + lineH;
}

/** One made-up event poster, filling the rectangle. */
export function drawPoster(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, day: number, special?: string, past = false): void {
  const r = (k: number) => hash01(seed, k);
  const palettes = past ? PALETTES_1975 : PALETTES;
  const [bg, accent, fg] = palettes[Math.floor(r(1) * palettes.length)];
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  // A bold graphic: rings, stripes or a sun, from the seed.
  ctx.fillStyle = accent;
  ctx.strokeStyle = accent;
  const art = Math.floor(r(2) * 3);
  if (art === 0) {
    ctx.lineWidth = w * 0.05;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc(x + w * (0.3 + r(3) * 0.4), y + h * 0.36, w * (0.12 + k * 0.1), 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (art === 1) {
    for (let k = 0; k < 7; k++) ctx.fillRect(x, y + h * (0.08 + k * 0.085), w * (0.3 + r(10 + k) * 0.7), h * 0.04);
  } else {
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.42, w * 0.34, Math.PI, 0);
    ctx.fill();
    for (let k = 0; k < 5; k++) ctx.fillRect(x, y + h * (0.47 + k * 0.03), w, h * 0.012);
  }
  const kind = Math.floor(r(4) * 4);
  const acts = past ? ACTS_1975 : ACTS;
  const shows = past ? SHOWS_1975 : SHOWS;
  const title = special ?? (kind === 0 ? acts[Math.floor(r(5) * acts.length)] : kind === 1 ? shows[Math.floor(r(5) * shows.length)] : kind === 2 ? PLAYS[Math.floor(r(5) * PLAYS.length)] : acts[Math.floor(r(5) * acts.length)]);
  const label = special ? 'Hela Sverige firar' : ['Konsert', 'Utställning', 'Teater', 'Stå upp-komik'][kind];
  const when = new Date((day + 2 + Math.floor(r(6) * 40)) * 86400000);
  const date = special ? '4 oktober' : `${when.getUTCDate()} ${MONTHS[when.getUTCMonth()]}`;
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${Math.round(w * 0.07)}px ${FONT}`;
  ctx.fillText(label.toUpperCase(), x + w * 0.08, y + h * 0.66);
  fitText(ctx, title, w * 0.84, 800, w * 0.15);
  const size = parseFloat(ctx.font.split(' ')[1]);
  let ty = wrap(ctx, title, x + w * 0.08, y + h * 0.66 + size * 1.05, w * 0.84, size * 1.02);
  ctx.font = `500 ${Math.round(w * 0.065)}px ${FONT}`;
  ty = Math.max(ty, y + h * 0.86);
  ctx.fillText(`${date} · ${VENUES[Math.floor(r(7) * VENUES.length)]}`, x + w * 0.08, ty);
  ctx.font = `400 ${Math.round(w * 0.05)}px ${FONT}`;
  ctx.globalAlpha = 0.8;
  ctx.fillText(special ? 'Köp en bulle på vägen hem' : `Biljetter från ${past ? Math.round(8 + r(8) * 20) : Math.round(150 + r(8) * 300)} kr`, x + w * 0.08, ty + w * 0.08);
  ctx.globalAlpha = 1;
  ctx.restore();
}

export const STICKERS = 16;

/** Sticker `k` in a square cell: hockey teams, bands, small causes and a few jokes. */
export function drawSticker(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, k: number): void {
  const designs: Array<[string, string, string, string?]> = [
    ['AIK', '#111111', '#f5c400'],
    ['DIF', '#1d4f9c', '#f5c400', '#c8102e'],
    ['BAJEN', '#0a7a3d', '#ffffff'],
    ['TUNNEL-SEENDE', '#f06aa6', '#1b1b1b'],
    ['SILVER-PILARNA', '#b9bec3', '#1b1b1b'],
    ['MER CYKEL-BANOR', '#2f8f4e', '#ffffff'],
    ['RÄDDA KYMLINGE', '#1b1b1b', '#f2f2f2'],
    ['STÅ TILL HÖGER', '#ffd23f', '#1b1b1b'],
    ['BLÅ LINJEN ♥', '#1c63c4', '#ffffff'],
    ['KALLA DRAG LIVE', '#e94f37', '#f6f1e7'],
    ['☺', '#ffd23f', '#1b1b1b'],
    ['RÖSTA!', '#6a3d9a', '#ffffff'],
    ['LÅNGSAM MAT', '#f6f1e7', '#2e6e5e'],
    ['HEJ DÅ SILVER-PILEN', '#3a3f45', '#d9dde0'],
    ['FIKA NU', '#8a5a36', '#fbeee0'],
    ['NATTLJUS', '#111133', '#ffe066'],
  ];
  const [label, bg, fg, stripe] = designs[k % designs.length];
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, s, s);
  if (stripe) { ctx.fillStyle = stripe; ctx.fillRect(x, y + s * 0.42, s, s * 0.16); }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = s * 0.05;
  ctx.strokeRect(x + s * 0.04, y + s * 0.04, s * 0.92, s * 0.92);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = label.split('-');
  fitText(ctx, lines.reduce((a, b) => (a.length > b.length ? a : b)), s * 0.84, 900, s * (lines.length > 1 ? 0.26 : 0.38));
  const lh = parseFloat(ctx.font.split(' ')[1]) * 1.05;
  lines.forEach((l, i) => ctx.fillText(l, x + s / 2, y + s / 2 + (i - (lines.length - 1) / 2) * lh));
}

/** A handwritten notice about a lost cat, with tear-off tabs (some already taken). */
export function drawLostCat(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#fbfaf4';
  ctx.fillRect(x, y, w, h * 0.8);
  ctx.fillStyle = '#1d2530';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${Math.round(w * 0.13)}px "Comic Sans MS", "Marker Felt", ${FONT}`;
  ctx.fillText('BORTSPRUNGEN', x + w / 2, y + h * 0.03);
  ctx.fillText('KATT!', x + w / 2, y + h * 0.1);
  // A rough drawing of the cat.
  ctx.strokeStyle = '#1d2530';
  ctx.lineWidth = 3;
  const cx = x + w / 2, cy = y + h * 0.32;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.14, 0, Math.PI * 2);
  ctx.moveTo(cx - w * 0.12, cy - w * 0.08); ctx.lineTo(cx - w * 0.1, cy - w * 0.2); ctx.lineTo(cx - w * 0.03, cy - w * 0.13);
  ctx.moveTo(cx + w * 0.12, cy - w * 0.08); ctx.lineTo(cx + w * 0.1, cy - w * 0.2); ctx.lineTo(cx + w * 0.03, cy - w * 0.13);
  ctx.moveTo(cx - w * 0.2, cy + w * 0.02); ctx.lineTo(cx - w * 0.06, cy + w * 0.03);
  ctx.moveTo(cx + w * 0.2, cy + w * 0.02); ctx.lineTo(cx + w * 0.06, cy + w * 0.03);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - w * 0.05, cy - w * 0.02, 3, 0, Math.PI * 2);
  ctx.arc(cx + w * 0.05, cy - w * 0.02, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `500 ${Math.round(w * 0.075)}px "Comic Sans MS", "Marker Felt", ${FONT}`;
  wrap(ctx, 'Misse, grå och vit, svarar på sitt namn. Saknas sedan i tisdags vid spärrarna. Hittelön!', x + w / 2, y + h * 0.47, w * 0.86, w * 0.09);
  // Tear-off tabs along the bottom, a few already gone.
  const tabs = 7;
  const tw = w / tabs;
  for (let i = 0; i < tabs; i++) {
    if (i === 1 || i === 4) continue;
    ctx.fillStyle = '#fbfaf4';
    ctx.fillRect(x + i * tw + 1, y + h * 0.8, tw - 2, h * 0.2);
    ctx.save();
    ctx.translate(x + i * tw + tw / 2, y + h * 0.9);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#1d2530';
    ctx.font = `500 ${Math.round(tw * 0.34)}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Misse · ring', 0, 0);
    ctx.restore();
  }
}

/** The notice above an escalator: the usual reminder, or an apology when it stands still. */
export function drawEscalatorNotice(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, broken: boolean): void {
  ctx.fillStyle = broken ? '#f4d03f' : '#10325f';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = broken ? '#1c2025' : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const message = broken ? 'Rulltrappan står still · Vi beklagar' : 'Stå till höger · Gå till vänster';
  fitText(ctx, message, w * 0.92, 700, h * 0.5);
  ctx.fillText(message, x + w / 2, y + h / 2 + 2);
}
