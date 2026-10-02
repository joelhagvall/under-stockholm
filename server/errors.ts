// Errors players meet (`src/game/crash.ts`), so a crash on someone's phone is known the day after launch instead of
// never. At most three per visit: the message, the top of the stack, the nearest station and the class of device. No
// addresses kept (one is only held in memory for a moment, to take one report per visit every ten seconds). What a
// report holds and how they group is in server/errorCore.ts, shared with the hub on Cloudflare (worker/hub.ts).
//   POST /errors   a report as JSON (sent as text/plain, the way a beacon can)  ->  204, 400 if malformed, 429 too soon
//   GET  /errors   the groups as JSON, or as a plain page for a browser (`Accept: text/html`)
// Reports are appended to ERRORS_FILE (default server/errors.jsonl, not committed) and the last ERROR_KEPT stay in memory.
// With ALERT_URL set, a fatal error not seen for a week is posted there, as the hub does (server/errorCore.ts).

import { AGGREGATE_MS, CachedBuild, Cooldown, readBody } from './limits';
import { alertFor, ERROR_EVERY_MS, ERROR_KEPT, errorsPage, groupErrors, readError, sendAlert, type AlertLog, type ErrorAggregate, type ErrorReport } from './errorCore';

const ERRORS_FILE = process.env.ERRORS_FILE ?? new URL('./errors.jsonl', import.meta.url).pathname;
let reports: ErrorReport[] = [];
try {
  reports = (await Bun.file(ERRORS_FILE).text()).split('\n').filter(Boolean).map((l) => JSON.parse(l) as ErrorReport).slice(-ERROR_KEPT);
} catch { /* No reports yet. */ }
const lastReport = new Cooldown(ERROR_EVERY_MS);
/** The groups, rebuilt at most once a minute: each build reads every kept report. */
const answers = new CachedBuild<ErrorAggregate>(AGGREGATE_MS);
/** When each group was last alerted, in memory: a restart may send one again. */
const alerted = new Map<string, number>();
const alerts: AlertLog = { last: (key) => alerted.get(key) ?? 0, mark: (key, at) => void alerted.set(key, at) };

/** Answers /errors: takes a report, or shows the groups. */
export async function handleErrors(req: Request, ip: string, cors: Record<string, string>): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method === 'GET') {
    const data = answers.get(() => groupErrors(reports));
    if (req.headers.get('accept')?.includes('text/html')) return new Response(errorsPage(data), { headers: { ...cors, 'content-type': 'text/html; charset=utf-8' } });
    return Response.json(data, { headers: cors });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
  const now = Date.now();
  if (!lastReport.ready(ip, now)) return new Response(null, { status: 429, headers: cors });
  const body = await readBody(req);
  if (body === null) return new Response(null, { status: 413, headers: cors });
  const report = readError(body, now);
  if (!report) return new Response(null, { status: 400, headers: cors });
  lastReport.mark(ip, now);
  reports.push(report);
  if (reports.length > ERROR_KEPT) reports = reports.slice(-ERROR_KEPT);
  // Appended, never rewritten: the file is the record, memory the working copy.
  const file = Bun.file(ERRORS_FILE);
  await Bun.write(ERRORS_FILE, (await file.exists() ? await file.text() : '') + JSON.stringify(report) + '\n');
  const alert = process.env.ALERT_URL ? alertFor(report, alerts) : null;
  if (alert) void sendAlert(process.env.ALERT_URL!, alert, new URL('/errors', req.url).href, console.warn);
  return new Response(null, { status: 204, headers: cors });
}
