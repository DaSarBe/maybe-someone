import type { SaveService } from '../../save/SaveService';
import {
  DEF_BY_ID, cloneStore, itemOf, migrateStore, rectOf, safeRect,
  type ElementDef, type ElementId, type Insets, type LayoutSlot, type LayoutStore, type Rect,
} from './model';

export const LAYOUT_SAVE_KEY = 'layout';

interface Bound { el: HTMLElement; def: ElementDef }

/**
 * 版面管理（DOM 端）：讀取安全區、依目前配置算出每個元素的矩形，並套用到已註冊的元素上。
 * HUD / 觸控按鈕只要 bind(id, el)，位置、大小、透明度就會跟著配置與螢幕尺寸自動更新。
 * 電腦版不 bind 任何東西（遊戲中不顯示觸控版面），編輯器仍可使用同一份資料。
 */
export class LayoutManager {
  private store: LayoutStore;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private bound = new Map<ElementId, Bound>();
  private listeners = new Set<() => void>();
  private probe: HTMLElement;
  private raf = 0;
  private vw = 0;
  private vh = 0;

  constructor(private save: SaveService) {
    this.store = migrateStore(save.get<unknown>(LAYOUT_SAVE_KEY, null));
    this.probe = document.createElement('div');
    this.probe.className = 'safe-probe';
    document.body.appendChild(this.probe);
    const re = () => this.refresh();
    window.addEventListener('resize', re);
    window.addEventListener('orientationchange', () => window.setTimeout(re, 120));
    window.visualViewport?.addEventListener('resize', re);
    this.measure();
    requestAnimationFrame(() => this.refresh()); // 樣式 / 安全區晚一步就緒時再量一次
  }

  // ---------------------------------------------------------------- 資料
  get data(): LayoutStore { return this.store; }
  get slot(): LayoutSlot { return this.store.slots[this.store.active]; }
  get safe(): Rect { return safeRect(this.vw, this.vh, this.insets); }
  get viewport(): { w: number; h: number } { return { w: this.vw, h: this.vh }; }

  /** 目前配置下某元素的矩形（px） */
  rect(id: ElementId): Rect { return rectOf(DEF_BY_ID[id], itemOf(this.slot, id), this.safe, { w: this.vw, h: this.vh }); }
  opacity(id: ElementId): number { return itemOf(this.slot, id).o; }

  /** 儲存整份配置資料（編輯器按「儲存」） */
  commit(next: LayoutStore): void {
    this.store = migrateStore(cloneStore(next));
    this.save.set(LAYOUT_SAVE_KEY, this.store);
    this.apply();
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  // ---------------------------------------------------------------- 安全區
  private measure(): void {
    const cs = getComputedStyle(this.probe);
    const px = (v: string) => parseFloat(v) || 0;
    this.insets = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
  }

  /** 視窗大小 / 旋轉改變：重新量測並套用（用 rAF 合併） */
  refresh(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.measure();
      this.apply();
      this.emit();
    });
  }

  // ---------------------------------------------------------------- 套用
  bind(id: ElementId, el: HTMLElement): () => void {
    this.bound.set(id, { el, def: DEF_BY_ID[id] });
    el.dataset.layoutId = id;
    this.applyOne(id);
    return () => { if (this.bound.get(id)?.el === el) this.bound.delete(id); };
  }

  apply(): void {
    this.measure();
    for (const id of [...this.bound.keys()]) this.applyOne(id);
  }

  private applyOne(id: ElementId): void {
    const b = this.bound.get(id);
    if (!b) return;
    if (b.el.isConnected) b.el.dataset.layoutSeen = '1';
    else if (b.el.dataset.layoutSeen) { this.bound.delete(id); return; } // 場景已移除該元素
    applyRect(b.el, b.def, this.rect(id), this.opacity(id));
  }

  private emit(): void { for (const l of this.listeners) l(); }
}

/** 把矩形套用到元素（遊戲中的元素與編輯器的示意元素共用） */
export function applyRect(el: HTMLElement, def: ElementDef, r: Rect, opacity: number): void {
  const s = el.style;
  s.position = 'fixed';
  s.right = 'auto'; s.bottom = 'auto'; s.margin = '0';
  s.opacity = String(opacity);
  if (def.apply === 'px') {
    s.left = `${r.x}px`; s.top = `${r.y}px`;
    s.width = `${r.w}px`; s.height = `${r.h}px`;
    s.transform = 'none';
    s.setProperty('--u', `${Math.min(r.w, r.h)}px`);
  } else if (def.apply === 'scale') {
    const nat = def.nat!;
    s.left = `${r.x}px`; s.top = `${r.y}px`;
    s.width = `${nat.w}px`; s.height = `${nat.h}px`;
    s.transformOrigin = '0 0';
    s.transform = `scale(${r.w / nat.w})`;
  } else {
    // center：元素本身是 0×0 的原點，子元素以它為中心展開
    const nat = def.nat!;
    s.left = `${r.x + r.w / 2}px`; s.top = `${r.y + r.h / 2}px`;
    s.width = '0'; s.height = '0';
    s.transformOrigin = '0 0';
    s.transform = `scale(${r.w / nat.w})`;
  }
}
