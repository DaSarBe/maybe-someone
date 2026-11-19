import type { Input } from '../core/Input';

/** 電腦版：點擊進入 Pointer Lock；按 Esc 離開時顯示暫停提示 */
export class PointerLockOverlay {
  private el = document.createElement('div');
  private title = document.createElement('h1');
  private hadLock = false;

  constructor(parent: HTMLElement, private input: Input) {
    this.el.className = 'lock-overlay';
    const p = document.createElement('p');
    p.innerHTML = 'WASD 移動 ・ Shift 衝刺 ・ C 蹲下 ・ Space 跳躍<br>滑鼠轉視角 ・ 左鍵射擊 ・ 右鍵瞄準 ・ E 互動 ・ R 換彈 ・ Esc 暫停';
    this.el.append(this.title, p);
    parent.appendChild(this.el);
    this.el.addEventListener('click', () => input.requestLock());

    input.onLockChange = (locked) => {
      if (locked) this.hadLock = true;
      this.refresh();
    };
    this.refresh();
  }

  private refresh(): void {
    this.title.textContent = this.hadLock ? '已暫停 — 點擊繼續' : '點擊畫面開始';
    this.el.classList.toggle('hidden', this.input.pointerLocked);
  }

  dispose(): void {
    this.input.onLockChange = null;
    this.el.remove();
  }
}
