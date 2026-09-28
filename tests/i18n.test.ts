import { expect, test } from 'bun:test';
import { join } from 'node:path';
import sv from '../src/game/i18n/sv.json';
import en from '../src/game/i18n/en.json';
import landingSv from '../src/i18n/sv.json';
import landingEn from '../src/i18n/en.json';
import { lookup, setLang, text } from '../src/game/i18n/text';

type Tree = { [key: string]: unknown };
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Every English string overrides a Swedish one of the same shape and with the same placeholders. */
function sameShape(from: Tree, into: Tree, path = ''): void {
  for (const [key, value] of Object.entries(from)) {
    const at = `${path}${key}`;
    const target = into[key];
    expect(target, at).toBeDefined();
    if (typeof value === 'string') {
      expect(typeof target, at).toBe('string');
      expect(placeholders(value), at).toEqual(placeholders(target as string));
    } else if (Array.isArray(value)) {
      expect(Array.isArray(target), at).toBe(true);
      expect(value.length, at).toBe((target as unknown[]).length);
    } else sameShape(value as Tree, target as Tree, `${at}.`);
  }
}

test('the English menus only override Swedish keys, placeholders intact', () => {
  sameShape(en as Tree, sv as Tree);
});

test('the landing pages have the same strings in both languages', () => {
  sameShape(landingEn as Tree, landingSv as Tree);
  sameShape(landingSv as Tree, landingEn as Tree);
});

test('switching language changes menus in place and leaves the world Swedish', () => {
  const touch = text.touch;
  setLang('en');
  expect(text.touch).toBe(touch);
  expect(text.touch.resume).toBe(en.touch.resume);
  expect(lookup('discover.back')).toBe(en.discover.back);
  // Not in en.json, so still Swedish: an announcement and a sign.
  expect(text.announcements.terminal).toBe(sv.announcements.terminal);
  expect(text.driver.stopSign).toBe(sv.driver.stopSign);
  setLang('sv');
  expect(text.touch.resume).toBe(sv.touch.resume);
});

const page = (path: string) => Bun.file(join(import.meta.dir, '..', path, 'index.html')).text();
const attrs = (html: string, pattern: RegExp) => [...html.matchAll(pattern)].map((m) => m[1]);

test('both landing pages link to each other and to themselves', async () => {
  const pages = { sv: await page(''), en: await page('en') };
  const self = { sv: '%SITE_URL%', en: '%SITE_URL%en/' };
  for (const [lang, html] of Object.entries(pages) as Array<[keyof typeof self, string]>) {
    expect(html).toContain(`<html lang="${lang}">`);
    expect(attrs(html, /rel="canonical" href="([^"]+)"/g)).toEqual([self[lang]]);
    expect(attrs(html, /property="og:url" content="([^"]+)"/g)).toEqual([self[lang]]);
    expect(attrs(html, /hreflang="(?:sv|en|x-default)" href="([^"]+)"/g)).toEqual([self.sv, self.en, self.sv]);
    for (const tag of ['og:title', 'og:description', 'og:image', 'og:image:alt', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
      expect(html, `${lang} ${tag}`).toMatch(new RegExp(`(?:property|name)="${tag}" content="[^"]+"`));
    }
    expect(html).toContain('rel="manifest"');
    const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
    expect(() => JSON.parse(jsonLd)).not.toThrow();
  }
  // The same page underneath: every element the scripts look up is on both.
  const ids = (html: string) => attrs(html, /id="([^"]+)"/g).sort();
  expect(ids(pages.en)).toEqual(ids(pages.sv));
});
