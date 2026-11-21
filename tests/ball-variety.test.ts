/**
 * V2.1 ball variety: seeded per-release spreads on scripted exits only. Batting, bumpers and walls untouched;
 * scoring untouched; same seed → same outcome; original-map mechanisms keep their exact old behavior.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { config } from '../src/config.ts';
import { Simulation, type SimEvent } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { Run } from '../src/run/run.ts';
import { GLOVE_EJECT_SPREAD, LOOP_EXIT_SPREAD, MACHINES, OVERPASS_EXIT_SPREAD, TURBO_EXIT_SPREAD } from '../src/run/catalog.ts';
import { PRESETS } from '../src/machines/presets.ts';
import { HOME_RUN_RAMP, UPPER_DECK } from '../src/machines/sections.ts';
import { SCOOP_EJECT_SPREAD, type RampDef, type ScoopDef } from '../src/machines/mechanisms.ts';
import { CAMERA, Camera, cameraBalls } from '../src/view/camera.ts';

const DT = 1 / config.physicsHz;
const VIEW = { x0: -0.9, y0: -1.7, w: 21.8, h: 34.1 };

function mk(parts: [string, string][], seed: number, deck = true) {
  const r = new Run(1);
  r.maxPower = 99;
  if (deck) r.sections = ['upperDeck'];
  for (const [k, m] of parts) assert.ok(r.installForTest(k, m).ok, `${k}@${m}`);
  const ev: SimEvent[] = [];
  const s = new Simulation({ preset: r.preset(), seed, onEvent: e => ev.push(e) });
  s.rules.target = null;
  s.ready();
  return { s, ev };
}
function enterRamp(s: Simulation, id: string, speed = 18) {
  const rp = s.layout.ramps.find(r => r.def.id === id)!;
  const b = s.balls[0];
  const at = { x: rp.mouth.x - rp.entryDir.x * 0.5, y: rp.mouth.y - rp.entryDir.y * 0.5 };
  b.body.setPosition(at);
  b.body.setLinearVelocity({ x: rp.entryDir.x * speed, y: rp.entryDir.y * speed });
  b.prev = { ...at };
  b.pos = { ...at };
  return b;
}
/** Run until the ride completes; returns the ball's field velocity right after release. */
function rideAndRelease(s: Simulation, ev: SimEvent[], id: string) {
  for (let i = 0; i < 6 / DT; i++) {
    s.step(DT, makeControls());
    if (ev.some(e => e.type === 'ramp' && e.phase === 'complete' && e.id === id)) break;
  }
  const b = s.balls[0];
  if (b.mode === 'drop') return { x: b.drop!.v.x, y: b.drop!.v.y };
  const v = b.body.getLinearVelocity();
  return { x: v.x, y: v.y };
}

test('only scripted exits opt in; every original-map ramp/scoop keeps its old fixed/±0.1 rad behavior', () => {
  for (const p of PRESETS)
    for (const m of p.mechanisms) {
      if (m.type === 'ramp') assert.equal((m as RampDef).exitSpread, undefined, `${p.id} ${m.id}`);
      if (m.type === 'scoop') assert.equal((m as ScoopDef).ejectSpread, undefined, `${p.id} ${m.id}`);
    }
  assert.deepEqual(SCOOP_EJECT_SPREAD, { angle: 0.1, speed: 0.08 });
  const def = (k: string) => Object.values(MACHINES.find(m => m.key === k)!.at)[0] as RampDef[] | RampDef;
  const first = (k: string) => (Array.isArray(def(k)) ? (def(k) as RampDef[])[0] : (def(k) as RampDef));
  assert.equal(first('turbo-ramp').exitSpread, TURBO_EXIT_SPREAD);
  assert.equal(first('bridge-ramp').exitSpread, OVERPASS_EXIT_SPREAD);
  assert.equal(first('long-loop').exitSpread, LOOP_EXIT_SPREAD);
  assert.ok(HOME_RUN_RAMP.exitSpread);
  // modest, named, bounded
  for (const sp of [TURBO_EXIT_SPREAD, OVERPASS_EXIT_SPREAD, LOOP_EXIT_SPREAD, GLOVE_EJECT_SPREAD, HOME_RUN_RAMP.exitSpread!]) {
    assert.ok(sp.angle > 0 && sp.angle <= 0.6, `angle ${sp.angle}`);
    assert.ok(sp.speed > 0 && sp.speed <= 0.2, `speed ${sp.speed}`);
  }
});

test('seed replay: same seed → identical release and path; different seeds → different releases', () => {
  const run = (seed: number) => {
    const { s, ev } = mk([], seed);
    enterRamp(s, HOME_RUN_RAMP.id);
    const v = rideAndRelease(s, ev, HOME_RUN_RAMP.id);
    for (let i = 0; i < 1 / DT; i++) s.step(DT, makeControls());
    return { v, p: { ...s.balls[0].pos }, hits: ev.filter(e => e.type === 'machine').map(e => (e as any).id).join() };
  };
  assert.deepEqual(run(7), run(7));
  const vs = [1, 2, 3, 4, 5, 6].map(sd => run(sd).v);
  const keys = new Set(vs.map(v => `${v.x.toFixed(3)},${v.y.toFixed(3)}`));
  assert.ok(keys.size >= 5, 'seeds give different releases');
});

test('RNG draw order: exactly two draws per completed spread ride, none for the ride itself', () => {
  const { s, ev } = mk([], 99);
  enterRamp(s, HOME_RUN_RAMP.id);
  rideAndRelease(s, ev, HOME_RUN_RAMP.id);
  const after = s.random();
  const ref = new Simulation({ seed: 99 });
  ref.random();
  ref.random();
  assert.equal(after, ref.random());
});

test('Home Run: rides spread across the deck diamond and slings; no drains; one award per ride', () => {
  const firsts = new Map<string, number>(), touched = new Set<string>();
  const N = 60;
  for (let i = 0; i < N; i++) {
    const { s, ev } = mk([], i + 1);
    enterRamp(s, HOME_RUN_RAMP.id, 14 + (i % 7));
    const v = rideAndRelease(s, ev, HOME_RUN_RAMP.id);
    const sp = Math.hypot(v.x, v.y);
    assert.ok(sp >= HOME_RUN_RAMP.exitMin * (1 - HOME_RUN_RAMP.exitSpread!.speed) - 1e-6 && sp <= HOME_RUN_RAMP.exitMax * (1 + HOME_RUN_RAMP.exitSpread!.speed) + 1e-6);
    const n0 = ev.length;
    for (let k = 0; k < 30 / DT && s.balls[0]?.pos.y < 1.2; k++) s.step(DT, makeControls());
    const deck = ev.slice(n0).filter(e => e.type === 'machine' && (e as any).id.startsWith('deck-')) as any[];
    if (deck[0]) firsts.set(deck[0].id, (firsts.get(deck[0].id) ?? 0) + 1);
    for (const d of deck) touched.add(d.id);
    assert.equal(ev.filter(e => e.type === 'drain').length, 0);
    assert.equal(ev.filter(e => e.type === 'score' && e.id === HOME_RUN_RAMP.id).length, 1);
    assert.equal((ev.find(e => e.type === 'score' && e.id === HOME_RUN_RAMP.id) as any).base, HOME_RUN_RAMP.points);
  }
  for (const b of UPPER_DECK.bumpers) assert.ok(touched.has(b.id), `${b.id} reached`);
  assert.ok(touched.has('deck-sling-l') && touched.has('deck-sling-r'), 'both deck slings reached');
  assert.ok(firsts.size >= 3, `first contacts vary (${[...firsts.keys()]})`);
  assert.ok(Math.max(...firsts.values()) < N * 0.85, 'no single first contact takes everything');
  assert.equal(UPPER_DECK.bumpers.length, 4);
});

test('Turbo keeps feeding the upper bumpers; checkpoint scoring unchanged under exit variety', () => {
  let right = 0;
  const N = 30;
  for (let i = 0; i < N; i++) {
    const { s, ev } = mk([['turbo-ramp', 'orbit-l']], i + 1, false);
    enterRamp(s, 'ramp@orbit-l', 16 + (i % 5));
    rideAndRelease(s, ev, 'ramp@orbit-l');
    const cps = ev.filter(e => e.type === 'rampCheckpoint' || (e.type === 'score' && e.id.startsWith('ramp@orbit-l')));
    assert.equal(ev.filter(e => e.type === 'score' && e.id.startsWith('ramp@orbit-l')).length, 8, 'eight checkpoints, once each');
    assert.ok(cps.length);
    const n0 = ev.length;
    for (let k = 0; k < 1.5 / DT; k++) s.step(DT, makeControls());
    const m = ev.slice(n0).find(e => e.type === 'machine' && (e as any).kind !== 'wall') as any;
    if (m?.id === 'bumper-right') right++;
  }
  assert.ok(right >= N * 0.8, `Turbo → right bumper ${right}/${N}`);
});

test('Overpass / Long Loop drops vary but never drain before reaching the bat zone', () => {
  for (const [key, mount, id] of [['bridge-ramp', 'bridge', 'ramp@bridge'], ['long-loop', 'loop-r', 'loop@loop-r']] as const) {
    const xs: number[] = [];
    for (let i = 0; i < 24; i++) {
      const { s, ev } = mk([[key, mount]], i + 1);
      enterRamp(s, id, 20);
      rideAndRelease(s, ev, id);
      let k = 0;
      for (; k < 6 / DT && s.balls.length && s.balls[0].pos.y < 21; k++) s.step(DT, makeControls());
      assert.ok(s.balls.length && s.balls[0].pos.y >= 21, `${id} seed ${i + 1} reaches the bat zone`);
      assert.equal(ev.filter(e => e.type === 'drain').length, 0);
      xs.push(s.balls[0].pos.x);
    }
    assert.ok(Math.max(...xs) - Math.min(...xs) > 1.5, `${id} arrivals spread (${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)})`);
  }
});

test('Glove relaunch stays inside its named spread and keeps catch/eject scoring', () => {
  const angles: number[] = [];
  for (let i = 0; i < 40; i++) {
    const { s, ev } = mk([['glove-scoop', 'pocket-r']], i + 1, false);
    const sc = s.layout.scoops[0];
    (s as any).catchInScoop(s.balls[0], sc);
    for (let k = 0; k < (sc.holdSeconds + 0.02) / DT; k++) s.step(DT, makeControls());
    const v = s.balls[0].body.getLinearVelocity();
    const a = Math.atan2(v.y, v.x), sp = Math.hypot(v.x, v.y);
    assert.ok(Math.abs(a - sc.ejectAngle) <= GLOVE_EJECT_SPREAD.angle + 0.05, `angle ${a}`);
    assert.ok(sp >= sc.ejectSpeed * (1 - GLOVE_EJECT_SPREAD.speed) - 0.6 && sp <= sc.ejectSpeed * (1 + GLOVE_EJECT_SPREAD.speed) + 0.1, `speed ${sp}`);
    assert.equal(ev.filter(e => e.type === 'scoop' && e.phase === 'catch').length, 1);
    assert.equal(ev.filter(e => e.type === 'score' && e.id.startsWith('scoop')).length, 1, 'catch pays once');
    angles.push(a);
  }
  assert.ok(Math.max(...angles) - Math.min(...angles) > GLOVE_EJECT_SPREAD.angle, 'uses the spread');
});

test('multiball with the deck: splitter launches get unique ids, independent paths, calm camera', () => {
  const { s, ev } = mk([['splitter', 'center-r']], 5);
  const cam = new Camera(VIEW);
  cam.bounds = { ...s.layout.bounds };
  // one ball up in the deck, then two launches
  const b0 = s.balls[0];
  b0.body.setPosition({ x: 10.4, y: -7 });
  b0.body.setLinearVelocity({ x: 0, y: 0 });
  b0.prev = b0.pos = { x: 10.4, y: -7 };
  const st = s.splitters.get(s.layout.splitters[0].id)!;
  let zoomSteps = 0, last = 1;
  for (let i = 0; i < 4 / DT; i++) {
    if (i === 10 || i === Math.round(1.2 / DT)) {
      st.launchAt = s.time;
      st.readyAt = 0;
    }
    s.step(DT, makeControls());
    if (i % 4 === 0) {
      cam.update(cameraBalls(s), 4 * DT, false);
      if (Math.abs(cam.zoom - last) > 0.05) zoomSteps++;
      last = cam.zoom;
      assert.ok(cam.zoom >= CAMERA.minZoom && cam.zoom <= 1);
    }
  }
  const ids = s.balls.map(b => b.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ball ids');
  assert.ok(ev.filter(e => e.type === 'multiball').length >= 1);
  assert.ok(zoomSteps <= 6, `no camera thrash (${zoomSteps} big steps)`);
  if (s.balls.length >= 2) assert.notDeepEqual(s.balls[0].pos, s.balls[1].pos);
});
