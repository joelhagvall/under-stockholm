import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import catalog from '../public/audio/catalog.json';
import { ALIGHTING_WARNING_PATH, ANNOUNCEMENT_SIGNAL_PATH, DOOR_WARNING_PATH, RECORDED_ANNOUNCEMENTS } from '../src/game/announcementSignal';
import { DOOR_WARNING, DOOR_SLIDE } from '../src/game/timetable';

const metadata = (path: string) => catalog[path.slice('audio/'.length) as keyof typeof catalog];

// The clips themselves are not in the repository (public/audio/README.md): checked only where they are.
const present = existsSync(new URL('../public/audio/nasta.mp3', import.meta.url));

test.skipIf(!present)('the complete original library is present and matches the imported source hashes', async () => {
  const files = await readdir(new URL('../public/audio/', import.meta.url));
  expect(Object.keys(catalog)).toHaveLength(164);
  expect(files.filter((file) => file.endsWith('.mp3')).sort()).toEqual(Object.keys(catalog).sort());
  expect(files.filter((file) => file.endsWith('.wav'))).toEqual([]);
  for (const [file, entry] of Object.entries(catalog)) {
    const bytes = await Bun.file(new URL(`../public/audio/${file}`, import.meta.url)).arrayBuffer();
    expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    expect(entry.duration).toBeGreaterThan(0);
  }
});

test('all playable sequences have original clips, a single next signal and enough caption time', () => {
  for (const [key, recording] of Object.entries(RECORDED_ANNOUNCEMENTS)) {
    const duration = recording.paths.reduce((sum, path) => sum + metadata(path).duration, 0);
    expect(recording.duration).toBeGreaterThanOrEqual(duration);
    expect(recording.paths).not.toContain(ANNOUNCEMENT_SIGNAL_PATH);
    expect(recording.paths.filter((path) => path === 'audio/nasta.mp3')).toHaveLength(key.endsWith('Approach') ? 1 : 0);
  }
  expect(RECORDED_ANNOUNCEMENTS.tCentralenApproach.paths).toEqual([
    'audio/nasta.mp3', 'audio/tcentralen.mp3', 'audio/bytetill.mp3',
    'audio/ovrigatunnelbana.mp3', 'audio/och.mp3', 'audio/pendeltag.mp3',
  ]);
  expect(metadata(ALIGHTING_WARNING_PATH).duration).toBeLessThan(4.4);
  expect(DOOR_WARNING + DOOR_SLIDE).toBeLessThan(metadata(DOOR_WARNING_PATH).duration);
});
