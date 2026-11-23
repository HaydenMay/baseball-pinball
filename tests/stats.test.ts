/** Results screens: run stats, device best, and the scaled Jackpot (player route). */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { beats, newStats, readBest, recordBest, statsHtml, BEST_KEY } from '../src/run/stats.ts';
import { PLAY, jackpotPoints } from '../src/core/play-rules.ts';
import { Run } from '../src/run/run.ts';
import type { Store } from '../src/run/save.ts';

const mem = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: k => data.get(k) ?? null, set: (k, v) => void data.set(k, v), del: k => void data.delete(k) };
};

test('device best: more challenges cleared wins, then higher total; garbage is ignored', () => {
  const st = mem();
  const a = { ...newStats(), total: 50_000, cleared: 4 };
  assert.equal(recordBest(st, a), true);
  assert.equal(recordBest(st, { ...a, total: 40_000 }), false);
  assert.equal(recordBest(st, { ...a, total: 30_000, cleared: 5 }), true, 'clearing further beats a bigger total');
  assert.deepEqual(readBest(st), { total: 30_000, cleared: 5 });
  assert.equal(beats({ ...a, cleared: 5, total: 30_001 }, readBest(st)), true);
  st.data.set(BEST_KEY, '{oops');
  assert.equal(readBest(st), null);
  assert.equal(recordBest(st, newStats()), false, 'an empty run never records');
});

test('stats survive save/load (and older saves get zeroed stats)', () => {
  const r = new Run(3);
  r.stats.homeRuns = 2;
  r.stats.peakMult = 17;
  const back = Run.fromSave(JSON.parse(JSON.stringify(r.toSave()))).run;
  assert.equal(back.stats.homeRuns, 2);
  assert.equal(back.stats.peakMult, 17);
  const old = JSON.parse(JSON.stringify(r.toSave()));
  delete old.stats;
  assert.deepEqual(Run.fromSave(old).run.stats, newStats());
});

test('results grid shows the totals, pips and NEW BEST badge', () => {
  const html = statsHtml({ ...newStats(), total: 123456, cleared: 3, homeRuns: 4 }, 15, null, true);
  assert.match(html, /NEW BEST/);
  assert.match(html, /123,456/);
  assert.equal((html.match(/<i class="on">/g) ?? []).length, 3);
  assert.equal((html.match(/<i class/g) ?? []).length, 15);
});

test('jackpot pays 5% of the target on the player route, never below the old 250; off elsewhere', () => {
  const was = PLAY.enabled;
  PLAY.enabled = true;
  assert.equal(jackpotPoints(1200, 250), 250);
  assert.equal(jackpotPoints(8000, 250), 400);
  assert.equal(jackpotPoints(15700, 250), 800);
  assert.equal(jackpotPoints(null, 250), 250);
  PLAY.enabled = false;
  assert.equal(jackpotPoints(15700, 250), 250);
  PLAY.enabled = was;
});
