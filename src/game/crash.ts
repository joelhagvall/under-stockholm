import { relayUrl } from './relay';

/**
 * Errors players meet, sent to the relay (`server/errors.ts`, which has the shape and what is kept), so a crash on
 * someone's phone is known rather than never heard of. At most three a visit, each message once, as a beacon that
 * never waits for an answer. Without a relay, or in debug (the measuring scripts drive the game there), nothing is
 * sent. No identifiers: the message, the top of the stack, the nearest station, the class of device and the browser.
 * No three.js here: the landing page loads it when the game cannot start.
 */

/** Where players write about bugs and ideas: the pause menu, the crash card and the landing pages. */
export const FEEDBACK_MAIL = 'work@joelhagvall.com';

const MAX_REPORTS = 3;
/** Stack lines kept: the top is where it broke, the rest is mostly the frame loop. */
const STACK_LINES = 10;

export interface CrashFacts {
  where: string;
  gpu: string;
}

let sent = 0;
let watching = false;
const seen = new Set<string>();
const opened = performance.now();
let facts: () => CrashFacts = () => ({ where: '', gpu: '' });

/** What the game knows about where the player is, asked for when a report goes. */
export function crashFacts(read: () => CrashFacts): void {
  facts = read;
}

/** Whatever was thrown, as a message and a stack without the page's origin. */
function describe(err: unknown): { message: string; stack: string } {
  const e = err instanceof Error ? err : null;
  const message = (e ? `${e.name}: ${e.message}` : String(err)).slice(0, 300);
  const stack = (e?.stack ?? '').split('\n').slice(0, STACK_LINES).join('\n').split(location.origin).join('');
  return { message, stack };
}

/** Sends a report of `err`; `fatal` when the game stopped for it. */
export function reportError(err: unknown, fatal: boolean): void {
  try {
    const url = relayUrl();
    if (!url || new URLSearchParams(location.search).has('debug')) return;
    const { message, stack } = describe(err);
    // A browser extension's error is not the game's, and the resize observer's loop warning is harmless.
    if (/-extension:\/\//.test(stack) || message.includes('ResizeObserver loop')) return;
    if (sent >= MAX_REPORTS || seen.has(message)) return;
    sent++;
    seen.add(message);
    let known: CrashFacts = { where: '', gpu: '' };
    try { known = facts(); } catch { /* The world may be what broke. */ }
    const report = {
      v: 1,
      kind: document.documentElement.classList.contains('touch-device') ? 'touch' : 'desktop',
      fatal,
      message,
      stack,
      where: known.where,
      played: (performance.now() - opened) / 1000,
      gpu: known.gpu,
      ua: navigator.userAgent.slice(0, 200),
      lang: navigator.language.slice(0, 8),
    };
    // Text, not JSON, so the beacon needs no preflight and goes even as the page closes.
    navigator.sendBeacon(`${url}/errors`, new Blob([JSON.stringify(report)], { type: 'text/plain' }));
  } catch { /* No beacon: no report. */ }
}

/** Reports what nothing else caught, for as long as the page lives. The game plays on: most of these are harmless. */
export function watchErrors(): void {
  if (watching) return;
  watching = true;
  window.addEventListener('error', (e) => {
    // Only the game's own scripts: another origin's error reaches the page as a bare "Script error.", and what the
    // browser itself puts into the page (an in-app browser's helpers) throws from the page's address.
    if (!e.error || !/\/(assets|src|node_modules)\//.test(e.filename)) return;
    reportError(e.error, false);
  });
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, false));
}
