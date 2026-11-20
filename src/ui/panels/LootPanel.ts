import type { ContainerLootDef } from '../../data/lootTables';
import { getItem } from '../../data/items';
import type { ItemStack, Slot } from '../../items/Inventory';
import { btn, clear, el, fmtCredits } from '../dom';
import { InvCtx, bodyColumn, detailPane, itemCell, itemInfo, qtyStepper } from '../ItemWidgets';
import { panelFrame, type Panel, type Ui } from '../Ui';

/** 搜刮容器的介面：左 = 容器內容，中 = 背包，右 = 詳細。可以一件一件拿或全部拿走 */
export class LootPanel implements Panel {
  readonly el: HTMLElement;
  private ctx: InvCtx;
  private colA = el('div', 'col col-a');
  private colB = el('div', 'col col-b');
  private colC = el('div', 'col col-c');
  private unsub: () => void;

  /** loot 會被就地修改（拿走的就從陣列移除），場景保留同一個陣列即可記住剩餘內容 */
  constructor(private ui: Ui, private def: ContainerLootDef, private loot: Slot[]) {
    const f = panelFrame(ui, def.name, { showCredits: false });
    this.el = f.root;
    f.body.className = 'panel-body cols three loot';
    f.body.append(this.colA, this.colB, this.colC);
    this.ctx = new InvCtx(ui, () => this.render());
    this.ctx.lootSlots = loot;
    this.unsub = ui.economy.subscribe(() => this.render());
    this.render();
  }

  private take(index: number, qty: number): void {
    const { ui, loot } = this;
    const s = loot[index];
    if (!s) return;
    const n = Math.min(qty, s.qty);
    const r = ui.economy.lootItem(s.id, n, s.dur);
    if (!r.ok) { ui.toast(r.reason, 'err'); return; }
    s.qty -= r.taken;
    if (s.qty <= 0) loot[index] = null;
    ui.bus.emit('itemPicked', { itemId: s.id, qty: r.taken });
    ui.noise('item_pickup');
    if (r.taken < n) ui.toast('背包放不下全部，只拿了一部分', 'info');
  }

  private takeAll(): void {
    const { ui, loot } = this;
    let any = false;
    let blocked = '';
    for (let i = 0; i < loot.length; i++) {
      const s = loot[i];
      if (!s) continue;
      const r = ui.economy.lootItem(s.id, s.qty, s.dur);
      if (!r.ok) { blocked = r.reason; continue; }
      any = true;
      s.qty -= r.taken;
      if (s.qty <= 0) loot[i] = null;
      ui.bus.emit('itemPicked', { itemId: s.id, qty: r.taken });
    ui.noise('item_pickup');
      if (s.qty > 0) blocked = '背包已滿';
    }
    if (blocked) ui.toast(any ? `部分物品沒拿走：${blocked}` : blocked, 'err');
    this.ctx.select(null);
  }

  private lootDetail(index: number): HTMLElement | null {
    const { ctx, ui } = this;
    const s = this.loot[index];
    if (!s) return null;
    const wrap = el('div');
    wrap.appendChild(itemInfo(ctx, s));
    const actions = el('div', 'actions');
    if (s.qty > 1) actions.appendChild(qtyStepper(ctx, s.qty));
    const b = btn(`拿取${s.qty > 1 ? ` × ${ctx.qty}` : ''}`, () => { this.take(index, ctx.qty); ctx.select(null); }, 'primary');
    b.dataset.action = 'take';
    actions.appendChild(b);
    wrap.appendChild(actions);
    void ui;
    return wrap;
  }

  private render(): void {
    const { ctx, loot } = this;
    ctx.validate();
    clear(this.colA); clear(this.colB); clear(this.colC);

    const left = loot.filter((s): s is ItemStack => !!s);
    const head = el('div', 'col-head');
    head.append(el('b', '', this.def.name), el('span', '', left.length ? `${left.length} 件` : '空了'));
    this.colA.appendChild(head);
    const grid = el('div', 'grid loot-grid');
    const total = Math.max(this.loot.length, 4);
    for (let i = 0; i < total; i++) {
      const s = loot[i] ?? null;
      grid.appendChild(itemCell(s, {
        selected: ctx.selection?.kind === 'loot' && ctx.selection.index === i,
        title: s ? getItem(s.id)?.name : undefined,
        onClick: s ? () => { ctx.ui.audio.playUi('click', 0.4); ctx.select({ kind: 'loot', index: i }); } : undefined,
      }));
    }
    this.colA.appendChild(grid);
    const all = btn('全部拿走', () => this.takeAll(), 'primary');
    all.dataset.action = 'take-all';
    if (left.length === 0) all.setAttribute('disabled', '');
    this.colA.appendChild(all);
    this.colA.appendChild(el('small', 'hint', `剩餘價值約 ${fmtCredits(ctx.eco.valueOfAll(left))}`));

    this.colB.appendChild(bodyColumn(ctx));
    this.colC.appendChild(detailPane(ctx, {
      hub: false,
      hint: '點選容器內的物品後按「拿取」，或直接「全部拿走」。',
      extra: (sel) => (sel.kind === 'loot' ? this.lootDetail(sel.index) : null),
    }));
  }

  dispose(): void { this.unsub(); }
}
