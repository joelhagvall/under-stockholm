// The only way the site goes live: `bun run deploy` (to https://understockholm.com/, or SITE_URL if set). It deploys
// exactly what is on GitHub's main, and only after the quality gate has passed on it:
//   1. the working tree must be clean and HEAD pushed (on origin/main), so what is built is what was checked;
//   2. the address (SITE_URL, by default the game's own domain): the canonical, hreflang and preview links need it;
//   3. `bun scripts/check.ts`, all of it: types, tests, budgets, leaks, every scene as a desktop and a phone, the
//      time to playing, Lighthouse and pa11y, against the floors and perf/baseline.json;
//   4. the production build with SITE_URL, its size budgets again, and a look at what would be uploaded;
//   5. the upload with `bunx wrangler deploy` (wrangler.jsonc).
// Options:
//   (none)      the game without the recorded announcements (RECORDINGS=0 in vite.config.ts): they await the rights
//               holder's approval, so every call is spoken by the browser's voice and no clip of the Utrop library is
//               built or uploaded (the free recordings of people in audio/sfx/ are). The whole gate runs on that build.
//   --with-recordings   the game with them, once they are cleared.
//   --landing   the landing page alone, without the game (LANDING_ONLY=1 in vite.config.ts): the game, the network view,
//               the physics and every recording are neither built nor uploaded, and the page says the game opens
//               soon. The gate is the quick one and the landing page's audits, on that build.
//   --dry-run   everything but the upload.
// The Worker (worker/, wrangler.jsonc) goes up with every deploy: the hub behind /ghosts, /feeds, /notes, /perf, /errors and
// /perf. Its secrets are set once, apart: `bunx wrangler secret put TRAFIKLAB_RT_KEY` (and TRAFIKLAB_STATIC_KEY,
// NOTES_ADMIN_TOKEN); see docs/DRIFT.md.
// Agents may not deploy any other way: a Claude Code hook blocks deploy commands run directly (scripts/hooks).

import { readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dir, '..');
const dist = join(root, 'dist');
const DRY = process.argv.includes('--dry-run');
const LANDING = process.argv.includes('--landing');
const WITH_RECORDINGS = process.argv.includes('--with-recordings') && !LANDING;

async function sh(cmd: string[], env: Record<string, string> = {}, quiet = false): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(cmd, { cwd: root, env: { ...process.env, ...env }, stdout: quiet ? 'pipe' : 'inherit', stderr: quiet ? 'pipe' : 'inherit' });
  const out = quiet ? (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text()) : '';
  return { code: await proc.exited, out: out.trim() };
}

function stop(message: string): never {
  console.error(`\nNot deployed: ${message}`);
  process.exit(1);
}

/** Stops unless the tree is clean and HEAD is `commit` (when given): nothing may change between the gate and the upload. */
async function clean(commit?: string): Promise<string> {
  const dirty = (await sh(['git', 'status', '--porcelain'], {}, true)).out;
  if (dirty) stop(`the working tree has changes (commit or stash them first):\n${dirty}`);
  const head = (await sh(['git', 'rev-parse', '--short', 'HEAD'], {}, true)).out;
  if (commit && head !== commit) stop(`HEAD moved from ${commit} to ${head} during the deploy.`);
  return head;
}

// 1. What is deployed is what is committed and pushed.
const commit = await clean();
if ((await sh(['git', 'fetch', '--quiet', 'origin', 'main'], {}, true)).code !== 0) stop('could not reach origin to check that HEAD is pushed.');
if ((await sh(['git', 'merge-base', '--is-ancestor', 'HEAD', 'origin/main'], {}, true)).code !== 0) stop('HEAD is not on origin/main. Push it first (the pre-push gate runs), then deploy.');

// 2. The real address: the game's domain (wrangler.jsonc's routes), unless SITE_URL says otherwise.
const SITE_URL = (process.env.SITE_URL ?? 'https://understockholm.com/').replace(/\/?$/, '/');
if (!/^https:\/\/[^/]+\/$/.test(SITE_URL)) stop('SITE_URL must be the site\'s https address, for example SITE_URL=https://understockholm.com/ bun run deploy.');
const shape: Record<string, string> = LANDING ? { LANDING_ONLY: '1' } : WITH_RECORDINGS ? {} : { RECORDINGS: '0' };
const buildEnv: Record<string, string> = { SITE_URL, ...shape };
const what = LANDING ? ', the landing page alone' : WITH_RECORDINGS ? ', the game with the recorded announcements' : ', the game without the recorded announcements';

// 3. The gate.
console.log(`\n==== Deploying ${commit} to ${SITE_URL}${what}${DRY ? ' (dry run)' : ''}: the gate first`);
const gate = LANDING ? ['bun', 'scripts/check.ts', '--web'] : ['bun', 'scripts/check.ts'];
if ((await sh(gate, shape)).code !== 0) stop('the quality gate failed (see above). Fix it, or accept a change that is meant to cost with `bun run check --perf --accept` and commit the baseline.');

// 4. The build that goes out, with the real address, from the same commit.
await clean(commit);
console.log('\n==== Production build');
if ((await sh(['bunx', 'vite', 'build'], buildEnv)).code !== 0 || (await sh(['bun', 'scripts/check-budgets.ts'])).code !== 0) stop('the production build failed.');
// Taken out of dist/ before the upload, which sends whatever is there: the build manifest (read by the budgets) and
// Finder's litter. Removed rather than listed in an .assetsignore, so there is nothing to misread. The recordings
// that may not go out are left out by the build itself (vite.config.ts) and checked below.
rmSync(join(dist, '.vite'), { recursive: true, force: true });
const files = (function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === '.DS_Store') { rmSync(path); return []; }
    return statSync(path).isDirectory() ? walk(path) : [relative(dist, path)];
  });
})(dist);
if (LANDING) {
  // Nothing of the game may slip out: its code, the physics binary or a recording.
  const game = files.filter((f) => /\.(mp3|wasm)$/.test(f) || /^assets\/(boot|rapier|physics|silverpilen|view)-/.test(f));
  if (game.length) stop(`the landing page alone would upload the game's files: ${game.join(', ')}`);
} else if (!WITH_RECORDINGS) {
  // Of the audio, only the free recordings of people (audio/sfx/) may go out.
  const clips = files.filter((f) => f.startsWith('audio/') && !f.startsWith('audio/sfx/'));
  if (clips.length) stop(`the game without the recordings would upload ${clips.length} of them: ${clips.slice(0, 5).join(', ')}...`);
}
console.log(`${files.length} files to upload${LANDING ? ', none of them the game\'s' : WITH_RECORDINGS ? '' : ', none of them a recorded announcement'}.`);

// 5. The upload.
if (DRY) {
  console.log(`\nDry run: ${commit} passed the gate and dist/ is built for ${SITE_URL}. Nothing was uploaded.`);
  process.exit(0);
}
await clean(commit);
console.log('\n==== Upload');
if ((await sh(['bunx', 'wrangler', 'deploy'])).code !== 0) stop('wrangler could not upload it.');
console.log(`\nLive: ${commit} at ${SITE_URL}${what}.`);
