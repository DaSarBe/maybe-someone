import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildCorpseLoot } from '../src/ai/CorpseLoot';
import { tacticalVision, visionGain } from '../src/ai/Perception';
import { SUPPRESSED_ERR_K } from '../src/ai/Enemy';
import { assessHearing } from '../src/audio/Hearing';
import { SUPPRESSED_SHOT } from '../src/audio/AudioManager';
import { adsPoseOf, buildAssembly, IRON_LIFT } from '../src/combat/WeaponAssembly';
import { WeaponState, computeSpread, type AmmoSource } from '../src/combat/WeaponState';
import { effectiveWeapon, lookScaleForFov, shotRangeOf, statRows } from '../src/combat/WeaponMods';
import {
  ATTACHMENTS, ATTACHMENT_ITEMS, MOD_COMPAT, MOD_SLOTS, canMount, cleanMods, compatibleMods, mountableSlots, type WeaponMods,
} from '../src/data/attachments';
import { ENEMIES, rollEnemyMods } from '../src/data/enemies';
import { ITEMS, SHOP_CATEGORIES } from '../src/data/items';
import { LOOT_TABLES } from '../src/data/lootTables';
import { NOISE_RANGE, noiseRange } from '../src/data/noise';
import { TRADERS } from '../src/data/traders';
import { WEAPON_STATS } from '../src/data/weapons';
import { WEAPON_HANDLING } from '../src/data/weaponHandling';
import { buyPrice, sellPrice } from '../src/economy/Pricing';
import { mulberry32 } from '../src/items/LootTable';
import { PROFILE_VERSION, createDefaultProfile, migrateProfile } from '../src/items/Profile';
import { MemorySave, makeEconomy } from './helpers';

const DAY = '2026-06-15';
const put = (eco: ReturnType<typeof makeEconomy>['eco'], id: string, n = 1) => { eco.view('stash').add(id, n); };
const giveWeapon = (eco: ReturnType<typeof makeEconomy>['eco'], id: string, mods?: WeaponMods, dur?: number) => {
  const p = (eco as any).p;
  const slot = WEAPON_STATS[id].slot;
  p.equipment[slot] = { id, qty: 1, ...(mods ? { mods } : {}), ...(dur !== undefined ? { dur } : {}) };
  (eco as any).persist();
};
const weaponOf = (eco: ReturnType<typeof makeEconomy>['eco'], slot: 'primary' | 'secondary') => eco.profile.equipment[slot]!;

describe('attachment data', () => {
  it('every attachment is a real item with a slot, and every compat entry matches its slot', () => {
    for (const id of Object.keys(ATTACHMENTS)) {
      expect(ITEMS[id], id).toBeTruthy();
      expect(ITEMS[id].category).toBe('attachment');
      expect(ATTACHMENTS[id].slot).toBeTruthy();
    }
    expect(ATTACHMENT_ITEMS).toHaveLength(10);
    for (const [weapon, slots] of Object.entries(MOD_COMPAT)) {
      expect(WEAPON_STATS[weapon], weapon).toBeTruthy();
      for (const [slot, ids] of Object.entries(slots)) for (const id of ids) expect(ATTACHMENTS[id].slot, `${weapon}/${id}`).toBe(slot);
    }
  });

  it('compat table: pistol cannot take a 4x scope or a grip; shotgun cannot take an extended magazine but can take a red dot', () => {
    expect(canMount('pistol', 'att_scope4x')).toBe(false);
    expect(canMount('pistol', 'att_scope2x')).toBe(false);
    expect(canMount('pistol', 'att_grip')).toBe(false);
    expect(mountableSlots('pistol')).not.toContain('grip');
    expect(canMount('shotgun', 'att_extmag')).toBe(false);
    expect(mountableSlots('shotgun')).not.toContain('mag');
    expect(canMount('shotgun', 'att_reddot')).toBe(true);
    expect(canMount('rifle', 'att_scope4x')).toBe(true);
    expect(canMount('rifle', 'att_suppressor')).toBe(true);
    expect(compatibleMods('rifle', 'sight')).toHaveLength(4);
    expect(canMount('nope', 'att_grip')).toBe(false);
  });

  it('cleanMods drops incompatible or wrong-slot entries', () => {
    expect(cleanMods('pistol', { sight: 'att_scope4x', grip: 'att_grip', muzzle: 'att_suppressor' })).toEqual({ muzzle: 'att_suppressor' });
    expect(cleanMods('rifle', { sight: 'att_suppressor' })).toBeUndefined();
    expect(cleanMods('rifle', null)).toBeUndefined();
    expect(cleanMods('rifle', { sight: 'att_reddot', tactical: 'att_laser' })).toEqual({ sight: 'att_reddot', tactical: 'att_laser' });
  });

  it('loot tables, traders and the shop only reference real attachments, and attachments are sold in the black market', () => {
    expect(SHOP_CATEGORIES).toContain('attachment');
    const inLoot = new Set<string>();
    for (const era of Object.values(LOOT_TABLES)) for (const c of Object.values(era.containers)) for (const e of c.pool) if (e.id.startsWith('att_')) { expect(ITEMS[e.id], e.id).toBeTruthy(); inLoot.add(e.id); }
    expect(inLoot.size).toBeGreaterThanOrEqual(8);
    const t = TRADERS.harbor_1990.stock.filter((s) => s.id.startsWith('att_'));
    expect(t.map((s) => s.id).sort()).toEqual(['att_reddot', 'att_suppressor']);
    for (const s of t) expect(s.price).toBeGreaterThan(sellPrice(s.id, DAY)); // 時代商行的配件比較貴
    for (const a of ATTACHMENT_ITEMS) { expect(a.weight).toBeGreaterThan(0); expect(buyPrice(a.id, DAY)).toBeGreaterThan(sellPrice(a.id, DAY)); }
  });
});

describe('effective weapon stats', () => {
  it('no mods = original data', () => {
    for (const [id, w] of Object.entries(WEAPON_STATS)) {
      const e = effectiveWeapon(id);
      expect(e.stats).toEqual(w);
      expect(e.handling).toEqual(WEAPON_HANDLING[id]);
      expect(e.loudness).toBe(1);
      expect(e.sight).toBe('iron');
    }
  });

  it('red dot / holo: smaller ADS spread, slightly slower aim; holo has a wider ADS view', () => {
    const base = effectiveWeapon('rifle');
    const dot = effectiveWeapon('rifle', { sight: 'att_reddot' });
    const holo = effectiveWeapon('rifle', { sight: 'att_holo' });
    expect(dot.handling.spreadAds).toBeLessThan(base.handling.spreadAds);
    expect(dot.handling.adsTime).toBeGreaterThan(base.handling.adsTime);
    expect(dot.handling.adsTime).toBeLessThan(base.handling.adsTime * 1.2);
    expect(holo.handling.spreadAds).toBeLessThan(dot.handling.spreadAds);
    expect(holo.handling.adsFov).toBeGreaterThan(dot.handling.adsFov);
    expect(dot.sight).toBe('reddot');
    expect(holo.sight).toBe('holo');
  });

  it('2x / 4x scopes: magnification (FOV), much slower aim, slower ADS movement; 4x hip spread goes up', () => {
    const base = effectiveWeapon('rifle');
    const s2 = effectiveWeapon('rifle', { sight: 'att_scope2x' });
    const s4 = effectiveWeapon('rifle', { sight: 'att_scope4x' });
    expect(s2.scopeFov).toBe(30);
    expect(s4.scopeFov).toBe(15);
    expect(s4.handling.adsFov).toBe(15);
    expect(s2.zoom).toBe(2);
    expect(s4.zoom).toBe(4);
    expect(s2.handling.adsTime).toBeGreaterThan(base.handling.adsTime * 1.2);
    expect(s4.handling.adsTime).toBeGreaterThan(s2.handling.adsTime);
    expect(s2.handling.adsMoveScale).toBeLessThan(base.handling.adsMoveScale);
    expect(s4.handling.adsMoveScale).toBeLessThan(s2.handling.adsMoveScale);
    expect(s4.handling.spreadHip).toBeGreaterThan(base.handling.spreadHip);
    expect(s2.handling.spreadHip).toBe(base.handling.spreadHip);
    // 視角靈敏度隨視野（倍率）降低
    expect(lookScaleForFov(75)).toBeCloseTo(1, 5);
    expect(lookScaleForFov(15)).toBeLessThan(lookScaleForFov(30));
    expect(lookScaleForFov(30)).toBeLessThan(0.5);
  });

  it('suppressor: shot range x0.25 (rifle 120m -> 30m), smaller flash, a little less damage and range', () => {
    const base = effectiveWeapon('rifle');
    const sup = effectiveWeapon('rifle', { muzzle: 'att_suppressor' });
    expect(sup.loudness).toBe(0.25);
    expect(sup.suppressed).toBe(true);
    expect(base.suppressed).toBe(false);
    expect(noiseRange({ kind: 'shot', weaponId: 'rifle' })).toBe(120);
    expect(noiseRange({ kind: 'shot', weaponId: 'rifle', loudness: sup.loudness })).toBe(30);
    expect(noiseRange({ kind: 'shot', weaponId: 'pistol', loudness: effectiveWeapon('pistol', { muzzle: 'att_suppressor' }).loudness })).toBe(20);
    expect(shotRangeOf('rifle', { muzzle: 'att_suppressor' })).toBe(30);
    expect(sup.flash).toBeLessThan(0.5);
    expect(sup.stats.damage).toBeLessThan(base.stats.damage);
    expect(sup.stats.range).toBeLessThan(base.stats.range);
    expect(SUPPRESSED_SHOT.lowpass).toBeLessThan(3000); // 悶的槍聲：低通
    expect(SUPPRESSED_SHOT.volume).toBeLessThan(1);
  });

  it('suppressed shots are inaudible at 50m but unsuppressed shots are heard', () => {
    const ear = { x: 50, y: 1.6, z: 0 };
    const loud = assessHearing(ear, { kind: 'shot', position: { x: 0, y: 1.4, z: 0 }, weaponId: 'rifle' }, null);
    const quiet = assessHearing(ear, { kind: 'shot', position: { x: 0, y: 1.4, z: 0 }, weaponId: 'rifle', loudness: 0.25 }, null);
    expect(loud.audible).toBe(true);
    expect(quiet.audible).toBe(false);
    const near = assessHearing({ x: 20, y: 1.6, z: 0 }, { kind: 'shot', position: { x: 0, y: 1.4, z: 0 }, weaponId: 'rifle', loudness: 0.25 }, null);
    expect(near.audible).toBe(true);
    expect(SUPPRESSED_ERR_K).toBeGreaterThan(1); // 敵人只能大概判斷方向
  });

  it('muzzle brake: less recoil, slightly louder shots', () => {
    const base = effectiveWeapon('rifle');
    const brake = effectiveWeapon('rifle', { muzzle: 'att_brake' });
    expect(brake.stats.recoil).toBeLessThan(base.stats.recoil);
    expect(brake.loudness).toBeCloseTo(1.1);
    expect(noiseRange({ kind: 'shot', weaponId: 'rifle', loudness: brake.loudness })).toBeCloseTo(132);
    expect(brake.suppressed).toBe(false);
  });

  it('vertical grip: less recoil and less hip spread', () => {
    const base = effectiveWeapon('smg');
    const grip = effectiveWeapon('smg', { grip: 'att_grip' });
    expect(grip.stats.recoil).toBeLessThan(base.stats.recoil);
    expect(grip.handling.spreadHip).toBeLessThan(base.handling.spreadHip);
    expect(grip.handling.spreadAds).toBe(base.handling.spreadAds);
  });

  it('extended magazine: capacity x1.5 (rounded up), slower reload, heavier', () => {
    expect(effectiveWeapon('rifle', { mag: 'att_extmag' }).stats.magazine).toBe(45);
    expect(effectiveWeapon('pistol', { mag: 'att_extmag' }).stats.magazine).toBe(18);
    expect(effectiveWeapon('smg', { mag: 'att_extmag' }).stats.magazine).toBe(45);
    expect(effectiveWeapon('rifle', { mag: 'att_extmag' }).stats.reloadTime).toBeGreaterThan(WEAPON_STATS.rifle.reloadTime);
    expect(effectiveWeapon('rifle', { mag: 'att_extmag' }).weight).toBeGreaterThan(effectiveWeapon('rifle').weight);
  });

  it('laser / flashlight are tactical devices', () => {
    expect(effectiveWeapon('rifle', { tactical: 'att_laser' }).tactical).toBe('laser');
    expect(effectiveWeapon('rifle', { tactical: 'att_flashlight' }).tactical).toBe('flashlight');
    expect(effectiveWeapon('rifle').tactical).toBeNull();
  });

  it('stat rows report better / worse against the stock weapon', () => {
    const rows = Object.fromEntries(statRows('rifle', { muzzle: 'att_suppressor', mag: 'att_extmag' }).map((r) => [r.key, r]));
    expect(rows.noise.value).toBe(30);
    expect(rows.noise.base).toBe(120);
    expect(rows.noise.value < rows.noise.base && !rows.noise.higherBetter).toBe(true); // 槍聲變小 = 變好
    expect(rows.magazine.value).toBe(45);
    expect(rows.magazine.higherBetter).toBe(true);
    expect(rows.reloadTime.value).toBeGreaterThan(rows.reloadTime.base);
    expect(rows.weight.value).toBeGreaterThan(rows.weight.base);
  });

  it('laser lowers hip spread when on (handled by WeaponSystem with LASER_HIP_SPREAD)', () => {
    const h = WEAPON_HANDLING.rifle;
    expect(computeSpread({ ...h, spreadHip: h.spreadHip * 0.75 }, { ads: false, speed: 0, sprinting: false, airborne: false, crouching: false, bloom: 0 }))
      .toBeLessThan(computeSpread(h, { ads: false, speed: 0, sprinting: false, airborne: false, crouching: false, bloom: 0 }));
  });
});

describe('extended magazine reload', () => {
  class Bag implements AmmoSource {
    constructor(public rounds: number) {}
    count(): number { return this.rounds; }
    take(_id: string, n: number): number { const t = Math.min(n, this.rounds); this.rounds -= t; return t; }
  }
  it('reloads up to the larger capacity and takes exactly that many rounds from the bag', () => {
    const e = effectiveWeapon('rifle', { mag: 'att_extmag' });
    const w = new WeaponState('rifle', e.stats, 10);
    const bag = new Bag(100);
    expect(w.startReload(bag)).toBe(true);
    expect(w.reloadLeft).toBeCloseTo(e.stats.reloadTime);
    expect(w.update(e.stats.reloadTime + 0.01, bag)).toBe(35);
    expect(w.mag).toBe(45);
    expect(bag.rounds).toBe(65);
    // 沒有擴容彈匣時 30 發就滿了
    const plain = new WeaponState('rifle', effectiveWeapon('rifle').stats, 30);
    expect(plain.startReload(new Bag(100))).toBe(false);
    expect(w.startReload(new Bag(100))).toBe(false); // 45 發已滿
  });
});

describe('EconomyService: install / remove mods', () => {
  it('installs from the stash onto an equipped weapon and the item leaves the stash', () => {
    const { eco } = makeEconomy();
    giveWeapon(eco, 'rifle');
    put(eco, 'att_reddot');
    const r = eco.installMod({ equip: 'primary' }, { c: 'stash', i: eco.view('stash').slots.findIndex((s) => s?.id === 'att_reddot') });
    expect(r).toMatchObject({ ok: true, slot: 'sight', replaced: null });
    expect(weaponOf(eco, 'primary').mods).toEqual({ sight: 'att_reddot' });
    expect(eco.view('stash').count('att_reddot')).toBe(0);
  });

  it('rejects incompatible parts (nothing changes) and Raid-time changes', () => {
    const { eco, save } = makeEconomy();
    giveWeapon(eco, 'pistol');
    put(eco, 'att_scope4x'); put(eco, 'att_grip');
    const idx = (id: string) => eco.view('stash').slots.findIndex((s) => s?.id === id);
    const snap = JSON.stringify(eco.profile);
    expect(eco.installMod({ equip: 'secondary' }, { c: 'stash', i: idx('att_scope4x') })).toMatchObject({ ok: false, code: 'incompatible' });
    expect(eco.installMod({ equip: 'secondary' }, { c: 'stash', i: idx('att_grip') })).toMatchObject({ ok: false, code: 'incompatible' });
    expect(JSON.stringify(eco.profile)).toBe(snap);
    expect(weaponOf(eco, 'secondary').mods).toBeUndefined();
    // 不是配件 / 空格 / 不是武器
    expect(eco.installMod({ equip: 'secondary' }, { c: 'stash', i: 39 })).toMatchObject({ ok: false, code: 'invalid' });
    expect(eco.installMod({ equip: 'primary' }, { c: 'stash', i: idx('att_grip') })).toMatchObject({ ok: false, code: 'invalid' });
    void save;
    // Raid 中不能拆裝
    giveWeapon(eco, 'rifle', { sight: 'att_reddot' });
    expect(eco.startRaid('harbor_1990').ok).toBe(true);
    expect(eco.removeMod({ equip: 'primary' }, 'sight')).toMatchObject({ ok: false, code: 'in_raid' });
    expect(eco.installMod({ equip: 'primary' }, { c: 'carried', i: 0 })).toMatchObject({ ok: false, code: 'in_raid' });
    expect(eco.buyAndInstallMod({ equip: 'primary' }, 'att_grip')).toMatchObject({ ok: false, code: 'in_raid' });
    expect(weaponOf(eco, 'primary').mods).toEqual({ sight: 'att_reddot' });
  });

  it('replacing a part puts the old one back in the stash; removing returns it to the stash (or the pack)', () => {
    const { eco } = makeEconomy();
    giveWeapon(eco, 'rifle', { sight: 'att_reddot' });
    put(eco, 'att_holo');
    const i = eco.view('stash').slots.findIndex((s) => s?.id === 'att_holo');
    expect(eco.installMod({ equip: 'primary' }, { c: 'stash', i })).toMatchObject({ ok: true, replaced: 'att_reddot' });
    expect(weaponOf(eco, 'primary').mods).toEqual({ sight: 'att_holo' });
    expect(eco.view('stash').count('att_reddot')).toBe(1);
    expect(eco.view('stash').count('att_holo')).toBe(0);
    const r = eco.removeMod({ equip: 'primary' }, 'sight');
    expect(r).toMatchObject({ ok: true, part: 'att_holo' });
    expect(weaponOf(eco, 'primary').mods).toBeUndefined();
    expect(eco.view('stash').count('att_holo')).toBe(1);
    expect(eco.removeMod({ equip: 'primary' }, 'sight')).toMatchObject({ ok: false, code: 'invalid' });
    // 倉庫滿了：放進背包
    const p = (eco as any).p;
    p.stash = p.stash.map(() => ({ id: 'scrap_metal', qty: 8 }));
    giveWeapon(eco, 'rifle', { grip: 'att_grip' });
    expect(eco.removeMod({ equip: 'primary' }, 'grip')).toMatchObject({ ok: true });
    expect(eco.view('carried').count('att_grip')).toBe(1);
  });

  it('works on weapons sitting in a container too', () => {
    const { eco } = makeEconomy();
    const p = (eco as any).p;
    p.stash[3] = { id: 'smg', qty: 1 };
    put(eco, 'att_suppressor');
    const si = eco.view('stash').slots.findIndex((s) => s?.id === 'att_suppressor');
    expect(eco.installMod({ loc: { c: 'stash', i: 3 } }, { c: 'stash', i: si })).toMatchObject({ ok: true });
    expect(eco.view('stash').slots[3]!.mods).toEqual({ muzzle: 'att_suppressor' });
    expect(eco.weaponStack({ loc: { c: 'stash', i: 3 } })!.mods).toEqual({ muzzle: 'att_suppressor' });
  });

  it('buyAndInstallMod charges the shop price and respects compatibility / credits', () => {
    const { eco } = makeEconomy();
    giveWeapon(eco, 'rifle');
    const before = eco.credits;
    const r = eco.buyAndInstallMod({ equip: 'primary' }, 'att_grip');
    expect(r).toMatchObject({ ok: true, slot: 'grip', cost: buyPrice('att_grip', DAY) });
    expect(eco.credits).toBe(before - buyPrice('att_grip', DAY));
    expect(weaponOf(eco, 'primary').mods).toEqual({ grip: 'att_grip' });
    giveWeapon(eco, 'shotgun');
    expect(eco.buyAndInstallMod({ equip: 'primary' }, 'att_extmag')).toMatchObject({ ok: false, code: 'incompatible' });
    const poor = makeEconomy().eco;
    giveWeapon(poor, 'rifle');
    (poor as any).p.credits = 10;
    expect(poor.buyAndInstallMod({ equip: 'primary' }, 'att_scope4x')).toMatchObject({ ok: false, code: 'no_credits' });
    expect(weaponOf(poor, 'primary').mods).toBeUndefined();
    expect(poor.credits).toBe(10);
  });

  it('removing the extended magazine trims the magazine and returns the extra rounds as ammo', () => {
    const { eco } = makeEconomy();
    giveWeapon(eco, 'rifle', { mag: 'att_extmag' }, 45);
    const ammo = eco.view('stash').count('ammo_rifle');
    expect(eco.removeMod({ equip: 'primary' }, 'mag')).toMatchObject({ ok: true });
    expect(weaponOf(eco, 'primary').dur).toBe(30);
    expect(eco.view('stash').count('ammo_rifle')).toBe(ammo + 15);
  });

  it('setEquipState clamps to the extended capacity', () => {
    const { eco } = makeEconomy();
    giveWeapon(eco, 'rifle', { mag: 'att_extmag' }, 10);
    eco.setEquipState('primary', 99);
    expect(weaponOf(eco, 'primary').dur).toBe(45);
    giveWeapon(eco, 'rifle', undefined, 10);
    eco.setEquipState('primary', 99);
    expect(weaponOf(eco, 'primary').dur).toBe(30);
  });
});

describe('mods follow the weapon', () => {
  const mods: WeaponMods = { sight: 'att_reddot', muzzle: 'att_suppressor', grip: 'att_grip' };

  it('equip / unequip / moveItem keep the mods', () => {
    const { eco } = makeEconomy();
    const p = (eco as any).p;
    p.stash[0] = { id: 'rifle', qty: 1, mods, dur: 12 };
    expect(eco.equip({ c: 'stash', i: 0 }).ok).toBe(true);
    expect(weaponOf(eco, 'primary')).toMatchObject({ id: 'rifle', mods, dur: 12 });
    expect(eco.unequip('primary').ok).toBe(true);
    const i = eco.view('stash').slots.findIndex((s) => s?.id === 'rifle');
    expect(eco.view('stash').slots[i]!.mods).toEqual(mods);
    expect(eco.moveItem({ c: 'stash', i }, { c: 'carried' }).ok).toBe(true);
    expect(eco.view('carried').slots.find((s) => s?.id === 'rifle')!.mods).toEqual(mods);
    expect(eco.moveItem({ c: 'carried', i: eco.view('carried').slots.findIndex((s) => s?.id === 'rifle') }, { c: 'safe' }).ok).toBe(true);
    expect(eco.view('safe').slots.find((s) => s?.id === 'rifle')!.mods).toEqual(mods);
  });

  it('weapon value includes the attachments (valueOf, sell)', () => {
    const { eco } = makeEconomy();
    const day = eco.today();
    const plain = { id: 'rifle', qty: 1 };
    const full = { id: 'rifle', qty: 1, mods };
    const extra = ['att_reddot', 'att_suppressor', 'att_grip'].reduce((n, id) => n + sellPrice(id, day), 0);
    expect(eco.valueOf(full)).toBe(eco.valueOf(plain) + extra);
    const p = (eco as any).p;
    p.stash[0] = { id: 'rifle', qty: 1, mods };
    const before = eco.credits;
    const r = eco.sell({ c: 'stash', i: 0 });
    expect(r).toMatchObject({ ok: true, gain: sellPrice('rifle', day) + extra });
    expect(eco.credits).toBe(before + sellPrice('rifle', day) + extra);
  });

  it('weight includes the attachments', () => {
    const { eco } = makeEconomy();
    giveWeapon(eco, 'rifle');
    const w0 = eco.carryInfo().weight;
    giveWeapon(eco, 'rifle', mods);
    const add = ITEMS.att_reddot.weight + ITEMS.att_suppressor.weight + ITEMS.att_grip.weight;
    expect(eco.carryInfo().weight).toBeCloseTo(w0 + add, 5);
  });

  it('death drops the weapon with its mods (value counted), the secure container keeps them', () => {
    const { eco } = makeEconomy();
    giveWeapon(eco, 'rifle', mods, 20);
    const p = (eco as any).p;
    p.secure[0] = { id: 'pistol', qty: 1, mods: { muzzle: 'att_suppressor' } };
    (eco as any).persist();
    expect(eco.startRaid('harbor_1990').ok).toBe(true);
    const r = eco.resolveRaid('death');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lost = r.result.items.find((s) => s.id === 'rifle')!;
    expect(lost.mods).toEqual(mods);
    expect(r.result.value).toBeGreaterThanOrEqual(eco.valueOf(lost));
    expect(eco.profile.equipment.primary).toBeNull();
    const kept = eco.view('stash').slots.find((s) => s?.id === 'pistol' && s.mods);
    expect(kept?.mods).toEqual({ muzzle: 'att_suppressor' });
  });

  it('extracting brings the weapon home with its mods', () => {
    const { eco } = makeEconomy();
    giveWeapon(eco, 'rifle', mods, 20);
    const p = (eco as any).p;
    p.carried[0] = { id: 'smg', qty: 1, mods: { grip: 'att_grip' } };
    (eco as any).persist();
    expect(eco.startRaid('harbor_1990').ok).toBe(true);
    expect(eco.resolveRaid('extract').ok).toBe(true);
    expect(eco.profile.equipment.primary).toMatchObject({ id: 'rifle', mods });
    expect(eco.view('stash').slots.find((s) => s?.id === 'smg')!.mods).toEqual({ grip: 'att_grip' });
  });

  it('a corpse carries its enemy weapon with the mods; equipping it directly keeps them', () => {
    const { eco } = makeEconomy();
    expect(eco.startRaid('harbor_1990').ok).toBe(true);
    const loot = buildCorpseLoot({
      def: ENEMIES.rival_agent, weaponId: 'rifle', mag: 25, reserve: 0, ammoType: 'ammo_rifle', armorDur: 0,
      mods: { sight: 'att_scope2x', muzzle: 'att_suppressor' },
    }, 'harbor_1990', () => 0.99);
    const idx = loot.findIndex((s) => s?.id === 'rifle');
    expect(loot[idx]).toMatchObject({ id: 'rifle', dur: 25, mods: { sight: 'att_scope2x', muzzle: 'att_suppressor' } });
    const r = eco.equipFromContainer(loot, idx, { dest: 'carried' });
    expect(r.ok).toBe(true);
    expect(weaponOf(eco, 'primary')).toMatchObject({ id: 'rifle', dur: 25, mods: { sight: 'att_scope2x', muzzle: 'att_suppressor' } });
    // 原本裝備的槍（沒有配件）換下來，不會憑空多出配件
    const loot2 = [{ id: 'rifle', qty: 1, mods: { grip: 'att_grip' } }];
    expect(eco.equipFromContainer(loot2, 0).ok).toBe(true);
    expect(loot2[0]).toMatchObject({ id: 'rifle', mods: { sight: 'att_scope2x', muzzle: 'att_suppressor' } });
    expect(weaponOf(eco, 'primary').mods).toEqual({ grip: 'att_grip' });
    // 撿到背包（lootItem）也帶著配件
    expect(eco.lootItem('smg', 1, 7, { grip: 'att_grip' }).ok).toBe(true);
    expect(eco.view('carried').slots.find((s) => s?.id === 'smg')).toMatchObject({ dur: 7, mods: { grip: 'att_grip' } });
  });

  it('trader pays for the attachments too (and saturation is counted per part)', () => {
    const { eco } = makeEconomy();
    const p = (eco as any).p;
    p.equipment.backpack = { id: 'bag_medium', qty: 1 };
    p.carried[0] = { id: 'rifle', qty: 1, mods: { sight: 'att_reddot' } };
    p.carried[1] = { id: 'rifle', qty: 1 };
    (eco as any).persist();
    expect(eco.startRaid('harbor_1990').ok).toBe(true);
    const withMod = eco.traderSellQuote('rifle', 1, { sight: 'att_reddot' });
    const without = eco.traderSellQuote('rifle', 1);
    expect(withMod).toBeGreaterThan(without);
    const r = eco.traderSell({ c: 'carried', i: 0 });
    expect(r).toMatchObject({ ok: true, gain: withMod });
  });

  it('save: v2 saves migrate to the current version keeping weapons; illegal mods are cleaned', () => {
    expect(PROFILE_VERSION).toBe(3);
    const v2 = { ...createDefaultProfile(), version: 2 } as any;
    v2.equipment.primary = { id: 'rifle', qty: 1, dur: 10 };
    const m = migrateProfile(v2);
    expect(m.version).toBe(PROFILE_VERSION);
    expect(m.equipment.primary).toMatchObject({ id: 'rifle', dur: 10 });
    expect(m.equipment.primary!.mods).toBeUndefined();
    // v3 存檔：配件保留，不合法的被清掉，彈匣上限用擴容後的容量
    const v3 = { ...createDefaultProfile() } as any;
    v3.equipment.primary = { id: 'rifle', qty: 1, dur: 40, mods: { mag: 'att_extmag', sight: 'att_extmag' } };
    v3.equipment.secondary = { id: 'pistol', qty: 1, dur: 12, mods: { sight: 'att_scope4x', muzzle: 'att_suppressor' } };
    v3.stash[2] = { id: 'smg', qty: 1, mods: { grip: 'att_grip', mag: 'att_grip' } };
    const c = migrateProfile(JSON.parse(JSON.stringify(v3)));
    expect(c.equipment.primary).toMatchObject({ id: 'rifle', dur: 40, mods: { mag: 'att_extmag' } });
    expect(c.equipment.secondary!.mods).toEqual({ muzzle: 'att_suppressor' });
    expect(c.stash[2]!.mods).toEqual({ grip: 'att_grip' });
    // 經 EconomyService 存檔再讀回
    const save = new MemorySave();
    const a = makeEconomy(save).eco;
    giveWeapon(a, 'rifle', mods(), 25);
    const b = makeEconomy(save).eco;
    expect(b.profile.equipment.primary).toMatchObject({ id: 'rifle', dur: 25, mods: mods() });
    function mods(): WeaponMods { return { sight: 'att_holo', tactical: 'att_flashlight' }; }
  });
});

describe('enemy loadouts', () => {
  it('guards have no attachments; hostile agents mostly carry a red dot / 2x / holo; thugs sometimes grips or extended mags', () => {
    expect(ENEMIES.guard.loadout).toBeUndefined();
    expect(rollEnemyMods(ENEMIES.guard, 'pistol')).toEqual({});
    const N = 4000;
    const rng = mulberry32(7);
    let sight = 0, suppressed = 0, scope = 0;
    for (let i = 0; i < N; i++) {
      const m = rollEnemyMods(ENEMIES.rival_agent, 'rifle', rng);
      if (m.sight) sight++;
      if (m.sight === 'att_scope2x') scope++;
      if (m.muzzle === 'att_suppressor') suppressed++;
      expect(cleanMods('rifle', m)).toEqual(Object.keys(m).length ? m : undefined);
    }
    expect(sight / N).toBeGreaterThan(0.7);
    expect(scope / N).toBeGreaterThan(0.15);
    expect(suppressed / N).toBeGreaterThan(0.15);
    expect(suppressed / N).toBeLessThan(0.5);
    let grip = 0, mag = 0;
    for (let i = 0; i < N; i++) {
      const m = rollEnemyMods(ENEMIES.thug, 'smg', rng);
      if (m.grip) grip++;
      if (m.mag) mag++;
      // 霰彈槍不能裝擴容彈匣
      expect(rollEnemyMods(ENEMIES.thug, 'shotgun', rng).mag).toBeUndefined();
    }
    expect(grip / N).toBeGreaterThan(0.1);
    expect(grip / N).toBeLessThan(0.4);
    expect(mag / N).toBeGreaterThan(0.1);
  });

  it('an enemy with a suppressor makes a quiet shot (same noise rules)', () => {
    const eff = effectiveWeapon('rifle', { muzzle: 'att_suppressor' });
    expect(noiseRange({ kind: 'shot', weaponId: 'rifle', loudness: eff.loudness })).toBeLessThan(NOISE_RANGE.shot);
  });
});

describe('tactical devices vs enemy vision', () => {
  const base = { dist: 15, offAxis: 0.2, crouching: false, sprinting: false, moving: false };
  it('flashlight in the dark: much faster spotting and longer range; barely matters in daylight', () => {
    const dark = visionGain(0.6, 30, { ...base, light: 0.3 });
    const darkFl = visionGain(0.6, 30, { ...base, light: 0.3, flashlight: true });
    expect(darkFl).toBeGreaterThan(dark * 1.8);
    const day = visionGain(0.6, 30, { ...base, light: 1 });
    const dayFl = visionGain(0.6, 30, { ...base, light: 1, flashlight: true });
    expect(dayFl).toBeCloseTo(day, 6);
    // 距離：關燈時超出視距，開燈後看得到
    const far = { ...base, dist: 27, light: 0.3 };
    expect(visionGain(0.6, 30, far)).toBe(0);
    expect(visionGain(0.6, 30, { ...far, flashlight: true })).toBeGreaterThan(0);
    expect(tacticalVision(0.5, true, false).range).toBeGreaterThan(1);
  });
  it('laser is seen at any brightness', () => {
    const a = visionGain(0.6, 30, { ...base, light: 1 });
    const b = visionGain(0.6, 30, { ...base, light: 1, laser: true });
    expect(b).toBeGreaterThan(a);
  });
});

describe('aim alignment (sight line is on the camera axis)', () => {
  const styles = ['pistol', 'smg', 'rifle', 'shotgun'] as const;
  const sights: (string | undefined)[] = [undefined, 'att_reddot', 'att_holo', 'att_scope2x', 'att_scope4x'];
  it('for every weapon x sight, ADS puts the rear aim point in front of the camera on the axis and the front point on the same line', () => {
    for (const style of styles) {
      for (const sight of sights) {
        const mods = sight ? { sight } : undefined;
        const a = buildAssembly(style, mods);
        const pose = adsPoseOf(a, 0.5);
        // holder: scale 0.5, rotation.x = pitch, position = pose.position
        const holder = new THREE.Group();
        holder.scale.setScalar(0.5);
        holder.rotation.x = pose.pitch;
        holder.position.copy(pose.position);
        const g = new THREE.Group();
        g.add(a.group);
        holder.add(g);
        holder.updateMatrixWorld(true);
        const rear = a.aim.rear.clone().applyMatrix4(a.group.matrixWorld);
        const front = a.aim.front.clone().applyMatrix4(a.group.matrixWorld);
        const tag = `${style}/${sight ?? 'iron'}`;
        expect(Math.abs(rear.x), tag).toBeLessThan(1e-6);
        expect(Math.abs(rear.y), tag).toBeLessThan(1e-6);
        expect(rear.z, tag).toBeCloseTo(-a.aim.eyeRelief, 6);
        expect(Math.abs(front.x), tag).toBeLessThan(1e-6);
        expect(Math.abs(front.y), tag).toBeLessThan(1e-6);
        expect(front.z, tag).toBeLessThan(rear.z);
        // 機械瞄具：瞄準線在槍身上方 IRON_LIFT；光學瞄具：視窗中心就是照門
        if (sight) expect(a.window, tag).toBeTruthy(); else expect(a.window, tag).toBeNull();
        expect(IRON_LIFT).toBeGreaterThan(0.005);
      }
    }
  });

  it('fire direction is the camera forward: a hitscan through the screen centre ends at the sight line target', () => {
    // 射擊從相機位置沿視線方向發出；瞄具在相機視線上，所以彈著點就是畫面中心
    const cam = new THREE.PerspectiveCamera(50, 874 / 402, 0.05, 250);
    cam.position.set(3, 1.6, 4);
    cam.rotation.set(-0.05, 0.4, 0, 'YXZ');
    cam.updateMatrixWorld(true);
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const hit = cam.position.clone().addScaledVector(dir, 40);
    const ndc = hit.clone().project(cam);
    expect(Math.abs(ndc.x)).toBeLessThan(1e-6);
    expect(Math.abs(ndc.y)).toBeLessThan(1e-6);
  });

  it('every slot name in MOD_SLOTS is used by at least one attachment', () => {
    for (const s of MOD_SLOTS) expect(Object.values(ATTACHMENTS).some((a) => a.slot === s), s).toBe(true);
  });
});
