export type HitZone = 'head' | 'body' | 'limb';

/** 部位倍率：頭 2.5、身體 1、四肢 0.7 */
export const ZONE_MULT: Record<HitZone, number> = { head: 2.5, body: 1, limb: 0.7 };

/** 護甲穿戴狀態。reduction 為減傷比例，dur 為剩餘耐久 */
export interface ArmorState {
  reduction: number;
  dur: number;
}

/** 護甲吸收傷害時，耐久的消耗 = 部位修正後傷害 × 這個比例 */
export const ARMOR_WEAR = 0.3;

/** 距離衰減：射程一半內滿傷害，到射程線性降到 55%，射程之外繼續降到 30% */
export function damageFalloff(dist: number, range: number): number {
  if (dist <= range * 0.5) return 1;
  if (dist <= range) return 1 - 0.45 * ((dist - range * 0.5) / (range * 0.5));
  return Math.max(0.3, 0.55 - 0.25 * ((dist - range) / (range * 0.5)));
}

export interface DamageResult {
  /** 扣在生命上的傷害 */
  damage: number;
  /** 護甲耐久消耗 */
  durLoss: number;
  /** 護甲之後的耐久 */
  durAfter: number;
}

/**
 * 傷害計算（玩家與敵人共用）：
 * 1. 部位倍率；2. 頭部無視護甲，其他部位在耐久 > 0 時依護甲減傷；3. 護甲耐久消耗。
 */
export function computeDamage(base: number, zone: HitZone, armor: ArmorState | null): DamageResult {
  const raw = base * ZONE_MULT[zone];
  if (!armor || armor.dur <= 0 || zone === 'head') {
    return { damage: raw, durLoss: 0, durAfter: armor?.dur ?? 0 };
  }
  const durLoss = Math.min(armor.dur, raw * ARMOR_WEAR);
  return { damage: raw * (1 - armor.reduction), durLoss, durAfter: armor.dur - durLoss };
}

/** 殺死某個敵人需要的發數（用於平衡表與測試）；armorDur 會隨命中消耗 */
export function shotsToKill(hp: number, base: number, zone: HitZone, armor: ArmorState | null, falloff = 1): number {
  let left = hp;
  let a = armor ? { ...armor } : null;
  let n = 0;
  while (left > 0 && n < 999) {
    const r = computeDamage(base * falloff, zone, a);
    left -= r.damage;
    if (a) a = { ...a, dur: r.durAfter };
    n++;
  }
  return n;
}
