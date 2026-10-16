// The errors players met (/errors), each group with its newest stack read back to src/ by the build's source maps
// (`scripts/sourcemaps.ts`): what to read before reproducing one in the game with `?debug` at the station it names.
//   bun run errors                 every group the relay keeps, the one met most recently first
//   bun run errors --since 24h     only groups met since then (24h, 7d or an ISO time)
//   bun run errors --site URL      another relay than https://understockholm.com (the Bun relay of `bun run serve:prod`)
//   bun run errors --json          the groups as JSON, stacks read back, for a script or an agent
//   bun run errors --rank          the ones worth fixing first: the game's own errors (not a device or connection that
//                                  could not run it), by reports per 100 visits on the newest build, then by count
// Each group has an id that stays the same from build to build (`groupId`), and its share of the newest build's visits
// (from /perf: one report per visit, so a context lost and the reload after it can count twice).
// A stack from a build whose maps are not on this machine (deployed from elsewhere, or before the maps were kept by
// `bun run deploy`) stays minified, and the chunks are named at the end.

import { groupId, isEnvironment, type ErrorAggregate, type ErrorGroup } from '../server/errorCore';
import { missing, symbolicate } from './sourcemaps';

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const site = (arg('--site') ?? 'https://understockholm.com').replace(/\/$/, '');

function since(): number {
  const value = arg('--since');
  if (!value) return 0;
  const rel = value.match(/^(\d+)([hd])$/);
  if (rel) return Date.now() - Number(rel[1]) * (rel[2] === 'h' ? 3_600_000 : 86_400_000);
  const at = Date.parse(value);
  if (Number.isNaN(at)) throw new Error(`--since: ${value} is neither 24h, 7d nor a time`);
  return at;
}

const from = since();
const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${site}${path}`);
  if (!res.ok) throw new Error(`${site}${path} answered ${res.status}`);
  return res.json() as Promise<T>;
};
type Visits = { build: string; last: number; desktop?: { n: number }; touch?: { n: number } };
const [data, perf] = await Promise.all([get<ErrorAggregate>('/errors'), get<{ builds: Visits[] }>('/perf')]);
// Visits per build, battery saver or not.
const visits = new Map<string, { n: number; last: number }>();
for (const b of perf.builds) {
  if (!b.build) continue;
  const v = visits.get(b.build) ?? { n: 0, last: 0 };
  v.n += (b.desktop?.n ?? 0) + (b.touch?.n ?? 0);
  v.last = Math.max(v.last, b.last);
  visits.set(b.build, v);
}
const newest = [...visits].sort((a, b) => b[1].last - a[1].last)[0];

interface Group extends ErrorGroup {
  id: string;
  /** A device or connection that could not run the game: no fix in the code. */
  environment: boolean;
  newest: { build: string; reports: number; visits: number; per100: number } | null;
}
const groups: Group[] = data.groups
  .filter((g) => g.last >= from)
  .map((g) => {
    const reports = newest ? g.builds[newest[0]] ?? 0 : 0;
    return {
      ...g,
      id: groupId(g),
      environment: isEnvironment(g.message),
      newest: newest ? { build: newest[0], reports, visits: newest[1].n, per100: newest[1].n ? Math.round(reports / newest[1].n * 1000) / 10 : 0 } : null,
      frame: symbolicate(g.frame),
      sample: { ...g.sample, stack: symbolicate(g.sample.stack) },
    };
  });
if (process.argv.includes('--rank')) {
  const score = (g: Group) => (g.environment ? -1 : (g.newest?.per100 ?? 0) * 1000 + g.n);
  groups.sort((a, b) => score(b) - score(a));
} else groups.sort((a, b) => b.last - a.last);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ site, since: from || null, groups, unmapped: [...missing] }, null, 2));
  process.exit(0);
}

const time = (ms: number) => new Date(ms).toISOString().slice(5, 16).replace('T', ' ');
const top = (tally: Record<string, number> = {}) => Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([key, n]) => `${key || '?'} ${n}`).join(', ');

console.log(`${groups.length} group${groups.length === 1 ? '' : 's'} from ${site}/errors${from ? ` met since ${time(from)} UTC` : ''}, ${data.count} reports kept`);
if (newest) console.log(`Newest build ${newest[0]}: ${newest[1].n} visits`);
for (const g of groups) {
  const s = g.sample;
  const share = g.newest ? `, ${g.newest.reports} on the newest build (${g.newest.per100} per 100 visits)` : '';
  console.log(`\n== ${g.id}${g.environment ? ' (device or connection)' : ''}: ${g.n} (${g.fatal} fatal, ${g.touch} touch)${share}, first ${time(g.first)}, last ${time(g.last)} UTC`);
  console.log(g.message);
  const held = s.geometries || s.textures ? `, ${s.geometries} geometries and ${s.textures} textures on the GPU` : '';
  console.log(`  newest: ${s.where || '(no station)'}, ${s.played} s in, ${s.kind}, ${s.gpu || '?'}, ${s.memory ? `${s.memory} GB` : '? GB'}${held}, build ${s.build || '?'}`);
  console.log(`  ${s.ua}`);
  console.log(`  builds: ${top(g.builds) || '?'} | GPUs: ${top(g.gpus) || '?'} | GB: ${top(g.memories) || '?'}`);
  for (const line of s.stack.split('\n')) if (line.trim()) console.log(`    ${line.trim()}`);
}
if (missing.size) console.log(`\nNo source map here for ${[...missing].join(', ')}: those frames stay minified.`);
