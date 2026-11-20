import type { NavIndex } from './Nav';
import { tacticChance, type Difficulty, type EnemyDef } from '../data/enemies';

/** 趁玩家換彈（或看到治療）衝過來的有效距離（公尺） */
export const RUSH_RANGE = 25;
/** 偷襲：離調查點 / 最後已知位置這麼近時改成蹲走接近（公尺） */
export const SNEAK_APPROACH = 14;
/** 包抄路線上，隊友主路線附近多遠以內算「同一條路」（公尺）與其額外成本 */
export const FLANK_NEAR = 5;
export const FLANK_PENALTY_ON = 60;
export const FLANK_PENALTY_NEAR = 18;

/** NPC 的 id 是 'e' + 數字；其他來源（'player'、第二階段的其他玩家 id）才是敵人要聽的對象 */
export const isNpcSource = (source: string): boolean => /^e\d+$/.test(source);

/**
 * 聽到的機率：只要在「聽得到的距離」內就有基本機率，越大聲（距離近、沒被擋住）越高。
 * sensitivity = 敵人聽力 × 難度聽覺倍率；持續型聲音（搜刮、撤離嗡嗡聲）每次心跳只算一半多一點。
 */
export function hearChance(gain: number, sensitivity: number, sustained = false): number {
  if (gain <= 0) return 0;
  const base = 0.45 + 0.55 * Math.sqrt(Math.min(1, gain));
  return Math.min(1, base * sensitivity * (sustained ? 0.6 : 1));
}

/** 聽到換彈 / 看到治療後，是否立刻衝向玩家（或推進到更近的掩體） */
export function shouldRush(p: { dist: number; difficulty: Difficulty; def: Pick<EnemyDef, 'tactics'>; rng: () => number }): boolean {
  if (p.dist > RUSH_RANGE) return false;
  return p.rng() < tacticChance('rush', p.difficulty, p.def);
}

/** 進入警戒 / 搜索時，是否決定蹲走偷襲 */
export function shouldSneak(p: { difficulty: Difficulty; def: Pick<EnemyDef, 'tactics'>; rng: () => number }): boolean {
  return p.rng() < tacticChance('sneak', p.difficulty, p.def);
}

/** 同群組 2 人以上發現玩家時，是否有人包抄 */
export function shouldFlank(p: { difficulty: Difficulty; def: Pick<EnemyDef, 'tactics'>; rng: () => number }): boolean {
  return p.rng() < tacticChance('flank', p.difficulty, p.def);
}

export interface FlankPlan {
  /** 包抄路線（節點索引，含起點與終點） */
  route: number[];
  /** 隊友的主路線 */
  mainPath: number[];
  /** 包抄路線（扣掉起終點兩端）與主路線共用的節點數 */
  shared: number;
}

/**
 * 包抄：先算隊友到玩家的主路線，再用 A*（主路線上的節點與其附近加上額外成本）
 * 算出另一條路線。找不到或繞太遠（超過主路線的 2.5 倍 + 20m）回傳 null。
 */
export function planFlank(nav: NavIndex, flankerFrom: number, mainFrom: number, target: number): FlankPlan | null {
  const mainPath = nav.findPath(mainFrom, target);
  if (!mainPath || mainPath.length < 2) return null;
  const onMain = new Set(mainPath);
  const nearCache = new Map<number, number>();
  const penalty = (i: number): number => {
    if (onMain.has(i)) return FLANK_PENALTY_ON;
    let v = nearCache.get(i);
    if (v === undefined) {
      v = 0;
      for (const m of mainPath) if (nav.nodes[i].distanceTo(nav.nodes[m]) < FLANK_NEAR) { v = FLANK_PENALTY_NEAR; break; }
      nearCache.set(i, v);
    }
    return v;
  };
  const route = nav.findPath(flankerFrom, target, penalty);
  if (!route || route.length < 2) return null;
  if (nav.pathLength(route) > nav.pathLength(mainPath) * 2.5 + 20) return null;
  const interior = route.slice(1, -1);
  const shared = interior.filter((i) => onMain.has(i)).length;
  // 繞不開（大部分路線和隊友相同）就不包抄
  if (interior.length > 0 && shared / interior.length > 0.5) return null;
  return { route, mainPath, shared };
}
