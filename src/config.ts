/**
 * Every gameplay tuning knob lives here. These are STARTING TEST VALUES, not balanced numbers.
 * World units: table is 20 wide x 32 tall, +y points DOWN the table (toward the batter).
 * Speeds are units/second, times are seconds, angles are radians in y-down screen space
 * (0 = pointing right, +PI/2 = pointing down).
 *
 * In the browser, `window.tune` is this object, so values can be changed live from the console.
 */
export const config = {
  table: { width: 20, height: 32 },
  physicsHz: 240,
  gravity: 14,
  ball: {
    radius: 0.32,
    restitution: 0.5,
    linearDamping: 0.03,
    maxSpeed: 36,
    /** If the ball barely moves for this long, give it a small nudge (anti-trap safety). */
    stuckSeconds: 1.6,
  },
  pitch: {
    /** Upper-center pitcher's mound. The pitch is always straight down the center. */
    x: 10,
    y: 13.4,
    speed: 7,
  },
  /** Ball centre below this y has left the table through the drain → strike. */
  drainY: 31.7,
  batter: {
    /**
     * Batter position = x of the hands (bat pivot). Start so a straight center pitch meets the
     * barrel without moving.
     */
    startX: 8.6,
    /** y of the batter's hands (bat pivot). */
    handsY: 25.0,
    /** Hands sit this far right of the batter's body center (right-handed batter). */
    handsOffsetX: 0.62,
    minX: 4.1,
    maxX: 14.9,
    moveSpeed: 13,
  },
  swing: {
    length: 2.3,
    /** Contact envelope = bat radius + ball radius + this tolerance. */
    radius: 0.16,
    tolerance: 0.28,
    /** Bat must be this far from the hands to count (the knob/hands don't hit). */
    minReach: 0.3,
    /** ~7 o'clock */
    restAngle: (2 * Math.PI) / 3,
    /** ~11 o'clock */
    endAngle: (-2 * Math.PI) / 3,
    swingSeconds: 0.2,
    recoverSeconds: 0.13,
    /** Extra anti-spam gap after recovery (total cooldown ≈ swing + recover + this). */
    cooldownSeconds: 0.0,
    /** Ball centre must be above (smaller y than) handsY + this to be in front of the batting line. */
    battingLine: 0.95,
    /**
     * Bat angle at contact that sends the ball straight up. Measured: a straight pitch is contactable
     * from about -1.1 (early) to +1.05 rad (late), so center sits in the middle of that range.
     */
    centerAngle: -0.03,
    /** Bat-angle distance from center that maps to full left/right aim. */
    aimHalfRange: 0.95,
    /** Widest aim from vertical. */
    maxAim: 0.8,
    /** Every valid contact leaves at this speed: early/late are not penalised. */
    exitSpeed: 26,
    /** Ball must be moving down at least this fast. */
    minDownSpeed: 0.2,
  },
  bumper: { kick: 15, restitution: 0.35, points: 100 },
  target: { restitution: 0.45, points: 50 },
  jackpot: { points: 250 },
  post: { restitution: 0.65 },
  lane: { points: 25 },
  sling: { kick: 17, restitution: 0.2, points: 10, cooldown: 0.12 },
  wall: { restitution: 0.45 },
  batHitPoints: 0,
};
export type Config = typeof config;
