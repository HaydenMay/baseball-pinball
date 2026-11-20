/**
 * Upgrade System 2.0: global strike multiplier, multiplier gates, generator modifiers, draft/shop split.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { config } from '../src/config.ts';
import { GameRules } from '../src/core/rules.ts';
import { Simulation, GATE_HYSTERESIS, type SimEvent } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { Run, type Offer } from '../src/run/run.ts';
import { MACHINES, MODS, BUMPER_GEN_EVERY } from '../src/run/catalog.ts';
import type { MultGateDef, Modifier } from '../src/machines/mechanisms.ts';
import { PRESETS } from '../src/machines/presets.ts';

const DT = 1 / config.physicsHz;
const GATE = MACHINES.find(m => m.key === 'mult-gate')!;

function install(r: Run, key: string, mount?: string) {
  const m = MACHINES.find(m => m.key === key)!;
  const o: Offer = { uid: 9000 + r.installed.length, kind: 'machine', key, name: m.name, desc: m.desc, power: m.power, price: m.price, mounts: Object.keys(m.at) };
  const phase = r.phase, shop = r.shop;
  r.phase = 'draft';
  r.draft = [o];
  const res = r.takeDraft(o.uid, mount);
  Object.assign(r, { phase, shop, draft: [] });
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
function liveSim(r: Run) {
  const ev: SimEvent[] = [];
  const s = new Simulation({ preset: r.preset(), onEvent: e => ev.push(e) });
  s.rules.target = null;
  s.ready();
  return { s, ev, mults: () => ev.filter(e => e.type === 'mult') as Extract<SimEvent, { type: 'mult' }>[] };
}
/** Drive the gate detector with a sequence of ball positions (pure geometry, no physics). */
function sweep(s: Simulation, g: MultGateDef, ballIndex: number, pts: { x: number; y: number }[]) {
  const b = s.balls[ballIndex];
  for (const p of pts) (s as any).checkMultGate(b, g, p);
}
const line = (x: number, y0: number, y1: number, n = 30) => Array.from({ length: n + 1 }, (_, i) => ({ x, y: y0 + ((y1 - y0) * i) / n }));
function gateOf(s: Simulation, side: 'left' | 'right') {
  return s.layout.multGates.find(g => g.side === side)!;
}

// ───────── 1. Power & mounts ─────────

test('gate: 1 Power on either side, both coexist at 2 Power, capacity and taken mounts respected', () => {
  for (const mount of ['gate-l', 'gate-r']) {
    const r = new Run(1);
    assert.ok(install(r, 'mult-gate', mount).ok);
    assert.equal(r.powerUsed, 1, `${mount} costs 1`);
  }
  const r = new Run(2);
  assert.ok(install(r, 'mult-gate', 'gate-l').ok);
  assert.ok(install(r, 'mult-gate').ok, 'the only free side is chosen automatically');
  assert.equal(r.powerUsed, 2);
  assert.deepEqual(r.installed.map(i => i.mountId).sort(), ['gate-l', 'gate-r']);
  const third = install(r, 'mult-gate');
  assert.ok(!third.ok, 'no third gate');
  // at Power cap a gate is refused
  const full = new Run(3);
  full.maxPower = 1;
  assert.ok(install(full, 'spinner', 'lane-l').ok);
  assert.ok(!install(full, 'mult-gate', 'gate-l').ok);
  // gates coexist with the lane spinners and the other alley hardware
  const all = new Run(4);
  all.maxPower = 10;
  for (const [k, m] of [['spinner', 'lane-l'], ['spinner', 'lane-r'], ['mult-gate', 'gate-l'], ['mult-gate', 'gate-r']]) assert.ok(install(all, k, m).ok, `${k}@${m}`);
});

test('gates live only in the build test: no legacy preset installs one', () => {
  for (const p of Object.values(PRESETS)) assert.ok(!p.mechanisms.some(m => m.type === 'multgate'), p.name);
});

// ───────── 2. Traversal detection ─────────

test('gate: one proc per real traversal, both directions, each side; jitter, resting and edges never count', () => {
  const r = new Run(5);
  install(r, 'mult-gate', 'gate-l');
  install(r, 'mult-gate', 'gate-r');
  for (const side of ['left', 'right'] as const) {
    const { s, mults } = liveSim(r);
    const g = gateOf(s, side);
    const cx = (g.a.x + g.b.x) / 2, y = g.a.y;
    sweep(s, g, 0, line(cx, y + 2, y - 2)); // up through
    assert.equal(mults().length, 1, `${side}: up pass`);
    sweep(s, g, 0, line(cx, y - 2, y + 2)); // back down
    assert.equal(mults().length, 2, `${side}: down pass counts too`);
    // jitter inside the dead band, and resting right on the line
    const jitter = Array.from({ length: 200 }, (_, i) => ({ x: cx, y: y + 2 + (i % 2 ? 1 : -1) * 0 }));
    sweep(s, g, 0, jitter);
    sweep(s, g, 0, line(cx, y + 2, y + GATE_HYSTERESIS * 0.5));
    for (let i = 0; i < 100; i++) sweep(s, g, 0, [{ x: cx, y: y + (i % 2 ? 1 : -1) * GATE_HYSTERESIS * 0.9 }]);
    assert.equal(mults().length, 2, `${side}: jitter/resting does not count`);
    // a ball that crosses the gate's line outside the opening (past the rail) does not count
    const outside = side === 'left' ? g.b.x + 0.5 : g.a.x - 0.5;
    sweep(s, g, 0, line(outside, y + 2, y - 2));
    assert.equal(mults().length, 2, `${side}: outside the opening`);
    assert.equal(s.rules.multTenths, 12);
  }
});

test('gate: a real ball shot up the alley procs once on the way through', () => {
  const r = new Run(6);
  install(r, 'mult-gate', 'gate-l');
  const { s, mults } = liveSim(r);
  s.spawnBall(1.7, 8.5, 0, -16);
  const c = makeControls();
  let crossedAt = -1;
  for (let i = 0; i < 0.6 / DT; i++) {
    s.step(DT, c);
    if (crossedAt < 0 && s.balls[0].pos.y < 4.75 - GATE_HYSTERESIS) crossedAt = s.time;
  }
  assert.ok(crossedAt > 0, 'ball reached the top of the alley');
  assert.ok(mults().length >= 1);
  assert.equal(mults()[0].source, 'gate');
  assert.equal(mults()[0].total, 11, '×1.0 → ×1.1');
});

test('gate: simultaneous multiball passes each count; a teleport (ramp/scoop release) never does', () => {
  const r = new Run(7);
  install(r, 'mult-gate', 'gate-l');
  const { s, mults } = liveSim(r);
  (s as any).addBall(1.7, 7, 0, 0);
  const g = gateOf(s, 'left');
  const path = line(1.7, 6.5, 3);
  for (const p of path) for (const b of s.balls) (s as any).checkMultGate(b, g, p);
  assert.equal(mults().length, 2, 'two balls, two traversals');
  assert.equal(s.rules.multTenths, 12);
  // release onto the other side of the line (like a ramp exit) re-seeds the side
  const b = s.balls[0];
  (s as any).releaseToField(b, { x: 1.7, y: 6.5 }, { x: 0, y: 0 });
  sweep(s, g, 0, [{ x: 1.7, y: 6.4 }]);
  assert.equal(mults().length, 2, 'teleporting across is not a pass');
});

// ───────── 3. Global multiplier rules ─────────

test('global multiplier: ×1 start, later scoring only, applied once, extra-ball drain keeps it, strike resets it', () => {
  const r = new GameRules();
  r.ready();
  assert.equal(r.mult, 1);
  assert.equal(r.award(100), 100);
  assert.ok(r.gainMult(3));
  assert.equal(r.score, 100, 'no retroactive points');
  assert.equal(r.award(100), 130);
  assert.equal(r.award(333), 433, 'rounded to whole points');
  assert.equal(r.score, 663);
  r.addBall();
  assert.equal(r.drain(), false, 'extra ball drain is not a strike');
  assert.equal(r.multTenths, 13, 'extra ball drain keeps the multiplier');
  assert.equal(r.drain(), true);
  assert.equal(r.multTenths, 10, 'strike resets to ×1.0');
  assert.equal(r.score, 663, 'points earned before the drain stay banked');
  assert.ok(!r.gainMult(1), 'no gains between pitches');
  r.ready();
  assert.equal(r.multTenths, 10);
  // display-safe: tenths never accumulate float noise
  for (let i = 0; i < 37; i++) r.gainMult(1);
  assert.equal(r.multTenths, 47);
  assert.equal((r.multTenths / 10).toFixed(1), '4.7');
});

test('global multiplier is the final layer: part modifiers first, then × global once', () => {
  const run = new Run(8);
  mod(run, 'mvp', 'bumper-left'); // ×2
  mod(run, 'hot-corner', 'bumper-left'); // +100
  const { s, ev } = liveSim(run);
  s.rules.multTenths = 15;
  const base = s.pts('bumper-left', 'bumper', config.bumper.points);
  assert.equal(base, (config.bumper.points + 100) * 2);
  const before = s.rules.score;
  assert.equal(s.rules.award(base), Math.round(base * 1.5));
  assert.equal(s.rules.score - before, Math.round(base * 1.5));
  assert.equal(ev.filter(e => e.type === 'mult').length, 0, 'nothing generated by itself');
});

test('legacy maps and an unbuilt build-test table never generate a multiplier', () => {
  for (const p of [...Object.values(PRESETS), new Run(1).preset()]) {
    const ev: SimEvent[] = [];
    const s = new Simulation({ preset: p, onEvent: e => ev.push(e) });
    const c = makeControls();
    for (let k = 0; k < 6; k++) {
      s.ready();
      const a = -Math.PI / 2 + (k - 2.5) * 0.35;
      s.spawnBall(10, 22, Math.cos(a) * 24, Math.sin(a) * 24);
      for (let i = 0; i < 6 / DT && s.balls.length; i++) s.step(DT, c);
      if (s.rules.phase === 'over') s.rules.reset();
    }
    assert.ok(!ev.some(e => e.type === 'mult'), p.name);
    assert.equal(s.rules.multTenths, 10);
  }
});

// ───────── 4. Gate stacking ─────────

test('gate upgrades add per-pass payout (0.1 → 0.2 → 0.3); left and right are independent', () => {
  const r = new Run(9);
  install(r, 'mult-gate', 'gate-l');
  install(r, 'mult-gate', 'gate-r');
  const L = r.installed.find(i => i.mountId === 'gate-l')!.id, Rr = r.installed.find(i => i.mountId === 'gate-r')!.id;
  const per = () => {
    const { s, mults } = liveSim(r);
    const out: number[] = [];
    for (const side of ['left', 'right'] as const) {
      const g = gateOf(s, side), cx = (g.a.x + g.b.x) / 2;
      sweep(s, g, 0, line(cx, g.a.y + 2, g.a.y - 2));
      sweep(s, g, 0, line(cx, g.a.y - 2, g.a.y + 2));
      const m = mults().filter(e => e.id === g.id);
      assert.equal(m.length, 2, 'stacks never add extra procs');
      out.push(m[0].gain);
    }
    return out;
  };
  assert.deepEqual(per(), [1, 1]);
  mod(r, 'express-lane', L);
  assert.deepEqual(per(), [2, 1]);
  mod(r, 'express-lane', L);
  assert.deepEqual(per(), [3, 1]);
  mod(r, 'express-lane', Rr);
  assert.deepEqual(per(), [3, 2]);
});

// ───────── 5. Generators ─────────

test(`bumper generator: every ${BUMPER_GEN_EVERY} hits on the chosen bumper; copies raise payout, not frequency`, () => {
  const r = new Run(10);
  mod(r, 'sweet-spot', 'bumper-left');
  const hit = (s: Simulation, id: string) => (s as any).generate(id, 'bumper') as number;
  let { s } = liveSim(r);
  const gains = Array.from({ length: 12 }, () => hit(s, 'bumper-left'));
  assert.deepEqual(gains, [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0]);
  assert.equal(hit(s, 'bumper-right'), 0, 'other bumpers do not count');
  mod(r, 'sweet-spot', 'bumper-left');
  mod(r, 'hall-of-fame', 'bumper-left');
  ({ s } = liveSim(r));
  const g2 = Array.from({ length: 10 }, () => hit(s, 'bumper-left'));
  assert.deepEqual(g2, [0, 0, 0, 0, 4, 0, 0, 0, 0, 4], 'same cadence, payout 0.1+0.1+0.2');
});

test('bumper generator fires on real bumper contacts and raises later scoring', () => {
  const r = new Run(11);
  mod(r, 'sweet-spot', 'bumper-left');
  const { s, ev } = liveSim(r);
  const c = makeControls();
  const bl = s.layout.bumpers.find(b => b.id === 'bumper-left')!;
  for (let k = 0; k < 40 && ev.filter(e => e.type === 'machine' && e.id === 'bumper-left').length < BUMPER_GEN_EVERY; k++) {
    s.spawnBall(bl.x, bl.y - bl.r - 0.6, 0, 8);
    for (let i = 0; i < 0.08 / DT; i++) s.step(DT, c);
  }
  const hits = ev.filter(e => e.type === 'machine' && e.id === 'bumper-left');
  assert.ok(hits.length >= BUMPER_GEN_EVERY, `got ${hits.length} hits`);
  const m = ev.find(e => e.type === 'mult')!;
  assert.ok(m && m.type === 'mult' && m.source === 'bumper' && m.id === 'bumper-left');
  // the 5th hit scored at ×1.0, the multiplier only rose after it
  const i5 = ev.indexOf(hits[BUMPER_GEN_EVERY - 1]);
  assert.ok(ev.indexOf(m) > i5);
  assert.equal((hits[BUMPER_GEN_EVERY - 1] as any).points, config.bumper.points);
});

test('ramp generator: only a completed ride pays; a rollback never does', () => {
  const r = new Run(12);
  install(r, 'turbo-ramp');
  const ramp = r.installed.find(i => i.offerKey === 'turbo-ramp')!.id;
  mod(r, 'victory-lap', ramp);
  mod(r, 'victory-parade', ramp);
  for (const [speed, expect] of [[20, 3], [4, 0]] as const) {
    const { s, mults } = liveSim(r);
    const rp = s.layout.ramps[0];
    s.spawnBall(rp.mouth.x - rp.entryDir.x * 0.8, rp.mouth.y - rp.entryDir.y * 0.8, rp.entryDir.x * speed, rp.entryDir.y * speed);
    const c = makeControls();
    for (let i = 0; i < 2.5 / DT && s.balls.length; i++) s.step(DT, c);
    const rideDone = s.events.some(e => e.type === 'ramp' && e.phase === 'complete');
    assert.equal(rideDone, expect > 0, `speed ${speed}`);
    const ramps = mults().filter(e => e.source === 'ramp');
    assert.equal(ramps.reduce((a, e) => a + e.gain, 0), expect, `speed ${speed}`);
  }
});

test('bank generator pays on completion; bank and generator progress carry across strikes, reset next challenge', () => {
  const r = new Run(13);
  install(r, 'bank', 'bank-cards');
  const bank = r.installed.find(i => i.offerKey === 'bank')!.id;
  mod(r, 'pennant', bank);
  mod(r, 'sweet-spot', 'bumper-left');
  const { s, mults } = liveSim(r);
  const ball = s.balls[0];
  (s as any).markBanks('card-1', ball);
  (s as any).markBanks('card-2', ball);
  assert.equal(mults().length, 0);
  for (let i = 0; i < 3; i++) (s as any).generate('bumper-left', 'bumper');
  // strike: multiplier resets, progress does not
  s.rules.gainMult(5);
  s.balls.slice().forEach(b => (s as any).drainBall(b));
  assert.equal(s.rules.multTenths, 10);
  s.ready();
  assert.equal(s.banks.get(bank)!.size, 2, 'bank lamps survive the strike');
  assert.equal(s.genCount.get('bumper-left#5'), 3, 'bumper counter survives the strike (experimental rule)');
  (s as any).markBanks('card-3', s.balls[0]);
  assert.equal(mults().length, 1);
  assert.equal(mults()[0].source, 'bank');
  assert.equal(mults()[0].gain, 2);
  // next challenge: a fresh sim/first pitch starts every counter at zero
  const next = liveSim(r).s;
  assert.equal(next.genCount.size, 0);
  assert.equal(next.banks.get(bank)!.size, 0);
});

// ───────── 6. Draft / shop split ─────────

test('draft: exactly 3 free offers of machines or premium upgrades, always ≥1 usable even at full Power', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = new Run(seed);
    if (seed % 3 === 0) {
      // fill Power completely first
      r.maxPower = 2;
      install(r, 'mult-gate', 'gate-l');
      install(r, 'mult-gate', 'gate-r');
    }
    r.clear(1);
    assert.equal(r.draft.length, 3, `seed ${seed}`);
    for (const o of r.draft) {
      if (o.kind === 'modifier') {
        const t = MODS.find(t => t.key === o.key)!;
        assert.ok(t.tier === 'draft' || t.tier === 'both', `${o.name} is a premium/draft upgrade`);
        assert.equal(o.price, 0);
      }
    }
    const usable = r.draft.filter(o => r.check(o).ok);
    assert.ok(usable.length >= 1, `seed ${seed}: a usable free pick`);
    if (r.powerUsed >= r.maxPower) assert.ok(r.draft.every(o => o.kind === 'modifier'), 'no dead machine offers at cap');
    const pick = usable[0];
    const c = r.check(pick);
    assert.ok(r.takeDraft(pick.uid, c.ok ? c.mounts[0] : undefined).ok);
  }
});

test('draft offers the multiplier gate over a run; it can be picked for either side', () => {
  let seen = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const r = new Run(seed);
    r.clear(1);
    const g = r.draft.find(o => o.key === 'mult-gate');
    if (!g) continue;
    seen++;
    const side = seed % 2 ? 'gate-l' : 'gate-r';
    assert.ok(r.takeDraft(g.uid, side).ok);
    assert.equal(r.installed[0].mountId, side);
  }
  assert.ok(seen >= 5, `gate offered in ${seen}/40 first drafts`);
});

test('shop: zero physical machines in initial stock and every reroll; modifiers still buy fine', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = new Run(seed);
    r.clear(3);
    const pick = r.draft.find(o => r.check(o).ok)!;
    const c = r.check(pick);
    r.takeDraft(pick.uid, c.ok ? c.mounts[0] : undefined);
    r.money = 500;
    for (let k = 0; k < 8; k++) {
      assert.ok(r.shop.length > 0);
      for (const o of r.shop) {
        assert.equal(o.kind, 'modifier', `seed ${seed}: shop offered ${o.name}`);
        const t = MODS.find(t => t.key === o.key)!;
        assert.ok(t.tier === 'shop' || t.tier === 'both', `${o.name} is a shop-tier modifier`);
      }
      assert.ok(r.reroll());
    }
    const o = r.shop[0];
    const n = (r.mods[(o as any).target.key] ?? []).length;
    assert.ok(r.buy(o.uid).ok);
    assert.equal(r.mods[(o as any).target.key].length, n + 1);
  }
  // a machine smuggled into the shop is refused
  const r = new Run(1);
  r.clear(0);
  r.takeDraft(r.draft.find(o => r.check(o).ok)!.uid, undefined);
  r.money = 99;
  const m = MACHINES.find(m => m.key === 'mult-gate')!;
  r.shop.push({ uid: 4242, kind: 'machine', key: m.key, name: m.name, desc: m.desc, power: 1, price: 1, mounts: ['gate-l'] });
  assert.ok(!r.buy(4242, 'gate-l').ok);
});

test('premium draft pool is stronger than its shop counterpart (shop does not duplicate it)', () => {
  const pairs = [['sweet-spot', 'hall-of-fame'], ['victory-lap', 'victory-parade'], ['pennant', 'pennant-race'], ['power-alley', 'mvp']];
  for (const [shop, draft] of pairs) {
    const a = MODS.find(t => t.key === shop)!, b = MODS.find(t => t.key === draft)!;
    assert.equal(a.tier, 'shop');
    assert.equal(b.tier, 'draft');
    const strength = (t: typeof a) => (t.gen ? t.gen.tenths / t.gen.every : (t.mul ?? 1));
    assert.ok(strength(b) > strength(a), `${draft} > ${shop}`);
  }
  // card text matches the numbers
  for (const t of MODS.filter(t => t.gen)) assert.ok(t.effect.includes(`+${(t.gen!.tenths / 10).toFixed(1)}×`), `${t.key}: ${t.effect}`);
  assert.ok(GATE.desc.includes('+0.1×'));
});
