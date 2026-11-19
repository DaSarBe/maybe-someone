import { UPGRADES, type UpgradeDef } from '../../data/upgrades';
import { btn, clear, el, fmtCredits } from '../dom';
import { panelFrame, type Panel, type Ui } from '../Ui';

const fmtVal = (u: UpgradeDef, v: number): string => (u.id === 'search' ? `${Math.round(v * 100)}% 時間` : `${v} ${u.unit}`);

/** 升級工作台 */
export class UpgradePanel implements Panel {
  readonly el: HTMLElement;
  private list = el('div', 'upgrade-list');
  private creditsEl: HTMLElement;
  private unsub: () => void;

  constructor(private ui: Ui) {
    const f = panelFrame(ui, '升級工作台');
    this.el = f.root;
    this.creditsEl = f.credits;
    f.body.className = 'panel-body single';
    f.body.appendChild(this.list);
    this.unsub = ui.economy.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const { ui } = this;
    this.creditsEl.textContent = fmtCredits(ui.economy.credits);
    clear(this.list);
    for (const u of UPGRADES) {
      const lv = ui.economy.upgradeLevel(u.id);
      const max = u.levels.length;
      const card = el('div', 'upgrade-card');
      card.dataset.upgrade = u.id;
      const icon = el('div', 'upgrade-icon', u.glyph);
      const body = el('div', 'upgrade-body');
      const pips = el('div', 'pips');
      for (let i = 0; i < max; i++) pips.appendChild(el('i', i < lv ? 'on' : ''));
      const cur = lv === 0 ? u.base : u.levels[lv - 1].value;
      const next = lv < max ? u.levels[lv].value : null;
      body.append(
        el('b', '', `${u.name}　Lv.${lv}/${max}`),
        el('small', '', u.desc),
        pips,
        el('span', 'change', next === null ? `目前：${fmtVal(u, cur)}（已滿級）` : `${fmtVal(u, cur)}  →  ${fmtVal(u, next)}`),
      );
      const cost = ui.economy.upgradeCost(u.id);
      const b = btn(cost === null ? '已滿級' : `升級 ${fmtCredits(cost)}`, () => {
        const r = ui.economy.upgrade(u.id);
        if (ui.report(r, `${u.name} 升到 Lv.${lv + 1}`)) ui.audio.playUi('pickup', 0.6);
      }, cost === null ? 'disabled' : 'primary gold');
      b.dataset.action = 'upgrade';
      if (cost === null) b.disabled = true;
      card.append(icon, body, b);
      this.list.appendChild(card);
    }
  }

  dispose(): void { this.unsub(); }
}
