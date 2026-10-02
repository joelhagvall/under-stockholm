import { expect, test } from 'bun:test';
import { cleanNote, composeNote, GAP, PHRASES, STATIONS, THINGS, wordsFor } from '../src/game/notePhrases';

test('notes are put together from the parts and go up as they are', () => {
  expect(cleanNote('Hej alla!')).toBe('Hej alla!');
  expect(cleanNote('Hälsningar från Kista')).toBe('Hälsningar från Kista');
  expect(cleanNote('Leta efter skyddsrummet')).toBe('Leta efter skyddsrummet');
  // A gap that opens the note is capitalised.
  expect(composeNote({ text: `${GAP} var här`, gap: 'thing' }, 'duvorna')).toBe('Duvorna var här');
  expect(cleanNote('Duvorna var här')).toBe('Duvorna var här');
});

test('every note the parts can make is one the relay takes, and fits on a paper', () => {
  for (const phrase of PHRASES) {
    expect(phrase.text.includes(GAP)).toBe(Boolean(phrase.gap));
    for (const word of phrase.gap ? wordsFor(phrase) : ['']) {
      const note = composeNote(phrase, word);
      expect(cleanNote(note)).toBe(note);
      expect(note.length).toBeLessThanOrEqual(48);
    }
  }
  expect(STATIONS.length).toBe(100);
  expect(new Set(THINGS).size).toBe(THINGS.length);
});

test('a station never goes where it could be warned against', () => {
  expect(cleanNote('Akta dig för T-Centralen')).toBeNull();
  expect(cleanNote('Akta dig för kontrollanterna')).not.toBeNull();
});

test('anything typed is refused, however it is spelled', () => {
  for (const typed of ['Hej från mig', 'Tack till föraren', 'hej alla!', 'Hej alla! ', 'Hälsningar från Narnia', 'kolla www.example.se', '<script>', '', 42, null]) {
    expect(cleanNote(typed)).toBeNull();
  }
});
