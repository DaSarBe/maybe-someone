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
  /** 世界座標；沒有或離聽者很近（本機玩家）時為非空間音 */
  position?: THREE.Vector3;
  group?: SoundGroup;
  /** 送進殘響的比例（0 = 完全乾聲） */
  wet?: number;
  /** 聲源所在的回音區；有指定就用該區的殘響，否則用聽者所在區 */
  sourceZone?: ReverbType;
  /** 空間音的參考距離（越大越遠才開始衰減） */
  refDistance?: number;
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
  tag?: string;
}
