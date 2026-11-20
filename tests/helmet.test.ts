import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Enemy, type EnemyContext, type PlayerTarget } from '../src/ai/Enemy';
import { NavIndex } from '../src/ai/Nav';
import { buildCorpseLoot } from '../src/ai/CorpseLoot';
import { PlayerHealth } from '../src/combat/PlayerHealth';
import { EventBus, type GameEvents } from '../src/core/EventBus';
import { ENEMIES, rollEnemyHelmet, type Difficulty } from '../src/data/enemies';
import { HELMET_STATS, GEAR_ITEMS } from '../src/data/gear';
import {
  HEADSHOT_BASE, HELMET_TABLE, LOW_DUR_RATIO, effectiveHelmetLevel, enemyHeadshotChance, headshotDistMult, resolveHeadshot,
  type HelmetLevel, type WeaponClass,
} from '../src/data/helmet';
import { getItem } from '../src/data/items';
import { NOISE_RANGE } from '../src/data/noise';
import { WEAPON_STATS } from '../src/data/weapons';
import { DEFAULT_ERA } from '../src/data/eras';
import { mulberry32 } from '../src/items/LootTable';
import type { Slot } from '../src/items/Inventory';
import { PROFILE_VERSION, createDefaultProfile, fitProfile, migrateProfile, EQUIP_SLOTS } from '../src/items/Profile';
import { compareGear } from '../src/items/GearCompare';
import { findOverlaps, resolveAll, safeRect, defaultStore, ELEMENT_IDS, type Insets } from '../src/ui/layout/model';
import { giveCredits, makeEconomy } from './helpers';
import { RECIPES } from '../src/audio/Synth';
import { PROFILE_KEY } from '../src/items/Profile';

const P = (eco: unknown) => (eco as { p: import('../src/items/Profile').Profile }).p;
const LEVELS: HelmetLevel[] = [1, 2, 3, 4];
const hm = (level: HelmetLevel, ratio = 1) => {
  const max = HELMET_STATS[`helmet_${level}`].durability;
  return { level, dur: max * ratio, max };
};

describe('weapon classes', () => {
  it('pistol / smg are light, rifle / shotgun are heavy', () => {
    expect(WEAPON_STATS.pistol.weaponClass).toBe('light');
    expect(WEAPON_STATS.smg.weaponClass).toBe('light');
    expect(WEAPON_STATS.rifle.weaponClass).toBe('heavy');
    expect(WEAPON_STATS.shotgun.weaponClass).toBe('heavy');
  });
});

describe('headshot without a helmet is instant death', () => {
  for (const w of Object.keys(WEAPON_STATS)) {
    it(`${w}: lethal, no helmet hit`, () => {
      const r = resolveHeadshot(WEAPON_STATS[w].weaponClass, null, 100, () => 0.5);
      expect(r.lethal).toBe(true);
      expect(r.helmetHit).toBe(false);
      expect(r.damage).toBeGreaterThanOrEqual(100);
    });
  }
  it('a helmet with 0 durability counts as no helmet', () => {
    expect(resolveHeadshot('light', { level: 4, dur: 0, max: 80 }, 100).lethal).toBe(true);
    expect(effectiveHelmetLevel({ level: 4, dur: 0, max: 80 })).toBe(0);
  });
});

describe('helmet table: weapon class x helmet level', () => {
  // 預期：[lethal?, 最小比例, 最大比例]
  const expected: Record<WeaponClass, Record<HelmetLevel, [boolean, number, number]>> = {
    light: { 1: [false, 0.70, 0.85], 2: [false, 0.25, 0.35], 3: [false, 0.10, 0.20], 4: [false, 0.05, 0.10] },
    heavy: { 1: [true, 1, 1], 2: [true, 1, 1], 3: [false, 0.70, 0.85], 4: [false, 0.40, 0.55] },
  };
  for (const cls of ['light', 'heavy'] as const) {
    for (const lv of LEVELS) {
      const [lethal, lo, hi] = expected[cls][lv];
      it(`${cls} vs level ${lv}: ${lethal ? 'instant death' : `${lo * 100}-${hi * 100}% of max HP, survives with 1+ HP`}`, () => {
        const a = resolveHeadshot(cls, hm(lv), 100, () => 0);
        const b = resolveHeadshot(cls, hm(lv), 100, () => 0.999999);
        expect(a.lethal).toBe(lethal);
        expect(a.helmetHit).toBe(true);
        if (!lethal) {
          expect(a.damage).toBeCloseTo(lo * 100, 5);
          expect(b.damage).toBeCloseTo(hi * 100, 3);
          expect(b.damage).toBeLessThan(100); // 擋下：滿血不會死
        }
      });
    }
  }
  it('protection is monotonic: higher level never takes more damage', () => {
    for (const cls of ['light', 'heavy'] as const) {
      for (let lv = 1; lv < 4; lv++) {
        const a = HELMET_TABLE[cls][lv as HelmetLevel], b = HELMET_TABLE[cls][(lv + 1) as HelmetLevel];
        if (a.lethal) continue;
        expect(b.lethal).toBe(false);
        expect(b.dmg[1]).toBeLessThanOrEqual(a.dmg[0] + 1e-9);
      }
    }
  });
  it('scales with the target max HP (enemy 110 HP, level 3 vs rifle: 77-93.5 damage)', () => {
    const r = resolveHeadshot('heavy', hm(3), 110, () => 0);
    expect(r.damage).toBeCloseTo(77, 5);
  });
});

describe('helmet durability', () => {
  it('each blocked hit lowers durability by the table wear', () => {
    const h = hm(3);
    const r = resolveHeadshot('light', h, 100, () => 0.5);
    expect(r.durLoss).toBeCloseTo(h.max * HELMET_TABLE.light[3].wear);
    expect(r.durAfter).toBeCloseTo(h.dur - r.durLoss);
  });
  it('a rifle hit on level 3 wears the helmet a lot more than a pistol hit', () => {
    const light = resolveHeadshot('light', hm(3), 100).durLoss;
    const heavy = resolveHeadshot('heavy', hm(3), 100).durLoss;
    expect(heavy).toBeGreaterThanOrEqual(light * 4);
  });
  it('below 30% durability protection drops one level', () => {
    const max = HELMET_STATS.helmet_3.durability;
    expect(LOW_DUR_RATIO).toBe(0.3);
    expect(effectiveHelmetLevel({ level: 3, dur: max * 0.31, max })).toBe(3);
    expect(effectiveHelmetLevel({ level: 3, dur: max * 0.29, max })).toBe(2);
    // 3 級降成 2 級後擋不住步槍
    expect(resolveHeadshot('heavy', { level: 3, dur: max * 0.29, max }, 100).lethal).toBe(true);
    // 降級後對手槍用 2 級的表
    const r = resolveHeadshot('light', { level: 3, dur: max * 0.29, max }, 100, () => 0);
    expect(r.effLevel).toBe(2);
    expect(r.damage).toBeCloseTo(25, 5);
    // 1 級降級 = 沒戴
    const m1 = HELMET_STATS.helmet_1.durability;
    expect(resolveHeadshot('light', { level: 1, dur: m1 * 0.2, max: m1 }, 100).lethal).toBe(true);
  });
  it('durability never goes below zero', () => {
    const r = resolveHeadshot('heavy', { level: 3, dur: 3, max: 60 }, 100);
    expect(r.durAfter).toBeGreaterThanOrEqual(0);
  });
  it('repeated pistol headshots on a level 3 helmet: it holds for many hits, then degrades, then fails', () => {
    let h = hm(3);
    const outcomes: boolean[] = [];
    for (let i = 0; i < 40; i++) {
      const r = resolveHeadshot('light', h, 100, () => 0.5);
      outcomes.push(r.lethal);
      h = { ...h, dur: r.durAfter };
    }
    expect(outcomes[0]).toBe(false);
    expect(outcomes.slice(0, 8).every((x) => !x)).toBe(true);
  });
});

describe('shotgun pellets are resolved one by one against the remaining durability', () => {
  it('level 3: first pellet is blocked (survives with 1+ HP), helmet wears, second pellet finishes the target', () => {
    let h = hm(3);
    let hp = 100;
    const log: { lethal: boolean; hp: number; dur: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const r = resolveHeadshot('heavy', h, 100, () => 0);
      h = { ...h, dur: r.durAfter };
      hp = r.lethal ? 0 : hp - r.damage;
      log.push({ lethal: r.lethal, hp, dur: h.dur });
      if (hp <= 0) break;
    }
    expect(log[0].lethal).toBe(false);
    expect(log[0].hp).toBeGreaterThan(0);
    expect(log[0].dur).toBeLessThan(hm(3).dur);
    expect(log[log.length - 1].hp).toBeLessThanOrEqual(0);
    expect(log.length).toBeLessThanOrEqual(2);
  });
  it('level 4 survives more pellets than level 3', () => {
    const count = (lv: HelmetLevel) => {
      let h = hm(lv), hp = 100, n = 0;
      while (hp > 0 && n < 20) {
        const r = resolveHeadshot('heavy', h, 100, () => 0.5);
        h = { ...h, dur: r.durAfter };
        hp = r.lethal ? 0 : hp - r.damage;
        n++;
      }
      return n;
    };
    expect(count(4)).toBeGreaterThan(count(3));
    expect(count(3)).toBeGreaterThanOrEqual(2);
  });
});

describe('enemy headshot chance table (difficulty x distance x kind)', () => {
  it('difficulty base 2% / 4% / 7%', () => {
    expect(HEADSHOT_BASE).toEqual({ 1: 0.02, 2: 0.04, 3: 0.07 });
  });
  it('distance multiplier: within 5m x1.5, beyond 25m x0.4, otherwise x1', () => {
    expect(headshotDistMult(0)).toBe(1.5);
    expect(headshotDistMult(5)).toBe(1.5);
    expect(headshotDistMult(5.1)).toBe(1);
    expect(headshotDistMult(25)).toBe(1);
    expect(headshotDistMult(25.1)).toBe(0.4);
    expect(headshotDistMult(90)).toBe(0.4);
  });
  it('kind coefficients: guard 0.8, thug 0.8, rival agent 1.3', () => {
    expect(ENEMIES.guard.headCoef).toBe(0.8);
    expect(ENEMIES.thug.headCoef).toBe(0.8);
    expect(ENEMIES.rival_agent.headCoef).toBe(1.3);
  });
  it('combined chance', () => {
    expect(enemyHeadshotChance(1, 10, ENEMIES.guard.headCoef)).toBeCloseTo(0.02 * 0.8);
    expect(enemyHeadshotChance(2, 3, ENEMIES.thug.headCoef)).toBeCloseTo(0.04 * 1.5 * 0.8);
    expect(enemyHeadshotChance(3, 30, ENEMIES.rival_agent.headCoef)).toBeCloseTo(0.07 * 0.4 * 1.3);
    expect(enemyHeadshotChance(3, 3, ENEMIES.rival_agent.headCoef)).toBeCloseTo(0.07 * 1.5 * 1.3);
    // 單調：難度越高、越近、越強的敵人機率越高
    expect(enemyHeadshotChance(3, 10, 1)).toBeGreaterThan(enemyHeadshotChance(2, 10, 1));
    expect(enemyHeadshotChance(2, 3, 1)).toBeGreaterThan(enemyHeadshotChance(2, 10, 1));
    expect(enemyHeadshotChance(2, 10, 1)).toBeGreaterThan(enemyHeadshotChance(2, 40, 1));
    expect(enemyHeadshotChance(1, 3, 1.3)).toBeLessThan(0.1);
  });
});

// ---------------------------------------------------------------- 敵人實際開槍：爆頭擲骰
function makeEnemy(kind: 'guard' | 'thug' | 'rival_agent', difficulty: Difficulty, rng: () => number) {
  const bus = new EventBus<GameEvents>();
  const hits: { zone: string; wc: string }[] = [];
  const player: PlayerTarget = { feet: new THREE.Vector3(8, 0, 0), eye: new THREE.Vector3(8, 1.6, 0), crouching: false, sprinting: false, moving: false, alive: true };
  const ctx = {
    bus, mover: { los: () => true }, nav: new NavIndex({ nodes: [new THREE.Vector3()], edges: [] }),
    fx: { muzzleFlash() {}, tracer() {}, impact() {} }, trace: { cast: () => null }, player,
    lightAt: () => 1, damagePlayer: (_b: number, zone: string, _f: unknown, _k: string, wc: string) => { hits.push({ zone, wc }); },
    alertGroup: () => {}, onDeath: () => {}, castShadow: false, all: [], surfaceAt: () => 'concrete', difficulty, rng,
  } as unknown as EnemyContext;
  const e = new Enemy(ENEMIES[kind], { kind, position: new THREE.Vector3(0, 0, 0), yaw: 0 }, ctx);
  return { e, hits, bus };
}

describe('enemy shots roll headshots with the table', () => {
  it('rng 0: head on the first hitting pellet only (shotgun does not get 8 head pellets)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // 每顆都命中
    const { e, hits } = makeEnemy('thug', 3, () => 0);
    // 強制使用霰彈槍
    (e as unknown as { stats: unknown }).stats = WEAPON_STATS.shotgun;
    (e as unknown as { shoot(d: number): void }).shoot(4);
    vi.restoreAllMocks();
    expect(hits.length).toBe(8);
    expect(hits.filter((h) => h.zone === 'head').length).toBe(1);
    expect(hits.every((h) => h.wc === 'heavy')).toBe(true);
  });
  it('rng ~1: never a headshot', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { e, hits } = makeEnemy('rival_agent', 3, () => 0.9999);
    for (let i = 0; i < 20; i++) (e as unknown as { shoot(d: number): void }).shoot(4);
    vi.restoreAllMocks();
    expect(hits.some((h) => h.zone === 'head')).toBe(false);
  });
  it('observed head rate follows difficulty, distance and kind', () => {
    const rate = (kind: 'guard' | 'thug' | 'rival_agent', d: Difficulty, dist: number): number => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const { e, hits } = makeEnemy(kind, d, mulberry32(1234));
      const N = 4000;
      for (let i = 0; i < N; i++) (e as unknown as { shoot(x: number): void }).shoot(dist);
      vi.restoreAllMocks();
      return hits.filter((h) => h.zone === 'head').length / hits.length;
    };
    const tol = 0.012;
    expect(rate('guard', 1, 10)).toBeCloseTo(enemyHeadshotChance(1, 10, 0.8), 1);
    expect(Math.abs(rate('guard', 1, 10) - 0.016)).toBeLessThan(tol);
    expect(Math.abs(rate('rival_agent', 3, 4) - 0.07 * 1.5 * 1.3)).toBeLessThan(0.02);
    expect(rate('rival_agent', 3, 4)).toBeGreaterThan(rate('rival_agent', 3, 12));
    expect(rate('rival_agent', 3, 12)).toBeGreaterThan(rate('rival_agent', 3, 20) * 0.9);
    expect(rate('thug', 2, 12)).toBeGreaterThan(rate('thug', 1, 12));
  });
});

// ---------------------------------------------------------------- 敵人挨打
describe('player shooting an enemy in the head', () => {
  const from = new THREE.Vector3();
  const mk = (kind: 'guard' | 'thug' | 'rival_agent', helmet?: { id: string; dur: number } | null) => {
    const m = makeEnemy(kind, 2, mulberry32(5));
    if (helmet !== undefined) { m.e.helmetId = helmet?.id ?? null; m.e.helmetDur = helmet?.dur ?? 0; }
    return m;
  };
  it('guard has no helmet and dies to a single pistol headshot', () => {
    expect(ENEMIES.guard.helmet).toBeUndefined();
    const { e } = mk('guard');
    expect(e.helmetId).toBeNull();
    const r = e.takeHit(24, 'head', from, 'light');
    expect(r.killed).toBe(true);
    expect(e.dead).toBe(true);
    expect(e.killedByHeadshot).toBe(true);
  });
  it('rival agent (level 3): pistol headshot survives and pings; two rifle headshots kill', () => {
    const { e, bus } = mk('rival_agent', { id: 'helmet_3', dur: 60 });
    const pings: unknown[] = [];
    bus.on('noise', (n) => { if (n.kind === 'helmet_ping') pings.push(n); });
    const r1 = e.takeHit(24, 'head', from, 'light');
    expect(r1.killed).toBe(false);
    expect(e.hp).toBeGreaterThan(0);
    expect(e.helmetDur).toBeLessThan(60);
    expect(pings.length).toBe(1);
    // 重新來一隻，滿耐久：步槍第 1 發擋下、第 2 發死
    const m2 = mk('rival_agent', { id: 'helmet_3', dur: 60 });
    const a = m2.e.takeHit(36, 'head', from, 'heavy');
    expect(a.killed).toBe(false);
    expect(m2.e.hp).toBeGreaterThan(0);
    const b = m2.e.takeHit(36, 'head', from, 'heavy');
    expect(b.killed).toBe(true);
    expect(m2.e.killedByHeadshot).toBe(true);
  });
  it('level 1 thug helmet stops a pistol shot but not a rifle', () => {
    const a = mk('thug', { id: 'helmet_1', dur: 30 });
    expect(a.e.takeHit(24, 'head', from, 'light').killed).toBe(false);
    const b = mk('thug', { id: 'helmet_1', dur: 30 });
    expect(b.e.takeHit(36, 'head', from, 'heavy').killed).toBe(true);
  });
  it('body and limb hits are unaffected by the helmet', () => {
    const { e } = mk('rival_agent', { id: 'helmet_3', dur: 60 });
    const before = e.helmetDur;
    e.takeHit(24, 'body', from, 'light');
    expect(e.helmetDur).toBe(before);
  });
  it('helmet pings carry a 15 m noise range and use the enemy as source', () => {
    expect(NOISE_RANGE.helmet_ping).toBe(15);
    const { e, bus } = mk('rival_agent', { id: 'helmet_3', dur: 60 });
    const ev: { source: string }[] = [];
    bus.on('noise', (n) => { if (n.kind === 'helmet_ping') ev.push(n); });
    e.takeHit(24, 'head', from, 'light');
    expect(ev[0].source).toBe(e.id);
  });
});

describe('enemy helmet spawn rules', () => {
  it('guards: none; thugs: 40% level 1; rival agents: level 3 with 60-100% durability', () => {
    const dur = (id: string) => HELMET_STATS[id].durability;
    expect(rollEnemyHelmet(ENEMIES.guard, dur, () => 0)).toBeNull();
    let n = 0;
    const rng = mulberry32(99);
    for (let i = 0; i < 2000; i++) if (rollEnemyHelmet(ENEMIES.thug, dur, rng)) n++;
    expect(n / 2000).toBeGreaterThan(0.35);
    expect(n / 2000).toBeLessThan(0.45);
    const lo = rollEnemyHelmet(ENEMIES.rival_agent, dur, () => 0)!;
    const hi = rollEnemyHelmet(ENEMIES.rival_agent, dur, () => 0.9999)!;
    expect(lo.id).toBe('helmet_3');
    expect(lo.dur).toBe(Math.round(60 * 0.6));
    expect(hi.dur).toBe(60);
    const t = rollEnemyHelmet(ENEMIES.thug, dur, () => 0)!;
    expect(t.id).toBe('helmet_1');
  });
  it('corpses drop the helmet with its remaining durability; destroyed helmets do not drop', () => {
    const src = { def: ENEMIES.rival_agent, weaponId: 'rifle', mag: 3, reserve: 0, ammoType: 'ammo_rifle', armorDur: 40 };
    const loot = buildCorpseLoot({ ...src, helmet: { id: 'helmet_3', dur: 41.6 } }, DEFAULT_ERA, () => 0.5);
    const h = loot.find((s) => s.id === 'helmet_3');
    expect(h).toEqual({ id: 'helmet_3', qty: 1, dur: 42 });
    expect(buildCorpseLoot({ ...src, helmet: { id: 'helmet_3', dur: 0 } }, DEFAULT_ERA, () => 0.5).some((s) => s.id === 'helmet_3')).toBe(false);
    expect(buildCorpseLoot({ ...src, helmet: null }, DEFAULT_ERA, () => 0.5).some((s) => s.id === 'helmet_3')).toBe(false);
  });
});

// ---------------------------------------------------------------- 玩家挨打
function makeHealth(helmet: { id: string; dur?: number } | null) {
  const { eco } = makeEconomy();
  if (helmet) P(eco).equipment.helmet = helmet.dur === undefined ? { id: helmet.id, qty: 1 } : { id: helmet.id, qty: 1, dur: helmet.dur };
  const bus = new EventBus<GameEvents>();
  const player = { position: new THREE.Vector3(), surface: 'concrete', shake() {} };
  const events: { amount: number; helmet?: boolean; head?: boolean; killed: boolean }[] = [];
  const pings: unknown[] = [];
  bus.on('playerHurt', (e) => events.push(e));
  bus.on('noise', (n) => { if (n.kind === 'helmet_ping') pings.push(n); });
  const hp = new PlayerHealth(bus, eco, player as never);
  return { hp, eco, events, pings, bus };
}

describe('player headshot rules', () => {
  it('no helmet: every weapon kills instantly and the kill is flagged as a headshot', () => {
    for (const w of Object.keys(WEAPON_STATS)) {
      const { hp } = makeHealth(null);
      let headshot = false;
      hp.onDeath = (_k, h) => { headshot = h; };
      hp.hit(WEAPON_STATS[w].damage, 'head', undefined, '敵人', WEAPON_STATS[w].weaponClass);
      expect(hp.dead, w).toBe(true);
      expect(headshot, w).toBe(true);
      expect(hp.killedByHeadshot).toBe(true);
    }
  });
  it('level 2 helmet vs pistol headshot: survives with ~25-35 damage, pings, durability drops', () => {
    const { hp, events, pings } = makeHealth({ id: 'helmet_2' });
    hp.hit(24, 'head', undefined, '敵人', 'light');
    expect(hp.dead).toBe(false);
    expect(100 - hp.hp).toBeGreaterThanOrEqual(25);
    expect(100 - hp.hp).toBeLessThanOrEqual(35);
    expect(hp.helmetDur).toBeLessThan(45);
    expect(events[0].helmet).toBe(true);
    expect(events[0].head).toBe(true);
    expect(pings.length).toBe(1);
  });
  it('level 2 helmet vs rifle: instant death; level 3 vs rifle: survives with 15-30 HP left', () => {
    const a = makeHealth({ id: 'helmet_2' });
    a.hp.hit(36, 'head', undefined, '敵人', 'heavy');
    expect(a.hp.dead).toBe(true);
    const b = makeHealth({ id: 'helmet_3' });
    b.hp.hit(36, 'head', undefined, '敵人', 'heavy');
    expect(b.hp.dead).toBe(false);
    expect(b.hp.hp).toBeGreaterThanOrEqual(15);
    expect(b.hp.hp).toBeLessThanOrEqual(30);
  });
  it('level 1 helmet vs pistol: survives with 15-30 HP (never one-shot from full health)', () => {
    for (let i = 0; i < 30; i++) {
      const { hp } = makeHealth({ id: 'helmet_1' });
      hp.hit(24, 'head', undefined, '敵人', 'light', mulberry32(i));
      expect(hp.dead).toBe(false);
      expect(hp.hp).toBeGreaterThanOrEqual(15);
      expect(hp.hp).toBeLessThanOrEqual(30);
    }
  });
  it('shotgun pellets one by one: level 3 helmet survives the first pellet, second finishes it', () => {
    const { hp, pings } = makeHealth({ id: 'helmet_3' });
    hp.hit(12, 'head', undefined, '敵人', 'heavy');
    expect(hp.dead).toBe(false);
    hp.hit(12, 'head', undefined, '敵人', 'heavy');
    expect(hp.dead).toBe(true);
    expect(pings.length).toBe(1); // 同一次齊射只響一次
  });
  it('a low-durability helmet is downgraded: level 3 at 20% durability no longer stops rifles', () => {
    const { hp } = makeHealth({ id: 'helmet_3', dur: 12 });
    expect(hp.helmetEffLevel).toBe(2);
    hp.hit(36, 'head', undefined, '敵人', 'heavy');
    expect(hp.dead).toBe(true);
  });
  it('helmet durability is written back to the equipped item on flush', () => {
    const { hp, eco } = makeHealth({ id: 'helmet_4' });
    hp.hit(24, 'head', undefined, '敵人', 'light');
    hp.flush();
    expect(eco.profile.equipment.helmet!.dur).toBeLessThan(80);
    expect(eco.profile.equipment.helmet!.dur).toBe(Math.round(hp.helmetDur));
  });
  it('a destroyed helmet (0 durability) no longer protects', () => {
    const { hp } = makeHealth({ id: 'helmet_4', dur: 0 });
    hp.hit(24, 'head', undefined, '敵人', 'light');
    expect(hp.dead).toBe(true);
  });
  it('body shots do not touch the helmet', () => {
    const { hp } = makeHealth({ id: 'helmet_3' });
    hp.hit(24, 'body', undefined, '敵人', 'light');
    expect(hp.helmetDur).toBe(60);
    expect(hp.dead).toBe(false);
  });
});

// ---------------------------------------------------------------- 物品、商店、裝備、存檔
describe('helmet items', () => {
  it('four levels, sold in the shop at the intended prices, with durability', () => {
    expect(GEAR_ITEMS.filter((i) => i.category === 'helmet').map((i) => i.id)).toEqual(['helmet_1', 'helmet_2', 'helmet_3', 'helmet_4']);
    const { eco } = makeEconomy();
    const price = (id: string) => eco.buyPriceOf(id);
    // 約 800 / 2500 / 7000 / 16000（每日浮動 ±10%）
    expect(price('helmet_1')).toBeGreaterThan(700); expect(price('helmet_1')).toBeLessThan(900);
    expect(price('helmet_2')).toBeGreaterThan(2250); expect(price('helmet_2')).toBeLessThan(2800);
    expect(price('helmet_3')).toBeGreaterThan(6300); expect(price('helmet_3')).toBeLessThan(7800);
    expect(price('helmet_4')).toBeGreaterThan(14400); expect(price('helmet_4')).toBeLessThan(17600);
    expect(getItem('helmet_3')!.category).toBe('helmet');
  });
  it('buying puts a full-durability helmet in the stash; equip from stash; swap returns the old one', () => {
    const { eco } = makeEconomy();
    giveCredits(eco, 20000);
    expect(eco.buy('helmet_2').ok).toBe(true);
    const stash = eco.view('stash');
    const i = stash.slots.findIndex((s) => s?.id === 'helmet_2');
    expect(stash.slots[i]).toEqual({ id: 'helmet_2', qty: 1, dur: 45 });
    expect(eco.equip({ c: 'stash', i }).ok).toBe(true);
    expect(eco.profile.equipment.helmet).toEqual({ id: 'helmet_2', qty: 1, dur: 45 });
    expect(eco.view('stash').slots[i]).toBeNull();
    // 再買一頂 3 級，換上去：舊的回到同一格
    expect(eco.buy('helmet_3').ok).toBe(true);
    const j = eco.view('stash').slots.findIndex((s) => s?.id === 'helmet_3');
    expect(eco.equip({ c: 'stash', i: j }).ok).toBe(true);
    expect(eco.profile.equipment.helmet!.id).toBe('helmet_3');
    expect(eco.view('stash').slots[j]).toEqual({ id: 'helmet_2', qty: 1, dur: 45 });
    // 只能裝在頭盔欄
    expect(eco.equip({ c: 'stash', i: j }, 'armor').ok).toBe(false);
    expect(eco.unequip('helmet', 'stash').ok).toBe(true);
    expect(eco.profile.equipment.helmet).toBeNull();
  });
  it('equip from a corpse (equipFromContainer) keeps durability, swaps the old helmet into the container or backpack', () => {
    const { eco } = makeEconomy();
    expect(eco.startRaid(DEFAULT_ERA).ok).toBe(true);
    const loot: Slot[] = [{ id: 'helmet_3', qty: 1, dur: 37 }, { id: 'bandage', qty: 1 }];
    const r = eco.equipFromContainer(loot, 0);
    expect(r.ok && r.slot).toBe('helmet');
    expect(eco.profile.equipment.helmet).toEqual({ id: 'helmet_3', qty: 1, dur: 37 });
    expect(loot[0]).toBeNull();
    // 交換
    const loot2: Slot[] = [{ id: 'helmet_1', qty: 1, dur: 22 }];
    const r2 = eco.equipFromContainer(loot2, 0);
    expect(r2.ok && r2.replacedTo).toBe('container');
    expect(loot2[0]).toEqual({ id: 'helmet_3', qty: 1, dur: 37 });
    const loot3: Slot[] = [{ id: 'helmet_4', qty: 1 }];
    const r3 = eco.equipFromContainer(loot3, 0, { dest: 'carried' });
    expect(r3.ok && r3.replacedTo).toBe('carried');
    expect(eco.view('carried').slots.some((s) => s?.id === 'helmet_1' && s.dur === 22)).toBe(true);
  });
  it('compareGear lists level, durability and rifle protection for helmets', () => {
    const rows = compareGear({ id: 'helmet_3', qty: 1, dur: 50 }, { id: 'helmet_1', qty: 1, dur: 20 });
    const lvl = rows.find((r) => r.label === '等級')!;
    expect(lvl.dir).toBe('up');
    expect(rows.find((r) => r.label === '擋步槍爆頭')!.to).toBe('可');
    expect(rows.find((r) => r.label === '擋步槍爆頭')!.from).toBe('不可');
    expect(compareGear({ id: 'helmet_2', qty: 1 }, null).every((r) => r.from === null)).toBe(true);
  });
  it('death loses the equipped helmet, like other gear', () => {
    const { eco } = makeEconomy();
    P(eco).equipment.helmet = { id: 'helmet_2', qty: 1, dur: 40 };
    expect(eco.startRaid(DEFAULT_ERA).ok).toBe(true);
    const r = eco.resolveRaid('death');
    expect(r.ok && r.result.items.some((s) => s.id === 'helmet_2')).toBe(true);
    expect(eco.profile.equipment.helmet).toBeNull();
  });
});

describe('save migration', () => {
  it('current version is 2 and defaults include an empty helmet slot', () => {
    expect(PROFILE_VERSION).toBe(2);
    expect(createDefaultProfile().equipment.helmet).toBeNull();
    expect(EQUIP_SLOTS).toContain('helmet');
  });
  it('v1 saves (no helmet field) get an empty helmet slot and version 2, keeping everything else', () => {
    const v1 = { ...createDefaultProfile(), version: 1, credits: 4321 } as unknown as Record<string, unknown>;
    delete (v1.equipment as Record<string, unknown>).helmet;
    expect('helmet' in (v1.equipment as object)).toBe(false);
    const p = migrateProfile(v1);
    expect(p.version).toBe(2);
    expect(p.equipment.helmet).toBeNull();
    expect(p.credits).toBe(4321);
    expect(p.equipment.secondary).toEqual({ id: 'pistol', qty: 1 });
  });
  it('v0 saves migrate all the way', () => {
    const p = migrateProfile({ money: 999, stash: [{ id: 'bandage', count: 2 }] });
    expect(p.version).toBe(2);
    expect(p.credits).toBe(999);
    expect(p.equipment.helmet).toBeNull();
  });
  it('a v1 save is upgraded through EconomyService load and survives with durability intact', () => {
    const { save } = makeEconomy();
    const v1 = { ...createDefaultProfile(), version: 1 } as unknown as Record<string, unknown>;
    delete (v1.equipment as Record<string, unknown>).helmet;
    save.set(PROFILE_KEY, v1);
    const { eco } = makeEconomy(save);
    expect(eco.profile.version).toBe(2);
    expect(eco.profile.equipment.helmet).toBeNull();
  });
  it('fitProfile keeps a helmet with durability and drops one in the wrong slot', () => {
    const p = createDefaultProfile();
    p.equipment.helmet = { id: 'helmet_4', qty: 1, dur: 55 };
    expect(fitProfile(p).equipment.helmet).toEqual({ id: 'helmet_4', qty: 1, dur: 55 });
    p.equipment.helmet = { id: 'armor_1', qty: 1 };
    expect(fitProfile(p).equipment.helmet).toBeNull();
    p.equipment.armor = { id: 'helmet_1', qty: 1 };
    expect(fitProfile(p).equipment.armor).toBeNull();
  });
});

describe('audio and layout', () => {
  it('has synth recipes for the helmet ping and the tinnitus', () => {
    expect('impacts.helmet_ping' in RECIPES).toBe(true);
    expect('sfx.tinnitus' in RECIPES).toBe(true);
  });
  const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const DEVICES: [string, number, number, Insets][] = [
    ['iPhone 16 Pro 874x402', 874, 402, { top: 0, right: 59, bottom: 21, left: 59 }],
    ['iPhone 13-15 844x390', 844, 390, { top: 0, right: 47, bottom: 21, left: 47 }],
    ['iPhone SE 667x375', 667, 375, NONE],
    ['Android 915x412', 915, 412, NONE],
    ['iPad landscape 1024x768', 1024, 768, { top: 0, right: 0, bottom: 20, left: 0 }],
  ];
  for (const [name, w, h, ins] of DEVICES) {
    it(`${name}: the helmet HUD element exists, sits below the armor bar and overlaps nothing`, () => {
      expect(ELEMENT_IDS).toContain('helmet');
      const rects = resolveAll(defaultStore().slots[0], safeRect(w, h, ins));
      expect(findOverlaps(rects)).toEqual([]);
      expect(rects.helmet.y).toBeGreaterThanOrEqual(rects.armor.y + rects.armor.h - 0.5);
    });
  }
});
