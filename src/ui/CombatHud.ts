import { HELMET_VIGNETTE } from '../data/helmet';
import { el } from './dom';

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

/** 倍鏡十字線（SVG，圓形視野內）：2 倍 = 粗外框 + 細十字；4 倍再加刻度與下方的測距線 */
function reticleSvg(kind: '' | '2' | '4'): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-100 -100 200 200');
  svg.setAttribute('class', 'cb-scope-ret');
  const line = (x1: number, y1: number, x2: number, y2: number, w: number): void => {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1)); l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
    l.setAttribute('stroke-width', String(w));
    svg.appendChild(l);
  };
  // 外側粗線（四個方向）→ 細十字（中間留空）
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
    line(dx * 98, dy * 98, dx * 34, dy * 34, kind === '4' ? 2.2 : 3);
    line(dx * 34, dy * 34, dx * 5, dy * 5, 0.7);
  }
  if (kind === '4') {
    // 水平 / 垂直刻度（每 10 單位一格）與下方的測距線
    for (let i = 1; i <= 3; i++) {
      for (const sgn of [-1, 1]) {
        line(sgn * (5 + i * 9), -2.2, sgn * (5 + i * 9), 2.2, 0.6);
        line(-2.2, sgn * (5 + i * 9), 2.2, sgn * (5 + i * 9), 0.6);
      }
    }
    line(-12, 46, 12, 46, 0.9);
    line(-18, 62, 18, 62, 0.9);
    line(-24, 78, 24, 78, 0.9);
  }
  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('r', kind === '4' ? '0.9' : '1.1');
  svg.appendChild(dot);
  return svg;
}
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
  private scope = el('div', 'cb-scope');
  private scopeRing = el('div', 'cb-scope-ring');
  private scopeZoom = el('b', 'cb-scope-zoom');
  private scopeKind: '' | '2' | '4' = '';
  private hvig = el('div', 'cb-hvig');
  private flashT = 0;
  private healBar = el('i');
  private healWrap = el('div', 'cb-heal hidden');
  private hitTimer = 0;
  private vigTimer = 0;
  private last = { gap: -1, ammo: '', hp: -1, armor: -1, helmet: '', xh: -1, scope: '' };
  /** 「換彈中」樣式掛在哪個元素上（電腦版是整個面板，手機版是彈藥框） */
  private ammoHost: HTMLElement = this.panel;
  private unbinds: (() => void)[] = [];

  /** layout：手機觸控版面。有的話，彈藥 / 血量 / 護甲 / 受擊方向各自獨立定位；沒有就用原本的整塊面板（電腦版）。 */
  constructor(parent: HTMLElement, touch: boolean, layout: LayoutManager | null = null) {
    this.scopeRing.append(this.scopeZoom);
    this.scope.appendChild(this.scopeRing);
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
    // 倍鏡畫面獨立在 HUD 之下（z-index 9）：觸控按鈕與 HUD 仍然看得到、點得到
    parent.append(this.scope, this.root);
  }

  dispose(): void { this.unbinds.forEach((u) => u()); this.root.remove(); this.scope.remove(); }

  setVisible(v: boolean): void { this.root.classList.toggle('hidden', !v); this.scope.classList.toggle('hidden', !v); }

  /**
   * 瞄準：準心淡出（瞄準時改用槍上的瞄具對準，放開再淡入）；倍鏡額外蓋上倍鏡畫面。
   * ads = 瞄準程度 0..1（已緩動）；scopeZoom = 0（不是倍鏡）或 2 / 4。
   */
  setAds(ads: number, scopeZoom: number): void {
    const fade = Math.max(0, 1 - ads * 2.2);
    const q = Math.round(fade * 50);
    if (q !== this.last.xh) { this.last.xh = q; this.xh.style.opacity = String(q / 50); }
    const kind = scopeZoom >= 4 ? '4' : scopeZoom >= 2 ? '2' : '';
    const amount = kind ? ads : 0;
    const on = amount > 0.02;
    const key = `${kind}|${on ? Math.round(amount * 60) : 0}|${window.innerWidth}x${window.innerHeight}`;
    if (key === this.last.scope) return;
    this.last.scope = key;
    this.scope.classList.toggle('on', on);
    if (!on) return;
    if (kind !== this.scopeKind) {
      this.scopeKind = kind;
      this.scopeRing.dataset.zoom = kind;
      this.scopeRing.querySelector('svg')?.remove();
      this.scopeRing.prepend(reticleSvg(kind));
      this.scopeZoom.textContent = `${kind}×`;
    }
    const e = amount * amount * (3 - 2 * amount);
    const H = window.innerHeight;
    const d = H * (0.16 + 0.8 * e);
    this.scopeRing.style.setProperty('--d', `${d}px`);
    // 鏡框從槍上（畫面中心的小圈）放大到全螢幕；黑色外圈與十字線隨後淡入
    this.scope.style.opacity = String(Math.min(1, Math.max(0, (amount - 0.2) / 0.5)));
    this.scopeRing.style.setProperty('--ret', String(Math.min(1, Math.max(0, (amount - 0.7) / 0.25))));
  }

  /** gapPx：準心中心到四條線的距離；onTarget：準心下有敵人 */
  setCrosshair(gapPx: number, onTarget: boolean, hasWeapon: boolean): void {
    const g = Math.round(gapPx);
    if (g !== this.last.gap) { this.last.gap = g; this.xh.style.setProperty('--g', `${g}px`); }
    this.xh.classList.toggle('on', onTarget);
    this.xh.classList.toggle('hidden', !hasWeapon);
  }

  setWeapon(name: string, mag: number, magMax: number, reserve: number, reloading: boolean, reloadProgress: number, slotLabel: string, tactical = ''): void {
    const key = `${name}|${mag}|${magMax}|${reserve}|${reloading}|${slotLabel}|${tactical}`;
    if (key !== this.last.ammo) {
      this.last.ammo = key;
      this.wName.textContent = name ? `${slotLabel} ${name}${tactical ? ` ・ ${tactical}` : ''}` : '空手';
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
