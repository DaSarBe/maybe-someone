import type { SaveService } from '../save/SaveService';

export const CONTROLS_VERSION = 1;
export const SAVE_KEY = 'controls';

export type GyroMode = 'off' | 'aim' | 'always';
export type HoldMode = 'hold' | 'toggle';
export type AssistLevel = 'off' | 'weak' | 'standard';

export interface ControlSettings {
  version: number;
  /** 靈敏度倍率（1 = 預設）。aim 是「瞄準時」再乘上的倍率 */
  sens: { touchLook: number; touchAim: number; mouseLook: number; mouseAim: number };
  gyro: { mode: GyroMode; sens: number; invertX: boolean; invertY: boolean };
  crouchMode: HoldMode;
  aimMode: HoldMode;
  leftFire: boolean;
  assist: AssistLevel;
  /** 聲音視覺提示（螢幕邊緣顯示別人發出的聲音方向）；預設開啟 */
  soundIndicator: boolean;
  /** 安靜搜刮：揭露時間 ×1.6，搜刮聲音距離減半（記住上次的選擇） */
  quietSearch: boolean;
  /** 自動拾取：揭露出目前武器使用的彈藥 / 時晶時直接放進背包 */
  autoPickupAmmo: boolean;
  autoPickupChronite: boolean;
}

export const SENS_MIN = 0.2;
export const SENS_MAX = 3;
export const GYRO_SENS_MIN = 0.2;
export const GYRO_SENS_MAX = 3;

/** 輔助瞄準（準心在敵人身上時轉視角的倍率；減速型，不鎖定） */
export const ASSIST_SCALE: Record<AssistLevel, number> = { off: 1, weak: 0.78, standard: 0.55 };

export function defaultControls(touch: boolean): ControlSettings {
  return {
    version: CONTROLS_VERSION,
    sens: { touchLook: 1, touchAim: 1, mouseLook: 1, mouseAim: 1 },
    gyro: { mode: 'off', sens: 1, invertX: false, invertY: false },
    // 手機的蹲下沿用先前的「點一下切換」；電腦沿用「按住」
    crouchMode: touch ? 'toggle' : 'hold',
    aimMode: 'hold',
    leftFire: true,
    assist: 'standard',
    soundIndicator: true,
    quietSearch: false,
    autoPickupAmmo: true,
    autoPickupChronite: true,
  };
}

const clampNum = (v: unknown, fb: number, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb;
const pick = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fb;

/** 讀檔遷移：缺欄位補預設、數值夾在合法範圍、未知版本盡量保留已知欄位 */
export function migrateControls(raw: unknown, touch: boolean): ControlSettings {
  const d = defaultControls(touch);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, any>;
  const s = (r.sens ?? {}) as Record<string, unknown>;
  const g = (r.gyro ?? {}) as Record<string, unknown>;
  return {
    version: CONTROLS_VERSION,
    sens: {
      touchLook: clampNum(s.touchLook, d.sens.touchLook, SENS_MIN, SENS_MAX),
      touchAim: clampNum(s.touchAim, d.sens.touchAim, SENS_MIN, SENS_MAX),
      mouseLook: clampNum(s.mouseLook, d.sens.mouseLook, SENS_MIN, SENS_MAX),
      mouseAim: clampNum(s.mouseAim, d.sens.mouseAim, SENS_MIN, SENS_MAX),
    },
    gyro: {
      mode: pick(g.mode, ['off', 'aim', 'always'] as const, d.gyro.mode),
      sens: clampNum(g.sens, d.gyro.sens, GYRO_SENS_MIN, GYRO_SENS_MAX),
      invertX: typeof g.invertX === 'boolean' ? g.invertX : d.gyro.invertX,
      invertY: typeof g.invertY === 'boolean' ? g.invertY : d.gyro.invertY,
    },
    crouchMode: pick(r.crouchMode, ['hold', 'toggle'] as const, d.crouchMode),
    aimMode: pick(r.aimMode, ['hold', 'toggle'] as const, d.aimMode),
    leftFire: typeof r.leftFire === 'boolean' ? r.leftFire : d.leftFire,
    assist: pick(r.assist, ['off', 'weak', 'standard'] as const, d.assist),
    soundIndicator: typeof r.soundIndicator === 'boolean' ? r.soundIndicator : d.soundIndicator,
    quietSearch: typeof r.quietSearch === 'boolean' ? r.quietSearch : d.quietSearch,
    autoPickupAmmo: typeof r.autoPickupAmmo === 'boolean' ? r.autoPickupAmmo : d.autoPickupAmmo,
    autoPickupChronite: typeof r.autoPickupChronite === 'boolean' ? r.autoPickupChronite : d.autoPickupChronite,
  };
}

/** 控制設定存取：即時生效、立即寫入 SaveService */
export class ControlSettingsStore {
  private value: ControlSettings;
  private listeners = new Set<(v: ControlSettings) => void>();

  constructor(private save: SaveService, private touch: boolean) {
    this.value = migrateControls(save.get<unknown>(SAVE_KEY, null), touch);
  }

  get(): ControlSettings { return this.value; }

  update(mut: (v: ControlSettings) => void): void {
    const next = JSON.parse(JSON.stringify(this.value)) as ControlSettings;
    mut(next);
    this.value = migrateControls(next, this.touch);
    this.save.set(SAVE_KEY, this.value);
    for (const l of this.listeners) l(this.value);
  }

  reset(): void {
    this.value = defaultControls(this.touch);
    this.save.set(SAVE_KEY, this.value);
    for (const l of this.listeners) l(this.value);
  }

  subscribe(fn: (v: ControlSettings) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}
