// The quality gate, in one command: `bun run check`. It fails on anything under par, and compares the numbers with
// the last accepted ones so a slow slide is caught as well as a cliff. It comes in levels, cheap to dear, the way a
// studio runs its tests: the cheap ones on every push, all of it every night and before a release.
//
//   --quick  typecheck, tests, build with the size budgets, the Worker's every push (seconds)
//            limits in wrangler dev
//   --smoke  the quick gates, one leak scenario and the two heaviest     every push that changes the game (about
//            scenes as a phone                                           1.5 minutes)
//   --perf   the quick gates, every leak scenario, every scene as a      after a change to the world or the frame
//            desktop and a phone, and the time to playing                loop, and nightly (about 9 minutes)
//   --web    the quick gates, Lighthouse and pa11y on both landing pages landing page changes, and nightly (3 minutes)
//   --device the frame rates on an Android phone over USB too            when one is plugged in
//   --accept write the numbers as the new baseline (perf/baseline.json)  after a change that is meant to cost
//
// With no flags it runs all of it (`bun run release`, and `bun run deploy` before every upload; `bun run nightly` can run it at
// night, off for now). It starts and stops the dev server and the production server itself, on free
// ports, so nothing else needs to run. Every run writes perf/last-run.json, with the tree it ran on (scripts/tree.ts),
// which the pre-push hook and the agent hooks read (scripts/hooks): a push of exactly a tree that passed skips the gate. The limits below are the floor; the baseline catches a change that stays above the
// floor but costs more than the noise between runs. `--accept` keeps the floor. A scene that misses on its frame times
// is timed once more and fails only if it misses again, and a machine already busy before the timing is noted.

import { existsSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { join } from 'node:path';
import type { FpsReport, Result } from './fps';
import type { LoadReport } from './load';
import type { MemReport } from './mem';
import { treeOf } from './tree';

const root = join(import.meta.dir, '..');
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const everything = !flags.has('--perf') && !flags.has('--web') && !flags.has('--quick') && !flags.has('--smoke');
const PERF = everything || flags.has('--perf');
/** A little of the performance gates, fast enough for every push: the rest runs at night. */
const SMOKE = !PERF && flags.has('--smoke');
/** The scenes and leak scenario the smoke level runs: the ones that have broken before. */
const SMOKE_SCENES = 'Gamla stan,Akalla';
const SMOKE_LEAKS = 'Travelling';
const WEB = everything || flags.has('--web');
const DEVICE = flags.has('--device');
const ACCEPT = flags.has('--accept');
const BASELINE = join(root, 'perf/baseline.json');
const LAST_RUN = join(root, 'perf/last-run.json');
const SCRATCH = join(root, 'perf/.run');

/**
 * The floor. A number on the wrong side of these fails, baseline or not. Smoothness is judged by the share of frames
 * over 20 ms (`slow`, in percent), not the 95th percentile: at 60 Hz a frame takes 16.7 ms or 33.3 ms and little in
 * between, so the percentile jumps from one to the other as soon as 5% of frames miss, and a scene at the edge fails
 * one run in three. The share moves smoothly with how often frames miss. The percentile is still reported.
 */
const LIMITS = {
  fps: {
    desktop: { fps: 57, slow: 2, hitches: 0, worst: 40, pixelRatio: 2 },
    // The CPU six times slower: the heaviest scenes miss a frame now and then, which is the point of the test.
    phone: { fps: 54, slow: 10, hitches: 1, worst: 60, pixelRatio: 1.5 },
    // A real phone draws slower than the emulated one, and its GPU is the unknown: a floor, not a target.
    device: { fps: 45, slow: 25, hitches: 2, worst: 120, pixelRatio: 1 },
  } as Record<string, { fps: number; slow: number; hitches: number; worst: number; pixelRatio: number }>,
  /** Seconds from the click to playing, without the loading screen's minimum. */
  load: { desktop: 3, phone: 12 } as Record<string, number>,
  web: { performance: 100, accessibility: 100, seo: 100, 'best-practices': 90, pa11yErrors: 0 },
};

/** How much a number may drift from the baseline before it counts as a regression: the noise between runs, and a little. */
const DRIFT = {
  fps: 4, slow: (b: number) => b + 6, calls: (b: number) => b * 1.15 + 8, triangles: (b: number) => b * 1.2,
  readyS: (b: number) => b * 1.25 + 0.5, bytes: (b: number) => b * 1.05 + 20_000,
};

interface Baseline { at: string; commit: string; fps?: FpsReport; load?: LoadReport }
interface LastRun { at: string; commit: string; tree: string | null; passed: boolean; scope: { perf: boolean; smoke: boolean; web: boolean }; failures: string[]; retried?: string[]; fps?: FpsReport; load?: LoadReport; mem?: MemReport; web?: Record<string, Record<string, number>> }

const failures: string[] = [];

/** What is wrong with one scene's frame rates, against the floor and the baseline. */
function judgeFps(profile: string, scene: string, r: Result): string[] {
  const limit = LIMITS.fps[profile];
  const out: string[] = [];
  if (r.fps < limit.fps) out.push(`${r.fps} fps, floor ${limit.fps}`);
  if (r.slow > limit.slow) out.push(`${r.slow}% of frames over 20 ms, at most ${limit.slow}%`);
  if (r.hitches > limit.hitches) out.push(`${r.hitches} frames over 50 ms, at most ${limit.hitches}`);
  if (r.worst > limit.worst) out.push(`worst frame ${r.worst} ms, ceiling ${limit.worst}`);
  if (r.pixelRatio < limit.pixelRatio) out.push(`resolution fell to ${r.pixelRatio}, floor ${limit.pixelRatio}`);
  const b: Result | undefined = baseline?.fps?.[profile]?.[scene];
  if (!b || ACCEPT) return out;
  if (r.fps < b.fps - DRIFT.fps) out.push(`${r.fps} fps, was ${b.fps}`);
  if (r.slow > DRIFT.slow(b.slow)) out.push(`${r.slow}% of frames over 20 ms, was ${b.slow}%`);
  if (r.calls > DRIFT.calls(b.calls)) out.push(`${r.calls} draw calls, was ${b.calls}`);
  if (r.triangles > DRIFT.triangles(b.triangles)) out.push(`${r.triangles} triangles, was ${b.triangles}`);
  return out;
}

/**
 * Whether something else keeps this computer busy before the frame rates are timed, which the phone's six times slower
 * CPU feels most: the load over the last minute against its cores, or another program using a whole core or more
 * (one busy app hardly moves the load of a machine with many cores, yet costs the timed frames). A note, never a failure.
 */
function machineBusy(): string | null {
  const load = loadavg()[0];
  const cores = cpus().length;
  const busy: string[] = [];
  if (load > cores * 0.4) busy.push(`load ${load.toFixed(1)} on ${cores} cores`);
  try {
    const ps = Bun.spawnSync(['ps', '-Ao', 'pcpu=,comm=', '-r']).stdout.toString().split('\n').slice(0, 6);
    for (const line of ps) {
      const m = line.trim().match(/^([\d.]+)\s+(.+)$/);
      if (!m || Number(m[1]) < 80 || /chrome|bun|node|vite/i.test(m[2])) continue;
      busy.push(`${m[2].split('/').pop()} at ${Math.round(Number(m[1]))}% CPU`);
    }
  } catch { /* No ps: the load alone. */ }
  return busy.length ? `the machine was busy before timing: ${busy.join(', ')}` : null;
}
const fail = (what: string) => { failures.push(what); console.log(`  FAIL ${what}`); };

/** Runs a command in the project, streaming its output; false when it exits with an error. */
async function run(label: string, cmd: string[], env: Record<string, string> = {}): Promise<boolean> {
  console.log(`\n== ${label}`);
  const proc = Bun.spawn(cmd, { cwd: root, env: { ...process.env, ...env }, stdout: 'inherit', stderr: 'inherit' });
  return (await proc.exited) === 0;
}

/** A port nothing listens on. */
function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port!;
  probe.stop(true);
  return port;
}

/** Starts a server and waits until it answers. Returns how to stop it. */
async function serve(label: string, cmd: string[], url: string, env: Record<string, string> = {}): Promise<() => void> {
  const proc = Bun.spawn(cmd, { cwd: root, env: { ...process.env, ...env }, stdout: 'ignore', stderr: 'inherit' });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return () => proc.kill();
    } catch { /* Not up yet. */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill();
  throw new Error(`${label} did not come up at ${url}`);
}

const commit = (await new Response(Bun.spawn(['git', 'rev-parse', '--short', 'HEAD'], { cwd: root, stdout: 'pipe' }).stdout).text()).trim();
const baseline: Baseline | null = existsSync(BASELINE) ? await Bun.file(BASELINE).json() : null;
// What this run checks: recorded only if nothing changed under it, so a push of exactly this can skip the gate.
const treeBefore = treeOf();
const last: LastRun = { at: new Date().toISOString(), commit, tree: null, passed: false, scope: { perf: PERF, smoke: SMOKE, web: WEB }, failures };
await Bun.write(join(SCRATCH, '.keep'), '');

// 1. The quick gates: types, tests and the build with its size budgets.
if (!(await run('typecheck', ['bunx', 'tsc', '--noEmit']))) fail('typecheck');
if (!(await run('tests', ['bun', 'test']))) fail('tests');
// Built for the local production server, which the audits read, as a build without SITE_URL would be, but said
// outright: the warning about a missing address is for a build meant to go somewhere.
if (!(await run('build and size budgets', ['bunx', 'vite', 'build'], { SITE_URL: process.env.SITE_URL ?? 'http://localhost:4173/' })) || !(await run('size budgets', ['bun', 'scripts/check-budgets.ts']))) fail('build or size budgets');
// The Worker and the hub in wrangler dev, on the build's assets: the limits of docs/DRIFT.md section 3, end to end.
else if (!(await run('the Worker\'s limits', ['bun', 'scripts/worker-check.ts']))) fail('the Worker\'s limits');

// 2. Performance: leaks, frame rates and loading, against the dev server (unminified names) and the production build.
if ((PERF || SMOKE) && !failures.length) {
  const devPort = freePort();
  const devUrl = `http://localhost:${devPort}/`;
  const stopDev = await serve('dev server', ['bun', 'scripts/dev.ts', '--port', String(devPort), '--strictPort'], devUrl);
  try {
    const memJson = join(SCRATCH, 'mem.json');
    const memArgs = ['bun', 'scripts/mem.ts', '--url', devUrl, '--json', memJson, ...(SMOKE ? ['--scene', SMOKE_LEAKS, '--rounds', '3'] : [])];
    if (!(await run('memory leaks', memArgs))) fail('memory leaks (see above)');
    if (existsSync(memJson)) last.mem = await Bun.file(memJson).json();

    const fpsJson = join(SCRATCH, 'fps.json');
    const fpsArgs = ['bun', 'scripts/fps.ts', '--url', devUrl, '--json', fpsJson, ...(SMOKE ? ['--only', 'phone', '--scene', SMOKE_SCENES, '--seconds', '5'] : []), ...(DEVICE ? ['--device'] : [])];
    const busy = machineBusy();
    if (busy) console.log(`\n  NOTE ${busy}: frame times may suffer from it, not from the game`);
    if (!(await run('frame rates', fpsArgs))) fail('frame rates did not run');
    else {
      const report: FpsReport = await Bun.file(fpsJson).json();
      last.fps = report;
      // A scene that misses on its timing is timed once more, and fails only if it misses again: a lone hitch from
      // something else on the machine is not a regression. Draw calls and triangles do not change between runs.
      const again: Record<string, string[]> = {};
      for (const [profile, scenes] of Object.entries(report)) {
        for (const [scene, r] of Object.entries(scenes)) if (judgeFps(profile, scene, r).length) (again[profile] ??= []).push(scene);
      }
      for (const [profile, scenes] of Object.entries(again)) {
        const retryJson = join(SCRATCH, `fps-again-${profile}.json`);
        const retryArgs = ['bun', 'scripts/fps.ts', '--url', devUrl, '--json', retryJson, '--only', profile, '--names', scenes.join('|'), ...(SMOKE ? ['--seconds', '5'] : [])];
        if (!(await run(`frame rates again, ${profile}: ${scenes.join('; ')}`, retryArgs))) continue;
        const retried: FpsReport = await Bun.file(retryJson).json();
        for (const scene of scenes) {
          const r = retried[profile]?.[scene];
          if (!r) continue;
          const first = judgeFps(profile, scene, report[profile][scene]);
          console.log(`  ${profile}, ${scene}: first ${first.join('; ')}; again ${judgeFps(profile, scene, r).length ? 'missed too' : 'passed'}`);
          report[profile][scene] = r;
          (last.retried ??= []).push(`${profile}, ${scene}`);
        }
      }
      for (const [profile, scenes] of Object.entries(report)) {
        for (const [scene, r] of Object.entries(scenes)) for (const f of judgeFps(profile, scene, r)) fail(`${profile}, ${scene}: ${f}${busy ? ` (${busy})` : ''}`);
      }
    }
  } finally {
    stopDev();
  }
}

// 3. The production build served compressed: the time to playing, and the landing pages' audits.
// The time to playing is left to the full level: it takes a production build and does not change from one push to the next.
if ((PERF || WEB) && !failures.length) {
  const prodPort = freePort();
  const prodUrl = `http://localhost:${prodPort}/`;
  const stopProd = await serve('production server', ['bun', 'scripts/serve.ts'], prodUrl, { PORT: String(prodPort) });
  try {
    if (PERF) {
      const loadJson = join(SCRATCH, 'load.json');
      if (!(await run('time to playing', ['bun', 'scripts/load.ts', '--url', prodUrl, '--json', loadJson]))) fail('time to playing did not run');
      else {
        const report: LoadReport = await Bun.file(loadJson).json();
        last.load = report;
        for (const [profile, r] of Object.entries(report)) {
          if (r.readyS > LIMITS.load[profile]) fail(`${profile}: playable after ${r.readyS.toFixed(1)} s, ceiling ${LIMITS.load[profile]}`);
          const b = baseline?.load?.[profile];
          if (!b || ACCEPT) continue;
          if (r.readyS > DRIFT.readyS(b.readyS)) fail(`${profile}: playable after ${r.readyS.toFixed(1)} s, was ${b.readyS.toFixed(1)}`);
          if (r.bytes > DRIFT.bytes(b.bytes)) fail(`${profile}: ${Math.round(r.bytes / 1000)} kB downloaded, was ${Math.round(b.bytes / 1000)}`);
        }
      }
    }
    if (WEB) {
      last.web = {};
      for (const page of ['', 'en/']) {
        const url = prodUrl + page;
        const out = join(SCRATCH, `lighthouse-${page ? 'en' : 'sv'}.json`);
        console.log(`\n== Lighthouse ${url}`);
        const lh = Bun.spawn(['bunx', 'lighthouse', url, '--only-categories=performance,accessibility,best-practices,seo', '--output=json', `--output-path=${out}`, '--chrome-flags=--headless=new', '--quiet'], { cwd: root, stdout: 'ignore', stderr: 'inherit' });
        if ((await lh.exited) !== 0 || !existsSync(out)) { fail(`Lighthouse did not run for ${url}`); continue; }
        const result = await Bun.file(out).json() as { categories: Record<string, { score: number }> };
        const scores: Record<string, number> = {};
        for (const [name, limit] of Object.entries(LIMITS.web)) {
          if (name === 'pa11yErrors') continue;
          const score = Math.round((result.categories[name]?.score ?? 0) * 100);
          scores[name] = score;
          if (score < limit) fail(`${url}: Lighthouse ${name} ${score}, floor ${limit}`);
        }
        console.log(`  ${Object.entries(scores).map(([k, v]) => `${k} ${v}`).join(', ')}`);
        console.log(`\n== pa11y ${url}`);
        const pa = Bun.spawn(['bunx', 'pa11y', url, '--reporter', 'json'], { cwd: root, stdout: 'pipe', stderr: 'inherit' });
        const issues = JSON.parse((await new Response(pa.stdout).text()) || '[]') as Array<{ type: string; message: string; selector: string }>;
        await pa.exited;
        const errors = issues.filter((i) => i.type === 'error');
        scores.pa11yErrors = errors.length;
        for (const e of errors) console.log(`  ${e.selector}: ${e.message}`);
        if (errors.length > LIMITS.web.pa11yErrors) fail(`${url}: pa11y found ${errors.length} errors`);
        else console.log('  no errors');
        last.web[page || 'sv'] = scores;
      }
    }
  } finally {
    stopProd();
  }
}

last.passed = failures.length === 0;
const treeAfter = treeOf();
last.tree = treeBefore !== null && treeBefore === treeAfter ? treeAfter : null;
await Bun.write(LAST_RUN, JSON.stringify(last, null, 2) + '\n');
if (ACCEPT && last.passed && PERF) {
  const next: Baseline = { at: last.at, commit, fps: last.fps ?? baseline?.fps, load: last.load ?? baseline?.load };
  await Bun.write(BASELINE, JSON.stringify(next, null, 2) + '\n');
  console.log(`\nBaseline written to perf/baseline.json (${commit}). Commit it with the change.`);
}
console.log(failures.length ? `\n${failures.length} problem${failures.length > 1 ? 's' : ''}:\n  ${failures.join('\n  ')}\n\nNot good enough to ship.` : '\nAll gates passed.');
process.exit(failures.length ? 1 : 0);
