/** 挑釁判定（純函式）：中立 / 友好的 NPC 在本場 Raid 中被激怒的條件。 */

/** 準心停在他身上超過這個秒數先警告（「！」+ alert 聲），超過 AIM_HOSTILE_SEC 就翻臉 */
export const AIM_WARN_SEC = 1.0;
export const AIM_HOSTILE_SEC = 2.0;
/** 瞄準挑釁的有效距離（公尺） */
export const AIM_RANGE = 15;
/** 在他這麼近的距離內開槍 = 挑釁（公尺） */
export const SHOT_NEAR_RANGE = 2;
/** 準心移開後，瞄準計時每秒倒退的倍率 */
export const AIM_DECAY = 2;

export interface AimState { t: number; warned: boolean }
export type AimEvent = 'none' | 'warn' | 'hostile';

/** 開槍的位置離 NPC 在 2m 內（含 2m）就算挑釁 */
export const shotProvokes = (dist: number): boolean => dist <= SHOT_NEAR_RANGE;

/**
 * 推進瞄準計時：準心落在 NPC 身上且距離 ≤ 15m 才累積（腰射或瞄準都算）；移開就倒退。
 * 回傳這一步剛好跨過的門檻：warn（第一次到 1 秒）、hostile（到 2 秒）。
 */
export function stepAim(s: AimState, dt: number, aimed: boolean, dist: number): AimEvent {
  if (aimed && dist <= AIM_RANGE) {
    s.t += dt;
    if (s.t >= AIM_HOSTILE_SEC) return 'hostile';
    if (s.t >= AIM_WARN_SEC && !s.warned) { s.warned = true; return 'warn'; }
    return 'none';
  }
  s.t = Math.max(0, s.t - dt * AIM_DECAY);
  if (s.t <= 0) s.warned = false;
  return 'none';
}
