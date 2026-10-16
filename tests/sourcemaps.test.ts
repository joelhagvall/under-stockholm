import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, test } from 'bun:test';
import { missing, symbolicate } from '../scripts/sourcemaps';

const dir = mkdtempSync(join(tmpdir(), 'maps-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
mkdirSync(join(dir, 'latest'));
// boot-abcd1234.js line 1, column 0 (and on) comes from src/game/boot.ts line 3, column 4, named `frame`.
const map = { version: 3, sources: ['../../src/game/boot.ts'], names: ['frame'], mappings: 'AAEIA' };
writeFileSync(join(dir, 'latest', 'boot-abcd1234.js.map'), JSON.stringify(map));
writeFileSync(join(dir, 'view-abcd1234.js.map'), JSON.stringify(map));

test('frames in built chunks are read back to src/, from the latest build or a kept one', () => {
  const stack = 'TypeError: x is undefined\n    at Xe (/assets/boot-abcd1234.js:1:1)\nXe@/assets/view-abcd1234.js:1:5';
  expect(symbolicate(stack, dir)).toBe('TypeError: x is undefined\n    at Xe (src/game/boot.ts:3:5 (frame))\nXe@src/game/boot.ts:3:5 (frame)');
});

test('a chunk with no map is left as it was and named', () => {
  const stack = '    at Xe (/assets/silverpilen-zzzz9999.js:1:1)\n    at chrome-extension://abc/x.js:1:1';
  expect(symbolicate(stack, dir)).toBe(stack);
  expect(missing.has('silverpilen-zzzz9999.js')).toBe(true);
});
