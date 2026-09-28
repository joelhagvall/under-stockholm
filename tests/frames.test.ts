import { afterEach, expect, test } from 'bun:test';
import { nextFrame } from '../src/game/frames';

const restore: Array<() => void> = [];
function replace(name: string, value: unknown): void {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  restore.push(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else Reflect.deleteProperty(globalThis, name);
  });
}
afterEach(() => { while (restore.length) restore.pop()!(); });

for (const winner of ['frame', 'timeout'] as const) {
  test(`a ${winner} completion releases both scheduled callbacks`, async () => {
    replace('document', { hidden: false });
    let frame!: () => void, timeout!: () => void;
    const cancelledFrames: number[] = [], cancelledTimers: number[] = [];
    replace('requestAnimationFrame', (callback: () => void) => { frame = callback; return 7; });
    replace('setTimeout', (callback: () => void) => { timeout = callback; return 9; });
    replace('cancelAnimationFrame', (id: number) => cancelledFrames.push(id));
    replace('clearTimeout', (id: number) => cancelledTimers.push(id));
    const pending = nextFrame();
    (winner === 'frame' ? frame : timeout)();
    await pending;
    expect(cancelledFrames).toEqual([7]);
    expect(cancelledTimers).toEqual([9]);
    // A callback already queued by the browser must not complete a second time.
    (winner === 'frame' ? timeout : frame)();
    expect(cancelledFrames).toHaveLength(1);
    expect(cancelledTimers).toHaveLength(1);
  });
}

test('hidden loading yields without animation frames and closes its message ports', async () => {
  replace('document', { hidden: true });
  let firstClosed = false, secondClosed = false;
  replace('MessageChannel', class {
    port1 = { onmessage: () => {}, close: () => { firstClosed = true; } };
    port2 = { postMessage: () => queueMicrotask(() => this.port1.onmessage()), close: () => { secondClosed = true; } };
  });
  replace('requestAnimationFrame', () => { throw new Error('Hidden pages must not wait for frames'); });
  await nextFrame();
  expect(firstClosed).toBe(true);
  expect(secondClosed).toBe(true);
});
