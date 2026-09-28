import { expect, test } from 'bun:test';
import { cleanNote, NOTE_MAX } from '../src/game/noteFilter';

test('friendly notes go up, cleaned', () => {
  expect(cleanNote('  Hej  från   Kista!  ')).toBe('Hej från Kista!');
  expect(cleanNote('Glad midsommar ❤')).toBe('Glad midsommar ❤');
  expect(cleanNote('Tack till föraren på 10:an i morse')).toBe('Tack till föraren på 10:an i morse');
  // Innocent words that start like bad ones.
  expect(cleanNote('Killen med saxofonen spelar sexton låtar')).not.toBeNull();
});

test('links, numbers, crude and hateful words stay out', () => {
  expect(cleanNote('kolla www.example.se')).toBeNull();
  expect(cleanNote('ring mig 070 123 45 67')).toBeNull();
  expect(cleanNote('mejla mig på a@b')).toBeNull();
  expect(cleanNote('jävla tåg')).toBeNull();
  expect(cleanNote('x'.repeat(NOTE_MAX + 1))).toBeNull();
  expect(cleanNote('<script>')).toBeNull();
  expect(cleanNote(42)).toBeNull();
});
