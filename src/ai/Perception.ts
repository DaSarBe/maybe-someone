// 聽覺已移到 data/noise.ts（聲音事件系統）：玩家聽 NPC 與 NPC 聽玩家使用同一張距離表與地面材質係數，
// 這裡只留視覺。
export { SURFACE_LOUDNESS } from '../data/noise';

/** 目標是否在視野錐內。facing：forward = (sin f, cos f)；fovDeg 為全角 */
export function inFieldOfView(facing: number, dx: number, dz: number, fovDeg: number): boolean {
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return true;
  const cos = (Math.sin(facing) * dx + Math.cos(facing) * dz) / len;
  return cos >= Math.cos((fovDeg * Math.PI) / 360);
}

export interface VisionCtx {
  dist: number;
  /** 與視線中心的夾角比例 0（正前方）～1（視野邊緣） */
  offAxis: number;
  crouching: boolean;
  sprinting: boolean;
  moving: boolean;
  /** 目標所在位置的亮度 0..1（暗處發現得慢） */
  light: number;
}

/**
 * 「發現值」每秒增加量（1 = 滿，發現）。
 * 在最佳條件（近、亮、站姿、正前方）為 1 / reaction；遠、暗、蹲、靜止、視野邊緣都會變慢。
 * 超出 sightRange（受暗度與蹲下縮小）則為 0。
 */
export function visionGain(reaction: number, sightRange: number, c: VisionCtx): number {
  const range = sightRange * (0.55 + 0.45 * c.light) * (c.crouching ? 0.75 : 1);
  if (c.dist > range) return 0;
  const closeBoost = c.dist < 3 ? 2.5 : 1;
  const distF = Math.max(0.12, 1 - (c.dist / range) * 0.88);
  const stance = c.crouching ? 0.55 : c.sprinting ? 1.4 : 1;
  const still = c.moving ? 1 : 0.75;
  const light = 0.25 + 0.75 * c.light;
  const edge = 1 - 0.5 * c.offAxis;
  return (closeBoost * distF * stance * still * light * edge) / reaction;
}
