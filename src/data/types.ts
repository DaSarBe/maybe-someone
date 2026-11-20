/** 資料層共用型別（只放型別，不放邏輯） */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type Category =
  | 'weapon' | 'ammo' | 'armor' | 'helmet' | 'backpack' | 'medical'
  | 'chronite' | 'antique' | 'future_goods' | 'valuable' | 'junk' | 'currency';

export interface ItemDef {
  id: string;
  /** 繁體中文名稱 */
  name: string;
  desc: string;
  category: Category;
  /** 單件重量（kg） */
  weight: number;
  maxStack: number;
  /** 在未來的基準價（信用點）。實際成交價還會乘上稀有度係數與每日浮動 */
  priceFuture: number;
  /** 在過去交易用（M4） */
  pricePast?: number;
  rarity: Rarity;
  icon: { glyph: string; color: string };
  /** 可出現的時代；省略代表不限 */
  eras?: string[];
}

export interface WeaponStats {
  /** 可裝備的欄位 */
  slot: 'primary' | 'secondary';
  /** 單發傷害（霰彈槍為每顆彈丸） */
  damage: number;
  pellets: number;
  /** 每分鐘發數 */
  fireRate: number;
  magazine: number;
  /** 使用的彈藥物品 id */
  ammoType: string;
  /** 後座力（0..1） */
  recoil: number;
  reloadTime: number;
  /** 有效射程（公尺） */
  range: number;
  /** 武器類別：light（手槍、衝鋒槍）/ heavy（步槍、霰彈槍）。決定頭盔能不能擋下爆頭，見 data/helmet.ts */
  weaponClass: 'light' | 'heavy';
}

export interface ArmorStats {
  tier: 1 | 2 | 3 | 4;
  durability: number;
  /** 傷害減免比例 */
  reduction: number;
}

export interface HelmetStats {
  level: 1 | 2 | 3 | 4;
  /** 耐久上限（被命中會消耗，見 data/helmet.ts） */
  durability: number;
}

export interface BackpackStats {
  slots: number;
  maxWeight: number;
}
