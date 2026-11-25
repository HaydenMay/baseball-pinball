/**
 * Run stats for the results screens (critic report: game over / victory had no stats, no best, no goal).
 * Pure data; fed by BuildUI from sim events; saved with the run; the device best lives in `bp-best`.
 */
import type { Store } from './save.ts';

export type RunStats = {
  /** Sum of every finished challenge's final score. */
  total: number;
  cleared: number;
  homeRuns: number;
  sweetSpots: number;
  /** Highest single-pitch score. */
  bestPitch: number;
  /** Peak multiplier, in tenths (10 = ×1.0). */
  peakMult: number;
};

export const newStats = (): RunStats => ({ total: 0, cleared: 0, homeRuns: 0, sweetSpots: 0, bestPitch: 0, peakMult: 10 });

export type Best = { total: number; cleared: number };
export const BEST_KEY = 'bp-best';
/** Quick Game keeps its own best (a 6-challenge total can't fairly compete with a 15-challenge one). */
export const QUICK_BEST_KEY = 'bp-best-quick';
export const bestKeyFor = (mode: 'full' | 'quick') => (mode === 'quick' ? QUICK_BEST_KEY : BEST_KEY);

export function readBest(store: Store | null, key = BEST_KEY): Best | null {
  try {
    const b = JSON.parse(store?.get(key) ?? 'null');
    return b && Number.isFinite(b.total) && Number.isFinite(b.cleared) ? { total: b.total, cleared: b.cleared } : null;
  } catch {
    return null;
  }
}

/** A run is better when it clears more challenges; ties go to the higher total. */
export const beats = (s: RunStats, b: Best | null) => !b || s.cleared > b.cleared || (s.cleared === b.cleared && s.total > b.total);

/** Record the finished run; returns true when it's a new device best. */
export function recordBest(store: Store | null, s: RunStats, key = BEST_KEY): boolean {
  const prev = readBest(store, key);
  if (!beats(s, prev) || s.total <= 0) return false;
  try {
    store?.set(key, JSON.stringify({ total: s.total, cleared: s.cleared }));
  } catch {
    /* private mode: no best kept */
  }
  return true;
}

/** Results grid HTML (numbers only; no user text, so no escaping needed). */
export function statsHtml(s: RunStats, last: number, best: Best | null, isNewBest: boolean, bestLabel = 'DEVICE BEST') {
  const f = (n: number) => Math.round(n).toLocaleString('en-US');
  const pips = Array.from({ length: last }, (_, i) => `<i class="${i < s.cleared ? 'on' : ''}"></i>`).join('');
  const cell = (label: string, v: string) => `<div><small>${label}</small><b>${v}</b></div>`;
  return `${isNewBest ? '<div class="res-best">NEW BEST!</div>' : ''}
    <div class="res-total"><small>RUN TOTAL</small><b>${f(s.total)}</b></div>
    <div class="res-pips" aria-label="${s.cleared} of ${last} challenges cleared">${pips}</div>
    <div class="res-grid">${cell('CLEARED', `${s.cleared}/${last}`)}${cell('BEST PITCH', f(s.bestPitch))}${cell('HOME RUNS', f(s.homeRuns))}${cell('SWEET SPOTS', f(s.sweetSpots))}${cell('PEAK MULT', `×${(s.peakMult / 10).toFixed(1)}`)}${cell(bestLabel, best ? f(best.total) : '—')}</div>`;
}
