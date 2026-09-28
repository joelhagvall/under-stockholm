/**
 * The relay: other players, shared notes and a shared cache of the open data
 * feeds, on the game's own origin (the Bun relay, `server/ghosts.ts`, in
 * development, the hub on Cloudflare, `worker/`, in production). SL, SMHI and
 * Open-Meteo are only ever asked by the relay, once per interval for everyone,
 * so their load stays the same however many play, and visitors' addresses stay
 * with the relay. Without a relay the live feeds are simply off.
 * No three.js here: the landing page imports it.
 */

/** A minute without asking after the relay fails to answer, so a dead relay costs one timeout, not one per poll. */
const RELAY_BACKOFF = 60_000;
const TIMEOUT = 5000;

/**
 * The relay's WebSocket address for other players: VITE_GHOSTS_URL when set (`off` for none), else the page's own
 * origin, where the dev server proxies to the Bun relay (scripts/dev.ts) and production has the hub (worker/).
 */
export function ghostUrl(): string | null {
  const configured = import.meta.env.VITE_GHOSTS_URL as string | undefined;
  if (configured) return configured === 'off' ? null : configured;
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ghosts`;
}

/** The relay's HTTP address, for example https://example.org, from the WebSocket address. */
export function relayUrl(): string | null {
  const ws = ghostUrl();
  return ws ? ws.replace(/^ws/, 'http').replace(/\/ghosts$/, '') : null;
}

let relayDownUntil = 0;

/** Fetches `url`, giving up after a few seconds or when `signal` aborts. */
export async function fetchWithTimeout(url: string, signal?: AbortSignal, ms = TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, ms);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export interface Cached<T> {
  data: T;
  /** When the relay fetched it from the source, epoch seconds. */
  at: number;
}

/** A feed from the relay's cache (`/feeds/<name>`), or null when there is no relay, it does not answer or it has no copy. */
export async function relayFeed<T>(name: string, signal?: AbortSignal): Promise<Cached<T> | null> {
  const base = relayUrl();
  if (!base || Date.now() < relayDownUntil) return null;
  try {
    const response = await fetchWithTimeout(`${base}/feeds/${name}`, signal);
    const body = (await response.json()) as { data: T; at: number } | { error?: string };
    if (response.ok && 'data' in body) return { data: body.data, at: body.at / 1000 };
    // The relay answered but the source is down or limiting it: the relay retries on its own.
    if ('error' in body && body.error === 'unavailable') return null;
  } catch {
    if (signal?.aborted) return null;
  }
  relayDownUntil = Date.now() + RELAY_BACKOFF;
  return null;
}
