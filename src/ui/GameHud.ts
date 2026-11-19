import { clear, el, fmtCredits, fmtTime } from './dom';

/** 基地與 Raid 共用的 HUD：信用點、互動提示、穩定度倒數、進度條 */
export class GameHud {
  private credits = el('div', 'hud-credits');
  private prompt = el('button', 'hud-prompt hidden');
  private timer = el('div', 'hud-timer hidden');
  private timerText = el('b');
  private timerBar = el('i');
  private progress = el('div', 'hud-progress hidden');
  private progressLabel = el('span');
  private progressFill = el('i');
  private banner = el('div', 'hud-banner hidden');
  private promptHandler: (() => void) | null = null;
  private roots: HTMLElement[];

  constructor(parent: HTMLElement) {
    document.body.classList.add('game-hud');
    this.prompt.type = 'button';
    this.prompt.addEventListener('click', () => this.promptHandler?.());
    const tl = el('span', 'hud-timer-label', '時空穩定度');
    const bar = el('div', 'bar');
    bar.appendChild(this.timerBar);
    this.timer.append(tl, this.timerText, bar);
    const pbar = el('div', 'bar');
    pbar.appendChild(this.progressFill);
    this.progress.append(this.progressLabel, pbar);
    this.roots = [this.credits, this.prompt, this.timer, this.progress, this.banner];
    parent.append(...this.roots);
  }

  setCredits(n: number): void { this.credits.textContent = fmtCredits(n); }
  showCredits(v: boolean): void { this.credits.classList.toggle('hidden', !v); }

  /** 互動提示；onClick 讓電腦版沒鎖定滑鼠或手機也能直接點 */
  setPrompt(text: string | null, onClick?: () => void): void {
    this.promptHandler = onClick ?? null;
    this.prompt.classList.toggle('hidden', !text);
    this.prompt.classList.toggle('clickable', !!onClick);
    if (text !== null && this.prompt.textContent !== text) this.prompt.textContent = text;
  }

  setTimer(remaining: number, total: number): void {
    this.timer.classList.remove('hidden');
    this.timerText.textContent = fmtTime(remaining);
    this.timerBar.style.width = `${Math.max(0, Math.min(1, remaining / total)) * 100}%`;
    this.timer.classList.toggle('danger', remaining <= 60);
  }

  setProgress(label: string | null, frac = 0): void {
    this.progress.classList.toggle('hidden', label === null);
    if (label === null) return;
    if (this.progressLabel.textContent !== label) this.progressLabel.textContent = label;
    this.progressFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  /** 畫面中間偏上的短暫訊息 */
  flash(text: string): void {
    clear(this.banner);
    this.banner.textContent = text;
    this.banner.classList.remove('hidden', 'show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  dispose(): void {
    document.body.classList.remove('game-hud');
    for (const r of this.roots) r.remove();
  }
}
