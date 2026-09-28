// Anonymous performance reports from players (src/game/telemetry.ts): what one report may hold, and what they sum
// up to. Shared by the Bun relay (server/perf.ts) and the hub on Cloudflare (worker/hub.ts), which only keep them.

export interface PerfReport {
  v: 1;
  /** When it was received, epoch milliseconds (set by the relay). */
  at: number;
  kind: 'desktop' | 'touch';
  /** Played time the frames cover. */
  seconds: number;
  frames: number;
  fps: number;
  /** 95th percentile frame time, milliseconds. */
  p95: number;
  /** Frames over 50 ms. */
  hitches: number;
  /** Of those, the ones the game's own code spent most of; -1 from a client too old to say. */
  work: number;
  /** How many notches the adaptive resolution had gone down (0 is full). */
  scale: number;
  pixelRatio: number;
  /** Seconds from the click to playing, without the loading screen's minimum. */
  loadS: number;
  dpr: number;
  w: number;
  h: number;
  cores: number;
  /** navigator.deviceMemory in GB, 0 where the browser does not say. */
  memory: number;
  gpu: string;
  lang: string;
  /** Real trains were on. */
  real: boolean;
  passengers: boolean;
}

/** Reports kept, and a report per address at most this often. */
export const PERF_KEPT = 5000;
export const PERF_EVERY_MS = 60_000;

const finite = (v: unknown, max: number, min = 0): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[^\w .,()/:+-]/g, '').slice(0, max) : '');

/** The report a client sent, checked field by field, or null when it is not one. */
export function parsePerf(raw: unknown, at = Date.now()): PerfReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || (r.kind !== 'desktop' && r.kind !== 'touch')) return null;
  if (!finite(r.seconds, 3600, 10) || !finite(r.frames, 1e6, 1) || !finite(r.fps, 1000) || !finite(r.p95, 10000) || !finite(r.hitches, 1e6)) return null;
  if (!finite(r.scale, 10) || !finite(r.pixelRatio, 10) || !finite(r.loadS, 3600) || !finite(r.dpr, 10) || !finite(r.w, 20000) || !finite(r.h, 20000)) return null;
  if (!finite(r.cores, 1024) || !finite(r.memory, 1024)) return null;
  const round = (v: number, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits;
  return {
    v: 1, at, kind: r.kind,
    seconds: round(r.seconds), frames: Math.round(r.frames), fps: round(r.fps), p95: round(r.p95), hitches: Math.round(r.hitches),
    work: finite(r.work, r.hitches) ? Math.round(r.work) : -1,
    scale: Math.round(r.scale), pixelRatio: round(r.pixelRatio, 2), loadS: round(r.loadS), dpr: round(r.dpr, 2), w: Math.round(r.w), h: Math.round(r.h),
    cores: Math.round(r.cores), memory: round(r.memory), gpu: text(r.gpu, 80), lang: text(r.lang, 8), real: r.real === true, passengers: r.passengers === true,
  };
}

/** A report from a request body, at most 2 kB of JSON (sent as text, the way a beacon can), or null. */
export function readPerf(body: string, at = Date.now()): PerfReport | null {
  try {
    return parsePerf(JSON.parse(body.slice(0, 2000)), at);
  } catch {
    return null;
  }
}

export interface PerfSummary {
  n: number;
  fps: { median: number; p10: number };
  p95: { median: number };
  /** The mean count of frames over 50 ms per minute of play: a few slow machines, every frame a hitch, weigh heavily. */
  hitchesPerMinute: number;
  /** The median visit's frames over 50 ms per minute: what a usual player meets. */
  hitchesMedian: number;
  /** The share of those frames the game's own code spent most of (the rest is the browser, the GPU or the garbage
   *  collector), over the reports that say; null when none does. */
  hitchesWork: number | null;
  /** Share of visits where the resolution had gone down at least one notch. */
  downscaled: number;
  loadS: { median: number; p90: number };
  gpus: Array<{ gpu: string; n: number; fps: number }>;
}

const percentile = (values: number[], p: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

/** What the reports say about one class of device. */
export function summarize(reports: PerfReport[]): PerfSummary {
  const fps = reports.map((r) => r.fps);
  const byGpu = new Map<string, PerfReport[]>();
  for (const r of reports) {
    const key = r.gpu || '(unknown)';
    byGpu.set(key, [...(byGpu.get(key) ?? []), r]);
  }
  return {
    n: reports.length,
    fps: { median: percentile(fps, 0.5), p10: percentile(fps, 0.1) },
    p95: { median: percentile(reports.map((r) => r.p95), 0.5) },
    hitchesPerMinute: reports.length ? Math.round((reports.reduce((s, r) => s + (r.hitches / r.seconds) * 60, 0) / reports.length) * 10) / 10 : 0,
    hitchesMedian: Math.round(percentile(reports.map((r) => (r.hitches / r.seconds) * 60), 0.5) * 10) / 10,
    hitchesWork: workShare(reports.filter((r) => r.work >= 0)),
    downscaled: reports.length ? Math.round((100 * reports.filter((r) => r.scale > 0).length) / reports.length) / 100 : 0,
    loadS: { median: percentile(reports.map((r) => r.loadS), 0.5), p90: percentile(reports.map((r) => r.loadS), 0.9) },
    gpus: [...byGpu].map(([gpu, rs]) => ({ gpu, n: rs.length, fps: percentile(rs.map((r) => r.fps), 0.5) })).sort((a, b) => b.n - a.n).slice(0, 12),
  };
}

/** The share of the hitches the game's own code spent most of, over reports that say, or null. */
function workShare(reports: PerfReport[]): number | null {
  const hitches = reports.reduce((s, r) => s + r.hitches, 0);
  if (!reports.length) return null;
  return hitches ? Math.round((100 * reports.reduce((s, r) => s + r.work, 0)) / hitches) / 100 : 0;
}

export type PerfAggregate = { since: number | null; count: number; all: Record<string, PerfSummary>; day: Record<string, PerfSummary> };

/** The aggregate over all kept reports, by class of device, and over the last day. */
export function aggregate(reports: PerfReport[], now = Date.now()): PerfAggregate {
  const by = (rs: PerfReport[]) => ({ desktop: summarize(rs.filter((r) => r.kind === 'desktop')), touch: summarize(rs.filter((r) => r.kind === 'touch')) });
  return { since: reports[0]?.at ?? null, count: reports.length, all: by(reports), day: by(reports.filter((r) => now - r.at < 86_400_000)) };
}

/** Today's requests to the hub against one of its daily budgets, in production only. */
export type BudgetUse = { used: number; limit: number };
/** The hub's two budgets: other players (`GHOST_BUDGET`), and the feeds, notes and reports (`DATA_BUDGET`). */
export type Budgets = { players: BudgetUse; data: BudgetUse };

/** The aggregate as a plain page, for a browser, with today's budgets when the relay keeps them. */
export function perfPage(data: PerfAggregate, budgets?: Budgets): string {
  const row = (label: string, s: PerfSummary) => `<tr><td>${label}</td><td>${s.n}</td><td>${s.fps.median}</td><td>${s.fps.p10}</td><td>${s.p95.median}</td><td>${s.hitchesPerMinute}</td><td>${s.hitchesMedian}</td><td>${s.hitchesWork === null ? '' : `${Math.round(s.hitchesWork * 100)}%`}</td><td>${Math.round(s.downscaled * 100)}%</td><td>${s.loadS.median}</td><td>${s.loadS.p90}</td></tr>`;
  const gpus = (s: PerfSummary) => s.gpus.map((g) => `<tr><td>${g.gpu.replace(/</g, '&lt;')}</td><td>${g.n}</td><td>${g.fps}</td></tr>`).join('');
  return `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Under Stockholm | performance</title>
<style>body{font:14px/1.5 system-ui;margin:2em;color:#222}table{border-collapse:collapse;margin:1em 0}td,th{border:1px solid #ccc;padding:4px 10px;text-align:right}td:first-child,th:first-child{text-align:left}</style>
<h1>Under Stockholm: how it runs for players</h1>
${budgets ? budgetLine('Other players', budgets.players, 'other players are paused') + budgetLine('Feeds, notes and reports', budgets.data, 'they wait') : ''}<p>${data.count} reports since ${data.since ? new Date(data.since).toISOString().slice(0, 10) : 'never'}. One per visit, after two minutes of play. Medians unless said otherwise.</p>
<table><tr><th></th><th>visits</th><th>fps</th><th>fps p10</th><th>p95 ms</th><th>hitches/min, mean</th><th>median</th><th>in the game's code</th><th>downscaled</th><th>load s</th><th>load p90</th></tr>
${row('desktop, all', data.all.desktop)}${row('touch, all', data.all.touch)}${row('desktop, last day', data.day.desktop)}${row('touch, last day', data.day.touch)}</table>
<h2>By GPU</h2><table><tr><th>desktop</th><th>visits</th><th>fps</th></tr>${gpus(data.all.desktop)}</table>
<table><tr><th>touch</th><th>visits</th><th>fps</th></tr>${gpus(data.all.touch)}</table>`;
}

function budgetLine(what: string, { used, limit }: BudgetUse, paused: string): string {
  const n = (v: number) => v.toLocaleString('en-US');
  if (!Number.isFinite(limit)) return `<p>${what} today: ${n(used)} requests, no daily budget.</p>\n`;
  const share = Math.round((used / limit) * 100);
  const note = used >= limit ? ` Spent: ${paused} until midnight UTC.` : '';
  return `<p>${what} today: ${n(used)} of ${n(limit)} requests (${share}%).${note}</p>\n`;
}
