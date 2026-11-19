/**
 * Swing phase, hit eligibility and aim mapping. Pure functions, no physics engine.
 *
 * The bat is NOT a rigid body. A hit is a scripted gameplay contact that only exists during the
 * active forward swing. The contact envelope is the same capsule that is drawn on screen, so what
 * you see is what you hit.
 */
import { config } from '../config.ts';

type SwingCfg = typeof config.swing;
export type Vec = { x: number; y: number };

export type SwingState = 'rest' | 'active' | 'recover';

/** Timeline of one swing, given seconds since the swing button was pressed. */
export function swingStateAt(t: number, c: SwingCfg = config.swing): SwingState {
  if (t < 0) return 'rest';
  if (t <= c.swingSeconds) return 'active';
  if (t <= c.swingSeconds + c.recoverSeconds) return 'recover';
  return 'rest';
}

/** Mostly-linear ease so the bat is quick through the zone but still reads as a wind-up and follow-through. */
function swingEase(p: number) {
  const s = (1 - Math.cos(Math.PI * p)) / 2;
  return 0.45 * p + 0.55 * s;
}

/** Bat angle (radians, y-down) at time t since swing start: 7 o'clock → 3 o'clock → 11 o'clock, then back. */
export function batAngleAt(t: number, c: SwingCfg = config.swing): number {
  const state = swingStateAt(t, c);
  if (state === 'rest') return c.restAngle;
  if (state === 'active') return c.restAngle + (c.endAngle - c.restAngle) * swingEase(t / c.swingSeconds);
  // Recover: return the short way back over the top-left (purely visual; no collision).
  const p = (t - c.swingSeconds) / c.recoverSeconds;
  const e = 1 - (1 - p) * (1 - p);
  const back = c.restAngle - 2 * Math.PI; // same direction as 7 o'clock, unwrapped past 11
  return c.endAngle + (back - c.endAngle) * e;
}

/** Map bat angle at contact to outgoing aim (radians from straight up, + = right). */
export function aimForBatAngle(angle: number, c: SwingCfg = config.swing): number {
  const n = Math.max(-1, Math.min(1, (angle - c.centerAngle) / c.aimHalfRange));
  return n * c.maxAim;
}

/** Outgoing velocity for a given aim. Speed is identical for every valid contact. */
export function exitVelocity(aim: number, c: SwingCfg = config.swing): Vec {
  return { x: c.exitSpeed * Math.sin(aim), y: -c.exitSpeed * Math.cos(aim) };
}

function distToSegment(p: Vec, a: Vec, b: Vec) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby)));
  return { d: Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t)), t };
}

export type ContactInput = {
  /** Seconds since swing start at the END of this substep. */
  t: number;
  /** Substep length, used to sweep the bat between the previous and current angle. */
  dt: number;
  hands: Vec;
  ball: Vec;
  vel: Vec;
  ballRadius: number;
  alreadyHitThisSwing: boolean;
};
export type Contact = { angle: number; aim: number; velocity: Vec; along: number };

/** Why a contact did or didn't happen. Useful for tests and the debug overlay. */
export type Eligibility = 'ok' | 'not-swinging' | 'already-hit' | 'moving-up' | 'behind-line' | 'out-of-reach';

export function checkEligibility(i: ContactInput, c: SwingCfg = config.swing): Eligibility {
  if (swingStateAt(i.t, c) !== 'active') return 'not-swinging';
  if (i.alreadyHitThisSwing) return 'already-hit';
  if (i.vel.y < c.minDownSpeed) return 'moving-up';
  if (i.ball.y > i.hands.y + c.battingLine) return 'behind-line';
  return 'ok';
}

/**
 * Returns a contact if the ball is eligible and the bat sweeps through it during this substep.
 * The bat is swept between its previous and current angle in small increments so a fast bat
 * can't skip over the ball.
 */
export function findContact(i: ContactInput, c: SwingCfg = config.swing): Contact | null {
  if (checkEligibility(i, c) !== 'ok') return null;
  const t0 = Math.max(0, i.t - i.dt);
  const a0 = batAngleAt(t0, c), a1 = batAngleAt(i.t, c);
  const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 0.03));
  const reach = c.radius + i.ballRadius + c.tolerance;
  for (let k = 0; k <= steps; k++) {
    const angle = a0 + ((a1 - a0) * k) / steps;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const a = { x: i.hands.x + dir.x * c.minReach, y: i.hands.y + dir.y * c.minReach };
    const b = { x: i.hands.x + dir.x * c.length, y: i.hands.y + dir.y * c.length };
    const { d, t } = distToSegment(i.ball, a, b);
    if (d <= reach) {
      const aim = aimForBatAngle(angle, c);
      return { angle, aim, velocity: exitVelocity(aim, c), along: (c.minReach + t * (c.length - c.minReach)) / c.length };
    }
  }
  return null;
}
