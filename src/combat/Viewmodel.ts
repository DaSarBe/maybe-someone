import * as THREE from 'three';
import type { ViewmodelStyle } from '../data/weaponHandling';
import { getWeaponModel } from './WeaponModels';

/** 第一人稱武器模型。優先用 Quaternius 的 OBJ 模型（combat/WeaponModels.ts），載入失敗退回程式產生的方塊槍 */

interface Built {
  group: THREE.Group;
  /** 槍口（模型座標，槍管朝 -Z） */
  muzzle: THREE.Vector3;
  /** 瞄準時，準星需要落在畫面中心：模型座標系的準星高度 */
  sightY: number;
  /** 瞄準時模型原點的深度（相機前方，公尺，負值）；省略 = -0.19 */
  adsZ?: number;
  /** 瞄準時隱藏的部件（槍托離鏡頭太近會擋住畫面） */
  stocks?: THREE.Mesh[];
}

const mats = new Map<string, THREE.MeshLambertMaterial>();
function mat(color: string): THREE.MeshLambertMaterial {
  let m = mats.get(color);
  if (!m) mats.set(color, (m = new THREE.MeshLambertMaterial({ color })));
  return m;
}

function box(g: THREE.Group, color: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(color));
  m.position.set(x, y, z);
  m.rotation.x = rx;
  g.add(m);
  return m;
}

/** 整體縮放：數值以真實比例建模，這裡縮小到畫面上剛好的大小 */
const VM_SCALE = 0.5;
const SKIN = '#d3a07c';
const SLEEVE = '#3b4a5a';

function hands(g: THREE.Group, rightZ: number, leftZ: number): void {
  // 右手握把、左手托護木，附手臂（往畫面右下與左下延伸）
  box(g, SKIN, 0.055, 0.07, 0.09, 0.0, -0.075, rightZ);
  box(g, SLEEVE, 0.075, 0.075, 0.34, 0.03, -0.12, rightZ + 0.2, -0.25);
  box(g, SKIN, 0.07, 0.06, 0.1, -0.005, -0.03, leftZ);
  box(g, SLEEVE, 0.08, 0.08, 0.36, -0.07, -0.1, leftZ + 0.22, -0.3);
}

/** 手與手臂放在模型的握把與護木位置 */
function handsAt(g: THREE.Group, grip: THREE.Vector3, fore: THREE.Vector3): THREE.Mesh[] {
  box(g, SKIN, 0.055, 0.07, 0.09, grip.x, grip.y - 0.012, grip.z);
  const a = box(g, SLEEVE, 0.075, 0.075, 0.34, grip.x + 0.03, grip.y - 0.06, grip.z + 0.2, -0.25);
  box(g, SKIN, 0.07, 0.06, 0.1, fore.x, fore.y - 0.035, fore.z);
  const b = box(g, SLEEVE, 0.08, 0.08, 0.36, fore.x - 0.07, fore.y - 0.1, fore.z + 0.22, -0.3);
  return [a, b]; // 袖子：瞄準時隱藏，不擋住視線
}

export function buildWeapon(style: ViewmodelStyle): Built {
  const g = new THREE.Group();
  const model = getWeaponModel(style);
  if (model) {
    g.add(model.group);
    const sleeves = handsAt(g, model.grip, model.fore);
    return { group: g, muzzle: model.muzzle.clone(), sightY: model.sightY, stocks: [...model.stocks, ...sleeves], adsZ: -0.3 };
  }
  const dark = '#2b2f36', mid = '#454c57', light = '#6b7482', wood = '#7a5230';
  switch (style) {
    case 'pistol': {
      box(g, mid, 0.05, 0.06, 0.26, 0, 0.0, -0.12);            // 滑套
      box(g, dark, 0.045, 0.045, 0.1, 0, -0.01, -0.3);          // 槍口段
      box(g, dark, 0.04, 0.1, 0.05, 0, -0.08, -0.03, 0.2);       // 握把
      box(g, light, 0.012, 0.014, 0.012, 0, 0.037, -0.22);       // 準星
      box(g, light, 0.03, 0.014, 0.012, 0, 0.037, -0.02);        // 缺口
      hands(g, -0.03, -0.1);
      return { group: g, muzzle: new THREE.Vector3(0, -0.01, -0.36), sightY: 0.045 };
    }
    case 'smg': {
      box(g, dark, 0.055, 0.08, 0.34, 0, 0, -0.15);
      box(g, mid, 0.04, 0.04, 0.16, 0, 0.0, -0.4);               // 槍管護套
      box(g, dark, 0.035, 0.16, 0.05, 0, -0.12, -0.1);           // 彈匣（長）
      box(g, dark, 0.045, 0.1, 0.05, 0, -0.08, 0.05, 0.25);       // 握把
      box(g, mid, 0.045, 0.06, 0.12, 0, 0.0, 0.1);              // 槍托
      box(g, light, 0.012, 0.02, 0.012, 0, 0.055, -0.38);
      box(g, light, 0.03, 0.02, 0.012, 0, 0.055, -0.05);
      hands(g, 0.03, -0.25);
      return { group: g, muzzle: new THREE.Vector3(0, 0, -0.5), sightY: 0.065 };
    }
    case 'rifle': {
      box(g, dark, 0.06, 0.09, 0.42, 0, 0, -0.1);               // 機匣
      box(g, mid, 0.05, 0.055, 0.34, 0, 0.0, -0.46);             // 護木
      box(g, light, 0.022, 0.022, 0.2, 0, 0.0, -0.74);           // 槍管
      box(g, dark, 0.04, 0.14, 0.07, 0, -0.12, -0.05, 0.18);      // 彈匣
      box(g, dark, 0.045, 0.1, 0.05, 0, -0.09, 0.06, 0.3);        // 握把
      const stock = box(g, wood, 0.055, 0.1, 0.24, 0, -0.01, 0.28);            // 槍托
      box(g, light, 0.014, 0.03, 0.014, 0, 0.07, -0.62);         // 準星柱
      box(g, light, 0.04, 0.025, 0.014, 0, 0.065, 0.05);         // 照門
      hands(g, 0.06, -0.38);
      return { group: g, muzzle: new THREE.Vector3(0, 0, -0.85), sightY: 0.08, stocks: [stock] };
    }
    case 'shotgun': {
      box(g, wood, 0.06, 0.09, 0.4, 0, 0, -0.05);
      box(g, light, 0.034, 0.034, 0.62, 0, 0.02, -0.55);         // 槍管
      box(g, dark, 0.03, 0.03, 0.55, 0, -0.025, -0.5);           // 彈倉管
      box(g, wood, 0.065, 0.06, 0.18, 0, -0.03, -0.42);          // 泵動護木
      const stock = box(g, wood, 0.055, 0.11, 0.26, 0, -0.01, 0.3);
      box(g, light, 0.012, 0.014, 0.012, 0, 0.05, -0.85);
      hands(g, 0.08, -0.42);
      return { group: g, muzzle: new THREE.Vector3(0, 0.02, -0.88), sightY: 0.055, stocks: [stock] };
    }
  }
}

function glow(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,235,1)');
  grad.addColorStop(0.3, 'rgba(255,205,100,0.9)');
  grad.addColorStop(1, 'rgba(255,130,30,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface VmFrame {
  /** 瞄準程度 0..1 */
  ads: number;
  /** 水平移動速度 */
  speed: number;
  sprinting: boolean;
  grounded: boolean;
  /** 換彈進度 0..1（沒在換彈 = 0，reloading 為 false） */
  reloading: boolean;
  reloadProgress: number;
  /** 本幀視角增量（弧度），用來做武器的慣性擺動 */
  lookX: number;
  lookY: number;
}

/**
 * 第一人稱武器：獨立的場景與相機（在主場景之後、清除深度再畫），所以不會穿進牆壁。
 * 動畫：射擊後座、換彈（槍往下移再回來）、走路晃動、瞄準時移到畫面中央、切換武器時從下方抬起。
 */
export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.01, 5);
  private holder = new THREE.Group();
  private flashSprite: THREE.Sprite;
  private flashLife = 0;
  private current: Built | null = null;
  private style: ViewmodelStyle | null = null;
  // 彈簧狀態
  private kickZ = 0; private kickZv = 0;
  private kickRot = 0; private kickRotv = 0;
  private swayX = 0; private swayY = 0;
  private bobPhase = 0;
  private reloadAmt = 0;
  private raise = 1; // 0 = 完全放下，1 = 舉起
  private time = 0;

  constructor() {
    this.scene.add(new THREE.AmbientLight('#ffffff', 1.6));
    const d = new THREE.DirectionalLight('#fff3dd', 1.8);
    d.position.set(0.6, 1.2, 0.8);
    this.scene.add(d);
    this.scene.add(this.camera, this.holder);
    this.holder.scale.setScalar(VM_SCALE);
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flashSprite.visible = false;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  get visible(): boolean { return this.holder.visible; }
  set visible(v: boolean) { this.holder.visible = v; }

  /** 換武器：從下方抬起 */
  setWeapon(style: ViewmodelStyle | null): void {
    if (style === this.style) return;
    this.style = style;
    if (this.current) {
      this.holder.remove(this.current.group);
      this.current.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
      this.current = null;
    }
    if (style) {
      this.current = buildWeapon(style);
      this.holder.add(this.current.group);
      this.current.group.add(this.flashSprite);
      this.flashSprite.position.copy(this.current.muzzle);
      this.raise = 0;
    }
    this.holder.visible = !!style;
  }

  /** 射擊後座：槍往後、槍口上揚，加上火光 */
  kick(strength = 1): void {
    this.kickZv += 0.9 * strength;
    this.kickRotv += 2.6 * strength;
    this.flashLife = 0.05;
    this.flashSprite.visible = true;
    this.flashSprite.scale.setScalar(0.28 + Math.random() * 0.16);
    this.flashSprite.material.rotation = Math.random() * 6.28;
  }

  /** 槍口的世界座標（曳光彈起點）；需在 update 之後呼叫 */
  muzzleWorld(mainCamera: THREE.Camera, out: THREE.Vector3): THREE.Vector3 {
    if (!this.current) return out.copy(mainCamera.position);
    // viewmodel 相機與主相機姿態相同：直接把 vm 座標轉到主相機的世界座標
    this.scene.updateMatrixWorld();
    out.copy(this.current.muzzle);
    this.current.group.localToWorld(out);
    out.applyMatrix4(mainCamera.matrixWorld);
    return out;
  }

  update(dt: number, f: VmFrame): void {
    if (!this.current) return;
    this.time += dt;
    dt = Math.min(dt, 0.05);
    // 彈簧
    const k = 180, c = 16;
    this.kickZv += (-k * this.kickZ - c * this.kickZv) * dt;
    this.kickZ += this.kickZv * dt;
    this.kickRotv += (-k * this.kickRot - c * this.kickRotv) * dt;
    this.kickRot += this.kickRotv * dt;

    this.raise = Math.min(1, this.raise + dt / 0.28);
    const raiseE = 1 - Math.pow(1 - this.raise, 3);

    const reloadTarget = f.reloading ? Math.sin(Math.min(1, f.reloadProgress) * Math.PI) ** 0.5 : 0;
    this.reloadAmt += (reloadTarget - this.reloadAmt) * Math.min(1, dt * 14);

    // 慣性擺動
    this.swayX += (-f.lookX * 1.4 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (f.lookY * 1.4 - this.swayY) * Math.min(1, dt * 10);
    const sx = THREE.MathUtils.clamp(this.swayX, -0.05, 0.05);
    const sy = THREE.MathUtils.clamp(this.swayY, -0.04, 0.04);

    // 走路晃動
    const moving = f.grounded && f.speed > 0.5;
    const rate = f.sprinting ? 11 : 7.5;
    if (moving) this.bobPhase += dt * rate * (f.speed / 4);
    const bobAmp = moving ? (f.sprinting ? 0.016 : 0.008) * (1 - f.ads * 0.85) : 0;
    const bobX = Math.cos(this.bobPhase) * bobAmp;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * bobAmp * 1.2;
    const idle = Math.sin(this.time * 1.6) * 0.0015 * (1 - f.ads);

    const hip = new THREE.Vector3(0.125, -0.115, -0.38);
    const adsPos = new THREE.Vector3(0, -this.current.sightY * VM_SCALE - 0.01, this.current.adsZ ?? -0.19);
    const p = hip.lerp(adsPos, f.ads);
    const sprintPose = f.sprinting && moving ? 1 : 0;
    for (const m of this.current.stocks ?? []) m.visible = f.ads < 0.6;

    this.holder.position.set(
      p.x + bobX + sx * 0.6 + sprintPose * 0.05,
      p.y + bobY + idle - sy * 0.6 - (1 - raiseE) * 0.35 - this.reloadAmt * 0.22 - sprintPose * 0.03,
      p.z + this.kickZ * 0.045 + this.reloadAmt * 0.03,
    );
    this.holder.rotation.set(
      this.kickRot * 0.045 + sy * 0.5 - this.reloadAmt * 0.5 + sprintPose * 0.12,
      sx * 0.8 + sprintPose * -0.5,
      this.reloadAmt * 0.45 + bobX * 4,
    );

    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) this.flashSprite.visible = false;
    }
  }
}
