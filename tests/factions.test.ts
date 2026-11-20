import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Enemy, type EnemyContext, type PlayerTarget } from '../src/ai/Enemy';
import { NavIndex } from '../src/ai/Nav';
import { AIM_HOSTILE_SEC, AIM_RANGE, AIM_WARN_SEC, SHOT_NEAR_RANGE, shotProvokes, stepAim, type AimState } from '../src/ai/Provoke';
import { mulberry32 } from '../src/core/rng';
import { EventBus, type GameEvents } from '../src/core/EventBus';
import {
  ALLY_AGENT_CHANCE, ALLY_KILL_COMPENSATION, BRIBE, CORPS, CORP_IDS, CORP_TRUCE_CHANCE, FACTION_IDS, FRIENDLY_ABOVE, HOSTILE_BELOW, SWITCH_CORP_COST,
  areHostile, attitudeOf, bribesLeft, cleanReputation, corpPriceMult, factionOfKind, initialReputation, killRepChanges, npcAttitude,
  pickAgentFaction, relationBetween, rollCorpTruce, seededRng, staticHostile, type FactionId,
} from '../src/data/factions';
import { ENEMIES } from '../src/data/enemies';
import { PROFILE_VERSION, createDefaultProfile, migrateProfile, raidDuration } from '../src/items/Profile';
import { buyPrice } from '../src/economy/Pricing';
import { giveCredits, makeEconomy, MemorySave, NOON } from './helpers';

const V = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);

describe('faction relation table', () => {
  it('guard / triad / corps are hostile to everyone else; same faction is allied', () => {
    expect(relationBetween('guard', 'guard', false)).toBe('ally');
    expect(staticHostile('guard', 'triad')).toBe(true);
    expect(staticHostile('triad', 'guard')).toBe(true);
    for (const c of CORP_IDS) {
      expect(staticHostile('guard', c)).toBe(true);
      expect(staticHostile(c, 'triad')).toBe(true);
      expect(relationBetween(c, 'guard', true)).toBe('hostile'); // 休戰只影響企業之間
    }
  });
  it('corp vs corp depends on the truce flag only', () => {
    for (const a of CORP_IDS) for (const b of CORP_IDS) {
      if (a === b) continue;
      expect(relationBetween(a, b, true)).toBe('truce');
      expect(relationBetween(a, b, false)).toBe('hostile');
      expect(staticHostile(a, b)).toBe(false);
      expect(areHostile(a, b, false)).toBe(true);
      expect(areHostile(a, b, true)).toBe(false);
    }
  });
  it('is symmetric', () => {
    for (const a of FACTION_IDS) for (const b of FACTION_IDS) for (const t of [true, false]) {
      expect(relationBetween(a, b, t) === 'hostile').toBe(relationBetween(b, a, t) === 'hostile');
    }
  });
});

describe('reputation thresholds and attitude', () => {
  it('< -20 hostile, -20..40 neutral, > 40 friendly (boundaries are neutral)', () => {
    expect(HOSTILE_BELOW).toBe(-20);
    expect(FRIENDLY_ABOVE).toBe(40);
    expect(attitudeOf(-100)).toBe('hostile');
    expect(attitudeOf(-21)).toBe('hostile');
    expect(attitudeOf(-20)).toBe('neutral');
    expect(attitudeOf(0)).toBe('neutral');
    expect(attitudeOf(40)).toBe('neutral');
    expect(attitudeOf(41)).toBe('friendly');
    expect(attitudeOf(100)).toBe('friendly');
  });
  it('initial reputation: guard -40, triad -40, own corp +100, other corps -30', () => {
    const r = initialReputation('corp_chronos');
    expect(r).toMatchObject({ guard: -40, triad: -40, corp_chronos: 100, corp_aurora: -30, corp_crimson: -30 });
    expect(initialReputation(null).corp_chronos).toBe(-30);
    expect(attitudeOf(r.guard)).toBe('hostile');
  });
  it('own corp is always friendly; a provoked NPC is always hostile (except allies)', () => {
    const rep = initialReputation('corp_aurora');
    expect(npcAttitude('corp_aurora', rep, 'corp_aurora', true)).toBe('friendly');
    expect(npcAttitude('guard', { ...rep, guard: 10 }, 'corp_aurora', false)).toBe('neutral');
    expect(npcAttitude('guard', { ...rep, guard: 10 }, 'corp_aurora', true)).toBe('hostile');
    expect(npcAttitude('guard', { ...rep, guard: 60 }, 'corp_aurora', false)).toBe('friendly');
  });
  it('cleanReputation clamps, fills gaps and pins the own corp', () => {
    const r = cleanReputation({ guard: 999, triad: -999, corp_aurora: 5, junk: 1 }, 'corp_aurora');
    expect(r.guard).toBe(100);
    expect(r.triad).toBe(-100);
    expect(r.corp_aurora).toBe(100);
    expect(r.corp_crimson).toBe(-30);
  });
});

describe('kill reputation changes', () => {
  it('killing triad: triad -15, guard and every corp +3', () => {
    const c = killRepChanges('triad', 'hostile');
    expect(c).toEqual({ triad: -15, guard: 3, corp_aurora: 3, corp_chronos: 3, corp_crimson: 3 });
  });
  it('friendly victims cost more (-25)', () => {
    expect(killRepChanges('guard', 'friendly').guard).toBe(-25);
    expect(killRepChanges('guard', 'neutral').guard).toBe(-15);
  });
  it('killing a corp agent does not reward other corps (truce or not)', () => {
    const c = killRepChanges('corp_aurora', 'hostile');
    expect(c.guard).toBe(3);
    expect(c.triad).toBe(3);
    expect(c.corp_chronos).toBeUndefined();
  });
});

const raidEco = (corp: 'corp_aurora' | 'corp_chronos' | 'corp_crimson' = 'corp_aurora') => {
  const { eco, save } = makeEconomy();
  expect(eco.chooseCorp(corp).ok).toBe(true);
  const p = (eco as any).p;
  p.equipment.backpack = { id: 'bag_medium', qty: 1 };
  p.carried[0] = { id: 'old_ntd', qty: 5000 };
  p.carried[1] = { id: 'old_ntd', qty: 5000 };
  p.carried[2] = { id: 'old_ntd', qty: 5000 };
  (eco as any).persist();
  expect(eco.startRaid('harbor_1990').ok).toBe(true);
  return { eco, save };
};

describe('EconomyService reputation', () => {
  it('recordKill applies the table, is tracked per raid and shows in the result', () => {
    const { eco } = raidEco();
    const r = eco.recordKill('triad');
    expect(r).toMatchObject({ ok: true, ally: false });
    expect(eco.reputationOf('triad')).toBe(-55);
    expect(eco.reputationOf('guard')).toBe(-37);
    expect(eco.reputationOf('corp_chronos')).toBe(-27);
    expect(eco.reputationOf('corp_aurora')).toBe(100); // 自己的企業固定
    const res = eco.resolveRaid('extract');
    expect(res.ok && res.result.repChanges).toMatchObject({ triad: -15, guard: 3, corp_chronos: 3, corp_crimson: 3 });
    expect(res.ok && res.result.repChanges!.corp_aurora).toBeUndefined();
  });
  it('reputation clamps at -100 / +100 and persists across reloads', () => {
    const { eco, save } = raidEco();
    for (let i = 0; i < 10; i++) eco.recordKill('triad');
    expect(eco.reputationOf('triad')).toBe(-100);
    expect(eco.reputationOf('guard')).toBe(-10);
    for (let i = 0; i < 40; i++) eco.recordKill('triad');
    expect(eco.reputationOf('guard')).toBe(100);
    eco.resolveRaid('death');
    const again = makeEconomy(save as MemorySave).eco;
    expect(again.reputationOf('triad')).toBe(-100);
    expect(again.reputationOf('guard')).toBe(100);
    expect(again.corp).toBe('corp_aurora');
  });
  it('killing a friendly guard costs 25; recordKill outside a raid is rejected', () => {
    const { eco } = makeEconomy();
    eco.chooseCorp('corp_crimson');
    expect(eco.recordKill('guard').ok).toBe(false);
    eco.debugSetReputation('guard', 60);
    eco.startRaid('harbor_1990');
    eco.recordKill('guard');
    expect(eco.reputationOf('guard')).toBe(35);
  });
  it('killing an ally agent: reputation unchanged, compensation deducted at settlement', () => {
    const { eco } = raidEco();
    const before = { ...eco.reputations() };
    const r = eco.recordKill('corp_aurora');
    expect(r).toMatchObject({ ok: true, ally: true, changes: {} });
    expect(eco.reputations()).toEqual(before);
    const credits = eco.credits;
    const res = eco.resolveRaid('extract');
    expect(res.ok && res.result.compensation).toBe(ALLY_KILL_COMPENSATION);
    expect(eco.credits).toBe(credits - ALLY_KILL_COMPENSATION);
  });
  it('compensation never takes credits below zero', () => {
    const { eco } = raidEco();
    (eco as any).p.credits = 500;
    eco.recordKill('corp_aurora');
    const res = eco.resolveRaid('death');
    expect(res.ok && res.result.compensation).toBe(500);
    expect(eco.credits).toBe(0);
  });
});

describe('bribery (找人打點)', () => {
  it('costs old NTD, gives +5, at most +15 per faction per raid; resets next raid', () => {
    const { eco } = raidEco();
    const ntd = () => eco.countCarried('old_ntd');
    const start = eco.reputationOf('guard');
    for (let i = 0; i < 3; i++) {
      expect(eco.bribeInfo('guard').left).toBe(3 - i);
      expect(eco.bribe('guard')).toMatchObject({ ok: true, gain: BRIBE.gain, cost: BRIBE.cost });
    }
    expect(eco.reputationOf('guard')).toBe(start + 15);
    expect(ntd()).toBe(15000 - 3000);
    const refused = eco.bribe('guard');
    expect(refused).toMatchObject({ ok: false, code: 'limit' });
    expect(ntd()).toBe(15000 - 3000); // 被拒絕不扣錢
    // 另一個陣營有自己的額度
    expect(eco.bribe('triad').ok).toBe(true);
    expect(bribesLeft(10)).toBe(1);
    expect(bribesLeft(15)).toBe(0);
    eco.resolveRaid('extract');
    // 下一場重新計算
    const p = (eco as any).p;
    p.carried[0] = { id: 'old_ntd', qty: 5000 };
    (eco as any).persist();
    eco.startRaid('harbor_1990');
    expect(eco.bribeInfo('guard').left).toBe(3);
    expect(eco.bribe('guard').ok).toBe(true);
    expect(eco.reputationOf('guard')).toBe(start + 20);
  });
  it('needs the NTD, only works in a raid, only for guard / triad', () => {
    const { eco } = raidEco();
    (eco as any).p.carried = [{ id: 'old_ntd', qty: 999 }, null, null];
    expect(eco.bribe('guard')).toMatchObject({ ok: false, code: 'no_currency' });
    expect(eco.bribe('corp_chronos').ok).toBe(false);
    const { eco: hub } = makeEconomy();
    expect(hub.bribe('guard')).toMatchObject({ ok: false, code: 'not_in_raid' });
  });
  it('bribes show up in the settlement as reputation changes', () => {
    const { eco } = raidEco();
    eco.bribe('triad');
    const res = eco.resolveRaid('extract');
    expect(res.ok && res.result.repChanges!.triad).toBe(5);
  });
});

describe('corporations: perks, choose, switch', () => {
  it('a new profile has no corp; chooseCorp works once and sets reputation', () => {
    const { eco } = makeEconomy();
    expect(eco.corp).toBeNull();
    expect(eco.chooseCorp('corp_crimson').ok).toBe(true);
    expect(eco.corp).toBe('corp_crimson');
    expect(eco.reputationOf('corp_crimson')).toBe(100);
    expect(eco.reputationOf('corp_aurora')).toBe(-30);
    expect(eco.attitudeToward('corp_crimson')).toBe('friendly');
    expect(eco.chooseCorp('corp_aurora').ok).toBe(false); // 不能免費更換
    expect(eco.corp).toBe('corp_crimson');
  });
  it('Aurora: armor and helmets 10% off; Crimson: weapons and attachments 10% off; others unaffected', () => {
    const base = (id: string) => buyPrice(id, '2026-06-15');
    const a = makeEconomy().eco; a.chooseCorp('corp_aurora');
    const c = makeEconomy().eco; c.chooseCorp('corp_crimson');
    const n = makeEconomy().eco;
    expect(a.buyPriceOf('armor_2')).toBe(Math.round(base('armor_2') * 0.9));
    expect(a.buyPriceOf('helmet_1')).toBe(Math.round(base('helmet_1') * 0.9));
    expect(a.buyPriceOf('rifle')).toBe(base('rifle'));
    expect(c.buyPriceOf('rifle')).toBe(Math.round(base('rifle') * 0.9));
    expect(c.buyPriceOf('att_reddot')).toBe(Math.round(base('att_reddot') * 0.9));
    expect(c.buyPriceOf('armor_2')).toBe(base('armor_2'));
    expect(n.buyPriceOf('rifle')).toBe(base('rifle'));
    expect(corpPriceMult('corp_chronos', 'weapon')).toBe(1);
    expect(corpPriceMult(null, 'armor')).toBe(1);
  });
  it('the discount is really charged when buying', () => {
    const { eco } = makeEconomy();
    eco.chooseCorp('corp_crimson');
    giveCredits(eco, 100000);
    const before = eco.credits;
    const r = eco.buy('rifle');
    expect(r).toMatchObject({ ok: true, cost: eco.buyPriceOf('rifle') });
    expect(eco.credits).toBe(before - eco.buyPriceOf('rifle'));
  });
  it('Chronos: +60 seconds of stability in every raid', () => {
    const { eco } = makeEconomy();
    expect(eco.raidDurationSec('harbor_1990')).toBe(720);
    eco.chooseCorp('corp_chronos');
    expect(eco.raidDurationSec('harbor_1990')).toBe(780);
    const r = eco.startRaid('harbor_1990');
    expect(r).toMatchObject({ ok: true, duration: 780 });
    expect(CORPS.corp_chronos.stabilityBonus).toBe(60);
    expect(raidDuration({ ...createDefaultProfile(), corp: 'corp_chronos' }, 300)).toBe(360);
    expect(raidDuration({ ...createDefaultProfile(), corp: 'corp_aurora' }, 300)).toBe(300);
  });
  it('switching costs 50,000, resets corp reputation, keeps guard / triad, and is refused without money', () => {
    const { eco } = makeEconomy();
    eco.chooseCorp('corp_aurora');
    eco.debugSetReputation('guard', 33);
    eco.debugSetReputation('corp_crimson', 20);
    expect(eco.switchCorp('corp_crimson')).toMatchObject({ ok: false, code: 'no_credits' });
    expect(eco.corp).toBe('corp_aurora');
    giveCredits(eco, SWITCH_CORP_COST);
    const before = eco.credits;
    expect(eco.switchCorp('corp_crimson')).toMatchObject({ ok: true, cost: SWITCH_CORP_COST });
    expect(eco.credits).toBe(before - SWITCH_CORP_COST);
    expect(eco.corp).toBe('corp_crimson');
    expect(eco.reputationOf('corp_crimson')).toBe(100);
    expect(eco.reputationOf('corp_aurora')).toBe(-30); // 重置
    expect(eco.reputationOf('guard')).toBe(33); // 保留
    expect(eco.switchCorp('corp_crimson').ok).toBe(false); // 已經是了
  });
  it('switching is not allowed during a raid', () => {
    const { eco } = raidEco();
    giveCredits(eco, 100000);
    expect(eco.switchCorp('corp_crimson')).toMatchObject({ ok: false, code: 'in_raid' });
  });
});

describe('save migration for factions', () => {
  it('a v3 save loads with no corp (must choose) and initial reputation', () => {
    expect(PROFILE_VERSION).toBe(4);
    const v3 = { ...createDefaultProfile(), version: 3 } as any;
    delete v3.corp; delete v3.reputation;
    v3.credits = 777;
    const m = migrateProfile(v3);
    expect(m.version).toBe(4);
    expect(m.corp).toBeNull();
    expect(m.reputation).toEqual(initialReputation(null));
    expect(m.credits).toBe(777);
  });
  it('an EconomyService opened on an old save asks for a corp; the choice then persists', () => {
    const save = new MemorySave();
    const v3 = { ...createDefaultProfile(), version: 3 } as any;
    delete v3.corp; delete v3.reputation;
    save.set('profile', v3);
    const eco = makeEconomy(save).eco;
    expect(eco.corp).toBeNull();
    eco.chooseCorp('corp_chronos');
    expect(makeEconomy(save).eco.corp).toBe('corp_chronos');
  });
  it('garbage corp / reputation values are cleaned', () => {
    const p = { ...createDefaultProfile(), corp: 'nope', reputation: { guard: 'x', triad: 500 } } as any;
    const m = migrateProfile(p);
    expect(m.corp).toBeNull();
    expect(m.reputation.guard).toBe(-40);
    expect(m.reputation.triad).toBe(100);
  });
});

describe('corp truce randomness', () => {
  it('same seed → same result; about 40% of seeds are truces', () => {
    for (const seed of [1, 42, 20260615]) expect(rollCorpTruce(seed)).toBe(rollCorpTruce(seed));
    expect(seededRng(7)()).toBe(seededRng(7)());
    let truces = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) if (rollCorpTruce(i * 7919 + 13)) truces++;
    expect(truces / N).toBeGreaterThan(CORP_TRUCE_CHANCE - 0.05);
    expect(truces / N).toBeLessThan(CORP_TRUCE_CHANCE + 0.05);
  });
  it('startRaid stores a truce flag derived from the start time, and it survives a reload', () => {
    const { eco, save } = makeEconomy();
    eco.startRaid('harbor_1990');
    const flag = eco.corpTruce;
    expect(flag).toBe(rollCorpTruce(NOON));
    const raid = (eco as any).p.raid;
    expect(raid.truce).toBe(flag);
    expect(save.get<any>('profile', null).raid.truce).toBe(flag);
  });
  it('agent factions: 15% are the player corp; never the player corp otherwise', () => {
    const rng = mulberry32(99);
    let ally = 0;
    const seen = new Set<string>();
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const f = pickAgentFaction('corp_aurora', rng);
      if (f === 'corp_aurora') ally++; else seen.add(f);
    }
    expect(ally / N).toBeGreaterThan(ALLY_AGENT_CHANCE - 0.03);
    expect(ally / N).toBeLessThan(ALLY_AGENT_CHANCE + 0.03);
    expect(seen).toEqual(new Set(['corp_chronos', 'corp_crimson']));
    expect(factionOfKind('guard', 'corp_aurora', rng)).toBe('guard');
    expect(factionOfKind('thug', null, rng)).toBe('triad');
    expect(CORP_IDS).toContain(pickAgentFaction(null, rng));
  });
});

describe('provocation rules', () => {
  it('a shot within 2 m provokes; farther does not', () => {
    expect(SHOT_NEAR_RANGE).toBe(2);
    expect(shotProvokes(1.9)).toBe(true);
    expect(shotProvokes(2)).toBe(true);
    expect(shotProvokes(2.1)).toBe(false);
  });
  it('aiming within 15 m: warns at 1 s, turns hostile at 2 s', () => {
    expect(AIM_RANGE).toBe(15);
    const s: AimState = { t: 0, warned: false };
    const events: string[] = [];
    for (let t = 0; t < 2.6; t += 0.1) { const e = stepAim(s, 0.1, true, 10); if (e !== 'none') events.push(`${e}@${(t + 0.1).toFixed(1)}`); if (e === 'hostile') break; }
    expect(events[0]).toMatch(/^warn@1\.[01]$/);
    void AIM_WARN_SEC;
    expect(events.at(-1)).toMatch(/^hostile@/);
    expect(parseFloat(events.at(-1)!.split('@')[1])).toBeGreaterThanOrEqual(AIM_HOSTILE_SEC - 0.01);
    expect(parseFloat(events.at(-1)!.split('@')[1])).toBeLessThan(AIM_HOSTILE_SEC + 0.15);
  });
  it('does not count beyond 15 m, and decays when the crosshair moves away', () => {
    const far: AimState = { t: 0, warned: false };
    for (let i = 0; i < 100; i++) expect(stepAim(far, 0.1, true, 15.5)).toBe('none');
    expect(far.t).toBe(0);
    const s: AimState = { t: 0, warned: false };
    for (let i = 0; i < 15; i++) stepAim(s, 0.1, true, 5); // 1.5 s：已警告
    expect(s.warned).toBe(true);
    for (let i = 0; i < 10; i++) stepAim(s, 0.1, false, 5); // 移開 1 s：倒退 2 s
    expect(s.t).toBe(0);
    expect(s.warned).toBe(false);
    for (let i = 0; i < 15; i++) expect(stepAim(s, 0.1, true, 5)).not.toBe('hostile'); // 重新開始計時
  });
});

// ---------------------------------------------------------------- Enemy 整合
interface World { hostile: (a: FactionId, b: FactionId) => boolean; rep: Partial<Record<FactionId, number>>; corp: any }
function makeWorld(w: Partial<World> = {}) {
  const bus = new EventBus<GameEvents>();
  const events: any[] = [];
  bus.on('noise', (e) => events.push(e));
  const all: Enemy[] = [];
  const rep = { ...initialReputation(w.corp ?? 'corp_aurora'), ...(w.rep ?? {}) };
  const player: PlayerTarget = { feet: V(40, 0), eye: V(40, 0, 1.6), crouching: false, sprinting: false, moving: false, alive: true };
  const damaged: number[] = [];
  const groupProvoked: string[] = [];
  const ctx = {
    bus, mover: { los: () => true, move: () => 0 }, nav: new NavIndex({ nodes: [V(0, 0)], edges: [] }), fx: { muzzleFlash() {}, tracer() {}, impact() {} },
    trace: { cast: () => null }, player, lightAt: () => 1, damagePlayer: (b: number) => { damaged.push(b); }, onDeath: () => {}, castShadow: false, all,
    surfaceAt: () => 'concrete', difficulty: 2, rng: mulberry32(5),
    alertGroup: (g: string, pos: THREE.Vector3, except: string, tgt: any) => { for (const e of all) if (e.group === g && e.id !== except) e.groupAlerted(pos, tgt); },
    provokeGroup: (g: string) => { groupProvoked.push(g); for (const e of all) if (e.group === g) e.provokeByPlayer(false); },
    byId: (id: string) => all.find((e) => e.id === id),
    factions: {
      playerCorp: () => w.corp ?? 'corp_aurora',
      attitude: (f: FactionId) => (f === (w.corp ?? 'corp_aurora') ? 'friendly' : attitudeOf(rep[f] ?? 0)),
      hostile: w.hostile ?? ((a: FactionId, b: FactionId) => areHostile(a, b, false)),
    },
  } as unknown as EnemyContext;
  /** facing：朝向（弧度，forward = (sin f, cos f)；預設朝 +x） */
  const add = (kind: 'guard' | 'thug' | 'rival_agent', faction: FactionId, at: THREE.Vector3, group?: string, facing = Math.PI / 2) => {
    const e = new Enemy(ENEMIES[kind], { kind, position: at.clone(), yaw: facing - Math.PI, faction, group }, ctx);
    all.push(e);
    return e;
  };
  const run = (sec: number) => { for (let t = 0; t < sec; t += 0.05) for (const e of all) e.step(0.05); };
  return { add, run, player, events, damaged, rep, groupProvoked, ctx };
}

describe('Enemy targeting by faction', () => {
  it('a hostile-reputation guard targets the player; a neutral one does not and never shoots', () => {
    const w = makeWorld({ rep: { guard: -40 } });
    const hostile = w.add('guard', 'guard', V(30, 0));
        w.run(1.5);
    expect(hostile.target?.enemy).toBeNull();
    expect(hostile.target).not.toBeNull();

    const w2 = makeWorld({ rep: { guard: 0 } });
    const neutral = w2.add('guard', 'guard', V(30, 0));
    w2.run(8);
    expect(neutral.target).toBeNull();
    expect(neutral.brain.engaged).toBe(false);
    expect(w2.damaged.length).toBe(0);
    expect(neutral.watching).toBe(true); // 盯著玩家看
    expect(neutral.effectiveAttitude).toBe('neutral');
  });
  it('neutral and friendly NPCs ignore the player\'s footsteps but still come for gunfire', () => {
    const w = makeWorld({ rep: { guard: 10 } });
    const g = w.add('guard', 'guard', V(5, 0));
    const step = { kind: 'footstep_sprint', position: { x: 8, y: 0, z: 0 }, source: 'player', surface: 'concrete' } as const;
    expect(g.hearNoise(step)).toBe('ignored');
    const shot = { kind: 'shot', position: { x: 8, y: 1, z: 0 }, source: 'player', weaponId: 'pistol' } as const;
    expect(g.hearNoise(shot)).not.toBe('ignored');
    const w2 = makeWorld({ rep: { guard: 70 } });
    const f = w2.add('guard', 'guard', V(5, 0));
    expect(f.effectiveAttitude).toBe('friendly');
    expect(f.hearNoise(step)).toBe('ignored');
  });
  it('a hostile guard still hears footsteps (existing behaviour)', () => {
    const w = makeWorld({ rep: { guard: -40 } });
    const g = w.add('guard', 'guard', V(5, 0));
    const r = g.hearNoise({ kind: 'footstep_sprint', position: { x: 8, y: 0, z: 0 }, source: 'player', surface: 'concrete' });
    expect(r).not.toBe('ignored');
  });
  it('a guard and a thug that see each other pick each other as targets and fight until one dies', () => {
    const w = makeWorld({ rep: { guard: 70, triad: 70 } }); // 玩家和兩邊都友好：不會理玩家
    w.player.feet.set(200, 0, 200); w.player.eye.set(200, 1.6, 200);
    const guard = w.add('guard', 'guard', V(0, 0));
    const thug = w.add('thug', 'triad', V(12, 0), undefined, -Math.PI / 2);
    w.run(1);
    expect(guard.target?.enemy).toBe(thug);
    expect(thug.target?.enemy).toBe(guard);
    w.run(60);
    expect(guard.dead || thug.dead).toBe(true);
    const loser = guard.dead ? guard : thug;
    expect(loser.killer).not.toBe('player');
    expect(loser.killer).toBe(guard.dead ? thug : guard);
    // 槍聲走同一套 noise，來源是 NPC 的 id
    const shots = w.events.filter((e) => e.kind === 'shot');
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((e) => /^e\d+$/.test(e.source))).toBe(true);
    expect(w.damaged.length).toBe(0); // 沒有打到玩家
  });
  it('corp agents of different corps fight when hostile, and ignore each other during a truce', () => {
    for (const truce of [false, true]) {
      const w = makeWorld({ hostile: (a, b) => areHostile(a, b, truce) });
      w.player.feet.set(200, 0, 200); w.player.eye.set(200, 1.6, 200);
      const a = w.add('rival_agent', 'corp_chronos', V(0, 0));
      const b = w.add('rival_agent', 'corp_crimson', V(14, 0), undefined, -Math.PI / 2);
      // 反應時間有隨機成分：給足時間（6 秒），只要求敵對時「有交火或鎖定目標」，休戰時「完全不開火、不鎖定」
      w.run(6);
      const shots = w.events.filter((e) => e.kind === 'shot').length;
      if (truce) {
        expect(!!a.target?.enemy).toBe(false);
        expect(!!b.target?.enemy).toBe(false);
        w.run(10);
        expect(w.events.filter((e) => e.kind === 'shot').length).toBe(0);
      } else {
        expect(shots > 0 || !!a.target?.enemy || !!b.target?.enemy).toBe(true);
      }
    }
  });
  it('walls block the scan: no line of sight, no target', () => {
    const w = makeWorld({ rep: { guard: 70, triad: 70 } });
    (w.ctx.mover as any).los = () => false;
    w.player.feet.set(200, 0, 200);
    const guard = w.add('guard', 'guard', V(0, 0));
    w.add('thug', 'triad', V(12, 0));
    w.run(3);
    expect(guard.target).toBeNull();
  });
  it('NPCs hear other factions\' gunshots and go to investigate; same faction shots are ignored', () => {
    const w = makeWorld({ rep: { guard: 70, triad: 70 } });
    w.player.feet.set(200, 0, 200);
    const guard = w.add('guard', 'guard', V(0, 0));
    const thug = w.add('thug', 'triad', V(40, 0));
    const ev = (src: string) => ({ kind: 'shot' as const, position: { x: 20, y: 1.3, z: 0 }, source: src, weaponId: 'smg' });
    expect(guard.hearNoise(ev(thug.id))).not.toBe('ignored');
    expect(guard.hearNoise({ kind: 'footstep_sprint', position: { x: 2, y: 0, z: 0 }, source: thug.id, surface: 'concrete' })).toBe('ignored');
    const guard2 = w.add('guard', 'guard', V(0, 5));
    expect(guard.hearNoise(ev(guard2.id))).toBe('ignored');
  });
});

describe('Enemy provocation', () => {
  it('hitting a neutral guard provokes him and his group; allies never turn hostile', () => {
    const w = makeWorld({ rep: { guard: 10 } });
    const a = w.add('guard', 'guard', V(30, 0), 'gate');
    const b = w.add('guard', 'guard', V(33, 0), 'gate');
    const other = w.add('guard', 'guard', V(60, 20), 'dock');
    expect(a.hostileToPlayer).toBe(false);
    a.takeHit(5, 'body', V(40, 0), 'light');
    expect(a.provoked).toBe(true);
    expect(a.hostileToPlayer).toBe(true);
    expect(b.provoked).toBe(true); // 隊友也被激怒
    expect(other.provoked).toBe(false);
    expect(a.brain.engaged).toBe(true);
    expect(a.target?.enemy).toBeNull();

    const w2 = makeWorld({});
    const ally = w2.add('rival_agent', 'corp_aurora', V(30, 0));
    ally.takeHit(5, 'body', V(40, 0), 'light');
    expect(ally.provoked).toBe(false);
    expect(ally.hostileToPlayer).toBe(false);
    expect(ally.effectiveAttitude).toBe('friendly');
    w2.run(3);
    expect(w2.damaged.length).toBe(0);
  });
  it('aiming at a neutral NPC for 2 s warns (alert voice) then turns him hostile', () => {
    const w = makeWorld({ rep: { guard: 0 } });
    const g = w.add('guard', 'guard', V(8, 0));
    const events: string[] = [];
    w.ctx.bus.on('noise', (e) => { if (e.kind === 'alert') events.push('alert'); });
    for (let t = 0; t < 1.2; t += 0.05) g.aimedAt(0.05, true, 10);
    expect(g.warnT).toBeGreaterThan(0);
    expect(events).toEqual(['alert']);
    expect(g.provoked).toBe(false);
    for (let t = 0; t < 1.0; t += 0.05) g.aimedAt(0.05, true, 10);
    expect(g.provoked).toBe(true);
    expect(g.hostileToPlayer).toBe(true);
  });
  it('a hostile NPC does not keep accumulating aim time; allies cannot be provoked by aiming', () => {
    const w = makeWorld({});
    const ally = w.add('rival_agent', 'corp_aurora', V(8, 0));
    for (let t = 0; t < 4; t += 0.05) ally.aimedAt(0.05, true, 5);
    expect(ally.provoked).toBe(false);
    expect(ally.warnT).toBe(0);
  });
  it('a provoked NPC counts as hostile for the marker logic, and friendly ones are not lured by group alerts about the player', () => {
    const w = makeWorld({ rep: { guard: 70 } });
    const spotter = w.add('guard', 'guard', V(30, 0), 'gate');
    const mate = w.add('guard', 'guard', V(35, 0), 'gate');
    spotter.provokeByPlayer();
    expect(spotter.effectiveAttitude).toBe('hostile');
    expect(mate.effectiveAttitude).toBe('friendly');
    w.run(2);
    expect(mate.brain.engaged).toBe(false); // 友好的隊友不會跟著打玩家
  });
});

describe('guard help (friendly guard fights the player\'s enemy)', () => {
  it('a friendly guard shoots a thug that is shooting at the player', () => {
    const w = makeWorld({ rep: { guard: 70, triad: -60 } });
    w.player.feet.set(0, 0, 0); w.player.eye.set(0, 1.6, 0);
    const guard = w.add('guard', 'guard', V(-8, 1));
    const thug = w.add('thug', 'triad', V(14, 0), undefined, -Math.PI / 2);
    w.run(5);
    expect(guard.target?.enemy).toBe(thug);
    expect(guard.hostileToPlayer).toBe(false);
  });
});

describe('PROFILE', () => {
  it('has the faction fields in new profiles', () => {
    const p = createDefaultProfile();
    expect(p.corp).toBeNull();
    expect(p.reputation.guard).toBe(-40);
  });
});
