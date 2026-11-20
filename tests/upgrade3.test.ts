/**
 * Upgrade System 3.0: selling & durable board modifiers, group/cross-family effects, physical bundles,
 * the Long Loop, hybrid-weighted offers, and the 15-challenge victory in analytics.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { config } from '../src/config.ts';
import { Simulation, type SimEvent } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { Run, type Offer } from '../src/run/run.ts';
import { MACHINES, MODS, MOUNTS, placementsOf, RALLY_CHARGES } from '../src/run/catalog.ts';
import { OFFER_WEIGHTS } from '../src/run/weights.ts';
import type { Modifier } from '../src/machines/mechanisms.ts';
import { PRESETS } from '../src/machines/presets.ts';
import { MemoryStore, RunRecorder } from '../src/telemetry/run-recorder.ts';
import { renderReport } from '../src/telemetry/report-html.ts';

const DT = 1 / config.physicsHz;
const mod = (r: Run, key: string, target: string) => {
  const t = MODS.find(t => t.key === key)!;
  const m: Modifier = { note: t.name };
  if (t.add) m.add = t.add;
  if (t.mul) m.mul = t.mul;
  if (t.gen) m.gen = { ...t.gen };
  (r.mods[target] ??= []).push(m);
};
const between = (r: Run) => {
  r.phase = 'shop';
  return r;
};
function liveSim(r: Run) {
  const ev: SimEvent[] = [];
  const s = new Simulation({ preset: r.preset(), onEvent: e => ev.push(e) });
  s.rules.target = null;
  s.ready();
  return { s, ev };
}
/** Full ride on ramp `id` of a sim; returns the checkpoint events. */
/** The live ball (re-served if the pitch ended), moved to (x, y) with velocity (vx, vy). */
function place(s: Simulation, x: number, y: number, vx: number, vy: number) {
  if (!s.balls.length) s.ready();
  const b = s.balls[0];
  if (b.mode !== 'field') (s as any).releaseToField(b, { x, y }, { x: vx, y: vy });
  b.body.setPosition({ x, y });
  b.body.setLinearVelocity({ x: vx, y: vy });
  b.prev = { x, y };
  b.pos = { x, y };
  return b;
}
function ride(s: Simulation, ev: SimEvent[], id: string) {
  const rp = s.layout.ramps.find(r => r.def.id === id)!;
  const ball = place(s, rp.mouth.x, rp.mouth.y + 1, 0, 0);
  (s as any).enterRamp(ball, rp, rp.def.maxRide);
  for (let i = 0; i < 4 / DT && ball.mode !== 'field'; i++) s.step(DT, makeControls());
  return ev.filter(e => e.type === 'rampCheckpoint' && e.id === id) as Extract<SimEvent, { type: 'rampCheckpoint' }>[];
}

// ───────── selling ─────────

test('selling: refund floor(actual paid / 2) — $9 → $4, $6 → $3, free draft → $0; Power and sites fully recovered', () => {
  for (const [paid, refund] of [[9, 4], [6, 3], [0, 0], [11, 5]] as const) {
    const r = between(new Run(1));
    assert.ok(r.installForTest('turbo-ramp', 'orbit-l').ok);
    const it = r.installed[0];
    Object.assign(it, { via: paid ? 'shop' : 'draft', paid });
    const money = r.money;
    const res = r.sell(it.uid);
    assert.ok(res.ok);
    assert.equal((res as any).refund, refund, `paid $${paid}`);
    assert.equal(r.money, money + refund);
    assert.equal(r.powerUsed, 0);
    assert.equal(r.mountStatus('orbit-l').state, 'free');
  }
});

test('selling: free draft machine → $0 every time (no select → sell → cash exploit, no repeat refunds)', () => {
  const r = new Run(3);
  r.clear(3);
  const m = MACHINES.find(m => m.key === 'mult-gate')!;
  const offer: Offer = { uid: 777, kind: 'machine', key: m.key, name: m.name, desc: m.desc, power: 1, price: m.price, mounts: ['gate-l', 'gate-r'] };
  r.draft = [offer];
  assert.ok(r.takeDraft(777, 'gate-l').ok);
  const money0 = r.money;
  for (let k = 0; k < 3; k++) {
    const it = r.installed.find(i => i.offerKey === 'mult-gate')!;
    assert.equal(it.via, 'draft');
    assert.equal(it.paid, 0);
    assert.equal((r.sell(it.uid) as any).refund, 0);
    assert.ok(r.installForTest('mult-gate', 'gate-l').ok);
    r.installed[r.installed.length - 1].via = 'draft';
  }
  assert.equal(r.money, money0);
});

test('selling: only between challenges; saleInfo (the confirmation) changes nothing; unknown item refused', () => {
  const r = new Run(4);
  assert.ok(r.installForTest('bonus-bumper', 'pocket-ul').ok);
  const uid = r.installed[0].uid;
  r.phase = 'challenge';
  assert.ok(!r.sell(uid).ok, 'not while a challenge is playing');
  r.phase = 'failed';
  assert.ok(!r.sell(uid).ok);
  r.phase = 'draft';
  const before = JSON.stringify([r.installed, r.mods, r.money]);
  const info = r.saleInfo(uid)!;
  assert.equal(info.powerFreed, 1);
  assert.equal(JSON.stringify([r.installed, r.mods, r.money]), before, 'preview/cancel is a no-op');
  assert.ok(!r.sell('nope').ok);
  assert.ok(r.sell(uid).ok);
});

test('selling a bundle is atomic: every child leaves, all Power returns, modifiers survive dormant at their sites', () => {
  const r = between(new Run(5));
  assert.ok(r.installForTest('bumper-cluster', 'cluster-r').ok);
  const it = r.installed[0];
  assert.equal(it.parts.length, 3);
  assert.equal(r.powerUsed, 3);
  mod(r, 'mvp', 'cluster-b@cluster-r');
  mod(r, 'rally-cap', 'bumper:*');
  const res = r.sell(it.uid) as any;
  assert.ok(res.ok);
  assert.equal(r.installed.length, 0);
  assert.equal(r.powerUsed, 0);
  assert.deepEqual(res.dormant.map((d: any) => d.key), ['cluster-b@cluster-r']);
  assert.equal(r.mods['cluster-b@cluster-r'].length, 1, 'never deleted');
  assert.equal(r.mods['bumper:*'].length, 1, 'group modifier untouched');
  assert.deepEqual(r.dormantKeys(), ['cluster-b@cluster-r'], 'group keys are never dormant');
  const s = new Simulation({ preset: r.preset() });
  assert.ok(!s.layout.bumpers.some(b => b.id.includes('@cluster-r')), 'no residual child');
});

// ───────── dormant board modifiers ─────────

test('dormant modifiers wake only for a compatible part at their original site, exactly once', () => {
  const r = between(new Run(6));
  assert.ok(r.installForTest('turbo-ramp', 'orbit-l').ok);
  mod(r, 'victory-lap', 'ramp@orbit-l');
  mod(r, 'toll-booth', 'ramp@orbit-l-gate');
  r.sell(r.installed[0].uid);
  assert.deepEqual(r.dormantKeys().sort(), ['ramp@orbit-l', 'ramp@orbit-l-gate']);
  // a different ramp elsewhere does not pick them up
  assert.ok(r.installForTest('bridge-ramp', 'bridge').ok);
  assert.equal(r.mods['ramp@bridge'], undefined);
  assert.deepEqual(r.dormantKeys().sort(), ['ramp@orbit-l', 'ramp@orbit-l-gate']);
  // reinstall the compatible ramp at the original site: wakes, no duplicates
  assert.ok(r.installForTest('turbo-ramp', 'orbit-l').ok);
  assert.deepEqual(r.dormantKeys(), []);
  assert.equal(r.mods['ramp@orbit-l'].length, 1);
  const { s, ev } = liveSim(r);
  const cps = ride(s, ev, 'ramp@orbit-l');
  assert.equal(cps.length, 8);
  assert.equal(cps.reduce((a, e) => a + e.points, 0), 8500, 'Toll Booth active again, once');
  assert.equal(ev.filter(e => e.type === 'mult' && e.source === 'ramp').length, 1, 'Victory Lap once per ride');
});

test('gate modifiers: dormant after selling a single gate, woken by the paired-gate bundle child at that site', () => {
  const r = between(new Run(7));
  assert.ok(r.installForTest('mult-gate', 'gate-l').ok);
  mod(r, 'express-lane', 'mgate@gate-l');
  r.sell(r.installed[0].uid);
  assert.deepEqual(r.dormantKeys(), ['mgate@gate-l']);
  assert.ok(r.installForTest('paired-gates', 'gate-l+gate-r').ok);
  assert.deepEqual(r.dormantKeys(), []);
  const { s, ev } = liveSim(r);
  for (const g of s.layout.multGates) for (const y of [6, 5.5, 4.5, 3.5]) (s as any).checkMultGate(s.balls[0], g, { x: (g.a.x + g.b.x) / 2, y });
  const gains = Object.fromEntries((ev.filter(e => e.type === 'mult') as any[]).map(e => [e.id, e.gain]));
  assert.deepEqual(gains, { 'mgate@gate-l': 2, 'mgate@gate-r': 1 }, 'Express Lane only on its own site');
});

test('part ids are stable site anchors and never shared by incompatible part types', () => {
  const byId = new Map<string, Set<string>>();
  for (const m of MACHINES) for (const p of placementsOf(m)) for (const { mount, def } of p.parts) {
    const id = `${def.id}@${mount}`;
    const types = byId.get(id) ?? new Set();
    types.add(`${def.type}${def.type === 'ramp' ? ':' + (def as any).name : ''}`);
    byId.set(id, types);
  }
  for (const [id, types] of byId) assert.equal(types.size, 1, `${id} is only ever ${[...types].join('/')}`);
});

test('factory-part modifiers sleep while a machine displaces the part, and wake when it is sold', () => {
  const r = between(new Run(8));
  mod(r, 'power-alley', 'bumper-mid');
  assert.ok(r.installForTest('long-loop', 'loop-r').ok);
  assert.deepEqual(r.dormantKeys(), ['bumper-mid']);
  const s = new Simulation({ preset: r.preset() });
  assert.ok(!s.layout.bumpers.some(b => b.id === 'bumper-mid'), 'Long Loop replaces the mid-right bumper');
  const info = r.saleInfo(r.installed[0].uid)!;
  assert.deepEqual(info.waking.map(w => w.key), ['bumper-mid']);
  r.sell(r.installed[0].uid);
  assert.deepEqual(r.dormantKeys(), []);
  assert.ok(new Simulation({ preset: r.preset() }).layout.bumpers.some(b => b.id === 'bumper-mid'), 'restored');
});

// ───────── group / cross-family ─────────

test('ALL bumpers reaches factory, installed and bundle-child bumpers (present and future), nothing else', () => {
  const r = between(new Run(9));
  mod(r, 'rally-cap', 'bumper:*'); // ×1.25
  mod(r, 'bumper-crew', 'bumper:*'); // +100
  assert.ok(r.installForTest('twin-bumpers', 'flank-l').ok); // installed AFTER the group mods
  assert.ok(r.installForTest('bumper-cluster', 'cluster-r').ok);
  const s = new Simulation({ preset: r.preset() });
  for (const id of ['bumper-left', 'glove', 'twin-a@flank-l', 'twin-b@flank-l', 'cluster-a@cluster-r', 'cluster-c@cluster-r']) {
    const b = s.layout.bumpers.find(b => b.id === id)!;
    const base = id.includes('@') ? (r.installed.flatMap(i => i.parts).find(d => d.id === id) as any).points : config.bumper.points;
    assert.equal(s.pts(id, 'bumper', base), Math.round((base + 100) * 1.25), id);
    void b;
  }
  assert.equal(s.pts('sling-left', 'sling', 10), 10, 'slings untouched');
  assert.equal(s.pts('card-1', 'target', 50), 50, 'targets untouched');
});

test('ALL multiplier gates: +0.1× more per pass on every gate (incl. ones installed later); frequency unchanged', () => {
  const r = between(new Run(10));
  mod(r, 'gate-network', 'multgate:*');
  mod(r, 'gate-network', 'multgate:*');
  assert.ok(r.installForTest('paired-gates', 'gate-l+gate-r').ok);
  const { s, ev } = liveSim(r);
  for (const g of s.layout.multGates) for (const y of [6, 5.5, 4.5, 3.5]) (s as any).checkMultGate(s.balls[0], g, { x: (g.a.x + g.b.x) / 2, y });
  const m = ev.filter(e => e.type === 'mult') as any[];
  assert.equal(m.length, 2, 'one proc per pass per gate');
  assert.ok(m.every(e => e.gain === 3), 'base 0.1 + 2 copies × 0.1');
  // the jackpot lane gate and ramp checkpoints are not "multiplier gates"
  assert.equal(s.pts('gate@jackpot-lane', 'gate', 400), 400);
});

test('ALL ramps: every checkpoint of every ramp (Long Loop too) gets +250; full-ride generator once per ride', () => {
  const r = between(new Run(11));
  assert.ok(r.installForTest('turbo-ramp', 'orbit-l').ok);
  mod(r, 'express-track', 'ramps:*');
  mod(r, 'grand-tour', 'ramp:*');
  assert.ok(r.installForTest('long-loop', 'loop-r').ok); // later install inherits
  const { s, ev } = liveSim(r);
  for (const id of ['ramp@orbit-l', 'loop@loop-r']) {
    s.rules.multTenths = 10; // the previous ride's Grand Tour gain would scale this one (correctly)
    const before = ev.length;
    const cps = ride(s, ev, id);
    assert.equal(cps.length, 8, id);
    assert.equal(cps.reduce((a, e) => a + e.points, 0), 8 * 1250, `${id}: 8 × (1,000 + 250)`);
    assert.equal(ev.slice(before).filter(e => e.type === 'mult' && e.source === 'ramp').length, 1, `${id}: one full-ride gain`);
  }
  assert.equal(s.pts('bumper-left', 'bumper', 100), 100, 'bumpers untouched');
});

test('cross-family Rally Fuel: a full ride charges the next 5 bumper hits (+500 each), refills to 5, never stacks', () => {
  const r = between(new Run(12));
  assert.ok(r.installForTest('turbo-ramp', 'orbit-l').ok);
  mod(r, 'rally-fuel', 'cross:ride-bumpers');
  const { s, ev } = liveSim(r);
  assert.equal(s.rallyCharges, 0);
  ride(s, ev, 'ramp@orbit-l');
  assert.equal(s.rallyCharges, RALLY_CHARGES);
  ride(s, ev, 'ramp@orbit-l');
  assert.equal(s.rallyCharges, RALLY_CHARGES, 'a second ride refills, never 10');
  // bumper hits: score through the real contact path
  const pts: number[] = [];
  for (let k = 0; k < RALLY_CHARGES + 2; k++) {
    const n = ev.length;
    const b = s.layout.bumpers.find(b => b.id === 'bumper-left')!;
    place(s, b.x, b.y - b.r - 0.6, 0, 8);
    for (let i = 0; i < 0.15 / DT; i++) {
      s.step(DT, makeControls());
      if (ev.slice(n).some(e => e.type === 'machine' && e.kind === 'bumper')) break;
    }
    const hit = ev.slice(n).find(e => e.type === 'machine' && e.kind === 'bumper') as any;
    pts.push(hit.points);
  }
  assert.deepEqual(pts.slice(0, RALLY_CHARGES), Array(RALLY_CHARGES).fill(config.bumper.points + 500));
  assert.ok(pts.slice(RALLY_CHARGES).every(p => p === config.bumper.points), 'charges used up');
});

// ───────── bundles ─────────

test('bundles: Power = sum of child parts; every child is its own fixture and scores under its own id', () => {
  for (const m of MACHINES) for (const p of placementsOf(m)) assert.equal(p.parts.reduce((s, x) => s + x.def.powerCost, 0), m.power, `${m.key} @ ${p.id}`);
  const r = between(new Run(13));
  r.maxPower = 20;
  for (const [k, p] of [['twin-bumpers', 'flank-l'], ['twin-bumpers', 'flank-r'], ['paired-gates', 'gate-l+gate-r']] as const) assert.ok(r.installForTest(k, p).ok);
  assert.equal(r.powerUsed, 6);
  const { s, ev } = liveSim(r);
  const ids = s.layout.bumpers.filter(b => b.id.startsWith('twin')).map(b => b.id).sort();
  assert.deepEqual(ids, ['twin-a@flank-l', 'twin-a@flank-r', 'twin-b@flank-l', 'twin-b@flank-r']);
  let fixtures = 0;
  for (let b = s.world.getBodyList(); b; b = b.getNext()) for (let f = b.getFixtureList(); f; f = f.getNext()) if (String((f.getUserData() as any)?.id ?? '').startsWith('twin')) fixtures++;
  assert.equal(fixtures, 4, 'four real physics fixtures');
  for (const id of ids) {
    const b = s.layout.bumpers.find(x => x.id === id)!;
    const n = ev.length;
    place(s, b.x, b.y - b.r - 0.5, 0, 8);
    for (let i = 0; i < 0.2 / DT; i++) s.step(DT, makeControls());
    assert.ok(ev.slice(n).some(e => e.type === 'machine' && e.id === id && e.points === 250), `${id} scores 250 on its own`);
  }
  assert.equal(s.layout.multGates.length, 2);
});

test('bundles: atomic install (insufficient Power or a blocked site installs nothing); conflicts hold both ways', () => {
  const r = between(new Run(14));
  r.maxPower = 2;
  const before = JSON.stringify(r.installed);
  const c = r.installForTest('bumper-cluster', 'cluster-r');
  assert.ok(!c.ok);
  assert.equal(JSON.stringify(r.installed), before, 'nothing partially installed');
  r.maxPower = 20;
  assert.ok(r.installForTest('twin-bumpers', 'flank-r').ok);
  assert.ok(!r.installForTest('bumper-cluster', 'cluster-r').ok, 'cluster blocked by right twins');
  r.sell(r.installed[0].uid);
  assert.ok(r.installForTest('bumper-cluster', 'cluster-r').ok);
  assert.ok(!r.installForTest('twin-bumpers', 'flank-r').ok, 'right twins blocked by cluster');
  assert.ok(!r.installForTest('bridge-ramp', 'bridge').ok, 'Overpass blocked by the cluster');
  assert.ok(!r.installForTest('long-loop', 'loop-r').ok, 'Long Loop blocked by the cluster');
  // paired gates need both alley tops
  assert.ok(r.installForTest('mult-gate', 'gate-r').ok);
  assert.ok(!r.installForTest('paired-gates', 'gate-l+gate-r').ok);
  // over-capacity offer: visible, fixable, names the blocker; taking it is a no-op until room is made
  const o: Offer = { uid: 1, kind: 'machine', key: 'paired-gates', name: 'Paired Multiplier Gates', desc: '', power: 2, price: 11, mounts: ['gate-l+gate-r'] };
  const chk = r.check(o);
  assert.ok(!chk.ok && chk.fixable && chk.blockers!.some(b => b.name === 'Multiplier Gate'));
  r.phase = 'draft';
  r.draft = [o];
  const n = r.installed.length;
  assert.ok(!r.takeDraft(1, 'gate-l+gate-r').ok);
  assert.equal(r.installed.length, n);
  assert.equal(r.phase, 'draft', 'the free pick is not spent');
  r.sell(r.installed.find(i => i.offerKey === 'mult-gate')!.uid);
  assert.ok(r.takeDraft(1, 'gate-l+gate-r').ok, 'claimable after selling');
});

test('bundles: no duplicate part ids in any full build; cluster bumpers leave ball-sized gaps (rattle, no pocket)', () => {
  const r = between(new Run(15));
  r.maxPower = 99;
  for (const [k, p] of [['bumper-cluster', 'cluster-r'], ['twin-bumpers', 'flank-l'], ['paired-gates', 'gate-l+gate-r'], ['turbo-ramp', 'orbit-l'], ['bonus-bumper', 'pocket-ul']] as const) assert.ok(r.installForTest(k, p).ok);
  const ids = r.installed.flatMap(i => i.parts.map(d => d.id));
  assert.equal(new Set(ids).size, ids.length);
  const cl = r.installed.find(i => i.offerKey === 'bumper-cluster')!.parts as any[];
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const gap = Math.hypot(cl[i].x - cl[j].x, cl[i].y - cl[j].y) - cl[i].r - cl[j].r;
    assert.ok(gap > config.ball.radius * 2 + 0.2, `gap ${gap.toFixed(2)} lets the ball through`);
  }
});

// ───────── Long Loop ─────────

test('Long Loop in /build-test/: 8 checkpoints × 1,000 once each, no legacy gate/finish, its own route; Map 1 unchanged', () => {
  const r = between(new Run(16));
  assert.ok(r.installForTest('long-loop', 'loop-r').ok);
  assert.ok(r.installForTest('turbo-ramp', 'orbit-l').ok);
  const { s, ev } = liveSim(r);
  const cps = ride(s, ev, 'loop@loop-r');
  assert.deepEqual(cps.map(e => e.index), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(cps.every(e => e.points === 1000));
  assert.ok(!ev.some(e => e.type === 'rampGate'));
  assert.equal((ev.find(e => e.type === 'ramp' && e.phase === 'complete' && e.id === 'loop@loop-r') as any).points, 0);
  // a distinct third route: drops center-left, unlike Turbo (upper left) and Overpass (center)
  const L = s.layout.ramps.find(x => x.def.id === 'loop@loop-r')!, T = s.layout.ramps.find(x => x.def.id === 'ramp@orbit-l')!;
  assert.ok(Math.hypot(L.exit.x - T.exit.x, L.exit.y - T.exit.y) > 5);
  // Map 1 Sidewinder keeps its own path, payouts and the factory-bumper removal
  const side = Object.values(PRESETS).find(p => p.route === '1')!;
  const rs = side.mechanisms.find(m => m.id === 'ramp-side') as any;
  assert.equal(rs.checkpoints, undefined);
  assert.deepEqual(rs.path.at(-1), { x: 8.3, y: 14.6 });
  assert.deepEqual(side.removeBase, ['bumper-mid']);
});

test('Long Loop: a real ball fired into its mouth rides it and lands on open floor', () => {
  const r = between(new Run(17));
  assert.ok(r.installForTest('long-loop', 'loop-r').ok);
  let full = 0;
  for (const sp of [16, 19, 22, 25]) {
    const { s, ev } = liveSim(r);
    const rp = s.layout.ramps[0];
    place(s, rp.mouth.x - rp.entryDir.x * 1.2, rp.mouth.y - rp.entryDir.y * 1.2, rp.entryDir.x * sp, rp.entryDir.y * sp);
    for (let i = 0; i < 6 / DT; i++) s.step(DT, makeControls());
    if (ev.some(e => e.type === 'ramp' && e.phase === 'land')) full++;
  }
  assert.ok(full >= 3, `${full}/4 shots rode the whole loop and landed`);
});

// ───────── hybrid-weighted offers ─────────

function draftKeys(r: Run) {
  r.phase = 'challenge';
  r.clear(3);
  return r.draft.map(o => (o.kind === 'machine' ? o.key : `${o.key}>${o.target.key}`));
}

test('offers are deterministic for the same seed and board, and vary across seeds', () => {
  const mk = (seed: number) => {
    const r = new Run(seed);
    r.installForTest('turbo-ramp', 'orbit-l');
    r.installForTest('twin-bumpers', 'flank-l');
    mod(r, 'rally-cap', 'bumper:*');
    return r;
  };
  assert.deepEqual(draftKeys(mk(42)), draftKeys(mk(42)));
  const sets = new Set(Array.from({ length: 20 }, (_, i) => draftKeys(mk(100 + i)).join('|')));
  assert.ok(sets.size >= 15, `${sets.size}/20 distinct drafts`);
});

test('family/synergy preference is visible but wildcards stay common (seeded distribution check)', () => {
  const famOf = (k: string) => {
    const key = k.split('>')[0];
    return MACHINES.find(m => m.key === key)?.family ?? MODS.find(t => t.key === key)!.family;
  };
  const sample = (setup: (r: Run) => void) => {
    const n: Record<string, number> = {};
    let total = 0;
    const origins: Record<string, number> = {};
    for (let seed = 1; seed <= 400; seed++) {
      const r = new Run(seed);
      r.maxPower = 12;
      setup(r);
      r.phase = 'challenge';
      r.clear(3);
      for (const o of r.draft) {
        n[famOf(o.key)] = (n[famOf(o.key)] ?? 0) + 1;
        origins[o.origin ?? 'none'] = (origins[o.origin ?? 'none'] ?? 0) + 1;
        total++;
      }
    }
    return { share: (f: string) => (n[f] ?? 0) / total, origins, total };
  };
  const bumperBuild = sample(r => {
    r.installForTest('turbo-ramp', 'orbit-l');
    r.installForTest('twin-bumpers', 'flank-l');
    mod(r, 'rally-cap', 'bumper:*');
    mod(r, 'hot-corner', 'bumper-left');
  });
  const gateBuild = sample(r => {
    r.installForTest('paired-gates', 'gate-l+gate-r');
    mod(r, 'express-lane', 'mgate@gate-l');
  });
  const bare = sample(() => {});
  // preference: each build sees more of its own family than the other build does
  assert.ok(bumperBuild.share('bumper') > gateBuild.share('bumper') + 0.05, `bumper share ${bumperBuild.share('bumper').toFixed(2)} vs ${gateBuild.share('bumper').toFixed(2)}`);
  assert.ok(gateBuild.share('gate') > bumperBuild.share('gate') + 0.03, `gate share ${gateBuild.share('gate').toFixed(2)} vs ${bumperBuild.share('gate').toFixed(2)}`);
  // no lock-in: plenty of off-family offers, and wildcards remain
  assert.ok(1 - bumperBuild.share('bumper') > 0.4, `off-family ${(1 - bumperBuild.share('bumper')).toFixed(2)}`);
  assert.ok((bumperBuild.origins.wildcard ?? 0) / bumperBuild.total > 0.15, JSON.stringify(bumperBuild.origins));
  assert.ok((bare.origins.wildcard ?? 0) / bare.total > 0.5, 'a fresh board is mostly wildcard');
  assert.equal(OFFER_WEIGHTS.base, 1);
});

test('draft always has exactly 3 cards incl. a claimable modifier at full Power; shop stays a 4-card full restock at rising prices', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = new Run(seed);
    r.installForTest('bridge-ramp', 'bridge');
    r.installForTest('turbo-ramp', 'orbit-l');
    r.installForTest('mult-gate', 'gate-l');
    assert.equal(r.powerUsed, r.maxPower);
    r.clear(2);
    assert.equal(r.draft.length, 3);
    assert.ok(r.draft.some(o => o.kind === 'modifier' && r.check(o).ok));
    const keys = r.draft.map(o => (o.kind === 'machine' ? o.key : `${o.key}>${o.target.key}`));
    assert.equal(new Set(keys).size, 3, 'no duplicate card in one set');
    const pick = r.draft.find(o => o.kind === 'modifier')!;
    assert.ok(r.takeDraft(pick.uid).ok);
    r.money = 100;
    const prices: number[] = [];
    for (let k = 0; k < 4; k++) {
      assert.equal(r.shop.length, 4);
      assert.ok(r.shop.every(o => o.kind === 'modifier'));
      prices.push(r.rerollPrice);
      assert.ok(r.reroll());
    }
    assert.deepEqual(prices, [1, 2, 3, 4]);
  }
});

// ───────── analytics ─────────

test('analytics: sale, dormancy/reactivation, bundle installs and a C15 victory are recorded; the report renders', () => {
  const rec = new RunRecorder({ store: new MemoryStore(), build: { version: 't', commit: 't', builtAt: '' } });
  rec.startRun({ route: '/build-test/', theme: 'x' });
  const r = new Run(21);
  r.challenge = 15;
  const sim = new Simulation({ preset: r.preset() });
  rec.startChallenge(r, 3);
  sim.rules.target = 10;
  sim.ready();
  r.phase = 'shop';
  assert.ok(r.installForTest('twin-bumpers', 'flank-l').ok);
  mod(r, 'mvp', 'twin-a@flank-l');
  const before = r.dormantKeys();
  const res = r.sell(r.installed[0].uid) as any;
  rec.sale(r, res, before);
  const dorm = r.dormantKeys();
  assert.ok(r.installForTest('twin-bumpers', 'flank-l').ok);
  rec.boardDiff(r, dorm);
  r.phase = 'challenge';
  rec.endChallenge(r, sim, 'cleared');
  r.clear(3);
  assert.equal(r.phase, 'won');
  rec.afterClear(r, 14);
  rec.endRun('completed');
  const out = rec.snapshot()!;
  assert.equal(out.outcome, 'completed');
  const types = out.ledger.map(e => e.type);
  for (const t of ['sale', 'modsDormant', 'modsReactivated', 'runEnd']) assert.ok(types.includes(t), t);
  const sale = out.ledger.find(e => e.type === 'sale')!;
  assert.equal(sale.refund, 0);
  assert.equal(sale.powerFreed, 2);
  const html = renderReport(out);
  assert.match(html, /Sold Twin Bumpers/);
  assert.match(html, /Modifiers reactivated: MVP @ twin-a@flank-l/);
  assert.match(html, /completed/);
});

test('every mount is referenced by some machine and every conflict is declared both ways', () => {
  for (const m of MOUNTS) {
    assert.ok(MACHINES.some(x => placementsOf(x).some(p => p.mounts.includes(m.id))), m.id);
    for (const c of m.conflicts ?? []) assert.ok(MOUNTS.find(x => x.id === c)!.conflicts?.includes(m.id), `${m.id} ↔ ${c}`);
  }
});
