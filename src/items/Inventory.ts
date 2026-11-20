import { modIds, type WeaponMods } from '../data/attachments';
import { getItem } from '../data/items';

/** 物品堆疊。可序列化（直接放進存檔） */
export interface ItemStack {
  id: string;
  qty: number;
  /** 護甲的剩餘耐久；省略代表全新 */
  dur?: number;
  /** 武器安裝的配件（槽位 → 配件物品 id）；配件跟著武器走 */
  mods?: WeaponMods;
}

/** 複製堆疊（含耐久與配件），可指定新數量 */
export function cloneStack(s: ItemStack, qty = s.qty): ItemStack {
  const out: ItemStack = { id: s.id, qty };
  if (s.dur !== undefined) out.dur = s.dur;
  if (s.mods) out.mods = { ...s.mods };
  return out;
}

/** 建立堆疊（dur / mods 省略就不寫入欄位） */
export function makeStack(id: string, qty: number, dur?: number, mods?: WeaponMods): ItemStack {
  const out: ItemStack = { id, qty };
  if (dur !== undefined) out.dur = dur;
  if (mods && Object.keys(mods).length) out.mods = { ...mods };
  return out;
}
export type Slot = ItemStack | null;

export interface InventoryOpts {
  /** 格數 */
  capacity: number;
  /** 負重上限（kg）；省略代表不限（倉庫） */
  maxWeight?: number;
  /** 不在格子裡但算進負重的重量（身上穿戴的裝備） */
  extraWeight?: number;
}

/** 超過 maxWeight 這個倍率就不能再撿 */
export const HARD_WEIGHT_CAP = 1.25;

export type MoveResult = { ok: true; moved: number } | { ok: false; reason: 'empty' | 'full' | 'invalid' | 'mismatch' };

/**
 * 格數 + 重量的背包。直接操作傳入的 slots 陣列（就地修改），
 * 所以可以把存檔裡的陣列包起來操作。不做俄羅斯方塊式格子（手機不好操作）。
 */
export class Inventory {
  readonly capacity: number;
  readonly maxWeight: number;
  extraWeight: number;

  constructor(public readonly slots: Slot[], opts: InventoryOpts) {
    this.capacity = opts.capacity;
    this.maxWeight = opts.maxWeight ?? Infinity;
    this.extraWeight = opts.extraWeight ?? 0;
    while (slots.length < this.capacity) slots.push(null);
  }

  /** 已使用的格數 */
  get used(): number {
    return this.slots.reduce((n, s) => n + (s ? 1 : 0), 0);
  }

  get free(): number {
    return Math.max(0, this.capacity - this.used);
  }

  /** 格子內物品的重量 */
  get slotWeight(): number {
    return this.slots.reduce((w, s) => w + (s ? stackWeight(s) : 0), 0);
  }

  get totalWeight(): number {
    return this.slotWeight + this.extraWeight;
  }

  /** 負重比例：0 = 空；1 = 到達上限；超過 1 就是超重 */
  getWeightRatio(): number {
    return Number.isFinite(this.maxWeight) && this.maxWeight > 0 ? this.totalWeight / this.maxWeight : 0;
  }

  count(id: string): number {
    return this.slots.reduce((n, s) => n + (s && s.id === id ? s.qty : 0), 0);
  }

  firstEmpty(): number {
    for (let i = 0; i < this.capacity; i++) if (!this.slots[i]) return i;
    return -1;
  }

  /** 以格數與重量上限計算：最多還能放進幾個這種物品 */
  maxAddable(id: string, want: number): number {
    const def = getItem(id);
    if (!def || want <= 0) return 0;
    // 格數空間：現有未滿的堆疊 + 空格
    let room = 0;
    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      if (!s) room += def.maxStack;
      else if (s.id === id && s.dur === undefined && !s.mods) room += def.maxStack - s.qty;
    }
    let n = Math.min(want, room);
    if (Number.isFinite(this.maxWeight) && def.weight > 0) {
      const spare = this.maxWeight * HARD_WEIGHT_CAP - this.totalWeight;
      n = Math.min(n, Math.max(0, Math.floor(spare / def.weight + 1e-9)));
    }
    return n;
  }

  canFit(id: string, qty: number): boolean {
    return this.maxAddable(id, qty) >= qty;
  }

  /** 加入物品：先補滿既有堆疊，再用空格。回傳放不下的剩餘數量 */
  add(id: string, qty: number, dur?: number, mods?: WeaponMods): number {
    const def = getItem(id);
    if (!def || qty <= 0) return qty;
    let left = Math.min(qty, this.maxAddable(id, qty));
    const rejected = qty - left;
    if (dur === undefined && !mods) {
      for (const s of this.slots) {
        if (left <= 0) break;
        if (s && s.id === id && s.dur === undefined && !s.mods && s.qty < def.maxStack) {
          const n = Math.min(left, def.maxStack - s.qty);
          s.qty += n;
          left -= n;
        }
      }
    }
    while (left > 0) {
      const i = this.firstEmpty();
      if (i < 0) break;
      const n = Math.min(left, def.maxStack);
      this.slots[i] = makeStack(id, n, dur, mods);
      left -= n;
    }
    return rejected + left;
  }

  addStack(s: ItemStack): number {
    return this.add(s.id, s.qty, s.dur, s.mods);
  }

  /** 無視格數與重量上限的加入（撤離結算時倉庫溢出用）：放不下就在尾端增加格子 */
  forceAdd(id: string, qty: number, dur?: number, mods?: WeaponMods): void {
    const def = getItem(id);
    if (!def) return;
    let left = qty;
    if (dur === undefined && !mods) {
      for (const s of this.slots) {
        if (left <= 0) break;
        if (s && s.id === id && s.dur === undefined && !s.mods && s.qty < def.maxStack) {
          const n = Math.min(left, def.maxStack - s.qty);
          s.qty += n;
          left -= n;
        }
      }
    }
    while (left > 0) {
      const n = Math.min(left, def.maxStack);
      const stack: ItemStack = makeStack(id, n, dur, mods);
      const i = this.firstEmpty();
      if (i >= 0) this.slots[i] = stack; else this.slots.push(stack);
      left -= n;
    }
  }

  /** 從指定格取出（最多 qty 個）；回傳取出的堆疊 */
  takeAt(i: number, qty?: number): ItemStack | null {
    const s = this.slots[i];
    if (!s) return null;
    const n = Math.min(qty ?? s.qty, s.qty);
    if (n <= 0) return null;
    const out = cloneStack(s, n);
    s.qty -= n;
    if (s.qty <= 0) this.slots[i] = null;
    return out;
  }

  /** 依 id 移除（跨多個堆疊）。數量不足時不改動並回傳 false */
  remove(id: string, qty: number): boolean {
    if (this.count(id) < qty) return false;
    let left = qty;
    for (let i = this.capacity - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) left -= this.takeAt(i, left)?.qty ?? 0;
    }
    return true;
  }

  /** 把一個堆疊拆出 qty 個到第一個空格 */
  split(i: number, qty: number): MoveResult {
    const s = this.slots[i];
    if (!s) return { ok: false, reason: 'empty' };
    if (qty <= 0 || qty >= s.qty) return { ok: false, reason: 'invalid' };
    const e = this.firstEmpty();
    if (e < 0) return { ok: false, reason: 'full' };
    this.slots[e] = this.takeAt(i, qty);
    return { ok: true, moved: qty };
  }

  /**
   * 同一個容器內移動：目標為空 → 移過去；同種可堆疊 → 合併；不同物品且整堆移動 → 交換。
   * qty 省略代表整堆。
   */
  moveWithin(from: number, to: number, qty?: number): MoveResult {
    if (from === to) return { ok: false, reason: 'invalid' };
    const src = this.slots[from];
    if (!src) return { ok: false, reason: 'empty' };
    if (to < 0 || to >= this.slots.length) return { ok: false, reason: 'invalid' };
    const n = Math.min(qty ?? src.qty, src.qty);
    if (n <= 0) return { ok: false, reason: 'invalid' };
    const dst = this.slots[to];
    const def = getItem(src.id);
    if (!def) return { ok: false, reason: 'invalid' };
    if (!dst) {
      this.slots[to] = this.takeAt(from, n);
      return { ok: true, moved: n };
    }
    if (dst.id === src.id && dst.dur === src.dur && !dst.mods && !src.mods && def.maxStack > 1) {
      const m = Math.min(n, def.maxStack - dst.qty);
      if (m <= 0) return { ok: false, reason: 'full' };
      dst.qty += m;
      this.takeAt(from, m);
      return { ok: true, moved: m };
    }
    if (n === src.qty) {
      this.slots[from] = dst;
      this.slots[to] = src;
      return { ok: true, moved: n };
    }
    return { ok: false, reason: 'mismatch' };
  }

  /** 非空堆疊清單（附格子編號） */
  entries(): { index: number; stack: ItemStack }[] {
    const out: { index: number; stack: ItemStack }[] = [];
    this.slots.forEach((s, index) => { if (s) out.push({ index, stack: s }); });
    return out;
  }
}

/** 堆疊重量（含武器上的配件） */
export function stackWeight(s: ItemStack): number {
  const mods = s.mods ? modIds(s.mods).reduce((w, id) => w + (getItem(id)?.weight ?? 0), 0) : 0;
  return (getItem(s.id)?.weight ?? 0) * s.qty + mods * s.qty;
}

/** 穿在身上的裝備（武器含配件、護甲、頭盔、背包）計入負重時的係數 */
export const WORN_WEIGHT_FACTOR = 0.5;
/** 負重比例門檻：超過 SLOW 開始逐漸變慢；到 FULL（100%）速度 ×FULL_SPEED、不能衝刺 */
export const WEIGHT_SLOW_START = 0.7;
export const WEIGHT_FULL = 1;
const SPEED_AT_FULL = 0.8;
const SPEED_OVERWEIGHT = 0.6;

/**
 * 負重速度係數：0~70% 正常；70~100% 線性降到 ×0.8；
 * 100~125% 固定 ×0.6（且不能衝刺）。超過 125% 撿不起東西（HARD_WEIGHT_CAP）。
 */
export function weightSpeedFactor(ratio: number): number {
  if (ratio <= WEIGHT_SLOW_START) return 1;
  if (ratio < WEIGHT_FULL) return 1 - (1 - SPEED_AT_FULL) * ((ratio - WEIGHT_SLOW_START) / (WEIGHT_FULL - WEIGHT_SLOW_START));
  return SPEED_OVERWEIGHT;
}
/** 100% 以上不能衝刺（蹲跑一樣，因為蹲跑也走衝刺判定） */
export const canSprintAtWeight = (ratio: number): boolean => ratio < WEIGHT_FULL;
