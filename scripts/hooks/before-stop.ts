// Claude Code hook (Stop, see .claude/settings.json): the agent may not call a change to the game or the landing
// page done until `bun run check` has passed on it: `--smoke` (or more) for the game, `--web` for the landing page.
// It looks at the files this session edited (from the transcript) that are still uncommitted, and at
// perf/last-run.json: a passing run, of the right scope, newer than the last edit, lets the session end. Otherwise
// the agent is told what to run (exit 2). A session that is already going on because of this hook is let through,
// so it can never loop.
import { statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PERF_PATHS, WEB_PATHS } from './paths';

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
let input: { stop_hook_active?: boolean; transcript_path?: string } = {};
try { input = await Bun.stdin.json(); } catch { /* No input. */ }
if (input.stop_hook_active) process.exit(0);

// Files this session wrote, by the tool calls in the transcript.
const edited = new Set<string>();
if (input.transcript_path) {
  try {
    for (const line of (await Bun.file(input.transcript_path).text()).split('\n')) {
      if (!line.includes('"file_path"')) continue;
      for (const m of line.matchAll(/"file_path":\s*"([^"]+)"/g)) edited.add(relative(root, m[1]));
    }
  } catch { /* Unreadable transcript: nothing to hold. */ }
}
if (!edited.size) process.exit(0);

// Of those, the ones still uncommitted that the gates care about.
const status = await new Response(Bun.spawn(['git', 'status', '--porcelain', '--untracked-files=all'], { cwd: root, stdout: 'pipe' }).stdout).text();
const dirty = status.split('\n').filter(Boolean).map((l) => l.slice(3).trim());
const perf = dirty.filter((f) => edited.has(f) && PERF_PATHS.test(f));
const web = dirty.filter((f) => edited.has(f) && WEB_PATHS.test(f));
if (!perf.length && !web.length) process.exit(0);

const newest = Math.max(...[...perf, ...web].map((f) => { try { return statSync(join(root, f)).mtimeMs; } catch { return 0; } }));
let last: { at: string; passed: boolean; scope: { perf: boolean; smoke?: boolean; web: boolean } } | null = null;
try { last = await Bun.file(join(root, 'perf/last-run.json')).json(); } catch { /* Never run. */ }
const covered = last && last.passed && Date.parse(last.at) >= newest && (!perf.length || last.scope.perf || last.scope.smoke) && (!web.length || last.scope.web);
if (covered) process.exit(0);

const flags = [perf.length && '--smoke', web.length && '--web'].filter(Boolean).join(' ');
console.error(`Not done yet: ${[...perf, ...web].join(', ')} changed since the last passing check. Run \`bun run check ${flags}\` (it starts the servers itself), fix what fails, and give the numbers in the answer. After a change to the world, the build steps or the frame loop, run \`--perf\` instead; if the change is meant to cost performance, add --accept and commit perf/baseline.json.`);
process.exit(2);
