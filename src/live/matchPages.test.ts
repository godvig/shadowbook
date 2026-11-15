import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGES, SITE, fileFor, renderPage, renderSitemap } from '../../scripts/match-pages.mjs';
import { MATCH_PAGES, isMatchPath, matchLang, type MatchLang } from './routes';

const root = resolve(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('match pages', () => {
  it('has one written page per language the app knows', () => {
    expect(PAGES.map((p) => p.lang).sort()).toEqual(Object.keys(MATCH_PAGES).sort());
  });

  for (const page of PAGES) {
    const info = MATCH_PAGES[page.lang as MatchLang];

    it(`${page.lang}: the committed page is what the script writes`, () => {
      expect(read(fileFor(page))).toBe(renderPage(page));
    });

    it(`${page.lang}: path and title match the app`, () => {
      expect(page.path).toBe(info.path);
      expect(page.title).toBe(info.title);
    });

    it(`${page.lang}: head tags point to itself and to every other language`, () => {
      const html = renderPage(page);
      expect(html).toContain(`<html lang="${page.lang}">`);
      expect(html).toContain(`<link rel="canonical" href="${SITE}${page.path}" />`);
      for (const other of PAGES) expect(html).toContain(`<link rel="alternate" hreflang="${other.lang}" href="${SITE}${other.path}" />`);
      expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="${SITE}${MATCH_PAGES.en.path}" />`);
    });

    it(`${page.lang}: structured data is valid JSON with all five questions`, () => {
      const json = renderPage(page).match(/<script type="application\/ld\+json">\n([\s\S]*?)\n\s*<\/script>/)![1];
      const [event, faq] = JSON.parse(json) as [{ name: string; startDate: string; url: string }, { mainEntity: unknown[] }];
      expect(event.name).toBe(page.eventName);
      expect(event.startDate).toBe('2026-11-24');
      expect(event.url).toBe(`${SITE}${page.path}`);
      expect(faq.mainEntity).toHaveLength(5);
    });

    it(`${page.lang}: is in the sitemap and in the build`, () => {
      expect(read('public/sitemap.xml')).toContain(`<loc>${SITE}${page.path}</loc>`);
      if (page.lang !== 'en') expect(read('vite.config.ts')).toContain(`'${fileFor(page)}'`);
    });

    it(`${page.lang}: says the same facts as the English page`, () => {
      // Every translation keeps the numbers: 14 games, 24 November, 11 and 12 December, 30 seconds, 3 extra points.
      const text = [...page.intro, ...page.how.map(([a, b]) => a + b), ...page.faq.map(([q, a]) => q + a)].join(' ');
      for (const n of ['14', '24', '2026', '11', '12', '30', '3']) expect(text).toMatch(new RegExp(`(^|\\D)${n}(\\D|$)`));
      expect(page.how).toHaveLength(5);
      expect(page.description.length).toBeLessThanOrEqual(230);
    });
  }

  it('the committed sitemap is what the script writes', () => {
    expect(read('public/sitemap.xml')).toBe(renderSitemap());
  });

  it('recognises every match address, with or without the trailing slash', () => {
    expect(matchLang('/world-chess-championship-2026/')).toBe('en');
    expect(matchLang('/world-chess-championship-2026')).toBe('en');
    expect(matchLang('/sv/schack-vm-2026/')).toBe('sv');
    expect(matchLang('/uz/shaxmat-jahon-chempionati-2026/')).toBe('uz');
    expect(matchLang('/hi/vishwa-shatranj-championship-2026')).toBe('hi');
    expect(matchLang('/')).toBeNull();
    expect(isMatchPath('/hi/')).toBe(false);
  });
});
