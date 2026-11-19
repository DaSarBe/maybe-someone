import { getEra } from '../../data/eras';
import { getItem } from '../../data/items';
import type { RaidResult } from '../../items/Profile';
import { btn, el, fmtCredits } from '../dom';
import { itemCell } from '../ItemWidgets';
import { panelFrame, type Panel, type Ui } from '../Ui';

/** Raid 結算畫面（撤離成功 / 死亡） */
export class ResultPanel implements Panel {
  readonly el: HTMLElement;
  readonly locked = true;

  constructor(ui: Ui, result: RaidResult, onContinue: () => void, opts: { killedBy?: string } = {}) {
    const ok = result.outcome === 'extract';
    const f = panelFrame(ui, ok ? '撤離成功' : opts.killedBy ? `被 ${opts.killedBy} 擊殺` : '時空亂流吞噬了你', { showCredits: false, closable: false });
    this.el = f.root;
    this.el.classList.add('result', ok ? 'win' : 'lose');
    f.body.className = 'panel-body single result-body';
    const era = getEra(result.era);
    const sub = result.interrupted
      ? '你在 Raid 途中離線／重新整理，時空連結中斷，視為死亡。'
      : ok ? `你帶著戰利品平安回到了基地。（${era?.name ?? ''}）` : opts.killedBy
        ? `你被 ${opts.killedBy} 擊殺，在 ${era?.name ?? '過去'} 失去了所有身上的物品。`
        : `你在 ${era?.name ?? '過去'} 失去了所有身上的物品。`;
    f.body.appendChild(el('p', 'result-sub', sub));

    f.body.appendChild(el('div', 'col-head', ok ? '這次帶回的物品' : '失去的物品'));
    const grid = el('div', 'result-items');
    if (result.items.length === 0) grid.appendChild(el('p', 'hint', ok ? '空手而歸……' : '你本來就沒帶什麼東西。'));
    for (const s of result.items) {
      const d = getItem(s.id);
      const item = el('div', 'result-item');
      item.append(itemCell(s, {}), el('span', '', d?.name ?? s.id));
      grid.appendChild(item);
    }
    f.body.appendChild(grid);
    f.body.appendChild(el('div', `total-line ${ok ? 'gain' : 'loss'}`, `${ok ? '總價值' : '損失價值'}　${fmtCredits(result.value)}`));

    if (result.kept.length > 0) {
      f.body.appendChild(el('div', 'col-head', '保險袋保住的物品'));
      const kept = el('div', 'result-items');
      for (const s of result.kept) {
        const item = el('div', 'result-item');
        item.append(itemCell(s, {}), el('span', '', getItem(s.id)?.name ?? s.id));
        kept.appendChild(item);
      }
      f.body.appendChild(kept);
    }

    const go = btn('回到基地', onContinue, 'primary go');
    go.dataset.action = 'continue';
    f.body.appendChild(go);
  }

  dispose(): void { /* nothing */ }
}
