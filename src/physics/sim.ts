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
import { RALLY_CHARGES, SCOOP_EJECT_SPREAD, applyModifiers, crossedLine, rampAt, rampHeight, type BankDef, type Modifier, type ModifierTable, type MultGateDef, type Pt, type RampPath, type ScoopDef, type SpinnerDef, type SplitterDef } from '../machines/mechanisms.ts';
import type { Preset } from '../machines/presets.ts';
import { DECK_RALLY, UPPER_DECK } from '../machines/sections.ts';
import { PLAY, isSweetSpot, jackpotPoints } from '../core/play-rules.ts';
import { HOT_CORNER, type BossId } from '../core/bosses.ts';

export type SimEvent =
  | { type: 'machine'; kind: FixtureData['kind']; id: string; x: number; y: number; points: number; nx: number; ny: number; ball: number; spins?: number }
  | { type: 'rampGate'; id: string; x: number; y: number; points: number; ball: number }
  /** One of a ramp's checkpoints paid out (index 0-based of `count`). */
  | { type: 'rampCheckpoint'; id: string; index: number; count: number; x: number; y: number; points: number; ball: number }
  | { type: 'bank'; id: string; points: number; ball: number }
  | { type: 'bat'; contact: Contact; x: number; y: number; ball: number; sweet?: boolean }
  /** Player route: a swing finished without touching a ball. */
  | { type: 'whiff' }
  /** Closer rule Hot Corner: the ×3 spot moved (or was first placed). */
  | { type: 'hot'; key: string; label: string; x: number; y: number; first: boolean }
  | { type: 'swing' }
  | { type: 'serve' }
  | { type: 'ramp'; id: string; phase: 'enter' | 'complete' | 'rollback' | 'land'; x: number; y: number; points: number; ball: number }
  | { type: 'scoop'; id: string; phase: 'catch' | 'eject'; x: number; y: number; points: number; ball: number }
  | { type: 'multiball'; id: string; x: number; y: number; balls: number; ball: number }
  | { type: 'clear'; score: number; target: number }
  /** Cross-family charge pool refilled (a full ramp ride with Rally Fuel/Momentum installed). */
  | { type: 'rally'; charges: number }
  /**
   * Observation only (analytics): one per banked award, emitted by the single scoring boundary.
   * `base` = the part's own base points, `modified` = after the part's own +/× modifiers,
   * `multTenths` = global multiplier used, `awarded` = points actually added to the score (0-awards
   * after a clear are not emitted). `part` narrows the source further (ramp checkpoint "cp3").
   */
  | {
      type: 'score';
      kind: string;
      id: string;
      base: number;
      /** Local points after modifiers (and after the ×Rally factor when `deckRally` is set). */
      modified: number;
      multTenths: number;
      awarded: number;
      part?: string;
      ball: number;
      /** V2.2: Upper Deck Rally factor applied to this contact (absent = none). */
      deckRally?: number;
      /** V2.2: points banked only because of the Rally factor (awarded − what it would have been without). */
      rallyGain?: number;
    }
  /** V2.2 Upper Deck Rally for one ball: starts on a completed Home Run, ends when that ball is back downstairs. */
  | { type: 'deckRally'; phase: 'start' | 'end'; ball: number; x: number; y: number; reason?: 'returned' | 'drain' | 'removed'; hits?: number; gained?: number }
  /** Global strike multiplier rose: `gain` and `total` in tenths (total 13 = ×1.3). */
  | { type: 'mult'; source: 'gate' | 'bumper' | 'ramp' | 'bank' | 'bat'; id: string; x: number; y: number; gain: number; total: number; ball: number }
  | { type: 'drain'; x: number; strike: boolean; side: 'left' | 'center' | 'right'; ball: number; ballsLeft: number; foul?: boolean };

export type SimOptions = { onEvent?: (e: SimEvent) => void; preset?: Preset; layout?: Layout; /** Seed for launch variation (fixed by default so tests are reproducible). */ seed?: number };

/** Between-pitches carry-over (see Simulation.carryState). */
/** One place the Hot Corner can sit: a part (`id:<part>`) or a group of small parts (`kind:<kind>`). */
export type HotSpot = { key: string; label: string; spots: { x: number; y: number; r: number }[] };

export type PitchCarry = {
  score: number;
  strikes: number;
  pitchNumber: number;
  multTenths: number;
  hits: number;
  splitters: [string, number][];
  banks: [string, string[]][];
  genCount: [string, number][];
  rallyCharges: number;
  rng: number;
  /** Player route: free fouls left this challenge (absent in older saves = full). */
  foulsLeft?: number;
  /** Closer rule Hot Corner: current spot, seconds left, its RNG. */
  hot?: { key: string; left: number; rng: number };
};

export type Ball = {
  id: number;
  body: P.Body;
  mode: 'field' | 'ramp' | 'held' | 'drop';
  prev: Pt;
  hitSwingId: number;
  stillTime: number;
  /** `cp` = next checkpoint index to pay on this ride (each pays once per ball per ride). */
  ramp?: { r: RampPath; s: number; v: number; dir: 1 | -1; cp: number };
  held?: { scoop: ScoopDef; t: number };
  /** Falling off a drop-exit ramp onto the field (no collisions until it lands). */
  drop?: { r: RampPath; t: number; v: Pt };
  /** Mechanism id → sim time until which it ignores this ball (prevents instant re-capture). */
  ignore: Record<string, number>;
  /** Multiplier gate id → which side of the gate line the ball was last clearly on (±1). */
  gateSide: Record<string, number>;
  /** Position used for drawing (body position on the field, ramp position otherwise). */
  pos: Pt;
  /** 0 on the floor, 1 at full ramp height (visual only). */
  height: number;
  /** V2.2: which level the ball is on (hysteresis around the top rail); only meaningful with the Upper Deck. */
  inDeck: boolean;
  /** V2.2: Upper Deck Rally active for this ball (only set by completing the Home Run Ramp). */
  deckRally: boolean;
  deckRallyHits: number;
  deckRallyGain: number;
};

export class Simulation {
  world: P.World;
  layout: Layout;
  /** V2.2: ids of upper-deck bumpers/slings (Rally parts). */
  private deckParts: Set<string>;
  rules = new GameRules();
  balls: Ball[] = [];
  batterX: number = config.batter.startX;
  /** Simulation clock (seconds). */
  time = 0;
  swingStart = -100;
  swingId = 0;
  /** Player route (PLAY): did the current swing touch a ball / was its whiff already reported. */
  private swingHit = true;
  private whiffSwingId = 0;
  /** A swing pressed during recovery waits until this sim time (PLAY.swingBuffer). */
  private swingQueuedUntil = -1;
  /** Did any ball touch the bat this pitch; free fouls left this challenge. */
  private pitchTouched = false;
  foulsLeft = PLAY.foulsPerChallenge;
  events: SimEvent[] = [];
  /** Splitter state per id. */
  splitters = new Map<string, { charge: number; lastHit: number; readyAt: number; launchAt: number | null }>();
  /** Bank progress: bank id → target ids hit this pitch. */
  banks = new Map<string, Set<string>>();
  /** Spinner animation state (read by the view): id → remaining spins. */
  spinners = new Map<string, number>();
  mods: ModifierTable;
  /** Generator cadences per scoring key (precomputed from mods): key → [{ every, tenths }]. */
  private gens = new Map<string, { every: number; tenths: number }[]>();
  /**
   * Generator progress: `${key}#${every}` → events counted toward the next payout.
   * EXPERIMENTAL rule: carries across strikes within a challenge (like bank/splitter progress) and
   * resets at the start of the next challenge (first pitch). The global multiplier now shares
   * that challenge lifetime, carrying across strikes.
   */
  genCount = new Map<string, number>();
  private seed: number;
  private onEvent?: (e: SimEvent) => void;
  private pendingKicks: { kind: 'bumper' | 'sling'; ref: unknown; ball: Ball }[] = [];
  /** Last kick time per sling debounce group (original lower pair share 'main'). */
  private lastSlingKick = new Map<string, number>();
  private nextBallId = 1;
  private bodyToBall = new Map<P.Body, Ball>();

  constructor(opts: SimOptions = {}) {
    this.onEvent = opts.onEvent;
    this.layout = opts.layout ?? layoutFor(opts.preset);
    this.deckParts = new Set(this.layout.deckParts);
    this.mods = opts.preset?.modifiers ?? {};
    this.seed = (opts.seed ?? 1) >>> 0 || 1;
    for (const b of this.layout.banks) this.banks.set(b.id, new Set());
    for (const [key, list] of Object.entries(this.mods)) {
      const byEvery = new Map<number, number>();
      for (const m of list) if (m.gen && m.gen.every >= 1 && m.gen.tenths > 0) byEvery.set(m.gen.every, (byEvery.get(m.gen.every) ?? 0) + m.gen.tenths);
      if (byEvery.size) this.gens.set(key, [...byEvery].sort((a, b) => a[0] - b[0]).map(([every, tenths]) => ({ every, tenths })));
    }
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
  /**
   * A part's own points: (base + Σadd) × Πmul over its own modifiers, its kind's group ("bumper:*") and,
   * when given, its family group ("ramps:*" for every ramp checkpoint). The global multiplier is NOT here.
   */
  pts(id: string, kind: string, base: number, family?: string, extra?: Modifier[]) {
    const mods = [...(this.mods[id] ?? []), ...(this.mods[kind + ':*'] ?? []), ...(family ? (this.mods[family + ':*'] ?? []) : []), ...(extra ?? [])];
    return mods.length ? applyModifiers(base, mods) : base;
  }

  /**
   * Cross-family "ride → bumpers" (Rally Fuel / Momentum): a full ramp ride sets a shared pool of charged
   * bumper hits to RALLY charges (refills, never stacks, so multiball can't multiply it); each bumper hit
   * consumes one and adds the modifiers' bonus to that hit's own points. Resets with the challenge.
   */
  rallyCharges = 0;
  private rallyRefill() {
    if (!(this.mods['cross:ride-bumpers']?.length)) return;
    this.rallyCharges = RALLY_CHARGES;
    this.emit({ type: 'rally', charges: this.rallyCharges });
  }

  /**
   * Bank points through the one central boundary (rules.award applies the global multiplier once) and
   * report what was actually banked for analytics. Never awards twice; returns rules.award's result.
   */
  // ── Closer rule (src/core/bosses.ts) ──
  /** Active Closer rule (player route; set per challenge by main.ts). */
  boss: BossId | null = null;
  /** Hot Corner: the ×3 spot right now (the view draws markers at `spots`). */
  hot: (HotSpot & { left: number }) | null = null;
  private hotRng = 1;

  setBoss(id: BossId | null) {
    this.boss = id;
    this.hot = null;
    this.hotRng = (this.seed ^ 0x9e3779b9) >>> 0 || 1;
    if (id === 'hotCorner') this.moveHot(true);
  }

  /** Every place the Hot Corner can land on this board (one per part, or one per group of small parts). */
  hotSpots(): HotSpot[] {
    const L = this.layout, out: HotSpot[] = [];
    for (const b of L.bumpers)
      out.push({ key: `id:${b.id}`, label: b.style === 'glove' ? 'GLOVE' : this.deckParts.has(b.id) ? 'DECK BUMPER' : 'BUMPER', spots: [{ x: b.x, y: b.y, r: b.r }] });
    const tg = [...L.roundTargets.filter(t => t.kind === 'target').map(t => ({ x: t.x, y: t.y, r: t.r })), ...L.boxTargets.filter(t => t.kind === 'target').map(t => ({ x: t.x, y: t.y, r: Math.max(t.hw, t.hh) }))];
    if (tg.length) out.push({ key: 'kind:target', label: 'TARGETS', spots: tg });
    for (const t of L.boxTargets.filter(t => t.kind === 'jackpot')) out.push({ key: `id:${t.id}`, label: 'JACKPOT', spots: [{ x: t.x, y: t.y, r: Math.max(t.hw, t.hh) }] });
    if (L.slings.length) out.push({ key: 'kind:sling', label: 'SLINGS', spots: L.slings.map(s => ({ x: (s.face[0].x + s.face[1].x) / 2, y: (s.face[0].y + s.face[1].y) / 2, r: 0.8 })) });
    if (L.lanes.length) out.push({ key: 'kind:lane', label: 'LANES', spots: L.lanes.map(l => ({ x: l.sensor.x, y: l.sensor.y, r: 0.5 })) });
    for (const r of this.layout.ramps) out.push({ key: `id:${r.def.id}`, label: r.def.name.toUpperCase().replace(/ RAMP$/, '').slice(0, 12) + ' RAMP', spots: [{ x: r.mouth.x, y: r.mouth.y, r: 0.9 }] });
    for (const sc of L.scoops) out.push({ key: `id:${sc.id}`, label: 'SCOOP', spots: [{ x: sc.x, y: sc.y, r: sc.cupR }] });
    return out;
  }

  private moveHot(first = false) {
    const all = this.hotSpots();
    const pool = all.length > 1 && this.hot ? all.filter(h => h.key !== this.hot!.key) : all;
    if (!pool.length) return;
    this.hotRng = (Math.imul(this.hotRng, 1664525) + 1013904223) >>> 0;
    const pick = pool[this.hotRng % pool.length];
    this.hot = { ...pick, left: HOT_CORNER.seconds };
    this.emit({ type: 'hot', key: pick.key, label: pick.label, x: pick.spots[0].x, y: pick.spots[0].y, first });
  }

  /** Hot Corner factor for one award (1 when no rule is active). */
  private hotFactor(kind: string, id: string) {
    const h = this.hot;
    if (!h) return 1;
    const anchor = id.replace(/-(gate|cp)$/, '');
    const hit = h.key === `id:${anchor}` || h.key === `kind:${kind}` || (h.key === 'kind:target' && kind === 'target');
    return hit ? HOT_CORNER.hot : HOT_CORNER.cold;
  }

  private award(kind: string, id: string, base: number, modified: number, ball: Ball, part?: string, deckRally?: number) {
    if (this.hot) modified = Math.round(modified * this.hotFactor(kind, id));
    const before = this.rules.score;
    // what this contact would have banked without the Rally factor (same rounding as rules.award)
    const plain = deckRally ? this.rules.preview(modified / deckRally) : 0;
    const p = this.rules.award(modified);
    const banked = this.rules.score - before;
    if (banked > 0) {
      const e: Extract<SimEvent, { type: 'score' }> = { type: 'score', kind, id, base, modified, multTenths: this.rules.multTenths, awarded: banked, part, ball: ball.id };
      if (deckRally) {
        e.deckRally = deckRally;
        e.rallyGain = Math.max(0, banked - Math.min(banked, plain));
        ball.deckRallyHits++;
        ball.deckRallyGain += e.rallyGain;
      }
      this.emit(e);
    }
    return p;
  }

  /** V2.2: stop a ball's Upper Deck Rally (if active) and report it. */
  private endDeckRally(ball: Ball, reason: 'returned' | 'drain' | 'removed') {
    if (!ball.deckRally) return;
    ball.deckRally = false;
    this.emit({ type: 'deckRally', phase: 'end', ball: ball.id, x: ball.pos.x, y: ball.pos.y, reason, hits: ball.deckRallyHits, gained: ball.deckRallyGain });
  }

  /**
   * V2.2: level tracking for the Upper Deck with hysteresis around the top rail. Only field/drop balls move
   * between levels physically (a ramp ride is raised and doesn't count as crossing). Crossing down through a
   * return gap ends that ball's Rally; going back up never re-arms it.
   */
  private trackLevel(ball: Ball) {
    if (!this.layout.sections.length || (ball.mode !== 'field' && ball.mode !== 'drop')) return;
    const y = ball.pos.y, rail = UPPER_DECK.railY, h = DECK_RALLY.hysteresis;
    if (ball.inDeck && y > rail + h) {
      ball.inDeck = false;
      this.endDeckRally(ball, 'returned');
    } else if (!ball.inDeck && y < rail - h) ball.inDeck = true;
  }

  /**
   * Count one scoring event toward any generator modifiers on this part and its kind. Returns the
   * tenths earned (0 if none paid out). Call AFTER awarding the event's points so the gain only
   * affects later scoring.
   */
  private generate(id: string, kind: string) {
    let gain = 0;
    for (const key of [id, kind + ':*']) {
      const list = this.gens.get(key);
      if (!list) continue;
      for (const g of list) {
        const ck = `${key}#${g.every}`;
        const n = (this.genCount.get(ck) ?? 0) + 1;
        if (n >= g.every) {
          this.genCount.set(ck, 0);
          gain += g.tenths;
        } else this.genCount.set(ck, n);
      }
    }
    return gain;
  }

  /** Apply a multiplier gain and announce it (no points of its own). */
  private boost(source: 'gate' | 'bumper' | 'ramp' | 'bank' | 'bat', id: string, x: number, y: number, tenths: number, ball: Ball) {
    if (!tenths || !this.rules.gainMult(tenths)) return;
    this.emit({ type: 'mult', source, id, x, y, gain: tenths, total: this.rules.multTenths, ball: ball.id });
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
    this.swingHit = true;
    this.swingQueuedUntil = -1;
    this.pitchTouched = false;
    // Mechanism progress (multiball charge, bank lamps) carries over between strikes; it only
    // resets when a new game or challenge starts (first pitch).
    if (this.rules.pitchNumber === 1) {
      for (const st of this.splitters.values()) Object.assign(st, { charge: 0, lastHit: -10, readyAt: 0, launchAt: null });
      for (const b of this.banks.values()) b.clear();
      this.genCount.clear();
      this.foulsLeft = PLAY.foulsPerChallenge;
    } else {
      // a launch that was mid-fire when the last ball drained stays one hit away
      for (const [id, st] of this.splitters) {
        if (st.launchAt === null) continue;
        const def = this.layout.splitters.find(s => s.id === id)!;
        Object.assign(st, { charge: def.hitsToArm - 1, launchAt: null });
      }
    }
    this.addBall(config.pitch.x, config.pitch.y, 0, config.pitch.speed);
    this.emit({ type: 'serve' });
    return true;
  }

  /**
   * Between-pitches state that carries to the next pitch of this challenge (score, strikes, global
   * multiplier, multiball charge, bank lamps, generator counters, Rally Fuel, RNG). Only valid while
   * waiting for READY; used to save and continue a run at a pitch boundary.
   */
  carryState(): PitchCarry {
    const r = this.rules;
    return {
      score: r.score, strikes: r.strikes, pitchNumber: r.pitchNumber, multTenths: r.multTenths, hits: r.hits,
      splitters: [...this.splitters].map(([id, st]) => [id, st.charge]),
      banks: [...this.banks].map(([id, lit]) => [id, [...lit]]),
      genCount: [...this.genCount],
      rallyCharges: this.rallyCharges,
      rng: this.seed,
      foulsLeft: this.foulsLeft,
      ...(this.hot ? { hot: { key: this.hot.key, left: this.hot.left, rng: this.hotRng } } : {}),
    };
  }

  /** Restore `carryState()` onto a freshly built sim of the same machine (before its next READY). */
  restoreCarry(c: PitchCarry) {
    const r = this.rules;
    r.phase = 'ready';
    r.score = c.score;
    r.strikes = c.strikes;
    r.pitchNumber = c.pitchNumber;
    r.multTenths = c.multTenths;
    r.hits = c.hits;
    for (const [id, charge] of c.splitters) {
      const st = this.splitters.get(id);
      if (st) Object.assign(st, { charge, lastHit: -10, readyAt: 0, launchAt: null });
    }
    for (const [id, lit] of c.banks) {
      const set = this.banks.get(id);
      if (!set) continue;
      set.clear();
      for (const t of lit) set.add(t);
    }
    this.genCount = new Map(c.genCount);
    this.rallyCharges = c.rallyCharges;
    this.seed = c.rng >>> 0 || 1;
    this.foulsLeft = c.foulsLeft ?? PLAY.foulsPerChallenge;
    if (c.hot && this.boss === 'hotCorner') {
      this.hotRng = c.hot.rng >>> 0 || 1;
      const spot = this.hotSpots().find(h => h.key === c.hot!.key);
      if (spot) this.hot = { ...spot, left: c.hot.left };
    }
  }

  private clearBalls() {
    for (const b of this.balls) this.endDeckRally(b, 'removed');
    for (const b of this.balls) this.world.destroyBody(b.body);
    this.balls = [];
    this.bodyToBall.clear();
    this.pendingKicks.length = 0;
  }

  private addBall(x: number, y: number, vx: number, vy: number): Ball {
    const body = this.world.createDynamicBody({ position: P.Vec2(x, y), bullet: true, linearDamping: config.ball.linearDamping, fixedRotation: true });
    body.createFixture(P.Circle(config.ball.radius), { density: 1, restitution: config.ball.restitution, friction: 0 });
    body.setLinearVelocity(P.Vec2(vx, vy));
    const b: Ball = {
      id: this.nextBallId++, body, mode: 'field', prev: { x, y }, hitSwingId: -1, stillTime: 0, ignore: {}, gateSide: {}, pos: { x, y }, height: 0,
      inDeck: y < UPPER_DECK.railY, deckRally: false, deckRallyHits: 0, deckRallyGain: 0,
    };
    this.seedGateSides(b, { x, y });
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
    const lockout = PLAY.enabled && !this.swingHit ? PLAY.whiffLockout : 0;
    const wait = s.swingSeconds + s.recoverSeconds + s.cooldownSeconds + lockout - this.swingT;
    if (wait > 0) {
      if (PLAY.enabled && wait <= PLAY.swingBuffer) this.swingQueuedUntil = this.time + wait;
      return false;
    }
    this.swingQueuedUntil = -1;
    this.swingStart = this.time;
    this.swingId++;
    this.swingHit = false;
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
    // V2.2 Upper Deck Rally: this ball's contacts with upper-deck bumpers/slings score ×factor
    const rallyX = ball.deckRally && (d.kind === 'bumper' || d.kind === 'sling') && this.deckParts.has(d.id) ? DECK_RALLY.factor : undefined;
    if (d.kind === 'bumper') {
      points = (d.ref as Bumper).points ?? config.bumper.points;
      this.pendingKicks.push({ kind: 'bumper', ref: d.ref, ball });
    } else if (d.kind === 'target') points = config.target.points;
    else if (d.kind === 'jackpot') points = jackpotPoints(this.rules.target, config.jackpot.points);
    else if (d.kind === 'lane') points = config.lane.points;
    else if (d.kind === 'sling') {
      const sg = (d.ref as Sling).group ?? 'main';
      if (this.time - (this.lastSlingKick.get(sg) ?? -10) < config.sling.cooldown) return;
      this.lastSlingKick.set(sg, this.time);
      points = (d.ref as Sling).points ?? config.sling.points;
      this.pendingKicks.push({ kind: 'sling', ref: d.ref, ball });
    } else if (d.kind === 'splitter') {
      points = this.hitSplitter(d.ref as SplitterDef);
      if (points < 0) return;
    }
    const base = points;
    const rally = d.kind === 'bumper' && this.rallyCharges > 0 ? this.mods['cross:ride-bumpers'] : undefined;
    if (rally?.length) this.rallyCharges--;
    points = this.pts(d.id, d.kind, points, undefined, rally);
    if (rallyX) points = Math.round(points * rallyX);
    if (points) points = this.award(d.kind, d.id, base, points, ball, undefined, rallyX);
    this.emit({ type: 'machine', kind: d.kind, id: d.id, x: pos.x, y: pos.y, points, nx, ny, ball: ball.id });
    if (d.kind === 'bumper') this.boost('bumper', d.id, pos.x, pos.y, this.generate(d.id, 'bumper'), ball);
    if (d.kind === 'target' || d.kind === 'jackpot') this.markBanks(d.id, ball);
  }

  private markBanks(targetId: string, ball: Ball) {
    for (const b of this.layout.banks) {
      if (!b.targetIds.includes(targetId)) continue;
      const set = this.banks.get(b.id)!;
      set.add(targetId);
      if (set.size === b.targetIds.length) {
        set.clear();
        const p = this.award('bank', b.id, b.bonus, this.pts(b.id, 'bank', b.bonus), ball);
        this.emit({ type: 'bank', id: b.id, points: p, ball: ball.id });
        const at = this.layout.boxTargets.find(t => t.id === b.targetIds[1]) ?? ball.pos;
        this.boost('bank', b.id, at.x, at.y, this.generate(b.id, 'bank'), ball);
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
      } else if (this.swingQueuedUntil >= 0 && this.time >= this.swingQueuedUntil) this.swing();
      if (this.rules.phase === 'live') this.batterX += controls.moveAxis * b.moveSpeed * dt + controls.dragDelta;
      controls.dragDelta = 0;
      this.batterX = Math.max(b.minX, Math.min(b.maxX, this.batterX));
    }
    if (this.hot && this.rules.phase === 'live' && (this.hot.left -= dt) <= 0) this.moveHot();
    if (PLAY.enabled && !this.swingHit && this.whiffSwingId !== this.swingId && this.swingT >= config.swing.swingSeconds) {
      this.whiffSwingId = this.swingId;
      this.emit({ type: 'whiff' });
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
      if (this.balls.includes(ball)) this.trackLevel(ball);
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
        const kick = s.kick ?? config.sling.kick;
        body.setLinearVelocity(P.Vec2(s.kickDir.x * kick - s.kickDir.y * along * 0.15, s.kickDir.y * kick + s.kickDir.x * along * 0.15));
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
      // Bat hits are ordinary scoring: they follow the global multiplier like everything else.
      this.award('bat', 'bat', config.batHitPoints, config.batHitPoints, ball);
      this.swingHit = true;
      this.pitchTouched = true;
      const sweet = PLAY.enabled && isSweetSpot(contact.angle, config.swing.centerAngle);
      if (sweet) {
        this.award('bat', 'sweet-spot', PLAY.sweetSpot.points, PLAY.sweetSpot.points, ball);
        // sweet-spot generators (Barrel Up / Squared Up): every N sweet spots raise the multiplier
        this.boost('bat', 'sweet-spot', p.x, p.y, this.generate('sweet-spot', 'sweet'), ball);
      }
      this.emit({ type: 'bat', contact, x: p.x, y: p.y, ball: ball.id, ...(sweet ? { sweet } : {}) });
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
        const pts = this.award('gate', g.id, g.points, this.pts(g.id, 'gate', g.points), ball);
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
        const pts = this.award('spinner', sp.id, spins * sp.pointsPerSpin, this.pts(sp.id, 'spinner', spins * sp.pointsPerSpin), ball);
        this.spinners.set(sp.id, (this.spinners.get(sp.id) ?? 0) + spins);
        this.emit({ type: 'machine', kind: 'spinner', id: sp.id, x: c.x, y: c.y, points: pts, nx: n.x, ny: n.y, ball: ball.id, spins });
      }
    }
    // Multiplier gates: a real traversal (either direction) through the opening.
    for (const g of this.layout.multGates) this.checkMultGate(ball, g, p);
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
    const B = this.layout.bounds;
    if (p.y > config.drainY || p.x < B.x0 - 1 || p.x > B.x1 + 1 || p.y < B.y0 - 1) this.drainBall(ball);
  }

  private enterRamp(ball: Ball, r: RampPath, speed: number) {
    ball.mode = 'ramp';
    ball.body.setActive(false);
    ball.ramp = { r, s: 0, v: speed, dir: 1, cp: 0 };
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
    const cps = st.r.cpS;
    // Checkpoints: pay every one the ball has now passed (a fast tick can pass several), in order, once.
    // Only moving forward: the ride's pointer never goes back, so jitter or a rollback can't re-pay.
    if (cps.length && st.dir === 1) {
      while (st.cp < cps.length && Math.min(st.s, st.r.length) >= cps[st.cp]) this.payCheckpoint(ball, st.cp++);
    }
    // Legacy mid-ramp scoring gate (ramps without checkpoints): once per forward pass.
    if (!cps.length && st.dir === 1 && d.gate && prevS < st.r.gateS && st.s >= st.r.gateS) {
      const g = rampAt(st.r, st.r.gateS).p;
      const pts = this.award('rampGate', d.id + '-gate', d.gate.points, this.pts(d.id + '-gate', 'rampGate', d.gate.points), ball);
      this.emit({ type: 'rampGate', id: d.id, x: g.x, y: g.y, points: pts, ball: ball.id });
    }
    const { p, t } = rampAt(st.r, st.s);
    ball.pos = p;
    ball.height = rampHeight(st.r, st.s);

    if (st.dir === 1 && st.s >= st.r.length) {
      let sp = Math.max(d.exitMin, Math.min(d.exitMax, st.v));
      let dir = st.r.exitDir;
      if (d.exitSpread) {
        // V2.1: seeded per-release variety (two draws, in this order, only for ramps that opt in)
        const da = (this.random() * 2 - 1) * d.exitSpread.angle;
        sp *= 1 + (this.random() * 2 - 1) * d.exitSpread.speed;
        dir = { x: dir.x * Math.cos(da) - dir.y * Math.sin(da), y: dir.x * Math.sin(da) + dir.y * Math.cos(da) };
      }
      const v = { x: dir.x * sp, y: dir.y * sp };
      if (cps.length) {
        // The finish checkpoint already paid (and ran completion generators); this is presentation only.
        this.emit({ type: 'ramp', id: d.id, phase: 'complete', x: st.r.exit.x, y: st.r.exit.y, points: 0, ball: ball.id });
      } else {
        const pts = this.award('ramp', d.id, d.points, this.pts(d.id, 'ramp', d.points), ball);
        this.emit({ type: 'ramp', id: d.id, phase: 'complete', x: st.r.exit.x, y: st.r.exit.y, points: pts, ball: ball.id });
        if (d.deckRally) {
          // a fresh completion (re-)arms Rally for this ball only; the release point is on the deck
          this.endDeckRally(ball, 'removed');
          ball.deckRally = true;
          ball.deckRallyHits = 0;
          ball.deckRallyGain = 0;
          ball.inDeck = st.r.exit.y < UPPER_DECK.railY;
          this.emit({ type: 'deckRally', phase: 'start', ball: ball.id, x: st.r.exit.x, y: st.r.exit.y });
        }
        // Only a completed ride counts toward ramp generators (entering or rolling back never does).
        this.boost('ramp', d.id, st.r.exit.x, st.r.exit.y, this.generate(d.id, 'ramp'), ball);
        this.rallyRefill();
      }
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
    const pts = this.award('scoop', s.id, s.points, this.pts(s.id, 'scoop', s.points), ball);
    this.emit({ type: 'scoop', id: s.id, phase: 'catch', x: s.x, y: s.y, points: pts, ball: ball.id });
  }

  private stepHeld(ball: Ball, dt: number) {
    const h = ball.held!;
    h.t += dt;
    // Failsafe: the hold is a fixed timer, so a captured ball always comes back out.
    if (h.t >= h.scoop.holdSeconds) {
      const s = h.scoop;
      // Seeded relaunch variety so the eject doesn't replay the same bounce sequence (default ±0.1 rad, ±8%;
      // written so the default reproduces the pre-V2.1 numbers bit for bit).
      const sv = s.ejectSpread ?? SCOOP_EJECT_SPREAD;
      const a = s.ejectAngle + (this.random() - 0.5) * (2 * sv.angle), sp = s.ejectSpeed * (1 - sv.speed + this.random() * (2 * sv.speed));
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
    // A ramp ride or a scoop hold teleports the ball: re-seed gate sides so that never counts as a pass.
    this.seedGateSides(ball, at);
  }

  /**
   * Pay checkpoint `i` of the ball's current ride. The gate checkpoint keeps the old gate's modifier key,
   * the last keeps the completion key and is the only one that feeds completion generators (once per ride).
   * The global multiplier is applied once per checkpoint by rules.award.
   */
  private payCheckpoint(ball: Ball, i: number) {
    const st = ball.ramp!, d = st.r.def, c = d.checkpoints!, last = i === st.r.cpS.length - 1;
    const [key, kind] = last ? [d.id, 'ramp'] : i === st.r.cpGate ? [d.id + '-gate', 'rampGate'] : [d.id + '-cp', 'rampCheckpoint'];
    const at = rampAt(st.r, st.r.cpS[i]).p;
    const pts = this.award(kind, key, c.points, this.pts(key, kind, c.points, 'ramps'), ball, `cp${i}`);
    this.emit({ type: 'rampCheckpoint', id: d.id, index: i, count: st.r.cpS.length, x: at.x, y: at.y, points: pts, ball: ball.id });
    if (last) {
      this.boost('ramp', d.id, at.x, at.y, this.generate(d.id, 'ramp'), ball);
      this.rallyRefill();
    }
  }

  /** Record which side of each multiplier gate a ball is on (nothing if it's inside the dead band). */
  private seedGateSides(ball: Ball, p: Pt) {
    ball.gateSide = {};
    for (const g of this.layout.multGates) {
      const f = gateFrame(g, p);
      if (Math.abs(f.d) >= GATE_HYSTERESIS) ball.gateSide[g.id] = Math.sign(f.d);
    }
  }

  /**
   * One proc per real traversal. A ball must be clearly on one side (beyond the dead band), then
   * clearly on the other, while inside the opening. Touching the line, resting on it, or numerical
   * jitter inside the dead band never counts; any later real pass, either direction, counts again.
   */
  private checkMultGate(ball: Ball, g: MultGateDef, p: Pt) {
    const f = gateFrame(g, p);
    if (Math.abs(f.d) < GATE_HYSTERESIS) return;
    const side = Math.sign(f.d), was = ball.gateSide[g.id];
    ball.gateSide[g.id] = side;
    if (was === undefined || was === side || Math.abs(f.lat) > f.half) return;
    const c = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
    this.boost('gate', g.id, c.x, c.y, g.tenths + this.generate(g.id, 'multgate'), ball);
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
    this.endDeckRally(ball, 'drain');
    this.balls.splice(i, 1);
    this.bodyToBall.delete(ball.body);
    this.world.destroyBody(ball.body);
    this.pendingKicks = this.pendingKicks.filter(k => k.ball !== ball);
    // Foul ball (player route): the last ball of a pitch that never touched the bat is a free re-pitch, once per challenge.
    const foul = PLAY.enabled && !this.pitchTouched && this.foulsLeft > 0 && this.rules.phase === 'live' && this.rules.ballsLive === 1;
    if (foul) this.foulsLeft--;
    const strike = foul ? this.rules.foul() : this.rules.drain();
    if (strike) this.clearBalls();
    const side = x < 8.2 ? 'left' : x > 11.8 ? 'right' : 'center';
    this.emit({ type: 'drain', x, strike, side, ball: ball.id, ballsLeft: this.balls.length, ...(foul ? { foul } : {}) });
  }
}

/** Dead band (world units) either side of a multiplier gate line. */
export const GATE_HYSTERESIS = 0.15;

/** Signed distance across a gate line (d), position along it from its center (lat), and its half-length. */
export function gateFrame(g: MultGateDef, p: Pt) {
  const c = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
  const L = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) || 1;
  const t = { x: (g.b.x - g.a.x) / L, y: (g.b.y - g.a.y) / L };
  return { d: (p.x - c.x) * -t.y + (p.y - c.y) * t.x, lat: (p.x - c.x) * t.x + (p.y - c.y) * t.y, half: L / 2 };
}
