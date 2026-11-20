import { revealSeconds } from '../data/search';
import type { Slot } from './Inventory';

export interface RevealOpts {
  /** 搜刮模組係數（EconomyService.searchScale） */
  scale: number;
  quiet: boolean;
}

/**
 * 一個容器的逐件揭露進度（純邏輯，可存在場景的容器上；關閉面板後進度保留）。
 * 物品依陣列順序一件一件揭露：index < done 的已經揭露，progress 是目前這一件的完成度（0..1）。
 * 進度用比例記錄，中途切換安靜搜刮時時間會依新設定重新換算。
 */
export class LootSearch {
  done = 0;
  progress = 0;

  constructor(readonly loot: Slot[]) {}

  /** 全部揭露完畢 */
  get finished(): boolean { return this.done >= this.loot.length; }
  /** 全部揭露完畢而且東西都被拿光 */
  get exhausted(): boolean { return this.finished && this.loot.every((s) => !s); }
  /** 正在揭露的格子；沒有時 -1 */
  get current(): number { return this.finished ? -1 : this.done; }

  isRevealed(i: number): boolean { return i < this.done; }

  /** 已揭露、還在容器裡的物品 */
  revealedIndices(): number[] {
    const out: number[] = [];
    for (let i = 0; i < Math.min(this.done, this.loot.length); i++) if (this.loot[i]) out.push(i);
    return out;
  }

  /** 前進 dt 秒，回傳這次新揭露的格子編號 */
  advance(dt: number, o: RevealOpts): number[] {
    const out: number[] = [];
    let rest = Math.max(0, dt);
    while (!this.finished) {
      const s = this.loot[this.done];
      if (!s) { this.done++; this.progress = 0; continue; } // 空格直接跳過
      const need = Math.max(0.01, revealSeconds(s.id, o.scale, o.quiet));
      const remain = (1 - this.progress) * need;
      if (rest < remain) { this.progress += rest / need; break; }
      rest -= remain;
      out.push(this.done);
      this.done++;
      this.progress = 0;
    }
    return out;
  }
}
