import type { ItemDef, WeaponStats } from './types';

/** 武器數值。M3 只當物品與商品，M4 才接上戰鬥。 */
export const WEAPON_STATS: Record<string, WeaponStats> = {
  pistol: { slot: 'secondary', damage: 24, pellets: 1, fireRate: 400, magazine: 12, ammoType: 'ammo_pistol', recoil: 0.18, reloadTime: 1.6, range: 45, weaponClass: 'light' },
  smg: { slot: 'primary', damage: 20, pellets: 1, fireRate: 850, magazine: 30, ammoType: 'ammo_pistol', recoil: 0.3, reloadTime: 2.0, range: 40, weaponClass: 'light' },
  rifle: { slot: 'primary', damage: 36, pellets: 1, fireRate: 650, magazine: 30, ammoType: 'ammo_rifle', recoil: 0.42, reloadTime: 2.4, range: 90, weaponClass: 'heavy' },
  shotgun: { slot: 'primary', damage: 12, pellets: 8, fireRate: 75, magazine: 6, ammoType: 'ammo_shotgun', recoil: 0.7, reloadTime: 3.0, range: 22, weaponClass: 'heavy' },
};

export const WEAPON_ITEMS: ItemDef[] = [
  { id: 'pistol', name: 'P-9 脈衝手槍', desc: '企業標準配發的副武器，可靠但火力普通。', category: 'weapon', weight: 1.0, maxStack: 1, priceFuture: 1100, rarity: 'common', icon: { glyph: '🔫', color: '#8aa0b8' } },
  { id: 'smg', name: 'KR-45 衝鋒槍', desc: '射速極高，適合室內近距離戰鬥。', category: 'weapon', weight: 2.6, maxStack: 1, priceFuture: 3400, rarity: 'uncommon', icon: { glyph: '🔫', color: '#4ade80' } },
  { id: 'rifle', name: 'AR-7 突擊步槍', desc: '穿越者最愛用的全能步槍，中遠距離都能勝任。', category: 'weapon', weight: 3.6, maxStack: 1, priceFuture: 6200, rarity: 'rare', icon: { glyph: '🔫', color: '#38bdf8' } },
  { id: 'shotgun', name: 'S-12 霰彈槍', desc: '近距離一擊致命，彈匣小、後座力大。', category: 'weapon', weight: 3.3, maxStack: 1, priceFuture: 4300, rarity: 'uncommon', icon: { glyph: '🔫', color: '#fb923c' } },
];
