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

/** 地圖的環境音設定（只在有設定的地圖播放；AudioManager 不寫死地圖） */
export interface MapAmbience {
  /** 定位音源：浪聲。依玩家到這些點的最近距離決定音量（refDist 內全開，maxDist 外無聲） */
  waves?: { points: THREE.Vector3[]; refDist: number; maxDist: number; volume: number };
  /** 海鷗：室外時隨機間隔（秒）在遠處隨機方位播放 */
  seagulls?: { interval: [number, number]; volume: number };
  /** 遠方汽笛：每場 Raid 隨機響 count 次，落在 Raid 時間內的隨機時刻 */
  shipHorn?: { count: [number, number]; volume: number; origin: THREE.Vector3; distance: [number, number] };
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
  /**
   * 地圖自帶光源、霧、天空（root 內已經有）。true 時 RaidScene 不再呼叫 setupLighting，也不重複設霧。
   * 省略或 false：RaidScene 套用預設的半球光 + 太陽光 + 霧。
   */
  ownsLighting?: boolean;
  /**
   * 某個世界座標的亮度 0..1（0 = 全黑，1 = 全亮；敵人用它判斷「暗處不容易發現玩家」）。
   * 省略時 RaidScene 以回音區（室內外）近似。
   */
  lightAt?(pos: THREE.Vector3): number;
  /** 環境音設定，省略 = 沒有地圖專屬環境音 */
  ambience?: MapAmbience;
  /** 每幀更新（例如水面、燈光閃爍），可選 */
  update?(dt: number, elapsed: number): void;
}

/** 地圖模組的進入點：非同步，因為可能要載入模型 */
export type RaidMapLoader = () => Promise<RaidMap>;
