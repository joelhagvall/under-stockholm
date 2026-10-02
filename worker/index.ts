// The game on Cloudflare (wrangler.jsonc): every request is a file from the build, except the relay's paths, which go
// to the hub (worker/hub.ts), so the game talks to its own origin as it does in development. Files are served without
// running this code (and cost nothing); only the paths in `run_worker_first` reach it.
//
// Rate limits, from cheap to dear:
// - The sources (SL, Trafiklab, SMHI, Open-Meteo, Sveriges Radio) are only ever asked by the hub, once per feed's
//   interval for everyone, and SL's Transport API within its own budget (server/feedCore.ts).
// - Feeds are kept in each data center's cache for as long as the hub says they are fresh, so however many ask, the
//   hub hears from each data center once per interval. A feed that does not exist is answered here, and one the
//   cache does not hold counts against the address like anything else that reaches the hub.
// - What would reach the hub otherwise (sockets, notes, reports) is limited per address here (LIMIT), so one client
//   in a loop can spend neither the Worker's own requests nor the day's budget. Generous,
//   as a school or a mobile operator puts many players behind one address; the hub has its own tighter rules per
//   address for notes and reports, and per socket for messages. An address is an IPv6 /64 (server/limits.ts), and a
//   body larger than a note or a report ever is never reaches it.
// - Each address and IPv6 /48 has a share of the day at the hub (server/limits.ts). Once the hub says one has spent it
//   (SPENT_HEADER), each data center keeps that answer until midnight UTC and turns the address away here, so a
//   client that keeps asking all day costs the hub nothing more.
import { isFeed } from '../server/feedCore';
import { withSecurityHeaders } from '../server/headers';
import { addressKey, blockKey, foreignOrigin, MAX_BODY, untilMidnight } from '../server/limits';
import { Hub, SPENT_HEADER, SPENT_SCOPE_HEADER, spentSocket, type Env } from './hub';

export { Hub };

const hub = (env: Env) => env.HUB.get(env.HUB.idFromName('hub'));
const RELAY = /^\/(ghosts|perf|errors|notes(\/\d+)?)$/;
const tooMany = () => new Response('Too many requests', { status: 429, headers: { 'retry-after': '60' } });

/** Whether the address may reach the hub once more (LIMIT, per address a minute). */
async function allowed(request: Request, env: Env): Promise<boolean> {
  if (!env.LIMIT) return true;
  return (await env.LIMIT.limit({ key: addressKey(request.headers.get('cf-connecting-ip') ?? '?') })).success;
}

/** Where a data center keeps the hub's word that an address, or its block, has spent its share of the day. */
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

/** Passes a request to the hub, and remembers until midnight when the hub says the address has spent its share. */
async function toHub(request: Request, env: Env, ctx: ExecutionContext, origin: string, forward: Request = request): Promise<Response> {
  const answer = await hub(env).fetch(forward);
  const until = Number(answer.headers.get(SPENT_HEADER));
  if (until > Date.now()) {
    // Kept under the key the hub names: the address, or its whole block when the block's share is the one spent.
    const [mine, block] = spentKeys(request, origin);
    const key = answer.headers.get(SPENT_SCOPE_HEADER) === 'block' && block ? block : mine;
    const seconds = Math.max(1, Math.floor((until - Date.now()) / 1000));
    ctx.waitUntil(caches.default.put(key, new Response('spent', { headers: { 'cache-control': `max-age=${seconds}` } })));
  }
  return answer;
}

async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/feeds/')) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    if (!isFeed(url.pathname.slice('/feeds/'.length))) return new Response('Unknown feed', { status: 404 });
    // Each data center keeps a copy for as long as the hub says it is fresh (its max-age), so the hub hears from
    // each only once per feed's interval, however many ask. The query is left out of the key, so it cannot be used
    // to get past the cache.
    const key = new Request(`${url.origin}${url.pathname}`);
    const cached = await caches.default.match(key);
    if (cached) return cached;
    if (await spentToday(request, url.origin)) return turnedAway(request);
    if (!(await allowed(request, env))) return tooMany();
    const answer = await toHub(request, env, ctx, url.origin, new Request(key, { headers: request.headers }));
    if (answer.ok && /max-age=[1-9]/.test(answer.headers.get('cache-control') ?? '')) ctx.waitUntil(caches.default.put(key, answer.clone()));
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
    return toHub(request, env, ctx, url.origin);
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
