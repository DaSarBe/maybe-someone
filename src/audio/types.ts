import type * as THREE from 'three';
import type { ReverbType } from '../world/Surface';

export type SoundGroup = 'sfx' | 'ui';

/** 一次播放的完整參數（音量與音高的隨機變化由呼叫端決定） */
export interface PlayOpts {
  /** 音庫名稱，例如 'footsteps.metal'、'weapons.pistol_fire' */
  key: string;
  volume?: number;
  rate?: number;
  /** 低通濾波截止頻率（Hz），用來讓聲音更悶 */
  lowpass?: number;
  /** 高頻擱架濾波（3.5kHz 以上增減的 dB）：正值 = 更亮更脆（衝鋒槍） */
  highshelf?: number;
  /** 延遲幾秒後才開始播放（彈殼落地、霰彈槍上膛） */
  delay?: number;
  /** 世界座標；沒有或離聽者很近（本機玩家）時為非空間音 */
  position?: THREE.Vector3;
  group?: SoundGroup;
  /** 送進殘響的比例（0 = 完全乾聲） */
  wet?: number;
  /** 聲源所在的回音區；有指定就用該區的殘響，否則用聽者所在區 */
  sourceZone?: ReverbType;
  /** 空間音的參考距離（越大越遠才開始衰減） */
  refDistance?: number;
  /** 聲音事件的「聽得到的距離」（公尺）：有的話音量依 distanceGain 曲線衰減，超過就完全不播放 */
  range?: number;
  /** 額外的音量倍率（牆壁遮擋、樓層造成的衰減） */
  gainMul?: number;
  /** 額外送進殘響的比例（上下樓層的回音） */
  wetBoost?: number;
  /** 指定變化編號；不指定則隨機且避免連續重複 */
  variant?: number;
  /** 除錯紀錄用標籤 */
  tag?: string;
}

/** SurfaceSounds 等模組使用的最小播放介面 */
export interface SoundPlayer {
  has(key: string): boolean;
  play(opts: PlayOpts): void;
}

export type BankSource = 'asset' | 'synth';

export interface PlayRecord {
  t: number;
  key: string;
  source: BankSource;
  variant: number;
  name: string;
  volume: number;
  rate: number;
  lowpass: number | null;
  positional: boolean;
  wet: number;
  zone: string;
  highshelf?: number | null;
  delay?: number;
  tag?: string;
  /** 定位音源的資訊（除錯用）：聲源座標、距離、最終音量、是否被遮擋、相對耳朵的方位角（0 前、+90 右、-90 左） */
  pos?: { x: number; y: number; z: number };
  dist?: number;
  range?: number;
  gain?: number;
  occluded?: boolean;
  azimuth?: number;
}
