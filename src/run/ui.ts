/**
 * Between-challenge UI for /build-test/: clear → free draft (pick 1 of 3) → shop → next challenge.
 * Panels sit in the lower part of the stage so the board (and the placement preview) stays visible.
 * Live play is never covered: panels only open when no ball is in play.
 */
import { MOUNTS, mountName } from './catalog.ts';
import { Run, anchorOf, type Offer } from './run.ts';
import { ECONOMY } from './economy.ts';
import { anchorsFor } from '../view/anchors.ts';
import type { GameView } from '../view/game.ts';
import type { Simulation } from '../physics/sim.ts';
import type { Preset } from '../machines/presets.ts';
import type { RunRecord, RunRecorder } from '../telemetry/run-recorder.ts';
import type { PitchCarry } from '../physics/sim.ts';
import { panelTip, type TipBook } from './coach.ts';
import type { LoadResult, SaveFile } from './save.ts';

export type BuildHost = {
  view: GameView;
  getSim: () => Simulation;
  /** Rebuild the table for this machine with a challenge target. */
  loadMachine: (preset: Preset, target: number) => void;
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
};

const fmt = (n: number) => n.toLocaleString();
const ROLES = ['STARTER', 'RELIEVER', 'CLOSER'];
/** "INNING 2 · RELIEVER" for a challenge number. */
export const roleOf = (c: number) => `INNING ${Math.ceil(c / ECONOMY.challengesPerInning)} · ${ROLES[(c - 1) % ECONOMY.challengesPerInning]}`;
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

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
    stage.appendChild(this.panel);
    this.panel.addEventListener('click', e => this.onClick(e));
    (window as any).buildRun = this.run;
  }

  /** Short machine summary used on the cards and overlays. */
  private machineLine() {
    const r = this.run;
    const mods = Object.values(r.mods).reduce((n, l) => n + l.length, 0);
    const parts = r.installed.length ? r.installed.map(i => i.name).join(', ') : 'factory table';
    return `${parts}${mods ? ` · ${mods} mod${mods > 1 ? 's' : ''}` : ''}`;
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
  newRun() {
    this.closePanel();
    this.runSeed = (Math.random() * 2 ** 32) >>> 0;
    this.run = new Run(this.runSeed);
    (window as any).buildRun = this.run;
    this.start();
  }

  private offerContinue(f: SaveFile) {
    const r = f.run;
    // show the saved machine behind the card, so "continue" visibly means *this* table
    this.peek(f);
    const where = r.phase === 'challenge' ? `${roleOf(r.challenge)} · challenge ${r.challenge} of ${ECONOMY.lastChallenge}` : `after challenge ${r.challenge} (${r.phase === 'draft' ? 'free pick' : 'shop'})`;
    const pitch = f.pitch ? ` · ${fmt(f.pitch.score)} scored, strike ${f.pitch.strikes} of 3` : '';
    const nMods = Object.values(r.mods).reduce((n, l) => n + l.length, 0);
    this.host.showOverlay(
      'WELCOME BACK',
      'CONTINUE YOUR RUN?',
      `${where[0].toUpperCase()}${where.slice(1)}${pitch}. ${r.installed.length} machine${r.installed.length === 1 ? '' : 's'} · ${nMods} modifier${nMods === 1 ? '' : 's'} · $${r.money}.`,
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
    this.host.loadMachine(run.preset(), run.target);
    this.tag();
    const note = dropped.length ? ` (${dropped.length} machine${dropped.length > 1 ? 's' : ''} no longer fit after an update and were refunded.)` : '';
    if (run.phase === 'challenge') {
      if (f.pitch) this.host.getSim().restoreCarry(f.pitch);
      rec?.startChallenge(run, this.host.getSim().rules.maxStrikes);
      const s = this.host.getSim().rules;
      this.host.showOverlay(
        `${roleOf(run.challenge)} · RUN RESUMED`,
        `TARGET ${fmt(run.target)}`,
        f.pitch
          ? `${fmt(s.score)} scored so far, ${fmt(Math.max(0, run.target - s.score))} to go · strike ${s.strikes} of ${s.maxStrikes}.${note}`
          : `Your machine: ${this.machineLine()}.${note}`,
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
    this.host.loadMachine(this.run.preset(), this.run.target);
    this.tag();
    this.save();
    this.host.showOverlay(
      `${roleOf(this.run.challenge)} · CHALLENGE ${this.run.challenge} OF ${ECONOMY.lastChallenge}`,
      `TARGET ${fmt(this.run.target)}`,
      this.run.challenge === 1
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

  /** Sim says the target was reached. */
  onClear() {
    const sim = this.host.getSim();
    const rec = this.host.recorder;
    // Finalize the challenge with the machine that actually played it, BEFORE any reward is applied.
    rec?.endChallenge(this.run, sim, 'cleared');
    this.lastEarned = this.run.clear(sim.rules.maxStrikes - sim.rules.strikes);
    rec?.afterClear(this.run, this.lastEarned);
    const victory = this.run.won;
    if (victory) {
      this.host.clearRun?.();
      rec?.endRun('completed');
      this.tag();
      this.host.showOverlay(
        'FINAL CLOSER CLEARED · 5 INNINGS',
        'RUN COMPLETE',
        `${fmt(sim.rules.score)} / ${fmt(this.run.target)} on challenge ${this.run.challenge}. Final machine: ${this.machineLine()}.`,
        'NEW RUN',
        () => this.newRun(),
        `POWER ${this.run.powerUsed}/${this.run.maxPower} · $${this.run.money}`,
        this.host.toTitle ? { label: 'MAIN MENU', action: () => this.host.toTitle!() } : undefined,
      );
      if (rec) this.host.devReport?.('Download Developer Report (HTML)', () => rec.lastRun() ?? rec.snapshot());
      return;
    }
    this.tag();
    this.save();
    // V2: the machine just grew. Rebuild the board now so the draft can preview the new section's mounts.
    if (this.run.sectionGrant) this.host.loadMachine(this.run.preset(), this.run.target);
    const grew = this.run.sectionGrant ? `THE MACHINE GREW: ${this.run.sectionGrant.name.toUpperCase()} UNLOCKED (FREE). ` : '';
    this.host.showOverlay(
      `${roleOf(this.run.challenge)} · CHALLENGE ${this.run.challenge} CLEARED`,
      `${fmt(sim.rules.score)} / ${fmt(this.run.target)}`,
      `${grew}${this.run.powerGrant ? `INNING ${this.run.powerGrant.inning} UNLOCKED — MAX POWER +${this.run.powerGrant.gained} (${this.run.powerGrant.maxPower} TOTAL). ` : ''}+$${this.lastEarned} (${ECONOMY.clearBase} + ${ECONOMY.clearPerStrikeLeft} per unused strike). Pick a free upgrade.`,
      'CHOOSE REWARD',
      () => {
        this.host.hideOverlay();
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
    this.run.fail();
    this.host.clearRun?.();
    rec?.endRun('failed');
    this.host.showOverlay(
      'THREE STRIKES',
      'CHALLENGE FAILED',
      `${fmt(sim.rules.score)} of ${fmt(this.run.target)} on challenge ${this.run.challenge}. Machine: ${this.machineLine()}.`,
      'NEW RUN',
      () => this.newRun(),
      undefined,
      this.host.toTitle ? { label: 'MAIN MENU', action: () => this.host.toTitle!() } : undefined,
    );
    // The terminal record is archived before the restart button, so it stays downloadable afterwards too.
    if (rec) this.host.devReport?.('Download Developer Report (HTML)', () => rec.lastRun() ?? rec.snapshot());
  }

  private openPanel() {
    this.sel = null;
    this.mode = 'offers';
    this.msel = null;
    this.confirming = false;
    this.panel.hidden = false;
    this.render();
  }

  private closePanel() {
    this.panel.hidden = true;
    this.host.view.highlights = [];
    this.host.view.highlightLabel = '';
  }

  private offers() {
    return this.run.phase === 'draft' ? this.run.draft : this.run.shop;
  }

  /** Highlight where the selected offer goes (mount) or what it boosts (target). */
  private preview() {
    const v = this.host.view;
    v.highlights = [];
    v.highlightLabel = '';
    if (this.mode === 'manage') {
      const it = this.run.installed.find(i => i.uid === this.msel);
      if (!it) return;
      const L = this.host.getSim().layout;
      for (const d of it.parts) v.highlights.push(...anchorsFor(L, d.id));
      for (const m of it.mounts) if (!v.highlights.length) {
        const mm = MOUNTS.find(x => x.id === m)!;
        v.highlights.push({ x: mm.anchor.x, y: mm.anchor.y, r: mm.r });
      }
      v.highlightLabel = `${it.name} · ${it.mounts.map(mountName).join(' + ')}`;
      return;
    }
    const o = this.offers().find(o => o.uid === this.sel?.uid);
    if (!o) return;
    if (o.kind === 'machine') {
      // every child site of every candidate placement (bundles show all their pieces' sites)
      const chk = this.run.check(o);
      const places = this.sel?.mount ? [this.sel.mount] : chk.ok ? chk.mounts : o.mounts;
      for (const pid of places) for (const id of pid.split('+')) {
        const m = MOUNTS.find(m => m.id === id)!;
        v.highlights.push({ x: m.anchor.x, y: m.anchor.y, r: m.r });
      }
      v.highlightLabel = places.length === 1 ? places[0].split('+').map(mountName).join(' + ') : chk.ok ? 'Pick a spot' : 'Needs room: Manage Machine';
    } else {
      v.highlights = anchorsFor(this.host.getSim().layout, o.target.key);
      v.highlightLabel = `${o.name}: ${o.desc}`;
    }
  }

  private card(o: Offer) {
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
    } else where = `Applies to: ${esc(o.target.label)}`;
    const needsMount = o.kind === 'machine' && chk.ok && chk.mounts.length > 1 && !(selected && this.sel?.mount);
    const disabled = !chk.ok || !afford || needsMount;
    const reason = !chk.ok ? (chk.fixable ? 'NEEDS ROOM' : chk.reason) : !afford ? `Need $${o.price}` : needsMount ? 'Pick a spot' : '';
    const action = isShop ? `BUY $${o.price}` : 'TAKE FREE';
    const scope = o.kind === 'modifier' ? (o.scope === 'all' ? 'ALL' : o.scope === 'cross' ? 'CROSS' : 'THIS') : '';
    const tag = o.kind === 'machine' ? `MACHINE${o.pieces ? ` · ${o.pieces} PIECES` : ''} · ⚡${o.power}` : `MODIFIER · ${scope} · no power`;
    const manage = o.kind === 'machine' && !chk.ok && chk.fixable ? `<button class="omanage" data-act="manage" data-uid="${o.uid}">MANAGE MACHINE</button>` : '';
    return `<div class="offer ${o.kind} ${selected ? 'sel' : ''} ${!chk.ok ? 'locked' : ''}" data-uid="${o.uid}">
      <div class="otag">${tag}</div>
      <div class="oname">${o.name}</div>
      <div class="odesc">${o.desc}</div>
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
    const manageBtn = `<button class="pmanage" data-act="manage">MANAGE MACHINE</button>`;
    const head = draft
      ? `<div class="phead"><b>FREE PICK</b><span>Choose 1 of ${r.draft.length} · ⚡${r.powerUsed}/${r.maxPower} used · tap a card to preview it</span>${manageBtn}</div>`
      : `<div class="phead"><b>SHOP</b><span>$${r.money} · ⚡${r.powerUsed}/${r.maxPower} used · buy as many as you can afford</span>${manageBtn}</div>`;
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
    if (selected) {
      // Focus mode: only the chosen card, so the whole board shows where it goes.
      this.panel.classList.add('focus');
      this.panel.innerHTML = `<div class="phead"><button class="back" data-act="back">◀ ALL ${draft ? 'PICKS' : 'OFFERS'}</button><span>${draft ? 'Free pick' : `$${r.money} · ⚡${r.powerUsed}/${r.maxPower}`}</span></div>
        <div class="offers one">${this.card(selected)}</div>`;
    } else {
      this.panel.classList.remove('focus');
      this.panel.innerHTML = `${head}${grant}${tip}<div class="offers ${draft ? 'draft' : 'shop'}">${this.offers().map(o => this.card(o)).join('') || '<div class="empty">Sold out. Reroll or head to the next challenge.</div>'}</div>
      <div class="pmachine">Machine: ${this.machineLine()}</div>${foot}`;
    }
    this.preview();
    this.tag();
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
          <div class="mmeta">${it.mounts.map(mountName).join(' + ')} · ⚡${it.power} · ${it.via === 'shop' ? `paid $${it.paid} → refund $${refund}` : 'free reward → $0'}${modCount ? ` · ${modCount} modifier${modCount > 1 ? 's' : ''} here` : ''}${it.displaces.length ? ` · replaces ${it.displaces.join(', ')}` : ''}</div>
        </div>`;
      })
      .join('');
    let detail = '';
    const it = r.installed.find(i => i.uid === this.msel);
    if (it) {
      const info = r.saleInfo(it.uid)!;
      const list = (xs: { key: string; names: string[] }[]) => xs.map(x => `${esc(x.names.join(', '))} <span class="dim">(${esc(x.key)})</span>`).join('<br>');
      detail = this.confirming
        ? `<div class="mconfirm"><b>Sell ${esc(info.name)}?</b>
            <div>Power ⚡${info.powerBefore} → ⚡${info.powerAfter} · refund $${info.refund}</div>
            ${info.dormant.length ? `<div>Stays on the board, dormant until a compatible part returns to this site:<br>${list(info.dormant)}</div>` : '<div>No modifiers are anchored to it.</div>'}
            ${info.waking.length ? `<div>Factory part returns; these wake up:<br>${list(info.waking)}</div>` : ''}
            <div class="mbtns"><button data-act="mcancel">CANCEL</button><button class="danger" data-act="mconfirm">CONFIRM SELL</button></div></div>`
        : `<div class="mconfirm"><div>Selling frees ⚡${info.powerFreed} (⚡${info.powerBefore} → ⚡${info.powerAfter}) and pays $${info.refund}. Modifiers are never deleted.</div>
            <div class="mbtns"><button class="danger" data-act="msell">SELL / DISMANTLE</button></div></div>`;
    }
    const dorm = dormant.length
      ? `<div class="mdorm">Dormant modifiers (waiting for a compatible part at their site): ${dormant.map(k => `${esc(r.mods[k].map(m => m.note).join(', '))} @ ${esc(k)}`).join(' · ')}</div>`
      : '';
    this.panel.innerHTML = `<div class="phead"><button class="back" data-act="mback">◀ BACK TO ${r.phase === 'draft' ? 'FREE PICK' : 'SHOP'}</button><b>MANAGE</b><span>⚡${r.powerUsed}/${r.maxPower} · $${r.money}</span></div>
      ${this.saleNote ? `<div class="pgrant">${esc(this.saleNote)}</div>` : ''}
      <div class="mlist">${rows || '<div class="empty">Factory table only: nothing installed to sell.</div>'}</div>${detail}${dorm}`;
    this.preview();
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
          this.saleNote = `Sold ${res.name}: ⚡${res.powerFreed} freed, +$${res.refund}${res.dormant.length ? `, ${res.dormant.reduce((n, d) => n + d.names.length, 0)} modifier(s) dormant` : ''}.`;
          this.host.loadMachine(this.run.preset(), this.run.target);
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
        this.sel = null;
        // show the new machine on the board right away
        this.host.loadMachine(this.run.preset(), this.run.target);
      }
    } else if (el.dataset.act === 'back') {
      this.sel = null;
    } else if (el.dataset.act === 'reroll') {
      const price = this.run.rerollPrice, moneyBefore = this.run.money;
      if (this.run.reroll() && this.host.recorder) {
        this.host.recorder.reroll(this.run, price, moneyBefore);
        this.host.recorder.shopOffers(this.run, 'reroll');
      }
      this.sel = null;
    } else if (el.dataset.act === 'next') {
      if (this.run.next()) this.host.recorder?.nextChallenge(this.run);
      this.closePanel();
      this.start();
      return;
    } else if (el.classList.contains('offer')) {
      if (this.sel?.uid !== uid) this.sel = { uid };
    }
    this.render();
  }
}
