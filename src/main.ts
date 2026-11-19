import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800-italic.css';
import './style.css';
import { config } from './config.ts';
import { KEY_LEFT, KEY_RIGHT, TouchInput, makeControls } from './core/input.ts';
import { Simulation, type SimEvent } from './physics/sim.ts';
import { Telemetry } from './telemetry/session.ts';
import { GameView } from './view/game.ts';
import { theme } from './view/theme.ts';
import { PRESETS, presetForPath, validatePreset } from './machines/presets.ts';
import { Sfx } from './view/audio.ts';

// Map comes from the URL path: / baseline, /1 Sidewinder, /2 Overpass, /3 Powerhouse.
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

const sim: Simulation = new Simulation({
  preset,
  onEvent: (e: SimEvent) => {
    view.onSimEvent(e);
    sfx.onEvent(e);
    telemetry.onEvent(e, sim.time, sim.rules.ballScore, sim.rules.pitchNumber);
    // Extra multiball balls drain silently; only the last ball's drain ends the pitch.
    if (e.type === 'drain' && e.strike) onDrain();
  },
});
const view = new GameView(canvas, theme, sim.layout);
$('.strip .tag').textContent = preset.route ? `MAP ${preset.route} · ${preset.name.toUpperCase()}` : 'BASELINE';
document.title = `Baseball Pinball · ${preset.name}`;
const modCount = Object.values(preset.modifiers ?? {}).reduce((n, l) => n + l.length, 0);
$('#machineInfo').textContent = preset.route
  ? `${preset.name.toUpperCase()} · ${preset.tagline} · POWER ${power.installed}/${power.max}${modCount ? ` · ${modCount} TEST MODS` : ''}`
  : `BASELINE TABLE · POWER ${power.installed}/${power.max}`;

// ─── HUD ───
const hud = { ballscore: $('#ballscore'), score: $('#score'), state: $('#state'), strikes: $('#strikes') };
const shown = { ball: -1, score: -1, strikes: -1, state: '' };
function pulse(el: HTMLElement) {
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
  setTimeout(() => el.classList.remove('pulse'), 140);
}
function updateHud() {
  const r = sim.rules;
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
  const state = paused ? 'PAUSED' : r.phase === 'live' ? (n > 1 ? `PITCH ${r.pitchNumber} · ${n} BALLS` : `PITCH ${r.pitchNumber} · LIVE`) : r.phase === 'over' ? 'GAME OVER' : 'PRESS READY';
  if (state !== shown.state) {
    hud.state.textContent = state;
    shown.state = state;
  }
}

// ─── Flow ───
function showOverlay(kicker: string, title: string, text: string, button: string) {
  $('#overlayKicker').textContent = kicker;
  $('#overlayTitle').textContent = title;
  $('#overlayText').textContent = text;
  readyBtn.textContent = button;
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
readyBtn.addEventListener('click', onReady);
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
    if (k === 'enter' && !overlay.hidden && e.target !== readyBtn) {
      e.preventDefault();
      onReady();
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
w.playtest = {
  report: () => telemetry.report(),
  download: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(telemetry.report(), null, 2)], { type: 'application/json' }));
    a.download = 'playtest.json';
    a.click();
  },
};
