// `bun scripts/tested.ts <quick|smoke|perf|web|release> <commit>...`: exits 0 when the last check (perf/last-run.json)
// passed at that level or above on exactly the tree of every commit given, so the pre-push hook need not run it again.
// Anything else, a failed or older run, another tree or no record at all, exits 1 and the hook runs the gate.
// `bun run deploy` asks the same through `tested()`, with the shape of the build it uploads and the baseline it holds,
// so a release that already passed on what is deployed is not run a second time.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { treeOf } from './tree';

export type Level = 'quick' | 'smoke' | 'perf' | 'web' | 'release';
interface LastRun { passed: boolean; tree?: string | null; shape?: string; baseline?: string | null; scope: { perf: boolean; smoke: boolean; web: boolean } }

const root = join(import.meta.dir, '..');
const BASELINE = join(root, 'perf/baseline.json');

/** The build flags `bun run deploy` passes, both always set, so neither is inherited from the shell it runs in. */
export function deployFlags(landing: boolean, withRecordings: boolean): Record<string, string> {
  return { LANDING_ONLY: landing ? '1' : '0', RECORDINGS: !landing && withRecordings ? '1' : '0' };
}

/**
 * Which build the gate measured: with or without the recorded announcements, the game or the landing page alone, and
 * the configuration Vite reads besides the code: the resolved production `VITE_` variables and the `.env` files,
 * which git ignores and so the tree's hash cannot see (a relay set in `.env.local` changes the build and its CSP).
 */
export function buildShape(env: Record<string, string | undefined> = process.env, dir = root): string {
  const landing = env.LANDING_ONLY === '1';
  // Vite expands references to shell variables, even those without a VITE_ prefix. Resolve with its own reader in
  // an isolated process using this exact environment, without Bun loading extra .env files or mutating this process.
  const resolved = Bun.spawnSync([
    process.execPath, '--no-env-file', '--eval',
    'import { loadEnv } from "vite"; process.stdout.write(JSON.stringify(loadEnv("production", process.argv[1])));', dir,
  ], { cwd: root, env, stdout: 'pipe', stderr: 'pipe' });
  if (resolved.exitCode !== 0) throw new Error('Could not resolve the production build environment.');
  const values = JSON.parse(resolved.stdout.toString()) as Record<string, string>;
  const vars = Object.keys(values).sort().map((k) => JSON.stringify([k, values[k]]));
  const files = readdirSync(dir).filter((f) => f.startsWith('.env')).sort().map((f) => `${f}:${Bun.hash(readFileSync(join(dir, f))).toString(16)}`);
  const config = vars.length || files.length ? Bun.hash([...vars, ...files].join('\n')).toString(16) : 'none';
  return `recordings=${!landing && env.RECORDINGS !== '0'} landing=${landing} config=${config}`;
}

/** The baseline's bytes as a hash, as the gate read them: left out of the tree (scripts/tree.ts), so kept apart. */
export function baselineHash(): string | null {
  return existsSync(BASELINE) ? Bun.hash(readFileSync(BASELINE)).toString(16) : null;
}

/** Whether the last check passed at `level` or above on the tree of every commit, and, when given, on that build. */
export async function tested(level: Level, commits: string[], build?: { shape: string; baseline: string | null }): Promise<boolean> {
  let last: LastRun | null = null;
  try { last = await Bun.file(join(root, 'perf/last-run.json')).json(); } catch { /* Never run. */ }
  if (!last?.passed || !last.tree || !commits.length) return false;
  // Every level runs the quick gates first; smoke is covered by a smoke run or a whole perf run.
  const { perf, smoke, web } = last.scope;
  const deep = { quick: true, smoke: smoke || perf, perf, web, release: perf && web }[level];
  if (!deep) return false;
  if (build && (last.shape !== build.shape || last.baseline !== build.baseline)) return false;
  return commits.every((c) => treeOf(c) === last.tree);
}

if (import.meta.main) {
  const [level, ...commits] = process.argv.slice(2);
  process.exit(await tested(level as Level, commits) ? 0 : 1);
}
