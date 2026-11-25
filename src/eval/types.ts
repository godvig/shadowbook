// Evaluations of match positions, from whichever source had one first (eval/source.ts).

/** A score from White's side: centipawns, or mate in N (negative: Black mates). */
export interface Score {
  cp?: number;
  mate?: number;
  /** The game is over in this position: checkmate or stalemate (a draw also has cp 0). */
  over?: '1-0' | '0-1' | '1/2-1/2';
}

export type EvalSource = 'pgn' | 'file' | 'cloud' | 'local';

/** The evaluation of one position. */
export interface PosEval extends Score {
  /** The engine's best move in UCI, when the source gives one (the broadcast's [%eval] does not). */
  best?: string;
  /** The second-best line's score, when the source analysed two lines; needed for the "!" only-move mark. */
  second?: Score;
  depth?: number;
  source: EvalSource;
}
