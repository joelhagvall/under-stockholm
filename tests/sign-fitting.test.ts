import { expect, test } from 'bun:test';
import { fitText } from '../src/game/gfx/signs';

test('long signs use the largest fitting font with few canvas measurements', () => {
  let measurements = 0;
  const ctx = {
    font: '',
    measureText(text: string) { measurements++; return { width: Number(this.font.match(/ ([\d.]+)px/)![1]) * text.length }; },
  };
  fitText(ctx as unknown as CanvasRenderingContext2D, 'Sundbybergs centrum', 350, 700, 128, 'sans-serif');
  expect(ctx.font).toBe('700 18px sans-serif');
  expect(measurements).toBeLessThanOrEqual(7);
});

test('fitting preserves the original font and the minimum step for text that cannot fit', () => {
  const ctx = { font: '', measureText: () => ({ width: 50 }) } as unknown as CanvasRenderingContext2D;
  fitText(ctx, 'SL', 100, 400, 32, 'serif');
  expect(ctx.font).toBe('400 32px serif');
  fitText(ctx, 'SL', 1, 400, 33, 'serif');
  expect(ctx.font).toBe('400 7px serif');
});
