import type { ReactNode } from 'react';
import { CardDot, GlyphMark } from './marks';
import { moveNumber, type TreeNode } from './tree';

interface Props {
  /** Without it the moves are plain text. */
  onOpen?(line: string[]): void;
  /** Shown after a move, e.g. how often it was played. */
  extra?(node: TreeNode): ReactNode;
  /** The selected move, as its line joined by spaces. */
  current?: string;
}

function Seq({ node, onOpen, extra, current, now, first }: Props & { node: TreeNode; now: Date; first: boolean }) {
  const items: TreeNode[] = [node];
  let cur = node;
  while (cur.children.length === 1) {
    cur = cur.children[0];
    items.push(cur);
  }
  return (
    <>
      {items.map((n, i) => {
        const showNum = n.ply % 2 === 1 || (i === 0 && first);
        const Tag = onOpen ? 'button' : 'span';
        const on = current === n.line.join(' ');
        return (
          <span key={n.line.join(' ')} className="tw">
            <Tag
              className={`tm${n.mine ? ' mine' : ''}${n.mine && !n.main ? ' alt' : ''}${on ? ' on' : ''}`}
              aria-current={on || undefined}
              title={(n.mine ? (n.main ? 'Your main move' : 'Also accepted') : 'Their move') + (n.transposes ? ' · continues elsewhere in the tree' : '')}
              onClick={onOpen && (() => onOpen(n.line))}
            >
              {showNum && <span className="tn">{moveNumber(n.ply)}</span>}
              {n.san}
              <GlyphMark glyph={n.glyph} />
              {n.transposes && <span className="tn"> ⤴</span>}
              <CardDot card={n.card} now={now} />
            </Tag>
            {extra?.(n)}
          </span>
        );
      })}
      {/* A line that stops here, so it is clear where the next branch begins. */}
      {!cur.children.length && !cur.transposes && <span className="tend">end of line</span>}
      {cur.children.length > 1 && (
        <ul className="tb">
          {cur.children.map((c) => (
            <li key={c.uci}>
              <Seq node={c} onOpen={onOpen} extra={extra} current={current} now={now} first />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function RepTree({ nodes, onOpen, extra, current }: Props & { nodes: TreeNode[] }) {
  const now = new Date();
  if (!nodes.length) return <p className="small muted">Nothing here yet.</p>;
  return (
    <div className="rep-tree">
      {nodes.length === 1 ? (
        <Seq node={nodes[0]} onOpen={onOpen} extra={extra} current={current} now={now} first />
      ) : (
        <ul className="tb root">
          {nodes.map((n) => (
            <li key={n.uci}>
              <Seq node={n} onOpen={onOpen} extra={extra} current={current} now={now} first />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
