import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GameRules } from '../src/core/rules.ts';
import { TouchInput } from '../src/core/input.ts';

test('ready serves once; drain waits for Ready; third strike ends; score banks', () => {
  const g = new GameRules();
  assert.equal(g.ready(), true);
  assert.equal(g.ready(), false, 'second Ready while live does nothing');
  g.addScore(100);
  assert.equal(g.drain(), true);
  assert.equal(g.score, 100, 'score banked after strike 1');
  assert.equal(g.phase, 'ready', 'no automatic re-serve');
  g.ready(); g.addScore(50); g.drain();
  assert.equal(g.score, 150, 'score survives two strikes');
  assert.equal(g.ballScore, 50);
  g.ready(); g.drain();
  assert.equal(g.phase, 'over');
  assert.equal(g.strikes, 3);
  g.addScore(999);
  assert.equal(g.score, 150, 'no scoring after game over');
  assert.equal(g.ready(), true, 'Ready after game over restarts');
  assert.equal(g.score, 0);
  assert.equal(g.strikes, 0);
});

test('only the last live ball costs a strike (multiball-compatible accounting)', () => {
  const g = new GameRules();
  g.ready();
  g.ballsLive = 2;
  assert.equal(g.drain(), false);
  assert.equal(g.strikes, 0);
  assert.equal(g.drain(), true);
  assert.equal(g.strikes, 1);
});

test('touch: left drag is relative and never teleports; right half swings; two thumbs independent', () => {
  const t = new TouchInput();
  assert.equal(t.down(1, 100, 400), 'drag');
  assert.equal(t.move(1, 100), 0, 'touch-down produces no movement');
  assert.equal(t.move(1, 130), 30);
  assert.equal(t.down(2, 300, 400), 'swing', 'right thumb swings while left is dragging');
  assert.equal(t.move(2, 350), 0, 'right thumb never moves the batter');
  assert.equal(t.move(1, 150), 20, 'left drag keeps tracking during the swing');
  t.up(1);
  assert.equal(t.move(1, 180), 0, 'released drag stops moving');
  assert.equal(t.down(3, 50, 400), 'drag', 'new left touch starts from where it lands');
  assert.equal(t.move(3, 60), 10);
  assert.equal(t.down(4, 20, 400), null, 'a second left touch is ignored');
});
