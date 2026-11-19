/** 武器操作手感（散佈、瞄準、外型）。數值（傷害、射速、彈匣…）仍在 weapons.ts 的 WEAPON_STATS */
export type ViewmodelStyle = 'pistol' | 'smg' | 'rifle' | 'shotgun';

export interface WeaponHandling {
  /** 全自動（按住連發）；false = 半自動 */
  auto: boolean;
  /** 腰射散佈半角（度） */
  spreadHip: number;
  /** 瞄準散佈半角（度） */
  spreadAds: number;
  /** 以走路速度移動時額外增加的散佈（度），衝刺更大；跳躍另算 */
  spreadMove: number;
  /** 每發子彈累積的散佈（度），隨時間回復 */
  bloomPerShot: number;
  /** 瞄準時的視野（度）；基準 FOV 為 75 */
  adsFov: number;
  /** 瞄準時的移動速度倍率 */
  adsMoveScale: number;
  /** 進入瞄準所需秒數 */
  adsTime: number;
  /** 後座力的鏡頭上飄（度）= WEAPON_STATS.recoil × 這個倍率 */
  kickPerRecoil: number;
  style: ViewmodelStyle;
}

export const BASE_FOV = 75;

export const WEAPON_HANDLING: Record<string, WeaponHandling> = {
  pistol: { auto: false, spreadHip: 2.0, spreadAds: 0.45, spreadMove: 1.4, bloomPerShot: 0.7, adsFov: 62, adsMoveScale: 0.8, adsTime: 0.14, kickPerRecoil: 2.4, style: 'pistol' },
  smg: { auto: true, spreadHip: 3.0, spreadAds: 1.0, spreadMove: 1.8, bloomPerShot: 0.35, adsFov: 60, adsMoveScale: 0.75, adsTime: 0.17, kickPerRecoil: 2.2, style: 'smg' },
  rifle: { auto: true, spreadHip: 2.6, spreadAds: 0.35, spreadMove: 2.0, bloomPerShot: 0.45, adsFov: 50, adsMoveScale: 0.7, adsTime: 0.2, kickPerRecoil: 2.2, style: 'rifle' },
  shotgun: { auto: false, spreadHip: 4.5, spreadAds: 3.0, spreadMove: 1.0, bloomPerShot: 0.5, adsFov: 66, adsMoveScale: 0.75, adsTime: 0.2, kickPerRecoil: 2.2, style: 'shotgun' },
};
