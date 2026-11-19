import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { baselineReplay } from './replay.ts';

/**
 * The original table (/) is the locked, player-approved feel. This replays 270 s of scripted batting
 * and must match the committed golden run exactly: same hits, score and ball positions.
 * The golden matches the build from before any map or roguelite work (25,320 points, 90 hits).
 */
test('original table replays identically to the approved golden run', () => {
  const golden = JSON.parse(readFileSync(new URL('./fixtures/baseline-replay.json', import.meta.url), 'utf8'));
  const now = baselineReplay();
  assert.equal(now.hits, golden.hits, 'bat hits');
  assert.equal(now.score, golden.score, 'score');
  assert.equal(now.strikes, golden.strikes, 'strikes');
  assert.equal(now.time, golden.time, 'sim time');
  assert.deepEqual(now.samples, golden.samples, 'ball positions');
});
