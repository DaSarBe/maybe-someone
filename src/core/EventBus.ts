import type * as THREE from 'three';
import type { ReverbType, ReverbZone, Surface } from '../world/Surface';

export type StepIntensity = 'crouch' | 'walk' | 'sprint';

/** 全部遊戲事件的名稱與 payload。新系統在這裡加事件即可。 */
export interface GameEvents {
  footstep: { surface: Surface; intensity: StepIntensity; position: THREE.Vector3; /** 發出者：省略 = 玩家；AI 為敵人 id */ source?: string };
  land: { surface: Surface; fallSpeed: number };
  reverbZoneChanged: { type: ReverbType; zone: ReverbZone | null };
  /** 任何人開槍（玩家、AI、其他玩家）。position 為槍口世界座標 */
  shot: { weaponId: string; position: THREE.Vector3; direction?: THREE.Vector3; /** 開槍者：省略 = 玩家；AI 為敵人 id */ shooter?: string };
  /** 子彈命中。surface 為命中物的材質 */
  impact: { surface: Surface; position: THREE.Vector3; normal?: THREE.Vector3; /** 打中人體（播放肉體命中音） */ flesh?: boolean };
  /** 槍械的其他聲音：換彈、空槍 */
  weaponAction: { weaponId: string; action: 'reload' | 'dry_fire'; position: THREE.Vector3 };
  /** 撿起物品（AudioManager 播放 ui pickup） */
  itemPicked: { itemId: string; qty: number };
  /** 玩家受傷（HUD 暈影與方向指示）。from 為攻擊者位置 */
  playerHurt: { amount: number; from?: THREE.Vector3; killed: boolean };
  /** 玩家的子彈打中敵人（命中標記） */
  enemyHit: { zone: 'head' | 'body' | 'limb'; killed: boolean; position: THREE.Vector3 };
  /** 時空穩定度（Raid 倒數）每秒更新；remaining 為剩餘秒數 */
  stabilityChanged: { remaining: number; total: number };
  /** Raid 結束 */
  raidEnded: { outcome: 'extract' | 'death' };
}

type Handler<P> = (payload: P) => void;

export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  /** 訂閱；回傳取消訂閱函式 */
  on<K extends keyof E>(name: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => this.off(name, fn);
  }

  off<K extends keyof E>(name: K, fn: Handler<E[K]>): void {
    this.handlers.get(name)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<E[K]>)(payload);
  }
}

export type GameBus = EventBus<GameEvents>;
