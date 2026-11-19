import type { Action, Input } from '../core/Input';
import type { ControlSettingsStore } from '../settings/ControlSettings';
import type { LayoutManager } from '../ui/layout/LayoutManager';
import type { ElementId } from '../ui/layout/model';

const SRC = 'touch';
const LOOK_SENS = 0.0050;
const SPRINT_THRESHOLD = 0.92;
const DEADZONE = 0.12;
/** 搖桿底座直徑 → 可推動半徑 */
const STICK_RADIUS_K = 0.42;
const KNOB_K = 0.45;

interface BtnDef {
  id: ElementId;
  label: string;
  action: Action;
  cls?: string;
  /** 按住拖曳同時控制視角（右側射擊鍵） */
  look?: boolean;
  /** 只在有戰鬥系統的場景顯示 */
  combat?: boolean;
}

/** 位置、大小全部由 LayoutManager 決定（見 ui/layout/model.ts 的預設版面） */
const BUTTONS: BtnDef[] = [
  { id: 'fireL', label: '射擊', action: 'fire', cls: 'mc-fire mc-fire-l', combat: true },
  { id: 'fireR', label: '射擊', action: 'fire', cls: 'mc-fire', look: true },
  { id: 'aim', label: '瞄準', action: 'aim' },
  { id: 'jump', label: '跳', action: 'jump' },
  { id: 'crouch', label: '蹲', action: 'crouch' },
  { id: 'interact', label: '互動', action: 'interact' },
  { id: 'reload', label: '換彈', action: 'reload' },
  { id: 'inventory', label: '背包', action: 'inventory', cls: 'mc-sm' },
  { id: 'swap', label: '切換', action: 'weaponSwap', combat: true, cls: 'mc-sm' },
  { id: 'heal', label: '治療', action: 'heal', combat: true, cls: 'mc-sm' },
];

/**
 * 手機觸控介面：浮動搖桿（推到底衝刺）、右半螢幕拖曳轉視角、左右兩個射擊鍵與其他按鈕。
 * 每個按鈕、每根手指都用自己的 pointerId 獨立追蹤，所以多點觸控（搖桿 + 左射擊 + 右射擊拖曳）互不干擾。
 */
export class MobileControls {
  private root = document.createElement('div');
  private base = document.createElement('div');
  private knob = document.createElement('div');
  private zone = document.createElement('div');
  private stickId: number | null = null;
  private center = { x: 0, y: 0 };
  private home = { x: 0, y: 0 };
  private radius = 55;
  private cleanups: (() => void)[] = [];
  private btnEls = new Map<ElementId, HTMLElement>();

  constructor(
    parent: HTMLElement,
    private input: Input,
    private layout: LayoutManager,
    private controls: ControlSettingsStore,
    opts: { combat?: boolean } = {},
  ) {
    this.root.className = 'mc';
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());

    const look = document.createElement('div');
    look.className = 'mc-look';
    this.bindLook(look);

    this.zone.className = 'mc-stickzone';
    this.base.className = 'mc-base';
    this.knob.className = 'mc-knob';
    this.base.appendChild(this.knob);
    this.bindStick(this.zone);

    this.root.append(look, this.zone, this.base);
    for (const d of BUTTONS.filter((b) => !b.combat || opts.combat)) this.root.appendChild(this.makeButton(d));
    parent.appendChild(this.root);

    // 「點一下切換」模式的亮燈（蹲下、瞄準）
    this.cleanups.push(this.input.onLatch((src, action, on) => {
      for (const d of BUTTONS) {
        if (d.action === action && src === `${SRC}:${d.id}`) this.btnEls.get(d.id)?.classList.toggle('on', on);
      }
    }));
    this.cleanups.push(this.layout.subscribe(() => this.applyLayout()));
    this.cleanups.push(this.controls.subscribe(() => this.applyLayout()));
    this.applyLayout();
  }

  dispose(): void {
    for (const c of this.cleanups) c();
    this.cleanups = [];
    this.root.remove();
  }

  /** 搖桿大小與位置、左射擊鍵開關、搖桿觸控區 */
  private applyLayout(): void {
    const r = this.layout.rect('stick');
    const op = this.layout.opacity('stick');
    this.base.style.width = this.base.style.height = `${r.w}px`;
    this.base.style.margin = `${-r.w / 2}px 0 0 ${-r.w / 2}px`;
    this.base.style.opacity = String(op);
    const k = r.w * KNOB_K;
    this.knob.style.width = this.knob.style.height = `${k}px`;
    this.knob.style.margin = `${-k / 2}px 0 0 ${-k / 2}px`;
    this.radius = r.w * STICK_RADIUS_K;
    this.home = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    if (this.stickId === null) this.setBase(this.home.x, this.home.y);
    // 觸控區：左側 46% × 下方 60%，且一定包含搖桿的預設位置
    const vw = this.layout.viewport.w, vh = this.layout.viewport.h;
    const right = Math.max(vw * 0.46, r.x + r.w + 24);
    const top = Math.min(vh * 0.4, r.y - 24);
    this.zone.style.width = `${right}px`;
    this.zone.style.height = `${vh - Math.max(0, top)}px`;
    this.btnEls.get('fireL')?.classList.toggle('hidden', !this.controls.get().leftFire);
  }

  private setBase(x: number, y: number): void {
    this.center = { x, y };
    this.base.style.left = `${x}px`;
    this.base.style.top = `${y}px`;
    this.knob.style.transform = 'translate(0,0)';
  }

  private bindStick(zone: HTMLElement): void {
    zone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      this.setBase(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      const R = this.radius;
      let dx = e.clientX - this.center.x, dy = e.clientY - this.center.y;
      const len = Math.hypot(dx, dy);
      const m = Math.min(1, len / R);
      if (len > R) { dx *= R / len; dy *= R / len; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const live = m < DEADZONE ? 0 : m;
      const nx = len > 0 ? dx / Math.min(len, R) : 0;
      const ny = len > 0 ? dy / Math.min(len, R) : 0;
      this.input.setMoveSource(SRC, nx * live, -ny * live);
      const sprint = m >= SPRINT_THRESHOLD;
      this.input.setAction(SRC + '-stick', 'sprint', sprint);
      this.base.classList.toggle('sprint', sprint);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.input.setMoveSource(SRC, 0, 0);
      this.input.setAction(SRC + '-stick', 'sprint', false);
      this.base.classList.remove('sprint');
      this.setBase(this.home.x, this.home.y);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  private bindLook(el: HTMLElement): void {
    let id: number | null = null;
    let lx = 0, ly = 0;
    el.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId; lx = e.clientX; ly = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      this.input.addLook((e.clientX - lx) * LOOK_SENS, (e.clientY - ly) * LOOK_SENS, 'touch');
      lx = e.clientX; ly = e.clientY;
    });
    const end = (e: PointerEvent) => { if (e.pointerId === id) id = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private makeButton(d: BtnDef): HTMLElement {
    const el = document.createElement('div');
    el.className = 'mc-btn ' + (d.cls ?? '');
    el.textContent = d.label;
    el.dataset.btn = d.id;
    this.btnEls.set(d.id, el);
    this.cleanups.push(this.layout.bind(d.id, el));

    const src = `${SRC}:${d.id}`;
    let id: number | null = null;
    let lx = 0, ly = 0;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      el.setPointerCapture(e.pointerId);
      id = e.pointerId; lx = e.clientX; ly = e.clientY;
      // 蹲下 / 瞄準的「點一下切換」由 Input 統一處理
      this.input.setAction(src, d.action, true);
      el.classList.add('pressed');
    });
    el.addEventListener('pointermove', (e) => {
      if (!d.look || e.pointerId !== id) return;
      this.input.addLook((e.clientX - lx) * LOOK_SENS, (e.clientY - ly) * LOOK_SENS, 'touch');
      lx = e.clientX; ly = e.clientY;
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      this.input.setAction(src, d.action, false);
      el.classList.remove('pressed');
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return el;
  }
}
