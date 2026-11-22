import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COACH, ControlsLesson, TipBook, panelTip } from '../src/run/coach.ts';
import type { Store } from '../src/run/save.ts';

const memStore = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: k => data.get(k) ?? null, set: (k, v) => void data.set(k, v), del: k => void data.delete(k) };
};

test('tips are shown once and remembered across sessions', () => {
  const st = memStore();
  const a = new TipBook(st);
  assert.equal(a.shouldShow('aim'), true);
  a.mark('aim');
  assert.equal(a.shouldShow('aim'), false);
  const b = new TipBook(st);
  assert.equal(b.shouldShow('aim'), false);
  assert.equal(b.shouldShow('draft'), true);
});

test('tips off hides everything; show-again resets', () => {
  const st = memStore();
  const t = new TipBook(st);
  t.mark('shop');
  t.enabled = false;
  assert.equal(t.shouldShow('draft'), false);
  assert.equal(panelTip(t, 'draft'), '');
  t.enabled = true;
  t.reset();
  assert.equal(new TipBook(st).shouldShow('shop'), true);
});

test('unreadable tip storage starts fresh instead of throwing', () => {
  const st = memStore();
  st.data.set(COACH.key, '{nope');
  assert.equal(new TipBook(st).shouldShow('controls'), true);
  st.data.set(COACH.key, '"string"');
  assert.equal(new TipBook(st).shouldShow('controls'), true);
});

test('panel tip has a dismiss button only while unseen', () => {
  const t = new TipBook(memStore());
  assert.match(panelTip(t, 'shop'), /data-act="tipok" data-tip="shop"/);
  t.mark('shop');
  assert.equal(panelTip(t, 'shop'), '');
});

test('controls lesson: done after moving and swinging, after a hit, or after enough pitches', () => {
  const a = new ControlsLesson();
  a.pitch();
  a.move();
  assert.equal(a.done, false);
  a.swing();
  assert.equal(a.done, true);

  const b = new ControlsLesson();
  b.pitch();
  b.hit();
  assert.equal(b.done, true);

  const c = new ControlsLesson();
  for (let i = 0; i < COACH.controlsMaxPitches; i++) c.pitch();
  assert.equal(c.done, false);
  c.pitch();
  assert.equal(c.done, true);
});
