// The game on Cloudflare (wrangler.jsonc): every request is a file from the build, except the relay's paths, which go
// to the hub (worker/hub.ts), and the feeds, which go to their own object (worker/feeds.ts), so the game talks to its
// own origin as it does in development. Files are served without running this code (and cost nothing); only the paths
// in `run_worker_first` reach it.
//
// Rate limits, from cheap to dear:
// - The sources (SL, Trafiklab, SMHI, Open-Meteo, Sveriges Radio) are only ever asked by the feeds' object, once per
//   feed's interval for everyone (server/feedCore.ts).
// - Feeds are kept in each data center's cache for as long as their object says they are fresh, so however many ask,
//   it hears from each data center once per interval. A feed that does not exist is answered here, and one the
//   cache does not hold counts against the address like anything else that reaches an object.
// - What would reach an object otherwise (sockets, notes, reports, feeds) is limited per address here (LIMIT), so one
//   client in a loop can spend neither the Worker's own requests nor the day's budgets. Generous,
//   as a school or a mobile operator puts many players behind one address; the hub has its own tighter rules per
//   address for notes and reports, and per socket for messages. An address is an IPv6 /64 (server/limits.ts), and a
//   body larger than a note or a report ever is never reaches it.
// - Each address and IPv6 /48 has a share of the day at the hub and at the feeds' object (server/limits.ts). Once
//   either says one has spent it (SPENT_HEADER), each data center keeps that answer until midnight UTC and turns the
//   address away here, from both, so a client that keeps asking all day costs them nothing more.
import { isFeed } from '../server/feedCore';
import { withSecurityHeaders } from '../server/headers';
import { addressKey, blockKey, foreignOrigin, MAX_BODY, untilMidnight } from '../server/limits';
import { SPENT_HEADER, SPENT_SCOPE_HEADER } from './budget';
import { FeedHub, toFeeds } from './feeds';
import { Hub, spentSocket, type Env } from './hub';

export { FeedHub, Hub };

const hub = (env: Env) => env.HUB.get(env.HUB.idFromName('hub'));
const RELAY = /^\/(ghosts|perf|errors|notes(\/\d+)?)$/;
const tooMany = () => new Response('Too many requests', { status: 429, headers: { 'retry-after': '60' } });

/** Whether the address may reach the hub or the feeds once more (LIMIT, per address a minute). */
async function allowed(request: Request, env: Env): Promise<boolean> {
  if (!env.LIMIT) return true;
  return (await env.LIMIT.limit({ key: addressKey(request.headers.get('cf-connecting-ip') ?? '?') })).success;
}

/** Where a data center keeps an object's word that an address, or its block, has spent its share of the day. */
function spentKeys(request: Request, origin: string): Request[] {
  const address = addressKey(request.headers.get('cf-connecting-ip') ?? '?');
  const block = blockKey(address);
  return [address, ...(block ? [block] : [])].map((k) => new Request(`${origin}/.spent/${encodeURIComponent(k)}`));
}

/** Whether this data center already knows the address has spent its share today. */
async function spentToday(request: Request, origin: string): Promise<boolean> {
  for (const key of spentKeys(request, origin)) if (await caches.default.match(key)) return true;
  return false;
}

/** Turned away until midnight UTC: a socket closed as spent, so the game waits for midnight, or a 429. */
function turnedAway(request: Request): Response {
  if (request.headers.get('upgrade') === 'websocket') return spentSocket();
  return new Response('Too many requests today', { status: 429, headers: { 'retry-after': String(Math.ceil(untilMidnight() / 1000)) } });
}

/** Passes a request to an object, and remembers until midnight when it says the address has spent its share. */
async function pass(answering: Promise<Response>, request: Request, ctx: ExecutionContext, origin: string): Promise<Response> {
  const answer = await answering;
  const until = Number(answer.headers.get(SPENT_HEADER));
  if (until > Date.now()) {
    // Kept under the key the object names: the address, or its whole block when the block's share is the one spent.
    const [mine, block] = spentKeys(request, origin);
    const key = answer.headers.get(SPENT_SCOPE_HEADER) === 'block' && block ? block : mine;
    const seconds = Math.max(1, Math.floor((until - Date.now()) / 1000));
    ctx.waitUntil(caches.default.put(key, new Response('spent', { headers: { 'cache-control': `max-age=${seconds}` } })));
  }
  return answer;
}

/** Marks an unavailable feed's 502 kept in the data center's cache. */
const UNAVAILABLE = 'x-feed-unavailable';

async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/feeds/')) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    if (!isFeed(url.pathname.slice('/feeds/'.length))) return new Response('Unknown feed', { status: 404 });
    // Each data center keeps a copy for as long as the feeds' object says it is fresh (its max-age), so it hears from
    // each only once per feed's interval, however many ask. The query is left out of the key, so it cannot be used
    // to get past the cache.
    const key = new Request(`${url.origin}${url.pathname}`);
    const cached = await caches.default.match(key);
    if (cached) return cached.headers.has(UNAVAILABLE) ? new Response(cached.body, { status: 502, headers: cached.headers }) : cached;
    if (await spentToday(request, url.origin)) return turnedAway(request);
    if (!(await allowed(request, env))) return tooMany();
    const answer = await pass(toFeeds(env, new Request(key, { headers: request.headers })), request, ctx, url.origin);
    if (/max-age=[1-9]/.test(answer.headers.get('cache-control') ?? '')) {
      if (answer.ok) ctx.waitUntil(caches.default.put(key, answer.clone()));
      // An unavailable feed too, for as long as its source is paused (server/feedCore.ts). A cache keeps no 502, so it
      // is kept as a 200 marked UNAVAILABLE and answered as the 502 it was.
      else if (answer.status === 502) {
        const headers = new Headers(answer.headers);
        headers.set(UNAVAILABLE, '1');
        ctx.waitUntil(caches.default.put(key, new Response(answer.clone().body, { status: 200, headers })));
      }
    }
    return answer;
  }
  if (RELAY.test(url.pathname)) {
    // Sockets and posts only from the game's own pages. Here and not in the Bun relay, which may live on a host of
    // its own (docs/DRIFT.md); in production the hub always shares the game's origin.
    const writes = request.method !== 'GET' || request.headers.get('upgrade') === 'websocket';
    if (writes && foreignOrigin(request)) return new Response('Forbidden', { status: 403 });
    if (await spentToday(request, url.origin)) return turnedAway(request);
    if (!(await allowed(request, env))) return tooMany();
    // The game's notes and beacons always say how long they are; a body that does not is never streamed on.
    const length = request.headers.get('content-length');
    if (request.method === 'POST' && length === null) return new Response('Length required', { status: 411 });
    if (Number(length ?? 0) > MAX_BODY) return new Response('Too large', { status: 413 });
    return pass(hub(env).fetch(request), request, ctx, url.origin);
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // ASSETS owns the build's CSP, including any configured external relay and legacy WASM support.
    if (!RELAY.test(url.pathname) && !url.pathname.startsWith('/feeds/')) return env.ASSETS.fetch(request);
    return withSecurityHeaders(await handle(request, env, ctx));
  },
};
