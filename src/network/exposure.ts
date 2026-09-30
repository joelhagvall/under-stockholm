import { formatClock, stockholm, stockholmEpoch } from '../game/clock';
import { LINES } from '../landing/lines';
import { gameTrains, type MapTrain } from '../landing/trains';
import { allRoutes, blend, placeTrain, silverTrain, STATIONS, type NetPoint } from './data';
import { project, WATER } from './geo';

/**
 * The long exposure: every run of one day drawn as a single photograph. The timetable is a pure function of the
 * clock, so a day needs no simulation: every train is sampled from the morning's first run to the night's last and
 * its path added up in a light buffer, bright where trains pass often and at the platforms where they stand, then
 * tone mapped on a log curve so the trunk through T-Centralen does not burn out while quiet branches still show.
 * Plain Canvas 2D, free of three.js.
 */

export interface ExposureDay {
  year: number;
  month: number;
  day: number;
}

export interface ExposureStats {
  /** Journeys from one end of a route to the other. */
  runs: number;
  /** Kilometers driven, all trains together. */
  km: number;
  /** First and last departure of the service day, as epoch seconds (null if nothing ran). */
  first: number | null;
  last: number | null;
}

export type ExposureView = 'schematic' | 'geo';

/** The service day runs from four in the morning to four the next. */
const DAY_START = 4;
/** Seconds between samples of every train. */
const STEP = 8;
/** Colours on black: the lines' own, lifted a little so they glow. */
const GLOW: Record<string, [number, number, number]> = { blue: [70, 150, 255], red: [255, 70, 95], green: [60, 215, 120] };
const SILVER: [number, number, number] = [225, 225, 235];
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

export function dayOf(epoch: number): ExposureDay {
  // Before four in the morning still belongs to the day before.
  const c = stockholm(epoch - DAY_START * 3600);
  return { year: c.year, month: c.month, day: c.day };
}

export function dayTitle(d: ExposureDay): string {
  return `${d.day} ${MONTHS[d.month - 1]} ${d.year}`;
}

/** Every train of the day, each sample as its point and line, with the day's numbers. */
export function sampleDay(day: ExposureDay, view: ExposureView, visit: (from: NetPoint, to: NetPoint, colour: [number, number, number], weight: number) => void): ExposureStats {
  const routes = allRoutes(view === 'schematic' ? 1 : 0);
  // Kilometers are always the city's, whichever view is drawn.
  const real = view === 'geo' ? routes : allRoutes(0);
  const start = stockholmEpoch(day.year, day.month, day.day, DAY_START);
  const end = start + 24 * 3600;
  const prev = new Map<string, { p: NetPoint; g: NetPoint; t: MapTrain }>();
  let runs = 0;
  let meters = 0;
  let first: number | null = null;
  let last: number | null = null;
  for (let t = start; t < end; t += STEP) {
    const seen = new Set<string>();
    const trains: Array<{ t: MapTrain; li: number; colour: [number, number, number]; weight: number }> = [];
    LINES.forEach((line, li) => { for (const tr of gameTrains(li, t)) trains.push({ t: tr, li, colour: GLOW[line.id], weight: 1 }); });
    const ghost = silverTrain(t);
    if (ghost) trains.push({ t: ghost, li: 0, colour: SILVER, weight: 3 * ghost.opacity });
    for (const { t: tr, li, colour, weight } of trains) {
      seen.add(tr.id);
      const p = placeTrain(routes, li, tr);
      const g = real === routes ? p : placeTrain(real, li, tr);
      const before = prev.get(tr.id);
      prev.set(tr.id, { p, g, t: tr });
      if (!before) continue;
      const d = Math.hypot(g.east - before.g.east, g.north - before.g.north);
      // A jump (the shifted routes' portal, or a turnback's change of track) is not a path.
      if (d > 700) continue;
      visit(before.p, p, colour, weight);
      if (!tr.id.startsWith('silver')) meters += d;
      // A run starts when a train leaves its first station, out of a turnback.
      if (before.t.status.kind === 'turnback' && tr.status.kind !== 'turnback') runs++;
      if (before.t.status.kind === 'at' && tr.status.kind === 'to') {
        first ??= t;
        last = t;
      }
    }
    for (const id of prev.keys()) if (!seen.has(id)) prev.delete(id);
  }
  return { runs, km: Math.round(meters / 1000), first, last };
}

/** A light buffer: three floats a pixel, filled with short strokes. */
class Film {
  readonly light: Float32Array;
  constructor(readonly w: number, readonly h: number) {
    this.light = new Float32Array(w * h * 3);
  }

  stroke(x0: number, y0: number, x1: number, y1: number, c: [number, number, number], weight: number): void {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    // The same light over a longer stroke is spread thinner: exposure is time, not distance.
    const k = weight / n;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const o = (y * this.w + x) * 3;
      this.light[o] += c[0] * k;
      this.light[o + 1] += c[1] * k;
      this.light[o + 2] += c[2] * k;
    }
  }

  /**
   * Tone maps onto a canvas: a log curve on each pixel's brightest channel, against a bright spot near the top
   * (not the very brightest, a platform where every train stands), so the quiet ends still show and the colours
   * keep their hue instead of burning out to white.
   */
  develop(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    const lit: number[] = [];
    for (let o = 0; o < this.light.length; o += 3) {
      const m = Math.max(this.light[o], this.light[o + 1], this.light[o + 2]);
      if (m > 0) lit.push(m);
    }
    lit.sort((a, b) => a - b);
    const white = lit.length ? lit[Math.floor(lit.length * 0.985)] : 1;
    const k = 40 / white;
    const scale = 1 / Math.log1p(k * white);
    for (let p = 0, o = 0; p < this.w * this.h; p++, o += 3) {
      const r = this.light[o];
      const g = this.light[o + 1];
      const b = this.light[o + 2];
      const m = Math.max(r, g, b);
      const q = p * 4;
      img.data[q + 3] = 255;
      if (m <= 0) continue;
      const v = Math.log1p(k * m) * scale;
      // Past white the light turns toward white, as on film, but only there.
      const hot = Math.max(0, v - 1) * 0.6;
      const level = Math.min(1, v) * 255;
      img.data[q] = Math.min(255, (r / m) * level + hot * 255);
      img.data[q + 1] = Math.min(255, (g / m) * level + hot * 255);
      img.data[q + 2] = Math.min(255, (b / m) * level + hot * 255);
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}

export interface Poster {
  canvas: HTMLCanvasElement;
  stats: ExposureStats;
  title: string;
}

/**
 * Draws the day's poster: the exposure, the stations, a Swedish title and date and a few numbers.
 * @param width the poster's width in pixels; it is A-format portrait (1 : √2)
 */
export function renderPoster(day: ExposureDay, view: ExposureView, width = 2480): Poster {
  const W = width;
  const H = Math.round(W * Math.SQRT2);
  const margin = W * 0.07;
  const mapTop = H * 0.2;
  const mapH = H * 0.66;
  const mapW = W - margin * 2;
  const morph = view === 'schematic' ? 1 : 0;
  const pts = STATIONS.map((s) => blend(s, morph));
  const xs = pts.map((p) => p.east);
  const ys = pts.map((p) => p.north);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min(mapW / (maxX - minX), mapH / (maxY - minY)) * 0.94;
  const ox = margin + (mapW - (maxX - minX) * scale) / 2;
  const oy = mapTop + (mapH - (maxY - minY) * scale) / 2;
  const toX = (p: NetPoint) => ox + (p.east - minX) * scale;
  const toY = (p: NetPoint) => oy + (maxY - p.north) * scale;

  // The film is half the poster's resolution, and blurred a touch when enlarged, like a real exposure.
  const f = 0.5;
  const film = new Film(Math.round(W * f), Math.round(H * f));
  const stats = sampleDay(day, view, (a, b, c, weight) => film.stroke(toX(a) * f, toY(a) * f, toX(b) * f, toY(b) * f, c, weight));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#04060a';
  ctx.fillRect(0, 0, W, H);
  // The water, faintly, in the true view.
  if (view === 'geo') {
    ctx.fillStyle = '#0a1422';
    for (const poly of WATER) {
      ctx.beginPath();
      poly.forEach(([lat, lon], i) => {
        const p = project(lat, lon);
        const q = { ...p, depth: 0, y: 0 };
        if (i) ctx.lineTo(toX(q), toY(q)); else ctx.moveTo(toX(q), toY(q));
      });
      ctx.closePath();
      ctx.fill();
    }
  }
  const developed = film.develop();
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // A soft glow under the sharp light.
  ctx.save();
  ctx.filter = `blur(${Math.round(W / 300)}px)`;
  ctx.globalAlpha = 0.8;
  ctx.drawImage(developed, 0, 0, W, H);
  ctx.restore();
  ctx.drawImage(developed, 0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';

  // Stations as small points, the busiest knot brightest, and their names small.
  const unit = W / 1000;
  ctx.font = `${Math.round(unit * 7.5)}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textBaseline = 'middle';
  STATIONS.forEach((s, i) => {
    const x = toX(pts[i]);
    const y = toY(pts[i]);
    const big = s.lines.length > 1;
    ctx.fillStyle = big ? '#ffffff' : '#dfe6ee';
    ctx.beginPath();
    ctx.arc(x, y, unit * (big ? 3.2 : 1.8), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(214, 222, 232, 0.55)';
    ctx.fillText(s.name, x + unit * 5, y);
  });

  // Title, date and numbers.
  const title = dayTitle(day);
  ctx.fillStyle = '#eef2f8';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${Math.round(unit * 58)}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.fillText('Tunnelbanan', margin, H * 0.1);
  ctx.font = `400 ${Math.round(unit * 30)}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.fillStyle = '#a9b4c4';
  ctx.fillText(title, margin, H * 0.1 + unit * 48);
  ctx.font = `500 ${Math.round(unit * 15)}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  const numbers = [
    `${stats.runs.toLocaleString('sv-SE')} turer`,
    `${stats.km.toLocaleString('sv-SE')} tågkilometer`,
    stats.first !== null ? `första avgång ${formatClock(stats.first)}` : '',
    stats.last !== null ? `sista avgång ${formatClock(stats.last)}` : '',
  ].filter(Boolean);
  ctx.fillText(numbers.join('  ·  '), margin, H * 0.92);
  ctx.fillStyle = '#5d6878';
  ctx.font = `400 ${Math.round(unit * 11)}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.fillText(`Under Stockholm · varje tur ${view === 'schematic' ? 'på linjekartan' : 'där den går'}, från 04:00 till 04:00`, margin, H * 0.95);
  // The legend: one short stroke per line.
  LINES.forEach((line, li) => {
    const x = W - margin - (LINES.length - li) * unit * 110;
    const y = H * 0.1 + unit * 40;
    const c = GLOW[line.id];
    ctx.strokeStyle = `rgb(${c.join(',')})`;
    ctx.lineWidth = unit * 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + unit * 26, y);
    ctx.stroke();
    ctx.fillStyle = '#a9b4c4';
    ctx.font = `500 ${Math.round(unit * 13)}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.fillText(line.name, x + unit * 32, y + unit * 4);
  });
  return { canvas, stats, title };
}

/** The poster as a PNG named after the date. */
export async function posterFile(poster: Poster, day: ExposureDay): Promise<File> {
  const blob = await new Promise<Blob>((resolve, reject) => poster.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
  const name = `tunnelbanan-${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}.png`;
  return new File([blob], name, { type: 'image/png' });
}
