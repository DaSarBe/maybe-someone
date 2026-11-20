import type { ArmorStats, BackpackStats, HelmetStats, ItemDef } from './types';

export const ARMOR_STATS: Record<string, ArmorStats> = {
  armor_1: { tier: 1, durability: 40, reduction: 0.15 },
  armor_2: { tier: 2, durability: 60, reduction: 0.3 },
  armor_3: { tier: 3, durability: 80, reduction: 0.45 },
  armor_4: { tier: 4, durability: 100, reduction: 0.6 },
};

/** 頭盔耐久上限。命中時的耐久消耗與傷害規則見 data/helmet.ts */
export const HELMET_STATS: Record<string, HelmetStats> = {
  helmet_1: { level: 1, durability: 30 },
  helmet_2: { level: 2, durability: 45 },
  helmet_3: { level: 3, durability: 60 },
  helmet_4: { level: 4, durability: 80 },
};

export const BACKPACK_STATS: Record<string, BackpackStats> = {
  bag_small: { slots: 8, maxWeight: 15 },
  bag_medium: { slots: 14, maxWeight: 25 },
  bag_large: { slots: 20, maxWeight: 35 },
};

/** 沒有裝備背包時，身上口袋的容量 */
export const POCKETS: BackpackStats = { slots: 4, maxWeight: 10 };

export const GEAR_ITEMS: ItemDef[] = [
  { id: 'armor_1', name: '纖維防彈衣 I', desc: '輕便的纖維內襯，只能擋下流彈。', category: 'armor', weight: 2.0, maxStack: 1, priceFuture: 600, rarity: 'common', icon: { glyph: '🦺', color: '#9aa5b1' } },
  { id: 'armor_2', name: '複合護甲 II', desc: '陶瓷片加纖維，可擋下手槍彈。', category: 'armor', weight: 3.5, maxStack: 1, priceFuture: 1800, rarity: 'uncommon', icon: { glyph: '🦺', color: '#4ade80' } },
  { id: 'armor_3', name: '戰術護甲 III', desc: '企業精銳的標配，能對抗步槍彈。', category: 'armor', weight: 5.0, maxStack: 1, priceFuture: 4600, rarity: 'rare', icon: { glyph: '🦺', color: '#38bdf8' } },
  { id: 'armor_4', name: '重型外骨骼甲 IV', desc: '極重但幾乎無懈可擊的重型護甲。', category: 'armor', weight: 7.0, maxStack: 1, priceFuture: 9500, rarity: 'epic', icon: { glyph: '🦺', color: '#c084fc' } },
  { id: 'helmet_1', name: '工地安全帽 I', desc: '塑膠硬殼，只能擋下手槍與衝鋒槍的子彈，而且擋完人也不太好受。步槍可以直接打穿。', category: 'helmet', weight: 0.6, maxStack: 1, priceFuture: 570, rarity: 'common', icon: { glyph: '⛑', color: '#9aa5b1' } },
  { id: 'helmet_2', name: '纖維戰術頭盔 II', desc: '凱夫拉纖維殼，能把手槍彈擋得很乾淨，但擋不住步槍。', category: 'helmet', weight: 0.9, maxStack: 1, priceFuture: 1620, rarity: 'uncommon', icon: { glyph: '⛑', color: '#4ade80' } },
  { id: 'helmet_3', name: '複合陶瓷頭盔 III', desc: '企業精銳的標配。能擋下步槍的爆頭，但會留下一道深深的凹痕。', category: 'helmet', weight: 1.2, maxStack: 1, priceFuture: 4000, rarity: 'rare', icon: { glyph: '⛑', color: '#38bdf8' } },
  { id: 'helmet_4', name: '重型複合頭盔 IV', desc: '全罩式重型頭盔。視野稍窄、戴起來很重，但連步槍的爆頭都只是一陣頭暈。', category: 'helmet', weight: 1.6, maxStack: 1, priceFuture: 7620, rarity: 'epic', icon: { glyph: '⛑', color: '#c084fc' } },
  { id: 'bag_small', name: '小型戰術背包', desc: '8 格，負重 15 kg。新手穿越者的標準配備。', category: 'backpack', weight: 0.8, maxStack: 1, priceFuture: 500, rarity: 'common', icon: { glyph: '🎒', color: '#9aa5b1' } },
  { id: 'bag_medium', name: '中型遠征背包', desc: '14 格，負重 25 kg。', category: 'backpack', weight: 1.2, maxStack: 1, priceFuture: 2300, rarity: 'uncommon', icon: { glyph: '🎒', color: '#4ade80' } },
  { id: 'bag_large', name: '大型貨運背包', desc: '20 格，負重 35 kg。專為搬運戰利品設計。', category: 'backpack', weight: 1.8, maxStack: 1, priceFuture: 6800, rarity: 'rare', icon: { glyph: '🎒', color: '#38bdf8' } },
];
