import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARMOR_STATS } from '../src/data/gear';
import { ENEMIES, accuracyAt } from '../src/data/enemies';
import { WEAPON_STATS } from '../src/data/weapons';
import { WEAPON_HANDLING } from '../src/data/weaponHandling';
import { MEDICAL_STATS, pickMedical } from '../src/data/medical';
import { ZONE_MULT, computeDamage, damageFalloff, shotsToKill } from '../src/combat/Damage';
import { WeaponState, computeSpread, type AmmoSource } from '../src/combat/WeaponState';
import { intersectHitZones } from '../src/combat/HitZones';
import { makeEconomy } from './helpers';

class Bag implements AmmoSource {
  constructor(public rounds: Record<string, number>) {}
  count(id: string): number { return this.rounds[id] ?? 0; }
  take(id: string, n: number): number { const t = Math.min(n, this.count(id)); this.rounds[id] = this.count(id) - t; return t; }
}

describe('damage', () => {
  it('applies zone multipliers', () => {
    expect(computeDamage(20, 'head', null).damage).toBe(20 * ZONE_MULT.head);
    expect(computeDamage(20, 'body', null).damage).toBe(20);
    expect(computeDamage(20, 'limb', null).damage).toBeCloseTo(14);
    expect(ZONE_MULT.head).toBe(2.5);
    expect(ZONE_MULT.limb).toBe(0.7);
  });
  it('armor reduces body damage and loses durability; head ignores armor', () => {
    const a = ARMOR_STATS.armor_3;
    const body = computeDamage(36, 'body', { reduction: a.reduction, dur: 80 });
    expect(body.damage).toBeCloseTo(36 * (1 - 0.45));
    expect(body.durLoss).toBeGreaterThan(0);
    expect(body.durAfter).toBeCloseTo(80 - body.durLoss);
    const head = computeDamage(36, 'head', { reduction: a.reduction, dur: 80 });
    expect(head.damage).toBe(90);
    expect(head.durLoss).toBe(0);
  });
  it('broken armor (dur 0) gives no protection and durability never goes negative', () => {
    expect(computeDamage(30, 'body', { reduction: 0.6, dur: 0 }).damage).toBe(30);
    const r = computeDamage(300, 'body', { reduction: 0.6, dur: 5 });
    expect(r.durAfter).toBe(0);
    expect(r.durLoss).toBe(5);
  });
  it('falls off with distance', () => {
    expect(damageFalloff(5, 40)).toBe(1);
    expect(damageFalloff(40, 40)).toBeCloseTo(0.55);
    expect(damageFalloff(500, 40)).toBeCloseTo(0.3);
    expect(damageFalloff(30, 40)).toBeLessThan(damageFalloff(25, 40));
  });
  it('headshots kill faster than body shots for every weapon and enemy', () => {
    for (const [wid, w] of Object.entries(WEAPON_STATS)) {
      for (const e of Object.values(ENEMIES)) {
        const armor = e.armorId ? { reduction: ARMOR_STATS[e.armorId].reduction, dur: ARMOR_STATS[e.armorId].durability } : null;
        const body = shotsToKill(e.hp, w.damage * w.pellets, 'body', armor);
        const head = shotsToKill(e.hp, w.damage * w.pellets, 'head', armor);
        expect(head, `${wid} vs ${e.kind}`).toBeLessThanOrEqual(body);
        expect(body, `${wid} vs ${e.kind}`).toBeLessThan(30);
      }
    }
  });
});

describe('weapon state and ammo', () => {
  it('consumes the magazine per shot, respects fire rate, dry fires on empty', () => {
    const w = new WeaponState('pistol', WEAPON_STATS.pistol);
    const ammo = new Bag({ ammo_pistol: 0 });
    expect(w.mag).toBe(12);
    expect(w.tryFire()).toBe('fired');
    expect(w.mag).toBe(11);
    expect(w.tryFire()).toBe('wait');
    w.update(w.fireInterval + 0.001, ammo);
    expect(w.tryFire()).toBe('fired');
    w.mag = 0;
    w.update(1, ammo);
    expect(w.tryFire()).toBe('empty');
  });
  it('reload takes rounds from the bag only on completion and only what is needed', () => {
    const w = new WeaponState('rifle', WEAPON_STATS.rifle, 10);
    const ammo = new Bag({ ammo_rifle: 50 });
    expect(w.startReload(ammo)).toBe(true);
    expect(ammo.count('ammo_rifle')).toBe(50); // 還沒完成，不扣
    expect(w.tryFire()).toBe('wait'); // 換彈中不能開槍
    w.update(WEAPON_STATS.rifle.reloadTime - 0.1, ammo);
    expect(w.reloading).toBe(true);
    w.update(0.2, ammo);
    expect(w.reloading).toBe(false);
    expect(w.mag).toBe(30);
    expect(ammo.count('ammo_rifle')).toBe(30);
  });
  it('partial reload when the bag runs short; no reload with an empty bag or full magazine', () => {
    const w = new WeaponState('smg', WEAPON_STATS.smg, 0);
    const ammo = new Bag({ ammo_pistol: 7 });
    expect(w.startReload(ammo)).toBe(true);
    w.update(5, ammo);
    expect(w.mag).toBe(7);
    expect(ammo.count('ammo_pistol')).toBe(0);
    expect(w.startReload(ammo)).toBe(false);
    const full = new WeaponState('smg', WEAPON_STATS.smg);
    expect(full.startReload(new Bag({ ammo_pistol: 99 }))).toBe(false);
  });
  it('cancelling a reload loses nothing', () => {
    const w = new WeaponState('shotgun', WEAPON_STATS.shotgun, 2);
    const ammo = new Bag({ ammo_shotgun: 12 });
    w.startReload(ammo);
    w.update(1, ammo);
    w.cancelReload();
    w.update(5, ammo);
    expect(w.mag).toBe(2);
    expect(ammo.count('ammo_shotgun')).toBe(12);
  });
  it('EconomyService consumes carried ammo and stores the magazine on the equipped item', () => {
    const { eco } = makeEconomy();
    eco.moveItem({ c: 'stash', i: 0 }, { c: 'carried' }); // 60 發 9mm
    expect(eco.startRaid('harbor_1990').ok).toBe(true);
    expect(eco.countCarried('ammo_pistol')).toBe(60);
    expect(eco.consumeCarried('ammo_pistol', 8)).toBe(8);
    expect(eco.consumeCarried('ammo_pistol', 999)).toBe(52);
    expect(eco.consumeCarried('ammo_pistol', 1)).toBe(0);
    eco.setEquipState('secondary', 5);
    expect(eco.profile.equipment.secondary?.dur).toBe(5);
    eco.setEquipState('secondary', 999);
    expect(eco.profile.equipment.secondary?.dur).toBe(WEAPON_STATS.pistol.magazine);
  });
  it('remaining magazine and armor durability survive extraction', () => {
    const { eco } = makeEconomy();
    eco.startRaid('harbor_1990');
    eco.setEquipState('secondary', 3);
    expect(eco.resolveRaid('extract').ok).toBe(true);
    expect(eco.profile.equipment.secondary?.dur).toBe(3);
  });
  it('spread grows with movement, air and bloom, shrinks when aiming or crouching', () => {
    const h = WEAPON_HANDLING.rifle;
    const base = { ads: false, speed: 0, sprinting: false, airborne: false, crouching: false, bloom: 0 };
    const idle = computeSpread(h, base);
    expect(idle).toBe(h.spreadHip);
    expect(computeSpread(h, { ...base, speed: 4 })).toBeGreaterThan(idle);
    expect(computeSpread(h, { ...base, airborne: true })).toBeGreaterThan(computeSpread(h, { ...base, speed: 4 }));
    expect(computeSpread(h, { ...base, ads: true })).toBeLessThan(idle);
    expect(computeSpread(h, { ...base, crouching: true })).toBeLessThan(idle);
    expect(computeSpread(h, { ...base, bloom: 2 })).toBe(idle + 2);
  });
  it('every weapon has handling data', () => {
    for (const id of Object.keys(WEAPON_STATS)) expect(WEAPON_HANDLING[id], id).toBeTruthy();
  });
});

describe('medical', () => {
  it('picks the smallest item that covers the missing hp, else the biggest', () => {
    expect(pickMedical(['medkit', 'bandage'], 15)).toBe('bandage');
    expect(pickMedical(['medkit', 'bandage'], 40)).toBe('medkit');
    expect(pickMedical(['bandage'], 90)).toBe('bandage');
    expect(pickMedical([], 50)).toBeNull();
    for (const m of Object.values(MEDICAL_STATS)) expect(m.heal).toBeGreaterThan(0);
  });
});

describe('enemy hit zones', () => {
  const feet = new THREE.Vector3(0, 0, 0);
  const fire = (y: number, x = 0) => {
    const o = new THREE.Vector3(x, y, 10);
    return intersectHitZones(o, new THREE.Vector3(0, 0, -1), feet, 0, 1.8);
  };
  it('classifies head / body / legs / arms by where the ray crosses', () => {
    expect(fire(1.6)?.zone).toBe('head');
    expect(fire(1.15)?.zone).toBe('body');
    expect(fire(0.4)?.zone).toBe('limb');
    expect(fire(1.15, 0.36)?.zone).toBe('limb'); // 手臂
    expect(fire(1.15, 0.8)).toBeNull();
    expect(fire(2.4)).toBeNull();
  });
  it('reports the distance and respects maxDist', () => {
    const h = fire(1.15)!;
    expect(h.distance).toBeGreaterThan(9.5);
    expect(h.distance).toBeLessThan(10);
    const o = new THREE.Vector3(0, 1.15, 10);
    expect(intersectHitZones(o, new THREE.Vector3(0, 0, -1), feet, 0, 1.8, 5)).toBeNull();
  });
});

describe('enemy data', () => {
  it('accuracy falls with distance', () => {
    for (const e of Object.values(ENEMIES)) {
      expect(accuracyAt(e.accuracy, 0)).toBeGreaterThan(accuracyAt(e.accuracy, 30));
      expect(accuracyAt(e.accuracy, 500)).toBe(e.accuracy[e.accuracy.length - 1][1]);
    }
  });
  it('enemy weapons and armor exist', () => {
    for (const e of Object.values(ENEMIES)) {
      for (const w of e.weapons) expect(WEAPON_STATS[w.id]).toBeTruthy();
      if (e.armorId) expect(ARMOR_STATS[e.armorId]).toBeTruthy();
    }
  });
});
