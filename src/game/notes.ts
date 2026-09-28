import { relayUrl } from './relay';
import { createCanvasSign, FONT, redraw, type CanvasSign } from './gfx/signs';
import text from './i18n/sv.json';
import { cleanNote } from './noteFilter';

/**
 * Shared notes on the staff room notice boards: short greetings that every
 * player sees, kept by the relay (`server/ghosts.ts`), which filters them the
 * same way as `noteFilter.ts`. Without a relay, your notes stay in your own
 * browser. Every staff room shows the same board.
 */

const LOCAL_KEY = 'under-stockholm:notes';
const PAPERS = ['#fff7b0', '#ffffff', '#cfe8ff', '#ffd6d6', '#d9f5d0', '#ffe3b8'];

export interface SharedNote { id: number; text: string; at: number }

/** The relay's notes address. */
export function notesUrl(): string | null {
  const base = relayUrl();
  return base ? `${base}/notes` : null;
}

class SharedNotes {
  private notes: SharedNote[] = [];
  private sign: CanvasSign | null = null;
  private fetched = 0;
  private readonly url = typeof location === 'undefined' ? null : notesUrl();

  /** The board's texture, shared by every staff room. */
  board(): CanvasSign {
    if (!this.sign || this.sign.canvas.width === 1) {
      this.sign = createCanvasSign(768, 512);
      try { this.notes = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]'); } catch { this.notes = []; }
      this.draw();
    }
    return this.sign;
  }

  /** Fetches the latest notes, at most once a minute. */
  refresh(): void {
    if (!this.url || Date.now() - this.fetched < 60_000) return;
    this.fetched = Date.now();
    fetch(this.url).then((r) => (r.ok ? r.json() : null)).then((body: { notes?: SharedNote[] } | null) => {
      if (!body?.notes) return;
      this.notes = body.notes;
      this.draw();
    }).catch(() => { /* Keep what is up. */ });
  }

  /** Puts up a note. Returns a caption for how it went. */
  async post(raw: string): Promise<string> {
    const note = cleanNote(raw);
    if (!note) return text.notes.refused;
    if (!this.url) {
      this.notes = [{ id: Date.now(), text: note, at: Date.now() }, ...this.notes].slice(0, 12);
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.notes)); } catch { /* Session only. */ }
      this.draw();
      return text.notes.local;
    }
    try {
      const r = await fetch(this.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: note }) });
      if (r.status === 429) return text.notes.slow;
      if (!r.ok) return text.notes.refused;
      this.fetched = 0;
      this.refresh();
      return text.notes.posted;
    } catch {
      return text.notes.offline;
    }
  }

  private draw(): void {
    if (!this.sign) return;
    redraw(this.sign, (ctx, w, h) => {
      ctx.fillStyle = '#9b7a4e';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#20252b';
      ctx.font = `700 26px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(text.notes.title, w / 2, 12);
      const list = this.notes.slice(0, 12);
      if (!list.length) {
        ctx.font = `italic 500 22px ${FONT}`;
        ctx.fillText(text.notes.empty, w / 2, h / 2);
        return;
      }
      list.forEach((note, i) => {
        const col = i % 4, row = Math.floor(i / 4);
        const x = 14 + col * 188, y = 52 + row * 152;
        ctx.save();
        ctx.translate(x + 85, y + 68);
        ctx.rotate(((note.id * 37) % 9 - 4) * 0.01);
        ctx.fillStyle = PAPERS[note.id % PAPERS.length];
        ctx.fillRect(-82, -64, 164, 132);
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.arc(0, -56, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1d2a4a';
        ctx.font = `600 19px "Comic Sans MS", "Marker Felt", ${FONT}`;
        ctx.textAlign = 'left';
        let line = '';
        let ly = -40;
        for (const word of note.text.split(' ')) {
          if (line && ctx.measureText(line + word).width > 148) { ctx.fillText(line, -72, ly); line = ''; ly += 23; }
          line += word + ' ';
        }
        ctx.fillText(line, -72, ly);
        ctx.restore();
      });
    });
  }
}

export const sharedNotes = new SharedNotes();

/** Set by the game: ask the player for a note and put it up. */
export const noteWriter: { open: (() => void) | null } = { open: null };
