/**
 * 槍械配件（純資料）：配件槽、配件物品、各武器的相容表、數值修正。
 * 數值全部寫在這裡；效果的計算見 combat/WeaponMods.ts，說明見 docs/DESIGN.md「槍械配件」。
 */
import type { ItemDef } from './types';

export type ModSlot = 'sight' | 'muzzle' | 'grip' | 'mag' | 'tactical';
export const MOD_SLOTS: ModSlot[] = ['sight', 'muzzle', 'grip', 'mag', 'tactical'];
export const MOD_SLOT_NAMES: Record<ModSlot, string> = { sight: '瞄具', muzzle: '槍口', grip: '握把', mag: '彈匣', tactical: '戰術' };

/** 武器上安裝的配件：槽位 → 配件物品 id（沒裝的槽位省略）。可序列化，放在 ItemStack.mods */
export type WeaponMods = Partial<Record<ModSlot, string>>;

/** 瞄具種類：iron = 武器本身的機械瞄具（沒裝瞄具） */
export type SightKind = 'iron' | 'reddot' | 'holo' | 'scope';

/** 配件的數值修正。乘數 1 = 不變；省略 = 不變 */
export interface ModEffect {
  /** 後座力（WeaponStats.recoil）倍率 */
  recoil?: number;
  /** 腰射散佈倍率 */
  spreadHip?: number;
  /** 瞄準散佈倍率 */
  spreadAds?: number;
  /** 進入瞄準所需時間倍率（大 = 慢） */
  adsTime?: number;
  /** 瞄準時移動速度倍率（小 = 更慢） */
  adsMove?: number;
  /** 彈匣容量倍率（無條件進位） */
  magazine?: number;
  /** 換彈時間倍率 */
  reloadTime?: number;
  /** 傷害倍率 */
  damage?: number;
  /** 有效射程倍率 */
  range?: number;
  /** 槍聲距離倍率（接 data/noise.ts 的 loudness） */
  noise?: number;
  /** 槍口火光大小倍率 */
  flash?: number;
  /** 瞄準時額外增加的視野（度）；全息比較開闊 */
  adsFovAdd?: number;
}

export interface AttachmentDef {
  id: string;
  slot: ModSlot;
  sight?: SightKind;
  /** 倍鏡的瞄準視野（度，垂直）；僅 sight = 'scope' */
  scopeFov?: number;
  /** 倍鏡的放大倍率（顯示用） */
  zoom?: number;
  effect: ModEffect;
  /** 手電筒 / 雷射：可以用 T 開關 */
  tactical?: 'flashlight' | 'laser';
  /** 一句話的優缺點（物品說明與改槍台用） */
  pros: string[];
  cons: string[];
}

export const ATTACHMENTS: Record<string, AttachmentDef> = {
  att_reddot: {
    id: 'att_reddot', slot: 'sight', sight: 'reddot',
    effect: { spreadAds: 0.85, adsTime: 1.06 },
    pros: ['瞄準時散佈 -15%', '紅點對準即可'], cons: ['瞄準速度略慢'],
  },
  att_holo: {
    id: 'att_holo', slot: 'sight', sight: 'holo',
    effect: { spreadAds: 0.8, adsTime: 1.1, adsFovAdd: 6 },
    pros: ['瞄準時散佈 -20%', '瞄準視野較開闊'], cons: ['瞄準速度略慢'],
  },
  att_scope2x: {
    id: 'att_scope2x', slot: 'sight', sight: 'scope', scopeFov: 30, zoom: 2,
    effect: { spreadAds: 0.9, adsTime: 1.28, adsMove: 0.85 },
    pros: ['2 倍放大', '瞄準時散佈 -10%'], cons: ['瞄準速度明顯變慢', '瞄準時移動更慢'],
  },
  att_scope4x: {
    id: 'att_scope4x', slot: 'sight', sight: 'scope', scopeFov: 15, zoom: 4,
    effect: { spreadAds: 0.8, adsTime: 1.5, adsMove: 0.7, spreadHip: 1.1 },
    pros: ['4 倍放大', '瞄準時散佈 -20%'], cons: ['瞄準速度明顯變慢', '瞄準時移動更慢', '腰射散佈 +10%'],
  },
  att_suppressor: {
    id: 'att_suppressor', slot: 'muzzle',
    effect: { noise: 0.25, flash: 0.35, damage: 0.95, range: 0.9 },
    pros: ['槍聲範圍 ×0.25', '槍口火光很小', '敵人難以判斷槍聲位置'], cons: ['傷害 -5%', '射程 -10%'],
  },
  att_brake: {
    id: 'att_brake', slot: 'muzzle',
    effect: { recoil: 0.8, noise: 1.1, flash: 1.2 },
    pros: ['後座力 -20%'], cons: ['槍聲範圍 +10%', '火光較大'],
  },
  att_grip: {
    id: 'att_grip', slot: 'grip',
    effect: { recoil: 0.9, spreadHip: 0.9 },
    pros: ['後座力 -10%', '腰射散佈 -10%'], cons: [],
  },
  att_extmag: {
    id: 'att_extmag', slot: 'mag',
    effect: { magazine: 1.5, reloadTime: 1.12 },
    pros: ['彈匣容量 ×1.5'], cons: ['換彈時間 +12%', '重量增加'],
  },
  att_laser: {
    id: 'att_laser', slot: 'tactical', tactical: 'laser',
    effect: {},
    pros: ['開啟時腰射散佈 -25%'], cons: ['敵人看得到雷射光'],
  },
  att_flashlight: {
    id: 'att_flashlight', slot: 'tactical', tactical: 'flashlight',
    effect: {},
    pros: ['照亮前方', '暗處（隧道、倉庫）很有用'], cons: ['敵人更容易發現開燈的你'],
  },
};

/** 戰術裝備開啟時的額外效果（雷射的腰射散佈、敵人的視覺判定） */
export const LASER_HIP_SPREAD = 0.75;
export const TACTICAL_VISION = {
  /** 手電筒：玩家所在位置的亮度往 1 拉近的比例（越暗效果越大） */
  flashlightLight: 0.9,
  /** 手電筒：敵人的視距倍率 = 1 + 這個值 ×（1 - 亮度） */
  flashlightRange: 0.35,
  /** 手電筒：發現值增加倍率 = 1 + 這個值 ×（1 - 亮度） */
  flashlightGain: 0.6,
  /** 雷射：敵人的發現值倍率與視距倍率（光束在任何亮度都看得到） */
  laserGain: 1.3,
  laserRange: 1.1,
};

const ATT_ITEMS: [string, string, string, number, number, ItemDef['rarity'], string, string][] = [
  // id, 名稱, 說明, 重量, 基準價, 稀有度, glyph, 顏色
  ['att_reddot', 'RD-1 紅點瞄準鏡', '低調的反射式瞄具，紅點永遠對準彈著點。', 0.15, 900, 'uncommon', '◉', '#f87171'],
  ['att_holo', 'HX-3 全息瞄準鏡', '全息圓圈與中心點，視野開闊、近中距離很順手。', 0.25, 1500, 'rare', '◎', '#fb7185'],
  ['att_scope2x', 'SC-2 二倍鏡', '2 倍放大的光學瞄準鏡，瞄準時畫面放大。', 0.4, 2200, 'rare', '⌖', '#38bdf8'],
  ['att_scope4x', 'SC-4 四倍鏡', '4 倍放大的遠距瞄準鏡，附刻度十字線。拉槍慢、移動更慢。', 0.6, 3400, 'epic', '⌖', '#c084fc'],
  ['att_suppressor', 'SP-9 滅音器', '大幅壓低槍聲，敵人只能大概判斷方向；傷害與射程略降。', 0.4, 2800, 'rare', '▬', '#94a3b8'],
  ['att_brake', 'MB-2 制退器', '導出火藥氣體抵銷後座力，代價是槍聲更大。', 0.2, 700, 'uncommon', '▤', '#fbbf24'],
  ['att_grip', 'VG-1 垂直握把', '穩住槍身：後座力與腰射散佈都小一點。', 0.25, 600, 'common', '▮', '#9aa5b1'],
  ['att_extmag', 'XM-5 擴容彈匣', '彈匣容量增加一半，換彈稍慢、槍變重。', 0.3, 1000, 'uncommon', '▯', '#4ade80'],
  ['att_laser', 'LZ-1 雷射指示器', '紅色雷射光束讓腰射更準，但敵人也看得到光束。', 0.1, 900, 'uncommon', '·', '#ef4444'],
  ['att_flashlight', 'FL-2 戰術手電筒', '可開關的聚光燈（T 鍵）。暗處看得清楚，也更容易被發現。', 0.2, 500, 'common', '☼', '#fde68a'],
];

export const ATTACHMENT_ITEMS: ItemDef[] = ATT_ITEMS.map(([id, name, desc, weight, price, rarity, glyph, color]) => ({
  id, name, desc, category: 'attachment', weight, maxStack: 1, priceFuture: price, rarity, icon: { glyph, color },
}));

// ---------------------------------------------------------------- 相容表
/** 各武器每個槽位可以裝的配件（沒列出的槽位 = 不能裝） */
export const MOD_COMPAT: Record<string, Partial<Record<ModSlot, string[]>>> = {
  pistol: {
    sight: ['att_reddot', 'att_holo'],
    muzzle: ['att_suppressor'],
    mag: ['att_extmag'],
    tactical: ['att_laser', 'att_flashlight'],
  },
  smg: {
    sight: ['att_reddot', 'att_holo', 'att_scope2x'],
    muzzle: ['att_suppressor', 'att_brake'],
    grip: ['att_grip'],
    mag: ['att_extmag'],
    tactical: ['att_laser', 'att_flashlight'],
  },
  rifle: {
    sight: ['att_reddot', 'att_holo', 'att_scope2x', 'att_scope4x'],
    muzzle: ['att_suppressor', 'att_brake'],
    grip: ['att_grip'],
    mag: ['att_extmag'],
    tactical: ['att_laser', 'att_flashlight'],
  },
  shotgun: {
    sight: ['att_reddot', 'att_holo', 'att_scope2x'],
    muzzle: ['att_brake'],
    grip: ['att_grip'],
    tactical: ['att_laser', 'att_flashlight'],
  },
};

export const isAttachment = (id: string): boolean => id in ATTACHMENTS;
export const attachmentOf = (id: string | undefined): AttachmentDef | undefined => (id ? ATTACHMENTS[id] : undefined);

/** 這把武器的這個槽位可以裝哪些配件 */
export function compatibleMods(weaponId: string, slot: ModSlot): string[] {
  return MOD_COMPAT[weaponId]?.[slot] ?? [];
}

/** 配件能不能裝在這把武器上（槽位由配件決定） */
export function canMount(weaponId: string, attId: string): boolean {
  const a = ATTACHMENTS[attId];
  return !!a && compatibleMods(weaponId, a.slot).includes(attId);
}

/** 這把武器有哪些槽位可以裝配件 */
export function mountableSlots(weaponId: string): ModSlot[] {
  return MOD_SLOTS.filter((s) => compatibleMods(weaponId, s).length > 0);
}

/** 清理存檔裡的 mods：只保留這把武器真的裝得上的配件；全空回傳 undefined */
export function cleanMods(weaponId: string, raw: unknown): WeaponMods | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: WeaponMods = {};
  for (const s of MOD_SLOTS) {
    const id = (raw as Record<string, unknown>)[s];
    if (typeof id === 'string' && ATTACHMENTS[id]?.slot === s && canMount(weaponId, id)) out[s] = id;
  }
  return Object.keys(out).length ? out : undefined;
}

export const modIds = (mods: WeaponMods | undefined): string[] =>
  mods ? MOD_SLOTS.map((s) => mods[s]).filter((x): x is string => !!x) : [];
