import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { preloadEnemyModel } from '../ai/EnemyModel';
import { makeLabel } from './maps/hub';
import type { TraderSpot } from './RaidMap';

const HEIGHT = 1.75;
const RADIUS = 0.38;

/**
 * 時代商人 NPC：站在攤位後面播放 Idle 動畫。
 *  - `hitbox`：隱形的圓柱，加進 WorldTrace，子彈打到只會播放命中聲（flesh），商人不會受傷
 *  - `collider`：加進地圖碰撞（Octree），玩家和敵人不會穿過
 * 敵人不會攻擊商人（AI 的目標只有玩家）。模型載入失敗時用方塊人偶。
 */
export class TraderNpc {
  readonly root = new THREE.Group();
  readonly hitbox: THREE.Mesh;
  readonly collider: THREE.Mesh;
  private mixer: THREE.AnimationMixer | null = null;
  private model: THREE.Object3D | null = null;
  private disposed = false;

  constructor(readonly spot: TraderSpot) {
    this.root.name = 'trader_npc';
    this.root.position.copy(spot.position);
    this.root.rotation.y = spot.yaw + Math.PI; // 模型朝 +Z；RaidMap 的 yaw 慣例是 forward = (-sin, -cos)

    const geo = new THREE.CylinderGeometry(RADIUS, RADIUS, HEIGHT, 10);
    geo.translate(0, HEIGHT / 2, 0);
    this.hitbox = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.position.copy(spot.position);
    this.hitbox.userData.flesh = true;
    this.hitbox.name = 'trader_hitbox';

    // 碰撞用的方塊（Octree 只吃三角形，方塊最簡單）
    this.collider = new THREE.Mesh(
      new THREE.BoxGeometry(RADIUS * 1.5, HEIGHT, RADIUS * 1.5).translate(0, HEIGHT / 2, 0),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.collider.position.copy(spot.position);
    this.collider.visible = false;

    const label = makeLabel(spot.name, '#ffd35a');
    label.position.set(0, HEIGHT + 0.55, 0);
    this.root.add(label);
    this.addFallback();
  }

  private addFallback(): void {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.3), new THREE.MeshLambertMaterial({ color: '#7a5a3a' }));
    body.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), new THREE.MeshLambertMaterial({ color: '#d2a98a' }));
    head.position.y = 1.62;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.55, 0.22), new THREE.MeshLambertMaterial({ color: '#2a3140' }));
    legs.position.y = 0.28;
    g.add(body, head, legs);
    g.name = 'trader_fallback';
    this.root.add(g);
  }

  async load(): Promise<void> {
    const gltf = await preloadEnemyModel('npc_worker');
    if (!gltf || this.disposed) return;
    const model = SkeletonUtils.clone(gltf.scene);
    const box = new THREE.Box3();
    model.updateMatrixWorld(true);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { const b = new THREE.Box3().setFromObject(m); if (isFinite(b.min.y)) box.union(b); }
    });
    const size = box.getSize(new THREE.Vector3());
    const k = size.y > 0.01 ? HEIGHT / size.y : 1;
    model.scale.multiplyScalar(k);
    model.position.y = -box.min.y * k;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; }
    });
    const idle = gltf.animations.find((c) => c.name.endsWith('Man_Idle')) ?? gltf.animations.find((c) => /idle/i.test(c.name));
    if (idle) {
      this.mixer = new THREE.AnimationMixer(model);
      this.mixer.clipAction(idle).play();
    }
    this.model = model;
    this.root.getObjectByName('trader_fallback')?.removeFromParent();
    this.root.add(model);
  }

  update(dt: number, visible: boolean): void {
    if (visible) this.mixer?.update(dt);
  }

  get loaded(): boolean { return !!this.model; }

  dispose(): void {
    this.disposed = true;
    this.root.removeFromParent();
    this.hitbox.removeFromParent();
  }
}
