// The evaluation bar beside a match board: White's share fills from the bottom, the number sits on it.
import { scoreText, whiteShare } from '../eval/winChances';
import type { Score } from '../eval/types';

export function EvalBar({ score, busy }: { score?: Score; busy?: boolean }) {
  const share = score ? whiteShare(score) : 0.5;
  const text = score ? scoreText(score) : '';
  const whiteBetter = share >= 0.5;
  const label = score ? `Evaluation ${text}: ${share > 0.55 ? 'White is better' : share < 0.45 ? 'Black is better' : 'about equal'}` : busy ? 'Analysing' : 'No evaluation yet';
  return (
    <div className={`lv-evalbar${score ? '' : ' empty'}${busy && !score ? ' busy' : ''}`} role="img" aria-label={label} title={label}>
      <div className="fill" style={{ height: `${share * 100}%` }} />
      <div className="mid" />
      {text && <span className={`num ${whiteBetter ? 'low' : 'high'}`}>{text}</span>}
    </div>
  );
}
