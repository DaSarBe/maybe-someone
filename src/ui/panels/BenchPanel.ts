import {
  ATTACHMENTS, MOD_SLOTS, MOD_SLOT_NAMES, compatibleMods, mountableSlots, type ModSlot,
} from '../../data/attachments';
import { RARITY_COLORS, getItem } from '../../data/items';
import { WEAPON_STATS } from '../../data/weapons';
import { statRows, type StatRow } from '../../combat/WeaponMods';
import type { ContainerId, Loc, WeaponRef } from '../../economy/EconomyService';
import { CONTAINER_NAMES } from '../../economy/EconomyService';
import type { ItemStack } from '../../items/Inventory';
import { btn, clear, el, fmtCredits } from '../dom';
import { itemCell } from '../ItemWidgets';
import { panelFrame, type Panel, type Ui } from '../Ui';
import { WeaponPreview } from '../WeaponPreview';

const CONTAINERS: ContainerId[] = ['stash', 'carried', 'secure', 'safe'];

interface Entry { ref: WeaponRef; stack: ItemStack; where: string }

const sameRef = (a: WeaponRef, b: WeaponRef): boolean =>
  'equip' in a ? 'equip' in b && a.equip === b.equip : !('equip' in b) && a.loc.c === b.loc.c && a.loc.i === b.loc.i;

/**
 * 改槍台（基地）：選一把武器（身上裝備與倉庫、背包裡的），中間是可以拖曳旋轉的 3D 預覽，
 * 每個槽位列出可用配件（持有的直接裝；沒有的可以直接向黑市購買），點一下裝上 / 卸下；
 * 側邊顯示數值變化（綠色箭頭 = 變好、紅色 = 變差）。只能在基地改槍。
 */
export class BenchPanel implements Panel {
  readonly el: HTMLElement;
  private selected: WeaponRef | null = null;
  private slot: ModSlot = 'sight';
  private weaponsEl = el('div', 'bench-weapons');
  private slotsEl = el('div', 'bench-slots');
  private statsEl = el('div', 'bench-stats');
  private partsEl = el('div', 'bench-parts');
  private nameEl = el('div', 'bench-name');
  private creditsEl: HTMLElement;
  private preview: WeaponPreview;
  private unsub: () => void;

  constructor(private ui: Ui) {
    const f = panelFrame(ui, '改槍台');
    this.el = f.root;
    this.el.classList.add('bench');
    this.creditsEl = f.credits;
    f.body.className = 'panel-body bench-body';
    this.preview = new WeaponPreview();

    const colA = el('div', 'col bench-a');
    colA.append(el('div', 'col-head', '選擇武器'), this.weaponsEl);
    const colB = el('div', 'bench-b');
    const stage = el('div', 'bench-stage');
    stage.append(this.preview.canvas, this.nameEl, el('small', 'bench-hint', '拖曳旋轉'));
    colB.append(stage, this.slotsEl);
    const colC = el('div', 'col bench-c');
    colC.append(this.statsEl, this.partsEl);
    f.body.append(colA, colB, colC);

    this.unsub = ui.economy.subscribe(() => this.render());
    this.render();
  }

  // ---------------------------------------------------------------- 資料
  private entries(): Entry[] {
    const eco = this.ui.economy;
    const out: Entry[] = [];
    for (const slot of ['primary', 'secondary'] as const) {
      const s = eco.profile.equipment[slot];
      if (s && WEAPON_STATS[s.id]) out.push({ ref: { equip: slot }, stack: s, where: slot === 'primary' ? '主武器' : '副武器' });
    }
    for (const c of CONTAINERS) {
      eco.view(c).slots.forEach((s, i) => {
        if (s && WEAPON_STATS[s.id]) out.push({ ref: { loc: { c, i } }, stack: s, where: CONTAINER_NAMES[c] });
      });
    }
    return out;
  }

  /** 持有的某個配件所在位置（倉庫優先，再背包、保險袋、保險箱） */
  private findPart(id: string): { loc: Loc; n: number } | null {
    let total = 0;
    let first: Loc | null = null;
    for (const c of CONTAINERS) {
      this.ui.economy.view(c).slots.forEach((s, i) => {
        if (s && s.id === id) { total += s.qty; first ??= { c, i }; }
      });
    }
    return first ? { loc: first, n: total } : null;
  }

  // ---------------------------------------------------------------- 畫面
  private render(): void {
    const { ui } = this;
    const eco = ui.economy;
    this.creditsEl.textContent = fmtCredits(eco.credits);
    const entries = this.entries();
    if (!this.selected || !entries.some((e) => sameRef(e.ref, this.selected!))) this.selected = entries[0]?.ref ?? null;
    const cur = entries.find((e) => this.selected && sameRef(e.ref, this.selected));

    // 武器清單
    clear(this.weaponsEl);
    if (entries.length === 0) this.weaponsEl.appendChild(el('p', 'hint', '身上、倉庫和背包裡都沒有武器。\n先到黑市終端機買一把。'));
    for (const e of entries) {
      const def = getItem(e.stack.id)!;
      const row = el('div', `bench-weapon${cur && sameRef(e.ref, cur.ref) ? ' sel' : ''}`);
      row.dataset.weapon = e.stack.id;
      row.addEventListener('click', () => { ui.audio.playUi('click', 0.4); this.selected = e.ref; this.slot = mountableSlots(e.stack.id)[0] ?? 'sight'; this.render(); });
      const info = el('div', 'bench-weapon-name');
      const nMods = Object.keys(e.stack.mods ?? {}).length;
      info.append(el('b', '', def.name), el('small', '', `${e.where}${nMods ? ` ・ 配件 ${nMods}` : ''}`));
      row.append(itemCell({ id: e.stack.id, qty: 1, mods: e.stack.mods }, {}), info);
      this.weaponsEl.appendChild(row);
    }

    if (!cur) {
      this.preview.setWeapon(null);
      this.nameEl.textContent = '';
      clear(this.slotsEl); clear(this.statsEl); clear(this.partsEl);
      return;
    }
    const w = cur.stack;
    const def = getItem(w.id)!;
    this.nameEl.textContent = def.name;
    this.preview.setWeapon(w.id, w.mods);

    const slots = mountableSlots(w.id);
    if (!slots.includes(this.slot)) this.slot = slots[0] ?? 'sight';

    // 槽位列
    clear(this.slotsEl);
    for (const s of MOD_SLOTS) {
      const ok = slots.includes(s);
      const id = w.mods?.[s];
      const b = btn('', () => { if (!ok) return; ui.audio.playUi('click', 0.4); this.slot = s; this.render(); }, `slot-chip${this.slot === s ? ' on' : ''}${ok ? '' : ' off'}${id ? ' has' : ''}`);
      b.dataset.slot = s;
      b.disabled = !ok;
      b.append(el('span', 'slot-name', MOD_SLOT_NAMES[s]), el('b', '', ok ? (id ? getItem(id)?.name.split(' ')[1] ?? '' : s === 'sight' ? '機械' : '—') : '不可'));
      this.slotsEl.appendChild(b);
    }

    this.renderStats(w);
    this.renderParts(cur);
  }

  private renderStats(w: ItemStack): void {
    clear(this.statsEl);
    this.statsEl.appendChild(el('div', 'col-head', '數值'));
    const grid = el('div', 'stat-grid');
    for (const r of statRows(w.id, w.mods)) grid.appendChild(this.statRow(r));
    this.statsEl.appendChild(grid);
  }

  private statRow(r: StatRow): HTMLElement {
    const row = el('div', 'stat-row');
    row.dataset.stat = r.key;
    const diff = r.value - r.base;
    const eps = Math.pow(10, -r.digits) / 2;
    const dir = Math.abs(diff) < eps ? 0 : diff > 0 ? 1 : -1;
    const good = dir === 0 ? 0 : (dir > 0) === r.higherBetter ? 1 : -1;
    const fmt = (n: number): string => n.toFixed(r.digits);
    const arrow = el('i', `arrow ${good > 0 ? 'good' : good < 0 ? 'bad' : ''}`, dir === 0 ? '' : dir > 0 ? '▲' : '▼');
    const val = el('b', good > 0 ? 'good' : good < 0 ? 'bad' : '', `${fmt(r.value)}${r.unit}`);
    row.append(el('span', '', r.label), val, arrow);
    if (dir !== 0) row.title = `原本 ${fmt(r.base)}${r.unit}`;
    return row;
  }

  private renderParts(cur: Entry): void {
    const { ui } = this;
    const eco = ui.economy;
    const w = cur.stack;
    clear(this.partsEl);
    this.partsEl.appendChild(el('div', 'col-head', `${MOD_SLOT_NAMES[this.slot]}配件`));
    const list = el('div', 'bench-part-list');
    const equipped = w.mods?.[this.slot];

    if (equipped) {
      const row = el('div', 'bench-part sel');
      row.dataset.part = equipped;
      const d = getItem(equipped)!;
      row.append(itemCell({ id: equipped, qty: 1 }, {}), this.partInfo(equipped), el('span', 'tagline', '點一下卸下'));
      row.addEventListener('click', () => {
        const r = eco.removeMod(cur.ref, this.slot);
        if (ui.report(r, `已卸下 ${d.name}`)) ui.audio.playUi('drop', 0.5);
      });
      list.appendChild(row);
    } else if (this.slot === 'sight') {
      list.appendChild(el('p', 'hint', '目前使用機械瞄具（槍上的準星與照門）。'));
    }

    for (const id of compatibleMods(w.id, this.slot)) {
      if (id === equipped) continue;
      const d = getItem(id)!;
      const have = this.findPart(id);
      const price = eco.buyPriceOf(id);
      const row = el('div', `bench-part${have ? '' : ' buy'}`);
      row.dataset.part = id;
      const tag = have ? `${CONTAINER_NAMES[have.loc.c]} ×${have.n}` : fmtCredits(price);
      const t = el('span', `tagline${have ? '' : ' price'}`, tag);
      row.append(itemCell({ id, qty: 1 }, {}), this.partInfo(id), t);
      row.addEventListener('click', () => {
        if (have) {
          const r = eco.installMod(cur.ref, have.loc);
          if (ui.report(r, `已安裝 ${d.name}`)) ui.audio.playUi('equip', 0.6);
        } else {
          const r = eco.buyAndInstallMod(cur.ref, id);
          if (ui.report(r, `已購買並安裝 ${d.name}（-${fmtCredits(price)}）`)) ui.audio.playUi('pickup', 0.6);
        }
      });
      list.appendChild(row);
    }
    this.partsEl.appendChild(list);
  }

  private partInfo(id: string): HTMLElement {
    const d = getItem(id)!;
    const a = ATTACHMENTS[id];
    const box = el('div', 'bench-part-info');
    const name = el('b', '', d.name);
    name.style.color = RARITY_COLORS[d.rarity];
    const fx = el('small', 'fx');
    for (const p of a.pros) fx.appendChild(el('span', 'pro', p));
    for (const c of a.cons) fx.appendChild(el('span', 'con', c));
    box.append(name, fx);
    return box;
  }

  dispose(): void {
    this.unsub();
    this.preview.dispose();
  }
}
