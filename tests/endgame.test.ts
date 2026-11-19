import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as P from 'planck';
import { config } from '../src/config.ts';
import { Simulation, type SimEvent } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { PRESETS } from '../src/machines/presets.ts';
import { applyModifiers, dropLanding } from '../src/machines/mechanisms.ts';

const DT = 1 / config.physicsHz;
const preset = (id: string) => PRESETS.find(p => p.id === id)!;
function run(sim: Simulation, seconds: number, each?: (s: Simulation) => boolean | void) {
  const c = makeControls();
  for (let i = 0; i < seconds / DT; i++) {
    if (each?.(sim) === true) return;
    sim.step(DT, c);
    if (!sim.balls.length) break;
  }
}
const evs = <T extends SimEvent['type']>(s: Simulation, type: T) => s.events.filter(e => e.type === type) as Extract<SimEvent, { type: T }>[];
function shoot(s: Simulation, rampId: string, speed: number) {
  const r = s.layout.ramps.find(r => r.def.id === rampId)!;
  s.spawnBall(r.mouth.x - r.entryDir.x * 0.8, r.mouth.y - r.entryDir.y * 0.8, r.entryDir.x * speed, r.entryDir.y * speed);
  return r;
}
const RAMPS = [['sidewinder', 'ramp-side'], ['overpass', 'ramp-over'], ['powerhouse', 'ramp-compact']] as const;

test('every ramp has a mid-route scoring gate that pays exactly once per pass, and again on a new pass', () => {
  for (const [pid, rid] of RAMPS) {
    const s = new Simulation({ preset: preset(pid) });
    s.ready();
    const r = s.layout.ramps[0];
    assert.ok(r.gateS > r.def.climb && r.gateS < r.length - 1, `${rid} gate sits mid-route`);
    shoot(s, rid, 22);
    run(s, 6, s => s.events.some(e => e.type === 'ramp' && e.phase === 'complete' && (s.balls[0]?.mode === 'field')));
    assert.equal(evs(s, 'rampGate').length, 1, `${rid} one gate award per pass`);
    const before = s.rules.score;
    shoot(s, rid, 22);
    run(s, 6, s => evs(s, 'rampGate').length >= 2 && s.balls[0]?.mode === 'field');
    assert.equal(evs(s, 'rampGate').length, 2, `${rid} a new traversal scores again`);
    assert.ok(s.rules.score > before, 'scoreboard updates');
  }
});

test('a rolled-back shot never reaches or scores the ramp gate', () => {
  for (const [pid, rid] of RAMPS) {
    const s = new Simulation({ preset: preset(pid) });
    s.ready();
    shoot(s, rid, 6);
    run(s, 3);
    assert.equal(evs(s, 'rampGate').length, 0, rid);
  }
});

test('drop exits: the same ball falls onto open floor above the batting line and plays on (no spawn, no loss)', () => {
  for (const [pid, rid] of RAMPS) {
    const s = new Simulation({ preset: preset(pid) });
    s.ready();
    const r = shoot(s, rid, 22);
    if (r.def.exit?.mode !== 'drop') continue;
    const id = s.balls[0].id;
    let land: Extract<SimEvent, { type: 'ramp' }> | undefined;
    run(s, 8, s => {
      assert.ok(s.balls.length <= 1, 'never duplicated');
      land = evs(s, 'ramp').find(e => e.phase === 'land');
      return !!land;
    });
    assert.ok(land, `${rid} lands`);
    assert.equal(land!.ball, id, 'same baseball');
    assert.ok(land!.y < config.batter.handsY - 3, `${rid} lands well above the batter (${land!.y.toFixed(1)})`);
    // landing spot is clear for every exit speed in range
    for (let sp = r.def.exitMin; sp <= r.def.exitMax; sp += 0.5) {
      const { p } = dropLanding(r, sp, config.gravity);
      let blocked = false;
      s.world.queryAABB(new P.AABB(P.Vec2(p.x - 0.3, p.y - 0.3), P.Vec2(p.x + 0.3, p.y + 0.3)), f => {
        if (f.getBody().isStatic() && !f.isSensor() && f.getShape().getType() !== 'chain') blocked = true;
        return true;
      });
      assert.ok(!blocked, `${rid} landing at speed ${sp} is open floor`);
    }
  }
});

test('Sidewinder: the drop returns the ball to a hittable central lane position', () => {
  const s = new Simulation({ preset: preset('sidewinder') });
  const r = s.layout.ramps[0];
  for (let sp = r.def.exitMin; sp <= r.def.exitMax; sp += 1) {
    const s2 = new Simulation({ preset: preset('sidewinder') });
    s2.ready();
    const { p, v } = dropLanding(r, sp, config.gravity);
    s2.spawnBall(p.x, p.y, v.x, v.y);
    let atBat = null as { x: number } | null;
    run(s2, 4, s => {
      const q = s.balls[0]?.body.getPosition();
      if (q && q.y >= config.batter.handsY - 0.7) { atBat = { x: q.x }; return true; }
    });
    assert.ok(atBat, `speed ${sp}: reaches the batting zone`);
    const reachMin = config.batter.minX + 0.3, reachMax = config.batter.maxX + config.swing.length;
    assert.ok(atBat!.x > reachMin && atBat!.x < reachMax, `speed ${sp}: arrives at x=${atBat!.x.toFixed(1)}, inside the bat's reach`);
  }
});

test('Overpass: the drop often (but not always) feeds the glove; the glove relaunches into the upper cluster', () => {
  let caught = 0, total = 0, reachedUpper = 0;
  for (let speed = 12; speed <= 24; speed += 0.75) {
    const s = new Simulation({ preset: preset('overpass') });
    s.ready();
    shoot(s, 'ramp-over', speed);
    run(s, 6);
    if (!evs(s, 'ramp').some(e => e.phase === 'land')) continue;
    total++;
    if (evs(s, 'scoop').some(e => e.phase === 'catch')) caught++;
    // after the eject, does the relaunch hit upper scoring machinery (bumpers/targets in the top third)?
    const ej = s.events.findIndex(e => e.type === 'scoop' && e.phase === 'eject');
    if (ej >= 0 && s.events.slice(ej).some(e => e.type === 'machine' && ['bumper', 'target', 'jackpot', 'lane'].includes(e.kind) && e.y < 11)) reachedUpper++;
  }
  assert.ok(total >= 8, `${total} completed bridge runs`);
  const rate = caught / total;
  assert.ok(rate >= 0.2 && rate <= 0.9, `glove follow-up rate ${(rate * 100).toFixed(0)}% (attractive, not guaranteed)`);
  assert.ok(reachedUpper >= caught * 0.8, `relaunch reaches the upper cluster (${reachedUpper}/${caught})`);
});

test('glove cannot loop forever: re-catch is blocked for its delay after an eject', () => {
  const s = new Simulation({ preset: preset('overpass') });
  s.ready();
  const sc = s.layout.scoops[0];
  s.spawnBall(sc.x + 0.3, sc.y - 2.2, 0, 2);
  run(s, 1.5);
  const ejectAt = evs(s, 'scoop').find(e => e.phase === 'eject');
  assert.ok(ejectAt);
  // force the ball straight back into the cup right away: must not be caught
  const b = s.balls[0];
  b.body.setPosition(P.Vec2(sc.x, sc.y - 1.6));
  b.body.setLinearVelocity(P.Vec2(0, 3));
  run(s, 0.6);
  assert.equal(evs(s, 'scoop').filter(e => e.phase === 'catch').length, 1);
});

test('entrances are reachable by batting: some swing on the straight pitch sends the ball up each ramp', () => {
  for (const [pid, rid] of RAMPS) {
    let entered = 0, tried = 0;
    for (let offset = -0.9; offset <= 0.9; offset += 0.3) {
      for (let start = 0.55; start <= 0.9; start += 0.01) {
        const s = new Simulation({ preset: preset(pid) });
        s.ready();
        s.batterX = config.batter.startX + offset;
        let swung = false;
        tried++;
        run(s, 3.5, s => {
          if (!swung && s.time >= start) { s.swing(); swung = true; }
          if (evs(s, 'ramp').some(e => e.id === rid && e.phase === 'enter')) return true;
          if (s.time > 3 && !evs(s, 'bat').length) return true;
        });
        if (evs(s, 'ramp').some(e => e.id === rid && e.phase === 'enter')) entered++;
      }
    }
    assert.ok(entered > 0, `${rid}: ${entered}/${tried} swings enter`);
  }
});

test('spinner: one award per crossing, more spins for a faster ball', () => {
  const s = new Simulation({ preset: preset('powerhouse') });
  const sp = s.layout.spinners[0], c = { x: (sp.a.x + sp.b.x) / 2, y: (sp.a.y + sp.b.y) / 2 };
  const once = (speed: number) => {
    const t = new Simulation({ preset: preset('powerhouse') });
    t.ready();
    t.spawnBall(c.x, c.y + 0.45, 0, -speed);
    run(t, 0.15);
    return t.events.filter(e => e.type === 'machine' && e.kind === 'spinner') as Extract<SimEvent, { type: 'machine' }>[];
  };
  const slow = once(6), fast = once(24);
  assert.equal(slow.length, 1);
  assert.equal(fast.length, 1);
  assert.ok(fast[0].spins! > slow[0].spins!, `spins ${slow[0].spins} → ${fast[0].spins}`);
});

test('target bank: completing it pays once, resets, and resets on the next pitch', () => {
  const s = new Simulation({ preset: preset('powerhouse') });
  s.ready();
  const bank = s.layout.banks.find(b => b.id === 'bank-stars')!;
  const hit = (id: string) => {
    const t = s.layout.boxTargets.find(t => t.id === id)!;
    s.spawnBall(t.x - 1.4, t.y, 12, 0);
    run(s, 0.25);
  };
  for (const id of bank.targetIds) hit(id);
  assert.equal(evs(s, 'bank').length, 1);
  hit(bank.targetIds[0]);
  assert.equal(evs(s, 'bank').length, 1, 'not re-awarded until the whole bank is hit again');
  assert.equal(s.banks.get(bank.id)!.size, 1);
  s.rules.phase = 'ready';
  s.ready();
  assert.equal(s.banks.get(bank.id)!.size, 0, 'new pitch resets progress');
});

test('modifiers stack without a cap', () => {
  const many = Array.from({ length: 40 }, () => ({ mul: 1.1, add: 1 }));
  assert.equal(applyModifiers(100, many), Math.round(140 * Math.pow(1.1, 40)));
  const s = new Simulation({ preset: preset('powerhouse') });
  assert.equal(s.pts('bumper-left', 'bumper', 100), Math.round(150 * 2 * 1.5));
  assert.equal(s.pts('jackpot', 'jackpot', 250), 750);
});

test('Turbo multiball stress: live-ball count always matches the rules; no lost or duplicated balls', () => {
  const s = new Simulation({ preset: preset('powerhouse') });
  s.ready();
  const sp = s.layout.splitters[0];
  let maxBalls = 0, mismatches = 0;
  for (let k = 0; k < 25; k++) {
    const b = s.balls.find(b => b.mode === 'field');
    if (!b) break;
    b.body.setPosition(P.Vec2(sp.x, sp.y + sp.hh + 1.2));
    b.body.setLinearVelocity(P.Vec2(0, -14));
    run(s, 0.6, s => {
      maxBalls = Math.max(maxBalls, s.balls.length);
      if (s.rules.phase === 'live' && s.rules.ballsLive !== s.balls.length) mismatches++;
    });
    if (!s.balls.length) break;
  }
  assert.equal(mismatches, 0);
  assert.ok(maxBalls >= 2 && maxBalls <= sp.maxBalls, `peak ${maxBalls}`);
});
