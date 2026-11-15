import { describe, expect, it } from 'vitest';
import { campaignQuery, countUrl, outsideReferrer, skipReason, type Browser, type Visit } from './counter';

const visitor: Browser = { host: 'shadowbook.godvig.com', doNotTrack: false, automated: false, framed: false, prerendering: false };
const visit: Visit = {
  host: 'shadowbook.godvig.com',
  path: '/world-chess-championship-2026/',
  title: 'Gukesh vs Sindarov',
  referrer: '',
  search: '',
  screenWidth: 390,
};
const sent = (v: Visit) => new URL(countUrl(v, 'abcde')).searchParams;

describe('skipReason', () => {
  it('counts an ordinary visitor on the published site', () => {
    expect(skipReason(visitor)).toBeNull();
  });

  it('counts nothing from a fork, a preview or localhost', () => {
    for (const host of ['localhost:5173', 'someone.github.io', 'shadowbook.godvig.com.evil.example']) {
      expect(skipReason({ ...visitor, host })).toBe('not the published site');
    }
  });

  it('respects Do Not Track and skips robots, frames and prerenders', () => {
    expect(skipReason({ ...visitor, doNotTrack: true })).toMatch(/not to be tracked/);
    expect(skipReason({ ...visitor, automated: true })).toBe('automated browser');
    expect(skipReason({ ...visitor, framed: true })).toBe('inside a frame');
    expect(skipReason({ ...visitor, prerendering: true })).toBe('prerendering');
  });
});

describe('countUrl', () => {
  it('sends the site and path, the title, the screen width and a cache buster', () => {
    const q = sent(visit);
    expect(countUrl(visit, 'abcde').startsWith('https://godvig.goatcounter.com/count?')).toBe(true);
    expect(q.get('p')).toBe('shadowbook.godvig.com/world-chess-championship-2026/');
    expect(q.get('t')).toBe('Gukesh vs Sindarov');
    expect(q.get('s')).toBe('390');
    expect(q.get('rnd')).toBe('abcde');
    expect([...q.keys()].sort()).toEqual(['p', 'rnd', 's', 't']);
  });

  it('never sends the login code or anything else from the query string', () => {
    const url = countUrl({ ...visit, search: '?code=liu_SECRET&state=xyz&utm_source=telegram' }, 'abcde');
    expect(url).not.toContain('SECRET');
    expect(url).not.toContain('xyz');
    expect(sent({ ...visit, search: '?code=liu_SECRET&state=xyz&utm_source=telegram' }).get('q')).toBe('?utm_source=telegram');
  });

  it('keeps non-Latin titles intact', () => {
    expect(sent({ ...visit, title: 'गुकेश बनाम सिंदारोव' }).get('t')).toBe('गुकेश बनाम सिंदारोव');
  });

  it('includes the referrer only when there is one', () => {
    expect(sent(visit).has('r')).toBe(false);
    expect(sent({ ...visit, referrer: 'https://t.me/' }).get('r')).toBe('https://t.me/');
  });
});

describe('campaignQuery', () => {
  it('keeps only the campaign parameters', () => {
    expect(campaignQuery('')).toBe('');
    expect(campaignQuery('?code=abc&state=def')).toBe('');
    expect(campaignQuery('?ref=reddit&x=1&utm_campaign=wcc')).toBe('?utm_campaign=wcc&ref=reddit');
  });
});

describe('outsideReferrer', () => {
  const host = 'shadowbook.godvig.com';

  it('reports another site without its query string', () => {
    expect(outsideReferrer('https://www.google.com/search?q=gukesh+sindarov', host)).toBe('https://www.google.com/search');
    expect(outsideReferrer('https://lichess.org/', host)).toBe('https://lichess.org/');
  });

  it('keeps app links such as Telegram on Android', () => {
    expect(outsideReferrer('android-app://org.telegram.messenger', host)).toBe('android-app://org.telegram.messenger');
  });

  it('is empty for this site itself and for no referrer', () => {
    expect(outsideReferrer('https://shadowbook.godvig.com/', host)).toBe('');
    expect(outsideReferrer('', host)).toBe('');
  });
});
