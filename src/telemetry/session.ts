/**
 * Local, in-memory playtest metrics. Nothing leaves the browser unless you export it.
 * Console: `playtest.report()` / `playtest.download()`.
 */
import type { SimEvent } from '../physics/sim.ts';

export type BallRecord = {
  pitch: number;
  seconds: number;
  batHits: number;
  aims: { left: number; center: number; right: number };
  machineHits: Record<string, number>;
  slingSaves: number;
  drainSide: 'left' | 'center' | 'right' | null;
  score: number;
  extraBallDrains: number;
  maxBalls: number;
  rampEnters: number;
  rampCompletes: number;
  rampRollbacks: number;
  scoopCatches: number;
  multiballs: number;
  gatePasses: number;
};

export class Telemetry {
  balls: BallRecord[] = [];
  current: BallRecord | null = null;
  startTime = 0;
  frameMs: number[] = [];
  swings = 0;
  missedSwings = 0;
  private swingHit = true;

  onEvent(e: SimEvent, simTime: number, ballScore: number, pitch: number) {
    if (e.type === 'serve') {
      this.current = { pitch, seconds: 0, batHits: 0, aims: { left: 0, center: 0, right: 0 }, machineHits: {}, slingSaves: 0, drainSide: null, score: 0, extraBallDrains: 0, maxBalls: 1, rampEnters: 0, rampCompletes: 0, rampRollbacks: 0, scoopCatches: 0, multiballs: 0, gatePasses: 0 };
      this.startTime = simTime;
    }
    const c = this.current;
    if (!c) return;
    if (e.type === 'swing') {
      if (!this.swingHit) this.missedSwings++;
      this.swings++;
      this.swingHit = false;
    } else if (e.type === 'bat') {
      this.swingHit = true;
      c.batHits++;
      const a = e.contact.aim;
      if (a < -0.18) c.aims.left++;
      else if (a > 0.18) c.aims.right++;
      else c.aims.center++;
    } else if (e.type === 'machine' && e.kind !== 'wall') {
      c.machineHits[e.id] = (c.machineHits[e.id] || 0) + 1;
      if (e.kind === 'sling') c.slingSaves++;
      if (e.kind === 'gate') c.gatePasses++;
    } else if (e.type === 'ramp') {
      if (e.phase === 'enter') c.rampEnters++;
      else if (e.phase === 'complete') c.rampCompletes++;
      else c.rampRollbacks++;
    } else if (e.type === 'scoop') {
      if (e.phase === 'catch') c.scoopCatches++;
    } else if (e.type === 'multiball') {
      c.multiballs++;
      c.maxBalls = Math.max(c.maxBalls, e.balls);
    } else if (e.type === 'drain' && !e.strike) {
      c.extraBallDrains++;
    } else if (e.type === 'drain') {
      c.seconds = +(simTime - this.startTime).toFixed(2);
      c.drainSide = e.side;
      c.score = ballScore;
      this.balls.push(c);
      this.current = null;
    }
  }

  frame(ms: number) {
    this.frameMs.push(ms);
    if (this.frameMs.length > 1200) this.frameMs.shift();
  }

  report() {
    const b = this.balls;
    const avg = (xs: number[]) => (xs.length ? +(xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(2) : 0);
    const machines: Record<string, number> = {};
    for (const r of b) for (const [k, v] of Object.entries(r.machineHits)) machines[k] = (machines[k] || 0) + v;
    const sorted = this.frameMs.slice().sort((x, y) => x - y);
    return {
      balls: b.length,
      avgSurvivalSeconds: avg(b.map(r => r.seconds)),
      avgBatHitsPerBall: avg(b.map(r => r.batHits)),
      avgScorePerBall: avg(b.map(r => r.score)),
      aims: b.reduce((a, r) => ({ left: a.left + r.aims.left, center: a.center + r.aims.center, right: a.right + r.aims.right }), { left: 0, center: 0, right: 0 }),
      drainSides: b.reduce((a, r) => (r.drainSide ? { ...a, [r.drainSide]: a[r.drainSide] + 1 } : a), { left: 0, center: 0, right: 0 }),
      mechanisms: b.reduce((a, r) => ({ rampEnters: a.rampEnters + r.rampEnters, rampCompletes: a.rampCompletes + r.rampCompletes, rampRollbacks: a.rampRollbacks + r.rampRollbacks, scoopCatches: a.scoopCatches + r.scoopCatches, multiballs: a.multiballs + r.multiballs, extraBallDrains: a.extraBallDrains + r.extraBallDrains, gatePasses: a.gatePasses + r.gatePasses }), { rampEnters: 0, rampCompletes: 0, rampRollbacks: 0, scoopCatches: 0, multiballs: 0, extraBallDrains: 0, gatePasses: 0 }),
      swings: this.swings,
      missedSwings: this.missedSwings,
      machineHits: machines,
      frameMs: { avg: avg(this.frameMs), p95: sorted.length ? +sorted[Math.floor(sorted.length * 0.95)].toFixed(2) : 0 },
      perBall: b,
    };
  }
}
