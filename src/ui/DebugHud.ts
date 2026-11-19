import type { GameBus } from '../core/EventBus';

export interface DebugInfo {
  surface: string;
  zone: string;
  moveState: string;
  position: string;
}

/** 除錯 HUD：FPS、腳下材質、回音區、移動狀態；底部捲動顯示 footstep / land 事件 */
export class DebugHud {
  private stats = document.createElement('div');
  private log = document.createElement('div');
  private lines: string[] = [];
  private frames = 0;
  private acc = 0;
  private fps = 0;
  private unsubs: (() => void)[] = [];

  constructor(parent: HTMLElement, bus: GameBus, touch: boolean) {
    this.stats.className = 'dbg-hud';
    this.log.className = 'dbg-log' + (touch ? ' touch' : '');
    parent.append(this.stats, this.log);
    this.unsubs.push(
      bus.on('footstep', (e) => this.push(`step ${e.surface} (${e.intensity})`)),
      bus.on('land', (e) => this.push(`LAND ${e.surface} v=${e.fallSpeed.toFixed(1)}`)),
      bus.on('reverbZoneChanged', (e) => this.push(`zone -> ${e.type}`)),
    );
  }

  setVisible(v: boolean): void {
    this.stats.style.display = this.log.style.display = v ? '' : 'none';
  }

  update(frameDt: number, info: DebugInfo): void {
    this.frames++;
    this.acc += frameDt;
    if (this.acc >= 0.2) {
      this.fps = this.frames / this.acc;
      this.frames = 0;
      this.acc = 0;
      this.stats.textContent =
        `FPS     ${this.fps.toFixed(0)}\n` +
        `surface ${info.surface}\n` +
        `zone    ${info.zone}\n` +
        `state   ${info.moveState}\n` +
        `pos     ${info.position}`;
    }
  }

  private push(line: string): void {
    this.lines.push(line);
    if (this.lines.length > 8) this.lines.shift();
    this.log.textContent = this.lines.join('\n');
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.stats.remove();
    this.log.remove();
  }
}
