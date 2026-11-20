import * as THREE from 'three';
import type { GameBus } from '../core/EventBus';
import type { HitZone } from '../combat/Damage';
import type { WeaponClass } from '../data/helmet';
import { intersectHitZones } from '../combat/HitZones';
import type { CombatFx } from '../combat/Fx';
import type { TargetHit, TargetProvider } from '../combat/WeaponSystem';
import type { WorldTrace } from '../combat/WorldTrace';
import { ENEMIES, type Difficulty } from '../data/enemies';
import type { EnemySpawn } from '../world/RaidMap';
import type { Surface } from '../world/Surface';
import { Enemy, type EnemyContext, type FactionCtx, type PlayerTarget, type Tgt } from './Enemy';
import { factionOfKind, type FactionId } from '../data/factions';
import { shotProvokes } from './Provoke';
import { EnemyMover } from './EnemyMover';
import { NavIndex } from './Nav';
import { isNpcSource, planFlank, shouldFlank } from './Tactics';
import type { Octree } from 'three/examples/jsm/math/Octree.js';
import type { NavGraph } from '../world/RaidMap';

export const MAX_ENEMIES = 12;

export interface ManagerDeps {
  bus: GameBus;
  octree: Octree;
  nav: NavGraph;
  fx: CombatFx;
  trace: WorldTrace;
  player: PlayerTarget;
  lightAt(p: THREE.Vector3): number;
  damagePlayer(base: number, zone: HitZone, from: THREE.Vector3, killer: string, weaponClass: WeaponClass): void;
  onDeath(e: Enemy): void;
  surfaceAt(p: THREE.Vector3): Surface;
  castShadow: boolean;
  /** 地圖難度 1～3（★～★★★） */
  difficulty?: Difficulty;
  /** 亂數來源（測試用固定 seed） */
  rng?: () => number;
  /** 陣營關係（玩家聲望、本場企業是否休戰）；省略 = 玩家對所有陣營敵對（舊行為） */
  factions?: FactionCtx;
}

/** 管理場上敵人：生成、感知事件分派、群組通知、LOD 與命中判定。 */
export class EnemyManager implements TargetProvider {
  readonly list: Enemy[] = [];
  readonly nav: NavIndex;
  readonly mover: EnemyMover;
  /** 每個畫面的 AI + 動畫耗時（毫秒，滑動平均）與最大值 */
  aiMs = 0;
  aiMsMax = 0;
  private frameAcc = 0;
  private lodT = 0;
  private unsubs: (() => void)[] = [];
  private ctx: EnemyContext;
  private sphere = new THREE.Sphere();
  private flankT = 0;
  private flankCd = new Map<string, number>();
  private byId = new Map<string, Enemy>();

  constructor(private d: ManagerDeps) {
    this.nav = new NavIndex(d.nav);
    this.mover = new EnemyMover(d.octree);
    this.ctx = {
      bus: d.bus, mover: this.mover, nav: this.nav, fx: d.fx, trace: d.trace, player: d.player,
      lightAt: d.lightAt, damagePlayer: d.damagePlayer, castShadow: d.castShadow, all: this.list,
      alertGroup: (g, pos, except, tgt) => this.alertGroup(g, pos, except, tgt),
      factions: d.factions,
      provokeGroup: (g) => this.provokeGroup(g),
      byId: (id) => this.byId.get(id),
      onDeath: (e) => d.onDeath(e),
      surfaceAt: d.surfaceAt,
      difficulty: d.difficulty ?? 2,
      rng: d.rng,
    };
    // 聽覺：玩家（以及之後的其他真人）發出的所有 noise 事件；NPC 之間只聽槍聲（其他的聲音 NPC 彼此不聽）
    this.unsubs.push(
      d.bus.on('noise', (e) => {
        const npc = isNpcSource(e.source);
        if (npc && e.kind !== 'shot') return;
        for (const en of this.list) en.hearNoise(e);
        // 在中立 / 友好 NPC 身邊 2m 內開槍 = 挑釁
        if (!npc && e.kind === 'shot') {
          for (const en of this.list) {
            if (en.dead || en.provoked || en.hostileToPlayer) continue;
            if (shotProvokes(Math.hypot(e.position.x - en.pos.x, e.position.y - en.pos.y, e.position.z - en.pos.z))) en.provokeByPlayer();
          }
        }
      }),
    );
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    for (const e of this.list) e.dispose();
    this.list.length = 0;
  }

  /** 依地圖的 enemySpawns 生成（機率、上限 12）。回傳模型載入完成的 Promise */
  async spawn(spawns: EnemySpawn[], parent: THREE.Object3D, rng: () => number = Math.random): Promise<Enemy[]> {
    let picked = spawns.filter((s) => rng() <= (s.chance ?? 1));
    // 超過上限時隨機取捨（不然排在後面的企業穿越者永遠擠不進去）
    if (picked.length > MAX_ENEMIES) picked = picked.map((s) => ({ s, k: rng() })).sort((a, b) => a.k - b.k).slice(0, MAX_ENEMIES).map((x) => x.s);
    const made: Enemy[] = [];
    for (const s of picked) {
      const faction = s.faction ?? factionOfKind(s.kind, this.d.factions?.playerCorp() ?? null, rng);
      const e = new Enemy(ENEMIES[s.kind], { ...s, faction }, this.ctx);
      this.byId.set(e.id, e);
      this.list.push(e);
      parent.add(e.root);
      made.push(e);
    }
    await Promise.all(made.map((e) => e.load()));
    return made;
  }

  /** 測試掛鉤：在指定位置生成一個敵人，可強制指定頭盔（helmet = null 代表不戴） */
  async debugSpawn(kind: EnemySpawn['kind'], position: THREE.Vector3, parent: THREE.Object3D, helmet?: { id: string; dur: number } | null, faction?: FactionId): Promise<Enemy> {
    const f = faction ?? factionOfKind(kind, this.d.factions?.playerCorp() ?? null, this.d.rng ?? Math.random);
    const e = new Enemy(ENEMIES[kind], { kind, position: position.clone(), yaw: 0, faction: f } as EnemySpawn, this.ctx);
    this.byId.set(e.id, e);
    if (helmet !== undefined) { e.helmetId = helmet?.id ?? null; e.helmetDur = helmet?.dur ?? 0; }
    this.list.push(e);
    parent.add(e.root);
    await e.load();
    return e;
  }

  get alive(): Enemy[] { return this.list.filter((e) => !e.dead); }

  alertGroup(group: string, pos: THREE.Vector3, exceptId: string, tgt?: Tgt): void {
    for (const e of this.list) if (e.group === group && e.id !== exceptId && !e.dead) e.groupAlerted(pos, tgt);
  }

  /** 玩家打中了某個群組的成員：同群組（沒死的）全部被激怒 */
  provokeGroup(group: string): void {
    for (const e of this.list) if (e.group === group && !e.dead) e.provokeByPlayer(false);
  }

  /**
   * 每個畫面呼叫：準心停在哪個敵人身上（沒有 = null）。中立 / 友好的敵人依瞄準時間警告、翻臉（見 ai/Provoke.ts）。
   * dist 為玩家到被瞄準者的距離。
   */
  updateAim(dt: number, aimed: Enemy | null, dist: number): void {
    for (const e of this.list) {
      if (e.dead) continue;
      if (e === aimed) e.aimedAt(dt, true, dist);
      else if (e.aim.t > 0) e.aimedAt(dt, false, dist);
    }
  }

  /** 固定步長（FIXED_DT）呼叫 */
  update(dt: number): void {
    const t0 = performance.now();
    this.lodT -= dt;
    if (this.lodT <= 0) {
      this.lodT = 0.25;
      const p = this.d.player.feet;
      for (const e of this.list) {
        if (e.dead) continue;
        const dist = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
        e.distToPlayer = dist;
        // 交戰中的敵人（包含 NPC 之間的交火）不論多遠都至少 1/15 秒一次，開火節奏才不會被拖慢
        e.interval = dist < 28 || (e.brain.engaged && dist < 70) ? 1 / 30 : dist < 55 || e.brain.engaged ? 1 / 15 : 1 / 6;
      }
    }
    this.assignFlanks(dt);
    for (const e of this.list) e.step(dt);
    this.frameAcc += performance.now() - t0;
  }

  /**
   * 包抄：同一群組有 2 個以上敵人進入戰鬥時，依難度與傾向的機率讓其中一個（離玩家較遠的）
   * 用 A* 算出一條避開隊友主路線的另一條路，繞到玩家側面。每個群組每 15 秒最多擲一次骰。
   */
  private assignFlanks(dt: number): void {
    this.flankT -= dt;
    if (this.flankT > 0) return;
    const step = 0.5;
    this.flankT = step;
    for (const [g, t] of this.flankCd) this.flankCd.set(g, t - step);
    const groups = new Map<string, Enemy[]>();
    for (const e of this.list) {
      if (e.dead || !e.group || !e.brain.engaged) continue;
      (groups.get(e.group) ?? groups.set(e.group, []).get(e.group)!).push(e);
    }
    for (const [g, members] of groups) {
      if (members.length < 2 || (this.flankCd.get(g) ?? 0) > 0 || members.some((m) => m.flank)) continue;
      // 包抄的目標：領頭的人正在打的對象（玩家，或 NPC 之間交火時的對手）
      const tp = members.find((m) => m.targetFeet)?.targetFeet;
      if (!tp) continue;
      this.flankCd.set(g, 15);
      members.sort((a, b) => a.pos.distanceTo(tp) - b.pos.distanceTo(tp));
      const main = members[0];
      const cand = members[members.length - 1];
      if (cand.pos.distanceTo(tp) < 12) continue;
      if (!shouldFlank({ difficulty: this.d.difficulty ?? 2, def: cand.def, rng: this.d.rng ?? Math.random })) continue;
      const nav = this.nav;
      const plan = planFlank(nav, nav.nearest(cand.pos), nav.nearest(main.pos), nav.nearest(tp));
      if (!plan || plan.shared > 1) continue;
      cand.flank = { route: plan.route.map((i) => nav.nodes[i].clone()), idx: 0, t: 0 };
    }
  }

  /** 每個畫面：更新動畫（只更新視錐內的，遠處降頻），並結算這個畫面的 AI 耗時 */
  updateAnim(frameDt: number, frustum: THREE.Frustum): void {
    const t0 = performance.now();
    for (const e of this.list) {
      if (!e.ready) continue;
      this.sphere.center.set(e.pos.x, e.pos.y + 0.9, e.pos.z);
      this.sphere.radius = 1.4;
      e.updateAnim(frameDt, frustum.intersectsSphere(this.sphere));
    }
    const ms = this.frameAcc + (performance.now() - t0);
    this.frameAcc = 0;
    this.aiMs = this.aiMs * 0.92 + ms * 0.08;
    this.aiMsMax = Math.max(this.aiMsMax * 0.995, ms);
  }

  /** 射線打到的最近敵人與命中資訊（沒打中 = null） */
  pick(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { e: Enemy; zone: HitZone; distance: number; point: THREE.Vector3 } | null {
    let best: { e: Enemy; zone: HitZone; distance: number; point: THREE.Vector3 } | null = null;
    for (const e of this.list) {
      if (e.dead) continue;
      const h = intersectHitZones(origin, dir, e.pos, e.facing, e.def.height, best ? best.distance : maxDist);
      if (h) best = { e, zone: h.zone, distance: h.distance, point: h.point };
    }
    return best;
  }

  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): TargetHit | null {
    const b = this.pick(origin, dir, maxDist);
    if (!b) return null;
    return {
      distance: b.distance, point: b.point, zone: b.zone,
      damage: (base, zone, from, weaponClass) => ({ killed: b.e.takeHit(base, zone, from, weaponClass).killed }),
    };
  }
}
