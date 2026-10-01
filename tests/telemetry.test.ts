import { afterEach, expect, test } from 'bun:test';
import { Telemetry } from '../src/game/telemetry';

const descriptors = ['navigator', 'window'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
afterEach(() => {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

async function report(modes: boolean[]) {
  const sent: Blob[] = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    hardwareConcurrency: 8, deviceMemory: 4, language: 'sv-SE',
    sendBeacon: (_url: string, body: Blob) => { sent.push(body); return true; },
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { devicePixelRatio: 2, innerWidth: 390, innerHeight: 844 } });
  const telemetry = new Telemetry('/relay', () => ({ touch: true, scale: 0, pixelRatio: 1.5, loadS: 5, real: true, passengers: true, gpu: 'test gpu' }));
  for (let i = 0; i < 60; i++) telemetry.frame(500, 1, modes[Math.min(i, modes.length - 1)]);
  telemetry.leave();
  telemetry.leave();
  expect(sent).toHaveLength(1);
  return JSON.parse(await sent[0].text());
}

test('the beacon identifies the build and the battery mode of its measured frames', async () => {
  expect(await report([false])).toMatchObject({ build: 'test-build', battery: false, real: true, passengers: true });
  expect(await report([true])).toMatchObject({ build: 'test-build', battery: true });
});

test('switching battery saver does not label mixed frame rates as a single mode', async () => {
  expect(await report([false, true])).toMatchObject({ battery: null });
  expect(await report([true, false, true])).toMatchObject({ battery: null });
});
