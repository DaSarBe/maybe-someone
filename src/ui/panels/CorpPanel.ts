import { CORPS, CORP_IDS, FACTIONS, type CorpId } from '../../data/factions';
import { btn, el } from '../dom';
import { panelFrame, type Panel, type Ui } from '../Ui';

/**
 * 選擇企業（新存檔與舊存檔第一次進基地時）：三家企業各有一個小加成，聲望永久累積。
 * 選擇後不能免費更換（之後只能在「陣營」頁面花大錢轉換）。
 */
export class CorpPanel implements Panel {
  readonly el: HTMLElement;
  readonly locked = true;

  constructor(ui: Ui, onChosen: (corp: CorpId) => void) {
    const f = panelFrame(ui, '加入企業', { showCredits: false, closable: false });
    this.el = f.root;
    this.el.classList.add('corp-choose');
    f.body.className = 'panel-body single corp-body';
    f.body.appendChild(el('p', 'result-sub', '時光機是企業的技術。選擇一家企業作為你的後盾：他們的穿越者視你為自己人，對你的敵人也不會手軟。聲望永久累積；之後只能花大錢轉換企業。'));
    const row = el('div', 'corp-cards');
    for (const id of CORP_IDS) {
      const def = FACTIONS[id];
      const card = el('div', 'corp-card');
      card.dataset.corp = id;
      card.style.setProperty('--fc', def.color);
      card.append(el('b', '', def.name), el('small', '', def.desc), el('span', 'corp-perk', `加成：${CORPS[id].perk}`));
      const pick = btn(`加入${def.name}`, () => {
        const r = ui.economy.chooseCorp(id);
        if (!ui.report(r, `你加入了${def.name}`)) return;
        ui.close(true, true);
        onChosen(id);
      }, 'primary');
      pick.dataset.action = 'choose-corp';
      pick.dataset.corp = id;
      card.appendChild(pick);
      row.appendChild(card);
    }
    f.body.appendChild(row);
  }

  dispose(): void { /* nothing */ }
}
