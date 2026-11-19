import * as THREE from 'three';
import { getSurfaceAt, type Surface } from '../world/Surface';

export interface WorldHit {
  distance: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  surface: Surface;
  /** 打中的是人（商人等）：只播放命中聲，沒有彈孔 */
  flesh: boolean;
}

/** 對地圖 mesh 的射線（彈著點與材質）。玩家與敵人的子彈共用 */
export class WorldTrace {
  private ray = new THREE.Raycaster();
  private n = new THREE.Vector3();

  constructor(private meshes: THREE.Object3D[]) {}

  cast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): WorldHit | null {
    this.ray.set(origin, dir);
    this.ray.far = far;
    const hit = this.ray.intersectObjects(this.meshes, false)[0];
    if (!hit) return null;
    const normal = hit.face ? this.n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).clone() : dir.clone().negate();
    if (normal.dot(dir) > 0) normal.negate();
    return { distance: hit.distance, point: hit.point.clone(), normal, surface: getSurfaceAt(hit.object), flesh: hit.object.userData.flesh === true };
  }
}
