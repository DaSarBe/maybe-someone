import { ATTACHMENTS, canMount, modIds, type ModSlot } from '../data/attachments';
import { TEST_MAP_DURATION, getEra } from '../data/eras';
import { ARMOR_STATS, HELMET_STATS } from '../data/gear';
import { SHOP_CATEGORIES, getItem } from '../data/items';
import { getUpgrade, type UpgradeId } from '../data/upgrades';
import { WEAPON_STATS } from '../data/weapons';
import type { ItemDef } from '../data/types';
import { Inventory, cloneStack, stackWeight, type ItemStack, type Slot } from '../items/Inventory';
import {
  EQUIP_SLOTS, PROFILE_KEY, carriedSpec, createDefaultProfile, equipmentWeight, fitProfile, itemMaxDur,
  migrateProfile, raidDuration, safeCapacity, searchTimeScale, secureCapacity, stashCapacity,
  type EquipSlot, type Profile, type RaidResult,
} from '../items/Profile';
import type { SaveService } from '../save/SaveService';
import { getTrader } from '../data/traders';
import { buyPrice, dateKey, sellPrice } from './Pricing';
import { rollTraderStock, traderSellTotal, type TraderOffer } from './Trader';

export type ContainerId = 'stash' | 'carried' | 'secure' | 'safe';
export type Loc = { c: ContainerId; i: number };
/** 要改裝的武器：裝備欄上的，或某個容器格裡的 */
export type WeaponRef = { equip: EquipSlot } | { loc: Loc };

export type FailCode =
  | 'invalid' | 'no_credits' | 'full' | 'overweight' | 'in_raid' | 'not_in_raid' | 'locked'
  | 'max_level' | 'not_equippable' | 'not_for_sale' | 'already_in_raid'
  | 'no_trader' | 'no_stock' | 'no_currency' | 'not_tradable' | 'incompatible';

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
  no_trader: '這個時代沒有商人',
  no_stock: '商人的庫存不足',
  no_currency: '舊台幣不夠',
  not_tradable: '商人不收這個',
  incompatible: '這個配件不能裝在這把武器上',
};

const fail = (code: FailCode, reason?: string): { ok: false; code: FailCode; reason: string } => ({
  ok: false, code, reason: reason ?? REASONS[code],
});

export const CONTAINER_NAMES: Record<ContainerId, string> = { stash: '倉庫', carried: '背包', secure: '保險袋', safe: '保險箱' };

function equipSlotFor(def: ItemDef, requested?: EquipSlot): EquipSlot | null {
  let slot: EquipSlot | null = null;
  if (def.category === 'weapon') slot = WEAPON_STATS[def.id]?.slot ?? null;
  else if (def.category === 'armor') slot = ARMOR_STATS[def.id] ? 'armor' : null;
  else if (def.category === 'helmet') slot = HELMET_STATS[def.id] ? 'helmet' : null;
  else if (def.category === 'backpack') slot = 'backpack';
  if (slot && requested && requested !== slot) return null;
  return slot;
}

/** 新買的護甲 / 頭盔帶滿耐久（其他物品沒有狀態值） */
const freshDur = (def: ItemDef): number | undefined =>
  def.category === 'armor' ? ARMOR_STATS[def.id]?.durability : def.category === 'helmet' ? HELMET_STATS[def.id]?.durability : undefined;


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
  /** 堆疊的估價：武器要加上已安裝配件的價值 */
  valueOf(s: ItemStack): number {
    return (this.sellPriceOf(s.id) + modIds(s.mods).reduce((n, id) => n + this.sellPriceOf(id), 0)) * s.qty;
  }
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

  /** 某時代的 Raid 停留秒數（基礎 + 穩定器）；省略時代 = 舊行為（基礎 300 秒） */
  raidDurationSec(eraId?: string): number {
    return raidDuration(this.p, eraId ? getEra(eraId)?.baseDuration : undefined);
  }
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

  /** commit = false：只驗證（試算），不寫回也不通知 */
  private tx<T extends object>(fn: (p: Profile) => Result<T>, commit = true): Result<T> {
    const draft = structuredClone(this.p);
    const r = fn(draft);
    if (r.ok && commit) {
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
      const dur = freshDur(def);
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
      const day = dateKey(this.now());
      const gain = (sellPrice(s.id, day) + modIds(s.mods).reduce((m, id) => m + sellPrice(id, day), 0)) * n;
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
      if (left > 0) left = dst.add(s.id, left, s.dur, s.mods);
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

  /**
   * Raid 中從容器（或屍體）直接裝備。loot 是場景的容器內容（就地修改，成功才寫回），index 是要裝備的格子。
   * 裝備欄位由物品決定（手槍 = 副武器，其他槍 = 主武器，護甲、背包各一個）。
   * 欄位上原本的裝備：dest = 'container'（預設）放回容器的同一格；'carried' 放進背包（放不下就拒絕）。
   * 換背包時舊背包的內容搬進新背包，格數或負重放不下就整個拒絕（不會弄丟東西）。
   * 彈匣子彈數、護甲耐久（dur）跟著物品走。dryRun = true 只驗證不執行（UI 用來停用按鈕）。
   */
  equipFromContainer(
    loot: Slot[], index: number, opts: { dest?: 'container' | 'carried'; dryRun?: boolean } = {},
  ): Result<{ slot: EquipSlot; equipped: ItemStack; replaced: ItemStack | null; replacedTo: 'container' | 'carried' | null }> {
    const draftLoot = structuredClone(loot);
    const dest = opts.dest ?? 'container';
    const r = this.tx((p) => {
      if (!p.raid) return fail('not_in_raid');
      const s = draftLoot[index];
      if (!s) return fail('invalid');
      const def = getItem(s.id);
      const slot = def ? equipSlotFor(def) : null;
      if (!slot) return fail('not_equippable');
      if (s.qty !== 1) return fail('invalid');
      const prev = p.equipment[slot];
      const equipped = cloneStack(s, 1);
      p.equipment[slot] = equipped;
      if (slot === 'backpack') {
        // 舊背包的內容搬進新背包：格數與負重都要放得下
        const spec = carriedSpec(p);
        const fresh: Slot[] = [];
        const inv = new Inventory(fresh, { capacity: spec.slots, maxWeight: spec.maxWeight, extraWeight: equipmentWeight(p) });
        for (const st of p.carried) {
          if (st && inv.addStack(st) > 0) return fail('full', '新背包放不下目前背包裡的東西（格數或負重不足）');
        }
        p.carried = fresh;
      }
      let replacedTo: 'container' | 'carried' | null = null;
      draftLoot[index] = null;
      if (prev) {
        if (dest === 'carried') {
          if (this.inv(p, 'carried').addStack(prev) > 0) return fail('full', '背包放不下換下來的裝備');
          replacedTo = 'carried';
        } else {
          draftLoot[index] = prev;
          replacedTo = 'container';
        }
      }
      return { ok: true, slot, equipped: cloneStack(equipped), replaced: prev ? cloneStack(prev) : null, replacedTo };
    }, !opts.dryRun);
    if (r.ok && !opts.dryRun) loot.splice(0, loot.length, ...draftLoot);
    return r;
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

  // ---------------------------------------------------------------- 配件（只能在基地改槍）
  /** 取得要改裝的武器堆疊（裝備欄或某個容器格） */
  private weaponAt(p: Profile, ref: WeaponRef): ItemStack | null {
    const s = 'equip' in ref ? p.equipment[ref.equip] : this.inv(p, ref.loc.c).slots[ref.loc.i] ?? null;
    return s && WEAPON_STATS[s.id] ? s : null;
  }

  /** 卸下的配件放進倉庫，倉庫放不下就放背包；都放不下回傳 false */
  private stowPart(p: Profile, id: string, prefer: ContainerId = 'stash'): boolean {
    const order: ContainerId[] = prefer === 'stash' ? ['stash', 'carried'] : [prefer, 'stash', 'carried'];
    for (const c of order) if (this.inv(p, c).add(id, 1) === 0) return true;
    return false;
  }

  /** 改槍後彈匣超過新容量：多的子彈換回彈藥放進倉庫（倉庫可暫時超量，不會弄丟） */
  private trimMagazine(p: Profile, w: ItemStack): void {
    const max = itemMaxDur(w.id, w.mods);
    if (w.dur === undefined || w.dur <= max) return;
    const extra = w.dur - max;
    w.dur = max;
    this.inv(p, 'stash').forceAdd(WEAPON_STATS[w.id].ammoType, extra);
  }

  /** 這個配件能不能裝在這把武器上（不改動任何東西，UI 判斷用） */
  canInstall(weaponId: string, attId: string): boolean { return canMount(weaponId, attId); }

  /**
   * 安裝配件：從容器格取 1 個配件裝到武器上。同槽位原本的配件放回倉庫（放不下放背包）。
   * 只能在基地操作；配件必須在相容表內。
   */
  installMod(weapon: WeaponRef, from: Loc): Result<{ slot: ModSlot; replaced: string | null }> {
    return this.tx((p) => {
      if (p.raid) return fail('in_raid', 'Raid 中無法拆裝配件，只能在基地改槍');
      if (!this.accessible(p, from.c)) return fail('in_raid');
      const w = this.weaponAt(p, weapon);
      if (!w) return fail('invalid');
      const src = this.inv(p, from.c);
      const part = src.slots[from.i];
      if (!part || !ATTACHMENTS[part.id]) return fail('invalid');
      if (!canMount(w.id, part.id)) return fail('incompatible');
      const slot = ATTACHMENTS[part.id].slot;
      src.takeAt(from.i, 1);
      const old = w.mods?.[slot] ?? null;
      w.mods = { ...(w.mods ?? {}), [slot]: part.id };
      if (old && !this.stowPart(p, old, from.c)) return fail('full', '倉庫與背包都放不下換下來的配件');
      this.trimMagazine(p, w);
      return { ok: true, slot, replaced: old };
    });
  }

  /** 卸下某個槽位的配件，放進指定容器（預設倉庫，放不下改放背包） */
  removeMod(weapon: WeaponRef, slot: ModSlot, dest: ContainerId = 'stash'): Result<{ part: string }> {
    return this.tx((p) => {
      if (p.raid) return fail('in_raid', 'Raid 中無法拆裝配件，只能在基地改槍');
      const w = this.weaponAt(p, weapon);
      if (!w) return fail('invalid');
      const id = w.mods?.[slot];
      if (!id) return fail('invalid');
      const mods = { ...w.mods };
      delete mods[slot];
      if (Object.keys(mods).length) w.mods = mods; else delete w.mods;
      if (!this.stowPart(p, id, dest)) return fail('full', '倉庫與背包都放不下這個配件');
      this.trimMagazine(p, w);
      return { ok: true, part: id };
    });
  }

  /** 直接向黑市購買配件並裝到武器上（改槍台的「購買並安裝」）。同槽位原本的配件放回倉庫 */
  buyAndInstallMod(weapon: WeaponRef, attId: string): Result<{ cost: number; slot: ModSlot }> {
    return this.tx((p) => {
      if (p.raid) return fail('in_raid');
      const def = getItem(attId);
      if (!def || !ATTACHMENTS[attId]) return fail('invalid');
      if (!SHOP_CATEGORIES.includes(def.category)) return fail('not_for_sale');
      const w = this.weaponAt(p, weapon);
      if (!w) return fail('invalid');
      if (!canMount(w.id, attId)) return fail('incompatible');
      const cost = buyPrice(attId, dateKey(this.now()));
      if (cost > p.credits) return fail('no_credits');
      const slot = ATTACHMENTS[attId].slot;
      const old = w.mods?.[slot] ?? null;
      w.mods = { ...(w.mods ?? {}), [slot]: attId };
      if (old && !this.stowPart(p, old)) return fail('full', '倉庫與背包都放不下換下來的配件');
      p.credits -= cost;
      this.trimMagazine(p, w);
      return { ok: true, cost, slot };
    });
  }

  /** 讀取武器目前的配件（UI 用；找不到回傳 null） */
  weaponStack(ref: WeaponRef): ItemStack | null {
    return this.weaponAt(this.p, ref);
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
    const add = (s: ItemStack | null) => {
      if (!s) return;
      counts[s.id] = (counts[s.id] ?? 0) + s.qty;
      for (const m of modIds(s.mods)) counts[m] = (counts[m] ?? 0) + s.qty;
    };
    p.carried.forEach(add);
    p.secure.forEach(add);
    EQUIP_SLOTS.forEach((k) => add(p.equipment[k]));
    return counts;
  }

  /** testMap：測試地圖（?scene=raid&map=test）用 5 分鐘基礎時間 */
  startRaid(eraId: string, opts: { testMap?: boolean } = {}): Result<{ duration: number }> {
    return this.tx((p) => {
      if (p.raid) return fail('already_in_raid');
      const era = getEra(eraId);
      if (!era) return fail('invalid');
      if (!era.unlocked) return fail('locked');
      const duration = raidDuration(p, opts.testMap ? TEST_MAP_DURATION : era.baseDuration);
      p.raid = { era: eraId, startedAt: this.now(), duration, snapshot: this.bodyCounts(p), trade: { bought: {}, sold: {} } };
      return { ok: true, duration };
    });
  }

  /** Raid 中撿到東西：放進背包。放不下一部分時回傳實際拿到的數量 */
  lootItem(id: string, qty: number, dur?: number, mods?: ItemStack['mods']): Result<{ taken: number }> {
    return this.tx((p) => {
      if (!p.raid) return fail('not_in_raid');
      if (!getItem(id) || !Number.isInteger(qty) || qty < 1) return fail('invalid');
      const inv = this.inv(p, 'carried');
      const left = inv.add(id, qty, dur, mods);
      if (left >= qty) return fail(this.whyFull(inv, id), this.whyFull(inv, id) === 'full' ? '背包已滿' : undefined);
      return { ok: true, taken: qty - left };
    });
  }

  /**
   * 自動拾取是否適用：目前裝備的武器（主 / 副武器）使用的彈藥，或時晶（任何等級）。
   * 兩類各有開關（控制設定）。
   */
  isAutoPickup(id: string, opts: { ammo: boolean; chronite: boolean }): boolean {
    const def = getItem(id);
    if (!def) return false;
    if (def.category === 'chronite') return opts.chronite;
    if (def.category === 'ammo' && opts.ammo) {
      return (['primary', 'secondary'] as const).some((slot) => {
        const e = this.p.equipment[slot];
        return !!e && WEAPON_STATS[e.id]?.ammoType === id;
      });
    }
    return false;
  }

  /**
   * 揭露出物品時的自動拾取。不符合條件：ok 且 wanted = false、taken = 0。
   * 符合條件：放進背包，放不下一部分時 taken 小於 qty，完全放不下回傳 full（物品留在容器）。
   */
  autoPickup(stack: ItemStack, opts: { ammo: boolean; chronite: boolean }): Result<{ wanted: boolean; taken: number }> {
    if (!this.p.raid) return fail('not_in_raid');
    if (!this.isAutoPickup(stack.id, opts)) return { ok: true, wanted: false, taken: 0 };
    const r = this.lootItem(stack.id, stack.qty, stack.dur, stack.mods);
    if (!r.ok) return fail('full', '背包已滿');
    return { ok: true, wanted: true, taken: r.taken };
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
      const valueOf = (list: ItemStack[]) => list.reduce((n, s) => n + (sellPrice(s.id, day) + modIds(s.mods).reduce((m, id) => m + sellPrice(id, day), 0)) * s.qty, 0);
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
        body.forEach((s) => stash.forceAdd(s.id, s.qty, s.dur, s.mods));
        p.stats.extracts++;
        p.stats.extractedValue += valueOf(items);
      } else {
        items = [...p.carried.filter((s): s is ItemStack => !!s), ...equipped];
        kept = p.secure.filter((s): s is ItemStack => !!s);
        kept.forEach((s) => stash.forceAdd(s.id, s.qty, s.dur, s.mods));
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

  // ---------------------------------------------------------------- 時代商人（Raid 中）
  /** 本場商人的貨架（含剩餘庫存）；沒有商人或不在 Raid 中回傳空陣列 */
  traderOffers(): (TraderOffer & { left: number })[] {
    const raid = this.p.raid;
    const def = raid ? getTrader(raid.era) : undefined;
    if (!raid || !def) return [];
    const bought = raid.trade?.bought ?? {};
    return rollTraderStock(def, raid.startedAt).map((o) => ({ ...o, left: Math.max(0, o.stock - (bought[o.id] ?? 0)) }));
  }

  /** 賣出報價：在目前 Raid 已賣出數量的基礎上，賣 qty 件可拿到多少舊台幣 */
  traderSellQuote(itemId: string, qty: number, mods?: ItemStack['mods']): number {
    const raid = this.p.raid;
    const def = raid ? getTrader(raid.era) : undefined;
    if (!raid || !def) return 0;
    const day = dateKey(this.now());
    return [itemId, ...modIds(mods)].reduce((n, id) => n + traderSellTotal(def, id, qty, raid.trade?.sold[id] ?? 0, day), 0);
  }

  /** 商人的貨幣（舊台幣）：背包裡有多少 */
  traderCurrency(): { id: string; have: number } | null {
    const def = this.p.raid ? getTrader(this.p.raid.era) : undefined;
    return def ? { id: def.currency, have: this.countCarried(def.currency) } : null;
  }

  /** 把背包（或保險袋）的物品賣給商人，換成當地貨幣放進背包 */
  traderSell(from: Loc, qty?: number): Result<{ gain: number; sold: number }> {
    return this.tx((p) => {
      const raid = p.raid;
      if (!raid) return fail('not_in_raid');
      const def = getTrader(raid.era);
      if (!def) return fail('no_trader');
      if (from.c !== 'carried' && from.c !== 'secure') return fail('invalid');
      const inv = this.inv(p, from.c);
      const s = inv.slots[from.i];
      if (!s) return fail('invalid');
      if (s.id === def.currency) return fail('not_tradable', '商人不收自己的貨幣');
      const n = qty ?? s.qty;
      if (!Number.isInteger(n) || n < 1 || n > s.qty) return fail('invalid');
      raid.trade ??= { bought: {}, sold: {} };
      const day = dateKey(this.now());
      // 武器上的配件一起賣（各自計算「本場已賣出」的飽和）
      const parts: { id: string; qty: number }[] = [{ id: s.id, qty: n }, ...modIds(s.mods).map((id) => ({ id, qty: n }))];
      let gain = 0;
      for (const part of parts) gain += traderSellTotal(def, part.id, part.qty, raid.trade.sold[part.id] ?? 0, day);
      if (gain < 1) return fail('not_tradable');
      inv.takeAt(from.i, n);
      const carried = this.inv(p, 'carried');
      if (carried.add(def.currency, gain) > 0) return fail('full', '背包放不下這麼多舊台幣');
      for (const part of parts) raid.trade.sold[part.id] = (raid.trade.sold[part.id] ?? 0) + part.qty;
      return { ok: true, gain, sold: n };
    });
  }

  /** 用背包裡的舊台幣向商人買東西，放進背包 */
  traderBuy(itemId: string, qty = 1): Result<{ cost: number }> {
    return this.tx((p) => {
      const raid = p.raid;
      if (!raid) return fail('not_in_raid');
      const def = getTrader(raid.era);
      if (!def) return fail('no_trader');
      if (!getItem(itemId) || !Number.isInteger(qty) || qty < 1) return fail('invalid');
      raid.trade ??= { bought: {}, sold: {} };
      const offer = rollTraderStock(def, raid.startedAt).find((o) => o.id === itemId);
      if (!offer) return fail('invalid', '商人沒有這個商品');
      const left = offer.stock - (raid.trade.bought[itemId] ?? 0);
      if (qty > left) return fail('no_stock');
      const cost = offer.price * qty;
      const carried = this.inv(p, 'carried');
      if (carried.count(def.currency) < cost) return fail('no_currency');
      carried.remove(def.currency, cost);
      const dur = freshDur(getItem(itemId)!);
      if (carried.add(itemId, qty, dur) > 0) return fail(this.whyFull(carried, itemId), this.whyFull(carried, itemId) === 'full' ? '背包已滿' : undefined);
      raid.trade.bought[itemId] = (raid.trade.bought[itemId] ?? 0) + qty;
      return { ok: true, cost };
    });
  }

  // ---------------------------------------------------------------- 戰鬥（Raid 中）
  /** 背包中某種物品的數量（彈藥、醫療品） */
  countCarried(id: string): number { return this.inv(this.p, 'carried').count(id); }

  /**
   * 從背包扣除物品（彈藥、醫療品）。最多扣 qty，回傳實際扣掉的數量。
   * 彈藥只從背包取，保險袋與倉庫的不算。
   */
  consumeCarried(id: string, qty: number): number {
    if (!this.p.raid || qty <= 0) return 0;
    const inv = this.inv(this.p, 'carried');
    const n = Math.min(qty, inv.count(id));
    if (n <= 0) return 0;
    inv.remove(id, n);
    this.persist();
    return n;
  }

  /**
   * 寫回裝備的狀態值（武器彈匣 / 護甲耐久）。戰鬥系統在換彈、切槍、開啟介面與撤離前呼叫，
   * 不是每發子彈都寫，避免頻繁存檔。
   */
  setEquipState(slot: EquipSlot, dur: number): void {
    const e = this.p.equipment[slot];
    if (!e) return;
    const max = itemMaxDur(e.id, e.mods);
    const v = Math.max(0, Math.min(max, Math.round(dur)));
    if (e.dur === v) return;
    e.dur = v;
    this.persist();
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
