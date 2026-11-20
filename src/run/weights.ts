/**
 * Hybrid-weighted reward generation (Upgrade System 3.0). APPROVED PRINCIPLE, EXPERIMENTAL NUMBERS.
 *
 * Every candidate gets weight = base (wildcard floor) + family affinity + specific synergy, so:
 * - what the board already invests in (installed parts + modifier copies) is somewhat more likely,
 * - specific pairings (e.g. Turbo feeding bumpers → bumper bundles / Rally Fuel) occasionally surface,
 * - every other candidate keeps the base weight, so off-strategy pivots stay common.
 * Deterministic: the Run's seeded RNG is the only randomness.
 */
import type { BoardView, Family } from './catalog.ts';

export const OFFER_WEIGHTS = {
  /** Every candidate's floor (the wildcard share). */
  base: 1,
  /** Added per unit of investment in the candidate's family... */
  familyPerUnit: 0.5,
  /** ...up to this much (no lock-in: a heavy bumper build still sees other families often). */
  familyCap: 2,
  /** One installed part = 1 unit; one modifier copy = this many units. */
  modCopyUnit: 0.5,
  /** Added when a specific synergy rule matches the candidate. */
  synergy: 2,
  /** Shop rolls scale family + synergy terms by this (more exploratory than the free draft). */
  shopAffinityScale: 0.5,
  /** Chance a draft slot rolls a physical machine (when at least one machine is feasible). */
  draftMachineShare: 0.55,
};

/** A board fact that makes specific candidates more likely (soft, never guaranteed). */
export type Synergy = { id: string; when: (b: BoardView) => boolean; boosts: string[] };

export const SYNERGIES: Synergy[] = [
  // Turbo exits into the upper bumpers: bumper bundles and ride→bumper rewards fit it.
  { id: 'turbo-feeds-bumpers', when: b => b.parts.some(p => p.offerKey === 'turbo-ramp'), boosts: ['twin-bumpers', 'bumper-cluster', 'rally-fuel', 'momentum', 'bumper-crew', 'crowd-noise'] },
  // Any ramp: ramp-wide upgrades and a second route.
  { id: 'ramp-owner', when: b => b.parts.some(p => p.type === 'ramp'), boosts: ['express-track', 'grand-tour', 'rally-fuel', 'momentum', 'long-loop', 'turbo-ramp', 'bridge-ramp'] },
  // Multiplier gates: the other gate and gate-wide upgrades.
  { id: 'gate-owner', when: b => b.parts.some(p => p.type === 'multgate'), boosts: ['gate-network', 'express-lane', 'paired-gates', 'mult-gate'] },
  // Several bumpers installed: bumper-wide effects.
  { id: 'bumper-field', when: b => b.parts.filter(p => p.type === 'bumper').length >= 2, boosts: ['rally-cap', 'crowd-noise', 'standing-ovation', 'bumper-crew'] },
  // Banks: completion rewards.
  { id: 'bank-owner', when: b => b.parts.some(p => p.type === 'bank'), boosts: ['pennant', 'pennant-race', 'clutch', 'full-count', 'sharp-eye'] },
  // Jackpot lane gate: jackpot payouts.
  { id: 'jackpot-lane', when: b => b.parts.some(p => p.offerKey === 'jackpot-gate'), boosts: ['big-stage', 'gate-keeper'] },
  // Splitter: multiball means more bumper traffic.
  { id: 'multiball', when: b => b.parts.some(p => p.offerKey === 'splitter'), boosts: ['double-play', 'crowd-noise', 'bumper-crew'] },
];

/** Investment per family: installed parts + modifier copies (weighted). */
export function investment(board: BoardView, modFamilies: Family[]): Record<string, number> {
  const inv: Record<string, number> = {};
  for (const p of board.parts) inv[p.family] = (inv[p.family] ?? 0) + 1;
  for (const f of modFamilies) inv[f] = (inv[f] ?? 0) + OFFER_WEIGHTS.modCopyUnit;
  return inv;
}

export type Weighted = { weight: number; origin: 'synergy' | 'family' | 'wildcard'; synergies: string[] };

/** Weight one candidate (machine key or modifier template key) of a family. */
export function weigh(key: string, family: Family, board: BoardView, inv: Record<string, number>, where: 'draft' | 'shop'): Weighted {
  const W = OFFER_WEIGHTS;
  const scale = where === 'shop' ? W.shopAffinityScale : 1;
  const fam = Math.min(W.familyCap, (inv[family] ?? 0) * W.familyPerUnit) * scale;
  const syn = SYNERGIES.filter(s => s.boosts.includes(key) && s.when(board)).map(s => s.id);
  const synW = syn.length ? W.synergy * scale : 0;
  return { weight: W.base + fam + synW, origin: syn.length ? 'synergy' : fam > 0 ? 'family' : 'wildcard', synergies: syn };
}

/** Pick an index by weight with a [0,1) random number. */
export function pickWeighted(weights: number[], r: number) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < weights.length; i++) if ((x -= weights[i]) < 0) return i;
  return weights.length - 1;
}
