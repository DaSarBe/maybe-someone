import type { Game } from '../../core/Game';
import { el } from '../dom';
import {
  DEF_BY_ID, ELEMENT_DEFS, OPACITY_MAX, OPACITY_MIN, SCALE_MAX, SCALE_MIN,
  cloneStore, findOverlaps, gridStepOf, itemOf, overlaps, ratioOf, rectOf, resolveAll, snapRect,
  type ElementDef, type ElementId, type LayoutStore, type Rect,
} from './model';

const SNAP_PX = 8;
const TOOL_W = 214;

/** 編輯器裡每個元素的示意內容（用跟遊戲相同的 CSS 類別，看起來就是實際的樣子） */
function mockOf(id: ElementId): HTMLElement {
  switch (id) {
    case 'stick': {
      const b = el('div', 'mc-base le-stick');
      b.appendChild(el('div', 'mc-knob'));
      return b;
    }
    case 'fireL': case 'fireR': return el('div', 'mc-btn mc-fire', '射擊');
    case 'inventory': return el('div', 'mc-btn mc-sm', '背包');
    case 'swap': return el('div', 'mc-btn mc-sm', '切換');
    case 'heal': return el('div', 'mc-btn mc-sm', '治療');
    case 'menu': return el('div', 'mc-btn le-menu', '☰');
    case 'aim': return el('div', 'mc-btn', '瞄準');
    case 'jump': return el('div', 'mc-btn', '跳');
    case 'crouch': return el('div', 'mc-btn', '蹲');
    case 'reload': return el('div', 'mc-btn', '換彈');
    case 'interact': return el('div', 'mc-btn', '互動');
    case 'timer': {
      const t = el('div', 'hud-timer');
      const bar = el('div', 'bar');
      const i = el('i'); i.style.width = '64%'; bar.appendChild(i);
      t.append(el('span', 'hud-timer-label', '時空穩定度'), el('b', '', '12:34'), bar);
      return t;
    }
    case 'ammo': {
      const a = el('div', 'cb-tbox cb-ammobox');
      const ammo = el('div', 'cb-ammo'); ammo.innerHTML = '<b>28</b><span> / 120</span>';
      a.append(el('div', 'cb-wname', '主 AK-74'), ammo);
      return a;
    }
    case 'hp': {
      const b = el('div', 'cb-tbox cb-hpbox');
      const bar = el('div', 'cb-bar cb-hp');
      const i = el('i'); i.style.width = '72%'; bar.append(i, el('b', '', '72'));
      b.appendChild(bar);
      return b;
    }
    case 'armor': {
      const b = el('div', 'cb-tbox cb-armorbox');
      const bar = el('div', 'cb-bar cb-armor');
      const i = el('i'); i.style.width = '55%'; bar.append(i, el('span', '', '護甲 55/100'));
      b.appendChild(bar);
      return b;
    }
    case 'credits': return el('div', 'hud-credits', '¥12,500');
    case 'prompt': {
      const box = el('div', 'hud-promptbox lay');
      const prog = el('div', 'hud-progress');
      const bar = el('div', 'bar'); const i = el('i'); i.style.width = '40%'; bar.appendChild(i);
      prog.append(el('span', '', '搜索中'), bar);
      box.append(prog, el('div', 'hud-prompt', '按住「互動」搜索：鐵製儲物櫃'));
      return box;
    }
    case 'hitdir': {
      const w = el('div', 'cb-dirs le-dirs');
      for (const a of [0, 120, 240]) {
        const d = el('div', 'cb-dir');
        d.style.transform = `rotate(${a}deg)`;
        d.style.animation = 'none';
        d.style.opacity = a === 0 ? '1' : '.45';
        w.appendChild(d);
      }
      return w;
    }
  }
}

interface ItemView { id: ElementId; box: HTMLElement; inner: HTMLElement }

/**
 * 按鍵配置編輯器（全螢幕）。所有編輯都在「草稿」上進行，按「儲存」才寫入 SaveService。
 * 電腦版也能用滑鼠操作（pointer events），方便測試。
 */
export class LayoutEditor {
  private root = el('div', 'le-root');
  private gridEl = el('div', 'le-grid');
  private safeEl = el('div', 'le-safe');
  private guideV = el('div', 'le-guide v hidden');
  private guideH = el('div', 'le-guide h hidden');
  private bar = el('div', 'le-bar');
  private tool = el('div', 'le-tool hidden');
  private pill = el('div', 'le-pill');
  private views = new Map<ElementId, ItemView>();
  private draft: LayoutStore;
  private selected: ElementId | null = null;
  private dirty = false;
  private cancelArmed: number | null = null;
  private renaming = false;
  private unsub: () => void;
  private tabsEl = el('div', 'le-tabs');
  private gridBtn = el('button', 'le-btn');
  private cancelBtn = el('button', 'le-btn');
  private sizeIn = el('input');
  private sizeOut = el('output');
  private opIn = el('input');
  private opOut = el('output');
  private toolTitle = el('b');
  private hinted = true;
  /** 上方列的偏好位置（可手動切換；選取的元素被蓋住時會自動換邊） */
  private preferBottom: boolean | null = null; // null = 自動挑遮住元素最少的一邊
  /** 使用者拖曳標題把上方列移到的位置（有的話優先於自動位置） */
  private barAtBottom = false;
  private customBar: { x: number; y: number } | null = null;

  constructor(private game: Game, private onClose: () => void) {
    this.draft = cloneStore(game.layout.data);
    document.body.classList.add('layout-editing');
    document.body.appendChild(this.root);

    this.root.append(this.gridEl, this.safeEl);
    for (const d of ELEMENT_DEFS) this.root.appendChild(this.makeView(d).box);
    this.root.append(this.guideV, this.guideH, this.pill, this.bar, this.tool);
    this.buildBar();
    this.buildTool();

    // 點空白處取消選取
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root || e.target === this.safeEl || e.target === this.gridEl) this.select(null);
    });
    this.unsub = game.layout.subscribe(() => { this.renderAll(); this.placePanels(); });
    this.renderAll();
    this.placePanels();
  }

  dispose(): void {
    this.unsub();
    if (this.cancelArmed !== null) clearTimeout(this.cancelArmed);
    document.body.classList.remove('layout-editing');
    this.root.remove();
  }

  // ---------------------------------------------------------------- 資料
  private get slot() { return this.draft.slots[this.draft.active]; }
  private get safe(): Rect { return this.game.layout.safe; }
  private rects(): Record<ElementId, Rect> { return resolveAll(this.slot, this.safe); }

  private setItem(id: ElementId, patch: Partial<{ x: number; y: number; s: number; o: number }>): void {
    this.slot.items[id] = { ...itemOf(this.slot, id), ...patch };
    this.dirty = true;
  }

  // ---------------------------------------------------------------- 畫面
  private makeView(def: ElementDef): ItemView {
    const box = el('div', 'le-item');
    box.dataset.id = def.id;
    box.dataset.group = def.group;
    const tag = el('span', 'le-tag', def.label);
    const inner = el('div', 'le-inner');
    inner.appendChild(mockOf(def.id));
    box.append(inner, tag);
    const v: ItemView = { id: def.id, box, inner };
    this.views.set(def.id, v);
    this.bindDrag(v);
    return v;
  }

  private bindDrag(v: ItemView): void {
    let pid: number | null = null;
    let offX = 0, offY = 0;
    let others: Rect[] = [];
    v.box.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (pid !== null) return;
      pid = e.pointerId;
      v.box.setPointerCapture(e.pointerId);
      const r = this.rects()[v.id];
      offX = e.clientX - r.x; offY = e.clientY - r.y;
      const all = this.rects();
      others = ELEMENT_DEFS.filter((d) => d.id !== v.id).map((d) => all[d.id]);
      this.select(v.id);
      this.hideHint();
    });
    v.box.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      const cur = this.rects()[v.id];
      const want: Rect = { x: e.clientX - offX, y: e.clientY - offY, w: cur.w, h: cur.h };
      const safe = this.safe;
      const snapped = snapRect(want, others, safe, { grid: this.draft.grid, gridStep: gridStepOf(safe), threshold: SNAP_PX });
      const c = ratioOf(snapped.rect, safe);
      this.setItem(v.id, c);
      this.renderAll();
      this.showGuides(snapped.guideX, snapped.guideY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = null;
      this.showGuides(null, null);
      this.placePanels();
    };
    v.box.addEventListener('pointerup', end);
    v.box.addEventListener('pointercancel', end);
  }

  private showGuides(gx: number | null, gy: number | null): void {
    this.guideV.classList.toggle('hidden', gx === null);
    this.guideH.classList.toggle('hidden', gy === null);
    if (gx !== null) this.guideV.style.left = `${gx}px`;
    if (gy !== null) this.guideH.style.top = `${gy}px`;
  }

  private renderAll(): void {
    const safe = this.safe;
    const rects = this.rects();
    this.safeEl.style.cssText = `left:${safe.x}px;top:${safe.y}px;width:${safe.w}px;height:${safe.h}px`;
    const step = gridStepOf(safe);
    this.gridEl.style.cssText = `left:${safe.x}px;top:${safe.y}px;width:${safe.w}px;height:${safe.h}px;background-size:${step}px ${step}px`;
    this.gridEl.classList.toggle('hidden', !this.draft.grid);
    for (const d of ELEMENT_DEFS) {
      const v = this.views.get(d.id)!;
      const r = rects[d.id];
      const b = v.box.style;
      b.left = `${r.x}px`; b.top = `${r.y}px`; b.width = `${r.w}px`; b.height = `${r.h}px`;
      b.opacity = String(itemOf(this.slot, d.id).o);
      this.fitInner(v, d, r);
    }
    const bad = new Set<ElementId>();
    const pairs = findOverlaps(rects);
    for (const [a, b] of pairs) { bad.add(a); bad.add(b); }
    for (const [id, v] of this.views) {
      v.box.classList.toggle('bad', bad.has(id));
      v.box.classList.toggle('sel', id === this.selected);
    }
    this.updatePill(pairs.length);
    this.gridBtn.classList.toggle('on', this.draft.grid);
    this.gridBtn.textContent = this.draft.grid ? '格線吸附：開' : '格線吸附：關';
    this.renderTabs();
    this.syncTool();
  }

  /** 示意內容縮放到元素的矩形 */
  private fitInner(v: ItemView, def: ElementDef, r: Rect): void {
    const s = v.inner.style;
    if (def.apply === 'px') {
      s.cssText = `position:absolute;inset:0;--u:${Math.min(r.w, r.h)}px`;
      return;
    }
    const nat = def.nat!;
    const k = r.w / nat.w;
    if (def.apply === 'scale') {
      s.cssText = `position:absolute;left:0;top:0;width:${nat.w}px;height:${nat.h}px;transform-origin:0 0;transform:scale(${k})`;
    } else {
      s.cssText = `position:absolute;left:50%;top:50%;width:0;height:0;transform-origin:0 0;transform:scale(${k})`;
    }
  }

  private updatePill(n: number): void {
    const warn = n > 0;
    this.pill.classList.toggle('warn', warn);
    this.pill.classList.toggle('hidden', !warn && !this.hinted);
    if (warn) this.pill.textContent = `有 ${n} 組元素重疊（紅框）。仍可儲存，但實戰時可能誤觸。`;
    else this.pill.textContent = '拖曳元素移動；點一下選取後可調整大小與透明度。';
  }

  private hideHint(): void { this.hinted = false; this.renderAll(); }

  // ---------------------------------------------------------------- 上方工具列
  private buildBar(): void {
    this.bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    const title = el('span', 'le-title', '⠿ 按鍵配置');
    title.title = '拖曳可移動工具列';
    this.bindBarDrag(title);
    this.gridBtn.type = 'button';
    this.gridBtn.addEventListener('click', () => { this.draft.grid = !this.draft.grid; this.dirty = true; this.renderAll(); });
    const reset = this.mkBtn('恢復預設', () => {
      this.slot.items = {};
      this.dirty = true;
      this.renderAll();
      this.placePanels();
    });
    this.cancelBtn = this.mkBtn('取消', () => this.cancel());
    const save = this.mkBtn('儲存', () => this.save(), 'primary');
    const flip = this.mkBtn('⇅', () => { this.customBar = null; this.preferBottom = !(this.preferBottom ?? this.barAtBottom); this.placePanels(); });
    flip.title = '工具列移到另一邊';
    flip.setAttribute('aria-label', '工具列移到另一邊');
    const rename = this.mkBtn('改名', () => { this.renaming = true; this.renderTabs(); });
    rename.classList.add('le-rename');
    this.bar.append(title, this.tabsEl, rename, this.gridBtn, reset, this.cancelBtn, save, flip);
  }

  private bindBarDrag(handle: HTMLElement): void {
    let pid: number | null = null;
    let ox = 0, oy = 0;
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pid = e.pointerId;
      handle.setPointerCapture(e.pointerId);
      const r = this.bar.getBoundingClientRect();
      ox = e.clientX - r.x; oy = e.clientY - r.y;
    });
    handle.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      this.customBar = {
        x: Math.min(Math.max(0, e.clientX - ox), vw - this.bar.offsetWidth),
        y: Math.min(Math.max(0, e.clientY - oy), vh - this.bar.offsetHeight),
      };
      this.placePanels();
    });
    const end = (e: PointerEvent) => { if (e.pointerId === pid) pid = null; };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  private mkBtn(label: string, fn: () => void, cls = ''): HTMLButtonElement {
    const b = el('button', `le-btn ${cls}`.trim(), label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  private renderTabs(): void {
    if (this.renaming && this.tabsEl.querySelector('input')) return;
    this.tabsEl.replaceChildren();
    this.draft.slots.forEach((s, i) => {
      if (this.renaming && i === this.draft.active) {
        const inp = el('input', 'le-name');
        inp.value = s.name; inp.maxLength = 12;
        const done = () => {
          if (!this.renaming) return;
          this.renaming = false;
          const nm = inp.value.trim().slice(0, 12);
          if (nm && nm !== s.name) { s.name = nm; this.dirty = true; }
          this.renderTabs();
        };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
        inp.addEventListener('blur', done);
        this.tabsEl.appendChild(inp);
        window.setTimeout(() => { inp.focus(); inp.select(); }, 0);
        return;
      }
      const b = el('button', `le-tab${i === this.draft.active ? ' on' : ''}`, s.name);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (i === this.draft.active) return;
        this.draft.active = i;
        this.dirty = true;
        this.select(null);
        this.renderAll();
        this.placePanels();
      });
      this.tabsEl.appendChild(b);
    });
  }

  private cancel(): void {
    if (this.dirty && this.cancelArmed === null) {
      this.cancelBtn.textContent = '再按一次放棄修改';
      this.cancelBtn.classList.add('armed');
      this.cancelArmed = window.setTimeout(() => {
        this.cancelArmed = null;
        this.cancelBtn.textContent = '取消';
        this.cancelBtn.classList.remove('armed');
      }, 3000);
      return;
    }
    this.close();
  }

  private save(): void {
    this.game.layout.commit(this.draft);
    this.close();
  }

  private close(): void {
    this.dispose();
    this.onClose();
  }

  // ---------------------------------------------------------------- 元素工具列（大小 / 透明度 / 重設）
  private buildTool(): void {
    this.tool.addEventListener('pointerdown', (e) => e.stopPropagation());
    const head = el('div', 'le-tool-head');
    const x = this.mkBtn('✕', () => this.select(null));
    x.classList.add('sm');
    head.append(this.toolTitle, x);
    const mk = (label: string, input: HTMLInputElement, out: HTMLOutputElement, min: number, max: number, fn: (v: number) => void) => {
      const row = el('label', 'le-row');
      input.type = 'range'; input.min = String(min); input.max = String(max); input.step = '5';
      input.addEventListener('input', () => { out.textContent = `${input.value}%`; fn(Number(input.value) / 100); });
      row.append(el('span', '', label), input, out);
      return row;
    };
    const sizeRow = mk('大小', this.sizeIn, this.sizeOut, SCALE_MIN * 100, SCALE_MAX * 100, (v) => this.rescale(v));
    const opRow = mk('透明度', this.opIn, this.opOut, OPACITY_MIN * 100, OPACITY_MAX * 100, (v) => {
      if (this.selected) { this.setItem(this.selected, { o: v }); this.renderAll(); }
    });
    const reset = this.mkBtn('重設此項', () => {
      if (!this.selected) return;
      delete this.slot.items[this.selected];
      this.dirty = true;
      this.renderAll();
      this.placePanels();
    });
    this.tool.append(head, sizeRow, opRow, reset);
  }

  private rescale(s: number): void {
    const id = this.selected;
    if (!id) return;
    const cur = itemOf(this.slot, id);
    const rect = rectOf(DEF_BY_ID[id], { ...cur, s }, this.safe); // 放大後被推回安全區內的位置
    this.setItem(id, { s, ...ratioOf(rect, this.safe) });
    this.renderAll();
  }

  private select(id: ElementId | null): void {
    this.selected = id;
    this.tool.classList.toggle('hidden', id === null);
    this.renderAll();
    this.placePanels();
  }

  private syncTool(): void {
    const id = this.selected;
    if (!id) return;
    const it = itemOf(this.slot, id);
    this.toolTitle.textContent = DEF_BY_ID[id].label;
    this.sizeIn.value = String(Math.round(it.s * 100));
    this.sizeOut.textContent = `${Math.round(it.s * 100)}%`;
    this.opIn.value = String(Math.round(it.o * 100));
    this.opOut.textContent = `${Math.round(it.o * 100)}%`;
  }

  /** 工具列不擋住正在編輯的元素：上方列在元素被蓋住時移到下方；元素工具列放在元素的另一側 */
  private placePanels(): void {
    const safe = this.safe;
    const vw = window.innerWidth, vh = window.innerHeight;
    const sel = this.selected ? this.rects()[this.selected] : null;
    const pad = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 });

    // 上方列
    const bw = this.bar.offsetWidth, bh = this.bar.offsetHeight;
    const bx = Math.max(safe.x, (vw - bw) / 2);
    const top: Rect = { x: bx, y: safe.y, w: bw, h: bh };
    const bottom: Rect = { x: bx, y: safe.y + safe.h - bh, w: bw, h: bh };
    const hitTop = !!sel && overlaps(pad(sel, 4), top), hitBottom = !!sel && overlaps(pad(sel, 4), bottom);
    let useBottom: boolean;
    if (this.preferBottom === null) {
      // 自動：遮住元素較少的一邊（選取中的元素優先避開）
      const all = Object.values(this.rects());
      const score = (b: Rect) => all.filter((r) => overlaps(r, b)).length;
      useBottom = hitTop !== hitBottom ? hitTop : score(bottom) < score(top);
    } else {
      useBottom = this.preferBottom ? !(hitBottom && !hitTop) : hitTop && !hitBottom;
    }
    this.barAtBottom = useBottom;
    const barRect: Rect = this.customBar ? { x: this.customBar.x, y: this.customBar.y, w: bw, h: bh } : useBottom ? bottom : top;
    this.bar.style.left = `${barRect.x}px`;
    this.bar.style.top = `${barRect.y}px`;
    this.bar.classList.toggle('bottom', !this.customBar && useBottom);
    void vh;

    // 提示 / 警告條：貼著上方列
    const ph = this.pill.offsetHeight || 24;
    const lower = barRect.y + bh / 2 > window.innerHeight / 2;
    this.pill.style.top = `${lower ? barRect.y - ph - 4 : barRect.y + bh + 4}px`;

    // 元素工具列
    if (!sel) return;
    const th = this.tool.offsetHeight || 150;
    const y = Math.min(Math.max(safe.y + (barRect.y < window.innerHeight / 2 ? bh + 8 : 0), safe.y + (safe.h - th) / 2), safe.y + safe.h - th - (barRect.y >= window.innerHeight / 2 ? bh + 8 : 0));
    const right: Rect = { x: safe.x + safe.w - TOOL_W, y, w: TOOL_W, h: th };
    const left: Rect = { x: safe.x, y, w: TOOL_W, h: th };
    const hitR = overlaps(pad(sel, 4), right), hitL = overlaps(pad(sel, 4), left);
    let pick = right;
    if (hitR && !hitL) pick = left;
    else if (hitR && hitL) pick = sel.x + sel.w / 2 > safe.x + safe.w / 2 ? left : right;
    else if (!hitR && !hitL) pick = sel.x + sel.w / 2 > safe.x + safe.w / 2 ? left : right; // 預設放在元素的另一側
    this.tool.style.left = `${pick.x}px`;
    this.tool.style.top = `${pick.y}px`;
  }
}
