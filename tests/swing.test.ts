import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { config } from '../src/config.ts';
import { aimForBatAngle, batAngleAt, checkEligibility, exitVelocity, findContact, swingStateAt } from '../src/core/swing.ts';

const c = config.swing;
const hands = { x: 10, y: 25 };
const base = { dt: 1 / 240, hands, ballRadius: config.ball.radius, alreadyHitThisSwing: false };

test('bat arc: rest ~7 o\'clock, through ~3 o\'clock, finish ~11 o\'clock', () => {
  assert.ok(Math.abs(batAngleAt(-1) - c.restAngle) < 1e-9);
  assert.ok(Math.abs(Math.cos(batAngleAt(-1)) + 0.5) < 0.05 && Math.sin(batAngleAt(-1)) > 0.8, '7 o\'clock');
  assert.ok(Math.abs(batAngleAt(c.swingSeconds / 2)) < 0.05, '3 o\'clock mid-swing');
  const end = batAngleAt(c.swingSeconds);
  assert.ok(Math.cos(end) < -0.45 && Math.sin(end) < -0.8, '11 o\'clock');
  assert.equal(swingStateAt(c.swingSeconds + c.recoverSeconds / 2), 'recover');
  assert.ok(Math.abs(batAngleAt(10) - c.restAngle) < 1e-9, 'returns to rest');
});

test('resting and recovering bats never make contact', () => {
  const ball = { x: hands.x + 1.4, y: hands.y - 0.2 }, vel = { x: 0, y: 15 };
  assert.equal(findContact({ ...base, t: -5, ball, vel }), null);
  assert.equal(findContact({ ...base, t: c.swingSeconds + 0.05, ball, vel }), null);
  assert.equal(checkEligibility({ ...base, t: -5, ball, vel }), 'not-swinging');
});

test('upward-moving balls pass through even a mid-swing bat', () => {
  const ball = { x: hands.x + 1.4, y: hands.y }, vel = { x: 0, y: -12 };
  for (let t = 0; t <= c.swingSeconds; t += 1 / 240) assert.equal(findContact({ ...base, t, ball, vel }), null);
  assert.equal(checkEligibility({ ...base, t: 0.1, ball, vel }), 'moving-up');
});

test('a ball behind the batting line is not rescued', () => {
  // Well inside the bat's sweep (around 4-5 o'clock) but below the batting line.
  const ball = { x: hands.x + 1.0, y: hands.y + 1.15 }, vel = { x: 0, y: 10 };
  for (let t = 0; t <= c.swingSeconds; t += 1 / 240) assert.equal(findContact({ ...base, t, ball, vel }), null);
  // Same spot without the batting-line rule would have been hit:
  const noLine = { ...c, battingLine: 99 };
  let hit = false;
  for (let t = 0; t <= c.swingSeconds; t += 1 / 240) hit ||= !!findContact({ ...base, t, ball, vel }, noLine);
  assert.ok(hit, 'test ball is actually inside the bat sweep');
});

test('once per swing', () => {
  const ball = { x: hands.x + 1.5, y: hands.y - 0.1 }, vel = { x: 0, y: 15 };
  assert.equal(findContact({ ...base, t: c.swingSeconds / 2, ball, vel, alreadyHitThisSwing: true }), null);
});

test('aim continuum: late → right, center → up, early → left; equal speed', () => {
  const late = aimForBatAngle(c.centerAngle + c.aimHalfRange);
  const mid = aimForBatAngle(c.centerAngle);
  const early = aimForBatAngle(c.centerAngle - c.aimHalfRange);
  assert.ok(late > 0.5 && Math.abs(mid) < 1e-9 && early < -0.5);
  let prev = Infinity;
  for (let a = c.centerAngle + 1; a >= c.centerAngle - 1; a -= 0.05) {
    const aim = aimForBatAngle(a);
    assert.ok(aim <= prev + 1e-12, 'monotonic');
    prev = aim;
    const v = exitVelocity(aim);
    assert.ok(Math.abs(Math.hypot(v.x, v.y) - c.exitSpeed) < 1e-9, 'same speed everywhere');
    assert.ok(v.y < 0, 'always upward');
  }
});

test('the drawn bat is the hit envelope: a ball at the barrel is hit when the bat sweeps through it', () => {
  // ball sitting just above 3 o'clock at the sweet spot, falling
  const ball = { x: hands.x + c.length * 0.75, y: hands.y - 0.05 }, vel = { x: 0, y: 12 };
  let hit = null;
  for (let t = 0; t <= c.swingSeconds && !hit; t += 1 / 240) hit = findContact({ ...base, t, ball, vel });
  assert.ok(hit, 'contact');
  assert.ok(hit!.velocity.y < 0);
  // far outside the reach: never hit
  const far = { x: hands.x + c.length + 1.2, y: hands.y }, miss = [];
  for (let t = 0; t <= c.swingSeconds; t += 1 / 240) miss.push(findContact({ ...base, t, ball: far, vel }));
  assert.ok(miss.every(m => m === null));
});
