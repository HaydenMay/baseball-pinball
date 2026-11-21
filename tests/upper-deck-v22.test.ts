/**
 * V2.2 Upper Deck: four-bumper diamond + two deck slings (M1), Home Run 3,000 + per-ball Upper Deck Rally (M2).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { config } from '../src/config.ts';
import { Simulation, type SimEvent } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { Run } from '../src/run/run.ts';
import { MODS } from '../src/run/catalog.ts';
import { layoutFor, type Sling } from '../src/physics/board.ts';
import { PRESETS } from '../src/machines/presets.ts';
import { HOME_RUN_RAMP, UPPER_DECK } from '../src/machines/sections.ts';
import type { Modifier } from '../src/machines/mechanisms.ts';

const DT = 1 / config.physicsHz;
const R = config.ball.radius;

function deck(parts: [string, string][] = [], seed = 1, mods: [string, string][] = []) {
  const r = new Run(1);
  r.maxPower = 99;
  r.sections = ['upperDeck'];
  for (const [k, m] of parts) assert.ok(r.installForTest(k, m).ok, `${k}@${m}`);
  for (const [key, target] of mods) {
    const t = MODS.find(t => t.key === key)!;
    const m: Modifier = { note: t.name };
    if (t.add) m.add = t.add;
    if (t.mul) m.mul = t.mul;
    if (t.gen) m.gen = { ...t.gen };
    (r.mods[target] ??= []).push(m);
  }
  const ev: SimEvent[] = [];
  const s = new Simulation({ preset: r.preset(), seed, onEvent: e => ev.push(e) });
  s.rules.target = null;
  s.ready();
  return { s, ev, r };
}
function put(s: Simulation, x: number, y: number, vx: number, vy: number, ball = s.balls[0]) {
  ball.body.setPosition({ x, y });
  ball.body.setLinearVelocity({ x: vx, y: vy });
  ball.prev = { x, y };
  ball.pos = { x, y };
  return ball;
}
const run = (s: Simulation, seconds: number, until?: () => boolean) => {
  for (let i = 0; i < seconds / DT; i++) {
    s.step(DT, makeControls());
    if (until?.()) return true;
  }
  return false;
};

// ───────── M1: geometry ─────────

test('diamond: four separated bumpers (top/left/right/lower), each gap passes a ball, clear of walls and gaps', () => {
  const bs = UPPER_DECK.bumpers;
  assert.deepEqual(bs.map(b => b.id), ['deck-bumper-t', 'deck-bumper-l', 'deck-bumper-r', 'deck-bumper-b']);
  const [t, l, r, b] = bs;
  assert.ok(t.y < l.y && t.y < r.y && b.y > l.y && b.y > r.y && l.x < t.x && r.x > t.x, 'staggered diamond');
  for (let i = 0; i < bs.length; i++)
    for (let j = i + 1; j < bs.length; j++) {
      const gap = Math.hypot(bs[i].x - bs[j].x, bs[i].y - bs[j].y) - bs[i].r - bs[j].r;
      assert.ok(gap > 2 * R + 0.3, `${bs[i].id}–${bs[j].id} gap ${gap.toFixed(2)}`);
    }
  for (const x of bs) {
    assert.ok(x.x - x.r - UPPER_DECK.wallX0 > 2 * R && UPPER_DECK.wallX1 - x.x - x.r > 2 * R);
    assert.ok(x.y - x.r - UPPER_DECK.roofY > 2 * R);
  }
  // lower bumper above the center divider peak with room for a ball
  assert.ok(UPPER_DECK.tentPeakY - (b.y + b.r) > 2 * R);
});

test('deck slings: two real slings on the deck walls, kick inward and up; only on the V2 deck', () => {
  const { s } = deck();
  const ds = s.layout.slings.filter(x => x.id.startsWith('deck-sling'));
  assert.deepEqual(ds.map(x => x.id), ['deck-sling-l', 'deck-sling-r']);
  for (const x of ds) {
    const inward = x.side === 'left' ? 1 : -1;
    assert.ok(x.kickDir.x * inward > 0.7 && x.kickDir.y < 0, `${x.id} kicks inward and up`);
    assert.ok(x.poly.every(p => p.y < 0 && p.y > UPPER_DECK.roofY), 'inside the deck');
    assert.notEqual(x.group, 'main');
  }
  // the two original lower slings are untouched and still share the 'main' debounce
  for (const p of PRESETS) {
    const l = layoutFor(p);
    assert.deepEqual(l.slings.map(x => x.id), ['sling-left', 'sling-right']);
    assert.ok(l.slings.every(x => x.group === undefined && x.points === undefined && x.kick === undefined));
  }
});

test('both deck slings are physically touched, score and kick the ball inward-up', () => {
  for (const side of ['l', 'r'] as const) {
    const { s, ev } = deck();
    const sl = s.layout.slings.find(x => x.id === `deck-sling-${side}`)!;
    const mid = { x: (sl.face[0].x + sl.face[1].x) / 2, y: (sl.face[0].y + sl.face[1].y) / 2 };
    const inward = side === 'l' ? 1 : -1;
    put(s, mid.x + inward * 1.2, mid.y, -inward * 6, 0);
    const hit = run(s, 1, () => ev.some(e => e.type === 'machine' && e.id === sl.id));
    assert.ok(hit, `${sl.id} touched`);
    run(s, 2 * DT);
    const v = s.balls[0].body.getLinearVelocity();
    assert.ok(v.x * inward > 8 && v.y < 0, `${sl.id} kicked inward-up (${v.x.toFixed(1)}, ${v.y.toFixed(1)})`);
    const sc = ev.find(e => e.type === 'score' && e.id === sl.id) as any;
    assert.equal(sc.base, UPPER_DECK.slings.points);
  }
});

test('sling debounce is per group: a deck sling hit right after a lower sling hit still counts', () => {
  const { s, ev } = deck();
  const low = s.layout.slings.find(x => x.id === 'sling-left')!;
  const dl = s.layout.slings.find(x => x.id === 'deck-sling-l')!;
  // two balls: one into the lower-left sling, one into the left deck sling, same instant
  s.spawnBall(5, 5, 0, 0); // clears, then one ball
  (s as any).addBall(5, 6, 0, 0); // a second live ball (multiball)
  const [b1, b2] = s.balls;
  const lm = { x: (low.face[0].x + low.face[1].x) / 2, y: (low.face[0].y + low.face[1].y) / 2 };
  const dm = { x: (dl.face[0].x + dl.face[1].x) / 2, y: (dl.face[0].y + dl.face[1].y) / 2 };
  put(s, lm.x + low.kickDir.x * 0.6, lm.y + low.kickDir.y * 0.6, -low.kickDir.x * 6, -low.kickDir.y * 6, b1);
  put(s, dm.x + 0.6, dm.y, -6, 0, b2);
  const t0 = s.time;
  run(s, 0.3);
  const hits = ev.filter(e => e.type === 'machine' && e.kind === 'sling') as any[];
  const low1 = hits.find(h => h.id === 'sling-left'), deck1 = hits.find(h => h.id === 'deck-sling-l');
  assert.ok(low1 && deck1, hits.map(h => h.id).join());
  void t0;
  // both inside one shared-cooldown window: the old global debounce would have dropped the second
  const times = ev.map((e, i) => ({ e, i })).filter(x => x.e.type === 'machine' && (x.e as any).kind === 'sling');
  assert.ok(times.length >= 2);
});

test('deck mounts still fit beside the diamond and slings (cluster and bonus bumper, both sides)', () => {
  for (const parts of [[['bumper-cluster', 'deck-l'], ['bonus-bumper', 'deck-r']], [['bonus-bumper', 'deck-l'], ['bumper-cluster', 'deck-r']]] as [string, string][][]) {
    const { s } = deck(parts);
    const deckParts = s.layout.bumpers.filter(b => b.y < 0);
    for (let i = 0; i < deckParts.length; i++)
      for (let j = i + 1; j < deckParts.length; j++) {
        const a = deckParts[i], b = deckParts[j];
        if (a.id.split('@')[1] && a.id.split('@')[1] === b.id.split('@')[1]) continue; // same cluster
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
        assert.ok(gap > 2 * R, `${a.id}–${b.id} gap ${gap.toFixed(2)}`);
      }
    const slings = s.layout.slings.filter((x: Sling) => x.id.startsWith('deck-sling'));
    for (const b of deckParts)
      for (const sl of slings) for (const p of sl.poly) assert.ok(Math.hypot(b.x - p.x, b.y - p.y) - b.r > 2 * R, `${b.id} clear of ${sl.id}`);
    const rp = s.layout.ramps.find(r => r.def.id === HOME_RUN_RAMP.id)!;
    for (const b of deckParts) assert.ok(Math.hypot(b.x - rp.exit.x, b.y - rp.exit.y) - b.r > R + 0.05, `release clear of ${b.id}`);
  }
});
