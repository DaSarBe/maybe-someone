import * as THREE from 'three';
import type { ReverbZone } from './Surface';

/** 地圖載入結果：所有地圖模組都回傳這個結構 */
export interface GameMap {
  /** 要加進場景的所有視覺物件 */
  root: THREE.Object3D;
  /** 供 Octree 建立碰撞的物件（只含靜態碰撞幾何） */
  collision: THREE.Object3D;
  /** 可被射線偵測材質的 mesh（腳下、彈著點） */
  surfaceMeshes: THREE.Mesh[];
  reverbZones: ReverbZone[];
  spawn: { position: THREE.Vector3; yaw: number };
}
