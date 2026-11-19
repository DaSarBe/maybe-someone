import type { Input } from '../core/Input';
import type { ControlSettingsStore } from '../settings/ControlSettings';
import { gyroLook, smooth } from './gyroMath';

export type GyroPermission = 'unsupported' | 'unknown' | 'granted' | 'denied';

type PermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

/** 平滑係數：越大越跟手，越小越穩 */
const SMOOTH = 0.55;
/** 兩次事件間隔上限（秒），切到背景再回來時避免一次大跳 */
const MAX_DT = 0.05;

/**
 * 陀螺儀瞄準：用 devicemotion 的 rotationRate（角速度），換算後只透過 Input.addLook(..., 'gyro') 加進視角增量，
 * PlayerController 完全不知道來源。iOS 13+ 需要在使用者點擊時呼叫 requestPermission（只有 HTTPS 才有效）。
 */
export class Gyro {
  permission: GyroPermission;
  private listeners = new Set<(p: GyroPermission) => void>();
  private last = 0;
  private sb = 0;
  private sg = 0;
  private armed = false;

  constructor(private input: Input, private controls: ControlSettingsStore) {
    this.permission = this.supported ? 'unknown' : 'unsupported';
    if (!this.supported) return;
    window.addEventListener('devicemotion', this.onMotion);
    controls.subscribe(() => this.maybeArm());
    this.maybeArm();
  }

  get supported(): boolean { return typeof window !== 'undefined' && 'DeviceMotionEvent' in window; }

  /** iOS 13+ 要先取得授權 */
  get needsPermission(): boolean {
    const w = window as unknown as { DeviceMotionEvent?: PermissionApi; DeviceOrientationEvent?: PermissionApi };
    return typeof w.DeviceMotionEvent?.requestPermission === 'function' || typeof w.DeviceOrientationEvent?.requestPermission === 'function';
  }

  onChange(fn: (p: GyroPermission) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** 必須在使用者點擊（click / touchend）的事件處理中呼叫 */
  async requestPermission(): Promise<GyroPermission> {
    if (!this.supported) return this.set('unsupported');
    const w = window as unknown as { DeviceMotionEvent?: PermissionApi; DeviceOrientationEvent?: PermissionApi };
    const fn = w.DeviceOrientationEvent?.requestPermission ?? w.DeviceMotionEvent?.requestPermission;
    if (typeof fn !== 'function') return this.set(this.permission === 'granted' ? 'granted' : 'unknown'); // Android：不需授權，收到事件就算授權
    try {
      const api = w.DeviceOrientationEvent?.requestPermission ? w.DeviceOrientationEvent : w.DeviceMotionEvent;
      const r = await api!.requestPermission!();
      return this.set(r === 'granted' ? 'granted' : 'denied');
    } catch {
      return this.set('denied');
    }
  }

  /** 已選擇陀螺儀但尚未授權（例如重新載入頁面）：下一次點擊時自動請求一次 */
  private maybeArm(): void {
    if (this.armed || this.controls.get().gyro.mode === 'off' || !this.needsPermission || this.permission === 'granted') return;
    this.armed = true;
    const go = () => {
      window.removeEventListener('touchend', go);
      window.removeEventListener('click', go);
      this.armed = false;
      if (this.controls.get().gyro.mode !== 'off' && this.permission !== 'granted') void this.requestPermission();
    };
    window.addEventListener('touchend', go);
    window.addEventListener('click', go);
  }

  private set(p: GyroPermission): GyroPermission {
    if (p !== this.permission) {
      this.permission = p;
      for (const l of this.listeners) l(p);
    }
    return p;
  }

  private angle(): number {
    const a = screen.orientation?.angle;
    if (typeof a === 'number') return a;
    const wo = (window as unknown as { orientation?: number }).orientation;
    return typeof wo === 'number' ? wo : 0;
  }

  private onMotion = (e: DeviceMotionEvent): void => {
    const r = e.rotationRate;
    if (!r || (r.beta == null && r.gamma == null && r.alpha == null)) return;
    if (this.permission !== 'granted') this.set('granted');
    const now = performance.now();
    const dt = this.last ? Math.min(MAX_DT, (now - this.last) / 1000) : 0;
    this.last = now;
    const cfg = this.controls.get().gyro;
    if (cfg.mode === 'off' || dt <= 0) return;
    this.sb = smooth(this.sb, r.beta ?? 0, SMOOTH);
    this.sg = smooth(this.sg, r.gamma ?? 0, SMOOTH);
    if (cfg.mode === 'aim' && !this.input.isDown('aim')) return;
    const { dx, dy } = gyroLook({ beta: this.sb, gamma: this.sg }, this.angle(), dt, cfg);
    if (dx !== 0 || dy !== 0) this.input.addLook(dx, dy, 'gyro');
  };
}
