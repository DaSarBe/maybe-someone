import type * as THREE from 'three';
import type { ContainerType } from '../data/lootTables';
import type { GameMap } from './GameMap';

/**
 * Raid 地圖合約（Opus 定義，M4）
 *
 * 地圖模組（例如 maps/harbor1990.ts）只負責「場景與資料」，
 * RaidScene 負責「系統」（搜刮、撤離、穩定度、敵人 AI、戰鬥、商人）。
 * 兩邊只透過這個介面溝通。
 */

/** 敵人種類：數值與裝備在 src/data/enemies.ts 定義 */
export type EnemyKind = 'guard' | 'thug' | 'rival_agent';

export interface LootSpot {
  position: THREE.Vector3;
  /** 可能出現的容器種類，RaidScene 隨機挑一個 */
  types: ContainerType[];
  /** 模型朝向（弧度） */
  yaw?: number;
  /** 出現機率 0～1（預設 1） */
  chance?: number;
}

export interface EvacPoint {
  name: string;
  position: THREE.Vector3;
  radius: number;
  /** 每場 Raid 是否隨機開放（false 表示固定開放） */
  random?: boolean;
}

export interface EnemySpawn {
  kind: EnemyKind;
  position: THREE.Vector3;
  yaw?: number;
  /** 巡邏路徑（世界座標），沒有就原地站崗 */
  patrol?: THREE.Vector3[];
  /** 出現機率 0～1（預設 1） */
  chance?: number;
  /** 群組 id：同群組的敵人會互相通知 */
  group?: string;
}

/** 導航圖：AI 在節點之間移動，節點之間必須可以直線通行（沒有牆擋住、坡度可走） */
export interface NavGraph {
  nodes: THREE.Vector3[];
  /** 無向邊（節點索引） */
  edges: [number, number][];
}

export interface TraderSpot {
  name: string;
  position: THREE.Vector3;
  yaw: number;
}

export interface RaidMap extends GameMap {
  eraId: string;
  /** 玩家抵達點（時光機出口），RaidScene 隨機挑一個 */
  arrivals: { position: THREE.Vector3; yaw: number }[];
  lootSpots: LootSpot[];
  evacPoints: EvacPoint[];
  enemySpawns: EnemySpawn[];
  nav: NavGraph;
  trader?: TraderSpot;
  /** 地圖邊界（AI 與除錯用） */
  bounds: THREE.Box3;
  /** 每幀更新（例如水面、燈光閃爍），可選 */
  update?(dt: number, elapsed: number): void;
}

/** 地圖模組的進入點：非同步，因為可能要載入模型 */
export type RaidMapLoader = () => Promise<RaidMap>;
