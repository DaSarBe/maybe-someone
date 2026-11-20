import { CATEGORY_NAMES, getItem } from '../../data/items';
import { getTrader } from '../../data/traders';
import type { Loc } from '../../economy/EconomyService';
import { traderSellRate } from '../../economy/Trader';
import type { ItemStack } from '../../items/Inventory';
import { ATTITUDE_NAME, BRIBE, BRIBE_TARGETS, FACTIONS } from '../../data/factions';
import { btn, clear, el, fmtCredits } from '../dom';
import { repBar } from './FactionPanel';
import { InvCtx, detailPane, itemCell, itemInfo, qtyStepper } from '../ItemWidgets';
import { panelFrame, type Panel, type Ui } from '../Ui';

type Tab = 'buy' | 'sell' | 'bribe';

export const fmtNtd = (n: number): string => `NT$${Math.round(n).toLocaleString('en-US')}`;

/**
 * 時代商人：買 / 賣兩個分頁，只收當地貨幣（舊台幣，放在背包裡）。
 * 所有交易都走 EconomyService.traderSell / traderBuy（驗證都在那裡）。
 */
export class TraderPanel implements Panel {
  readonly el: HTMLElement;
  private ctx: InvCtx;
  private tab: Tab = 'sell';
  private tabsEl = el('div', 'tabs');
  private noteEl = el('p', 'hint trader-note');
  private listEl = el('div', 'shop-list');
  private colC = el('div', 'col col-c');
  private haveEl: HTMLElement;
  private unsub: () => void;

  constructor(private ui: Ui, private eraId: string) {
    const def = getTrader(eraId);
    const f = panelFrame(ui, def?.name ?? '商人', { showCredits: false });
    this.el = f.root;
    this.el.classList.add('trader');
    f.body.className = 'panel-body cols two shop trader-body';
    this.haveEl = el('span', 'credits-chip ntd-chip');
    f.root.querySelector('.panel-head .spacer')?.after(this.haveEl);
    const left = el('div', 'col col-a');
    left.append(this.tabsEl, this.noteEl, this.listEl);
    f.body.append(left, this.colC);
    this.ctx = new InvCtx(ui, () => this.render());
    this.unsub = ui.economy.subscribe(() => this.render());
    this.render();
  }

  private setTab(t: Tab): void {
    this.tab = t;
    this.ctx.selection = null;
    this.ui.audio.playUi('select', 0.5);
    this.render();
  }

  private sellables(): { loc: Loc; stack: ItemStack }[] {
    const def = getTrader(this.eraId);
    const out: { loc: Loc; stack: ItemStack }[] = [];
    for (const c of ['carried', 'secure'] as const) {
      this.ui.economy.view(c).slots.forEach((stack, i) => {
        if (stack && stack.id !== def?.currency) out.push({ loc: { c, i }, stack });
      });
    }
    // 未來商品排前面（商人最想要）
    out.sort((a, b) => Number(getItem(b.stack.id)?.category === 'future_goods') - Number(getItem(a.stack.id)?.category === 'future_goods'));
    return out;
  }

  private render(): void {
    const { ctx, ui } = this;
    const eco = ui.economy;
    ctx.validate();
    const cur = eco.traderCurrency();
    this.haveEl.textContent = `舊台幣 ${fmtNtd(cur?.have ?? 0)}`;
    clear(this.tabsEl); clear(this.listEl); clear(this.colC);
    for (const [t, label] of [['sell', '賣給商人'], ['buy', '向商人買'], ['bribe', '找人打點']] as const) {
      const b = btn(label, () => this.setTab(t), `tab${this.tab === t ? ' on' : ''}`);
      b.dataset.tab = t;
      this.tabsEl.appendChild(b);
    }
    this.noteEl.textContent = this.tab === 'sell'
      ? '未來商品在這裡價格很高，其他東西只能賣個零頭。每種東西賣太多，商人就不肯出原價。'
      : this.tab === 'buy'
        ? '商人只收舊台幣。古董帶回未來可以賺一筆；時晶碎片很貴，但數量有限。'
        : `商行認識港區各路人馬。花一點舊台幣請他們說句好話，警衛或海龍幫對你的印象會好一些（每次 +${BRIBE.gain}，同一陣營每場最多 +${BRIBE.perRaidMax}）。聲望是永久累積的。`;

    if (this.tab === 'bribe') { this.renderBribeList(); this.colC.appendChild(el('p', 'hint', '聲望高於 +40 = 友好：他們不會攻擊你，也不會被你的腳步引來。\n低於 -20 = 敵對：看到你就開火。\n之間是中立：不主動攻擊，但會盯著你。')); return; }
    if (this.tab === 'buy') this.renderBuyList(); else this.renderSellList();

    this.colC.appendChild(detailPane(ctx, {
      hub: false,
      hint: this.tab === 'sell' ? '選擇要賣的物品。\n舊台幣會放進背包——活著撤離才算數。' : '選擇想買的商品。',
      extra: (sel) => (sel.kind === 'shop' ? this.buyDetail(sel.id) : sel.kind === 'sell' ? this.sellDetail(sel.loc) : null),
    }));
  }

  private row(stack: ItemStack, price: string, sub: string, selected: boolean, onClick: () => void, dataId: string, dim = false): HTMLElement {
    const def = getItem(stack.id)!;
    const row = el('div', `shop-row${selected ? ' sel' : ''}${dim ? ' dim' : ''}`);
    row.dataset.item = dataId;
    row.addEventListener('click', onClick);
    const info = el('div', 'shop-name');
    info.append(el('b', '', def.name), el('small', '', sub));
    row.append(itemCell(stack, {}), info, el('span', 'price ntd', price));
    return row;
  }

  private renderBribeList(): void {
    const { ui } = this;
    const eco = ui.economy;
    const have = eco.traderCurrency()?.have ?? 0;
    for (const f of BRIBE_TARGETS) {
      const d = FACTIONS[f];
      const rep = eco.reputationOf(f);
      const att = eco.attitudeToward(f);
      const info = eco.bribeInfo(f);
      const row = el('div', `faction-row bribe-row att-${att}`);
      row.dataset.faction = f;
      row.dataset.rep = String(rep);
      row.dataset.left = String(info.left);
      row.style.setProperty('--fc', d.color);
      const head = el('div', 'faction-head');
      head.append(el('b', '', d.name), el('span', `att-tag att-${att}`, ATTITUDE_NAME[att]), el('span', 'rep-num', `${rep > 0 ? '+' : ''}${rep}`));
      const act = el('div', 'bribe-act');
      const b = btn(`打點 ${fmtNtd(info.cost)}（+${info.gain}）`, () => {
        const r = eco.bribe(f);
        if (ui.report(r, `${d.name}對你的印象好了一點`)) { ui.audio.playUi('buy', 0.7); ui.noise('trade'); }
      }, 'primary gold');
      b.dataset.action = 'bribe';
      b.dataset.faction = f;
      if (have < info.cost && info.left > 0) b.title = '舊台幣不夠';
      act.append(b, el('small', '', info.left > 0 ? `本場還能打點 ${info.left} 次（已 +${info.used}）` : '本場已打點到上限'));
      row.append(head, repBar(rep), act);
      this.listEl.appendChild(row);
    }
  }

  private renderBuyList(): void {
    const { ctx, ui } = this;
    const offers = ui.economy.traderOffers();
    if (offers.length === 0) this.listEl.appendChild(el('p', 'hint', '商人今天沒有貨。'));
    for (const o of offers) {
      const def = getItem(o.id)!;
      const sel = ctx.selection?.kind === 'shop' && ctx.selection.id === o.id;
      this.listEl.appendChild(this.row({ id: o.id, qty: 1 }, fmtNtd(o.price), `${CATEGORY_NAMES[def.category]} ・ ${o.left > 0 ? `庫存 ${o.left}` : '已售完'}`, sel, () => {
        ui.audio.playUi('click', 0.4);
        ctx.selection = { kind: 'shop', id: o.id };
        ctx.qty = 1;
        this.render();
      }, o.id, o.left <= 0));
    }
  }

  private renderSellList(): void {
    const { ctx, ui } = this;
    const eco = ui.economy;
    const list = this.sellables();
    if (list.length === 0) this.listEl.appendChild(el('p', 'hint', '背包裡沒有可以賣的東西。'));
    for (const { loc, stack } of list) {
      const sel = ctx.selection?.kind === 'sell' && ctx.selection.loc.c === loc.c && ctx.selection.loc.i === loc.i;
      const where = loc.c === 'carried' ? '背包' : '保險袋';
      const unit = eco.traderSellQuote(stack.id, 1, stack.mods);
      this.listEl.appendChild(this.row(stack, fmtNtd(eco.traderSellQuote(stack.id, stack.qty, stack.mods)), `${where} ・ 單價 ${fmtNtd(unit)}`, sel, () => {
        ui.audio.playUi('click', 0.4);
        ctx.select({ kind: 'sell', loc });
      }, `${loc.c}:${loc.i}`));
    }
  }

  private buyDetail(id: string): HTMLElement {
    const { ctx, ui } = this;
    const eco = ui.economy;
    const wrap = el('div');
    const offer = eco.traderOffers().find((o) => o.id === id);
    if (!offer) return wrap;
    const have = eco.traderCurrency()?.have ?? 0;
    wrap.appendChild(itemInfo(ctx, { id, qty: 1 }, { price: { label: '售價', value: offer.price, fmt: fmtNtd } }));
    wrap.appendChild(el('p', 'hint', `庫存 ${offer.left} ・ 目前持有舊台幣 ${fmtNtd(have)}\n帶回未來約值 ${fmtCredits(eco.sellPriceOf(id))} / 件`));
    const actions = el('div', 'actions');
    const max = Math.max(1, Math.min(offer.left, Math.floor(have / offer.price) || 1, getItem(id)!.maxStack));
    ctx.qty = Math.max(1, Math.min(ctx.qty, max));
    if (max > 1) actions.appendChild(qtyStepper(ctx, max));
    const total = offer.price * ctx.qty;
    const buy = btn(`購買 ${fmtNtd(total)}`, () => {
      const r = eco.traderBuy(id, ctx.qty);
      if (ui.report(r, `已購買 ${getItem(id)!.name} × ${ctx.qty}`)) (ui.audio.playUi('buy', 0.7), ui.noise('trade'));
    }, 'primary gold');
    buy.dataset.action = 'trader-buy';
    if (offer.left <= 0) buy.setAttribute('disabled', '');
    actions.appendChild(buy);
    wrap.appendChild(actions);
    return wrap;
  }

  private sellDetail(loc: Loc): HTMLElement {
    const { ctx, ui } = this;
    const eco = ui.economy;
    const stack = ctx.stackOf({ kind: 'sell', loc });
    const wrap = el('div');
    if (!stack) return wrap;
    const def = getItem(stack.id)!;
    const trader = getTrader(this.eraId)!;
    const rate = traderSellRate(trader, stack.id, eco.today());
    const gain = eco.traderSellQuote(stack.id, ctx.qty, stack.mods);
    wrap.appendChild(itemInfo(ctx, stack, { price: { label: '收購價（單件）', value: eco.traderSellQuote(stack.id, 1, stack.mods), fmt: fmtNtd } }));
    if (rate) {
      const future = def.category === 'future_goods' ? `在未來只值 ${fmtCredits(eco.sellPriceOf(stack.id))}，在這裡高價收購。` : '商人對這種東西沒興趣，只肯出零頭。';
      wrap.appendChild(el('p', 'hint', `${future}\n原價收購額度：前 ${rate.fullUnits} 件，之後每件只付 ${Math.round(trader.overstockRate * 100)}%。`));
    }
    const actions = el('div', 'actions');
    if (stack.qty > 1) actions.appendChild(qtyStepper(ctx, stack.qty));
    const sell = btn(`賣出 ${fmtNtd(gain)}`, () => {
      const name = def.name;
      const n = ctx.qty;
      const r = eco.traderSell(loc, n);
      if (ui.report(r, `已賣出 ${name} × ${n}（+${fmtNtd(r.ok ? r.gain : 0)}）`)) { ui.audio.playUi('sell', 0.7); ui.noise('trade'); ctx.select(null); }
    }, 'primary gold');
    sell.dataset.action = 'trader-sell';
    actions.appendChild(sell);
    wrap.appendChild(actions);
    return wrap;
  }

  dispose(): void { this.unsub(); }
}
