/**
 * Save & continue: Run round-trips exactly at every safe point; between-pitch carry state restores the
 * challenge; corrupt / newer / missing saves are handled without losing data.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { config } from '../src/config.ts';
import { Simulation } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { Run } from '../src/run/run.ts';
import { MODS } from '../src/run/catalog.ts';
import { SAVE, clearSave, readSave, saveKey, writeSave, type Store } from '../src/run/save.ts';

const DT = 1 / config.physicsHz;

function memStore(): Store & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, get: k => m.get(k) ?? null, set: (k, v) => void m.set(k, v), del: k => void m.delete(k) };
}
/** JSON round trip, the way a real save travels. */
/** Compare the way it's stored (JSON drops undefined fields). */
const norm = (v: unknown) => JSON.parse(JSON.stringify(v));
const viaJson = (r: Run) => Run.fromSave(JSON.parse(JSON.stringify(r.toSave())));

/** Play a run forward through draft/shop with deterministic choices. */
function advance(r: Run, clears: number) {
  for (let i = 0; i < clears; i++) {
    r.clear(2);
    const pick = r.draft.find(o => r.check(o).ok) ?? r.draft[0];
    if (pick) r.takeDraft(pick.uid);
    if (r.phase === 'draft') r.takeDraft(r.draft[0].uid);
    const buy = r.shop.find(o => o.price <= r.money && r.check(o).ok);
    if (buy) r.buy(buy.uid);
    r.next();
  }
}

test('Run round-trips through JSON at challenge, draft and shop phases (same state, same future offers)', () => {
  const r = new Run(424242);
  r.v2 = true;
  advance(r, 4); // through the C3 Upper Deck unlock
  assert.ok(r.sections.includes('upperDeck'));
  // challenge phase
  let { run: c, dropped } = viaJson(r);
  assert.deepEqual(dropped, []);
  assert.deepEqual(norm(c.toSave()), norm(r.toSave()));
  assert.deepEqual(norm(c.preset()), norm(r.preset()));
  assert.deepEqual(c.dormantKeys(), r.dormantKeys());
  // draft phase: the restored run rolls the same shop as the original after the same pick
  r.clear(1);
  ({ run: c } = viaJson(r));
  assert.equal(c.phase, 'draft');
  assert.deepEqual(norm(c.draft), norm(r.draft));
  const pick = r.draft[0].uid;
  r.takeDraft(pick);
  c.takeDraft(pick);
  assert.deepEqual(norm(c.shop), norm(r.shop), 'RNG state restored');
  // shop phase, after a reroll
  r.money = c.money = 999;
  r.reroll();
  ({ run: c } = viaJson(r));
  assert.equal(c.phase, 'shop');
  assert.deepEqual(norm(c.shop), norm(r.shop));
  assert.equal(c.rerollPrice, r.rerollPrice);
  r.reroll();
  c.reroll();
  assert.deepEqual(norm(c.shop), norm(r.shop));
  assert.deepEqual(norm(c.toSave()), norm(r.toSave()));
});

test('sales, refunds and dormant modifiers survive a save', () => {
  const r = new Run(7);
  r.maxPower = 99;
  r.sections = ['upperDeck'];
  r.installForTest('bonus-bumper', 'deck-l');
  r.installForTest('turbo-ramp', 'orbit-l');
  const t = MODS.find(m => m.key === 'mvp')!;
  r.mods['bonus@deck-l'] = [{ note: t.name, mul: t.mul }];
  r.phase = 'shop';
  const sold = r.sell(r.installed[0].uid);
  assert.ok(sold.ok);
  const { run: c } = viaJson(r);
  assert.deepEqual(c.dormantKeys(), ['bonus@deck-l']);
  assert.equal(c.installed.length, 1);
  assert.equal(c.powerUsed, r.powerUsed);
  assert.equal(c.money, r.money);
  // reinstalling wakes it, same as the original
  c.installForTest('bonus-bumper', 'deck-l');
  assert.deepEqual(c.dormantKeys(), []);
});

test('a machine the catalog can no longer place is refunded, not lost silently', () => {
  const r = new Run(3);
  r.maxPower = 99;
  r.installForTest('turbo-ramp', 'orbit-l');
  const s = JSON.parse(JSON.stringify(r.toSave()));
  s.installed.push({ uid: 'gone#9', offerKey: 'retired-machine', placement: 'nowhere', via: 'shop', paid: 12 });
  const { run: c, dropped } = Run.fromSave(s);
  assert.deepEqual(dropped, ['retired-machine']);
  assert.equal(c.money, r.money + 12);
  assert.equal(c.installed.length, 1);
  assert.match(c.history.at(-1)!, /refunded \$12/);
});

test('between-pitch carry state restores the challenge on a rebuilt table', () => {
  const r = new Run(11);
  r.maxPower = 99;
  r.installForTest('splitter', 'center-r');
  const a = new Simulation({ preset: r.preset(), seed: 99 });
  a.rules.target = 1_000_000;
  a.ready();
  // simulate some progress and a strike
  a.rules.score = 4321;
  a.rules.multTenths = 23;
  a.rules.hits = 9;
  a.splitters.get(a.layout.splitters[0].id)!.charge = 2;
  a.genCount.set('bumper:*|5', 3);
  a.rallyCharges = 4;
  (a as any).drainBall(a.balls[0]);
  assert.equal(a.rules.phase, 'ready');
  const carry = JSON.parse(JSON.stringify(a.carryState()));
  const b = new Simulation({ preset: r.preset(), seed: 1 });
  b.rules.target = 1_000_000;
  b.restoreCarry(carry);
  assert.deepEqual(b.carryState(), a.carryState());
  assert.equal(b.rules.strikes, 1);
  // the next pitch is pitch 2 and keeps the multiball charge (not reset like pitch 1)
  assert.ok(b.ready());
  assert.equal(b.rules.pitchNumber, 2);
  assert.equal(b.splitters.get(b.layout.splitters[0].id)!.charge, 2);
  assert.equal(b.rules.multTenths, 23);
  // and plays on normally
  for (let i = 0; i < 0.5 / DT; i++) b.step(DT, makeControls());
  assert.ok(b.balls.length >= 1);
});

test('save file: write/read, one save per route, cleared on demand', () => {
  const st = memStore();
  const r = new Run(5);
  assert.deepEqual(readSave(st, 'build-test'), { ok: false, reason: 'none' });
  assert.ok(writeSave(st, { route: 'build-test', run: r.toSave() }, 1000));
  const got = readSave(st, 'build-test');
  assert.ok(got.ok);
  if (got.ok) {
    assert.equal(got.file.schema, SAVE.schema);
    assert.equal(got.file.savedAt, 1000);
    assert.deepEqual(got.file.run, JSON.parse(JSON.stringify(r.toSave())));
  }
  assert.deepEqual(readSave(st, 'build-test-legacy'), { ok: false, reason: 'none' }, 'routes are separate');
  clearSave(st, 'build-test');
  assert.deepEqual(readSave(st, 'build-test'), { ok: false, reason: 'none' });
});

test('corrupt, invalid and newer saves are kept aside (never silently deleted) and reported', () => {
  const st = memStore();
  st.set(saveKey('build-test'), '{not json');
  const a = readSave(st, 'build-test');
  assert.equal(a.ok, false);
  assert.equal((a as any).reason, 'unreadable');
  assert.equal(st.get(saveKey('build-test') + SAVE.backupSuffix), '{not json');
  assert.equal(st.get(saveKey('build-test')), null);

  st.set(saveKey('build-test'), JSON.stringify({ schema: SAVE.schema, savedAt: 1, route: 'build-test', run: { challenge: 'x' } }));
  assert.equal((readSave(st, 'build-test') as any).reason, 'unreadable');

  const newer = JSON.stringify({ schema: SAVE.schema + 1, savedAt: 1, route: 'build-test', run: new Run(1).toSave() });
  st.set(saveKey('build-test'), newer);
  assert.equal((readSave(st, 'build-test') as any).reason, 'newer');
  assert.equal(st.get(saveKey('build-test') + SAVE.backupSuffix), newer);
});

test('storage that throws (private mode / quota) never breaks the game', () => {
  const bad: Store = {
    get: () => {
      throw new Error('blocked');
    },
    set: () => {
      throw new Error('quota');
    },
    del: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(writeSave(bad, { route: 'build-test', run: new Run(1).toSave() }), false);
  assert.deepEqual(readSave(bad, 'build-test'), { ok: false, reason: 'none' });
  clearSave(bad, 'build-test');
});
