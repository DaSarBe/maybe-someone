import type { AudioManager } from '../audio/AudioManager';

/**
 * 「音效載入中 xx%」提示。不擋住遊戲（pointer-events: none），聲音陸續上線；
 * 全部就緒後自動消失。浮在開始畫面與暫停選單之上，電腦版與手機版都看得到。
 */
export class AudioLoadBadge {
  private el = document.createElement('div');

  constructor(parent: HTMLElement, audio: AudioManager) {
    this.el.className = 'audio-load-badge';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    parent.appendChild(this.el);
    const update = (p: number): void => {
      if (audio.loaded || p >= 1) {
        this.el.remove();
        return;
      }
      this.el.textContent = `音效載入中 ${Math.floor(p * 100)}%`;
    };
    audio.onProgress(update);
    update(audio.progress);
    // 載入流程結束（含失敗）時一定要消失
    if (audio.loaded) this.el.remove();
  }
}
