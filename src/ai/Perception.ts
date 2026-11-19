import type { StepIntensity } from '../core/EventBus';
import type { Surface } from '../world/Surface';

/** 槍聲在這個半徑內都聽得到（公尺）；沒有視線時乘 OCCLUDED */
export const SHOT_HEAR_RADIUS = 70;
export const OCCLUDED = 0.65;

/** 腳步聲基礎傳播半徑（公尺，在混凝土上）：衝刺大聲、走路中等、蹲下幾乎聽不到 */
export const STEP_RADIUS: Record<StepIntensity, number> = { sprint: 20, walk: 10, crouch: 2.5 };

/** 地面材質的響度倍率：金屬最吵，草地、沙、地毯很安靜 */
export const SURFACE_LOUDNESS: Record<Surface, number> = {
  metal_hollow: 1.8, metal_grate: 1.6, metal: 1.5, gravel: 1.35, wood: 1.2, water: 1.25, tile: 1.1,
  concrete: 1.0, dirt: 0.8, grass: 0.6, sand: 0.55, carpet: 0.45,
};

/** 一次腳步聲能被聽見的最大距離 */
export function footstepHearRadius(intensity: StepIntensity, surface: Surface, hearing = 1): number {
  return STEP_RADIUS[intensity] * SURFACE_LOUDNESS[surface] * hearing;
}

export function shotHearRadius(hearing = 1): number {
  return SHOT_HEAR_RADIUS * Math.min(1.3, hearing);
}

/** 聽見與否：被牆擋住時半徑打折 */
export function canHear(dist: number, radius: number, lineOfSight: boolean): boolean {
  return dist <= radius * (lineOfSight ? 1 : OCCLUDED);
}

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
