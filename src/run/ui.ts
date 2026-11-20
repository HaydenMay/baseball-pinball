/**
 * Between-challenge UI for /build-test/: clear → free draft (pick 1 of 3) → shop → next challenge.
 * Panels sit in the lower part of the stage so the board (and the placement preview) stays visible.
 * Live play is never covered: panels only open when no ball is in play.
 */
import { MOUNTS } from './catalog.ts';
import { Run, type Offer } from './run.ts';
import { ECONOMY } from './economy.ts';
import { anchorsFor } from '../view/anchors.ts';
import type { GameView } from '../view/game.ts';
import type { Simulation } from '../physics/sim.ts';
import type { Preset } from '../machines/presets.ts';
import type { RunRecord, RunRecorder } from '../telemetry/run-recorder.ts';

export type BuildHost = {
  view: GameView;
  getSim: () => Simulation;
  /** Rebuild the table for this machine with a challenge target. */
  loadMachine: (preset: Preset, target: number) => void;
  showOverlay: (kicker: string, title: string, text: string, button: string, action: () => void, info?: string) => void;
  hideOverlay: () => void;
  setTag: (text: string) => void;
  startPitch: () => void;
  /** Developer run recorder (always records on the build test; silent). */
  recorder?: RunRecorder | null;
  /** Offer a report download on the current overlay (shown only with ?devAnalytics=1). */
  devReport?: (label: string, get: () => RunRecord | null) => void;
  theme?: string;
};

const fmt = (n: number) => n.toLocaleString();

export class BuildUI {
  run: Run;
  host: BuildHost;
  panel: HTMLDivElement;
  /** Selected offer + mount in the open panel. */
  private sel: { uid: number; mount?: string } | null = null;
  private lastEarned = 0;
  /** The Run the recorder is currently recording (a new Run object starts a new recorded run). */
  private recordedRun: Run | null = null;
  private runSeed = 0;

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

  start() {
    this.host.loadMachine(this.run.preset(), this.run.target);
    this.tag();
    this.host.showOverlay(
      `BUILD TEST · CHALLENGE ${this.run.challenge}`,
      `TARGET ${fmt(this.run.target)}`,
      this.run.challenge === 1
        ? 'Factory table. Reach the target within three strikes to earn an upgrade.'
        : `Your machine: ${this.machineLine()}.`,
      'PLAY BALL',
      () => this.host.startPitch(),
      `POWER ${this.run.powerUsed}/${this.run.maxPower} · $${this.run.money} · test values`,
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
    const victory = this.run.challenge >= ECONOMY.lastChallenge;
    if (victory) rec?.endRun('completed');
    this.tag();
    this.host.showOverlay(
      `CHALLENGE ${this.run.challenge} CLEARED`,
      `${fmt(sim.rules.score)} / ${fmt(this.run.target)}`,
      `${this.run.powerGrant ? `INNING ${this.run.powerGrant.inning} UNLOCKED — MAX POWER +${this.run.powerGrant.gained} (${this.run.powerGrant.maxPower} TOTAL). ` : ''}+$${this.lastEarned} (${ECONOMY.clearBase} + ${ECONOMY.clearPerStrikeLeft} per unused strike). Pick a free upgrade.`,
      'CHOOSE REWARD',
      () => {
        this.host.hideOverlay();
        this.openPanel();
      },
      `POWER ${this.run.powerUsed}/${this.run.maxPower} · $${this.run.money} · test values`,
    );
    if (victory && rec) this.host.devReport?.('Download Developer Report (HTML)', () => rec.lastRun() ?? rec.snapshot());
  }

  /** Third strike short of the target. */
  onFail() {
    const sim = this.host.getSim();
    const rec = this.host.recorder;
    rec?.endChallenge(this.run, sim, 'failed');
    this.run.fail();
    rec?.endRun('failed');
    this.host.showOverlay(
      'THREE STRIKES',
      'CHALLENGE FAILED',
      `${fmt(sim.rules.score)} of ${fmt(this.run.target)} on challenge ${this.run.challenge}. Machine: ${this.machineLine()}.`,
      'RESTART TEST RUN',
      () => {
        this.runSeed = (Math.random() * 2 ** 32) >>> 0;
        this.run = new Run(this.runSeed);
        (window as any).buildRun = this.run;
        this.start();
      },
    );
    // The terminal record is archived before the restart button, so it stays downloadable afterwards too.
    if (rec) this.host.devReport?.('Download Developer Report (HTML)', () => rec.lastRun() ?? rec.snapshot());
  }

  private openPanel() {
    this.sel = null;
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
    const o = this.offers().find(o => o.uid === this.sel?.uid);
    if (!o) return;
    if (o.kind === 'machine') {
      const mounts = this.sel?.mount ? [this.sel.mount] : o.mounts.filter(id => this.run.mountStatus(id).state === 'free');
      for (const id of mounts) {
        const m = MOUNTS.find(m => m.id === id)!;
        v.highlights.push({ x: m.anchor.x, y: m.anchor.y, r: m.r });
      }
      v.highlightLabel = mounts.length === 1 ? MOUNTS.find(m => m.id === mounts[0])!.name : 'Pick a spot';
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
    if (o.kind === 'machine') {
      if (chk.ok && chk.mounts.length > 1) {
        mountsHtml = `<div class="mounts">${chk.mounts
          .map(id => `<button class="mount ${selected && this.sel?.mount === id ? 'on' : ''}" data-uid="${o.uid}" data-mount="${id}">${MOUNTS.find(m => m.id === id)!.name}</button>`)
          .join('')}</div>`;
      } else if (chk.ok) where = `Installs at: ${MOUNTS.find(m => m.id === chk.mounts[0])!.name}`;
    } else where = `Applies to: ${o.target.label}`;
    const needsMount = o.kind === 'machine' && chk.ok && chk.mounts.length > 1 && !(selected && this.sel?.mount);
    const disabled = !chk.ok || !afford || needsMount;
    const reason = !chk.ok ? chk.reason : !afford ? `Need $${o.price}` : needsMount ? 'Pick a spot' : '';
    const action = isShop ? `BUY $${o.price}` : 'TAKE FREE';
    return `<div class="offer ${o.kind} ${selected ? 'sel' : ''} ${!chk.ok ? 'locked' : ''}" data-uid="${o.uid}">
      <div class="otag">${o.kind === 'machine' ? `MACHINE · ⚡${o.power}` : 'MODIFIER · no power'}</div>
      <div class="oname">${o.name}</div>
      <div class="odesc">${o.desc}</div>
      ${where ? `<div class="owhere">${where}</div>` : ''}${mountsHtml}
      <button class="obuy" data-act="take" data-uid="${o.uid}" ${disabled ? 'disabled' : ''}>${reason || action}</button>
    </div>`;
  }

  private render() {
    const r = this.run;
    const draft = r.phase === 'draft';
    const head = draft
      ? `<div class="phead"><b>FREE PICK</b><span>Choose 1 of ${r.draft.length} · ⚡${r.powerUsed}/${r.maxPower} used · tap a card to preview it</span></div>`
      : `<div class="phead"><b>SHOP</b><span>$${r.money} · ⚡${r.powerUsed}/${r.maxPower} used · buy as many as you can afford</span></div>`;
    // Small, non-blocking reward line when this clear finished an inning.
    const grant = r.powerGrant
      ? `<div class="pgrant">INNING ${r.powerGrant.inning} UNLOCKED — MAX POWER +${r.powerGrant.gained} (${r.powerGrant.maxPower} TOTAL)</div>`
      : '';
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
      this.panel.innerHTML = `${head}${grant}<div class="offers ${draft ? 'draft' : 'shop'}">${this.offers().map(o => this.card(o)).join('') || '<div class="empty">Sold out. Reroll or head to the next challenge.</div>'}</div>
      <div class="pmachine">Machine: ${this.machineLine()}</div>${foot}`;
    }
    this.preview();
    this.tag();
  }

  private onClick(e: MouseEvent) {
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
      const res = wasDraft ? this.run.takeDraft(uid, mount) : this.run.buy(uid, mount);
      const rec = this.host.recorder;
      if (res.ok && rec && offer) {
        const placed = offer.kind === 'machine' ? this.run.installed[this.run.installed.length - 1]?.mountId : undefined;
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
