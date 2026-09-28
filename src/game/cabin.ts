import { BoxGeometry, CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { dayNumber } from './calendar';
import { stockholm } from './clock';
import { FONT, wrapText } from './gfx/signs';
import { occupiedSeatPoses } from './crowd';
import { cabinSeats } from './journey';
import { CAB_DEPTH, PLATFORM_Y } from './layout';
import { headlinesFor, pickHeadline } from './news';
import { headline1975 } from './news1975';
import { canGeometry, propMaterial } from './props';
import { seatBays, W, WIN_HI, WIN_LO, type SeatStyle } from './trainModel';
import type { Train } from './train';

/**
 * Small things aboard every C20: an empty can that rolls up and down the aisle
 * when the train brakes and pulls away, today's newspaper left on a seat (with
 * a real, calm headline from Sveriges Radio when online, see `news.ts`), a
 * heart drawn in the fogged glass in winter and a window open a crack in July.
 */

const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
/** The time machine's front pages, made up in the spirit of 1975. */
const HEADLINES = ['Nya tåg på blå linjen', 'Sommaren dröjer', 'Rekordmånga åkte tunnelbana', 'Kö på Essingeleden igen', 'Katten Misse fortfarande borta', 'Ny konsthall öppnar', 'Silverpilen sedd igen?', 'Dags för vinterdäck'];

/** The can rolls in the middle section of the middle car, between these x. */
const CAN_MIN = -7.2;
const CAN_MAX = 7.2;
const CAN_R = 0.033;

interface Aboard {
  train: Train;
  can: Mesh;
  x: number;
  v: number;
  heart: Mesh;
  gaps: Group;
  paper: Mesh;
  /** Where along the train it rolls about: a C20's middle section, or clear of the C30's cabs in the middle. */
  center: number;
}

/** The free seat the newspaper was left on. */
function newspaperSeat(style: SeatStyle) {
  const taken = occupiedSeatPoses(style);
  const free = cabinSeats(style).filter((seat) => !taken.some((p) => Math.abs(p.x - seat.x) < 0.2 && Math.abs(p.z - seat.z) < 0.2));
  return free[Math.min(free.length - 1, 4)];
}

export class CabinLife {
  private readonly aboard: Aboard[] = [];
  private readonly paper: { canvas: HTMLCanvasElement; texture: CanvasTexture };
  private paperDay = '';
  /** Today's real headlines from Sveriges Radio, or null to use the made-up ones. */
  private news: string[] | null = null;
  private newsDay = -1;

  constructor(trains: Train[]) {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 288;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.paper = { canvas, texture };
    const paperMaterial = new MeshBasicMaterial({ map: texture, color: 0xd9d6cf, side: DoubleSide });
    const heartMaterial = new MeshBasicMaterial({ map: heartTexture(), transparent: true, depthWrite: false, side: DoubleSide });
    const gapMaterial = new MeshBasicMaterial({ color: 0x07090b });
    const edgeMaterial = new MeshBasicMaterial({ color: 0x9aa4aa });
    const canGeo = canGeometry();

    trains.forEach((train, index) => {
      // Each stock has its own seats and bays.
      const bays = seatBays(train.seating);
      const seat = newspaperSeat(train.seating);
      const can = new Mesh(canGeo, propMaterial());
      can.position.set(0, PLATFORM_Y + CAN_R, 0.12);
      train.aboard.add(can);

      const paper = new Mesh(new PlaneGeometry(0.42, 0.31), paperMaterial);
      paper.rotation.set(-Math.PI / 2, 0, 0.4 + index * 0.3);
      paper.position.set(seat.x, PLATFORM_Y + 0.508, seat.z);
      train.aboard.add(paper);

      // The heart is wiped into the fog on a window by the seats.
      const { a, b, side } = bays[3 + (index % 4) * 3];
      const heart = new Mesh(new PlaneGeometry(0.34, 0.34), heartMaterial);
      heart.position.set((a + b) / 2 + 0.3, (WIN_LO + WIN_HI) / 2 + 0.1, side * (W - 0.045));
      heart.visible = false;
      train.aboard.add(heart);

      // In July one window per car is tipped open at the top.
      const gaps = new Group();
      for (const k of [2, 8, 14]) {
        const { a: ga, b: gb } = bays[Math.min(bays.length - 1, k)];
        const x = (ga + gb) / 2;
        for (const s of [-1, 1]) {
          const gap = new Mesh(new BoxGeometry(1.1, 0.07, 0.01), gapMaterial);
          gap.position.set(x, WIN_HI - 0.06, s * (W - 0.04));
          const edge = new Mesh(new BoxGeometry(1.1, 0.012, 0.02), edgeMaterial);
          edge.position.set(x, WIN_HI - 0.1, s * (W - 0.07));
          gaps.add(gap, edge);
        }
      }
      gaps.visible = false;
      train.aboard.add(gaps);

      const center = train.stock.couplings.some((c) => Math.abs(c) < CAN_MAX + CAB_DEPTH) ? train.stock.units[train.stock.units.length - 1] : 0;
      can.position.x = center;
      this.aboard.push({ train, can, x: (index * 3.7) % (CAN_MAX - CAN_MIN) + CAN_MIN, v: 0, heart, gaps, paper, center });
    });
  }

  /** The newspaper moves to a seat of the stock each train runs: today's or the time machine's older cars. */
  setSeating(): void {
    for (const { train, paper } of this.aboard) {
      const seat = newspaperSeat(train.seating);
      paper.position.set(seat.x, PLATFORM_Y + 0.508, seat.z);
    }
  }

  /** Once a second: the newspaper's date, the heart in winter fog and the open windows in July. */
  /** @param past the time machine's 1975: an old front page, dated then */
  setDay(epoch: number, fogged: boolean, heat: boolean, past = false): void {
    const c = stockholm(epoch);
    const key = `${c.year}-${c.month}-${c.day}-${past}`;
    const day = dayNumber(epoch);
    if (day !== this.newsDay) {
      this.newsDay = day;
      void headlinesFor(day).then((news) => {
        // A failed fetch drops yesterday's headlines too, so the date and the news always match.
        if (this.newsDay !== day) return;
        this.news = news;
        this.paperDay = '';
      });
    }
    if (key !== this.paperDay) {
      this.paperDay = key;
      const year = past ? 1975 : c.year;
      const weekday = past ? new Date(Date.UTC(1975, c.month - 1, c.day)).getUTCDay() : c.weekday;
      const date = `${WEEKDAYS[weekday]} ${c.day} ${MONTHS[c.month - 1]} ${year}`;
      if (past) drawNewspaper(this.paper.canvas, date, headline1975(c.month, c.day, 0), null);
      else if (this.news) drawNewspaper(this.paper.canvas, date, pickHeadline(this.news, day, 0), 'Källa: Sveriges Radio');
      else drawNewspaper(this.paper.canvas, date, HEADLINES[(c.day + c.month) % HEADLINES.length], null);
      this.paper.texture.needsUpdate = true;
    }
    for (const a of this.aboard) {
      a.heart.visible = fogged;
      a.gaps.visible = heat;
    }
  }

  /**
   * @param along each train's acceleration along +x (m/s²), or null when it is out of service
   */
  update(dt: number, along: Array<number | null>): void {
    this.aboard.forEach((a, i) => {
      const acceleration = along[i];
      if (acceleration === null || !a.train.isActive) return;
      // The can feels the train's acceleration backwards, rolls with a little friction and bounces off the seat pedestals.
      a.v += (-acceleration * 0.55 - a.v * 0.35) * dt;
      a.x += a.v * dt;
      if (a.x < CAN_MIN) { a.x = CAN_MIN; a.v = Math.abs(a.v) * 0.35; }
      if (a.x > CAN_MAX) { a.x = CAN_MAX; a.v = -Math.abs(a.v) * 0.35; }
      a.can.position.x = a.center + a.x;
      a.can.rotation.z = -a.x / CAN_R;
    });
  }

  /** Can speeds, for a faint rolling sound aboard. */
  canSpeed(train: Train): number {
    return Math.abs(this.aboard.find((a) => a.train === train)?.v ?? 0);
  }
}

function drawNewspaper(canvas: HTMLCanvasElement, date: string, headline: string, credit: string | null): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#efece4';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#16181b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `800 34px Georgia, "Times New Roman", serif`;
  ctx.fillText('STOCKHOLMSBLADET', w / 2, 12);
  ctx.fillRect(16, 52, w - 32, 2);
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText(date, w / 2, 58);
  ctx.fillRect(16, 78, w - 32, 1);
  ctx.textAlign = 'left';
  ctx.font = `700 24px Georgia, "Times New Roman", serif`;
  const lines = wrapText(ctx, headline, w - 36, 2);
  lines.forEach((line, i) => ctx.fillText(line, 18, 88 + i * 27, w - 36));
  // A long headline pushes the photo down and makes it smaller.
  const top = 88 + lines.length * 27 + 9;
  const photo = lines.length > 1 ? 78 : 100;
  ctx.fillStyle = '#8d8a84';
  ctx.fillRect(18, top, 150, photo);
  let under = top + photo + 8;
  if (credit) {
    ctx.fillStyle = '#5d5a55';
    ctx.font = `italic 400 11px ${FONT}`;
    ctx.fillText(credit, 18, top + photo + 4, 150);
    under += 14;
  }
  ctx.fillStyle = '#9c9890';
  // Body text: under the photo in the left column, full height on the right.
  for (let y = under; y < h - 14; y += 9) ctx.fillRect(18, y, 150 - ((y * 7) % 23), 3);
  for (let y = top; y < h - 14; y += 9) ctx.fillRect(198, y, 168 - ((y * 5) % 19), 3);
}

function heartTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = 'rgba(30, 44, 52, 0.85)';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(64, 104);
  ctx.bezierCurveTo(20, 74, 14, 40, 38, 30);
  ctx.bezierCurveTo(52, 24, 62, 34, 64, 44);
  ctx.bezierCurveTo(66, 34, 76, 24, 90, 30);
  ctx.bezierCurveTo(114, 40, 108, 74, 64, 104);
  ctx.stroke();
  // Drops run down from where the finger pressed hardest.
  ctx.lineWidth = 3;
  for (const [x, y, l] of [[40, 70, 20], [86, 72, 26], [64, 106, 18]]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + l);
    ctx.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
