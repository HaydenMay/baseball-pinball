/**
 * Ready / live / drain / strike / game-over state and score bookkeeping.
 * Score banks immediately on every scoring collision. Only the loss of the LAST live ball is a
 * strike, so the accounting already works if multiball is added later.
 */
export type Phase = 'ready' | 'live' | 'over' | 'cleared';

export class GameRules {
  phase: Phase = 'ready';
  strikes = 0;
  maxStrikes = 3;
  score = 0;
  ballScore = 0;
  hits = 0;
  ballsLive = 0;
  pitchNumber = 0;
  /** Challenge score target (build-test route). null = free play, as on the original routes. */
  target: number | null = null;

  /** Player pressed Ready. Returns true if exactly one new pitch should be served. */
  ready(): boolean {
    if (this.phase === 'over') this.reset();
    if (this.phase !== 'ready') return false;
    this.phase = 'live';
    this.ballScore = 0;
    this.ballsLive = 1;
    this.pitchNumber++;
    return true;
  }

  addScore(points: number) {
    if (this.phase !== 'live' || points <= 0) return;
    this.score += points;
    this.ballScore += points;
    // A challenge clears the instant the banked score reaches the target, exactly once.
    if (this.target !== null && this.score >= this.target) this.phase = 'cleared';
  }

  /** A mechanism put another ball in play (multiball). */
  addBall() {
    if (this.phase === 'live') this.ballsLive++;
  }

  batHit() {
    if (this.phase === 'live') this.hits++;
  }

  /** A ball left the table. Returns true if that cost a strike. */
  drain(): boolean {
    if (this.phase !== 'live' || this.ballsLive <= 0) return false;
    this.ballsLive--;
    if (this.ballsLive > 0) return false;
    this.strikes++;
    this.phase = this.strikes >= this.maxStrikes ? 'over' : 'ready';
    return true;
  }

  reset() {
    this.phase = 'ready';
    this.strikes = 0;
    this.score = 0;
    this.ballScore = 0;
    this.hits = 0;
    this.ballsLive = 0;
    this.pitchNumber = 0;
  }
}
