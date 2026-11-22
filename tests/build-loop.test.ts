import { deckFloorPolygon } from '../src/machines/sections.ts';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as P from 'planck';
import { config } from '../src/config.ts';
import { Simulation, type SimEvent } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { Run, type Offer } from '../src/run/run.ts';
import { MACHINES, placementsOf, MOUNTS } from '../src/run/catalog.ts';
import { ECONOMY } from '../src/run/economy.ts';
import { OUTER_WALL } from '../src/physics/board.ts';
import { presetForPath, isBuildRoute, isV2Route } from '../src/machines/presets.ts';
import { appRootFor } from '../src/core/install.ts';
import { dropLanding } from '../src/machines/mechanisms.ts';

const DT = 1 / config.physicsHz;
function run(sim: Simulation, seconds: number, each?: (s: Simulation) => void) {
  const c = makeControls();
  for (let i = 0; i < seconds / DT; i++) {
    each?.(sim);
    sim.step(DT, c);
    if (!sim.balls.length) break;
  }
}
const evs = <T extends SimEvent['type']>(s: Simulation, type: T) => s.events.filter(e => e.type === type) as Extract<SimEvent, { type: T }>[];
const machineOffer = (r: Run, key: string): Offer => {
  const m = MACHINES.find(m => m.key === key)!;
  return { uid: 9000 + Math.floor(r.random() * 1000), kind: 'machine', key, name: m.name, desc: m.desc, power: m.power, price: m.price, mounts: Object.keys(m.at) };
};
/**
 * Install a machine the only way the game allows now: as a free end-of-challenge pick (test helper).
 * The run's phase and shop are restored afterwards so tests can keep installing.
 */
function buyMachine(r: Run, key: string, mount?: string) {
  const o = machineOffer(r, key);
  const phase = r.phase, shop = r.shop, rerolls = r.rerolls;
  r.phase = 'draft';
  r.draft = [o];
  const res = r.takeDraft(o.uid, mount);
  Object.assign(r, { phase, shop, rerolls, draft: [] });
  return res;
}
function toShop(r: Run, money = 0) {
  r.clear(0);
  const d = r.draft.find(o => o.kind === 'modifier') ?? r.draft[0];
  r.takeDraft(d.uid, d.kind === 'machine' ? r.check(d).ok ? (r.check(d) as any).mounts[0] : undefined : undefined);
  r.money = money;
}

test('route: /build-test/ is its own mode; the four map routes are unchanged', () => {
  assert.ok(isBuildRoute('/baseball-pinball/build-test/'));
  assert.ok(isBuildRoute('/baseball-pinball/build-test'));
  assert.ok(!isBuildRoute('/baseball-pinball/'));
  assert.ok(!isBuildRoute('/baseball-pinball/3/'));
  assert.equal(presetForPath('/baseball-pinball/3/').id, 'powerhouse');
  assert.equal(presetForPath('/baseball-pinball/').id, 'baseline');
});

test('score target: the challenge clears immediately, exactly once, and play stops cleanly', () => {
  const s = new Simulation();
  s.rules.target = 500;
  s.ready();
  const b = s.layout.bumpers[0];
  let afterClearSteps = 0;
  for (let k = 0; k < 20 && s.rules.phase === 'live'; k++) {
    s.spawnBall(b.x, b.y - b.r - 1.2, 0, 4);
    run(s, 0.4);
  }
  assert.equal(s.rules.phase, 'cleared');
  assert.equal(s.balls.length, 0, 'balls removed on clear');
  const score = s.rules.score;
  assert.ok(score >= 500 && score < 500 + 2 * 300, `cleared at ${score}`);
  run(s, 1, () => afterClearSteps++);
  s.step(DT);
  assert.equal(evs(s, 'clear').length, 1, 'one clear event');
  assert.equal(evs(s, 'drain').length, 0, 'clearing is not a drain or strike');
  assert.equal(s.rules.strikes, 0);
  assert.equal(s.rules.score, score, 'no scoring after clear');
});

test('three strikes fail the challenge; points stay banked across strikes', () => {
  const s = new Simulation();
  s.rules.target = 1e9;
  const banked: number[] = [];
  for (let k = 0; k < 3; k++) {
    s.ready();
    const b = s.layout.bumpers[2];
    s.spawnBall(b.x, b.y - b.r - 1.2, 0, 4);
    run(s, 8); // no batting → eventually drains
    banked.push(s.rules.score);
  }
  assert.equal(s.rules.strikes, 3);
  assert.equal(s.rules.phase, 'over');
  assert.ok(banked[0] > 0 && banked[1] >= banked[0] && banked[2] >= banked[1], `banked ${banked}`);
});

test('multiball on a built machine: only the last ball draining is a strike', () => {
  const r = new Run(3);
  r.maxPower = 10;
  toShop(r, 99);
  assert.ok(buyMachine(r, 'splitter').ok);
  const s = new Simulation({ preset: r.preset() });
  s.rules.target = 1e9;
  s.ready();
  const sp = s.layout.splitters[0];
  for (let k = 0; k < sp.hitsToArm; k++) {
    s.balls[0].body.setPosition(P.Vec2(sp.x, sp.y + sp.hh + 1.2));
    s.balls[0].body.setLinearVelocity(P.Vec2(0, -14));
    run(s, 0.4);
  }
  run(s, 0.4);
  assert.equal(s.balls.length, 2);
  const drop = () => {
    s.balls[0].body.setPosition(P.Vec2(10, 31.5));
    s.balls[0].body.setLinearVelocity(P.Vec2(0, 10));
    run(s, 0.2);
  };
  drop();
  assert.equal(s.rules.strikes, 0, 'extra ball drained free');
  drop();
  assert.equal(s.rules.strikes, 1, 'last ball = one strike');
  assert.deepEqual(evs(s, 'drain').map(d => d.strike), [false, true]);
});

test('draft: three different offers, exactly one taken free per clear', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const r = new Run(seed);
    r.clear(2);
    assert.equal(r.draft.length, ECONOMY.draftSize);
    assert.equal(new Set(r.draft.map(o => o.uid)).size, 3);
    const money = r.money;
    const o = r.draft[0];
    const mounts = o.kind === 'machine' ? (r.check(o) as any).mounts : [];
    const res = r.takeDraft(o.uid, mounts[0]);
    assert.ok(res.ok, JSON.stringify(res));
    assert.equal(r.money, money, 'draft is free');
    assert.equal(r.phase, 'shop');
    assert.equal(r.draft.length, 0);
    assert.ok(!r.takeDraft(r.shop[0]?.uid ?? 0).ok, 'no second free pick');
  }
});

test('shop: purchases spend money, unaffordable items are rejected, no purchase cap', () => {
  const r = new Run(7);
  toShop(r, 30);
  // three modifiers in a row: all succeed while money lasts
  let bought = 0;
  for (let k = 0; k < 6; k++) {
    const o: Offer = { uid: 5000 + k, kind: 'modifier', key: 'hot-corner', name: 'Hot Corner', desc: '+100', price: 5, target: { key: 'bumper-left', label: 'Left bumper' }, mod: { add: 100 } };
    r.shop.push(o);
    const res = r.buy(o.uid);
    if (res.ok) bought++;
  }
  assert.equal(bought, 6, 'six purchases, no cap');
  assert.equal(r.money, 0);
  const pricey: Offer = { uid: 6001, kind: 'modifier', key: 'big-stage', name: 'Big Stage', desc: '×2', price: 4, target: { key: 'jackpot', label: 'Jackpot' }, mod: { mul: 2 } };
  r.shop.push(pricey);
  const res = r.buy(pricey.uid);
  assert.ok(!res.ok && /Costs \$4/.test(res.reason!));
  assert.ok(r.shop.some(o => o.uid === pricey.uid), 'rejected item stays in the shop');
  // reroll spends money and rises in price
  r.money = 10;
  const p1 = r.rerollPrice;
  assert.ok(r.reroll());
  assert.equal(r.money, 10 - p1);
  assert.equal(r.rerollPrice, p1 + ECONOMY.rerollStep);
});

test('power: over-capacity installs are blocked; factory parts cost 0', () => {
  const r = new Run(1);
  assert.equal(r.powerUsed, 0, 'factory table uses no power');
  toShop(r, 999);
  for (const i of r.installed.slice()) void i;
  r.installed = [];
  r.maxPower = 5;
  assert.ok(buyMachine(r, 'splitter').ok); // 3
  assert.ok(buyMachine(r, 'glove-scoop').ok); // 2 → 5/5
  const res = buyMachine(r, 'spinner', 'lane-l');
  assert.ok(!res.ok && /needs 1 more free Power/.test(res.reason!) && (res as any).fixable, JSON.stringify(res));
  assert.equal(r.powerUsed, 5);
  const v = r.preset();
  assert.ok(v.mechanisms.reduce((s, m) => s + m.powerCost, 0) <= v.maxPower);
});

test('conflicting mounts are refused and never displace an installed, invested machine', () => {
  const r = new Run(2);
  r.maxPower = 20;
  toShop(r, 999);
  r.installed = [];
  assert.ok(buyMachine(r, 'bridge-ramp').ok);
  const bridge = r.installed.find(i => i.offerKey === 'bridge-ramp')!;
  (r.mods[`${bridge.id}-gate`] ??= []).push({ add: 500 });
  const res = buyMachine(r, 'splitter');
  assert.ok(!res.ok && /blocked by Overpass Bridge/.test(res.reason!), JSON.stringify(res));
  assert.ok(r.installed.some(i => i.id === bridge.id), 'bridge still installed');
  assert.equal(r.mods[`${bridge.id}-gate`].length, 1, 'its modifier survives');
  assert.ok(buyMachine(r, 'turbo-ramp').ok, 'turbo ramp and bridge fit together');
  // a taken mount is refused even if named explicitly
  assert.ok(buyMachine(r, 'bonus-bumper', 'pocket-ul').ok);
  const again = buyMachine(r, 'bonus-bumper', 'pocket-ul');
  assert.ok(!again.ok);
  assert.equal(r.installed.filter(i => i.mountId === 'pocket-ul').length, 1);
});

test('modifiers hit their intended part, stack without a cap, and persist into later challenges', () => {
  const r = new Run(4);
  toShop(r, 999);
  r.mods = {};
  for (let k = 0; k < 12; k++) {
    const o: Offer = { uid: 7000 + k, kind: 'modifier', key: 'power-alley', name: 'Power Alley', desc: '×1.5', price: 1, target: { key: 'bumper-left', label: 'Left bumper' }, mod: { mul: 1.5 } };
    r.shop.push(o);
    assert.ok(r.buy(o.uid).ok);
  }
  assert.equal(r.mods['bumper-left'].length, 12);
  assert.ok(r.next());
  assert.equal(r.challenge, 2);
  const s = new Simulation({ preset: r.preset() });
  assert.equal(s.pts('bumper-left', 'bumper', 100), Math.round(100 * Math.pow(1.5, 12)));
  assert.equal(s.pts('bumper-right', 'bumper', 100), 100, 'other parts untouched');
  // real collision pays the stacked value
  s.ready();
  const b = s.layout.bumpers.find(b => b.id === 'bumper-left')!;
  s.spawnBall(b.x, b.y - b.r - 1.2, 0, 4);
  run(s, 0.4);
  const hit = s.events.find(e => e.type === 'machine' && e.id === 'bumper-left') as Extract<SimEvent, { type: 'machine' }>;
  assert.equal(hit.points, Math.round(100 * Math.pow(1.5, 12)));
});

test('advancing resets challenge score and strikes but keeps the machine', () => {
  const r = new Run(5);
  toShop(r, 999);
  buyMachine(r, 'bonus-bumper', 'pocket-ur');
  const before = JSON.stringify({ i: r.installed, m: r.mods });
  r.next();
  const s = new Simulation({ preset: r.preset() });
  s.rules.target = r.target;
  assert.equal(s.rules.score, 0);
  assert.equal(s.rules.strikes, 0);
  assert.equal(JSON.stringify({ i: r.installed, m: r.mods }), before);
  assert.ok(s.layout.bumpers.some(b => b.id === 'bonus@pocket-ur'), 'installed bumper is on the new table');
  assert.equal(r.target, ECONOMY.targets[1]);
});

test('draft and shop never offer an impossible machine', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = new Run(seed);
    r.maxPower = 3;
    r.clear(1);
    for (let round = 0; round < 6; round++) {
      for (const o of [...r.draft, ...r.shop]) if (o.kind === 'machine') assert.ok(r.check(o).ok, `seed ${seed}: ${o.name} offered but ${(r.check(o) as any).reason}`);
      if (r.phase === 'draft') {
        const o = r.draft[0];
        r.takeDraft(o.uid, o.kind === 'machine' ? (r.check(o) as any).mounts[0] : undefined);
      } else {
        r.money = 50;
        r.reroll();
      }
    }
  }
});

// ── physical validity of every mount combination ──
function insideTable(x: number, y: number) {
  return inPoly(OUTER_WALL, x, y) || (y < 0.65 && inPoly(deckFloorPolygon(), x, y));
}
function inPoly(poly: { x: number; y: number }[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function staticOverlap(s: Simulation, x: number, y: number, r: number) {
  let hit = false;
  s.world.queryAABB(new P.AABB(P.Vec2(x - r, y - r), P.Vec2(x + r, y + r)), f => {
    if (!f.getBody().isStatic() || f.isSensor()) return true;
    const t = f.getShape().getType();
    if (t === 'chain' || t === 'edge') return true;
    if (f.testPoint(P.Vec2(x, y))) hit = true;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      if (f.testPoint(P.Vec2(x + Math.cos(a) * r, y + Math.sin(a) * r))) hit = true;
    }
    return true;
  });
  return hit;
}

/**
 * Full builds that together use every placement of every machine (bundles, spans and all three ramps
 * included). Each is a set the mount conflicts allow at once.
 */
const FULL_BUILDS: [string, string][][] = [
  [['mult-gate', 'gate-l'], ['mult-gate', 'gate-r'], ['bonus-bumper', 'pocket-ul'], ['bonus-bumper', 'pocket-ur'], ['spinner', 'lane-l'], ['spinner', 'lane-r'], ['bank', 'bank-cards'], ['bank', 'bank-stars'], ['jackpot-gate', 'jackpot-lane'], ['turbo-ramp', 'orbit-l'], ['glove-scoop', 'pocket-r'], ['splitter', 'center-r'], ['twin-bumpers', 'flank-l'], ['twin-bumpers', 'flank-r']],
  [['paired-gates', 'gate-l+gate-r'], ['bonus-bumper', 'pocket-ul'], ['bonus-bumper', 'pocket-ur'], ['spinner', 'lane-l'], ['spinner', 'lane-r'], ['bank', 'bank-cards'], ['bank', 'bank-stars'], ['jackpot-gate', 'jackpot-lane'], ['turbo-ramp', 'orbit-l'], ['bridge-ramp', 'bridge'], ['glove-scoop', 'pocket-r'], ['twin-bumpers', 'flank-l'], ['twin-bumpers', 'flank-r']],
  [['paired-gates', 'gate-l+gate-r'], ['bonus-bumper', 'pocket-ul'], ['spinner', 'lane-l'], ['bank', 'bank-stars'], ['turbo-ramp', 'orbit-l'], ['glove-scoop', 'pocket-r'], ['splitter', 'center-r'], ['twin-bumpers', 'flank-l'], ['bumper-cluster', 'cluster-r']],
  [['paired-gates', 'gate-l+gate-r'], ['bonus-bumper', 'pocket-ul'], ['bonus-bumper', 'pocket-ur'], ['spinner', 'lane-l'], ['spinner', 'lane-r'], ['bank', 'bank-cards'], ['bank', 'bank-stars'], ['jackpot-gate', 'jackpot-lane'], ['turbo-ramp', 'orbit-l'], ['bridge-ramp', 'bridge'], ['long-loop', 'loop-r']],
  // V2 Upper Deck builds (deck mounts need the section; fullBuild unlocks it when a deck mount is listed)
  [['paired-gates', 'gate-l+gate-r'], ['spinner', 'lane-r'], ['turbo-ramp', 'orbit-l'], ['long-loop', 'loop-r'], ['bonus-bumper', 'deck-l'], ['bumper-cluster', 'deck-r']],
  [['mult-gate', 'gate-r'], ['bridge-ramp', 'bridge'], ['glove-scoop', 'pocket-r'], ['bumper-cluster', 'deck-l'], ['bonus-bumper', 'deck-r']],
];
function fullBuild(list: [string, string][]) {
  const r = new Run(1);
  r.maxPower = 99;
  if (list.some(([, p]) => p.startsWith('deck-'))) r.sections = ['upperDeck'];
  for (const [k, p] of list) {
    const res = r.installForTest(k, p);
    assert.ok(res.ok, `${k} @ ${p}: ${(res as any).reason}`);
  }
  return r;
}

test('full builds cover every placement, and every machine fits the factory table with the others', () => {
  const covered = new Set(FULL_BUILDS.flat().map(([k, p]) => `${k}|${p}`));
  for (const m of MACHINES) for (const p of placementsOf(m)) assert.ok(covered.has(`${m.key}|${p.id}`), `${m.key} @ ${p.id} is exercised`);
  for (const [bi, list] of FULL_BUILDS.entries()) {
    const skip = `build ${bi + 1}`;
    const r = fullBuild(list);
    const s = new Simulation({ preset: r.preset() });
    // no mechanism collider overlaps another static collider
    const fixtures: P.Fixture[] = [];
    for (let b = s.world.getBodyList(); b; b = b.getNext()) for (let f = b.getFixtureList(); f; f = f.getNext()) if (!f.isSensor()) fixtures.push(f);
    const mech = fixtures.filter(f => /@/.test((f.getUserData() as any)?.id ?? ''));
    for (const a of mech) for (const b of fixtures) {
      if (a === b) continue;
      const ta = b.getShape().getType();
      if (ta === 'chain' || ta === 'edge') continue;
      const aabb = a.getAABB(0), bb = b.getAABB(0);
      if (!P.AABB.testOverlap(aabb, bb)) continue;
      const overlap = P.testOverlap(a.getShape(), 0, b.getShape(), 0, a.getBody().getTransform(), b.getBody().getTransform());
      assert.ok(!overlap, `${(a.getUserData() as any).id} overlaps ${(b.getUserData() as any).id} (skip ${skip})`);
    }
    // release, landing and hatch points are open floor
    const rad = config.ball.radius;
    for (const ramp of s.layout.ramps) {
      if (ramp.def.exit?.mode === 'drop') {
        for (let sp = ramp.def.exitMin; sp <= ramp.def.exitMax; sp += 1) {
          const { p } = dropLanding(ramp, sp, config.gravity);
          assert.ok(insideTable(p.x, p.y) && !staticOverlap(s, p.x, p.y, rad), `${ramp.def.id} landing open at ${sp}`);
        }
      } else assert.ok(!staticOverlap(s, ramp.exit.x, ramp.exit.y, rad), `${ramp.def.id} exit open`);
    }
    for (const sp of s.layout.splitters) assert.ok(!staticOverlap(s, sp.hatch.x, sp.hatch.y, rad), 'hatch open');
  }
  assert.equal(MOUNTS.length, 19, '11 original + 2 alley-top gate + left/right flank, right mid-field and Long Loop sites + 2 Upper Deck sites');
});

test('fully built machines: no traps, soft-locks or tunneling under random play', () => {
  for (const [bi, list] of FULL_BUILDS.entries()) {
    const skip = `build ${bi + 1}`;
    const r = fullBuild(list);
    let maxStill = 0, maxCaptured = 0, escapes = 0;
    for (let i = 0; i < 30; i++) {
      const s = new Simulation({ preset: r.preset(), seed: i + 1 });
      s.ready();
      const a = (i / 30) * Math.PI * 2, sp = 8 + (i % 5) * 7;
      s.spawnBall(3 + (i % 7) * 2.2, 3 + (i % 9) * 2, Math.cos(a) * sp, Math.sin(a) * sp);
      const cap = new Map<number, number>(), still = new Map<number, number>();
      run(s, 8, s => {
        for (const b of s.balls) {
          cap.set(b.id, b.mode === 'field' ? 0 : (cap.get(b.id) ?? 0) + DT);
          maxCaptured = Math.max(maxCaptured, cap.get(b.id)!);
          if (b.mode !== 'field') continue;
          const v = b.body.getLinearVelocity();
          still.set(b.id, Math.hypot(v.x, v.y) < 0.6 ? (still.get(b.id) ?? 0) + DT : 0);
          maxStill = Math.max(maxStill, still.get(b.id)!);
          const q = b.body.getPosition();
          if (q.y < 30.5 && !insideTable(q.x, q.y)) escapes++;
        }
      });
    }
    assert.ok(maxStill <= config.ball.stuckSeconds + 0.05, `still ${maxStill}`);
    assert.ok(maxCaptured < 6, `captured ${maxCaptured}`);
    assert.equal(escapes, 0);
  }
});

test('installed glove scoop on the factory table catches and relaunches into the field', () => {
  const r = new Run(1);
  r.maxPower = 9;
  toShop(r, 99);
  r.installed = [];
  assert.ok(buyMachine(r, 'glove-scoop').ok);
  const s = new Simulation({ preset: r.preset() });
  s.ready();
  const sc = s.layout.scoops[0];
  s.spawnBall(sc.x - 0.6, sc.y - 2.3, 0.6, 1);
  run(s, 2.5);
  const sco = evs(s, 'scoop');
  assert.deepEqual(sco.slice(0, 2).map(e => e.phase), ['catch', 'eject']);
  const ej = s.events.findIndex(e => e.type === 'scoop' && e.phase === 'eject');
  assert.ok(s.events.slice(ej).some(e => e.type === 'machine' && e.kind === 'bumper'), 'relaunch reaches a bumper');
});

test('build-test bridge: a real swing reaches it, and its drop returns the ball toward the bat', () => {
  const r = new Run(1);
  r.maxPower = 9;
  const m = MACHINES.find(m => m.key === 'bridge-ramp')!;
  void m;
  assert.ok(r.installForTest('bridge-ramp', 'bridge').ok);
  let entries = 0, backToBat = 0;
  for (let off = -1.2; off <= 0.6; off += 0.3) for (let st = 0.7; st <= 0.88; st += 0.005) {
    const s = new Simulation({ preset: r.preset() });
    s.rules.target = 1e9;
    s.ready();
    s.batterX = config.batter.startX + off;
    let sw = false, landed = false, reached = false;
    run(s, 6, s => {
      if (!sw && s.time >= st) { s.swing(); sw = true; }
      if (s.events.some(e => e.type === 'ramp' && e.phase === 'land')) landed = true;
      const b = s.balls[0];
      if (landed && b?.mode === 'field' && b.body.getPosition().y > config.batter.handsY - 0.7) reached = true;
    });
    if (s.events.some(e => e.type === 'ramp' && e.phase === 'enter' && e.id === 'ramp@bridge')) entries++;
    if (landed && reached) backToBat++;
  }
  assert.ok(entries >= 5, `${entries} swings enter the bridge`);
  assert.ok(backToBat >= entries * 0.6, `${backToBat}/${entries} bridge runs come back down to the batting zone`);
});

test('build-test starter table drops the two front pegs; / keeps them', () => {
  const s = new Simulation({ preset: new Run(1).preset() });
  assert.ok(!s.layout.posts.some(p => p.id === 'post-l' || p.id === 'post-r'));
  assert.ok(new Simulation().layout.posts.some(p => p.id === 'post-l'), 'original table unchanged');
});

test('routes (Nov 21): /build-test/ is the V2 run by default; /build-test-legacy/ is the pre-V2 run (opt-in ?v2=1)', () => {
  assert.ok(isBuildRoute('/baseball-pinball/build-test-legacy/'));
  assert.ok(isV2Route('/baseball-pinball/build-test/'));
  assert.ok(isV2Route('/baseball-pinball/build-test'));
  assert.ok(isV2Route('/baseball-pinball/build-test/', '?v2=1'), 'old links keep working');
  assert.ok(!isV2Route('/baseball-pinball/build-test-legacy/'));
  assert.ok(isV2Route('/baseball-pinball/build-test-legacy/', '?v2=1'));
  for (const p of ['/baseball-pinball/', '/baseball-pinball/1/', '/baseball-pinball/2/', '/baseball-pinball/3/']) {
    assert.ok(!isBuildRoute(p) && !isV2Route(p, '?v2=1'), p);
  }
  assert.equal(appRootFor('/baseball-pinball/build-test/'), '../');
  assert.equal(appRootFor('/baseball-pinball/build-test-legacy/'), '../');
  assert.equal(appRootFor('/baseball-pinball/1/'), '../');
  assert.equal(appRootFor('/baseball-pinball/'), './');
});
