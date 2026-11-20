import * as THREE from 'three';
import type { NoiseEvent, NoiseKind } from '../data/noise';
import type { GameBus } from '../core/EventBus';
import type { Input } from '../core/Input';
import { getSurfaceAt } from '../world/Surface';

type WeaponId = 'pistol' | 'rifle';

/**
 * M2 音效測試用的射擊：沒有傷害、彈藥或模型。
 * 左鍵 / 手機射擊鍵開槍；1 手槍、2 步槍、3 空槍；R 換彈。
 * 只發出 shot / impact / weaponAction 事件，音效系統自行處理。
 */
export class TestFire {
  weapon: WeaponId = 'pistol';
  private cooldown = 0;
  private ray = new THREE.Raycaster();
  private origin = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private center = new THREE.Vector2(0, 0);
  private onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code === 'Digit1') this.weapon = 'pistol';
    else if (e.code === 'Digit2') this.weapon = 'rifle';
    else if (e.code === 'Digit3') this.dryFire();
  };

  constructor(
    private bus: GameBus,
    private input: Input,
    private camera: THREE.Camera,
    private targets: THREE.Object3D[],
  ) {
    window.addEventListener('keydown', this.onKey);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
  }

  /** 每個畫面呼叫（相機矩陣已更新） */
  update(frameDt: number): void {
    this.cooldown = Math.max(0, this.cooldown - frameDt);
    if (this.input.consumePress('reload')) {
      this.noiseAt('reload', { stage: 0 });
    }
    if (this.input.consumePress('fire') && this.cooldown <= 0) {
      this.cooldown = this.weapon === 'rifle' ? 0.12 : 0.18;
      this.fire();
    }
  }

  private noiseAt(kind: NoiseKind, extra: Partial<NoiseEvent> = {}): void {
    const p = this.camera.getWorldPosition(new THREE.Vector3());
    this.bus.emit('noise', { kind, position: { x: p.x, y: p.y, z: p.z }, source: 'player', weaponId: this.weapon, ...extra });
  }

  private dryFire(): void {
    if (!this.input.active) return;
    this.noiseAt('dry_fire');
  }

  fire(): void {
    this.camera.getWorldPosition(this.origin);
    this.ray.setFromCamera(this.center, this.camera);
    this.ray.far = 150;
    this.dir.copy(this.ray.ray.direction);
    this.noiseAt('shot', { direction: { x: this.dir.x, y: this.dir.y, z: this.dir.z } });

    const hit = this.ray.intersectObjects(this.targets, false)[0];
    if (!hit) return;
    const n = hit.face ? this.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).clone() : undefined;
    this.bus.emit('impact', {
      surface: getSurfaceAt(hit.object),
      position: hit.point.clone(),
      normal: n,
    });
  }
}
