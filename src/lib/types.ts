export type Color = 'w' | 'b';
export type Site = 'chess.com' | 'lichess' | 'pgn' | 'demo' | 'preset';
export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily' | 'unknown';
export type Result = '1-0' | '0-1' | '1/2-1/2' | '*';

/** A game reduced to what sparring needs: who played, how it ended and the moves in UCI. */
export interface Game {
  id: string;
  white: string;
  black: string;
  whiteElo?: number;
  blackElo?: number;
  result: Result;
  timeClass: TimeClass;
  /** Unix ms when the game ended (0 if unknown). */
  end: number;
  /** Moves in UCI, possibly truncated to the opening phase. */
  ucis: string[];
}

export interface PlayerRef {
  site: Site;
  username: string;
}
