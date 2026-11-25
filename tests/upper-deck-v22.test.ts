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
import { DECK_RALLY, HOME_RUN_RAMP, UPPER_DECK } from '../src/machines/sections.ts';
const RX = DECK_RALLY.factor;
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

test('deck slings: two real slings on the deck corner diagonals, kick inward and up; only on the V2 deck', () => {
  const { s } = deck();
  const ds = s.layout.slings.filter(x => x.id.startsWith('deck-sling'));
  assert.deepEqual(ds.map(x => x.id), ['deck-sling-l', 'deck-sling-r']);
  for (const x of ds) {
    const inward = x.side === 'left' ? 1 : -1;
    assert.ok(x.kickDir.x * inward > 0.7 && x.kickDir.y < 0, `${x.id} kicks inward and up`);
    assert.ok(x.poly.every(p => p.y < UPPER_DECK.railY && p.y > UPPER_DECK.roofY), 'inside the deck');
    // on the sloped corner floor, clear of the exit: the last stretch before the gap stays open
    const gapEdge = x.side === 'left' ? UPPER_DECK.gaps[0].x0 : UPPER_DECK.gaps[1].x1;
    assert.ok(x.poly.every(p => Math.abs(p.x - gapEdge) > 0.6), `${x.id} leaves the exit open`);
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

// ───────── M2: Home Run 3,000 + per-ball Upper Deck Rally ─────────

/** Ride the Home Run Ramp to completion with ball `b` (default ball 0). */
function homeRun(s: Simulation, ev: SimEvent[], b = s.balls[0], speed = 18) {
  const rp = s.layout.ramps.find(r => r.def.id === HOME_RUN_RAMP.id)!;
  put(s, rp.mouth.x - rp.entryDir.x * 0.5, rp.mouth.y - rp.entryDir.y * 0.5, rp.entryDir.x * speed, rp.entryDir.y * speed, b);
  const n = ev.filter(e => e.type === 'deckRally' && e.phase === 'start').length;
  assert.ok(run(s, 6, () => ev.filter(e => e.type === 'deckRally' && e.phase === 'start').length > n), 'ride completed');
}
const scores = (ev: SimEvent[], id?: string) => ev.filter(e => e.type === 'score' && (!id || e.id === id)) as Extract<SimEvent, { type: 'score' }>[];
/** Drop a ball onto the top deck bumper and return its first score event on that bumper. */
function hitTop(s: Simulation, ev: SimEvent[], b = s.balls[0]) {
  const n0 = ev.length;
  put(s, 10.05, -8, 0, 0, b);
  run(s, 1.5, () => ev.slice(n0).some(e => e.type === 'score' && e.id === 'deck-bumper-t' && e.ball === b.id));
  return ev.slice(n0).find(e => e.type === 'score' && e.id === 'deck-bumper-t' && e.ball === b.id) as Extract<SimEvent, { type: 'score' }>;
}

test('Home Run completion pays 3,000 base once (through the multiplier once) and starts Rally for that ball', () => {
  assert.equal(HOME_RUN_RAMP.points, 3000);
  assert.equal(HOME_RUN_RAMP.checkpoints, undefined, 'no checkpoints');
  assert.equal(HOME_RUN_RAMP.powerCost, 0);
  const { s, ev } = deck();
  s.rules.multTenths = 30;
  homeRun(s, ev);
  const hr = scores(ev, HOME_RUN_RAMP.id);
  assert.equal(hr.length, 1);
  assert.equal(hr[0].base, 3000);
  assert.equal(hr[0].awarded, 9000);
  assert.equal(hr[0].deckRally, undefined, 'the completion itself is not a Rally contact');
  assert.equal(ev.filter(e => e.type === 'deckRally' && e.phase === 'start').length, 1);
  assert.ok(s.balls[0].deckRally);
});

test('a rolled-back entry pays nothing and starts no Rally', () => {
  const { s, ev } = deck();
  const rp = s.layout.ramps.find(r => r.def.id === HOME_RUN_RAMP.id)!;
  put(s, rp.mouth.x - rp.entryDir.x * 0.5, rp.mouth.y - rp.entryDir.y * 0.5, rp.entryDir.x * 6, rp.entryDir.y * 6);
  run(s, 4);
  assert.ok(ev.some(e => e.type === 'ramp' && e.phase === 'enter'));
  assert.ok(ev.some(e => e.type === 'ramp' && e.phase === 'rollback'));
  assert.equal(scores(ev, HOME_RUN_RAMP.id).length, 0);
  assert.ok(!ev.some(e => e.type === 'deckRally'));
  assert.equal(s.balls[0].deckRally, false);
});

test('Rally arithmetic: 200 base × Rally × global ×3 (600 without Rally); rallyGain reports only the extra', () => {
  // without Rally: a ball placed upstairs that never rode the ramp
  const a = deck();
  a.s.rules.multTenths = 30;
  const plain = hitTop(a.s, a.ev);
  assert.equal(plain.base, 200);
  assert.equal(plain.modified, 200);
  assert.equal(plain.awarded, 600);
  assert.equal(plain.deckRally, undefined);
  assert.equal(plain.rallyGain, undefined);
  // with Rally
  const b = deck();
  homeRun(b.s, b.ev);
  b.s.rules.multTenths = 30;
  const boosted = hitTop(b.s, b.ev);
  assert.equal(boosted.base, 200);
  assert.equal(boosted.modified, 200 * RX);
  assert.equal(boosted.awarded, 200 * RX * 3);
  assert.equal(boosted.deckRally, RX);
  assert.equal(boosted.rallyGain, 200 * RX * 3 - 600);
  assert.equal(b.s.rules.multTenths, 30, 'Rally never touches the global multiplier');
});

test('Rally covers deck slings and bought deck bumpers; stacks with THIS/ALL cards without double-counting', () => {
  const { s, ev } = deck([['bonus-bumper', 'deck-l']], 1, [['bumper-crew', 'bumper:*'], ['mvp', 'deck-bumper-t'], ['rubber', 'sling:*']]);
  homeRun(s, ev);
  const top = hitTop(s, ev);
  assert.equal(top.modified, (200 + 100) * 2 * RX, '(base + ALL) × THIS × Rally');
  // bought bonus bumper on the deck mount
  const n0 = ev.length;
  const bb = s.layout.bumpers.find(b => b.id === 'bonus@deck-l')!;
  put(s, bb.x + 0.03, bb.y - 1.6, 0, 0);
  run(s, 1.2, () => ev.slice(n0).some(e => e.type === 'score' && e.id === 'bonus@deck-l'));
  const bonus = ev.slice(n0).find(e => e.type === 'score' && e.id === 'bonus@deck-l') as any;
  assert.ok(bonus, 'bought deck bumper hit');
  assert.equal(bonus.deckRally, RX);
  assert.equal(bonus.modified, (300 + 100) * RX);
  // deck sling
  const sl = s.layout.slings.find(x => x.id === 'deck-sling-l')!;
  const mid = { x: (sl.face[0].x + sl.face[1].x) / 2, y: (sl.face[0].y + sl.face[1].y) / 2 };
  const n1 = ev.length;
  put(s, mid.x + 1.2, mid.y, -6, 0);
  run(s, 1, () => ev.slice(n1).some(e => e.type === 'score' && e.id === sl.id));
  const sling = ev.slice(n1).find(e => e.type === 'score' && e.id === sl.id) as any;
  assert.equal(sling.deckRally, RX);
  assert.equal(sling.modified, (UPPER_DECK.slings.points + 40) * RX, '(base + Live Rubber) × Rally');
});

test('Rally ends when the ball crosses back down through a gap (no flicker at release); going back up never re-arms it', () => {
  const { s, ev } = deck();
  homeRun(s, ev);
  run(s, 0.4);
  assert.ok(s.balls[0].deckRally, 'still active just after release');
  assert.ok(!ev.some(e => e.type === 'deckRally' && e.phase === 'end'));
  // send it down through the left gap
  const g = UPPER_DECK.gaps[0];
  put(s, (g.x0 + g.x1) / 2, -0.4, 0, 3);
  run(s, 1, () => ev.some(e => e.type === 'deckRally' && e.phase === 'end'));
  const end = ev.find(e => e.type === 'deckRally' && e.phase === 'end') as any;
  assert.equal(end.reason, 'returned');
  assert.ok(end.y > UPPER_DECK.railY, 'ended below the rail');
  assert.equal(s.balls[0].deckRally, false);
  // back upstairs without a ride: plain scoring
  s.rules.multTenths = 10;
  const again = hitTop(s, ev);
  assert.equal(again.deckRally, undefined);
  assert.equal(again.modified, 200);
  // a second ride re-arms it
  homeRun(s, ev);
  assert.equal(ev.filter(e => e.type === 'deckRally' && e.phase === 'start').length, 2);
  assert.equal(hitTop(s, ev).deckRally, RX);
});

test('no Rally on main-table parts; skimming the rail inside the hysteresis band does not end Rally', () => {
  const { s, ev } = deck();
  homeRun(s, ev);
  // hover around the rail line within the band
  for (const y of [UPPER_DECK.railY - 0.3, UPPER_DECK.railY + 0.3, UPPER_DECK.railY - 0.2]) {
    put(s, 4.75, y, 0, 0);
    s.step(DT, makeControls());
  }
  assert.ok(s.balls[0].deckRally, 'no flicker inside the band');
  // drop onto a main-table bumper: crossing ends Rally first, so the hit is plain
  const top = s.layout.bumpers.find(b => b.id === 'bumper-top-l')!;
  const n0 = ev.length;
  put(s, top.x + 0.05, top.y - 2, 0, 0);
  run(s, 1, () => ev.slice(n0).some(e => e.type === 'score' && e.id === top.id));
  const hit = ev.slice(n0).find(e => e.type === 'score' && e.id === top.id) as any;
  assert.ok(hit);
  assert.equal(hit.deckRally, undefined);
  assert.equal(hit.modified, top.points ?? config.bumper.points);
});

test('multiball: Rally belongs to the ball that rode; siblings and new balls never inherit it', () => {
  const { s, ev } = deck();
  (s as any).addBall(7.43, -8, 0, 0); // sibling upstairs, above the left diamond bumper
  const [a, b] = s.balls;
  homeRun(s, ev, a);
  assert.ok(a.deckRally && !b.deckRally);
  run(s, 1.2);
  const bHits = scores(ev).filter(e => e.ball === b.id && e.id.startsWith('deck-'));
  assert.ok(bHits.length, 'sibling scored upstairs');
  assert.ok(bHits.every(e => e.deckRally === undefined), 'sibling never ×2');
  const aTop = hitTop(s, ev, a);
  assert.equal(aTop.deckRally, RX);
  // a new ball (e.g. a splitter launch) starts without Rally
  (s as any).addBall(10, 20, 0, 0);
  assert.equal(s.balls[s.balls.length - 1].deckRally, false);
  // ids unique
  assert.equal(new Set(s.balls.map(x => x.id)).size, s.balls.length);
});

test('Rally ends on drain; every score reconciles to the scoreboard', () => {
  const { s, ev } = deck();
  s.rules.multTenths = 20;
  homeRun(s, ev);
  hitTop(s, ev);
  (s as any).drainBall(s.balls[0]);
  const end = ev.find(e => e.type === 'deckRally' && e.phase === 'end') as any;
  assert.equal(end.reason, 'drain');
  assert.ok(end.hits >= 1 && end.gained > 0);
  const total = scores(ev).reduce((n, e) => n + e.awarded, 0);
  assert.equal(total, s.rules.score);
  const gained = scores(ev).reduce((n, e) => n + (e.rallyGain ?? 0), 0);
  assert.equal(gained, end.gained, 'per-ball gain matches the score events');
});

test('corner slings never trap a ball: balls dropped all over the deck always drain back to the table', () => {
  let worst = 0;
  for (let i = 0; i < 24; i++) {
    const { s } = deck([], 100 + i);
    const x = 1.8 + (i % 8) * 2.3, y = -7 + Math.floor(i / 8) * 2.2;
    put(s, x, y, ((i * 7) % 11) - 5, ((i * 5) % 7) - 3);
    let t = 0;
    while (t < 45 && s.balls.length && s.balls[0].body.getPosition().y < UPPER_DECK.railY + 1) {
      s.step(DT, makeControls());
      t += DT;
    }
    worst = Math.max(worst, t);
    assert.ok(t < 45, `ball ${i} from (${x.toFixed(1)}, ${y.toFixed(1)}) still in the deck after 45 s`);
  }
  assert.ok(worst > 0);
});
