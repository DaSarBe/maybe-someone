import { describe, expect, it } from 'vitest';
import type { SaveService } from '../src/save/SaveService';
import {
  ASSIST_SCALE, CONTROLS_VERSION, ControlSettingsStore, defaultControls, migrateControls,
} from '../src/settings/ControlSettings';
import { GYRO_DEADZONE, gyroLook, normalizeAngle, smooth, toScreenAxes } from '../src/input/gyroMath';

class MemSave implements SaveService {
  data = new Map<string, string>();
  get<T>(k: string, fb: T): T { const v = this.data.get(k); return v === undefined ? fb : (JSON.parse(v) as T); }
  set<T>(k: string, v: T): void { this.data.set(k, JSON.stringify(v)); }
  remove(k: string): void { this.data.delete(k); }
}

describe('control settings', () => {
  it('defaults: touch crouch toggles, desktop crouch holds (previous behaviour)', () => {
    expect(defaultControls(true).crouchMode).toBe('toggle');
    expect(defaultControls(false).crouchMode).toBe('hold');
    expect(defaultControls(true).leftFire).toBe(true);
    expect(defaultControls(true).gyro.mode).toBe('off');
  });
  it('persists, applies instantly and notifies subscribers', () => {
    const save = new MemSave();
    const st = new ControlSettingsStore(save, true);
    let seen = 0;
    st.subscribe(() => { seen++; });
    st.update((c) => { c.sens.touchLook = 1.5; c.gyro.mode = 'aim'; c.leftFire = false; });
    expect(seen).toBe(1);
    expect(st.get().sens.touchLook).toBe(1.5);
    const again = new ControlSettingsStore(save, true);
    expect(again.get().sens.touchLook).toBe(1.5);
    expect(again.get().gyro.mode).toBe('aim');
    expect(again.get().leftFire).toBe(false);
    expect(again.get().version).toBe(CONTROLS_VERSION);
  });
  it('migrate fills missing fields and clamps bad values', () => {
    const m = migrateControls({ sens: { touchLook: 99, mouseLook: 'x' }, gyro: { mode: 'weird', sens: -1 }, assist: 'weak', aimMode: 'toggle' }, true);
    expect(m.sens.touchLook).toBe(3);
    expect(m.sens.mouseLook).toBe(1);
    expect(m.gyro.mode).toBe('off');
    expect(m.gyro.sens).toBe(0.2);
    expect(m.assist).toBe('weak');
    expect(m.aimMode).toBe('toggle');
    expect(migrateControls(null, false)).toEqual(defaultControls(false));
  });
  it('assist scales: off > weak > standard (slowdown only)', () => {
    expect(ASSIST_SCALE.off).toBe(1);
    expect(ASSIST_SCALE.weak).toBeGreaterThan(ASSIST_SCALE.standard);
    expect(ASSIST_SCALE.weak).toBeLessThan(1);
  });
});

describe('gyro axis conversion', () => {
  const T = { sens: 1, invertX: false, invertY: false };
  const dt = 1 / 60;
  it('normalizes screen angles', () => {
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(90)).toBe(90);
    expect(normalizeAngle(360)).toBe(0);
  });
  it('landscape-primary (90): beta is yaw about screen-up, gamma is pitch', () => {
    expect(toScreenAxes({ beta: 30, gamma: 10 }, 90)).toEqual({ up: 30, right: -10 });
    // 繞螢幕上方逆時針（beta>0）= 向左轉 → 視角 x 為負
    expect(gyroLook({ beta: 60, gamma: 0 }, 90, dt, T).dx).toBeLessThan(0);
    // gamma>0 → 繞螢幕右方為負 → 低頭 → 視角 y 為正（往下）
    expect(gyroLook({ beta: 0, gamma: 60 }, 90, dt, T).dy).toBeGreaterThan(0);
  });
  it('landscape-secondary (270) is the exact opposite of primary', () => {
    const p = gyroLook({ beta: 50, gamma: 40 }, 90, dt, T);
    const s = gyroLook({ beta: 50, gamma: 40 }, 270, dt, T);
    expect(s.dx).toBeCloseTo(-p.dx, 10);
    expect(s.dy).toBeCloseTo(-p.dy, 10);
    expect(Math.abs(p.dx)).toBeGreaterThan(0);
  });
  it('portrait (0) uses gamma for yaw and beta for pitch', () => {
    expect(toScreenAxes({ beta: 5, gamma: 7 }, 0)).toEqual({ right: 5, up: 7 });
    expect(toScreenAxes({ beta: 5, gamma: 7 }, 180)).toEqual({ right: -5, up: -7 });
  });
  it('turning magnitude: 90 deg/s for 1 s ~ 90 degrees at sens 1', () => {
    let x = 0;
    for (let i = 0; i < 60; i++) x += gyroLook({ beta: 90 + GYRO_DEADZONE, gamma: 0 }, 90, dt, T).dx;
    expect(Math.abs(x)).toBeCloseTo(Math.PI / 2, 5);
  });
  it('dead zone ignores tiny rotation', () => {
    const r = gyroLook({ beta: GYRO_DEADZONE * 0.9, gamma: -GYRO_DEADZONE * 0.9 }, 90, dt, T);
    expect(r.dx).toBeCloseTo(0, 12);
    expect(r.dy).toBeCloseTo(0, 12);
  });
  it('sensitivity scales and invert flips each axis independently', () => {
    const base = gyroLook({ beta: 40, gamma: 40 }, 90, dt, T);
    const dbl = gyroLook({ beta: 40, gamma: 40 }, 90, dt, { ...T, sens: 2 });
    expect(dbl.dx).toBeCloseTo(base.dx * 2, 10);
    const ix = gyroLook({ beta: 40, gamma: 40 }, 90, dt, { ...T, invertX: true });
    expect(ix.dx).toBeCloseTo(-base.dx, 10);
    expect(ix.dy).toBeCloseTo(base.dy, 10);
    const iy = gyroLook({ beta: 40, gamma: 40 }, 90, dt, { ...T, invertY: true });
    expect(iy.dy).toBeCloseTo(-base.dy, 10);
    expect(iy.dx).toBeCloseTo(base.dx, 10);
  });
  it('smoothing moves toward the target without overshoot', () => {
    let v = 0;
    for (let i = 0; i < 20; i++) { v = smooth(v, 10, 0.5); expect(v).toBeLessThanOrEqual(10); }
    expect(v).toBeGreaterThan(9.9);
  });
});
