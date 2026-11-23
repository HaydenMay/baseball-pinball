/**
 * Player-route batting rules (V2 / `/build-test/` only; frozen comparison routes keep the original feel).
 * None of these touch the locked bat physics (exit speed, swing arc, timings): they sit on top of them.
 */
export const PLAY = {
  /** Set by main.ts on the player route. */
  enabled: false,
  /** Extra seconds before the next swing after a swing that touched nothing (mashing costs time). */
  whiffLockout: 0.25,
  /** A swing pressed this long before the bat is ready again is buffered instead of dropped. */
  swingBuffer: 0.12,
  sweetSpot: {
    /** Contact within this many radians of the centred bat angle counts as a sweet spot (≈ ±30 ms of a 280 ms contact window). */
    angle: 0.25,
    /** Bonus points (follow the multiplier like any other score). */
    points: 250,
  },
  /**
   * Jackpot pays this share of the challenge target (critic: a flat 250 was 0.3% of points), never less
   * than config.jackpot.points; rounded to 50. Modifiers (Big Stage ×2) apply on top.
   */
  jackpotShare: 0.05,
  /** Pitches per challenge that drain without ever touching the bat and don't cost a strike. */
  foulsPerChallenge: 1,
};

/** Sweet spot test for a bat contact angle (see config.swing.centerAngle). */
export function isSweetSpot(angle: number, center: number) {
  return Math.abs(angle - center) <= PLAY.sweetSpot.angle;
}

/** Jackpot base points for a challenge target (player route). */
export function jackpotPoints(target: number | null, floor: number) {
  if (!PLAY.enabled || !target) return floor;
  return Math.max(floor, Math.round((target * PLAY.jackpotShare) / 50) * 50);
}
