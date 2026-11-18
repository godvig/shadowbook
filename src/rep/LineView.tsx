// One line of a deck at a time: from the first move to the end of the line through the selected move, following the
// main move after it. Where the line could have gone another way, those moves sit right after the move as
// "or …" buttons that switch to that line.
import { cardId } from './model/cards';
import { childrenOf } from './model/deck';
import { lineThrough } from './model/lines';
import type { Card, Deck, Edge } from './model/types';
import { CardDot, GlyphMark } from './marks';
import { moveNumber } from './tree';

export function LineView({ deck, edges, cards, path, onOpen }: { deck: Pick<Deck, 'color'>; edges: Edge[]; cards: Map<string, Card>; path: string[]; onOpen(line: string[]): void }) {
  const kids = childrenOf(edges);
  const { moves, repeats } = lineThrough(edges, path);
  const now = new Date();
  const ucis = moves.map((e) => e.uci);
  if (!moves.length) return <p className="small muted">Nothing here yet. Play a move on the board to start.</p>;
  return (
    <div className="rep-tree line-view">
      {moves.map((e, i) => {
        const others = (kids.get(e.from) ?? []).filter((x) => x.uci !== e.uci);
        // Black's move gets its number when it starts the line or follows a list of other moves.
        const numbered = i % 2 === 0 || i === 0 || (kids.get(moves[i - 1].from)?.length ?? 0) > 1;
        const selected = i === path.length - 1;
        return (
          <span key={i} className="tw">
            <button
              className={`tm${e.mine ? ' mine' : ''}${e.mine && e.rank > 0 ? ' alt' : ''}${selected ? ' on' : ''}`}
              aria-current={selected || undefined}
              title={e.mine ? (e.rank === 0 ? 'Your main move' : 'Also counts as right') : 'Their move'}
              onClick={() => onOpen(ucis.slice(0, i + 1))}
            >
              {numbered && <span className="tn">{moveNumber(i + 1)}</span>}
              {e.san}
              <GlyphMark glyph={e.glyph} />
              {e.mine && e.rank === 0 && <CardDot card={cards.get(cardId(deck.color, e.from, e.uci))} now={now} />}
            </button>
            {others.length > 0 && (
              <span className="alts">
                <span className="muted">or</span>
                {others.map((o) => (
                  <button key={o.uci} className={`alt-move${o.mine ? ' mine' : ''}`} onClick={() => onOpen([...ucis.slice(0, i), o.uci])} title="Switch to this line">
                    {moveNumber(i + 1)}
                    {o.san}
                  </button>
                ))}
              </span>
            )}
          </span>
        );
      })}
      <span className="tend">{repeats ? '⤴ back to an earlier position' : 'end of line'}</span>
    </div>
  );
}
