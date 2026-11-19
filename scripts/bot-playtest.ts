/**
 * Headless bot playtest: a simple "player" that tracks the ball at keyboard speed and swings
 * with human-like timing error. Produces the same metrics as the in-browser telemetry.
 *
 *   node scripts/bot-playtest.ts [balls=300] [timingErrorMs=40] [seed=1]
 *
 * This is a tuning aid, not a substitute for hands-on play.
 */
import { config } from '../src/config.ts';
import { makeControls } from '../src/core/input.ts';
import { batAngleAt } from '../src/core/swing.ts';
import { Simulation } from '../src/physics/sim.ts';
import { Telemetry } from '../src/telemetry/session.ts';

const BALLS = +(process.argv[2] ?? 300), JITTER = +(process.argv[3] ?? 40) / 1000;
let seed = +(process.argv[4] ?? 1);
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
// Patch Math.random so the sim's VFX-free code paths stay deterministic per seed.
Math.random = rnd;

// time from swing start until the bat points at the aim-center angle
let tCenter = 0;
while (batAngleAt(tCenter) > config.swing.centerAngle) tCenter += 0.0005;

const DT = 1 / config.physicsHz, g = config.gravity;
const tel = new Telemetry();
const sim = new Simulation({ onEvent: e => tel.onEvent(e, sim.time, sim.rules.ballScore, sim.rules.pitchNumber) });
const c = makeControls();
const reaction = 0.18; // s, before the bot notices the ball changed direction
let plan: { swingAt: number; targetX: number; aimBias: number } | null = null;
let downSince = -1;

for (let n = 0; n < BALLS; n++) {
  if (sim.rules.phase === 'over') sim.rules.reset();
  sim.ready();
  plan = null;
  downSince = -1;
  const t0 = sim.time;
  while (sim.ball && sim.time - t0 < 120) {
    const p = sim.ball.getPosition(), v = sim.ball.getLinearVelocity();
    if (v.y > 0.5) { if (downSince < 0) downSince = sim.time; } else { downSince = -1; plan = null; }
    c.moveAxis = 0;
    if (downSince >= 0 && sim.time - downSince > reaction && p.y < config.batter.handsY) {
      // predict where the ball reaches contact height (ignores collisions on the way)
      const yc = config.batter.handsY - 0.7; // where a centered contact happens (measured)
      const a = g / 2, bq = v.y, cq = p.y - yc;
      const disc = bq * bq - 4 * a * cq;
      if (disc >= 0) {
        const tArrive = (-bq + Math.sqrt(disc)) / (2 * a);
        const xArrive = p.x + v.x * tArrive;
        if (!plan) plan = { swingAt: 0, targetX: 0, aimBias: gauss() * JITTER };
        plan.targetX = xArrive - config.swing.length * 0.62;
        plan.swingAt = sim.time + tArrive - tCenter + plan.aimBias;
        const dx = plan.targetX - sim.batterX;
        if (Math.abs(dx) > 0.08) c.moveAxis = Math.sign(dx) * Math.min(1, Math.abs(dx) / (config.batter.moveSpeed * DT * 4));
        if (sim.time >= plan.swingAt && sim.swingState === 'rest') c.swingPressed = true;
      }
    }
    sim.step(DT, c);
  }
}
const r = tel.report();
delete (r as any).perBall;
delete (r as any).frameMs;
const hitsPerSwing = r.swings ? (r.swings - r.missedSwings) / r.swings : 0;
console.log(JSON.stringify({ timingErrorMs: JITTER * 1000, ...r, contactRate: +hitsPerSwing.toFixed(2) }, null, 2));
