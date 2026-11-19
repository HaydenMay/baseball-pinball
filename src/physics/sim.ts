/**
 * Headless game simulation: planck world, balls, batter, scripted swing contact, mechanisms and
 * scoring events. No DOM. Runs identically in the browser and in node tests.
 *
 * Balls are in one of three modes:
 *  - field: a normal planck body on the playfield
 *  - ramp:  riding a raised ramp (body inactive, position driven along the ramp path)
 *  - held:  caught in a scoop (body inactive), released after the hold time
 * Every ball in any mode counts as live. Only the drain of the LAST live ball is a strike.
 */
import * as P from 'planck';
import { config } from '../config.ts';
import { GameRules } from '../core/rules.ts';
import { batAngleAt, findContact, swingStateAt, type Contact } from '../core/swing.ts';
import type { Controls } from '../core/input.ts';
import { buildBoard, layoutFor, type FixtureData, type Layout, type Sling, type Bumper } from './board.ts';
import { applyModifiers, crossedLine, rampAt, rampHeight, type BankDef, type ModifierTable, type Pt, type RampPath, type ScoopDef, type SpinnerDef, type SplitterDef } from '../machines/mechanisms.ts';
import type { Preset } from '../machines/presets.ts';

export type SimEvent =
  | { type: 'machine'; kind: FixtureData['kind']; id: string; x: number; y: number; points: number; nx: number; ny: number; ball: number; spins?: number }
  | { type: 'rampGate'; id: string; x: number; y: number; points: number; ball: number }
  | { type: 'bank'; id: string; points: number; ball: number }
  | { type: 'bat'; contact: Contact; x: number; y: number; ball: number }
  | { type: 'swing' }
  | { type: 'serve' }
  | { type: 'ramp'; id: string; phase: 'enter' | 'complete' | 'rollback' | 'land'; x: number; y: number; points: number; ball: number }
  | { type: 'scoop'; id: string; phase: 'catch' | 'eject'; x: number; y: number; points: number; ball: number }
  | { type: 'multiball'; id: string; x: number; y: number; balls: number; ball: number }
  | { type: 'clear'; score: number; target: number }
  | { type: 'drain'; x: number; strike: boolean; side: 'left' | 'center' | 'right'; ball: number; ballsLeft: number };

export type SimOptions = { onEvent?: (e: SimEvent) => void; preset?: Preset; layout?: Layout; /** Seed for launch variation (fixed by default so tests are reproducible). */ seed?: number };

export type Ball = {
  id: number;
  body: P.Body;
  mode: 'field' | 'ramp' | 'held' | 'drop';
  prev: Pt;
  hitSwingId: number;
  stillTime: number;
  ramp?: { r: RampPath; s: number; v: number; dir: 1 | -1 };
  held?: { scoop: ScoopDef; t: number };
  /** Falling off a drop-exit ramp onto the field (no collisions until it lands). */
  drop?: { r: RampPath; t: number; v: Pt };
  /** Mechanism id → sim time until which it ignores this ball (prevents instant re-capture). */
  ignore: Record<string, number>;
  /** Position used for drawing (body position on the field, ramp position otherwise). */
  pos: Pt;
  /** 0 on the floor, 1 at full ramp height (visual only). */
  height: number;
};

export class Simulation {
  world: P.World;
  layout: Layout;
  rules = new GameRules();
  balls: Ball[] = [];
  batterX: number = config.batter.startX;
  /** Simulation clock (seconds). */
  time = 0;
  swingStart = -100;
  swingId = 0;
  events: SimEvent[] = [];
  /** Splitter state per id. */
  splitters = new Map<string, { charge: number; lastHit: number; readyAt: number; launchAt: number | null }>();
  /** Bank progress: bank id → target ids hit this pitch. */
  banks = new Map<string, Set<string>>();
  /** Spinner animation state (read by the view): id → remaining spins. */
  spinners = new Map<string, number>();
  mods: ModifierTable;
  private seed: number;
  private onEvent?: (e: SimEvent) => void;
  private pendingKicks: { kind: 'bumper' | 'sling'; ref: unknown; ball: Ball }[] = [];
  private lastSlingKick = -10;
  private nextBallId = 1;
  private bodyToBall = new Map<P.Body, Ball>();

  constructor(opts: SimOptions = {}) {
    this.onEvent = opts.onEvent;
    this.layout = opts.layout ?? layoutFor(opts.preset);
    this.mods = opts.preset?.modifiers ?? {};
    this.seed = (opts.seed ?? 1) >>> 0 || 1;
    for (const b of this.layout.banks) this.banks.set(b.id, new Set());
    this.world = new P.World({ gravity: P.Vec2(0, config.gravity) });
    buildBoard(this.world, this.layout);
    for (const s of this.layout.splitters) this.splitters.set(s.id, { charge: 0, lastHit: -10, readyAt: 0, launchAt: null });
    this.world.on('begin-contact', c => this.beginContact(c));
  }

  /** Seeded random in [0, 1) (mulberry32): small launch variation so mechanisms don't replay identical paths. */
  random() {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Base points after the preset's stacked modifiers for this part id and its kind. */
  pts(id: string, kind: string, base: number) {
    const mods = [...(this.mods[id] ?? []), ...(this.mods[kind + ':*'] ?? [])];
    return mods.length ? applyModifiers(base, mods) : base;
  }

  emit(e: SimEvent) {
    this.events.push(e);
    if (this.events.length > 400) this.events.shift();
    this.onEvent?.(e);
  }

  /** First live ball's body (convenience for single-ball code and tests). */
  get ball(): P.Body | null {
    return this.balls[0]?.body ?? null;
  }

  get fieldBalls() {
    return this.balls.filter(b => b.mode === 'field');
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

  get swingState() {
    return swingStateAt(this.swingT);
  }

  /** Player pressed Ready: serve exactly one straight, centered pitch. */
  ready(): boolean {
    if (!this.rules.ready()) return false;
    this.clearBalls();
    this.batterX = config.batter.startX;
    this.swingStart = -100;
    for (const st of this.splitters.values()) Object.assign(st, { charge: 0, lastHit: -10, readyAt: 0, launchAt: null });
    for (const b of this.banks.values()) b.clear();
    this.addBall(config.pitch.x, config.pitch.y, 0, config.pitch.speed);
    this.emit({ type: 'serve' });
    return true;
  }

  private clearBalls() {
    for (const b of this.balls) this.world.destroyBody(b.body);
    this.balls = [];
    this.bodyToBall.clear();
    this.pendingKicks.length = 0;
  }

  private addBall(x: number, y: number, vx: number, vy: number): Ball {
    const body = this.world.createDynamicBody({ position: P.Vec2(x, y), bullet: true, linearDamping: config.ball.linearDamping, fixedRotation: true });
    body.createFixture(P.Circle(config.ball.radius), { density: 1, restitution: config.ball.restitution, friction: 0 });
    body.setLinearVelocity(P.Vec2(vx, vy));
    const b: Ball = { id: this.nextBallId++, body, mode: 'field', prev: { x, y }, hitSwingId: -1, stillTime: 0, ignore: {}, pos: { x, y }, height: 0 };
    this.balls.push(b);
    this.bodyToBall.set(body, b);
    return b;
  }

  /** Test/debug helper: replace everything on the table with one ball. Doesn't touch rules. */
  spawnBall(x: number, y: number, vx: number, vy: number) {
    this.clearBalls();
    return this.addBall(x, y, vx, vy).body;
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
    const fa = c.getFixtureA(), fb = c.getFixtureB();
    const ballA = this.bodyToBall.get(fa.getBody()), ballB = this.bodyToBall.get(fb.getBody());
    const ball = ballA ?? ballB;
    if (!ball || (ballA && ballB)) return; // ball-ball contacts are plain physics
    const other = ballA ? fb : fa;
    const d = other.getUserData() as FixtureData | null;
    if (!d) return;
    const pos = ball.body.getPosition();
    const wm = c.getWorldManifold(null);
    let nx = 0, ny = 0;
    if (wm) {
      const s = ballA ? -1 : 1;
      nx = wm.normal.x * s;
      ny = wm.normal.y * s;
    }
    let points = 0;
    if (d.kind === 'bumper') {
      points = (d.ref as Bumper).points ?? config.bumper.points;
      this.pendingKicks.push({ kind: 'bumper', ref: d.ref, ball });
    } else if (d.kind === 'target') points = config.target.points;
    else if (d.kind === 'jackpot') points = config.jackpot.points;
    else if (d.kind === 'lane') points = config.lane.points;
    else if (d.kind === 'sling') {
      if (this.time - this.lastSlingKick < config.sling.cooldown) return;
      this.lastSlingKick = this.time;
      points = config.sling.points;
      this.pendingKicks.push({ kind: 'sling', ref: d.ref, ball });
    } else if (d.kind === 'splitter') {
      points = this.hitSplitter(d.ref as SplitterDef);
      if (points < 0) return;
    }
    points = this.pts(d.id, d.kind, points);
    if (points) this.rules.addScore(points);
    this.emit({ type: 'machine', kind: d.kind, id: d.id, x: pos.x, y: pos.y, points, nx, ny, ball: ball.id });
    if (d.kind === 'target' || d.kind === 'jackpot') this.markBanks(d.id, ball);
  }

  private markBanks(targetId: string, ball: Ball) {
    for (const b of this.layout.banks) {
      if (!b.targetIds.includes(targetId)) continue;
      const set = this.banks.get(b.id)!;
      set.add(targetId);
      if (set.size === b.targetIds.length) {
        set.clear();
        const p = this.pts(b.id, 'bank', b.bonus);
        this.rules.addScore(p);
        this.emit({ type: 'bank', id: b.id, points: p, ball: ball.id });
      }
    }
  }

  /** Count a splitter hit (debounced). Returns points, or -1 if this contact is a duplicate. */
  private hitSplitter(s: SplitterDef) {
    const st = this.splitters.get(s.id)!;
    if (this.time - st.lastHit < 0.25) return -1;
    st.lastHit = this.time;
    if (st.launchAt === null && this.time >= st.readyAt && this.balls.length < s.maxBalls) {
      st.charge++;
      if (st.charge >= s.hitsToArm) st.launchAt = this.time + 0.35; // hatch opens, then fires
    }
    return s.pointsPerHit;
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
      if (this.rules.phase === 'live') this.batterX += controls.moveAxis * b.moveSpeed * dt + controls.dragDelta;
      controls.dragDelta = 0;
      this.batterX = Math.max(b.minX, Math.min(b.maxX, this.batterX));
    }
    if (!this.balls.length) return;

    for (const ball of this.balls) {
      if (ball.mode === 'field') {
        const p = ball.body.getPosition();
        ball.prev = { x: p.x, y: p.y };
      }
    }
    this.world.step(dt, 10, 8);
    this.applyKicks();

    for (const ball of this.balls.slice()) {
      if (!this.balls.includes(ball)) continue;
      if (ball.mode === 'ramp') this.stepRamp(ball, dt);
      else if (ball.mode === 'held') this.stepHeld(ball, dt);
      else if (ball.mode === 'drop') this.stepDrop(ball, dt);
      else this.stepField(ball, dt);
    }
    this.stepSplitters();
    // Challenge cleared during this step: stop play cleanly (no drain, no strike).
    if (this.rules.phase === 'cleared' && this.balls.length) {
      this.clearBalls();
      this.emit({ type: 'clear', score: this.rules.score, target: this.rules.target ?? 0 });
    }
  }

  private applyKicks() {
    for (const k of this.pendingKicks.splice(0)) {
      const body = k.ball.body;
      if (k.ball.mode !== 'field' || !this.balls.includes(k.ball)) continue;
      const v = body.getLinearVelocity();
      if (k.kind === 'bumper') {
        const m = k.ref as Bumper, p = body.getPosition();
        const kick = m.kick ?? config.bumper.kick;
        let nx = p.x - m.x, ny = p.y - m.y;
        const l = Math.hypot(nx, ny) || 1;
        nx /= l;
        ny /= l;
        const vn = v.x * nx + v.y * ny;
        const tx = v.x - vn * nx, ty = v.y - vn * ny;
        const out = Math.max(kick, Math.abs(vn) * 0.6 + kick * 0.6);
        body.setLinearVelocity(P.Vec2(tx * 0.8 + nx * out, ty * 0.8 + ny * out));
      } else {
        const s = k.ref as Sling;
        const along = v.x * -s.kickDir.y + v.y * s.kickDir.x;
        body.setLinearVelocity(P.Vec2(s.kickDir.x * config.sling.kick - s.kickDir.y * along * 0.15, s.kickDir.y * config.sling.kick + s.kickDir.x * along * 0.15));
      }
    }
  }

  private stepField(ball: Ball, dt: number) {
    const body = ball.body;
    const pos = body.getPosition(), vel = body.getLinearVelocity();
    const p = { x: pos.x, y: pos.y };
    ball.pos = p;
    ball.height = 0;

    // Scripted bat contact (once per swing per ball).
    const contact = findContact({ t: this.swingT, dt, hands: this.hands, ball: p, vel, ballRadius: config.ball.radius, alreadyHitThisSwing: ball.hitSwingId === this.swingId });
    if (contact) {
      ball.hitSwingId = this.swingId;
      body.setLinearVelocity(P.Vec2(contact.velocity.x, contact.velocity.y));
      this.rules.batHit();
      this.rules.addScore(config.batHitPoints);
      this.emit({ type: 'bat', contact, x: p.x, y: p.y, ball: ball.id });
    }

    // Ramp mouths: crossing into the mouth while moving up the ramp starts the ride.
    for (const r of this.layout.ramps) {
      if ((ball.ignore[r.def.id] ?? 0) > this.time) continue;
      if (crossedLine(ball.prev, p, r.mouth, r.entryDir, r.def.mouthWidth / 2 - 0.12)) {
        const v = body.getLinearVelocity();
        const along = v.x * r.entryDir.x + v.y * r.entryDir.y;
        if (along > 0) {
          this.enterRamp(ball, r, Math.min(Math.hypot(v.x, v.y), r.def.maxRide));
          return;
        }
      }
    }
    // Precision gates.
    for (const g of this.layout.gates) {
      if ((ball.ignore[g.id] ?? 0) > this.time) continue;
      const c = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
      const half = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) / 2 - g.postR;
      if (crossedLine(ball.prev, p, c, g.dir, half)) {
        ball.ignore[g.id] = this.time + 0.5;
        const pts = this.pts(g.id, 'gate', g.points);
        this.rules.addScore(pts);
        this.emit({ type: 'machine', kind: 'gate', id: g.id, x: c.x, y: c.y, points: pts, nx: g.dir.x, ny: g.dir.y, ball: ball.id });
      }
    }
    // Spinners: either direction through the flap; faster balls spin it more.
    for (const sp of this.layout.spinners) {
      if ((ball.ignore[sp.id] ?? 0) > this.time) continue;
      const c = { x: (sp.a.x + sp.b.x) / 2, y: (sp.a.y + sp.b.y) / 2 };
      const L = Math.hypot(sp.b.x - sp.a.x, sp.b.y - sp.a.y);
      const n = { x: -(sp.b.y - sp.a.y) / L, y: (sp.b.x - sp.a.x) / L };
      const neg = { x: -n.x, y: -n.y };
      if (crossedLine(ball.prev, p, c, n, L / 2) || crossedLine(ball.prev, p, c, neg, L / 2)) {
        ball.ignore[sp.id] = this.time + 0.3;
        const v = body.getLinearVelocity();
        const spins = Math.max(1, Math.min(sp.maxSpins, Math.round(Math.hypot(v.x, v.y) * sp.spinsPerSpeed)));
        const pts = this.pts(sp.id, 'spinner', spins * sp.pointsPerSpin);
        this.spinners.set(sp.id, (this.spinners.get(sp.id) ?? 0) + spins);
        this.rules.addScore(pts);
        this.emit({ type: 'machine', kind: 'spinner', id: sp.id, x: c.x, y: c.y, points: pts, nx: n.x, ny: n.y, ball: ball.id, spins });
      }
    }
    // Scoops: reaching the bottom of the cup catches the ball.
    for (const s of this.layout.scoops) {
      if ((ball.ignore[s.id] ?? 0) > this.time) continue;
      if (this.balls.some(o => o.held?.scoop === s)) continue; // one ball at a time
      // Anything that gets inside the cup is caught (a fast ball used to ride the inner wall around and out).
      if (Math.hypot(p.x - s.x, p.y - s.y) < s.cupR - 0.15) {
        this.catchInScoop(ball, s);
        return;
      }
    }

    // Speed cap (keeps tunneling impossible and the ball readable).
    const v2 = body.getLinearVelocity(), sp = Math.hypot(v2.x, v2.y);
    if (sp > config.ball.maxSpeed) body.setLinearVelocity(P.Vec2((v2.x / sp) * config.ball.maxSpeed, (v2.y / sp) * config.ball.maxSpeed));

    // Anti-trap: a ball that sits still gets a small nudge.
    if (sp < 0.6) ball.stillTime += dt;
    else ball.stillTime = 0;
    if (ball.stillTime > config.ball.stuckSeconds) {
      body.setLinearVelocity(P.Vec2((p.x < 10 ? 1 : -1) * 3, -2));
      ball.stillTime = 0;
    }

    // Any exit through the bottom of the table is a drain, wherever it happens.
    if (p.y > config.drainY || p.x < -1 || p.x > config.table.width + 1 || p.y < -1) this.drainBall(ball);
  }

  private enterRamp(ball: Ball, r: RampPath, speed: number) {
    ball.mode = 'ramp';
    ball.body.setActive(false);
    ball.ramp = { r, s: 0, v: speed, dir: 1 };
    ball.pos = { ...r.mouth };
    this.emit({ type: 'ramp', id: r.def.id, phase: 'enter', x: r.mouth.x, y: r.mouth.y, points: 0, ball: ball.id });
  }

  private stepRamp(ball: Ball, dt: number) {
    const st = ball.ramp!, d = st.r.def;
    if (st.dir === 1) {
      if (st.s < d.climb) {
        st.v -= d.climbDecel * dt;
        if (st.v <= 0) {
          // Not enough speed to clear the climb: roll back down and out of the mouth.
          st.v = 0;
          st.dir = -1;
        }
      } else {
        st.v = Math.max(d.minRide, Math.min(d.maxRide, st.v - 1.5 * dt));
      }
    } else {
      st.v += d.climbDecel * dt;
    }
    const prevS = st.s;
    st.s += st.dir * st.v * dt;
    // Mid-ramp scoring gate: once per forward pass (a rollback never reaches it, the climb is before it).
    if (st.dir === 1 && d.gate && prevS < st.r.gateS && st.s >= st.r.gateS) {
      const g = rampAt(st.r, st.r.gateS).p;
      const pts = this.pts(d.id + '-gate', 'rampGate', d.gate.points);
      this.rules.addScore(pts);
      this.emit({ type: 'rampGate', id: d.id, x: g.x, y: g.y, points: pts, ball: ball.id });
    }
    const { p, t } = rampAt(st.r, st.s);
    ball.pos = p;
    ball.height = rampHeight(st.r, st.s);

    if (st.dir === 1 && st.s >= st.r.length) {
      const sp = Math.max(d.exitMin, Math.min(d.exitMax, st.v));
      const v = { x: st.r.exitDir.x * sp, y: st.r.exitDir.y * sp };
      const pts = this.pts(d.id, 'ramp', d.points);
      this.rules.addScore(pts);
      this.emit({ type: 'ramp', id: d.id, phase: 'complete', x: st.r.exit.x, y: st.r.exit.y, points: pts, ball: ball.id });
      if (d.exit?.mode === 'drop') {
        // Leave the raised level and fall onto the field; collisions resume on landing.
        ball.mode = 'drop';
        ball.ramp = undefined;
        ball.drop = { r: st.r, t: 0, v };
        ball.pos = { ...st.r.exit };
        ball.height = 1;
      } else {
        this.releaseToField(ball, st.r.exit, v);
        ball.ignore[d.id] = this.time + 1;
      }
    } else if (st.dir === -1 && st.s <= 0) {
      const sp = Math.max(3, st.v);
      // Back out of the mouth, a touch in front of it so it doesn't immediately re-cross.
      const out = { x: st.r.mouth.x - st.r.entryDir.x * 0.15, y: st.r.mouth.y - st.r.entryDir.y * 0.15 };
      this.releaseToField(ball, out, { x: -t.x * sp, y: -t.y * sp });
      ball.ignore[d.id] = this.time + 0.6;
      this.emit({ type: 'ramp', id: d.id, phase: 'rollback', x: out.x, y: out.y, points: 0, ball: ball.id });
    }
  }

  private stepDrop(ball: Ball, dt: number) {
    const dr = ball.drop!, T = dr.r.def.exit?.fall ?? 0.2;
    dr.t += dt;
    dr.v.y += config.gravity * dt;
    ball.pos = { x: ball.pos.x + dr.v.x * dt, y: ball.pos.y + dr.v.y * dt };
    ball.height = Math.max(0, 1 - dr.t / T);
    if (dr.t >= T) {
      const r = dr.r;
      this.releaseToField(ball, ball.pos, dr.v);
      ball.ignore[r.def.id] = this.time + 1;
      this.emit({ type: 'ramp', id: r.def.id, phase: 'land', x: ball.pos.x, y: ball.pos.y, points: 0, ball: ball.id });
    }
  }

  private catchInScoop(ball: Ball, s: ScoopDef) {
    ball.mode = 'held';
    ball.body.setActive(false);
    ball.held = { scoop: s, t: 0 };
    ball.pos = { x: s.x, y: s.y };
    ball.height = 0;
    const pts = this.pts(s.id, 'scoop', s.points);
    this.rules.addScore(pts);
    this.emit({ type: 'scoop', id: s.id, phase: 'catch', x: s.x, y: s.y, points: pts, ball: ball.id });
  }

  private stepHeld(ball: Ball, dt: number) {
    const h = ball.held!;
    h.t += dt;
    // Failsafe: the hold is a fixed timer, so a captured ball always comes back out.
    if (h.t >= h.scoop.holdSeconds) {
      const s = h.scoop;
      // ±0.1 rad and ±8% speed so the relaunch doesn't replay the exact same bounce sequence every time
      const a = s.ejectAngle + (this.random() - 0.5) * 0.2, sp = s.ejectSpeed * (0.92 + this.random() * 0.16);
      const v = { x: Math.cos(a) * sp, y: Math.sin(a) * sp };
      this.releaseToField(ball, { x: s.x, y: s.y }, v);
      ball.ignore[s.id] = this.time + (s.recatchDelay ?? 0.8);
      this.emit({ type: 'scoop', id: s.id, phase: 'eject', x: s.x, y: s.y, points: 0, ball: ball.id });
    }
  }

  private releaseToField(ball: Ball, at: Pt, v: Pt) {
    ball.mode = 'field';
    ball.ramp = undefined;
    ball.held = undefined;
    ball.drop = undefined;
    ball.body.setPosition(P.Vec2(at.x, at.y));
    ball.body.setLinearVelocity(P.Vec2(v.x, v.y));
    ball.body.setActive(true);
    ball.body.setAwake(true);
    ball.prev = { ...at };
    ball.pos = { ...at };
    ball.height = 0;
    ball.stillTime = 0;
  }

  private stepSplitters() {
    for (const s of this.layout.splitters) {
      const st = this.splitters.get(s.id)!;
      if (st.launchAt === null || this.time < st.launchAt) continue;
      st.launchAt = null;
      st.charge = 0;
      st.readyAt = this.time + s.cooldown;
      if (this.rules.phase !== 'live' || this.balls.length >= s.maxBalls) continue;
      const a = s.launchAngle + (this.random() - 0.5) * 0.24, sp = s.launchSpeed * (0.92 + this.random() * 0.16);
      const nb = this.addBall(s.hatch.x, s.hatch.y, Math.cos(a) * sp, Math.sin(a) * sp);
      this.rules.addBall();
      this.emit({ type: 'multiball', id: s.id, x: s.hatch.x, y: s.hatch.y, balls: this.balls.length, ball: nb.id });
    }
  }

  private drainBall(ball: Ball) {
    const i = this.balls.indexOf(ball);
    if (i < 0) return;
    const x = ball.body.getPosition().x;
    this.balls.splice(i, 1);
    this.bodyToBall.delete(ball.body);
    this.world.destroyBody(ball.body);
    this.pendingKicks = this.pendingKicks.filter(k => k.ball !== ball);
    const strike = this.rules.drain();
    if (strike) this.clearBalls();
    const side = x < 8.2 ? 'left' : x > 11.8 ? 'right' : 'center';
    this.emit({ type: 'drain', x, strike, side, ball: ball.id, ballsLeft: this.balls.length });
  }
}
