import { describe, expect, it } from 'vitest';
import { DEFAULT_ERA } from '../src/data/eras';
import { NOISE_RANGE, QUIET_SEARCH_LOUDNESS, noiseRange, searchLoudness } from '../src/data/noise';
import { ARMOR_EQUIP_SECONDS, CONTAINER_OPEN_SECONDS, QUIET_TIME_MULT, REVEAL_SECONDS, revealSeconds } from '../src/data/search';
import { UPGRADES } from '../src/data/upgrades';
import type { EconomyService } from '../src/economy/EconomyService';
import { compareGear } from '../src/items/GearCompare';
import type { Slot } from '../src/items/Inventory';
import { autoPickupFromLoot } from '../src/items/LootActions';
import { LootSearch } from '../src/items/LootSearch';
import { defaultControls, migrateControls } from '../src/settings/ControlSettings';
import { makeEconomy } from './helpers';

// 測試專用：直接設定存檔內容
const P = (eco: EconomyService) => (eco as unknown as { p: import('../src/items/Profile').Profile }).p;

function raidEco() {
  const { eco } = makeEconomy();
  expect(eco.startRaid(DEFAULT_ERA).ok).toBe(true);
  return eco;
}
const OPTS = { ammo: true, chronite: true };

describe('reveal time', () => {
  it('follows rarity: 0.6 / 0.9 / 1.4 / 2.0 / 2.8 seconds', () => {
    expect(REVEAL_SECONDS).toEqual({ common: 0.6, uncommon: 0.9, rare: 1.4, epic: 2.0, legendary: 2.8 });
    expect(revealSeconds('bandage')).toBeCloseTo(0.6);   // common
    expect(revealSeconds('medkit')).toBeCloseTo(0.9);    // uncommon
    expect(revealSeconds('rifle')).toBeCloseTo(1.4);     // rare
    expect(revealSeconds('armor_4')).toBeCloseTo(2.0);   // epic
    expect(revealSeconds('diamond')).toBeCloseTo(2.8);   // legendary
  });
  it('is multiplied by the search upgrade scale', () => {
    const search = UPGRADES.find((u) => u.id === 'search')!;
    for (const lv of search.levels) expect(revealSeconds('rifle', lv.value)).toBeCloseTo(1.4 * lv.value);
    const { eco } = makeEconomy();
    P(eco).upgrades.search = 2;
    expect(revealSeconds('rifle', eco.searchScale())).toBeCloseTo(1.4 * 0.7);
  });
  it('quiet search is 1.6x slower', () => {
    expect(QUIET_TIME_MULT).toBe(1.6);
    expect(revealSeconds('bandage', 1, true)).toBeCloseTo(0.96);
    expect(revealSeconds('rifle', 0.7, true)).toBeCloseTo(1.4 * 0.7 * 1.6);
  });
  it('has the agreed delays', () => {
    expect(CONTAINER_OPEN_SECONDS).toBe(0.5);
    expect(ARMOR_EQUIP_SECONDS).toBe(1.5);
  });
});

describe('LootSearch: one by one, progress kept', () => {
  const mk = (): Slot[] => [{ id: 'bandage', qty: 1 }, { id: 'rifle', qty: 1 }, { id: 'diamond', qty: 1 }];
  const o = { scale: 1, quiet: false };

  it('reveals items in order with the rarity times', () => {
    const s = new LootSearch(mk());
    expect(s.advance(0.5, o)).toEqual([]);
    expect(s.advance(0.2, o)).toEqual([0]);            // 0.6s
    expect(s.advance(1.2, o)).toEqual([]);
    expect(s.advance(0.2, o)).toEqual([1]);            // 0.1 + 1.3 < 1.4 <= 0.1 + 1.5
    expect(s.finished).toBe(false);
    expect(s.advance(2.8, o)).toEqual([2]);
    expect(s.finished).toBe(true);
    expect(s.advance(5, o)).toEqual([]);
  });
  it('can reveal several in one big step, carrying leftover time', () => {
    const s = new LootSearch(mk());
    expect(s.advance(2.1, o)).toEqual([0, 1]);
    expect(s.progress).toBeCloseTo(0.1 / 2.8);
  });
  it('keeps progress when the panel is closed (state lives on the container) and resumes', () => {
    const loot = mk();
    const s = new LootSearch(loot);
    s.advance(1.0, o);                                 // item 0 revealed, item 1 at 0.4/1.4
    expect(s.done).toBe(1);
    expect(s.revealedIndices()).toEqual([0]);
    // 「關閉面板」= 不再呼叫 advance；再打開時從同一個物件繼續
    expect(s.current).toBe(1);
    expect(s.progress).toBeCloseTo(0.4 / 1.4);
    expect(s.advance(1.0, o)).toEqual([1]);
    expect(s.done).toBe(2);
  });
  it('quiet search slows the current item proportionally (progress is a fraction)', () => {
    const s = new LootSearch([{ id: 'rifle', qty: 1 }]);
    s.advance(0.7, o);                                 // 50%
    expect(s.progress).toBeCloseTo(0.5);
    expect(s.advance(0.7, { scale: 1, quiet: true })).toEqual([]); // 剩 0.5 × 2.24 = 1.12s
    expect(s.advance(0.5, { scale: 1, quiet: true })).toEqual([0]);
  });
  it('taken items stay revealed; empty and exhausted states', () => {
    const loot = mk();
    const s = new LootSearch(loot);
    s.advance(10, o);
    expect(s.exhausted).toBe(false);
    loot[0] = null; loot[1] = null;
    expect(s.revealedIndices()).toEqual([2]);
    loot[2] = null;
    expect(s.exhausted).toBe(true);
    // 沒揭露完不算搜空
    const t = new LootSearch([null, { id: 'bandage', qty: 1 }]);
    expect(t.exhausted).toBe(false);
    t.advance(1, o);
    expect(t.revealedIndices()).toEqual([1]);
  });
});

describe('quiet search noise', () => {
  it('search range is 12m normally and 6m when quiet, via the same noiseRange rule', () => {
    expect(NOISE_RANGE.search).toBe(12);
    expect(QUIET_SEARCH_LOUDNESS).toBe(0.5);
    expect(noiseRange({ kind: 'search', loudness: searchLoudness(false) })).toBe(12);
    expect(noiseRange({ kind: 'search', loudness: searchLoudness(true) })).toBe(6);
  });
});

describe('equipFromContainer', () => {
  it('equips into an empty slot (primary) and clears the container cell', () => {
    const eco = raidEco();
    const loot: Slot[] = [{ id: 'rifle', qty: 1, dur: 17 }, { id: 'bandage', qty: 2 }];
    const r = eco.equipFromContainer(loot, 0);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.slot).toBe('primary'); expect(r.replaced).toBeNull(); }
    expect(loot[0]).toBeNull();
    expect(loot[1]).toEqual({ id: 'bandage', qty: 2 });
    expect(eco.profile.equipment.primary).toEqual({ id: 'rifle', qty: 1, dur: 17 }); // 彈匣子彈數跟著走
  });
  it('picks the slot by weapon type: pistol -> secondary', () => {
    const eco = raidEco();
    P(eco).equipment.secondary = null;
    const loot: Slot[] = [{ id: 'pistol', qty: 1, dur: 5 }];
    const r = eco.equipFromContainer(loot, 0);
    expect(r.ok && r.slot).toBe('secondary');
    expect(eco.profile.equipment.secondary).toEqual({ id: 'pistol', qty: 1, dur: 5 });
  });
  it('swaps the old gear back into the container (default), durability follows', () => {
    const eco = raidEco();
    P(eco).equipment.armor = { id: 'armor_1', qty: 1, dur: 23 };
    const loot: Slot[] = [{ id: 'armor_3', qty: 1, dur: 61 }];
    const r = eco.equipFromContainer(loot, 0);
    expect(r.ok && r.replacedTo).toBe('container');
    expect(eco.profile.equipment.armor).toEqual({ id: 'armor_3', qty: 1, dur: 61 });
    expect(loot[0]).toEqual({ id: 'armor_1', qty: 1, dur: 23 });
  });
  it('swaps the old gear into the backpack when asked; magazine rounds follow the weapon', () => {
    const eco = raidEco();
    P(eco).equipment.primary = { id: 'smg', qty: 1, dur: 9 };
    const loot: Slot[] = [{ id: 'rifle', qty: 1, dur: 30 }];
    const r = eco.equipFromContainer(loot, 0, { dest: 'carried' });
    expect(r.ok && r.replacedTo).toBe('carried');
    expect(loot[0]).toBeNull();
    expect(eco.view('carried').slots.find((s) => s?.id === 'smg')).toEqual({ id: 'smg', qty: 1, dur: 9 });
    expect(eco.profile.equipment.primary).toEqual({ id: 'rifle', qty: 1, dur: 30 });
  });
  it('refuses to put the old gear in a full backpack and changes nothing', () => {
    const eco = raidEco();
    P(eco).equipment.primary = { id: 'smg', qty: 1, dur: 9 };
    P(eco).carried = Array.from({ length: 8 }, () => ({ id: 'scrap_metal', qty: 1 }));
    const loot: Slot[] = [{ id: 'rifle', qty: 1, dur: 30 }];
    const before = JSON.stringify([eco.profile.equipment, eco.profile.carried, loot]);
    const r = eco.equipFromContainer(loot, 0, { dest: 'carried' });
    expect(r.ok).toBe(false);
    expect(JSON.stringify([eco.profile.equipment, eco.profile.carried, loot])).toBe(before);
    // 預設放回容器仍然可以
    expect(eco.equipFromContainer(loot, 0).ok).toBe(true);
  });
  it('dry run validates without changing anything', () => {
    const eco = raidEco();
    const loot: Slot[] = [{ id: 'rifle', qty: 1, dur: 30 }];
    const r = eco.equipFromContainer(loot, 0, { dryRun: true });
    expect(r.ok).toBe(true);
    expect(loot[0]).not.toBeNull();
    expect(eco.profile.equipment.primary).toBeNull();
  });
  it('swapping backpacks moves the contents into the new one', () => {
    const eco = raidEco();
    P(eco).carried[0] = { id: 'bandage', qty: 3 };
    P(eco).carried[5] = { id: 'ammo_pistol', qty: 40 };
    const loot: Slot[] = [{ id: 'bag_medium', qty: 1 }];
    const r = eco.equipFromContainer(loot, 0);
    expect(r.ok).toBe(true);
    expect(eco.profile.equipment.backpack?.id).toBe('bag_medium');
    expect(eco.view('carried').capacity).toBe(14);
    expect(eco.view('carried').count('bandage')).toBe(3);
    expect(eco.view('carried').count('ammo_pistol')).toBe(40);
    expect(loot[0]?.id).toBe('bag_small'); // 舊背包放回容器
  });
  it('refuses a backpack swap when the contents do not fit, nothing is lost', () => {
    const eco = raidEco();
    // 先換成大背包、放 9 件不可堆疊的東西，再試著換 8 格的小背包
    P(eco).equipment.backpack = { id: 'bag_large', qty: 1 };
    P(eco).carried = ['pocket_watch', 'qing_bowl', 'brick_phone', 'rice_cooker', 'pistol', 'smg', 'armor_1', 'armor_2', 'rifle']
      .map((id) => ({ id, qty: 1 }));
    const loot: Slot[] = [{ id: 'bag_small', qty: 1 }];
    const before = JSON.stringify([eco.profile.equipment, eco.profile.carried, loot]);
    const r = eco.equipFromContainer(loot, 0);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain('新背包');
    expect(JSON.stringify([eco.profile.equipment, eco.profile.carried, loot])).toBe(before);
  });
  it('refuses a backpack swap that exceeds the new weight limit', () => {
    const eco = raidEco();
    P(eco).equipment.backpack = { id: 'bag_large', qty: 1 };           // 35kg
    P(eco).carried = [{ id: 'rice_cooker', qty: 1 }, { id: 'rice_cooker', qty: 1 }, { id: 'rice_cooker', qty: 1 }, { id: 'rice_cooker', qty: 1 }, { id: 'scrap_metal', qty: 8 }];
    const loot: Slot[] = [{ id: 'bag_small', qty: 1 }];                 // 15kg、8 格：格數夠，但太重
    const r = eco.equipFromContainer(loot, 0);
    expect(r.ok).toBe(false);
    expect(eco.profile.equipment.backpack?.id).toBe('bag_large');
  });
  it('rejects non-equippable items, empty cells and use outside a raid', () => {
    const eco = raidEco();
    expect(eco.equipFromContainer([{ id: 'bandage', qty: 1 }], 0).ok).toBe(false);
    expect(eco.equipFromContainer([null], 0).ok).toBe(false);
    const { eco: hub } = makeEconomy();
    expect(hub.equipFromContainer([{ id: 'rifle', qty: 1 }], 0).ok).toBe(false);
  });
});

describe('auto pickup', () => {
  it('takes only the ammo of the currently equipped weapons', () => {
    const eco = raidEco();           // 預設：副武器 pistol（9mm）
    P(eco).equipment.primary = { id: 'rifle', qty: 1, dur: 30 };
    const loot: Slot[] = [
      { id: 'ammo_rifle', qty: 30 }, { id: 'ammo_pistol', qty: 12 }, { id: 'ammo_shotgun', qty: 8 }, { id: 'bandage', qty: 1 },
    ];
    expect(autoPickupFromLoot(eco, loot, 0, OPTS)).toMatchObject({ wanted: true, taken: 30, blocked: false });
    expect(autoPickupFromLoot(eco, loot, 1, OPTS)).toMatchObject({ wanted: true, taken: 12 });
    expect(autoPickupFromLoot(eco, loot, 2, OPTS)).toMatchObject({ wanted: false, taken: 0 });
    expect(autoPickupFromLoot(eco, loot, 3, OPTS)).toMatchObject({ wanted: false, taken: 0 });
    expect(loot[0]).toBeNull();
    expect(loot[1]).toBeNull();
    expect(loot[2]).toEqual({ id: 'ammo_shotgun', qty: 8 });
    expect(loot[3]).toEqual({ id: 'bandage', qty: 1 });
    expect(eco.countCarried('ammo_rifle')).toBe(30);
    expect(eco.countCarried('ammo_shotgun')).toBe(0);
  });
  it('does not take ammo for a weapon that is not equipped', () => {
    const eco = raidEco();
    const loot: Slot[] = [{ id: 'ammo_rifle', qty: 30 }];
    expect(autoPickupFromLoot(eco, loot, 0, OPTS)?.wanted).toBe(false);
    expect(loot[0]).not.toBeNull();
  });
  it('takes chronite of every grade', () => {
    const eco = raidEco();
    const loot: Slot[] = [{ id: 'chronite_shard', qty: 2 }, { id: 'chronite', qty: 1 }, { id: 'chronite_pure', qty: 1 }];
    for (let i = 0; i < 3; i++) expect(autoPickupFromLoot(eco, loot, i, OPTS)?.taken).toBeGreaterThan(0);
    expect(loot.every((s) => s === null)).toBe(true);
    expect(eco.countCarried('chronite_pure')).toBe(1);
  });
  it('respects the two switches independently', () => {
    const eco = raidEco();
    const loot: Slot[] = [{ id: 'ammo_pistol', qty: 10 }, { id: 'chronite', qty: 1 }];
    expect(autoPickupFromLoot(eco, loot, 0, { ammo: false, chronite: true })?.wanted).toBe(false);
    expect(autoPickupFromLoot(eco, loot, 1, { ammo: true, chronite: false })?.wanted).toBe(false);
    expect(autoPickupFromLoot(eco, loot, 1, { ammo: false, chronite: true })?.taken).toBe(1);
  });
  it('leaves it in the container when the backpack is full', () => {
    const eco = raidEco();
    P(eco).carried = Array.from({ length: 8 }, () => ({ id: 'vhs', qty: 1 }));
    const loot: Slot[] = [{ id: 'ammo_pistol', qty: 10 }, { id: 'chronite', qty: 1 }];
    expect(autoPickupFromLoot(eco, loot, 0, OPTS)).toMatchObject({ wanted: true, taken: 0, blocked: true });
    expect(autoPickupFromLoot(eco, loot, 1, OPTS)).toMatchObject({ blocked: true });
    expect(loot[0]).toEqual({ id: 'ammo_pistol', qty: 10 });
    expect(loot[1]).toEqual({ id: 'chronite', qty: 1 });
  });
  it('is a no-op outside a raid', () => {
    const { eco } = makeEconomy();
    expect(eco.autoPickup({ id: 'chronite', qty: 1 }, OPTS).ok).toBe(false);
  });
});

describe('gear comparison', () => {
  it('armor: tier and durability with direction', () => {
    const rows = compareGear({ id: 'armor_3', qty: 1, dur: 60 }, { id: 'armor_2', qty: 1, dur: 40 });
    expect(rows.find((r) => r.label === '等級')).toMatchObject({ from: '2', to: '3', dir: 'up' });
    expect(rows.find((r) => r.label === '耐久')).toMatchObject({ from: '40', to: '60', dir: 'up' });
    const down = compareGear({ id: 'armor_1', qty: 1 }, { id: 'armor_2', qty: 1 });
    expect(down.find((r) => r.label === '等級')?.dir).toBe('down');
  });
  it('weapon: damage, fire rate, magazine; backpack: slots', () => {
    const w = compareGear({ id: 'rifle', qty: 1 }, { id: 'pistol', qty: 1 });
    expect(w.find((r) => r.label === '傷害')).toMatchObject({ from: '24', to: '36', dir: 'up' });
    expect(w.find((r) => r.label === '射速')?.dir).toBe('up');
    expect(w.find((r) => r.label === '彈匣')).toMatchObject({ from: '12', to: '30', dir: 'up' });
    const b = compareGear({ id: 'bag_small', qty: 1 }, { id: 'bag_medium', qty: 1 });
    expect(b.find((r) => r.label === '格數')).toMatchObject({ from: '14', to: '8', dir: 'down' });
  });
  it('empty slot: only the new values, no direction', () => {
    const rows = compareGear({ id: 'rifle', qty: 1 }, null);
    expect(rows.every((r) => r.from === null && r.dir === 'same')).toBe(true);
  });
});

describe('control settings for search', () => {
  it('defaults: quiet off, both auto-pickups on; migrates and remembers', () => {
    const d = defaultControls(true);
    expect(d.quietSearch).toBe(false);
    expect(d.autoPickupAmmo).toBe(true);
    expect(d.autoPickupChronite).toBe(true);
    expect(migrateControls({}, true).autoPickupAmmo).toBe(true);
    expect(migrateControls({ quietSearch: true, autoPickupAmmo: false }, true)).toMatchObject({ quietSearch: true, autoPickupAmmo: false, autoPickupChronite: true });
    expect(migrateControls({ quietSearch: 'x' }, true).quietSearch).toBe(false);
  });
});
