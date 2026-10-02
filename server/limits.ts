// Limits per address, on what a request may carry and on how often a dear answer is rebuilt, shared by the Bun
// relay (server/ghosts.ts, perf.ts, errors.ts) and the hub on Cloudflare (worker/). Runs on both, so no Bun APIs.
//
// An address is what a limit is kept against: IPv4 as it is, IPv6 by its /64, the block one home or phone is handed,
// so taking a new address from the same block is not being someone new.

/** The largest body a note or a report may have; the game sends well under a kilobyte. */
export const MAX_BODY = 16_384;
/** A note per address at most this often... */
export const NOTE_EVERY_MS = 90_000;
/** ...and at most this many an hour from everyone together, so many addresses cannot fill the boards either. */
export const NOTES_PER_HOUR = 30;
export const HOUR_MS = 3_600_000;

/** The key limits are kept against for an address: IPv4 as it is, IPv6 by its /64. */
export function addressKey(ip: string): string {
  const address = ip.trim().toLowerCase().replace(/%.*$/, '');
  if (!address.includes(':')) return address;
  // IPv4 mapped into IPv6 (::ffff:1.2.3.4) is the IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped) return mapped[1];
  const [head, tail] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/** A request's body as text, or null when it is larger than `max`: never read further than that, whatever it claims. */
export async function readBody(request: Request, max = MAX_BODY): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { reader.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const part of parts) { all.set(part, at); at += part.byteLength; }
  return new TextDecoder().decode(all);
}

/**
 * One thing per key every `every` ms (a note, a report). A key is remembered only that long: the oldest are let go
 * as new ones come, so neither many addresses nor a long uptime make it grow, and nobody's wait is ever reset.
 */
export class Cooldown {
  private readonly last = new Map<string, number>();

  constructor(private readonly every: number) {}

  /** Whether `key` may go now. */
  ready(key: string, now = Date.now()): boolean {
    return now - (this.last.get(key) ?? -Infinity) >= this.every;
  }

  /** Counts one for `key`. */
  mark(key: string, now = Date.now()): void {
    // Deleted first so the map stays in the order things happened, oldest first.
    this.last.delete(key);
    this.last.set(key, now);
    for (const [k, at] of this.last) {
      if (now - at < this.every) break;
      this.last.delete(k);
    }
  }

  get size(): number {
    return this.last.size;
  }
}

/** The aggregate pages (/perf, /errors) are rebuilt at most this often: each build reads every kept report. */
export const AGGREGATE_MS = 60_000;

/**
 * A dear answer, built at most once every `every` ms; asks in between get the last build. A new report may take
 * that long to show on the pages, which nobody minds.
 */
export class CachedBuild<T> {
  private at = -Infinity;
  private value: T | null = null;

  constructor(private readonly every: number) {}

  /** The value, freshly built when the last build is older than `every`. */
  get(build: () => T, now = Date.now()): T {
    if (this.value === null || now - this.at >= this.every) {
      this.value = build();
      this.at = now;
    }
    return this.value;
  }
}

/**
 * What one address may cost the hub in a day, in billed requests (a request, or twenty socket messages), and what
 * one IPv6 /48 may cost together: a busy classroom or a mobile operator's shared address stays well under both, while
 * the per-minute limit alone lets an address spend some 170 000 a day, and its sockets as much again. An address past
 * either is refused until midnight UTC, so a handful of addresses cannot spend the day's budget for everyone.
 */
export const ADDRESS_DAY = 30_000;
export const BLOCK_DAY = 200_000;
/** Addresses a day's count holds before newcomers share one count (only a flood of distinct blocks gets there). */
export const DAY_KEYS = 100_000;
export const DAY_MS = 86_400_000;

/** The IPv6 /48 an address key (addressKey) lies in, or null for IPv4, which has no block of its own. */
export function blockKey(address: string): string | null {
  if (!address.endsWith('::/64')) return null;
  return `${address.slice(0, -'::/64'.length).split(':').slice(0, 3).join(':')}::/48`;
}

/** The UTC day `now` falls on, as the hub's budgets count it. */
export const utcDay = (now = Date.now()): string => new Date(now).toISOString().slice(0, 10);

/** Milliseconds from `now` to the next midnight UTC, when every day's count starts over. */
export const untilMidnight = (now = Date.now()): number => DAY_MS - (now % DAY_MS);

/**
 * What each key has cost today, against `limit`. Starts over at midnight UTC. Past `DAY_KEYS` keys a day, new keys
 * share one count, so distinct addresses cannot make it grow without end: the day then behaves as one budget for
 * everyone new, as it did before there was one per address.
 */
export class DayCap {
  private day = '';
  private readonly used = new Map<string, number>();

  constructor(private readonly limit: number, private readonly keys = DAY_KEYS) {}

  private count(key: string, now: number): string {
    const day = utcDay(now);
    if (day !== this.day) { this.day = day; this.used.clear(); }
    return this.used.has(key) || this.used.size < this.keys ? key : '*';
  }

  /** Counts `n` for `key`, and says whether it is still within today's limit. */
  spend(key: string, n = 1, now = Date.now()): boolean {
    const k = this.count(key, now);
    const used = (this.used.get(k) ?? 0) + n;
    this.used.set(k, used);
    return used <= this.limit;
  }

  /** Whether `key` has spent today's limit, without counting anything. */
  spent(key: string, now = Date.now()): boolean {
    return (this.used.get(this.count(key, now)) ?? 0) >= this.limit;
  }

  get size(): number {
    return this.used.size;
  }
}

/**
 * Whether a browser on another site sent this: its Origin names a host other than the one asked. Another site's page
 * could otherwise open sockets or post notes and reports from its visitors' browsers, each on their own address and
 * share. A request without an Origin is not from a page (browsers send one with every socket and POST) and is let be:
 * the limits per address hold those.
 */
export function foreignOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}
