import { useEffect, useRef } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { Chess } from 'chess.js';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import type { Color } from '../lib/types';

interface Props {
  fen: string;
  orientation: Color;
  /** Side the user may move, or null for a read-only board. */
  movable: Color | null;
  lastMove?: string;
  shapes?: DrawShape[];
  onMove?: (uci: string) => void;
}

const toCg = (c: Color) => (c === 'w' ? 'white' : 'black');

function legalDests(fen: string): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const m of new Chess(fen).moves({ verbose: true })) {
    const list = dests.get(m.from as Key) ?? [];
    list.push(m.to as Key);
    dests.set(m.from as Key, list);
  }
  return dests;
}

export function Board({ fen, orientation, movable, lastMove, shapes, onMove }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, {
      animation: { enabled: true, duration: 220 },
      premovable: { enabled: false },
      draggable: { showGhost: true },
      highlight: { lastMove: true, check: true },
    });
    return () => api.current?.destroy();
  }, []);

  useEffect(() => {
    const chess = new Chess(fen);
    const turn = chess.turn();
    const canMove = movable !== null && turn === movable && !chess.isGameOver();
    api.current?.set({
      fen,
      orientation: toCg(orientation),
      turnColor: toCg(turn),
      check: chess.inCheck(),
      lastMove: lastMove ? ([lastMove.slice(0, 2), lastMove.slice(2, 4)] as Key[]) : undefined,
      movable: {
        free: false,
        color: canMove ? toCg(turn) : undefined,
        dests: canMove ? legalDests(fen) : new Map(),
        showDests: true,
        events: {
          after: (orig, dest) => {
            const piece = chess.get(orig as never);
            const promotes = piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1');
            onMoveRef.current?.(orig + dest + (promotes ? 'q' : ''));
          },
        },
      },
      drawable: { autoShapes: shapes ?? [] },
    });
  }, [fen, orientation, movable, lastMove, shapes]);

  return <div className="board" ref={el} />;
}
