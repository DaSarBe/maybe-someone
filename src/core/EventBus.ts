import type * as THREE from 'three';
import type { ReverbType, ReverbZone, Surface } from '../world/Surface';

export type StepIntensity = 'crouch' | 'walk' | 'sprint';

/** 全部遊戲事件的名稱與 payload。新系統在這裡加事件即可。 */
export interface GameEvents {
  footstep: { surface: Surface; intensity: StepIntensity; position: THREE.Vector3 };
  land: { surface: Surface; fallSpeed: number };
  reverbZoneChanged: { type: ReverbType; zone: ReverbZone | null };
  /** 任何人開槍（玩家、AI、其他玩家）。position 為槍口世界座標 */
  shot: { weaponId: string; position: THREE.Vector3; direction?: THREE.Vector3 };
  /** 子彈命中。surface 為命中物的材質 */
  impact: { surface: Surface; position: THREE.Vector3; normal?: THREE.Vector3 };
  /** 槍械的其他聲音：換彈、空槍 */
  weaponAction: { weaponId: string; action: 'reload' | 'dry_fire'; position: THREE.Vector3 };
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
