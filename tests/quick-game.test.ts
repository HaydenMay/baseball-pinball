import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Run } from '../src/run/run.ts';
import { ECONOMY, QUICK_GAME } from '../src/run/economy.ts';
import { QUICK_BEST_KEY, BEST_KEY, bestKeyFor, readBest, recordBest, newStats } from '../src/run/stats.ts';

/** Clear the current challenge and walk through the free pick and shop to the next one. */
function advance(r: Run) {
  r.clear(1);
  if (r.phase === 'won') return;
  const o = r.draft[0];
  r.takeDraft(o.uid, o.kind === 'machine' ? (r.check(o) as any).mounts?.[0] : undefined);
  assert.equal(r.phase, 'shop');
  assert.ok(r.next());
}

test('Quick Game: 2 innings, won on clearing challenge 6, starts with a little money', () => {
  const r = new Run(7, 'quick');
  assert.equal(r.lastChallenge, QUICK_GAME.lastChallenge);
  assert.equal(r.money, QUICK_GAME.startMoney);
  for (let c = 1; c < QUICK_GAME.lastChallenge; c++) advance(r);
  assert.equal(r.challenge, QUICK_GAME.lastChallenge);
  assert.equal(r.phase, 'challenge');
  r.clear(0);
  assert.equal(r.phase, 'won');
});

test('a full run is unchanged: 15 challenges, $0 start, C6 is not the end', () => {
  const r = new Run(7);
  assert.equal(r.mode, 'full');
  assert.equal(r.lastChallenge, ECONOMY.lastChallenge);
  assert.equal(r.money, 0);
  for (let c = 1; c <= 6; c++) advance(r);
  assert.equal(r.challenge, 7);
  assert.notEqual(r.phase, 'won');
});

test('the save keeps the mode; old saves without one load as full runs', () => {
  const q = new Run(3, 'quick');
  advance(q);
  const back = Run.fromSave(JSON.parse(JSON.stringify(q.toSave()))).run;
  assert.equal(back.mode, 'quick');
  assert.equal(back.lastChallenge, QUICK_GAME.lastChallenge);
  const old = q.toSave();
  delete (old as any).mode;
  assert.equal(Run.fromSave(old).run.mode, 'full');
});

test('Quick Game keeps its own device best', () => {
  const m = new Map<string, string>();
  const store = { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), del: (k: string) => void m.delete(k) };
  const s = { ...newStats(), total: 50000, cleared: 6 };
  assert.equal(bestKeyFor('quick'), QUICK_BEST_KEY);
  assert.ok(recordBest(store, s, bestKeyFor('quick')));
  assert.equal(readBest(store, QUICK_BEST_KEY)?.total, 50000);
  assert.equal(readBest(store, BEST_KEY), null, 'the full-run best is untouched');
});
