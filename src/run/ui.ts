/**
 * Between-challenge UI for /build-test/: clear → free draft (pick 1 of 3) → shop → next challenge.
 * Panels sit in the lower part of the stage so the board (and the placement preview) stays visible.
 * Live play is never covered: panels only open when no ball is in play.
 */
import { MACHINES, MOUNTS, mountName } from './catalog.ts';
import { Run, anchorOf, type Offer } from './run.ts';
import { ECONOMY, inningOf, targetFor, type RunMode } from './economy.ts';
import { anchorsFor } from '../view/anchors.ts';
import type { GameView } from '../view/game.ts';
import type { Simulation } from '../physics/sim.ts';
import type { Preset } from '../machines/presets.ts';
import type { RunRecord, RunRecorder } from '../telemetry/run-recorder.ts';
import type { PitchCarry } from '../physics/sim.ts';
import { panelTip, type TipBook } from './coach.ts';
import { bestKeyFor, readBest, recordBest, statsHtml } from './stats.ts';
import { BOSS_INFO, closerFor, type BossId } from '../core/bosses.ts';
import { PLAY } from '../core/play-rules.ts';
import { config } from '../config.ts';
import type { Store } from './save.ts';
import type { SimEvent } from '../physics/sim.ts';
import type { LoadResult, SaveFile } from './save.ts';

export type BuildHost = {
  view: GameView;
  getSim: () => Simulation;
  /** Rebuild the table for this machine with a challenge target. */
  /** `boss`: the Closer rule to run on this board (player route), null for none. */
  loadMachine: (preset: Preset, target: number, boss?: BossId | null) => void;
  showOverlay: (kicker: string, title: string, text: string, button: string, action: () => void, info?: string, alt?: { label: string; action: () => void }) => void;
  hideOverlay: () => void;
  setTag: (text: string) => void;
  startPitch: () => void;
  /** Developer run recorder (always records on the build test; silent). */
  recorder?: RunRecorder | null;
  /** Offer a report download on the current overlay (shown only with ?devAnalytics=1). */
  devReport?: (label: string, get: () => RunRecord | null) => void;
  theme?: string;
  /** Save & continue (src/run/save.ts): write the run at a safe point (with between-pitches state if given). */
  saveRun?: (run: Run, pitch?: PitchCarry) => void;
  /** Forget the saved run (it ended). */
  clearRun?: () => void;
  /** Back to the title screen (only on routes that have one). */
  toTitle?: () => void;
  /** First-time tips (player route only). */
  tips?: TipBook | null;
  /** A shop purchase went through (cha-ching). */
  onPurchase?: () => void;
  /** Results grid on the end-of-run card (player route). */
  showResults?: (html: string) => void;
  /** Where the device best score lives (null = not kept). */
  bestStore?: Store | null;
};

const fmt = (n: number) => n.toLocaleString();
const ROLES = ['STARTER', 'RELIEVER', 'CLOSER'];
/** "INNING 2 · RELIEVER" for a challenge number. */
export const roleOf = (c: number) => `INNING ${Math.ceil(c / ECONOMY.challengesPerInning)} · ${ROLES[(c - 1) % ECONOMY.challengesPerInning]}`;
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);


/** Player-facing name for a modifier card (internally "modifier"). */
export const BOOST = 'BOOST';
/**
 * One plain line per card: the effect with its target folded in ("×2 points on Low-left bumper"), so a card
 * never needs a separate "Applies to" line or THIS/ALL jargon. The board highlight shows where.
 */
export function cardEffect(o: Offer): string {
  // machines: current catalog text (offers kept in older saves may carry retired wording)
  if (o.kind !== 'modifier') return MACHINES.find(m => m.key === o.key)?.desc ?? o.desc;
  const where = o.target.label.split(',')[0].replace(/ \((full ride|complete all 3)\)$/, '');
  if (o.scope === 'this') return (/THIS [a-z]+/.test(o.desc) ? o.desc.replace(/THIS [a-z]+/, where) : `${o.desc} on ${where}`).replace(/ Ramp ramp/g, ' Ramp');
  return o.desc.replace(/\bALL\b/g, 'All');
}

/** Player-facing place for a boost key ("mgate@gate-l" → "Left alley top"); never shows internal ids. */
export function placeOfKey(k: string): string {
  const at = anchorOf(k).split('@')[1];
  if (at) return at.split('+').map(mountName).join(' + ');
  return 'its spot';
}

/** One- or two-line summary for a grid card; the full effect stays in the detail view. */
export function cardSummary(o: Offer): string {
  if (o.kind !== 'modifier') return MACHINES.find(m => m.key === o.key)?.short ?? o.desc;
  return cardEffect(o);
}

/** Shop presentation knobs (CSS has the timings: --shop-in, --shop-card-stagger). */
export const SHOP_FX = {
  /** Big minimap marker pulse speed. */
  pulseHz: 1.2,
  reduced: () => typeof document !== 'undefined' && document.body.classList.contains('fx-reduced'),
};

export class BuildUI {
  run: Run;
  host: BuildHost;
  panel: HTMLDivElement;
  /** Selected offer + mount in the open panel. */
  private sel: { uid: number; mount?: string } | null = null;
  private lastEarned = 0;
  /** Panel mode: the offers (draft/shop) or the optional Manage Machine screen (returns to the offers). */
  private mode: 'offers' | 'manage' = 'offers';
  /** Manage Machine selection and whether the sale confirmation is showing. */
  private msel: string | null = null;
  private confirming = false;
  /** Shop/free pick showing the real table (panel shrunk to a bottom bar) instead of the full-screen menu. */
  private peeking = false;
  /** Grid: the card just bought (its stamp animates once) and the card last opened (outlined on return). */
  private justBought = -1;
  private lastOpened = -1;
  /** Which full-screen view was drawn last, so entrance animations only play when the view changes. */
  private lastView = '';
  /** Spots for the big animated minimap (detail / manage), redrawn every frame while it's on screen. */
  private mapSpots: { x: number; y: number; r: number }[] = [];
  private mapRaf = 0;
  /** Short result line after a sale (shown on the manage screen). */
  private saleNote = '';
  /** The Run the recorder is currently recording (a new Run object starts a new recorded run). */
  private recordedRun: Run | null = null;
  private runSeed = 0;
  /** Panel tips shown this session; marked seen once the player moves past that screen. */
  private tipsShown = new Set<'draft' | 'shop'>();

  constructor(host: BuildHost, stage: HTMLElement) {
    this.host = host;
    this.runSeed = (Math.random() * 2 ** 32) >>> 0;
    this.run = new Run(this.runSeed);
    this.panel = document.createElement('div');
    this.panel.id = 'buildPanel';
    this.panel.hidden = true;
    // On the cabinet (scoreboard + table) so the full-screen shop covers the whole game; peek mode docks
    // it to the bottom of the table.
    (stage.closest<HTMLElement>('.cabinet') ?? stage).appendChild(this.panel);
    this.panel.addEventListener('click', e => this.onClick(e));
    (window as any).buildRun = this.run;
  }

  /** Short machine summary used on the cards and overlays. */
  private machineLine() {
    const r = this.run;
    const mods = Object.values(r.mods).reduce((n, l) => n + l.length, 0);
    // duplicates grouped: "Bonus Bumper ×3, Twin Bumpers" (first-installed order)
    const counts = new Map<string, number>();
    for (const i of r.installed) counts.set(i.name, (counts.get(i.name) ?? 0) + 1);
    const parts = counts.size ? [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ') : 'factory table';
    return `${parts}${mods ? ` · ${mods} boost${mods > 1 ? 's' : ''}` : ''}`;
  }

  tag() {
    const r = this.run;
    this.host.setTag(`C${r.challenge} · $${r.money} · ⚡${r.powerUsed}/${r.maxPower}`);
  }

  /**
   * First screen of the run route: continue a saved run if there is one, otherwise start fresh.
   * `load` comes from readSave(); an unreadable save is set aside (never deleted) and explained once.
   */
  boot(load: LoadResult) {
    if (load.ok) return this.offerContinue(load.file);
    if (load.reason !== 'none') {
      return this.host.showOverlay(
        'SAVED RUN',
        'COULDN’T CONTINUE',
        load.reason === 'newer'
          ? 'Your saved run is from a newer version of the game. It has been kept aside; start a new run here.'
          : 'Your saved run couldn’t be read. It has been kept aside; start a new run.',
        'NEW RUN',
        () => this.start(),
      );
    }
    this.start();
  }

  /** Show a saved run's table (or the factory table for null) behind a menu, without starting anything. */
  peek(f: SaveFile | null) {
    this.closePanel();
    const p = f ? Run.fromSave(f.run).run : new Run(1);
    this.host.loadMachine(p.preset(), p.target);
    this.host.setTag(f ? `C${p.challenge} · $${p.money} · ⚡${p.powerUsed}/${p.maxPower}` : '');
  }

  /** Throw away the in-memory run and start a fresh one at challenge 1. */
  newRun(mode: RunMode = this.run.mode) {
    this.closePanel();
    this.runSeed = (Math.random() * 2 ** 32) >>> 0;
    this.run = new Run(this.runSeed, mode);
    (window as any).buildRun = this.run;
    this.start();
  }

  private offerContinue(f: SaveFile) {
    const r = f.run;
    // show the saved machine behind the card, so "continue" visibly means *this* table
    this.peek(f);
    const where = r.phase === 'challenge' ? `${roleOf(r.challenge)} · challenge ${r.challenge} of ${this.run.lastChallenge}` : `after challenge ${r.challenge} (${r.phase === 'draft' ? 'free pick' : 'shop'})`;
    const pitch = f.pitch ? ` · ${fmt(f.pitch.score)} scored, strike ${f.pitch.strikes} of 3` : '';
    const nMods = Object.values(r.mods).reduce((n, l) => n + l.length, 0);
    this.host.showOverlay(
      'WELCOME BACK',
      'CONTINUE YOUR RUN?',
      `${where[0].toUpperCase()}${where.slice(1)}${pitch}. ${r.installed.length} machine${r.installed.length === 1 ? '' : 's'} · ${nMods} boost${nMods === 1 ? '' : 's'} · $${r.money}.`,
      'CONTINUE',
      () => this.resume(f),
      `Saved ${new Date(f.savedAt).toLocaleString()}`,
      { label: 'NEW RUN', action: () => this.confirmNewRun(f) },
    );
  }

  private confirmNewRun(f: SaveFile) {
    this.host.showOverlay(
      'START OVER?',
      'NEW RUN',
      'This ends your saved run for good.',
      'START OVER',
      () => {
        this.host.clearRun?.();
        this.start();
      },
      undefined,
      { label: 'BACK', action: () => this.offerContinue(f) },
    );
  }

  /** Continue a saved run at its safe point. */
  resume(f: SaveFile) {
    const { run, dropped } = Run.fromSave(f.run);
    this.run = run;
    (window as any).buildRun = run;
    const rec = this.host.recorder;
    if (rec) {
      rec.startRun({ route: location.pathname, theme: this.host.theme ?? '', runSeed: this.runSeed });
      this.recordedRun = run;
    }
    this.host.loadMachine(run.preset(), run.target, this.bossFor(run.challenge));
    this.tag();
    const note = dropped.length ? ` (${dropped.length} machine${dropped.length > 1 ? 's' : ''} no longer fit after an update and were refunded.)` : '';
    if (run.phase === 'challenge') {
      if (f.pitch) this.host.getSim().restoreCarry(f.pitch);
      rec?.startChallenge(run, this.host.getSim().rules.maxStrikes);
      const s = this.host.getSim().rules;
      const boss = this.bossFor(run.challenge);
      const progress = f.pitch ? `${fmt(s.score)} scored so far, ${fmt(Math.max(0, run.target - s.score))} to go · strike ${s.strikes} of ${s.maxStrikes}.` : '';
      this.host.showOverlay(
        boss ? `CLOSER · ${BOSS_INFO[boss].name} · RUN RESUMED` : `${roleOf(run.challenge)} · RUN RESUMED`,
        `TARGET ${fmt(run.target)}`,
        // a Closer always restates its twist; a resumed pitch adds where you were
        boss ? `${BOSS_INFO[boss].rule}${progress ? ` ${progress}` : ''}${note}` : progress ? `${progress}${note}` : `Your machine: ${this.machineLine()}.${note}`,
        'PLAY BALL',
        () => this.host.startPitch(),
        `POWER ${run.powerUsed}/${run.maxPower} · $${run.money}`,
      );
      return;
    }
    // Free pick / shop: straight back to the panel (one CONTINUE tap is enough), unless something changed
    if (!dropped.length) {
      this.host.hideOverlay();
      return this.openPanel();
    }
    this.host.showOverlay(
      'RUN RESUMED',
      run.phase === 'draft' ? 'YOUR FREE PICK' : 'THE SHOP',
      `Right where you left off.${note}`,
      'CONTINUE',
      () => {
        this.host.hideOverlay();
        this.openPanel();
      },
      `POWER ${run.powerUsed}/${run.maxPower} · $${run.money}`,
    );
  }

  /** Save at a safe point (challenge start card, draft, shop). */
  private save() {
    if (this.run.phase === 'challenge' || this.run.phase === 'draft' || this.run.phase === 'shop') this.host.saveRun?.(this.run);
  }

  /** Between pitches of the current challenge (called by the host after a drain that wasn't the last strike). */
  savePitch(carry: PitchCarry) {
    if (this.run.phase === 'challenge') this.host.saveRun?.(this.run, carry);
  }

  start() {
    const boss = this.bossFor(this.run.challenge);
    this.host.loadMachine(this.run.preset(), this.run.target, boss);
    this.tag();
    this.save();
    this.host.showOverlay(
      boss ? `CLOSER · ${BOSS_INFO[boss].name} · ${this.run.challenge}/${this.run.lastChallenge}` : `${roleOf(this.run.challenge)} · ${this.run.challenge}/${this.run.lastChallenge}`,
      `TARGET ${fmt(this.run.target)}`,
      boss
        ? `${BOSS_INFO[boss].rule}`
        : this.run.challenge === 1
          ? 'Factory table. Reach the target within three strikes to earn an upgrade.'
          : `Your machine: ${this.machineLine()}.`,
      'PLAY BALL',
      () => this.host.startPitch(),
      `POWER ${this.run.powerUsed}/${this.run.maxPower} · $${this.run.money}`,
    );
    // Developer analytics: a new Run object = a new recorded run (the previous one stays archived).
    const rec = this.host.recorder;
    if (rec) {
      if (this.recordedRun !== this.run) {
        rec.startRun({ route: location.pathname, theme: this.host.theme ?? '', runSeed: this.runSeed });
        this.recordedRun = this.run;
      }
      rec.startChallenge(this.run, this.host.getSim().rules.maxStrikes);
      const prev = this.run.challenge === 1 ? rec.lastRun() : null;
      if (prev) this.host.devReport?.(`Download previous run report (${prev.outcome})`, () => rec.lastRun());
    }
  }

  /** Feed the results-screen stats from sim events (main.ts forwards every event). */
  onSimEvent(e: SimEvent) {
    const st = this.run.stats, r = this.host.getSim().rules;
    if (e.type === 'bat' && e.sweet) st.sweetSpots++;
    else if (e.type === 'deckRally' && e.phase === 'start') st.homeRuns++;
    else if (e.type === 'mult') st.peakMult = Math.max(st.peakMult, e.total);
    else if (e.type === 'drain' || e.type === 'clear') st.bestPitch = Math.max(st.bestPitch, r.ballScore);
  }

  /** End-of-run results grid + device best. */
  private results(cleared: number) {
    const st = this.run.stats;
    st.cleared = cleared;
    const store = this.host.bestStore ?? null;
    const key = bestKeyFor(this.run.mode);
    const before = readBest(store, key);
    const isNew = recordBest(store, st, key);
    this.host.showResults?.(statsHtml(st, this.run.lastChallenge, isNew ? readBest(store, key) : before, isNew, this.run.mode === 'quick' ? 'QUICK BEST' : 'DEVICE BEST'));
  }

  /** Closer rule for challenge `n` (player route only). */
  private bossFor(n: number): BossId | null {
    return PLAY.enabled ? closerFor(n) : null;
  }

  /** Sim says the target was reached. */
  onClear() {
    const sim = this.host.getSim();
    const rec = this.host.recorder;
    // Finalize the challenge with the machine that actually played it, BEFORE any reward is applied.
    rec?.endChallenge(this.run, sim, 'cleared');
    this.run.stats.total += sim.rules.score;
    this.run.stats.cleared = this.run.challenge;
    this.run.stats.bestPitch = Math.max(this.run.stats.bestPitch, sim.rules.ballScore);
    this.lastEarned = this.run.clear(sim.rules.maxStrikes - sim.rules.strikes);
    rec?.afterClear(this.run, this.lastEarned);
    const victory = this.run.won;
    if (victory) {
      this.host.clearRun?.();
      rec?.endRun('completed');
      this.tag();
      this.host.showOverlay(
        `FINAL CLOSER CLEARED · ${inningOf(this.run.lastChallenge)} INNINGS${this.run.mode === 'quick' ? ' · QUICK GAME' : ''}`,
        'RUN COMPLETE',
        `${fmt(sim.rules.score)} / ${fmt(this.run.target)} on challenge ${this.run.challenge}. Final machine: ${this.machineLine()}.`,
        this.run.mode === 'quick' ? 'NEW QUICK GAME' : 'NEW RUN',
        () => this.newRun(),
        `POWER ${this.run.powerUsed}/${this.run.maxPower} · $${this.run.money}`,
        this.host.toTitle ? { label: 'MAIN MENU', action: () => this.host.toTitle!() } : undefined,
      );
      this.results(this.run.lastChallenge);
      if (rec) this.host.devReport?.('Download Developer Report (HTML)', () => rec.lastRun() ?? rec.snapshot());
      return;
    }
    this.tag();
    this.save();
    const grew = this.run.sectionGrant ? `The machine grew: ${this.run.sectionGrant.name} unlocked (free). ` : '';
    const inning = this.run.powerGrant ? `Inning ${this.run.powerGrant.inning} unlocked: max Power +${this.run.powerGrant.gained} (${this.run.powerGrant.maxPower} total). ` : '';
    this.host.showOverlay(
      `${roleOf(this.run.challenge)} · ${this.run.challenge}/${this.run.lastChallenge}`,
      'CHALLENGE CLEARED',
      `${fmt(sim.rules.score)} / ${fmt(this.run.target)}. ${grew}${inning}+$${this.lastEarned} (${ECONOMY.clearBase} + ${ECONOMY.clearPerStrikeLeft} per unused strike). Pick a free upgrade.`,
      'CHOOSE REWARD',
      () => {
        this.host.hideOverlay();
        // V2: the machine just grew. Rebuild the board only now (the clear card keeps showing the cleared
        // score in the HUD behind it), so the draft can preview the new section's mounts.
        if (this.run.sectionGrant) this.host.loadMachine(this.run.preset(), targetFor(this.run.challenge + 1));
        this.openPanel();
      },
      `POWER ${this.run.powerUsed}/${this.run.maxPower} · $${this.run.money}`,
    );
  }

  /** Third strike short of the target. */
  onFail() {
    const sim = this.host.getSim();
    const rec = this.host.recorder;
    rec?.endChallenge(this.run, sim, 'failed');
    this.run.stats.total += sim.rules.score;
    const clearedBefore = this.run.challenge - 1;
    this.run.fail();
    this.host.clearRun?.();
    rec?.endRun('failed');
    this.host.showOverlay(
      'THREE STRIKES',
      'CHALLENGE FAILED',
      `${fmt(sim.rules.score)} of ${fmt(this.run.target)} on challenge ${this.run.challenge}. Machine: ${this.machineLine()}.`,
      this.run.mode === 'quick' ? 'NEW QUICK GAME' : 'NEW RUN',
      () => this.newRun(),
      undefined,
      this.host.toTitle ? { label: 'MAIN MENU', action: () => this.host.toTitle!() } : undefined,
    );
    this.results(clearedBefore);
    // The terminal record is archived before the restart button, so it stays downloadable afterwards too.
    if (rec) this.host.devReport?.('Download Developer Report (HTML)', () => rec.lastRun() ?? rec.snapshot());
  }

  private openPanel() {
    // the HUD shows the NEXT challenge's target while you build (the sim is idle between challenges)
    const rules = this.host.getSim().rules;
    if (rules.phase !== 'live') rules.target = targetFor(this.run.challenge + 1);
    this.sel = null;
    this.mode = 'offers';
    this.msel = null;
    this.confirming = false;
    this.peeking = false;
    this.lastView = '';
    this.panel.hidden = false;
    this.panel.classList.remove('enter');
    void this.panel.offsetWidth;
    this.panel.classList.add('enter');
    this.render();
  }

  private closePanel() {
    this.panel.hidden = true;
    cancelAnimationFrame(this.mapRaf);
    this.mapRaf = 0;
    this.host.view.highlights = [];
    this.host.view.highlightLabel = '';
  }

  private offers() {
    return this.run.phase === 'draft' ? this.run.draft : this.run.shop;
  }

  /** Where an offer would go (machine mounts) or what it boosts (anchors), plus a one-line label. */
  private offerSpots(o: Offer, mount?: string) {
    if (o.kind === 'machine') {
      const chk = this.run.check(o);
      const places = mount ? [mount] : chk.ok ? chk.mounts : o.mounts;
      const spots: { x: number; y: number; r: number }[] = [];
      for (const pid of places) for (const id of pid.split('+')) {
        const m = MOUNTS.find(m => m.id === id)!;
        spots.push({ x: m.anchor.x, y: m.anchor.y, r: m.r });
      }
      const label = places.length === 1 ? places[0].split('+').map(mountName).join(' + ') : chk.ok ? 'Pick a spot' : 'Needs room: Manage Machine';
      return { spots, label };
    }
    let spots = anchorsFor(this.host.getSim().layout, o.target.key);
    // batting boosts (sweet spots etc.) have no part on the table: point at the batter's box instead
    if (!spots.length) {
      const b = this.host.getSim().layout.bounds;
      spots = [{ x: (b.x0 + b.x1) / 2, y: config.batter.handsY, r: 2.2 }];
    }
    return { spots, label: `${o.name}: ${cardEffect(o)}` };
  }

  /** Where an installed item sits (Manage Machine). */
  private itemSpots(it: Run['installed'][number]) {
    const L = this.host.getSim().layout;
    const spots: { x: number; y: number; r: number }[] = [];
    for (const d of it.parts) spots.push(...anchorsFor(L, d.id));
    for (const m of it.mounts) if (!spots.length) {
      const mm = MOUNTS.find(x => x.id === m)!;
      spots.push({ x: mm.anchor.x, y: mm.anchor.y, r: mm.r });
    }
    return { spots, label: `${it.name} · ${it.mounts.map(mountName).join(' + ')}` };
  }

  /** Highlight where the selected offer goes (mount) or what it boosts (target), on the table and the big minimap. */
  private preview() {
    const v = this.host.view;
    v.highlights = [];
    v.highlightLabel = '';
    this.mapSpots = [];
    let got: { spots: { x: number; y: number; r: number }[]; label: string } | null = null;
    if (this.mode === 'manage') {
      const it = this.run.installed.find(i => i.uid === this.msel);
      if (it) got = this.itemSpots(it);
    } else {
      const o = this.offers().find(o => o.uid === this.sel?.uid);
      if (o) got = this.offerSpots(o, this.sel?.mount);
    }
    if (!got) return;
    v.highlights = got.spots;
    v.highlightLabel = got.label;
    this.mapSpots = got.spots;
  }

  /** Draw the card thumbnails once, and keep the big minimap pulsing while it's on screen. */
  private drawMaps() {
    const sim = this.host.getSim();
    const fit = (c: HTMLCanvasElement) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
      if (w && h && (c.width !== w || c.height !== h)) {
        c.width = w;
        c.height = h;
      }
    };
    for (const c of this.panel.querySelectorAll<HTMLCanvasElement>('canvas.omap')) {
      const uid = Number(c.dataset.uid);
      const o = this.offers().find(o => o.uid === uid) ?? this.run.shopBought.find(o => o.uid === uid);
      if (!o) continue;
      fit(c);
      this.host.view.renderMap(c, sim, this.offerSpots(o).spots, 0.6);
    }
    cancelAnimationFrame(this.mapRaf);
    this.mapRaf = 0;
    const big = this.panel.querySelector<HTMLCanvasElement>('canvas.dmap');
    if (!big) return;
    fit(big);
    const tick = (t: number) => {
      if (this.panel.hidden || !big.isConnected) return;
      const pulse = SHOP_FX.reduced() ? 0.6 : 0.5 + 0.5 * Math.sin((t / 1000) * SHOP_FX.pulseHz * Math.PI * 2);
      this.host.view.renderMap(big, this.host.getSim(), this.mapSpots, pulse);
      this.mapRaf = requestAnimationFrame(tick);
    };
    this.mapRaf = requestAnimationFrame(tick);
  }

  /**
   * Shop / Free Pick grid card (Nov 25): fixed slot, compact hierarchy (kind + cost, name, one-line effect,
   * table thumbnail, one action). Full text, spot choice and the big minimap live in the detail view.
   */
  private gridCard(o: Offer, bought: boolean, slot: number) {
    const r = this.run, isShop = r.phase === 'shop';
    const kind = o.kind === 'machine' ? 'MACHINE' : 'BOOST';
    const power = o.kind === 'machine' ? ` · ⚡${o.power}` : '';
    if (bought) {
      return `<div class="gcard ${o.kind} bought ${this.justBought === o.uid ? 'stamp-new' : ''}" style="--i:${slot}" aria-label="${esc(o.name)}, purchased">
        <div class="ghead"><span class="gtag">${kind}${power}</span><span class="gcost">$${o.price}</span></div>
        <div class="gname">${esc(o.name)}</div>
        <div class="gsum">${esc(cardSummary(o))}</div>
        <div class="gmap"><canvas class="omap" data-uid="${o.uid}" aria-hidden="true"></canvas></div>
        <div class="gact"><span class="gdone">✓ PURCHASED</span></div>
        <div class="gstamp" aria-hidden="true"><span>PURCHASED</span></div>
      </div>`;
    }
    const chk = r.check(o);
    const afford = !isShop || o.price <= r.money;
    const needsSpot = o.kind === 'machine' && chk.ok && chk.mounts.length > 1;
    let btn: string;
    if (o.kind === 'machine' && !chk.ok) btn = chk.fixable ? `<button class="obuy gwarn" data-act="manage" data-uid="${o.uid}">MAKE ROOM ▸</button>` : `<button class="obuy" disabled>NO ROOM</button>`;
    else if (!afford) btn = `<button class="obuy" disabled>NEED $${o.price}</button>`;
    else if (needsSpot) btn = `<button class="obuy" data-act="open" data-uid="${o.uid}">CHOOSE SPOT ▸</button>`;
    else btn = `<button class="obuy" data-act="take" data-uid="${o.uid}">${isShop ? `BUY $${o.price}` : 'TAKE'}</button>`;
    const cost = isShop ? `<span class="gcost ${afford ? '' : 'short'}">$${o.price}</span>` : '<span class="gcost free">FREE</span>';
    const note = o.kind === 'machine' && !chk.ok && chk.fixable ? 'Needs room on the table' : '';
    return `<div class="offer gcard ${o.kind} ${!chk.ok || !afford ? 'dim' : ''} ${this.lastOpened === o.uid ? 'recent' : ''}" data-uid="${o.uid}" style="--i:${slot}" role="button" aria-label="${esc(o.name)}: details">
      <div class="ghead"><span class="gtag">${kind}${power}</span>${cost}</div>
      <div class="gname">${esc(o.name)}</div>
      <div class="gsum">${esc(note || cardSummary(o))}</div>
      <div class="gmap"><canvas class="omap" data-uid="${o.uid}" aria-hidden="true"></canvas><span class="gpeek">DETAILS ▸</span></div>
      <div class="gact">${btn}</div>
    </div>`;
  }

  /** The 2×2 grid: four shop slots (bought ones stay, stamped), or three free picks plus an instruction panel. */
  private grid() {
    const r = this.run;
    const cells: string[] = [];
    if (r.phase === 'draft') {
      r.draft.slice(0, 3).forEach((o, i) => cells.push(this.gridCard(o, false, i)));
      while (cells.length < 3) cells.push(`<div class="gcard gempty" style="--i:${cells.length}"></div>`);
      cells.push(`<div class="gcard ginfo" style="--i:3"><b>CHOOSE 1 OF ${r.draft.length}</b><p>Your free upgrade. Tap a card to preview its effect and where it goes on the table.</p><span class="ginfo-free">FREE</span></div>`);
    } else {
      r.shopSlots.forEach((sl, i) => cells.push(this.gridCard(sl.offer, sl.bought, i)));
      while (cells.length < ECONOMY.shopSize) cells.push(`<div class="gcard gempty" style="--i:${cells.length}"><span>SOLD OUT</span></div>`);
    }
    return `<div class="offers grid">${cells.join('')}</div>`;
  }

  private card(o: Offer, inList = false) {
    const r = this.run, isShop = r.phase === 'shop';
    const chk = r.check(o);
    const selected = this.sel?.uid === o.uid;
    const afford = !isShop || o.price <= r.money;
    let where = '', mountsHtml = '';
    const placeName = (pid: string) => pid.split('+').map(mountName).join(' + ');
    if (o.kind === 'machine') {
      if (chk.ok && chk.mounts.length > 1) {
        mountsHtml = `<div class="mounts">${chk.mounts
          .map(id => `<button class="mount ${selected && this.sel?.mount === id ? 'on' : ''}" data-uid="${o.uid}" data-mount="${id}">${placeName(id)}</button>`)
          .join('')}</div>`;
      } else if (chk.ok) where = `Installs at: ${placeName(chk.mounts[0])}`;
      else if (chk.fixable) where = `Needs room: ${esc(chk.reason.replace(/ — use Manage Machine$/, ''))}`;
    }
    const needsMount = o.kind === 'machine' && chk.ok && chk.mounts.length > 1 && !(selected && this.sel?.mount);
    const disabled = !chk.ok || !afford || needsMount;
    const reason = !chk.ok ? (chk.fixable ? 'NEEDS ROOM' : chk.reason) : !afford ? `Need $${o.price}` : needsMount ? 'Pick a spot' : '';
    const action = isShop ? `BUY $${o.price}` : 'TAKE FREE';
    const tag = o.kind === 'machine' ? `MACHINE${o.pieces ? ` · ${o.pieces} PIECES` : ''} · ⚡${o.power}` : BOOST;
    const manage = o.kind === 'machine' && !chk.ok && chk.fixable ? `<button class="omanage" data-act="manage" data-uid="${o.uid}">MANAGE MACHINE</button>` : '';
    if (inList) {
      // Full-screen list: thumbnail map + the essentials; choosing a spot happens in the detail view.
      const pick = needsMount && afford;
      const btn = manage || (pick ? `<button class="obuy" data-act="open" data-uid="${o.uid}">CHOOSE SPOT ▸</button>` : `<button class="obuy" data-act="take" data-uid="${o.uid}" ${disabled ? 'disabled' : ''}>${reason || action}</button>`);
      return `<div class="offer ${o.kind} ${!chk.ok ? 'locked' : ''}" data-uid="${o.uid}" style="--i:${this.offers().indexOf(o)}">
        <canvas class="omap" data-uid="${o.uid}" aria-hidden="true"></canvas>
        <div class="obody">
          <div class="otag">${tag}</div>
          <div class="oname">${o.name}</div>
          <div class="odesc">${cardEffect(o)}</div>
          ${where && !mountsHtml ? `<div class="owhere">${where}</div>` : ''}
          <div class="orow"><span class="opeek">TAP TO PREVIEW</span>${btn}</div>
        </div>
      </div>`;
    }
    return `<div class="offer ${o.kind} ${selected ? 'sel' : ''} ${!chk.ok ? 'locked' : ''}" data-uid="${o.uid}">
      <div class="otag">${tag}</div>
      <div class="oname">${o.name}</div>
      <div class="odesc">${cardEffect(o)}</div>
      ${where ? `<div class="owhere">${where}</div>` : ''}${mountsHtml}
      ${manage || `<button class="obuy" data-act="take" data-uid="${o.uid}" ${disabled ? 'disabled' : ''}>${reason || action}</button>`}
    </div>`;
  }

  private render() {
    const r = this.run;
    const draft = r.phase === 'draft';
    // every pick / buy / sale / reroll re-renders: that's the safe point for the draft and shop
    this.save();
    if (this.mode === 'manage') return this.renderManage();
    const manageBtn = `<button class="pmanage" data-act="manage">MANAGE</button>`;
    const chips = `<div class="pchips"><span class="chip money">$${r.money}</span><span class="chip power">⚡${r.powerUsed}/${r.maxPower}</span></div>`;
    const head = `<div class="shead"><div class="stitle"><small>${draft ? `CHALLENGE ${r.challenge} CLEARED` : `BEFORE CHALLENGE ${r.challenge + 1}`}</small><b>${draft ? 'FREE PICK' : 'SHOP'}</b></div>${chips}${manageBtn}</div>
      ${draft ? '' : '<div class="ssub">Buy as many as you like · tap a card for details</div>'}`;
    // Small, non-blocking reward line when this clear finished an inning.
    const grant =
      (r.powerGrant ? `<div class="pgrant">INNING ${r.powerGrant.inning} UNLOCKED — MAX POWER +${r.powerGrant.gained} (${r.powerGrant.maxPower} TOTAL)</div>` : '') +
      (r.sectionGrant ? `<div class="pgrant grew">THE MACHINE GREW — ${r.sectionGrant.name.toUpperCase()} UNLOCKED · FREE HOME RUN RAMP + NEW MOUNTS</div>` : '');
    const tipId = draft ? 'draft' : 'shop';
    for (const id of this.tipsShown) if (id !== tipId) this.host.tips?.mark(id);
    const tip = panelTip(this.host.tips, tipId);
    if (tip) this.tipsShown.add(tipId);
    const foot = draft
      ? ''
      : `<div class="pfoot"><button data-act="reroll" ${r.money < r.rerollPrice ? 'disabled' : ''}>REROLL $${r.rerollPrice}</button><button class="next" data-act="next">NEXT: TARGET ${fmt(
          (() => {
            const x = new Run();
            x.challenge = r.challenge + 1;
            return x.target;
          })(),
        )} ▶</button></div>`;
    const selected = this.offers().find(o => o.uid === this.sel?.uid);
    if (!selected) this.peeking = false;
    let view: string;
    if (selected && this.peeking) {
      // Peek: the menu shrinks to a bar so the real table shows where the card goes.
      view = 'peek';
      this.panel.innerHTML = `<div class="phead"><button class="back" data-act="unpeek">◀ BACK TO ${draft ? 'FREE PICK' : 'SHOP'}</button><span>${draft ? 'Free pick' : `$${r.money} · ⚡${r.powerUsed}/${r.maxPower}`}</span></div>
        <div class="offers one">${this.card(selected)}</div>`;
    } else if (selected) {
      // Detail: big live minimap of the table with the spot pulsing, spot choice and buy.
      view = `detail:${selected.uid}`;
      this.panel.innerHTML = `<div class="shead"><button class="back" data-act="back">◀ ALL ${draft ? 'PICKS' : 'OFFERS'}</button>${chips}</div>
        <div class="dmapwrap"><canvas class="dmap" aria-label="Map of the table showing where ${esc(selected.name)} goes"></canvas><span class="dmaplabel">${esc(this.offerSpots(selected, this.sel?.mount).label)}</span></div>
        <div class="offers one">${this.card(selected)}</div>
        <button class="speek" data-act="peek">SEE IT ON THE TABLE ▸</button>`;
    } else {
      view = 'list';
      this.panel.innerHTML = `${head}${grant}${tip}${this.grid()}
      <div class="pmachine">Machine: ${this.machineLine()}</div>${foot}`;
    }
    this.setView(view);
    this.preview();
    this.drawMaps();
    this.tag();
    this.justBought = -1; // the stamp animates on the render right after the purchase only
  }

  /** Full-screen vs docked bar, and an entrance animation whenever the view changes. */
  private setView(view: string) {
    const full = view !== 'peek';
    this.panel.classList.toggle('full', full);
    this.panel.classList.toggle('focus', !full);
    const kind = view.split(':')[0];
    const changed = view !== this.lastView;
    this.panel.dataset.view = kind;
    if (changed) {
      this.panel.classList.remove('v-anim');
      void this.panel.offsetWidth;
      this.panel.classList.add('v-anim');
      this.panel.scrollTop = 0;
    }
    this.lastView = view;
  }

  /**
   * Optional Manage Machine screen (from the free pick or the shop). Lists every installed item with its
   * sites, Power, refund and the modifiers anchored to it; selling needs Sell → Confirm. Returns to the
   * originating screen with offers, prices and the selected card untouched.
   */
  private renderManage() {
    const r = this.run;
    this.panel.classList.remove('focus');
    const dormant = r.dormantKeys();
    const rows = r.installed
      .map(it => {
        const on = it.uid === this.msel;
        const anchored = Object.keys(r.mods).filter(k => !k.includes(':') && r.mods[k].length && it.parts.some(d => d.id === anchorOf(k)));
        const modCount = anchored.reduce((n, k) => n + r.mods[k].length, 0);
        const refund = Math.floor(it.paid / 2);
        return `<div class="mrow ${on ? 'on' : ''}" data-act="msel" data-item="${esc(it.uid)}">
          <div class="mname">${esc(it.name)}${it.parts.length > 1 ? ` <span class="mpieces">${it.parts.length} pieces</span>` : ''}</div>
          <div class="mmeta">${it.mounts.map(mountName).join(' + ')} · ⚡${it.power} · ${it.via === 'shop' ? `paid $${it.paid} → refund $${refund}` : 'free reward → $0'}${modCount ? ` · ${modCount} boost${modCount > 1 ? 's' : ''} here` : ''}${it.displaces.length ? ` · replaces ${it.displaces.join(', ')}` : ''}</div>
        </div>`;
      })
      .join('');
    let detail = '';
    const it = r.installed.find(i => i.uid === this.msel);
    if (it) {
      const info = r.saleInfo(it.uid)!;
      const list = (xs: { key: string; names: string[] }[]) => xs.map(x => `${esc(x.names.join(', '))} <span class="dim">(${esc(placeOfKey(x.key))})</span>`).join('<br>');
      detail = this.confirming
        ? `<div class="mconfirm"><b>Sell ${esc(info.name)}?</b>
            <div>Power ⚡${info.powerBefore} → ⚡${info.powerAfter} · refund $${info.refund}</div>
            ${info.dormant.length ? `<div>Stays on the board, dormant until a compatible part returns to this site:<br>${list(info.dormant)}</div>` : '<div>No boosts on it.</div>'}
            ${info.waking.length ? `<div>Factory part returns; these wake up:<br>${list(info.waking)}</div>` : ''}
            <div class="mbtns"><button data-act="mcancel">CANCEL</button><button class="danger" data-act="mconfirm">CONFIRM SELL</button></div></div>`
        : `<div class="mconfirm"><div>Selling frees ⚡${info.powerFreed} (⚡${info.powerBefore} → ⚡${info.powerAfter}) and pays $${info.refund}. Boosts are never deleted.</div>
            <div class="mbtns"><button class="danger" data-act="msell">SELL / DISMANTLE</button></div></div>`;
    }
    const dorm = dormant.length
      ? `<div class="mdorm">Waiting boosts (they wake up when a matching part returns to their spot): ${dormant.map(k => `${esc(r.mods[k].map(m => m.note).join(', '))}, at ${esc(placeOfKey(k))}`).join(' · ')}</div>`
      : '';
    this.panel.innerHTML = `<div class="shead"><button class="back" data-act="mback">◀ BACK TO ${r.phase === 'draft' ? 'FREE PICK' : 'SHOP'}</button><div class="stitle"><b>MANAGE</b></div><div class="pchips"><span class="chip power">⚡${r.powerUsed}/${r.maxPower}</span><span class="chip money">$${r.money}</span></div></div>
      ${this.saleNote ? `<div class="pgrant">${esc(this.saleNote)}</div>` : ''}
      ${it ? `<div class="dmapwrap small"><canvas class="dmap" aria-hidden="true"></canvas></div>` : '<div class="ssub">Tap an installed part to see where it sits.</div>'}
      <div class="mlist">${rows || '<div class="empty">Factory table only: nothing installed to sell.</div>'}</div>${detail}${dorm}`;
    this.setView('manage');
    this.preview();
    this.drawMaps();
    this.tag();
  }

  private onClick(e: MouseEvent) {
    const mel = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    const act = mel?.dataset.act;
    if (act === 'tipok') {
      const id = mel!.dataset.tip as 'draft' | 'shop';
      this.host.tips?.mark(id);
      e.stopPropagation();
      return this.render();
    }
    if (act === 'manage') {
      this.mode = 'manage';
      this.msel = null;
      this.confirming = false;
      this.saleNote = '';
      e.stopPropagation();
      return this.render();
    }
    if (this.mode === 'manage') {
      if (act === 'mback') this.mode = 'offers';
      else if (act === 'msel') {
        this.msel = mel!.dataset.item ?? null;
        this.confirming = false;
      } else if (act === 'msell') this.confirming = true;
      else if (act === 'mcancel') this.confirming = false;
      else if (act === 'mconfirm' && this.msel) {
        const dormantBefore = this.run.dormantKeys();
        const res = this.run.sell(this.msel);
        if (res.ok) {
          this.host.recorder?.sale(this.run, res, dormantBefore);
          this.saleNote = `Sold ${res.name}: ⚡${res.powerFreed} freed, +$${res.refund}${(() => {
            const n = res.dormant.reduce((a, d) => a + d.names.length, 0);
            return n ? `, ${n} boost${n === 1 ? '' : 's'} waiting` : '';
          })()}.`;
          this.host.loadMachine(this.run.preset(), targetFor(this.run.challenge + 1));
        }
        this.msel = null;
        this.confirming = false;
      }
      return this.render();
    }
    this.onOfferClick(e);
  }

  private onOfferClick(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-mount],.offer');
    if (!el) return;
    const uid = Number(el.dataset.uid ?? el.closest<HTMLElement>('.offer')?.dataset.uid);
    if (el.dataset.mount) {
      this.sel = { uid, mount: el.dataset.mount };
    } else if (el.dataset.act === 'take') {
      const mount = this.sel?.uid === uid ? this.sel.mount : undefined;
      const wasDraft = this.run.phase === 'draft';
      const offer = (wasDraft ? this.run.draft : this.run.shop).find(o => o.uid === uid);
      const declined = wasDraft ? this.run.draft.filter(o => o.uid !== uid) : [];
      const moneyBefore = this.run.money;
      const dormantBefore = this.run.dormantKeys();
      const res = wasDraft ? this.run.takeDraft(uid, mount) : this.run.buy(uid, mount);
      const rec = this.host.recorder;
      if (res.ok && rec && offer) rec.boardDiff(this.run, dormantBefore);
      if (res.ok && rec && offer) {
        const placed = offer.kind === 'machine' ? this.run.installed[this.run.installed.length - 1]?.placement : undefined;
        if (wasDraft) {
          rec.draftTaken(this.run, offer, declined, placed);
          rec.shopOffers(this.run, 'open');
        } else rec.purchase(this.run, offer, moneyBefore, placed);
      }
      if (res.ok) {
        if (!wasDraft) this.host.onPurchase?.();
        this.sel = null;
        this.justBought = wasDraft ? -1 : uid;
        this.lastOpened = -1;
        // show the new machine on the board right away
        this.host.loadMachine(this.run.preset(), targetFor(this.run.challenge + 1));
      }
    } else if (el.dataset.act === 'back') {
      this.sel = null;
    } else if (el.dataset.act === 'peek') {
      this.peeking = true;
    } else if (el.dataset.act === 'unpeek') {
      this.peeking = false;
    } else if (el.dataset.act === 'open') {
      this.sel = { uid };
      this.lastOpened = uid;
    } else if (el.dataset.act === 'reroll') {
      const price = this.run.rerollPrice, moneyBefore = this.run.money;
      if (this.run.reroll() && this.host.recorder) {
        this.host.recorder.reroll(this.run, price, moneyBefore);
        this.host.recorder.shopOffers(this.run, 'reroll');
      }
      this.sel = null;
      this.lastView = '';
    } else if (el.dataset.act === 'next') {
      if (this.run.next()) this.host.recorder?.nextChallenge(this.run);
      this.closePanel();
      this.start();
      return;
    } else if (el.classList.contains('offer')) {
      if (this.sel?.uid !== uid) this.sel = { uid };
      this.lastOpened = uid;
    }
    this.render();
  }
}
