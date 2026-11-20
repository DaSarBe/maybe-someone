export type UpgradeId = 'stash' | 'secure' | 'safe' | 'stabilizer' | 'search' | 'fitness';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  /** 0 級時的數值 */
  base: number;
  unit: string;
  /** 每一級的價格與升級後的數值 */
  levels: { cost: number; value: number }[];
  glyph: string;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'stash', name: '倉庫擴充', desc: '增加倉庫格數。', base: 40, unit: '格', glyph: '📦',
    levels: [{ cost: 2500, value: 50 }, { cost: 6000, value: 60 }, { cost: 12000, value: 70 }, { cost: 22000, value: 80 }],
  },
  {
    id: 'secure', name: '保險袋', desc: 'Raid 中死亡也不會掉落的格子。', base: 1, unit: '格', glyph: '🛡',
    levels: [{ cost: 6000, value: 2 }, { cost: 16000, value: 3 }, { cost: 38000, value: 4 }],
  },
  {
    id: 'safe', name: '房間保險箱', desc: '增加房間保險箱格數（第二階段防入侵）。', base: 6, unit: '格', glyph: '🔐',
    levels: [{ cost: 3000, value: 12 }, { cost: 7500, value: 18 }, { cost: 15000, value: 24 }, { cost: 28000, value: 30 }],
  },
  {
    id: 'stabilizer', name: '時光機穩定器', desc: '延長 Raid 可停留的時間。', base: 300, unit: '秒', glyph: '⏳',
    levels: [{ cost: 3500, value: 345 }, { cost: 9000, value: 390 }, { cost: 20000, value: 435 }, { cost: 40000, value: 480 }],
  },
  {
    id: 'search', name: '搜刮模組', desc: '縮短搜刮容器所需的時間。數值為時間倍率。', base: 1, unit: '倍', glyph: '🔍',
    levels: [{ cost: 2000, value: 0.85 }, { cost: 5500, value: 0.7 }, { cost: 12000, value: 0.58 }, { cost: 24000, value: 0.48 }],
  },
  {
    id: 'fitness', name: '體能訓練', desc: '提高負重上限（穿在身上的裝備只算一半重量）。數值為額外增加的公斤數。', base: 0, unit: '公斤', glyph: '💪',
    levels: [{ cost: 3000, value: 3 }, { cost: 7500, value: 6 }, { cost: 15000, value: 9 }, { cost: 28000, value: 12 }, { cost: 48000, value: 15 }],
  },
];

export const getUpgrade = (id: string): UpgradeDef | undefined => UPGRADES.find((u) => u.id === id);
