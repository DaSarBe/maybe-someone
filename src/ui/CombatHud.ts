import { el } from './dom';

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
  private healBar = el('i');
  private healWrap = el('div', 'cb-heal hidden');
  private hitTimer = 0;
  private vigTimer = 0;
  private last = { gap: -1, ammo: '', hp: -1, armor: -1 };

  constructor(parent: HTMLElement, touch: boolean) {
    for (const c of ['t', 'b', 'l', 'r']) this.xh.appendChild(el('i', c));
    this.xh.appendChild(el('s'));
    for (const c of ['a', 'b', 'c', 'd']) this.hitm.appendChild(el('i', c));

    const reload = el('div', 'cb-reload');
    reload.appendChild(this.reloadBar);
    const hp = el('div', 'cb-bar cb-hp');
    hp.append(this.hpFill, this.hpText);
    const armor = el('div', 'cb-bar cb-armor');
    armor.append(this.armorFill, this.armorText);
    this.healWrap.append(el('span', '', '治療中'), (() => { const b = el('div', 'cb-healbar'); b.appendChild(this.healBar); return b; })());
    this.panel.append(this.wName, this.ammo, reload, hp, armor);
    if (touch) this.panel.classList.add('touch');
    this.root.append(this.vig, this.low, this.dirs, this.xh, this.hitm, this.healWrap, this.panel);
    parent.appendChild(this.root);
  }

  dispose(): void { this.root.remove(); }

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
    this.panel.classList.toggle('reloading', reloading);
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
