/**
 * 陀螺儀角速度 → 視角增量（純函式，方便測試）。
 *
 * devicemotion 的 rotationRate（度/秒）：beta 繞裝置 x 軸（直向時的右方）、gamma 繞 y 軸（直向時的上方）。
 * 螢幕旋轉角 angle（screen.orientation.angle）：
 *   0 直向、90 橫向（landscape-primary，裝置頂端朝左）、180 倒直向、270 橫向（landscape-secondary，頂端朝右）。
 * 把角速度換成「繞螢幕右方」與「繞螢幕上方」的分量，再對應到 Input 的視角增量（x 往右為正、y 往下為正）：
 *   繞螢幕上方逆時針 = 向左轉；繞螢幕右方正向 = 抬頭。
 */
export interface RotationRate { alpha?: number | null; beta?: number | null; gamma?: number | null }

export interface GyroTuning {
  sens: number;
  invertX: boolean;
  invertY: boolean;
}

const DEG = Math.PI / 180;
/** 死區（度/秒）：手抖與感測器零偏 */
export const GYRO_DEADZONE = 1.2;
/** 單次增量上限（度/秒對應的），避免異常尖峰 */
const MAX_RATE = 720;

export const normalizeAngle = (a: number): 0 | 90 | 180 | 270 => {
  const n = ((Math.round(a / 90) * 90) % 360 + 360) % 360;
  return n as 0 | 90 | 180 | 270;
};

/** 角速度分量：螢幕右方 / 螢幕上方（度/秒） */
export function toScreenAxes(rate: RotationRate, angle: number): { right: number; up: number } {
  const b = rate.beta ?? 0;
  const g = rate.gamma ?? 0;
  switch (normalizeAngle(angle)) {
    case 90: return { right: -g, up: b };
    case 180: return { right: -b, up: -g };
    case 270: return { right: g, up: -b };
    default: return { right: b, up: g };
  }
}

const dead = (v: number): number => {
  const a = Math.abs(v);
  if (a <= GYRO_DEADZONE) return 0;
  return Math.sign(v) * (Math.min(a, MAX_RATE) - GYRO_DEADZONE);
};

/** 回傳這一段時間（dt 秒）的視角增量（弧度）。已含死區；平滑化由呼叫端先對 rate 做。 */
export function gyroLook(rate: RotationRate, angle: number, dt: number, t: GyroTuning): { dx: number; dy: number } {
  const { right, up } = toScreenAxes(rate, angle);
  let dx = -dead(up) * DEG * dt * t.sens;
  let dy = -dead(right) * DEG * dt * t.sens;
  if (t.invertX) dx = -dx;
  if (t.invertY) dy = -dy;
  return { dx, dy };
}

/** 指數平滑（alpha 0..1，越大越跟手） */
export const smooth = (prev: number, next: number, alpha: number): number => prev + (next - prev) * alpha;
