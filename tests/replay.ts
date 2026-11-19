/**
 * Deterministic replay of the ORIGINAL table with a scripted hitting player. Used by the baseline
 * regression test; also runnable directly to regenerate the golden file:
 *   node tests/replay.ts > tests/fixtures/baseline-replay.json   (only when a feel change is approved)
 */
import { Simulation } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { config } from '../src/config.ts';

export function baselineReplay() {
  const s = new Simulation();
  const c = makeControls();
  const samples: string[] = [];
  let k = 0;
  for (let pitch = 0; pitch < 3; pitch++) {
    s.ready();
    for (let i = 0; i < 240 * 90; i++) {
      const p = s.ball!.getPosition(), v = s.ball!.getLinearVelocity();
      const tx = p.x - config.swing.length * 0.62;
      c.moveAxis = Math.abs(tx - s.batterX) > 0.1 ? Math.sign(tx - s.batterX) : 0;
      const lead = 0.08 + ((k++ * 37) % 11) * 0.006;
      if (v.y > 0 && p.y < config.batter.handsY && (config.batter.handsY - 0.7 - p.y) / Math.max(1, v.y) < lead) c.swingPressed = true;
      s.step(1 / 240, c);
      if (!s.ball) break;
      if (i % 1200 === 0) samples.push(p.x.toFixed(5) + ',' + p.y.toFixed(5));
    }
  }
  return { score: s.rules.score, strikes: s.rules.strikes, hits: s.rules.hits, time: s.time.toFixed(4), samples };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(baselineReplay(), null, 1));
