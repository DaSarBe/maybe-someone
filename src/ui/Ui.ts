import type { Game } from '../core/Game';
import type { NoiseEvent, NoiseKind, Vec3 } from '../data/noise';
import { btn, el, fmtCredits } from './dom';

export interface Panel {
  el: HTMLElement;
  /** true：不能用 Esc、背景或 ✕ 關閉，只能由面板自己的按鈕關閉（結算畫面） */
  locked?: boolean;
  /** 面板關閉時呼叫（解除訂閱） */
  dispose(): void;
}

export type ToastKind = 'ok' | 'err' | 'info';

/**
 * 介面管理：一次只開一個面板（背包、商店…）。開啟時釋放 Pointer Lock 並停用遊戲輸入，
 * 關閉後交給場景決定如何回到遊戲（電腦版再請求鎖定，失敗就顯示「點擊畫面繼續」）。
 */
export class Ui {
  private overlay = el('div', 'modal-back hidden');
  private toasts = el('div', 'toasts');
  private panel: Panel | null = null;
  private lastToast = '';
  private lastToastAt = 0;

  /** 聲音事件的位置來源（RaidScene 設定；基地沒有，不發聲音事件） */
  noiseAt: (() => Vec3) | null = null;

  /** 介面操作造成的聲音（撿起、丟下、裝備護甲、交易）：AI 與其他玩家聽得到，距離見 data/noise.ts */
  noise(kind: NoiseKind, extra: Partial<NoiseEvent> = {}): void {
    if (!this.noiseAt) return;
    this.game.bus.emit('noise', { kind, position: this.noiseAt(), source: 'player', ...extra });
  }

  dropSound(): void { this.audio.playUi('drop', 0.5); this.noise('item_drop'); }
  equipSound(slot: string): void { this.audio.playUi('select', 0.5); if (slot === 'armor' || slot === 'helmet') this.noise('armor_equip'); }

  /** 關閉面板後的回呼（場景用來重新鎖定滑鼠） */
  onClosed: (() => void) | null = null;

  private onKey = (e: KeyboardEvent) => {
    if (!this.panel || e.repeat) return;
    if (e.code === 'Escape' || e.code === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation(); // 不讓暫停選單的 Esc 切換同時觸發
      if (!this.panel.locked) this.close();
    }
  };

  constructor(private game: Game) {
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.backdropDown = true; else this.backdropDown = false;
    });
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay && this.backdropDown) this.close();
    });
    game.container.append(this.overlay, this.toasts);
    window.addEventListener('keydown', this.onKey);
  }

  private backdropDown = false;

  get isOpen(): boolean { return !!this.panel; }
  get audio() { return this.game.audio; }
  get economy() { return this.game.economy; }
  get bus() { return this.game.bus; }
  get isTouch(): boolean { return this.game.isTouch; }
  get controls() { return this.game.controls; }

  open(panel: Panel): void {
    if (this.panel) this.close(true, true);
    this.panel = panel;
    this.overlay.replaceChildren(panel.el);
    this.overlay.classList.remove('hidden');
    this.game.input.uiBlocked = true;
    this.game.input.releaseLock();
    this.audio.playUi('open');
  }

  close(silent = false, force = false): void {
    const p = this.panel;
    if (!p || (p.locked && !force)) return;
    this.panel = null;
    p.dispose();
    this.overlay.classList.add('hidden');
    this.overlay.replaceChildren();
    this.game.input.uiBlocked = false;
    this.game.input.clearPressed();
    if (!silent) {
      this.audio.playUi('close');
      this.onClosed?.();
    }
  }

  /** 小提示。同樣的訊息 0.4 秒內不重複 */
  toast(msg: string, kind: ToastKind = 'info'): void {
    const now = performance.now();
    if (msg === this.lastToast && now - this.lastToastAt < 400) return;
    this.lastToast = msg;
    this.lastToastAt = now;
    const t = el('div', `toast ${kind}`, msg);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    if (kind === 'err') this.audio.playUi('error', 0.7);
    else if (kind === 'ok') this.audio.playUi('confirm', 0.6);
    setTimeout(() => t.classList.add('out'), 2200);
    setTimeout(() => t.remove(), 2700);
  }

  /** 把 EconomyService 的結果轉成提示；回傳是否成功 */
  report(r: { ok: boolean; reason?: string }, okMsg?: string): boolean {
    if (!r.ok) { this.toast(r.reason ?? '操作失敗', 'err'); return false; }
    if (okMsg) this.toast(okMsg, 'ok');
    return true;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.close(true, true);
    this.overlay.remove();
    this.toasts.remove();
  }
}

/** 面板外框：標題列（標題、信用點、關閉鈕）+ 內容區 */
export function panelFrame(ui: Ui, title: string, opts: { showCredits?: boolean; closable?: boolean } = {}): {
  root: HTMLElement; body: HTMLElement; credits: HTMLElement; setTitle: (t: string) => void;
} {
  const root = el('div', 'panel');
  const head = el('div', 'panel-head');
  const h = el('h2', '', title);
  const credits = el('span', 'credits-chip', fmtCredits(ui.economy.credits));
  if (opts.showCredits === false) credits.classList.add('hidden');
  const close = btn('✕', () => ui.close(), 'close');
  close.setAttribute('aria-label', '關閉');
  head.append(h, el('span', 'spacer'), credits);
  if (opts.closable !== false) head.appendChild(close);
  const body = el('div', 'panel-body');
  root.append(head, body);
  return { root, body, credits, setTitle: (t) => { h.textContent = t; } };
}
