/** Upgrade cards: one effect per roll (no duplicate boosts), and one plain effect line with the target folded in. */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Run, type Offer } from '../src/run/run.ts';
import { cardEffect } from '../src/run/ui.ts';

function walk(seed: number, clears: number, each: (offers: Offer[]) => void) {
  const r = new Run(seed);
  for (let i = 0; i < clears && r.phase !== 'won'; i++) {
    r.clear(2);
    each(r.draft);
    const pick = r.draft.find(o => r.check(o).ok) ?? r.draft[0];
    if (pick) r.takeDraft(pick.uid);
    if (r.phase === 'draft') r.takeDraft(r.draft[0].uid);
    each(r.shop);
    for (const o of [...r.shop]) if (o.price <= r.money && r.check(o).ok) r.buy(o.uid);
    r.next();
  }
}

test('no roll offers the same boost twice', () => {
  let rolls = 0;
  for (let seed = 1; seed <= 40; seed++)
    walk(seed, 14, offers => {
      rolls++;
      const keys = offers.map(o => o.key);
      assert.equal(new Set(keys).size, keys.length, `duplicate in roll: ${keys.join(', ')}`);
    });
  assert.ok(rolls > 400);
});

test('card text names its target and never shows THIS/ALL jargon', () => {
  let seen = 0;
  for (let seed = 1; seed <= 25; seed++)
    walk(seed, 14, offers => {
      for (const o of offers) {
        if (o.kind !== 'modifier') continue;
        const line = cardEffect(o);
        seen++;
        assert.doesNotMatch(line, /\bTHIS\b|\bALL\b/, line);
        if (o.scope === 'this') assert.ok(line.includes(o.target.label.split(',')[0].replace(/ \((full ride|complete all 3)\)$/, '').replace(/ Ramp ramp/g, ' Ramp')), line);
      }
    });
  assert.ok(seen > 200);
});
