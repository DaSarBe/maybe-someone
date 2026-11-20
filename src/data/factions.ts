/**
 * 陣營、關係、聲望（純資料與純函式，不依賴 three.js 或瀏覽器）。
 *
 * 前端（AI、UI）只呼叫這裡的函式；聲望的實際讀寫在 economy/EconomyService。
 * 第二階段：真人玩家同樣有「所屬企業」與聲望，規則與 NPC 一致，整層可以直接搬到伺服器。
 */

export type CorpId = 'corp_aurora' | 'corp_chronos' | 'corp_crimson';
export type FactionId = 'guard' | 'triad' | CorpId;

export const CORP_IDS: CorpId[] = ['corp_aurora', 'corp_chronos', 'corp_crimson'];
export const FACTION_IDS: FactionId[] = ['guard', 'triad', ...CORP_IDS];
export const isCorp = (f: string): f is CorpId => (CORP_IDS as string[]).includes(f);
export const isFactionId = (f: unknown): f is FactionId => typeof f === 'string' && (FACTION_IDS as string[]).includes(f);

export interface FactionDef {
  id: FactionId;
  name: string;
  /** 頭頂標記與提示用的短名 */
  short: string;
  kind: 'official' | 'gang' | 'corp';
  desc: string;
  color: string;
  /** 模型顏色倍率（乘在原本的貼圖上）；沒有則沿用敵人種類的 tint */
  tint?: [number, number, number];
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  guard: { id: 'guard', name: '港務警衛', short: '警衛', kind: 'official', color: '#7cc4ff', desc: '官方，維持港區秩序。把穿越者當成非法入侵者，也和黑道水火不容。' },
  triad: { id: 'triad', name: '海龍幫', short: '海龍幫', kind: 'gang', color: '#ff6a5a', desc: '盤踞倉庫與貨櫃區的走私集團。和警衛、所有企業都有利益衝突。' },
  corp_aurora: {
    id: 'corp_aurora', name: '晨星重工', short: '晨星', kind: 'corp', color: '#f3d98b', tint: [1.55, 1.55, 1.2],
    desc: '重工業起家的未來企業，擅長裝甲與防護。',
  },
  corp_chronos: {
    id: 'corp_chronos', name: '時穹科技', short: '時穹', kind: 'corp', color: '#3fd0e8', tint: [0.5, 1.0, 1.55],
    desc: '研發時光機的未來企業，穩定器技術領先業界。',
  },
  corp_crimson: {
    id: 'corp_crimson', name: '赤焰軍工', short: '赤焰', kind: 'corp', color: '#ef4444', tint: [1.1, 0.3, 0.28],
    desc: '軍火起家的未來企業，武器與配件的最大供應商。',
  },
};

export const factionName = (f: FactionId): string => FACTIONS[f].name;

// ---------------------------------------------------------------- 陣營關係
export type Relation = 'ally' | 'hostile' | 'truce';

/** 企業之間每場 Raid 隨機休戰的機率 */
export const CORP_TRUCE_CHANCE = 0.4;

/**
 * 靜態關係表：不同陣營之間「一定敵對」的配對。企業 ⇄ 企業不在表內（每場隨機休戰或敵對）。
 * guard ⇄ triad、guard ⇄ 所有企業、triad ⇄ 所有企業 都是敵對。
 */
export const HOSTILE_PAIRS: [FactionId, FactionId][] = [
  ['guard', 'triad'],
  ...CORP_IDS.map((c): [FactionId, FactionId] => ['guard', c]),
  ...CORP_IDS.map((c): [FactionId, FactionId] => ['triad', c]),
];

/** 靜態敵對（不看休戰）：企業之間回傳 false */
export function staticHostile(a: FactionId, b: FactionId): boolean {
  if (a === b) return false;
  return HOSTILE_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** 兩個陣營的關係。corpTruce = 這一場企業之間是否休戰（休戰時企業彼此不開火） */
export function relationBetween(a: FactionId, b: FactionId, corpTruce: boolean): Relation {
  if (a === b) return 'ally';
  if (isCorp(a) && isCorp(b)) return corpTruce ? 'truce' : 'hostile';
  return staticHostile(a, b) ? 'hostile' : 'truce';
}

export const areHostile = (a: FactionId, b: FactionId, corpTruce: boolean): boolean => relationBetween(a, b, corpTruce) === 'hostile';

/** 小型可重現亂數（mulberry32）。測試與「每場 Raid 的休戰擲骰」用同一個 seed 得到同一個結果 */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 這一場 Raid 企業之間是否休戰（以出發時間當 seed，存檔後不會因為重新整理而改變） */
export function rollCorpTruce(seed: number): boolean {
  return seededRng(seed)() < CORP_TRUCE_CHANCE;
}

// ---------------------------------------------------------------- 聲望
export const REP_MIN = -100;
export const REP_MAX = 100;
/** 低於此值：敵對（看到就開火） */
export const HOSTILE_BELOW = -20;
/** 高於此值：友好（不攻擊，也不會被腳步引來；可能幫忙） */
export const FRIENDLY_ABOVE = 40;

export type Attitude = 'hostile' | 'neutral' | 'friendly';
export const ATTITUDE_NAME: Record<Attitude, string> = { hostile: '敵對', neutral: '中立', friendly: '友好' };
export const ATTITUDE_HINT: Record<Attitude, string> = {
  hostile: '看到你就開火',
  neutral: '不主動攻擊，但會盯著你；被挑釁就會翻臉',
  friendly: '不會攻擊你，也不會被你的腳步引來；你和他的敵人交火時可能幫忙',
};

export const clampRep = (v: number): number => Math.max(REP_MIN, Math.min(REP_MAX, Math.round(v)));

export function attitudeOf(rep: number): Attitude {
  if (rep < HOSTILE_BELOW) return 'hostile';
  if (rep > FRIENDLY_ABOVE) return 'friendly';
  return 'neutral';
}

export type Reputation = Record<FactionId, number>;

/** 所屬企業的聲望固定值 */
export const OWN_CORP_REP = 100;
export const INITIAL_REP: Record<'guard' | 'triad' | 'otherCorp', number> = { guard: -40, triad: -40, otherCorp: -30 };

/** 初始聲望：guard -40、triad -40、自己的企業 +100、其他企業 -30（尚未選企業時三家都 -30） */
export function initialReputation(corp: CorpId | null): Reputation {
  const r = {} as Reputation;
  for (const f of FACTION_IDS) r[f] = f === 'guard' ? INITIAL_REP.guard : f === 'triad' ? INITIAL_REP.triad : INITIAL_REP.otherCorp;
  if (corp) r[corp] = OWN_CORP_REP;
  return r;
}

/** 補齊、夾限並固定自己企業的聲望 */
export function cleanReputation(raw: unknown, corp: CorpId | null): Reputation {
  const base = initialReputation(corp);
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  for (const f of FACTION_IDS) {
    const v = src[f];
    if (typeof v === 'number' && Number.isFinite(v)) base[f] = clampRep(v);
  }
  if (corp) base[corp] = OWN_CORP_REP;
  return base;
}

// ---------------------------------------------------------------- 聲望變化
export const KILL_REP = { normal: -15, friendly: -25, enemyOfVictim: 3 } as const;

/**
 * 殺死 victim 陣營成員造成的聲望變化（只列出有變動的陣營）。
 *  - 該陣營 -15（殺死時對方是友好態度 -25）
 *  - 與該陣營「靜態敵對」的陣營 +3（殺黑道 → 警衛與三家企業 +3；企業之間的休戰不算）
 * 玩家自己所屬企業的聲望固定 +100，不受影響（由呼叫端略過）。
 */
export function killRepChanges(victim: FactionId, victimAttitude: Attitude): Partial<Record<FactionId, number>> {
  const out: Partial<Record<FactionId, number>> = {};
  out[victim] = victimAttitude === 'friendly' ? KILL_REP.friendly : KILL_REP.normal;
  for (const f of FACTION_IDS) if (f !== victim && staticHostile(f, victim)) out[f] = KILL_REP.enemyOfVictim;
  return out;
}

/** 誤殺友軍（自己企業的穿越者）：聲望不變，結算時扣信用點 */
export const ALLY_KILL_COMPENSATION = 3000;

// ---------------------------------------------------------------- 打點關係（時代商行）
export const BRIBE = { cost: 1000, gain: 5, perRaidMax: 15 } as const;
export const BRIBE_TARGETS: FactionId[] = ['guard', 'triad'];

/** 這場 Raid 已經打點的聲望值 → 還能再打點幾次（每次 +5） */
export function bribesLeft(alreadyGained: number): number {
  return Math.max(0, Math.floor((BRIBE.perRaidMax - alreadyGained) / BRIBE.gain));
}

// ---------------------------------------------------------------- 企業
export interface CorpDef {
  id: CorpId;
  perk: string;
  /** 商店折扣：物品分類 → 價格倍率 */
  discount?: Partial<Record<string, number>>;
  /** 時空穩定度額外秒數 */
  stabilityBonus?: number;
}

export const CORPS: Record<CorpId, CorpDef> = {
  corp_aurora: { id: 'corp_aurora', perk: '護甲與頭盔 9 折', discount: { armor: 0.9, helmet: 0.9 } },
  corp_chronos: { id: 'corp_chronos', perk: '時空穩定度 +60 秒', stabilityBonus: 60 },
  corp_crimson: { id: 'corp_crimson', perk: '武器與配件 9 折', discount: { weapon: 0.9, attachment: 0.9 } },
};

/** 轉換企業的費用（信用點）；轉換後企業聲望重置 */
export const SWITCH_CORP_COST = 50000;

/** 企業對某個分類物品的價格倍率（沒有企業或沒有折扣 = 1） */
export function corpPriceMult(corp: CorpId | null, category: string): number {
  return (corp && CORPS[corp].discount?.[category]) ?? 1;
}
export const corpStabilityBonus = (corp: CorpId | null): number => (corp ? CORPS[corp].stabilityBonus ?? 0 : 0);

/** 轉換企業後的聲望：guard / triad 保留，三家企業依新企業重置 */
export function switchCorpReputation(current: Reputation, next: CorpId): Reputation {
  const fresh = initialReputation(next);
  const out = { ...current };
  for (const c of CORP_IDS) out[c] = fresh[c];
  return out;
}

// ---------------------------------------------------------------- 敵人生成
/** 「敵對企業穿越者」生成時屬於玩家自己企業（友軍）的機率 */
export const ALLY_AGENT_CHANCE = 0.15;

/** rival_agent 生成時的陣營：ALLY_AGENT_CHANCE 機率是玩家自己的企業，否則從另外兩家挑一家；尚未選企業就三選一 */
export function pickAgentFaction(playerCorp: CorpId | null, rng: () => number): CorpId {
  if (!playerCorp) return CORP_IDS[Math.min(CORP_IDS.length - 1, Math.floor(rng() * CORP_IDS.length))];
  if (rng() < ALLY_AGENT_CHANCE) return playerCorp;
  const others = CORP_IDS.filter((c) => c !== playerCorp);
  return others[Math.min(others.length - 1, Math.floor(rng() * others.length))];
}

export type EnemyKindId = 'guard' | 'thug' | 'rival_agent';
export function factionOfKind(kind: EnemyKindId, playerCorp: CorpId | null, rng: () => number): FactionId {
  if (kind === 'guard') return 'guard';
  if (kind === 'thug') return 'triad';
  return pickAgentFaction(playerCorp, rng);
}

/**
 * NPC 對玩家的態度。自己企業的穿越者一定友好；其他陣營看聲望；被挑釁的（provoked）一律敵對。
 * 聲望表由呼叫端傳入（EconomyService 的 profile.reputation）。
 */
export function npcAttitude(f: FactionId, rep: Reputation, playerCorp: CorpId | null, provoked: boolean): Attitude {
  if (playerCorp && f === playerCorp) return 'friendly';
  if (provoked) return 'hostile';
  return attitudeOf(rep[f] ?? 0);
}
