import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800-italic.css';
import './style.css';
import { BRAND } from './core/brand.ts';
import { Coach, TipBook } from './run/coach.ts';
import { Juice, JUICE, type MomentKind } from './view/juice.ts';
import { PLAY } from './core/play-rules.ts';
import { CALLED_SHOT, HOT_CORNER, SMALL_BALL } from './core/bosses.ts';
import { ECONOMY } from './run/economy.ts';
import { config } from './config.ts';
import { KEY_LEFT, KEY_RIGHT, TouchInput, makeControls } from './core/input.ts';
import { Simulation, type SimEvent } from './physics/sim.ts';
import { Telemetry } from './telemetry/session.ts';
import { RunRecorder, type RunRecord, type Store } from './telemetry/run-recorder.ts';
import { renderReport, reportFilename } from './telemetry/report-html.ts';
import { playtestName, reportText, shareReport } from './telemetry/playtest.ts';
import { BUILD_INFO } from './telemetry/build-info.ts';
import { Camera, cameraBalls } from './view/camera.ts';
import { V2 } from './machines/sections.ts';
import { appRootFor, setupInstall } from './core/install.ts';
import { browserStore, clearSave, readSave, writeSave } from './run/save.ts';
import { TitleScreen } from './run/title.ts';
import { Haptics, type HapticKind } from './core/haptics.ts';
import { effectsIntensity, loadSettings, saveSettings, type Settings } from './core/settings.ts';
import { GameView, VIEW } from './view/game.ts';
import { BROADCAST_CLASSIC, NIGHT_GAME, THEMES, applyThemeToCss, themeFromSearch } from './view/theme.ts';
import { glowCacheSize } from './view/vfx.ts';
import { PRESETS, isBuildRoute, isV2Route, saveRouteFor, presetForPath, validatePreset, type Preset } from './machines/presets.ts';
import { Sfx } from './view/audio.ts';
import { BuildUI } from './run/ui.ts';

// Map comes from the URL path: / baseline, /1 Sidewinder, /2 Overpass, /3 Turbo, /build-test/ roguelite loop.
const buildMode = isBuildRoute(location.pathname);
// Cosmetic palette. Player route (/build-test/): Night Game (neon) by default, Day (Broadcast Classic)
// in Settings → Look. Other routes: Broadcast Classic. ?theme=<id> always wins (developer preview).
const isPlayerRoute = buildMode && isV2Route(location.pathname, location.search);
function themeFor(look: 'night' | 'day') {
  if (/[?&]theme=/.test(location.search)) return themeFromSearch(location.search);
  return isPlayerRoute && look === 'night' ? NIGHT_GAME : BROADCAST_CLASSIC;
}
let theme = themeFor(loadSettings().look);
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
  build?.onSimEvent(e);
  if (e.type === 'mult') procMult();
  if (coach) {
    if (e.type === 'swing') coach.onSwing();
    else if (e.type === 'bat') coach.onHit();
    else if ((e.type === 'drain' && (e.strike || e.foul)) || e.type === 'clear') coach.pause();
  }
  // Extra multiball balls drain silently; only the last ball's drain ends the pitch.
  if (player) buzzFor(e);
  if (juice) {
    // Big moments (presentation only); end-of-pitch moments hold their card for a short beat.
    if (e.type === 'bat') {
      juice.hitStop();
      if (e.sweet) {
        juice.play('sweet');
        // sweet spot: a popup at the bat (drawn under the ball), no banner
        view.vfx.flicker(e.x, e.y - 1.2, `SWEET +${(e.sweetPoints ?? PLAY.sweetSpot.points).toLocaleString('en-US')}`, theme.energyPrimary, 1.0);
        sfx.moment('sweet');
      }
    } else if (e.type === 'deckRally' && e.phase === 'start') {
      juice.play('homeRun');
      sfx.moment('homeRun');
    } else if (e.type === 'hot' && !e.first && sim.rules.phase === 'live') {
      juice.play('hotMove', undefined, e.label);
      sfx.moment('hotMove');
    } else if (e.type === 'called' && e.phase !== 'call') {
      juice.play(e.phase === 'hit' ? 'calledHit' : 'calledMiss');
      sfx.moment(e.phase === 'hit' ? 'calledHit' : 'calledMiss');
    } else if (e.type === 'runners' && e.phase === 'in' && e.banked > 0) {
      juice.play('driveIn', e.banked);
      sfx.moment('driveIn');
    } else if (e.type === 'runners' && e.phase === 'stranded' && e.onBase > 0) {
      view.vfx.flicker(e.x, e.y, e.banked > 0 ? `STRANDED +${e.banked.toLocaleString('en-US')}` : `${Math.round(e.onBase).toLocaleString('en-US')} STRANDED`, undefined, 1.2);
    } else if (e.type === 'machine' && e.kind === 'jackpot') juice.play('jackpot', e.points);
    else if (e.type === 'multiball') juice.play('multiball');
    else if (e.type === 'bank') juice.play('bank', e.points);
    else if (e.type === 'clear') {
      const final = !!build && build.run.challenge >= build.run.lastChallenge;
      return beat(final ? 'runComplete' : 'cleared', () => build?.onClear());
    } else if (e.type === 'drain' && e.foul) return beat('foul', onFoul);
    else if (e.type === 'drain' && e.strike) return beat(sim.rules.phase === 'over' ? 'gameOver' : 'strike', onDrain, sim.rules.strikes);
  }
  if (e.type === 'drain' && e.strike) onDrain();
  if (e.type === 'clear') build?.onClear();
}
/** Vibration for the events worth feeling (player route, Settings → Vibration). */
const haptics = new Haptics();
function buzzFor(e: SimEvent) {
  let k: HapticKind | null = null;
  if (e.type === 'bat') k = e.sweet ? 'sweet' : 'bat';
  else if (e.type === 'deckRally' && e.phase === 'start') k = 'homeRun';
  else if (e.type === 'machine' && e.kind === 'jackpot') k = 'jackpot';
  else if (e.type === 'called' && e.phase === 'hit') k = 'calledHit';
  else if (e.type === 'clear') k = build && build.run.challenge >= build.run.lastChallenge ? 'runComplete' : 'cleared';
  else if (e.type === 'drain' && e.strike && !e.foul) k = sim.rules.phase === 'over' ? 'gameOver' : 'strike';
  if (k) haptics.buzz(k);
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
// First-time tips only on the player route (frozen/legacy routes stay as they were).
const coach: Coach | null = v2 && buildMode ? new Coach(stage, new TipBook(browserStore())) : null;
// Player-route batting rules (whiff lockout, sweet spot, foul ball) and big-moment presentation.
const player = v2 && buildMode;
PLAY.enabled = player;
sfx.useSamples = player;
sfx.sampleRoot = appRootFor(location.pathname);
const juice: Juice | null = player ? new Juice(stage, canvas, document.querySelector<HTMLElement>('.scoreboard')) : null;
view.bigMoments = !!juice;
view.setGloveAsBall(player);
/** A moment's beat is playing before its card (READY is held until the card shows). */
let beatTimer = 0;
let beatPending = false;
/** Title screen attract mode: the rail bulbs chase, cycling through the theme's neon colors. */
const ATTRACT = { cycleSec: 1.4 };
function attractChase() {
  if (!title?.open) return null;
  const colors = [theme.energySecondary, theme.energyPrimary, theme.jackpotAccent];
  return { color: colors[Math.floor(performance.now() / 1000 / ATTRACT.cycleSec) % colors.length], left: 1 };
}
function beat(kind: MomentKind, then: () => void, n?: number) {
  juice!.play(kind, n);
  sfx.moment(kind);
  beatPending = true;
  clearTimeout(beatTimer);
  beatTimer = window.setTimeout(() => {
    beatPending = false;
    then();
  }, JUICE.beatMs[kind as keyof typeof JUICE.beatMs] ?? 700);
}
$('.strip .tag').textContent = preset.route ? `MAP ${preset.route} · ${preset.name.toUpperCase()}` : buildMode ? (v2 ? 'PLAY BALL' : 'LEGACY') : 'BASELINE';
// The run route is what playtesters see: no "prototype/test" wording there (the legacy and map routes keep theirs).
document.title = buildMode ? (v2 ? BRAND.name : `${BRAND.name} · Legacy run`) : `${BRAND.name} · ${preset.name}`;
// The player route shows no badge (release); the legacy run keeps its label.
if (buildMode) {
  const badge = $('aside .badge');
  badge.textContent = v2 ? '' : 'LEGACY RUN';
  badge.hidden = v2;
}
const modCount = Object.values(preset.modifiers ?? {}).reduce((n, l) => n + l.length, 0);
$('#machineInfo').textContent = preset.route
  ? `${preset.name.toUpperCase()} · ${preset.tagline} · POWER ${power.installed}/${power.max}${modCount ? ` · ${modCount} TEST MODS` : ''}`
  : `BASELINE TABLE · POWER ${power.installed}/${power.max}`;

// ─── HUD ───
const hud = { mult: $('#mult'), multWrap: $('#multwrap'), ballscore: $('#ballscore'), score: $('#score'), state: $('#state'), strikes: $('#strikes'), target: $('#target'), scoreLabel: $('#scoreLabel'), bar: $('#targetBar') };
const shown = { mult: -1, ball: -1, score: -1, strikes: -1, state: '', closer: '', target: null as number | null | undefined };
/** Closer rule status line (top of the table). */
const closerLine = document.createElement('div');
closerLine.className = 'closer-line';
closerLine.hidden = true;
closerLine.setAttribute('aria-live', 'polite');
document.querySelector('#stage')!.appendChild(closerLine);
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
/** Closer rule status for the strip during a live pitch ('' = none). */
function closerState() {
  switch (sim.boss) {
    case 'hotCorner':
      return sim.hot ? `×${HOT_CORNER.hot} ${sim.hot.label} ${Math.ceil(sim.hot.left)}s` : '';
    case 'smallBall':
      return `SMALL BALL · SWEET ×${SMALL_BALL.sweet}`;
    case 'calledShot': {
      const c = sim.called;
      if (!c) return '';
      return c.status === 'hit' ? `CALLED SHOT ×${CALLED_SHOT.factor}` : c.status === 'missed' ? 'CALL MISSED' : `CALLED: ${c.label}`;
    }
    case 'rainDelay':
      return 'RAIN DELAY';
    case 'runnersOnBase':
      return `ON BASE ${Math.round(sim.onBase).toLocaleString('en-US')}`;
    default:
      return '';
  }
}
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
  const runEnd = build?.run.phase === 'won' ? 'RUN COMPLETE' : build?.run.phase === 'failed' ? 'GAME OVER' : '';
  // Closer rule status: where the ×3 is and when it moves
  const hotState = r.phase === 'live' ? closerState() : '';
  hud.multWrap.classList.toggle('locked', sim.boss === 'smallBall');
  // The Closer rule gets its own full-width line over the table (the strip is too narrow on a phone)
  if (hotState !== shown.closer) {
    shown.closer = hotState;
    closerLine.textContent = hotState;
    closerLine.hidden = !hotState;
  }
  const state = paused ? 'PAUSED' : runEnd ? runEnd : r.phase === 'cleared' ? 'CLEARED!' : r.phase === 'live' ? (n > 1 ? `PITCH ${r.pitchNumber} · ${n} BALLS` : `PITCH ${r.pitchNumber}`) : r.phase === 'over' ? 'GAME OVER' : 'PRESS READY';
  // Pause only means something during a live pitch (it used to sit there on the game-over card).
  const canPause = paused || r.phase === 'live';
  if (pauseBtn.disabled === canPause) pauseBtn.disabled = !canPause;
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
/** Playtest mode (?playtest=<name>): a SEND PLAYTEST REPORT button on end cards and the pause menu. */
const shareBtn = document.createElement('button');
shareBtn.type = 'button';
shareBtn.className = 'share-btn';
shareBtn.hidden = true;
shareBtn.textContent = 'SEND PLAYTEST REPORT';
altBtn.after(shareBtn);
function offerShare() {
  if (tester && recorder) shareBtn.hidden = false;
}
/** Has this session thrown a pitch yet (controls hints retire after it). */
let pitchedOnce = false;
function showOverlay(kicker: string, title: string, text: string, button: string, action: () => void = () => onReady(), info?: string, alt?: { label: string; action: () => void }) {
  altBtn.hidden = !alt;
  shareBtn.hidden = true;
  juice?.hideBanner();
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
  // Controls hints belong on the cards before the first pitch only (not on strike / clear / game-over cards).
  for (const el of document.querySelectorAll<HTMLElement>('#overlay .hint')) el.classList.toggle('spent', pitchedOnce);
  // First-time tips that would cover the table mid-play are shown on the next card instead.
  const tip = coach?.cardTip(sim.layout.sections.includes('upperDeck')) ?? '';
  const tipEl = $('#overlayTip');
  tipEl.innerHTML = tip;
  tipEl.hidden = !tip;
  $('#overlayStats').hidden = true;
  overlay.hidden = false;
  readyBtn.focus({ preventScroll: true });
}
function onReady() {
  sfx.unlock();
  if (paused) return togglePause();
  if (beatPending) return;
  if (!sim.ready()) return;
  pitchedOnce = true;
  coach?.onPitch(sim.layout.sections.includes('upperDeck'));
  juice?.reset();
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
/**
 * Save during a live pitch (pause, app switch, page close). The pitch's points so far are kept and the run
 * resumes at READY on the next pitch, with no strike: an interruption should never cost a phone player.
 */
function saveMidPitch() {
  if (player && build && sim.rules.phase === 'live') build.savePitch(sim.carryState());
}
function onFoul() {
  const r = sim.rules;
  if (build && r.phase === 'ready') build.savePitch(sim.carryState());
  showOverlay('FOUL BALL', 'NO STRIKE', `That pitch never touched the bat, so it doesn't count. One free foul per challenge.${r.ballScore ? ` +${r.ballScore.toLocaleString()} banked.` : ''}`, 'READY');
}
function togglePause() {
  if (sim.rules.phase !== 'live') return;
  paused = !paused;
  keys.clear();
  touch.clear();
  pauseBtn.textContent = paused ? '▶' : 'II';
  pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  if (paused) {
    coach?.pause();
    const menu = !!(window as any).title;
    // Mid-pitch save (player route): the points this pitch already earned are kept if you quit from here
    saveMidPitch();
    showOverlay('TIMEOUT', 'PAUSED', menu ? (player ? 'Take a breath. Your run is saved, including this pitch’s points: from the main menu, Continue picks up at the next pitch.' : 'Take a breath. Your run is saved: from the main menu, Continue restarts this pitch.') : 'Take a breath.', 'RESUME', undefined, undefined, menu ? { label: 'MAIN MENU', action: () => toTitle() } : undefined);
    offerShare();
  }
  else {
    overlay.hidden = true;
    readyBtn.blur();
  }
}
readyBtn.addEventListener('click', () => overlayAction());
// Menu sounds (player route): a soft tap on buttons, a card shuffle on reroll. Buy/take buttons have their own.
if (player)
  document.addEventListener(
    'click',
    e => {
      const b = (e.target as HTMLElement | null)?.closest?.('button');
      if (!b || b.classList.contains('obuy') || b.disabled) return;
      sfx.unlock();
      sfx.ui(b.dataset.act === 'reroll' ? 'reroll' : 'ui');
    },
    true,
  );
// Phone interruptions: switching apps/tabs or turning the phone sideways pauses a live pitch.
const pauseIfLive = () => {
  if (!paused && sim.rules.phase === 'live') togglePause();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseIfLive();
});
addEventListener('pagehide', () => saveMidPitch());
matchMedia('(orientation: landscape) and (max-height: 500px)').addEventListener('change', e => {
  if (e.matches) pauseIfLive();
});
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
    if (coach && (controls.moveAxis || controls.dragDelta) && sim.rules.phase === 'live') coach.onMove();
    if (juice) {
      juice.update(delta);
      view.bulbChase = juice.chase ?? attractChase();
      // Closer markers: Hot Corner ×3 ring, Called Shot ring (until it resolves), Rain Delay wash
      const live = sim.rules.phase !== 'over';
      view.hot = !live ? null : sim.hot ? { ...sim.hot, role: 'hot' } : sim.called?.status === 'pending' ? { spots: sim.called.spots, left: 99, tag: 'CALLED', role: 'called' } : null;
      view.rain = sim.boss === 'rainDelay';
    }
    acc += delta * (juice ? juice.timeScale() : 1);
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
// Playtest mode: tester name from ?playtest=<name> (remembered on this device; ?playtest=off clears it).
const tester = player ? playtestName(location.search, localStore) : null;
shareBtn.addEventListener('click', async () => {
  if (!recorder) return;
  recorder.save();
  const seen = new Set<string>();
  const runs = [recorder.snapshot(), recorder.lastRun(), ...recorder.archivedRuns()].filter((r): r is RunRecord => !!r && !seen.has(r.runId) && !!seen.add(r.runId));
  runs.sort((a, b) => b.startedAt - a.startedAt);
  const text = reportText(tester ?? 'tester', `${BUILD_INFO.version} ${BUILD_INFO.commit.slice(0, 7)}`, runs);
  const html = runs[0] ? { name: reportFilename(runs[0]), body: renderReport(runs[0]) } : null;
  const res = await shareReport(text, html);
  shareBtn.textContent = res === 'shared' ? 'SENT ✓' : res === 'copied' ? 'COPIED: PASTE IT IN A MESSAGE' : res === 'downloaded' ? 'SAVED THE REPORT FILE' : 'SEND PLAYTEST REPORT';
  setTimeout(() => (shareBtn.textContent = 'SEND PLAYTEST REPORT'), 3500);
});
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
const saveRoute = saveRouteFor(location.pathname);
const build: BuildUI | null = buildMode
  ? new BuildUI(
      {
        view,
        getSim: () => sim,
        loadMachine: (p, target, boss) => {
          sim = makeSim(p, target);
          // Closer rule for this challenge (player route only; BuildUI decides)
          if (boss) sim.setBoss(boss);
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
        tips: coach?.book ?? null,
        onPurchase: () => sfx.ui('buy'),
        showResults: html => {
          const el = $('#overlayStats');
          el.innerHTML = html;
          el.hidden = false;
          offerShare();
        },
        bestStore: player ? browserStore() : null,
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
// Player settings (effects intensity; sound uses the audio module's own setting)
let settings: Settings = loadSettings();
const applySettings = () => {
  view.vfx.intensity = effectsIntensity(settings);
  document.body.classList.toggle('fx-reduced', settings.effects === 'reduced');
  if (juice) juice.reduced = settings.effects === 'reduced';
  haptics.enabled = player && settings.haptics;
  const t = themeFor(settings.look);
  if (t !== theme) {
    theme = t;
    view.setTheme(t);
    applyThemeToCss(t, document.documentElement);
    (window as unknown as { theme: unknown }).theme = t;
  }
  if (coach) {
    coach.book.enabled = settings.tips;
    coach.refresh();
  }
};
applySettings();

// Title screen on the player-facing run route; the legacy route keeps the direct Continue/New Run cards.
const title: TitleScreen | null =
  v2 && build
    ? new TitleScreen(
        {
          onContinue: f => build.resume(f),
          onNewRun: mode => build.newRun(mode),
          clearSave: () => clearSave(saveStore, saveRoute),
          preview: f => build.peek(f),
          getSound: () => !sfx.muted,
          setSound: on => {
            sfx.unlock();
            sfx.setMuted(!on);
            showMute();
          },
          canVibrate: typeof navigator.vibrate === 'function',
          getSettings: () => settings,
          setSettings: s => {
            settings = s;
            saveSettings(s);
            applySettings();
          },
          resetTips: () => {
            coach?.book.reset();
            coach?.refresh();
          },
          version: `${BUILD_INFO.version} (${BUILD_INFO.commit.slice(0, 7)})`,
        },
        stage,
      )
    : null;
function toTitle() {
  if (!title || !build) return;
  if (paused) togglePause();
  overlay.hidden = true;
  coach?.pause();
  juice?.reset();
  title.show(readSave(saveStore, saveRoute));
}
if (build && title) build.host.toTitle = toTitle;
if (title) toTitle();
else build?.boot(readSave(saveStore, saveRoute));
(window as any).build = build;
(window as any).title = title;
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

// First real screen is drawn: show the page (index.html hides it while booting so the bare markup never flashes).
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('booting')));
