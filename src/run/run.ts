/**
 * One build-test run: the machine (installed items + board modifiers), Power, money, and the
 * challenge → draft → shop → next challenge cycle over 5 innings (15 challenges). Headless and
 * deterministic per seed so it can be tested; the browser UI and the bot drive the same object.
 *
 * Board model (Upgrade System 3.0):
 * - An installed ITEM is one owned acquisition (single machine or bundle) with 1+ physical PARTS.
 * - Part ids are stable site anchors `${base}@${mount}`. Targeted modifiers are keyed by part id, so they
 *   belong to the board location + compatible part type, not to an owned object. A part that's not on
 *   the board makes its modifiers DORMANT (the sim never sees that id); a compatible reinstall at the
 *   same site (same id) wakes them exactly once, because they never moved or got copied.
 * - Group modifiers ("bumper:*", "multgate:*", "ramps:*", "ramp:*", "cross:*") apply to every compatible
 *   part, present and future, and are never dormant.
 * - Selling (between challenges only) removes the whole item, frees 100% of its Power and mounts, refunds
 *   floor(actual price paid / 2) (free draft rewards refund $0), and never deletes a modifier.
 */
import type { MechanismDef, Modifier, ModifierTable } from '../machines/mechanisms.ts';
import type { Preset } from '../machines/presets.ts';
import { SECTION_UNLOCKS, UPPER_DECK, V2, type SectionId } from '../machines/sections.ts';
import { MACHINES, MODS, MOUNTS, familyOfKey, placementsOf, type BoardView, type Family, type MachineOffer, type Mount, type Placement } from './catalog.ts';
import { ECONOMY, inningOf, targetFor } from './economy.ts';
import { OFFER_WEIGHTS, investment, pickWeighted, weigh } from './weights.ts';

export type Installed = {
  /** Ownership id (one per acquisition; a bundle is one item). */
  uid: string;
  offerKey: string;
  name: string;
  family: Family;
  /** Placement chosen (a mount id, or "a+b" for multi-mount spans). */
  placement: string;
  /** Every mount this item occupies; `mountId` is the first (kept for older callers). */
  mounts: string[];
  mountId: string;
  /** Physical parts with their site-anchored ids. */
  parts: MechanismDef[];
  /** First part (kept for older callers). */
  id: string;
  def: MechanismDef;
  /** Total Power occupied (every part's powerCost). */
  power: number;
  /** Factory parts removed while this is installed. */
  displaces: string[];
  /** Acquisition provenance, for refunds. */
  via: 'draft' | 'shop' | 'test';
  paid: number;
};

export type Offer =
  | {
      uid: number;
      kind: 'machine';
      key: string;
      name: string;
      desc: string;
      power: number;
      price: number;
      /** Placement ids (mount id, or "a+b" for spans). */
      mounts: string[];
      pieces?: number;
      origin?: 'synergy' | 'family' | 'wildcard';
      weight?: number;
      synergies?: string[];
    }
  | {
      uid: number;
      kind: 'modifier';
      key: string;
      name: string;
      desc: string;
      price: number;
      target: { key: string; label: string };
      mod: Modifier;
      scope?: 'this' | 'all' | 'cross';
      origin?: 'synergy' | 'family' | 'wildcard';
      weight?: number;
      synergies?: string[];
    };

export type MountStatus = { mount: Mount; state: 'free' | 'taken' | 'blocked'; by?: string; byUid?: string };
/**
 * ok: installable right now on these placements. Otherwise a reason; `fixable` = it would fit after
 * selling the listed items (`sellUids`, minimal for one placement) and/or freeing `needPower`.
 */
export type Check =
  | { ok: true; mounts: string[] }
  | { ok: false; reason: string; fixable?: boolean; needPower?: number; blockers?: { uid: string; name: string }[] };

export type Phase = 'challenge' | 'draft' | 'shop' | 'failed' | 'won';

export type SaleInfo = {
  uid: string;
  name: string;
  refund: number;
  powerFreed: number;
  powerBefore: string;
  powerAfter: string;
  /** Modifiers that go dormant (their part leaves the board) and factory-part modifiers that wake up. */
  dormant: { key: string; names: string[] }[];
  waking: { key: string; names: string[] }[];
};

/** Factory parts left off the build-test starter table (playtest finding, see BUILD_LOOP_PLAYTEST.md). */
export const BUILD_TEST_REMOVED = ['post-l', 'post-r'];

const isGroupKey = (k: string) => k.includes(':');
/** Anchor part id of a targeted key ("ramp@orbit-l-gate" → "ramp@orbit-l"). */
export const anchorOf = (k: string) => k.replace(/-(gate|cp)$/, '');

export class Run {
  challenge = 1;
  money = 0;
  maxPower = ECONOMY.startPower;
  installed: Installed[] = [];
  mods: ModifierTable = {};
  phase: Phase = 'challenge';
  draft: Offer[] = [];
  shop: Offer[] = [];
  rerolls = 0;
  /** Log of what was taken, for the playtest report. */
  history: string[] = [];
  /**
   * Set when the clear that just happened finished an inning and granted max Power (shown in the
   * draft/shop as "INNING n UNLOCKED"). Cleared when the next challenge starts.
   */
  powerGrant: { inning: number; gained: number; maxPower: number } | null = null;
  /** V2 Expandable Machine (build-test ?v2=1): structural sections are granted by progression. */
  v2 = V2.enabled;
  /** Structural sections unlocked so far (free; never Power, money or a draft pick). */
  sections: SectionId[] = [];
  /** Set by the clear that unlocked a section (shown on the between-challenge screens). */
  sectionGrant: { id: SectionId; name: string } | null = null;
  private seed: number;
  private uid = 1;
  private itemSeq = 1;

  constructor(seed = 1) {
    this.seed = seed >>> 0 || 1;
  }

  random() {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  get target() {
    return targetFor(this.challenge);
  }

  get powerUsed() {
    return this.installed.reduce((s, i) => s + i.power, 0);
  }

  get rerollPrice() {
    return ECONOMY.rerollBase + this.rerolls * ECONOMY.rerollStep;
  }

  /** Factory parts currently displaced by installed items. */
  get displaced() {
    const sec = this.sections.includes('upperDeck') ? UPPER_DECK.displaces : [];
    return [...new Set([...this.installed.flatMap(i => i.displaces), ...sec])];
  }

  /** Every physical part on the board right now (for targeting, weighting and dormancy). */
  board(): BoardView {
    return {
      parts: this.installed.flatMap(i => i.parts.map((d, k) => ({ id: d.id, type: d.type, offerKey: i.offerKey, name: i.name, mount: partMount(i, k), family: i.family }))),
      displaced: this.displaced,
      sections: [...this.sections],
    };
  }

  /** The current machine as a preset: factory table + installed parts + board modifiers. */
  preset(): Preset {
    return {
      id: 'baseline',
      route: '',
      name: 'Build Test',
      tagline: `Challenge ${this.challenge}`,
      maxPower: this.maxPower,
      // Player playtest: the two front pegs just above the batter deflect the ball too late to react to.
      // Removed on the build-test factory table only; / keeps them as the frozen comparison.
      removeBase: [...BUILD_TEST_REMOVED, ...this.displaced],
      mechanisms: this.installed.flatMap(i => i.parts),
      modifiers: structuredClone(this.mods),
      ...(this.sections.length ? { sections: [...this.sections] } : {}),
    };
  }

  // ───────── placement / feasibility ─────────

  /** A mount exists right now: factory mounts always, section mounts once that section is unlocked. */
  mountOpen(id: string) {
    const s = MOUNTS.find(m => m.id === id)?.section;
    return !s || this.sections.includes(s);
  }

  /** Placements of a machine whose mounts all exist right now. */
  places(m: MachineOffer) {
    return placementsOf(m).filter(p => p.mounts.every(id => this.mountOpen(id)));
  }

  mountStatus(id: string): MountStatus {
    const mount = MOUNTS.find(m => m.id === id)!;
    const here = this.installed.find(i => i.mounts.includes(id));
    if (here) return { mount, state: 'taken', by: here.name, byUid: here.uid };
    const blocker = this.installed.find(i => i.mounts.some(m => mount.conflicts?.includes(m)));
    if (blocker) return { mount, state: 'blocked', by: blocker.name, byUid: blocker.uid };
    return { mount, state: 'free' };
  }

  /** Items standing in the way of a placement (occupying or conflicting with any of its mounts). */
  blockersOf(p: Placement) {
    const uids = new Set<string>();
    for (const id of p.mounts) {
      const mount = MOUNTS.find(m => m.id === id)!;
      for (const i of this.installed) if (i.mounts.includes(id) || i.mounts.some(m => mount.conflicts?.includes(m))) uids.add(i.uid);
    }
    return this.installed.filter(i => uids.has(i.uid));
  }

  /**
   * Can this offer be installed right now? If not, could it be after selling (always possible when it
   * fits within max Power at all, since every installed item can be sold)? Never displaces anything.
   */
  check(o: Offer): Check {
    if (o.kind === 'modifier') return { ok: true, mounts: [] };
    const m = MACHINES.find(m => m.key === o.key)!;
    if (m.power > this.maxPower) return { ok: false, reason: `Needs ⚡${m.power}; max Power is ${this.maxPower}`, fixable: false };
    const places = this.places(m);
    const free = places.filter(p => this.blockersOf(p).length === 0);
    const room = this.maxPower - this.powerUsed;
    if (free.length && m.power <= room) return { ok: true, mounts: free.map(p => p.id) };
    // Over capacity or blocked: find the placement needing the least Power to be freed.
    let best: { p: Placement; blockers: Installed[]; needPower: number } | null = null;
    for (const p of places) {
      const blockers = this.blockersOf(p);
      const freed = blockers.reduce((s, i) => s + i.power, 0);
      const needPower = Math.max(0, m.power - room - freed);
      const cost = blockers.length * 100 + needPower;
      if (!best || cost < blockers.length * 100 + best.needPower + (best.blockers.length - blockers.length) * 100) best = { p, blockers, needPower };
    }
    const b = best!;
    const parts: string[] = [];
    if (b.blockers.length) parts.push(`blocked by ${b.blockers.map(i => i.name).join(' + ')}`);
    const short = Math.max(0, m.power - room);
    if (short) parts.push(`needs ${short} more free Power`);
    return {
      ok: false,
      reason: `${parts.join('; ')} — use Manage Machine`,
      fixable: true,
      needPower: short,
      blockers: b.blockers.map(i => ({ uid: i.uid, name: i.name })),
    };
  }

  /**
   * Worth offering: fits within max Power, and at least one placement isn't held only by the same machine
   * type (never offer "sell your Turbo to take a Turbo"). Everything else can be freed via Manage Machine.
   */
  feasible(m: MachineOffer) {
    if (m.power > this.maxPower) return false;
    return this.places(m).some(p => !this.blockersOf(p).some(i => i.offerKey === m.key || sameParts(i, m)));
  }

  // ───────── offers ─────────

  private modFamilies(): Family[] {
    const b = this.board();
    const out: Family[] = [];
    for (const [k, list] of Object.entries(this.mods)) {
      const f = familyOfKey(k, b);
      if (f) for (let i = 0; i < list.length; i++) out.push(f);
    }
    return out;
  }

  private makeMachineOffer(m: MachineOffer, w?: ReturnType<typeof weigh>): Offer {
    return {
      uid: this.uid++, kind: 'machine', key: m.key, name: m.name, desc: m.desc, power: m.power, price: m.price,
      mounts: this.places(m).map(p => p.id), pieces: m.pieces,
      ...(w ? { origin: w.origin, weight: +w.weight.toFixed(2), synergies: w.synergies } : {}),
    };
  }

  private modCandidates(where: 'draft' | 'shop', board: BoardView, inv: Record<string, number>) {
    return MODS.filter(t => t.tier === where || t.tier === 'both')
      .map(t => ({ t, targets: t.targets(board), w: weigh(t.key, t.family, board, inv, where) }))
      .filter(x => x.targets.length);
  }

  /**
   * Roll n offers with hybrid weights (see weights.ts).
   * - draft (free pick): machines that fit within max Power (installable now OR after selling) and premium
   *   upgrades; always at least one immediately claimable modifier.
   * - shop: modifiers only, never a physical machine; full 4-card restock on every roll.
   * No duplicate cards in one roll; repeats across a run are fine.
   */
  private roll(n: number, where: 'draft' | 'shop'): Offer[] {
    const board = this.board();
    const inv = investment(board, this.modFamilies());
    const out: Offer[] = [];
    const mods = this.modCandidates(where, board, inv);
    const pickMod = (): Offer | null => {
      const pool = mods.filter(x => x.targets.some(tg => !out.some(o => o.kind === 'modifier' && o.key === x.t.key && o.target.key === tg.key)));
      if (!pool.length) return null;
      const x = pool[pickWeighted(pool.map(p => p.w.weight), this.random())];
      const targets = x.targets.filter(tg => !out.some(o => o.kind === 'modifier' && o.key === x.t.key && o.target.key === tg.key));
      const target = targets[Math.floor(this.random() * targets.length)];
      const mod: Modifier = { note: x.t.name };
      if (x.t.add) mod.add = x.t.add;
      if (x.t.mul) mod.mul = x.t.mul;
      if (x.t.gen) mod.gen = { ...x.t.gen };
      return {
        uid: this.uid++, kind: 'modifier', key: x.t.key, name: x.t.name, desc: x.t.effect, price: where === 'draft' ? 0 : x.t.price,
        target, mod, scope: x.t.scope, origin: x.w.origin, weight: +x.w.weight.toFixed(2), synergies: x.w.synergies,
      };
    };
    let guard = 0;
    while (out.length < n && guard++ < 200) {
      const machines = where === 'draft' ? MACHINES.filter(m => !out.some(o => o.key === m.key) && this.feasible(m)) : [];
      let o: Offer | null = null;
      if (machines.length && this.random() < OFFER_WEIGHTS.draftMachineShare) {
        const ws = machines.map(m => weigh(m.key, m.family, board, inv, where));
        const k = pickWeighted(ws.map(w => w.weight), this.random());
        o = this.makeMachineOffer(machines[k], ws[k]);
      } else o = pickMod();
      if (o) out.push(o);
    }
    // A player who doesn't want to sell is never stuck: at least one immediately claimable modifier.
    if (where === 'draft' && !out.some(o => o.kind === 'modifier')) {
      const idx = out.map((o, i) => [o, i] as const).reverse().find(([o]) => !this.check(o).ok)?.[1] ?? out.length - 1;
      const keep = out.splice(idx, 1);
      const m = pickMod();
      out.splice(idx, 0, m ?? keep[0]);
    }
    return out;
  }

  // ───────── lifecycle ─────────

  /** Challenge cleared: bank money; open the free draft, or win the run on the last challenge. */
  clear(strikesLeft: number) {
    if (this.phase !== 'challenge') return 0;
    const earned = ECONOMY.clearBase + ECONOMY.clearPerStrikeLeft * strikesLeft;
    this.money += earned;
    this.history.push(`C${this.challenge} cleared (+$${earned})`);
    if (this.challenge >= ECONOMY.lastChallenge) {
      // Final Closer: the run is won. No Power grant, no draft, no shop, no next challenge.
      this.phase = 'won';
      this.draft = [];
      this.shop = [];
      this.history.push('Run complete');
      return earned;
    }
    this.phase = 'draft';
    // Finished an inning: +1 permanent max Power BEFORE rolling this clear's draft, so the extra capacity
    // is usable right away. The phase guard above makes this once per clear.
    if (this.challenge % ECONOMY.challengesPerInning === 0) {
      this.maxPower += ECONOMY.powerPerInning;
      this.powerGrant = { inning: inningOf(this.challenge) + 1, gained: ECONOMY.powerPerInning, maxPower: this.maxPower };
      this.history.push(`Inning ${this.powerGrant.inning} unlocked: max Power ${this.maxPower}`);
    }
    // V2: the machine grows (free structure, before this clear's draft so its mounts can be offered at once).
    if (this.v2) {
      for (const [id, after] of Object.entries(SECTION_UNLOCKS) as [SectionId, number][]) {
        if (after === this.challenge && !this.sections.includes(id)) {
          this.sections.push(id);
          this.sectionGrant = { id, name: SECTION_NAMES[id] };
          this.history.push(`Machine grew: ${SECTION_NAMES[id]} unlocked`);
        }
      }
    }
    this.draft = this.roll(ECONOMY.draftSize, 'draft');
    return earned;
  }

  get won() {
    return this.phase === 'won';
  }

  fail() {
    if (this.phase === 'challenge') this.phase = 'failed';
  }

  /**
   * Take one draft offer for free. Exactly one per clear, and only on a successful install: a blocked or
   * over-capacity pick is a no-op that keeps the draft open (sell first via Manage Machine).
   */
  takeDraft(uid: number, mountId?: string) {
    if (this.phase !== 'draft') return { ok: false as const, reason: 'Not drafting' };
    const o = this.draft.find(d => d.uid === uid);
    if (!o) return { ok: false as const, reason: 'No such offer' };
    const r = this.apply(o, mountId, 'draft', 0);
    if (!r.ok) return r;
    this.history.push(`  draft: ${label(o, mountId)}`);
    this.draft = [];
    this.openShop();
    return r;
  }

  private openShop() {
    this.phase = 'shop';
    this.rerolls = 0;
    this.shop = this.roll(ECONOMY.shopSize, 'shop');
  }

  /** Buy from the shop. No purchase cap: money is the only limit. */
  buy(uid: number, mountId?: string) {
    if (this.phase !== 'shop') return { ok: false as const, reason: 'Shop closed' };
    const o = this.shop.find(d => d.uid === uid);
    if (!o) return { ok: false as const, reason: 'No such offer' };
    if (o.kind !== 'modifier') return { ok: false as const, reason: 'The shop sells modifiers only' };
    if (o.price > this.money) return { ok: false as const, reason: `Costs $${o.price}; you have $${this.money}` };
    const r = this.apply(o, mountId, 'shop', o.price);
    if (!r.ok) return r;
    this.money -= o.price;
    this.shop = this.shop.filter(s => s.uid !== uid);
    this.history.push(`  buy $${o.price}: ${label(o, mountId)}`);
    return r;
  }

  /** Full restock (4 new cards) at an escalating price. */
  reroll() {
    if (this.phase !== 'shop' || this.money < this.rerollPrice) return false;
    this.money -= this.rerollPrice;
    this.rerolls++;
    this.shop = this.roll(ECONOMY.shopSize, 'shop');
    return true;
  }

  /** Install a machine on a placement (atomic: all parts or none) or stack a modifier. Never displaces installs. */
  private apply(o: Offer, mountId: string | undefined, via: Installed['via'], paid: number) {
    if (o.kind === 'modifier') {
      (this.mods[o.target.key] ??= []).push({ ...o.mod });
      return { ok: true as const };
    }
    const c = this.check(o);
    if (!c.ok) return c;
    const placement = mountId ?? (c.mounts.length === 1 ? c.mounts[0] : undefined);
    if (!placement) return { ok: false as const, reason: 'Pick a spot', mounts: c.mounts };
    if (!c.mounts.includes(placement)) {
      const st = MOUNTS.find(m => m.id === placement) ? this.mountStatus(placement) : null;
      return { ok: false as const, reason: st?.by ? `${st.mount.name} is ${st.state} by ${st.by}` : 'Not a valid spot' };
    }
    const m = MACHINES.find(m => m.key === o.key)!;
    this.installed.push(buildItem(m, placementsOf(m).find(p => p.id === placement)!, `${m.key}#${this.itemSeq++}`, via, paid));
    return { ok: true as const };
  }

  /** Test/driver helper: install directly (no offer, no draft spent). */
  installForTest(key: string, placement?: string) {
    const m = MACHINES.find(m => m.key === key)!;
    const o = this.makeMachineOffer(m);
    const c = this.check(o);
    if (!c.ok) return c;
    const p = placement ?? c.mounts[0];
    if (!c.mounts.includes(p)) return { ok: false as const, reason: `${p} not free` };
    this.installed.push(buildItem(m, placementsOf(m).find(x => x.id === p)!, `${m.key}#${this.itemSeq++}`, 'test', 0));
    return { ok: true as const, mounts: [p] };
  }

  // ───────── selling / dormancy ─────────

  /** Modifier keys whose anchor part is not on the board (factory parts displaced count too). */
  dormantKeys(): string[] {
    const onBoard = new Set(this.installed.flatMap(i => i.parts.map(d => d.id)));
    const displaced = new Set(this.displaced);
    return Object.keys(this.mods).filter(k => {
      if (isGroupKey(k) || !this.mods[k].length) return false;
      const a = anchorOf(k);
      return a.includes('@') ? !onBoard.has(a) : displaced.has(a);
    });
  }

  /** What selling this item would do (no changes). */
  saleInfo(uid: string): SaleInfo | null {
    const it = this.installed.find(i => i.uid === uid);
    if (!it) return null;
    const ids = new Set(it.parts.map(d => d.id));
    const others = this.installed.filter(i => i !== it);
    const stillDisplaced = new Set(others.flatMap(i => i.displaces));
    const names = (k: string) => this.mods[k].map(m => m.note ?? '?');
    const dormant = Object.keys(this.mods).filter(k => !isGroupKey(k) && this.mods[k].length && ids.has(anchorOf(k))).map(k => ({ key: k, names: names(k) }));
    const waking = Object.keys(this.mods).filter(k => !isGroupKey(k) && this.mods[k].length && it.displaces.includes(anchorOf(k)) && !stillDisplaced.has(anchorOf(k))).map(k => ({ key: k, names: names(k) }));
    return {
      uid, name: it.name, refund: Math.floor(it.paid / 2), powerFreed: it.power,
      powerBefore: `${this.powerUsed}/${this.maxPower}`, powerAfter: `${this.powerUsed - it.power}/${this.maxPower}`,
      dormant, waking,
    };
  }

  /** Sell/dismantle a whole item between challenges. Modifiers are never deleted. */
  sell(uid: string) {
    if (this.phase !== 'draft' && this.phase !== 'shop') return { ok: false as const, reason: 'Selling is only allowed between challenges' };
    const info = this.saleInfo(uid);
    if (!info) return { ok: false as const, reason: 'Not installed' };
    this.installed = this.installed.filter(i => i.uid !== uid);
    this.money += info.refund;
    this.history.push(`  sold ${info.name} (+$${info.refund}, ⚡${info.powerFreed} freed)`);
    return { ok: true as const, ...info };
  }

  /** Leave the shop: next challenge on the same machine. */
  next() {
    if (this.phase !== 'shop') return false;
    this.challenge++;
    this.phase = 'challenge';
    this.powerGrant = null;
    this.sectionGrant = null;
    this.shop = [];
    return true;
  }
}

const SECTION_NAMES: Record<SectionId, string> = { upperDeck: 'Upper Deck' };

/** A paired-gate bundle and single gates hold the same part types: treat as the same machine for offers. */
function sameParts(i: Installed, m: MachineOffer) {
  const types = new Set(placementsOf(m).flatMap(p => p.parts.map(x => x.def.type)));
  return types.size === 1 && i.parts.every(d => types.has(d.type)) && (types.has('multgate'));
}

/** Mount of the k-th part of an item. */
function partMount(i: Installed, k: number) {
  return i.def && i.parts[k] ? (i.parts[k].id.split('@')[1] ?? i.mountId) : i.mountId;
}

function buildItem(m: MachineOffer, p: Placement, uid: string, via: Installed['via'], paid: number): Installed {
  const parts = p.parts.map(({ mount, def }) => ({ ...structuredClone(def), id: `${def.id}@${mount}` }) as MechanismDef);
  return {
    uid, offerKey: m.key, name: m.name, family: m.family, placement: p.id, mounts: [...p.mounts], mountId: p.mounts[0],
    parts, id: parts[0].id, def: parts[0], power: parts.reduce((s, d) => s + d.powerCost, 0), displaces: [...(m.displaces ?? [])], via, paid,
  };
}

function label(o: Offer, mountId?: string) {
  return o.kind === 'machine' ? `${o.name}${mountId ? ` @ ${mountId}` : ''}` : `${o.name} ${o.desc} → ${o.target.label}`;
}
