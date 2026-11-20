import * as THREE from 'three';
import type { Viewmodel } from './Viewmodel';
import type { WorldTrace } from './WorldTrace';

/**
 * 戰術裝備的世界特效（玩家自己看得到的部分）：
 *  - 手電筒：掛在相機上的聚光燈（預先加入、關閉時強度 0，避免臨時加燈造成材質重編譯）
 *  - 雷射：從槍上的雷射模組射到準心所指的地方的紅色光束 + 命中點的紅色光點
 * 敵人看見手電筒 / 雷射的判定在 ai/Perception.ts（tacticalVision），這裡只管畫面。
 */
export class TacticalFx {
  readonly spot = new THREE.SpotLight('#fff1cf', 0, 46, 0.4, 0.55, 1.3);
  private beam: THREE.Mesh;
  private dot: THREE.Sprite;
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private origin = new THREE.Vector3();
  private mid = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private static Z = new THREE.Vector3(0, 0, 1);

  constructor(private camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.spot.position.set(0.1, -0.08, 0);
    this.spot.target.position.set(0, 0, -10);
    camera.add(this.spot, this.spot.target);
    this.beam = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#ff3020', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.beam.visible = false;
    this.beam.frustumCulled = false;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,230,220,1)');
    grad.addColorStop(0.2, 'rgba(255,50,30,0.95)');
    grad.addColorStop(1, 'rgba(255,30,10,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.dot.visible = false;
    scene.add(this.beam, this.dot);
  }

  /** 每個畫面（相機與 viewmodel 已更新）：kind = 目前開著的戰術裝備；ads = 瞄準程度 */
  update(kind: 'flashlight' | 'laser' | null, vm: Viewmodel, trace: WorldTrace, ads: number): void {
    const fl = kind === 'flashlight';
    this.spot.intensity = fl ? 90 : 0;
    const laser = kind === 'laser';
    this.beam.visible = this.dot.visible = laser;
    if (!laser) return;
    const cam = this.camera;
    cam.getWorldPosition(this.origin);
    cam.getWorldDirection(this.dir);
    const hit = trace.cast(this.origin, this.dir, 120);
    const dist = hit ? hit.distance : 120;
    this.b.copy(this.origin).addScaledVector(this.dir, dist);
    if (hit) this.b.addScaledVector(hit.normal, 0.015);
    const start = vm.tacticalWorld(cam, this.a);
    if (!start) { this.beam.visible = this.dot.visible = false; return; }
    this.mid.addVectors(start, this.b).multiplyScalar(0.5);
    const len = start.distanceTo(this.b);
    this.beam.position.copy(this.mid);
    this.beam.scale.set(0.004, 0.004, len);
    this.q.setFromUnitVectors(TacticalFx.Z, this.dir.subVectors(this.b, start).normalize());
    this.beam.quaternion.copy(this.q);
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - Math.min(1, ads * 1.4));
    this.dot.position.copy(this.b);
    this.dot.scale.setScalar(0.06 + dist * 0.006);
  }

  dispose(): void {
    this.spot.removeFromParent();
    this.spot.target.removeFromParent();
    this.beam.removeFromParent();
    this.dot.removeFromParent();
    this.beam.geometry.dispose();
    (this.beam.material as THREE.Material).dispose();
    (this.dot.material as THREE.SpriteMaterial).map?.dispose();
    (this.dot.material as THREE.Material).dispose();
  }
}
