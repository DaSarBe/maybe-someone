import { CATEGORY_NAMES, SHOP_CATEGORIES, getItem, ITEM_LIST } from '../../data/items';
import type { Category } from '../../data/types';
import type { Loc } from '../../economy/EconomyService';
import type { ItemStack } from '../../items/Inventory';
import { btn, clear, el, fmtCredits } from '../dom';
import { InvCtx, detailPane, itemCell, itemInfo, qtyStepper } from '../ItemWidgets';
import { panelFrame, type Panel, type Ui } from '../Ui';

type Tab = 'buy' | 'sell';

/** 黑市終端機：買 / 賣兩個分頁，依分類篩選 */
export class ShopPanel implements Panel {
  readonly el: HTMLElement;
  private ctx: InvCtx;
  private tab: Tab = 'buy';
  private filter: Category | 'all' = 'all';
  private tabsEl = el('div', 'tabs');
  private chipsEl = el('div', 'chips');
  private listEl = el('div', 'shop-list');
  private colC = el('div', 'col col-c');
  private creditsEl: HTMLElement;
  private unsub: () => void;

  constructor(private ui: Ui) {
    const f = panelFrame(ui, '黑市終端機');
    this.el = f.root;
    this.creditsEl = f.credits;
    f.body.className = 'panel-body cols two shop';
    const left = el('div', 'col col-a');
    left.append(this.tabsEl, this.chipsEl, this.listEl);
    f.body.append(left, this.colC);
    this.ctx = new InvCtx(ui, () => this.render());
    this.unsub = ui.economy.subscribe(() => this.render());
    this.render();
  }

  private setTab(t: Tab): void {
    this.tab = t;
    this.filter = 'all';
    this.ctx.selection = null;
    this.ui.audio.playUi('select', 0.5);
    this.render();
  }

  /** 賣出分頁：倉庫與背包裡的所有東西 */
  private sellables(): { loc: Loc; stack: ItemStack }[] {
    const out: { loc: Loc; stack: ItemStack }[] = [];
    for (const c of ['stash', 'carried'] as const) {
      this.ui.economy.view(c).slots.forEach((stack, i) => { if (stack) out.push({ loc: { c, i }, stack }); });
    }
    return out;
  }

  private render(): void {
    const { ctx, ui } = this;
    ctx.validate();
    this.creditsEl.textContent = fmtCredits(ui.economy.credits);
    clear(this.tabsEl); clear(this.chipsEl); clear(this.listEl); clear(this.colC);

    for (const [t, label] of [['buy', '購買'], ['sell', '出售']] as const) {
      const b = btn(label, () => this.setTab(t), `tab${this.tab === t ? ' on' : ''}`);
      b.dataset.tab = t;
      this.tabsEl.appendChild(b);
    }

    const sell = this.sellables();
    const cats: Category[] = this.tab === 'buy' ? SHOP_CATEGORIES : [...new Set(sell.map((s) => getItem(s.stack.id)!.category))];
    if (this.filter !== 'all' && !cats.includes(this.filter)) this.filter = 'all';
    for (const c of ['all', ...cats] as const) {
      const b = btn(c === 'all' ? '全部' : CATEGORY_NAMES[c], () => { this.filter = c; ui.audio.playUi('click', 0.4); this.render(); }, `chip${this.filter === c ? ' on' : ''}`);
      b.dataset.cat = c;
      this.chipsEl.appendChild(b);
    }

    if (this.tab === 'buy') this.renderBuyList();
    else this.renderSellList(sell);

    this.colC.appendChild(detailPane(ctx, {
      hub: true,
      hint: this.tab === 'buy' ? '選擇想購買的商品。\n未來商品在這裡便宜，帶到過去可以高價轉賣（M4）。' : '選擇要出售的物品。\n商店買價約為賣價的 1.4 倍，所以不要隨便賣掉裝備。',
      extra: (sel) => (sel.kind === 'shop' ? this.buyDetail(sel.id) : sel.kind === 'sell' ? this.sellDetail(sel.loc) : null),
    }));
  }

  private row(stack: ItemStack, price: string, sub: string, selected: boolean, onClick: () => void, dataId: string): HTMLElement {
    const def = getItem(stack.id)!;
    const row = el('div', `shop-row${selected ? ' sel' : ''}`);
    row.dataset.item = dataId;
    row.addEventListener('click', onClick);
    const info = el('div', 'shop-name');
    info.append(el('b', '', def.name), el('small', '', sub));
    row.append(itemCell(stack, {}), info, el('span', 'price', price));
    return row;
  }

  private renderBuyList(): void {
    const { ctx, ui } = this;
    const list = ITEM_LIST.filter((d) => SHOP_CATEGORIES.includes(d.category) && (this.filter === 'all' || d.category === this.filter));
    for (const d of list) {
      const sel = ctx.selection?.kind === 'shop' && ctx.selection.id === d.id;
      this.listEl.appendChild(this.row({ id: d.id, qty: 1 }, fmtCredits(ui.economy.buyPriceOf(d.id)), CATEGORY_NAMES[d.category], sel, () => {
        ui.audio.playUi('click', 0.4);
        ctx.selection = { kind: 'shop', id: d.id };
        ctx.qty = 1;
        this.render();
      }, d.id));
    }
  }

  private renderSellList(sell: { loc: Loc; stack: ItemStack }[]): void {
    const { ctx, ui } = this;
    const shown = sell.filter((s) => this.filter === 'all' || getItem(s.stack.id)!.category === this.filter);
    if (shown.length === 0) this.listEl.appendChild(el('p', 'hint', '沒有可以出售的物品。'));
    for (const { loc, stack } of shown) {
      const sel = ctx.selection?.kind === 'sell' && ctx.selection.loc.c === loc.c && ctx.selection.loc.i === loc.i;
      const where = loc.c === 'stash' ? '倉庫' : '背包';
      this.listEl.appendChild(this.row(stack, fmtCredits(ui.economy.valueOf(stack)), `${where} ・ 單價 ${fmtCredits(ui.economy.sellPriceOf(stack.id))}`, sel, () => {
        ui.audio.playUi('click', 0.4);
        ctx.select({ kind: 'sell', loc });
      }, `${loc.c}:${loc.i}`));
    }
  }

  private buyDetail(id: string): HTMLElement {
    const { ctx, ui } = this;
    const wrap = el('div');
    const def = getItem(id)!;
    const unit = ui.economy.buyPriceOf(id);
    wrap.appendChild(itemInfo(ctx, { id, qty: 1 }, { price: { label: '售價', value: unit } }));
    const have = ui.economy.view('stash').count(id) + ui.economy.view('carried').count(id);
    wrap.appendChild(el('p', 'hint', `目前持有：${have}`));
    const actions = el('div', 'actions');
    if (def.maxStack > 1) actions.appendChild(qtyStepper(ctx, Math.min(def.maxStack, 99)));
    const total = unit * ctx.qty;
    const buy = btn(`購買 ${fmtCredits(total)}`, () => {
      const r = ui.economy.buy(id, ctx.qty);
      if (ui.report(r, `已購買 ${def.name} × ${ctx.qty}`)) ui.audio.playUi('pickup', 0.6);
    }, 'primary gold');
    buy.dataset.action = 'buy';
    actions.appendChild(buy);
    wrap.appendChild(actions);
    return wrap;
  }

  private sellDetail(loc: Loc): HTMLElement {
    const { ctx, ui } = this;
    const stack = ctx.stackOf({ kind: 'sell', loc });
    const wrap = el('div');
    if (!stack) return wrap;
    wrap.appendChild(itemInfo(ctx, stack));
    const actions = el('div', 'actions');
    if (stack.qty > 1) actions.appendChild(qtyStepper(ctx, stack.qty));
    const gain = ui.economy.sellPriceOf(stack.id) * ctx.qty;
    const sell = btn(`出售 ${fmtCredits(gain)}`, () => {
      const name = getItem(stack.id)!.name;
      if (ui.report(ui.economy.sell(loc, ctx.qty), `已出售 ${name} × ${ctx.qty}（+${fmtCredits(gain)}）`)) ctx.select(null);
    }, 'primary gold');
    sell.dataset.action = 'sell';
    actions.appendChild(sell);
    wrap.appendChild(actions);
    return wrap;
  }

  dispose(): void { this.unsub(); }
}
