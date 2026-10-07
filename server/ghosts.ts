// Under Stockholm ghost relay: shares anonymous positions between players,
// keeps the shared notes on the staff room notice boards, and caches the
// open data feeds for everyone (server/feeds.ts).
// No names, no accounts. Run with `bun run ghosts`.
//
// Other players over a WebSocket at /ghosts, the protocol and limits in server/pose.ts (shared with the hub on
// Cloudflare, worker/hub.ts, which serves the same paths in production).
//
// Notes (HTTP, JSON):
//   GET    /notes          { notes: [{ id, text, at }, ...] }   newest first
//   POST   /notes          { text }  ->  { note } or 400/413/429     one per address every 90 s, 30 an hour in all
//   DELETE /notes/:id      with `authorization: Bearer $NOTES_ADMIN_TOKEN`
//   DELETE /notes?since=t  the same, every note put up since t (epoch ms)
// Notes must be one the game's fixed parts make (`src/game/notePhrases.ts`) and
// are kept in NOTES_FILE (default server/notes.json), at most MAX_NOTES of them.
//
// Performance reports (HTTP, server/perf.ts):
//   POST   /perf           one anonymous report per visit, from the game
//   GET    /perf           the aggregate: JSON, or a page in a browser
//
// Error reports (HTTP, server/errors.ts):
//   POST   /errors         what went wrong in the game, at most three per visit
//   GET    /errors         grouped by error: JSON, or a page in a browser

import type { ServerWebSocket } from 'bun';
import { cleanNote } from '../src/game/notePhrases';
import { handleErrors } from './errors';
import { handleFeeds } from './feeds';
import { handlePerf } from './perf';
import { addressKey, bearer, Cooldown, HOUR_MS, NOTE_EVERY_MS, NOTES_PER_HOUR, readBody } from './limits';
import { CLOSE_FLOOD, CLOSE_FULL, flooding, hear, IDLE_MS, MAX_CLIENTS, newPlayer, refill, refused, snapshots, spendMessage, TICK_MS, type Player } from './pose';

// 0 lets the system pick a free port.
const PORT = Number(process.env.PORT ?? 0);
const CLIENTS = Number(process.env.MAX_CLIENTS ?? MAX_CLIENTS);
const NOTES_FILE = process.env.NOTES_FILE ?? new URL('./notes.json', import.meta.url).pathname;
const NOTES_ADMIN_TOKEN = process.env.NOTES_ADMIN_TOKEN ?? '';
const MAX_NOTES = 200;
const SHOWN_NOTES = 24;

interface Note { id: number; text: string; at: number }
let notes: Note[] = [];
try { notes = JSON.parse(await Bun.file(NOTES_FILE).text()); } catch { /* No notes yet. */ }
let nextNote = notes.reduce((m, n) => Math.max(m, n.id), 0) + 1;
const lastNote = new Cooldown(NOTE_EVERY_MS);
const saveNotes = () => Bun.write(NOTES_FILE, JSON.stringify(notes));

const clients = new Set<ServerWebSocket<Player>>();
let nextId = 1;

const cors: Record<string, string> = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-allow-headers': 'content-type, authorization' };

async function handleNotes(req: Request, url: URL, ip: string): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  // Notes from before the boards took only phrases (src/game/notePhrases.ts) stay stored but are never shown.
  if (req.method === 'GET') return Response.json({ notes: notes.filter((n) => cleanNote(n.text)).slice(0, SHOWN_NOTES) }, { headers: cors });
  if (req.method === 'POST') {
    const now = Date.now();
    if (!lastNote.ready(ip, now)) return Response.json({ error: 'slow down' }, { status: 429, headers: cors });
    if (notes.filter((n) => n.at > now - HOUR_MS).length >= NOTES_PER_HOUR) return Response.json({ error: 'slow down' }, { status: 429, headers: cors });
    const raw = await readBody(req);
    if (raw === null) return Response.json({ error: 'too large' }, { status: 413, headers: cors });
    let body: { text?: unknown } = {};
    try { body = JSON.parse(raw); } catch { /* Empty. */ }
    const text = cleanNote(body.text);
    if (!text) return Response.json({ error: 'not allowed' }, { status: 400, headers: cors });
    lastNote.mark(ip, now);
    const note = { id: nextNote++, text, at: now };
    notes = [note, ...notes].slice(0, MAX_NOTES);
    await saveNotes();
    return Response.json({ note }, { headers: cors });
  }
  if (req.method === 'DELETE') {
    const id = Number(url.pathname.split('/')[2]);
    if (!(await bearer(req, NOTES_ADMIN_TOKEN))) return new Response('Forbidden', { status: 403, headers: cors });
    const since = Number(url.searchParams.get('since'));
    const bulk = url.pathname === '/notes' && url.searchParams.has('since') && Number.isFinite(since);
    notes = notes.filter((n) => (bulk ? n.at < since : n.id !== id));
    await saveNotes();
    return new Response(null, { status: 204, headers: cors });
  }
  return new Response('Method not allowed', { status: 405, headers: cors });
}

const server = Bun.serve<Player>({
  // Nothing sent here is larger than a note or a report (server/limits.ts); leave room for the headers.
  maxRequestBodySize: 64 * 1024,
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/feeds/')) return handleFeeds(url, cors).then((r) => r ?? new Response('Not found', { status: 404, headers: cors }));
    const ip = () => addressKey(req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? server.requestIP(req)?.address ?? '?');
    if (url.pathname === '/notes' || url.pathname.startsWith('/notes/')) return handleNotes(req, url, ip());
    if (url.pathname === '/perf') return handlePerf(req, ip(), cors);
    if (url.pathname === '/errors') return handleErrors(req, ip(), cors);
    if (url.pathname === '/ghosts') {
      if (server.upgrade(req, { data: newPlayer(nextId++, ip()) })) return undefined;
      return new Response('Upgrade required', { status: 426 });
    }
    return new Response('Under Stockholm ghost relay\n', { headers: cors });
  },
  websocket: {
    maxPayloadLength: 512,
    idleTimeout: 60,
    open(ws) {
      // Accepted and closed at once, so the client knows to wait rather than retry at once.
      if (refused([...clients].map((c) => c.data), ws.data.address, CLIENTS)) { ws.close(CLOSE_FULL, 'full'); return; }
      clients.add(ws);
      ws.send(JSON.stringify({ t: 'hello', id: ws.data.id, now: Date.now() }));
    },
    message(ws, message) {
      if (!spendMessage(ws.data)) {
        // Closed rather than ignored, as on the hub, where dropped messages are billed all the same.
        if (flooding(ws.data)) { clients.delete(ws); ws.close(CLOSE_FLOOD, 'flood'); }
        return;
      }
      hear(ws.data, message);
    },
    close(ws) {
      clients.delete(ws);
    },
  },
});

setInterval(() => {
  const now = Date.now();
  for (const ws of clients) if (now - ws.data.seen > IDLE_MS) { ws.close(1000, 'idle'); clients.delete(ws); }
  refill([...clients].map((ws) => ws.data));
  const out = snapshots([...clients].map((ws) => ws.data), now);
  for (const ws of clients) ws.send(out.get(ws.data.id)!);
}, TICK_MS);

console.log(`Ghost relay on ws://localhost:${server.port}/ghosts`);
