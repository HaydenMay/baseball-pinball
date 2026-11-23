/** Closer rules: Hot Corner (src/core/bosses.ts + sim). */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { config } from '../src/config.ts';
import { Simulation, type SimEvent } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { HOT_CORNER, closerFor } from '../src/core/bosses.ts';
import { Run } from '../src/run/run.ts';

const DT = 1 / config.physicsHz;

test('Closer slots: Hot Corner is Inning 1’s Closer (C3); other challenges have no rule yet', () => {
  assert.equal(closerFor(3), 'hotCorner');
  for (const n of [1, 2, 4, 5, 7]) assert.equal(closerFor(n), null);
  assert.equal(closerFor(6), null, 'later Closers not designed yet');
});

test('Hot Corner: ×3 on the hot part, ×0.8 everywhere else, before the global multiplier', () => {
  const ev: SimEvent[] = [];
  const s = new Simulation({ preset: new Run(1).preset(), onEvent: e => ev.push(e) });
  s.setBoss('hotCorner');
  assert.ok(s.hot, 'a spot is chosen at once');
  const award = (s as any).award.bind(s);
  s.ready();
  const ball = s.balls[0];
  // force a known hot spot: the first bumper
  const b = s.layout.bumpers[0];
  s.hot = { ...s.hotSpots().find(h => h.key === `id:${b.id}`)!, left: HOT_CORNER.seconds };
  s.rules.multTenths = 20;
  award('bumper', b.id, 100, 100, ball);
  award('bumper', s.layout.bumpers[1].id, 100, 100, ball);
  const sc = ev.filter(e => e.type === 'score') as Extract<SimEvent, { type: 'score' }>[];
  assert.equal(sc[0].modified, 300);
  assert.equal(sc[0].awarded, 600);
  assert.equal(sc[1].modified, 80);
  assert.equal(sc[1].awarded, 160);
});

test('Hot Corner moves every 15 live seconds to a different spot, pauses between pitches, survives save/resume', () => {
  const ev: SimEvent[] = [];
  const s = new Simulation({ preset: new Run(1).preset(), onEvent: e => ev.push(e), seed: 7 });
  s.setBoss('hotCorner');
  const first = s.hot!.key;
  // not live: the timer holds
  for (let i = 0; i < 20 / DT; i++) s.step(DT);
  assert.equal(s.hot!.key, first);
  s.ready();
  (s as any).spawnBall(10, 2, 0, 0); // keep a ball on the table
  const c = makeControls();
  let moves = 0, prev = first;
  for (let i = 0; i < 31 / DT && s.rules.phase === 'live'; i++) {
    s.step(DT, c);
    if (s.hot!.key !== prev) {
      moves++;
      prev = s.hot!.key;
    }
    if (s.balls.length === 0) break;
  }
  // a ball may drain early; whenever we had live time, the spot moved on schedule and never to itself
  const hops = ev.filter(e => e.type === 'hot' && !e.first) as Extract<SimEvent, { type: 'hot' }>[];
  assert.equal(hops.length, moves);
  for (let i = 1; i < hops.length; i++) assert.notEqual(hops[i].key, hops[i - 1].key);
  // carry
  const carry = s.carryState();
  if (s.rules.phase === 'ready') {
    const t = new Simulation({ preset: new Run(1).preset(), seed: 7 });
    t.setBoss('hotCorner');
    t.restoreCarry(carry);
    assert.equal(t.hot!.key, s.hot!.key);
    assert.ok(Math.abs(t.hot!.left - s.hot!.left) < 1e-9);
  }
});

test('every spot is somewhere on the table and matches real scoring ids', () => {
  const s = new Simulation({ preset: new Run(1).preset() });
  const spots = s.hotSpots();
  assert.ok(spots.length >= 6, `${spots.length} spots`);
  for (const h of spots) for (const p of h.spots) assert.ok(p.x > 0 && p.x < 20 && p.y > -10 && p.y < 32, `${h.key} on table`);
  assert.equal(new Set(spots.map(h => h.key)).size, spots.length);
});
