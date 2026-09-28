import { noiseBurst, thump, type AudioOut } from './sfx';

/**
 * The player's own footsteps, by what is underfoot: stone slabs on the
 * platforms and in the halls, the rubber floor of the carriages, the ribbed
 * metal of the escalators, gravel on the trackbed and bare concrete in the
 * service corridors. One step per stride, a little different every time.
 */

export type Surface = 'stone' | 'rubber' | 'metal' | 'gravel' | 'concrete' | 'tile';

/** Meters per step: walking, and running. */
const STRIDE = { walk: 1.15, run: 1.9 };

export class Footsteps {
  private travelled = 0;
  private left = false;

  /**
   * @param moved how far the player walked this frame by their own steps (not carried)
   * @param running a longer stride and a harder landing
   */
  update(moved: number, running: boolean, surface: Surface, out: AudioOut | null): void {
    this.travelled += moved;
    const stride = running ? STRIDE.run : STRIDE.walk;
    if (this.travelled < stride) return;
    this.travelled %= stride;
    this.left = !this.left;
    if (out) this.step(out, surface, running ? 1.4 : 1);
  }

  /** Standing still resets the stride, so the first step after a pause comes right away. */
  rest(): void {
    this.travelled = STRIDE.walk * 0.8;
  }

  private step(out: AudioOut, surface: Surface, force: number): void {
    const dest = out.cabin;
    const v = (0.85 + Math.random() * 0.3) * force;
    const pitch = this.left ? 1 : 1.07;
    switch (surface) {
      case 'stone':
      case 'tile':
        // A crisp heel click on stone, with the hall's slap.
        noiseBurst(out, dest, { type: 'bandpass', frequency: (surface === 'tile' ? 2600 : 2000) * pitch, q: 1.6, volume: 0.05 * v, decay: 0.035 });
        thump(out, 0.04 * v, 160, dest);
        break;
      case 'rubber':
        noiseBurst(out, dest, { type: 'lowpass', frequency: 420 * pitch, volume: 0.06 * v, decay: 0.07, color: 'brown' });
        break;
      case 'metal':
        // Ribbed treads ring faintly.
        noiseBurst(out, dest, { type: 'bandpass', frequency: 3400 * pitch, q: 7, volume: 0.035 * v, decay: 0.12 });
        noiseBurst(out, dest, { type: 'lowpass', frequency: 600, volume: 0.04 * v, decay: 0.05, color: 'brown' });
        break;
      case 'gravel':
        for (let k = 0; k < 4; k++) noiseBurst(out, dest, { type: 'highpass', frequency: 2200 + Math.random() * 1500, volume: 0.03 * v, decay: 0.025, delay: k * 0.018 + Math.random() * 0.01 });
        break;
      case 'concrete':
        noiseBurst(out, dest, { type: 'bandpass', frequency: 1300 * pitch, q: 1.2, volume: 0.05 * v, decay: 0.045 });
        thump(out, 0.05 * v, 130, dest);
        break;
    }
  }
}
