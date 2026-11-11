import type { Maia3 } from 'maia3-js/web';

/**
 * Maia3 is a neural network trained to predict the move a human of a given rating would play.
 * It is loaded lazily (~22 MB, cached by the browser) the first time the bot leaves the book.
 */
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
