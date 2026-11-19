import { describe, expect, it } from 'vitest';
import { LOOT_TABLES, type ContainerType } from '../src/data/lootTables';
import { ITEMS } from '../src/data/items';
import { mulberry32, rollContainer } from '../src/items/LootTable';
import { sellPrice } from '../src/economy/Pricing';

const TYPES = Object.keys(LOOT_TABLES.harbor_1990.containers) as ContainerType[];

describe('loot rolling', () => {
  it('respects item counts, stack limits and uniqueness', () => {
    const rng = mulberry32(42);
    for (const t of TYPES) {
      const def = LOOT_TABLES.harbor_1990.containers[t];
      for (let i = 0; i < 200; i++) {
        const loot = rollContainer('harbor_1990', t, rng);
        expect(loot.length).toBeGreaterThanOrEqual(def.count[0]);
        expect(loot.length).toBeLessThanOrEqual(def.count[1]);
        expect(new Set(loot.map((s) => s.id)).size).toBe(loot.length);
        for (const s of loot) { expect(s.qty).toBeGreaterThan(0); expect(s.qty).toBeLessThanOrEqual(ITEMS[s.id].maxStack); }
      }
    }
  });
  it('is deterministic with a seeded rng and returns [] for unknown eras', () => {
    expect(rollContainer('harbor_1990', 'safe', mulberry32(7))).toEqual(rollContainer('harbor_1990', 'safe', mulberry32(7)));
    expect(rollContainer('nope', 'safe')).toEqual([]);
  });
  it('safes are worth much more than crates', () => {
    const avg = (t: ContainerType) => {
      const rng = mulberry32(1);
      let sum = 0;
      for (let i = 0; i < 2000; i++) for (const s of rollContainer('harbor_1990', t, rng)) sum += sellPrice(s.id, '2026-06-15') * s.qty;
      return sum / 2000;
    };
    expect(avg('safe')).toBeGreaterThan(avg('crate') * 2);
  });
  it('economy sim: a typical raid (10 containers) is worth a sensible amount', () => {
    const rng = mulberry32(2026);
    const mix: ContainerType[] = ['crate', 'crate', 'crate', 'crate', 'toolbox', 'toolbox', 'cabinet', 'cabinet', 'corpse', 'safe'];
    const totals: number[] = [];
    for (let run = 0; run < 500; run++) {
      let v = 0;
      for (const t of mix) for (const s of rollContainer('harbor_1990', t, rng)) v += sellPrice(s.id, '2026-06-15') * s.qty;
      totals.push(v);
    }
    totals.sort((a, b) => a - b);
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    console.log(`[sim] full-clear raid value: mean ${Math.round(mean)}, p10 ${totals[50]}, median ${totals[250]}, p90 ${totals[450]}`);
    expect(mean).toBeGreaterThan(5000);
    expect(mean).toBeLessThan(25000);
  });
});
