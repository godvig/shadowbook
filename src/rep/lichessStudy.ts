// Import from a public or unlisted Lichess study (all chapters, or one chapter). No token is sent.
import type { DeckSource } from './model/types';

export interface StudyRef {
  study: string;
  chapter?: string;
}

export function parseStudyUrl(input: string): StudyRef | null {
  const m = input.trim().match(/lichess\.org\/study\/([A-Za-z0-9]{8})(?:\/([A-Za-z0-9]{8}))?/);
  if (!m) return /^[A-Za-z0-9]{8}$/.test(input.trim()) ? { study: input.trim() } : null;
  return { study: m[1], chapter: m[2] };
}

/** The server sends Orientation without being asked today, but the API specification says it must be asked for. */
export function studyPgnUrl(s: StudyRef) {
  const path = s.chapter ? `${s.study}/${s.chapter}` : s.study;
  return `https://lichess.org/api/study/${path}.pgn?orientation=true`;
}

/** Where a chapter comes from: its ChapterURL tag when the export has one, else the link that was imported. */
export function chapterSource(tags: Record<string, string>, ref: StudyRef): DeckSource {
  const own = tags.ChapterURL ? parseStudyUrl(tags.ChapterURL) : null;
  const study = own?.study ?? ref.study;
  const chapter = own?.chapter ?? ref.chapter;
  return {
    kind: 'lichess',
    studyId: study,
    chapterId: chapter,
    url: `https://lichess.org/study/${study}${chapter ? '/' + chapter : ''}`,
    ...(tags.StudyName ? { studyName: tags.StudyName } : {}),
  };
}

/** Pasted PGN: a chapter with a ChapterURL is a Lichess chapter, so its deck keeps updating from the study. */
export function pgnSource(tags: Record<string, string>): DeckSource {
  const ref = tags.ChapterURL ? parseStudyUrl(tags.ChapterURL) : null;
  return ref?.chapter ? chapterSource(tags, ref) : { kind: 'pgn' };
}

/** Lichess answers 401 for a private study without a token, 403 when the owner has not allowed export. */
export function studyError(status: number, ref: StudyRef): string {
  if (status === 401) return 'This study is private on Lichess. In the study’s settings, set Visibility to Public or Unlisted, then try again.';
  if (status === 403) return 'The owner of this study does not allow it to be exported. In the study’s settings, Share & export must be set to Everyone.';
  if (status === 404) return ref.chapter ? 'Study or chapter not found. Check the link.' : 'Study not found. Check the link.';
  if (status === 429) return 'Lichess is asking us to slow down. Try again in a minute.';
  return `Lichess answered ${status}. Try again in a minute.`;
}

/** Whether CORS lets the browser see a 401 or 403 is unverified, so the network message covers a private study too. */
export const NETWORK_ERROR = 'Could not reach Lichess, or the study is private. Check the link and the study’s visibility, then try again.';

export async function fetchStudy(input: string, fetcher: typeof fetch = fetch): Promise<{ ref: StudyRef; pgn: string }> {
  const ref = parseStudyUrl(input);
  if (!ref) throw new Error('That is not a Lichess study link.');
  let res: Response;
  try {
    res = await fetcher(studyPgnUrl(ref));
  } catch {
    throw new Error(NETWORK_ERROR);
  }
  if (!res.ok) throw new Error(studyError(res.status, ref));
  return { ref, pgn: await res.text() };
}
