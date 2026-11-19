import type { Action, Input } from '../core/Input';

const SRC = 'touch';
const STICK_RADIUS = 55;
const LOOK_SENS = 0.0050;
const SPRINT_THRESHOLD = 0.92;
const DEADZONE = 0.12;

interface BtnDef {
  label: string;
  action: Action;
  size: number;
  right: number;
  bottom?: number;
  top?: number;
  mode: 'hold' | 'toggle';
  cls?: string;
  /** 按住拖曳同時控制視角 */
  look?: boolean;
  /** 只在有戰鬥系統的場景顯示 */
  combat?: boolean;
}

const BUTTONS: BtnDef[] = [
  { label: '射擊', action: 'fire', size: 84, right: 22, bottom: 36, mode: 'hold', cls: 'mc-fire', look: true },
  { label: '瞄準', action: 'aim', size: 62, right: 118, bottom: 30, mode: 'hold' },
  { label: '跳', action: 'jump', size: 66, right: 28, bottom: 134, mode: 'hold' },
  { label: '蹲', action: 'crouch', size: 58, right: 106, bottom: 118, mode: 'toggle' },
  { label: '互動', action: 'interact', size: 54, right: 24, bottom: 216, mode: 'hold' },
  { label: '換彈', action: 'reload', size: 54, right: 92, bottom: 200, mode: 'hold' },
  { label: '背包', action: 'inventory', size: 44, right: 64, top: 10, mode: 'hold' },
  { label: '切換', action: 'weaponSwap', size: 46, right: 168, bottom: 96, mode: 'hold', combat: true, cls: 'mc-sm' },
  { label: '治療', action: 'heal', size: 46, right: 168, bottom: 150, mode: 'hold', combat: true, cls: 'mc-sm' },
];

/** 手機觸控介面：左側浮動搖桿（推到底衝刺）、右半螢幕拖曳轉視角、右下按鈕。支援多點觸控。 */
export class MobileControls {
  private root = document.createElement('div');
  private base = document.createElement('div');
  private knob = document.createElement('div');
  private stickId: number | null = null;
  private center = { x: 0, y: 0 };
  private home = { x: 0, y: 0 };

  constructor(parent: HTMLElement, private input: Input, opts: { combat?: boolean } = {}) {
    this.root.className = 'mc';
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());

    const look = document.createElement('div');
    look.className = 'mc-look';
    this.bindLook(look);

    const zone = document.createElement('div');
    zone.className = 'mc-stickzone';
    this.base.className = 'mc-base';
    this.knob.className = 'mc-knob';
    this.base.appendChild(this.knob);
    this.bindStick(zone);

    this.root.append(look, zone, this.base);
    BUTTONS.filter((d) => !d.combat || opts.combat).forEach((d) => this.root.appendChild(this.makeButton(d, look)));
    parent.appendChild(this.root);

    this.placeHome();
    window.addEventListener('resize', () => this.placeHome());
  }

  private placeHome(): void {
    this.home = { x: 100, y: window.innerHeight - 110 };
    if (this.stickId === null) this.setBase(this.home.x, this.home.y);
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
      let dx = e.clientX - this.center.x, dy = e.clientY - this.center.y;
      const len = Math.hypot(dx, dy);
      const m = Math.min(1, len / STICK_RADIUS);
      if (len > STICK_RADIUS) { dx *= STICK_RADIUS / len; dy *= STICK_RADIUS / len; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const live = m < DEADZONE ? 0 : m;
      const nx = len > 0 ? dx / Math.min(len, STICK_RADIUS) : 0;
      const ny = len > 0 ? dy / Math.min(len, STICK_RADIUS) : 0;
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
      this.input.addLook((e.clientX - lx) * LOOK_SENS, (e.clientY - ly) * LOOK_SENS);
      lx = e.clientX; ly = e.clientY;
    });
    const end = (e: PointerEvent) => { if (e.pointerId === id) id = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private makeButton(d: BtnDef, lookEl: HTMLElement): HTMLElement {
    const el = document.createElement('div');
    el.className = 'mc-btn ' + (d.cls ?? '');
    el.textContent = d.label;
    el.style.width = el.style.height = `${d.size}px`;
    el.style.right = `${d.right}px`;
    if (d.bottom !== undefined) el.style.bottom = `calc(${d.bottom}px + env(safe-area-inset-bottom))`;
    if (d.top !== undefined) el.style.top = `calc(${d.top}px + env(safe-area-inset-top))`;
    void lookEl;

    let toggled = false;
    let id: number | null = null;
    let lx = 0, ly = 0;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      if (d.mode === 'toggle') {
        toggled = !toggled;
        this.input.setAction(SRC, d.action, toggled);
        el.classList.toggle('on', toggled);
        return;
      }
      id = e.pointerId; lx = e.clientX; ly = e.clientY;
      this.input.setAction(SRC, d.action, true);
      el.classList.add('pressed');
    });
    el.addEventListener('pointermove', (e) => {
      if (!d.look || e.pointerId !== id) return;
      this.input.addLook((e.clientX - lx) * LOOK_SENS, (e.clientY - ly) * LOOK_SENS);
      lx = e.clientX; ly = e.clientY;
    });
    const up = (e: PointerEvent) => {
      if (d.mode === 'toggle' || e.pointerId !== id) return;
      id = null;
      this.input.setAction(SRC, d.action, false);
      el.classList.remove('pressed');
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return el;
  }
}
