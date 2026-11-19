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
import { type MechanismDef } from './mechanisms.ts';

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
};

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
    id: 'sidewinder',
    route: '1',
    name: 'Sidewinder',
    tagline: 'Wall-hugging ramp + precision gate',
    maxPower: MAX_POWER_TEST,
    // The ramp mouth needs the mid-right bumper's floor space.
    removeBase: ['bumper-mid'],
    mechanisms: [
      {
        type: 'ramp',
        id: 'ramp-side',
        name: 'SIDEWINDER',
        powerCost: 3,
        path: [
          { x: 16.4, y: 18.4 }, { x: 17.25, y: 16.2 }, { x: 17.95, y: 13.2 }, { x: 18.05, y: 9.0 }, { x: 17.95, y: 4.8 },
          { x: 17.25, y: 3.3 }, { x: 15.6, y: 2.75 }, { x: 10, y: 2.75 }, { x: 4.4, y: 2.75 }, { x: 2.7, y: 3.25 },
          { x: 1.8, y: 4.3 }, { x: 1.7, y: 5.1 },
        ],
        mouthWidth: 1.6,
        climb: 9,
        climbDecel: 11,
        minRide: 9,
        maxRide: 20,
        exitMin: 7,
        exitMax: 13,
        points: 500,
      },
      { type: 'gate', id: 'gate-left', powerCost: 1, a: { x: 4.85, y: 14.1 }, b: { x: 6.35, y: 14.1 }, dir: { x: 0, y: -1 }, points: 150, postR: 0.2 },
    ],
  },
  {
    id: 'overpass',
    route: '2',
    name: 'Overpass',
    tagline: 'Crossing ramp + glove scoop',
    maxPower: MAX_POWER_TEST,
    // The scoop replaces the glove bumper in the same spot.
    removeBase: ['glove'],
    mechanisms: [
      {
        type: 'ramp',
        id: 'ramp-over',
        name: 'OVERPASS',
        powerCost: 3,
        path: [
          { x: 14.6, y: 13.5 }, { x: 14.75, y: 11.7 }, { x: 14.5, y: 10.25 }, { x: 13.5, y: 9.5 }, { x: 10, y: 9.35 },
          { x: 6.5, y: 9.5 }, { x: 5.1, y: 10.1 }, { x: 4.4, y: 11.1 }, { x: 4.2, y: 12.2 },
        ],
        mouthWidth: 1.6,
        climb: 4,
        climbDecel: 12,
        minRide: 8,
        maxRide: 18,
        exitMin: 6,
        exitMax: 11,
        points: 300,
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
        ejectAngle: -0.95,
        ejectSpeed: 20,
        points: 200,
      },
    ],
  },
  {
    id: 'powerhouse',
    route: '3',
    name: 'Powerhouse',
    tagline: 'Compact ramp + multiball + bonus bumper',
    maxPower: MAX_POWER_TEST,
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
        points: 250,
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
        pointsPerHit: 75,
        hatch: { x: 13.5, y: 13.0 },
        launchAngle: -1.88,
        launchSpeed: 17,
        maxBalls: 3,
        cooldown: 5,
      },
      { type: 'bumper', id: 'bonus-1', powerCost: 1, x: 8.45, y: 6.2, r: 0.7, points: 150, kick: 16 },
    ],
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
