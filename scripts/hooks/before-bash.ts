// Claude Code hook (PreToolUse on Bash, see .claude/settings.json): the agent cannot get past the quality gates.
// - Deploys go through `bun run deploy`, which runs the whole gate first. Deploy commands run directly are blocked.
// - A push may not skip the pre-push gate (the no-verify flag, SKIP_CHECK, or pointing git at other hooks).
// Only what the shell runs counts: text in heredocs, quotes and comments (docs being written, say) is left alone.
// When the user really wants one of these, they run it themselves (`! <command>` in Claude Code). The patterns are
// in guard.ts, and tests/guard.test.ts pins them down.
import { blocked } from './guard';

let input: { tool_input?: { command?: string } } = {};
try { input = await Bun.stdin.json(); } catch { /* No input: nothing to check. */ }
const why = blocked(input.tool_input?.command ?? '');
if (why === 'deploy') {
  console.error('Blocked: deploys go through `bun run deploy` (scripts/deploy.ts). It needs a clean, pushed tree and SITE_URL, runs the whole quality gate, and only then uploads. If the user wants to deploy another way, they run it themselves.');
  process.exit(2);
}
if (why === 'skip') {
  console.error('Blocked: pushes go through the pre-push gate (scripts/hooks/pre-push). Fix what it finds instead of skipping it; if the user wants to skip it once, they push themselves.');
  process.exit(2);
}
