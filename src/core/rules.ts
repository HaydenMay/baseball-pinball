/**
 * Ready / live / drain / strike / game-over state and score bookkeeping.
 * Score banks immediately on every scoring collision. Only the loss of the LAST live ball is a
 * strike, so the accounting already works if multiball is added later.
 */
export type Phase = 'ready' | 'live' | 'over';

export class GameRules {
  phase: Phase = 'ready';
  strikes = 0;
  maxStrikes = 3;
  score = 0;
  ballScore = 0;
  hits = 0;
  ballsLive = 0;
  pitchNumber = 0;

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
