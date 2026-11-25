/**
 * Title screen for the player-facing run route (/build-test/): Continue · New Run · How to Play ·
 * Settings · Credits. Plain DOM over the live table (the canvas keeps drawing behind it).
 *
 * All copy lives in TITLE below so wording can be tuned without touching the logic. Colors come from the
 * theme's CSS variables (style.css `.title-*`), so a theme or art pass restyles it for free.
 */
import { ECONOMY, QUICK_GAME, inningOf, type RunMode } from './economy.ts';
import { rallyLabel } from '../machines/sections.ts';
import { BOSS_INFO } from '../core/bosses.ts';
import { BRAND } from '../core/brand.ts';
import type { LoadResult, SaveFile } from './save.ts';
import type { Settings } from '../core/settings.ts';

export const TITLE = {
  kicker: BRAND.kicker,
  line1: BRAND.logo[0],
  line2: BRAND.logo[1],
  tagline: 'Swing, launch, and build a ridiculous scoring machine.',
  unreadable: 'Your last saved run couldn’t be read, so it was kept aside. Start a new run.',
  newer: 'Your saved run is from a newer version of the game, so it was kept aside. Start a new run.',
  confirmNew: 'Starting a new run ends your saved run for good.',
  quickLine: `${inningOf(QUICK_GAME.lastChallenge)} innings · ${QUICK_GAME.lastChallenge} challenges · about 10 minutes`,
  help: [
    ['MOVE & SWING', 'Phone: drag with your <b>left thumb</b> to move the batter, tap with your <b>right thumb</b> to swing. Keyboard: <b>A/D</b> or <b>← →</b> to move, <b>Space</b> to swing.'],
    ['AIM WITH TIMING', 'Swing <b>early</b> to pull the ball left, <b>on time</b> to send it up the middle, <b>late</b> to push it right. Nail the middle of the swing for a <b>SWEET SPOT</b> bonus.'],
    ['WHIFFS & FOULS', 'A swing that misses (<b>WHIFF</b>) costs a moment before you can swing again, so time it instead of tapping. Once per challenge, a pitch you never touch is a <b>FOUL BALL</b>: no strike, pitch again.'],
    ['THE GOAL', 'Each challenge has a <b>target score</b>. Points bank the moment you hit something. A ball that drains is a <b>strike</b>; three strikes ends the run.'],
    ['BUILD YOUR MACHINE', 'Clear a challenge for a <b>free pick</b> (1 of 3), then visit the <b>shop</b>. Machines are real parts on the table and use <b>Power ⚡</b>. <b>Boosts</b> cost no Power and make parts score more; tap a card to see what it boosts. Sell parts any time between challenges in <b>Manage Machine</b>.'],
    ['MULTIPLIER', 'Gates and some boosts raise the <b>multiplier</b>. It applies to every point for the rest of the challenge.'],
    ['THE RUN', `${ECONOMY.lastChallenge / ECONOMY.challengesPerInning} innings × Starter, Reliever and Closer = ${ECONOMY.lastChallenge} challenges. After Inning 1 the machine grows an <b>Upper Deck</b>: ride the <b>HOME RUN</b> ramp for 3,000 and <b>${rallyLabel()}</b> on Upper Deck hits until that ball comes back down.`],
    ['CLOSERS', `Every inning ends with a <b>Closer</b>: a bigger target and one twist. <b>${BOSS_INFO.hotCorner.name}</b>, <b>${BOSS_INFO.smallBall.name}</b>, <b>${BOSS_INFO.calledShot.name}</b>, <b>${BOSS_INFO.rainDelay.name}</b> and <b>${BOSS_INFO.runnersOnBase.name}</b>. The card before the first pitch explains the twist, and the line at the top of the table tracks it.`],
    ['QUICK GAME', `Short on time? A <b>Quick Game</b> is ${inningOf(QUICK_GAME.lastChallenge)} innings (${QUICK_GAME.lastChallenge} challenges) with both Closers and the Upper Deck, and you start with <b>$${QUICK_GAME.startMoney}</b>. It keeps its own best score.`],
    ['SAVING', 'Your run saves automatically between pitches and challenges. Close the game anytime and continue later on this device.'],
  ] as [string, string][],
  credits: [
    ['GAME', 'Hayden May'],
    ['PHYSICS', 'planck.js (MIT License)'],
    ['FONT', 'Barlow Condensed, © The Barlow Project Authors (SIL Open Font License 1.1)'],
    ['SOUND', 'Effects rendered with earshot (MIT License) from public-domain (CC0) recordings, plus sounds synthesized in the game'],
    ['BUILT WITH', 'TypeScript and Vite (MIT License)'],
  ] as [string, string][],
};

export type TitleHost = {
  /** Continue the saved run. */
  onContinue: (f: SaveFile) => void;
  /** Start a fresh run (the save, if any, is already cleared). */
  onNewRun: (mode: RunMode) => void;
  clearSave: () => void;
  /** Show the saved machine behind the title (or the factory table for a new player). */
  preview: (f: SaveFile | null) => void;
  getSound: () => boolean;
  setSound: (on: boolean) => void;
  getSettings: () => Settings;
  setSettings: (s: Settings) => void;
  version: string;
  /** The browser has a vibration API (hide the toggle where it would do nothing, e.g. iOS). */
  canVibrate?: boolean;
  /** Forget which first-time tips were seen. */
  resetTips?: () => void;
};

type View = 'main' | 'confirm' | 'help' | 'settings' | 'credits';

export class TitleScreen {
  el: HTMLDivElement;
  private host: TitleHost;
  private save: SaveFile | null = null;
  private notice = '';
  private view: View = 'main';
  /** Which run the START OVER? card starts. */
  private pendingMode: RunMode = 'full';
  /** "Show tips again" pressed during this settings visit. */
  private tipsReset = false;

  constructor(host: TitleHost, stage: HTMLElement) {
    this.host = host;
    this.el = document.createElement('div');
    this.el.id = 'title';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', `${BRAND.name} main menu`);
    stage.appendChild(this.el);
    this.el.addEventListener('click', e => this.onClick(e));
  }

  get open() {
    return !this.el.hidden;
  }

  /** Show the menu. `load` is the current save state (from readSave). */
  show(load: LoadResult) {
    this.save = load.ok ? load.file : null;
    this.notice = load.ok || load.reason === 'none' ? '' : load.reason === 'newer' ? TITLE.newer : TITLE.unreadable;
    this.view = 'main';
    this.host.preview(this.save);
    this.el.hidden = false;
    this.render();
  }

  hide() {
    this.el.hidden = true;
  }

  private summary(f: SaveFile) {
    const r = f.run;
    const inning = Math.ceil(r.challenge / ECONOMY.challengesPerInning);
    const quick = r.mode === 'quick' ? 'Quick Game · ' : '';
    const where = r.phase === 'challenge' ? `Inning ${inning} · Challenge ${r.challenge}` : `After challenge ${r.challenge} · ${r.phase === 'draft' ? 'free pick' : 'shop'}`;
    const mods = Object.values(r.mods).reduce((n, l) => n + l.length, 0);
    return `${quick}${where} · ${r.installed.length} machine${r.installed.length === 1 ? '' : 's'} · ${mods} mod${mods === 1 ? '' : 's'} · $${r.money}`;
  }

  private render() {
    const s = this.save;
    const back = `<button class="title-back" data-t="main">◀ BACK</button>`;
    let body = '';
    if (this.view === 'main') {
      body = `
        <small class="title-kicker">${TITLE.kicker}</small>
        <h1 class="title-logo"><span>${TITLE.line1}</span><b>${TITLE.line2}</b></h1>
        <p class="title-tag">${TITLE.tagline}</p>
        ${this.notice ? `<p class="title-notice">${this.notice}</p>` : ''}
        ${s ? `<button class="title-primary" data-t="continue">CONTINUE</button><p class="title-save">${this.summary(s)}</p>` : ''}
        <button class="${s ? 'title-secondary' : 'title-primary'}" data-t="${s ? 'confirm' : 'new'}">NEW RUN</button>
        <button class="title-secondary title-quick" data-t="${s ? 'confirm-quick' : 'new-quick'}">QUICK GAME<small>${TITLE.quickLine}</small></button>
        <nav class="title-links"><button data-t="help">HOW TO PLAY</button><button data-t="settings">SETTINGS</button><button data-t="credits">CREDITS</button></nav>`;
    } else if (this.view === 'confirm') {
      body = `<h2 class="title-h">START OVER?</h2><p class="title-text">${TITLE.confirmNew}</p>
        <button class="title-primary" data-t="${this.pendingMode === 'quick' ? 'new-quick' : 'new'}">START ${this.pendingMode === 'quick' ? 'QUICK GAME' : 'NEW RUN'}</button>
        <button class="title-secondary" data-t="main">KEEP MY RUN</button>`;
    } else if (this.view === 'help') {
      body = `${back}<h2 class="title-h">HOW TO PLAY</h2><div class="title-scroll">${TITLE.help.map(([h, t]) => `<section><h3>${h}</h3><p>${t}</p></section>`).join('')}</div>`;
    } else if (this.view === 'settings') {
      const st = this.host.getSettings();
      const sound = this.host.getSound();
      body = `${back}<h2 class="title-h">SETTINGS</h2><div class="title-scroll title-settings">
        <div class="title-setting"><span>Sound</span><div class="seg"><button data-t="sound-on" class="${sound ? 'on' : ''}">ON</button><button data-t="sound-off" class="${sound ? '' : 'on'}">OFF</button></div></div>
        <div class="title-setting"><span>Effects<small>Reduced = fewer sparks and flashes, no bouncing UI</small></span><div class="seg"><button data-t="fx-full" class="${st.effects === 'full' ? 'on' : ''}">FULL</button><button data-t="fx-reduced" class="${st.effects === 'reduced' ? 'on' : ''}">REDUCED</button></div></div>
        <div class="title-setting"><span>Look<small>Neon night game or classic day game</small></span><div class="seg"><button data-t="look-night" class="${st.look === 'night' ? 'on' : ''}">NIGHT</button><button data-t="look-day" class="${st.look === 'day' ? 'on' : ''}">DAY</button></div></div>
        ${this.host.canVibrate ? `<div class="title-setting"><span>Vibration<small>A buzz on bat contact and big moments</small></span><div class="seg"><button data-t="buzz-on" class="${st.haptics ? 'on' : ''}">ON</button><button data-t="buzz-off" class="${st.haptics ? '' : 'on'}">OFF</button></div></div>` : ''}
        <div class="title-setting"><span>Tips<small>Short hints the first time something new shows up</small></span><div class="seg"><button data-t="tips-on" class="${st.tips ? 'on' : ''}">ON</button><button data-t="tips-off" class="${st.tips ? '' : 'on'}">OFF</button></div></div>
        <div class="title-setting"><span>${this.tipsReset ? 'Tips will show again' : 'Seen all the tips?'}</span><button class="title-mini" data-t="tips-reset" ${this.tipsReset ? 'disabled' : ''}>SHOW TIPS AGAIN</button></div></div>`;
    } else {
      body = `${back}<h2 class="title-h">CREDITS</h2><div class="title-scroll"><dl class="title-credits">${TITLE.credits.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl><p class="title-version">Version ${this.host.version}</p></div>`;
    }
    this.el.innerHTML = `<div class="title-card ${this.view}">${body}</div>`;
    this.el.querySelector<HTMLButtonElement>('.title-primary, .title-back')?.focus({ preventScroll: true });
  }

  private onClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t]')?.dataset.t;
    if (!t) return;
    switch (t) {
      case 'continue':
        if (this.save) {
          this.hide();
          this.host.onContinue(this.save);
        }
        return;
      case 'new':
      case 'new-quick':
        this.host.clearSave();
        this.save = null;
        this.hide();
        this.host.onNewRun(t === 'new-quick' ? 'quick' : 'full');
        return;
      case 'confirm':
      case 'confirm-quick':
        this.pendingMode = t === 'confirm-quick' ? 'quick' : 'full';
        this.view = 'confirm';
        break;
      case 'sound-on':
      case 'sound-off':
        this.host.setSound(t === 'sound-on');
        break;
      case 'look-night':
      case 'look-day':
        this.host.setSettings({ ...this.host.getSettings(), look: t === 'look-night' ? 'night' : 'day' });
        break;
      case 'buzz-on':
      case 'buzz-off':
        this.host.setSettings({ ...this.host.getSettings(), haptics: t === 'buzz-on' });
        break;
      case 'tips-on':
      case 'tips-off':
        this.host.setSettings({ ...this.host.getSettings(), tips: t === 'tips-on' });
        break;
      case 'tips-reset':
        this.host.resetTips?.();
        this.tipsReset = true;
        break;
      case 'fx-full':
      case 'fx-reduced':
        this.host.setSettings({ ...this.host.getSettings(), effects: t === 'fx-full' ? 'full' : 'reduced' });
        break;
      default:
        this.view = t as View;
        this.tipsReset = false;
    }
    this.render();
  }
}
