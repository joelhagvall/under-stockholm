import { expect, test } from 'bun:test';
import { errorsPage, groupErrors, parseError, readError, type ErrorReport } from '../server/errorCore';

const sample = {
  v: 1, kind: 'desktop', fatal: true, message: "TypeError: Cannot read properties of undefined (reading 'x')",
  stack: "TypeError: Cannot read properties of undefined (reading 'x')\n    at frame (/assets/boot-abc.js:1:2345)\n    at loop (/assets/boot-abc.js:1:999)",
  where: 'T-Centralen', played: 312.7, gpu: 'ANGLE (Apple, Apple M2, OpenGL 4.1)', ua: 'Mozilla/5.0', lang: 'sv-SE',
};

test('a report is taken field by field', () => {
  const r = parseError(sample, 1000)!;
  expect(r.at).toBe(1000);
  expect(r.fatal).toBe(true);
  expect(r.played).toBe(313);
  expect(r.stack.split('\n')).toHaveLength(3);
  expect(parseError({ ...sample, message: 'x'.repeat(1000) })!.message).toHaveLength(300);
  expect(parseError({ ...sample, where: 'a\u0000b' })!.where).toBe('a b');
  expect(parseError({ ...sample, fatal: 'yes' })!.fatal).toBe(false);
  expect(readError(JSON.stringify(sample))!.where).toBe('T-Centralen');
});

test('junk is refused', () => {
  expect(parseError(null)).toBeNull();
  expect(parseError({ ...sample, v: 2 })).toBeNull();
  expect(parseError({ ...sample, kind: 'tv' })).toBeNull();
  expect(parseError({ ...sample, message: '   ' })).toBeNull();
  expect(readError('not json')).toBeNull();
});

test('reports group by message and where in the code, the most frequent first', () => {
  const now = Date.now();
  const a = parseError(sample, now - 2 * 86_400_000)!;
  const b = parseError({ ...sample, kind: 'touch', fatal: false }, now)!;
  const c = parseError({ ...sample, message: 'RangeError: too deep', stack: 'RangeError: too deep\n    at walk (/assets/world.js:1:1)' }, now)!;
  const data = groupErrors([a, b, c] as ErrorReport[], now);
  expect(data.count).toBe(3);
  expect(data.day).toBe(2);
  expect(data.groups).toHaveLength(2);
  expect(data.groups[0]).toMatchObject({ n: 2, fatal: 1, touch: 1, frame: 'at frame (/assets/boot-abc.js:1:2345)' });
  expect(data.groups[0].sample.kind).toBe('touch');
});

test('the page escapes what players sent', () => {
  const r = parseError({ ...sample, message: '<img src=x onerror=alert(1)>' })!;
  expect(errorsPage(groupErrors([r]))).not.toContain('<img');
});
