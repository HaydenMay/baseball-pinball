/**
 * Vibration on phones that support it (Android Chrome). iOS Safari has no vibration API, so this is a no-op
 * there. Off on every route but the player one, and the player can switch it off in Settings.
 * Patterns are in milliseconds (vibrate, pause, vibrate, …); tune them here.
 */
export const HAPTICS = {
  /** Plain bat contact: a tap you feel, short enough not to blur fast swings. */
  bat: [12],
  sweet: [18, 30, 18],
  homeRun: [30, 40, 60],
  jackpot: [25, 35, 25],
  calledHit: [20, 30, 40],
  strike: [70],
  gameOver: [90, 60, 140],
  cleared: [20, 40, 20, 40, 60],
  runComplete: [30, 50, 30, 50, 120],
  /** Never buzz more often than this (s), so multiball chaos doesn't turn into one long rattle. */
  minGap: 0.06,
} as const;

export type HapticKind = Exclude<keyof typeof HAPTICS, 'minGap'>;

export class Haptics {
  enabled = false;
  private last = -1;
  buzz(kind: HapticKind) {
    if (!this.enabled) return;
    const nav = typeof navigator === 'undefined' ? null : navigator;
    if (!nav || typeof nav.vibrate !== 'function') return;
    const now = performance.now() / 1000;
    if (now - this.last < HAPTICS.minGap) return;
    this.last = now;
    try {
      nav.vibrate([...HAPTICS[kind]]);
    } catch {
      /* some browsers throw before a user gesture */
    }
  }
}
