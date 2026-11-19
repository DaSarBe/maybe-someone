import { clear, el, fmtCredits } from '../dom';
import { InvCtx, bodyColumn, containerGrid, containerHeader, detailPane } from '../ItemWidgets';
import { panelFrame, type Panel, type Ui } from '../Ui';

export type TransferMode = 'stash' | 'safe' | 'body';

/**
 * 倉庫櫃 / 房間保險箱 / 背包（Raid 中）共用的管理介面。
 * stash、safe：左 = 該容器、中 = 身上、右 = 詳細。body：左 = 身上、右 = 詳細。
 */
export class TransferPanel implements Panel {
  readonly el: HTMLElement;
  private ctx: InvCtx;
  private colA = el('div', 'col col-a');
  private colB = el('div', 'col col-b');
  private colC = el('div', 'col col-c');
  private unsub: () => void;
  private creditsEl: HTMLElement;

  constructor(private ui: Ui, private mode: TransferMode) {
    const titles: Record<TransferMode, string> = { stash: '倉庫櫃', safe: '房間保險箱', body: ui.economy.inRaid ? '背包' : '身上裝備' };
    const f = panelFrame(ui, titles[mode], { showCredits: !ui.economy.inRaid });
    this.el = f.root;
    this.creditsEl = f.credits;
    f.body.className = `panel-body cols ${mode === 'body' ? 'two' : 'three'}`;
    f.body.append(this.colA, ...(mode === 'body' ? [] : [this.colB]), this.colC);
    this.ctx = new InvCtx(ui, () => this.render());
    this.unsub = ui.economy.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const { ctx, ui, mode } = this;
    ctx.validate();
    this.creditsEl.textContent = fmtCredits(ui.economy.credits);
    clear(this.colA); clear(this.colB); clear(this.colC);
    const hub = !ui.economy.inRaid;
    if (mode === 'body') {
      this.colA.appendChild(bodyColumn(ctx));
    } else {
      this.colA.append(containerHeader(ctx, mode, mode === 'safe' ? '第二階段防入侵' : undefined), containerGrid(ctx, mode));
      this.colB.appendChild(bodyColumn(ctx));
    }
    this.colC.appendChild(detailPane(ctx, { hub }));
  }

  dispose(): void { this.unsub(); }
}
