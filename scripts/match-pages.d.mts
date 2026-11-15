// Types for match-pages.mjs, so the TypeScript tests can import it.
export interface MatchPage {
  lang: string;
  /** The language's own name, used in the links between the pages. */
  label: string;
  path: string;
  ogLocale: string;
  title: string;
  description: string;
  ogTitle: string;
  ogImageAlt: string;
  eventName: string;
  /** The challenger's name as written in this language, when it differs from the international spelling. */
  challengerAlias?: string;
  heading: string;
  intro: string[];
  howHeading: string;
  /** [bold lead, rest of the line]; the rest may contain HTML. */
  how: [string, string][];
  faqHeading: string;
  faq: [string, string][];
  homeLink: string;
  sourceLink: string;
}

export const SITE: string;
export const PAGES: MatchPage[];
export function renderPage(page: MatchPage): string;
export function renderSitemap(): string;
export function fileFor(page: MatchPage): string;
