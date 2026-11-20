/**
 * Build-test economy knobs. EVERY number here is an experimental test value chosen to let a short
 * session reach several draft/shop decisions. None of these are approved game-design numbers.
 */
export const ECONOMY = {
  /** Starting max Power (approved direction: 6, then +1 permanent max Power per inning). */
  startPower: 6,
  /** One inning = this many challenges (Starter, Reliever, Closer). */
  challengesPerInning: 3,
  /** Max Power granted on clearing the last challenge of an inning (before that clear's draft). */
  powerPerInning: 1,
  /** A full game is 9 innings = 27 challenges; no grant after the last one. */
  lastChallenge: 27,
  /** Challenge score targets for the first challenges; past the list, each target is the last × growth. */
  targets: [1500, 4000, 8000],
  /** EXPERIMENTAL test value (was 1.6): growth per challenge after the seeded targets. Not final tuning. */
  targetGrowth: 1.4,
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

/** Inning (1-based) a challenge belongs to. */
export function inningOf(challenge: number) {
  return Math.ceil(challenge / ECONOMY.challengesPerInning);
}

/** Max Power available while playing a challenge, given the per-inning grants. */
export function maxPowerFor(challenge: number) {
  return ECONOMY.startPower + (inningOf(Math.min(challenge, ECONOMY.lastChallenge)) - 1) * ECONOMY.powerPerInning;
}
