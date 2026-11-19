/**
 * Headless bot playtest: a simple "player" that tracks the ball at keyboard speed and swings
 * with human-like timing error. Produces the same metrics as the in-browser telemetry.
 *
 *   node scripts/bot-playtest.ts [balls=300] [timingErrorMs=40] [seed=1] [map=baseline|sidewinder|overpass|powerhouse]
 *
 * This is a tuning aid, not a substitute for hands-on play.
 */
import { config } from '../src/config.ts';
import { makeControls } from '../src/core/input.ts';
import { batAngleAt } from '../src/core/swing.ts';
import { Simulation } from '../src/physics/sim.ts';
import { Telemetry } from '../src/telemetry/session.ts';
import { PRESETS } from '../src/machines/presets.ts';

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
const preset = PRESETS.find(p => p.id === (process.argv[5] ?? 'baseline'))!;
const sim = new Simulation({ preset, onEvent: e => tel.onEvent(e, sim.time, sim.rules.ballScore, sim.rules.pitchNumber) });
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
  while (sim.balls.length && sim.time - t0 < 300) {
    // track the falling field ball that will reach the bat first
    let target: { p: { x: number; y: number }; v: { x: number; y: number }; t: number } | null = null;
    for (const bb of sim.balls) {
      if (bb.mode !== 'field') continue;
      const p = bb.body.getPosition(), v = bb.body.getLinearVelocity();
      if (v.y <= 0.5 || p.y >= config.batter.handsY) continue;
      const yc = config.batter.handsY - 0.7; // where a centered contact happens (measured)
      const disc = v.y * v.y - 4 * (g / 2) * (p.y - yc);
      if (disc < 0) continue;
      const t = (-v.y + Math.sqrt(disc)) / g;
      if (!target || t < target.t) target = { p: { x: p.x, y: p.y }, v: { x: v.x, y: v.y }, t };
    }
    if (target) { if (downSince < 0) downSince = sim.time; } else { downSince = -1; plan = null; }
    c.moveAxis = 0;
    if (target && sim.time - downSince > reaction) {
      const xArrive = target.p.x + target.v.x * target.t;
      if (!plan) plan = { swingAt: 0, targetX: 0, aimBias: gauss() * JITTER };
      plan.targetX = xArrive - config.swing.length * 0.62;
      plan.swingAt = sim.time + target.t - tCenter + plan.aimBias;
      const dx = plan.targetX - sim.batterX;
      if (Math.abs(dx) > 0.08) c.moveAxis = Math.sign(dx) * Math.min(1, Math.abs(dx) / (config.batter.moveSpeed * DT * 4));
      if (sim.time >= plan.swingAt && sim.swingState === 'rest') { c.swingPressed = true; plan = null; downSince = sim.time; }
    }
    sim.step(DT, c);
  }
}
const r = tel.report();
delete (r as any).perBall;
delete (r as any).frameMs;
const hitsPerSwing = r.swings ? (r.swings - r.missedSwings) / r.swings : 0;
console.log(JSON.stringify({ map: preset.id, timingErrorMs: JITTER * 1000, ...r, contactRate: +hitsPerSwing.toFixed(2) }, null, 2));
