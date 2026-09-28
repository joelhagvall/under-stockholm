// `bun scripts/tested.ts <quick|smoke> <commit>...`: exits 0 when the last check (perf/last-run.json) passed at that
// level or above on exactly the tree of every commit given, so the pre-push hook need not run it again. Anything else,
// a failed or older run, another tree or no record at all, exits 1 and the hook runs the gate.

import { join } from 'node:path';
import { treeOf } from './tree';

interface LastRun { passed: boolean; tree?: string | null; scope: { perf: boolean; smoke: boolean; web: boolean } }

const [level, ...commits] = process.argv.slice(2);
let last: LastRun | null = null;
try { last = await Bun.file(join(import.meta.dir, '..', 'perf/last-run.json')).json(); } catch { /* Never run. */ }

// Every level runs the quick gates first; smoke is covered by a smoke run or a whole perf run.
const deep = level === 'quick' || !!last?.scope.smoke || !!last?.scope.perf;
const same = commits.length > 0 && commits.every((c) => treeOf(c) === last?.tree);
process.exit(last?.passed && last.tree && deep && same ? 0 : 1);
