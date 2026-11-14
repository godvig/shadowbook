// Import from a public Lichess study (all chapters, or one chapter).
import { pgnHeaders } from '../lib/pgn';
import { START_FEN } from '../lib/chess';
import type { Color } from '../lib/types';

export function parseStudyUrl(input: string): { study: string; chapter?: string } | null {
  const m = input.trim().match(/lichess\.org\/study\/([A-Za-z0-9]{8})(?:\/([A-Za-z0-9]{8}))?/);
  if (!m) return /^[A-Za-z0-9]{8}$/.test(input.trim()) ? { study: input.trim() } : null;
  return { study: m[1], chapter: m[2] };
}

export function studyPgnUrl(s: { study: string; chapter?: string }) {
  return s.chapter ? `https://lichess.org/api/study/${s.study}/${s.chapter}.pgn` : `https://lichess.org/api/study/${s.study}.pgn`;
}

export interface Chapter {
  name: string;
  pgn: string;
  /** From the chapter's board orientation, when Lichess exports it. */
  orientation: Color | null;
  /** Chapters that start from a custom position can't be placed in an opening tree. */
  fromStart: boolean;
}

export function splitChapters(text: string): Chapter[] {
  return text
    .split(/\n\s*\n(?=\s*\[Event )/)
    .map((pgn) => pgn.trim())
    .filter(Boolean)
    .map((pgn) => {
      const h = pgnHeaders(pgn);
      const o = (h.Orientation ?? '').toLowerCase();
      return {
        name: h.ChapterName ?? h.Event ?? 'Chapter',
        pgn,
        orientation: o === 'white' ? 'w' : o === 'black' ? 'b' : null,
        fromStart: !h.FEN || h.FEN === START_FEN,
      };
    });
}

export async function fetchStudy(input: string, fetcher: typeof fetch = fetch): Promise<Chapter[]> {
  const ref = parseStudyUrl(input);
  if (!ref) throw new Error('That is not a Lichess study link.');
  const res = await fetcher(studyPgnUrl(ref));
  if (res.status === 404 || res.status === 403) throw new Error('Study not found. Is it public (or unlisted)?');
  if (!res.ok) throw new Error(`Lichess answered ${res.status}. Try again in a minute.`);
  return splitChapters(await res.text());
}
