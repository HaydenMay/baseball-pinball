/**
 * Semantic color tokens. Every VFX and lit-machine color is pulled from a Theme, never hardcoded,
 * so future palettes (e.g. Toxic Thunder, Midnight Circuit) are a new object here and nothing else.
 * Themes are cosmetic only: they never touch collision, physics, scoring or timing.
 */
export type Theme = {
  name: string;
  /** Warm halo around activated machinery. */
  machineGlow: string;
  /** Main neon energy (ball trail, bat contact, slingshot pulse). */
  energyPrimary: string;
  /** Secondary neon energy (bumper rings, sparks). */
  energySecondary: string;
  /** White-hot center of an impact. */
  impactCore: string;
  /** Jackpot/high-value highlights and score flickers. */
  jackpotAccent: string;
  ballTrail: string;
  scoreboardAccent: string;
  /** Blue automatic slingshots. */
  slingBody: string;
  slingGlow: string;
  /** Rail bulbs / stadium warm light. */
  railLight: string;
};

export const BROADCAST_CLASSIC: Theme = {
  name: 'Broadcast Classic',
  machineGlow: '#ffb347',
  energyPrimary: '#3fd8ff',
  energySecondary: '#ff4fd8',
  impactCore: '#ffffff',
  jackpotAccent: '#ffd76a',
  ballTrail: '#6fe6ff',
  scoreboardAccent: '#ffcb5c',
  slingBody: '#1d5fd6',
  slingGlow: '#4fb2ff',
  railLight: '#ffd998',
};

/** The single active theme for this prototype. No runtime selector yet. */
export const theme: Theme = BROADCAST_CLASSIC;
