import { describe, expect, it } from 'vitest';
import { buildIcs } from './calendar';
import type { LiveGame } from './types';

const g = (id: number, starts_at: string | null): LiveGame => ({ id, label: `Game ${id}`, white: null, black: null, starts_at, status: 'scheduled', result: null, opening: null, pgn: '' });

describe('calendar reminders', () => {
  it('builds one event per dated game with a 30 minute alarm', () => {
    const ics = buildIcs([g(1, '2026-11-24T13:00:00Z'), g(2, null)], 'https://shadowbook.godvig.com/#match', new Date('2026-11-14T10:00:00Z'))!;
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('DTSTART:20261124T130000Z');
    expect(ics).toContain('DTSTAMP:20261114T100000Z');
    expect(ics).toContain('UID:wcc2026-game-1@shadowbook.godvig.com');
    expect(ics).toContain('TRIGGER:-PT30M');
    expect(ics).toContain('SUMMARY:Gukesh vs Sindarov – Game 1');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it('returns nothing when no game has a start time', () => {
    expect(buildIcs([g(1, null)], 'x')).toBeNull();
  });
});
