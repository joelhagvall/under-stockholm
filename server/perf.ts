// Anonymous performance reports from players (`src/game/telemetry.ts`), so the frame rates on real phones are known
// the day after launch instead of guessed from an emulator. One report per visit, after two minutes of play: frame
// times, where the adaptive resolution landed, how long loading took and the class of device. No identifiers and no
// addresses: the relay keeps the report and nothing about who sent it (an address is only held in memory for a
// minute, to take one report per visit). What a report holds and what they sum up to is in server/perfCore.ts,
// shared with the hub on Cloudflare (worker/hub.ts).
//   POST /perf   a report as JSON (sent as text/plain, the way a beacon can)  ->  204, 400 if malformed, 429 too soon
//   GET  /perf   the aggregate as JSON, or as a plain page for a browser (`Accept: text/html`)
// Reports are appended to PERF_FILE (default server/perf.jsonl, not committed) and the last PERF_KEPT stay in memory.

import { timetableStatus } from './feeds';
import { AGGREGATE_MS, CachedBuild, Cooldown, readBody } from './limits';
import { aggregate, PERF_EVERY_MS, PERF_KEPT, perfPage, readPerf, type PerfAggregate, type PerfReport } from './perfCore';

export { aggregate, parsePerf, summarize, type PerfReport, type PerfSummary } from './perfCore';

const PERF_FILE = process.env.PERF_FILE ?? new URL('./perf.jsonl', import.meta.url).pathname;
let reports: PerfReport[] = [];
try {
  reports = (await Bun.file(PERF_FILE).text()).split('\n').filter(Boolean).map((l) => JSON.parse(l) as PerfReport).slice(-PERF_KEPT);
} catch { /* No reports yet. */ }
const lastReport = new Cooldown(PERF_EVERY_MS);
/** The aggregate, rebuilt at most once a minute: each build summarizes every kept report. */
const answers = new CachedBuild<PerfAggregate>(AGGREGATE_MS);

/** Answers /perf: takes a report, or shows the aggregate. */
export async function handlePerf(req: Request, ip: string, cors: Record<string, string>): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method === 'GET') {
    const data = answers.get(() => aggregate(reports));
    const timetable = await timetableStatus();
    if (req.headers.get('accept')?.includes('text/html')) return new Response(perfPage(data, undefined, timetable), { headers: { ...cors, 'content-type': 'text/html; charset=utf-8' } });
    return Response.json({ ...data, timetable }, { headers: cors });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
  const now = Date.now();
  if (!lastReport.ready(ip, now)) return new Response(null, { status: 429, headers: cors });
  const body = await readBody(req);
  if (body === null) return new Response(null, { status: 413, headers: cors });
  const report = readPerf(body, now);
  if (!report) return new Response(null, { status: 400, headers: cors });
  lastReport.mark(ip, now);
  reports.push(report);
  if (reports.length > PERF_KEPT) reports = reports.slice(-PERF_KEPT);
  // Appended, never rewritten: the file is the record, memory the working copy.
  const file = Bun.file(PERF_FILE);
  await Bun.write(PERF_FILE, (await file.exists() ? await file.text() : '') + JSON.stringify(report) + '\n');
  return new Response(null, { status: 204, headers: cors });
}
