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

export type BuildHost = {
  view: GameView;
  getSim: () => Simulation;
  /** Rebuild the table for this machine with a challenge target. */
  loadMachine: (preset: Preset, target: number) => void;
  showOverlay: (kicker: string, title: string, text: string, button: string, action: () => void, info?: string) => void;
  hideOverlay: () => void;
  setTag: (text: string) => void;
  startPitch: () => void;
};

const fmt = (n: number) => n.toLocaleString();

export class BuildUI {
  run: Run;
  host: BuildHost;
  panel: HTMLDivElement;
  /** Selected offer + mount in the open panel. */
  private sel: { uid: number; mount?: string } | null = null;
  private lastEarned = 0;

  constructor(host: BuildHost, stage: HTMLElement) {
    this.host = host;
    this.run = new Run((Math.random() * 2 ** 32) >>> 0);
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
  }

  /** Sim says the target was reached. */
  onClear() {
    const sim = this.host.getSim();
    this.lastEarned = this.run.clear(sim.rules.maxStrikes - sim.rules.strikes);
    this.tag();
    this.host.showOverlay(
      `CHALLENGE ${this.run.challenge} CLEARED`,
      `${fmt(sim.rules.score)} / ${fmt(this.run.target)}`,
      `+$${this.lastEarned} (${ECONOMY.clearBase} + ${ECONOMY.clearPerStrikeLeft} per unused strike). Pick a free upgrade.`,
      'CHOOSE REWARD',
      () => {
        this.host.hideOverlay();
        this.openPanel();
      },
    );
  }

  /** Third strike short of the target. */
  onFail() {
    const sim = this.host.getSim();
    this.run.fail();
    this.host.showOverlay(
      'THREE STRIKES',
      'CHALLENGE FAILED',
      `${fmt(sim.rules.score)} of ${fmt(this.run.target)} on challenge ${this.run.challenge}. Machine: ${this.machineLine()}.`,
      'RESTART TEST RUN',
      () => {
        this.run = new Run((Math.random() * 2 ** 32) >>> 0);
        (window as any).buildRun = this.run;
        this.start();
      },
    );
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
      ? `<div class="phead"><b>FREE PICK</b><span>Choose 1 of ${r.draft.length} · tap a card to preview it on the board</span></div>`
      : `<div class="phead"><b>SHOP</b><span>$${r.money} · ⚡${r.powerUsed}/${r.maxPower} used · buy as many as you can afford</span></div>`;
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
      this.panel.innerHTML = `${head}<div class="offers ${draft ? 'draft' : 'shop'}">${this.offers().map(o => this.card(o)).join('') || '<div class="empty">Sold out. Reroll or head to the next challenge.</div>'}</div>
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
      const res = this.run.phase === 'draft' ? this.run.takeDraft(uid, mount) : this.run.buy(uid, mount);
      if (res.ok) {
        this.sel = null;
        // show the new machine on the board right away
        this.host.loadMachine(this.run.preset(), this.run.target);
      }
    } else if (el.dataset.act === 'back') {
      this.sel = null;
    } else if (el.dataset.act === 'reroll') {
      this.run.reroll();
      this.sel = null;
    } else if (el.dataset.act === 'next') {
      this.run.next();
      this.closePanel();
      this.start();
      return;
    } else if (el.classList.contains('offer')) {
      if (this.sel?.uid !== uid) this.sel = { uid };
    }
    this.render();
  }
}
