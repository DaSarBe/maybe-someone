/**
 * 觸控介面版面資料模型（純函式，不碰 DOM，方便單元測試）。
 *
 * - 位置：元素「中心點」相對於安全區的比例（0～1）。
 * - 大小：基準大小是「安全區短邊（上限 REF_MAX）」的比例，使用者只調整倍率（0.5～2）。
 * - 所有元素的矩形都會被限制在安全區內。
 */

export const LAYOUT_VERSION = 1;
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 2;
export const OPACITY_MIN = 0.2;
export const OPACITY_MAX = 1;
/** 基準短邊的上限（px）：平板上按鈕不會變得過大 */
export const REF_MAX = 430;
/** 安全區之外再留的邊（px） */
export const EDGE_MARGIN = 6;
export const SLOT_COUNT = 3;

export type ElementId =
  | 'stick' | 'fireL' | 'fireR' | 'aim' | 'jump' | 'crouch' | 'reload' | 'interact' | 'swap' | 'heal'
  | 'inventory' | 'menu'
  | 'timer' | 'ammo' | 'hp' | 'armor' | 'credits' | 'prompt' | 'hitdir' | 'noisedir';

/** px：直接設定寬高；scale：以自然尺寸套用 transform: scale；center：以中心為原點縮放（受擊方向） */
export type ApplyMode = 'px' | 'scale' | 'center';

export interface ElementDef {
  id: ElementId;
  label: string;
  group: 'control' | 'hud';
  apply: ApplyMode;
  /** 基準寬度（R 的比例，R = 安全區短邊，上限 REF_MAX） */
  w: number;
  /** 高 / 寬 */
  aspect: number;
  /** 自然尺寸（px，apply 為 scale / center 時使用） */
  nat?: { w: number; h: number };
  /** 預設中心位置（相對安全區 0～1） */
  x: number;
  y: number;
  /** 位置固定在畫面中心（準心）：使用者只能調整大小與透明度，不參與重疊檢查 */
  fixed?: boolean;
}

const btn = (id: ElementId, label: string, w: number, x: number, y: number): ElementDef =>
  ({ id, label, group: 'control', apply: 'px', w, aspect: 1, x, y });
const hud = (id: ElementId, label: string, w: number, nw: number, nh: number, x: number, y: number): ElementDef =>
  ({ id, label, group: 'hud', apply: 'scale', w, aspect: nh / nw, nat: { w: nw, h: nh }, x, y });

/**
 * 預設版面（以 iPhone 16 Pro 橫向為基準，並在 6 種常見尺寸驗證過不重疊）。
 * 左側：搖桿（左下）、左射擊鍵（搖桿右上方）；右側：射擊（右下）、跳、蹲、瞄準、互動、換彈、切換、治療；
 * 右上：背包、☰；上方中央：時空穩定度；左上：信用點、血量、護甲；下方中央：彈藥；中央：受擊方向與互動提示。
 */
export const ELEMENT_DEFS: ElementDef[] = [
  btn('stick', '虛擬搖桿', 0.36, 0.13, 0.74),
  btn('fireL', '左射擊鍵', 0.2, 0.3, 0.46),
  btn('fireR', '右射擊鍵', 0.27, 0.915, 0.77),
  btn('aim', '瞄準', 0.19, 0.765, 0.86),
  btn('jump', '跳', 0.19, 0.899, 0.452),
  btn('crouch', '蹲', 0.17, 0.765, 0.576),
  btn('reload', '換彈', 0.16, 0.661, 0.466),
  btn('interact', '互動', 0.17, 0.765, 0.342),
  btn('swap', '切換武器', 0.14, 0.661, 0.259),
  btn('heal', '治療', 0.14, 0.661, 0.906),
  btn('inventory', '背包', 0.14, 0.87, 0.075),
  btn('menu', '☰ 設定', 0.13, 0.955, 0.075),
  hud('timer', '時空穩定度', 0.6, 230, 58, 0.5, 0.075),
  hud('ammo', '彈藥', 0.4, 170, 64, 0.5, 0.917),
  hud('hp', '血量', 0.4, 150, 36, 0.12, 0.2),
  hud('armor', '護甲', 0.4, 150, 18, 0.12, 0.285),
  hud('credits', '信用點', 0.3, 112, 34, 0.1, 0.05),
  hud('prompt', '互動提示', 0.62, 250, 76, 0.5, 0.713),
  { id: 'hitdir', label: '受擊方向', group: 'hud', apply: 'center', w: 0.36, aspect: 1, nat: { w: 320, h: 320 }, x: 0.5, y: 0.384 },
  // 聲音視覺提示：以準心為中心的圓環，位置固定（只開放大小與透明度）
  { id: 'noisedir', label: '聲音提示', group: 'hud', apply: 'center', w: 0.62, aspect: 1, nat: { w: 320, h: 320 }, x: 0.5, y: 0.5, fixed: true },
];

export const ELEMENT_IDS: ElementId[] = ELEMENT_DEFS.map((d) => d.id);
export const DEF_BY_ID = Object.fromEntries(ELEMENT_DEFS.map((d) => [d.id, d])) as Record<ElementId, ElementDef>;

export interface Rect { x: number; y: number; w: number; h: number }
/** 使用者調整過的單一元素狀態 */
export interface ItemState { x: number; y: number; s: number; o: number }
export interface LayoutSlot { name: string; items: Partial<Record<ElementId, ItemState>> }
export interface LayoutStore {
  version: number;
  /** 目前使用中的配置 0..2 */
  active: number;
  slots: LayoutSlot[];
  /** 編輯器的格線吸附開關 */
  grid: boolean;
}

export const defaultItem = (id: ElementId): ItemState => ({ x: DEF_BY_ID[id].x, y: DEF_BY_ID[id].y, s: 1, o: 1 });
export const itemOf = (slot: LayoutSlot, id: ElementId): ItemState => slot.items[id] ?? defaultItem(id);

export function defaultStore(): LayoutStore {
  return {
    version: LAYOUT_VERSION,
    active: 0,
    slots: Array.from({ length: SLOT_COUNT }, (_, i) => ({ name: `配置 ${i + 1}`, items: {} })),
    grid: true,
  };
}

export function cloneStore(s: LayoutStore): LayoutStore {
  return JSON.parse(JSON.stringify(s)) as LayoutStore;
}

// ---------------------------------------------------------------- 安全區與尺寸
export interface Insets { top: number; right: number; bottom: number; left: number }

/** 視窗尺寸 + env(safe-area-inset-*) → 安全區矩形（px，已含 EDGE_MARGIN） */
export function safeRect(vw: number, vh: number, ins: Insets): Rect {
  const x = ins.left + EDGE_MARGIN;
  const y = ins.top + EDGE_MARGIN;
  return { x, y, w: Math.max(50, vw - x - ins.right - EDGE_MARGIN), h: Math.max(50, vh - y - ins.bottom - EDGE_MARGIN) };
}

export const refSize = (safe: Rect): number => Math.min(Math.min(safe.w, safe.h), REF_MAX);

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** 元素的像素尺寸（不含位置） */
export function sizeOf(def: ElementDef, scale: number, safe: Rect): { w: number; h: number } {
  const R = refSize(safe);
  let w = def.w * R * scale;
  let h = w * def.aspect;
  // 不超過安全區
  const k = Math.min(1, safe.w / w, safe.h / h);
  w *= k; h *= k;
  return { w, h };
}

/**
 * 中心比例 → 限制在安全區內的矩形（px）。
 * fixed 的元素（聲音提示）一律以畫面中心（準心）為中心，忽略使用者存的位置；vp 是視窗大小。
 */
export function rectOf(def: ElementDef, item: ItemState, safe: Rect, vp?: { w: number; h: number }): Rect {
  const { w, h } = sizeOf(def, item.s, safe);
  const cx = def.fixed ? (vp ? vp.w / 2 : safe.x + safe.w / 2) : safe.x + item.x * safe.w;
  const cy = def.fixed ? (vp ? vp.h / 2 : safe.y + safe.h / 2) : safe.y + item.y * safe.h;
  return {
    x: clamp(cx - w / 2, safe.x, safe.x + safe.w - w),
    y: clamp(cy - h / 2, safe.y, safe.y + safe.h - h),
    w, h,
  };
}

export function resolveAll(slot: LayoutSlot, safe: Rect, vp?: { w: number; h: number }): Record<ElementId, Rect> {
  const out = {} as Record<ElementId, Rect>;
  for (const d of ELEMENT_DEFS) out[d.id] = rectOf(d, itemOf(slot, d.id), safe, vp);
  return out;
}

/** 像素矩形 → 中心比例（存檔用） */
export function ratioOf(rect: Rect, safe: Rect): { x: number; y: number } {
  return { x: (rect.x + rect.w / 2 - safe.x) / safe.w, y: (rect.y + rect.h / 2 - safe.y) / safe.h };
}

// ---------------------------------------------------------------- 重疊
export function overlaps(a: Rect, b: Rect, eps = 0.5): boolean {
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;
}

export function findOverlaps(rects: Partial<Record<ElementId, Rect>>): [ElementId, ElementId][] {
  const ids = (Object.keys(rects) as ElementId[]).filter((id) => !DEF_BY_ID[id].fixed); // 固定在準心的提示圈是透明覆蓋層，不算重疊
  const out: [ElementId, ElementId][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (overlaps(rects[ids[i]]!, rects[ids[j]]!)) out.push([ids[i], ids[j]]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- 吸附
export interface SnapOptions { grid: boolean; gridStep: number; threshold: number }
export interface SnapResult { rect: Rect; guideX: number | null; guideY: number | null }

/** 先限制在安全區，再吸附到格線與其他元素的邊緣 / 中線。 */
export function snapRect(rect: Rect, others: Rect[], safe: Rect, opt: SnapOptions): SnapResult {
  const cl = (r: Rect): Rect => ({
    ...r,
    x: clamp(r.x, safe.x, safe.x + safe.w - r.w),
    y: clamp(r.y, safe.y, safe.y + safe.h - r.h),
  });
  let r = cl(rect);
  const axis = (pos: number, size: number, origin: number, lines: number[]): { delta: number; guide: number | null } => {
    const feats = [pos, pos + size / 2, pos + size];
    let best = { d: opt.threshold + 1, delta: 0, guide: null as number | null };
    for (const f of feats) {
      for (const ln of lines) {
        const d = Math.abs(ln - f);
        if (d < best.d) best = { d, delta: ln - f, guide: ln };
      }
    }
    void origin;
    return best.d <= opt.threshold ? { delta: best.delta, guide: best.guide } : { delta: 0, guide: null };
  };
  const xs: number[] = [safe.x, safe.x + safe.w / 2, safe.x + safe.w];
  const ys: number[] = [safe.y, safe.y + safe.h / 2, safe.y + safe.h];
  for (const o of others) {
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  if (opt.grid && opt.gridStep > 4) {
    for (let g = safe.x; g <= safe.x + safe.w + 0.5; g += opt.gridStep) xs.push(g);
    for (let g = safe.y; g <= safe.y + safe.h + 0.5; g += opt.gridStep) ys.push(g);
  }
  const sx = axis(r.x, r.w, safe.x, xs);
  const sy = axis(r.y, r.h, safe.y, ys);
  r = cl({ ...r, x: r.x + sx.delta, y: r.y + sy.delta });
  return { rect: r, guideX: sx.guide, guideY: sy.guide };
}

export const gridStepOf = (safe: Rect): number => Math.max(12, Math.round(refSize(safe) / 10));

// ---------------------------------------------------------------- 存檔遷移
const num = (v: unknown, fb: number, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fb;

function sanitizeItems(raw: unknown): LayoutSlot['items'] {
  const out: LayoutSlot['items'] = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of ELEMENT_IDS) {
    const r = (raw as Record<string, unknown>)[id];
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const d = defaultItem(id);
    out[id] = {
      x: num(o.x, d.x, 0, 1), y: num(o.y, d.y, 0, 1),
      s: num(o.s, 1, SCALE_MIN, SCALE_MAX), o: num(o.o, 1, OPACITY_MIN, OPACITY_MAX),
    };
  }
  return out;
}

/**
 * 讀檔遷移：任何來源（沒有、損毀、舊版、未來版本）都會變成合法的目前版本。
 * v0（無 version 的早期草稿）：{ items: {...} } 只有單一配置 → 放進配置 1。
 */
export function migrateStore(raw: unknown): LayoutStore {
  const base = defaultStore();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const ver = typeof r.version === 'number' ? r.version : 0;
  if (ver < 1) {
    if (r.items) base.slots[0].items = sanitizeItems(r.items);
    return base;
  }
  // v1（含未來版本的欄位盡量保留已知部分）
  if (Array.isArray(r.slots)) {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = r.slots[i] as Record<string, unknown> | undefined;
      if (!s || typeof s !== 'object') continue;
      const name = typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 12) : base.slots[i].name;
      base.slots[i] = { name, items: sanitizeItems(s.items) };
    }
  }
  base.active = Math.round(num(r.active, 0, 0, SLOT_COUNT - 1));
  base.grid = typeof r.grid === 'boolean' ? r.grid : true;
  return base;
}
