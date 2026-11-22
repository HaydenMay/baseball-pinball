/** Player-route batting rules: whiff lockout, swing buffer, sweet spot, foul ball (src/core/play-rules.ts). */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { config } from '../src/config.ts';
import { Simulation } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { PLAY } from '../src/core/play-rules.ts';

const DT = 1 / config.physicsHz;
const s0 = config.swing;
const cycle = s0.swingSeconds + s0.recoverSeconds + s0.cooldownSeconds;
function withPlay<T>(on: boolean, f: () => T): T {
  const was = PLAY.enabled;
  PLAY.enabled = on;
  try {
    return f();
  } finally {
    PLAY.enabled = was;
  }
}
function steps(s: Simulation, seconds: number, c = makeControls()) {
  for (let i = 0; i < Math.round(seconds / DT); i++) s.step(DT, c);
}

test('off by default: frozen routes keep the original swing cadence and strikes', () => {
  const s = new Simulation();
  s.ready();
  assert.ok(s.swing());
  steps(s, cycle + 0.01);
  assert.ok(s.swing(), 'a whiff costs nothing when PLAY is off');
  assert.equal(s.events.filter(e => e.type === 'whiff').length, 0);
});

test('a whiff adds the lockout before the next swing and reports WHIFF once', () =>
  withPlay(true, () => {
    const s = new Simulation();
    s.ready();
    s.spawnBall(6, 2, 0, 0); // far up the table: the swing cannot touch it
    assert.ok(s.swing());
    steps(s, cycle + 0.01);
    assert.equal(s.events.filter(e => e.type === 'whiff').length, 1);
    assert.equal(s.swing(), false, 'still locked out');
    steps(s, PLAY.whiffLockout);
    assert.ok(s.swing(), 'free again after the lockout');
  }));

test('a swing pressed just before the bat is ready is buffered, not dropped', () =>
  withPlay(true, () => {
    const s = new Simulation();
    s.ready();
    s.spawnBall(6, 2, 0, 0);
    const c = makeControls();
    s.swing();
    steps(s, cycle + PLAY.whiffLockout - PLAY.swingBuffer / 2, c);
    const before = s.swingId;
    c.swingPressed = true;
    s.step(DT, c);
    assert.equal(s.swingId, before, 'not yet');
    steps(s, PLAY.swingBuffer, c);
    assert.equal(s.swingId, before + 1, 'buffered swing fired');
  }));

test('sweet spot: a centered contact pays the bonus and flags the bat event', () =>
  withPlay(true, () => {
    let sweet = 0, normal = 0;
    for (let start = 0.3; start <= 1.0; start += 0.01) {
      const s = new Simulation();
      s.ready();
      let swung = false;
      for (let i = 0; i < 2.2 / DT && s.ball; i++) {
        if (!swung && s.time >= start) { s.swing(); swung = true; }
        s.step(DT, makeControls());
      }
      const bat = s.events.find(e => e.type === 'bat');
      if (!bat || bat.type !== 'bat') continue;
      const bonus = s.events.some(e => e.type === 'score' && e.id === 'sweet-spot');
      assert.equal(!!bat.sweet, bonus);
      assert.equal(!!bat.sweet, Math.abs(bat.contact.angle - s0.centerAngle) <= PLAY.sweetSpot.angle);
      if (bat.sweet) sweet++; else normal++;
    }
    assert.ok(sweet >= 1 && normal > sweet, `sweet ${sweet} vs normal ${normal}: a narrow window inside the contact window`);
  }));

test('foul ball: the first untouched drain of a challenge is free, the second is a strike', () =>
  withPlay(true, () => {
    const s = new Simulation();
    s.ready();
    steps(s, 3);
    const d1 = s.events.find(e => e.type === 'drain');
    assert.ok(d1 && d1.type === 'drain' && d1.foul && !d1.strike);
    assert.equal(s.rules.strikes, 0);
    assert.equal(s.rules.phase, 'ready');
    s.ready();
    steps(s, 3);
    assert.equal(s.rules.strikes, 1);
    // carried across a save/resume within the challenge
    assert.equal(s.carryState().foulsLeft, 0);
  }));

test('foul ball: a pitch that touched the bat is a normal strike', () =>
  withPlay(true, () => {
    const s = new Simulation();
    s.ready();
    let swung = false;
    for (let i = 0; i < 25 / DT && s.rules.phase === 'live'; i++) {
      if (!swung && s.time >= 0.62) { s.swing(); swung = true; }
      s.step(DT, makeControls());
    }
    assert.ok(s.events.some(e => e.type === 'bat'), 'connected');
    if (s.rules.phase === 'ready') assert.equal(s.rules.strikes, 1);
  }));
