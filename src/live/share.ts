// Share cards for Shadowbook Live: a 1080×1080 image of your call (or "Called it" after the game),
// drawn on a canvas in the browser, plus the text and links that go with it.
import type { Pick } from './types';

export const PAWN_PATH =
  'M-50,0 L-50,-12 Q-50,-18 -44,-18 L44,-18 Q50,-18 50,-12 L50,0 Z M-34,-18 C-30,-50 -22,-74 -14,-96 L14,-96 C22,-74 30,-50 34,-18 Z M-30,-100 Q-30,-108 -22,-108 L22,-108 Q30,-108 30,-100 Q30,-94 22,-94 L-22,-94 Q-30,-94 -30,-100 Z M-12,-108 L12,-108 L10,-116 L-10,-116 Z M-24,-132 a24,24 0 1,0 48,0 a24,24 0 1,0 -48,0 Z';

const C = { bg: '#07080A', text: '#E9EAEE', text2: '#C9CDD4', muted: '#9AA1AD', gold: '#F2B544', blue: '#6CB4F5', line: '#3A404C' };
const DISPLAY = '"Big Shoulders Display", "Space Grotesk", Impact, sans-serif';
const MONO = '"IBM Plex Mono", "JetBrains Mono", monospace';
const SANS = '"IBM Plex Sans", Inter, system-ui, sans-serif';

export const PICK_LABEL: Record<Pick, string> = { gukesh: 'Gukesh wins', draw: 'Draw', sindarov: 'Sindarov wins' };
const PICK_COLOR: Record<Pick, string> = { gukesh: C.gold, draw: C.text, sindarov: C.blue };

export interface CardData {
  game: number;
  pick: Pick;
  pct: Record<Pick, number>;
  /** Set after the game when the call was right. */
  called?: boolean;
  points?: number;
}

export function shareUrl(origin: string, base: string): string {
  return `${origin}${base}#match`;
}

export function shareText(d: CardData): string {
  const agree = d.pct[d.pick];
  if (d.called) {
    const outcome = d.pick === 'draw' ? 'ended in a draw' : `went to ${d.pick === 'gukesh' ? 'Gukesh' : 'Sindarov'}`;
    const crowd = agree < 34 ? `and only ${agree}% saw it coming` : `along with ${agree}% of the crowd`;
    return `Called it: game ${d.game} of Gukesh vs Sindarov ${outcome}, ${crowd}.`;
  }
  return `My call for game ${d.game} of Gukesh vs Sindarov: ${PICK_LABEL[d.pick].toLowerCase()} (${agree}% agree). What's yours?`;
}

export function xIntent(text: string, url: string): string {
  return `https://x.com/intent/post?${new URLSearchParams({ text, url })}`;
}

/** Waits for the card fonts so the first draw is not in a fallback face. */
export async function loadCardFonts(): Promise<void> {
  if (!('fonts' in document)) return;
  await Promise.all([`800 100px ${DISPLAY}`, `500 20px ${MONO}`, `500 20px ${SANS}`].map((f) => document.fonts.load(f).catch(() => [])));
}

function stage(ctx: CanvasRenderingContext2D, w: number, h: number, pawnX: number, floorY: number, scale: number) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);
  // spotlight
  const cone = ctx.createRadialGradient(pawnX, 0, 0, pawnX, 0, floorY * 1.15);
  cone.addColorStop(0, 'rgba(242,181,68,0.30)');
  cone.addColorStop(0.55, 'rgba(242,181,68,0.06)');
  cone.addColorStop(1, 'rgba(242,181,68,0)');
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(pawnX - w * 0.07, 0);
  ctx.lineTo(pawnX + w * 0.07, 0);
  ctx.lineTo(pawnX + w * 0.24, floorY);
  ctx.lineTo(pawnX - w * 0.24, floorY);
  ctx.closePath();
  ctx.fill();
  // checker floor in perspective, fading out
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, floorY - 30, w, h - floorY + 30);
  ctx.clip();
  const sq = 44;
  for (let r = 0; r < 14; r++) {
    for (let c = -30; c < 30; c++) {
      if ((r + c) % 2) continue;
      const y0 = floorY - 30 + r * sq * 0.32;
      ctx.fillStyle = '#1B1E24';
      ctx.fillRect(pawnX + c * sq, y0, sq, sq * 0.32);
    }
  }
  const fade = ctx.createLinearGradient(0, floorY - 30, 0, h);
  fade.addColorStop(0, 'rgba(7,8,10,0.2)');
  fade.addColorStop(1, 'rgba(7,8,10,0.95)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, floorY - 30, w, h - floorY + 30);
  ctx.restore();
  // shadow pool + pawn
  const pool = ctx.createRadialGradient(pawnX, floorY, 0, pawnX, floorY, 80 * scale);
  pool.addColorStop(0, 'rgba(0,0,0,0.95)');
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(pawnX, floorY);
  ctx.scale(1, 0.22);
  ctx.translate(-pawnX, -floorY);
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(pawnX, floorY, 80 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(pawnX, floorY);
  ctx.scale(scale, scale);
  const body = ctx.createLinearGradient(0, -132, 0, 0);
  body.addColorStop(0, '#4A4F58');
  body.addColorStop(0.3, '#17191E');
  body.addColorStop(1, '#040506');
  const pawn = new Path2D(PAWN_PATH);
  ctx.fillStyle = body;
  ctx.fill(pawn);
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = 'rgba(242,181,68,0.4)';
  ctx.stroke(pawn);
  ctx.restore();
}

function logo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.lineWidth = size * 0.08;
  ctx.strokeStyle = C.gold;
  ctx.beginPath();
  ctx.arc(x + size * 0.38, y, size * 0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = C.blue;
  ctx.beginPath();
  ctx.arc(x + size * 0.62, y, size * 0.28, 0, Math.PI * 2);
  ctx.stroke();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, start: number, maxWidth: number): number {
  let px = start;
  ctx.font = font(px);
  while (px > 20 && ctx.measureText(text).width > maxWidth) ctx.font = font((px -= 4));
  return px;
}

/** Draws the 1080×1080 share card. */
export function drawCard(canvas: HTMLCanvasElement, d: CardData): void {
  const W = 1080;
  canvas.width = W;
  canvas.height = W;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  stage(ctx, W, W, W / 2, 900, 1.95);

  // header
  logo(ctx, 64, 92, 56);
  ctx.fillStyle = C.text;
  ctx.font = `800 40px ${DISPLAY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('SHADOWBOOK', 132, 94);
  ctx.textAlign = 'right';
  ctx.font = `500 22px ${MONO}`;
  ctx.fillStyle = C.text2;
  ctx.fillText('WORLD CHAMPIONSHIP 2026', W - 64, 94);

  // the call
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `500 30px ${MONO}`;
  ctx.fillStyle = C.text2;
  ctx.fillText(d.called ? `GAME ${d.game} · CALLED IT` : `MY CALL · GAME ${d.game}`, W / 2, 205);
  const label = PICK_LABEL[d.pick].toUpperCase();
  fitText(ctx, label, (px) => `800 ${px}px ${DISPLAY}`, 190, W - 128);
  ctx.fillStyle = PICK_COLOR[d.pick];
  ctx.fillText(label, W / 2, 400);
  ctx.font = `500 30px ${SANS}`;
  ctx.fillStyle = C.text;
  const agree = d.pct[d.pick];
  const sub = d.called ? `${agree < 34 ? `Only ${agree}%` : `${agree}%`} of predictors saw it coming${d.points ? ` · +${d.points} ${d.points === 1 ? 'point' : 'points'}` : ''}` : `${agree}% of predictors agree`;
  ctx.fillText(sub, W / 2, 462);

  // the crowd split
  const bx = 120;
  const bw = W - 240;
  let x = bx;
  (['gukesh', 'draw', 'sindarov'] as Pick[]).forEach((p) => {
    const segW = (bw * d.pct[p]) / Math.max(1, d.pct.gukesh + d.pct.draw + d.pct.sindarov);
    ctx.fillStyle = p === 'gukesh' ? C.gold : p === 'sindarov' ? C.blue : '#5B626E';
    ctx.fillRect(x, 506, Math.max(0, segW - 3), 14);
    x += segW;
  });
  ctx.font = `500 22px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = C.gold;
  ctx.fillText(`GUKESH ${d.pct.gukesh}%`, bx, 556);
  ctx.textAlign = 'center';
  ctx.fillStyle = C.text2;
  ctx.fillText(`DRAW ${d.pct.draw}%`, W / 2, 556);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.blue;
  ctx.fillText(`SINDAROV ${d.pct.sindarov}%`, bx + bw, 556);

  // footer
  ctx.textAlign = 'center';
  ctx.font = `600 30px ${SANS}`;
  ctx.fillStyle = C.text;
  ctx.fillText('Make your call at shadowbook.godvig.com', W / 2, 1010);
}

/** Draws the 1200×630 link preview image (Open Graph). */
export function drawOg(canvas: HTMLCanvasElement): void {
  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  stage(ctx, W, H, W / 2, 545, 1.9);
  ctx.textBaseline = 'alphabetic';
  logo(ctx, 56, 70, 48);
  ctx.font = `800 34px ${DISPLAY}`;
  ctx.fillStyle = C.text;
  ctx.textBaseline = 'middle';
  ctx.fillText('SHADOWBOOK', 116, 72);
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 124px ${DISPLAY}`;
  ctx.fillStyle = C.gold;
  ctx.fillText('GUKESH', 56, 262);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.blue;
  ctx.fillText('SINDAROV', W - 56, 262);
  ctx.textAlign = 'left';
  ctx.font = `500 22px ${MONO}`;
  ctx.fillStyle = C.text2;
  ctx.fillText('WORLD CHAMPIONSHIP 2026 · GENEVA', 56, 132);
  ctx.font = `500 30px ${SANS}`;
  ctx.fillStyle = C.text;
  ctx.fillText('Predict every game.', 56, 340);
  ctx.textAlign = 'right';
  ctx.fillText("Spar against anyone's openings.", W - 56, 340);
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
