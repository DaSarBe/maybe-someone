import * as THREE from 'three';

export type Action = 'jump' | 'crouch' | 'sprint' | 'fire' | 'aim' | 'interact' | 'reload' | 'inventory'
  | 'weapon1' | 'weapon2' | 'weaponSwap' | 'heal';

const MOUSE_SENS = 0.0022;

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

  private moveSources = new Map<string, THREE.Vector2>();
  private held = new Map<Action, Set<string>>();
  private pressed = new Set<Action>();
  private lookX = 0;
  private lookY = 0;
  private keys = new Set<string>();

  constructor(private canvas: HTMLCanvasElement, opts: { touch: boolean; debug: boolean }) {
    this.isTouch = opts.touch;
    this.debug = opts.debug;
    this.bindKeyboard();
    this.bindMouse();
  }

  /** 輸入是否生效：電腦版需 Pointer Lock，手機或 debug 模式永遠生效 */
  get active(): boolean {
    return !this.uiBlocked && (this.pointerLocked || this.isTouch || this.debug);
  }

  /** 有介面（背包、商店…）開著時為 true：遊戲輸入全部停用 */
  uiBlocked = false;

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

  setAction(source: string, action: Action, down: boolean): void {
    let set = this.held.get(action);
    if (!set) this.held.set(action, (set = new Set()));
    const wasDown = set.size > 0;
    if (down) set.add(source); else set.delete(source);
    if (down && !wasDown) this.pressed.add(action);
  }

  /** 加入視角增量（弧度）：x 往右為正、y 往下為正 */
  addLook(dx: number, dy: number): void {
    this.lookX += dx;
    this.lookY += dy;
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
      Digit1: 'weapon1', Digit2: 'weapon2', KeyQ: 'weaponSwap', Digit4: 'heal',
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
      for (const a of this.held.keys()) this.setAction('kb', a, false);
      this.setAction('mouse', 'fire', false);
      this.setAction('mouse', 'aim', false);
    });
  }

  private bindMouse(): void {
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked) {
        this.setAction('mouse', 'fire', false);
        this.setAction('mouse', 'aim', false);
      }
      this.onLockChange?.(this.pointerLocked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.addLook(e.movementX * MOUSE_SENS, e.movementY * MOUSE_SENS);
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) return;
      if (e.button === 0) this.setAction('mouse', 'fire', true);
      if (e.button === 2) this.setAction('mouse', 'aim', true);
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.setAction('mouse', 'fire', false);
      if (e.button === 2) this.setAction('mouse', 'aim', false);
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    // 滾輪切換武器
    document.addEventListener('wheel', (e) => {
      if (this.pointerLocked && e.deltaY !== 0) this.pressed.add('weaponSwap');
    }, { passive: true });
  }
}
