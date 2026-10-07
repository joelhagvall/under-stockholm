// What both Durable Objects count before they answer (worker/hub.ts, worker/feeds.ts): their daily budgets, each
// address's and each IPv6 /48's share of the day, and how they say an address has spent it (docs/DRIFT.md, section 3).
import { ADDRESS_DAY, BLOCK_DAY, blockKey, DayCap, untilMidnight, utcDay } from '../server/limits';
import type { BudgetUse } from '../server/perfCore';

/** A warning in Workers Logs, as JSON so it can be searched: its `message` is what `bun run logs` groups by. */
export const log = (message: string) => console.warn(JSON.stringify({ message }));

/** The header an object answers with once an address has spent its share of the day: when it may come back (epoch ms). */
export const SPENT_HEADER = 'x-spent-until';
/** ...and whose share it was: `address`, or `block` when its whole IPv6 /48 has spent the block's share. */
export const SPENT_SCOPE_HEADER = 'x-spent-scope';

export type Scope = 'address' | 'block';

/** A budget's limit from its var: `off` is no ceiling, unset is `unset`. */
export const budgetOf = (value: string | undefined, unset: number) => (value === 'off' ? Infinity : Number(value) || unset);

/** One of the daily budgets: what it has spent today, written to storage now and then so a restart remembers. */
export class Budget {
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

/**
 * Each address's and each IPv6 /48's share of the day, kept in memory: a restart forgets it, which only forgives. Each
 * object keeps its own, and the Worker turns an address away from both once either says it is spent.
 */
export class Shares {
  private readonly perAddress: DayCap;
  private readonly perBlock: DayCap;

  constructor(env: { ADDRESS_DAY?: string; BLOCK_DAY?: string }) {
    this.perAddress = new DayCap(Number(env.ADDRESS_DAY) || ADDRESS_DAY);
    this.perBlock = new DayCap(Number(env.BLOCK_DAY) || BLOCK_DAY);
  }

  /** Counts `n` billed requests to an address and its block, and says whose share is spent, if either is. */
  charge(address: string, n = 1): Scope | null {
    const block = blockKey(address);
    const mine = this.perAddress.spend(address, n);
    if (block !== null && !this.perBlock.spend(block, n)) return 'block';
    return mine ? null : 'address';
  }

  /** Whether an address, or its block, has spent today's share. */
  over(address: string): boolean {
    const block = blockKey(address);
    return this.perAddress.spent(address) || (block !== null && this.perBlock.spent(block));
  }
}

/** The headers that tell the Worker to turn an address, or its block, away itself until midnight UTC. */
export const spentUntil = (scope: Scope) => ({ [SPENT_HEADER]: String(Date.now() + untilMidnight()), [SPENT_SCOPE_HEADER]: scope });

const retryAtMidnight = () => ({ 'retry-after': String(Math.ceil(untilMidnight() / 1000)) });

/** An address past its share of the day, refused and named so the Worker refuses it from now on. */
export const spentAddress = (scope: Scope) => new Response('Too many requests today', { status: 429, headers: { ...spentUntil(scope), ...retryAtMidnight() } });

/** An object whose budget is spent for the day. */
export const spentBudget = () => new Response('Spent for today', { status: 503, headers: retryAtMidnight() });
