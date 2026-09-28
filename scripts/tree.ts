// What the quality gate ran on, as git sees it: the hash of the tree of every file git does not ignore. A check
// records the working tree's (scripts/check.ts), and the pre-push hook compares it with the tree of each commit it
// pushes (scripts/tested.ts): the same hash is the same bytes in every file, so a push of exactly what passed need not
// run it again. The baseline (perf/baseline.json) is left out: `--accept` writes it during the run, and it holds the
// numbers to compare with, not code.

import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const LEFT_OUT = ['perf/baseline.json'];

function git(args: string[], env: Record<string, string> = {}): string | null {
  const out = Bun.spawnSync(['git', ...args], { cwd: root, env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'ignore' });
  return out.exitCode === 0 ? out.stdout.toString().trim() : null;
}

/** The tree hash of a commit, or of the working tree with no argument; null when git cannot say. */
export function treeOf(commit?: string): string | null {
  // A scratch index, so the real one (what is staged) is left alone.
  const dir = mkdtempSync(join(tmpdir(), 'us-tree-'));
  const index = join(dir, 'index');
  const env = { GIT_INDEX_FILE: index };
  try {
    if (commit) {
      if (git(['read-tree', commit], env) === null) return null;
    } else {
      // Starting from the real index lets git skip every file whose size and time have not changed.
      const real = git(['rev-parse', '--git-path', 'index']);
      if (real && existsSync(join(root, real))) copyFileSync(join(root, real), index);
      if (git(['add', '-A'], env) === null) return null;
    }
    if (git(['rm', '--cached', '-q', '--ignore-unmatch', '--', ...LEFT_OUT], env) === null) return null;
    return git(['write-tree'], env);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
