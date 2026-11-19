import type { WeaponStats } from '../data/types';

/** 彈藥來源：背包（EconomyService）或測試用的假物件 */
export interface AmmoSource {
  count(id: string): number;
  /** 取走最多 n 發，回傳實際數量 */
  take(id: string, n: number): number;
}

export type FireResult = 'fired' | 'empty' | 'wait';

/**
 * 單把武器的狀態：彈匣、射速冷卻、換彈。
 * 彈匣內的子彈屬於武器（存回物品的 dur）；背包彈藥在換彈「完成」的瞬間才扣，被打斷不會損失。
 */
export class WeaponState {
  mag: number;
  cooldown = 0;
  reloading = false;
  reloadLeft = 0;

  constructor(readonly id: string, readonly stats: WeaponStats, mag?: number) {
    this.mag = Math.max(0, Math.min(stats.magazine, mag ?? stats.magazine));
  }

  get fireInterval(): number { return 60 / this.stats.fireRate; }
  get reloadProgress(): number { return this.reloading ? 1 - this.reloadLeft / this.stats.reloadTime : 0; }

  /** 嘗試開一槍 */
  tryFire(): FireResult {
    if (this.reloading || this.cooldown > 0) return 'wait';
    if (this.mag <= 0) return 'empty';
    this.mag--;
    this.cooldown = this.fireInterval;
    return 'fired';
  }

  /** 開始換彈。回傳 false = 彈匣已滿 / 背包沒有對應彈藥 / 正在換彈 */
  startReload(ammo: AmmoSource): boolean {
    if (this.reloading || this.mag >= this.stats.magazine) return false;
    if (ammo.count(this.stats.ammoType) <= 0) return false;
    this.reloading = true;
    this.reloadLeft = this.stats.reloadTime;
    return true;
  }

  /** 打斷換彈（切換武器）；不損失任何彈藥 */
  cancelReload(): void {
    this.reloading = false;
    this.reloadLeft = 0;
  }

  /** 推進時間；換彈完成時回傳裝入的發數，否則回傳 0 */
  update(dt: number, ammo: AmmoSource): number {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.reloading) return 0;
    this.reloadLeft -= dt;
    if (this.reloadLeft > 0) return 0;
    this.reloading = false;
    this.reloadLeft = 0;
    const need = this.stats.magazine - this.mag;
    const got = ammo.take(this.stats.ammoType, need);
    this.mag += got;
    return got;
  }
}

/** 散佈（度）：瞄準 / 腰射基礎值 + 移動 + 跳躍 + 連射累積；蹲下縮小 */
export function computeSpread(
  h: { spreadHip: number; spreadAds: number; spreadMove: number },
  c: { ads: boolean; speed: number; sprinting: boolean; airborne: boolean; crouching: boolean; bloom: number },
): number {
  let s = c.ads ? h.spreadAds : h.spreadHip;
  if (c.crouching) s *= 0.7;
  const moveK = Math.min(1, c.speed / 4);
  s += h.spreadMove * moveK * (c.ads ? 0.6 : 1);
  if (c.sprinting) s += h.spreadMove * 0.8;
  if (c.airborne) s += h.spreadMove * 2.5;
  return s + c.bloom;
}
