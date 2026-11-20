import type { AudioManager } from '../audio/AudioManager';
import type { Vec3 } from '../data/noise';
import { el } from './dom';
import type { LayoutManager } from './layout/LayoutManager';
import { NOISE_COLOR, NoiseIndicatorModel, arcAlpha, arcWidthDeg } from './noiseIndicatorModel';

const BOX = 320;
const RADIUS = 128;

/**
 * 聲音視覺提示：以準心為中心的圓環上，顯示「別人發出的、你聽得到的」聲音的方向。
 * 角度 = 聲源相對視線的水平角（正後方在圓環下方）；透明度與大小依聽到的音量（已含距離與牆壁遮擋）；
 * 腳步白、槍聲紅（較大）、其他動作黃，上方 / 下方樓層的聲音加小箭頭。
 * 不顯示自己的聲音（AudioManager.onHeard 只會通知其他人的聲音）。
 */
export class NoiseIndicator {
  readonly model = new NoiseIndicatorModel();
  private root = el('div', 'nd-root');
  private canvas = el('canvas', 'nd-canvas');
  private g: CanvasRenderingContext2D | null;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private enabled = true;
  private unbind: (() => void) | null = null;
  private unsub: (() => void) | null = null;
  private dirty = true;

  constructor(
    parent: HTMLElement,
    audio: AudioManager,
    layout: LayoutManager | null,
    private view: () => { ear: Vec3; yaw: number },
  ) {
    this.canvas.width = this.canvas.height = Math.round(BOX * this.dpr);
    this.canvas.style.width = this.canvas.style.height = `${BOX}px`;
    this.g = this.canvas.getContext('2d');
    this.root.appendChild(this.canvas);
    parent.appendChild(this.root);
    if (layout) this.unbind = layout.bind('noisedir', this.root);
    this.unsub = audio.onHeard((e, h) => {
      if (!this.enabled) return;
      const v = this.view();
      this.model.add(v.ear, v.yaw, e.kind, e.position, h.gain);
    });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.root.classList.toggle('hidden', !on);
    if (!on) this.model.clear();
  }

  /** 每個畫面呼叫 */
  update(dt: number): void {
    if (!this.enabled) return;
    const v = this.view();
    this.model.update(dt, v.ear, v.yaw);
    if (this.model.arcs.length === 0 && !this.dirty) return;
    this.draw();
    this.dirty = this.model.arcs.length > 0;
  }

  private draw(): void {
    const g = this.g;
    if (!g) return;
    const k = this.dpr;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, BOX, BOX);
    const c = BOX / 2;
    g.lineCap = 'round';
    for (const a of this.model.arcs) {
      const alpha = arcAlpha(a);
      if (alpha <= 0.01) continue;
      const w = (arcWidthDeg(a.cls, a.gain) * Math.PI) / 180;
      const mid = a.angle - Math.PI / 2; // canvas 0 = 右；我們的 0 = 上
      g.globalAlpha = alpha;
      g.strokeStyle = NOISE_COLOR[a.cls];
      g.shadowColor = NOISE_COLOR[a.cls];
      g.shadowBlur = 8;
      g.lineWidth = a.cls === 'shot' ? 13 : 8;
      g.beginPath();
      g.arc(c, c, RADIUS, mid - w / 2, mid + w / 2);
      g.stroke();
      if (a.vertical) {
        // 上方 / 下方樓層：圓環外側的小箭頭（▲ 在上、▼ 在下）
        const r = RADIUS + 22;
        const x = c + Math.sin(a.angle) * r, y = c - Math.cos(a.angle) * r;
        const s = 7;
        g.shadowBlur = 0;
        g.fillStyle = NOISE_COLOR[a.cls];
        g.beginPath();
        if (a.vertical > 0) { g.moveTo(x, y - s); g.lineTo(x - s, y + s * 0.7); g.lineTo(x + s, y + s * 0.7); }
        else { g.moveTo(x, y + s); g.lineTo(x - s, y - s * 0.7); g.lineTo(x + s, y - s * 0.7); }
        g.closePath();
        g.fill();
      }
    }
    g.globalAlpha = 1;
    g.shadowBlur = 0;
  }

  dispose(): void {
    this.unsub?.();
    this.unbind?.();
    this.root.remove();
  }
}
