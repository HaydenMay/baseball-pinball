/**
 * Power by inning, the experimental ×1.4 target curve, and 8 × 1,000 ramp checkpoints (build test only).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { config } from '../src/config.ts';
import { Simulation, type SimEvent } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { Run, type Offer } from '../src/run/run.ts';
import { ECONOMY, maxPowerFor, targetFor } from '../src/run/economy.ts';
import { MACHINES, MODS, RAMP_CHECKPOINTS } from '../src/run/catalog.ts';
import type { Modifier } from '../src/machines/mechanisms.ts';
import { PRESETS } from '../src/machines/presets.ts';

const DT = 1 / config.physicsHz;

function install(r: Run, key: string, mount?: string) {
  const m = MACHINES.find(m => m.key === key)!;
  const o: Offer = { uid: 9000 + r.installed.length, kind: 'machine', key, name: m.name, desc: m.desc, power: m.power, price: m.price, mounts: Object.keys(m.at) };
  const phase = r.phase, shop = r.shop, draft = r.draft;
  r.phase = 'draft';
  r.draft = [o];
  const res = r.takeDraft(o.uid, mount);
  Object.assign(r, { phase, shop, draft });
  return res;
}
const mod = (r: Run, key: string, target: string) => {
  const t = MODS.find(t => t.key === key)!;
  const m: Modifier = { note: t.name };
  if (t.add) m.add = t.add;
  if (t.mul) m.mul = t.mul;
  if (t.gen) m.gen = { ...t.gen };
  (r.mods[target] ??= []).push(m);
};
/** Clear the current challenge and move on to the next one (taking the first usable free pick). */
function advance(r: Run) {
  r.clear(3);
  const pick = r.draft.find(o => r.check(o).ok);
  if (pick) {
    const c = r.check(pick);
    r.takeDraft(pick.uid, c.ok ? c.mounts[0] : undefined);
  } else r.phase = 'shop';
  r.next();
}

// ───────── A. Power by inning ─────────

test('power: starts at 6, +1 on clearing C3, C6, C9, C12 (10 in inning 5); C15 wins with no grant, draft or C16', () => {
  const r = new Run(1);
  assert.equal(ECONOMY.lastChallenge, 15);
  assert.equal(r.maxPower, 6);
  const seen: number[] = [];
  for (let c = 1; c <= 15; c++) {
    assert.equal(r.challenge, c);
    assert.equal(r.maxPower, maxPowerFor(c), `max Power while playing C${c}`);
    seen.push(r.maxPower);
    const before: number = r.maxPower;
    r.clear(2);
    const grant = c % 3 === 0 && c < 15;
    assert.equal(r.maxPower, before + (grant ? 1 : 0), `clear C${c}`);
    assert.equal(!!r.powerGrant, grant);
    if (grant) assert.deepEqual(r.powerGrant, { inning: c / 3 + 1, gained: 1, maxPower: before + 1 });
    if (c === 15) {
      assert.equal(r.phase, 'won', 'clearing C15 wins the run');
      assert.equal(r.draft.length, 0, 'no draft after the final clear');
      assert.equal(r.next(), false, 'no C16');
      assert.equal(r.challenge, 15);
      break;
    }
    // a second clear() callback (or a reroll) never grants again
    r.clear(2);
    r.money = 50;
    r.phase = 'shop';
    r.reroll();
    assert.equal(r.maxPower, before + (grant ? 1 : 0), `no duplicate grant at C${c}`);
    r.next();
    assert.equal(r.powerGrant, null, 'grant message only on that transition');
  }
  assert.deepEqual([...new Set(seen)], [6, 7, 8, 9, 10]);
  assert.equal(maxPowerFor(13), 10);
  assert.equal(maxPowerFor(15), 10);
});

test('power: no grant on failure', () => {
  const r = new Run(2);
  advance(r);
  advance(r);
  assert.equal(r.challenge, 3);
  r.fail();
  assert.equal(r.clear(3), 0, 'a failed run cannot clear');
  assert.equal(r.maxPower, 6);
});

test('power: the grant lands before the inning-ending draft is rolled, so the new slot is usable at once', () => {
  let usableMachine = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const r = new Run(seed);
    // fill all 6 Power: Overpass ⚡3 + bonus bumper ⚡1 + both multiplier gates ⚡1+1
    assert.ok(install(r, 'bridge-ramp').ok);
    assert.ok(install(r, 'bonus-bumper', 'pocket-ul').ok);
    assert.ok(install(r, 'mult-gate', 'gate-l').ok);
    assert.ok(install(r, 'mult-gate', 'gate-r').ok);
    assert.equal(r.powerUsed, 6);
    r.challenge = 3;
    r.clear(1);
    assert.equal(r.maxPower, 7);
    for (const m of r.draft.filter(o => o.kind === 'machine')) {
      const c = r.check(m);
      // installable now with the new Power, or fixable through Manage Machine (never impossible)
      assert.ok(c.ok || c.fixable, `${m.name}: ${(c as any).reason}`);
      if (c.ok && m.power === 1) usableMachine++;
    }
    assert.ok(r.draft.some(o => o.kind === 'modifier'), 'a claimable modifier is always there');
  }
  assert.ok(usableMachine >= 3, `a 1-Power machine became installable thanks to the grant in ${usableMachine}/30 drafts`);
});

// ───────── B. Target curve ─────────

test('targets: softened C1–C6, then ×1.4 per challenge from C3 = 8,000 (C7+ unchanged)', () => {
  assert.equal(ECONOMY.targetGrowth, 1.4);
  const want = [1200, 2400, 4500, 7000, 11500, 18800, 30700, 43000, 60200, 84300, 118100, 165300, 231400, 324000, 453600];
  assert.deepEqual(Array.from({ length: 15 }, (_, i) => targetFor(i + 1)), want);
  assert.deepEqual([25, 26, 27].map(targetFor), [13119200, 18366900, 25713600]);
});

// ───────── C. Ramp checkpoints ─────────

function rampRun(key: 'turbo-ramp' | 'bridge-ramp', seed = 3) {
  const r = new Run(seed);
  assert.ok(install(r, key).ok);
  return { r, id: r.installed.find(i => i.offerKey === key)!.id };
}
function ride(r: Run, opts: { speed?: number; mult?: number; balls?: number } = {}) {
  const ev: SimEvent[] = [];
  const s = new Simulation({ preset: r.preset(), onEvent: e => ev.push(e) });
  s.rules.target = null;
  s.ready();
  if (opts.mult) s.rules.multTenths = opts.mult * 10;
  const rp = s.layout.ramps[0];
  const speed = opts.speed ?? 20;
  for (let k = 0; k < (opts.balls ?? 1); k++) {
    const back = 0.8 + k * 0.5;
    (s as any).addBall(rp.mouth.x - rp.entryDir.x * back, rp.mouth.y - rp.entryDir.y * back, rp.entryDir.x * speed, rp.entryDir.y * speed);
  }
  const start = s.rules.score;
  const c = makeControls();
  for (let i = 0; i < 3 / DT && s.balls.some(b => b.mode !== 'field' || b.body.getPosition().y < 20); i++) {
    s.step(DT, c);
    if (ev.filter(e => e.type === 'ramp' && e.phase === 'complete').length >= (opts.balls ?? 1)) break;
  }
  const cps = ev.filter(e => e.type === 'rampCheckpoint') as Extract<SimEvent, { type: 'rampCheckpoint' }>[];
  const rampPoints = cps.reduce((a, e) => a + e.points, 0);
  return { s, ev, cps, rampPoints, gained: s.rules.score - start };
}

for (const key of ['turbo-ramp', 'bridge-ramp'] as const) {
  test(`${key}: a full ride pays exactly 8 checkpoints × 1,000 = 8,000 base (replaces the old gate + finish)`, () => {
    const { r } = rampRun(key);
    const { ev, cps, rampPoints } = ride(r);
    assert.deepEqual(cps.map(e => e.index), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.ok(cps.every(e => e.points === 1000 && e.count === 8));
    assert.equal(rampPoints, RAMP_CHECKPOINTS.count * RAMP_CHECKPOINTS.points);
    assert.equal(rampPoints, 8000);
    assert.ok(!ev.some(e => e.type === 'rampGate'), 'no legacy gate payout');
    const done = ev.filter(e => e.type === 'ramp' && e.phase === 'complete');
    assert.equal(done.length, 1);
    assert.equal((done[0] as any).points, 0, 'completion event is presentation only, no extra points');
    // checkpoints are in path order and all after the climb crest
    const rp = ride(r).s.layout.ramps[0];
    assert.ok(rp.cpS.every((d, i) => d > rp.def.climb && (i === 0 || d > rp.cpS[i - 1])));
    assert.equal(rp.cpS[7], rp.length);
  });

  test(`${key}: at ×5 global the same ride pays 40,000 (multiplier applied once per checkpoint)`, () => {
    const { r } = rampRun(key);
    const { cps, rampPoints } = ride(r, { mult: 5 });
    assert.equal(cps.length, 8);
    assert.ok(cps.every(e => e.points === 5000));
    assert.equal(rampPoints, 40000);
  });
}

test('checkpoints: a failed entry (rollback on the climb) pays nothing; a later legitimate ride pays all 8 again', () => {
  const { r } = rampRun('turbo-ramp');
  const slow = ride(r, { speed: 5 });
  assert.ok(slow.ev.some(e => e.type === 'ramp' && e.phase === 'enter'), 'it did enter the mouth');
  assert.equal(slow.cps.length, 0);
  assert.equal(slow.rampPoints, 0);
  // same sim, a new ride
  const s = slow.s;
  const rp = s.layout.ramps[0];
  const ball = s.balls[0] ?? (s as any).addBall(rp.mouth.x, rp.mouth.y + 1, 0, 0);
  (s as any).enterRamp(ball, rp, 20);
  for (let i = 0; i < 3 / DT && ball.mode === 'ramp'; i++) s.step(DT, makeControls());
  assert.equal(slow.ev.filter(e => e.type === 'rampCheckpoint').length, 8);
});

test('checkpoints: one huge physics tick still pays every crossed checkpoint, once each, in order', () => {
  const { r } = rampRun('bridge-ramp');
  const ev: SimEvent[] = [];
  const s = new Simulation({ preset: r.preset(), onEvent: e => ev.push(e) });
  s.ready();
  const rp = s.layout.ramps[0], ball = s.balls[0];
  (s as any).enterRamp(ball, rp, rp.def.maxRide);
  ball.ramp!.s = rp.def.climb + 0.01; // past the crest
  (s as any).stepRamp(ball, 0.45); // ~8 units in one tick
  const first = ev.filter(e => e.type === 'rampCheckpoint').map(e => (e as any).index);
  assert.ok(first.length >= 3, `one tick crossed ${first.length}`);
  assert.deepEqual(first, first.map((_, i) => i));
  for (let i = 0; i < 400 && ball.mode === 'ramp'; i++) (s as any).stepRamp(ball, DT);
  assert.deepEqual(ev.filter(e => e.type === 'rampCheckpoint').map(e => (e as any).index), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('checkpoints: multiball riders on the same ramp each earn their own 8', () => {
  const { r } = rampRun('turbo-ramp');
  const { cps } = ride(r, { balls: 2 });
  const byBall = new Map<number, number[]>();
  for (const e of cps) byBall.set(e.ball, [...(byBall.get(e.ball) ?? []), e.index]);
  assert.equal(byBall.size, 2);
  for (const idx of byBall.values()) assert.deepEqual(idx, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('checkpoints: Toll Booth hits only the halfway checkpoint, Nitro only the last; Victory Lap once per ride', () => {
  const base = rampRun('bridge-ramp');
  const tb = (() => {
    const x = rampRun('bridge-ramp');
    mod(x.r, 'toll-booth', x.id + '-gate');
    return ride(x.r);
  })();
  const halfway = tb.cps.find(e => e.points !== 1000)!;
  assert.equal(tb.rampPoints, 8500, 'Toll Booth: +500 on one checkpoint');
  assert.equal(halfway.points, 1500);
  const rp = tb.s.layout.ramps[0];
  assert.equal(halfway.index, rp.cpGate);
  assert.ok(Math.abs(rp.cpS[rp.cpGate] / rp.length - 0.5) < 0.15, 'the Toll Booth checkpoint is near the middle');

  const x = rampRun('bridge-ramp');
  mod(x.r, 'nitro', x.id);
  const n = ride(x.r);
  assert.equal(n.rampPoints, 8500, 'Nitro: ×1.5 on the final checkpoint only');
  assert.equal(n.cps[7].points, 1500);

  mod(x.r, 'toll-booth', x.id + '-gate');
  mod(x.r, 'victory-lap', x.id);
  const both = ride(x.r);
  assert.equal(both.rampPoints, 9000);
  const gens = both.ev.filter(e => e.type === 'mult');
  assert.equal(gens.length, 1, 'completion generator fires once per full ride, not per checkpoint');
  assert.equal((gens[0] as any).gain, 1);
  const i8 = both.ev.indexOf(both.cps[7]);
  assert.ok(both.ev.indexOf(gens[0]) > i8, 'after the final checkpoint scored');
  void base;
});

test('legacy maps keep their old ramp scoring (no checkpoints on /, /1, /2, /3)', () => {
  for (const p of Object.values(PRESETS)) for (const m of p.mechanisms) if (m.type === 'ramp') assert.equal(m.checkpoints, undefined, `${p.name} ${m.id}`);
  // Overpass on /2 still pays its old gate + finish
  const p2 = Object.values(PRESETS).find(p => p.name.startsWith('Overpass'))!;
  const ev: SimEvent[] = [];
  const s = new Simulation({ preset: p2, onEvent: e => ev.push(e) });
  s.ready();
  const rp = s.layout.ramps.find(r => r.def.gate)!;
  (s as any).enterRamp(s.balls[0], rp, rp.def.maxRide);
  for (let i = 0; i < 3 / DT && s.balls[0].mode === 'ramp'; i++) s.step(DT, makeControls());
  assert.equal(ev.filter(e => e.type === 'rampCheckpoint').length, 0);
  assert.equal(ev.filter(e => e.type === 'rampGate').length, 1);
  assert.equal((ev.find(e => e.type === 'ramp' && e.phase === 'complete') as any).points, rp.def.points);
});

test('card copy states 8 × 1,000 = 8,000 base and what Nitro/Toll Booth now hit', () => {
  for (const key of ['turbo-ramp', 'bridge-ramp']) assert.match(MACHINES.find(m => m.key === key)!.desc, /8 checkpoints × 1,000 = 8,000 base/);
  assert.match(MODS.find(t => t.key === 'nitro')!.effect, /final checkpoint/);
  assert.match(MODS.find(t => t.key === 'toll-booth')!.effect, /halfway checkpoint/);
});

test('player route: no ramp machines in the free picks after C1 and C2; Closer targets ×1.25', async () => {
  const { PLAY } = await import('../src/core/play-rules.ts');
  const { MACHINES } = await import('../src/run/catalog.ts');
  const was = PLAY.enabled;
  PLAY.enabled = true;
  try {
    const rampKeys = new Set(MACHINES.filter(m => m.family === 'ramp').map(m => m.key));
    let early = 0, later = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const r = new Run(seed);
      for (let c = 1; c <= 4 && r.phase !== 'won'; c++) {
        r.clear(2);
        const ramps = r.draft.filter(o => o.kind === 'machine' && rampKeys.has(o.key)).length;
        if (r.challenge <= 2) early += ramps;
        else later += ramps;
        const pick = r.draft.find(o => r.check(o).ok) ?? r.draft[0];
        if (pick) r.takeDraft(pick.uid);
        if (r.phase === 'draft') r.takeDraft(r.draft[0].uid);
        r.next();
      }
    }
    assert.equal(early, 0);
    assert.ok(later > 0, 'ramps still show up from the C3 draft on');
    assert.equal(targetFor(3), 5600, '4,500 × 1.25');
    assert.equal(targetFor(4), 7000, 'non-Closers unchanged');
  } finally {
    PLAY.enabled = was;
  }
});
