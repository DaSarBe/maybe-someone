import { ARMOR_STATS, BACKPACK_STATS } from '../data/gear';
import { CATEGORY_NAMES, RARITY_COLORS, RARITY_NAMES, getItem } from '../data/items';
import { WEAPON_STATS } from '../data/weapons';
import { CONTAINER_NAMES, type ContainerId, type Loc } from '../economy/EconomyService';
import type { ItemStack } from '../items/Inventory';
import { EQUIP_SLOTS, itemMaxDur, type EquipSlot } from '../items/Profile';
import { btn, el, fmtCredits, fmtKg } from './dom';
import type { Ui } from './Ui';

export type Selection =
  | { kind: 'slot'; loc: Loc }
  | { kind: 'equip'; slot: EquipSlot }
  | { kind: 'loot'; index: number }
  | { kind: 'shop'; id: string }
  | { kind: 'sell'; loc: Loc }
  | null;

type DragSrc = { kind: 'slot'; loc: Loc } | { kind: 'equip'; slot: EquipSlot };
let dragSrc: DragSrc | null = null;

export const EQUIP_LABELS: Record<EquipSlot, string> = { primary: '主武器', secondary: '副武器', armor: '護甲', backpack: '背包' };

/** 面板共用的狀態：目前選取的物品與要操作的數量 */
export class InvCtx {
  selection: Selection = null;
  qty = 1;
  armedDrop = false;
  /** 容器介面的內容（Raid 搜刮）；其他面板為 null */
  lootSlots: (ItemStack | null)[] | null = null;

  constructor(public ui: Ui, public onChange: () => void) {}

  get eco() { return this.ui.economy; }

  stackOf(sel: Selection = this.selection): ItemStack | null {
    if (!sel) return null;
    switch (sel.kind) {
      case 'slot': case 'sell': return this.eco.view(sel.loc.c).slots[sel.loc.i] ?? null;
      case 'equip': return this.eco.profile.equipment[sel.slot];
      case 'loot': return this.lootSlots?.[sel.index] ?? null;
      case 'shop': return { id: sel.id, qty: 1 };
    }
  }

  select(sel: Selection, resetQty = true): void {
    this.selection = sel;
    this.armedDrop = false;
    if (resetQty) {
      const s = sel?.kind === 'shop' ? null : this.stackOf(sel);
      this.qty = s ? s.qty : 1;
    }
    this.onChange();
  }

  /** 每次重繪前呼叫：選取的物品不存在了就取消，數量不超過堆疊 */
  validate(): void {
    const sel = this.selection;
    if (!sel || sel.kind === 'shop') return;
    const s = this.stackOf(sel);
    if (!s) { this.selection = null; this.qty = 1; return; }
    this.qty = Math.max(1, Math.min(this.qty, s.qty));
  }
}

// ---------------------------------------------------------------- 物品格
export interface CellOpts {
  selected?: boolean;
  onClick?: () => void;
  drag?: DragSrc;
  onDrop?: (src: DragSrc) => void;
  placeholder?: string;
  title?: string;
  /** 顯示在格子上方的小標籤（例如價格） */
  tag?: string;
}

export function itemCell(stack: ItemStack | null, o: CellOpts = {}): HTMLElement {
  const cell = el('div', 'cell');
  if (o.title) cell.title = o.title;
  const def = stack ? getItem(stack.id) : undefined;
  if (stack && def) {
    const rc = RARITY_COLORS[def.rarity];
    cell.style.setProperty('--rc', rc);
    cell.style.setProperty('--ic', def.icon.color);
    cell.classList.add('filled');
    const g = el('span', 'glyph', def.icon.glyph);
    g.style.color = def.icon.color;
    cell.appendChild(g);
    if (stack.qty > 1) cell.appendChild(el('span', 'qty', String(stack.qty)));
    if (stack.dur !== undefined) {
      const max = itemMaxDur(stack.id) || 1;
      const bar = el('span', 'dur');
      const fill = el('i');
      fill.style.width = `${Math.round((stack.dur / max) * 100)}%`;
      bar.appendChild(fill);
      cell.appendChild(bar);
    }
    if (o.tag) cell.appendChild(el('span', 'tag', o.tag));
    cell.dataset.item = stack.id;
  } else {
    cell.classList.add('empty');
    if (o.placeholder) cell.appendChild(el('span', 'ph', o.placeholder));
  }
  if (o.selected) cell.classList.add('sel');
  if (o.onClick) cell.addEventListener('click', o.onClick);
  if (o.drag && stack) {
    cell.draggable = true;
    cell.addEventListener('dragstart', (e) => {
      dragSrc = o.drag!;
      e.dataTransfer?.setData('text/plain', stack.id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      cell.classList.add('dragging');
    });
    cell.addEventListener('dragend', () => { dragSrc = null; cell.classList.remove('dragging'); });
  }
  if (o.onDrop) {
    cell.addEventListener('dragover', (e) => { if (dragSrc) { e.preventDefault(); cell.classList.add('over'); } });
    cell.addEventListener('dragleave', () => cell.classList.remove('over'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      cell.classList.remove('over');
      const src = dragSrc;
      dragSrc = null;
      if (src) o.onDrop!(src);
    });
  }
  return cell;
}

const sameLoc = (a: Loc, b: Loc) => a.c === b.c && a.i === b.i;
const isSelected = (ctx: InvCtx, loc: Loc) =>
  (ctx.selection?.kind === 'slot' || ctx.selection?.kind === 'sell') && sameLoc(ctx.selection.loc, loc);

/** 把拖放或點選的來源移到某個容器格 */
function moveSourceTo(ctx: InvCtx, src: DragSrc, c: ContainerId, i: number, qty?: number): void {
  const eco = ctx.eco;
  if (src.kind === 'slot') {
    if (sameLoc(src.loc, { c, i })) return;
    const r = eco.moveItem(src.loc, { c, i }, qty);
    if (ctx.ui.report(r)) ctx.ui.audio.playUi('drop', 0.5);
  } else {
    if (ctx.ui.report(eco.unequip(src.slot, c))) ctx.ui.audio.playUi('drop', 0.5);
  }
}

/** 某個容器的格子網格 */
export function containerGrid(ctx: InvCtx, c: ContainerId): HTMLElement {
  const v = ctx.eco.view(c);
  const grid = el('div', 'grid');
  grid.dataset.container = c;
  v.slots.forEach((s, i) => {
    const loc: Loc = { c, i };
    const cell = itemCell(s, {
      selected: isSelected(ctx, loc),
      drag: s ? { kind: 'slot', loc } : undefined,
      title: s ? getItem(s.id)?.name : undefined,
      onClick: () => {
        const sel = ctx.selection;
        if (!s && sel && (sel.kind === 'slot' || sel.kind === 'equip')) {
          moveSourceTo(ctx, sel.kind === 'slot' ? { kind: 'slot', loc: sel.loc } : { kind: 'equip', slot: sel.slot }, c, i, sel.kind === 'slot' ? ctx.qty : undefined);
          ctx.select(null);
          return;
        }
        ctx.ui.audio.playUi('click', 0.4);
        ctx.select({ kind: 'slot', loc });
      },
      onDrop: (src) => { moveSourceTo(ctx, src, c, i); ctx.select(null); },
    });
    if (i >= v.capacity) cell.classList.add('overflow');
    grid.appendChild(cell);
  });
  return grid;
}

/** 容器標題與使用量 */
export function containerHeader(ctx: InvCtx, c: ContainerId, extra?: string): HTMLElement {
  const v = ctx.eco.view(c);
  const h = el('div', 'col-head');
  const over = v.used > v.capacity;
  const count = el('span', over ? 'over' : '', `${v.used}/${v.capacity}${over ? ' 超量' : ''}`);
  h.append(el('b', '', CONTAINER_NAMES[c]), count);
  if (extra) h.appendChild(el('small', '', extra));
  return h;
}

/** 四個裝備欄 */
export function equipRow(ctx: InvCtx): HTMLElement {
  const row = el('div', 'equip-row');
  for (const slot of EQUIP_SLOTS) {
    const s = ctx.eco.profile.equipment[slot];
    const wrap = el('div', 'eq');
    wrap.dataset.slot = slot;
    wrap.appendChild(itemCell(s, {
      selected: ctx.selection?.kind === 'equip' && ctx.selection.slot === slot,
      placeholder: EQUIP_LABELS[slot],
      drag: s ? { kind: 'equip', slot } : undefined,
      title: s ? getItem(s.id)?.name : EQUIP_LABELS[slot],
      onClick: () => {
        const sel = ctx.selection;
        if (!s && sel?.kind === 'slot') {
          if (ctx.ui.report(ctx.eco.equip(sel.loc, slot))) ctx.ui.audio.playUi('select', 0.5);
          ctx.select(null);
          return;
        }
        ctx.ui.audio.playUi('click', 0.4);
        ctx.select({ kind: 'equip', slot });
      },
      onDrop: (src) => {
        if (src.kind === 'slot') {
          if (ctx.ui.report(ctx.eco.equip(src.loc, slot))) ctx.ui.audio.playUi('select', 0.5);
          ctx.select(null);
        }
      },
    }));
    wrap.appendChild(el('span', 'eq-label', EQUIP_LABELS[slot]));
    row.appendChild(wrap);
  }
  return row;
}

/** 負重條 */
export function weightBar(ctx: InvCtx): HTMLElement {
  const info = ctx.eco.carryInfo();
  const box = el('div', 'weight');
  const state = info.ratio >= 1 ? '超重：無法衝刺、移動很慢' : info.ratio > 0.8 ? '負重偏高：移動變慢' : '';
  box.classList.toggle('warn', info.ratio > 0.8 && info.ratio < 1);
  box.classList.toggle('bad', info.ratio >= 1);
  const label = el('div', 'weight-label');
  label.append(el('span', '', '負重'), el('b', '', `${fmtKg(info.weight)} / ${fmtKg(info.max)}`));
  const bar = el('div', 'bar');
  const fill = el('i');
  fill.style.width = `${Math.min(100, info.ratio * 100)}%`;
  bar.appendChild(fill);
  box.append(label, bar);
  if (state) box.appendChild(el('small', '', state));
  return box;
}

/** 「身上」整欄：裝備 + 背包 + 保險袋 + 負重 */
export function bodyColumn(ctx: InvCtx): HTMLElement {
  const col = el('div', 'body-col');
  col.append(el('div', 'col-head', '身上裝備'), equipRow(ctx));
  col.append(containerHeader(ctx, 'carried'), containerGrid(ctx, 'carried'), weightBar(ctx));
  col.append(containerHeader(ctx, 'secure', '死亡也不會掉'), containerGrid(ctx, 'secure'));
  return col;
}

// ---------------------------------------------------------------- 詳細資訊
export function itemInfo(ctx: InvCtx, stack: ItemStack, opts: { price?: { label: string; value: number; fmt?: (n: number) => string } | null } = {}): HTMLElement {
  const def = getItem(stack.id);
  const box = el('div', 'info');
  if (!def) return box;
  const rc = RARITY_COLORS[def.rarity];
  const head = el('div', 'info-head');
  head.appendChild(itemCell({ id: stack.id, qty: 1, dur: stack.dur }, {}));
  const t = el('div', 'info-title');
  const name = el('h3', '', def.name);
  name.style.color = rc;
  const meta = el('div', 'meta', `${RARITY_NAMES[def.rarity]} ・ ${CATEGORY_NAMES[def.category]}`);
  t.append(name, meta);
  head.appendChild(t);
  box.append(head, el('p', 'desc', def.desc));

  const rows: [string, string][] = [];
  rows.push(['重量', `${fmtKg(def.weight)}${stack.qty > 1 ? `（共 ${fmtKg(def.weight * stack.qty)}）` : ''}`]);
  const w = WEAPON_STATS[def.id];
  if (w) {
    rows.push(['欄位', w.slot === 'primary' ? '主武器' : '副武器']);
    rows.push(['傷害', `${w.damage}${w.pellets > 1 ? ` × ${w.pellets}` : ''}`]);
    rows.push(['射速', `${w.fireRate} 發/分`]);
    rows.push(['彈匣', `${stack.dur ?? w.magazine} / ${w.magazine} 發（${getItem(w.ammoType)?.name ?? w.ammoType}）`]);
  }
  const a = ARMOR_STATS[def.id];
  if (a) {
    rows.push(['等級', `${a.tier} 級（減傷 ${Math.round(a.reduction * 100)}%）`]);
    rows.push(['耐久', `${stack.dur ?? a.durability} / ${a.durability}`]);
  }
  const b = BACKPACK_STATS[def.id];
  if (b) rows.push(['容量', `${b.slots} 格 / ${b.maxWeight} kg`]);
  const unit = ctx.eco.sellPriceOf(stack.id);
  if (opts.price !== null) {
    const p = opts.price ?? { label: '估價', value: unit * stack.qty };
    const fmt = p.fmt ?? fmtCredits;
    rows.push([p.label, `${fmt(p.value)}${stack.qty > 1 && !opts.price ? `（單價 ${fmtCredits(unit)}）` : ''}`]);
  }
  const dl = el('dl', 'stats');
  for (const [k, v] of rows) dl.append(el('dt', '', k), el('dd', '', v));
  box.appendChild(dl);
  return box;
}

/** 數量調整列：− / 數字 / + / 全部 */
export function qtyStepper(ctx: InvCtx, max: number): HTMLElement {
  const row = el('div', 'qty-row');
  const set = (n: number) => { ctx.qty = Math.max(1, Math.min(max, n)); ctx.armedDrop = false; ctx.onChange(); };
  const num = el('b', 'qty-num', String(ctx.qty));
  row.append(
    btn('−', () => set(ctx.qty - 1), 'sm'),
    num,
    btn('＋', () => set(ctx.qty + 1), 'sm'),
    btn('½', () => set(Math.ceil(max / 2)), 'sm'),
    btn('全部', () => set(max), 'sm'),
  );
  return row;
}

/** 從選取的格子推導可做的動作 */
export function slotActions(ctx: InvCtx, loc: Loc, stack: ItemStack, hub: boolean): HTMLElement[] {
  const eco = ctx.eco;
  const def = getItem(stack.id)!;
  const out: HTMLElement[] = [];
  const equippable = def.category === 'weapon' || def.category === 'armor' || def.category === 'backpack';
  if (equippable) {
    out.push(btn('裝備', () => {
      if (ctx.ui.report(eco.equip(loc), `已裝備 ${def.name}`)) ctx.select(null);
    }, 'primary'));
  }
  const targets: ContainerId[] = hub ? ['stash', 'carried', 'secure', 'safe'] : ['carried', 'secure'];
  for (const c of targets) {
    if (c === loc.c) continue;
    out.push(btn(`放入${CONTAINER_NAMES[c]}`, () => {
      const r = eco.moveItem(loc, { c }, ctx.qty);
      if (ctx.ui.report(r)) { ctx.ui.audio.playUi('drop', 0.5); ctx.select(null); }
    }));
  }
  if (hub) {
    const gain = eco.sellPriceOf(stack.id) * ctx.qty;
    out.push(btn(`出售 ${fmtCredits(gain)}`, () => {
      if (ctx.ui.report(eco.sell(loc, ctx.qty), `已出售 ${def.name} × ${ctx.qty}（+${fmtCredits(gain)}）`)) ctx.select(null);
    }, 'gold'));
  }
  if (stack.qty > 1) {
    out.push(btn('拆分', () => {
      if (ctx.qty >= stack.qty) { ctx.ui.toast('拆分的數量要小於整堆', 'err'); return; }
      if (ctx.ui.report(eco.splitStack(loc, ctx.qty))) ctx.select(null);
    }));
  }
  out.push(dropButton(ctx, () => eco.dropItem(loc, ctx.qty), def.name));
  return out;
}

/** 丟棄要按兩次確認 */
function dropButton(ctx: InvCtx, run: () => { ok: boolean; reason?: string }, name: string): HTMLElement {
  const armed = ctx.armedDrop;
  return btn(armed ? '再按一次確認丟棄' : '丟棄', () => {
    if (!ctx.armedDrop) { ctx.armedDrop = true; ctx.onChange(); return; }
    if (ctx.ui.report(run(), `已丟棄 ${name}`)) { ctx.ui.audio.playUi('drop', 0.5); ctx.select(null); }
  }, armed ? 'danger armed' : 'danger');
}

/** 右側詳細面板。extra 可以接手特殊選取（loot / shop / sell） */
export function detailPane(
  ctx: InvCtx,
  opts: { hub: boolean; extra?: (sel: NonNullable<Selection>) => HTMLElement | null; hint?: string },
): HTMLElement {
  const pane = el('div', 'detail');
  const sel = ctx.selection;
  if (!sel) {
    pane.appendChild(el('p', 'hint', opts.hint ?? '點選物品查看詳情與操作。\n也可以直接拖曳到想放的格子（電腦），或先點物品再點空格（手機）。'));
    return pane;
  }
  const special = opts.extra?.(sel);
  if (special) { pane.appendChild(special); return pane; }
  const stack = ctx.stackOf(sel);
  if (!stack) return pane;
  pane.appendChild(itemInfo(ctx, stack));
  const actions = el('div', 'actions');
  if (stack.qty > 1) actions.appendChild(qtyStepper(ctx, stack.qty));
  if (sel.kind === 'slot') {
    for (const b of slotActions(ctx, sel.loc, stack, opts.hub)) actions.appendChild(b);
  } else if (sel.kind === 'equip') {
    actions.appendChild(btn('卸下', () => { if (ctx.ui.report(ctx.eco.unequip(sel.slot))) ctx.select(null); }, 'primary'));
    if (opts.hub) actions.appendChild(btn('卸下到背包', () => { if (ctx.ui.report(ctx.eco.unequip(sel.slot, 'carried'))) ctx.select(null); }));
  }
  pane.appendChild(actions);
  return pane;
}
