import type { SaveService } from '../src/save/SaveService';
import { EconomyService } from '../src/economy/EconomyService';

export class MemorySave implements SaveService {
  data = new Map<string, string>();
  get<T>(key: string, fallback: T): T {
    const raw = this.data.get(key);
    return raw === undefined ? fallback : (JSON.parse(raw) as T);
  }
  set<T>(key: string, value: T): void { this.data.set(key, JSON.stringify(value)); }
  remove(key: string): void { this.data.delete(key); }
}

/** 固定時間（中午）以讓每日價格可預測 */
export const NOON = new Date(2026, 5, 15, 12, 0, 0).getTime();

export function makeEconomy(save = new MemorySave(), now = () => NOON): { eco: EconomyService; save: MemorySave } {
  return { eco: new EconomyService(save, now), save };
}

/** 測試用：直接給錢（只有測試會碰內部狀態） */
export function giveCredits(eco: EconomyService, n: number): void {
  (eco as unknown as { p: { credits: number } }).p.credits += n;
}
