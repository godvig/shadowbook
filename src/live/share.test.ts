import { describe, expect, it } from 'vitest';
import { shareText, shareUrl, xIntent } from './share';

const pct = { gukesh: 31, draw: 44, sindarov: 25 };

describe('share text', () => {
  it('describes an open call', () => {
    expect(shareText({ game: 4, pick: 'draw', pct })).toBe("My call for game 4 of Gukesh vs Sindarov: draw (44% agree). What's yours?");
  });
  it('brags about upsets after the game', () => {
    expect(shareText({ game: 4, pick: 'sindarov', pct, called: true, points: 2 })).toBe('Called it: game 4 of Gukesh vs Sindarov went to Sindarov, and only 25% saw it coming.');
    expect(shareText({ game: 4, pick: 'draw', pct, called: true })).toBe('Called it: game 4 of Gukesh vs Sindarov ended in a draw, along with 44% of the crowd.');
  });
  it('builds links', () => {
    expect(shareUrl('https://shadowbook.godvig.com')).toBe('https://shadowbook.godvig.com/world-chess-championship-2026/');
    expect(shareUrl('https://shadowbook.godvig.com', 'sv')).toBe('https://shadowbook.godvig.com/sv/schack-vm-2026/');
    expect(xIntent('Hi there', 'https://a.b/#match')).toBe('https://x.com/intent/post?text=Hi+there&url=https%3A%2F%2Fa.b%2F%23match');
  });
});
