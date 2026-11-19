/**
 * Collision geometry for the playfield. This file is the single source of truth: the renderer
 * draws exactly these shapes, and the physics world is built from them.
 */
import * as P from 'planck';
import { config } from '../config.ts';
import { buildRampPath, type GateDef, type RampPath, type ScoopDef, type SplitterDef } from '../machines/mechanisms.ts';
import type { Preset } from '../machines/presets.ts';

export type Pt = { x: number; y: number };
export type MachineKind = 'bumper' | 'target' | 'jackpot' | 'post' | 'sling' | 'wall' | 'lane' | 'rail' | 'ramp' | 'scoop' | 'splitter' | 'gate' | 'multiball';

export type Bumper = { id: string; kind: 'bumper'; x: number; y: number; r: number; style: 'ball' | 'glove' | 'bonus'; points?: number; kick?: number };
/** Side lane: a rail parallel to the outer wall with a rollover sensor that scores and lights the lane. */
export type Lane = { id: string; kind: 'lane'; rail: [Pt, Pt]; sensor: Pt; dir: Pt };
export type RoundTarget = { id: string; kind: 'target'; x: number; y: number; r: number };
export type BoxTarget = { id: string; kind: 'target' | 'jackpot'; x: number; y: number; hw: number; hh: number; face: Pt; style: 'card' | 'star' | 'jackpot' };
export type Post = { id: string; kind: 'post'; x: number; y: number; r: number };
export type Sling = { id: string; kind: 'sling'; side: 'left' | 'right'; poly: Pt[]; face: [Pt, Pt]; kickDir: Pt };

const W = config.table.width;

/** Left half of the outer wall, top-center to drain lip. Mirrored for the right side. */
const LEFT_WALL: Pt[] = [
  { x: 10, y: 0.6 },
  { x: 3.4, y: 0.6 },
  { x: 2.0, y: 0.95 },
  { x: 1.05, y: 1.85 },
  { x: 0.65, y: 3.2 },
  { x: 0.6, y: 21.4 },
  // lower angled sidewall converging toward the drain
  { x: 6.2, y: 30.6 },
  // short vertical drain lip
  { x: 6.2, y: 32.5 },
];
const mirror = (p: Pt): Pt => ({ x: W - p.x, y: p.y });

/** Full outer wall as one open chain, left drain lip → top → right drain lip. */
export const OUTER_WALL: Pt[] = [...LEFT_WALL.slice().reverse(), ...LEFT_WALL.slice(1).map(mirror)];

/** Point on the lower-left angled wall at a given y. */
export function lowerWallX(y: number) {
  const a = LEFT_WALL[5], b = LEFT_WALL[6];
  return a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
}

function makeSling(side: 'left' | 'right'): Sling {
  const y0 = 26.1, y1 = 30.3, depth = 0.95;
  const a = { x: lowerWallX(y0), y: y0 }, b = { x: lowerWallX(y1), y: y1 };
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  const n = { x: dy / len, y: -dx / len }; // inward normal (into the table)
  const a2 = { x: a.x + n.x * depth, y: a.y + n.y * depth };
  const b2 = { x: b.x + n.x * depth * 0.75, y: b.y + n.y * depth * 0.75 };
  // Kick inward and upward, back over the batter.
  let k = { x: n.x, y: n.y - 0.75 };
  const kl = Math.hypot(k.x, k.y);
  k = { x: k.x / kl, y: k.y / kl };
  const s: Sling = { id: 'sling-' + side, kind: 'sling', side, poly: [a, b, b2, a2], face: [a2, b2], kickDir: k };
  if (side === 'right') {
    s.poly = s.poly.map(mirror).reverse();
    s.face = [mirror(s.face[0]), mirror(s.face[1])];
    s.kickDir = { x: -k.x, y: k.y };
  }
  return s;
}

export const BUMPERS: Bumper[] = [
  // Upper corner pair. The center column above the mound stays open so a straight-up hit can reach the jackpot.
  { id: 'bumper-top-l', kind: 'bumper', x: 6.3, y: 4.3, r: 0.95, style: 'ball' },
  { id: 'bumper-top-r', kind: 'bumper', x: 13.7, y: 4.3, r: 0.95, style: 'ball' },
  { id: 'bumper-left', kind: 'bumper', x: 5.9, y: 7.9, r: 1.1, style: 'ball' },
  { id: 'bumper-right', kind: 'bumper', x: 14.1, y: 7.9, r: 1.1, style: 'ball' },
  { id: 'bumper-mid', kind: 'bumper', x: 15.5, y: 16.6, r: 1.0, style: 'ball' },
  { id: 'glove', kind: 'bumper', x: 4.5, y: 17.4, r: 1.0, style: 'glove' },
];

export const ROUND_TARGETS: RoundTarget[] = [
  // Gate in front of the jackpot lane: only a well-centered hit slips between them.
  { id: 'bull-1', kind: 'target', x: 8.4, y: 11.0, r: 0.42 },
  { id: 'bull-3', kind: 'target', x: 11.6, y: 11.0, r: 0.42 },
];

export const BOX_TARGETS: BoxTarget[] = [
  { id: 'jackpot', kind: 'jackpot', x: 10, y: 1.25, hw: 1.9, hh: 0.65, face: { x: 0, y: 1 }, style: 'jackpot' },
  // left wall bank: three batter cards facing right
  ...[12.4, 13.9, 15.4].map((y, i): BoxTarget => ({ id: 'card-' + (i + 1), kind: 'target', x: 0.95, y, hw: 0.36, hh: 0.62, face: { x: 1, y: 0 }, style: 'card' })),
  // right wall bank: three star targets facing left
  ...[10.4, 11.9, 13.4].map((y, i): BoxTarget => ({ id: 'star-' + (i + 1), kind: 'target', x: W - 0.95, y, hw: 0.36, hh: 0.62, face: { x: -1, y: 0 }, style: 'star' })),
];

export const POSTS: Post[] = [
  { id: 'post-l', kind: 'post', x: 3.4, y: 19.9, r: 0.26 },
  { id: 'post-r', kind: 'post', x: W - 3.4, y: 19.9, r: 0.26 },
];

export const LANES: Lane[] = [
  { id: 'lane-left', kind: 'lane', rail: [{ x: 2.75, y: 4.6 }, { x: 2.75, y: 9.4 }], sensor: { x: 1.7, y: 7.0 }, dir: { x: 0, y: 1 } },
  { id: 'lane-right', kind: 'lane', rail: [{ x: W - 2.75, y: 4.6 }, { x: W - 2.75, y: 9.4 }], sensor: { x: W - 1.7, y: 7.0 }, dir: { x: 0, y: 1 } },
];

export const SLINGS: Sling[] = [makeSling('left'), makeSling('right')];

/** Mound (decorative, no collision) where the pitch is served. */
export const MOUND = { x: config.pitch.x, y: config.pitch.y, r: 1.25 };

/**
 * Wall targets are trapezoids whose top edge slopes down into the table, so a ball can never
 * come to rest on top of one. The jackpot hangs from the top rail.
 */
export function targetPoly(t: BoxTarget): Pt[] {
  if (t.style === 'jackpot') {
    // Shallow V underside: a jackpot hit kicks off to one side instead of dropping straight back to the bat.
    return [{ x: t.x - t.hw, y: t.y - t.hh }, { x: t.x + t.hw, y: t.y - t.hh }, { x: t.x + t.hw, y: t.y + t.hh - 0.35 }, { x: t.x, y: t.y + t.hh + 0.25 }, { x: t.x - t.hw, y: t.y + t.hh - 0.35 }];
  }
  const f = t.face.x; // +1 faces right (left wall), -1 faces left (right wall)
  const back = t.x - f * (t.hw + 0.12), front = t.x + f * t.hw;
  return [{ x: back, y: t.y - t.hh - 0.3 }, { x: front, y: t.y - t.hh }, { x: front, y: t.y + t.hh }, { x: back, y: t.y + t.hh + 0.3 }];
}

export type FixtureData = { kind: MachineKind; id: string; ref?: unknown };

/** Everything physical on one table: the factory base plus any installed mechanisms. */
export type Layout = {
  bumpers: Bumper[];
  roundTargets: RoundTarget[];
  boxTargets: BoxTarget[];
  posts: Post[];
  lanes: Lane[];
  slings: Sling[];
  ramps: RampPath[];
  scoops: ScoopDef[];
  splitters: SplitterDef[];
  gates: GateDef[];
};

/** The factory table every map shares. */
export function baseLayout(): Layout {
  return { bumpers: [...BUMPERS], roundTargets: [...ROUND_TARGETS], boxTargets: [...BOX_TARGETS], posts: [...POSTS], lanes: [...LANES], slings: [...SLINGS], ramps: [], scoops: [], splitters: [], gates: [] };
}

/** Base table minus the preset's displaced parts, plus its mechanisms. */
export function layoutFor(preset?: Preset): Layout {
  const l = baseLayout();
  if (!preset) return l;
  const keep = <T extends { id: string }>(xs: T[]) => xs.filter(x => !preset.removeBase.includes(x.id));
  l.bumpers = keep(l.bumpers);
  l.roundTargets = keep(l.roundTargets);
  l.boxTargets = keep(l.boxTargets);
  l.posts = keep(l.posts);
  for (const m of preset.mechanisms) {
    if (m.type === 'ramp') l.ramps.push(buildRampPath(m));
    else if (m.type === 'scoop') l.scoops.push(m);
    else if (m.type === 'splitter') l.splitters.push(m);
    else if (m.type === 'gate') l.gates.push(m);
    else if (m.type === 'bumper') l.bumpers.push({ id: m.id, kind: 'bumper', x: m.x, y: m.y, r: m.r, style: 'bonus', points: m.points, kick: m.kick });
  }
  return l;
}

/** Polygon for a splitter's standup target (faces down toward the batter, peaked top so nothing rests on it). */
export function splitterPoly(s: SplitterDef): Pt[] {
  return [{ x: s.x - s.hw, y: s.y - s.hh }, { x: s.x, y: s.y - s.hh - 0.35 }, { x: s.x + s.hw, y: s.y - s.hh }, { x: s.x + s.hw, y: s.y + s.hh }, { x: s.x - s.hw, y: s.y + s.hh }];
}

/** Cup wall points for a scoop: an arc around the center that leaves the mouth open. */
export function scoopArc(s: ScoopDef, r = s.cupR): Pt[] {
  const start = s.mouthAngle + s.mouthHalf, end = s.mouthAngle - s.mouthHalf + Math.PI * 2;
  const pts: Pt[] = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const a = start + ((end - start) * i) / n;
    pts.push({ x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r });
  }
  return pts;
}

/** Build all static collision bodies into a planck world. */
export function buildBoard(world: P.World, layout: Layout = baseLayout()) {
  const body = world.createBody();
  const chain = body.createFixture(P.Chain(OUTER_WALL.map(p => P.Vec2(p.x, p.y)), false), { restitution: config.wall.restitution, friction: 0 });
  chain.setUserData({ kind: 'wall', id: 'wall' } satisfies FixtureData);
  const { bumpers: BUMPERS, roundTargets: ROUND_TARGETS, boxTargets: BOX_TARGETS, posts: POSTS, lanes: LANES, slings: SLINGS } = layout;

  for (const b of BUMPERS) {
    body.createFixture(P.Circle(P.Vec2(b.x, b.y), b.r), { restitution: config.bumper.restitution, friction: 0 }).setUserData({ kind: 'bumper', id: b.id, ref: b } satisfies FixtureData);
  }
  for (const t of ROUND_TARGETS) {
    body.createFixture(P.Circle(P.Vec2(t.x, t.y), t.r), { restitution: config.target.restitution, friction: 0 }).setUserData({ kind: 'target', id: t.id, ref: t } satisfies FixtureData);
  }
  for (const t of BOX_TARGETS) {
    body.createFixture(P.Polygon(targetPoly(t).map(p => P.Vec2(p.x, p.y))), { restitution: config.target.restitution, friction: 0 }).setUserData({ kind: t.kind, id: t.id, ref: t } satisfies FixtureData);
  }
  for (const p of POSTS) {
    body.createFixture(P.Circle(P.Vec2(p.x, p.y), p.r), { restitution: config.post.restitution, friction: 0 }).setUserData({ kind: 'post', id: p.id, ref: p } satisfies FixtureData);
  }
  for (const l of LANES) {
    body.createFixture(P.Edge(P.Vec2(l.rail[0].x, l.rail[0].y), P.Vec2(l.rail[1].x, l.rail[1].y)), { restitution: config.wall.restitution, friction: 0 }).setUserData({ kind: 'rail', id: l.id + '-rail', ref: l } satisfies FixtureData);
    body.createFixture(P.Circle(P.Vec2(l.sensor.x, l.sensor.y), 0.35), { isSensor: true }).setUserData({ kind: 'lane', id: l.id, ref: l } satisfies FixtureData);
  }
  for (const s of SLINGS) {
    body.createFixture(P.Polygon(s.poly.map(p => P.Vec2(p.x, p.y))), { restitution: config.sling.restitution, friction: 0 }).setUserData({ kind: 'sling', id: s.id, ref: s } satisfies FixtureData);
  }
  // ── mechanisms ──
  for (const r of layout.ramps) {
    // Only the mouth posts are on the floor; the raised ride itself never collides with floor balls.
    for (const p of r.posts) body.createFixture(P.Circle(P.Vec2(p.x, p.y), 0.22), { restitution: config.post.restitution, friction: 0 }).setUserData({ kind: 'post', id: r.def.id + '-post', ref: r } satisfies FixtureData);
  }
  for (const s of layout.scoops) {
    body.createFixture(P.Chain(scoopArc(s).map(p => P.Vec2(p.x, p.y)), false), { restitution: 0.25, friction: 0 }).setUserData({ kind: 'rail', id: s.id + '-cup', ref: s } satisfies FixtureData);
  }
  for (const s of layout.splitters) {
    body.createFixture(P.Polygon(splitterPoly(s).map(p => P.Vec2(p.x, p.y))), { restitution: config.target.restitution, friction: 0 }).setUserData({ kind: 'splitter', id: s.id, ref: s } satisfies FixtureData);
  }
  for (const g of layout.gates) {
    for (const p of [g.a, g.b]) body.createFixture(P.Circle(P.Vec2(p.x, p.y), g.postR), { restitution: config.post.restitution, friction: 0 }).setUserData({ kind: 'post', id: g.id + '-post', ref: g } satisfies FixtureData);
  }
  return body;
}
