/**
 * 聲音事件（noise）的資料表：「做任何事都有聲音，依距離遠近變大聲或變小聲」。
 *
 * 玩家聽 NPC 與 NPC 聽玩家使用同一張表（聽得到的距離），音效系統、敵人聽覺、聲音視覺提示都只讀這裡。
 * 純資料與純函式（不依賴 three.js 或瀏覽器），第二階段可直接搬到伺服器。
 *
 * noise 事件的 payload 全部是可序列化的原始型別（座標是 {x,y,z}、source 是字串 id），
 * 連線時伺服器可以直接廣播，每個客戶端各自用同一張表決定「我聽不聽得到」。
 */
import type { Surface } from '../world/Surface';

export interface Vec3 { x: number; y: number; z: number }

export type StepIntensity = 'crouch' | 'crouch_run' | 'walk' | 'sprint';

export type NoiseKind =
  | 'footstep_sprint' | 'footstep_walk' | 'footstep_crouch' | 'footstep_crouch_run'
  | 'land' | 'shot' | 'reload' | 'weapon_swap' | 'dry_fire' | 'pump'
  | 'heal' | 'search' | 'item_pickup' | 'item_drop' | 'armor_equip' | 'trade' | 'evac'
  | 'hurt' | 'death' | 'alert' | 'helmet_ping';

export interface NoiseEvent {
  kind: NoiseKind;
  /** 聲源的世界座標。腳步與落地在腳底，其餘在手部或槍口高度 */
  position: Vec3;
  /** 發出者：'player'（本機玩家）、敵人 id（'e3'）；第二階段是其他玩家的 id */
  source: string;
  /** 腳下材質（腳步、落地、彈殼） */
  surface?: Surface;
  /** 距離倍率（預設 1；之後滅音器可設 0.3） */
  loudness?: number;
  weaponId?: string;
  /** 落地的下落速度（m/s） */
  fallSpeed?: number;
  /** 換彈的階段：0 卸彈匣、1 插彈匣、2 拉槍機 */
  stage?: 0 | 1 | 2;
  /** 開槍方向（彈殼落地位置用） */
  direction?: Vec3;
  /** 治療品種類（'bandage' 撕繃帶、其他 = 注射） */
  item?: string;
}

/** 聽得到的距離（公尺）。0 = 完全無聲。land 與 shot 的實際值依下落速度與武器而定，見 noiseRange */
export const NOISE_RANGE: Record<NoiseKind, number> = {
  footstep_sprint: 30,
  footstep_walk: 18,
  footstep_crouch: 0,       // 蹲走：完全無聲
  footstep_crouch_run: 8,
  land: 20,                 // 15～25
  shot: 100,                // 80～120（依武器）
  reload: 10,
  weapon_swap: 8,
  dry_fire: 6,
  pump: 10,                 // 霰彈槍上膛（表外補充：和換彈同級）
  heal: 8,
  search: 12,
  item_pickup: 6,
  item_drop: 6,
  armor_equip: 6,
  trade: 8,
  evac: 40,
  hurt: 20,
  death: 20,
  helmet_ping: 15,          // 子彈打在頭盔上的金屬「叮」（表外補充）
  alert: 20,                // 敵人發現玩家的喊叫（表外補充：和悶哼同級）
};

/** 安靜搜刮：搜刮聲音的距離倍率（12m → 6m）。聽得到的距離規則仍只由 noiseRange 計算，這裡只提供 loudness */
export const QUIET_SEARCH_LOUDNESS = 0.5;
export const searchLoudness = (quiet: boolean): number => (quiet ? QUIET_SEARCH_LOUDNESS : 1);

/** 各武器槍聲的距離 */
export const SHOT_RANGE: Record<string, number> = { pistol: 80, smg: 90, shotgun: 100, rifle: 120 };
export const DEFAULT_SHOT_RANGE = 100;
export const LAND_RANGE: [number, number] = [15, 25];

/** 地面材質的響度倍率（只乘在腳步上）：金屬最吵，草地、沙、地毯很安靜 */
export const SURFACE_LOUDNESS: Record<Surface, number> = {
  metal_hollow: 1.8, metal_grate: 1.6, metal: 1.5, gravel: 1.35, wood: 1.2, water: 1.25, tile: 1.1,
  concrete: 1.0, dirt: 0.8, grass: 0.6, sand: 0.55, carpet: 0.45,
};

export const stepKind = (i: StepIntensity): NoiseKind => `footstep_${i}` as NoiseKind;
export const isStepKind = (k: NoiseKind): boolean => k.startsWith('footstep_');
/** 聲源在腳底（要抬高再做牆壁遮擋判定） */
export const isFootLevel = (k: NoiseKind): boolean => isStepKind(k) || k === 'land';

/** 落地：下落越快越遠（15～25m） */
export function landRange(fallSpeed: number): number {
  const t = Math.min(1, Math.max(0, (fallSpeed - 2) / 9));
  return LAND_RANGE[0] + (LAND_RANGE[1] - LAND_RANGE[0]) * t;
}

/** 一個 noise 事件實際聽得到的距離（公尺）。腳步乘地面材質係數 */
export function noiseRange(e: Pick<NoiseEvent, 'kind' | 'surface' | 'weaponId' | 'fallSpeed' | 'loudness'>): number {
  let r = NOISE_RANGE[e.kind];
  if (e.kind === 'shot') r = SHOT_RANGE[e.weaponId ?? ''] ?? DEFAULT_SHOT_RANGE;
  else if (e.kind === 'land') r = landRange(e.fallSpeed ?? 4);
  else if (isStepKind(e.kind)) r *= SURFACE_LOUDNESS[e.surface ?? 'concrete'] ?? 1;
  return r * (e.loudness ?? 1);
}

// ---------------------------------------------------------------- 衰減
/** 在這個距離內音量全開（公尺） */
export const REF_DISTANCE = 2.5;
/** 衰減曲線的指數：1 = 線性，大於 1 = 越近衰減越快（聽感比較自然） */
export const ROLLOFF_POWER = 1.5;

/**
 * 距離 → 音量（0..1）。refDistance 內全開，到 range 時剛好降到 0（超過一律 0，不像 inverse 永遠有一點聲音）。
 * 音效系統（GainNode）、敵人聽覺機率與聲音視覺提示共用這一條曲線。
 */
export function distanceGain(dist: number, range: number, ref = REF_DISTANCE): number {
  if (range <= 0) return 0;
  if (dist >= range) return 0;
  if (dist <= ref || range <= ref) return 1;
  return Math.pow(1 - (dist - ref) / (range - ref), ROLLOFF_POWER);
}

/** 牆壁 / 貨櫃遮擋：降低約 8dB（×0.4）並低通到 1000Hz */
export const OCCLUDED_GAIN = Math.pow(10, -8 / 20);
export const OCCLUDED_LOWPASS = 1000;
/** 上下樓層（高低差超過這個值）：稍微悶一點、多一點回音 */
export const VERTICAL_DIST = 2.5;
export const VERTICAL_GAIN = 0.88;
export const VERTICAL_LOWPASS = 3200;
export const VERTICAL_WET = 0.3;
/** 持續型聲音（搜刮、撤離嗡嗡聲）更新遮擋與音量的間隔（秒） */
export const SUSTAINED_UPDATE = 0.25;
/** 持續型聲音：製造者每隔這麼久送一次「心跳」noise；超過 SUSTAINED_TIMEOUT 沒收到就停止 */
export const SUSTAINED_BEAT = 0.5;
export const SUSTAINED_TIMEOUT = 1.0;
export const isSustained = (k: NoiseKind): boolean => k === 'search' || k === 'evac';
