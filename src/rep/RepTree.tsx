import { State } from 'ts-fsrs';
import { moveNumber, type TreeNode } from './tree';

function status(n: TreeNode, now: Date) {
  if (!n.entry) return '';
  const c = n.entry.card;
  if (c.state === State.New) return 'new';
  return new Date(c.due) <= now ? 'due' : 'ok';
}

function Seq({ node, onOpen, now, first }: { node: TreeNode; onOpen(line: string[]): void; now: Date; first: boolean }) {
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
        const st = status(n, now);
        return (
          <button
            key={n.line.join(' ')}
            className={`tm${n.entry ? ' mine' : ''}${n.entry && !n.main ? ' alt' : ''}`}
            title={n.entry ? (n.main ? 'Your main move' : 'Also accepted') : 'Their move'}
            onClick={() => onOpen(n.line)}
          >
            {showNum && <span className="tn">{moveNumber(n.ply)}</span>}
            {n.san}
            {st && <span className={`dot ${st}`} />}
          </button>
        );
      })}
      {cur.children.length > 1 && (
        <ul className="tb">
          {cur.children.map((c) => (
            <li key={c.uci}>
              <Seq node={c} onOpen={onOpen} now={now} first />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function RepTree({ nodes, onOpen }: { nodes: TreeNode[]; onOpen(line: string[]): void }) {
  const now = new Date();
  if (!nodes.length) return <p className="small muted">Nothing here yet.</p>;
  return (
    <div className="rep-tree">
      {nodes.length === 1 ? (
        <Seq node={nodes[0]} onOpen={onOpen} now={now} first />
      ) : (
        <ul className="tb root">
          {nodes.map((n) => (
            <li key={n.uci}>
              <Seq node={n} onOpen={onOpen} now={now} first />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
