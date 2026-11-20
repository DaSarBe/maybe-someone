import {
  ATTITUDE_HINT, ATTITUDE_NAME, CORPS, CORP_IDS, FACTIONS, FACTION_IDS, FRIENDLY_ABOVE, HOSTILE_BELOW, REP_MAX, REP_MIN, SWITCH_CORP_COST,
  type CorpId, type FactionId,
} from '../../data/factions';
import { btn, clear, el, fmtCredits } from '../dom';
import { panelFrame, type Panel, type Ui } from '../Ui';

/** 把 -100..+100 換成 0..100% 的位置 */
const pct = (v: number): number => ((v - REP_MIN) / (REP_MAX - REP_MIN)) * 100;

/** 陣營聲望條（陣營頁面與其他面板共用） */
export function repBar(rep: number): HTMLElement {
  const bar = el('div', 'rep-bar');
  const fill = el('i', 'rep-fill');
  const center = pct(0), at = pct(rep);
  fill.style.left = `${Math.min(center, at)}%`;
  fill.style.width = `${Math.abs(at - center)}%`;
  const mark = (v: number) => { const m = el('s', 'rep-mark'); m.style.left = `${pct(v)}%`; return m; };
  bar.append(fill, mark(HOSTILE_BELOW), mark(0), mark(FRIENDLY_ABOVE));
  return bar;
}

/** 陣營頁面：所屬企業與加成、五個陣營的聲望、態度與說明；也是轉換企業的地方 */
export class FactionPanel implements Panel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private unsub: () => void;
  private switching: CorpId | null = null;

  constructor(private ui: Ui) {
    const f = panelFrame(ui, '陣營情報');
    this.el = f.root;
    this.el.classList.add('factions');
    f.body.className = 'panel-body single faction-body';
    this.body = f.body;
    this.unsub = ui.economy.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const eco = this.ui.economy;
    const corp = eco.corp;
    clear(this.body);

    // 所屬企業
    const mine = el('div', 'faction-mine');
    if (corp) {
      const d = FACTIONS[corp];
      mine.style.setProperty('--fc', d.color);
      mine.append(el('b', '', `所屬企業　${d.name}`), el('small', '', `加成：${CORPS[corp].perk}`));
    } else mine.append(el('b', '', '尚未加入企業'));
    this.body.appendChild(mine);

    // 五個陣營
    const list = el('div', 'faction-list');
    for (const id of FACTION_IDS) {
      const d = FACTIONS[id];
      const rep = eco.reputationOf(id);
      const att = eco.attitudeToward(id);
      const row = el('div', `faction-row att-${att}${id === corp ? ' own' : ''}`);
      row.dataset.faction = id;
      row.dataset.rep = String(rep);
      row.dataset.attitude = att;
      row.style.setProperty('--fc', d.color);
      const head = el('div', 'faction-head');
      head.append(el('b', '', d.name + (id === corp ? '（所屬）' : '')), el('span', `att-tag att-${att}`, ATTITUDE_NAME[att]), el('span', 'rep-num', `${rep > 0 ? '+' : ''}${rep}`));
      row.append(head, repBar(rep), el('small', 'faction-desc', `${d.desc}　${id === corp ? '自己人：一定友好，聲望固定。' : ATTITUDE_HINT[att]}`));
      list.appendChild(row);
    }
    this.body.appendChild(list);

    // 關係
    const rel = el('p', 'hint faction-rel', '關係：警衛 ⇄ 黑道、警衛 ⇄ 所有企業、黑道 ⇄ 所有企業 一定敵對。企業之間每一場 Raid 隨機休戰（約 4 成）或敵對，出發時會提示。殺死某陣營的人會降低他們的聲望（友好時扣更多），他們的敵人則小幅加分；在時代商行可以花舊台幣「找人打點」警衛與海龍幫。');
    this.body.appendChild(rel);

    // 轉換企業
    if (corp) {
      const sw = el('div', 'faction-switch');
      sw.appendChild(el('b', '', `轉換企業（${fmtCredits(SWITCH_CORP_COST)}，企業聲望重置）`));
      const row = el('div', 'act-row');
      for (const id of CORP_IDS) {
        if (id === corp) continue;
        const armed = this.switching === id;
        const b = btn(armed ? `再按一次確認：改投${FACTIONS[id].name}` : `改投${FACTIONS[id].name}`, () => {
          if (this.switching !== id) { this.switching = id; this.render(); return; }
          this.switching = null;
          this.ui.report(eco.switchCorp(id), `你改投了${FACTIONS[id].name}`);
          this.render();
        }, armed ? 'danger' : '');
        b.dataset.action = 'switch-corp';
        b.dataset.corp = id;
        row.appendChild(b);
      }
      sw.appendChild(row);
      this.body.appendChild(sw);
    }
  }

  dispose(): void { this.unsub(); }
}

/** 目前對各陣營的態度（時光機面板用的簡潔一列） */
export function attitudeChips(eco: Ui['economy']): HTMLElement {
  const wrap = el('div', 'att-chips');
  wrap.dataset.role = 'attitudes';
  for (const id of FACTION_IDS as FactionId[]) {
    const att = eco.attitudeToward(id);
    const chip = el('span', `att-chip att-${att}`);
    chip.dataset.faction = id;
    chip.dataset.attitude = att;
    chip.style.setProperty('--fc', FACTIONS[id].color);
    chip.append(el('i'), el('span', '', `${FACTIONS[id].short} ${ATTITUDE_NAME[att]}`));
    wrap.appendChild(chip);
  }
  return wrap;
}
