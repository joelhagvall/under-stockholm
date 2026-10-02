import { expect, test } from 'bun:test';
import { ALERT_AGAIN_MS, ALERT_EVERY_MS, alertFor, errorsPage, groupErrors, parseError, readError, type AlertLog, type ErrorReport } from '../server/errorCore';

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

test('the same error from two builds is one group', () => {
  const stack = (hash: string, name: string, col: number) => `Error: no context\n    at new ${name} (/assets/silverpilen-${hash}.js:4220:${col})`;
  const a = parseError({ ...sample, message: 'Error: no context', stack: stack('B4s9k2hY', 'jd', 24418) }, 1)!;
  const b = parseError({ ...sample, message: 'Error: no context', stack: stack('DMGk-5N4', '_d', 24402) }, 2)!;
  const c = parseError({ ...sample, message: 'Error: no context', stack: 'Error: no context\n    at elsewhere (/assets/boot-CvImGse4.js:1:1)' }, 3)!;
  const data = groupErrors([a, b, c]);
  expect(data.groups).toHaveLength(2);
  expect(data.groups[0]).toMatchObject({ n: 2, frame: 'at new _d (/assets/silverpilen-DMGk-5N4.js:4220:24402)' });
});

test('the page escapes what players sent', () => {
  const r = parseError({ ...sample, message: '<img src=x onerror=alert(1)>' })!;
  expect(errorsPage(groupErrors([r]))).not.toContain('<img');
});

test('missing assets group across hashes in the message and keep the newest original report', () => {
  for (const [name, extension, prefix] of [
    ['boot', 'js', 'TypeError: Failed to fetch dynamically imported module: '],
    ['boot', 'css', 'Error: Unable to preload CSS for '],
    ['rapier_wasm3d_bg', 'wasm', 'Error: Failed to fetch '],
  ]) {
    const message = (hash: string) => `${prefix}https://understockholm.com/assets/${name}-${hash}.${extension}`;
    const a = parseError({ ...sample, message: message('AAAAAAAA'), stack: '', build: 'old-build' }, 1)!;
    const b = parseError({ ...sample, message: message('BBBBBBBB'), stack: '', build: 'new-build' }, 2)!;
    const c = parseError({ ...sample, message: `${prefix}https://understockholm.com/assets/other-BBBBBBBB.${extension}`, stack: '' }, 3)!;
    const groups = groupErrors([a, b, c]).groups;
    expect(groups).toHaveLength(2);
    expect(groups[0].message).toBe(b.message);
    expect(groups[0].sample).toBe(b);
    expect(groups[0].builds).toEqual({ 'old-build': 1, 'new-build': 1 });
    expect(errorsPage(groupErrors([a, b]))).toContain('old-build: 1, new-build: 1');
  }
});

test('old reports and invalid build identifiers are accepted without inventing a version', () => {
  expect(parseError(sample)!.build).toBe('');
  expect(parseError({ ...sample, build: '<script>' })!.build).toBe('');
  expect(parseError({ ...sample, build: 'a'.repeat(65) })!.build).toBe('');
  const { build: _build, ...old } = parseError(sample)!;
  expect(groupErrors([old as ErrorReport]).groups[0].builds).toEqual({ '': 1 });
});

test('a fatal error alerts once a week per group, and once an hour in all', () => {
  const sent = new Map<string, number>();
  const log: AlertLog = { last: (key) => sent.get(key) ?? 0, mark: (key, at) => void sent.set(key, at) };
  const at = (ms: number, extra = {}) => parseError({ ...sample, ...extra }, ms)!;
  const other = { message: 'RangeError: too deep', stack: 'RangeError: too deep\n    at walk (/assets/world-abcdefgh.js:1:1)' };
  const t = 1_000_000_000_000;
  expect(alertFor(at(t, { fatal: false }), log)).toBeNull();
  expect(alertFor(at(t), log)).toContain('T-Centralen');
  expect(alertFor(at(t + 1000), log)).toBeNull();
  // Another group waits out the hour, then is told of; a new build's hash does not make a group new.
  expect(alertFor(at(t + 1000, other), log)).toBeNull();
  expect(alertFor(at(t + ALERT_EVERY_MS, other), log)).toContain('too deep');
  expect(alertFor(at(t + 3 * ALERT_EVERY_MS, { ...other, stack: other.stack.replace('abcdefgh', 'zyxwvuts') }), log)).toBeNull();
  expect(alertFor(at(t + ALERT_AGAIN_MS), log)).toContain('TypeError');
});
