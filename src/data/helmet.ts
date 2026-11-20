/**
 * 爆頭與頭盔規則（純資料與純函式，不依賴 three.js；玩家與敵人共用）。
 *
 * 規則：
 *  - 沒戴頭盔（或頭盔耐久歸零）被打中頭 = 立即死亡，任何武器、任何距離。
 *  - 頭盔依「武器類別 × 頭盔等級」查 HELMET_TABLE：lethal = 擋不住（一槍死）；
 *    否則擋下，只受到「目標最大 HP × dmg 範圍」的傷害，並消耗耐久。
 *  - 耐久低於 LOW_DUR_RATIO 時保護降一級（1 級降成沒戴 = 一槍死）；耐久 0 = 沒戴。
 *  - 霰彈槍每顆彈丸各自判定：前面的彈丸讓頭盔耐久下降，後面的彈丸依剩餘耐久判定。
 */
import type { WeaponStats } from './types';

export type WeaponClass = WeaponStats['weaponClass'];
export type HelmetLevel = 1 | 2 | 3 | 4;

export interface HelmetRule {
  /** true = 擋不住，目標立即死亡 */
  lethal: boolean;
  /** 擋下時受到的傷害範圍（佔目標最大 HP 的比例） */
  dmg: [number, number];
  /** 這一擊消耗的耐久（佔耐久上限的比例） */
  wear: number;
}

const dead = (wear: number): HelmetRule => ({ lethal: true, dmg: [1, 1], wear });
const block = (lo: number, hi: number, wear: number): HelmetRule => ({ lethal: false, dmg: [lo, hi], wear });

/** weaponClass × helmetLevel（數值可調整，測試只驗證範圍與單調性） */
export const HELMET_TABLE: Record<WeaponClass, Record<HelmetLevel, HelmetRule>> = {
  light: {
    1: block(0.70, 0.85, 0.20),
    2: block(0.25, 0.35, 0.12),
    3: block(0.10, 0.20, 0.08),
    4: block(0.05, 0.10, 0.05),
  },
  heavy: {
    1: dead(0.6),
    2: dead(0.5),
    3: block(0.70, 0.85, 0.40), // 步槍打中 3 級：擋下但頭盔大幅受損
    4: block(0.40, 0.55, 0.22),
  },
};

/** 耐久低於這個比例，保護降一級 */
export const LOW_DUR_RATIO = 0.3;

export interface HelmetInput {
  level: HelmetLevel;
  /** 目前耐久 */
  dur: number;
  /** 耐久上限 */
  max: number;
}

/** 實際生效的等級（0 = 等於沒戴）。耐久歸零 = 0；耐久低於 30% 降一級 */
export function effectiveHelmetLevel(h: HelmetInput | null): 0 | HelmetLevel {
  if (!h || h.dur <= 0 || h.max <= 0) return 0;
  const lvl = h.dur / h.max < LOW_DUR_RATIO ? h.level - 1 : h.level;
  return Math.max(0, lvl) as 0 | HelmetLevel;
}

export interface HeadshotResult {
  /** 立即死亡 */
  lethal: boolean;
  /** 扣在生命上的傷害（lethal 時 = 目標最大 HP，保證致死） */
  damage: number;
  /** 頭盔有沒有被打到（會響「叮」、耐久下降） */
  helmetHit: boolean;
  durLoss: number;
  durAfter: number;
  /** 這次判定用的有效等級 */
  effLevel: 0 | HelmetLevel;
}

/**
 * 一發（一顆彈丸）打中頭部的結果。maxHp 為目標的最大 HP；rng 回傳 [0,1)。
 * 沒頭盔：lethal。有頭盔：查表；擋不住的武器（lethal 規則）頭盔仍會受損，目標一樣死。
 */
export function resolveHeadshot(cls: WeaponClass, helmet: HelmetInput | null, maxHp: number, rng: () => number = Math.random): HeadshotResult {
  const effLevel = effectiveHelmetLevel(helmet);
  if (!helmet || effLevel === 0) {
    return { lethal: true, damage: maxHp, helmetHit: false, durLoss: 0, durAfter: helmet ? Math.max(0, helmet.dur) : 0, effLevel: 0 };
  }
  const rule = HELMET_TABLE[cls][effLevel];
  const durLoss = Math.min(helmet.dur, helmet.max * rule.wear);
  const durAfter = helmet.dur - durLoss;
  if (rule.lethal) return { lethal: true, damage: maxHp, helmetHit: true, durLoss, durAfter, effLevel };
  const frac = rule.dmg[0] + (rule.dmg[1] - rule.dmg[0]) * rng();
  return { lethal: false, damage: maxHp * frac, helmetHit: true, durLoss, durAfter, effLevel };
}

// ---------------------------------------------------------------- 敵人打中玩家的爆頭機率
/** 地圖難度（★ ★★ ★★★）的基礎機率：打中玩家的那一發是爆頭的機率 */
export const HEADSHOT_BASE: Record<1 | 2 | 3, number> = { 1: 0.02, 2: 0.04, 3: 0.07 };
/** 距離係數：5m 內 ×1.5、超過 25m ×0.4、其間 ×1 */
export const HEADSHOT_DIST = { near: 5, nearMult: 1.5, far: 25, farMult: 0.4 };

export function headshotDistMult(dist: number): number {
  if (dist <= HEADSHOT_DIST.near) return HEADSHOT_DIST.nearMult;
  if (dist > HEADSHOT_DIST.far) return HEADSHOT_DIST.farMult;
  return 1;
}

/** 敵人打中玩家時的爆頭機率 = 難度基礎 × 距離係數 × 敵人種類係數（EnemyDef.headCoef） */
export function enemyHeadshotChance(difficulty: 1 | 2 | 3, dist: number, kindCoef: number): number {
  return HEADSHOT_BASE[difficulty] * headshotDistMult(dist) * kindCoef;
}

/** 頭盔的視野遮蔽（3、4 級才有輕微暗角）：0..1 */
export const HELMET_VIGNETTE: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0.22, 4: 0.34 };

const pct = (r: HelmetRule): string => (r.lethal ? '一槍死' : `受 ${Math.round(r.dmg[0] * 100)}～${Math.round(r.dmg[1] * 100)}% 最大生命`);
/** 說明文字：這個等級的頭盔挨爆頭會怎樣 */
export function helmetSummary(level: HelmetLevel): string {
  return `輕型武器 ${pct(HELMET_TABLE.light[level])}；重型武器 ${pct(HELMET_TABLE.heavy[level])}`;
}
