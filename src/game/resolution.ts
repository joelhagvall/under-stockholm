/** The render scales the adaptive resolution steps through, from full down. */
export const RENDER_SCALES = [1, 0.85, 0.7, 0.55];
/** Frames judged together, and the median frame time over which they are too slow (under about 45 fps). */
const WINDOW = 30;
const SLOW_MS = 22;

/**
 * Adaptive resolution: a machine that cannot keep up gets fewer pixels, and gets them back when it has headroom.
 * Frames are judged 30 at a time by their median, so a phone whose frames wander either side of the line is seen
 * as slow, and a single hitch among quick frames is not. Fewer pixels only help a GPU that cannot draw them in time. A frame spent in the game's own code (a station built on
 * the way, a walkway into a line built elsewhere) counts for nothing, and so does a browser that holds the frame rate
 * down however little there is to draw (Chrome's energy saver runs at 30 fps): when a notch lower did not make frames
 * quicker, the notch is given back and that frame time counts as the screen's own from then on.
 */
export class AdaptiveResolution {
  /** Index into `RENDER_SCALES`. */
  level = 0;
  /** This window's frame times. */
  private readonly window: number[] = [];
  private quickFrames = 0;
  private loweredAt = -Infinity;
  /** After a notch down: the slow frames' average before it, and the frames since, to see whether it helped. */
  private trial: { before: number; sum: number; frames: number } | null = null;
  /** A frame time the browser holds to however little is drawn, found by a notch that did not help. */
  private floorMs = 0;
  /** The frame time the game holds itself to (battery saver's 30 fps), which says nothing about drawing either. */
  heldMs = 0;

  get scale(): number {
    return RENDER_SCALES[this.level];
  }

  /**
   * One frame: `frameMs` since the last one began, `workMs` the last frame's own work (its code up to the end of the
   * render call). True when the level changed.
   */
  frame(frameMs: number, workMs: number, now: number): boolean {
    // Back from a hidden tab or a stall: that says nothing about drawing.
    if (frameMs > 250) return false;
    const trial = this.trial;
    if (trial) {
      trial.sum += frameMs;
      if (++trial.frames < 60) return false;
      this.trial = null;
      this.window.length = this.quickFrames = 0;
      if (trial.sum / trial.frames <= trial.before * 0.9) return false;
      this.floorMs = Math.max(this.floorMs, trial.before * 1.15);
      this.level--;
      return true;
    }
    // Held up by the game's own code: fewer pixels would not help.
    if (workMs > frameMs * 0.6) return false;
    this.quickFrames = frameMs < Math.max(17.5, this.floorMs, this.heldMs * 1.1) ? this.quickFrames + 1 : 0;
    this.window.push(frameMs);
    if (this.window.length >= WINDOW) {
      const median = this.window.sort((a, b) => a - b)[WINDOW >> 1];
      this.window.length = 0;
      if (median > Math.max(SLOW_MS, this.floorMs, this.heldMs * 1.15) && this.level < RENDER_SCALES.length - 1) {
        this.level++;
        this.loweredAt = now;
        this.trial = { before: median, sum: 0, frames: 0 };
        this.quickFrames = 0;
        return true;
      }
    }
    if (this.quickFrames >= 600 && this.level > 0 && now - this.loweredAt > 60_000) {
      this.level--;
      this.quickFrames = 0;
      return true;
    }
    return false;
  }

  /** Back to full resolution, as at the start. */
  reset(): void {
    this.level = 0;
    this.window.length = this.quickFrames = 0;
    this.trial = null;
    this.loweredAt = -Infinity;
  }
}
