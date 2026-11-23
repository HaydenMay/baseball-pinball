/** Closer rules: Hot Corner (src/core/bosses.ts + sim). */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { config } from '../src/config.ts';
import { Simulation, type SimEvent } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { CALLED_SHOT, HOT_CORNER, RUNNERS, closerFor } from '../src/core/bosses.ts';
import { Run } from '../src/run/run.ts';

const DT = 1 / config.physicsHz;

test('Closer slots: Hot Corner, Small Ball, Called Shot, Rain Delay, Runners on Base; non-Closers have none', () => {
  assert.deepEqual([3, 6, 9, 12, 15].map(n => closerFor(n)), ['hotCorner', 'smallBall', 'calledShot', 'rainDelay', 'runnersOnBase']);
  for (const n of [1, 2, 4, 5, 7, 14]) assert.equal(closerFor(n), null);
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

const withBoss = (boss: Parameters<Simulation['setBoss']>[0], deck = false) => {
  const ev: SimEvent[] = [];
  const preset = new Run(1).preset();
  if (deck) preset.sections = ['upperDeck'];
  const s = new Simulation({ preset, onEvent: e => ev.push(e) });
  s.setBoss(boss);
  return { s, ev, award: (s as any).award.bind(s) as (k: string, id: string, b: number, m: number, ball: unknown) => number };
};

test('Small Ball: the multiplier never grows', () => {
  const { s } = withBoss('smallBall');
  s.ready();
  (s as any).boost('gate', 'g', 0, 0, 5, s.balls[0]);
  assert.equal(s.rules.multTenths, 10);
});

test('Called Shot: within 2.5 s of a bat hit, hitting the called part first doubles the rest of the pitch; slings/lanes never count; another part misses', () => {
  const { s, ev, award } = withBoss('calledShot');
  s.ready();
  const c = s.called!;
  assert.ok(c && c.status === 'pending');
  assert.ok(!['kind:sling', 'kind:lane'].includes(c.key), 'never calls slings or lanes');
  const ball = s.balls[0];
  const [kind, id] = c.key.startsWith('kind:') ? [c.key.slice(5), 'x'] : ['bumper', c.key.slice(3)];
  award(kind, id, 100, 100, ball); // no bat contact yet: no window
  assert.equal(s.called!.status, 'pending');
  (s as any).callWindowUntil = s.time + CALLED_SHOT.windowSec;
  award('sling', 'sling-l', 10, 10, ball); // slings don't count either way
  award('lane', 'lane-left', 10, 10, ball);
  assert.equal(s.called!.status, 'pending');
  award(kind, id, 100, 100, ball);
  assert.equal(s.called!.status, 'hit');
  const last = ev.filter(e => e.type === 'score').at(-1) as Extract<SimEvent, { type: 'score' }>;
  assert.equal(last.modified, 200);
  // next pitch: window expired = still pending; a different part inside a window misses
  s.rules.phase = 'ready';
  s.ready();
  const other = s.layout.bumpers.find(b => `id:${b.id}` !== s.called!.key)!;
  (s as any).callWindowUntil = s.time - 0.01;
  award('bumper', other.id, 10, 10, s.balls[0]);
  assert.equal(s.called!.status, 'pending', 'outside a window nothing resolves');
  (s as any).callWindowUntil = s.time + 1;
  award('bumper', other.id, 10, 10, s.balls[0]);
  assert.equal(s.called!.status, 'missed');
});

test('Rain Delay: the Home Run ramp cannot be entered', () => {
  const { s, ev } = withBoss('rainDelay', true);
  s.ready();
  const r = s.layout.ramps.find(r => r.def.id === 'hr-ramp')!;
  assert.ok(r, 'deck board has the Home Run ramp');
  const ball = s.balls[0];
  const m = r.mouth, d = r.entryDir;
  (s as any).put?.(ball, m.x - d.x * 0.6, m.y - d.y * 0.6);
  ball.body.setPosition({ x: m.x - d.x * 0.6, y: m.y - d.y * 0.6 } as any);
  ball.body.setLinearVelocity({ x: d.x * 20, y: d.y * 20 } as any);
  for (let i = 0; i < 0.3 / DT; i++) s.step(DT);
  assert.ok(!ev.some(e => e.type === 'ramp' && e.id === 'hr-ramp' && e.phase === 'enter'));
});

test('Runners on Base: points wait on base; a bat contact drives them in ×1.25; runners left when the last ball drains score nothing', () => {
  const { s, ev, award } = withBoss('runnersOnBase');
  s.ready();
  const ball = s.balls[0];
  s.rules.multTenths = 20;
  award('bumper', 'bumper-left', 100, 100, ball);
  award('bumper', 'bumper-left', 100, 100, ball);
  assert.equal(s.rules.score, 0, 'nothing banked yet');
  assert.equal(s.onBase, 400, 'multiplier applied when they reach base');
  (s as any).bankRunners('in', ball, 0, 0);
  assert.equal(s.rules.score, 400 * RUNNERS.driveIn);
  assert.equal(s.onBase, 0);
  award('bumper', 'bumper-left', 100, 100, ball);
  (s as any).drainBall(ball);
  assert.equal(s.rules.score, 400 * RUNNERS.driveIn, 'stranded runners score nothing');
  assert.ok(ev.some(e => e.type === 'runners' && e.phase === 'stranded' && e.onBase === 200 && e.banked === 0));
  const total = ev.filter(e => e.type === 'score').reduce((n, e) => n + (e as any).awarded, 0);
  assert.equal(total, s.rules.score, 'score events reconcile');
});
