import { getItem } from '../data/items';
import { getTrader, type TraderDef } from '../data/traders';
import { hashString } from '../items/LootTable';
import { sellPrice } from './Pricing';

/** 可重現的亂數（mulberry32），商人庫存由「時代 + Raid 開始時間」決定，重新載入頁面結果相同 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TraderOffer {
  id: string;
  price: number;
  /** 本場初始庫存 */
  stock: number;
}

/** 這一場 Raid 商人的貨架（純函式） */
export function rollTraderStock(def: TraderDef, raidStartedAt: number): TraderOffer[] {
  const r = rng(hashString(`${def.eraId}|trader|${raidStartedAt}`));
  const out: TraderOffer[] = [];
  for (const s of def.stock) {
    const roll = r();
    const q = s.qty[0] + Math.floor(r() * (s.qty[1] - s.qty[0] + 1));
    if (roll <= s.chance) out.push({ id: s.id, price: s.price, stock: q });
  }
  return out;
}

/** 商人收購某物品時，前 N 件的單價與基準：回傳 { unit, fullUnits } */
export function traderSellRate(def: TraderDef, itemId: string, day: string): { unit: number; fullUnits: number } | null {
  const item = getItem(itemId);
  if (!item || itemId === def.currency) return null;
  if (item.category === 'future_goods' && item.pricePast) {
    const rare = item.rarity === 'rare' || item.rarity === 'epic' || item.rarity === 'legendary';
    return {
      unit: Math.max(1, Math.round(item.pricePast * def.futureGoodsRate)),
      fullUnits: rare ? def.fullPriceUnits.rare_future : def.fullPriceUnits.future_goods,
    };
  }
  return { unit: Math.max(1, Math.round(sellPrice(itemId, day) * def.otherRate)), fullUnits: def.fullPriceUnits.other };
}

/**
 * 賣 qty 件的總價。alreadySold = 本場已經賣過幾件（超過 fullUnits 的部分只給 overstockRate）。
 */
export function traderSellTotal(def: TraderDef, itemId: string, qty: number, alreadySold: number, day: string): number {
  const rate = traderSellRate(def, itemId, day);
  if (!rate) return 0;
  const fullLeft = Math.max(0, rate.fullUnits - alreadySold);
  const full = Math.min(qty, fullLeft);
  const rest = qty - full;
  return full * rate.unit + rest * Math.max(1, Math.round(rate.unit * def.overstockRate));
}

export { getTrader };
