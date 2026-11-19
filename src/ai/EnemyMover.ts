import * as THREE from 'three';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import type { Octree } from 'three/examples/jsm/math/Octree.js';

const RADIUS = 0.32;
const STEP = 0.5;

/**
 * 敵人的碰撞移動：不用完整物理，而是「水平膠囊推擠（從膝蓋以上，所以矮階不算牆）+ 向下射線貼地」。
 * 與玩家使用同一個靜態 Octree，所以牆壁、貨櫃都擋得住；可走上 0.5m 以內的台階與斜坡。
 */
export class EnemyMover {
  private cap = new Capsule(new THREE.Vector3(), new THREE.Vector3(), RADIUS);
  private ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  private losRay = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3());
  private tmp = new THREE.Vector3();

  constructor(readonly octree: Octree) {}

  /** (x, z) 腳下的地面高度；近 y 的範圍（向上 up、向下 down）內沒有就回傳 null */
  groundAt(x: number, y: number, z: number, up = STEP + 0.2, down = 2.5): number | null {
    this.ray.origin.set(x, y + up, z);
    const hit = this.octree.rayIntersect(this.ray);
    if (!hit || hit.distance > up + down) return null;
    return hit.position.y;
  }

  /**
   * 沿 (dx, dz) 移動 pos（腳底座標，就地修改）。回傳實際水平位移距離。
   * 被牆擋住就沿牆滑動；前方地面比腳高超過台階高度也視為牆。
   */
  move(pos: THREE.Vector3, dx: number, dz: number, dt: number): number {
    const ox = pos.x, oz = pos.z, oy = pos.y;
    let nx = ox + dx, nz = oz + dz;
    // 水平推擠
    const cap = this.cap;
    cap.start.set(nx, oy + 0.55, nz);
    cap.end.set(nx, oy + 1.5, nz);
    for (let i = 0; i < 3; i++) {
      const r = this.octree.capsuleIntersect(cap);
      if (!r) break;
      const px = r.normal.x * r.depth, pz = r.normal.z * r.depth;
      cap.start.x += px; cap.end.x += px; cap.start.z += pz; cap.end.z += pz;
    }
    nx = cap.start.x; nz = cap.start.z;
    // 貼地
    const g = this.groundAt(nx, oy, nz);
    if (g === null) {
      // 懸空（走出邊緣）：不讓敵人掉出地圖，原地不動
      return 0;
    }
    if (g - oy > STEP + 0.05) return 0; // 太高 = 牆
    pos.x = nx; pos.z = nz;
    if (g >= oy) pos.y = g;
    else pos.y = Math.max(g, oy - 9 * dt); // 下坡 / 落下
    return Math.hypot(nx - ox, nz - oz);
  }

  /** 兩點之間沒有靜態幾何擋住 */
  los(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const d = this.tmp.subVectors(b, a);
    const len = d.length();
    if (len < 0.01) return true;
    this.losRay.origin.copy(a);
    this.losRay.direction.copy(d).divideScalar(len);
    const hit = this.octree.rayIntersect(this.losRay);
    return !hit || hit.distance >= len - 0.15;
  }
}
