import * as THREE from 'three';
import { preloadAttachmentModels } from '../combat/AttachmentModels';
import { buildAssembly, disposeAssembly, type Assembly } from '../combat/WeaponAssembly';
import { effectiveWeapon } from '../combat/WeaponMods';
import { preloadWeaponModels } from '../combat/WeaponModels';
import type { WeaponMods } from '../data/attachments';

/**
 * 改槍台的武器 3D 預覽：獨立的小型 WebGLRenderer（只在面板開著時存在），
 * 拖曳旋轉（滑鼠 / 觸控），沒操作時慢慢自轉；裝上的配件即時顯示在槍上。
 */
export class WeaponPreview {
  readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.01, 20);
  private pivot = new THREE.Group();
  private asm: Assembly | null = null;
  private weaponId: string | null = null;
  private modsKey = '';
  private yaw = 0.5;
  private pitch = 0.18;
  private idle = 0;
  private swayBase = 0.5;
  private dragging = false;
  private raf = 0;
  private last = 0;
  private ro: ResizeObserver | null = null;
  private disposed = false;
  private ready = false;
  private pending: { id: string; mods: WeaponMods | undefined } | null = null;
  private radius = 0.5;
  private center = new THREE.Vector3();

  constructor() {
    this.canvas.className = 'wp-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.add(new THREE.HemisphereLight('#dbe8ff', '#3a4452', 2.1));
    const key = new THREE.DirectionalLight('#fff4e0', 2.4);
    key.position.set(1.2, 2, 1.5);
    const rim = new THREE.DirectionalLight('#7cd8ff', 1.2);
    rim.position.set(-1.5, 0.5, -1.5);
    this.scene.add(key, rim, this.pivot);

    const c = this.canvas;
    let lx = 0, ly = 0;
    c.addEventListener('pointerdown', (e) => {
      this.dragging = true; this.idle = 0; lx = e.clientX; ly = e.clientY;
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw += (e.clientX - lx) * 0.012;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - ly) * 0.008, -0.6, 0.9);
      lx = e.clientX; ly = e.clientY;
    });
    const up = () => { this.dragging = false; this.idle = 0; this.swayBase = this.yaw; };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(c);
    void Promise.all([preloadWeaponModels(), preloadAttachmentModels()]).then(() => {
      if (this.disposed) return;
      this.ready = true;
      if (this.pending) this.setWeapon(this.pending.id, this.pending.mods);
    });
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /** 顯示某把武器（含配件）；內容沒變就不重建 */
  setWeapon(weaponId: string | null, mods?: WeaponMods): void {
    if (!weaponId) { this.clear(); this.weaponId = null; this.modsKey = ''; return; }
    if (!this.ready) { this.pending = { id: weaponId, mods }; return; }
    const key = JSON.stringify(mods ?? {});
    if (weaponId === this.weaponId && key === this.modsKey) return;
    const sameGun = weaponId === this.weaponId;
    this.weaponId = weaponId;
    this.modsKey = key;
    this.clear();
    this.asm = buildAssembly(effectiveWeapon(weaponId).handling.style, mods);
    this.pivot.add(this.asm.group);
    const box = new THREE.Box3().setFromObject(this.asm.group);
    box.getCenter(this.center);
    this.radius = Math.max(0.2, box.getSize(new THREE.Vector3()).length() / 2);
    this.asm.group.position.sub(this.center);
    if (!sameGun) { this.yaw = 0.5; this.swayBase = 0.5; this.idle = 0; }
    this.resize();
  }

  private clear(): void {
    if (!this.asm) return;
    this.pivot.remove(this.asm.group);
    disposeAssembly(this.asm);
    this.asm = null;
  }

  private resize(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 依畫面寬高比決定距離：槍是橫長的，窄畫面要退遠一點
    const fov = (this.camera.fov * Math.PI) / 180;
    const fitH = this.radius / Math.sin(fov / 2);
    const fitW = this.radius / Math.sin(Math.atan(Math.tan(fov / 2) * this.camera.aspect));
    this.camera.position.set(0, 0, Math.max(fitH, fitW) * 0.82);
    this.camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // 沒操作時在側面來回輕輕擺動（不會轉到看不清楚的正面 / 背面）
    if (!this.dragging) {
      this.idle += dt;
      if (this.idle > 2.5) this.yaw += (this.swayBase + Math.sin(this.idle * 0.7) * 0.55 - this.yaw) * Math.min(1, dt * 1.5);
    } else this.swayBase = this.yaw;
    // 槍口朝畫面右側（模型槍管朝 -Z）
    this.pivot.rotation.set(this.pitch, -Math.PI / 2 + this.yaw, 0, 'YXZ');
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
