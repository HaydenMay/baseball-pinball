/**
 * Build-test catalog: prevalidated mount sites on the factory table, installable machines (reusing
 * the existing mechanism types and the geometry already proven on /2 and /3), and modifiers.
 * Prices and costs are experimental test values (see economy.ts).
 */
import { RALLY_CHARGES, type MechanismDef, type Pt } from '../machines/mechanisms.ts';
import { UPPER_DECK, type SectionId } from '../machines/sections.ts';


/**
 * Build-test ramp checkpoints (initial test value: 8 × 1,000 = 8,000 base per full ride). Data per ramp,
 * so later ramps can opt in or vary count/value without renderer changes.
 */
export const RAMP_CHECKPOINTS = { count: 8, points: 1000 };
const W_ = 20;
export type Mount = {
  id: string;
  name: string;
  /** Where to draw the placement preview. */
  anchor: Pt;
  r: number;
  /** Mounts that can't both be filled (overlapping footprint or blocked entrance/exit). */
  conflicts?: string[];
  /** V2: the structural section this mount lives in (only offered once that section is unlocked). */
  section?: SectionId;
};

/** V2 Upper Deck mount centers (in the deck, between its side wall and the free deck bumpers). */
const DECK_SITES = { 'deck-l': { x: 4.0, y: -4.8 }, 'deck-r': { x: 16.0, y: -4.8 } };

/** Fixed mount sites. Each fits the ORIGINAL table without moving any factory part. */
export const MOUNTS: Mount[] = [
  { id: 'pocket-ul', name: 'Upper-left pocket', anchor: { x: 8.45, y: 6.2 }, r: 0.9 },
  { id: 'pocket-ur', name: 'Upper-right pocket', anchor: { x: 11.55, y: 6.2 }, r: 0.9 },
  { id: 'lane-l', name: 'Left lane', anchor: { x: 1.67, y: 5.6 }, r: 1.0 },
  { id: 'lane-r', name: 'Right lane', anchor: { x: 18.33, y: 5.6 }, r: 1.0 },
  { id: 'bank-cards', name: 'Left target bank', anchor: { x: 1.2, y: 13.9 }, r: 1.7 },
  { id: 'bank-stars', name: 'Right target bank', anchor: { x: 18.8, y: 11.9 }, r: 1.7 },
  { id: 'jackpot-lane', name: 'Jackpot lane', anchor: { x: 10, y: 11 }, r: 1.3 },
  { id: 'orbit-l', name: 'Left orbit', anchor: { x: 4.6, y: 10.2 }, r: 2.2 },
  // The bridge climbs right over the right-center spot (and the splitter's launch hatch), so only one of them.
  { id: 'bridge', name: 'Center bridge', anchor: { x: 10.5, y: 11.5 }, r: 3.2, conflicts: ['center-r', 'cluster-r'] },
  { id: 'center-r', name: 'Right-center', anchor: { x: 13.5, y: 14.0 }, r: 1.1, conflicts: ['bridge'] },
  { id: 'pocket-r', name: 'Right pocket', anchor: { x: 16.9, y: 14.2 }, r: 1.2, conflicts: ['loop-r'] },
  // Tops of the side alleys (outer wall x≈0.65 to lane rail x=2.75, rail starts at y=4.6). Sensor-only, so
  // they coexist with the lane spinners just below (y=5.6) and the rollover lanes.
  { id: 'gate-l', name: 'Left alley top', anchor: { x: 1.7, y: 4.75 }, r: 0.8 },
  { id: 'gate-r', name: 'Right alley top', anchor: { x: 18.3, y: 4.75 }, r: 0.8 },
  // ── Upgrade System 3.0 sites (EXPERIMENTAL geometry; see docs/UPGRADE_SYSTEM_3_PLAYTEST.md) ──
  // Flanks below each side alley, between the alley exit and the wall target bank. Open field on the
  // factory table; the Turbo path (raised) passes ≥1 unit inside the left flank.
  { id: 'flank-l', name: 'Left flank', anchor: { x: 2.65, y: 11.55 }, r: 1.5, conflicts: ['loop-r'] },
  { id: 'flank-r', name: 'Right flank', anchor: { x: 17.35, y: 11.55 }, r: 1.5, conflicts: ['cluster-r', 'loop-r'] },
  // Right mid-field cluster site: overlaps the right flank, and the Overpass climb passes over its left bumper.
  { id: 'cluster-r', name: 'Right mid-field', anchor: { x: 16.2, y: 11.0 }, r: 1.9, conflicts: ['flank-r', 'bridge', 'loop-r'] },
  // Long Loop: climbs the right wall over the right flank and pocket, crosses the top, descends the left
  // side over the left flank. Its mouth needs the factory mid-right bumper gone (as on Map 1).
  { id: 'loop-r', name: 'Long Loop (right wall → top → left side)', anchor: { x: 17.6, y: 12.5 }, r: 2.4, conflicts: ['pocket-r', 'flank-l', 'flank-r', 'cluster-r'] },
  // ── V2 Upper Deck sites (EXPERIMENTAL; see docs/V2_EXPANDABLE_MACHINE_PLAYTEST.md) ──
  // Either side of the deck, beside the free deck bumpers. The Home Run Ramp's raised climb runs up the right
  // wall (x≈18.2), clear of deck-r's footprint, and its release crosses above both sites.
  { id: 'deck-l', name: 'Upper Deck left', anchor: DECK_SITES['deck-l'], r: 1.6, section: 'upperDeck' },
  { id: 'deck-r', name: 'Upper Deck right', anchor: DECK_SITES['deck-r'], r: 1.6, section: 'upperDeck' },
];

/** Gameplay family for weighting and group effects. */
export type Family = 'bumper' | 'ramp' | 'gate' | 'bank' | 'jackpot' | 'lane' | 'scoop' | 'multiball' | 'target' | 'sling';

/**
 * One way to place a machine: the mounts it occupies and its physical parts (each on one of those mounts).
 * Part ids become `${def.id}@${mount}`: stable site anchors for targeted modifiers.
 */
export type Placement = { id: string; mounts: string[]; parts: { mount: string; def: MechanismDef }[] };

const W = 20;
const CARD_BANK = ['card-1', 'card-2', 'card-3'];
const STAR_BANK = ['star-1', 'star-2', 'star-3'];

export type MachineOffer = {
  key: string;
  kind: 'machine';
  name: string;
  desc: string;
  power: number;
  price: number;
  family: Family;
  /**
   * Placed definition(s) per compatible mount. An array = a bundle on one mount (e.g. twin bumpers).
   * Ids are made unique per mount at install.
   */
  at: Record<string, MechanismDef | MechanismDef[]>;
  /** Placements spanning several mounts (e.g. paired gates on both alley tops), all or nothing. */
  spans?: { mounts: string[]; parts: { mount: string; def: MechanismDef }[] }[];
  /** Factory parts removed while installed (restored when sold). Only where an existing map does the same. */
  displaces?: string[];
  /** Shown on cards: a bundle's piece count. */
  pieces?: number;
};

/** Every placement of a machine (single mounts, bundles on one mount, multi-mount spans). */
export function placementsOf(m: MachineOffer): Placement[] {
  const out: Placement[] = Object.entries(m.at).map(([mount, d]) => ({ id: mount, mounts: [mount], parts: (Array.isArray(d) ? d : [d]).map(def => ({ mount, def })) }));
  for (const sp of m.spans ?? []) out.push({ id: sp.mounts.join('+'), mounts: sp.mounts, parts: sp.parts });
  return out;
}

/** Experimental bundle geometry: bumper children (one physical fixture each). */
const twin = (side: 1 | -1, cx: number): MechanismDef[] => [
  { type: 'bumper', id: 'twin-a', powerCost: 1, x: cx + side * -0.1, y: 10.6, r: 0.55, points: 250, kick: 15 },
  { type: 'bumper', id: 'twin-b', powerCost: 1, x: cx + side * 0.1, y: 12.5, r: 0.55, points: 250, kick: 15 },
];
const CLUSTER = { cx: 16.2, cy: 11.0, side: 2.1, r: 0.5, points: 200, kick: 15 };
const clusterParts = (cx = CLUSTER.cx, cy = CLUSTER.cy): MechanismDef[] => {
  const { side, r, points, kick } = CLUSTER;
  const h = (side * Math.sqrt(3)) / 2;
  return [
    { type: 'bumper', id: 'cluster-a', powerCost: 1, x: cx, y: +(cy - (2 * h) / 3).toFixed(2), r, points, kick },
    { type: 'bumper', id: 'cluster-b', powerCost: 1, x: +(cx - side / 2).toFixed(2), y: +(cy + h / 3).toFixed(2), r, points, kick },
    { type: 'bumper', id: 'cluster-c', powerCost: 1, x: +(cx + side / 2).toFixed(2), y: +(cy + h / 3).toFixed(2), r, points, kick },
  ];
};
const GATE_L: MechanismDef = { type: 'multgate', id: 'mgate', powerCost: 1, side: 'left', a: { x: 0.6, y: 4.75 }, b: { x: 2.85, y: 4.75 }, tenths: 1 };
const GATE_R: MechanismDef = { type: 'multgate', id: 'mgate', powerCost: 1, side: 'right', a: { x: W_ - 2.85, y: 4.75 }, b: { x: W_ - 0.6, y: 4.75 }, tenths: 1 };

export const MACHINES: MachineOffer[] = [
  {
    key: 'mult-gate',
    kind: 'machine',
    family: 'gate',
    name: 'Multiplier Gate',
    desc: 'Each pass through the alley top: +0.1× global multiplier (this strike)',
    power: 1,
    price: 6,
    at: {
      // A little wider than the alley on the rail side so a ball leaving the alley at an angle still counts.
      'gate-l': GATE_L,
      'gate-r': GATE_R,
    },
  },
  {
    key: 'paired-gates',
    kind: 'machine',
    family: 'gate',
    name: 'Paired Multiplier Gates',
    desc: 'BUNDLE: both alley-top gates at once. Each pass: +0.1× global multiplier',
    power: 2,
    price: 11,
    pieces: 2,
    at: {},
    // Same part ids as single gates (mgate@gate-l / mgate@gate-r): compatible type at the same site, so
    // dormant gate modifiers there wake up again.
    spans: [{ mounts: ['gate-l', 'gate-r'], parts: [{ mount: 'gate-l', def: GATE_L }, { mount: 'gate-r', def: GATE_R }] }],
  },
  {
    key: 'twin-bumpers',
    kind: 'machine',
    family: 'bumper',
    name: 'Twin Bumpers',
    desc: 'BUNDLE: two pop bumpers (250 a hit) under a side alley exit',
    power: 2,
    price: 10,
    pieces: 2,
    at: { 'flank-l': twin(1, 2.65), 'flank-r': twin(-1, W_ - 2.65) },
  },
  {
    key: 'bumper-cluster',
    kind: 'machine',
    family: 'bumper',
    name: 'Triple Bumper Cluster',
    desc: 'BUNDLE: three pop bumpers (200 a hit) in a triangle the ball rattles through',
    power: 3,
    price: 13,
    pieces: 3,
    at: { 'cluster-r': clusterParts(), 'deck-l': clusterParts(DECK_SITES['deck-l'].x, DECK_SITES['deck-l'].y), 'deck-r': clusterParts(DECK_SITES['deck-r'].x, DECK_SITES['deck-r'].y) },
  },
  {
    key: 'long-loop',
    kind: 'machine',
    family: 'ramp',
    name: 'Long Loop',
    desc: 'Map 1 loop ramp: climbs the right wall, circles the top, drops mid-field. Full ride: 8 checkpoints × 1,000 = 8,000 base. Replaces the mid-right factory bumper',
    power: 3,
    price: 10,
    displaces: ['bumper-mid'],
    at: {
      'loop-r': {
        type: 'ramp', id: 'loop', name: 'LONG LOOP', powerCost: 3,
        // Map 1 (Sidewinder) path, unchanged up to the left side; the tail is moved down the left wall so it
        // drops below the Turbo mouth instead of crossing the Turbo route (build-test only; /1 untouched).
        path: [
          { x: 16.4, y: 18.4 }, { x: 17.25, y: 16.2 }, { x: 17.95, y: 13.2 }, { x: 18.05, y: 9.0 }, { x: 17.95, y: 4.8 },
          { x: 17.25, y: 3.3 }, { x: 15.6, y: 2.75 }, { x: 10, y: 2.75 }, { x: 4.4, y: 2.75 }, { x: 2.75, y: 3.2 },
          { x: 2.15, y: 4.6 }, { x: 2.2, y: 7.4 }, { x: 2.35, y: 10.0 }, { x: 2.9, y: 12.3 }, { x: 4.0, y: 14.5 },
          { x: 5.6, y: 15.5 }, { x: 7.3, y: 15.9 },
        ],
        mouthWidth: 1.6, climb: 9, climbDecel: 11, minRide: 10, maxRide: 20, exitMin: 6, exitMax: 9, points: 1000,
        gate: { at: 0.5, points: 750 }, exit: { mode: 'drop', fall: 0.28 },
        checkpoints: { count: RAMP_CHECKPOINTS.count, points: RAMP_CHECKPOINTS.points },
      },
    },
  },
  {
    key: 'bonus-bumper',
    kind: 'machine',
    family: 'bumper',
    name: 'Bonus Bumper',
    desc: 'Pop bumper worth 300 a hit',
    power: 1,
    price: 6,
    at: {
      'pocket-ul': { type: 'bumper', id: 'bonus', powerCost: 1, x: 8.45, y: 6.2, r: 0.7, points: 300, kick: 16 },
      'pocket-ur': { type: 'bumper', id: 'bonus', powerCost: 1, x: 11.55, y: 6.2, r: 0.7, points: 300, kick: 16 },
      'deck-l': { type: 'bumper', id: 'bonus', powerCost: 1, ...DECK_SITES['deck-l'], r: 0.7, points: 300, kick: 16 },
      'deck-r': { type: 'bumper', id: 'bonus', powerCost: 1, ...DECK_SITES['deck-r'], r: 0.7, points: 300, kick: 16 },
    },
  },
  {
    key: 'spinner',
    kind: 'machine',
    family: 'lane',
    name: 'Lane Spinner',
    desc: '40 per spin; faster balls spin it more',
    power: 1,
    price: 5,
    at: {
      'lane-l': { type: 'spinner', id: 'spinner', powerCost: 1, a: { x: 0.66, y: 5.6 }, b: { x: 2.68, y: 5.6 }, pointsPerSpin: 40, spinsPerSpeed: 0.7, maxSpins: 20 },
      'lane-r': { type: 'spinner', id: 'spinner', powerCost: 1, a: { x: W - 2.68, y: 5.6 }, b: { x: W - 0.66, y: 5.6 }, pointsPerSpin: 40, spinsPerSpeed: 0.7, maxSpins: 20 },
    },
  },
  {
    key: 'bank',
    kind: 'machine',
    family: 'bank',
    name: 'Target Bank',
    desc: 'Hit all 3 targets (progress survives strikes): +1,500',
    power: 1,
    price: 5,
    at: {
      'bank-cards': { type: 'bank', id: 'bank', powerCost: 1, name: 'BATTER UP', targetIds: CARD_BANK, bonus: 1500 },
      'bank-stars': { type: 'bank', id: 'bank', powerCost: 1, name: 'ALL-STAR', targetIds: STAR_BANK, bonus: 1500 },
    },
  },
  {
    key: 'jackpot-gate',
    kind: 'machine',
    family: 'jackpot',
    name: 'Jackpot Lane Gate',
    desc: '+400 for a shot up between the bullseyes',
    power: 1,
    price: 5,
    at: {
      'jackpot-lane': { type: 'gate', id: 'gate', powerCost: 1, a: { x: 8.85, y: 11 }, b: { x: 11.15, y: 11 }, dir: { x: 0, y: -1 }, postR: 0, posts: false, points: 400, label: 'JACKPOT LANE' },
    },
  },
  {
    key: 'turbo-ramp',
    kind: 'machine',
    family: 'ramp',
    name: 'Turbo Ramp',
    desc: 'Full ride: 8 checkpoints × 1,000 = 8,000 base; exits into the upper bumpers',
    power: 2,
    price: 9,
    at: {
      'orbit-l': {
        type: 'ramp', id: 'ramp', name: 'TURBO', powerCost: 2,
        path: [{ x: 5.5, y: 13.7 }, { x: 5.15, y: 12.0 }, { x: 4.35, y: 10.6 }, { x: 3.95, y: 9.0 }, { x: 4.0, y: 7.2 }, { x: 4.45, y: 6.25 }, { x: 5.25, y: 6.0 }],
        mouthWidth: 1.5, climb: 3, climbDecel: 12, minRide: 9, maxRide: 18, exitMin: 11, exitMax: 15, points: 1000,
        gate: { at: 0.55, points: 600 }, exit: { mode: 'release', fall: 0 },
        // Replaces the old +600 gate / +1,000 finish (gate.at only marks which checkpoint Toll Booth targets).
        checkpoints: { count: RAMP_CHECKPOINTS.count, points: RAMP_CHECKPOINTS.points },
      },
    },
  },
  {
    key: 'bridge-ramp',
    kind: 'machine',
    family: 'ramp',
    name: 'Overpass Bridge',
    desc: 'Aimable bridge. Full ride: 8 checkpoints × 1,000 = 8,000 base; drops mid-field toward the bat',
    power: 3,
    price: 10,
    at: {
      bridge: {
        type: 'ramp', id: 'ramp', name: 'OVERPASS', powerCost: 3,
        // On the factory table the low-left spot is a solid bumper (on /2 it's the catching glove), so the
        // bridge drops mid-field instead and the ball falls back toward the bat.
        path: [{ x: 13.2, y: 16.2 }, { x: 13.95, y: 14.2 }, { x: 14.35, y: 12.2 }, { x: 14.0, y: 10.4 }, { x: 12.7, y: 9.55 }, { x: 10, y: 9.35 }, { x: 7.9, y: 9.6 }, { x: 7.05, y: 10.6 }, { x: 7.05, y: 12.0 }, { x: 7.35, y: 13.1 }],
        mouthWidth: 1.6, climb: 4, climbDecel: 12, minRide: 5, maxRide: 18, exitMin: 4, exitMax: 9, points: 600,
        gate: { at: 0.52, points: 750 }, exit: { mode: 'drop', fall: 0.25 },
        // Replaces the old +750 gate / +600 finish.
        checkpoints: { count: RAMP_CHECKPOINTS.count, points: RAMP_CHECKPOINTS.points },
      },
    },
  },
  {
    key: 'glove-scoop',
    kind: 'machine',
    family: 'scoop',
    name: 'Glove Scoop',
    desc: 'Catches the ball for +1,000 and relaunches it into the upper bumpers',
    power: 2,
    price: 8,
    at: {
      'pocket-r': {
        type: 'scoop', id: 'scoop', powerCost: 2, x: 16.9, y: 14.2, cupR: 0.95,
        // opening faces up-left toward the field; relaunch heads for the right bumper cluster
        mouthAngle: -2.3, mouthHalf: 1.0, holdSeconds: 0.85, ejectAngle: -2.0, ejectSpeed: 21, points: 1000, recatchDelay: 2.5,
      },
    },
  },
  {
    key: 'splitter',
    kind: 'machine',
    family: 'multiball',
    name: 'Multiball Splitter',
    desc: '3 hits launch an extra ball (up to 3 on the table)',
    power: 3,
    price: 12,
    at: {
      'center-r': { type: 'splitter', id: 'splitter', powerCost: 3, x: 13.5, y: 14.3, hw: 0.75, hh: 0.3, hitsToArm: 3, pointsPerHit: 150, hatch: { x: 13.5, y: 13.0 }, launchAngle: -1.88, launchSpeed: 17, maxBalls: 3, cooldown: 5 },
    },
  },
];

/** What modifier targeting sees: every physical part on the board now, and displaced factory parts. */
export type BoardView = {
  parts: { id: string; type: string; offerKey: string; name: string; mount: string; family: Family }[];
  displaced: string[];
  /** V2 sections unlocked (their free fixtures are targetable like factory parts). */
  sections?: SectionId[];
};

/** A modifier template; `targets(board)` lists the parts it can apply to right now. */
export type ModTemplate = {
  key: string;
  name: string;
  /** Effect text, e.g. "+100 points" or "×1.5 points". */
  effect: string;
  add?: number;
  mul?: number;
  /** Global-multiplier generator (see Modifier.gen). */
  gen?: { every: number; tenths: number };
  /**
   * Where it can appear: 'shop' (bought), 'draft' (premium, only as a free end-of-challenge pick), or both.
   * Draft-only premiums are stronger versions; the shop never sells the premium pool at full strength.
   */
  tier: 'shop' | 'draft' | 'both';
  price: number;
  family: Family;
  /**
   * THIS = one physical site (anchored there; dormant if the site empties), ALL = a whole family including
   * parts installed later, CROSS = an interaction between two families.
   */
  scope: 'this' | 'all' | 'cross';
  /** Which scoring keys it can target given the board (key = part id, "kind:*", "family:*" or "cross:*"). */
  targets: (board: BoardView) => { key: string; label: string }[];
};

const FACTORY_BUMPERS = [
  { key: 'bumper-top-l', label: 'Top-left bumper' },
  { key: 'bumper-top-r', label: 'Top-right bumper' },
  { key: 'bumper-left', label: 'Left bumper' },
  { key: 'bumper-right', label: 'Right bumper' },
  { key: 'bumper-mid', label: 'Mid-right bumper' },
  { key: 'glove', label: 'Glove bumper' },
];
export const mountName = (id: string) => MOUNTS.find(m => m.id === id)?.name ?? id;
const partsOf = (b: BoardView, f: (p: BoardView['parts'][number]) => boolean) => b.parts.filter(f);
const childLabel = (p: BoardView['parts'][number]) => {
  const n = p.id.match(/^(?:twin|cluster)-([abc])@/);
  return n ? ` ${n[1].toUpperCase()}` : '';
};

/** THIS bumper: factory bumpers still on the table + every installed bumper part (bundle children included). */
const DECK_BUMPER_LABELS: Record<string, string> = { 'deck-bumper-l': 'Upper Deck left bumper', 'deck-bumper-r': 'Upper Deck right bumper', 'deck-bumper-c': 'Upper Deck center bumper' };
const bumperTargets = (b: BoardView) => [
  ...FACTORY_BUMPERS.filter(f => !b.displaced.includes(f.key)),
  ...(b.sections?.includes('upperDeck') ? UPPER_DECK.bumpers.map(d => ({ key: d.id, label: DECK_BUMPER_LABELS[d.id] ?? d.id })) : []),
  ...partsOf(b, p => p.type === 'bumper').map(p => ({ key: p.id, label: `${p.name}${childLabel(p)} (${mountName(p.mount)})` })),
];
const gateTargets = (b: BoardView) => partsOf(b, p => p.type === 'multgate').map(p => ({ key: p.id, label: `${mountName(p.mount)} gate` }));
const rampName = (p: BoardView['parts'][number]) => p.name.replace(/ Bridge$/, '');
const rampTargets = (b: BoardView) => partsOf(b, p => p.type === 'ramp').map(p => ({ key: p.id, label: `${rampName(p)} ramp (full ride)` }));
const bankTargets = (b: BoardView) => partsOf(b, p => p.type === 'bank').map(p => ({ key: p.id, label: `${mountName(p.mount)} (complete all 3)` }));
const ofOffer = (key: string, label: (p: BoardView['parts'][number]) => string) => (b: BoardView) => partsOf(b, p => p.offerKey === key).map(p => ({ key: p.id, label: label(p) }));
/** Group targets only appear once the family exists on the board (so the card always does something). */
const all = (key: string, label: string, has: (b: BoardView) => boolean) => (b: BoardView) => (has(b) ? [{ key, label }] : []);
/** The Upper Deck's free Home Run Ramp counts, so ALL-ramp cards apply to it once the deck is unlocked. */
const hasRamp = (b: BoardView) => b.parts.some(p => p.type === 'ramp') || !!b.sections?.includes('upperDeck');
/** Checkpoint ramps are bought ramps (the free Home Run Ramp pays one completion award, no checkpoints). */
const hasCheckpointRamp = (b: BoardView) => b.parts.some(p => p.type === 'ramp');
const hasGate = (b: BoardView) => b.parts.some(p => p.type === 'multgate');

/** Experimental generator cadence: hits on ONE chosen bumper per payout. */
export const BUMPER_GEN_EVERY = 5;
/** Experimental: hits on ANY bumper per payout for the ALL-bumpers generator. */
export const CROWD_GEN_EVERY = 20;
export { RALLY_CHARGES };

export const MODS: ModTemplate[] = [
  // ── Global-multiplier generators on ONE part (a copy raises payout, never frequency) ──
  { key: 'express-lane', name: 'Express Lane', effect: '+0.1× more per pass through THIS gate', gen: { every: 1, tenths: 1 }, tier: 'both', price: 5, family: 'gate', scope: 'this', targets: gateTargets },
  { key: 'sweet-spot', name: 'Sweet Spot', effect: `Every ${BUMPER_GEN_EVERY} hits on THIS bumper: +0.1×`, gen: { every: BUMPER_GEN_EVERY, tenths: 1 }, tier: 'shop', price: 5, family: 'bumper', scope: 'this', targets: bumperTargets },
  { key: 'hall-of-fame', name: 'Hall of Fame', effect: `Every ${BUMPER_GEN_EVERY} hits on THIS bumper: +0.2×`, gen: { every: BUMPER_GEN_EVERY, tenths: 2 }, tier: 'draft', price: 0, family: 'bumper', scope: 'this', targets: bumperTargets },
  { key: 'victory-lap', name: 'Victory Lap', effect: 'Each full ride on THIS ramp: +0.1×', gen: { every: 1, tenths: 1 }, tier: 'shop', price: 5, family: 'ramp', scope: 'this', targets: rampTargets },
  { key: 'victory-parade', name: 'Victory Parade', effect: 'Each full ride on THIS ramp: +0.2×', gen: { every: 1, tenths: 2 }, tier: 'draft', price: 0, family: 'ramp', scope: 'this', targets: rampTargets },
  { key: 'pennant', name: 'Pennant', effect: 'Each completion of THIS bank: +0.2×', gen: { every: 1, tenths: 2 }, tier: 'shop', price: 5, family: 'bank', scope: 'this', targets: bankTargets },
  { key: 'pennant-race', name: 'Pennant Race', effect: 'Each completion of THIS bank: +0.4×', gen: { every: 1, tenths: 4 }, tier: 'draft', price: 0, family: 'bank', scope: 'this', targets: bankTargets },
  // ── Group (ALL) effects: every compatible part, including ones installed later ──
  { key: 'bumper-crew', name: 'Bumper Crew', effect: 'ALL bumpers: +100 points per hit', add: 100, tier: 'draft', price: 0, family: 'bumper', scope: 'all', targets: () => [{ key: 'bumper:*', label: 'ALL bumpers (factory, installed, bundles, future)' }] },
  { key: 'crowd-noise', name: 'Crowd Noise', effect: `ALL bumpers: every ${CROWD_GEN_EVERY} bumper hits (any bumper): +0.1×`, gen: { every: CROWD_GEN_EVERY, tenths: 1 }, tier: 'shop', price: 6, family: 'bumper', scope: 'all', targets: () => [{ key: 'bumper:*', label: 'ALL bumpers (counted together)' }] },
  { key: 'standing-ovation', name: 'Standing Ovation', effect: `ALL bumpers: every ${CROWD_GEN_EVERY} bumper hits (any bumper): +0.2×`, gen: { every: CROWD_GEN_EVERY, tenths: 2 }, tier: 'draft', price: 0, family: 'bumper', scope: 'all', targets: () => [{ key: 'bumper:*', label: 'ALL bumpers (counted together)' }] },
  { key: 'gate-network', name: 'Gate Network', effect: 'ALL multiplier gates: +0.1× more per pass', gen: { every: 1, tenths: 1 }, tier: 'both', price: 7, family: 'gate', scope: 'all', targets: all('multgate:*', 'ALL multiplier gates (incl. future)', hasGate) },
  { key: 'express-track', name: 'Express Track', effect: 'ALL ramps: +250 on every checkpoint (+2,000 per full ride)', add: 250, tier: 'shop', price: 6, family: 'ramp', scope: 'all', targets: all('ramps:*', 'ALL ramps, every checkpoint (incl. future)', hasCheckpointRamp) },
  { key: 'grand-tour', name: 'Grand Tour', effect: 'ALL ramps: each full ride +0.2×', gen: { every: 1, tenths: 2 }, tier: 'draft', price: 0, family: 'ramp', scope: 'all', targets: all('ramp:*', 'ALL ramps, full rides (incl. future)', hasRamp) },
  // ── Cross-family: a full ramp ride charges the next bumper hits ──
  { key: 'rally-fuel', name: 'Rally Fuel', effect: `After any full ramp ride, the next ${RALLY_CHARGES} bumper hits score +500 each`, add: 500, tier: 'draft', price: 0, family: 'ramp', scope: 'cross', targets: all('cross:ride-bumpers', `Ramp ride → next ${RALLY_CHARGES} bumper hits`, hasRamp) },
  { key: 'momentum', name: 'Momentum', effect: `After any full ramp ride, the next ${RALLY_CHARGES} bumper hits score +200 each`, add: 200, tier: 'shop', price: 5, family: 'ramp', scope: 'cross', targets: all('cross:ride-bumpers', `Ramp ride → next ${RALLY_CHARGES} bumper hits`, hasRamp) },
  // ── Premium point upgrades (draft only) ──
  { key: 'mvp', name: 'MVP', effect: '×2 points on THIS bumper', mul: 2, tier: 'draft', price: 0, family: 'bumper', scope: 'this', targets: bumperTargets },
  { key: 'clutch', name: 'Clutch', effect: '+1,000 bonus on THIS bank', add: 1000, tier: 'draft', price: 0, family: 'bank', scope: 'this', targets: bankTargets },
  // ── Standard shop modifiers ──
  { key: 'hot-corner', name: 'Hot Corner', effect: '+100 points on THIS bumper', add: 100, tier: 'shop', price: 3, family: 'bumper', scope: 'this', targets: bumperTargets },
  { key: 'power-alley', name: 'Power Alley', effect: '×1.5 points on THIS bumper', mul: 1.5, tier: 'shop', price: 4, family: 'bumper', scope: 'this', targets: bumperTargets },
  { key: 'rally-cap', name: 'Rally Cap', effect: 'ALL bumpers: ×1.25 points', mul: 1.25, tier: 'shop', price: 6, family: 'bumper', scope: 'all', targets: () => [{ key: 'bumper:*', label: 'ALL bumpers (factory, installed, bundles, future)' }] },
  { key: 'big-stage', name: 'Big Stage', effect: '×2 points', mul: 2, tier: 'shop', price: 4, family: 'jackpot', scope: 'this', targets: () => [{ key: 'jackpot', label: 'Jackpot' }] },
  { key: 'sharp-eye', name: 'Sharp Eye', effect: 'ALL standup targets: +50 points', add: 50, tier: 'shop', price: 3, family: 'target', scope: 'all', targets: () => [{ key: 'target:*', label: 'ALL standup targets' }] },
  { key: 'rubber', name: 'Live Rubber', effect: 'Both slingshots: +40 points', add: 40, tier: 'shop', price: 2, family: 'sling', scope: 'all', targets: () => [{ key: 'sling:*', label: 'Both blue slingshots' }] },
  { key: 'rollover', name: 'Rollover', effect: 'Both side lanes: +100 points', add: 100, tier: 'shop', price: 2, family: 'lane', scope: 'all', targets: () => [{ key: 'lane:*', label: 'Both side lanes' }] },
  { key: 'nitro', name: 'Nitro', effect: '×1.5 on THIS ramp\'s final checkpoint (+500 per full ride)', mul: 1.5, tier: 'shop', price: 4, family: 'ramp', scope: 'this', targets: b => partsOf(b, p => p.type === 'ramp').map(p => ({ key: p.id, label: `${rampName(p)} ramp, checkpoint 8` })) },
  { key: 'toll-booth', name: 'Toll Booth', effect: '+500 on THIS ramp\'s halfway checkpoint', add: 500, tier: 'shop', price: 4, family: 'ramp', scope: 'this', targets: b => partsOf(b, p => p.type === 'ramp').map(p => ({ key: `${p.id}-gate`, label: `${rampName(p)} ramp, halfway checkpoint` })) },
  { key: 'gold-glove', name: 'Gold Glove', effect: '×2 catch points', mul: 2, tier: 'shop', price: 4, family: 'scoop', scope: 'this', targets: ofOffer('glove-scoop', () => 'Glove scoop') },
  { key: 'spin-doctor', name: 'Spin Doctor', effect: '×2 points on THIS spinner', mul: 2, tier: 'shop', price: 4, family: 'lane', scope: 'this', targets: ofOffer('spinner', p => `${mountName(p.mount)} spinner`) },
  { key: 'full-count', name: 'Full Count', effect: '×2 bonus on THIS bank', mul: 2, tier: 'shop', price: 4, family: 'bank', scope: 'this', targets: b => partsOf(b, p => p.type === 'bank').map(p => ({ key: p.id, label: `${mountName(p.mount)} bonus` })) },
  { key: 'gate-keeper', name: 'Gatekeeper', effect: '+300 points', add: 300, tier: 'shop', price: 3, family: 'jackpot', scope: 'this', targets: ofOffer('jackpot-gate', () => 'Jackpot lane gate') },
  { key: 'double-play', name: 'Double Play', effect: '+150 per hit', add: 150, tier: 'shop', price: 3, family: 'multiball', scope: 'this', targets: ofOffer('splitter', () => 'Multiball splitter') },
];

/** Families a scoring key belongs to (for weighting investment). */
export function familyOfKey(key: string, board: BoardView): Family | null {
  if (key.startsWith('cross:')) return 'ramp';
  const g = key.match(/^(\w+):\*$/);
  if (g) return ({ bumper: 'bumper', multgate: 'gate', ramps: 'ramp', ramp: 'ramp', target: 'target', sling: 'sling', lane: 'lane' } as Record<string, Family>)[g[1]] ?? null;
  const base = key.replace(/-(gate|cp)$/, '');
  const part = board.parts.find(p => p.id === base);
  if (part) return part.family;
  if (FACTORY_BUMPERS.some(f => f.key === key)) return 'bumper';
  if (UPPER_DECK.bumpers.some(d => d.id === key)) return 'bumper';
  if (key === 'jackpot') return 'jackpot';
  return null;
}
