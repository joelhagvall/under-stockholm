/**
 * One anonymous performance report per visit, to the relay (`server/perf.ts` has the shape and what is kept), so
 * the frame rates on players' real machines are known rather than guessed. It is sent after two minutes of play,
 * or when the page is left after at least half a minute, as a beacon: it never waits for an answer and never
 * retries. Without a relay, or in debug, nothing is sent. No identifiers: the class of device, the frame times,
 * where the resolution landed and the time to playing.
 */

/** Played time before the report goes; leaving earlier sends it from `MIN_SECONDS` on. */
const REPORT_SECONDS = 120;
const MIN_SECONDS = 30;
/** A frame longer than this is the tab having been away, not a slow frame. */
const AWAY_MS = 1000;

export interface Facts {
  touch: boolean;
  /** How many notches the adaptive resolution has gone down. */
  scale: number;
  pixelRatio: number;
  loadS: number;
  real: boolean;
  passengers: boolean;
  gpu: string;
}

export interface FrameSummary { seconds: number; frames: number; fps: number; p95: number; hitches: number }

/** What a list of frame times says: their length, the rate, the 95th percentile and the frames over 50 ms. */
export function summarizeFrames(ms: number[]): FrameSummary {
  const total = ms.reduce((a, b) => a + b, 0);
  const sorted = [...ms].sort((a, b) => a - b);
  return {
    seconds: total / 1000,
    frames: ms.length,
    fps: ms.length ? (1000 * ms.length) / total : 0,
    p95: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0,
    hitches: ms.filter((d) => d > 50).length,
  };
}

export class Telemetry {
  private readonly frames: number[] = [];
  private played = 0;
  private sent = false;

  /** @param url the relay's HTTP address, or null to send nothing */
  constructor(private readonly url: string | null, private readonly facts: () => Facts) {}

  /** A frame of play, milliseconds since the last. */
  frame(ms: number): void {
    if (this.sent || !this.url || !(ms > 0) || ms > AWAY_MS) return;
    this.frames.push(ms);
    this.played += ms / 1000;
    if (this.played >= REPORT_SECONDS) this.send();
  }

  /** The page is being left: send what there is, if it is enough to mean something. */
  leave(): void {
    if (this.played >= MIN_SECONDS) this.send();
  }

  private send(): void {
    if (this.sent || !this.url) return;
    this.sent = true;
    const f = this.facts();
    const nav = navigator as Navigator & { deviceMemory?: number };
    const report = {
      v: 1,
      kind: f.touch ? 'touch' : 'desktop',
      ...summarizeFrames(this.frames),
      scale: f.scale,
      pixelRatio: f.pixelRatio,
      loadS: f.loadS,
      dpr: window.devicePixelRatio,
      w: window.innerWidth,
      h: window.innerHeight,
      cores: navigator.hardwareConcurrency ?? 0,
      memory: nav.deviceMemory ?? 0,
      gpu: f.gpu,
      lang: navigator.language.slice(0, 8),
      real: f.real,
      passengers: f.passengers,
    };
    // Text, not JSON, so the beacon needs no preflight and goes even as the page closes.
    try {
      navigator.sendBeacon(`${this.url}/perf`, new Blob([JSON.stringify(report)], { type: 'text/plain' }));
    } catch { /* No beacon: no report. */ }
  }
}

/** The graphics card's name as the browser gives it, or '' where it does not. */
export function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  } catch {
    return '';
  }
}
