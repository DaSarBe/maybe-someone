import * as THREE from 'three';
import type { Enemy } from '../ai/Enemy';
import { FACTIONS } from '../data/factions';
import { el } from './dom';

/** 頭頂標記的顯示距離（公尺） */
export const MARKER_RANGE = 25;

export type MarkerState = 'neutral' | 'friendly' | 'warn' | 'alert';

/**
 * 頭頂標記（世界座標投影到螢幕的 DOM 浮層）：中立 = 黃色菱形、友好 = 綠色菱形（都附陣營小字）；
 * 口頭警告中 = 橘色「！」；已被挑釁 = 紅色「！」。敵對的不顯示（保持緊張感）。
 * 只在 25m 內、看得到（相機到頭頂沒有被牆擋住）時顯示。
 */
export function markerState(e: Pick<Enemy, 'dead' | 'effectiveAttitude' | 'provoked' | 'warnT'>): MarkerState | null {
  if (e.dead) return null;
  if (e.provoked) return 'alert';
  if (e.warnT > 0) return 'warn';
  const a = e.effectiveAttitude;
  if (a === 'neutral') return 'neutral';
  if (a === 'friendly') return 'friendly';
  return null;
}

interface Tag { root: HTMLElement; state: MarkerState | ''; visibleAt: number; los: boolean }

export class FactionMarkers {
  private root = el('div', 'fm-root');
  private tags = new Map<Enemy, Tag>();
  private head = new THREE.Vector3();
  private v = new THREE.Vector3();
  private t = 0;

  constructor(parent: HTMLElement) { parent.appendChild(this.root); }

  dispose(): void { this.root.remove(); this.tags.clear(); }

  setVisible(v: boolean): void { this.root.classList.toggle('hidden', !v); }

  /** 目前顯示中的標記（測試用） */
  get shown(): { faction: string; state: string }[] {
    const out: { faction: string; state: string }[] = [];
    for (const [e, t] of this.tags) if (!t.root.classList.contains('hidden')) out.push({ faction: e.faction, state: t.state });
    return out;
  }

  update(dt: number, list: Enemy[], camera: THREE.PerspectiveCamera, w: number, h: number, los: (a: THREE.Vector3, b: THREE.Vector3) => boolean): void {
    this.t += dt;
    const cam = camera.position;
    for (const e of list) {
      let tag = this.tags.get(e);
      const st = markerState(e);
      const dist = Math.hypot(e.pos.x - cam.x, e.pos.y - cam.y, e.pos.z - cam.z);
      if (!st || dist > MARKER_RANGE) { if (tag) this.hide(tag); continue; }
      this.head.set(e.pos.x, e.pos.y + e.def.height + 0.3, e.pos.z);
      this.v.copy(this.head).project(camera);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) { if (tag) this.hide(tag); continue; }
      if (!tag) {
        tag = { root: el('div', 'fm-tag'), state: '', visibleAt: -9, los: false };
        tag.root.append(el('i', 'fm-ico'), el('small', 'fm-name'));
        this.root.appendChild(tag.root);
        this.tags.set(e, tag);
      }
      // 視線檢查：每 0.2 秒一次（只對在螢幕上的）
      if (this.t - tag.visibleAt > 0.2) { tag.visibleAt = this.t; tag.los = los(cam, this.head); }
      if (!tag.los) { this.hide(tag); continue; }
      if (tag.state !== st) {
        tag.state = st;
        tag.root.className = `fm-tag ${st}`;
        (tag.root.firstChild as HTMLElement).textContent = st === 'warn' || st === 'alert' ? '！' : '';
        tag.root.dataset.state = st;
        tag.root.dataset.faction = e.faction;
        (tag.root.lastChild as HTMLElement).textContent = FACTIONS[e.faction].short;
        (tag.root.lastChild as HTMLElement).style.display = st === 'warn' || st === 'alert' ? 'none' : '';
        tag.root.style.setProperty('--fc', FACTIONS[e.faction].color);
      }
      tag.root.classList.remove('hidden');
      const k = Math.max(0.7, 1 - dist / 70);
      tag.root.style.transform = `translate(${((this.v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-this.v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -100%) scale(${k.toFixed(2)})`;
    }
    // 已經不在清單（被移除）的敵人
    if (this.tags.size > list.length + 4) {
      for (const [e, tag] of this.tags) if (!list.includes(e)) { tag.root.remove(); this.tags.delete(e); }
    }
  }

  private hide(tag: Tag): void { tag.root.classList.add('hidden'); }
}
