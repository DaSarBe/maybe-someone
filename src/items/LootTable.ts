import { getItem } from '../data/items';
import { LOOT_TABLES, type ContainerType } from '../data/lootTables';
import type { ItemStack } from './Inventory';

export type Rng = () => number;

/** 可重現的亂數（測試與每日價格用） */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 依時代與容器類型擲出內容。同一個容器不會出現重複的物品種類。 */
export function rollContainer(era: string, type: ContainerType, rng: Rng = Math.random): ItemStack[] {
  const def = LOOT_TABLES[era]?.containers[type];
  if (!def) return [];
  const [lo, hi] = def.count;
  const want = lo + Math.floor(rng() * (hi - lo + 1));
  const pool = def.pool
    .map((e) => {
      const item = getItem(e.id);
      return item ? { e, w: e.weight * def.rarityWeights[item.rarity] } : null;
    })
    .filter((x): x is { e: (typeof def.pool)[number]; w: number } => !!x && x.w > 0);
  const out: ItemStack[] = [];
  for (let n = 0; n < want && pool.length > 0; n++) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = rng() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].w;
      if (r <= 0) break;
    }
    const { e } = pool.splice(idx, 1)[0];
    const item = getItem(e.id)!;
    const [qa, qb] = e.qty ?? [1, 1];
    const qty = Math.min(item.maxStack, qa + Math.floor(rng() * (qb - qa + 1)));
    const stack: ItemStack = { id: e.id, qty };
    out.push(stack);
  }
  return out;
}
