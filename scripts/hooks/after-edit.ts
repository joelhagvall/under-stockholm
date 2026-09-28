// Claude Code hook (PostToolUse on Edit, Write and MultiEdit, see .claude/settings.json): after a change to a
// TypeScript file, the types are checked and the tests run, about a second in all. Errors go back to the agent
// (exit 2), so a broken build is fixed in the same breath, never left for the push.
import { relative } from 'node:path';
import { CODE_PATHS } from './paths';

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
let input: { tool_input?: { file_path?: string } } = {};
try { input = await Bun.stdin.json(); } catch { /* No input: nothing to check. */ }
const path = relative(root, input.tool_input?.file_path ?? '');
if (!CODE_PATHS.test(path)) process.exit(0);

const problems: string[] = [];
for (const [label, cmd] of [['typecheck', ['bunx', 'tsc', '--noEmit']], ['tests', ['bun', 'test']]] as const) {
  const proc = Bun.spawn([...cmd], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  if ((await proc.exited) !== 0) problems.push(`${label} failed after editing ${path}:\n${(out + err).trim().split('\n').slice(-40).join('\n')}`);
}
if (problems.length) {
  console.error(problems.join('\n\n'));
  process.exit(2);
}
