import { describe, expect, it } from 'vitest';
import { ITEM_LIST, ITEMS, CATEGORY_NAMES, SHOP_CATEGORIES } from '../src/data/items';
import { LOOT_TABLES } from '../src/data/lootTables';
import { UPGRADES } from '../src/data/upgrades';
import { WEAPON_STATS } from '../src/data/weapons';
import { buyPrice, dailyFactor, sellPrice } from '../src/economy/Pricing';
import { EconomyService } from '../src/economy/EconomyService';
import { canSprintAtWeight, weightSpeedFactor, WORN_WEIGHT_FACTOR } from '../src/items/Inventory';
import { PROFILE_KEY, PROFILE_VERSION, migrateProfile, createDefaultProfile } from '../src/items/Profile';
import { MemorySave, NOON, giveCredits, makeEconomy } from './helpers';

const DAY = '2026-06-15';

describe('data integrity', () => {
  it('has at least 35 items covering every category, with unique ids', () => {
    expect(ITEM_LIST.length).toBeGreaterThanOrEqual(35);
    expect(new Set(ITEM_LIST.map((i) => i.id)).size).toBe(ITEM_LIST.length);
    for (const cat of Object.keys(CATEGORY_NAMES)) expect(ITEM_LIST.some((i) => i.category === cat), cat).toBe(true);
  });
  it('loot tables, weapons and shop only reference real items', () => {
    for (const era of Object.values(LOOT_TABLES))
      for (const c of Object.values(era.containers)) for (const e of c.pool) expect(ITEMS[e.id], e.id).toBeTruthy();
    for (const [id, w] of Object.entries(WEAPON_STATS)) { expect(ITEMS[id]).toBeTruthy(); expect(ITEMS[w.ammoType]).toBeTruthy(); }
  });
  it('future goods are cheaper to sell in the future than to buy (no hub arbitrage)', () => {
    for (const it of ITEM_LIST.filter((i) => SHOP_CATEGORIES.includes(i.category))) {
      for (const day of ['2026-01-01', DAY, '2027-03-09']) expect(sellPrice(it.id, day)).toBeLessThan(buyPrice(it.id, day));
    }
  });
  it('upgrades have 3-5 levels with rising prices', () => {
    for (const u of UPGRADES) {
      expect(u.levels.length).toBeGreaterThanOrEqual(3);
      expect(u.levels.length).toBeLessThanOrEqual(5);
      u.levels.forEach((l, i) => i > 0 && expect(l.cost).toBeGreaterThan(u.levels[i - 1].cost));
    }
  });
});

describe('pricing', () => {
  it('is stable within a day, varies within +-10%', () => {
    expect(sellPrice('rifle', DAY)).toBe(sellPrice('rifle', DAY));
    for (const it of ITEM_LIST) {
      for (const d of ['2026-01-01', '2026-01-02', '2026-06-15']) {
        const f = dailyFactor(it.id, d);
        expect(f).toBeGreaterThanOrEqual(0.9);
        expect(f).toBeLessThanOrEqual(1.1);
      }
    }
  });
  it('buy price is about 1.4x the sell price', () => {
    const r = buyPrice('rifle', DAY) / sellPrice('rifle', DAY);
    expect(r).toBeGreaterThan(1.39);
    expect(r).toBeLessThan(1.41);
  });
});

describe('EconomyService: shop', () => {
  it('buys into the stash and deducts credits', () => {
    const { eco } = makeEconomy();
    const before = eco.credits;
    const r = eco.buy('smg', 1);
    expect(r.ok).toBe(true);
    expect(eco.credits).toBe(before - buyPrice('smg', DAY));
    expect(eco.view('stash').count('smg')).toBe(1);
  });
  it('rejects when credits are short and leaves the save untouched', () => {
    const { eco, save } = makeEconomy();
    const snapshot = save.data.get(PROFILE_KEY);
    const r = eco.buy('armor_4', 3);
    expect(r).toMatchObject({ ok: false, code: 'no_credits', reason: '信用點不足' });
    expect(save.data.get(PROFILE_KEY)).toBe(snapshot);
  });
  it('rejects when the stash is full', () => {
    const { eco } = makeEconomy();
    giveCredits(eco, 1_000_000);
    for (let i = 0; i < 50; i++) { const r = eco.buy('pistol', 1); if (!r.ok) { expect(r.code).toBe('full'); return; } }
    throw new Error('stash never filled');
  });
  it('rejects unknown items, bad quantities, and items the shop does not sell', () => {
    const { eco } = makeEconomy();
    expect(eco.buy('nope', 1)).toMatchObject({ ok: false, code: 'invalid' });
    expect(eco.buy('pistol', 0)).toMatchObject({ ok: false, code: 'invalid' });
    expect(eco.buy('qing_bowl', 1)).toMatchObject({ ok: false, code: 'not_for_sale' });
  });
  it('sells part of a stack at the daily price', () => {
    const { eco } = makeEconomy();
    const before = eco.credits;
    const r = eco.sell({ c: 'stash', i: 0 }, 20); // ammo_pistol x60 at start
    expect(r).toMatchObject({ ok: true, gain: sellPrice('ammo_pistol', DAY) * 20 });
    expect(eco.credits).toBe(before + sellPrice('ammo_pistol', DAY) * 20);
    expect(eco.view('stash').slots[0]?.qty).toBe(40);
    expect(eco.sell({ c: 'stash', i: 0 }, 99).ok).toBe(false);
    expect(eco.sell({ c: 'stash', i: 30 }).ok).toBe(false);
  });
  it('buying then selling the same item always loses money', () => {
    const { eco } = makeEconomy();
    const c0 = eco.credits;
    eco.buy('energy_cell', 1);
    eco.sell({ c: 'stash', i: eco.view('stash').slots.findIndex((s) => s?.id === 'energy_cell') });
    expect(eco.credits).toBeLessThan(c0);
  });
});

describe('EconomyService: moving, equipping, weight', () => {
  it('moves stash -> carried with partial quantity and merges', () => {
    const { eco } = makeEconomy();
    expect(eco.moveItem({ c: 'stash', i: 0 }, { c: 'carried' }, 30)).toMatchObject({ ok: true, moved: 30 });
    expect(eco.view('carried').count('ammo_pistol')).toBe(30);
    expect(eco.view('stash').count('ammo_pistol')).toBe(30);
    eco.moveItem({ c: 'stash', i: 0 }, { c: 'carried' });
    expect(eco.view('carried').slots.filter(Boolean).length).toBe(1);
    expect(eco.view('carried').count('ammo_pistol')).toBe(60);
  });
  it('reports a full backpack', () => {
    const { eco } = makeEconomy();
    giveCredits(eco, 10000);
    for (let i = 0; i < 9; i++) eco.buy('pistol', 1);
    let last: ReturnType<typeof eco.moveItem> = { ok: true, moved: 0 };
    for (let n = 0; n < 9; n++) last = eco.moveItem({ c: 'stash', i: eco.view('stash').slots.findIndex((s) => s?.id === 'pistol') }, { c: 'carried' });
    expect(eco.view('carried').used).toBe(8);
    expect(last).toMatchObject({ ok: false, code: 'full' });
  });
  it('blocks moves that would exceed the weight hard cap', () => {
    const { eco } = makeEconomy();
    // small bag: 15kg. rice cookers are 3.2kg each; equipment (pistol 1 + bag 0.8) counts too
    const s = (eco as unknown as { p: { stash: unknown[] } }).p.stash;
    s[5] = { id: 'rice_cooker', qty: 1 }; s[6] = { id: 'rice_cooker', qty: 1 }; s[7] = { id: 'rice_cooker', qty: 1 };
    s[8] = { id: 'rice_cooker', qty: 1 }; s[9] = { id: 'rice_cooker', qty: 1 }; s[10] = { id: 'rice_cooker', qty: 1 };
    const results = [5, 6, 7, 8, 9, 10].map((i) => eco.moveItem({ c: 'stash', i }, { c: 'carried' }));
    const fails = results.filter((r) => !r.ok);
    expect(fails.length).toBeGreaterThan(0);
    expect(fails[0]).toMatchObject({ code: 'overweight' });
    expect(eco.getWeightRatio()).toBeGreaterThan(1);
    expect(eco.getWeightRatio()).toBeLessThanOrEqual(1.25);
  });
  it('splits stacks through the service', () => {
    const { eco } = makeEconomy();
    expect(eco.splitStack({ c: 'stash', i: 0 }, 10)).toMatchObject({ ok: true });
    expect(eco.view('stash').slots[0]?.qty).toBe(50);
    expect(eco.view('stash').slots.some((s, i) => i > 1 && s?.qty === 10)).toBe(true);
    expect(eco.splitStack({ c: 'stash', i: 0 }, 50).ok).toBe(false);
  });
  it('equips with swap, and unequips back to the stash', () => {
    const { eco } = makeEconomy();
    giveCredits(eco, 10000);
    eco.buy('rifle', 1);
    const idx = eco.view('stash').slots.findIndex((s) => s?.id === 'rifle');
    expect(eco.equip({ c: 'stash', i: idx })).toMatchObject({ ok: true });
    expect(eco.profile.equipment.primary?.id).toBe('rifle');
    expect(eco.equip({ c: 'stash', i: 0 }).ok).toBe(false); // ammo is not equippable
    expect(eco.unequip('primary')).toMatchObject({ ok: true });
    expect(eco.profile.equipment.primary).toBeNull();
    expect(eco.view('stash').count('rifle')).toBe(1);
    // a pistol cannot go into the primary slot
    expect(eco.equip({ c: 'stash', i: 0 }, 'primary').ok).toBe(false);
  });
  it('swapping the backpack resizes the carried inventory and refuses if items would not fit', () => {
    const { eco } = makeEconomy();
    giveCredits(eco, 100000);
    eco.buy('bag_medium', 1);
    const idx = eco.view('stash').slots.findIndex((s) => s?.id === 'bag_medium');
    expect(eco.equip({ c: 'stash', i: idx })).toMatchObject({ ok: true });
    expect(eco.view('carried').capacity).toBe(14);
    expect(eco.view('stash').count('bag_small')).toBe(1);
    // fill with 10 distinct stacks then try to go back to the small (8 slot) bag
    for (let i = 0; i < 10; i++) eco.buy('pistol', 1);
    for (let i = 0; i < 10; i++) eco.moveItem({ c: 'stash', i: eco.view('stash').slots.findIndex((s) => s?.id === 'pistol') }, { c: 'carried' });
    const small = eco.view('stash').slots.findIndex((s) => s?.id === 'bag_small');
    expect(eco.equip({ c: 'stash', i: small })).toMatchObject({ ok: false, code: 'full' });
    expect(eco.profile.equipment.backpack?.id).toBe('bag_medium');
  });
});

describe('EconomyService: upgrades', () => {
  it('upgrades in order, charges credits, and grows the stash', () => {
    const { eco } = makeEconomy();
    const cost = eco.upgradeCost('stash')!;
    const before = eco.credits;
    expect(eco.upgrade('stash')).toMatchObject({ ok: true, level: 1 });
    expect(eco.credits).toBe(before - cost);
    expect(eco.view('stash').capacity).toBe(50);
    expect(eco.view('stash').slots.length).toBe(50);
  });
  it('fails without credits and at max level', () => {
    const { eco } = makeEconomy();
    (eco as unknown as { p: { credits: number } }).p.credits = 100;
    expect(eco.upgrade('secure')).toMatchObject({ ok: false, code: 'no_credits' });
    (eco as unknown as { p: { credits: number } }).p.credits = 10_000_000;
    for (let i = 0; i < 3; i++) expect(eco.upgrade('secure').ok).toBe(true);
    expect(eco.upgrade('secure')).toMatchObject({ ok: false, code: 'max_level' });
    expect(eco.view('secure').capacity).toBe(4);
  });
  it('stabilizer extends the raid time', () => {
    const { eco } = makeEconomy();
    expect(eco.raidDurationSec()).toBe(300);
    (eco as unknown as { p: { credits: number } }).p.credits = 100000;
    eco.upgrade('stabilizer');
    expect(eco.raidDurationSec()).toBe(345);
  });
});

describe('weight: worn gear counts half, fitness upgrade', () => {
  const setup = (equip: Record<string, unknown>) => {
    const { eco } = makeEconomy();
    const p = (eco as unknown as { p: { equipment: Record<string, unknown>; carried: unknown[] } }).p;
    Object.assign(p.equipment, equip);
    p.carried.length = 0;
    return { eco, p };
  };
  it('worn weapons (with mods), armor, helmet and backpack count x0.5', () => {
    const mods = { sight: 'att_reddot', muzzle: 'att_suppressor', grip: 'att_grip' };
    const { eco, p } = setup({ primary: { id: 'rifle', qty: 1, mods }, armor: { id: 'armor_3', qty: 1 }, helmet: { id: 'helmet_3', qty: 1 } });
    const full = ['rifle', 'att_reddot', 'att_suppressor', 'att_grip', 'pistol', 'armor_3', 'helmet_3', 'bag_small'].reduce((n, id) => n + ITEMS[id].weight, 0);
    expect(WORN_WEIGHT_FACTOR).toBe(0.5);
    expect(eco.carryInfo().weight).toBeCloseTo(full / 2, 5);
    // items in the bag keep full weight
    p.carried.push({ id: 'rifle', qty: 1 });
    expect(eco.carryInfo().weight).toBeCloseTo(full / 2 + ITEMS.rifle.weight, 5);
  });
  it('sample loadout (small bag, rifle + 3 mods, pistol, armor III, helmet III, ~1.5kg supplies) is ~50% and sprintable', () => {
    const mods = { sight: 'att_reddot', muzzle: 'att_suppressor', grip: 'att_grip' };
    const { eco, p } = setup({ primary: { id: 'rifle', qty: 1, mods }, armor: { id: 'armor_3', qty: 1 }, helmet: { id: 'helmet_3', qty: 1 } });
    p.carried.push({ id: 'ammo_rifle', qty: 30 }, { id: 'ammo_pistol', qty: 30 }, { id: 'bandage', qty: 3 }); // 0.9 + 0.6 + 0.3 = 1.8
    const r = eco.getWeightRatio();
    expect(r).toBeGreaterThan(0.45);
    expect(r).toBeLessThan(0.6);
    expect(weightSpeedFactor(r)).toBe(1);
    expect(canSprintAtWeight(r)).toBe(true);
  });
  it('fitness upgrade adds 3 kg per level (max +15) to the carry limit', () => {
    const { eco } = makeEconomy();
    giveCredits(eco, 200000);
    expect(eco.carryInfo().max).toBe(15);
    const costs: number[] = [];
    for (let i = 1; i <= 5; i++) {
      costs.push(eco.upgradeCost('fitness')!);
      expect(eco.upgrade('fitness')).toMatchObject({ ok: true, level: i });
      expect(eco.carryInfo().max).toBe(15 + 3 * i);
    }
    expect(costs).toEqual([3000, 7500, 15000, 28000, 48000]);
    expect(eco.upgrade('fitness')).toMatchObject({ ok: false, code: 'max_level' });
    expect(eco.upgradeCost('fitness')).toBeNull();
  });
  it('fitness bonus also applies to pockets (no backpack)', () => {
    const { eco } = makeEconomy();
    (eco as unknown as { p: { equipment: { backpack: unknown } } }).p.equipment.backpack = null;
    giveCredits(eco, 10000);
    expect(eco.carryInfo().max).toBe(10);
    eco.upgrade('fitness');
    expect(eco.carryInfo().max).toBe(13);
  });
  it('refuses pickup above 125% and ratios between 100% and 125% stop sprinting', () => {
    const { eco, p } = setup({ primary: null });
    // small bag 15kg, limit 18.75kg; worn: pistol 1 + bag 0.8 -> 0.9
    const inv = eco.view('carried');
    p.carried.push({ id: 'rice_cooker', qty: 1 }, { id: 'rice_cooker', qty: 1 }, { id: 'rice_cooker', qty: 1 }, { id: 'rice_cooker', qty: 1 }, { id: 'rice_cooker', qty: 1 }); // 16kg
    expect(inv.getWeightRatio()).toBeGreaterThan(0); // fresh view below
    const r = eco.getWeightRatio();
    expect(r).toBeGreaterThan(1);
    expect(r).toBeLessThan(1.25);
    expect(canSprintAtWeight(r)).toBe(false);
    expect(weightSpeedFactor(r)).toBe(0.6);
    expect(eco.view('carried').maxAddable('rice_cooker', 5)).toBeLessThanOrEqual(1);
    expect(eco.view('carried').maxAddable('scrap_metal', 50)).toBeLessThan(50);
  });
});

describe('EconomyService: raid flow', () => {
  function prepared() {
    const ctx = makeEconomy();
    const { eco } = ctx;
    eco.upgrade('secure'); // ₵8000 - 6000 -> 2 slots
    // put the pistol ammo in the secure container, medkits (bought) in the backpack
    eco.buy('medkit', 2);
    eco.moveItem({ c: 'stash', i: eco.view('stash').slots.findIndex((s) => s?.id === 'medkit') }, { c: 'carried' });
    eco.moveItem({ c: 'stash', i: 0 }, { c: 'secure' }, 60);
    return ctx;
  }

  it('cannot start a locked era, nor twice; and blocks the stash during a raid', () => {
    const { eco } = makeEconomy();
    expect(eco.startRaid('shanghai_1920')).toMatchObject({ ok: false, code: 'locked' });
    expect(eco.startRaid('harbor_1990').ok).toBe(true);
    expect(eco.startRaid('harbor_1990')).toMatchObject({ ok: false, code: 'already_in_raid' });
    expect(eco.buy('pistol', 1)).toMatchObject({ ok: false, code: 'in_raid' });
    expect(eco.moveItem({ c: 'stash', i: 0 }, { c: 'carried' })).toMatchObject({ ok: false, code: 'in_raid' });
  });

  it('extract: loot goes to the stash, summary lists only what was gained', () => {
    const { eco } = makeEconomy();
    eco.startRaid('harbor_1990');
    expect(eco.lootItem('chronite', 2)).toMatchObject({ ok: true, taken: 2 });
    expect(eco.lootItem('pager', 1)).toMatchObject({ ok: true, taken: 1 });
    const r = eco.resolveRaid('extract');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.outcome).toBe('extract');
    expect(r.result.items.map((s) => `${s.id}x${s.qty}`).sort()).toEqual(['chroniteX2'.replace('X', 'x'), 'pagerx1'].sort());
    expect(r.result.value).toBe(sellPrice('chronite', DAY) * 2 + sellPrice('pager', DAY));
    expect(eco.inRaid).toBe(false);
    expect(eco.view('stash').count('chronite')).toBe(2);
    expect(eco.view('carried').used).toBe(0);
    expect(eco.profile.equipment.backpack?.id).toBe('bag_small'); // gear is kept
    expect(eco.profile.stats).toMatchObject({ raids: 1, extracts: 1, deaths: 0 });
    expect(eco.profile.pendingResult?.outcome).toBe('extract');
  });

  it('death: loses carried + equipment but keeps the secure container', () => {
    const { eco } = prepared();
    eco.startRaid('harbor_1990');
    eco.lootItem('gold_bar', 1);
    const r = eco.resolveRaid('death');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.kept).toEqual([{ id: 'ammo_pistol', qty: 60 }]);
    const lost = r.result.items.map((s) => s.id).sort();
    expect(lost).toEqual(['bag_small', 'gold_bar', 'medkit', 'pistol'].sort());
    expect(eco.view('stash').count('ammo_pistol')).toBe(60);
    expect(eco.view('stash').count('medkit')).toBe(0);
    expect(eco.view('stash').count('gold_bar')).toBe(0);
    expect(eco.profile.equipment).toEqual({ primary: null, secondary: null, armor: null, helmet: null, backpack: null });
    expect(eco.view('carried').capacity).toBe(4); // pockets only
    expect(eco.profile.stats).toMatchObject({ raids: 1, deaths: 1 });
    expect(r.result.value).toBeGreaterThan(0);
  });

  it('stash overflow never loses items', () => {
    const { eco } = makeEconomy();
    const p = (eco as unknown as { p: { stash: unknown[] } }).p;
    for (let i = 0; i < 40; i++) p.stash[i] = { id: 'pistol', qty: 1 };
    eco.startRaid('harbor_1990');
    eco.lootItem('pager', 1);
    expect(eco.resolveRaid('extract').ok).toBe(true);
    expect(eco.view('stash').count('pager')).toBe(1);
    expect(eco.view('stash').used).toBe(41);
  });

  it('refresh during a raid (persisted raid flag) is resolved as death on load', () => {
    const save = new MemorySave();
    let t = NOON;
    const a = new EconomyService(save, () => t);
    a.upgrade('secure');
    a.moveItem({ c: 'stash', i: 0 }, { c: 'secure' }, 60);
    a.startRaid('harbor_1990');
    a.lootItem('diamond', 1);
    expect(JSON.parse(save.data.get(PROFILE_KEY)!).raid).toBeTruthy();
    t += 5000;
    const b = new EconomyService(save, () => t); // "reload the page"
    expect(b.inRaid).toBe(false);
    expect(b.view('stash').count('diamond')).toBe(0);
    expect(b.view('stash').count('ammo_pistol')).toBe(60);
    expect(b.profile.equipment.secondary).toBeNull();
    expect(b.profile.pendingResult).toMatchObject({ outcome: 'death', interrupted: true });
    expect(b.profile.stats.deaths).toBe(1);
    // and the loaded state is persisted: another reload does not double count
    const c = new EconomyService(save, () => t);
    expect(c.profile.stats.deaths).toBe(1);
  });

  it('state persists across a normal reload', () => {
    const save = new MemorySave();
    const a = new EconomyService(save, () => NOON);
    a.buy('smg', 1);
    const b = new EconomyService(save, () => NOON);
    expect(b.credits).toBe(a.credits);
    expect(b.view('stash').count('smg')).toBe(1);
  });

  it('lootItem needs a raid and reports a full backpack', () => {
    const { eco } = makeEconomy();
    expect(eco.lootItem('pager', 1)).toMatchObject({ ok: false, code: 'not_in_raid' });
    eco.startRaid('harbor_1990');
    for (let i = 0; i < 8; i++) eco.lootItem('pager', 4);
    expect(eco.lootItem('pager', 1)).toMatchObject({ ok: false, code: 'full', reason: '背包已滿' });
  });

  it('drop and move to the secure container during a raid', () => {
    const { eco } = makeEconomy();
    eco.upgrade('secure');
    eco.startRaid('harbor_1990');
    eco.lootItem('gold_bar', 1);
    expect(eco.moveItem({ c: 'carried', i: 0 }, { c: 'secure' })).toMatchObject({ ok: true });
    expect(eco.view('secure').count('gold_bar')).toBe(1);
    eco.lootItem('scrap_metal', 3);
    const i = eco.view('carried').slots.findIndex((s) => s?.id === 'scrap_metal');
    expect(eco.dropItem({ c: 'carried', i }, 1)).toMatchObject({ ok: true });
    expect(eco.view('carried').count('scrap_metal')).toBe(2);
  });

  it('prepared() fixture sanity', () => {
    const { eco } = prepared();
    expect(eco.view('secure').count('ammo_pistol')).toBe(60);
    expect(eco.view('carried').count('medkit')).toBe(2);
  });
});

describe('Profile migration', () => {
  it('upgrades a v0 save (money + compact stash list)', () => {
    const v0 = { money: 1234, stash: [{ id: 'pistol', count: 1 }, { id: 'ghost_item', count: 5 }, { id: 'bandage', count: 3 }] };
    const p = migrateProfile(v0);
    expect(p.version).toBe(PROFILE_VERSION);
    expect(p.credits).toBe(1234);
    expect(p.stash.filter(Boolean)).toEqual([{ id: 'pistol', qty: 1 }, { id: 'bandage', qty: 3 }]);
    expect(p.stash.length).toBe(40);
    expect(p.upgrades.stash).toBe(0);
  });
  it('EconomyService loads and re-saves an old save in the new format', () => {
    const save = new MemorySave();
    save.set(PROFILE_KEY, { money: 777, stash: [{ id: 'smg', count: 1 }] });
    const eco = new EconomyService(save, () => NOON);
    expect(eco.credits).toBe(777);
    expect(JSON.parse(save.data.get(PROFILE_KEY)!).version).toBe(PROFILE_VERSION);
  });
  it('falls back to a fresh profile for garbage or future versions', () => {
    expect(migrateProfile(null)).toEqual(createDefaultProfile());
    expect(migrateProfile('x').credits).toBe(8000);
    expect(migrateProfile({ version: 99, credits: 5 }).credits).toBe(8000);
  });
  it('sanitises unknown items and oversized stacks', () => {
    const p = migrateProfile({ version: 1, credits: 5, stash: [{ id: 'x', qty: 1 }, { id: 'bandage', qty: 999 }] });
    expect(p.stash[0]).toBeNull();
    expect(p.stash[1]).toEqual({ id: 'bandage', qty: 10 });
  });
  it('resetProfile restores the starting state', () => {
    const { eco } = makeEconomy();
    giveCredits(eco, 10000);
    eco.buy('rifle', 1);
    eco.resetProfile();
    expect(eco.credits).toBe(8000);
    expect(eco.view('stash').count('rifle')).toBe(0);
  });
});
