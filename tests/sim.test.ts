import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as P from 'planck';
import { config } from '../src/config.ts';
import { Simulation, type SimEvent } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { SLINGS, OUTER_WALL, BUMPERS } from '../src/physics/board.ts';

const DT = 1 / config.physicsHz;
function run(sim: Simulation, seconds: number, each?: (s: Simulation) => void) {
  const c = makeControls();
  for (let i = 0; i < seconds / DT; i++) {
    each?.(sim);
    sim.step(DT, c);
    if (!sim.ball) break;
  }
}
const bats = (s: Simulation) => s.events.filter(e => e.type === 'bat');

test('1. Ready spawns exactly one centered straight pitch; no auto re-serve after a strike', () => {
  const s = new Simulation();
  assert.equal(s.ball, null);
  assert.ok(s.ready());
  assert.ok(!s.ready(), 'second Ready ignored');
  const p = s.ball!.getPosition(), v = s.ball!.getLinearVelocity();
  assert.equal(p.x, 10);
  assert.equal(v.x, 0);
  assert.ok(v.y > 0);
  assert.equal(s.batterX, config.batter.startX);
  // no swing: ball goes straight down the middle and drains
  const xs: number[] = [];
  run(s, 5, s => s.ball && xs.push(s.ball.getPosition().x));
  assert.ok(xs.every(x => Math.abs(x - 10) < 1e-6), 'pitch stays dead center');
  assert.equal(s.ball, null);
  assert.equal(s.rules.strikes, 1);
  run(s, 2);
  assert.equal(s.ball, null, 'nothing re-serves until Ready');
  assert.equal(s.rules.phase, 'ready');
});

test('the batter re-centers on every new pitch', () => {
  const s = new Simulation();
  s.ready();
  s.batterX = 5;
  run(s, 5);
  s.ready();
  assert.equal(s.batterX, config.batter.startX);
});

test('3 + 7. downward ball hit once, goes upward; early aims left, late aims right, same speed', () => {
  const results: { start: number; aim: number; speed: number; count: number }[] = [];
  for (let start = 0.3; start <= 1.0; start += 0.005) {
    const s = new Simulation();
    s.ready();
    let swung = false;
    run(s, 2.2, s => {
      if (!swung && s.time >= start) { s.swing(); swung = true; }
    });
    const b = bats(s);
    if (b.length) {
      const c = (b[0] as Extract<SimEvent, { type: 'bat' }>).contact;
      results.push({ start, aim: c.aim, speed: Math.hypot(c.velocity.x, c.velocity.y), count: b.length });
    }
  }
  assert.ok(results.length > 10, `hittable window exists (${results.length} start times)`);
  for (const r of results) {
    assert.equal(r.count, 1, 'only one contact per swing');
    assert.ok(Math.abs(r.speed - config.swing.exitSpeed) < 1e-6, 'equal speed');
  }
  const first = results[0], last = results[results.length - 1];
  assert.ok(first.aim < -0.3, `earliest swing pulls left (${first.aim.toFixed(2)})`);
  assert.ok(last.aim > 0.3, `latest swing pushes right (${last.aim.toFixed(2)})`);
  assert.ok(results.some(r => Math.abs(r.aim) < 0.1), 'a well-timed swing goes up the middle');
  const window = (last.start - first.start) * 1000;
  assert.ok(window > 70, `timing window ${window.toFixed(0)}ms`);
});

test('3. a resting bat never deflects a falling ball', () => {
  const s = new Simulation();
  s.ready();
  run(s, 5);
  assert.equal(bats(s).length, 0);
  assert.equal(s.rules.strikes, 1);
});

/** Drop a ball onto the left sling, and place the batter so the save's upward path crosses the barrel. */
function slingSave(swingDelay: number | null) {
  const sl = SLINGS[0];
  const mid = { x: (sl.face[0].x + sl.face[1].x) / 2, y: (sl.face[0].y + sl.face[1].y) / 2 };
  // dry run to find where the save crosses the batting height
  const probe = new Simulation();
  probe.ready();
  probe.spawnBall(mid.x + 0.6, mid.y - 3, 0, 6);
  let crossX: number | null = null, kickedAt = -1;
  run(probe, 1.5, s => {
    if (kickedAt < 0 && s.events.some(e => e.type === 'machine' && e.kind === 'sling')) kickedAt = s.time;
    const p = s.ball!.getPosition(), v = s.ball!.getLinearVelocity();
    if (kickedAt >= 0 && crossX === null && v.y < 0 && p.y <= config.batter.handsY) crossX = p.x;
  });
  assert.ok(crossX !== null, 'save rises past the batter');
  const s = new Simulation();
  s.ready();
  s.spawnBall(mid.x + 0.6, mid.y - 3, 0, 6);
  s.batterX = Math.max(config.batter.minX, crossX! - config.swing.length * 0.6);
  let swung = false, minDist = Infinity;
  run(s, 1.5, s => {
    if (swingDelay !== null && !swung && s.time >= kickedAt + swingDelay) { s.swing(); swung = true; }
    const p = s.ball!.getPosition();
    minDist = Math.min(minDist, Math.hypot(p.x - (s.hands.x + config.swing.length * 0.6), p.y - s.hands.y));
  });
  return { s, minDist };
}

test('4. slingshot save travels upward through a RESTING bat without a second rebound', () => {
  const { s, minDist } = slingSave(null);
  assert.ok(minDist < 0.6, `save passes through the barrel zone (${minDist.toFixed(2)})`);
  assert.equal(bats(s).length, 0);
  assert.equal(s.rules.strikes, 0, '8. genuine slingshot save is not a strike');
});

test('5. slingshot save passes upward through a MID-SWING bat unaffected, at every swing timing', () => {
  for (let d = -0.15; d <= 0.25; d += 0.01) {
    const { s, minDist } = slingSave(d);
    assert.ok(minDist < 0.6);
    assert.equal(bats(s).length, 0, `no bat contact on an upward ball (swing at kick${d >= 0 ? '+' : ''}${d.toFixed(2)}s)`);
  }
});

test('6. an upward ball off a sidewall passes through an active swing', () => {
  const s = new Simulation();
  s.ready();
  // ball rising up through the bat zone, as if it came off the lower sidewall
  s.spawnBall(s.hands.x + 1.2, s.hands.y + 0.8, 0, -14);
  s.swing();
  run(s, 0.3);
  assert.equal(bats(s).length, 0);
});

test('8. a side escape below the batter is a strike even though it never crosses the center', () => {
  const s = new Simulation();
  s.ready();
  // ball slipping down between the right sling and the drain lip, far right of center
  s.spawnBall(12.9, 30.6, 0, 5);
  run(s, 2);
  assert.equal(s.rules.strikes, 1);
  const d = s.events.find(e => e.type === 'drain') as Extract<SimEvent, { type: 'drain' }>;
  assert.equal(d.side, 'right');
});

test('9. score banks on collisions as they happen and survives strikes', () => {
  const s = new Simulation();
  s.ready();
  // drop onto an upper bumper
  s.spawnBall(BUMPERS[0].x + 0.3, BUMPERS[0].y - 2, 0, 2);
  let scoredLive = false;
  run(s, 6, s => { if (s.ball && s.rules.score > 0) scoredLive = true; });
  assert.ok(scoredLive, 'score appears while the ball is still live');
  const banked = s.rules.score;
  assert.ok(banked >= config.bumper.points);
  s.ready();
  run(s, 6);
  assert.ok(s.rules.score >= banked);
});

test('bumpers kick hard', () => {
  const s = new Simulation();
  s.ready();
  s.spawnBall(BUMPERS[0].x, BUMPERS[0].y - 1.9, 0, 3);
  let out = 0;
  run(s, 0.6, s => {
    if (s.events.some(e => e.type === 'machine' && e.kind === 'bumper')) {
      const v = s.ball!.getLinearVelocity();
      out = Math.max(out, Math.hypot(v.x, v.y));
    }
  });
  assert.ok(out >= config.bumper.kick * 0.9, `kick speed ${out.toFixed(1)}`);
});

function insideTable(x: number, y: number) {
  // ray-cast against the closed outer wall polygon
  const poly = OUTER_WALL;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

test('10. a max-speed ball cannot tunnel through the exterior walls', () => {
  let escapes = 0;
  for (let i = 0; i < 64; i++) {
    const s = new Simulation();
    s.ready();
    const a = (i / 64) * Math.PI * 2;
    s.spawnBall(10, 12, Math.cos(a) * 80, Math.sin(a) * 80); // way above the cap
    run(s, 1.5, s => {
      if (!s.ball) return;
      const p = s.ball.getPosition();
      if (p.y < 30.5 && !insideTable(p.x, p.y)) escapes++;
    });
  }
  assert.equal(escapes, 0);
});

test('balls never come to rest on the playfield (anti-trap)', () => {
  const s = new Simulation();
  s.ready();
  let maxStill = 0, still = 0;
  for (let i = 0; i < 40; i++) {
    s.spawnBall(1 + Math.random() * 18, 1.5 + Math.random() * 20, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
    run(s, 4, s => {
      const v = s.ball!.getLinearVelocity();
      still = Math.hypot(v.x, v.y) < 0.6 ? still + DT : 0;
      maxStill = Math.max(maxStill, still);
    });
    if (!s.ball) s.rules.phase = 'live';
  }
  assert.ok(maxStill <= config.ball.stuckSeconds + 0.05, `longest still ${maxStill.toFixed(2)}s`);
});

test('a straight-up hit from the plate has a clear path to the jackpot', () => {
  const s = new Simulation();
  s.ready();
  s.spawnBall(10, 22, 0, -config.swing.exitSpeed);
  run(s, 1.5);
  const first = s.events.find(e => e.type === 'machine') as Extract<SimEvent, { type: 'machine' }>;
  assert.equal(first?.kind, 'jackpot');
});

test('side lanes score on rollover', () => {
  const s = new Simulation();
  s.ready();
  s.spawnBall(1.7, 3.5, 0, 4);
  run(s, 1);
  assert.ok(s.events.some(e => e.type === 'machine' && e.kind === 'lane'));
});
