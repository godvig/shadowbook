// Evaluations for the game on screen, kept while the game stays the same and updated as live moves arrive.
import { useEffect, useMemo, useRef, useState } from 'react';
import { START_FEN } from '../lib/chess';
import { CLOUD_REQUESTS_PER_PAGE, GameAnalysis, type AnalysisState, type CloudBudget } from '../eval/analyse';
import { parseGame } from '../eval/pgn';

export function useAnalysis(gameId: number | null, pgn: string, ply: number, opts: { engineOn: boolean; autoLocal: boolean }) {
  const moves = useMemo(() => parseGame(pgn), [pgn]);
  const input = useMemo(() => ({ fens: [START_FEN, ...moves.map((m) => m.fen)], pgnEvals: [undefined, ...moves.map((m) => m.eval)] }), [moves]);
  const [state, setState] = useState<AnalysisState | null>(null);
  const analysis = useRef<GameAnalysis | null>(null);
  const [localAllowed, setLocalAllowed] = useState(opts.autoLocal);
  // At most CLOUD_REQUESTS_PER_PAGE cloud requests while this page is open, across every game shown on it.
  const [budget] = useState<CloudBudget>(() => ({ left: CLOUD_REQUESTS_PER_PAGE }));

  useEffect(() => {
    if (gameId === null) return;
    const a = new GameAnalysis(gameId, setState, { loadEngine: async () => new (await import('../eval/stockfish')).Engine(), budget });
    analysis.current = a;
    setState(null);
    a.setEngine(opts.engineOn);
    if (localAllowed) a.allowLocal();
    void a.start(input, ply);
    return () => {
      a.stop();
      analysis.current = null;
    };
    // A new analysis only for another game; moves, the shown ply and the switches are passed on below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    analysis.current?.update(input, ply);
  }, [input, ply]);
  useEffect(() => {
    analysis.current?.setEngine(opts.engineOn);
  }, [opts.engineOn]);
  useEffect(() => {
    if (localAllowed) analysis.current?.allowLocal();
  }, [localAllowed]);

  return {
    moves,
    fens: input.fens,
    state,
    allowLocal: () => setLocalAllowed(true),
    localAllowed,
    /** Stockfish for the positions the cloud limit left empty, too. */
    startLocal: () => {
      setLocalAllowed(true);
      analysis.current?.startLocal();
    },
  };
}
