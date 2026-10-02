// The hub: one Durable Object that does on Cloudflare what the Bun relay (server/ghosts.ts) does in development, with
// the same answers, so the client cannot tell them apart:
//   /ghosts      other players over a WebSocket (protocol in server/pose.ts)
//   /notes       the shared notes on the staff room boards (GET, POST, DELETE with NOTES_ADMIN_TOKEN)
//   /perf        anonymous performance reports (POST) and what they sum up to (GET, a page in a browser)
//   /errors      errors players met (POST), grouped (GET, a page in a browser)
//   /feeds/<n>   the open data feeds, fetched from their sources only while someone asks (server/feedCore.ts), SL's
//                from GTFS Regional when the Trafiklab keys are set as secrets (server/gtfsFeed.ts)
// One object for the whole game keeps SL's quota and the notes in one place. Notes, reports and the GTFS timetable
// are kept in its SQLite storage, everything else in memory: when it sleeps, nobody is playing.
//
// Requests to Durable Objects are billed, WebSocket messages counted 20 to one. The hub counts what it spends in two
// budgets, so one cannot spend the other: GHOST_BUDGET for other players (sockets and their messages; near it the
// hub closes their sockets until midnight UTC, the game plays on without them and the client waits for midnight) and
// DATA_BUDGET for the feeds, notes and reports (near it they answer 503 until midnight). `off` works for either, but
// leaves no ceiling on that part of the bill. Each address, and each IPv6 /48, also has a share of the day
// (ADDRESS_DAY, BLOCK_DAY in server/limits.ts): past it, the hub refuses it and says so in `x-spent-until`, and the
// Worker (worker/index.ts) then turns it away itself until midnight, so what it sends after costs the hub nothing.

import { DurableObject } from 'cloudflare:workers';
import { cleanNote } from '../src/game/notePhrases';
import { alertFor, ERROR_EVERY_MS, ERROR_KEPT, errorsPage, groupErrors, readError, sendAlert, type AlertLog, type ErrorAggregate, type ErrorReport } from '../server/errorCore';
import { createFeeds, type Feeds } from '../server/feedCore';
import type { Timetable } from '../server/gtfs';
import { gtfsDepartures, type TimetableStore } from '../server/gtfsFeed';
import { aggregate, PERF_EVERY_MS, PERF_KEPT, perfPage, readPerf, type BudgetUse, type PerfAggregate, type PerfReport } from '../server/perfCore';
import { ADDRESS_DAY, addressKey, AGGREGATE_MS, BLOCK_DAY, blockKey, CachedBuild, Cooldown, DayCap, HOUR_MS, NOTE_EVERY_MS, NOTES_PER_HOUR, readBody, untilMidnight, utcDay } from '../server/limits';
import { CLOSE_FLOOD, CLOSE_FULL, CLOSE_SPENT, flooding, hear, IDLE_MS, newPlayer, refill, refused, snapshots, spendMessage, TICK_MS, type Player } from '../server/pose';

export interface Env {
  ASSETS: Fetcher;
  HUB: DurableObjectNamespace;
  /** Per address, for what reaches the hub (worker/index.ts). Absent where the plan has no rate limiting. */
  LIMIT?: RateLimit;
  /** Requests a day other players may spend, or `off` (no ceiling on the bill). */
  GHOST_BUDGET?: string;
  /** Requests a day the feeds, notes and reports may spend, or `off` (unset: no ceiling, as on the free plan). */
  DATA_BUDGET?: string;
  /** Each address's and each IPv6 /48's share of the day, when not ADDRESS_DAY and BLOCK_DAY: set small by `scripts/worker-check.ts`. */
  ADDRESS_DAY?: string;
  BLOCK_DAY?: string;
  /** Set with `bunx wrangler secret put NOTES_ADMIN_TOKEN` to be able to take notes down. */
  NOTES_ADMIN_TOKEN?: string;
  /** Trafiklab's GTFS Regional keys, as secrets: without them the blue line alone follows SL's Transport API. */
  TRAFIKLAB_RT_KEY?: string;
  TRAFIKLAB_STATIC_KEY?: string;
  /** Where a fatal error not seen for a week is posted as plain text (an ntfy.sh topic), as a secret: unset, none is. */
  ALERT_URL?: string;
}

const MAX_NOTES = 200;
const SHOWN_NOTES = 24;
/** Without GHOST_BUDGET: what other players may spend of the free plan's 100 000 requests a day, the rest left to the feeds and the notes. */
const FREE_BUDGET = 90_000;
/** The GTFS timetable is a few MB of JSON; a row holds at most 2 MB. */
const CHUNK = 500_000;

const log = (message: string) => console.warn(message);

/** The header the hub answers with once an address has spent its share of the day: when it may come back (epoch ms). */
export const SPENT_HEADER = 'x-spent-until';
/** ...and whose share it was: `address`, or `block` when its whole IPv6 /48 has spent the block's share. */
export const SPENT_SCOPE_HEADER = 'x-spent-scope';

/** One of the hub's daily budgets: what it has spent today, written to storage now and then so a restart remembers. */
class Budget {
  private day = '';
  used = 0;
  private saved = 0;

  constructor(private readonly key: string, private readonly label: string, readonly limit: number, private readonly storage: DurableObjectStorage) {}

  async load(): Promise<void> {
    const saved = await this.storage.get<{ day: string; used: number }>(this.key);
    if (saved && saved.day === utcDay()) { this.day = saved.day; this.used = this.saved = saved.used; }
  }

  /** Counts `n` billed requests, and says whether there is still room today. */
  spend(n: number): boolean {
    const day = utcDay();
    if (day !== this.day) { this.day = day; this.used = this.saved = 0; }
    const before = this.used;
    this.used += n;
    // A line in Workers Logs as the day passes 80% and 100% of the budget.
    for (const share of [0.8, 1]) {
      const mark = this.limit * share;
      if (before < mark && this.used >= mark) log(`budget: ${share * 100}% of ${this.limit} ${this.label} requests spent on ${day}`);
    }
    if (this.used - this.saved >= 200) {
      this.saved = this.used;
      void this.storage.put(this.key, { day, used: this.used });
    }
    return this.used < this.limit;
  }

  get spent(): boolean {
    return this.day === utcDay() && this.used >= this.limit;
  }

  /** Today's spending, for the /perf page. */
  get use(): BudgetUse {
    return { used: this.day === utcDay() ? this.used : 0, limit: this.limit };
  }
}

/** A socket accepted and closed at once as spent for the day, with a reason the client reads, so it waits for midnight. */
export function spentSocket(headers: Record<string, string> = {}): Response {
  const pair = new WebSocketPair();
  pair[1].accept();
  pair[1].close(CLOSE_SPENT, 'budget');
  return new Response(null, { status: 101, webSocket: pair[0], headers });
}

const budgetOf = (value: string | undefined, unset: number) => (value === 'off' ? Infinity : Number(value) || unset);

export class Hub extends DurableObject<Env> {
  private readonly clients = new Map<WebSocket, Player>();
  private nextId = 1;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private readonly feeds: Feeds;
  private readonly lastNote = new Cooldown(NOTE_EVERY_MS);
  private readonly lastReport = new Cooldown(PERF_EVERY_MS);
  private readonly lastError = new Cooldown(ERROR_EVERY_MS);
  // The aggregate pages read every kept report, so they are rebuilt at most once a minute.
  private readonly perfAggregate = new CachedBuild<PerfAggregate>(AGGREGATE_MS);
  private readonly errorAggregate = new CachedBuild<ErrorAggregate>(AGGREGATE_MS);
  private readonly players: Budget;
  private readonly data: Budget;
  // Each address's and each IPv6 block's share of the day, kept in memory: a restart forgets it, which only forgives.
  private readonly perAddress: DayCap;
  private readonly perBlock: DayCap;
  /** When each group of errors was last alerted, in storage so a restart does not send them again. */
  private readonly alerts: AlertLog;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // The first keeps its old storage key, so today's spending carries over.
    this.players = new Budget('budget', 'other players', budgetOf(env.GHOST_BUDGET, FREE_BUDGET), ctx.storage);
    this.data = new Budget('data-budget', 'feeds, notes and reports', budgetOf(env.DATA_BUDGET, Infinity), ctx.storage);
    this.perAddress = new DayCap(Number(env.ADDRESS_DAY) || ADDRESS_DAY);
    this.perBlock = new DayCap(Number(env.BLOCK_DAY) || BLOCK_DAY);
    const sql = ctx.storage.sql;
    const store: TimetableStore = {
      read: async () => {
        const parts = sql.exec<{ data: string }>('SELECT data FROM blobs WHERE name = ? ORDER BY part', 'gtfs').toArray();
        return parts.length ? JSON.parse(parts.map((p) => p.data).join('')) as Timetable : null;
      },
      write: async (timetable) => {
        const text = JSON.stringify(timetable);
        sql.exec('DELETE FROM blobs WHERE name = ?', 'gtfs');
        for (let i = 0; i * CHUNK < text.length; i++) sql.exec('INSERT INTO blobs (name, part, data) VALUES (?, ?, ?)', 'gtfs', i, text.slice(i * CHUNK, (i + 1) * CHUNK));
      },
    };
    this.alerts = {
      last: (key) => sql.exec<{ at: number }>('SELECT at FROM alerts WHERE key = ?', key).toArray()[0]?.at ?? 0,
      mark: (key, at) => void sql.exec('INSERT OR REPLACE INTO alerts (key, at) VALUES (?, ?)', key, at),
    };
    const keys = env.TRAFIKLAB_RT_KEY && env.TRAFIKLAB_STATIC_KEY ? { realtime: env.TRAFIKLAB_RT_KEY, static: env.TRAFIKLAB_STATIC_KEY } : null;
    this.feeds = createFeeds({ log, gtfs: keys ? gtfsDepartures(keys, store, log) : undefined, waitUntil: (task) => ctx.waitUntil(task) });
    void ctx.blockConcurrencyWhile(async () => {
      sql.exec('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, at INTEGER NOT NULL)');
      sql.exec('CREATE TABLE IF NOT EXISTS perf (at INTEGER NOT NULL, report TEXT NOT NULL)');
      sql.exec('CREATE TABLE IF NOT EXISTS errors (at INTEGER NOT NULL, report TEXT NOT NULL)');
      sql.exec('CREATE TABLE IF NOT EXISTS alerts (key TEXT PRIMARY KEY, at INTEGER NOT NULL)');
      sql.exec('CREATE TABLE IF NOT EXISTS blobs (name TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (name, part))');
      await this.players.load();
      await this.data.load();
    });
  }

  /** Counts `n` billed requests to an address and its block, and says whose share is spent, if either is. */
  private charge(address: string, n = 1): 'address' | 'block' | null {
    const block = blockKey(address);
    const mine = this.perAddress.spend(address, n);
    if (block !== null && !this.perBlock.spend(block, n)) return 'block';
    return mine ? null : 'address';
  }

  /** Whether an address, or its block, has spent today's share. */
  private overShare(address: string): boolean {
    const block = blockKey(address);
    return this.perAddress.spent(address) || (block !== null && this.perBlock.spent(block));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const ip = addressKey(request.headers.get('cf-connecting-ip') ?? '?');
    const ghosts = url.pathname === '/ghosts';
    const within = (ghosts ? this.players : this.data).spend(1);
    const over = this.charge(ip);
    if (over) {
      // Past its share of the day: refused, and the Worker told to turn it away itself until midnight.
      const until = { [SPENT_HEADER]: String(Date.now() + untilMidnight()), [SPENT_SCOPE_HEADER]: over };
      if (ghosts) return spentSocket(until);
      return new Response('Too many requests today', { status: 429, headers: { ...until, 'retry-after': String(Math.ceil(untilMidnight() / 1000)) } });
    }
    if (!within && !ghosts) return new Response('Spent for today', { status: 503, headers: { 'retry-after': String(Math.ceil(untilMidnight() / 1000)) } });
    if (ghosts) return this.ghosts(request, within, ip);
    if (url.pathname === '/notes' || url.pathname.startsWith('/notes/')) return this.notes(request, url, ip);
    if (url.pathname === '/perf') return this.perf(request, ip);
    if (url.pathname === '/errors') return this.errors(request, ip);
    return (await this.feeds.handle(url)) ?? new Response('Not found', { status: 404 });
  }

  // Other players.

  private ghosts(request: Request, within: boolean, ip: string): Response {
    if (request.headers.get('upgrade') !== 'websocket') return new Response('Upgrade required', { status: 426 });
    if (!within) return spentSocket();
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    // Accepted and closed at once, with a reason the client reads, so it waits instead of retrying at once.
    if (refused(this.clients.values(), ip)) { server.close(CLOSE_FULL, 'full'); return new Response(null, { status: 101, webSocket: client }); }
    const me = newPlayer(this.nextId++, ip);
    this.clients.set(server, me);
    server.send(JSON.stringify({ t: 'hello', id: me.id, now: Date.now() }));
    server.addEventListener('message', (event) => {
      // Twenty messages bill as one request, to the budget and to the address; one past its share is closed at the tick.
      if (++me.sent % 20 === 0) { this.players.spend(1); this.charge(ip); }
      if (!spendMessage(me)) {
        // Dropped messages are billed all the same, so a socket that floods is closed rather than ignored.
        if (flooding(me) && this.clients.delete(server)) { try { server.close(CLOSE_FLOOD, 'flood'); } catch { /* Already gone. */ } }
        return;
      }
      hear(me, event.data);
    });
    const gone = () => { this.clients.delete(server); if (!this.clients.size) this.stop(); };
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    // Ticks while anyone is here: setInterval, not alarms, which bill a request and a write each.
    this.ticker ??= setInterval(() => this.tick(), TICK_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  private tick(): void {
    const now = Date.now();
    const spent = this.players.spent;
    for (const [ws, c] of this.clients) {
      const over = spent || this.overShare(c.address);
      if (over || now - c.seen > IDLE_MS) {
        try { ws.close(over ? CLOSE_SPENT : 1000, over ? 'budget' : 'idle'); } catch { /* Already gone. */ }
        this.clients.delete(ws);
      }
    }
    if (!this.clients.size) { this.stop(); return; }
    refill(this.clients.values());
    const out = snapshots([...this.clients.values()], now);
    for (const [ws, c] of this.clients) {
      try { ws.send(out.get(c.id)!); } catch { this.clients.delete(ws); }
    }
  }

  private stop(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  // Notes.

  private async notes(request: Request, url: URL, ip: string): Promise<Response> {
    const sql = this.ctx.storage.sql;
    if (request.method === 'GET') {
      // Notes from before the boards took only phrases (src/game/notePhrases.ts) stay stored but are never shown.
      const notes = sql.exec<{ id: number; text: string; at: number }>('SELECT id, text, at FROM notes ORDER BY id DESC LIMIT ?', MAX_NOTES).toArray().filter((n) => cleanNote(n.text)).slice(0, SHOWN_NOTES);
      return Response.json({ notes });
    }
    if (request.method === 'POST') {
      const now = Date.now();
      if (!this.lastNote.ready(ip, now)) return Response.json({ error: 'slow down' }, { status: 429 });
      const lastHour = sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM notes WHERE at > ?', now - HOUR_MS).one().n;
      if (lastHour >= NOTES_PER_HOUR) return Response.json({ error: 'slow down' }, { status: 429 });
      const raw = await readBody(request);
      if (raw === null) return Response.json({ error: 'too large' }, { status: 413 });
      let body: { text?: unknown } = {};
      try { body = JSON.parse(raw); } catch { /* Empty. */ }
      const text = cleanNote(body.text);
      if (!text) return Response.json({ error: 'not allowed' }, { status: 400 });
      this.lastNote.mark(ip, now);
      const note = sql.exec<{ id: number; text: string; at: number }>('INSERT INTO notes (text, at) VALUES (?, ?) RETURNING id, text, at', text, now).one();
      sql.exec('DELETE FROM notes WHERE id NOT IN (SELECT id FROM notes ORDER BY id DESC LIMIT ?)', MAX_NOTES);
      return Response.json({ note });
    }
    if (request.method === 'DELETE') {
      const token = this.env.NOTES_ADMIN_TOKEN;
      if (!token || request.headers.get('authorization') !== `Bearer ${token}`) return new Response('Forbidden', { status: 403 });
      // DELETE /notes/<id> takes one note down, DELETE /notes?since=<epoch ms> every note put up since then.
      const since = Number(url.searchParams.get('since'));
      if (url.pathname === '/notes' && url.searchParams.has('since') && Number.isFinite(since)) sql.exec('DELETE FROM notes WHERE at >= ?', since);
      else sql.exec('DELETE FROM notes WHERE id = ?', Number(url.pathname.split('/')[2]));
      return new Response(null, { status: 204 });
    }
    return new Response('Method not allowed', { status: 405 });
  }

  // Performance reports.

  private async perf(request: Request, ip: string): Promise<Response> {
    const sql = this.ctx.storage.sql;
    if (request.method === 'GET') {
      const data = this.perfAggregate.get(() => {
        const reports = sql.exec<{ report: string }>('SELECT report FROM perf ORDER BY at ASC').toArray().map((r) => JSON.parse(r.report) as PerfReport);
        return aggregate(reports);
      });
      const budgets = { players: this.players.use, data: this.data.use };
      if (request.headers.get('accept')?.includes('text/html')) return new Response(perfPage(data, budgets), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      const json = ({ used, limit }: BudgetUse) => ({ used, limit: Number.isFinite(limit) ? limit : null });
      return Response.json({ ...data, budget: json(budgets.players), dataBudget: json(budgets.data) });
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const now = Date.now();
    if (!this.lastReport.ready(ip, now)) return new Response(null, { status: 429 });
    const body = await readBody(request);
    if (body === null) return new Response(null, { status: 413 });
    const report = readPerf(body, now);
    if (!report) return new Response(null, { status: 400 });
    this.lastReport.mark(ip, now);
    sql.exec('INSERT INTO perf (at, report) VALUES (?, ?)', now, JSON.stringify(report));
    // Kept to the last PERF_KEPT, trimmed now and then rather than on every report.
    if (Math.random() < 0.02) sql.exec('DELETE FROM perf WHERE rowid NOT IN (SELECT rowid FROM perf ORDER BY at DESC LIMIT ?)', PERF_KEPT);
    return new Response(null, { status: 204 });
  }

  // Error reports.

  private async errors(request: Request, ip: string): Promise<Response> {
    const sql = this.ctx.storage.sql;
    if (request.method === 'GET') {
      const data = this.errorAggregate.get(() => {
        const reports = sql.exec<{ report: string }>('SELECT report FROM errors ORDER BY at ASC').toArray().map((r) => JSON.parse(r.report) as ErrorReport);
        return groupErrors(reports);
      });
      if (request.headers.get('accept')?.includes('text/html')) return new Response(errorsPage(data), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      return Response.json(data);
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const now = Date.now();
    if (!this.lastError.ready(ip, now)) return new Response(null, { status: 429 });
    const body = await readBody(request);
    if (body === null) return new Response(null, { status: 413 });
    const report = readError(body, now);
    if (!report) return new Response(null, { status: 400 });
    this.lastError.mark(ip, now);
    sql.exec('INSERT INTO errors (at, report) VALUES (?, ?)', now, JSON.stringify(report));
    const alert = this.env.ALERT_URL ? alertFor(report, this.alerts) : null;
    if (alert) this.ctx.waitUntil(sendAlert(this.env.ALERT_URL!, alert, new URL('/errors', request.url).href, log));
    // Kept to the last ERROR_KEPT, trimmed now and then rather than on every report.
    if (Math.random() < 0.05) sql.exec('DELETE FROM errors WHERE rowid NOT IN (SELECT rowid FROM errors ORDER BY at DESC LIMIT ?)', ERROR_KEPT);
    return new Response(null, { status: 204 });
  }
}
