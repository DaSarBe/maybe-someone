import { VERTICAL_DIST, isFootLevel, isStepKind, type NoiseKind, type Vec3 } from '../data/noise';
import { FOOT_LIFT, relativeBearing } from '../audio/Hearing';

/** 腳步（白）、槍聲（紅，比較大）、其他動作（黃） */
export type NoiseClass = 'step' | 'shot' | 'other';

export const MAX_ARCS = 8;
/** 同方向（夾角在這個範圍內，度）的聲音合併成一個弧形 */
export const MERGE_DEG = 16;
/** 低於這個「聽到的音量」就不顯示 */
export const MIN_GAIN = 0.02;

export const NOISE_COLOR: Record<NoiseClass, string> = { step: '#ffffff', shot: '#ff3b30', other: '#ffd23f' };
const PRIORITY: Record<NoiseClass, number> = { step: 0, other: 1, shot: 2 };

export function classOf(kind: NoiseKind): NoiseClass {
  if (kind === 'shot') return 'shot';
  if (isStepKind(kind) || kind === 'land') return 'step';
  return 'other';
}

export interface Arc {
  cls: NoiseClass;
  /** 目前相對視線的角度（弧度）：0 = 上（正前方）、順時針為正、±π = 下（正後方） */
  angle: number;
  /** 聽到的音量 0..1（已考慮距離與遮擋） */
  gain: number;
  age: number;
  life: number;
  /** 聲源比耳朵高（1）或低（-1）超過 2.5m：畫小箭頭 */
  vertical: -1 | 0 | 1;
  /** 聲源位置：視角轉動時弧形跟著轉 */
  pos: Vec3;
}

/** 顯示時間（秒）：0.6～1.2，越大聲越久，槍聲最久 */
export function arcLife(cls: NoiseClass, gain: number): number {
  return cls === 'shot' ? 1.2 : Math.min(1.1, 0.6 + 0.45 * Math.min(1, gain) + (cls === 'other' ? 0.1 : 0));
}
/** 弧形寬度（度）：越大聲越寬，槍聲比較大 */
export function arcWidthDeg(cls: NoiseClass, gain: number): number {
  const base = 14 + 26 * Math.min(1, gain);
  return cls === 'shot' ? base * 1.45 : base;
}
/** 目前透明度：依音量決定起始值，隨時間淡出 */
export function arcAlpha(a: Arc): number {
  return (0.28 + 0.72 * Math.min(1, a.gain)) * Math.max(0, 1 - a.age / a.life);
}

const angDiff = (a: number, b: number): number => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
};

export function verticalOf(ear: Vec3, kind: NoiseKind, pos: Vec3): -1 | 0 | 1 {
  const dy = pos.y + (isFootLevel(kind) ? FOOT_LIFT : 0) - ear.y;
  return dy > VERTICAL_DIST ? 1 : dy < -VERTICAL_DIST ? -1 : 0;
}

/** 聲音視覺提示的資料層（純邏輯，不碰 DOM）：合併同方向、限制數量、淡出 */
export class NoiseIndicatorModel {
  readonly arcs: Arc[] = [];

  /** 加入一個「聽得到的」別人的聲音。ear / yaw 是聽者的位置與朝向（弧度，玩家控制器的慣例） */
  add(ear: Vec3, yaw: number, kind: NoiseKind, pos: Vec3, gain: number): void {
    if (gain < MIN_GAIN) return;
    const cls = classOf(kind);
    const angle = relativeBearing(ear, yaw, pos);
    const vertical = verticalOf(ear, kind, pos);
    const near = this.arcs.find((a) => angDiff(a.angle, angle) <= (MERGE_DEG * Math.PI) / 180);
    if (near) {
      if (PRIORITY[cls] >= PRIORITY[near.cls]) near.cls = cls;
      near.gain = Math.max(near.gain * Math.max(0, 1 - near.age / near.life), gain);
      near.age = 0;
      near.life = Math.max(arcLife(near.cls, near.gain), arcLife(cls, gain));
      near.angle = angle;
      near.pos = { x: pos.x, y: pos.y, z: pos.z };
      near.vertical = vertical || near.vertical;
      return;
    }
    const arc: Arc = { cls, angle, gain, age: 0, life: arcLife(cls, gain), vertical, pos: { x: pos.x, y: pos.y, z: pos.z } };
    if (this.arcs.length >= MAX_ARCS) {
      // 最多同時 8 個：擠掉最淡的
      let worst = 0;
      for (let i = 1; i < this.arcs.length; i++) if (arcAlpha(this.arcs[i]) < arcAlpha(this.arcs[worst])) worst = i;
      this.arcs.splice(worst, 1);
    }
    this.arcs.push(arc);
  }

  /** 推進時間並依目前視角重新計算角度 */
  update(dt: number, ear: Vec3, yaw: number): void {
    for (const a of this.arcs) {
      a.age += dt;
      a.angle = relativeBearing(ear, yaw, a.pos);
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) if (this.arcs[i].age >= this.arcs[i].life) this.arcs.splice(i, 1);
  }

  clear(): void { this.arcs.length = 0; }
}
