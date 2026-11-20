import { describe, expect, it } from 'vitest';
import type { SaveService } from '../src/save/SaveService';
import {
  ELEMENT_DEFS, ELEMENT_IDS, LAYOUT_VERSION, SLOT_COUNT, cloneStore, defaultStore, findOverlaps, itemOf, migrateStore,
  ratioOf, rectOf, resolveAll, safeRect, snapRect, type Insets, type LayoutStore, type Rect,
} from '../src/ui/layout/model';

class MemSave implements SaveService {
  data = new Map<string, string>();
  get<T>(k: string, fb: T): T { const v = this.data.get(k); return v === undefined ? fb : (JSON.parse(v) as T); }
  set<T>(k: string, v: T): void { this.data.set(k, JSON.stringify(v)); }
  remove(k: string): void { this.data.delete(k); }
}

const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEVICES: [string, number, number, Insets][] = [
  ['iPhone 16 Pro 874x402', 874, 402, { top: 0, right: 59, bottom: 21, left: 59 }],
  ['iPhone 16 Pro Max 932x430', 932, 430, { top: 0, right: 59, bottom: 21, left: 59 }],
  ['iPhone 13-15 844x390', 844, 390, { top: 0, right: 47, bottom: 21, left: 47 }],
  ['iPhone SE 667x375', 667, 375, NONE],
  ['Android 915x412', 915, 412, NONE],
  ['iPad landscape 1024x768', 1024, 768, { top: 0, right: 0, bottom: 20, left: 0 }],
];

const inside = (r: Rect, s: Rect): boolean =>
  r.x >= s.x - 0.01 && r.y >= s.y - 0.01 && r.x + r.w <= s.x + s.w + 0.01 && r.y + r.h <= s.y + s.h + 0.01;

describe('default layout', () => {
  for (const [name, w, h, ins] of DEVICES) {
    for (const insets of [ins, NONE]) {
      it(`${name}${insets === ins ? '' : ' (no insets)'}: no overlap, inside safe area`, () => {
        const safe = safeRect(w, h, insets);
        const rects = resolveAll(defaultStore().slots[0], safe);
        expect(findOverlaps(rects)).toEqual([]);
        for (const id of ELEMENT_IDS) expect(inside(rects[id], safe), `${id} inside safe`).toBe(true);
        // 也在螢幕與 env 安全區內
        for (const id of ELEMENT_IDS) {
          const r = rects[id];
          expect(r.x).toBeGreaterThanOrEqual(insets.left);
          expect(r.y).toBeGreaterThanOrEqual(insets.top);
          expect(r.x + r.w).toBeLessThanOrEqual(w - insets.right);
          expect(r.y + r.h).toBeLessThanOrEqual(h - insets.bottom);
        }
      });
    }
  }

  it('rotated portrait still stays inside the safe area', () => {
    const safe = safeRect(402, 874, { top: 59, right: 0, bottom: 34, left: 0 });
    const rects = resolveAll(defaultStore().slots[0], safe);
    for (const id of ELEMENT_IDS) expect(inside(rects[id], safe)).toBe(true);
  });

  it('has the left fire button above-right of the stick and big controls are touch sized', () => {
    const safe = safeRect(874, 402, DEVICES[0][3]);
    const r = resolveAll(defaultStore().slots[0], safe);
    const stick = r.stick, fl = r.fireL;
    expect(fl.x).toBeGreaterThan(stick.x + stick.w * 0.7);
    expect(fl.y + fl.h / 2).toBeLessThan(stick.y + stick.h / 2);
    for (const id of ['fireL', 'fireR', 'jump', 'aim', 'crouch', 'reload', 'interact', 'swap', 'heal', 'flashlight', 'inventory', 'menu'] as const) {
      expect(Math.min(r[id].w, r[id].h), id).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('rect math', () => {
  const safe = safeRect(874, 402, DEVICES[0][3]);
  it('clamps oversized / out-of-range items into the safe area', () => {
    const def = ELEMENT_DEFS.find((d) => d.id === 'fireR')!;
    const r = rectOf(def, { x: 5, y: -3, s: 2, o: 1 }, safe);
    expect(inside(r, safe)).toBe(true);
  });
  it('ratio roundtrip', () => {
    const def = ELEMENT_DEFS.find((d) => d.id === 'jump')!;
    const r = rectOf(def, { x: 0.4, y: 0.3, s: 1.3, o: 1 }, safe);
    const c = ratioOf(r, safe);
    expect(c.x).toBeCloseTo(0.4, 5);
    expect(c.y).toBeCloseTo(0.3, 5);
  });
  it('scale changes size relative to short side, not the position ratio', () => {
    const def = ELEMENT_DEFS.find((d) => d.id === 'aim')!;
    const a = rectOf(def, { x: 0.5, y: 0.5, s: 1, o: 1 }, safe);
    const b = rectOf(def, { x: 0.5, y: 0.5, s: 1.5, o: 1 }, safe);
    expect(b.w / a.w).toBeCloseTo(1.5, 5);
  });
  it('detects overlaps when elements are moved on top of each other', () => {
    const slot = defaultStore().slots[0];
    slot.items.inventory = { ...itemOf(slot, 'menu') };
    const pairs = findOverlaps(resolveAll(slot, safe));
    expect(pairs.some(([a, b]) => [a, b].includes('inventory') && [a, b].includes('menu'))).toBe(true);
  });
});

describe('snapping', () => {
  const safe = safeRect(874, 402, DEVICES[0][3]);
  const opt = { grid: false, gridStep: 36, threshold: 8 };
  it('limits to the safe area', () => {
    const s = snapRect({ x: -50, y: 900, w: 60, h: 60 }, [], safe, opt);
    expect(inside(s.rect, safe)).toBe(true);
  });
  it('snaps to another element edge within threshold', () => {
    const other: Rect = { x: 300, y: 100, w: 80, h: 80 };
    const s = snapRect({ x: 384, y: 220, w: 60, h: 60 }, [other], safe, opt);
    expect(s.rect.x).toBeCloseTo(380, 5);
    expect(s.guideX).toBe(380);
  });
  it('does not snap when far', () => {
    const other: Rect = { x: 300, y: 100, w: 80, h: 80 };
    const s = snapRect({ x: 420, y: 237, w: 60, h: 60 }, [other], safe, opt);
    expect(s.rect.x).toBe(420);
    expect(s.guideX).toBeNull();
  });
  it('snaps to the grid when enabled', () => {
    const s = snapRect({ x: safe.x + 73, y: safe.y + 70, w: 40, h: 40 }, [], safe, { ...opt, grid: true });
    expect(s.rect.x).toBeCloseTo(safe.x + 72, 5);
    expect(s.rect.y).toBeCloseTo(safe.y + 72, 5);
  });
});

describe('layout store persistence and migrate', () => {
  it('roundtrips through SaveService', () => {
    const save = new MemSave();
    const st = defaultStore();
    st.active = 1;
    st.slots[1].name = '我的配置';
    st.slots[1].items.fireL = { x: 0.2, y: 0.3, s: 1.5, o: 0.6 };
    save.set('layout', st);
    const back = migrateStore(save.get<unknown>('layout', null));
    expect(back).toEqual(st);
    expect(back.version).toBe(LAYOUT_VERSION);
  });
  it('falls back to defaults for missing / corrupt data', () => {
    expect(migrateStore(null)).toEqual(defaultStore());
    expect(migrateStore('x')).toEqual(defaultStore());
    expect(migrateStore(42)).toEqual(defaultStore());
    expect(migrateStore({ version: 1, slots: 'nope', active: 'a' })).toEqual(defaultStore());
  });
  it('migrates the v0 single-layout draft into slot 1', () => {
    const v0 = { items: { jump: { x: 0.1, y: 0.2, s: 1.2, o: 0.9 }, bogus: { x: 1, y: 1 } } };
    const m = migrateStore(v0);
    expect(m.version).toBe(LAYOUT_VERSION);
    expect(m.slots).toHaveLength(SLOT_COUNT);
    expect(m.slots[0].items.jump).toEqual({ x: 0.1, y: 0.2, s: 1.2, o: 0.9 });
    expect(Object.keys(m.slots[0].items)).toEqual(['jump']);
    expect(m.slots[1].items).toEqual({});
  });
  it('clamps out-of-range values, drops unknown ids, keeps what it knows from a newer version', () => {
    const raw = {
      version: 99, active: 7, grid: false,
      slots: [{ name: '   ', items: { aim: { x: 9, y: -1, s: 50, o: 0 }, nope: { x: 0, y: 0, s: 1, o: 1 } }, extra: 1 }],
      futureField: true,
    };
    const m = migrateStore(raw);
    expect(m.active).toBe(SLOT_COUNT - 1);
    expect(m.grid).toBe(false);
    expect(m.slots[0].name).toBe('配置 1');
    expect(m.slots[0].items.aim).toEqual({ x: 1, y: 0, s: 2, o: 0.2 });
    expect((m.slots[0].items as Record<string, unknown>).nope).toBeUndefined();
  });
  it('cloneStore is deep', () => {
    const a: LayoutStore = defaultStore();
    const b = cloneStore(a);
    b.slots[0].items.jump = { x: 0, y: 0, s: 1, o: 1 };
    expect(a.slots[0].items.jump).toBeUndefined();
  });
});

describe('flashlight button', () => {
  it('is part of the layout system, reachable and not overlapping anything in the default layout on every device', () => {
    expect(ELEMENT_IDS).toContain('flashlight');
    for (const [name, w, h, ins] of DEVICES) {
      const safe = safeRect(w, h, ins);
      const rects = resolveAll(defaultStore().slots[0], safe);
      expect(findOverlaps(rects), name).toEqual([]);
      expect(rects.flashlight.w, name).toBeGreaterThanOrEqual(44);
      // 在左手拇指附近：搖桿的上方、左半螢幕
      expect(rects.flashlight.x + rects.flashlight.w, name).toBeLessThan(safe.x + safe.w * 0.5);
      expect(rects.flashlight.y + rects.flashlight.h, name).toBeLessThan(rects.stick.y);
    }
  });
  it('migrates old layouts that do not know the button (default position, scale 1)', () => {
    const old = defaultStore();
    delete (old.slots[0].items as Record<string, unknown>).flashlight;
    const m = migrateStore(JSON.parse(JSON.stringify(old)));
    expect(itemOf(m.slots[0], 'flashlight')).toMatchObject({ s: 1, o: 1 });
  });
});
