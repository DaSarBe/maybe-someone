/**
 * 時代商人（純資料）。每個時代一位商人，只收當地貨幣；價格與庫存規則見 economy/Trader.ts。
 * 設計與數值說明在 docs/DESIGN.md「時代商人」。
 */
export interface TraderStockDef {
  id: string;
  /** 一件的價格（當地貨幣） */
  price: number;
  /** 本場庫存數量範圍（含） */
  qty: [number, number];
  /** 本場出現在貨架上的機率 */
  chance: number;
}

export interface TraderDef {
  eraId: string;
  name: string;
  /** 商人收的貨幣（物品 id） */
  currency: string;
  greeting: string;
  /** 收購未來商品：pricePast × 這個倍率（商人的利潤） */
  futureGoodsRate: number;
  /** 收購其他物品：基準價（未來售價）× 這個倍率，通常很低 */
  otherRate: number;
  /** 每種物品每場以「原價」收購的數量；超過的部分市場飽和，只付 overstockRate */
  fullPriceUnits: { future_goods: number; rare_future: number; other: number };
  overstockRate: number;
  stock: TraderStockDef[];
}

export const TRADERS: Record<string, TraderDef> = {
  harbor_1990: {
    eraId: 'harbor_1990',
    name: '時代商行',
    currency: 'old_ntd',
    greeting: '「這些東西……我從來沒看過。價錢好說，只收現金。」',
    futureGoodsRate: 0.85,
    otherRate: 0.2,
    fullPriceUnits: { future_goods: 3, rare_future: 2, other: 6 },
    overstockRate: 0.35,
    stock: [
      // 古董：進貨價約為未來售價的 75%，帶回未來有賺頭
      { id: 'pager', price: 220, qty: [1, 3], chance: 0.8 },
      { id: 'walkman', price: 330, qty: [1, 2], chance: 0.7 },
      { id: 'famicom', price: 270, qty: [1, 3], chance: 0.6 },
      { id: 'rice_cooker', price: 520, qty: [1, 1], chance: 0.5 },
      { id: 'brick_phone', price: 780, qty: [1, 1], chance: 0.5 },
      { id: 'old_banknote', price: 1150, qty: [1, 2], chance: 0.45 },
      { id: 'gold_necklace', price: 1500, qty: [1, 1], chance: 0.4 },
      { id: 'pocket_watch', price: 2200, qty: [1, 1], chance: 0.35 },
      { id: 'qing_bowl', price: 3300, qty: [1, 1], chance: 0.25 },
      // 時晶碎片：少量、昂貴（比未來的賣價貴，純粹為了取得）
      { id: 'chronite_shard', price: 900, qty: [1, 3], chance: 0.8 },
      // 當地彈藥
      { id: 'ammo_pistol', price: 10, qty: [30, 90], chance: 0.9 },
      { id: 'ammo_rifle', price: 20, qty: [30, 60], chance: 0.6 },
      { id: 'ammo_shotgun', price: 24, qty: [12, 24], chance: 0.6 },
      // 醫療品
      { id: 'bandage', price: 120, qty: [2, 6], chance: 0.9 },
      { id: 'medkit', price: 600, qty: [1, 2], chance: 0.6 },
      { id: 'painkiller', price: 1000, qty: [1, 1], chance: 0.35 },
      // 雜貨
      { id: 'rice_wine', price: 60, qty: [2, 6], chance: 0.7 },
      { id: 'vhs', price: 90, qty: [1, 4], chance: 0.5 },
    ],
  },
};

export const getTrader = (eraId: string): TraderDef | undefined => TRADERS[eraId];
