/**
 * 配件對武器數值的影響（純函式，不依賴 three.js；改槍台預覽、戰鬥系統、敵人、測試共用）。
 * 資料見 data/attachments.ts。
 */
import {
  ATTACHMENTS, modIds, type ModEffect, type SightKind, type WeaponMods,
} from '../data/attachments';
import { BASE_FOV, WEAPON_HANDLING, type WeaponHandling } from '../data/weaponHandling';
import { getItem } from '../data/items';
import { DEFAULT_SHOT_RANGE, SHOT_RANGE } from '../data/noise';
import type { WeaponStats } from '../data/types';
import { WEAPON_STATS } from '../data/weapons';

export interface EffectiveWeapon {
  id: string;
  mods: WeaponMods;
  stats: WeaponStats;
  handling: WeaponHandling;
  sight: SightKind;
  /** 倍鏡的視野（度）；非倍鏡 = null */
  scopeFov: number | null;
  zoom: number;
  /** 槍聲距離倍率（滅音器 0.25、制退器 1.1） */
  loudness: number;
  suppressed: boolean;
  /** 槍口火光大小倍率 */
  flash: number;
  tactical: 'flashlight' | 'laser' | null;
  /** 武器加配件的總重（kg） */
  weight: number;
}

const mul = (list: ModEffect[], k: keyof ModEffect): number => list.reduce((p, e) => p * (e[k] ?? 1), 1);

/** 套用配件後的武器數值；沒有 mods 時與原始資料完全相同 */
export function effectiveWeapon(weaponId: string, mods: WeaponMods | undefined = undefined): EffectiveWeapon {
  const base = WEAPON_STATS[weaponId];
  const h0 = WEAPON_HANDLING[weaponId];
  const m: WeaponMods = mods ?? {};
  const atts = modIds(m).map((id) => ATTACHMENTS[id]).filter(Boolean);
  const fx = atts.map((a) => a.effect);

  const stats: WeaponStats = {
    ...base,
    damage: base.damage * mul(fx, 'damage'),
    range: base.range * mul(fx, 'range'),
    recoil: base.recoil * mul(fx, 'recoil'),
    reloadTime: base.reloadTime * mul(fx, 'reloadTime'),
    magazine: Math.ceil(base.magazine * mul(fx, 'magazine') - 1e-9),
  };

  const sightAtt = m.sight ? ATTACHMENTS[m.sight] : undefined;
  const sight: SightKind = sightAtt?.sight ?? 'iron';
  const scopeFov = sightAtt?.sight === 'scope' ? sightAtt.scopeFov ?? null : null;
  const handling: WeaponHandling = {
    ...h0,
    spreadHip: h0.spreadHip * mul(fx, 'spreadHip'),
    spreadAds: h0.spreadAds * mul(fx, 'spreadAds'),
    adsTime: h0.adsTime * mul(fx, 'adsTime'),
    adsMoveScale: h0.adsMoveScale * mul(fx, 'adsMove'),
    adsFov: scopeFov ?? h0.adsFov + fx.reduce((s, e) => s + (e.adsFovAdd ?? 0), 0),
  };

  const loudness = mul(fx, 'noise');
  const tacticalId = m.tactical;
  return {
    id: weaponId, mods: m, stats, handling, sight, scopeFov,
    zoom: sightAtt?.zoom ?? 1,
    loudness, suppressed: loudness < 0.99,
    flash: mul(fx, 'flash'),
    tactical: tacticalId ? ATTACHMENTS[tacticalId]?.tactical ?? null : null,
    weight: (getItem(weaponId)?.weight ?? 0) + modIds(m).reduce((s, id) => s + (getItem(id)?.weight ?? 0), 0),
  };
}

/** 一槍的槍聲距離（公尺）：武器基礎距離 × 配件倍率，供改槍台顯示 */
export function shotRangeOf(weaponId: string, mods?: WeaponMods): number {
  return shotBase(weaponId) * effectiveWeapon(weaponId, mods).loudness;
}

function shotBase(weaponId: string): number { return SHOT_RANGE[weaponId] ?? DEFAULT_SHOT_RANGE; }

/** 瞄準 FOV 對應的視角靈敏度倍率（角度比例：視野越窄轉得越慢） */
export function lookScaleForFov(fov: number): number {
  const r = Math.tan((fov * Math.PI) / 360) / Math.tan((BASE_FOV * Math.PI) / 360);
  return Math.max(0.1, r);
}

/** 加了配件之後，某個數值相對於原本是變好還是變差（改槍台的綠 / 紅箭頭） */
export interface StatRow {
  key: string;
  label: string;
  value: number;
  base: number;
  /** 顯示用的單位 */
  unit: string;
  /** 數值越大越好？ */
  higherBetter: boolean;
  digits: number;
}

export function statRows(weaponId: string, mods: WeaponMods | undefined): StatRow[] {
  const b = effectiveWeapon(weaponId);
  const e = effectiveWeapon(weaponId, mods);
  const row = (key: string, label: string, value: number, base: number, unit: string, higherBetter: boolean, digits = 2): StatRow =>
    ({ key, label, value, base, unit, higherBetter, digits });
  return [
    row('recoil', '後座力', e.stats.recoil, b.stats.recoil, '', false),
    row('spreadHip', '腰射散佈', e.handling.spreadHip, b.handling.spreadHip, '°', false),
    row('spreadAds', '瞄準散佈', e.handling.spreadAds, b.handling.spreadAds, '°', false),
    row('adsTime', '瞄準時間', e.handling.adsTime, b.handling.adsTime, ' 秒', false),
    row('magazine', '彈匣容量', e.stats.magazine, b.stats.magazine, ' 發', true, 0),
    row('reloadTime', '換彈時間', e.stats.reloadTime, b.stats.reloadTime, ' 秒', false),
    row('noise', '槍聲範圍', shotRangeOf(weaponId, mods), shotRangeOf(weaponId), ' m', false, 0),
    row('weight', '重量', e.weight, b.weight, ' kg', false),
  ];
}
