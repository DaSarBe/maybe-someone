import { getEra } from '../data/eras';
import { ARMOR_STATS } from '../data/gear';
import { SHOP_CATEGORIES, getItem } from '../data/items';
import { getUpgrade, type UpgradeId } from '../data/upgrades';
import { WEAPON_STATS } from '../data/weapons';
import type { ItemDef } from '../data/types';
import { Inventory, stackWeight, type ItemStack } from '../items/Inventory';
import {
  EQUIP_SLOTS, PROFILE_KEY, carriedSpec, createDefaultProfile, equipmentWeight, fitProfile,
  migrateProfile, raidDuration, safeCapacity, searchTimeScale, secureCapacity, stashCapacity,
  type EquipSlot, type Profile, type RaidResult,
} from '../items/Profile';
import type { SaveService } from '../save/SaveService';
import { buyPrice, dateKey, sellPrice } from './Pricing';

export type ContainerId = 'stash' | 'carried' | 'secure' | 'safe';
export type Loc = { c: ContainerId; i: number };

export type FailCode =
  | 'invalid' | 'no_credits' | 'full' | 'overweight' | 'in_raid' | 'not_in_raid' | 'locked'
  | 'max_level' | 'not_equippable' | 'not_for_sale' | 'already_in_raid';

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; code: FailCode; reason: string };

const REASONS: Record<FailCode, string> = {
  invalid: '操作無效',
  no_credits: '信用點不足',
  full: '空間已滿',
  overweight: '太重了，拿不動更多東西',
  in_raid: 'Raid 中無法使用基地的倉庫與保險箱',
  not_in_raid: '目前不在 Raid 中',
  locked: '這個時代尚未開放',
  max_level: '已升到最高等級',
  not_equippable: '這個物品無法裝備',
  not_for_sale: '商店不販售這個物品',
  already_in_raid: 'Raid 已經在進行中',
};

const fail = (code: FailCode, reason?: string): { ok: false; code: FailCode; reason: string } => ({
  ok: false, code, reason: reason ?? REASONS[code],
});

export const CONTAINER_NAMES: Record<ContainerId, string> = { stash: '倉庫', carried: '背包', secure: '保險袋', safe: '保險箱' };

function equipSlotFor(def: ItemDef, requested?: EquipSlot): EquipSlot | null {
  let slot: EquipSlot | null = null;
  if (def.category === 'weapon') slot = WEAPON_STATS[def.id]?.slot ?? null;
  else if (def.category === 'armor') slot = ARMOR_STATS[def.id] ? 'armor' : null;
  else if (def.category === 'backpack') slot = 'backpack';
  if (slot && requested && requested !== slot) return null;
  return slot;
}

const cloneStack = (s: ItemStack, qty = s.qty): ItemStack => (s.dur === undefined ? { id: s.id, qty } : { id: s.id, qty, dur: s.dur });

/**
 * 經濟與存檔的唯一入口。UI 與遊戲場景只能呼叫這裡，不能直接改 Profile。
 * 每個操作都先在存檔副本上驗證與修改，成功才整份寫回 SaveService；失敗時存檔完全不動。
 * 第二階段把這一層搬到伺服器做權威驗證時，介面保持不變。
 */
export class EconomyService {
  private p: Profile;
  private listeners = new Set<() => void>();

  constructor(private save: SaveService, private now: () => number = Date.now) {
    const raw = save.get<unknown>(PROFILE_KEY, null);
    this.p = raw === null ? createDefaultProfile() : migrateProfile(raw);
    // 載入時 Raid 還沒結束 = Raid 中重新整理或關閉頁面，視為死亡（防止用重新整理刷物品）
    if (this.p.raid) this.resolveRaid('death', true);
    else this.persist();
  }

  // ---------------------------------------------------------------- 查詢
  get profile(): Readonly<Profile> { return this.p; }
  get inRaid(): boolean { return !!this.p.raid; }
  get credits(): number { return this.p.credits; }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  today(): string { return dateKey(this.now()); }
  sellPriceOf(id: string): number { return sellPrice(id, this.today()); }
  buyPriceOf(id: string): number { return buyPrice(id, this.today()); }
  valueOf(s: ItemStack): number { return this.sellPriceOf(s.id) * s.qty; }
  valueOfAll(list: (ItemStack | null)[]): number {
    return list.reduce((n, s) => n + (s ? this.valueOf(s) : 0), 0);
  }

  /** 唯讀的容器檢視（修改請走 EconomyService 的方法） */
  view(c: ContainerId): Inventory { return this.inv(this.p, c); }

  /** 負重比例：給 PlayerController 用。0..；超過 0.8 開始變慢，1 以上不能衝刺 */
  getWeightRatio(): number { return this.inv(this.p, 'carried').getWeightRatio(); }

  carryInfo(): { weight: number; max: number; ratio: number; used: number; slots: number } {
    const v = this.inv(this.p, 'carried');
    return { weight: v.totalWeight, max: v.maxWeight, ratio: v.getWeightRatio(), used: v.used, slots: v.capacity };
  }

  equippedStacks(): { slot: EquipSlot; stack: ItemStack }[] {
    const out: { slot: EquipSlot; stack: ItemStack }[] = [];
    for (const slot of EQUIP_SLOTS) { const s = this.p.equipment[slot]; if (s) out.push({ slot, stack: s }); }
    return out;
  }

  raidDurationSec(): number { return raidDuration(this.p); }
  searchScale(): number { return searchTimeScale(this.p); }

  upgradeLevel(id: UpgradeId): number { return this.p.upgrades[id]; }
  upgradeCost(id: UpgradeId): number | null {
    const def = getUpgrade(id);
    return def && this.p.upgrades[id] < def.levels.length ? def.levels[this.p.upgrades[id]].cost : null;
  }

  // ---------------------------------------------------------------- 內部工具
  private persist(): void {
    fitProfile(this.p);
    this.save.set(PROFILE_KEY, this.p);
    for (const fn of [...this.listeners]) fn();
  }

  private tx<T extends object>(fn: (p: Profile) => Result<T>): Result<T> {
    const draft = structuredClone(this.p);
    const r = fn(draft);
    if (r.ok) {
      this.p = draft;
      this.persist();
    }
    return r;
  }

  private inv(p: Profile, c: ContainerId): Inventory {
    switch (c) {
      case 'stash': return new Inventory(p.stash, { capacity: stashCapacity(p) });
      case 'safe': return new Inventory(p.safe, { capacity: safeCapacity(p) });
      case 'secure': return new Inventory(p.secure, { capacity: secureCapacity(p) });
      case 'carried': {
        const spec = carriedSpec(p);
        return new Inventory(p.carried, { capacity: spec.slots, maxWeight: spec.maxWeight, extraWeight: equipmentWeight(p) });
      }
    }
  }

  /** Raid 中不能碰基地的倉庫與保險箱 */
  private accessible(p: Profile, c: ContainerId): boolean {
    return !(p.raid && (c === 'stash' || c === 'safe'));
  }

  private whyFull(inv: Inventory, id: string): FailCode {
    const slotOnly = new Inventory(structuredClone(inv.slots), { capacity: inv.capacity });
    return slotOnly.maxAddable(id, 1) > 0 ? 'overweight' : 'full';
  }

  /** 把背包內容重新整理進目前裝備的背包大小；放不下回傳 false */
  private repackCarried(p: Profile): boolean {
    const spec = carriedSpec(p);
    const fresh: Inventory['slots'] = [];
    const inv = new Inventory(fresh, { capacity: spec.slots });
    for (const s of p.carried) {
      if (s && inv.addStack(s) > 0) return false;
    }
    p.carried = fresh;
    return true;
  }

  // ---------------------------------------------------------------- 商店
  buy(itemId: string, qty = 1): Result<{ cost: number }> {
    return this.tx((p) => {
      const def = getItem(itemId);
      if (!def || !Number.isInteger(qty) || qty < 1) return fail('invalid');
      if (!SHOP_CATEGORIES.includes(def.category)) return fail('not_for_sale');
      if (p.raid) return fail('in_raid');
      const cost = buyPrice(itemId, dateKey(this.now())) * qty;
      if (cost > p.credits) return fail('no_credits');
      const stash = this.inv(p, 'stash');
      const dur = def.category === 'armor' ? ARMOR_STATS[itemId]?.durability : undefined;
      if (stash.add(itemId, qty, dur) > 0) return fail('full', '倉庫已滿');
      p.credits -= cost;
      return { ok: true, cost };
    });
  }

  sell(from: Loc, qty?: number): Result<{ gain: number }> {
    return this.tx((p) => {
      if (!this.accessible(p, from.c)) return fail('in_raid');
      if (p.raid) return fail('in_raid', 'Raid 中無法出售物品');
      const inv = this.inv(p, from.c);
      const s = inv.slots[from.i];
      if (!s) return fail('invalid');
      const n = qty ?? s.qty;
      if (!Number.isInteger(n) || n < 1 || n > s.qty) return fail('invalid');
      const gain = sellPrice(s.id, dateKey(this.now())) * n;
      inv.takeAt(from.i, n);
      p.credits += gain;
      return { ok: true, gain };
    });
  }

  // ---------------------------------------------------------------- 移動 / 拆分 / 丟棄
  /**
   * 移動物品。to.i 省略或目標格不能放時，自動併入同種堆疊或第一個空格。
   * 同容器內移動走 Inventory.moveWithin（含交換與合併）。
   */
  moveItem(from: Loc, to: { c: ContainerId; i?: number }, qty?: number): Result<{ moved: number }> {
    return this.tx((p) => {
      if (!this.accessible(p, from.c) || !this.accessible(p, to.c)) return fail('in_raid');
      const src = this.inv(p, from.c);
      const s = src.slots[from.i];
      if (!s) return fail('invalid');
      const n = qty ?? s.qty;
      if (!Number.isInteger(n) || n < 1 || n > s.qty) return fail('invalid');

      if (from.c === to.c) {
        if (to.i === undefined || to.i === from.i) return fail('invalid');
        const r = src.moveWithin(from.i, to.i, n);
        if (!r.ok) return fail(r.reason === 'full' ? 'full' : 'invalid');
        return { ok: true, moved: r.moved };
      }

      const dst = this.inv(p, to.c);
      const moving = cloneStack(s, n);
      // 先試著放進指定格（空格或同種可堆疊）
      let left = n;
      if (to.i !== undefined && to.i >= 0 && to.i < dst.slots.length) {
        const t = dst.slots[to.i];
        const def = getItem(s.id)!;
        if (!t && dst.maxAddable(s.id, 1) > 0 && to.i < dst.capacity) {
          const put = Math.min(n, def.maxStack, dst.maxAddable(s.id, n));
          dst.slots[to.i] = cloneStack(moving, put);
          left -= put;
        } else if (t && t.id === s.id && t.dur === s.dur && t.qty < def.maxStack) {
          const put = Math.min(n, def.maxStack - t.qty, dst.maxAddable(s.id, n));
          t.qty += put;
          left -= put;
        }
      }
      if (left > 0) left = dst.add(s.id, left, s.dur);
      const moved = n - left;
      if (moved <= 0) return fail(this.whyFull(dst, s.id));
      src.takeAt(from.i, moved);
      return { ok: true, moved };
    });
  }

  splitStack(at: Loc, qty: number): Result {
    return this.tx((p) => {
      if (!this.accessible(p, at.c)) return fail('in_raid');
      const r = this.inv(p, at.c).split(at.i, qty);
      return r.ok ? { ok: true } : fail(r.reason === 'full' ? 'full' : 'invalid');
    });
  }

  dropItem(at: Loc, qty?: number): Result<{ dropped: ItemStack }> {
    return this.tx((p) => {
      if (!this.accessible(p, at.c)) return fail('in_raid');
      const inv = this.inv(p, at.c);
      const s = inv.slots[at.i];
      if (!s) return fail('invalid');
      const n = qty ?? s.qty;
      if (!Number.isInteger(n) || n < 1 || n > s.qty) return fail('invalid');
      const dropped = inv.takeAt(at.i, n)!;
      return { ok: true, dropped };
    });
  }

  // ---------------------------------------------------------------- 裝備
  equip(from: Loc, slot?: EquipSlot): Result {
    return this.tx((p) => {
      if (!this.accessible(p, from.c)) return fail('in_raid');
      const inv = this.inv(p, from.c);
      const s = inv.slots[from.i];
      if (!s) return fail('invalid');
      const def = getItem(s.id);
      const target = def ? equipSlotFor(def, slot) : null;
      if (!target) return fail('not_equippable');
      if (s.qty > 1) return fail('invalid');
      const prev = p.equipment[target];
      inv.slots[from.i] = prev;
      p.equipment[target] = cloneStack(s, 1);
      if (target === 'backpack' && !this.repackCarried(p)) return fail('full', '新背包的格數放不下目前的物品');
      return { ok: true };
    });
  }

  unequip(slot: EquipSlot, dest?: ContainerId): Result {
    return this.tx((p) => {
      const e = p.equipment[slot];
      if (!e) return fail('invalid');
      const to: ContainerId = dest ?? (p.raid ? 'carried' : 'stash');
      if (!this.accessible(p, to)) return fail('in_raid');
      p.equipment[slot] = null;
      if (slot === 'backpack' && !this.repackCarried(p)) return fail('full', '背包裡的東西太多，請先清空再卸下');
      if (this.inv(p, to).addStack(e) > 0) return fail('full');
      return { ok: true };
    });
  }

  // ---------------------------------------------------------------- 基地升級
  upgrade(id: UpgradeId): Result<{ level: number; cost: number }> {
    return this.tx((p) => {
      const def = getUpgrade(id);
      if (!def) return fail('invalid');
      if (p.raid) return fail('in_raid');
      const lv = p.upgrades[id];
      if (lv >= def.levels.length) return fail('max_level');
      const cost = def.levels[lv].cost;
      if (cost > p.credits) return fail('no_credits');
      p.credits -= cost;
      p.upgrades[id] = lv + 1;
      return { ok: true, level: lv + 1, cost };
    });
  }

  // ---------------------------------------------------------------- Raid 流程
  private bodyCounts(p: Profile): Record<string, number> {
    const counts: Record<string, number> = {};
    const add = (s: ItemStack | null) => { if (s) counts[s.id] = (counts[s.id] ?? 0) + s.qty; };
    p.carried.forEach(add);
    p.secure.forEach(add);
    EQUIP_SLOTS.forEach((k) => add(p.equipment[k]));
    return counts;
  }

  startRaid(eraId: string): Result<{ duration: number }> {
    return this.tx((p) => {
      if (p.raid) return fail('already_in_raid');
      const era = getEra(eraId);
      if (!era) return fail('invalid');
      if (!era.unlocked) return fail('locked');
      const duration = raidDuration(p);
      p.raid = { era: eraId, startedAt: this.now(), duration, snapshot: this.bodyCounts(p) };
      return { ok: true, duration };
    });
  }

  /** Raid 中撿到東西：放進背包。放不下一部分時回傳實際拿到的數量 */
  lootItem(id: string, qty: number, dur?: number): Result<{ taken: number }> {
    return this.tx((p) => {
      if (!p.raid) return fail('not_in_raid');
      if (!getItem(id) || !Number.isInteger(qty) || qty < 1) return fail('invalid');
      const inv = this.inv(p, 'carried');
      const left = inv.add(id, qty, dur);
      if (left >= qty) return fail(this.whyFull(inv, id), this.whyFull(inv, id) === 'full' ? '背包已滿' : undefined);
      return { ok: true, taken: qty - left };
    });
  }

  /**
   * 結算 Raid。extract：背包與保險袋全部送進倉庫，回報這次帶回的物品。
   * death：背包與身上裝備全部消失，保險袋的物品送回倉庫。
   * 倉庫放不下時會暫時超出容量（不會弄丟東西），超出期間無法再買東西或存入。
   */
  resolveRaid(outcome: 'extract' | 'death', interrupted = false): Result<{ result: RaidResult }> {
    return this.tx((p) => {
      const raid = p.raid;
      if (!raid) return fail('not_in_raid');
      const day = dateKey(this.now());
      const stash = this.inv(p, 'stash');
      const valueOf = (list: ItemStack[]) => list.reduce((n, s) => n + sellPrice(s.id, day) * s.qty, 0);
      const body = [...p.carried, ...p.secure].filter((s): s is ItemStack => !!s);
      const equipped = EQUIP_SLOTS.map((k) => p.equipment[k]).filter((s): s is ItemStack => !!s);
      let items: ItemStack[] = [];
      let kept: ItemStack[] = [];

      if (outcome === 'extract') {
        const after = this.bodyCounts(p);
        for (const [id, n] of Object.entries(after)) {
          const gain = n - (raid.snapshot[id] ?? 0);
          if (gain > 0) items.push({ id, qty: gain });
        }
        body.forEach((s) => stash.forceAdd(s.id, s.qty, s.dur));
        p.stats.extracts++;
        p.stats.extractedValue += valueOf(items);
      } else {
        items = [...p.carried.filter((s): s is ItemStack => !!s), ...equipped];
        kept = p.secure.filter((s): s is ItemStack => !!s);
        kept.forEach((s) => stash.forceAdd(s.id, s.qty, s.dur));
        for (const k of EQUIP_SLOTS) p.equipment[k] = null;
        p.stats.deaths++;
        p.stats.lostValue += valueOf(items);
      }
      p.stats.raids++;
      p.carried = [];
      p.secure = [];
      const result: RaidResult = {
        outcome, era: raid.era, items, kept, value: valueOf(items), interrupted, at: this.now(),
      };
      p.raid = null;
      p.pendingResult = result;
      return { ok: true, result };
    });
  }

  /** 玩家看完結算畫面 */
  acknowledgeResult(): void {
    if (!this.p.pendingResult) return;
    this.p.pendingResult = null;
    this.persist();
  }

  resetProfile(): void {
    this.save.remove(PROFILE_KEY);
    this.p = createDefaultProfile();
    this.persist();
  }

  // ---------------------------------------------------------------- 統計
  stats(): { raids: number; extractRate: number; extractedValue: number } {
    const s = this.p.stats;
    return { raids: s.raids, extractRate: s.raids ? s.extracts / s.raids : 0, extractedValue: s.extractedValue };
  }

  /** 目前身上的重量（含裝備）供顯示 */
  carriedWeightOf(list: (ItemStack | null)[]): number {
    return list.reduce((n, s) => n + (s ? stackWeight(s) : 0), 0);
  }
}
