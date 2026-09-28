/**
 * Real news from 1975 for the time machine's papers: dated events, in our own
 * words, checked against Swedish Wikipedia (September 2026). The paper dated
 * a day in 1975 carries the latest news up to that day, so the front page
 * moves through the year as the real one did. Only calm news, like today's
 * papers. Add events in date order; `tests/news.test.ts` checks the list.
 */

export interface Event1975 {
  month: number;
  day: number;
  headline: string;
}

export const NEWS_1975: readonly Event1975[] = [
  { month: 1, day: 1, headline: 'Ny grundlag börjar gälla' },
  { month: 1, day: 1, headline: 'Bilbälte i framsätet blir lag' },
  { month: 3, day: 16, headline: 'Mariner 10 passerar Merkurius igen' },
  { month: 3, day: 22, headline: 'Eurovision i Stockholm: Nederländerna vinner' },
  { month: 3, day: 22, headline: 'Lars Berghagen sjunger Jennie, Jennie för Sverige' },
  { month: 3, day: 22, headline: 'Alternativfestivalen utmanar schlagern' },
  { month: 5, day: 16, headline: 'Junko Tabei första kvinnan på Mount Everest' },
  { month: 6, day: 5, headline: 'Suezkanalen öppnar igen efter åtta år' },
  { month: 7, day: 1, headline: 'Gärderud sätter världsrekord på hinder' },
  { month: 7, day: 17, headline: 'Apollo och Sojuz möts i rymden' },
  { month: 8, day: 20, headline: 'Viking 1 lyfter mot Mars' },
  { month: 8, day: 31, headline: 'Blå linjen invigd: T-Centralen till Hjulsta' },
  { month: 8, day: 31, headline: 'Konst i berget på nya tunnelbanan' },
  { month: 10, day: 22, headline: 'Venera 9 sänder första bilderna från Venus' },
  { month: 12, day: 21, headline: 'Sverige vinner Davis Cup för första gången' },
  { month: 12, day: 24, headline: 'Karl-Bertil Jonsson i TV på julafton' },
];

/**
 * Paper `paper`'s headline on `month`/`day` in 1975: the latest news up to
 * that day, a different story for each paper while there are enough.
 */
export function headline1975(month: number, day: number, paper: number): string {
  const date = month * 100 + day;
  const known = NEWS_1975.filter((e) => e.month * 100 + e.day <= date);
  const latest = known.slice(-2).reverse();
  return latest[paper % latest.length].headline;
}
