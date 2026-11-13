import type { Maia3 } from 'maia3-js/web';

/**
 * Maia3 is a neural network trained to predict the move a human of a given rating would play.
 * It is loaded lazily (~22 MB, cached by the browser) the first time the bot leaves the book.
 */
/**
 * The ratings the bot can be asked to play at. maia3-js accepts any selfElo and clamps it to 0–5000,
 * but it learned from games of human players and a rating far above theirs is extrapolation, not
 * extra strength. 2600 is the top of what we offer: a strong human, not a world champion.
 */
export const MAIA_ELO_MIN = 600;
export const MAIA_ELO_MAX = 2600;
export const clampElo = (elo: number) => Math.min(MAIA_ELO_MAX, Math.max(MAIA_ELO_MIN, elo));

let instance: Promise<Maia3> | null = null;
const listeners = new Set<(pct: number) => void>();

export function onMaiaProgress(fn: (pct: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function loadMaia(): Promise<Maia3> {
  if (!instance) {
    const base = import.meta.env.BASE_URL;
    instance = import('maia3-js/web').then(async ({ Maia3 }) => {
      const maia = new Maia3({
        variant: '5m',
        url: `${base}models/maia3_5m.onnx`,
        onProgress: (loaded, total) => listeners.forEach((fn) => fn(total ? loaded / total : 0)),
      });
      await maia.load();
      listeners.forEach((fn) => fn(1));
      return maia;
    });
    instance.catch(() => {
      instance = null;
    });
  }
  return instance;
}
