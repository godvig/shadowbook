// Calendar reminders: an .ics file with one event per game that has a start time,
// each with an alarm 30 minutes before predictions lock.
import type { LiveGame } from './types';

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** RFC 5545 lines are at most 75 octets; longer ones continue on the next line after a space. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 75;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}

export function buildIcs(games: LiveGame[], url: string, now = new Date()): string | null {
  const dated = games.filter((g) => g.starts_at);
  if (!dated.length) return null;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shadowbook//Match hub//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const g of dated) {
    const start = new Date(g.starts_at!);
    lines.push(
      'BEGIN:VEVENT',
      `UID:wcc2026-game-${g.id}@shadowbook.godvig.com`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      'DURATION:PT5H',
      `SUMMARY:${esc(`Gukesh vs Sindarov – ${g.label}`)}`,
      `DESCRIPTION:${esc(`Predictions lock at the first move. Make your call: ${url}`)}`,
      `URL:${url}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`${g.label} starts in 30 minutes – make your call`)}`,
      'TRIGGER:-PT30M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadIcs(ics: string, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
