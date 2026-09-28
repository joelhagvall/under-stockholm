import { expect, test } from 'bun:test';
import { dayNumber } from '../src/game/calendar';
import { edition, isCalm, parseHeadlines, pickHeadline } from '../src/game/news';
import { headline1975, NEWS_1975 } from '../src/game/news1975';

const FEED = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title type="text">P4 Stockholm</title>
<entry><id>a</id><title type="text">Höstdagjämningen är här &#8211; nu kommer mörkret</title><summary type="html">&lt;p&gt;x&lt;/p&gt;</summary><published>2026-09-23T21:46:00+02:00</published></entry>
<entry><id>b</id><title type="text">Flyttförbud för hemlösa getter &amp; får</title><published>2026-09-22T08:10:00+02:00</published></entry>
</feed>`;

test('stories come from the entries, not the feed title, with entities decoded', () => {
  expect(parseHeadlines(FEED)).toEqual([
    { title: 'Höstdagjämningen är här – nu kommer mörkret', published: Date.parse('2026-09-23T21:46:00+02:00') / 1000 },
    { title: 'Flyttförbud för hemlösa getter & får', published: Date.parse('2026-09-22T08:10:00+02:00') / 1000 },
  ]);
});

test('only calm headlines make it to the paper', () => {
  expect(isCalm('Höstdagjämningen är här – nu kommer mörkret')).toBe(true);
  expect(isCalm('Svenskar mellanlandar 640 000 fler gånger än danskar')).toBe(true);
  // "rån" only counts at the start of a word, so "från" is fine.
  expect(isCalm('Nytt tåg från Kungsträdgården i höst')).toBe(true);
  expect(isCalm('Misstänkt mord i Helsingborg – man gripen')).toBe(false);
  expect(isCalm('Försök till grov mordbrand – en gripen')).toBe(false);
  expect(isCalm('Äldre man hittad död i Farstaviken')).toBe(false);
  expect(isCalm('Man tände eld på Egons hår')).toBe(false);
  expect(isCalm('Detta har hänt: Tystnaden från Vänsterpartiet')).toBe(false);
  expect(isCalm('Kort')).toBe(false);
});

const at = (iso: string) => Date.parse(iso) / 1000;
const stories = [
  { title: 'Nytt café öppnar vid Rådhuset i dag', published: at('2026-09-24T09:00:00+02:00') },
  { title: 'Flyttförbud för hemlösa getter i Nacka', published: at('2026-09-23T15:00:00+02:00') },
  { title: 'Höstdagjämningen är här – nu kommer mörkret', published: at('2026-09-23T07:00:00+02:00') },
  { title: 'Äldre man hittad död i Farstaviken', published: at('2026-09-23T12:00:00+02:00') },
  { title: 'Svenskar mellanlandar oftare än danskar', published: at('2026-09-22T10:00:00+02:00') },
];
const today = dayNumber(at('2026-09-24T12:00:00+02:00'));

test("today's edition carries yesterday's calm news", () => {
  expect(edition(stories, today).sort()).toEqual(['Flyttförbud för hemlösa getter i Nacka', 'Höstdagjämningen är här – nu kommer mörkret']);
  // Without yesterday in the feed, older news; without that, anything calm.
  expect(edition(stories.filter((s) => !s.title.startsWith('Flytt') && !s.title.startsWith('Höst')), today)).toEqual(['Svenskar mellanlandar oftare än danskar']);
  expect(edition(stories.slice(0, 1), today)).toEqual(['Nytt café öppnar vid Rådhuset i dag']);
});

test('a paper keeps its headline when other stories come and go', () => {
  const news = ['En rubrik om getter', 'En rubrik om höst', 'En rubrik om flyg', 'En rubrik om tåg'];
  for (let day = 20000; day < 20020; day++) {
    const seat = pickHeadline(news, day, 0);
    expect(pickHeadline([...news].reverse(), day, 0)).toBe(seat);
    expect(pickHeadline([...news.filter((h) => h !== seat).slice(1), seat], day, 0)).toBe(seat);
    expect(pickHeadline([...news, 'En ny rubrik som tillkom'], day, 0) === seat || pickHeadline([...news, 'En ny rubrik som tillkom'], day, 0) === 'En ny rubrik som tillkom').toBe(true);
    expect(pickHeadline(news, day, 1)).not.toBe(seat);
  }
  expect(pickHeadline(['Bara en'], 20000, 1)).toBe('Bara en');
});

test('1975 papers carry real news of their day, in date order, calm and short enough to print', () => {
  const dates = NEWS_1975.map((e) => e.month * 100 + e.day);
  expect(dates).toEqual([...dates].sort((a, b) => a - b));
  for (const e of NEWS_1975) {
    expect(new Date(Date.UTC(1975, e.month - 1, e.day)).getUTCDate()).toBe(e.day);
    expect(isCalm(e.headline)).toBe(true);
  }
  // The day the blue line opened, and weeks after, the papers say so; the day before they do not.
  expect(headline1975(8, 31, 0)).toBe('Konst i berget på nya tunnelbanan');
  expect(headline1975(8, 31, 1)).toBe('Blå linjen invigd: T-Centralen till Hjulsta');
  expect(headline1975(10, 1, 1)).toBe('Blå linjen invigd: T-Centralen till Hjulsta');
  expect([headline1975(8, 30, 0), headline1975(8, 30, 1)]).not.toContain('Blå linjen invigd: T-Centralen till Hjulsta');
  // New Year's Day already has news.
  expect(headline1975(1, 1, 0)).toBe('Bilbälte i framsätet blir lag');
});
