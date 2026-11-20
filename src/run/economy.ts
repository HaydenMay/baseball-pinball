/**
 * Build-test economy knobs. EVERY number here is an experimental test value chosen to let a short
 * session reach several draft/shop decisions. None of these are approved game-design numbers.
 */
export const ECONOMY = {
  /** Experimental starting Power capacity for the build test (not a final design choice). */
  startPower: 5,
  /** Challenge score targets for the short test sequence; past the list, each target is the last × growth. */
  targets: [1500, 4000, 8000],
  targetGrowth: 1.6,
  /** Money awarded on a clear: base + per unused strike. */
  clearBase: 8,
  clearPerStrikeLeft: 2,
  /** Draft size (free pick) and shop size. */
  draftSize: 3,
  shopSize: 4,
  /** Reroll starts at this price and rises by `rerollStep` each reroll within one shop visit. */
  rerollBase: 1,
  rerollStep: 1,
  /**
   * Chance a free-draft slot rolls a physical machine (vs a premium upgrade) when one fits.
   * The shop never rolls machines (Upgrade System 2.0 split).
   */
  draftMachineShare: 0.6,
};

export function targetFor(challenge: number) {
  const t = ECONOMY.targets;
  if (challenge <= t.length) return t[challenge - 1];
  return Math.round((t[t.length - 1] * Math.pow(ECONOMY.targetGrowth, challenge - t.length)) / 100) * 100;
}
