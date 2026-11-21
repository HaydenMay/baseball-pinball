/**
 * V2 Expandable Machine — M2 Upper Deck: progression unlock, section mounts, physics (entry, interaction,
 * return, no phantom strikes), Home Run Ramp, modifiers, selling, camera framing, classic routes untouched.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { config } from '../src/config.ts';
import { Simulation, type SimEvent } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { Run } from '../src/run/run.ts';
import { MODS } from '../src/run/catalog.ts';
import { OUTER_WALL, layoutFor, wallChains } from '../src/physics/board.ts';
import { PRESETS } from '../src/machines/presets.ts';
import { HOME_RUN_RAMP, SECTION_UNLOCKS, UPPER_DECK, V2 } from '../src/machines/sections.ts';
import { CAMERA, Camera } from '../src/view/camera.ts';
import type { Modifier } from '../src/machines/mechanisms.ts';

const DT = 1 / config.physicsHz;
const VIEW = { x0: -0.9, y0: -1.7, w: 21.8, h: 34.1 };

function v2Run(seed = 1) {
  const r = new Run(seed);
  r.v2 = true;
  return r;
}
/** Clear challenges until `n` has been cleared, taking the first draft card and skipping the shop. */
function clearThrough(r: Run, n: number) {
  while (r.challenge <= n) {
    r.clear(3);
    if (r.challenge === n) return;
    r.phase = 'shop';
    r.next();
  }
}
function deckSim(r?: Run) {
  const run = r ?? v2Run();
  if (!run.sections.includes('upperDeck')) run.sections.push('upperDeck');
  const ev: SimEvent[] = [];
  const s = new Simulation({ preset: run.preset(), onEvent: e => ev.push(e) });
  s.rules.target = null;
  s.ready();
  return { s, ev, run };
}
function place(s: Simulation, x: number, y: number, vx: number, vy: number) {
  if (!s.balls.length) s.ready();
  const b = s.balls[0];
  b.body.setPosition({ x, y });
  b.body.setLinearVelocity({ x: vx, y: vy });
  b.prev = { x, y };
  b.pos = { x, y };
  return b;
}
const mod = (r: Run, key: string, target: string) => {
  const t = MODS.find(t => t.key === key)!;
  const m: Modifier = { note: t.name };
  if (t.add) m.add = t.add;
  if (t.mul) m.mul = t.mul;
  if (t.gen) m.gen = { ...t.gen };
  (r.mods[target] ??= []).push(m);
};

test('classic: no v2 flag → no sections ever, walls and layout exactly the original', () => {
  assert.equal(V2.enabled, false);
  const r = new Run(1);
  clearThrough(r, 6);
  assert.deepEqual(r.sections, []);
  assert.equal(r.preset().sections, undefined);
  for (const p of PRESETS) {
    const l = layoutFor(p);
    assert.deepEqual(l.sections, []);
    assert.deepEqual(wallChains(l), [{ pts: OUTER_WALL, loop: false }]);
    assert.deepEqual(l.bounds, { x0: 0, y0: 0, x1: 20, y1: 32 });
  }
});

test('unlock: Upper Deck is granted by the clear of C3 (before its draft), free, and persists', () => {
  assert.equal(SECTION_UNLOCKS.upperDeck, 3);
  const r = v2Run();
  clearThrough(r, 2);
  assert.deepEqual(r.sections, [], 'nothing at C1–C2');
  assert.equal(r.mountOpen('deck-l'), false);
  r.phase = 'shop';
  r.next();
  const money = r.money, power = r.powerUsed;
  r.clear(3);
  assert.deepEqual(r.sections, ['upperDeck']);
  assert.deepEqual(r.sectionGrant, { id: 'upperDeck', name: 'Upper Deck' });
  assert.equal(r.phase, 'draft', 'the draft follows, with the deck already open');
  assert.ok(r.mountOpen('deck-l') && r.mountOpen('deck-r'));
  assert.equal(r.powerUsed, power, 'no Power spent');
  assert.ok(r.money >= money, 'no money spent');
  assert.deepEqual(r.preset().sections, ['upperDeck']);
  r.phase = 'shop';
  r.next();
  assert.equal(r.sectionGrant, null, 'message shows once');
  assert.deepEqual(r.sections, ['upperDeck']);
});

test('mounts: deck placements only once unlocked; bonus bumper and cluster fit there', () => {
  const r = v2Run();
  r.maxPower = 99;
  assert.equal(r.installForTest('bonus-bumper', 'deck-l').ok, false);
  r.sections = ['upperDeck'];
  assert.ok(r.installForTest('bonus-bumper', 'deck-l').ok);
  assert.ok(r.installForTest('bumper-cluster', 'deck-r').ok);
  const l = layoutFor(r.preset());
  assert.ok(l.bumpers.some(b => b.id === 'bonus@deck-l'));
  assert.equal(l.bumpers.filter(b => b.id.endsWith('@deck-r')).length, 3);
});

test('physics: a ball anywhere in the deck returns to the table (no traps, no drain, no strike)', () => {
  const { s, ev } = deckSim();
  let worst = 0;
  for (let x = 1.7; x <= 18.3; x += 1.1) {
    for (const y of [-8, -6.3, -4.4, -1.6]) {
      for (const vx of [-5, 1.3, 5]) {
        place(s, x + 0.037, y, vx, 0);
        let t = 0;
        while (t < 15 && s.balls[0].pos.y < 1.2) {
          s.step(DT, makeControls());
          t += DT;
        }
        assert.ok(t < 15, `returned from (${x.toFixed(1)}, ${y})`);
        worst = Math.max(worst, t);
      }
    }
  }
  assert.equal(ev.filter(e => e.type === 'drain').length, 0, 'never drains from the deck');
  assert.ok(worst < 12, `worst return ${worst.toFixed(1)}s`);
});

test('physics: a strong shot goes up through a gap into the deck and comes back down', () => {
  const { s, ev } = deckSim();
  for (const x of [UPPER_DECK.gaps[0].x0 + 0.8, UPPER_DECK.gaps[1].x0 + 0.8]) {
    place(s, x, 6, 0, -20);
    let minY = 9, t = 0;
    while (t < 10 && (t < 0.3 || s.balls[0].pos.y < 1.5)) {
      s.step(DT, makeControls());
      t += DT;
      minY = Math.min(minY, s.balls[0].pos.y);
    }
    assert.ok(minY < -1.5, `rose into the deck (min y ${minY.toFixed(2)})`);
    assert.ok(s.balls[0].pos.y >= 1.5, 'back on the table');
  }
  assert.equal(ev.filter(e => e.type === 'drain').length, 0);
});

test('Home Run Ramp: a ball up the right alley rides it into the deck, scores once, hits the deck', () => {
  const { s, ev } = deckSim();
  place(s, 18.3, 8, 0, -13);
  for (let i = 0; i < 4 / DT; i++) s.step(DT, makeControls());
  const ramp = ev.filter(e => e.type === 'ramp' && e.id === HOME_RUN_RAMP.id) as Extract<SimEvent, { type: 'ramp' }>[];
  assert.deepEqual(ramp.map(e => e.phase), ['enter', 'complete']);
  assert.equal(ramp[1].points, HOME_RUN_RAMP.points);
  assert.equal(ev.filter(e => e.type === 'score' && e.id === HOME_RUN_RAMP.id).length, 1, 'one award');
  assert.ok(ev.some(e => e.type === 'machine' && e.id.startsWith('deck-bumper')), 'release crosses the deck bumpers');
  assert.equal(ev.filter(e => e.type === 'drain').length, 0);
  // a weak ball doesn't reach/clear it
  const w = deckSim();
  place(w.s, 18.3, 8, 0, -9);
  for (let i = 0; i < 3 / DT; i++) w.s.step(DT, makeControls());
  assert.ok(!w.ev.some(e => e.type === 'ramp' && e.phase === 'complete'));
});

test('modifiers: ALL-bumper cards reach the deck bumpers, THIS cards can target them, ALL-ramp reaches the Home Run Ramp', () => {
  const r = v2Run();
  const before = MODS.find(m => m.key === 'mvp')!.targets(r.board()).map(t => t.key);
  assert.ok(!before.includes('deck-bumper-c'));
  r.sections = ['upperDeck'];
  const after = MODS.find(m => m.key === 'mvp')!.targets(r.board()).map(t => t.key);
  for (const b of UPPER_DECK.bumpers) assert.ok(after.includes(b.id), b.id);
  assert.ok(MODS.find(m => m.key === 'grand-tour')!.targets(r.board()).length, 'Grand Tour offered with only the free ramp');
  assert.equal(MODS.find(m => m.key === 'express-track')!.targets(r.board()).length, 0, 'checkpoint card needs a checkpoint ramp');
  mod(r, 'bumper-crew', 'bumper:*');
  mod(r, 'mvp', 'deck-bumper-c');
  mod(r, 'grand-tour', 'ramp:*');
  const { s, ev } = deckSim(r);
  place(s, 10.3, -8, 0, 0);
  for (let i = 0; i < 1.2 / DT; i++) s.step(DT, makeControls());
  const hit = ev.find(e => e.type === 'score' && e.id === 'deck-bumper-c') as Extract<SimEvent, { type: 'score' }>;
  assert.ok(hit, 'center deck bumper hit');
  assert.equal(hit.modified, (UPPER_DECK.bumperPoints + 100) * 2);
  place(s, 18.3, 8, 0, -13);
  const m0 = s.rules.multTenths;
  for (let i = 0; i < 4 / DT && !ev.some(e => e.type === 'ramp' && e.phase === 'complete'); i++) s.step(DT, makeControls());
  assert.ok(ev.some(e => e.type === 'ramp' && e.phase === 'complete'), 'ride completed');
  assert.ok(s.rules.multTenths >= m0 + 2, 'Grand Tour paid on the Home Run Ramp');
  assert.deepEqual(r.dormantKeys(), [], 'deck fixture modifiers never dormant');
});

test('selling a deck install frees its mount and keeps the deck; its THIS modifier sleeps and wakes', () => {
  const r = v2Run();
  r.maxPower = 99;
  r.sections = ['upperDeck'];
  assert.ok(r.installForTest('bonus-bumper', 'deck-l').ok);
  mod(r, 'mvp', 'bonus@deck-l');
  r.phase = 'shop';
  const it = r.installed[0];
  const res = r.sell(it.uid);
  assert.ok(res.ok);
  assert.equal(r.mountStatus('deck-l').state, 'free');
  assert.deepEqual(r.sections, ['upperDeck']);
  assert.deepEqual(r.dormantKeys(), ['bonus@deck-l']);
  assert.ok(r.installForTest('bonus-bumper', 'deck-l').ok);
  assert.deepEqual(r.dormantKeys(), []);
});

test('camera: a deck ball zooms out within the floor; the roof fits; ball back on the table → 100%', () => {
  const { s } = deckSim();
  const cam = new Camera(VIEW);
  cam.bounds = { ...s.layout.bounds };
  assert.equal(cam.bounds.y0, UPPER_DECK.roofY);
  const roofBall = { x: 10, y: UPPER_DECK.roofY + config.ball.radius, vx: 0, vy: 0 };
  for (let i = 0; i < 120; i++) cam.update([roofBall], 1 / 60, false);
  assert.ok(cam.zoom >= CAMERA.minZoom && cam.zoom < 0.8, `zoom ${cam.zoom}`);
  assert.equal(cam.offscreen.length, 0, 'the whole deck fits inside the safe zoom');
  for (let i = 0; i < 240; i++) cam.update([{ x: 10, y: 20, vx: 0, vy: 6 }], 1 / 60, false);
  assert.equal(cam.zoom, 1);
});
