import { DEFAULT_ERA } from '../data/eras';
import { STARTING_CREDITS, getItem } from '../data/items';
import { ARMOR_STATS, BACKPACK_STATS, POCKETS } from '../data/gear';
import { WEAPON_STATS } from '../data/weapons';
import { UPGRADES, type UpgradeId } from '../data/upgrades';
import { stackWeight, type ItemStack, type Slot } from './Inventory';

export const PROFILE_VERSION = 1;
export const PROFILE_KEY = 'profile';

export type EquipSlot = 'primary' | 'secondary' | 'armor' | 'backpack';
export const EQUIP_SLOTS: EquipSlot[] = ['primary', 'secondary', 'armor', 'backpack'];

export interface RaidResult {
  outcome: 'extract' | 'death';
  era: string;
  /** extract：這次帶回的物品；death：失去的物品 */
  items: ItemStack[];
  /** 死亡時被保險袋保住的物品 */
  kept: ItemStack[];
  value: number;
  /** 因為 Raid 中重新整理或關閉頁面而被判定死亡 */
  interrupted: boolean;
  at: number;
}

export interface RaidState {
  era: string;
  startedAt: number;
  /** 預計的總時長（秒） */
  duration: number;
  /** 出發時身上（背包 + 保險袋 + 裝備）每種物品的數量，結算時用來算帶回了什麼 */
  snapshot: Record<string, number>;
  /** 時代商人本場的交易紀錄（庫存由 startedAt 決定，這裡只記已經發生的數量） */
  trade?: { bought: Record<string, number>; sold: Record<string, number> };
}

export interface Profile {
  version: number;
  credits: number;
  stash: Slot[];
  equipment: Record<EquipSlot, ItemStack | null>;
  carried: Slot[];
  secure: Slot[];
  safe: Slot[];
  upgrades: Record<UpgradeId, number>;
  stats: {
    raids: number;
    extracts: number;
    deaths: number;
    /** 成功撤離帶回的物品總價值（累計收益） */
    extractedValue: number;
    lostValue: number;
  };
  /** 非 null 代表 Raid 進行中。載入存檔時若還在，就視為死亡 */
  raid: RaidState | null;
  /** 尚未被玩家確認的結算（重新整理後仍會顯示） */
  pendingResult: RaidResult | null;
}

export function createDefaultProfile(): Profile {
  const p: Profile = {
    version: PROFILE_VERSION,
    credits: STARTING_CREDITS,
    stash: [{ id: 'ammo_pistol', qty: 60 }, { id: 'bandage', qty: 3 }],
    equipment: {
      primary: null,
      secondary: { id: 'pistol', qty: 1 },
      armor: null,
      backpack: { id: 'bag_small', qty: 1 },
    },
    carried: [],
    secure: [],
    safe: [],
    upgrades: { stash: 0, secure: 0, safe: 0, stabilizer: 0, search: 0 },
    stats: { raids: 0, extracts: 0, deaths: 0, extractedValue: 0, lostValue: 0 },
    raid: null,
    pendingResult: null,
  };
  return fitProfile(p);
}

// ---------------------------------------------------------------- 由升級與裝備推導的數值
export function upgradeValue(p: Pick<Profile, 'upgrades'>, id: UpgradeId): number {
  const def = UPGRADES.find((u) => u.id === id)!;
  const lv = Math.max(0, Math.min(def.levels.length, p.upgrades[id] ?? 0));
  return lv === 0 ? def.base : def.levels[lv - 1].value;
}
export const stashCapacity = (p: Profile): number => upgradeValue(p, 'stash');
export const secureCapacity = (p: Profile): number => upgradeValue(p, 'secure');
export const safeCapacity = (p: Profile): number => upgradeValue(p, 'safe');
/** 穩定器升級帶來的額外秒數（基礎 300 秒之上） */
export const STABILIZER_BASE = 300;
export const stabilizerBonus = (p: Pick<Profile, 'upgrades'>): number => upgradeValue(p, 'stabilizer') - STABILIZER_BASE;
/** Raid 停留時間 = 時代基礎時間 + 穩定器加成；baseDuration 省略時用舊行為（300 秒基礎） */
export const raidDuration = (p: Pick<Profile, 'upgrades'>, baseDuration = STABILIZER_BASE): number => baseDuration + stabilizerBonus(p);
export const searchTimeScale = (p: Profile): number => upgradeValue(p, 'search');

export function carriedSpec(p: Pick<Profile, 'equipment'>): { slots: number; maxWeight: number } {
  const bag = p.equipment.backpack;
  return (bag && BACKPACK_STATS[bag.id]) || POCKETS;
}

/** 身上穿戴裝備的重量（算進負重） */
export function equipmentWeight(p: Pick<Profile, 'equipment'>): number {
  let w = 0;
  for (const s of EQUIP_SLOTS) {
    const e = p.equipment[s];
    if (e) w += stackWeight(e);
  }
  return w;
}

export function armorMaxDurability(id: string): number {
  return ARMOR_STATS[id]?.durability ?? 0;
}

/**
 * 物品的「狀態值」上限：護甲 = 耐久，武器 = 彈匣容量。存在 ItemStack.dur。
 * 省略 dur 代表全新 / 彈匣是滿的。
 */
export function itemMaxDur(id: string): number {
  return ARMOR_STATS[id]?.durability ?? WEAPON_STATS[id]?.magazine ?? 0;
}

// ---------------------------------------------------------------- 存檔清理與升級
function cleanStack(raw: unknown): ItemStack | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { id?: unknown; qty?: unknown; count?: unknown; dur?: unknown };
  if (typeof r.id !== 'string') return null;
  const def = getItem(r.id);
  if (!def) return null;
  const q = Number(r.qty ?? r.count ?? 1);
  if (!Number.isFinite(q) || q < 1) return null;
  const s: ItemStack = { id: r.id, qty: Math.min(def.maxStack, Math.floor(q)) };
  if (typeof r.dur === 'number' && (def.category === 'armor' || def.category === 'weapon')) s.dur = Math.max(0, Math.min(itemMaxDur(r.id), Math.floor(r.dur)));
  return s;
}

function cleanSlots(raw: unknown, capacity: number): Slot[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: Slot[] = arr.map(cleanStack);
  // 容量變小時不能吞掉物品：只裁掉尾端的空格
  while (out.length > capacity && out[out.length - 1] === null) out.pop();
  while (out.length < capacity) out.push(null);
  return out;
}

/** 補齊欄位、清掉不存在的物品、依升級重算各容器大小 */
export function fitProfile(p: Profile): Profile {
  const clean = (v: unknown, fb: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  p.credits = Math.max(0, Math.floor(clean(p.credits, 0)));
  p.upgrades = { ...(p.upgrades ?? {}) } as Profile['upgrades'];
  p.equipment = { ...(p.equipment ?? {}) } as Profile['equipment'];
  for (const u of UPGRADES) {
    p.upgrades[u.id] = Math.max(0, Math.min(u.levels.length, Math.floor(clean(p.upgrades?.[u.id], 0))));
  }
  for (const s of EQUIP_SLOTS) {
    const e = cleanStack(p.equipment?.[s]);
    const def = e ? getItem(e.id) : undefined;
    const okCat = s === 'armor' ? 'armor' : s === 'backpack' ? 'backpack' : 'weapon';
    p.equipment[s] = e && def?.category === okCat ? e : null;
  }
  p.stash = cleanSlots(p.stash, stashCapacity(p));
  p.safe = cleanSlots(p.safe, safeCapacity(p));
  p.secure = cleanSlots(p.secure, secureCapacity(p));
  p.carried = cleanSlots(p.carried, carriedSpec(p).slots);
  p.stats = { ...{ raids: 0, extracts: 0, deaths: 0, extractedValue: 0, lostValue: 0 }, ...(p.stats ?? {}) };
  p.raid = p.raid && typeof p.raid === 'object' && p.raid.era ? p.raid : null;
  if (p.raid) { p.raid.snapshot ??= {}; p.raid.trade ??= { bought: {}, sold: {} }; }
  p.pendingResult ??= null;
  p.version = PROFILE_VERSION;
  return p;
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * 依版本號逐版升級舊存檔。migrations[n] 把 version n 升到 n+1。
 * v0（M3 開發初期的格式）：沒有 version 欄位，金錢叫 money，倉庫是沒有空格的 {id, count} 清單。
 */
const MIGRATIONS: Migration[] = [
  (raw) => {
    const out: Record<string, unknown> = { ...raw };
    if ('money' in out) { out.credits = out.money; delete out.money; }
    if (Array.isArray(out.stash)) out.stash = (out.stash as unknown[]).map((s) => cleanStack(s));
    out.version = 1;
    return out;
  },
];

/** 把任何舊版或損毀的存檔轉成目前版本；無法辨識就回傳全新存檔 */
export function migrateProfile(raw: unknown): Profile {
  if (!raw || typeof raw !== 'object') return createDefaultProfile();
  let cur = raw as Record<string, unknown>;
  let v = typeof cur.version === 'number' ? cur.version : 0;
  if (v > PROFILE_VERSION) return createDefaultProfile(); // 來自未來版本，無法讀取
  while (v < PROFILE_VERSION) {
    cur = MIGRATIONS[v](cur);
    v = typeof cur.version === 'number' ? cur.version : v + 1;
  }
  const base = createDefaultProfile();
  const merged = { ...base, ...cur, equipment: { ...base.equipment, ...(cur.equipment as object | undefined) } } as Profile;
  return fitProfile(merged);
}

export const DEFAULT_ERA_ID = DEFAULT_ERA;
