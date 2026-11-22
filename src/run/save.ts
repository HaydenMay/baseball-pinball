/**
 * Save & continue for the roguelite run (player-facing; separate from the developer run analytics).
 *
 * Policy (docs/PROTOTYPE_TO_PRODUCT_ROADMAP.md D-06, docs/product/1.0_SCOPE.md):
 *   - Saved only at safe points: a challenge's start card, between pitches (after a drain), the free pick,
 *     the shop (after every pick / buy / sale / reroll).
 *   - Reloading during a live pitch resumes from the last safe point, i.e. that pitch restarts with the score,
 *     strikes and multiplier it started with. No mid-pitch physics restore.
 *   - A finished run (won or failed) clears the save.
 *   - Local to this device and browser (localStorage); no cloud.
 *
 * Robustness: the file is versioned; an unreadable or unknown-version save is never deleted silently.
 * It's moved aside to a backup key and the player is told. Storage failures (private mode, quota) just
 * mean no save.
 */
import type { PitchCarry } from '../physics/sim.ts';
import type { RunSave } from './run.ts';

export const SAVE = {
  /** Bump when the shape changes; add a migration in `migrate` rather than discarding old saves. */
  schema: 1,
  keyPrefix: 'bp-save:',
  backupSuffix: ':unreadable',
};

export type SaveFile = {
  schema: number;
  savedAt: number;
  /** Route the run belongs to ('build-test' or 'build-test-legacy'); each route has its own save. */
  route: string;
  /** Build that wrote it (for support; not used for loading). */
  build?: string;
  run: RunSave;
  /** Present when saved between pitches of a challenge in progress. */
  pitch?: PitchCarry;
};

export type Store = { get(k: string): string | null; set(k: string, v: string): void; del(k: string): void };

export type LoadResult =
  | { ok: true; file: SaveFile }
  | { ok: false; reason: 'none' }
  | { ok: false; reason: 'unreadable' | 'newer'; detail: string };

/** localStorage, or a no-op store when storage is blocked. */
export function browserStore(): Store {
  try {
    const ls = window.localStorage;
    const probe = '__bp_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return { get: k => ls.getItem(k), set: (k, v) => ls.setItem(k, v), del: k => ls.removeItem(k) };
  } catch {
    return { get: () => null, set: () => {}, del: () => {} };
  }
}

export function saveKey(route: string) {
  return SAVE.keyPrefix + route;
}

/** Write a save; returns false if storage refused (the game carries on either way). */
export function writeSave(store: Store, file: Omit<SaveFile, 'schema' | 'savedAt'>, now = Date.now()) {
  try {
    store.set(saveKey(file.route), JSON.stringify({ schema: SAVE.schema, savedAt: now, ...file } satisfies SaveFile));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(store: Store, route: string) {
  try {
    store.del(saveKey(route));
  } catch {
    /* nothing to do */
  }
}

/** Older schemas → current. (Schema 1 is the first; future versions add steps here.) */
function migrate(f: SaveFile): SaveFile {
  return f;
}

function looksValid(f: SaveFile) {
  const r = f?.run;
  return (
    !!r &&
    Number.isInteger(r.challenge) && r.challenge >= 1 &&
    Number.isFinite(r.money) && Number.isInteger(r.maxPower) &&
    ['challenge', 'draft', 'shop'].includes(r.phase) &&
    Array.isArray(r.installed) && typeof r.mods === 'object' && r.mods !== null &&
    Array.isArray(r.draft) && Array.isArray(r.shop) && Array.isArray(r.sections) &&
    Number.isFinite(r.rng) && Number.isInteger(r.uid) && Number.isInteger(r.itemSeq) &&
    (f.pitch === undefined || (Number.isFinite(f.pitch.score) && Number.isInteger(f.pitch.strikes) && Number.isInteger(f.pitch.pitchNumber)))
  );
}

/** Read the save for a route. Unreadable/newer files are moved to a backup key (never just deleted). */
export function readSave(store: Store, route: string): LoadResult {
  let raw: string | null;
  try {
    raw = store.get(saveKey(route));
  } catch {
    return { ok: false, reason: 'none' };
  }
  if (!raw) return { ok: false, reason: 'none' };
  const aside = (reason: 'unreadable' | 'newer', detail: string): LoadResult => {
    try {
      store.set(saveKey(route) + SAVE.backupSuffix, raw!);
      store.del(saveKey(route));
    } catch {
      /* keep it where it is */
    }
    return { ok: false, reason, detail };
  };
  let f: SaveFile;
  try {
    f = JSON.parse(raw);
  } catch {
    return aside('unreadable', 'not valid JSON');
  }
  if (typeof f?.schema !== 'number') return aside('unreadable', 'no schema');
  if (f.schema > SAVE.schema) return aside('newer', `schema ${f.schema} > ${SAVE.schema}`);
  f = migrate(f);
  if (!looksValid(f)) return aside('unreadable', 'missing or invalid fields');
  return { ok: true, file: f };
}
