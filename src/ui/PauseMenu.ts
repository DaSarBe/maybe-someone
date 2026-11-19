import type { Input } from '../core/Input';
import type { AudioManager, AudioSettings } from '../audio/AudioManager';
import { Credits } from './Credits';

const SLIDERS: { key: keyof AudioSettings; label: string }[] = [
  { key: 'master', label: '主音量 Master' },
  { key: 'sfx', label: '音效 SFX' },
  { key: 'ambient', label: '環境音 Ambient' },
];

/**
 * 暫停選單。電腦版：沒有 Pointer Lock 時顯示（Esc 離開鎖定 = 暫停，點「繼續」重新鎖定）。
 * 手機：右上角選單鈕開關。內含音量滑桿與製作名單。
 */
export class PauseMenu {
  private el = document.createElement('div');
  private panel = document.createElement('div');
  private main = document.createElement('div');
  private title = document.createElement('h1');
  private credits: Credits;
  private hadLock = false;
  private open = true;
  private downOnBackdrop = false;
  private menuBtn: HTMLButtonElement | null = null;
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape' && this.debugToggle) this.setOpen(!this.open);
  };

  constructor(
    parent: HTMLElement,
    private input: Input,
    private audio: AudioManager,
    private opts: { touch: boolean; debug: boolean },
  ) {
    this.debugToggle = opts.debug;
    this.el.className = 'lock-overlay';
    this.panel.className = 'menu-panel';

    const hint = document.createElement('p');
    hint.innerHTML = 'WASD 移動 ・ Shift 衝刺 ・ C 蹲下 ・ Space 跳躍<br>滑鼠轉視角 ・ 左鍵射擊 ・ R 換彈 ・ 1/2 換槍 ・ 3 空槍 ・ Esc 暫停';
    if (opts.touch) hint.innerHTML = '左側搖桿移動 ・ 右側拖曳轉視角 ・ 按鈕射擊、換彈';

    const resume = document.createElement('button');
    resume.className = 'menu-btn primary';
    resume.textContent = opts.touch ? '繼續' : '繼續（點擊進入遊戲）';
    resume.addEventListener('click', () => this.resume());

    const sliders = document.createElement('div');
    sliders.className = 'menu-sliders';
    for (const s of SLIDERS) sliders.append(this.makeSlider(s.key, s.label));

    const creditsBtn = document.createElement('button');
    creditsBtn.className = 'menu-btn';
    creditsBtn.textContent = '製作名單';
    creditsBtn.addEventListener('click', () => { this.audio.playUi('select'); this.showCredits(true); });

    this.credits = new Credits(() => { this.audio.playUi('back'); this.showCredits(false); });

    this.main.className = 'menu-main';
    this.main.append(this.title, hint, resume, sliders, creditsBtn);
    this.panel.append(this.main, this.credits.el);
    this.el.append(this.panel);
    parent.appendChild(this.el);

    // 點背景（不是面板內）也能繼續；拖曳滑桿時放開在面板外不算
    this.el.addEventListener('pointerdown', (e) => { this.downOnBackdrop = e.target === this.el; });
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el && this.downOnBackdrop) this.resume();
    });

    window.addEventListener('keydown', this.onKey);
    if (opts.touch) {
      this.menuBtn = document.createElement('button');
      this.menuBtn.className = 'pause-btn';
      this.menuBtn.textContent = '☰';
      this.menuBtn.setAttribute('aria-label', '選單');
      this.menuBtn.addEventListener('click', () => { this.audio.playUi(this.open ? 'close' : 'open'); this.setOpen(!this.open); });
      parent.appendChild(this.menuBtn);
      this.setOpen(false);
    } else if (opts.debug) {
      this.setOpen(false); // 自動化測試：預設不擋畫面，按 Esc 開關
    } else {
      input.onLockChange = (locked) => {
        if (locked) this.hadLock = true;
        this.setOpen(!locked);
      };
      this.setOpen(true);
    }
  }

  private debugToggle: boolean;

  private makeSlider(key: keyof AudioSettings, label: string): HTMLElement {
    const row = document.createElement('label');
    row.className = 'menu-row';
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0'; input.max = '100'; input.step = '1';
    input.value = String(Math.round(this.audio.settings[key] * 100));
    const val = document.createElement('output');
    val.textContent = input.value;
    input.addEventListener('input', () => {
      val.textContent = input.value;
      this.audio.setVolume(key, Number(input.value) / 100);
    });
    // 放開時播一聲，讓玩家聽得出音量
    input.addEventListener('change', () => this.audio.playUi('click'));
    row.append(name, input, val);
    return row;
  }

  private resume(): void {
    this.audio.unlock();
    if (this.opts.touch || this.opts.debug) { this.setOpen(false); return; }
    this.input.requestLock();
  }

  private showCredits(v: boolean): void {
    this.credits.show(v);
    this.main.classList.toggle('hidden', v);
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.title.textContent = this.hadLock || this.opts.touch || this.opts.debug ? '已暫停' : '點擊畫面開始';
    this.el.classList.toggle('hidden', !open);
    if (!open) this.showCredits(false);
  }

  get isOpen(): boolean { return this.open; }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.input.onLockChange = null;
    this.menuBtn?.remove();
    this.el.remove();
  }
}
