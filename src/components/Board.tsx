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
  /** Change it to put the pieces back on `fen`, e.g. after a move that was not accepted. */
  revision?: number;
  /** Arrows and circles the user draws on the board. Without it, drawing is still possible but not reported. */
  onShapes?: (shapes: DrawShape[]) => void;
  /** The user's drawing to show, e.g. the arrows saved on a move. Unlike `shapes`, the user can erase them. */
  drawn?: DrawShape[];
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

// Chessground's default brushes: colour, opacity, line width in 64ths of a square.
const BRUSHES: Record<string, [string, number, number]> = {
  green: ['#15781B', 1, 10],
  red: ['#882020', 1, 10],
  blue: ['#003088', 1, 10],
  yellow: ['#e68f00', 1, 10],
  paleBlue: ['#003088', 0.4, 15],
  paleGreen: ['#15781B', 0.4, 15],
  paleRed: ['#882020', 0.4, 15],
  paleGrey: ['#4a4a4a', 0.35, 15],
};

/**
 * A knight's move drawn as an L: two squares one way, then one to the side, instead of a straight line. Drawn as a
 * custom SVG on the knight's square, in hundredths of a square. Its origin is the square's corner, so the drawing is
 * moved by half a square to start in the middle.
 */
function knightArrow(s: DrawShape, orientation: Color): DrawShape {
  const [color, opacity, width] = BRUSHES[s.brush ?? 'green'] ?? BRUSHES.green;
  const flip = orientation === 'w' ? 1 : -1;
  const df = s.dest!.charCodeAt(0) - s.orig.charCodeAt(0);
  const dr = Number(s.dest![1]) - Number(s.orig[1]);
  const end = [df * flip * 100, -dr * flip * 100];
  const corner = Math.abs(dr) === 2 ? [0, end[1]] : [end[0], 0];
  const unit = [Math.sign(end[0] - corner[0]), Math.sign(end[1] - corner[1])];
  const lw = (width / 64) * 100;
  const tip = [end[0] - unit[0] * 10, end[1] - unit[1] * 10];
  const base = [tip[0] - unit[0] * lw * 2.6, tip[1] - unit[1] * lw * 2.6];
  const side = [unit[1] * lw * 1.8, -unit[0] * lw * 1.8];
  const html =
    `<g transform="translate(50 50)" opacity="${opacity}">` +
    `<polyline points="0,0 ${corner.join(',')} ${base.join(',')}" fill="none" stroke="${color}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<polygon fill="${color}" points="${tip.join(',')} ${base[0] + side[0]},${base[1] + side[1]} ${base[0] - side[0]},${base[1] - side[1]}"/></g>`;
  return { orig: s.orig, customSvg: { html, center: 'orig' } };
}

/**
 * Only a knight moves in an L, so every arrow of that shape is drawn as one. Going by the shape alone also covers an
 * arrow shown after the knight has already moved, e.g. the right move after a wrong one.
 */
function withKnightArrows(shapes: DrawShape[], orientation: Color): DrawShape[] {
  return shapes.map((s) => {
    if (!s.dest || s.customSvg || s.piece) return s;
    const df = Math.abs(s.dest.charCodeAt(0) - s.orig.charCodeAt(0));
    const dr = Math.abs(Number(s.dest[1]) - Number(s.orig[1]));
    return (df === 1 && dr === 2) || (df === 2 && dr === 1) ? knightArrow(s, orientation) : s;
  });
}

/** The squares whose piece differs between two positions. */
function squaresChanged(a: string, b: string): number {
  const expand = (fen: string) => fen.split(' ')[0].replace(/\d/g, (n) => '.'.repeat(Number(n)));
  const x = expand(a);
  const y = expand(b);
  let n = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) n++;
  return n;
}

export function Board({ fen, orientation, movable, lastMove, shapes, onMove, revision, onShapes, drawn }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onShapesRef = useRef(onShapes);
  onShapesRef.current = onShapes;
  const shown = useRef(fen);

  useEffect(() => {
    if (!el.current) return;
    // Starts on the position itself, so a new board does not animate every piece in from the initial position.
    api.current = Chessground(el.current, {
      fen,
      orientation: toCg(orientation),
      animation: { enabled: true, duration: 220 },
      premovable: { enabled: false },
      draggable: { showGhost: true },
      highlight: { lastMove: true, check: true },
      drawable: { onChange: (s) => onShapesRef.current?.(s) },
    });
    return () => api.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const chess = new Chess(fen);
    const turn = chess.turn();
    const canMove = movable !== null && turn === movable && !chess.isGameOver();
    // One move changes at most four squares (castling). A bigger jump, such as the next card, is shown at once
    // rather than with every piece sliding across the board.
    const jump = squaresChanged(shown.current, fen) > 4;
    shown.current = fen;
    if (jump) api.current?.set({ animation: { enabled: false } });
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
      drawable: { autoShapes: withKnightArrows(shapes ?? [], orientation), ...(drawn ? { shapes: drawn } : {}) },
    });
    if (jump) api.current?.set({ animation: { enabled: true } });
  }, [fen, orientation, movable, lastMove, shapes, revision, drawn]);

  return <div className="board" ref={el} />;
}
