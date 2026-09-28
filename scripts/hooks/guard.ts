// What the Bash guard (before-bash.ts) blocks, apart from the hook so the tests can reach it.

/** The command as the shell runs it: heredoc bodies, quoted strings and comments are text, not commands. */
export function executed(command: string): string {
  return command
    .replace(/<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, '<<heredoc')
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/(^|[\s;&|])#[^\n]*/g, '$1');
}

/** Commands that put a build in front of players, other than through `bun run deploy`. */
const DEPLOY = [
  // Wrangler's own dry run builds and checks the upload without sending it, so it may run.
  /\bwrangler\s+(deploy|publish|pages\s+deploy|versions\s+(deploy|upload))\b(?![^;&|\n]*--dry-run\b)/,
  /\bvercel\b(?![^;&|\n]*\b(dev|env|login|link|logs|ls|whoami)\b)/,
  /\bnetlify\s+deploy\b/,
  /\bfirebase\s+deploy\b/,
  /\bsurge\b/,
  /\bgh\s+workflow\s+run\b[^;&|\n]*deploy/i,
  /\b(rsync|scp)\b[^;&|\n]*\bdist\b/,
  /\baws\s+s3\s+(sync|cp)\b[^;&|\n]*\bdist\b/,
];

/** Ways around the pre-push gate. */
const SKIP = [
  /\bgit\b[^;&|\n]*\bpush\b[^;&|\n]*(--no-verify|\s-n\b)/,
  /\bSKIP_CHECK=/,
  /-c\s+core\.hooksPath/,
  /\bgit\s+config\b[^;&|\n]*\bcore\.hooksPath\b(?!\s+scripts\/hooks\b)/,
];

/** Why a command may not run, or null when it may. `bun run deploy` matches nothing: it uploads in a process of its own. */
export function blocked(command: string): 'deploy' | 'skip' | null {
  const run = executed(command);
  if (DEPLOY.some((re) => re.test(run))) return 'deploy';
  if (SKIP.some((re) => re.test(run))) return 'skip';
  return null;
}
