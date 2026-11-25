import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Run } from '../src/run/run.ts';
import { ECONOMY } from '../src/run/economy.ts';

/** A run sitting in the shop before challenge 2 with money to spend. */
function inShop(seed = 11) {
  const r = new Run(seed);
  r.clear(2);
  const o = r.draft.find(d => d.kind === 'modifier') ?? r.draft[0];
  const c = r.check(o) as any;
  r.takeDraft(o.uid, o.kind === 'machine' ? c.mounts?.[0] : undefined);
  assert.equal(r.phase, 'shop');
  r.money = 99;
  return r;
}

test('bought offers keep their slot (PURCHASED) and can not be bought twice; prices and stock unchanged', () => {
  const r = inShop();
  const before = r.shopSlots.map(s => s.offer.uid);
  assert.equal(before.length, ECONOMY.shopSize);
  const target = r.shopSlots[1].offer;
  const money = r.money;
  assert.ok(r.buy(target.uid).ok);
  assert.equal(r.money, money - target.price, 'same price as before');
  assert.deepEqual(r.shopSlots.map(s => s.offer.uid), before, 'no card moved');
  assert.deepEqual(r.shopSlots.map(s => s.bought), [false, true, false, false]);
  assert.equal(r.shop.length, ECONOMY.shopSize - 1, 'the for-sale list works as before');
  assert.equal(r.buy(target.uid).ok, false, 'not twice');
});

test('reroll restocks all four slots (rule unchanged) and clears the stamps; next() clears the visit', () => {
  const r = inShop(12);
  r.buy(r.shopSlots[0].offer.uid);
  const price = r.rerollPrice;
  assert.ok(r.reroll());
  assert.equal(r.shopSlots.length, ECONOMY.shopSize);
  assert.ok(r.shopSlots.every(s => !s.bought));
  assert.ok(r.rerollPrice >= price, 'reroll price still escalates');
  r.buy(r.shopSlots[2].offer.uid);
  assert.ok(r.next());
  assert.equal(r.shopSlots.length, 0);
  assert.equal(r.shopBought.length, 0);
});

test('save/continue restores the stamps; saves from before the grid still load', () => {
  const r = inShop(13);
  r.buy(r.shopSlots[3].offer.uid);
  const back = Run.fromSave(JSON.parse(JSON.stringify(r.toSave()))).run;
  assert.deepEqual(back.shopSlots.map(s => [s.offer.uid, s.bought]), r.shopSlots.map(s => [s.offer.uid, s.bought]));
  const old = r.toSave() as any;
  delete old.shopOrder;
  delete old.shopBought;
  const legacy = Run.fromSave(old).run;
  assert.equal(legacy.shopSlots.length, ECONOMY.shopSize - 1, 'old save: the cards still for sale');
});
