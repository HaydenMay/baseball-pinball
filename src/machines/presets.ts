/**
 * Fixed test machine presets. These are NOT a shop or upgrade system: each route loads one preset,
 * and the only thing that differs between maps is this data.
 *
 * Power capacity (replaces hard mechanism slots in the long-term design):
 * - Factory parts (walls, base bumpers, targets, lanes, slingshots) cost 0.
 * - Each special mechanism has an illustrative `powerCost`.
 * - A preset is valid when sum(powerCost) <= maxPower.
 *
 * Placeholder values: MAX_POWER = 8 so the densest test map (Powerhouse, 6) fits with room to
 * spare; costs roughly track how much of the table and the run a mechanism affects
 * (long ramp 3, multiball 3, compact ramp 2, scoop 2, gate 1, bonus bumper 1). None are final, and
 * 8 is deliberately not the six "slots" of the earlier design.
 */
import { type MechanismDef, type ModifierTable } from './mechanisms.ts';

export const MAX_POWER_TEST = 8;

/**
 * Future-only rules, recorded as design intent. NOTHING here is implemented yet; do not read these
 * at runtime.
 */
export const FUTURE_POWER_RULES = {
  implemented: false,
  /** Free, guaranteed, irreversible +1 max Power at the start of these innings in a full run. */
  freePowerInnings: [2, 4, 6, 8],
  /** Power expansion plays a brief electrical pulse; it never permanently raises glow intensity. */
  expansionEffect: 'brief-pulse-only',
  /** Compatible modifiers stack on installed mechanisms without slot caps. */
  modifierSlotCap: null,
  /** No purchasable power expansions in V1. Starting capacity and mechanism costs undecided. */
  purchasableExpansions: false,
} as const;

export type Preset = {
  id: 'baseline' | 'sidewinder' | 'overpass' | 'powerhouse';
  /** URL path segment ('' = site root). */
  route: '' | '1' | '2' | '3';
  name: string;
  tagline: string;
  maxPower: number;
  /** Base-table parts this preset displaces to make physical room (ids from board.ts). */
  removeBase: string[];
  mechanisms: MechanismDef[];
  /** V2 structural sections (build-test ?v2=1 only; absent everywhere else). */
  sections?: import('./sections.ts').SectionId[];
  /** Pre-stacked test modifiers imitating a mature build (config only; no modifier system yet). */
  modifiers?: ModifierTable;
};

/** Test capacity for the endgame-style presets: big enough for every loadout, not a balance value. */
export const MAX_POWER_ENDGAME = 16;

const W = 20;
const LEFT_LANE_SPINNER = { a: { x: 0.66, y: 5.6 }, b: { x: 2.68, y: 5.6 } };
const RIGHT_LANE_SPINNER = { a: { x: W - 2.68, y: 5.6 }, b: { x: W - 0.66, y: 5.6 } };
/** The bullseye pair already frames the jackpot lane; this gate uses them as its edges (no new posts). */
const JACKPOT_LANE_GATE = { a: { x: 8.85, y: 11 }, b: { x: 11.15, y: 11 }, dir: { x: 0, y: -1 }, postR: 0, posts: false };
const CARD_BANK = ['card-1', 'card-2', 'card-3'];
const STAR_BANK = ['star-1', 'star-2', 'star-3'];

export const PRESETS: Preset[] = [
  {
    id: 'baseline',
    route: '',
    name: 'Baseline',
    tagline: 'The original table',
    maxPower: MAX_POWER_TEST,
    removeBase: [],
    mechanisms: [],
  },
  {
    // Long loop → mid gate over the top → short open drop above the center → another bat chance.
    id: 'sidewinder',
    route: '1',
    name: 'Sidewinder',
    tagline: 'Loop ramp · top gate · center drop',
    maxPower: MAX_POWER_ENDGAME,
    removeBase: ['bumper-mid'],
    mechanisms: [
      {
        type: 'ramp',
        id: 'ramp-side',
        name: 'SIDEWINDER',
        powerCost: 3,
        path: [
          { x: 16.4, y: 18.4 }, { x: 17.25, y: 16.2 }, { x: 17.95, y: 13.2 }, { x: 18.05, y: 9.0 }, { x: 17.95, y: 4.8 },
          { x: 17.25, y: 3.3 }, { x: 15.6, y: 2.75 }, { x: 10, y: 2.75 }, { x: 4.4, y: 2.75 }, { x: 2.75, y: 3.2 },
          { x: 2.15, y: 4.6 }, { x: 2.2, y: 7.4 }, { x: 2.9, y: 9.7 }, { x: 4.5, y: 11.5 }, { x: 6.6, y: 12.6 },
          { x: 7.8, y: 13.6 }, { x: 8.3, y: 14.6 },
        ],
        mouthWidth: 1.6,
        climb: 9,
        climbDecel: 11,
        minRide: 10,
        maxRide: 20,
        exitMin: 6,
        exitMax: 9,
        points: 1000,
        gate: { at: 0.5, points: 750 },
        exit: { mode: 'drop', fall: 0.28 },
      },
      { type: 'gate', id: 'gate-right', powerCost: 1, a: { x: 13.1, y: 13.6 }, b: { x: 14.8, y: 13.6 }, dir: { x: 0, y: -1 }, points: 300, postR: 0.2, label: 'BONUS GATE' },
      { type: 'spinner', id: 'spinner-left', powerCost: 1, ...LEFT_LANE_SPINNER, pointsPerSpin: 40, spinsPerSpeed: 0.7, maxSpins: 20 },
      { type: 'bank', id: 'bank-cards', powerCost: 1, name: 'BATTER UP', targetIds: CARD_BANK, bonus: 1500 },
      { type: 'bank', id: 'bank-stars', powerCost: 1, name: 'ALL-STAR', targetIds: STAR_BANK, bonus: 1500 },
      { type: 'bumper', id: 'bonus-upper', powerCost: 1, x: 11.55, y: 6.2, r: 0.7, points: 300, kick: 16 },
    ],
    modifiers: {
      'bumper:*': [{ add: 50, note: 'Hot Corners' }, { mul: 1.5, note: 'Power Alley' }],
      jackpot: [{ mul: 2, note: 'Big Stage' }],
    },
  },
  {
    // Skill shot into the Overpass → bridge gate → drop toward the glove → glove relaunch into the upper cluster.
    id: 'overpass',
    route: '2',
    name: 'Overpass',
    tagline: 'Bridge gate · glove relaunch',
    maxPower: MAX_POWER_ENDGAME,
    removeBase: ['glove'],
    mechanisms: [
      {
        type: 'ramp',
        id: 'ramp-over',
        name: 'OVERPASS',
        powerCost: 3,
        path: [
          { x: 13.2, y: 16.2 }, { x: 13.95, y: 14.2 }, { x: 14.35, y: 12.2 }, { x: 14.0, y: 10.4 }, { x: 12.7, y: 9.55 },
          { x: 10, y: 9.35 }, { x: 7.3, y: 9.55 }, { x: 6.1, y: 10.4 }, { x: 5.75, y: 11.8 }, { x: 5.6, y: 13.0 },
        ],
        mouthWidth: 1.6,
        climb: 4,
        climbDecel: 12,
        // Ride speed carries through to the drop, so how hard the ramp was hit decides the glove chance.
        minRide: 5,
        maxRide: 18,
        exitMin: 3,
        exitMax: 12,
        points: 600,
        gate: { at: 0.52, points: 750 },
        exit: { mode: 'drop', fall: 0.25 },
      },
      {
        type: 'scoop',
        id: 'scoop-glove',
        powerCost: 2,
        x: 4.4,
        y: 17.4,
        cupR: 0.95,
        mouthAngle: -0.75,
        mouthHalf: 1.0,
        holdSeconds: 0.85,
        // up the left side into the bumper cluster
        ejectAngle: -1.2,
        ejectSpeed: 22,
        points: 1000,
        recatchDelay: 2.5,
      },
      { type: 'bumper', id: 'bonus-upper', powerCost: 1, x: 8.45, y: 6.2, r: 0.7, points: 300, kick: 16 },
      { type: 'gate', id: 'gate-jackpot-lane', powerCost: 1, ...JACKPOT_LANE_GATE, points: 400, label: 'JACKPOT LANE' },
      { type: 'spinner', id: 'spinner-right', powerCost: 1, ...RIGHT_LANE_SPINNER, pointsPerSpin: 40, spinsPerSpeed: 0.7, maxSpins: 20 },
      { type: 'bank', id: 'bank-cards', powerCost: 1, name: 'BATTER UP', targetIds: CARD_BANK, bonus: 1500 },
    ],
    modifiers: {
      'scoop-glove': [{ mul: 2, note: 'Gold Glove' }],
      'bumper:*': [{ mul: 1.5, note: 'Power Alley' }],
    },
  },
  {
    // Densest build: Turbo ramp feeds the upper cluster; multiball, twin bonus bumpers, spinners, banks, lane gate.
    id: 'powerhouse',
    route: '3',
    name: 'Turbo',
    tagline: 'Turbo ramp · multiball · stacked mods',
    maxPower: MAX_POWER_ENDGAME,
    removeBase: [],
    mechanisms: [
      {
        type: 'ramp',
        id: 'ramp-compact',
        name: 'TURBO',
        powerCost: 2,
        path: [
          { x: 5.5, y: 13.7 }, { x: 5.15, y: 12.0 }, { x: 4.35, y: 10.6 }, { x: 3.95, y: 9.0 }, { x: 4.0, y: 7.2 },
          { x: 4.45, y: 6.25 }, { x: 5.25, y: 6.0 },
        ],
        mouthWidth: 1.5,
        climb: 3,
        climbDecel: 12,
        minRide: 9,
        maxRide: 18,
        exitMin: 11,
        exitMax: 15,
        points: 1000,
        gate: { at: 0.55, points: 600 },
        exit: { mode: 'release', fall: 0 },
      },
      {
        type: 'splitter',
        id: 'splitter',
        powerCost: 3,
        x: 13.5,
        y: 14.3,
        hw: 0.75,
        hh: 0.3,
        hitsToArm: 3,
        pointsPerHit: 150,
        hatch: { x: 13.5, y: 13.0 },
        launchAngle: -1.88,
        launchSpeed: 17,
        maxBalls: 3,
        cooldown: 5,
      },
      { type: 'bumper', id: 'bonus-1', powerCost: 1, x: 8.45, y: 6.2, r: 0.7, points: 300, kick: 16 },
      { type: 'bumper', id: 'bonus-2', powerCost: 1, x: 11.55, y: 6.2, r: 0.7, points: 300, kick: 16 },
      { type: 'gate', id: 'gate-jackpot-lane', powerCost: 1, ...JACKPOT_LANE_GATE, points: 500, label: 'JACKPOT LANE' },
      { type: 'spinner', id: 'spinner-left', powerCost: 1, ...LEFT_LANE_SPINNER, pointsPerSpin: 50, spinsPerSpeed: 0.7, maxSpins: 20 },
      { type: 'spinner', id: 'spinner-right', powerCost: 1, ...RIGHT_LANE_SPINNER, pointsPerSpin: 50, spinsPerSpeed: 0.7, maxSpins: 20 },
      { type: 'bank', id: 'bank-cards', powerCost: 1, name: 'BATTER UP', targetIds: CARD_BANK, bonus: 2000 },
      { type: 'bank', id: 'bank-stars', powerCost: 1, name: 'ALL-STAR', targetIds: STAR_BANK, bonus: 2000 },
    ],
    modifiers: {
      'bumper:*': [{ add: 50, note: 'Hot Corners' }, { mul: 2, note: 'Power Alley' }, { mul: 1.5, note: 'Rally Cap' }],
      jackpot: [{ mul: 3, note: 'Big Stage' }],
      'spinner:*': [{ mul: 2, note: 'Spin Doctor' }],
      'bank:*': [{ mul: 2, note: 'Full Count' }],
      'ramp-compact': [{ mul: 1.5, note: 'Nitro' }],
    },
  },
];

export function installedPower(p: Preset) {
  return p.mechanisms.reduce((s, m) => s + m.powerCost, 0);
}

export function validatePreset(p: Preset) {
  const installed = installedPower(p);
  return { installed, max: p.maxPower, ok: installed <= p.maxPower };
}

/** Last path segment picks the map: /1, /2, /3; anything else is the baseline. */
export function presetForPath(pathname: string): Preset {
  const seg = pathname.replace(/\/+$/, '').split('/').pop() ?? '';
  return PRESETS.find(p => p.route !== '' && p.route === seg) ?? PRESETS[0];
}

/** The roguelite build-loop experiment lives at /build-test/ (shares everything with the map routes). */
export function isBuildRoute(pathname: string) {
  return (pathname.replace(/\/+$/, '').split('/').pop() ?? '') === 'build-test';
}
