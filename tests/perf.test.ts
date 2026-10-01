import { expect, test } from 'bun:test';
import { aggregate, parsePerf, summarize, type PerfReport } from '../server/perf';
import { perfPage } from '../server/perfCore';
import { summarizeFrames } from '../src/game/telemetry';

const sample = { v: 1, kind: 'touch', seconds: 120, frames: 7000, fps: 58.3, p95: 18.2, hitches: 3, scale: 1, pixelRatio: 1.234, loadS: 8.4, dpr: 3, w: 390, h: 844, cores: 8, memory: 4, gpu: 'ANGLE (Qualcomm, Adreno (TM) 650, OpenGL ES 3.2)', lang: 'sv', real: false, passengers: true };

test('a report is taken field by field and rounded', () => {
  const r = parsePerf(sample, 1000)!;
  expect(r).not.toBeNull();
  expect(r.at).toBe(1000);
  expect(r.fps).toBe(58.3);
  expect(r.pixelRatio).toBe(1.23);
  expect(r.gpu).toBe('ANGLE (Qualcomm, Adreno (TM) 650, OpenGL ES 3.2)');
  expect(parsePerf({ ...sample, gpu: '<script>alert(1)</script>' })!.gpu).toBe('scriptalert(1)/script');
  expect(parsePerf({ ...sample, gpu: 'x'.repeat(200) })!.gpu.length).toBe(80);
});

test('junk is refused', () => {
  expect(parsePerf(null)).toBeNull();
  expect(parsePerf('report')).toBeNull();
  expect(parsePerf({ ...sample, v: 2 })).toBeNull();
  expect(parsePerf({ ...sample, kind: 'tv' })).toBeNull();
  expect(parsePerf({ ...sample, fps: 'fast' })).toBeNull();
  expect(parsePerf({ ...sample, fps: Infinity })).toBeNull();
  expect(parsePerf({ ...sample, seconds: 2 })).toBeNull();
  expect(parsePerf({ ...sample, w: -1 })).toBeNull();
});

test('the aggregate gives medians per class of device and per GPU', () => {
  const at = Date.now();
  const reports = [
    parsePerf({ ...sample, fps: 60, scale: 0 }, at)!,
    parsePerf({ ...sample, fps: 40, scale: 2, gpu: 'Mali-G52' }, at)!,
    parsePerf({ ...sample, fps: 50 }, at - 2 * 86_400_000)!,
    parsePerf({ ...sample, kind: 'desktop', fps: 120, loadS: 1.5 }, at)!,
  ] as PerfReport[];
  const touch = summarize(reports.filter((r) => r.kind === 'touch'));
  expect(touch.n).toBe(3);
  expect(touch.fps.median).toBe(50);
  expect(touch.downscaled).toBeCloseTo(0.67, 2);
  expect(touch.gpus[0]).toEqual({ gpu: sample.gpu, n: 2, fps: 60 });
  const all = aggregate(reports, at);
  expect(all.day.touch.n).toBe(2);
  expect(all.all.desktop.fps.median).toBe(120);
  expect(summarize([]).n).toBe(0);
  const data = { used: 3_000, limit: 300_000 };
  expect(perfPage(all)).not.toContain('Other players today');
  expect(perfPage(all, { players: { used: 12_400, limit: 1_000_000 }, data })).toContain('Other players today: 12,400 of 1,000,000 requests (1%).');
  expect(perfPage(all, { players: { used: 12_400, limit: 1_000_000 }, data })).toContain('Feeds, notes and reports today: 3,000 of 300,000 requests (1%).');
  expect(perfPage(all, { players: { used: 1_000_000, limit: 1_000_000 }, data })).toContain('other players are paused until midnight UTC');
  expect(perfPage(all, { players: { used: 5, limit: 10 }, data: { used: 300_000, limit: 300_000 } })).toContain('Spent: they wait until midnight UTC');
  expect(perfPage(all, { players: { used: 5, limit: Infinity }, data })).toContain('no daily budget');
});

test('hitches: the mean, the median visit and the share in the game\'s own code', () => {
  const reports = [
    parsePerf({ ...sample, hitches: 2, work: 1 })!,
    parsePerf({ ...sample, hitches: 4, work: 0 })!,
    // One slow machine, every frame a hitch, and a client too old to split them.
    parsePerf({ ...sample, hitches: 1800 })!,
  ] as PerfReport[];
  expect(reports[2].work).toBe(-1);
  expect(parsePerf({ ...sample, hitches: 2, work: 5 })!.work).toBe(-1);
  const s = summarize(reports);
  expect(s.hitchesPerMinute).toBe(301);
  expect(s.hitchesMedian).toBe(2);
  expect(s.hitchesWork).toBe(0.17);
  expect(summarize([reports[2]]).hitchesWork).toBeNull();
  expect(perfPage(aggregate(reports))).toContain('<td>17%</td>');
});

test('the client sums up its frame times', () => {
  const frames = Array.from({ length: 600 }, (_, i) => (i % 100 === 0 ? 80 : 16.7));
  const s = summarizeFrames(frames);
  expect(s.frames).toBe(600);
  expect(s.seconds).toBeCloseTo(10.4, 0);
  expect(s.fps).toBeCloseTo(57.7, 0);
  expect(s.p95).toBe(16.7);
  expect(s.hitches).toBe(6);
});

test('versions and battery saver are separated, with old reports in an unknown group', () => {
  const { build: _build, battery: _battery, ...legacy } = parsePerf(sample, 1)!;
  const reports = [
    legacy as PerfReport,
    parsePerf({ ...sample, build: 'build-a', battery: false, fps: 60 }, 2)!,
    parsePerf({ ...sample, build: 'build-a', battery: true, fps: 30 }, 3)!,
    parsePerf({ ...sample, build: 'build-b', battery: false, fps: 55 }, 4)!,
    parsePerf({ ...sample, build: 'build-b', battery: null, fps: 45 }, 5)!,
  ];
  const data = aggregate(reports, 6);
  expect(data.builds).toHaveLength(5);
  expect(data.builds.find((b) => b.build === 'build-a' && b.battery === false)!.touch.fps.median).toBe(60);
  expect(data.builds.find((b) => b.build === 'build-a' && b.battery === true)!.touch.fps.median).toBe(30);
  expect(data.builds[0]).toMatchObject({ build: 'build-b', battery: null, last: 5 });
  expect(data.builds[4]).toMatchObject({ build: '', battery: null });
  expect(data.all.touch.n).toBe(5);
  const page = perfPage(data);
  expect(page).toContain('build-a, battery on, touch');
  expect(page).toContain('build-a, battery off, touch');
  expect(page).toContain('(unknown build), battery unknown or changed, touch');
  expect(parsePerf({ ...sample, build: '<script>', battery: 'on' })!).toMatchObject({ build: '', battery: null });
  expect(parsePerf({ ...sample, build: 'a'.repeat(65) })!.build).toBe('');
});

test('only the most recent twelve version and mode groups are expanded', () => {
  const reports = Array.from({ length: 20 }, (_, i) => parsePerf({ ...sample, build: `build-${i}`, battery: false }, i)!);
  const data = aggregate(reports, 20);
  expect(data.count).toBe(20);
  expect(data.builds).toHaveLength(12);
  expect(data.builds[0].build).toBe('build-19');
  expect(data.builds[11].build).toBe('build-8');
});
