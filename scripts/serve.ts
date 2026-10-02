// Serves the production build compressed, the way a real host would: Brotli when the browser takes it (as Cloudflare
// sends it), else gzip. The relay's paths go to the Bun relay (server/ghosts.ts), started on a free port, as the hub
// answers them on the same origin in production (worker/index.ts).
// Used for Lighthouse and pa11y audits: `bun run build && bun run serve:prod`.
import { file, type ServerWebSocket } from 'bun';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { withSecurityHeaders } from '../server/headers';

const root = join(import.meta.dir, '..', 'dist');
const port = Number(process.env.PORT ?? 4173);
/** Compressed once per file, at the quality a CDN uses on the fly (11 takes seconds for the physics binary). */
const brotli = new Map<string, Uint8Array<ArrayBuffer>>();
const compressible = new Set(['.html', '.js', '.css', '.svg', '.txt', '.json', '.wasm', '.xml', '.webmanifest']);

const probe = Bun.serve({ port: 0, fetch: () => new Response() });
const relayPort = probe.port!;
probe.stop(true);
const relay = Bun.spawn([process.execPath, join(import.meta.dir, '..', 'server', 'ghosts.ts')], { env: { ...process.env, PORT: String(relayPort) }, stdio: ['ignore', 'inherit', 'inherit'] });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => { relay.kill(); process.exit(0); });
process.on('exit', () => relay.kill());
const RELAY = /^\/(ghosts|perf|errors|notes(\/\d+)?|feeds\/[a-z]+)$/;

/** The build's `_headers` (vite.config.ts), as Cloudflare applies them: each rule's headers on the paths it matches. */
const rules = (await file(join(root, '_headers')).text().catch(() => '')).split(/\n(?=\S)/).map((block) => {
  const [pattern, ...lines] = block.trim().split('\n');
  const match = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`);
  return { match, headers: Object.fromEntries(lines.map((l) => l.trim().split(/:\s*(.*)/s).slice(0, 2))) };
}).filter((rule) => Object.keys(rule.headers).length);

/** A player's socket, passed through to one of its own on the relay. */
interface Pipe { upstream: WebSocket; queue: string[] }

Bun.serve<Pipe>({
  port,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (RELAY.test(url.pathname)) {
      if (url.pathname === '/ghosts') {
        const upstream = new WebSocket(`ws://localhost:${relayPort}/ghosts`);
        if (server.upgrade(req, { data: { upstream, queue: [] } })) return undefined;
        upstream.close();
        return withSecurityHeaders(new Response('Upgrade required', { status: 426 }));
      }
      const headers = new Headers(req.headers);
      headers.set('x-forwarded-for', server.requestIP(req)?.address ?? '127.0.0.1');
      const answer = await fetch(`http://localhost:${relayPort}${url.pathname}${url.search}`, { method: req.method, headers, body: req.body }).catch(() => new Response('Relay down', { status: 502 }));
      return withSecurityHeaders(answer);
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/')) path += 'index.html';
    const f = file(join(root, path));
    if (!(await f.exists())) return withSecurityHeaders(new Response('Not found', { status: 404 }));
    const type = f.type;
    const headers: Record<string, string> = { 'content-type': type };
    for (const rule of rules) if (rule.match.test(url.pathname)) Object.assign(headers, rule.headers);
    const accepts = req.headers.get('accept-encoding') ?? '';
    if (compressible.has(extname(path)) && accepts.includes('br')) {
      let body = brotli.get(path);
      if (!body) brotli.set(path, (body = new Uint8Array(brotliCompressSync(new Uint8Array(await f.arrayBuffer()), { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }))));
      return new Response(body, { headers: { ...headers, 'content-encoding': 'br', vary: 'accept-encoding' } });
    }
    if (compressible.has(extname(path)) && accepts.includes('gzip')) {
      const body = Bun.gzipSync(new Uint8Array(await f.arrayBuffer()));
      return new Response(body, { headers: { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' } });
    }
    return new Response(f, { headers });
  },
  websocket: {
    open(ws: ServerWebSocket<Pipe>) {
      const { upstream, queue } = ws.data;
      upstream.onmessage = (event) => ws.send(String(event.data));
      upstream.onclose = (event) => ws.close(event.code === 1005 || event.code === 1006 ? 1011 : event.code, event.reason);
      upstream.onopen = () => { for (const m of queue.splice(0)) upstream.send(m); };
    },
    message(ws: ServerWebSocket<Pipe>, message) {
      const { upstream, queue } = ws.data;
      if (upstream.readyState === WebSocket.OPEN) upstream.send(String(message));
      else queue.push(String(message));
    },
    close(ws: ServerWebSocket<Pipe>) {
      ws.data.upstream.close();
    },
  },
});

console.log(`Serving dist on http://localhost:${port}`);
