/** Playtest reports (no analytics): tester name handling and the readable summary. */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PLAYTEST, playtestName, reportText, runSummary } from '../src/telemetry/playtest.ts';
import { RunRecorder, type Store } from '../src/telemetry/run-recorder.ts';

const mem = (): Store => {
  const d = new Map<string, string>();
  return { get: k => d.get(k) ?? null, set: (k, v) => void d.set(k, v), remove: k => void d.delete(k) } as Store;
};

test('?playtest=<name> turns playtest mode on and is remembered; ?playtest=off clears it', () => {
  const st = mem();
  assert.equal(playtestName('', st), null);
  assert.equal(playtestName('?playtest=sam', st), 'sam');
  assert.equal(playtestName('', st), 'sam', 'remembered on the device');
  assert.equal(playtestName('?playtest=', st), 'tester');
  assert.equal(playtestName('?playtest=off', st), null);
  assert.equal(playtestName('?playtest=' + 'x'.repeat(80), st)!.length, 24);
  assert.ok(PLAYTEST.maxRuns >= 3);
});

test('report text: header plus one block per run, newest first, readable without the HTML', () => {
  const rec = new RunRecorder({ store: null, build: { version: 't', commit: 'abc1234', builtAt: '' } });
  rec.startRun({ route: '/build-test/', theme: 'nightGame' });
  const r = rec.snapshot()!;
  const line = runSummary(r);
  assert.match(line, /batting: 0 pitches/);
  const text = reportText('sam', 't abc1234', [r, r, r, r, r, r, r, r]);
  assert.match(text, /^Moonshot Pinball playtest · sam/);
  assert.equal((text.match(/^• /gm) ?? []).length, PLAYTEST.maxRuns, 'capped');
  assert.match(text, /Anything else\?/);
});
