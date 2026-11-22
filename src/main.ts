import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800-italic.css';
import './style.css';
import { config } from './config.ts';
import { KEY_LEFT, KEY_RIGHT, TouchInput, makeControls } from './core/input.ts';
import { Simulation, type SimEvent } from './physics/sim.ts';
import { Telemetry } from './telemetry/session.ts';
import { RunRecorder, type RunRecord, type Store } from './telemetry/run-recorder.ts';
import { renderReport, reportFilename } from './telemetry/report-html.ts';
import { BUILD_INFO } from './telemetry/build-info.ts';
import { Camera, cameraBalls } from './view/camera.ts';
import { V2 } from './machines/sections.ts';
import { setupInstall } from './core/install.ts';
import { browserStore, clearSave, readSave, writeSave } from './run/save.ts';
import { GameView, VIEW } from './view/game.ts';
import { THEMES, applyThemeToCss, themeFromSearch } from './view/theme.ts';
import { glowCacheSize } from './view/vfx.ts';
import { PRESETS, isBuildRoute, isV2Route, presetForPath, validatePreset, type Preset } from './machines/presets.ts';
import { Sfx } from './view/audio.ts';
import { BuildUI } from './run/ui.ts';

// Map comes from the URL path: / baseline, /1 Sidewinder, /2 Overpass, /3 Turbo, /build-test/ roguelite loop.
const buildMode = isBuildRoute(location.pathname);
// Cosmetic palette: default Broadcast Classic; developer preview with ?theme=toxicThunder.
const theme = themeFromSearch(location.search);
applyThemeToCss(theme, document.documentElement);
const preset = presetForPath(location.pathname);
const power = validatePreset(preset);
console.info(`[machine] ${preset.name} · power ${power.installed}/${power.max}${power.ok ? '' : ' OVER BUDGET'}`, preset.mechanisms.map(m => `${m.id}:${m.powerCost}`));

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const canvas = $<HTMLCanvasElement>('#game');
const stage = $('#stage');
const overlay = $('#overlay');
const readyBtn = $<HTMLButtonElement>('#ready');
const pauseBtn = $<HTMLButtonElement>('#pause');

const controls = makeControls();
const touch = new TouchInput();
const keys = new Set<string>();
const telemetry = new Telemetry();
let paused = false;
const sfx = new Sfx();

function onSimEvent(e: SimEvent) {
  view.onSimEvent(e);
  sfx.onEvent(e);
  telemetry.onEvent(e, sim.time, sim.rules.ballScore, sim.rules.pitchNumber, sim);
  // Extra multiball balls drain silently; only the last ball's drain ends the pitch.
  if (e.type === 'drain' && e.strike) onDrain();
  if (e.type === 'clear') build?.onClear();
  if (e.type === 'mult') procMult();
}
function makeSim(p: Preset, target: number | null) {
  const s = new Simulation({ preset: p, seed: (Math.random() * 2 ** 32) >>> 0, onEvent: onSimEvent });
  s.rules.target = target;
  (window as any).sim = s;
  return s;
}
let sim: Simulation = makeSim(preset, null);
const view = new GameView(canvas, theme, sim.layout);
const v2 = isV2Route(location.pathname, location.search);
$('.strip .tag').textContent = preset.route ? `MAP ${preset.route} · ${preset.name.toUpperCase()}` : buildMode ? (v2 ? 'PLAY BALL' : 'LEGACY') : 'BASELINE';
// The run route is what playtesters see: no "prototype/test" wording there (the legacy and map routes keep theirs).
document.title = buildMode ? (v2 ? 'Baseball Pinball' : 'Baseball Pinball · Legacy run') : `Baseball Pinball · ${preset.name}`;
if (buildMode) $('aside .badge').textContent = v2 ? 'EARLY ACCESS PLAYTEST' : 'LEGACY RUN';
const modCount = Object.values(preset.modifiers ?? {}).reduce((n, l) => n + l.length, 0);
$('#machineInfo').textContent = preset.route
  ? `${preset.name.toUpperCase()} · ${preset.tagline} · POWER ${power.installed}/${power.max}${modCount ? ` · ${modCount} TEST MODS` : ''}`
  : `BASELINE TABLE · POWER ${power.installed}/${power.max}`;

// ─── HUD ───
const hud = { mult: $('#mult'), multWrap: $('#multwrap'), ballscore: $('#ballscore'), score: $('#score'), state: $('#state'), strikes: $('#strikes'), target: $('#target'), scoreLabel: $('#scoreLabel'), bar: $('#targetBar') };
const shown = { mult: -1, ball: -1, score: -1, strikes: -1, state: '', target: null as number | null | undefined };
function pulse(el: HTMLElement) {
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
  setTimeout(() => el.classList.remove('pulse'), 140);
}
/** "x1.0" from integer tenths: never shows float noise. */
const fmtMult = (tenths: number) => `x${Math.floor(tenths / 10)}.${tenths % 10}`;
/** Restart the plaque animation on every proc; a burst of procs never queues a backlog. */
function procMult() {
  hud.multWrap.classList.remove('proc');
  void hud.multWrap.offsetWidth;
  hud.multWrap.classList.add('proc');
}
hud.multWrap.addEventListener('animationend', e => {
  if ((e.target as HTMLElement).classList.contains('mult')) hud.multWrap.classList.remove('proc');
});
function updateHud() {
  const r = sim.rules;
  // Always the actual global multiplier (persists across strikes, resets per challenge; shared in multiball).
  if (r.multTenths !== shown.mult) {
    hud.mult.textContent = fmtMult(r.multTenths);
    shown.mult = r.multTenths;
  }
  if (r.target !== shown.target) {
    hud.target.hidden = r.target === null;
    hud.target.textContent = r.target === null ? '' : `/ ${r.target.toLocaleString()}`;
    hud.scoreLabel.textContent = r.target === null ? 'SCORE' : 'SCORE / TARGET';
    shown.target = r.target;
  }
  if (r.target !== null) hud.bar.style.width = `${Math.min(100, (r.score / r.target) * 100)}%`;
  if (r.ballScore !== shown.ball) {
    if (r.ballScore > shown.ball && shown.ball >= 0) pulse(hud.ballscore);
    hud.ballscore.textContent = r.ballScore.toLocaleString();
    shown.ball = r.ballScore;
  }
  if (r.score !== shown.score) {
    if (r.score > shown.score && shown.score >= 0) pulse(hud.score);
    hud.score.textContent = r.score.toLocaleString();
    shown.score = r.score;
  }
  if (r.strikes !== shown.strikes) {
    hud.strikes.innerHTML = Array.from({ length: r.maxStrikes }, (_, i) => `<i class="${i < r.strikes ? 'on' : ''}"></i>`).join('');
    shown.strikes = r.strikes;
  }
  const n = sim.balls.length;
  const state = paused ? 'PAUSED' : r.phase === 'cleared' ? 'CLEARED!' : r.phase === 'live' ? (n > 1 ? `PITCH ${r.pitchNumber} · ${n} BALLS` : `PITCH ${r.pitchNumber} · LIVE`) : r.phase === 'over' ? 'GAME OVER' : 'PRESS READY';
  if (state !== shown.state) {
    hud.state.textContent = state;
    shown.state = state;
  }
}

// ─── Flow ───
let overlayAction: () => void = () => onReady();
/** Secondary overlay action (e.g. NEW RUN next to CONTINUE); hidden unless a screen asks for it. */
const altBtn = document.createElement('button');
altBtn.type = 'button';
altBtn.id = 'overlayAlt';
altBtn.className = 'alt-btn';
altBtn.hidden = true;
let altAction: () => void = () => {};
altBtn.addEventListener('click', () => altAction());
readyBtn.after(altBtn);
function showOverlay(kicker: string, title: string, text: string, button: string, action: () => void = () => onReady(), info?: string, alt?: { label: string; action: () => void }) {
  altBtn.hidden = !alt;
  if (alt) {
    altBtn.textContent = alt.label;
    altAction = alt.action;
  }
  $('#overlayKicker').textContent = kicker;
  $('#overlayTitle').textContent = title;
  $('#overlayText').textContent = text;
  if (info !== undefined) $('#machineInfo').textContent = info;
  // dev report button (created later; looked up so this is safe before it exists)
  for (const el of document.querySelectorAll<HTMLElement>('#devReport, .dev-hint')) el.hidden = true;
  readyBtn.textContent = button;
  overlayAction = action;
  overlay.hidden = false;
  readyBtn.focus({ preventScroll: true });
}
function onReady() {
  sfx.unlock();
  if (paused) return togglePause();
  if (!sim.ready()) return;
  overlay.hidden = true;
  readyBtn.blur();
  keys.clear();
  controls.moveAxis = 0;
  controls.dragDelta = 0;
  touch.clear();
}
function onDrain() {
  const r = sim.rules;
  if (build && r.phase === 'over') return build.onFail();
  if (build) {
    // safe point: between pitches of this challenge (a reload resumes here, before the next pitch)
    if (r.phase === 'ready') build.savePitch(sim.carryState());
    const left = (r.target ?? 0) - r.score;
    return showOverlay(`STRIKE ${r.strikes}`, 'BALL DRAINED', `+${r.ballScore.toLocaleString()} banked. ${left.toLocaleString()} to go for this challenge.`, 'READY');
  }
  if (r.phase === 'over') showOverlay('THREE STRIKES', 'GAME OVER', `Final score ${r.score.toLocaleString()}. Run it back?`, 'PLAY AGAIN');
  else showOverlay(`STRIKE ${r.strikes}`, 'BALL DRAINED', r.ballScore > 0 ? `+${r.ballScore.toLocaleString()} banked. Batter re-centers for the next pitch.` : 'No points that ball. Batter re-centers for the next pitch.', 'READY');
}
function togglePause() {
  if (sim.rules.phase !== 'live') return;
  paused = !paused;
  keys.clear();
  touch.clear();
  pauseBtn.textContent = paused ? '▶' : 'II';
  pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  if (paused) showOverlay('TIMEOUT', 'PAUSED', 'Take a breath.', 'RESUME');
  else {
    overlay.hidden = true;
    readyBtn.blur();
  }
}
readyBtn.addEventListener('click', () => overlayAction());
const muteBtn = $<HTMLButtonElement>('#mute');
const showMute = () => {
  muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-label', sfx.muted ? 'Unmute sound' : 'Mute sound');
};
showMute();
muteBtn.addEventListener('click', () => {
  sfx.unlock();
  sfx.setMuted(!sfx.muted);
  showMute();
  muteBtn.blur();
});
pauseBtn.addEventListener('click', () => {
  togglePause();
  pauseBtn.blur();
});

// ─── Keyboard ───
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === '`') {
    view.debug = !view.debug;
    return;
  }
  if (k === 'm') {
    muteBtn.click();
    return;
  }
  if (k === 'p' || k === 'escape') {
    togglePause();
    return;
  }
  if (sim.rules.phase !== 'live' || paused) {
    // Enter always confirms the Ready card (the focused button already handles its own Enter/Space).
    if (k === 'enter' && !overlay.hidden && e.target !== readyBtn && e.target !== altBtn) {
      e.preventDefault();
      overlayAction();
    }
    return;
  }
  if (k === ' ' || KEY_LEFT.has(k) || KEY_RIGHT.has(k)) e.preventDefault();
  keys.add(k);
  if (k === ' ' && !e.repeat) controls.swingPressed = true;
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => {
  keys.clear();
  touch.clear();
});

// ─── Touch / pointer: only the playfield canvas accepts gameplay input ───
document.addEventListener('touchmove', e => {
  if (sim.rules.phase === 'live') e.preventDefault();
}, { passive: false });
canvas.addEventListener('pointerdown', e => {
  sfx.unlock();
  if (sim.rules.phase !== 'live' || paused) return;
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const kind = touch.down(e.pointerId, e.clientX - r.left, r.width);
  if (kind) canvas.setPointerCapture(e.pointerId);
  if (kind === 'swing') controls.swingPressed = true;
});
canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect();
  const dx = touch.move(e.pointerId, e.clientX - r.left);
  if (dx) controls.dragDelta += view.cssToWorld(dx, r.width) * 1.15;
});
for (const n of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
  canvas.addEventListener(n, e => touch.up(e.pointerId));
}
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ─── Sizing ───
function resize() {
  view.resize(stage.getBoundingClientRect().width);
}
new ResizeObserver(resize).observe(stage);
resize();
document.fonts?.ready.then(() => view.drawStatic());

// ─── Loop: fixed-step physics, render every animation frame ───
const STEP = 1 / config.physicsHz;
let last = 0, acc = 0;
function tick(ms: number) {
  const delta = last ? Math.min((ms - last) / 1000, 0.05) : 0;
  last = ms;
  telemetry.frame(delta * 1000);
  telemetry.active(delta * 1000, !paused && sim.rules.phase === 'live');
  if (!paused) {
    controls.moveAxis = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    acc += delta;
    while (acc >= STEP) {
      sim.step(STEP, controls);
      acc -= STEP;
    }
  }
  view.draw(sim, paused ? 0 : delta);
  updateHud();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
updateHud();
readyBtn.focus({ preventScroll: true });
if (new URLSearchParams(location.search).has('debug')) view.debug = true;

// ─── Dev hooks ───
const w = window as any;
w.tune = config;
w.sim = sim;
w.preset = preset;
w.presets = PRESETS;
w.theme = theme;
w.glowCacheSize = glowCacheSize;
/** Dev only: setTheme('toxicThunder') re-renders the cached layers once; no menu, nothing saved. */
w.setTheme = (id: keyof typeof THEMES) => {
  const t = THEMES[id];
  if (!t) return false;
  view.setTheme(t);
  applyThemeToCss(t, document.documentElement);
  w.theme = t;
  return true;
};
/**
 * Dev only: live color tuning without a rebuild. Every theme color is a named role, so:
 *   tuneTheme('m.bumperBody.0', '#ff8a3d')   // one value (dot path, array index allowed)
 *   tuneTheme({ machineGlow: '#ff00aa', m: { turf: ['#123', '#234', '#123'] } })   // merge many
 *   dumpTheme()   // copies the tuned palette as JSON, ready to paste into src/view/theme.ts
 * Works on a copy of the active theme; reload to discard. Nothing is saved.
 */
w.tuneTheme = (pathOrPatch: string | Record<string, unknown>, value?: unknown) => {
  const t = structuredClone(w.theme);
  const merge = (dst: any, src: any) => {
    for (const [k, v] of Object.entries(src)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') merge(dst[k], v);
      else dst[k] = v;
    }
  };
  if (typeof pathOrPatch === 'string') {
    const keys = pathOrPatch.split('.');
    let o: any = t;
    for (const k of keys.slice(0, -1)) {
      if (o[k] === undefined) return `unknown role: ${pathOrPatch}`;
      o = o[k];
    }
    const last = keys[keys.length - 1];
    if (!(last in o)) return `unknown role: ${pathOrPatch}`;
    o[last] = value;
  } else merge(t, pathOrPatch);
  view.setTheme(t);
  applyThemeToCss(t, document.documentElement);
  w.theme = t;
  return true;
};
w.dumpTheme = () => {
  const json = JSON.stringify(w.theme, null, 2);
  navigator.clipboard?.writeText(json).catch(() => {});
  return json;
};
w.playtest = {
  report: () => telemetry.report(),
  download: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(telemetry.report(), null, 2)], { type: 'application/json' }));
    a.download = 'playtest.json';
    a.click();
  },
};

// ─── V2 fixed-anchor zoom camera (build test, ?v2=1 while it's being proven) ───
if (v2) {
  V2.enabled = true;
  view.enableCamera(new Camera(VIEW));
  /**
   * Dev harness: `v2cam.probe([{x:10,y:-6},{x:10,y:24}], 3)` frames those points for 3 s (no physics
   * change) so the zoom can be checked without the annexes; `v2cam.stats()` for metrics.
   */
  w.v2cam = {
    probe(points: { x: number; y: number }[], seconds = 3) {
      view.cameraProbe = points;
      setTimeout(() => (view.cameraProbe = null), seconds * 1000);
    },
    clear: () => (view.cameraProbe = null),
    get zoom() {
      return view.camera?.zoom;
    },
    stats: () => ({ ...view.camera!.stats, zoom: view.camera!.zoom, wanted: view.camera!.wanted }),
  };
  /**
   * `?v2=1&camdemo=1`: until the annexes exist no real ball can leave the table, so a ghost ball
   * (display only, no physics) repeatedly flies above the table and falls back to the bat while you play.
   * Lets the zoom out/in be felt on a phone. The ghost is drawn as a ring.
   */
  if (new URLSearchParams(location.search).get('camdemo') === '1') {
    const PERIOD = 6;
    let t0 = performance.now();
    const ghost = () => {
      const t = ((performance.now() - t0) / 1000) % PERIOD;
      // launched from the top wall at 14 u/s up, falls under game gravity back to the hands line
      const vy0 = -14, y0 = 1.5, g = config.gravity;
      const y = Math.min(config.batter.handsY, y0 + vy0 * t + 0.5 * g * t * t);
      return { x: 10 + 3 * Math.sin(t * 1.3), y, vx: 0, vy: vy0 + g * t };
    };
    const loop = () => {
      if (!paused && sim.rules.phase === 'live') view.cameraProbe = [...cameraBalls(sim), ghost()];
      else {
        view.cameraProbe = null;
        t0 = performance.now();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// ─── Developer run analytics (build test only; silent unless ?devAnalytics=1 shows the download) ───
/** localStorage wrapper; any failure (private mode, quota) just means memory-only reports. */
const localStore: Store | null = (() => {
  try {
    const ls = window.localStorage;
    const k = '__bp_probe';
    ls.setItem(k, '1');
    ls.removeItem(k);
    return { get: k2 => ls.getItem(k2), set: (k2, v) => ls.setItem(k2, v), remove: k2 => ls.removeItem(k2) };
  } catch {
    return null;
  }
})();
const devAnalytics = new URLSearchParams(location.search).get('devAnalytics') === '1';
const recorder: RunRecorder | null = buildMode ? new RunRecorder({ store: localStore, build: BUILD_INFO }) : null;
telemetry.run = recorder;
const devBtn = document.createElement('button');
devBtn.type = 'button';
devBtn.id = 'devReport';
devBtn.className = 'dev-report';
devBtn.hidden = true;
const devHint = document.createElement('p');
devHint.className = 'hint dev-hint';
devHint.hidden = true;
devHint.textContent = 'iPhone: if a preview opens, use Share → Save to Files.';
readyBtn.after(devBtn, devHint);
// Home Screen install: manifest/icons on every route; the tip only on the player-facing run route
setupInstall({ showTip: v2, anchor: $('#machineInfo') });
let devGet: () => RunRecord | null = () => null;
devBtn.addEventListener('click', () => downloadReport(devGet()));

/** Download one run as a self-contained HTML file. Must be called from a tap/click (iOS needs a gesture). */
function downloadReport(r: RunRecord | null) {
  if (!r) return false;
  const url = URL.createObjectURL(new Blob([renderReport(r)], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = reportFilename(r);
  a.rel = 'noopener';
  document.body.appendChild(a);
  if ('download' in a) a.click();
  else window.open(url, '_blank');
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
// Leaving or reloading: save what we have (an unfinished pitch is later marked "interrupted", never finished).
addEventListener('pagehide', () => recorder?.save());
w.playtest.run = () => recorder?.snapshot() ?? null;
w.playtest.lastRun = () => recorder?.lastRun() ?? null;
/** `playtest.downloadHtml()` = current run; `playtest.downloadHtml('last')` = archived previous/interrupted run. */
w.playtest.runs = () => recorder?.archivedRuns().map(r => ({ runId: r.runId, outcome: r.outcome, challenges: r.challenges.length, startedAt: new Date(r.startedAt).toLocaleString() })) ?? [];
/**
 * `playtest.downloadHtml()` = current run; `'last'` = most recent archived (failed/interrupted) run;
 * a number = that index in `playtest.runs()`. Run it from a click/console (iOS needs a user gesture).
 */
w.playtest.downloadHtml = (which: 'current' | 'last' | number = 'current') =>
  downloadReport(which === 'current' ? (recorder?.snapshot() ?? null) : (recorder?.archivedRuns()[which === 'last' ? 0 : which] ?? null));

// ─── Build-test roguelite loop (/build-test/) ───
// Save & continue (player-facing, local to this browser; one save per run route)
const saveStore = browserStore();
const saveRoute = location.pathname.replace(/\/+$/, '').split('/').pop() || 'build-test';
const build: BuildUI | null = buildMode
  ? new BuildUI(
      {
        view,
        getSim: () => sim,
        loadMachine: (p, target) => {
          sim = makeSim(p, target);
          view.setLayout(sim.layout);
          shown.score = shown.ball = shown.strikes = -1;
          shown.target = undefined;
        },
        showOverlay,
        hideOverlay: () => {
          overlay.hidden = true;
          readyBtn.blur();
        },
        setTag: t => ($('.strip .tag').textContent = t),
        startPitch: () => onReady(),
        recorder,
        theme: theme.id,
        saveRun: (run, pitch) => writeSave(saveStore, { route: saveRoute, build: BUILD_INFO.commit.slice(0, 7), run: run.toSave(), ...(pitch ? { pitch } : {}) }),
        clearRun: () => clearSave(saveStore, saveRoute),
        devReport: (label, get) => {
          if (!devAnalytics) return;
          devGet = get;
          devBtn.textContent = label;
          devBtn.hidden = devHint.hidden = false;
        },
      },
      stage,
    )
  : null;
build?.boot(readSave(saveStore, saveRoute));
(window as any).build = build;
// V2 dev helper (?v2=1 only): grow the machine now instead of clearing C3 first. `v2dev.grow()` then READY.
if (v2 && build) {
  (window as any).v2dev = {
    grow() {
      const r = (window as any).buildRun as import('./run/run.ts').Run;
      if (!r.sections.includes('upperDeck')) r.sections.push('upperDeck');
      sim = makeSim(r.preset(), r.target);
      view.setLayout(sim.layout);
      return r.sections;
    },
  };
}
