/**
 * One build-test run: the machine (installed mechanisms + stacked modifiers), Power, money, and the
 * challenge → draft → shop → next challenge cycle. Headless and deterministic per seed so it can be
 * tested; the browser UI and the bot drive the same object.
 */
import type { MechanismDef, Modifier, ModifierTable } from '../machines/mechanisms.ts';
import type { Preset } from '../machines/presets.ts';
import { MACHINES, MODS, MOUNTS, type MachineOffer, type Mount } from './catalog.ts';
import { ECONOMY, targetFor } from './economy.ts';

export type Installed = { offerKey: string; mountId: string; id: string; def: MechanismDef; name: string };

export type Offer =
  | { uid: number; kind: 'machine'; key: string; name: string; desc: string; power: number; price: number; mounts: string[] }
  | { uid: number; kind: 'modifier'; key: string; name: string; desc: string; price: number; target: { key: string; label: string }; mod: Modifier };

export type MountStatus = { mount: Mount; state: 'free' | 'taken' | 'blocked'; by?: string };
export type Check = { ok: true; mounts: string[] } | { ok: false; reason: string };

export type Phase = 'challenge' | 'draft' | 'shop' | 'failed';

/** Factory parts left off the build-test starter table (playtest finding, see BUILD_LOOP_PLAYTEST.md). */
export const BUILD_TEST_REMOVED = ['post-l', 'post-r'];

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
  private seed: number;
  private uid = 1;

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
    return this.installed.reduce((s, i) => s + i.def.powerCost, 0);
  }

  get rerollPrice() {
    return ECONOMY.rerollBase + this.rerolls * ECONOMY.rerollStep;
  }

  /** The current machine as a preset: factory table + installed mechanisms + stacked modifiers. */
  preset(): Preset {
    return {
      id: 'baseline',
      route: '',
      name: 'Build Test',
      tagline: `Challenge ${this.challenge}`,
      maxPower: this.maxPower,
      // Player playtest: the two front pegs just above the batter deflect the ball too late to react to.
      // Removed on the build-test factory table only; / keeps them as the frozen comparison.
      removeBase: [...BUILD_TEST_REMOVED],
      mechanisms: this.installed.map(i => i.def),
      modifiers: structuredClone(this.mods),
    };
  }

  mountStatus(id: string): MountStatus {
    const mount = MOUNTS.find(m => m.id === id)!;
    const here = this.installed.find(i => i.mountId === id);
    if (here) return { mount, state: 'taken', by: here.name };
    const blocker = this.installed.find(i => mount.conflicts?.includes(i.mountId));
    if (blocker) return { mount, state: 'blocked', by: blocker.name };
    return { mount, state: 'free' };
  }

  /** Can this offer be taken right now (ignoring price)? Never displaces anything already installed. */
  check(o: Offer): Check {
    if (o.kind === 'modifier') return { ok: true, mounts: [] };
    const m = MACHINES.find(m => m.key === o.key)!;
    if (this.powerUsed + m.power > this.maxPower) return { ok: false, reason: `Needs ⚡${m.power}; ${this.maxPower - this.powerUsed} free` };
    const free = Object.keys(m.at).filter(id => this.mountStatus(id).state === 'free');
    if (!free.length) {
      const st = Object.keys(m.at).map(id => this.mountStatus(id));
      const by = st.find(s => s.by)?.by;
      return { ok: false, reason: by ? `No room: blocked by ${by}` : 'No free mount' };
    }
    return { ok: true, mounts: free };
  }

  private makeMachineOffer(m: MachineOffer): Offer {
    return { uid: this.uid++, kind: 'machine', key: m.key, name: m.name, desc: m.desc, power: m.power, price: m.price, mounts: Object.keys(m.at) };
  }

  /** A modifier offer from the given pool: the free draft's premium pool or the shop's. */
  private makeModOffer(where: 'draft' | 'shop'): Offer | null {
    const inst = this.installed.map(i => ({ offerKey: i.offerKey, id: i.id, mountId: i.mountId }));
    const pool = MODS.filter(t => t.tier === where || t.tier === 'both')
      .map(t => ({ t, targets: t.targets(inst) }))
      .filter(x => x.targets.length);
    if (!pool.length) return null;
    const { t, targets } = pool[Math.floor(this.random() * pool.length)];
    const target = targets[Math.floor(this.random() * targets.length)];
    const mod: Modifier = { note: t.name };
    if (t.add) mod.add = t.add;
    if (t.mul) mod.mul = t.mul;
    if (t.gen) mod.gen = { ...t.gen };
    return { uid: this.uid++, kind: 'modifier', key: t.key, name: t.name, desc: t.effect, price: where === 'draft' ? 0 : t.price, target, mod };
  }

  /**
   * Roll n offers.
   * - draft (free pick): new physical machines that fit right now + premium upgrades. Premium upgrades
   *   always have a factory-bumper target, so at full Power there is still a usable pick.
   * - shop: modifiers only, never a physical machine.
   * No duplicates in one roll.
   */
  private roll(n: number, where: 'draft' | 'shop'): Offer[] {
    const out: Offer[] = [];
    let guard = 0;
    while (out.length < n && guard++ < 200) {
      const machines = where === 'draft' ? MACHINES.filter(m => !out.some(o => o.key === m.key) && this.check(this.makeMachineOffer(m)).ok) : [];
      let o: Offer | null = null;
      if (machines.length && (this.random() < ECONOMY.draftMachineShare || guard > 100)) o = this.makeMachineOffer(machines[Math.floor(this.random() * machines.length)]);
      else o = this.makeModOffer(where);
      if (!o) continue;
      if (o.kind === 'modifier' && out.some(x => x.kind === 'modifier' && x.key === o!.key && x.target.key === o!.target.key)) continue;
      out.push(o);
    }
    return out;
  }

  /** Challenge cleared: bank money and open the free draft. Returns money earned. */
  clear(strikesLeft: number) {
    if (this.phase !== 'challenge') return 0;
    const earned = ECONOMY.clearBase + ECONOMY.clearPerStrikeLeft * strikesLeft;
    this.money += earned;
    this.phase = 'draft';
    this.draft = this.roll(ECONOMY.draftSize, 'draft');
    this.history.push(`C${this.challenge} cleared (+$${earned})`);
    return earned;
  }

  fail() {
    if (this.phase === 'challenge') this.phase = 'failed';
  }

  /** Take one draft offer for free. Exactly one per clear. */
  takeDraft(uid: number, mountId?: string) {
    if (this.phase !== 'draft') return { ok: false as const, reason: 'Not drafting' };
    const o = this.draft.find(d => d.uid === uid);
    if (!o) return { ok: false as const, reason: 'No such offer' };
    const r = this.apply(o, mountId);
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

  /** Buy from the shop. No purchase cap: money, Power and room are the only limits. */
  buy(uid: number, mountId?: string) {
    if (this.phase !== 'shop') return { ok: false as const, reason: 'Shop closed' };
    const o = this.shop.find(d => d.uid === uid);
    if (!o) return { ok: false as const, reason: 'No such offer' };
    if (o.kind !== 'modifier') return { ok: false as const, reason: 'The shop sells modifiers only' };
    if (o.price > this.money) return { ok: false as const, reason: `Costs $${o.price}; you have $${this.money}` };
    const r = this.apply(o, mountId);
    if (!r.ok) return r;
    this.money -= o.price;
    this.shop = this.shop.filter(s => s.uid !== uid);
    this.history.push(`  buy $${o.price}: ${label(o, mountId)}`);
    return r;
  }

  reroll() {
    if (this.phase !== 'shop' || this.money < this.rerollPrice) return false;
    this.money -= this.rerollPrice;
    this.rerolls++;
    this.shop = this.roll(ECONOMY.shopSize, 'shop');
    return true;
  }

  /** Install a machine on a mount or stack a modifier. Never removes or displaces anything. */
  private apply(o: Offer, mountId?: string) {
    if (o.kind === 'modifier') {
      (this.mods[o.target.key] ??= []).push({ ...o.mod });
      return { ok: true as const };
    }
    const c = this.check(o);
    if (!c.ok) return c;
    const mount = mountId ?? (c.mounts.length === 1 ? c.mounts[0] : undefined);
    if (!mount) return { ok: false as const, reason: 'Pick a mount', mounts: c.mounts };
    if (!c.mounts.includes(mount)) {
      const st = this.mountStatus(mount);
      return { ok: false as const, reason: st.by ? `${st.mount.name} is ${st.state} by ${st.by}` : 'Not a valid mount' };
    }
    const m = MACHINES.find(m => m.key === o.key)!;
    const id = `${m.at[mount].id}@${mount}`;
    this.installed.push({ offerKey: m.key, mountId: mount, id, name: m.name, def: { ...structuredClone(m.at[mount]), id } as MechanismDef });
    return { ok: true as const };
  }

  /** Leave the shop: next challenge on the same machine. */
  next() {
    if (this.phase !== 'shop') return false;
    this.challenge++;
    this.phase = 'challenge';
    this.shop = [];
    return true;
  }
}

function label(o: Offer, mountId?: string) {
  return o.kind === 'machine' ? `${o.name}${mountId ? ` @ ${mountId}` : ''}` : `${o.name} ${o.desc} → ${o.target.label}`;
}
