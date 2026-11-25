// Small pieces shared by the match hub and the game review page.
import { useState } from 'react';
import { callLabel, communityCall } from './match';
import { NAMES, type Finalist, type Pick } from './types';

/** A finalist's name as on the banner: bold, gold for Gukesh, blue for Sindarov. */
export function PlayerName({ who }: { who: Finalist }) {
  return <strong className={`lv-pname ${who === 'gukesh' ? 'gold' : 'blue'}`}>{NAMES[who]}</strong>;
}

export function CallCell({ votes }: { votes: Partial<Record<Pick, number>> }) {
  const c = communityCall(votes);
  if (c.kind === 'none') return <>–</>;
  if (c.kind === 'few') return <span className="mono lv-muted-text">{callLabel(c)}</span>;
  const label = callLabel(c);
  return (
    <span className="lv-call">
      <span className="lv-split mini" role="img" aria-label={`${c.calls} calls: Gukesh ${c.pct.gukesh}%, draw ${c.pct.draw}%, Sindarov ${c.pct.sindarov}%`}>
        <span className="g" style={{ width: `${c.pct.gukesh}%` }} />
        <span className="d" style={{ width: `${c.pct.draw}%` }} />
        <span className="s" style={{ width: `${c.pct.sindarov}%` }} />
      </span>
      <span className={`mono${c.lead === 'gukesh' ? ' gold' : c.lead === 'sindarov' ? ' blue' : ''}`}>{label}</span>
    </span>
  );
}


/** A yes/no preference kept in this browser (localStorage), e.g. the Engine switch. Works without storage too. */
export function useStoredFlag(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v === '1';
    } catch {
      return fallback;
    }
  });
  return [
    value,
    (v: boolean) => {
      setValue(v);
      try {
        localStorage.setItem(key, v ? '1' : '0');
      } catch {
        // Private mode: the choice lasts for this visit.
      }
    },
  ];
}

/** Keys for those preferences. The arrow has one per kind of game, so its defaults differ (off live, on finished). */
export const PREF = { engine: 'shadowbook.engine', arrowLive: 'shadowbook.arrow.live', arrowFinished: 'shadowbook.arrow.finished' } as const;
