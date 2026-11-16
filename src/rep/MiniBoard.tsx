// A small, static board for deck cards: pieces from Chessground's own piece set, no Chessground instance.
import { createElement } from 'react';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import type { Color } from './model/types';

const ROLES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

export function MiniBoard({ fen, orientation, label }: { fen: string; orientation: Color; label: string }) {
  const pieces: { role: string; color: string; x: number; y: number }[] = [];
  fen
    .split(' ')[0]
    .split('/')
    .forEach((row, r) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) f += Number(ch);
        else {
          const x = orientation === 'w' ? f : 7 - f;
          const y = orientation === 'w' ? r : 7 - r;
          pieces.push({ role: ROLES[ch.toLowerCase()], color: ch === ch.toUpperCase() ? 'white' : 'black', x, y });
          f++;
        }
      }
    });
  return (
    <div className="mini-board cg-wrap" role="img" aria-label={label}>
      {pieces.map((p) =>
        // `piece` elements pick up the piece images from chessground.cburnett.css.
        createElement('piece', { key: `${p.x}${p.y}`, className: `${p.role} ${p.color}`, style: { transform: `translate(${p.x * 100}%, ${p.y * 100}%)` } }),
      )}
    </div>
  );
}
