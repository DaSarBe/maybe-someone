import { BUY_MARKUP, RARITY_PRICE_MULT } from './constants';
import { getItem } from '../data/items';
import { hashString } from '../items/LootTable';

export { RARITY_PRICE_MULT };

/** 本地日期字串（同一天價格固定） */
export function dateKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 每日浮動：±10%，以「日期 + 物品」為 seed */
export function dailyFactor(itemId: string, day: string): number {
  const h = hashString(`${day}|${itemId}`);
  return 0.9 + (h % 2001) / 10000; // 0.90 .. 1.10
}

/** 在未來的賣出價（玩家賣給商店） */
export function sellPrice(itemId: string, day: string): number {
  const def = getItem(itemId);
  if (!def) return 0;
  return Math.max(1, Math.round(def.priceFuture * RARITY_PRICE_MULT[def.rarity] * dailyFactor(itemId, day)));
}

/** 商店賣給玩家的價格：約為賣出價的 1.4 倍，因此在基地內買賣一定虧錢 */
export function buyPrice(itemId: string, day: string): number {
  return Math.max(1, Math.round(sellPrice(itemId, day) * BUY_MARKUP));
}
