// The feeds' own Durable Object: /feeds/<name> on Cloudflare, the open data feeds fetched from their sources only while
// someone asks (server/feedCore.ts), SL's from GTFS Regional when the Trafiklab keys are set as secrets
// (server/gtfsFeed.ts). Apart from the hub (worker/hub.ts), so the day's GTFS download and the parsing of each
// realtime fetch never hold up other players' ticks, a restart of one leaves the other running, and each has a
// Durable Object's 128 MB to itself. One object for everyone keeps SL's quota in one place. The GTFS timetable is kept
// in its SQLite storage, everything else in memory.
//
// It counts what it is billed for in a budget of its own, FEED_BUDGET (near it the feeds answer 503 until midnight UTC
// and the game keeps to the timetable), and each address's share of the day as the hub does (worker/budget.ts). Few
// requests reach it: each data center's cache answers a feed for as long as it is fresh (worker/index.ts).
//
// Unlike the hub it can hibernate between requests: no sockets and no timers, so it is billed only while it answers or
// fetches.

import { DurableObject } from 'cloudflare:workers';
import { sendAlert } from '../server/errorCore';
import { createFeeds, type Feeds } from '../server/feedCore';
import type { Timetable } from '../server/gtfs';
import { gtfsDepartures, type GtfsFeed, type StaticTry, type TimetableStatus, type TimetableStore } from '../server/gtfsFeed';
import { addressKey } from '../server/limits';
import type { BudgetUse } from '../server/perfCore';
import { Budget, budgetOf, log, Shares, spentAddress, spentBudget } from './budget';
import type { Env } from './hub';

/** The GTFS timetable is a few MB of JSON; a row holds at most 2 MB. */
const CHUNK = 500_000;
/** Asked by the hub for the /perf page; never reachable from outside, as the Worker passes only /feeds/<name> on. */
const USE_PATH = '/.use';

/**
 * The one object, near the sources and most players. A hint only matters when the object is first made: without it, it
 * would settle wherever the first request came from, a crawler abroad as likely as a player.
 */
const stub = (env: Env) => env.FEEDS.get(env.FEEDS.idFromName('feeds'), { locationHint: 'weur' });

/** Passes a feed request on to the object. */
export const toFeeds = (env: Env, request: Request) => stub(env).fetch(request);

/** Today's spending against FEED_BUDGET and SL's timetable (null without the keys), or null if the object did not answer. */
export async function feedUse(env: Env, origin: string): Promise<{ budget: BudgetUse; timetable: TimetableStatus | null } | null> {
  try {
    const answer = await stub(env).fetch(new Request(`${origin}${USE_PATH}`));
    if (!answer.ok) return null;
    const { used, limit, timetable } = await answer.json() as { used: number; limit: number | null; timetable?: TimetableStatus | null };
    return { budget: { used, limit: limit ?? Infinity }, timetable: timetable ?? null };
  } catch {
    return null;
  }
}

export class FeedHub extends DurableObject<Env> {
  private readonly feeds: Feeds;
  private readonly budget: Budget;
  private readonly shares: Shares;
  private readonly gtfs: GtfsFeed | undefined;
  /** The site's origin, from the last request: an alert links to its /perf page. */
  private origin: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.budget = new Budget('feed-budget', 'feeds', budgetOf(env.FEED_BUDGET, Infinity), ctx.storage);
    this.shares = new Shares(env);
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
      readTry: async () => {
        const row = sql.exec<{ data: string }>('SELECT data FROM blobs WHERE name = ?', 'gtfs-try').toArray()[0];
        return row ? JSON.parse(row.data) as StaticTry : null;
      },
      writeTry: async (attempt) => {
        sql.exec('INSERT OR REPLACE INTO blobs (name, part, data) VALUES (?, 0, ?)', 'gtfs-try', JSON.stringify(attempt));
      },
    };
    const keys = env.TRAFIKLAB_RT_KEY && env.TRAFIKLAB_STATIC_KEY ? { realtime: env.TRAFIKLAB_RT_KEY, static: env.TRAFIKLAB_STATIC_KEY } : null;
    const alertUrl = env.ALERT_URL;
    // An outage of SL's feed is told where a crash is (ALERT_URL), linking to /perf, which shows the feeds.
    const alert = alertUrl ? (title: string, text: string) => ctx.waitUntil(sendAlert(alertUrl, text, this.origin ? `${this.origin}/perf` : null, log, title)) : undefined;
    this.gtfs = keys ? gtfsDepartures(keys, store, log) : undefined;
    this.feeds = createFeeds({ log, alert, gtfs: this.gtfs, waitUntil: (task) => ctx.waitUntil(task) });
    void ctx.blockConcurrencyWhile(async () => {
      sql.exec('CREATE TABLE IF NOT EXISTS blobs (name TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (name, part))');
      await this.budget.load();
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.origin = url.origin;
    if (url.pathname === USE_PATH) {
      const { used, limit } = this.budget.use;
      const timetable = this.gtfs ? await this.gtfs.status() : null;
      return Response.json({ used, limit: Number.isFinite(limit) ? limit : null, timetable });
    }
    const within = this.budget.spend(1);
    const over = this.shares.charge(addressKey(request.headers.get('cf-connecting-ip') ?? '?'));
    if (over) return spentAddress(over);
    if (!within) return spentBudget();
    return (await this.feeds.handle(url)) ?? new Response('Not found', { status: 404 });
  }
}
