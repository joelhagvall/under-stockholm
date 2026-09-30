// Claude Code hook (Stop, see .claude/settings.json): the agent may not call a change to the landing page done until
// `bun run check --web` has passed on it, as nothing before a deploy audits it otherwise. A change to the game needs
// no gate here: every edit is typechecked and tested at once (after-edit.ts), and the push runs `--smoke`
// (scripts/hooks/pre-push), so a session is not held up for a minute and a half each time it ends.
// It looks at the files this session edited (from the transcript) that are still uncommitted, and at
// perf/last-run.json: a passing run with the web audits, newer than the last edit, lets the session end. Otherwise
// the agent is told what to run (exit 2). A session that is already going on because of this hook is let through,
// so it can never loop.
import { statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { WEB_PATHS } from './paths';

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

// Of those, the landing page's that are still uncommitted.
const status = await new Response(Bun.spawn(['git', 'status', '--porcelain', '--untracked-files=all'], { cwd: root, stdout: 'pipe' }).stdout).text();
const dirty = status.split('\n').filter(Boolean).map((l) => l.slice(3).trim());
const web = dirty.filter((f) => edited.has(f) && WEB_PATHS.test(f));
if (!web.length) process.exit(0);

const newest = Math.max(...web.map((f) => { try { return statSync(join(root, f)).mtimeMs; } catch { return 0; } }));
let last: { at: string; passed: boolean; scope: { web: boolean } } | null = null;
try { last = await Bun.file(join(root, 'perf/last-run.json')).json(); } catch { /* Never run. */ }
if (last && last.passed && Date.parse(last.at) >= newest && last.scope.web) process.exit(0);

console.error(`Not done yet: ${web.join(', ')} changed since the last passing web audit. Run \`bun run check --web\` (it starts the servers itself), fix what fails, and give the numbers in the answer.`);
process.exit(2);
