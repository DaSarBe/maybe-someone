import { getItem } from '../data/items';
import type { EconomyService } from '../economy/EconomyService';
import type { Slot } from './Inventory';

export interface AutoPickupOpts { ammo: boolean; chronite: boolean }

export interface AutoPickupOutcome {
  /** 這件物品符合自動拾取條件 */
  wanted: boolean;
  /** 放進背包的數量 */
  taken: number;
  /** 想拿但背包放不下（全部或一部分留在容器） */
  blocked: boolean;
  name: string;
  id: string;
}

/**
 * 某格剛揭露時的自動拾取：符合條件就放進背包（有空間才拿），拿走的數量從 loot 扣除。
 * 一律透過 EconomyService；場景再依結果發 itemPicked / noise / 提示。
 */
export function autoPickupFromLoot(eco: EconomyService, loot: Slot[], index: number, opts: AutoPickupOpts): AutoPickupOutcome | null {
  const s = loot[index];
  if (!s) return null;
  const name = getItem(s.id)?.name ?? s.id;
  const r = eco.autoPickup(s, opts);
  if (!r.ok) return { wanted: true, taken: 0, blocked: true, name, id: s.id };
  if (!r.wanted) return { wanted: false, taken: 0, blocked: false, name, id: s.id };
  s.qty -= r.taken;
  const left = s.qty;
  if (left <= 0) loot[index] = null;
  return { wanted: true, taken: r.taken, blocked: left > 0, name, id: s.id };
}
