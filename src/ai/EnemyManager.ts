import * as THREE from 'three';
import type { GameBus } from '../core/EventBus';
import type { HitZone } from '../combat/Damage';
import { intersectHitZones } from '../combat/HitZones';
import type { CombatFx } from '../combat/Fx';
import type { TargetHit, TargetProvider } from '../combat/WeaponSystem';
import type { WorldTrace } from '../combat/WorldTrace';
import { ENEMIES } from '../data/enemies';
import type { EnemySpawn } from '../world/RaidMap';
import type { Surface } from '../world/Surface';
import { Enemy, type EnemyContext, type PlayerTarget } from './Enemy';
import { EnemyMover } from './EnemyMover';
import { NavIndex } from './Nav';
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
  damagePlayer(base: number, zone: HitZone, from: THREE.Vector3, killer: string): void;
  onDeath(e: Enemy): void;
  surfaceAt(p: THREE.Vector3): Surface;
  castShadow: boolean;
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

  constructor(private d: ManagerDeps) {
    this.nav = new NavIndex(d.nav);
    this.mover = new EnemyMover(d.octree);
    this.ctx = {
      bus: d.bus, mover: this.mover, nav: this.nav, fx: d.fx, trace: d.trace, player: d.player,
      lightAt: d.lightAt, damagePlayer: d.damagePlayer, castShadow: d.castShadow, all: this.list,
      alertGroup: (g, pos, except) => this.alertGroup(g, pos, except),
      onDeath: (e) => d.onDeath(e),
      surfaceAt: d.surfaceAt,
    };
    this.unsubs.push(
      d.bus.on('shot', (e) => {
        if (e.shooter) return;
        for (const en of this.list) en.hearShot(e.position);
      }),
      d.bus.on('footstep', (e) => {
        if (e.source) return;
        for (const en of this.list) en.hearFootstep(e.intensity, e.surface, e.position);
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
    const picked = spawns.filter((s) => rng() <= (s.chance ?? 1)).slice(0, MAX_ENEMIES);
    const made: Enemy[] = [];
    for (const s of picked) {
      const e = new Enemy(ENEMIES[s.kind], s, this.ctx);
      this.list.push(e);
      parent.add(e.root);
      made.push(e);
    }
    await Promise.all(made.map((e) => e.load()));
    return made;
  }

  get alive(): Enemy[] { return this.list.filter((e) => !e.dead); }

  alertGroup(group: string, pos: THREE.Vector3, exceptId: string): void {
    for (const e of this.list) if (e.group === group && e.id !== exceptId && !e.dead) e.brain.groupAlert(pos);
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
        e.interval = dist < 28 || (e.brain.engaged && dist < 70) ? 1 / 30 : dist < 55 ? 1 / 15 : 1 / 6;
      }
    }
    for (const e of this.list) e.step(dt);
    this.frameAcc += performance.now() - t0;
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

  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): TargetHit | null {
    let best: { e: Enemy; zone: HitZone; distance: number; point: THREE.Vector3 } | null = null;
    for (const e of this.list) {
      if (e.dead) continue;
      const h = intersectHitZones(origin, dir, e.pos, e.facing, e.def.height, best ? best.distance : maxDist);
      if (h) best = { e, zone: h.zone, distance: h.distance, point: h.point };
    }
    if (!best) return null;
    const b = best;
    return {
      distance: b.distance, point: b.point, zone: b.zone,
      damage: (base, zone, from) => ({ killed: b.e.takeHit(base, zone, from).killed }),
    };
  }
}
