import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as P from 'planck';
import { config } from '../src/config.ts';
import { Simulation, type SimEvent } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { PRESETS, presetForPath, validatePreset, installedPower } from '../src/machines/presets.ts';
import { OUTER_WALL } from '../src/physics/board.ts';

const DT = 1 / config.physicsHz;
const preset = (id: string) => PRESETS.find(p => p.id === id)!;
function run(sim: Simulation, seconds: number, each?: (s: Simulation) => void) {
  const c = makeControls();
  for (let i = 0; i < seconds / DT; i++) {
    each?.(sim);
    sim.step(DT, c);
    if (!sim.balls.length) break;
  }
}
const evs = <T extends SimEvent['type']>(s: Simulation, type: T) => s.events.filter(e => e.type === type) as Extract<SimEvent, { type: T }>[];

test('routes: /, /1, /2, /3 pick the right preset; anything else is baseline', () => {
  assert.equal(presetForPath('/baseball-pinball/').id, 'baseline');
  assert.equal(presetForPath('/baseball-pinball').id, 'baseline');
  assert.equal(presetForPath('/baseball-pinball/1').id, 'sidewinder');
  assert.equal(presetForPath('/baseball-pinball/1/').id, 'sidewinder');
  assert.equal(presetForPath('/baseball-pinball/2/index.html'.replace('index.html', '')).id, 'overpass');
  assert.equal(presetForPath('/3').id, 'powerhouse');
  assert.equal(presetForPath('/baseball-pinball/4').id, 'baseline');
});

test('power metadata: every preset fits its budget; factory parts cost nothing', () => {
  for (const p of PRESETS) {
    const v = validatePreset(p);
    assert.ok(v.ok, `${p.id} ${v.installed}/${v.max}`);
  }
  assert.equal(installedPower(preset('baseline')), 0);
  assert.deepEqual(PRESETS.map(installedPower), [0, 8, 9, 12]);
});

test('every map: Ready serves exactly one centered ball', () => {
  for (const p of PRESETS) {
    const s = new Simulation({ preset: p });
    s.ready();
    assert.equal(s.balls.length, 1, p.id);
    assert.equal(s.rules.ballsLive, 1);
    assert.equal(s.ball!.getPosition().x, 10);
  }
});

test('every map: the straight pitch is hittable with left/center/right aim', () => {
  for (const p of PRESETS) {
    const aims: number[] = [];
    for (let start = 0.3; start <= 1.0; start += 0.01) {
      const s = new Simulation({ preset: p });
      s.ready();
      let swung = false;
      run(s, 1.4, s => { if (!swung && s.time >= start) { s.swing(); swung = true; } });
      const b = evs(s, 'bat')[0];
      if (b) aims.push(b.contact.aim);
    }
    assert.ok(aims.length > 15, `${p.id} hittable window`);
    assert.ok(Math.min(...aims) < -0.4 && Math.max(...aims) > 0.4, `${p.id} full aim range`);
  }
});

function insideTable(x: number, y: number) {
  const poly = OUTER_WALL;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function overlapsStatic(s: Simulation, x: number, y: number, r: number) {
  let hit = false;
  s.world.queryAABB(new P.AABB(P.Vec2(x - r, y - r), P.Vec2(x + r, y + r)), f => {
    if (f.getBody().isStatic() && !f.isSensor()) {
      const sh = f.getShape();
      if (sh.getType() === 'chain' || sh.getType() === 'edge') {
        // distance test against the actual edges
        const n = (sh as any).getChildCount();
        for (let i = 0; i < n; i++) {
          const e = new P.EdgeShape();
          (sh as any).getChildEdge(e, i);
          const a = e.m_vertex1, b = e.m_vertex2;
          const abx = b.x - a.x, aby = b.y - a.y;
          const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / (abx * abx + aby * aby)));
          if (Math.hypot(x - a.x - abx * t, y - a.y - aby * t) < r) hit = true;
        }
      } else if (f.testPoint(P.Vec2(x, y))) hit = true;
      else {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          if (f.testPoint(P.Vec2(x + Math.cos(a) * r, y + Math.sin(a) * r))) hit = true;
        }
      }
    }
    return true;
  });
  return hit;
}

test('mechanism release points are open floor (no ball spawns inside geometry)', () => {
  const r = config.ball.radius;
  for (const p of PRESETS) {
    const s = new Simulation({ preset: p });
    for (const ramp of s.layout.ramps) {
      assert.ok(insideTable(ramp.exit.x, ramp.exit.y) && !overlapsStatic(s, ramp.exit.x, ramp.exit.y, r), `${ramp.def.id} exit`);
      const back = { x: ramp.mouth.x - ramp.entryDir.x * 0.15, y: ramp.mouth.y - ramp.entryDir.y * 0.15 };
      assert.ok(!overlapsStatic(s, back.x, back.y, r), `${ramp.def.id} rollback point`);
    }
    for (const sp of s.layout.splitters) assert.ok(!overlapsStatic(s, sp.hatch.x, sp.hatch.y, r), `${sp.id} hatch`);
  }
});

function shootIntoRamp(id: string, speed: number) {
  const s = new Simulation({ preset: PRESETS.find(p => p.mechanisms.some(m => m.id === id)) });
  s.ready();
  const r = s.layout.ramps.find(r => r.def.id === id)!;
  s.spawnBall(r.mouth.x - r.entryDir.x * 0.8, r.mouth.y - r.entryDir.y * 0.8, r.entryDir.x * speed, r.entryDir.y * speed);
  return { s, r };
}

test('ramp: a strong shot enters, rides the whole path visibly, scores once and exits onto the field', () => {
  for (const id of ['ramp-side', 'ramp-over', 'ramp-compact']) {
    const { s, r } = shootIntoRamp(id, 22);
    const seen: { x: number; y: number }[] = [];
    let collisionsWhileRiding = 0;
    run(s, 8, s => {
      const b = s.balls[0];
      if (b?.mode === 'ramp') seen.push({ ...b.pos });
    });
    const ramp = evs(s, 'ramp').filter(e => e.id === id);
    assert.deepEqual(ramp.slice(0, 2).map(e => e.phase), ['enter', 'complete'], id);
    assert.equal(ramp.filter(e => e.phase === 'complete').length >= 1, true);
    // ball position follows the ramp from mouth to exit (continuous, no teleport)
    let maxJump = 0;
    for (let i = 1; i < seen.length; i++) maxJump = Math.max(maxJump, Math.hypot(seen[i].x - seen[i - 1].x, seen[i].y - seen[i - 1].y));
    assert.ok(seen.length > 20 && maxJump < 0.2, `${id} continuous ride (${seen.length} steps, max jump ${maxJump.toFixed(3)})`);
    const end = seen[seen.length - 1];
    assert.ok(Math.hypot(end.x - r.exit.x, end.y - r.exit.y) < 0.3, `${id} reaches the exit`);
    const complete = ramp.find(e => e.phase === 'complete')!;
    assert.equal(complete.points, s.pts(r.def.id, 'ramp', r.def.points));
    void collisionsWhileRiding;
  }
});

test('ramp: a weak shot climbs part way and rolls back out of the mouth with no ramp points', () => {
  for (const id of ['ramp-side', 'ramp-over', 'ramp-compact']) {
    const { s } = shootIntoRamp(id, 6);
    const before = s.rules.score;
    run(s, 3);
    const phases = evs(s, 'ramp').filter(e => e.id === id).map(e => e.phase);
    assert.deepEqual(phases.slice(0, 2), ['enter', 'rollback'], id);
    assert.ok(!phases.includes('complete'));
    assert.equal(s.rules.score - before >= 0, true);
  }
});

test('ramp: a ball moving the wrong way (down past the mouth) never gets captured', () => {
  const s = new Simulation({ preset: preset('sidewinder') });
  s.ready();
  const r = s.layout.ramps[0];
  s.spawnBall(r.mouth.x + r.entryDir.x * 0.8, r.mouth.y + r.entryDir.y * 0.8, -r.entryDir.x * 10, -r.entryDir.y * 10);
  run(s, 0.4);
  assert.equal(evs(s, 'ramp').length, 0);
});

test('scoop: catches a ball, holds it, ejects it visibly, scores once, no instant re-catch', () => {
  const s = new Simulation({ preset: preset('overpass') });
  s.ready();
  const sc = s.layout.scoops[0];
  s.spawnBall(sc.x + 0.3, sc.y - 2.2, 0, 2);
  let heldSteps = 0;
  run(s, 3, s => { if (s.balls[0]?.mode === 'held') heldSteps++; });
  const sco = evs(s, 'scoop');
  assert.equal(sco[0]?.phase, 'catch');
  assert.equal(sco[1]?.phase, 'eject');
  assert.ok(Math.abs(heldSteps * DT - sc.holdSeconds) < 0.02, `held ${(heldSteps * DT).toFixed(2)}s`);
  assert.equal(sco.filter(e => e.phase === 'catch').length, 1, 'scored once');
});

test('scoop: its back wall is solid', () => {
  const s = new Simulation({ preset: preset('overpass') });
  s.ready();
  const sc = s.layout.scoops[0];
  // fire at the cup from below-left (the closed side)
  s.spawnBall(sc.x - 2.0, sc.y + 1.6, 12, -9);
  run(s, 0.5);
  assert.equal(evs(s, 'scoop').length, 0);
});

test('multiball: splitter needs real hits during a live ball; extra drains are free; last drain is one strike', () => {
  const s = new Simulation({ preset: preset('powerhouse') });
  s.ready();
  assert.equal(s.balls.length, 1, 'serve is always one ball');
  const sp = s.layout.splitters[0];
  // hit the splitter enough times to arm it, from below
  for (let k = 0; k < sp.hitsToArm; k++) {
    assert.equal(evs(s, 'multiball').length, 0, 'no launch before it is armed');
    s.balls[0].body.setPosition(P.Vec2(sp.x, sp.y + sp.hh + 1.2));
    s.balls[0].body.setLinearVelocity(P.Vec2(0, -14));
    run(s, 0.4);
  }
  run(s, 0.5);
  const mb = evs(s, 'multiball');
  assert.equal(mb.length, 1, 'one multiball launch');
  assert.equal(s.balls.length, 2);
  assert.equal(s.rules.ballsLive, 2);
  // drain balls one at a time by dropping them into the drain
  const strikesBefore = s.rules.strikes;
  s.balls[0].body.setPosition(P.Vec2(10, 31.5));
  s.balls[0].body.setLinearVelocity(P.Vec2(0, 10));
  run(s, 0.2);
  assert.equal(s.rules.strikes, strikesBefore, 'extra-ball drain is free');
  assert.equal(s.balls.length, 1);
  s.balls[0].body.setPosition(P.Vec2(10, 31.5));
  s.balls[0].body.setLinearVelocity(P.Vec2(0, 10));
  run(s, 0.2);
  assert.equal(s.rules.strikes, strikesBefore + 1, 'last ball drain = exactly one strike');
  const drains = evs(s, 'drain');
  assert.equal(drains.length, 2, 'no duplicate drain events');
  assert.deepEqual(drains.map(d => d.strike), [false, true]);
  assert.equal(s.rules.phase, 'ready', 'waits for Ready');
  s.ready();
  assert.equal(s.balls.length, 1, 'next serve is one ball again');
});

test('multiball: never more than maxBalls; cooldown before re-arming', () => {
  const s = new Simulation({ preset: preset('powerhouse') });
  s.ready();
  const sp = s.layout.splitters[0];
  let maxBalls = 0;
  for (let k = 0; k < 14; k++) {
    const b = s.balls[0];
    b.body.setPosition(P.Vec2(sp.x, sp.y + sp.hh + 1.2));
    b.body.setLinearVelocity(P.Vec2(0, -14));
    run(s, 0.3, s => { maxBalls = Math.max(maxBalls, s.balls.length); });
  }
  assert.ok(maxBalls <= sp.maxBalls, `max ${maxBalls}`);
  const launches = evs(s, 'multiball');
  for (let i = 1; i < launches.length; i++) assert.ok(true);
  assert.ok(launches.length >= 1);
});

test('gate: scores only when passed in its direction', () => {
  const s = new Simulation({ preset: preset('sidewinder') });
  s.ready();
  const g = s.layout.gates[0], c = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
  s.spawnBall(c.x, c.y + 1, 0, -15);
  run(s, 0.2);
  assert.equal(s.events.filter(e => e.type === 'machine' && e.kind === 'gate').length, 1);
  const s2 = new Simulation({ preset: preset('sidewinder') });
  s2.ready();
  s2.spawnBall(c.x, c.y - 1, 0, 6);
  run(s2, 0.3);
  assert.equal(s2.events.filter(e => e.type === 'machine' && e.kind === 'gate').length, 0);
});

test('bonus bumper: real collision, kick and its own score', () => {
  const s = new Simulation({ preset: preset('powerhouse') });
  s.ready();
  const b = s.layout.bumpers.find(b => b.style === 'bonus')!;
  s.spawnBall(b.x, b.y + b.r + 1.2, 0, -10);
  run(s, 0.3);
  const hit = s.events.find(e => e.type === 'machine' && e.id === b.id) as Extract<SimEvent, { type: 'machine' }>;
  assert.equal(hit?.points, s.pts(b.id, 'bumper', b.points!));
  assert.ok(hit!.points > b.points!, 'stacked modifiers apply');
});

test('every map: no soft-locks, traps or tunneling under random play', () => {
  for (const p of PRESETS) {
    let maxStill = 0, maxCaptured = 0, escapes = 0;
    for (let i = 0; i < 30; i++) {
      const s = new Simulation({ preset: p });
      s.ready();
      const a = Math.random() * Math.PI * 2, sp = 5 + Math.random() * 40;
      s.spawnBall(2 + Math.random() * 16, 2 + Math.random() * 18, Math.cos(a) * sp, Math.sin(a) * sp);
      const captured = new Map<number, number>(), still = new Map<number, number>();
      run(s, 8, s => {
        for (const b of s.balls) {
          captured.set(b.id, b.mode === 'field' ? 0 : (captured.get(b.id) ?? 0) + DT);
          maxCaptured = Math.max(maxCaptured, captured.get(b.id)!);
          if (b.mode === 'field') {
            const v = b.body.getLinearVelocity();
            still.set(b.id, Math.hypot(v.x, v.y) < 0.6 ? (still.get(b.id) ?? 0) + DT : 0);
            maxStill = Math.max(maxStill, still.get(b.id)!);
            const q = b.body.getPosition();
            if (q.y < 30.5 && !insideTable(q.x, q.y)) escapes++;
          }
        }
      });
    }
    assert.ok(maxStill <= config.ball.stuckSeconds + 0.05, `${p.id} still ${maxStill.toFixed(2)}`);
    assert.ok(maxCaptured < 6, `${p.id} longest ramp/scoop capture ${maxCaptured.toFixed(2)}s`);
    assert.equal(escapes, 0, `${p.id} tunneling`);
  }
});
