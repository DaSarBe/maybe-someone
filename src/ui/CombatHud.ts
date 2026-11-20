import { HELMET_VIGNETTE } from '../data/helmet';
import { el } from './dom';

const ROMAN = ['', 'I', 'II', 'III', 'IV'];
import type { LayoutManager } from './layout/LayoutManager';

/** 戰鬥 HUD：準心（動態散佈）、命中標記、彈藥 / 生命 / 護甲、受傷暈影與方向指示、治療進度 */
export class CombatHud {
  private root = el('div', 'cb-root');
  private xh = el('div', 'cb-xh');
  private hitm = el('div', 'cb-hit');
  private vig = el('div', 'cb-vig');
  private low = el('div', 'cb-low');
  private dirs = el('div', 'cb-dirs');
  private panel = el('div', 'cb-panel');
  private wName = el('div', 'cb-wname');
  private ammo = el('div', 'cb-ammo');
  private reloadBar = el('i');
  private hpFill = el('i');
  private hpText = el('b');
  private armorFill = el('i');
  private armorText = el('span');
  private helmetFill = el('i');
  private helmetText = el('span');
  private flash = el('div', 'cb-flash');
  private hvig = el('div', 'cb-hvig');
  private flashT = 0;
  private healBar = el('i');
  private healWrap = el('div', 'cb-heal hidden');
  private hitTimer = 0;
  private vigTimer = 0;
  private last = { gap: -1, ammo: '', hp: -1, armor: -1, helmet: '' };
  /** 「換彈中」樣式掛在哪個元素上（電腦版是整個面板，手機版是彈藥框） */
  private ammoHost: HTMLElement = this.panel;
  private unbinds: (() => void)[] = [];

  /** layout：手機觸控版面。有的話，彈藥 / 血量 / 護甲 / 受擊方向各自獨立定位；沒有就用原本的整塊面板（電腦版）。 */
  constructor(parent: HTMLElement, touch: boolean, layout: LayoutManager | null = null) {
    for (const c of ['t', 'b', 'l', 'r']) this.xh.appendChild(el('i', c));
    this.xh.appendChild(el('s'));
    for (const c of ['a', 'b', 'c', 'd']) this.hitm.appendChild(el('i', c));

    const reload = el('div', 'cb-reload');
    reload.appendChild(this.reloadBar);
    const hp = el('div', 'cb-bar cb-hp');
    hp.append(this.hpFill, this.hpText);
    const armor = el('div', 'cb-bar cb-armor');
    armor.append(this.armorFill, this.armorText);
    const helmet = el('div', 'cb-bar cb-helmet');
    helmet.append(this.helmetFill, this.helmetText);
    this.healWrap.append(el('span', '', '治療中'), (() => { const b = el('div', 'cb-healbar'); b.appendChild(this.healBar); return b; })());
    if (layout) {
      const ammoBox = el('div', 'cb-tbox cb-ammobox');
      ammoBox.append(this.wName, this.ammo, reload);
      const hpBox = el('div', 'cb-tbox cb-hpbox');
      this.healWrap.classList.add('in-box');
      hpBox.append(hp, this.healWrap);
      const armorBox = el('div', 'cb-tbox cb-armorbox');
      armorBox.appendChild(armor);
      const helmetBox = el('div', 'cb-tbox cb-helmetbox');
      helmetBox.appendChild(helmet);
      this.ammoHost = ammoBox;
      this.root.append(this.hvig, this.vig, this.low, this.flash, this.dirs, this.xh, this.hitm, ammoBox, hpBox, armorBox, helmetBox);
      this.unbinds.push(
        layout.bind('ammo', ammoBox), layout.bind('hp', hpBox), layout.bind('armor', armorBox), layout.bind('helmet', helmetBox), layout.bind('hitdir', this.dirs),
      );
    } else {
      this.panel.append(this.wName, this.ammo, reload, hp, armor, helmet);
      if (touch) this.panel.classList.add('touch');
      this.root.append(this.hvig, this.vig, this.low, this.flash, this.dirs, this.xh, this.hitm, this.healWrap, this.panel);
    }
    parent.appendChild(this.root);
  }

  dispose(): void { this.unbinds.forEach((u) => u()); this.root.remove(); }

  setVisible(v: boolean): void { this.root.classList.toggle('hidden', !v); }

  /** gapPx：準心中心到四條線的距離；onTarget：準心下有敵人 */
  setCrosshair(gapPx: number, onTarget: boolean, hasWeapon: boolean): void {
    const g = Math.round(gapPx);
    if (g !== this.last.gap) { this.last.gap = g; this.xh.style.setProperty('--g', `${g}px`); }
    this.xh.classList.toggle('on', onTarget);
    this.xh.classList.toggle('hidden', !hasWeapon);
  }

  setWeapon(name: string, mag: number, magMax: number, reserve: number, reloading: boolean, reloadProgress: number, slotLabel: string): void {
    const key = `${name}|${mag}|${reserve}|${reloading}|${slotLabel}`;
    if (key !== this.last.ammo) {
      this.last.ammo = key;
      this.wName.textContent = name ? `${slotLabel} ${name}` : '空手';
      this.ammo.innerHTML = name
        ? `<b class="${mag === 0 ? 'empty' : mag <= Math.ceil(magMax * 0.25) ? 'low' : ''}">${mag}</b><span> / ${reserve}</span>`
        : '';
    }
    this.reloadBar.style.width = reloading ? `${Math.round(reloadProgress * 100)}%` : '0';
    this.ammoHost.classList.toggle('reloading', reloading);
  }

  setHealth(hp: number, max: number, armorDur: number, armorMax: number): void {
    const h = Math.ceil(hp);
    if (h !== this.last.hp) {
      this.last.hp = h;
      this.hpFill.style.width = `${(hp / max) * 100}%`;
      this.hpText.textContent = String(h);
      this.hpFill.classList.toggle('low', hp / max < 0.3);
      this.low.classList.toggle('on', hp / max < 0.3 && hp > 0);
    }
    const a = Math.ceil(armorDur);
    if (a !== this.last.armor) {
      this.last.armor = a;
      this.armorFill.style.width = armorMax ? `${(armorDur / armorMax) * 100}%` : '0';
      this.armorText.textContent = armorMax ? `護甲 ${a}/${armorMax}` : '無護甲';
    }
  }

  /** 頭盔耐久列：dur / max 與生效等級（低耐久降級時變橘色）；沒戴頭盔 max = 0。3、4 級頭盔有輕微的視野暗角 */
  setHelmet(dur: number, max: number, level: number, effLevel: number): void {
    const d = Math.ceil(dur);
    const key = `${d}|${max}|${level}|${effLevel}`;
    if (key === this.last.helmet) return;
    this.last.helmet = key;
    this.helmetFill.style.width = max ? `${(dur / max) * 100}%` : '0';
    this.helmetFill.classList.toggle('worn', max > 0 && effLevel < level);
    this.helmetText.textContent = max ? `頭盔 ${ROMAN[level] ?? level} ${d}/${max}` : '無頭盔';
    this.hvig.style.opacity = String(effLevel >= 4 ? HELMET_VIGNETTE[4] : effLevel === 3 ? HELMET_VIGNETTE[3] : 0);
  }

  /** 頭盔被子彈打中：畫面閃一下白光 */
  flashHelmet(): void {
    this.flash.style.opacity = '0.75';
    this.flashT = 0.35;
  }

  setHeal(progress: number | null): void {
    this.healWrap.classList.toggle('hidden', progress === null);
    if (progress !== null) this.healBar.style.width = `${Math.round(progress * 100)}%`;
  }

  /** 命中標記：爆頭紅色，擊殺更大 */
  showHit(zone: 'head' | 'body' | 'limb', killed: boolean): void {
    this.hitm.className = `cb-hit show ${zone === 'head' ? 'head' : ''} ${killed ? 'kill' : ''}`;
    this.hitTimer = killed ? 0.4 : 0.18;
    void this.hitm.offsetWidth;
  }

  /** 受傷：暈影強度依傷害；angle 為攻擊來源相對視線的角度（弧度，0 = 正前方，順時針為正） */
  showHurt(amount: number, angle: number | null): void {
    this.vig.style.opacity = String(Math.min(1, 0.45 + amount / 35));
    this.vigTimer = 0.9;
    if (angle !== null) {
      const d = el('div', 'cb-dir');
      d.style.transform = `rotate(${(angle * 180) / Math.PI}deg)`;
      this.dirs.appendChild(d);
      window.setTimeout(() => d.remove(), 1100);
    }
  }

  update(dt: number): void {
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.style.opacity = String(Math.max(0, (this.flashT / 0.35) * 0.75));
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.hitm.classList.remove('show');
    }
    if (this.vigTimer > 0) {
      this.vigTimer -= dt;
      const o = parseFloat(this.vig.style.opacity || '0');
      this.vig.style.opacity = String(Math.max(0, o - dt * 0.9));
    }
  }
}
