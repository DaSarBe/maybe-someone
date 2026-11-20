import type { ContainerLootDef } from '../../data/lootTables';
import { getItem } from '../../data/items';
import { ARMOR_EQUIP_SECONDS } from '../../data/search';
import type { ItemStack, Slot } from '../../items/Inventory';
import { compareGear, type CompareRow } from '../../items/GearCompare';
import type { LootSearch } from '../../items/LootSearch';
import type { EquipSlot } from '../../items/Profile';
import { btn, clear, el, fmtCredits } from '../dom';
import { EQUIP_LABELS, InvCtx, bodyColumn, detailPane, itemCell, itemInfo, qtyStepper } from '../ItemWidgets';
import { panelFrame, type Panel, type Ui } from '../Ui';

type SwapDest = 'container' | 'carried';

/**
 * 搜刮容器 / 屍體的介面：左 = 容器內容（逐件揭露，未揭露顯示「？」）、中 = 背包、右 = 詳細。
 * 揭露進度由 RaidScene 推進（LootSearch，關閉面板後保留在容器上）；面板只負責顯示與操作：
 * 拿取、全部拿走、直接裝備（含新舊比較與交換）、安靜搜刮切換。
 */
export class LootPanel implements Panel {
  readonly el: HTMLElement;
  private ctx: InvCtx;
  private colA = el('div', 'col col-a');
  private colB = el('div', 'col col-b');
  private colC = el('div', 'col col-c');
  private unsub: () => void;
  private cells: HTMLElement[] = [];
  private countEl: HTMLElement | null = null;
  private takeAllBtn: HTMLButtonElement | null = null;
  private valueEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  /** 換下的裝備放哪裡（預設放回容器） */
  private swapDest: SwapDest = 'container';
  /** 進行中的護甲裝備（需要時間，可被中斷） */
  private equipping: { index: number; t: number; dest: SwapDest } | null = null;
  private equipBar: HTMLElement | null = null;

  /** loot 會被就地修改（拿走的就從陣列移除），場景保留同一個陣列與 LootSearch 即可記住剩餘內容與揭露進度 */
  constructor(
    private ui: Ui,
    private def: ContainerLootDef,
    private loot: Slot[],
    private search: LootSearch,
    private onClose?: () => void,
  ) {
    const f = panelFrame(ui, def.name, { showCredits: false });
    this.el = f.root;
    f.body.className = 'panel-body cols three loot';
    f.body.append(this.colA, this.colB, this.colC);
    this.ctx = new InvCtx(ui, () => this.render());
    this.ctx.lootSlots = loot;
    this.unsub = ui.economy.subscribe(() => this.render());
    this.render();
  }

  // ---------------------------------------------------------------- 場景呼叫
  /** 有新的格子被揭露：只換掉那幾格，不整個重繪（避免揭露時打斷手機上的點擊） */
  onRevealed(indices: number[]): void {
    for (const i of indices) {
      const old = this.cells[i];
      if (!old) continue;
      const fresh = this.cellFor(i);
      fresh.classList.add('just');
      old.replaceWith(fresh);
      this.cells[i] = fresh;
    }
    this.updateMeta();
  }

  /** 每個畫面更新：揭露進度圈、護甲裝備進度 */
  tick(dt: number): void {
    const cur = this.search.current;
    if (cur >= 0) this.cells[cur]?.style.setProperty('--p', `${Math.round(this.search.progress * 360)}deg`);
    const eq = this.equipping;
    if (eq) {
      eq.t += dt;
      this.equipBar?.style.setProperty('width', `${Math.min(100, (eq.t / ARMOR_EQUIP_SECONDS) * 100)}%`);
      if (eq.t >= ARMOR_EQUIP_SECONDS) {
        this.equipping = null;
        this.doEquip(eq.index, eq.dest);
      }
    }
  }

  // ---------------------------------------------------------------- 動作
  private take(index: number, qty: number): void {
    const { ui, loot } = this;
    const s = loot[index];
    if (!s || !this.search.isRevealed(index)) return;
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
      if (!s || !this.search.isRevealed(i)) continue;
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

  /** 開始裝備：護甲要花時間（可中斷），武器與背包立即完成 */
  private startEquip(index: number, dest: SwapDest): void {
    const s = this.loot[index];
    if (!s) return;
    if (getItem(s.id)?.category === 'armor') {
      this.equipping = { index, t: 0, dest };
      this.render();
      return;
    }
    this.doEquip(index, dest);
  }

  private doEquip(index: number, dest: SwapDest): void {
    const { ui, loot } = this;
    const s = loot[index];
    if (!s) return;
    const cat = getItem(s.id)?.category;
    const name = getItem(s.id)?.name ?? s.id;
    const r = ui.economy.equipFromContainer(loot, index, { dest });
    if (!r.ok) { ui.toast(r.reason, 'err'); this.render(); return; }
    if (cat === 'armor') ui.equipSound('armor');
    else if (cat === 'weapon') ui.noise('weapon_swap');
    else ui.audio.playUi('select', 0.5);
    const back = r.replaced
      ? `，${getItem(r.replaced.id)?.name ?? ''}${r.replacedTo === 'carried' ? '放進背包' : '放回容器'}`
      : '';
    ui.toast(`已裝備 ${name}${back}`, 'ok');
    this.ctx.select(null);
  }

  private cancelEquip(msg?: string): void {
    if (!this.equipping) return;
    this.equipping = null;
    this.equipBar = null;
    if (msg) this.ui.toast(msg, 'info');
  }

  // ---------------------------------------------------------------- 顯示
  private cellFor(i: number): HTMLElement {
    const { ctx, loot, search } = this;
    const s = loot[i] ?? null;
    if (s && !search.isRevealed(i)) {
      const c = el('div', 'cell unknown');
      c.dataset.reveal = i === search.current ? 'active' : 'queued';
      c.title = '尚未揭露';
      c.append(el('span', 'spin'), el('span', 'q', '？'));
      if (i === search.current) {
        c.classList.add('active');
        c.style.setProperty('--p', `${Math.round(search.progress * 360)}deg`);
      }
      return c;
    }
    return itemCell(s, {
      selected: ctx.selection?.kind === 'loot' && ctx.selection.index === i,
      title: s ? getItem(s.id)?.name : undefined,
      onClick: s ? () => { ctx.ui.audio.playUi('click', 0.4); ctx.select({ kind: 'loot', index: i }); } : undefined,
    });
  }

  private revealedLeft(): ItemStack[] {
    return this.search.revealedIndices().map((i) => this.loot[i]!).filter(Boolean);
  }

  private updateMeta(): void {
    const { search, loot } = this;
    const left = this.revealedLeft();
    if (this.countEl) {
      const total = loot.length;
      this.countEl.textContent = search.exhausted ? '空了'
        : search.finished ? `${left.length} 件`
          : `揭露中 ${Math.min(search.done, total)}/${total}`;
    }
    if (this.statusEl) {
      this.statusEl.textContent = search.finished ? '' : '揭露中，已揭露的可以先拿';
      this.statusEl.classList.toggle('hidden', search.finished);
    }
    if (this.takeAllBtn) {
      if (left.length === 0) this.takeAllBtn.setAttribute('disabled', ''); else this.takeAllBtn.removeAttribute('disabled');
    }
    if (this.valueEl) this.valueEl.textContent = search.finished ? `剩餘價值約 ${fmtCredits(this.ctx.eco.valueOfAll(left))}` : `已揭露價值約 ${fmtCredits(this.ctx.eco.valueOfAll(left))}`;
  }

  private quietToggle(): HTMLElement {
    const on = this.ui.controls.get().quietSearch;
    const row = el('div', 'quiet-row');
    const b = btn(on ? '安靜搜刮：開' : '安靜搜刮：關', () => {
      this.ui.controls.update((c) => { c.quietSearch = !c.quietSearch; });
      this.render();
    }, on ? 'sm on' : 'sm');
    b.dataset.action = 'quiet';
    row.append(b, el('small', '', on ? '揭露慢 1.6 倍，聲音只傳 6m' : '一般：聲音傳 12m'));
    return row;
  }

  private compareBlock(index: number, stack: ItemStack): HTMLElement | null {
    const eco = this.ui.economy;
    const probe = eco.equipFromContainer(this.loot, index, { dryRun: true });
    // 就算背包放不下（驗證失敗），也要能顯示比較：自己推導欄位
    const slot: EquipSlot | null = probe.ok ? probe.slot : this.slotGuess(stack);
    if (!slot) return null;
    const old = eco.profile.equipment[slot];
    const rows = compareGear(stack, old);
    if (rows.length === 0) return null;
    const box = el('div', 'cmp');
    box.dataset.slot = slot;
    box.appendChild(el('div', 'cmp-head', old ? `與現在的${EQUIP_LABELS[slot]}比較：${getItem(old.id)?.name ?? ''}` : `${EQUIP_LABELS[slot]}目前是空的`));
    for (const r of rows) box.appendChild(this.cmpRow(r));
    return box;
  }

  private slotGuess(stack: ItemStack): EquipSlot | null {
    const cat = getItem(stack.id)?.category;
    if (cat === 'armor') return 'armor';
    if (cat === 'backpack') return 'backpack';
    if (cat === 'weapon') return stack.id === 'pistol' ? 'secondary' : 'primary';
    return null;
  }

  private cmpRow(r: CompareRow): HTMLElement {
    const row = el('div', `cmp-row ${r.dir}`);
    const val = r.from === null ? r.to : `${r.from} → ${r.to}`;
    row.append(el('span', 'cmp-l', r.label), el('b', 'cmp-v', val), el('span', 'cmp-a', r.dir === 'up' ? '▲' : r.dir === 'down' ? '▼' : r.from === null ? '' : '＝'));
    return row;
  }

  private lootDetail(index: number): HTMLElement | null {
    const { ctx } = this;
    const s = this.loot[index];
    if (!s || !this.search.isRevealed(index)) return null;
    const wrap = el('div', 'loot-detail');
    const row2 = el('div', 'act-row');
    const scroll = el('div', 'ld-scroll');
    scroll.appendChild(itemInfo(ctx, s));
    const actions = el('div', 'actions ld-actions');
    const cat = getItem(s.id)?.category;
    const equippable = cat === 'weapon' || cat === 'armor' || cat === 'backpack';

    if (equippable) {
      const cmp = this.compareBlock(index, s);
      if (cmp) scroll.appendChild(cmp);
      const slot = (cmp?.dataset.slot as EquipSlot | undefined) ?? this.slotGuess(s);
      const occupied = !!slot && !!ctx.eco.profile.equipment[slot];

      // 換下的裝備：放回容器（預設）或放進背包（背包放不下時不能選）
      let dest = this.swapDest;
      let carriedWhy = '';
      if (occupied) {
        const probe = ctx.eco.equipFromContainer(this.loot, index, { dest: 'carried', dryRun: true });
        if (!probe.ok) carriedWhy = probe.reason;
        if (carriedWhy && dest === 'carried') dest = 'container';
        const row = el('div', 'swap-row');
        row.appendChild(el('span', 'swap-l', '換下的裝備'));
        const seg = el('div', 'ctl-seg');
        const mk = (v: SwapDest, label: string, disabled = false) => {
          const b = btn(label, () => { this.swapDest = v; this.render(); });
          b.classList.add('seg-btn');
          b.dataset.dest = v;
          if (v === dest) b.classList.add('on');
          if (disabled) { b.setAttribute('disabled', ''); b.title = carriedWhy; }
          return b;
        };
        seg.append(mk('container', '放回容器'), mk('carried', '放進背包', !!carriedWhy));
        row.appendChild(seg);
        actions.appendChild(row);
        if (carriedWhy) actions.appendChild(el('small', 'swap-note', `放不進背包：${carriedWhy}`));
      }

      const probe = ctx.eco.equipFromContainer(this.loot, index, { dest, dryRun: true });
      const eq = this.equipping;
      if (eq && eq.index === index) {
        const b = btn('取消裝備', () => { this.cancelEquip('裝備被取消'); this.render(); }, 'primary equipping');
        const bar = el('i');
        bar.style.width = `${Math.min(100, (eq.t / ARMOR_EQUIP_SECONDS) * 100)}%`;
        this.equipBar = bar;
        const prog = el('span', 'eq-prog');
        prog.appendChild(bar);
        b.appendChild(prog);
        b.dataset.action = 'cancel-equip';
        row2.appendChild(b);
      } else {
        const label = cat === 'armor' ? `裝備（${ARMOR_EQUIP_SECONDS} 秒）` : '裝備';
        const b = btn(label, () => this.startEquip(index, dest), 'primary');
        b.dataset.action = 'equip';
        if (!probe.ok) { b.setAttribute('disabled', ''); b.title = probe.reason; }
        row2.appendChild(b);
        if (!probe.ok) actions.appendChild(el('small', 'swap-note', probe.reason));
      }
    } else if (s.qty > 1) {
      actions.appendChild(qtyStepper(ctx, s.qty));
    }

    const b = btn(`拿取${s.qty > 1 && !equippable ? ` × ${ctx.qty}` : ''}`, () => { this.take(index, equippable ? s.qty : ctx.qty); ctx.select(null); }, equippable ? '' : 'primary');
    b.dataset.action = 'take';
    if (equippable) { row2.appendChild(b); actions.appendChild(row2); wrap.classList.add('gear'); } else actions.appendChild(b);
    wrap.append(scroll, actions);
    return wrap;
  }

  private render(): void {
    const { ctx, loot, search } = this;
    ctx.validate();
    // 選取的物品換了就中斷裝備
    const sel = ctx.selection;
    if (this.equipping && !(sel?.kind === 'loot' && sel.index === this.equipping.index)) this.cancelEquip('裝備被中斷');
    this.equipBar = null;
    clear(this.colA); clear(this.colB); clear(this.colC);

    const head = el('div', 'col-head');
    this.countEl = el('span', '');
    head.append(el('b', '', this.def.name), this.countEl);
    this.colA.appendChild(head);
    this.colA.appendChild(this.quietToggle());
    this.statusEl = el('small', 'hint reveal-status');
    this.colA.appendChild(this.statusEl);

    const grid = el('div', 'grid loot-grid');
    const total = Math.max(loot.length, 4);
    this.cells = [];
    for (let i = 0; i < total; i++) {
      const c = this.cellFor(i);
      this.cells.push(c);
      grid.appendChild(c);
    }
    this.colA.appendChild(grid);
    const all = btn('全部拿走', () => this.takeAll(), 'primary');
    all.dataset.action = 'take-all';
    this.takeAllBtn = all;
    this.colA.appendChild(all);
    this.valueEl = el('small', 'hint');
    this.colA.appendChild(this.valueEl);
    this.updateMeta();
    void search;

    this.colB.appendChild(bodyColumn(ctx));
    this.colC.appendChild(detailPane(ctx, {
      hub: false,
      hint: '物品一件一件揭露，已揭露的可以先拿。\n武器、護甲、背包可以直接「裝備」。',
      extra: (s) => (s.kind === 'loot' ? this.lootDetail(s.index) : null),
    }));
  }

  dispose(): void {
    this.unsub();
    this.equipping = null;
    this.onClose?.();
  }
}
