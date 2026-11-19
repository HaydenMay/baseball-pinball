/**
 * Headless game simulation: planck world, ball, batter, scripted swing contact, scoring events.
 * No DOM. Runs identically in the browser and in node tests.
 */
import * as P from 'planck';
import { config } from '../config.ts';
import { GameRules } from '../core/rules.ts';
import { batAngleAt, findContact, swingStateAt, type Contact } from '../core/swing.ts';
import type { Controls } from '../core/input.ts';
import { buildBoard, type FixtureData, type Sling, type Bumper } from './board.ts';

export type SimEvent =
  | { type: 'machine'; kind: FixtureData['kind']; id: string; x: number; y: number; points: number; nx: number; ny: number }
  | { type: 'bat'; contact: Contact; x: number; y: number }
  | { type: 'swing' }
  | { type: 'serve' }
  | { type: 'drain'; x: number; strike: boolean; side: 'left' | 'center' | 'right' };

export type SimOptions = { onEvent?: (e: SimEvent) => void };

export class Simulation {
  world: P.World;
  rules = new GameRules();
  ball: P.Body | null = null;
  batterX: number = config.batter.startX;
  /** Simulation clock (seconds). */
  time = 0;
  swingStart = -100;
  swingId = 0;
  hitSwingId = -1;
  events: SimEvent[] = [];
  private onEvent?: (e: SimEvent) => void;
  private pendingKicks: { kind: 'bumper' | 'sling'; ref: unknown }[] = [];
  private lastSlingKick = -10;
  private stillTime = 0;

  constructor(opts: SimOptions = {}) {
    this.onEvent = opts.onEvent;
    this.world = new P.World({ gravity: P.Vec2(0, config.gravity) });
    buildBoard(this.world);
    this.world.on('begin-contact', c => this.beginContact(c));
  }

  emit(e: SimEvent) {
    this.events.push(e);
    if (this.events.length > 200) this.events.shift();
    this.onEvent?.(e);
  }

  get hands() {
    return { x: this.batterX, y: config.batter.handsY };
  }

  /** batterX is the hands (bat pivot). The body is drawn this far to the left. */
  get batterBodyX() {
    return this.batterX - config.batter.handsOffsetX;
  }

  get swingT() {
    return this.time - this.swingStart;
  }

  get batAngle() {
    return batAngleAt(this.swingT);
  }

  /** Player pressed Ready: serve exactly one straight, centered pitch. */
  ready(): boolean {
    if (!this.rules.ready()) return false;
    this.batterX = config.batter.startX;
    this.swingStart = -100;
    this.spawnBall(config.pitch.x, config.pitch.y, 0, config.pitch.speed);
    this.emit({ type: 'serve' });
    return true;
  }

  spawnBall(x: number, y: number, vx: number, vy: number) {
    if (this.ball) this.world.destroyBody(this.ball);
    const b = this.world.createDynamicBody({ position: P.Vec2(x, y), bullet: true, linearDamping: config.ball.linearDamping, fixedRotation: true });
    b.createFixture(P.Circle(config.ball.radius), { density: 1, restitution: config.ball.restitution, friction: 0 });
    b.setLinearVelocity(P.Vec2(vx, vy));
    this.ball = b;
    this.stillTime = 0;
    return b;
  }

  swing() {
    if (this.rules.phase !== 'live') return false;
    const s = config.swing;
    if (this.swingT < s.swingSeconds + s.recoverSeconds + s.cooldownSeconds) return false;
    this.swingStart = this.time;
    this.swingId++;
    this.emit({ type: 'swing' });
    return true;
  }

  private beginContact(c: P.Contact) {
    if (!this.ball) return;
    const fa = c.getFixtureA(), fb = c.getFixtureB();
    const other = fa.getBody() === this.ball ? fb : fb.getBody() === this.ball ? fa : null;
    if (!other) return;
    const d = other.getUserData() as FixtureData | null;
    if (!d) return;
    const pos = this.ball.getPosition();
    const wm = c.getWorldManifold(null);
    let nx = 0, ny = 0;
    if (wm) {
      // normal points from A to B; we want it pointing toward the ball
      const s = fa.getBody() === this.ball ? -1 : 1;
      nx = wm.normal.x * s;
      ny = wm.normal.y * s;
    }
    let points = 0;
    if (d.kind === 'bumper') {
      points = config.bumper.points;
      this.pendingKicks.push({ kind: 'bumper', ref: d.ref });
    } else if (d.kind === 'target') points = config.target.points;
    else if (d.kind === 'jackpot') points = config.jackpot.points;
    else if (d.kind === 'lane') points = config.lane.points;
    else if (d.kind === 'sling') {
      if (this.time - this.lastSlingKick < config.sling.cooldown) return;
      this.lastSlingKick = this.time;
      points = config.sling.points;
      this.pendingKicks.push({ kind: 'sling', ref: d.ref });
    }
    if (points) this.rules.addScore(points);
    this.emit({ type: 'machine', kind: d.kind, id: d.id, x: pos.x, y: pos.y, points, nx, ny });
  }

  /** Advance one fixed physics step. */
  step(dt: number, controls?: Controls) {
    this.time += dt;
    const b = config.batter;
    if (controls) {
      if (controls.swingPressed) {
        this.swing();
        controls.swingPressed = false;
      }
      if (this.rules.phase === 'live') {
        this.batterX += controls.moveAxis * b.moveSpeed * dt + controls.dragDelta;
      }
      controls.dragDelta = 0;
      this.batterX = Math.max(b.minX, Math.min(b.maxX, this.batterX));
    }
    if (!this.ball) return;

    this.world.step(dt, 10, 8);
    const ball = this.ball;

    // Pop bumper and slingshot kicks are applied after the solver so they aren't overwritten.
    for (const k of this.pendingKicks.splice(0)) {
      const v = ball.getLinearVelocity();
      if (k.kind === 'bumper') {
        const m = k.ref as Bumper, p = ball.getPosition();
        let nx = p.x - m.x, ny = p.y - m.y;
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l;
        const vn = v.x * nx + v.y * ny;
        const tx = v.x - vn * nx, ty = v.y - vn * ny;
        const out = Math.max(config.bumper.kick, Math.abs(vn) * 0.6 + config.bumper.kick * 0.6);
        ball.setLinearVelocity(P.Vec2(tx * 0.8 + nx * out, ty * 0.8 + ny * out));
      } else {
        const s = k.ref as Sling;
        const along = v.x * -s.kickDir.y + v.y * s.kickDir.x; // keep a bit of sideways motion
        ball.setLinearVelocity(P.Vec2(s.kickDir.x * config.sling.kick - s.kickDir.y * along * 0.15, s.kickDir.y * config.sling.kick + s.kickDir.x * along * 0.15));
      }
    }

    // Scripted bat contact.
    const pos = ball.getPosition(), vel = ball.getLinearVelocity();
    const contact = findContact({ t: this.swingT, dt, hands: this.hands, ball: pos, vel, ballRadius: config.ball.radius, alreadyHitThisSwing: this.hitSwingId === this.swingId });
    if (contact) {
      this.hitSwingId = this.swingId;
      ball.setLinearVelocity(P.Vec2(contact.velocity.x, contact.velocity.y));
      this.rules.batHit();
      this.rules.addScore(config.batHitPoints);
      this.emit({ type: 'bat', contact, x: pos.x, y: pos.y });
    }

    // Speed cap (keeps tunneling impossible and the ball readable).
    const v2 = ball.getLinearVelocity(), sp = Math.hypot(v2.x, v2.y);
    if (sp > config.ball.maxSpeed) ball.setLinearVelocity(P.Vec2((v2.x / sp) * config.ball.maxSpeed, (v2.y / sp) * config.ball.maxSpeed));

    // Anti-trap: a ball that sits still gets a small nudge.
    if (sp < 0.6) this.stillTime += dt;
    else this.stillTime = 0;
    if (this.stillTime > config.ball.stuckSeconds) {
      ball.setLinearVelocity(P.Vec2((pos.x < 10 ? 1 : -1) * 3, -2));
      this.stillTime = 0;
    }

    // Any exit through the bottom of the table is a drain, wherever it happens.
    if (pos.y > config.drainY || pos.x < -1 || pos.x > config.table.width + 1 || pos.y < -1) this.drainBall(pos.x);
  }

  private drainBall(x: number) {
    if (!this.ball) return;
    this.world.destroyBody(this.ball);
    this.ball = null;
    this.pendingKicks.length = 0;
    const strike = this.rules.drain();
    const side = x < 8.2 ? 'left' : x > 11.8 ? 'right' : 'center';
    this.emit({ type: 'drain', x, strike, side });
  }

  get swingState() {
    return swingStateAt(this.swingT);
  }
}
