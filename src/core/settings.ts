/**
 * Player settings (persisted on this device; separate from the run save).
 * Sound on/off lives in the audio module (its existing 'bp-muted' key); this holds the rest.
 */
export type Settings = {
  /** 'reduced' = fewer particles, softer flashes, no UI bounce animations (defaults to the OS reduced-motion setting). */
  effects: 'full' | 'reduced';
  /** First-time tips (src/run/coach.ts). */
  tips: boolean;
};

export const SETTINGS = {
  key: 'bp-settings',
  /** Particle/flash scale used when effects are reduced (1 = full). */
  reducedIntensity: 0.35,
};

function osPrefersReduced() {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function loadSettings(): Settings {
  const def: Settings = { effects: osPrefersReduced() ? 'reduced' : 'full', tips: true };
  try {
    const raw = localStorage.getItem(SETTINGS.key);
    if (!raw) return def;
    const s = JSON.parse(raw);
    return { effects: s.effects === 'reduced' || s.effects === 'full' ? s.effects : def.effects, tips: s.tips !== false };
  } catch {
    return def;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS.key, JSON.stringify(s));
  } catch {
    /* private mode: settings last for this visit */
  }
}

/** Effects scale for the VFX layer. */
export const effectsIntensity = (s: Settings) => (s.effects === 'reduced' ? SETTINGS.reducedIntensity : 1);
