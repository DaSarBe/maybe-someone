import { getItem } from '../data/items';
import { rollContainer, type Rng } from '../items/LootTable';
import type { ItemStack } from '../items/Inventory';
import type { EnemyDef } from '../data/enemies';
import { ARMOR_STATS, HELMET_STATS } from '../data/gear';

export interface CorpseSource {
  def: EnemyDef;
  weaponId: string;
  /** 死亡時彈匣內剩的子彈 */
  mag: number;
  /** 隨身備彈 */
  reserve: number;
  ammoType: string;
  armorDur: number;
  /** 戴著的頭盔（id 與剩餘耐久）；沒戴或耐久歸零就不會掉 */
  helmet?: { id: string; dur: number } | null;
}

/** 屍體的內容：他的武器（帶著剩餘彈匣）、護甲（帶著剩餘耐久）、備彈、額外掉落，加上 corpse 通用戰利品表 */
export function buildCorpseLoot(src: CorpseSource, era: string, rng: Rng = Math.random): ItemStack[] {
  const out: ItemStack[] = [];
  out.push({ id: src.weaponId, qty: 1, dur: src.mag });
  if (src.def.armorId && src.armorDur > 0 && rng() < src.def.armorDrop && ARMOR_STATS[src.def.armorId]) {
    out.push({ id: src.def.armorId, qty: 1, dur: Math.max(1, Math.round(src.armorDur)) });
  }
  const hd = src.def.helmet;
  if (hd && src.helmet && src.helmet.dur > 0 && HELMET_STATS[src.helmet.id] && rng() < hd.drop) {
    out.push({ id: src.helmet.id, qty: 1, dur: Math.max(1, Math.round(src.helmet.dur)) });
  }
  let ammo = src.reserve;
  const max = getItem(src.ammoType)?.maxStack ?? 60;
  while (ammo > 0) {
    const n = Math.min(ammo, max);
    out.push({ id: src.ammoType, qty: n });
    ammo -= n;
  }
  for (const [id, chance, [lo, hi]] of src.def.extraLoot) {
    if (rng() < chance && getItem(id)) {
      const item = getItem(id)!;
      out.push({ id, qty: Math.min(item.maxStack, lo + Math.floor(rng() * (hi - lo + 1))) });
    }
  }
  out.push(...rollContainer(era, 'corpse', rng));
  return out;
}
