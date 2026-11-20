import * as THREE from 'three';
import { defaultControls, type ControlSettings } from '../settings/ControlSettings';

export type Action = 'jump' | 'crouch' | 'sprint' | 'fire' | 'aim' | 'interact' | 'reload' | 'inventory'
  | 'weapon1' | 'weapon2' | 'weaponSwap' | 'heal' | 'flashlight';

const MOUSE_SENS = 0.0022;

/** 視角增量的來源：raw 不套用任何靈敏度（測試掛鉤）；gyro 的靈敏度由陀螺儀模組自己處理 */
export type LookKind = 'raw' | 'touch' | 'mouse' | 'gyro';

/**
 * 統一輸入狀態。鍵鼠、觸控、測試掛鉤都透過 source 字串寫入，
 * 讀取端（PlayerController）完全不需要知道來源。
 */
export class Input {
  readonly isTouch: boolean;
  readonly debug: boolean;
  pointerLocked = false;
  /** 視角靈敏度倍率（瞄準、觸控輔助瞄準會調整） */
  lookScale = 1;
  /** 鎖定狀態改變 */
  onLockChange: ((locked: boolean) => void) | null = null;
  /** 瞄準程度 0..1（WeaponSystem 每幀寫入），用來混合「一般 / 瞄準」靈敏度 */
  ads = 0;
  /** 控制設定（靈敏度、按鍵模式…）；由 Game 在設定變更時更新 */
  private cfg: ControlSettings;
  /** 按鍵「點一下切換」狀態改變（觸控按鈕亮燈用） */
  private latchListeners = new Set<(source: string, action: Action, on: boolean) => void>();

  private moveSources = new Map<string, THREE.Vector2>();
  private held = new Map<Action, Set<string>>();
  private pressed = new Set<Action>();
  private lookX = 0;
  private lookY = 0;
  private keys = new Set<string>();

  constructor(private canvas: HTMLCanvasElement, opts: { touch: boolean; debug: boolean }) {
    this.isTouch = opts.touch;
    this.debug = opts.debug;
    this.cfg = defaultControls(opts.touch);
    this.bindKeyboard();
    this.bindMouse();
  }

  /** 輸入是否生效：電腦版需 Pointer Lock，手機或 debug 模式永遠生效 */
  get active(): boolean {
    return !this.uiBlocked && (this.pointerLocked || this.isTouch || this.debug);
  }

  /** 有介面（背包、商店…）開著時為 true：遊戲輸入全部停用（同時放掉「切換」鎖定的瞄準 / 蹲下） */
  get uiBlocked(): boolean { return this._uiBlocked; }
  set uiBlocked(v: boolean) {
    if (v && !this._uiBlocked) this.releaseToggles();
    this._uiBlocked = v;
  }
  private _uiBlocked = false;

  get settings(): ControlSettings { return this.cfg; }
  setSettings(c: ControlSettings): void {
    const modeChanged = c.crouchMode !== this.cfg.crouchMode || c.aimMode !== this.cfg.aimMode;
    this.cfg = c;
    if (modeChanged) this.releaseToggles(); // 模式切換時放掉已鎖定的狀態，避免卡住
  }

  /** 丟掉尚未處理的「剛按下」事件（關閉介面後避免立刻重複觸發） */
  clearPressed(): void {
    this.pressed.clear();
  }

  /** 釋放 Pointer Lock（開啟介面時） */
  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---------- 寫入端 ----------
  setMoveSource(source: string, x: number, y: number): void {
    let v = this.moveSources.get(source);
    if (!v) this.moveSources.set(source, (v = new THREE.Vector2()));
    v.set(x, y);
  }

  /**
   * 寫入按鍵狀態。蹲下 / 瞄準在「點一下切換」模式下：每次按下翻轉該來源的狀態，放開被忽略。
   * 所以所有來源（滑鼠右鍵、C 鍵、觸控按鈕）都套用同一套模式。
   */
  setAction(source: string, action: Action, down: boolean): void {
    const mode = action === 'crouch' ? this.cfg.crouchMode : action === 'aim' ? this.cfg.aimMode : 'hold';
    if (mode === 'toggle') {
      if (!down) return;
      const on = !this.isHeldBy(source, action);
      this.applyAction(source, action, on);
      for (const l of this.latchListeners) l(source, action, on);
      return;
    }
    this.applyAction(source, action, down);
  }

  isHeldBy(source: string, action: Action): boolean {
    return this.held.get(action)?.has(source) ?? false;
  }

  onLatch(fn: (source: string, action: Action, on: boolean) => void): () => void {
    this.latchListeners.add(fn);
    return () => { this.latchListeners.delete(fn); };
  }

  /** 放掉所有「切換」鎖定的蹲下 / 瞄準 */
  releaseToggles(): void {
    for (const a of ['crouch', 'aim'] as const) {
      const set = this.held.get(a);
      if (!set) continue;
      for (const src of [...set]) {
        set.delete(src);
        for (const l of this.latchListeners) l(src, a, false);
      }
    }
  }

  /** 無視切換模式，直接放開某來源的某按鍵（失焦、解除鎖定時用） */
  private releaseRaw(source: string, action: Action): void {
    const had = this.isHeldBy(source, action);
    this.applyAction(source, action, false);
    if (had && (action === 'crouch' || action === 'aim')) for (const l of this.latchListeners) l(source, action, false);
  }

  private applyAction(source: string, action: Action, down: boolean): void {
    let set = this.held.get(action);
    if (!set) this.held.set(action, (set = new Set()));
    const wasDown = set.size > 0;
    if (down) set.add(source); else set.delete(source);
    if (down && !wasDown) this.pressed.add(action);
  }

  /** 加入視角增量（弧度）：x 往右為正、y 往下為正。kind 決定套用哪一組靈敏度。 */
  addLook(dx: number, dy: number, kind: LookKind = 'raw'): void {
    let m = 1;
    const sn = this.cfg.sens;
    if (kind === 'touch') m = sn.touchLook * (1 + (sn.touchAim - 1) * this.ads);
    else if (kind === 'mouse') m = sn.mouseLook * (1 + (sn.mouseAim - 1) * this.ads);
    this.lookX += dx * m;
    this.lookY += dy * m;
  }

  // ---------- 讀取端 ----------
  /** 移動向量：x 右、y 前，長度 ≤ 1 */
  getMove(out: THREE.Vector2): THREE.Vector2 {
    out.set(0, 0);
    if (!this.active) return out;
    for (const v of this.moveSources.values()) out.add(v);
    if (out.length() > 1) out.normalize();
    return out;
  }

  isDown(action: Action): boolean {
    if (!this.active) return false;
    const s = this.held.get(action);
    return !!s && s.size > 0;
  }

  /** 取走一次「剛按下」事件 */
  consumePress(action: Action): boolean {
    if (!this.active) { this.pressed.delete(action); return false; }
    return this.pressed.delete(action);
  }

  /** 取走累積的視角增量 */
  consumeLook(out: THREE.Vector2): THREE.Vector2 {
    if (this.active) out.set(this.lookX * this.lookScale, this.lookY * this.lookScale); else out.set(0, 0);
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  requestLock(): void {
    if (this.isTouch) return;
    try {
      void Promise.resolve(this.canvas.requestPointerLock()).catch(() => {});
    } catch { /* 瀏覽器拒絕時忽略 */ }
  }

  // ---------- 鍵鼠 ----------
  private bindKeyboard(): void {
    const keyAction: Record<string, Action> = {
      Space: 'jump', KeyC: 'crouch', ControlLeft: 'crouch', ShiftLeft: 'sprint', ShiftRight: 'sprint',
      KeyE: 'interact', KeyR: 'reload', Tab: 'inventory',
      Digit1: 'weapon1', Digit2: 'weapon2', KeyQ: 'weaponSwap', Digit4: 'heal', KeyT: 'flashlight',
    };
    const updateMove = () => {
      const k = this.keys;
      const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      this.setMoveSource('kb', x, y);
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      updateMove();
      const a = keyAction[e.code];
      if (a) this.setAction('kb', a, true);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      updateMove();
      const a = keyAction[e.code];
      if (a) this.setAction('kb', a, false);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      updateMove();
      for (const a of [...this.held.keys()]) this.releaseRaw('kb', a);
      this.releaseRaw('mouse', 'fire');
      this.releaseRaw('mouse', 'aim');
    });
  }

  private bindMouse(): void {
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked) {
        this.releaseRaw('mouse', 'fire');
        this.releaseRaw('mouse', 'aim');
      }
      this.onLockChange?.(this.pointerLocked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.addLook(e.movementX * MOUSE_SENS, e.movementY * MOUSE_SENS, 'mouse');
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) return;
      if (e.button === 0) this.setAction('mouse', 'fire', true);
      if (e.button === 2) this.setAction('mouse', 'aim', true);
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.setAction('mouse', 'fire', false);
      if (e.button === 2) this.setAction('mouse', 'aim', false); // 切換模式下會被忽略
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    // 滾輪切換武器
    document.addEventListener('wheel', (e) => {
      if (this.pointerLocked && e.deltaY !== 0) this.pressed.add('weaponSwap');
    }, { passive: true });
  }
}
