/**
 * Reusable special-mechanism types. Each one is pure configuration data (position, geometry,
 * tuning, powerCost); the physics in sim.ts and the art in view/game.ts handle every instance of
 * a type the same way, so a map is just a list of these.
 *
 * All points, speeds and timings here are TEST VALUES, not a balanced economy.
 */
export type Pt = { x: number; y: number };

type Base = { id: string; powerCost: number };

/**
 * Elevated ramp / return lane. The ball enters through a floor-level mouth, rides a raised path
 * (drawn on top of the field, collision-free with the floor), then is released at the exit.
 * A shot that's too weak to clear the climb rolls back out of the mouth.
 */
export type RampDef = Base & {
  type: 'ramp';
  name: string;
  /** Control points from mouth to exit; smoothed into the ride path. */
  path: Pt[];
  mouthWidth: number;
  /** Uphill length (world units) right after the mouth. */
  climb: number;
  /** Deceleration while climbing (u/s²). Clearing needs entry speed² > 2·climbDecel·climb. */
  climbDecel: number;
  /** Speed is kept within [minRide, maxRide] after the crest. */
  minRide: number;
  maxRide: number;
  /** Speed at the exit is clamped into this range. */
  exitMin: number;
  exitMax: number;
  /** Points for reaching the end of the ramp. */
  points: number;
  /** Scoring gate on the raised route: fraction of the path length, and its award (once per pass). */
  gate?: { at: number; points: number };
  /**
   * Checkpoint scoring (opt-in per ramp, used by the build-test installs). REPLACES `points` and
   * `gate.points`: a full ride pays `count × points` base, one award per checkpoint per ball per ride.
   * Positions default to evenly spaced from just past the climb crest to the exit (so a rollback, which can
   * only happen on the climb, earns nothing); `at` (path fractions, ascending, last = 1) overrides that.
   * Modifier targets: checkpoint `gateIndex` keeps the old gate key (`<id>-gate`, kind rampGate), the last
   * checkpoint keeps the completion key (`<id>`, kind ramp, with completion-only generators); the rest
   * score as `<id>-cp` (kind rampCheckpoint).
   */
  checkpoints?: { count: number; points: number; at?: number[]; gateIndex?: number };
  /**
   * How the ball leaves: 'release' rolls straight off the end; 'drop' leaves the raised level at
   * full height and falls for `fall` seconds onto the field below before it can collide again.
   */
  exit?: { mode: 'release' | 'drop'; fall: number };
  /**
   * V2.1 per-release variety (EXPERIMENTAL, opt-in): each completed ride turns the exit heading by up to
   * ±`angle` radians and scales the exit speed by up to ±`speed` (fraction), uniformly, using the sim's
   * seeded RNG (exactly two draws per completed ride, only when set). Absent → the fixed exit (every
   * original-map ramp). Never touches the ride, checkpoints or scoring — only where the ball goes next.
   */
  exitSpread?: { angle: number; speed: number };
};

/** Default scoop relaunch variety (±0.1 rad, ±8% speed): the pre-V2.1 behavior, kept for every original map. */
export const SCOOP_EJECT_SPREAD = { angle: 0.1, speed: 0.08 };

/** Glove scoop: a cup that catches the ball, holds it, then fires it back onto the field. */
export type ScoopDef = Base & {
  type: 'scoop';
  x: number;
  y: number;
  /** Radius of the cup wall. */
  cupR: number;
  /** Direction the opening faces (radians, y-down). */
  mouthAngle: number;
  /** Half-width of the opening (radians). */
  mouthHalf: number;
  holdSeconds: number;
  ejectAngle: number;
  ejectSpeed: number;
  points: number;
  /** Seconds after an eject before the same ball can be caught again (stops endless catch loops). */
  recatchDelay?: number;
  /** V2.1: relaunch variety (±rad, ±speed fraction; seeded). Default SCOOP_EJECT_SPREAD. */
  ejectSpread?: { angle: number; speed: number };
};

/** Multiball splitter: a standup target that, after `hitsToArm` hits, launches an extra ball from its hatch. */
export type SplitterDef = Base & {
  type: 'splitter';
  x: number;
  y: number;
  hw: number;
  hh: number;
  hitsToArm: number;
  pointsPerHit: number;
  hatch: Pt;
  launchAngle: number;
  launchSpeed: number;
  /** Never more than this many balls on the table at once. */
  maxBalls: number;
  /** Seconds after a launch before the splitter can arm again. */
  cooldown: number;
};

/**
 * Precision gate: an opening between a and b; passing through in `dir` scores a bonus.
 * `posts: false` reuses existing machinery as the gate edges (e.g. the bullseye pair).
 */
export type GateDef = Base & { type: 'gate'; a: Pt; b: Pt; dir: Pt; points: number; postR: number; posts?: boolean; label?: string };

/**
 * Multiplier gate: a sensor line across the top of a side alley (no collision body). Each real
 * traversal, either direction, adds `tenths` (+0.1× per tenth) to the global strike multiplier.
 * Awards no points of its own.
 */
export type MultGateDef = Base & { type: 'multgate'; a: Pt; b: Pt; tenths: number; side: 'left' | 'right' };

/** Spinner: a flap across a lane. Passing through either way spins it; points per spin, spins scale with speed. */
export type SpinnerDef = Base & { type: 'spinner'; a: Pt; b: Pt; pointsPerSpin: number; spinsPerSpeed: number; maxSpins: number };

/** Target bank: hitting every listed target (in any order, during one pitch) pays a completion bonus and resets. */
export type BankDef = Base & { type: 'bank'; name: string; targetIds: string[]; bonus: number };

/** Extra pop bumper with its own point value. */
export type BonusBumperDef = Base & { type: 'bumper'; x: number; y: number; r: number; points: number; kick: number };

/** Experimental cross-family rule: a full ramp ride charges this many following bumper hits (shared pool, refills, never stacks). */
export const RALLY_CHARGES = 5;

export type MechanismDef = RampDef | ScoopDef | SplitterDef | GateDef | BonusBumperDef | SpinnerDef | BankDef | MultGateDef;

/**
 * Score modifiers, pre-stacked in config to imitate a mature build (no modifier SYSTEM yet).
 * Keys are a mechanism/part id ("jackpot") or a whole kind ("bumper:*"). Lists have no cap:
 * points = (base + Σadd) × Πmul.
 */
export type Modifier = {
  add?: number;
  mul?: number;
  note?: string;
  /**
   * Global-multiplier generator: every `every` scoring events on this key, add `tenths` to the
   * global strike multiplier. Copies with the same cadence share one counter and sum their payout,
   * so a duplicate raises the payout, never the frequency. Has no effect on the part's points.
   */
  gen?: { every: number; tenths: number };
};
export type ModifierTable = Record<string, Modifier[]>;

export function applyModifiers(base: number, mods: Modifier[]) {
  let add = 0, mul = 1;
  for (const m of mods) {
    add += m.add ?? 0;
    mul *= m.mul ?? 1;
  }
  return Math.round((base + add) * mul);
}

// ───────────── ramp path geometry ─────────────

export type RampPath = {
  def: RampDef;
  pts: Pt[];
  /** Cumulative length at each sample. */
  cum: number[];
  length: number;
  mouth: Pt;
  entryDir: Pt;
  mouthNormal: Pt;
  posts: [Pt, Pt];
  exit: Pt;
  exitDir: Pt;
  /** Distance along the path of the scoring gate (or -1). */
  gateS: number;
  /** Checkpoint distances along the path, ascending (empty without checkpoints). */
  cpS: number[];
  /** Index of the checkpoint that carries the old gate's modifier target. */
  cpGate: number;
};

/** Catmull-Rom smoothing, sampled roughly every 0.12 units. */
export function buildRampPath(def: RampDef): RampPath {
  const c = def.path;
  const pts: Pt[] = [];
  for (let i = 0; i < c.length - 1; i++) {
    const p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(c.length - 1, i + 2)];
    const seg = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const n = Math.max(2, Math.ceil(seg / 0.12));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      pts.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  pts.push(c[c.length - 1]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const unit = (a: Pt, b: Pt) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  const entryDir = unit(pts[0], pts[Math.min(3, pts.length - 1)]);
  const mouthNormal = { x: -entryDir.y, y: entryDir.x };
  const h = def.mouthWidth / 2;
  const mouth = pts[0];
  return {
    def,
    pts,
    cum,
    length: cum[cum.length - 1],
    mouth,
    entryDir,
    mouthNormal,
    posts: [
      { x: mouth.x + mouthNormal.x * h, y: mouth.y + mouthNormal.y * h },
      { x: mouth.x - mouthNormal.x * h, y: mouth.y - mouthNormal.y * h },
    ],
    exit: pts[pts.length - 1],
    exitDir: unit(pts[Math.max(0, pts.length - 4)], pts[pts.length - 1]),
    gateS: def.gate ? def.gate.at * cum[cum.length - 1] : -1,
    ...checkpointLayout(def, cum[cum.length - 1]),
  };
}

/** Where a ramp's checkpoints sit (see RampDef.checkpoints). */
export function checkpointLayout(def: RampDef, length: number) {
  const c = def.checkpoints;
  if (!c || c.count < 1) return { cpS: [] as number[], cpGate: -1 };
  const crest = Math.min(def.climb, length * 0.9);
  const cpS = c.at
    ? c.at.map(f => f * length)
    : Array.from({ length: c.count }, (_, i) => crest + ((length - crest) * (i + 1)) / c.count);
  cpS[cpS.length - 1] = length; // the last checkpoint is always the finish
  const gateTarget = def.gate ? def.gate.at * length : length / 2;
  const cpGate = c.gateIndex ?? cpS.slice(0, -1).reduce((best, s, i) => (Math.abs(s - gateTarget) < Math.abs(cpS[best] - gateTarget) ? i : best), 0);
  return { cpS, cpGate };
}

/** Position and unit tangent at distance s along the ride. */
export function rampAt(r: RampPath, s: number): { p: Pt; t: Pt } {
  const d = Math.max(0, Math.min(r.length, s));
  let lo = 0, hi = r.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (r.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = r.pts[lo], b = r.pts[hi];
  const seg = r.cum[hi] - r.cum[lo] || 1;
  const k = (d - r.cum[lo]) / seg;
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, t: { x: (b.x - a.x) / l, y: (b.y - a.y) / l } };
}

/** Visual height 0..1 along the ride: rises over the climb, level on top, drops into the exit (unless it's a drop exit). */
export function rampHeight(r: RampPath, s: number) {
  const up = Math.min(1, s / Math.max(0.01, r.def.climb));
  const down = r.def.exit?.mode === 'drop' ? 1 : Math.min(1, (r.length - s) / 2.2);
  const e = (x: number) => x * x * (3 - 2 * x);
  return Math.max(0, Math.min(e(up), e(down)));
}

/** Signed crossing test of a moving point against a finite line (a mouth or gate). */
export function crossedLine(prev: Pt, cur: Pt, center: Pt, dir: Pt, halfWidth: number) {
  const d0 = (prev.x - center.x) * dir.x + (prev.y - center.y) * dir.y;
  const d1 = (cur.x - center.x) * dir.x + (cur.y - center.y) * dir.y;
  if (!(d0 < 0 && d1 >= 0)) return false;
  const lat = Math.abs((cur.x - center.x) * -dir.y + (cur.y - center.y) * dir.x);
  return lat <= halfWidth;
}

/** Where a drop-exit ball touches down for a given exit speed (ballistic on the tilted table). */
export function dropLanding(r: RampPath, speed: number, gravity: number) {
  const T = r.def.exit?.fall ?? 0;
  const v = { x: r.exitDir.x * speed, y: r.exitDir.y * speed };
  return { p: { x: r.exit.x + v.x * T, y: r.exit.y + v.y * T + 0.5 * gravity * T * T }, v: { x: v.x, y: v.y + gravity * T } };
}
