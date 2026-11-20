/**
 * Build-test catalog: prevalidated mount sites on the factory table, installable machines (reusing
 * the existing mechanism types and the geometry already proven on /2 and /3), and modifiers.
 * Prices and costs are experimental test values (see economy.ts).
 */
import type { MechanismDef, Pt } from '../machines/mechanisms.ts';


/**
 * Build-test ramp checkpoints (initial test value: 8 × 1,000 = 8,000 base per full ride). Data per ramp,
 * so later ramps can opt in or vary count/value without renderer changes.
 */
export const RAMP_CHECKPOINTS = { count: 8, points: 1000 };
export type Mount = {
  id: string;
  name: string;
  /** Where to draw the placement preview. */
  anchor: Pt;
  r: number;
  /** Mounts that can't both be filled (overlapping footprint or blocked entrance/exit). */
  conflicts?: string[];
};

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
  { id: 'bridge', name: 'Center bridge', anchor: { x: 10.5, y: 11.5 }, r: 3.2, conflicts: ['center-r'] },
  { id: 'center-r', name: 'Right-center', anchor: { x: 13.5, y: 14.0 }, r: 1.1, conflicts: ['bridge'] },
  { id: 'pocket-r', name: 'Right pocket', anchor: { x: 16.9, y: 14.2 }, r: 1.2 },
  // Tops of the side alleys (outer wall x≈0.65 to lane rail x=2.75, rail starts at y=4.6). Sensor-only, so
  // they coexist with the lane spinners just below (y=5.6) and the rollover lanes.
  { id: 'gate-l', name: 'Left alley top', anchor: { x: 1.7, y: 4.75 }, r: 0.8 },
  { id: 'gate-r', name: 'Right alley top', anchor: { x: 18.3, y: 4.75 }, r: 0.8 },
];

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
  /** Placed definition per compatible mount. Ids are made unique per mount at install. */
  at: Record<string, MechanismDef>;
};

export const MACHINES: MachineOffer[] = [
  {
    key: 'mult-gate',
    kind: 'machine',
    name: 'Multiplier Gate',
    desc: 'Each pass through the alley top: +0.1× global multiplier (this strike)',
    power: 1,
    price: 6,
    at: {
      // A little wider than the alley on the rail side so a ball leaving the alley at an angle still counts.
      'gate-l': { type: 'multgate', id: 'mgate', powerCost: 1, side: 'left', a: { x: 0.6, y: 4.75 }, b: { x: 2.85, y: 4.75 }, tenths: 1 },
      'gate-r': { type: 'multgate', id: 'mgate', powerCost: 1, side: 'right', a: { x: W - 2.85, y: 4.75 }, b: { x: W - 0.6, y: 4.75 }, tenths: 1 },
    },
  },
  {
    key: 'bonus-bumper',
    kind: 'machine',
    name: 'Bonus Bumper',
    desc: 'Pop bumper worth 300 a hit',
    power: 1,
    price: 6,
    at: {
      'pocket-ul': { type: 'bumper', id: 'bonus', powerCost: 1, x: 8.45, y: 6.2, r: 0.7, points: 300, kick: 16 },
      'pocket-ur': { type: 'bumper', id: 'bonus', powerCost: 1, x: 11.55, y: 6.2, r: 0.7, points: 300, kick: 16 },
    },
  },
  {
    key: 'spinner',
    kind: 'machine',
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
    name: 'Multiball Splitter',
    desc: '3 hits launch an extra ball (up to 3 on the table)',
    power: 3,
    price: 12,
    at: {
      'center-r': { type: 'splitter', id: 'splitter', powerCost: 3, x: 13.5, y: 14.3, hw: 0.75, hh: 0.3, hitsToArm: 3, pointsPerHit: 150, hatch: { x: 13.5, y: 13.0 }, launchAngle: -1.88, launchSpeed: 17, maxBalls: 3, cooldown: 5 },
    },
  },
];

/** A modifier template; `targets(run)` lists the parts it can apply to right now. */
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
  /** Which scoring keys it can target given what's installed (key = part id or "kind:*"). */
  targets: (installed: { offerKey: string; id: string; mountId: string }[]) => { key: string; label: string }[];
};

const FACTORY_BUMPERS = [
  { key: 'bumper-top-l', label: 'Top-left bumper' },
  { key: 'bumper-top-r', label: 'Top-right bumper' },
  { key: 'bumper-left', label: 'Left bumper' },
  { key: 'bumper-right', label: 'Right bumper' },
  { key: 'bumper-mid', label: 'Mid-right bumper' },
  { key: 'glove', label: 'Glove bumper' },
];
const installedOf = (inst: { offerKey: string; id: string; mountId: string }[], key: string) => inst.filter(i => i.offerKey === key);
const mountName = (id: string) => MOUNTS.find(m => m.id === id)?.name ?? id;

const bumperTargets = (inst: { offerKey: string; id: string; mountId: string }[]) => [
  ...FACTORY_BUMPERS,
  ...installedOf(inst, 'bonus-bumper').map(i => ({ key: i.id, label: `Bonus bumper (${mountName(i.mountId)})` })),
];
const gateTargets = (inst: { offerKey: string; id: string; mountId: string }[]) => installedOf(inst, 'mult-gate').map(i => ({ key: i.id, label: `${mountName(i.mountId)} gate` }));
const rampTargets = (inst: { offerKey: string; id: string; mountId: string }[]) => inst.filter(i => i.offerKey.endsWith('-ramp')).map(i => ({ key: i.id, label: `${i.offerKey === 'turbo-ramp' ? 'Turbo' : 'Overpass'} ramp (full ride)` }));
const bankTargets = (inst: { offerKey: string; id: string; mountId: string }[]) => installedOf(inst, 'bank').map(i => ({ key: i.id, label: `${mountName(i.mountId)} (complete all 3)` }));

/** Experimental generator cadence: hits on ONE chosen bumper per payout. */
export const BUMPER_GEN_EVERY = 5;

export const MODS: ModTemplate[] = [
  // ── Global-multiplier generators (each tied to one part; a copy raises payout, never frequency) ──
  { key: 'express-lane', name: 'Express Lane', effect: '+0.1× more per gate pass', gen: { every: 1, tenths: 1 }, tier: 'both', price: 5, targets: gateTargets },
  { key: 'sweet-spot', name: 'Sweet Spot', effect: `Every ${BUMPER_GEN_EVERY} hits on this bumper: +0.1×`, gen: { every: BUMPER_GEN_EVERY, tenths: 1 }, tier: 'shop', price: 5, targets: bumperTargets },
  { key: 'hall-of-fame', name: 'Hall of Fame', effect: `Every ${BUMPER_GEN_EVERY} hits on this bumper: +0.2×`, gen: { every: BUMPER_GEN_EVERY, tenths: 2 }, tier: 'draft', price: 0, targets: bumperTargets },
  { key: 'victory-lap', name: 'Victory Lap', effect: 'Each completed ride: +0.1×', gen: { every: 1, tenths: 1 }, tier: 'shop', price: 5, targets: rampTargets },
  { key: 'victory-parade', name: 'Victory Parade', effect: 'Each completed ride: +0.2×', gen: { every: 1, tenths: 2 }, tier: 'draft', price: 0, targets: rampTargets },
  { key: 'pennant', name: 'Pennant', effect: 'Each bank completed: +0.2×', gen: { every: 1, tenths: 2 }, tier: 'shop', price: 5, targets: bankTargets },
  { key: 'pennant-race', name: 'Pennant Race', effect: 'Each bank completed: +0.4×', gen: { every: 1, tenths: 4 }, tier: 'draft', price: 0, targets: bankTargets },
  // ── Premium point upgrades (draft only) ──
  { key: 'mvp', name: 'MVP', effect: '×2 points', mul: 2, tier: 'draft', price: 0, targets: bumperTargets },
  { key: 'clutch', name: 'Clutch', effect: '+1,000 bonus', add: 1000, tier: 'draft', price: 0, targets: bankTargets },
  // ── Standard shop modifiers ──
  {
    key: 'hot-corner', name: 'Hot Corner', effect: '+100 points', add: 100, tier: 'shop', price: 3,
    targets: inst => [...FACTORY_BUMPERS, ...installedOf(inst, 'bonus-bumper').map(i => ({ key: i.id, label: `Bonus bumper (${mountName(i.mountId)})` }))],
  },
  {
    key: 'power-alley', name: 'Power Alley', effect: '×1.5 points', mul: 1.5, tier: 'shop', price: 4,
    targets: inst => [...FACTORY_BUMPERS, ...installedOf(inst, 'bonus-bumper').map(i => ({ key: i.id, label: `Bonus bumper (${mountName(i.mountId)})` }))],
  },
  { key: 'rally-cap', name: 'Rally Cap', effect: '×1.25 points', mul: 1.25, tier: 'shop', price: 6, targets: () => [{ key: 'bumper:*', label: 'Every bumper' }] },
  { key: 'big-stage', name: 'Big Stage', effect: '×2 points', mul: 2, tier: 'shop', price: 4, targets: () => [{ key: 'jackpot', label: 'Jackpot' }] },
  { key: 'sharp-eye', name: 'Sharp Eye', effect: '+50 points', add: 50, tier: 'shop', price: 3, targets: () => [{ key: 'target:*', label: 'Every standup target' }] },
  { key: 'rubber', name: 'Live Rubber', effect: '+40 points', add: 40, tier: 'shop', price: 2, targets: () => [{ key: 'sling:*', label: 'Both blue slingshots' }] },
  { key: 'rollover', name: 'Rollover', effect: '+100 points', add: 100, tier: 'shop', price: 2, targets: () => [{ key: 'lane:*', label: 'Both side lanes' }] },
  { key: 'nitro', name: 'Nitro', effect: '×1.5 on the final checkpoint (+500 per full ride)', mul: 1.5, tier: 'shop', price: 4, targets: inst => inst.filter(i => i.offerKey.endsWith('-ramp')).map(i => ({ key: i.id, label: `${mountName(i.mountId)} ramp, checkpoint 8` })) },
  { key: 'toll-booth', name: 'Toll Booth', effect: '+500 on the halfway checkpoint', add: 500, tier: 'shop', price: 4, targets: inst => inst.filter(i => i.offerKey.endsWith('-ramp')).map(i => ({ key: `${i.id}-gate`, label: `${mountName(i.mountId)} ramp, halfway checkpoint` })) },
  { key: 'gold-glove', name: 'Gold Glove', effect: '×2 catch points', mul: 2, tier: 'shop', price: 4, targets: inst => installedOf(inst, 'glove-scoop').map(i => ({ key: i.id, label: 'Glove scoop' })) },
  { key: 'spin-doctor', name: 'Spin Doctor', effect: '×2 points', mul: 2, tier: 'shop', price: 4, targets: inst => installedOf(inst, 'spinner').map(i => ({ key: i.id, label: `${mountName(i.mountId)} spinner` })) },
  { key: 'full-count', name: 'Full Count', effect: '×2 bonus', mul: 2, tier: 'shop', price: 4, targets: inst => installedOf(inst, 'bank').map(i => ({ key: i.id, label: `${mountName(i.mountId)} bonus` })) },
  { key: 'gate-keeper', name: 'Gatekeeper', effect: '+300 points', add: 300, tier: 'shop', price: 3, targets: inst => installedOf(inst, 'jackpot-gate').map(i => ({ key: i.id, label: 'Jackpot lane gate' })) },
  { key: 'double-play', name: 'Double Play', effect: '+150 per hit', add: 150, tier: 'shop', price: 3, targets: inst => installedOf(inst, 'splitter').map(i => ({ key: i.id, label: 'Multiball splitter' })) },
];
