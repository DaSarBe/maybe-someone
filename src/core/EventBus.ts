import type * as THREE from 'three';
import type { ReverbType, ReverbZone, Surface } from '../world/Surface';
import type { NoiseEvent } from '../data/noise';

export type { StepIntensity } from '../data/noise';

/** 全部遊戲事件的名稱與 payload。新系統在這裡加事件即可。 */
export interface GameEvents {
  /**
   * 聲音事件：做任何事都會發（腳步、槍聲、換彈、搜刮、治療、交易、撤離…）。
   * 音效系統（播放）、敵人聽覺、聲音視覺提示都訂閱這一個事件；聽得到的距離見 data/noise.ts。
   * payload 可序列化（座標 {x,y,z}、source 為字串 id），第二階段可由伺服器直接廣播。
   */
  noise: NoiseEvent;
  reverbZoneChanged: { type: ReverbType; zone: ReverbZone | null };
  /** 子彈命中。surface 為命中物的材質 */
  impact: { surface: Surface; position: THREE.Vector3; normal?: THREE.Vector3; /** 打中人體（播放肉體命中音） */ flesh?: boolean };
  /** 撿起物品（AudioManager 播放 ui pickup） */
  itemPicked: { itemId: string; qty: number };
  /** 玩家受傷（HUD 暈影與方向指示）。from 為攻擊者位置 */
  playerHurt: { amount: number; from?: THREE.Vector3; killed: boolean; /** 護甲吸收了這一發（金屬悶響） */ armor?: boolean; /** 頭盔擋下了這一發（金屬「叮」，不播肉體命中音） */ helmet?: boolean; /** 打中頭部 */ head?: boolean };
  /** 頭盔被打中（玩家的：HUD 閃白光與耳鳴；level 為生效等級） */
  helmetHit: { target: 'player' | 'enemy'; level: number };
  /** 玩家的子彈打中敵人（命中標記） */
  enemyHit: { zone: 'head' | 'body' | 'limb'; killed: boolean; position: THREE.Vector3 };
  /** 子彈從玩家附近飛過（敵人打偏）。position 為子彈最接近玩家的點 */
  bulletFlyby: { position: THREE.Vector3; distance: number };
  /** 治療：開始 / 完成 / 取消（本機玩家的確認音；治療的「聲音」走 noise） */
  heal: { phase: 'start' | 'done' | 'cancel' };
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
