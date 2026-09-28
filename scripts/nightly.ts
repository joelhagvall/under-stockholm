// The whole quality gate every night, on this Mac, so the pushes can stay quick: `bun run nightly`.
// Switched off for now: the LaunchAgent is not installed. `bun run nightly` still runs one night by hand.
// It checks out what was last pushed (origin/main, or main without a network) into a worktree of its own, so work in
// progress never counts, runs `bun scripts/check.ts` there with nothing left out (leaks, every scene as a desktop and
// a phone, the time to playing, Lighthouse and pa11y) against the committed baseline, and keeps awake while it runs.
// Each night is added to perf/history.jsonl (not committed) and a notification says how it went. launchd runs it:
//   bun run nightly --install [--at 03:00]   a LaunchAgent that runs it every night (a Mac asleep then runs it on waking)
//   bun run nightly --uninstall              takes it away again
//   bun run nightly --trend [nights]         the last nights side by side, to see a slow slide coming
//   bun run nightly                          one run now
// The output of each run goes to perf/nightly.log.

import { existsSync, mkdirSync, rmSync, unlinkSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const HISTORY = join(root, 'perf/history.jsonl');
const LOG = join(root, 'perf/nightly.log');
const LABEL = 'se.under-stockholm.nightly';
const PLIST = join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
const TREE = join(tmpdir(), 'under-stockholm-nightly');
const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

/** Runs a command and returns its exit code and output. */
async function sh(cmd: string[], cwd = root, quiet = false): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const code = await proc.exited;
  if (!quiet && code !== 0) console.error(`${cmd.join(' ')} failed:\n${(out + err).trim()}`);
  return { code, out: (out + err).trim() };
}

function notify(title: string, message: string): void {
  const quote = (s: string) => `"${s.replace(/["\\]/g, '')}"`;
  Bun.spawnSync(['osascript', '-e', `display notification ${quote(message)} with title ${quote(title)}`]);
}

interface Night {
  at: string;
  commit: string;
  passed: boolean;
  failures: string[];
  fps?: Record<string, Record<string, { fps: number; p95: number; hitches: number; worst: number; calls: number }>>;
  load?: Record<string, { readyS: number; bytes: number }>;
  web?: Record<string, Record<string, number>>;
}

/** One night as a row of the numbers that matter: the weakest scene per profile, loading and the audits. */
function row(n: Night): string[] {
  const worst = (profile: string) => {
    const scenes = Object.values(n.fps?.[profile] ?? {});
    if (!scenes.length) return ['-', '-', '-'];
    return [String(Math.min(...scenes.map((s) => s.fps))), String(Math.max(...scenes.map((s) => s.p95))), String(scenes.reduce((sum, s) => sum + s.hitches, 0))];
  };
  const audits = Object.values(n.web ?? {}).flatMap((w) => Object.entries(w).filter(([k]) => k !== 'pa11yErrors').map(([, v]) => v));
  return [
    n.at.slice(0, 16).replace('T', ' '), n.commit, n.passed ? 'ok' : `${n.failures.length} fail`,
    ...worst('desktop'), ...worst('phone'),
    n.load?.desktop ? n.load.desktop.readyS.toFixed(1) : '-', n.load?.phone ? n.load.phone.readyS.toFixed(1) : '-',
    audits.length ? String(Math.min(...audits)) : '-',
  ];
}

async function trend(nights: number): Promise<void> {
  if (!existsSync(HISTORY)) {
    console.log('No nights yet: perf/history.jsonl is written by `bun run nightly`.');
    return;
  }
  const all = (await Bun.file(HISTORY).text()).split('\n').filter(Boolean).map((l) => JSON.parse(l) as Night).slice(-nights);
  const head = ['night (UTC)', 'commit', 'result', 'desk fps', 'desk p95', 'desk >50', 'phone fps', 'phone p95', 'phone >50', 'load desk', 'load phone', 'audits'];
  const rows = [head, ...all.map(row)];
  const widths = head.map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  for (const r of rows) console.log(r.map((c, i) => c.padEnd(widths[i])).join('  '));
  console.log('\nThe weakest scene per profile: lowest fps, highest 95th percentile in ms, frames over 50 ms summed over scenes.');
}

async function install(): Promise<void> {
  const [hour, minute] = arg('at', '03:00').split(':').map(Number);
  if (!(hour >= 0 && hour < 24 && minute >= 0 && minute < 60)) throw new Error('--at wants a time like 03:00');
  const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // The link on the PATH, not the binary it points at: Homebrew moves that on every upgrade.
  const bun = Bun.which('bun') ?? process.execPath;
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(bun)}</string><string>${xml(join(root, 'scripts/nightly.ts'))}</string></array>
  <key>WorkingDirectory</key><string>${xml(root)}</string>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${xml(process.env.PATH ?? '/usr/bin:/bin')}</string><key>HOME</key><string>${xml(homedir())}</string></dict>
  <key>StandardOutPath</key><string>${xml(LOG)}</string>
  <key>StandardErrorPath</key><string>${xml(LOG)}</string>
</dict>
</plist>
`;
  mkdirSync(join(homedir(), 'Library/LaunchAgents'), { recursive: true });
  await Bun.write(PLIST, plist);
  const domain = `gui/${process.getuid!()}`;
  await sh(['launchctl', 'bootout', `${domain}/${LABEL}`], root, true);
  const loaded = await sh(['launchctl', 'bootstrap', domain, PLIST]);
  if (loaded.code !== 0) throw new Error('launchctl could not load the job');
  console.log(`Installed: the whole gate runs every night at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} (${PLIST}). Output in perf/nightly.log, results with \`bun run nightly --trend\`.`);
}

async function uninstall(): Promise<void> {
  await sh(['launchctl', 'bootout', `gui/${process.getuid!()}/${LABEL}`], root, true);
  if (existsSync(PLIST)) unlinkSync(PLIST);
  console.log('The nightly run is gone.');
}

async function night(): Promise<void> {
  console.log(`\n==== ${new Date().toISOString()} nightly`);
  // What was pushed, not what is on the desk.
  const fetched = await sh(['git', 'fetch', '--quiet', 'origin', 'main'], root, true);
  const ref = fetched.code === 0 ? 'origin/main' : 'main';
  await sh(['git', 'worktree', 'remove', '--force', TREE], root, true);
  rmSync(TREE, { recursive: true, force: true });
  await sh(['git', 'worktree', 'prune'], root, true);
  let night: Night;
  try {
    if ((await sh(['git', 'worktree', 'add', '--detach', TREE, ref])).code !== 0) throw new Error(`could not check out ${ref}`);
    if ((await sh(['bun', 'install', '--frozen-lockfile'], TREE)).code !== 0) throw new Error('bun install failed');
    // Kept awake for the run, however long it takes; the output goes on to perf/nightly.log.
    const check = Bun.spawn(['caffeinate', '-i', 'bun', 'scripts/check.ts'], { cwd: TREE, stdout: 'inherit', stderr: 'inherit' });
    await check.exited;
    const last = join(TREE, 'perf/last-run.json');
    if (!existsSync(last)) throw new Error('the gate wrote no result');
    const run = await Bun.file(last).json() as Night & { scope: unknown; mem: unknown };
    night = { at: run.at, commit: run.commit, passed: run.passed, failures: run.failures, fps: run.fps, load: run.load, web: run.web };
  } catch (err) {
    night = { at: new Date().toISOString(), commit: ref, passed: false, failures: [`the run itself: ${(err as Error).message}`] };
  } finally {
    await sh(['git', 'worktree', 'remove', '--force', TREE], root, true);
  }
  const file = Bun.file(HISTORY);
  await Bun.write(HISTORY, (await file.exists() ? await file.text() : '') + JSON.stringify(night) + '\n');
  if (night.passed) notify('Under Stockholm: the night went well', `All gates passed on ${night.commit}.`);
  else notify(`Under Stockholm: ${night.failures.length} problem${night.failures.length > 1 ? 's' : ''} overnight`, `${night.failures[0]}. See perf/nightly.log.`);
  console.log(night.passed ? 'Passed.' : `Failed:\n  ${night.failures.join('\n  ')}`);
}

if (args.includes('--install')) await install();
else if (args.includes('--uninstall')) await uninstall();
else if (args.includes('--trend')) await trend(Number(arg('trend', '14')) || 14);
else await night();
