// Other players, the part both relays share: the Bun relay in development (server/ghosts.ts) and the hub on
// Cloudflare (worker/hub.ts). Only positions travel, and only as far as the players nearest you.
//
// Protocol (JSON over a WebSocket):
//   server -> client  { t: 'hello', id, now }                        once, on connect
//   client -> server  { t: 'p', p: [x, y, z, yaw, ride, lx, lz] }     twice a second with anyone within 500 m, else every 5 s (src/game/ghosts.ts)
//   client -> server  { t: 'w' }                                     a watcher with no pose (the network view), while shown
//   server -> client  { t: 's', now, n, p: [[id, x, y, z, yaw, ride, lx, lz], ...] }   twice a second
// `ride` is the index of the train the player rides (-1 on foot); lx and lz are then relative to that train, so
// riders stay inside it despite latency. The client draws others a little behind (DELAY), between two snapshots.
// A socket that says nothing for IDLE_MS is closed with reason 'idle': a paused game or a hidden tab. The client
// opens it again when it plays or shows again, not at once, or a tab left open would reconnect every minute.
// The relay closes a socket with CLOSE_SPENT when the day's budget for other players is spent, or the address has
// spent its own share of the day (server/limits.ts; the client waits for midnight UTC either way), with CLOSE_FULL when it has MAX_CLIENTS or the address already has MAX_PER_ADDRESS (the client waits
// a minute or two), and with CLOSE_FLOOD a socket that sends far more than any client does.

export type Pose = [number, number, number, number, number, number, number];

/** How often everyone gets a snapshot. Incoming messages are what Cloudflare bills, so the client sends as seldom. */
export const TICK_MS = 500;
/** A player not heard from in this long is left out of snapshots. */
export const STALE_MS = 15_000;
/** ...and one silent this long is disconnected (the client sends at least every 5 s). */
export const IDLE_MS = 60_000;
/** The nearest this many are sent to each player; the client draws 32. */
export const MAX_SENT = 48;
export const MAX_CLIENTS = 200;
/** Sockets one address (server/limits.ts) may hold at once: a classroom behind one address, not the whole relay. */
export const MAX_PER_ADDRESS = 16;
/** Messages a player may send in a burst, and how many a second it refills by: twice what the client sends. */
export const MESSAGE_BUDGET = 10;
export const MESSAGE_RATE = 4;
/** Messages past the budget within one tick that close the socket: they are billed whether read or not. */
export const MESSAGE_FLOOD = 20;
export const CLOSE_SPENT = 4000;
export const CLOSE_FULL = 4001;
export const CLOSE_FLOOD = 4002;

const finite = (v: unknown, limit: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;

/** A pose from a client, checked and rounded, or null when it is not one. */
export function parsePose(raw: unknown): Pose | null {
  if (!Array.isArray(raw) || raw.length !== 7) return null;
  const [x, y, z, yaw, ride, lx, lz] = raw;
  if (!finite(x, 100000) || !finite(y, 200) || !finite(z, 200) || !finite(yaw, 100) || !finite(ride, 255) || !finite(lx, 200) || !finite(lz, 20)) return null;
  const round = (v: number) => Math.round(v * 100) / 100;
  return [round(x), round(y), round(z), round(yaw), Math.trunc(ride), round(lx), round(lz)];
}

/** What a watcher sends, every WATCH_EVERY while its page is shown: no pose, only a sign it is still looking. */
export const WATCH = '{"t":"w"}';
export const WATCH_EVERY = 20_000;

/** A pose message from a client, or null. Anything longer than a pose needs is not read at all. */
export function readMessage(message: unknown): Pose | null {
  const text = String(message);
  if (text.length > 256) return null;
  try {
    const data = JSON.parse(text) as { t?: string; p?: unknown };
    return data.t === 'p' ? parsePose(data.p) : null;
  } catch {
    return null;
  }
}

export interface Player {
  id: number;
  /** The address the socket came from, as server/limits.ts keys it. */
  address: string;
  pose: Pose | null;
  seen: number;
  budget: number;
  /** Messages past the budget this tick. */
  over: number;
  /** Messages received in all, read or not: the hub bills every twentieth to the address. */
  sent: number;
}

/** Takes a message from a player: a pose places them, a watch only keeps the socket open. */
export function hear(player: Player, message: unknown, now = Date.now()): void {
  const text = String(message);
  if (text === WATCH) { player.seen = now; return; }
  const pose = readMessage(text);
  if (pose) { player.pose = pose; player.seen = now; }
}

export const newPlayer = (id: number, address: string, now = Date.now()): Player => ({ id, address, pose: null, seen: now, budget: MESSAGE_BUDGET, over: 0, sent: 0 });

/** Whether a new socket from `address` would be one too many for the relay, or for that address. */
export function refused(players: Iterable<Player>, address: string, max = MAX_CLIENTS): boolean {
  let all = 0, mine = 0;
  for (const p of players) { all++; if (p.address === address) mine++; }
  return all >= max || mine >= MAX_PER_ADDRESS;
}

/** Takes one message from a player's budget, or says it is spent. */
export function spendMessage(player: Player): boolean {
  if (player.budget < 1) { player.over++; return false; }
  player.budget--;
  return true;
}

/** Whether a player sends so far past the budget that the socket should close. */
export const flooding = (player: Player): boolean => player.over > MESSAGE_FLOOD;

/** Refills every budget for one tick. */
export function refill(players: Iterable<Player>): void {
  for (const p of players) { p.budget = Math.min(MESSAGE_BUDGET, p.budget + (MESSAGE_RATE * TICK_MS) / 1000); p.over = 0; }
}

/**
 * Each player's snapshot for this tick: the others nearest along the line (x) first, at most MAX_SENT. Players are
 * sorted by x once and each takes its nearest by walking out both ways, so a tick costs n log n, not n squared.
 */
export function snapshots(players: Player[], now: number): Map<number, string> {
  const live = players.filter((p) => p.pose && now - p.seen < STALE_MS).sort((a, b) => a.pose![0] - b.pose![0]);
  const rows = live.map((p) => JSON.stringify([p.id, ...p.pose!]));
  const index = new Map(live.map((p, i) => [p.id, i]));
  const out = new Map<number, string>();
  const head = `{"t":"s","now":${now},"n":${live.length},"p":[`;
  for (const me of players) {
    const at = index.get(me.id);
    let picked: string[];
    if (at === undefined) {
      // Not placed yet: anyone, up to the limit.
      picked = rows.slice(0, MAX_SENT);
    } else {
      picked = [];
      const x = me.pose![0];
      let lo = at - 1, hi = at + 1;
      while (picked.length < MAX_SENT && (lo >= 0 || hi < live.length)) {
        const left = lo >= 0 ? x - live[lo].pose![0] : Infinity;
        const right = hi < live.length ? live[hi].pose![0] - x : Infinity;
        picked.push(left <= right ? rows[lo--] : rows[hi++]);
      }
    }
    out.set(me.id, `${head}${picked.join(',')}]}`);
  }
  return out;
}
