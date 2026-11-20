import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Enemy, type EnemyContext, type PlayerTarget } from '../src/ai/Enemy';
import { NavIndex } from '../src/ai/Nav';
import { planFlank, RUSH_RANGE, hearChance, isNpcSource, shouldFlank, shouldRush, shouldSneak } from '../src/ai/Tactics';
import { visionGain } from '../src/ai/Perception';
import { EventBus, type GameEvents } from '../src/core/EventBus';
import { mulberry32 } from '../src/core/rng';
import { DIFFICULTY, ENEMIES, MAX_HIT_CHANCE, accuracyAt, asDifficulty, scaledAccuracy, tacticChance, type Difficulty } from '../src/data/enemies';
import { getEra, ERAS } from '../src/data/eras';
import type { NoiseEvent } from '../src/data/noise';
import type { NavGraph } from '../src/world/RaidMap';

const V = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);

describe('difficulty coefficients', () => {
  it('eras carry a star rating; harbor_1990 is 2', () => {
    expect(getEra('harbor_1990')!.difficulty).toBe(2);
    for (const e of ERAS) expect([1, 2, 3]).toContain(e.difficulty);
  });
  it('accuracy / reaction / hearing / tactic multipliers follow the table', () => {
    expect(DIFFICULTY[1].accuracy).toBe(0.75);
    expect(DIFFICULTY[2].accuracy).toBe(1);
    expect(DIFFICULTY[3].accuracy).toBe(1.3);
    expect(DIFFICULTY[1].reaction).toBe(1.3);
    expect(DIFFICULTY[2].reaction).toBe(1);
    expect(DIFFICULTY[3].reaction).toBe(0.75);
    for (const k of ['sneak', 'rush', 'flank', 'hearing'] as const) {
      expect(DIFFICULTY[1][k]).toBeLessThan(DIFFICULTY[2][k]);
      expect(DIFFICULTY[2][k]).toBeLessThan(DIFFICULTY[3][k]);
    }
    expect(asDifficulty(undefined)).toBe(2);
    expect(asDifficulty(3)).toBe(3);
    expect(asDifficulty(7)).toBe(2);
  });
  it('hit chance is scaled and capped at 0.95', () => {
    expect(scaledAccuracy(0.4, 1)).toBeCloseTo(0.3, 8);
    expect(scaledAccuracy(0.4, 2)).toBeCloseTo(0.4, 8);
    expect(scaledAccuracy(0.4, 3)).toBeCloseTo(0.52, 8);
    expect(scaledAccuracy(0.9, 3)).toBe(MAX_HIT_CHANCE);
    expect(scaledAccuracy(1, 2)).toBe(MAX_HIT_CHANCE);
  });
  it('200 seeded shots hit in proportion to the multiplier (guard at 10m)', () => {
    const base = accuracyAt(ENEMIES.guard.accuracy, 10);
    const rate = (d: Difficulty): number => {
      const rng = mulberry32(2026);
      let hit = 0;
      for (let i = 0; i < 200; i++) if (rng() < scaledAccuracy(base, d)) hit++;
      return hit / 200;
    };
    const r = { 1: rate(1), 2: rate(2), 3: rate(3) };
    expect(r[1]).toBeLessThan(r[2]);
    expect(r[2]).toBeLessThan(r[3]);
    expect(r[1] / r[2]).toBeGreaterThan(0.6);
    expect(r[1] / r[2]).toBeLessThan(0.9);
    expect(r[3] / r[2]).toBeGreaterThan(1.15);
    expect(r[3] / r[2]).toBeLessThan(1.45);
  });
  it('shorter reaction time (harder maps) spots the player faster', () => {
    const ctx = { dist: 10, offAxis: 0.2, crouching: false, sprinting: false, moving: true, light: 1 };
    const g = (d: Difficulty) => visionGain(ENEMIES.guard.reaction * DIFFICULTY[d].reaction, 26, ctx);
    expect(g(3)).toBeGreaterThan(g(2));
    expect(g(2)).toBeGreaterThan(g(1));
  });
  it('tactic chances: thugs rarely sneak, rival agents do it most; harder maps do more of everything', () => {
    for (const d of [1, 2, 3] as const) {
      expect(tacticChance('sneak', d, ENEMIES.thug)).toBeLessThan(tacticChance('sneak', d, ENEMIES.guard));
      expect(tacticChance('sneak', d, ENEMIES.guard)).toBeLessThan(tacticChance('sneak', d, ENEMIES.rival_agent));
      expect(tacticChance('rush', d, ENEMIES.thug)).toBeGreaterThan(tacticChance('rush', d, ENEMIES.guard));
    }
    for (const kind of ['sneak', 'rush', 'flank'] as const) {
      expect(tacticChance(kind, 1, ENEMIES.rival_agent)).toBeLessThan(tacticChance(kind, 3, ENEMIES.rival_agent));
      expect(tacticChance(kind, 3, ENEMIES.rival_agent)).toBeLessThanOrEqual(0.95);
    }
  });
});

describe('hearing probability', () => {
  it('is zero when inaudible and rises with loudness and sensitivity', () => {
    expect(hearChance(0, 1)).toBe(0);
    expect(hearChance(0.9, 1)).toBeGreaterThan(hearChance(0.1, 1));
    expect(hearChance(0.3, 1.3)).toBeGreaterThan(hearChance(0.3, 0.8));
    expect(hearChance(1, 5)).toBe(1);
    expect(hearChance(0.5, 1, true)).toBeLessThan(hearChance(0.5, 1, false));
  });
  it('NPCs only listen to non-NPC sources', () => {
    expect(isNpcSource('e12')).toBe(true);
    expect(isNpcSource('player')).toBe(false);
    expect(isNpcSource('p-77')).toBe(false);
  });
});

describe('rush on reload (fixed seed)', () => {
  const rate = (d: Difficulty, dist: number, kind: 'thug' | 'guard' = 'guard'): number => {
    const rng = mulberry32(4242);
    let n = 0;
    for (let i = 0; i < 1000; i++) if (shouldRush({ dist, difficulty: d, def: ENEMIES[kind], rng })) n++;
    return n / 1000;
  };
  it('never beyond 25m; probability grows with difficulty and matches the table', () => {
    expect(rate(3, RUSH_RANGE + 0.1)).toBe(0);
    const r1 = rate(1, 10), r2 = rate(2, 10), r3 = rate(3, 10);
    expect(r1).toBeLessThan(r2);
    expect(r2).toBeLessThan(r3);
    expect(r1).toBeCloseTo(tacticChance('rush', 1, ENEMIES.guard), 1);
    expect(r3).toBeCloseTo(tacticChance('rush', 3, ENEMIES.guard), 1);
    expect(rate(2, 10, 'thug')).toBeGreaterThan(rate(2, 10, 'guard'));
  });
  it('sneak and flank rolls are deterministic with a seed and scale with difficulty', () => {
    const count = (fn: typeof shouldSneak, d: Difficulty) => {
      const rng = mulberry32(7);
      let n = 0;
      for (let i = 0; i < 500; i++) if (fn({ difficulty: d, def: ENEMIES.rival_agent, rng })) n++;
      return n;
    };
    expect(count(shouldSneak, 1)).toBeLessThan(count(shouldSneak, 3));
    expect(count(shouldFlank, 1)).toBeLessThan(count(shouldFlank, 3));
    expect(count(shouldSneak, 2)).toBe(count(shouldSneak, 2));
  });
});

// ---------------------------------------------------------------- 整合：敵人聽到玩家換彈
function makeEnemy(kind: 'guard' | 'thug' | 'rival_agent', difficulty: Difficulty, rng: () => number, at = V(0, 0), los = true) {
  const bus = new EventBus<GameEvents>();
  const events: NoiseEvent[] = [];
  bus.on('noise', (e) => events.push(e));
  const player: PlayerTarget = {
    feet: V(9, 0), eye: V(9, 0, 1.6), crouching: false, sprinting: false, moving: false, alive: true,
  };
  const ctx = {
    bus, mover: { los: () => los }, nav: new NavIndex({ nodes: [at.clone()], edges: [] }), fx: {}, trace: {}, player,
    lightAt: () => 1, damagePlayer: () => {}, alertGroup: () => {}, onDeath: () => {}, castShadow: false, all: [],
    surfaceAt: () => 'concrete', difficulty, rng,
  } as unknown as EnemyContext;
  const e = new Enemy(ENEMIES[kind], { kind, position: at.clone(), yaw: 0 }, ctx);
  return { e, events, player };
}
const reloadAt = (x: number, z: number, stage: 0 | 1 | 2 = 0, source = 'player'): NoiseEvent => ({ kind: 'reload', position: { x, y: 1.2, z }, source, weaponId: 'rifle', stage });

describe('enemy reacts to the player reloading', () => {
  it('9m away (inside the 10m reload range): comes to investigate or rushes; 15m away: does not hear it at all', () => {
    const close = { heard: 0, rush: 0 }, far = { n: 0 };
    for (let i = 0; i < 100; i++) {
      const a = makeEnemy('guard', 2, mulberry32(i + 1));
      const r = a.e.hearNoise(reloadAt(9, 0));
      if (r === 'heard' || r === 'rush') close.heard++;
      if (r === 'rush') { close.rush++; expect(a.e.brain.state).toBe('chase'); } else if (r === 'heard') expect(a.e.brain.state).toBe('alert');
      const b = makeEnemy('guard', 2, mulberry32(i + 1));
      if (b.e.hearNoise(reloadAt(15, 0)) !== 'ignored') far.n++;
      expect(b.e.brain.state).toBe('patrol');
    }
    expect(close.heard).toBeGreaterThan(30);
    expect(close.rush).toBeGreaterThan(0);
    expect(far.n).toBe(0);
  });

  it('rush probability follows the difficulty (fixed seeds)', () => {
    const rushes = (d: Difficulty) => {
      let n = 0;
      for (let i = 0; i < 300; i++) if (makeEnemy('thug', d, mulberry32(i * 13 + 5)).e.hearNoise(reloadAt(6, 0)) === 'rush') n++;
      return n;
    };
    const n1 = rushes(1), n2 = rushes(2), n3 = rushes(3);
    expect(n1).toBeLessThan(n2);
    expect(n2).toBeLessThan(n3);
    expect(n3).toBeGreaterThan(100);
  });

  it('a wall in between reduces the chance of hearing (same seeds)', () => {
    let open = 0, walled = 0;
    for (let i = 0; i < 300; i++) {
      if (makeEnemy('guard', 2, mulberry32(i + 99), V(0, 0), true).e.hearNoise(reloadAt(8, 0)) !== 'missed') open++;
      if (makeEnemy('guard', 2, mulberry32(i + 99), V(0, 0), false).e.hearNoise(reloadAt(8, 0)) !== 'missed') walled++;
    }
    expect(walled).toBeLessThan(open);
  });

  it('an engaged enemy is not pulled away, but pushes forward when the player reloads', () => {
    const { e } = makeEnemy('thug', 3, () => 0); // 每次擲骰都成功
    e.brain.damaged(V(9, 0));
    expect(e.brain.engaged).toBe(true);
    expect(e.hearNoise(reloadAt(8, 0))).toBe('rush');
    expect(e.pushT).toBeGreaterThan(0);
    expect(e.brain.state).toBe('chase');
    const { e: e2 } = makeEnemy('thug', 3, () => 0);
    e2.brain.damaged(V(9, 0));
    expect(e2.hearNoise({ kind: 'footstep_walk', position: { x: 5, y: 0, z: 0 }, source: 'player', surface: 'concrete' })).toBe('heard');
    expect(e2.brain.state).toBe('chase'); // 沒有被腳步聲引走
  });

  it('enemies ignore other NPCs and their own noise', () => {
    const { e } = makeEnemy('guard', 3, () => 0);
    expect(e.hearNoise(reloadAt(3, 0, 0, 'e99'))).toBe('ignored');
    expect(e.hearNoise(reloadAt(3, 0, 0, e.id))).toBe('ignored');
    expect(e.hearNoise({ kind: 'footstep_crouch', position: { x: 1, y: 0, z: 0 }, source: 'player', surface: 'concrete' })).toBe('ignored'); // 蹲走無聲
  });

  it('sneaking past: a crouch-walking player is never heard, a crouch-running one is heard within 8m only', () => {
    let crouchHeard = 0, runClose = 0, runFar = 0;
    for (let i = 0; i < 100; i++) {
      const base = (kind: NoiseEvent['kind'], x: number): NoiseEvent => ({ kind, position: { x, y: 0, z: 0 }, source: 'player', surface: 'concrete' });
      if (makeEnemy('guard', 3, mulberry32(i)).e.hearNoise(base('footstep_crouch', 3)) !== 'ignored') crouchHeard++;
      if (makeEnemy('rival_agent', 3, mulberry32(i)).e.hearNoise(base('footstep_crouch_run', 5)) === 'heard') runClose++;
      if (makeEnemy('rival_agent', 3, mulberry32(i)).e.hearNoise(base('footstep_crouch_run', 9)) !== 'ignored') runFar++;
    }
    expect(crouchHeard).toBe(0);
    expect(runClose).toBeGreaterThan(50);
    expect(runFar).toBe(0);
  });
});

describe('enemy footstep noise by stance', () => {
  it('patrol walk / chase sprint / crouch-run emit noise; crouch-walk is silent', () => {
    const { e, events } = makeEnemy('guard', 2, mulberry32(1));
    const e2 = e as unknown as { stance: string; speedNow: number; distToPlayer: number; footsteps(m: number): void };
    e2.distToPlayer = 5;
    const run = (stance: string, speed: number) => { events.length = 0; e2.stance = stance; e2.speedNow = speed; e2.footsteps(3); return events.map((x) => x.kind); };
    expect(run('walk', ENEMIES.guard.walkSpeed)).toEqual(['footstep_walk']);
    expect(run('walk', ENEMIES.guard.runSpeed)).toEqual(['footstep_sprint']);
    expect(run('crouch_run', 2.2)).toEqual(['footstep_crouch_run']);
    expect(run('crouch', 0.7)).toEqual([]);
    expect(events.every((x) => x.source === e.id)).toBe(true);
  });
});

// ---------------------------------------------------------------- 包抄
describe('flanking route', () => {
  // 兩條路：上方短路 0-1-2-3-4（y=0），下方長路 0-5-6-7-4（z=10）
  const nodes = [V(0, 0), V(10, 0), V(20, 0), V(30, 0), V(40, 0), V(5, 10), V(15, 12), V(30, 12), V(35, 6)];
  const edges: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [8, 4]];
  const nav = new NavIndex({ nodes, edges } as NavGraph);
  it('a flanker takes a different route from the teammate on the main path', () => {
    const plan = planFlank(nav, 0, 0, 4)!;
    expect(plan).toBeTruthy();
    expect(plan.mainPath).toEqual([0, 1, 2, 3, 4]);
    expect(plan.route[0]).toBe(0);
    expect(plan.route[plan.route.length - 1]).toBe(4);
    expect(plan.route).toEqual([0, 5, 6, 7, 8, 4]);
    expect(plan.shared).toBe(0);
  });
  it('without a penalty both would take the short route (so the plan really changes the path)', () => {
    expect(nav.findPath(0, 4)).toEqual([0, 1, 2, 3, 4]);
    expect(nav.findPath(0, 4, (i) => ([1, 2, 3].includes(i) ? 60 : 0))).toEqual([0, 5, 6, 7, 8, 4]);
  });
  it('gives up when the detour is absurdly long', () => {
    const long = new NavIndex({ nodes: [V(0, 0), V(10, 0), V(20, 0), V(0, 400), V(20, 400)], edges: [[0, 1], [1, 2], [0, 3], [3, 4], [4, 2]] });
    expect(planFlank(long, 0, 0, 2)).toBeNull();
  });
});
