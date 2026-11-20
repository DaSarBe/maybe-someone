import { OCCLUDED_GAIN, OCCLUDED_LOWPASS, VERTICAL_DIST, VERTICAL_GAIN, VERTICAL_LOWPASS, VERTICAL_WET, distanceGain, isFootLevel, noiseRange, type NoiseEvent, type Vec3 } from '../data/noise';

/** 兩點之間沒有牆壁 / 貨櫃擋住（Octree raycast）；回傳 false = 被擋住 */
export type LineOfSight = (from: Vec3, to: Vec3) => boolean;

/** 腳底聲源抬高多少再做遮擋判定（避免射線從地板底下出發） */
export const FOOT_LIFT = 0.9;

export interface Heard {
  /** 聲源到耳朵的直線距離 */
  dist: number;
  range: number;
  /** 只考慮距離的音量 0..1 */
  distGain: number;
  /** 最終音量 0..1（距離 × 遮擋 × 樓層） */
  gain: number;
  /** 除了距離以外的增益（遮擋、樓層）：音效系統把它乘在 GainNode 上 */
  extraGain: number;
  occluded: boolean;
  vertical: boolean;
  /** 需要的低通截止頻率（Hz）；null = 不需要 */
  lowpass: number | null;
  /** 額外送進殘響的比例 */
  wetBoost: number;
  audible: boolean;
}

export function assessHearing(listener: Vec3, ev: Pick<NoiseEvent, 'kind' | 'position' | 'surface' | 'weaponId' | 'fallSpeed' | 'loudness'>, los: LineOfSight | null): Heard {
  const range = noiseRange(ev);
  const src: Vec3 = { x: ev.position.x, y: ev.position.y + (isFootLevel(ev.kind) ? FOOT_LIFT : 0), z: ev.position.z };
  const dist = Math.hypot(src.x - listener.x, src.y - listener.y, src.z - listener.z);
  const dg = distanceGain(dist, range);
  if (dg <= 0) {
    return { dist, range, distGain: 0, gain: 0, extraGain: 1, occluded: false, vertical: false, lowpass: null, wetBoost: 0, audible: false };
  }
  const occluded = los ? !los(src, listener) : false;
  const vertical = Math.abs(src.y - listener.y) > VERTICAL_DIST;
  let extra = 1;
  let lowpass: number | null = null;
  let wet = 0;
  if (occluded) { extra *= OCCLUDED_GAIN; lowpass = OCCLUDED_LOWPASS; }
  if (vertical) { extra *= VERTICAL_GAIN; lowpass = Math.min(lowpass ?? Infinity, VERTICAL_LOWPASS); wet = VERTICAL_WET; }
  const gain = dg * extra;
  return { dist, range, distGain: dg, gain, extraGain: extra, occluded, vertical, lowpass, wetBoost: wet, audible: gain > 0.002 };
}

/**
 * 聲源相對聽者視線的水平角度（弧度）：0 = 正前方，+π/2 = 右邊，-π/2 = 左邊，±π = 正後方。
 * yaw 沿用玩家控制器的慣例（forward = (-sin yaw, -cos yaw)，right = (cos yaw, -sin yaw)）。
 */
export function relativeBearing(listener: Vec3, yaw: number, src: Vec3): number {
  const dx = src.x - listener.x, dz = src.z - listener.z;
  const fwd = -Math.sin(yaw) * dx - Math.cos(yaw) * dz;
  const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  return Math.atan2(right, fwd);
}
