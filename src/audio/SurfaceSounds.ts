import type * as THREE from 'three';
import type { StepIntensity } from '../core/EventBus';
import type { Surface } from '../world/Surface';
import type { SoundPlayer } from './types';

/** 腳步強度 → 音量 */
export const STEP_VOLUME: Record<StepIntensity, number> = { crouch: 0.35, walk: 0.7, sprint: 1.0 };
/** 蹲下時的低通截止頻率（Hz），讓聲音更悶；其他強度不加 */
const CROUCH_LOWPASS = 1600;

const PITCH_JITTER = 0.06;  // ±6%
const VOLUME_JITTER = 0.10; // ±10%

/** surface → 腳步音庫（音庫由 manifest 素材或程式合成提供，這裡不關心來源） */
export const FOOTSTEP_BANKS: Record<Surface, string> = {
  concrete: 'footsteps.concrete',
  metal: 'footsteps.metal',
  wood: 'footsteps.wood',
  grass: 'footsteps.grass',
  gravel: 'footsteps.gravel',
  dirt: 'footsteps.dirt',
  water: 'footsteps.water',
  tile: 'footsteps.tile',
  carpet: 'footsteps.carpet',
  sand: 'footsteps.sand',
};

interface ImpactProfile { bank: string; volume: number; rate: number; lowpass?: number }

/** surface → 子彈命中音庫與調整（沒有專屬素材的材質用通用命中音調低、調悶來區分） */
export const IMPACT_PROFILES: Record<Surface, ImpactProfile> = {
  concrete: { bank: 'impacts.concrete', volume: 1, rate: 1 },
  tile: { bank: 'impacts.concrete', volume: 0.9, rate: 1.25 },
  metal: { bank: 'impacts.metal', volume: 1, rate: 1 },
  wood: { bank: 'impacts.wood', volume: 1, rate: 1 },
  grass: { bank: 'impacts.generic', volume: 0.5, rate: 0.8, lowpass: 1400 },
  dirt: { bank: 'impacts.generic', volume: 0.55, rate: 0.75, lowpass: 1200 },
  sand: { bank: 'impacts.generic', volume: 0.5, rate: 0.85, lowpass: 1800 },
  gravel: { bank: 'impacts.generic', volume: 0.7, rate: 1.1, lowpass: 5000 },
  carpet: { bank: 'impacts.flesh', volume: 0.5, rate: 0.9, lowpass: 1500 },
  water: { bank: 'impacts.generic', volume: 0.6, rate: 0.7, lowpass: 900 },
};

const rand = (amount: number): number => 1 + (Math.random() * 2 - 1) * amount;

/** 腳步、落地、命中的音效變化邏輯 */
export class SurfaceSounds {
  constructor(private player: SoundPlayer) {}

  footstep(surface: Surface, intensity: StepIntensity, position?: THREE.Vector3): void {
    this.player.play({
      key: FOOTSTEP_BANKS[surface],
      volume: STEP_VOLUME[intensity] * rand(VOLUME_JITTER),
      rate: rand(PITCH_JITTER),
      lowpass: intensity === 'crouch' ? CROUCH_LOWPASS : undefined,
      position,
      wet: 0.55,
      refDistance: 2,
      tag: `step ${surface}/${intensity}`,
    });
  }

  /** 落地：fallSpeed 越大越大聲、音高越低；重落地多疊一聲低沉悶響 */
  land(surface: Surface, fallSpeed: number, position?: THREE.Vector3): void {
    const t = Math.min(1, Math.max(0, (fallSpeed - 2) / 9));
    this.player.play({
      key: FOOTSTEP_BANKS[surface],
      volume: (0.55 + 0.45 * t) * rand(VOLUME_JITTER),
      rate: (1 - 0.2 * t) * rand(PITCH_JITTER),
      lowpass: 4000 - 2200 * t,
      position,
      wet: 0.6,
      refDistance: 2,
      tag: `land ${surface} v=${fallSpeed.toFixed(1)}`,
    });
    if (fallSpeed > 5.5) {
      const h = Math.min(1, (fallSpeed - 5.5) / 6);
      this.player.play({
        key: 'land.thump',
        volume: (0.4 + 0.6 * h) * rand(VOLUME_JITTER),
        rate: (1 - 0.15 * h) * rand(PITCH_JITTER),
        position,
        wet: 0.7,
        refDistance: 2,
        tag: 'land thump',
      });
    }
  }

  /** 子彈命中：依命中物材質選音庫，有空間定位 */
  impact(surface: Surface, position: THREE.Vector3): void {
    const p = IMPACT_PROFILES[surface];
    this.player.play({
      key: this.player.has(p.bank) ? p.bank : 'impacts.generic',
      volume: p.volume * rand(VOLUME_JITTER),
      rate: p.rate * rand(PITCH_JITTER),
      lowpass: p.lowpass,
      position,
      wet: 0.6,
      refDistance: 3,
      tag: `impact ${surface}`,
    });
  }
}
