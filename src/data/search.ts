/**
 * 搜刮（逐件揭露）的資料與純函式。
 * 揭露時間、開箱延遲、裝備護甲時間都只在這裡定義；場景、面板與測試共用。
 */
import { getItem } from './items';
import type { Rarity } from './types';

/** 每件物品的揭露秒數（依稀有度，未計搜刮升級與安靜搜刮） */
export const REVEAL_SECONDS: Record<Rarity, number> = {
  common: 0.6, uncommon: 0.9, rare: 1.4, epic: 2.0, legendary: 2.8,
};

/** 安靜搜刮：揭露時間倍率（聲音距離倍率見 data/noise.ts QUIET_SEARCH_LOUDNESS） */
export const QUIET_TIME_MULT = 1.6;

/** 第一次打開容器的開箱動作（秒），期間可被移動離開範圍或開槍中斷 */
export const CONTAINER_OPEN_SECONDS = 0.5;

/** 從容器直接裝備護甲所需的時間（秒），可被中斷 */
export const ARMOR_EQUIP_SECONDS = 1.5;

/**
 * 揭露某件物品所需秒數 = 稀有度基礎秒數 × 搜刮模組係數（EconomyService.searchScale，越小越快）× 安靜搜刮倍率。
 */
export function revealSeconds(itemId: string, searchScale = 1, quiet = false): number {
  const rarity = getItem(itemId)?.rarity ?? 'common';
  return REVEAL_SECONDS[rarity] * searchScale * (quiet ? QUIET_TIME_MULT : 1);
}
