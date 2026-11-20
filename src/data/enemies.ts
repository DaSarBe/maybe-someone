import type { EnemyKind } from '../world/RaidMap';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  /** 裝備護甲（物品 id）；沒有則無甲 */
  armorId?: string;
  /** 武器候選與權重（物品 id，數值讀 WEAPON_STATS） */
  weapons: { id: string; weight: number }[];
  /** 隨身彈藥（數量範圍），死亡時留在屍體上 */
  ammoCarry: [number, number];
  walkSpeed: number;
  runSpeed: number;
  /** 視野全角（度）與最遠視距（公尺） */
  fov: number;
  sightRange: number;
  /** 在最佳條件（近、亮、站姿、正前方）下從「沒發現」到「發現」所需秒數 */
  reaction: number;
  /** 發現後到開第一槍的瞄準時間 */
  aimTime: number;
  /** 命中率曲線 [距離, 機率]，之間線性內插 */
  accuracy: [number, number][];
  /** 每次點射的發數與點射間隔（秒，隨機範圍） */
  burst: number;
  burstRest: [number, number];
  /** 傷害倍率（相對於武器數值，AI 比玩家溫和） */
  damageScale: number;
  /** 想把距離維持在這個範圍內（公尺）；rush = 會一路衝到近身 */
  preferRange: [number, number];
  rush: boolean;
  /** 會找掩護（換彈、受傷時） */
  coverSeeker: boolean;
  /** 聽力倍率 */
  hearing: number;
  /** 爆頭機率的種類係數（乘上難度基礎與距離係數，見 data/helmet.ts enemyHeadshotChance） */
  headCoef: number;
  /** 頭盔：等級、配戴機率、耐久比例範圍（佔上限）；沒有則不戴 */
  helmet?: { id: string; chance: number; durRange: [number, number]; drop: number };
  model: 'enemy_soldier' | 'enemy_robot_gunner';
  /** 模型高度（公尺）與顏色倍率（區分 guard 與 thug） */
  height: number;
  tint?: [number, number, number];
  /** 戰術傾向（乘上難度的戰術機率）：偷襲（蹲走接近）、趁換彈 / 治療衝鋒、包抄 */
  tactics: { sneak: number; rush: number; flank: number };
  /** 額外掉落：[物品 id, 機率, [最少, 最多]] */
  extraLoot: [string, number, [number, number]][];
  /** 護甲掉落機率 */
  armorDrop: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  guard: {
    kind: 'guard', name: '港口警衛', hp: 50,
    weapons: [{ id: 'pistol', weight: 1 }], ammoCarry: [12, 30],
    walkSpeed: 1.3, runSpeed: 3.6, fov: 100, sightRange: 26,
    reaction: 1.0, aimTime: 0.8,
    accuracy: [[0, 0.55], [10, 0.4], [25, 0.2], [45, 0.07]],
    burst: 1, burstRest: [0.7, 1.3], damageScale: 0.8,
    preferRange: [8, 20], rush: false, coverSeeker: false, hearing: 0.8, headCoef: 0.8,
    model: 'enemy_soldier', height: 1.8, tint: [0.7, 0.85, 1.2],
    tactics: { sneak: 0.5, rush: 0.6, flank: 0.5 },
    extraLoot: [['bandage', 0.3, [1, 1]], ['pager', 0.25, [1, 1]]], armorDrop: 0,
  },
  thug: {
    kind: 'thug', name: '黑道打手', hp: 85, armorId: 'armor_1',
    helmet: { id: 'helmet_1', chance: 0.4, durRange: [0.7, 1], drop: 0.8 },
    weapons: [{ id: 'smg', weight: 3 }, { id: 'shotgun', weight: 2 }], ammoCarry: [24, 60],
    walkSpeed: 1.5, runSpeed: 4.8, fov: 110, sightRange: 30,
    reaction: 0.6, aimTime: 0.45,
    accuracy: [[0, 0.5], [8, 0.38], [20, 0.2], [40, 0.07]],
    burst: 4, burstRest: [0.5, 1.0], damageScale: 0.7,
    preferRange: [4, 12], rush: true, coverSeeker: false, hearing: 1.0, headCoef: 0.8,
    model: 'enemy_soldier', height: 1.8, tint: [1.25, 0.55, 0.5],
    tactics: { sneak: 0.3, rush: 1.3, flank: 0.8 }, // 莽撞：很少偷襲，愛趁你換彈衝過來
    extraLoot: [['ammo_pistol', 0.4, [10, 24]], ['brick_phone', 0.15, [1, 1]], ['chronite_shard', 0.1, [1, 1]]], armorDrop: 0.6,
  },
  rival_agent: {
    kind: 'rival_agent', name: '敵對企業穿越者', hp: 110, armorId: 'armor_3',
    helmet: { id: 'helmet_3', chance: 1, durRange: [0.6, 1], drop: 1 },
    weapons: [{ id: 'rifle', weight: 1 }], ammoCarry: [30, 70],
    walkSpeed: 1.6, runSpeed: 4.3, fov: 120, sightRange: 42,
    reaction: 0.35, aimTime: 0.3,
    accuracy: [[0, 0.7], [12, 0.55], [30, 0.35], [60, 0.15]],
    burst: 3, burstRest: [0.35, 0.8], damageScale: 0.7,
    preferRange: [12, 28], rush: false, coverSeeker: true, hearing: 1.3, headCoef: 1.3,
    model: 'enemy_robot_gunner', height: 1.9,
    tactics: { sneak: 1.4, rush: 1.0, flank: 1.4 }, // 訓練有素：最常蹲走偷襲與包抄
    extraLoot: [['chronite_shard', 0.7, [1, 3]], ['chronite', 0.3, [1, 1]], ['quantum_chip', 0.12, [1, 1]], ['medkit', 0.4, [1, 1]], ['ammo_rifle', 0.5, [10, 30]]], armorDrop: 1,
  },
};

/** 命中率曲線取值 */
export function accuracyAt(curve: [number, number][], dist: number): number {
  if (dist <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (dist <= curve[i][0]) {
      const [d0, a0] = curve[i - 1], [d1, a1] = curve[i];
      return a0 + (a1 - a0) * ((dist - d0) / (d1 - d0));
    }
  }
  return curve[curve.length - 1][1];
}

export function pickWeapon(def: EnemyDef, rng: () => number = Math.random): string {
  const total = def.weapons.reduce((s, w) => s + w.weight, 0);
  let r = rng() * total;
  for (const w of def.weapons) { r -= w.weight; if (r <= 0) return w.id; }
  return def.weapons[0].id;
}

// ---------------------------------------------------------------- 難度（地圖星等 ★ / ★★ / ★★★）
export type Difficulty = 1 | 2 | 3;

export interface DifficultyCoef {
  /** 命中率倍率（結果上限 MAX_HIT_CHANCE） */
  accuracy: number;
  /** 反應時間倍率（越小越快發現玩家） */
  reaction: number;
  /** 聽覺靈敏度倍率（乘在「聽到的機率」上，聽得到的距離仍由 data/noise.ts 決定） */
  hearing: number;
  /** 戰術行為的基礎機率（再乘上各敵人的 tactics 傾向，上限 MAX_TACTIC_CHANCE） */
  sneak: number;
  rush: number;
  flank: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyCoef> = {
  1: { accuracy: 0.75, reaction: 1.3, hearing: 0.8, sneak: 0.2, rush: 0.25, flank: 0.2 },
  2: { accuracy: 1.0, reaction: 1.0, hearing: 1.0, sneak: 0.45, rush: 0.5, flank: 0.45 },
  3: { accuracy: 1.3, reaction: 0.75, hearing: 1.25, sneak: 0.75, rush: 0.8, flank: 0.75 },
};
export const MAX_HIT_CHANCE = 0.95;
export const MAX_TACTIC_CHANCE = 0.95;

export const asDifficulty = (v: unknown): Difficulty => (v === 1 || v === 3 ? v : 2);

/** 命中率（已套用難度倍率並限制上限） */
export function scaledAccuracy(base: number, d: Difficulty): number {
  return Math.min(MAX_HIT_CHANCE, base * DIFFICULTY[d].accuracy);
}

/** 戰術行為機率 = 難度基礎 × 敵人傾向 */
export function tacticChance(kind: 'sneak' | 'rush' | 'flank', d: Difficulty, def: Pick<EnemyDef, 'tactics'>): number {
  return Math.min(MAX_TACTIC_CHANCE, DIFFICULTY[d][kind] * def.tactics[kind]);
}

/** 擲出這個敵人的頭盔：回傳 { id, dur } 或 null（沒戴）。dur 為絕對耐久值 */
export function rollEnemyHelmet(def: EnemyDef, durMax: (id: string) => number, rng: () => number = Math.random): { id: string; dur: number } | null {
  const h = def.helmet;
  if (!h || rng() >= h.chance) return null;
  const [lo, hi] = h.durRange;
  return { id: h.id, dur: Math.max(1, Math.round(durMax(h.id) * (lo + (hi - lo) * rng()))) };
}
