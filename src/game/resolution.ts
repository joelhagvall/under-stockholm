/** The render scales the adaptive resolution steps through, from full down. */
export const RENDER_SCALES = [1, 0.85, 0.7, 0.55];

/**
 * Adaptive resolution: a machine that cannot keep up gets fewer pixels, and gets them back when it has headroom.
 * Fewer pixels only help a GPU that cannot draw them in time. A frame spent in the game's own code (a station built on
 * the way, a walkway into a line built elsewhere) counts for nothing, and so does a browser that holds the frame rate
 * down however little there is to draw (Chrome's energy saver runs at 30 fps): when a notch lower did not make frames
 * quicker, the notch is given back and that frame time counts as the screen's own from then on.
 */
export class AdaptiveResolution {
  /** Index into `RENDER_SCALES`. */
  level = 0;
  private slowFrames = 0;
  private slowSum = 0;
  private quickFrames = 0;
  private loweredAt = -Infinity;
  /** After a notch down: the slow frames' average before it, and the frames since, to see whether it helped. */
  private trial: { before: number; sum: number; frames: number } | null = null;
  /** A frame time the browser holds to however little is drawn, found by a notch that did not help. */
  private floorMs = 0;

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
      this.slowFrames = this.slowSum = this.quickFrames = 0;
      if (trial.sum / trial.frames <= trial.before * 0.9) return false;
      this.floorMs = Math.max(this.floorMs, trial.before * 1.15);
      this.level--;
      return true;
    }
    // Held up by the game's own code: fewer pixels would not help.
    if (workMs > frameMs * 0.6) return false;
    if (frameMs > Math.max(24, this.floorMs)) {
      this.slowFrames++;
      this.slowSum += frameMs;
      this.quickFrames = 0;
    } else if (frameMs < Math.max(17.5, this.floorMs)) {
      this.quickFrames++;
      this.slowFrames = this.slowSum = 0;
    } else {
      this.slowFrames = this.slowSum = this.quickFrames = 0;
    }
    if (this.slowFrames >= 30 && this.level < RENDER_SCALES.length - 1) {
      this.level++;
      this.loweredAt = now;
      this.trial = { before: this.slowSum / this.slowFrames, sum: 0, frames: 0 };
      this.slowFrames = this.slowSum = this.quickFrames = 0;
      return true;
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
    this.slowFrames = this.slowSum = this.quickFrames = 0;
    this.trial = null;
    this.loweredAt = -Infinity;
  }
}
