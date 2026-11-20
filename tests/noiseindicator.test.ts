import { describe, expect, it } from 'vitest';
import { migrateControls, defaultControls } from '../src/settings/ControlSettings';
import { DEF_BY_ID, ELEMENT_DEFS, defaultStore, itemOf, rectOf } from '../src/ui/layout/model';
import { MAX_ARCS, NOISE_COLOR, NoiseIndicatorModel, arcAlpha, arcLife, arcWidthDeg, classOf, verticalOf } from '../src/ui/noiseIndicatorModel';

const P = (x: number, y: number, z: number) => ({ x, y, z });
const deg = (r: number) => (r * 180) / Math.PI;
const ear = P(0, 1.6, 0);

describe('noise indicator: angle (screen position of the arc)', () => {
  const angleOf = (pos: ReturnType<typeof P>, yaw = 0) => {
    const m = new NoiseIndicatorModel();
    m.add(ear, yaw, 'footstep_walk', pos, 0.8);
    return deg(m.arcs[0].angle);
  };
  it('front = top, right = right side, left = left side, behind = bottom', () => {
    expect(angleOf(P(0, 0, -10))).toBeCloseTo(0, 5);
    expect(angleOf(P(10, 0, 0))).toBeCloseTo(90, 5);
    expect(angleOf(P(-10, 0, 0))).toBeCloseTo(-90, 5);
    expect(Math.abs(angleOf(P(0, 0, 10)))).toBeCloseTo(180, 5);
    expect(angleOf(P(10, 0, -10))).toBeCloseTo(45, 5);
    expect(angleOf(P(-10, 0, 10))).toBeCloseTo(-135, 5);
  });
  it('arcs follow the view when the player turns', () => {
    const m = new NoiseIndicatorModel();
    m.add(ear, 0, 'footstep_walk', P(-10, 0, 0), 0.8);
    expect(deg(m.arcs[0].angle)).toBeCloseTo(-90, 5);
    m.update(0.1, ear, Math.PI / 2); // 往左轉 90 度
    expect(deg(m.arcs[0].angle)).toBeCloseTo(0, 5);
  });
});

describe('noise indicator: appearance', () => {
  it('colors: footsteps white, gunshots red (bigger), other actions yellow', () => {
    expect(classOf('footstep_walk')).toBe('step');
    expect(classOf('footstep_sprint')).toBe('step');
    expect(classOf('shot')).toBe('shot');
    for (const k of ['reload', 'search', 'heal', 'trade', 'evac', 'hurt', 'item_drop'] as const) expect(classOf(k)).toBe('other');
    expect(NOISE_COLOR.step).toBe('#ffffff');
    expect(NOISE_COLOR.shot).toBe('#ff3b30');
    expect(NOISE_COLOR.other).toBe('#ffd23f');
    expect(arcWidthDeg('shot', 0.7)).toBeGreaterThan(arcWidthDeg('step', 0.7));
  });
  it('louder (closer / unobstructed) sounds are brighter, wider and last longer; life stays within 0.6-1.2s', () => {
    const mk = (gain: number) => { const m = new NoiseIndicatorModel(); m.add(ear, 0, 'footstep_walk', P(-5, 0, 0), gain); return m.arcs[0]; };
    expect(arcAlpha(mk(0.9))).toBeGreaterThan(arcAlpha(mk(0.1)));
    expect(arcWidthDeg('step', 0.9)).toBeGreaterThan(arcWidthDeg('step', 0.1));
    expect(arcLife('step', 0.9)).toBeGreaterThan(arcLife('step', 0.1));
    for (const c of ['step', 'shot', 'other'] as const) for (const g of [0.05, 0.5, 1]) {
      expect(arcLife(c, g)).toBeGreaterThanOrEqual(0.6);
      expect(arcLife(c, g)).toBeLessThanOrEqual(1.2);
    }
  });
  it('inaudible sounds are not shown; arcs fade out and disappear', () => {
    const m = new NoiseIndicatorModel();
    m.add(ear, 0, 'footstep_walk', P(-5, 0, 0), 0);
    expect(m.arcs).toHaveLength(0);
    m.add(ear, 0, 'footstep_walk', P(-5, 0, 0), 0.6);
    const a0 = arcAlpha(m.arcs[0]);
    m.update(0.3, ear, 0);
    expect(arcAlpha(m.arcs[0])).toBeLessThan(a0);
    m.update(1.3, ear, 0);
    expect(m.arcs).toHaveLength(0);
  });
  it('up / down arrows for other floors', () => {
    expect(verticalOf(ear, 'reload', P(5, 1.6 + 3, 0))).toBe(1);
    expect(verticalOf(ear, 'reload', P(5, 1.6 - 3, 0))).toBe(-1);
    expect(verticalOf(ear, 'reload', P(5, 1.6, 0))).toBe(0);
    // 腳底的聲音要先抬高：同一層的腳步不會被誤判成「下方」
    expect(verticalOf(ear, 'footstep_walk', P(5, 0, 0))).toBe(0);
  });
});

describe('noise indicator: merging and limit', () => {
  it('sounds from nearly the same direction merge into one arc (strongest class wins)', () => {
    const m = new NoiseIndicatorModel();
    m.add(ear, 0, 'footstep_walk', P(-10, 0, -1), 0.5);
    m.add(ear, 0, 'reload', P(-10, 0, -2), 0.4);
    m.add(ear, 0, 'shot', P(-10, 0, 0), 0.7);
    expect(m.arcs).toHaveLength(1);
    expect(m.arcs[0].cls).toBe('shot');
    expect(m.arcs[0].gain).toBeGreaterThanOrEqual(0.7);
    m.add(ear, 0, 'footstep_walk', P(10, 0, 0), 0.5);
    expect(m.arcs).toHaveLength(2);
  });
  it('shows at most 8 at once', () => {
    const m = new NoiseIndicatorModel();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      m.add(ear, 0, 'footstep_walk', P(Math.sin(a) * 10, 0, -Math.cos(a) * 10), 0.3 + (i % 5) * 0.1);
    }
    expect(m.arcs.length).toBeLessThanOrEqual(MAX_ARCS);
    expect(m.arcs.length).toBe(MAX_ARCS);
  });
});

describe('noise indicator: setting and layout', () => {
  it('is on by default; survives migration; can be turned off', () => {
    expect(defaultControls(false).soundIndicator).toBe(true);
    expect(migrateControls({}, true).soundIndicator).toBe(true);
    expect(migrateControls({ soundIndicator: false }, true).soundIndicator).toBe(false);
    expect(migrateControls({ soundIndicator: 'no' }, true).soundIndicator).toBe(true);
  });
  it('is a layout element fixed on the crosshair: size / opacity only, position ignored', () => {
    const def = DEF_BY_ID.noisedir;
    expect(def).toBeTruthy();
    expect(def.fixed).toBe(true);
    expect(ELEMENT_DEFS.filter((d) => d.fixed).map((d) => d.id)).toEqual(['noisedir']);
    const safe = { x: 6, y: 6, w: 860, h: 390 };
    const vp = { w: 874, h: 402 };
    const slot = defaultStore().slots[0];
    const r1 = rectOf(def, itemOf(slot, 'noisedir'), safe, vp);
    expect(r1.x + r1.w / 2).toBeCloseTo(vp.w / 2, 3);
    expect(r1.y + r1.h / 2).toBeCloseTo(vp.h / 2, 3);
    const r2 = rectOf(def, { x: 0.1, y: 0.9, s: 1.5, o: 0.5 }, safe, vp); // 想移動位置：被忽略，大小有變
    expect(r2.x + r2.w / 2).toBeCloseTo(vp.w / 2, 3);
    expect(r2.y + r2.h / 2).toBeCloseTo(vp.h / 2, 3);
    expect(r2.w).toBeGreaterThan(r1.w);
  });
});
