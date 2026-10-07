// Errors players meet (src/game/crash.ts): what one report may hold, and how they group. Shared by the Bun relay
// (server/errors.ts) and the hub on Cloudflare (worker/hub.ts), which only keep them. No identifiers: the message,
// the top of the stack, the nearest station, the class of device and the browser.

export interface ErrorReport {
  v: 1;
  /** When it was received, epoch milliseconds (set by the relay). */
  at: number;
  kind: 'desktop' | 'touch';
  /** Git version of the client; empty for reports from older builds. */
  build: string;
  /** The game stopped (the frame threw), rather than played on. */
  fatal: boolean;
  message: string;
  /** The top of the stack, without the page's origin. */
  stack: string;
  /** The nearest station, or '' before the world is up. */
  where: string;
  /** Seconds since the game was opened. */
  played: number;
  gpu: string;
  ua: string;
  lang: string;
}

/** Reports kept, and a report per address at most this often. */
export const ERROR_KEPT = 2000;
export const ERROR_EVERY_MS = 10_000;

/** Printable text, cut to `max`; the stack keeps its line breaks. */
const clean = (v: unknown, max: number, lines = false): string =>
  typeof v === 'string' ? v.replace(lines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : '';

/** The report a client sent, checked field by field, or null when it is not one. */
export function parseError(raw: unknown, at = Date.now()): ErrorReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || (r.kind !== 'desktop' && r.kind !== 'touch')) return null;
  const message = clean(r.message, 300).trim();
  if (!message) return null;
  const played = typeof r.played === 'number' && Number.isFinite(r.played) ? Math.max(0, Math.min(86_400, Math.round(r.played))) : 0;
  return {
    v: 1, at, kind: r.kind, build: typeof r.build === 'string' && /^[\w.-]{1,64}$/.test(r.build) ? r.build : '',
    fatal: r.fatal === true, message, stack: clean(r.stack, 1500, true), where: clean(r.where, 40),
    played, gpu: clean(r.gpu, 80), ua: clean(r.ua, 200), lang: clean(r.lang, 8),
  };
}

/** A report from a request body, at most 4 kB of JSON (sent as text, the way a beacon can), or null. */
export function readError(body: string, at = Date.now()): ErrorReport | null {
  try {
    return parseError(JSON.parse(body.slice(0, 4000)), at);
  } catch {
    return null;
  }
}

export interface ErrorGroup {
  message: string;
  /** Where in the code: the stack's first line. */
  frame: string;
  n: number;
  fatal: number;
  touch: number;
  first: number;
  last: number;
  /** The newest report of the group, whole. */
  sample: ErrorReport;
  /** Report counts per client version; the empty key is a report from an older client. */
  builds: Record<string, number>;
}

export type ErrorAggregate = { since: number | null; count: number; day: number; groups: ErrorGroup[] };

/**
 * Where in the code, the same from one build to the next: the chunk's name, without its hash, the minified names and
 * the line and column, which every deploy changes. A frame outside the build is kept whole.
 */
const chunkOf = (frame: string) => /\/assets\/([\w-]+?)-[\w-]{8}\.(?:js|wasm)\b/.exec(frame)?.[1] ?? frame;
/** Import and preload failures name the missing asset in the message as well as in the stack. */
const messageOf = (message: string) => message.replace(/\/assets\/([\w-]+?)-[\w-]{8}\.(js|css|wasm)\b/g, '/assets/$1.$2');

/** The stack's first line below the message. */
const frameOf = (r: ErrorReport) => r.stack.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith(r.message.slice(0, 20))) ?? '';
/** The group a report belongs to, the same from one build to the next. */
const keyOf = (r: ErrorReport) => `${messageOf(r.message)}\n${chunkOf(frameOf(r))}`;

/** The reports grouped by message and where in the code, the most frequent first. */
export function groupErrors(reports: ErrorReport[], now = Date.now()): ErrorAggregate {
  const groups = new Map<string, ErrorGroup>();
  for (const r of reports) {
    const frame = frameOf(r);
    const key = keyOf(r);
    const g = groups.get(key) ?? { message: r.message, frame, n: 0, fatal: 0, touch: 0, first: r.at, last: r.at, sample: r, builds: Object.create(null) as Record<string, number> };
    g.n++;
    const build = r.build ?? '';
    g.builds[build] = (g.builds[build] ?? 0) + 1;
    if (r.fatal) g.fatal++;
    if (r.kind === 'touch') g.touch++;
    g.first = Math.min(g.first, r.at);
    if (r.at >= g.last) { g.last = r.at; g.sample = r; g.frame = frame; g.message = r.message; }
    groups.set(key, g);
  }
  return {
    since: reports[0]?.at ?? null,
    count: reports.length,
    day: reports.filter((r) => now - r.at < 86_400_000).length,
    groups: [...groups.values()].sort((a, b) => b.n - a.n).slice(0, 100),
  };
}

// Alerts: a fatal error of the game's own (not ENVIRONMENT) the hub has not told of for a week goes to ALERT_URL as plain text (ntfy.sh takes it as is),
// at most one message an hour, so a storm of crashes after a deploy sends one, not hundreds (docs/DRIFT.md, section 1).

export const ALERT_EVERY_MS = 60 * 60_000;
export const ALERT_AGAIN_MS = 7 * 86_400_000;

/**
 * Fatal errors that say what a player's device or connection could not do, not what the game got wrong: no WebGL or 2D
 * canvas, a browser too old for the game, and a module or WebAssembly file that did not arrive (an old tab after a
 * deploy, a captive portal; the loader already reloads for those). They stay on /errors but alert nobody.
 */
const ENVIRONMENT = [
  /Error creating WebGL context|2D canvas unavailable|getShaderPrecisionFormat/,
  /roundRect is not a function/,
  /dynamically imported module|Importing a module script failed|Unable to preload CSS|expected magic word 00 61 73 6d|failed to match magic number/,
  /^SyntaxError: (?!.*JSON)/,
];

/** When each group was last told of, '' for the last alert of any group: in memory or in the hub's storage. */
export interface AlertLog {
  last(key: string): number;
  mark(key: string, at: number): void;
}

/** The message to send for a report, marked as sent in `log`, or null when it is not worth one. */
export function alertFor(r: ErrorReport, log: AlertLog): string | null {
  if (!r.fatal || ENVIRONMENT.some((re) => re.test(r.message))) return null;
  const key = keyOf(r);
  if (r.at - log.last(key) < ALERT_AGAIN_MS || r.at - log.last('') < ALERT_EVERY_MS) return null;
  log.mark(key, r.at);
  log.mark('', r.at);
  return `${r.message}\n${frameOf(r)}\n${r.where || '(no station)'}, ${r.kind}, build ${r.build || '(unknown)'}`;
}

/** Posts an alert, linking to a page when there is one (the errors page). Never throws: a failed alert is only logged. */
export async function sendAlert(url: string, text: string, page: string | null, log: (message: string) => void, title = 'Under Stockholm: the game stopped for a player'): Promise<void> {
  try {
    const headers: Record<string, string> = { title };
    if (page) headers.click = page;
    const response = await fetch(url, { method: 'POST', body: text, headers, signal: AbortSignal.timeout(8000) });
    if (!response.ok) log(`alert: ${response.status}`);
  } catch (err) {
    log(`alert: ${err instanceof Error ? err.message : err}`);
  }
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

/** The groups as a plain page, for a browser. */
export function errorsPage(data: ErrorAggregate): string {
  const rows = data.groups.map((g) => `<tr><td>${g.n}</td><td>${g.fatal}</td><td>${g.touch}</td><td>${when(g.last)}</td><td><details><summary>${escape(g.message)}<br><small>${escape(g.frame)}</small></summary>
<p>Builds: ${Object.entries(g.builds).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([build, n]) => `${escape(build || '(unknown)')}: ${n}`).join(', ')}<br>
${escape(g.sample.where || '(no station)')}, ${g.sample.played} s in, ${escape(g.sample.gpu || '(unknown gpu)')}<br>${escape(g.sample.ua)}</p><pre>${escape(g.sample.stack)}</pre></details></td></tr>`).join('');
  return `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Under Stockholm | errors</title>
<style>body{font:14px/1.5 system-ui;margin:2em;color:#222}table{border-collapse:collapse;margin:1em 0}td,th{border:1px solid #ccc;padding:4px 10px;vertical-align:top;text-align:right}td:last-child,th:last-child{text-align:left}pre{white-space:pre-wrap;font-size:12px}small{color:#666}</style>
<h1>Under Stockholm: errors players met</h1>
<p>${data.count} reports since ${data.since ? when(data.since) : 'never'}, ${data.day} in the last day. At most three per visit. Fatal: the game stopped.</p>
<table><tr><th>reports</th><th>fatal</th><th>touch</th><th>last</th><th>error</th></tr>${rows}</table>`;
}
