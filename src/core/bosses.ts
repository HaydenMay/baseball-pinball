/**
 * Closer rules (1.0 scope #3): one recognizable rule per inning's Closer (C3, C6, C9, C12, C15).
 * Player route only. Data here; the Simulation runs the rule; the view/HUD only observe it.
 *
 * Hot Corner (Hayden, Nov 22): one scoring part pays ×3, every other way to score pays ×0.8. Every
 * 15 seconds of live play the hot spot jumps to a different part. Applied to a part's own (modified)
 * points, before the global multiplier, so it stacks with boosts and the multiplier like the Rally does.
 */
export type BossId = 'hotCorner';

export const HOT_CORNER = {
  hot: 3,
  cold: 0.8,
  /** Live seconds before the hot spot moves. */
  seconds: 15,
  /** The marker flashes this many seconds before it moves. */
  warnSeconds: 3,
};

export const BOSS_INFO: Record<BossId, { name: string; rule: string; tip: string }> = {
  hotCorner: {
    name: 'HOT CORNER',
    rule: `One part scores ×${HOT_CORNER.hot}, everything else ×${HOT_CORNER.cold}. The hot spot moves every ${HOT_CORNER.seconds} seconds.`,
    tip: `<b>CLOSER: HOT CORNER.</b> The part with the flashing <b>×${HOT_CORNER.hot}</b> ring pays triple; everything else pays a bit less. Watch the timer at the top: it jumps somewhere new every ${HOT_CORNER.seconds} seconds.`,
  },
};

/** Closer rule per inning (1–5). Innings without an entry are plain Closers (bigger target only) for now. */
export const CLOSERS: Partial<Record<number, BossId>> = { 1: 'hotCorner' };

/** Rule for challenge `n` (Closers are every 3rd challenge), or null. */
export function closerFor(challenge: number, perInning = 3): BossId | null {
  if (challenge % perInning !== 0) return null;
  return CLOSERS[challenge / perInning] ?? null;
}
