// The Worker and the hub together, as Cloudflare runs them: `bun scripts/worker-check.ts`, part of `bun run check`'s
// quick gates (after the build, which the Worker's static assets need). It starts `wrangler dev` with each address's
// share of the day and both budgets set small, and walks what docs/DRIFT.md section 3 promises: an address past its share
// is refused by the hub, which says so, and then by the Worker alone; sockets and their messages count; an IPv6 /48
// is one block; and the players' budget and the feeds', notes' and reports' cannot spend each other.
// Every scenario uses addresses of its own, as the counts are kept per address for the whole run.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const probe = Bun.serve({ port: 0, fetch: () => new Response() });
const port = probe.port!;
probe.stop(true);
const base = `http://localhost:${port}`;
const state = mkdtempSync(join(tmpdir(), 'worker-check-'));
const vars = { ADDRESS_DAY: 3, BLOCK_DAY: 4, GHOST_BUDGET: 40, DATA_BUDGET: 60 };
const wrangler = Bun.spawn(
  ['bunx', 'wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', state, '--show-interactive-dev-session=false', '--log-level', 'warn',
    ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`])],
  // Its log (sockets the checks close while the hub still talks, the budget lines) is shown only if something failed.
  { cwd: root, stdout: 'ignore', stderr: 'pipe' },
);
const log = new Response(wrangler.stderr).text();

const failures: string[] = [];
function expect(what: string, actual: unknown, wanted: unknown): void {
  const ok = actual === wanted;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : `: got ${String(actual)}, wanted ${String(wanted)}`}`);
  if (!ok) failures.push(what);
}

/** A GET from `ip`: its status and whether the hub (rather than the Worker) said the address is spent, and whose. */
async function get(path: string, ip: string): Promise<{ status: number; scope: string | null }> {
  const r = await fetch(`${base}${path}`, { headers: { 'cf-connecting-ip': ip, accept: 'application/json' } });
  await r.arrayBuffer();
  return { status: r.status, scope: r.headers.get('x-spent-scope') };
}

/** A socket from `ip`: 'hello' when it was let in, else the code it was closed with. Sends `messages` poses first. */
function socket(ip: string, messages = 0): Promise<string> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}/ghosts`, { headers: { 'cf-connecting-ip': ip } } as unknown as string[]);
    let hello = false;
    ws.onmessage = async (event) => {
      if (!String(event.data).includes('hello')) return;
      hello = true;
      if (!messages) { ws.close(); return; }
      // Within the per-socket rate (server/pose.ts), so only the day's share can close it.
      for (let i = 0; i < messages; i++) {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ t: 'p', p: [1, 1, 1, 0, -1, 0, 0] }));
        if (i % 8 === 7) await Bun.sleep(550);
      }
      setTimeout(() => ws.close(), 1500);
    };
    ws.onclose = (event) => resolve(event.code === 4000 ? '4000' : hello ? 'hello' : String(event.code));
    ws.onerror = () => {};
  });
}

try {
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    try { up = (await fetch(`${base}/notes`, { headers: { 'cf-connecting-ip': '192.0.2.250' } })).ok; } catch { await Bun.sleep(250); }
  }
  if (!up) throw new Error('wrangler dev did not come up');

  console.log('an address past its share');
  for (let i = 1; i <= 3; i++) expect(`request ${i} is let through`, (await get('/notes', '203.0.113.1')).status, 200);
  const fourth = await get('/notes', '203.0.113.1');
  expect('the next is refused', fourth.status, 429);
  expect('...by the hub, which names the address', fourth.scope, 'address');
  const fifth = await get('/notes', '203.0.113.1');
  expect('and after that refused', fifth.status, 429);
  expect('...by the Worker alone', fifth.scope, null);
  expect('another address is let through', (await get('/notes', '203.0.113.2')).status, 200);
  expect('feeds count too', (await get('/feeds/weather', '203.0.113.1')).status, 429);

  console.log('sockets');
  for (let i = 1; i <= 3; i++) expect(`socket ${i} is let in`, await socket('203.0.113.3'), 'hello');
  expect('the next is closed as spent, by the hub', await socket('203.0.113.3'), '4000');
  expect('and the one after, by the Worker', await socket('203.0.113.3'), '4000');
  // One request for the socket, then one per twenty messages: past a share of three after 60.
  expect('messages count against the address', await socket('203.0.113.4', 80), '4000');
  expect('a socket that sends little stays', await socket('203.0.113.5', 30), 'hello');

  console.log('an IPv6 /48 is one block');
  for (const [i, ip] of ['2001:db8:9:1::1', '2001:db8:9:1::2', '2001:db8:9:2::1', '2001:db8:9:2::2'].entries()) expect(`request ${i + 1} from the block is let through`, (await get('/notes', ip)).status, 200);
  const fromBlock = await get('/notes', '2001:db8:9:3::1');
  expect('a new /64 in the spent block is refused', fromBlock.status, 429);
  expect('...by the hub, which names the block', fromBlock.scope, 'block');
  const again = await get('/notes', '2001:db8:9:4::1');
  expect('and another /64 of it by the Worker', again.status === 429 && again.scope === null, true);
  expect('another block is let through', (await get('/notes', '2001:db8:a:1::1')).status, 200);

  console.log('the two budgets');
  let spent = '';
  for (let i = 0; i < 60 && spent !== '4000'; i++) spent = await socket(`198.51.100.${i + 1}`);
  expect('other players stop once their budget is spent', spent, '4000');
  expect('...while notes go on', (await get('/notes', '198.18.0.1')).status, 200);
  let status = 200;
  for (let i = 0; i < 80 && status === 200; i++) status = (await get('/notes', `198.18.1.${i + 1}`)).status;
  expect('notes stop once the feeds\', notes\' and reports\' budget is spent', status, 503);
  const perf = await (await fetch(`${base}/perf`, { headers: { accept: 'application/json', 'cf-connecting-ip': '198.18.2.1' } })).json().catch(() => null);
  // Past its budget /perf answers 503 too; the page itself is checked in tests/perf.test.ts.
  expect('/perf is spent with the rest', perf, null);
} catch (error) {
  failures.push(String(error));
  console.log(`  FAIL ${String(error)}`);
} finally {
  wrangler.kill();
  await wrangler.exited;
  rmSync(state, { recursive: true, force: true });
}

if (failures.length) {
  console.log(`\nwrangler dev said:\n${await log}`);
  console.log(`\n${failures.length} of the Worker's promises broken.`);
  process.exit(1);
}
console.log('\nThe Worker and the hub keep every limit.');
