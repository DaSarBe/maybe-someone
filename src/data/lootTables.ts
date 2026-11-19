import type { Rarity } from './types';

export type ContainerType = 'crate' | 'toolbox' | 'cabinet' | 'safe' | 'corpse';

export interface LootEntry {
  id: string;
  /** 基礎權重；最後權重 = weight × rarityWeights[稀有度] */
  weight: number;
  /** 數量範圍（含），預設 1 */
  qty?: [number, number];
}

export interface ContainerLootDef {
  name: string;
  /** 物品「種類」數量範圍（含） */
  count: [number, number];
  /** 搜刮所需秒數（未計算搜刮升級） */
  searchTime: number;
  rarityWeights: Record<Rarity, number>;
  pool: LootEntry[];
  /** 外觀 */
  look: { model: 'prop_crate' | 'prop_chest' | 'box'; color: string; size: [number, number, number] };
}

export interface EraLoot {
  containers: Record<ContainerType, ContainerLootDef>;
}

const rw = (c: number, u: number, r: number, e: number, l: number): Record<Rarity, number> => ({
  common: c, uncommon: u, rare: r, epic: e, legendary: l,
});

export const LOOT_TABLES: Record<string, EraLoot> = {
  harbor_1990: {
    containers: {
      crate: {
        name: '木箱', count: [1, 3], searchTime: 2.5,
        rarityWeights: rw(70, 22, 7, 1, 0),
        look: { model: 'prop_crate', color: '#a2703c', size: [1, 0.8, 1] },
        pool: [
          { id: 'scrap_metal', weight: 12, qty: [1, 3] }, { id: 'fishing_net', weight: 8 },
          { id: 'glass_bottle', weight: 10, qty: [1, 4] }, { id: 'rice_wine', weight: 9, qty: [1, 2] },
          { id: 'vhs', weight: 8, qty: [1, 2] }, { id: 'newspaper', weight: 8, qty: [1, 3] },
          { id: 'pager', weight: 7 }, { id: 'walkman', weight: 6 }, { id: 'rice_cooker', weight: 5 },
          { id: 'famicom', weight: 5 }, { id: 'chronite_shard', weight: 6, qty: [1, 2] },
          { id: 'ammo_pistol', weight: 7, qty: [8, 24] }, { id: 'bandage', weight: 6, qty: [1, 2] },
          { id: 'pearl_string', weight: 3 }, { id: 'old_banknote', weight: 3 }, { id: 'qing_bowl', weight: 2 },
          { id: 'energy_cell', weight: 2 },
        ],
      },
      toolbox: {
        name: '工具箱', count: [1, 3], searchTime: 2.0,
        rarityWeights: rw(72, 20, 7, 1, 0),
        look: { model: 'box', color: '#c2410c', size: [0.8, 0.45, 0.4] },
        pool: [
          { id: 'screw_jar', weight: 12 }, { id: 'wire_roll', weight: 12, qty: [1, 2] },
          { id: 'scrap_metal', weight: 10, qty: [1, 2] }, { id: 'ammo_pistol', weight: 8, qty: [10, 30] },
          { id: 'ammo_shotgun', weight: 5, qty: [4, 10] }, { id: 'ammo_rifle', weight: 5, qty: [10, 25] },
          { id: 'chronite_shard', weight: 8, qty: [1, 3] }, { id: 'brick_phone', weight: 4 },
          { id: 'pager', weight: 5 }, { id: 'bandage', weight: 5, qty: [1, 3] }, { id: 'medkit', weight: 3 },
          { id: 'energy_cell', weight: 4 }, { id: 'pistol', weight: 2 }, { id: 'smg', weight: 1 },
          { id: 'chronite', weight: 3 },
        ],
      },
      cabinet: {
        name: '辦公櫃', count: [2, 4], searchTime: 3.5,
        rarityWeights: rw(55, 29, 12, 3.5, 0.5),
        look: { model: 'box', color: '#6b7a8a', size: [0.9, 1.5, 0.5] },
        pool: [
          { id: 'newspaper', weight: 8, qty: [1, 3] }, { id: 'vhs', weight: 7 }, { id: 'pager', weight: 8 },
          { id: 'brick_phone', weight: 7 }, { id: 'walkman', weight: 6 }, { id: 'famicom', weight: 6 },
          { id: 'old_banknote', weight: 8, qty: [1, 2] }, { id: 'pocket_watch', weight: 5 },
          { id: 'gold_necklace', weight: 5 }, { id: 'quantum_chip', weight: 3 }, { id: 'nano_gel', weight: 4 },
          { id: 'chronite_shard', weight: 7, qty: [1, 2] }, { id: 'chronite', weight: 4 },
          { id: 'medkit', weight: 4 }, { id: 'armor_1', weight: 2 }, { id: 'armor_2', weight: 2 },
          { id: 'bag_medium', weight: 1 }, { id: 'screw_jar', weight: 4 }, { id: 'jade_pendant', weight: 2 },
        ],
      },
      safe: {
        name: '保險櫃', count: [2, 4], searchTime: 6.0,
        rarityWeights: rw(18, 34, 32, 13, 3),
        look: { model: 'prop_chest', color: '#3b4252', size: [0.9, 0.7, 0.6] },
        pool: [
          { id: 'gold_bar', weight: 6 }, { id: 'jade_pendant', weight: 7 }, { id: 'pearl_string', weight: 6 },
          { id: 'diamond', weight: 3 }, { id: 'old_banknote', weight: 8, qty: [1, 3] },
          { id: 'gold_necklace', weight: 8 }, { id: 'pocket_watch', weight: 6 }, { id: 'qing_bowl', weight: 5 },
          { id: 'chronite', weight: 8, qty: [1, 2] }, { id: 'chronite_pure', weight: 3 },
          { id: 'chronite_shard', weight: 6, qty: [2, 4] }, { id: 'quantum_chip', weight: 4 },
          { id: 'rifle', weight: 2 }, { id: 'armor_3', weight: 2 }, { id: 'bag_large', weight: 1 },
          { id: 'painkiller', weight: 3 }, { id: 'stabilizer_shot', weight: 3 },
          { id: 'ammo_rifle', weight: 8, qty: [20, 40] }, { id: 'newspaper', weight: 6 }, { id: 'rice_wine', weight: 6 },
        ],
      },
      corpse: {
        name: '倒下的守衛', count: [2, 4], searchTime: 4.0,
        rarityWeights: rw(58, 28, 11, 3, 0),
        look: { model: 'box', color: '#3f3f46', size: [1.7, 0.35, 0.6] },
        pool: [
          { id: 'ammo_pistol', weight: 12, qty: [12, 30] }, { id: 'ammo_rifle', weight: 8, qty: [15, 30] },
          { id: 'ammo_shotgun', weight: 6, qty: [4, 12] }, { id: 'bandage', weight: 9, qty: [1, 3] },
          { id: 'medkit', weight: 6 }, { id: 'painkiller', weight: 3 }, { id: 'pistol', weight: 5 },
          { id: 'smg', weight: 3 }, { id: 'shotgun', weight: 2 }, { id: 'rifle', weight: 1 },
          { id: 'armor_1', weight: 5 }, { id: 'armor_2', weight: 3 }, { id: 'armor_3', weight: 1 },
          { id: 'bag_small', weight: 3 }, { id: 'bag_medium', weight: 2 },
          { id: 'brick_phone', weight: 4 }, { id: 'pager', weight: 5 }, { id: 'chronite_shard', weight: 6, qty: [1, 2] },
          { id: 'chronite', weight: 3 },
        ],
      },
    },
  },
};
