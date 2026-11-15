// Real, crawlable addresses for the match hub, one per language. The old #match link redirects to the English one.
// The pages themselves are written by scripts/match-pages.mjs; a test keeps paths and titles in step with it.
export type MatchLang = 'en' | 'sv' | 'uz' | 'hi';

export interface MatchPageInfo {
  path: string;
  /** Browser tab title, the same as the page's <title>. */
  title: string;
  /** Shown above the hub on the translated pages: the app is in English, the description further down is not. */
  note?: string;
}

export const MATCH_PAGES: Record<MatchLang, MatchPageInfo> = {
  en: {
    path: '/world-chess-championship-2026/',
    title: 'Gukesh vs Sindarov: World Chess Championship 2026 predictions and live chat | Shadowbook',
  },
  sv: {
    path: '/sv/schack-vm-2026/',
    title: 'Schack-VM 2026: Gukesh mot Sindarov – tippa varje parti och chatta live | Shadowbook',
    note: 'Läs om matchen och hur det fungerar på svenska ↓',
  },
  uz: {
    path: '/uz/shaxmat-jahon-chempionati-2026/',
    title: 'Sindorov – Gukesh: shaxmat bo‘yicha jahon chempionati 2026 – bashorat va jonli chat | Shadowbook',
    note: 'Bahs va sayt haqida o‘zbek tilida quyida o‘qing ↓',
  },
  hi: {
    path: '/hi/vishwa-shatranj-championship-2026/',
    title: 'गुकेश बनाम सिंदारोव: विश्व शतरंज चैंपियनशिप 2026 – भविष्यवाणी और लाइव चैट | Shadowbook',
    note: 'मुकाबले और साइट की पूरी जानकारी हिन्दी में नीचे पढ़ें ↓',
  },
};

export const MATCH_PATH = MATCH_PAGES.en.path;

/** Which language's match page this address is, or null when it is not a match page. */
export function matchLang(pathname: string): MatchLang | null {
  const withSlash = pathname.endsWith('/') ? pathname : `${pathname}/`;
  for (const lang of Object.keys(MATCH_PAGES) as MatchLang[]) if (MATCH_PAGES[lang].path === withSlash) return lang;
  return null;
}

export const isMatchPath = (pathname: string) => matchLang(pathname) !== null;
