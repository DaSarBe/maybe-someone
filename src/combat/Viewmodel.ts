import * as THREE from 'three';
import type { WeaponMods } from '../data/attachments';
import type { ViewmodelStyle } from '../data/weaponHandling';
import { adsPoseOf, buildAssembly, disposeAssembly, type Assembly } from './WeaponAssembly';

/**
 * 第一人稱武器模型。優先用 Quaternius 的 OBJ 模型（combat/WeaponModels.ts），載入失敗退回程式產生的方塊槍；
 * 配件由 combat/WeaponAssembly.ts 組裝在槍上。
 *
 * 瞄準（ADS）：由瞄準線（機械瞄具的照門 + 準星，或紅點 / 全息 / 倍鏡的視窗中心）自動算出 viewmodel 的位置，
 * 讓瞄準點剛好落在畫面中心、對齊相機視線 —— 射擊走相機視線，所以彈著點與瞄具指的位置一致。
 * 紅點 / 全息的光點畫在「相機視線」上（不是固定在鏡片上），槍晃動時光點仍然對準射擊點，只有離開視窗才淡出。
 * 倍鏡：瞄準到底時隱藏槍（整個畫面由 CombatHud 的倍鏡畫面蓋住，比畫中畫省效能）。
 */

/** 整體縮放：數值以真實比例建模，這裡縮小到畫面上剛好的大小 */
export const VM_SCALE = 0.5;
const SKIN = '#d3a07c';
const SLEEVE = '#3b4a5a';
/** 倍鏡瞄準到這個程度就隱藏槍（由倍鏡畫面接手） */
const SCOPE_HIDE_AT = 0.93;

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

/** 手與手臂放在槍的握把與護木位置；回傳袖子（瞄準時隱藏，不擋住視線） */
function handsAt(g: THREE.Group, grip: THREE.Vector3, fore: THREE.Vector3): THREE.Mesh[] {
  box(g, SKIN, 0.055, 0.07, 0.09, grip.x, grip.y - 0.012, grip.z);
  const a = box(g, SLEEVE, 0.075, 0.075, 0.34, grip.x + 0.03, grip.y - 0.06, grip.z + 0.2, -0.25);
  box(g, SKIN, 0.07, 0.06, 0.1, fore.x, fore.y - 0.035, fore.z);
  const b = box(g, SLEEVE, 0.08, 0.08, 0.36, fore.x - 0.07, fore.y - 0.1, fore.z + 0.22, -0.3);
  return [a, b];
}

interface Built {
  /** 槍 + 手 */
  group: THREE.Group;
  asm: Assembly;
  /** 瞄準時隱藏的部件（槍托、袖子） */
  hide: THREE.Object3D[];
  /** 瞄準姿勢（holder 的位置與繞 X 的俯仰） */
  ads: { position: THREE.Vector3; pitch: number };
}

export function buildWeapon(style: ViewmodelStyle, mods: WeaponMods | undefined): Built {
  const asm = buildAssembly(style, mods);
  const group = new THREE.Group();
  group.add(asm.group);
  const sleeves = handsAt(group, asm.grip, asm.fore);
  return { group, asm, hide: [...asm.stocks, ...sleeves], ads: adsPoseOf(asm, VM_SCALE) };
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

/** 紅點：實心圓 + 光暈；全息：圓圈 + 中心點 + 四個刻度（Canvas 繪製，加法混合） */
function reticleTexture(kind: 'reddot' | 'holo'): THREE.Texture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const m = S / 2;
  const halo = (r: number, a: number, color = '255,40,30'): void => {
    const grad = g.createRadialGradient(m, m, 0, m, m, r);
    grad.addColorStop(0, `rgba(${color},${a})`);
    grad.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  };
  if (kind === 'reddot') {
    halo(m, 0.55);
    g.fillStyle = 'rgba(255,70,50,1)';
    g.beginPath(); g.arc(m, m, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,200,190,0.95)';
    g.beginPath(); g.arc(m, m, 4, 0, Math.PI * 2); g.fill();
  } else {
    halo(m, 0.25);
    g.strokeStyle = 'rgba(255,60,45,0.95)';
    g.lineWidth = 6;
    g.beginPath(); g.arc(m, m, 44, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,70,50,1)';
    g.beginPath(); g.arc(m, m, 5, 0, Math.PI * 2); g.fill();
    g.lineWidth = 5;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      g.beginPath(); g.moveTo(m + dx * 44, m + dy * 44); g.lineTo(m + dx * 58, m + dy * 58); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function lampTexture(color: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${color},1)`);
  grad.addColorStop(0.35, `rgba(${color},0.55)`);
  grad.addColorStop(1, `rgba(${color},0)`);
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
 * 動畫：射擊後座、換彈（槍往下移再回來）、走路晃動、瞄準時移到畫面中央（瞄準時晃動幾乎消失）、切換武器時從下方抬起。
 */
export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.01, 5);
  private holder = new THREE.Group();
  private flashSprite: THREE.Sprite;
  private flashLife = 0;
  private current: Built | null = null;
  private style: ViewmodelStyle | null = null;
  private modsKey = '';
  private mods: WeaponMods | undefined;
  // 紅點 / 全息的光點（畫在相機視線上，不在鏡片上）
  private dot: THREE.Sprite;
  private dotTex: Record<'reddot' | 'holo', THREE.Texture>;
  private lamp: THREE.Sprite;
  private lampFlash: THREE.Texture;
  private lampLaser: THREE.Texture;
  private tacticalOn = false;
  // 彈簧狀態
  private kickZ = 0; private kickZv = 0;
  private kickRot = 0; private kickRotv = 0;
  private swayX = 0; private swayY = 0;
  private bobPhase = 0;
  private reloadAmt = 0;
  private raise = 1; // 0 = 完全放下，1 = 舉起
  private time = 0;
  private hideStocks = false;
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  /** 光點目前的淡入程度與槍是否被倍鏡畫面取代（HUD 讀取） */
  scoped = false;

  constructor() {
    this.scene.add(new THREE.AmbientLight('#ffffff', 1.6));
    const d = new THREE.DirectionalLight('#fff3dd', 1.8);
    d.position.set(0.6, 1.2, 0.8);
    this.scene.add(d);
    this.scene.add(this.camera, this.holder);
    this.holder.scale.setScalar(VM_SCALE);
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flashSprite.visible = false;
    this.dotTex = { reddot: reticleTexture('reddot'), holo: reticleTexture('holo') };
    this.dot = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.dotTex.reddot, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
    }));
    this.dot.renderOrder = 20;
    this.dot.visible = false;
    this.scene.add(this.dot);
    this.lampFlash = lampTexture('255,244,200');
    this.lampLaser = lampTexture('255,40,30');
    this.lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.lampFlash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.lamp.visible = false;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  get visible(): boolean { return this.holder.visible; }
  set visible(v: boolean) { this.holder.visible = v; }

  /** 目前槍的瞄具種類與倍鏡資訊（HUD 用） */
  get sight(): Assembly['sight'] { return this.current?.asm.sight ?? 'iron'; }

  /** 換武器 / 換配件：重新組裝（換槍時從下方抬起；只換配件不抬起）。mods 相同就不動 */
  setWeapon(style: ViewmodelStyle | null, mods?: WeaponMods): void {
    const key = `${style ?? ''}|${JSON.stringify(mods ?? {})}`;
    if (style === this.style && key === this.modsKey) return;
    const sameGun = style === this.style;
    this.style = style;
    this.modsKey = key;
    this.mods = mods;
    this.disposeCurrent();
    if (style) {
      this.current = buildWeapon(style, mods);
      this.holder.add(this.current.group);
      this.current.group.add(this.flashSprite, this.lamp);
      this.placeSprites();
      if (!sameGun) this.raise = 0;
    }
    this.holder.visible = !!style;
  }

  /** 模型載入完成後重新組裝（不重新抬起） */
  rebuild(): void {
    const s = this.style;
    if (!s) return;
    this.style = null; this.modsKey = '';
    this.setWeapon(s, this.mods);
    this.raise = 1;
  }

  private disposeCurrent(): void {
    if (!this.current) return;
    this.holder.remove(this.current.group);
    this.current.group.remove(this.flashSprite, this.lamp);
    disposeAssembly(this.current.asm);
    this.current.group.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.type === 'BoxGeometry') (o as THREE.Mesh).geometry.dispose(); });
    this.current = null;
  }

  private placeSprites(): void {
    const c = this.current;
    if (!c) return;
    this.flashSprite.position.copy(c.asm.muzzle);
    const t = c.asm.tactical;
    if (t) {
      this.lamp.position.copy(t.point);
      (this.lamp.material as THREE.SpriteMaterial).map = t.kind === 'laser' ? this.lampLaser : this.lampFlash;
      (this.lamp.material as THREE.SpriteMaterial).needsUpdate = true;
      this.lamp.scale.setScalar(t.kind === 'laser' ? 0.025 : 0.1);
    }
    this.lamp.visible = !!t && this.tacticalOn;
    const kind = c.asm.sight;
    if (kind === 'reddot' || kind === 'holo') {
      (this.dot.material as THREE.SpriteMaterial).map = this.dotTex[kind];
      (this.dot.material as THREE.SpriteMaterial).needsUpdate = true;
    }
  }

  /** 手電筒 / 雷射的開關（槍上的發光點） */
  setTactical(on: boolean): void {
    this.tacticalOn = on;
    this.lamp.visible = !!this.current?.asm.tactical && on;
  }

  /** 射擊後座：槍往後、槍口上揚，加上火光（flash = 火光大小倍率，滅音器很小） */
  kick(strength = 1, flash = 1): void {
    this.kickZv += 0.9 * strength;
    this.kickRotv += 2.6 * strength;
    this.flashLife = 0.05;
    this.flashSprite.visible = flash > 0.05;
    this.flashSprite.scale.setScalar((0.28 + Math.random() * 0.16) * flash);
    this.flashSprite.material.rotation = Math.random() * 6.28;
  }

  /** 槍口的世界座標（曳光彈起點）；需在 update 之後呼叫 */
  muzzleWorld(mainCamera: THREE.Camera, out: THREE.Vector3): THREE.Vector3 {
    if (!this.current) return out.copy(mainCamera.position);
    // viewmodel 相機與主相機姿態相同：直接把 vm 座標轉到主相機的世界座標
    this.scene.updateMatrixWorld();
    out.copy(this.current.asm.muzzle);
    this.current.group.localToWorld(out);
    out.applyMatrix4(mainCamera.matrixWorld);
    return out;
  }

  /** 雷射 / 手電筒發射點的世界座標；沒有戰術裝備回傳 null */
  tacticalWorld(mainCamera: THREE.Camera, out: THREE.Vector3): THREE.Vector3 | null {
    const t = this.current?.asm.tactical;
    if (!t || !this.current) return null;
    this.scene.updateMatrixWorld();
    out.copy(t.point);
    this.current.group.localToWorld(out);
    out.applyMatrix4(mainCamera.matrixWorld);
    return out;
  }

  /** 瞄準線（照門、準星、視窗）在 viewmodel 相機座標的位置（測試與除錯用） */
  debugAim(): { rear: THREE.Vector3; front: THREE.Vector3; window: THREE.Vector3 | null } | null {
    const c = this.current;
    if (!c) return null;
    this.scene.updateMatrixWorld(true);
    const rear = c.asm.aim.rear.clone(); c.group.localToWorld(rear);
    const front = c.asm.aim.front.clone(); c.group.localToWorld(front);
    const win = c.asm.window ? c.asm.window.center.clone() : null;
    if (win) c.group.localToWorld(win);
    return { rear, front, window: win };
  }

  update(dt: number, f: VmFrame): void {
    if (!this.current) return;
    this.time += dt;
    dt = Math.min(dt, 0.05);
    const cur = this.current;
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

    // 慣性擺動（瞄準時幾乎不晃，瞄具才能穩定對準）
    const calm = 1 - f.ads * 0.92;
    this.swayX += (-f.lookX * 1.4 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (f.lookY * 1.4 - this.swayY) * Math.min(1, dt * 10);
    const sx = THREE.MathUtils.clamp(this.swayX, -0.05, 0.05) * calm;
    const sy = THREE.MathUtils.clamp(this.swayY, -0.04, 0.04) * calm;

    // 走路晃動
    const moving = f.grounded && f.speed > 0.5;
    const rate = f.sprinting ? 11 : 7.5;
    if (moving) this.bobPhase += dt * rate * (f.speed / 4);
    const bobAmp = moving ? (f.sprinting ? 0.016 : 0.008) * (1 - f.ads * 0.92) : 0;
    const bobX = Math.cos(this.bobPhase) * bobAmp;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * bobAmp * 1.2;
    const idle = Math.sin(this.time * 1.6) * 0.0015 * calm;

    const hip = this.tmpV.set(0.125, -0.115, -0.38);
    const p = hip.lerp(cur.ads.position, f.ads);
    const sprintPose = f.sprinting && moving ? 1 : 0;
    this.hideStocks = f.ads >= 0.6;
    for (const m of cur.hide) m.visible = !this.hideStocks;

    // 倍鏡：瞄準到底就隱藏槍（由 HUD 的倍鏡畫面取代）
    this.scoped = cur.asm.sight === 'scope' && f.ads >= SCOPE_HIDE_AT;
    this.holder.visible = !this.scoped;

    this.holder.position.set(
      p.x + bobX + sx * 0.6 + sprintPose * 0.05,
      p.y + bobY + idle - sy * 0.6 - (1 - raiseE) * 0.35 - this.reloadAmt * 0.22 - sprintPose * 0.03,
      p.z + this.kickZ * 0.045 + this.reloadAmt * 0.03,
    );
    this.holder.rotation.set(
      cur.ads.pitch * f.ads + this.kickRot * 0.045 * (1 - f.ads * 0.5) + sy * 0.5 - this.reloadAmt * 0.5 + sprintPose * 0.12,
      sx * 0.8 + sprintPose * -0.5,
      this.reloadAmt * 0.45 + bobX * 4,
    );

    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) this.flashSprite.visible = false;
    }
    this.updateDot(f.ads);
  }

  /** 紅點 / 全息的光點：固定在相機視線上（螢幕中心）、大小依視角固定；視窗離開視線時淡出 */
  private updateDot(ads: number): void {
    const cur = this.current;
    const win = cur?.asm.window;
    const kind = cur?.asm.sight;
    if (!cur || !win || (kind !== 'reddot' && kind !== 'holo') || ads < 0.35) { this.dot.visible = false; return; }
    this.holder.updateMatrixWorld(true);
    const w = this.tmpV2.copy(win.center);
    cur.group.localToWorld(w);
    const depth = Math.max(0.03, -w.z);
    // 視窗中心相對視線的偏移（世界單位）與視窗半寬（縮放後）
    const off = Math.hypot(w.x, w.y);
    const half = (Math.min(win.size[0], win.size[1]) / 2) * VM_SCALE;
    const fade = 1 - THREE.MathUtils.smoothstep(off, half * 0.55, half * 1.05);
    const a = THREE.MathUtils.smoothstep(ads, 0.4, 0.9) * fade;
    this.dot.visible = a > 0.01;
    (this.dot.material as THREE.SpriteMaterial).opacity = a;
    // 角大小：紅點 ≈ 1.1°，全息圓圈 ≈ 3.2°（相機視線上，所以離鏡片多遠都一樣）
    const ang = (kind === 'reddot' ? 1.6 : 4.6) * (Math.PI / 180);
    this.dot.scale.setScalar(2 * depth * Math.tan(ang / 2));
    this.dot.position.set(0, 0, -depth);
  }
}
