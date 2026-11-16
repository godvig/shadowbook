import { describe, expect, it } from 'vitest';
import { chapterSource, fetchStudy, NETWORK_ERROR, parseStudyUrl, studyPgnUrl } from './lichessStudy';

const answering = (status: number, body = '') => (async () => new Response(body, { status })) as unknown as typeof fetch;

describe('Lichess study', () => {
  it('parses links and asks for the orientation tag', () => {
    expect(parseStudyUrl('https://lichess.org/study/AbCd1234')).toEqual({ study: 'AbCd1234', chapter: undefined });
    expect(parseStudyUrl('lichess.org/study/AbCd1234/XyZ98765#3')).toEqual({ study: 'AbCd1234', chapter: 'XyZ98765' });
    expect(parseStudyUrl('https://example.com')).toBeNull();
    expect(studyPgnUrl({ study: 'AbCd1234' })).toBe('https://lichess.org/api/study/AbCd1234.pgn?orientation=true');
    expect(studyPgnUrl({ study: 'AbCd1234', chapter: 'XyZ98765' })).toBe('https://lichess.org/api/study/AbCd1234/XyZ98765.pgn?orientation=true');
  });

  it('takes the chapter id from ChapterURL, else from the link', () => {
    expect(chapterSource({ ChapterURL: 'https://lichess.org/study/AbCd1234/XyZ98765' }, { study: 'AbCd1234' })).toEqual({
      kind: 'lichess',
      studyId: 'AbCd1234',
      chapterId: 'XyZ98765',
      url: 'https://lichess.org/study/AbCd1234/XyZ98765',
    });
    expect(chapterSource({}, { study: 'AbCd1234' })).toMatchObject({ studyId: 'AbCd1234', chapterId: undefined });
  });

  it('explains each refusal', async () => {
    const link = 'https://lichess.org/study/AbCd1234';
    expect(await fetchStudy(link, answering(200, '1. e4 *'))).toEqual({ ref: { study: 'AbCd1234', chapter: undefined }, pgn: '1. e4 *' });
    await expect(fetchStudy(link, answering(401))).rejects.toThrow('This study is private on Lichess.');
    await expect(fetchStudy(link, answering(403))).rejects.toThrow('The owner of this study does not allow it to be exported.');
    await expect(fetchStudy(link, answering(404))).rejects.toThrow('Study not found. Check the link.');
    await expect(fetchStudy(link + '/XyZ98765', answering(404))).rejects.toThrow('Study or chapter not found. Check the link.');
    await expect(fetchStudy(link, answering(429))).rejects.toThrow('Lichess is asking us to slow down.');
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(fetchStudy(link, offline)).rejects.toThrow(NETWORK_ERROR);
    // Not "nonsense": eight letters is a valid bare study id, and that would reach the network.
    await expect(fetchStudy('not a link', offline)).rejects.toThrow('That is not a Lichess study link.');
  });
});
