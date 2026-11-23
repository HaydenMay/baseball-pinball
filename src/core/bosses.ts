/**
 * Closer rules (1.0 scope #3): one recognizable rule per inning's Closer (C3, C6, C9, C12, C15).
 * Player route only. Data here; the Simulation runs the rule; the view/HUD only observe it.
 *
 * Hot Corner (Hayden, Nov 22): one scoring part pays ×3, every other way to score pays ×0.8. Every
 * 15 seconds of live play the hot spot jumps to a different part. Applied to a part's own (modified)
 * points, before the global multiplier, so it stacks with boosts and the multiplier like the Rally does.
 */
export type BossId = 'hotCorner' | 'smallBall' | 'calledShot' | 'rainDelay' | 'runnersOnBase';

export const HOT_CORNER = {
  hot: 3,
  cold: 0.8,
  /** Live seconds before the hot spot moves. */
  seconds: 15,
  /** The marker flashes this many seconds before it moves. */
  warnSeconds: 3,
};

/** Small Ball: the multiplier is frozen; sweet spots pay this many times their bonus. */
export const SMALL_BALL = { sweet: 3 };

/**
 * Called Shot: a part is called before each pitch. After every bat contact you get `windowSec` to make the
 * called part your first real contact (slings, lanes and posts don't count either way); hit it and the
 * rest of the pitch scores ×`factor`. Hitting another scoring part first in a window misses the call.
 */
export const CALLED_SHOT = { factor: 2, windowSec: 2.5, ignore: ['sling', 'lane', 'bat'] as string[] };

/** Runners on Base: points wait on base; the next bat contact drives them in ×`driveIn`, a drain strands them ×`stranded`. */
export const RUNNERS = { driveIn: 1.25, stranded: 0 };

/** Shuffle Closers 2–5 per run (seeded). Off: the fixed order below. */
export const RANDOMIZE_CLOSERS = false;

export const BOSS_INFO: Record<BossId, { name: string; rule: string; tip: string }> = {
  hotCorner: {
    name: 'HOT CORNER',
    rule: `One part scores ×${HOT_CORNER.hot}, everything else ×${HOT_CORNER.cold}. The hot spot moves every ${HOT_CORNER.seconds} seconds.`,
    tip: `<b>CLOSER: HOT CORNER.</b> The part with the flashing <b>×${HOT_CORNER.hot}</b> ring pays triple; everything else pays a bit less. Watch the timer at the top: it jumps somewhere new every ${HOT_CORNER.seconds} seconds.`,
  },
  smallBall: {
    name: 'SMALL BALL',
    rule: `Your multiplier is frozen. Sweet spots pay ×${SMALL_BALL.sweet}.`,
    tip: '',
  },
  calledShot: {
    name: 'CALLED SHOT',
    rule: `Before each pitch a part is called. Hit it within ${CALLED_SHOT.windowSec} seconds of a bat hit (before any other part) and the rest of the pitch scores ×${CALLED_SHOT.factor}.`,
    tip: '',
  },
  rainDelay: {
    name: 'RAIN DELAY',
    rule: 'The Upper Deck is rained out: the Home Run ramp is closed. Score downstairs.',
    tip: '',
  },
  runnersOnBase: {
    name: 'RUNNERS ON BASE',
    rule: `Points wait on base. Hit the ball again to drive them in ×${RUNNERS.driveIn}. If the ball drains, runners left on base score nothing.`,
    tip: '',
  },
};

/** Closer rule per inning (1–5). Innings without an entry are plain Closers (bigger target only) for now. */
export const CLOSERS: Partial<Record<number, BossId>> = { 1: 'hotCorner', 2: 'smallBall', 3: 'calledShot', 4: 'rainDelay', 5: 'runnersOnBase' };

/** Rule for challenge `n` (Closers are every 3rd challenge), or null. `runSeed` only matters with RANDOMIZE_CLOSERS. */
export function closerFor(challenge: number, perInning = 3, runSeed = 0): BossId | null {
  if (challenge % perInning !== 0) return null;
  const inning = challenge / perInning;
  if (RANDOMIZE_CLOSERS && inning >= 2) {
    // Inning 1 always teaches with Hot Corner; 2–5 are a seeded shuffle of the rest
    const rest = [2, 3, 4, 5].map(i => CLOSERS[i]!).filter(Boolean);
    let x = runSeed >>> 0 || 1;
    for (let i = rest.length - 1; i > 0; i--) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      const j = x % (i + 1);
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    // Rain Delay needs the Upper Deck (opens after Inning 1), which holds for every inning ≥ 2
    return rest[inning - 2] ?? null;
  }
  return CLOSERS[inning] ?? null;
}
