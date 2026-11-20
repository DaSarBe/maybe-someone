import { ARMOR_STATS, BACKPACK_STATS, HELMET_STATS } from '../data/gear';
import { HELMET_TABLE } from '../data/helmet';
import { getItem } from '../data/items';
import { WEAPON_STATS } from '../data/weapons';
import type { ItemStack } from './Inventory';

export type CompareDir = 'up' | 'down' | 'same';

export interface CompareRow {
  label: string;
  /** 目前裝備的數值（空欄位時為 null） */
  from: string | null;
  to: string;
  /** 新裝備相對於目前裝備：up = 比較好、down = 比較差 */
  dir: CompareDir;
}

const dirOf = (from: number | null, to: number, higherBetter = true): CompareDir => {
  if (from === null || from === to) return 'same';
  return (to > from) === higherBetter ? 'up' : 'down';
};

const row = (label: string, from: number | null, to: number, fmt: (n: number) => string = String, higherBetter = true): CompareRow => ({
  label, from: from === null ? null : fmt(from), to: fmt(to), dir: dirOf(from, to, higherBetter),
});

/**
 * 新舊裝備比較（純函式）：護甲 = 等級、耐久；武器 = 傷害、射速、彈匣、內有彈藥；背包 = 格數、負重。
 * old 為 null 代表欄位是空的（只列出新裝備的數值）。不同類別（理論上不會發生）回傳空陣列。
 */
export function compareGear(next: ItemStack, old: ItemStack | null): CompareRow[] {
  const nd = getItem(next.id);
  const od = old ? getItem(old.id) : undefined;
  if (!nd || (od && od.category !== nd.category)) return [];

  if (nd.category === 'armor') {
    const n = ARMOR_STATS[next.id];
    if (!n) return [];
    const o = old ? ARMOR_STATS[old.id] : undefined;
    return [
      row('等級', o?.tier ?? null, n.tier),
      row('耐久', o ? (old!.dur ?? o.durability) : null, next.dur ?? n.durability),
      row('減傷', o ? Math.round(o.reduction * 100) : null, Math.round(n.reduction * 100), (v) => `${v}%`),
    ];
  }
  if (nd.category === 'helmet') {
    const n = HELMET_STATS[next.id];
    if (!n) return [];
    const o = old ? HELMET_STATS[old.id] : undefined;
    const effLight = (lv: number): number => Math.round(HELMET_TABLE.light[lv as 1 | 2 | 3 | 4].dmg[0] * 100);
    return [
      row('等級', o?.level ?? null, n.level),
      row('耐久', o ? (old!.dur ?? o.durability) : null, next.dur ?? n.durability),
      row('擋步槍爆頭', o ? Number(o.level >= 3) : null, Number(n.level >= 3), (v) => (v ? '可' : '不可')),
      row('手槍爆頭受傷', o ? effLight(o.level) : null, effLight(n.level), (v) => `${v}%+`, false),
    ];
  }
  if (nd.category === 'weapon') {
    const n = WEAPON_STATS[next.id];
    if (!n) return [];
    const o = old ? WEAPON_STATS[old.id] : undefined;
    const rows: CompareRow[] = [
      row('傷害', o ? o.damage * o.pellets : null, n.damage * n.pellets, String),
      row('射速', o?.fireRate ?? null, n.fireRate, (v) => `${v}`),
      row('彈匣', o?.magazine ?? null, n.magazine),
      row('內有', o ? (old!.dur ?? o.magazine) : null, next.dur ?? n.magazine, (v) => `${v} 發`),
    ];
    // 多發彈丸的傷害顯示成「12×8」
    if (n.pellets > 1 || (o && o.pellets > 1)) {
      rows[0].to = `${n.damage}×${n.pellets}`;
      if (o) rows[0].from = `${o.damage}×${o.pellets}`;
    }
    if (o && o.ammoType !== n.ammoType) {
      rows.push({ label: '彈藥', from: getItem(o.ammoType)?.name ?? o.ammoType, to: getItem(n.ammoType)?.name ?? n.ammoType, dir: 'same' });
    }
    return rows;
  }
  if (nd.category === 'backpack') {
    const n = BACKPACK_STATS[next.id];
    if (!n) return [];
    const o = old ? BACKPACK_STATS[old.id] : undefined;
    return [
      row('格數', o?.slots ?? null, n.slots),
      row('負重', o?.maxWeight ?? null, n.maxWeight, (v) => `${v} kg`),
    ];
  }
  return [];
}
