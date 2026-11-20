import { ERAS, getEra } from '../../data/eras';
import { getItem } from '../../data/items';
import type { ItemStack } from '../../items/Inventory';
import { btn, clear, el, fmtCredits, fmtTime } from '../dom';
import { itemCell } from '../ItemWidgets';
import { EQUIP_LABELS } from '../ItemWidgets';
import { panelFrame, type Panel, type Ui } from '../Ui';

const stars = (n: number): string => `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;
const DIFFICULTY_NAME: Record<number, string> = { 1: '簡單', 2: '普通', 3: '困難' };
const DIFFICULTY_HINT: Record<number, string> = {
  1: '敵人命中率與反應較差、聽力較鈍，很少使用戰術。',
  2: '標準的敵人：會偷襲、趁你換彈衝過來，也會包抄。',
  3: '敵人命中率高、反應快、聽力靈敏，常蹲走偷襲、趁你換彈 / 治療衝鋒並包抄。',
};

/** 時光機：選擇時代，出發前確認攜帶物品 */
export class TimeMachinePanel implements Panel {
  readonly el: HTMLElement;
  private selected = ERAS[0].id;
  private colA = el('div', 'col col-a');
  private colB = el('div', 'col col-b');
  private unsub: () => void;

  constructor(private ui: Ui, private onDepart: (eraId: string) => void) {
    const f = panelFrame(ui, '時光機');
    this.el = f.root;
    f.body.className = 'panel-body cols two timemachine';
    f.body.append(this.colA, this.colB);
    this.unsub = ui.economy.subscribe(() => this.render());
    this.render();
  }

  private listRow(stack: ItemStack, tag?: string): HTMLElement {
    const def = getItem(stack.id)!;
    const row = el('div', 'check-row');
    row.append(itemCell(stack, {}));
    const n = el('div', 'check-name');
    n.append(el('b', '', def.name + (stack.qty > 1 ? ` × ${stack.qty}` : '')), el('small', '', tag ?? ''));
    row.append(n, el('span', 'price', fmtCredits(this.ui.economy.valueOf(stack))));
    return row;
  }

  private render(): void {
    const { ui } = this;
    const eco = ui.economy;
    clear(this.colA); clear(this.colB);

    this.colA.appendChild(el('div', 'col-head', '選擇時代'));
    for (const era of ERAS) {
      const card = el('div', `era-card${era.unlocked ? '' : ' locked'}${this.selected === era.id ? ' sel' : ''}`);
      card.dataset.era = era.id;
      card.style.setProperty('--ec', era.color);
      card.append(
        el('b', '', era.name),
        el('small', '', era.unlocked ? era.desc : '🔒 鎖定／即將開放'),
      );
      if (era.unlocked) {
        card.appendChild(el('small', 'danger-lv', `危險度 ${'◆'.repeat(era.danger)}${'◇'.repeat(4 - era.danger)}`));
        const dl = el('small', 'difficulty-lv', `難度 ${stars(era.difficulty)}`);
        dl.dataset.difficulty = String(era.difficulty);
        card.appendChild(dl);
        card.addEventListener('click', () => { this.selected = era.id; ui.audio.playUi('select', 0.5); this.render(); });
      } else {
        card.addEventListener('click', () => ui.toast('這個時代尚未開放', 'err'));
      }
      this.colA.appendChild(card);
    }

    const carried = eco.view('carried').slots.filter((s): s is ItemStack => !!s);
    const secure = eco.view('secure').slots.filter((s): s is ItemStack => !!s);
    const equipped = eco.equippedStacks();
    const all = [...carried, ...secure, ...equipped.map((e) => e.stack)];
    const total = eco.valueOfAll(all);

    const era = getEra(this.selected);
    if (era?.info) {
      const box = el('div', 'era-info');
      box.dataset.era = era.id;
      box.append(el('h3', '', era.info.mapName));
      const diff = el('div', 'era-difficulty');
      diff.dataset.difficulty = String(era.difficulty);
      diff.append(el('b', '', `地圖難度　${stars(era.difficulty)}　${DIFFICULTY_NAME[era.difficulty]}`), el('small', '', DIFFICULTY_HINT[era.difficulty]));
      box.appendChild(diff);
      for (const line of era.info.brief) box.appendChild(el('p', '', line));
      const rec = el('div', 'era-rec');
      rec.appendChild(el('b', '', '建議裝備'));
      const ul = el('ul');
      for (const r of era.info.recommended) ul.appendChild(el('li', '', r));
      rec.appendChild(ul);
      box.appendChild(rec);
      this.colB.appendChild(box);
    }
    this.colB.appendChild(el('div', 'col-head', '出發前確認'));
    const stay = el('div', 'stab-line', `預計停留 ${fmtTime(eco.raidDurationSec(this.selected))}（時空穩定度；基礎 ${fmtTime(era?.baseDuration ?? 300)}，穩定器升級會再延長）`);
    stay.dataset.stay = String(eco.raidDurationSec(this.selected));
    this.colB.appendChild(stay);
    const list = el('div', 'check-list');
    if (all.length === 0) list.appendChild(el('p', 'hint', '你身上沒有任何物品。\n可以空手出發，但最好先去倉庫櫃拿點裝備。'));
    for (const e of equipped) list.appendChild(this.listRow(e.stack, `裝備 ・ ${EQUIP_LABELS[e.slot]}`));
    for (const s of carried) list.appendChild(this.listRow(s, '背包'));
    for (const s of secure) list.appendChild(this.listRow(s, '保險袋（死亡不會掉）'));
    this.colB.appendChild(list);
    this.colB.appendChild(el('div', 'total-line', `攜帶總價值　${fmtCredits(total)}`));
    this.colB.appendChild(el('p', 'warn-box', '⚠ 死亡將失去保險袋以外的所有物品（包含身上裝備與背包）。時空穩定度歸零也算死亡；在 Raid 中重新整理頁面同樣視為死亡。'));
    const go = btn('啟動時光機　出發', () => this.onDepart(this.selected), 'primary go');
    go.dataset.action = 'depart';
    this.colB.appendChild(go);
  }

  dispose(): void { this.unsub(); }
}
