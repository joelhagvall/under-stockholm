// How the live game is doing since the last deploy, in one go: `bun run logs` (or `--since 24h`, `--since 7d`, an ISO time).
//
//   1. Players: the error groups on /errors seen since then, and /perf for the newest build against the one before it.
//      Both pages are public, so this part always runs.
//   2. The Worker's own logs (Workers Logs): outcomes, what the errors and warnings say and where they happen.
//   3. Usage over the last 7 days, projected to a month, against what Workers Paid includes, and where each Durable Object
//      runs and how long it was awake.
//   4. Traffic through the zone over the last 7 days, a day at a time: requests, page views, visitors, data, cache, countries.
//
// Parts 2 to 4 need a Cloudflare API token in CF_OBS_TOKEN (in `.env.local`, which git ignores) with "Workers Observability:
// Read" for the logs, "Account Analytics: Read" for the usage and "Zone: Read" and "Zone Analytics: Read" on
// understockholm.com for the traffic. The one in `.env.local` wins over a CF_OBS_TOKEN exported in the shell (Bun would keep
// the shell's), which is used only when the file has none. Make it a user token (My Profile, API Tokens): an account-owned token reads the logs
// but is refused by the GraphQL analytics. Without it, or without one of the permissions, that part says so and the rest still
// runs. The last deploy's time comes from `wrangler deployments`.
import { $ } from 'bun';
import type { TimetableStatus } from '../server/gtfsFeed';
import { timetableLine } from '../server/perfCore';

const SITE = 'https://understockholm.com';
const SCRIPT = 'under-stockholm';
const local = await Bun.file(new URL('../.env.local', import.meta.url)).text().catch(() => '');
const token = local.match(/^CF_OBS_TOKEN=["']?([^"'\s]+)/m)?.[1] ?? process.env.CF_OBS_TOKEN;
const now = Date.now();

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const time = (ms: number) => new Date(ms).toISOString().slice(5, 16).replace('T', ' ');
const head = (title: string) => console.log(`\n== ${title}`);

async function since(): Promise<number> {
  const arg = process.argv[process.argv.indexOf('--since') + 1];
  if (process.argv.includes('--since') && arg) {
    const rel = arg.match(/^(\d+)([hd])$/);
    if (rel) return now - Number(rel[1]) * (rel[2] === 'h' ? 3_600_000 : 86_400_000);
    const at = Date.parse(arg);
    if (Number.isNaN(at)) throw new Error(`--since: ${arg} is neither 24h, 7d nor a time`);
    return at;
  }
  const out = await $`bunx wrangler deployments list --json`.quiet().nothrow();
  const list: { created_on: string }[] = out.exitCode === 0 ? JSON.parse(out.stdout.toString()) : [];
  const last = Math.max(...list.map((d) => Date.parse(d.created_on)));
  if (!Number.isFinite(last)) { console.log('No deployments from wrangler (logged in?): the last 24 hours instead.'); return now - 86_400_000; }
  return last;
}

const from = await since();
console.log(`Since ${time(from)} UTC (${((now - from) / 3_600_000).toFixed(1)} h)`);

// 1. Players.

interface ErrorGroup { message: string; n: number; fatal: number; first: number; last: number; builds: Record<string, number>; sample: { ua: string; where: string } }
interface Kind { n: number; fps: { median: number; p10: number }; loadS: { median: number; p90: number }; hitchesPerMinute: number }
interface Build { build: string; battery: boolean; last: number; desktop?: Kind; touch?: Kind }

const [errors, perf] = await Promise.all([
  fetch(`${SITE}/errors`).then((r) => r.json() as Promise<{ groups: ErrorGroup[] }>),
  fetch(`${SITE}/perf`).then((r) => r.json() as Promise<{ builds: Build[]; budget: { used: number; limit: number }; dataBudget: { used: number; limit: number }; feedBudget?: { used: number; limit: number | null } | null; timetable?: TimetableStatus | null }>),
]);
const builds = perf.builds.filter((b) => !b.battery && b.build).sort((a, b) => b.last - a.last);
const [newest, previous] = builds;

head(`Players: errors seen since (newest build ${newest?.build ?? '?'})`);
const recent = errors.groups.filter((g) => g.last >= from).sort((a, b) => b.last - a.last);
if (!recent.length) console.log('  none');
for (const g of recent) {
  const tag = g.first >= from ? 'NEW ' : '    ';
  const onNewest = newest ? g.builds[newest.build] ?? 0 : 0;
  console.log(`  ${tag}${String(g.n).padStart(4)} (${g.fatal} fatal, ${onNewest} on newest) last ${time(g.last)}  ${g.message.slice(0, 100)}`);
  console.log(`        ${g.sample.where || '-'} | ${g.sample.ua.slice(0, 110)}`);
}

head('Players: performance, newest build (the one before in brackets)');
for (const kind of ['desktop', 'touch'] as const) {
  const a = newest?.[kind];
  const b = previous?.[kind];
  if (!a) continue;
  const was = (pick: (k: Kind) => number) => (b ? ` (${pick(b)})` : '');
  console.log(`  ${kind.padEnd(7)} n ${a.n}${was((k) => k.n)}  fps ${a.fps.median}${was((k) => k.fps.median)}, p10 ${a.fps.p10}${was((k) => k.fps.p10)}  load ${a.loadS.median}${was((k) => k.loadS.median)} s, p90 ${a.loadS.p90}${was((k) => k.loadS.p90)} s  hitches/min ${a.hitchesPerMinute}${was((k) => k.hitchesPerMinute)}`);
}
const feeds = perf.feedBudget ? `, feeds ${fmt(perf.feedBudget.used)} / ${perf.feedBudget.limit === null ? 'no limit' : fmt(perf.feedBudget.limit)}` : '';
console.log(`  today's budgets: players ${fmt(perf.budget.used)} / ${fmt(perf.budget.limit)}, notes and reports ${fmt(perf.dataBudget.used)} / ${fmt(perf.dataBudget.limit)}${feeds}`);
if (perf.timetable !== undefined) console.log(`  ${timetableLine(perf.timetable, now).replace(/<\/?p>/g, '').trim()}`);

if (!token) {
  console.log('\nCF_OBS_TOKEN is not set (see the top of scripts/logs.ts): no Worker logs or usage.');
  process.exit(0);
}

// 2. Workers Logs.

// The account is the one wrangler is logged in to (CF_ACCOUNT_ID if it has more than one), so no ID lives in the repo.
const whoami = await $`bunx wrangler whoami --json`.quiet().nothrow();
const ACCOUNT = process.env.CF_ACCOUNT_ID ?? (whoami.exitCode === 0 ? (JSON.parse(whoami.stdout.toString()) as { accounts?: { id: string }[] }).accounts?.[0]?.id : undefined);
if (!ACCOUNT) {
  console.log('\nNo Cloudflare account: log in with `bunx wrangler login`, or set CF_ACCOUNT_ID.');
  process.exit(0);
}
const api = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const service = { key: '$metadata.service', operation: 'eq', type: 'string', value: SCRIPT };
const level = (value: string) => ({ key: '$metadata.level', operation: 'eq', type: 'string', value });

interface Aggregate { count?: number; value?: number; groups?: { value: unknown }[] }
async function logs(title: string, filters: object[], groupBys: string[]): Promise<boolean> {
  const res = await fetch(`${api}/workers/observability/telemetry/query`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      queryId: title, view: 'calculations', limit: 15, timeframe: { from, to: now },
      parameters: { datasets: ['cloudflare-workers'], filters: [service, ...filters], calculations: [{ operator: 'count' }], groupBys: groupBys.map((value) => ({ type: 'string', value })) },
    }),
  });
  const json = await res.json().catch(() => null) as { success?: boolean; result?: { calculations?: { aggregates?: Aggregate[] }[] } } | null;
  head(`Worker: ${title}`);
  if (!res.ok || !json?.success) { console.log(`  ${res.status}: ${JSON.stringify(json).slice(0, 300)}`); return false; }
  const rows = (json.result?.calculations?.[0]?.aggregates ?? []).sort((a, b) => (b.count ?? b.value ?? 0) - (a.count ?? a.value ?? 0));
  if (!rows.length) console.log('  none');
  for (const row of rows) console.log(`  ${fmt(row.count ?? row.value ?? 0).padStart(7)}  ${(row.groups ?? []).map((g) => String(g.value).slice(0, 120)).join(' | ')}`);
  return true;
}

// Every player's socket that drops (a closed tab, a phone asleep) shows up as an exception, `Network connection lost.`, and
// lands on whatever request the object is serving then: read the messages first, the paths after.
if (await logs('outcomes', [], ['$workers.outcome'])) {
  await logs('errors by message', [level('error')], ['$metadata.message']);
  await logs('warnings by message (budget lines among them)', [level('warn')], ['$metadata.message']);
  await logs('errors by path', [level('error')], ['$workers.event.request.path']);
}

// 3. Usage over the last week, against Workers Paid's monthly allowance.

const INCLUDED = {
  workerRequests: 10_000_000,
  workerCpuMs: 30_000_000,
  doRequests: 1_000_000,
  doGbSeconds: 400_000,
  rowsRead: 25_000_000_000,
  rowsWritten: 50_000_000,
};
const WEEK = 7 * 86_400_000;
const week = { from: new Date(now - WEEK).toISOString(), to: new Date(now).toISOString() };
interface Sums { requests?: number; cpuTimeUs?: number; activeTime?: number; inboundWebsocketMsgCount?: number; rowsRead?: number; rowsWritten?: number }
/** One dataset's sums over the week, or null with the reason printed: each is asked alone, so one refused leaves the rest. */
async function sums(dataset: string, fields: string, extra = ''): Promise<Sums | null> {
  const query = `query($a: String!, $from: Time!, $to: Time!) { viewer { accounts(filter: { accountTag: $a }) {
    rows: ${dataset}(limit: 10, filter: { ${extra}datetime_geq: $from, datetime_leq: $to }) { sum { ${fields} } } } } }`;
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: auth, body: JSON.stringify({ query, variables: { a: ACCOUNT, ...week } }) });
  const json = await res.json().catch(() => null) as { data?: { viewer: { accounts: { rows: { sum: Sums }[] }[] } }; errors?: { message: string }[] } | null;
  const rows = json?.data?.viewer.accounts[0]?.rows;
  if (!res.ok || json?.errors?.length || !rows) {
    console.log(`  ${dataset}: ${json?.errors?.map((e) => e.message).join('; ') ?? res.status}`);
    return null;
  }
  const total: Sums = {};
  for (const { sum } of rows) for (const [k, v] of Object.entries(sum)) total[k as keyof Sums] = (total[k as keyof Sums] ?? 0) + (v as number);
  return total;
}

head('Usage: last 7 days, x 30/7 for a month, against what Workers Paid includes');
const [worker, invocations, periodic] = await Promise.all([
  sums('workersInvocationsAdaptive', 'requests cpuTimeUs', `scriptName: "${SCRIPT}", `),
  sums('durableObjectsInvocationsAdaptiveGroups', 'requests'),
  sums('durableObjectsPeriodicGroups', 'activeTime inboundWebsocketMsgCount rowsRead rowsWritten'),
]);
if (!worker || !invocations || !periodic) console.log('  (what is refused above is left out below: see the top of this file for the token\'s permissions)');
// A Durable Object bills incoming WebSocket messages at 20 to a request, and its time awake at 128 MB (activeTime is in µs).
const usage: [string, number | undefined, number][] = [
  ['Worker requests', worker?.requests, INCLUDED.workerRequests],
  ['Worker CPU ms', worker ? (worker.cpuTimeUs ?? 0) / 1000 : undefined, INCLUDED.workerCpuMs],
  ['DO requests (WebSocket messages / 20)', invocations && periodic ? (invocations.requests ?? 0) + (periodic.inboundWebsocketMsgCount ?? 0) / 20 : undefined, INCLUDED.doRequests],
  ['DO GB-s', periodic ? (periodic.activeTime ?? 0) / 1e6 * 0.125 : undefined, INCLUDED.doGbSeconds],
  ['SQLite rows read', periodic?.rowsRead, INCLUDED.rowsRead],
  ['SQLite rows written', periodic?.rowsWritten, INCLUDED.rowsWritten],
];
for (const [name, used, included] of usage) {
  if (used === undefined) continue;
  const month = used * 30 / 7;
  const share = (month / included) * 100;
  console.log(`  ${name.padEnd(38)} week ${fmt(used).padStart(12)}  month ~${fmt(month).padStart(13)} of ${fmt(included).padStart(14)}  ${share.toFixed(share < 1 ? 2 : 0).padStart(5)}%${share > 100 ? '  OVER' : ''}`);
}

// Where the objects live, the hub and the feeds': a Durable Object settles near whoever first asks for it (or its
// location hint) and stays there, so every player's socket and every feed miss travels to that one data center. The
// hub is awake while anyone plays; the feeds' object hibernates between requests.
if (periodic) {
  const query = `query($a: String!, $from: Time!, $to: Time!) { viewer { accounts(filter: { accountTag: $a }) {
    rows: durableObjectsPeriodicGroups(limit: 100, filter: { datetime_geq: $from, datetime_leq: $to }) { dimensions { coloCode objectId } sum { activeTime } } } } }`;
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: auth, body: JSON.stringify({ query, variables: { a: ACCOUNT, ...week } }) });
  const json = await res.json().catch(() => null) as { data?: { viewer: { accounts: { rows: { dimensions: { coloCode: string; objectId: string }; sum: { activeTime: number } }[] }[] } } } | null;
  const where = new Map<string, number>();
  for (const { dimensions, sum } of json?.data?.viewer.accounts[0]?.rows ?? []) {
    const key = `${dimensions.coloCode} (object ${dimensions.objectId.slice(0, 8)})`;
    where.set(key, (where.get(key) ?? 0) + sum.activeTime);
  }
  const awake = [...where].sort((a, b) => b[1] - a[1]).map(([k, us]) => `${k} ${fmt(us / 1e6 * 0.125)} GB-s`);
  console.log(`  objects, most awake first: ${awake.join(', ') || '?'}`);
}

// 4. Traffic through the zone over the same week, a day at a time: everything Cloudflare served, the cached static build too.

const ZONE = 'understockholm.com';
interface Day { dimensions: { date: string }; sum: { requests: number; cachedRequests: number; bytes: number; cachedBytes: number; pageViews: number; threats: number; countryMap: { clientCountryName: string; requests: number }[] }; uniq: { uniques: number } }
head(`Traffic: ${ZONE}, last 7 days (UTC days, visitors are unique within a day)`);
const zones = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${ZONE}`, { headers: auth }).then((r) => r.json()).catch(() => null) as { result?: { id: string }[] } | null;
const zone = zones?.result?.[0]?.id;
if (!zone) console.log('  the token cannot see the zone: give it "Zone: Read" and "Zone Analytics: Read" for it');
else {
  const query = `query($z: String!, $from: Date!, $to: Date!) { viewer { zones(filter: { zoneTag: $z }) {
    days: httpRequests1dGroups(limit: 10, orderBy: [date_ASC], filter: { date_geq: $from, date_leq: $to }) {
      dimensions { date } sum { requests cachedRequests bytes cachedBytes pageViews threats countryMap { clientCountryName requests } } uniq { uniques } } } } }`;
  const variables = { z: zone, from: new Date(now - WEEK + 86_400_000).toISOString().slice(0, 10), to: week.to.slice(0, 10) };
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: auth, body: JSON.stringify({ query, variables }) });
  const json = await res.json().catch(() => null) as { data?: { viewer: { zones: { days: Day[] }[] } }; errors?: { message: string }[] } | null;
  const days = json?.data?.viewer.zones[0]?.days;
  if (!res.ok || json?.errors?.length || !days) console.log(`  ${json?.errors?.map((e) => e.message).join('; ') ?? res.status}`);
  else {
    const pct = (part: number, whole: number) => `${whole ? Math.round((part / whole) * 100) : 0}%`.padStart(4);
    const mb = (bytes: number) => `${fmt(bytes / 1e6)} MB`;
    console.log(`  ${'day'.padEnd(5)} ${'requests'.padStart(9)} ${'views'.padStart(6)} ${'visitors'.padStart(8)} ${'data'.padStart(10)}  cached req/data  threats`);
    const total = { requests: 0, cachedRequests: 0, bytes: 0, cachedBytes: 0, pageViews: 0, threats: 0 };
    const countries = new Map<string, number>();
    for (const { dimensions, sum, uniq } of days) {
      for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += sum[k];
      for (const c of sum.countryMap) countries.set(c.clientCountryName, (countries.get(c.clientCountryName) ?? 0) + c.requests);
      console.log(`  ${dimensions.date.slice(5)} ${fmt(sum.requests).padStart(9)} ${fmt(sum.pageViews).padStart(6)} ${fmt(uniq.uniques).padStart(8)} ${mb(sum.bytes).padStart(10)}  ${pct(sum.cachedRequests, sum.requests)} / ${pct(sum.cachedBytes, sum.bytes)}  ${fmt(sum.threats).padStart(7)}`);
    }
    console.log(`  ${'week'.padEnd(5)} ${fmt(total.requests).padStart(9)} ${fmt(total.pageViews).padStart(6)} ${''.padStart(8)} ${mb(total.bytes).padStart(10)}  ${pct(total.cachedRequests, total.requests)} / ${pct(total.cachedBytes, total.bytes)}  ${fmt(total.threats).padStart(7)}`);
    const top = [...countries].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(`  countries: ${top.map(([c, n]) => `${c} ${pct(n, total.requests).trim()}`).join(', ')}`);
  }
}
