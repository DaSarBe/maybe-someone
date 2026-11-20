import * as THREE from 'three';
import type { GameBus } from '../core/EventBus';
import type { NoiseEvent, NoiseKind } from '../data/noise';
import { ARMOR_STATS, HELMET_STATS } from '../data/gear';
import { effectiveHelmetLevel, resolveHeadshot, type WeaponClass } from '../data/helmet';
import { MEDICAL_STATS, pickMedical } from '../data/medical';
import type { EconomyService } from '../economy/EconomyService';
import type { PlayerController } from '../player/PlayerController';
import { computeDamage, type HitZone } from './Damage';

export const PLAYER_MAX_HP = 100;

interface HealState { id: string; rate: number; left: number }

/**
 * 玩家生命、護甲與治療。護甲耐久在記憶體中追蹤，flush() 時寫回裝備物品
 * （換槍、開啟介面、撤離或死亡前呼叫，不是每次受傷都存檔）。
 */
export class PlayerHealth {
  hp = PLAYER_MAX_HP;
  readonly max = PLAYER_MAX_HP;
  dead = false;
  killedBy: string | null = null;
  heal: HealState | null = null;
  /** 護甲耐久（沒穿護甲為 0） */
  armorDur = 0;
  armorId: string | null = null;
  /** 頭盔耐久（沒戴為 0） */
  helmetDur = 0;
  helmetId: string | null = null;
  /** 最近一次致死是不是爆頭（結算畫面標示用） */
  killedByHeadshot = false;
  onDeath: ((killer: string, headshot: boolean) => void) | null = null;
  private armorWritten = -1;
  private helmetWritten = -1;
  private pingAt = -9;

  constructor(private bus: GameBus, private eco: EconomyService, private player: PlayerController) {
    this.refreshArmor();
    this.refreshHelmet();
  }

  /** 聲音事件（受傷悶哼、治療）：在胸口高度 */
  private noise(kind: NoiseKind, extra: Partial<NoiseEvent> = {}): void {
    const p = this.player.position;
    this.bus.emit('noise', { kind, position: { x: p.x, y: p.y + 1.2, z: p.z }, source: 'player', ...extra });
  }

  /** 從裝備欄重新讀取護甲（開局、關閉背包介面後） */
  refreshArmor(): void {
    const a = this.eco.profile.equipment.armor;
    const stat = a ? ARMOR_STATS[a.id] : undefined;
    if (!a || !stat) { this.armorId = null; this.armorDur = 0; this.armorWritten = -1; return; }
    const stored = a.dur ?? stat.durability;
    if (this.armorId !== a.id || stored !== this.armorWritten) {
      this.armorId = a.id;
      this.armorDur = stored;
      this.armorWritten = stored;
    }
  }

  /** 從裝備欄重新讀取頭盔 */
  refreshHelmet(): void {
    const h = this.eco.profile.equipment.helmet;
    const stat = h ? HELMET_STATS[h.id] : undefined;
    if (!h || !stat) { this.helmetId = null; this.helmetDur = 0; this.helmetWritten = -1; return; }
    const stored = h.dur ?? stat.durability;
    if (this.helmetId !== h.id || stored !== this.helmetWritten) {
      this.helmetId = h.id;
      this.helmetDur = stored;
      this.helmetWritten = stored;
    }
  }

  get helmetMax(): number { return this.helmetId ? HELMET_STATS[this.helmetId].durability : 0; }
  /** 目前實際生效的頭盔等級（耐久低於 30% 降一級，歸零 = 0） */
  get helmetEffLevel(): number {
    return this.helmetId ? effectiveHelmetLevel({ level: HELMET_STATS[this.helmetId].level, dur: this.helmetDur, max: this.helmetMax }) : 0;
  }

  get armorMax(): number { return this.armorId ? ARMOR_STATS[this.armorId].durability : 0; }

  /** 把護甲耐久寫回物品 */
  flush(): void {
    if (this.armorId) {
      this.eco.setEquipState('armor', this.armorDur);
      this.armorWritten = Math.round(this.armorDur);
    }
    if (this.helmetId) {
      this.eco.setEquipState('helmet', this.helmetDur);
      this.helmetWritten = Math.round(this.helmetDur);
    }
  }

  /**
   * 受傷。raw 為武器基礎傷害（尚未套用部位與護甲）。回傳實際扣血。
   * 爆頭（zone = head）不看傷害數字：沒頭盔 = 立即死亡；有頭盔依 weaponClass × 頭盔等級查表（data/helmet.ts）。
   */
  hit(raw: number, zone: HitZone, from: THREE.Vector3 | undefined, killer: string, weaponClass: WeaponClass = 'light', rng: () => number = Math.random): number {
    if (this.dead) return 0;
    let amount: number;
    let armorHit = false;
    let helmetHit = false;
    let lethal = false;
    if (zone === 'head') {
      const hs = HELMET_STATS[this.helmetId ?? ''];
      const r = resolveHeadshot(weaponClass, hs ? { level: hs.level, dur: this.helmetDur, max: hs.durability } : null, this.max, rng);
      this.helmetDur = r.durAfter;
      amount = r.damage;
      lethal = r.lethal;
      helmetHit = r.helmetHit;
    } else {
      const st = this.armorId ? ARMOR_STATS[this.armorId] : null;
      const r = computeDamage(raw, zone, st ? { reduction: st.reduction, dur: this.armorDur } : null);
      this.armorDur = r.durAfter;
      amount = r.damage;
      armorHit = r.durLoss > 0;
    }
    this.hp = lethal ? 0 : Math.max(0, this.hp - amount);
    const killed = this.hp <= 0;
    const r = { damage: amount, durLoss: armorHit ? 1 : 0 };
    if (helmetHit) this.helmetPing();
    this.bus.emit('playerHurt', { amount: r.damage, from, killed, armor: armorHit, helmet: helmetHit, head: zone === 'head' });
    this.noise(killed ? 'death' : 'hurt', { surface: this.player.surface });
    this.player.shake(Math.min(0.045, 0.012 + r.damage * 0.0008));
    if (killed) {
      this.dead = true;
      this.killedByHeadshot = zone === 'head';
      this.killedBy = killer;
      this.heal = null;
      this.flush();
      this.onDeath?.(killer, zone === 'head');
    }
    return r.damage;
  }

  /** 頭盔被打中：金屬反彈「叮」（noise，15m）+ 通知 HUD / 音效（閃白光、耳鳴）。同一次齊射的多顆彈丸只響一次 */
  private helmetPing(): void {
    this.bus.emit('helmetHit', { target: 'player', level: this.helmetEffLevel });
    const now = performance.now() / 1000;
    if (now - this.pingAt < 0.08) return;
    this.pingAt = now;
    const p = this.player.position;
    this.bus.emit('noise', { kind: 'helmet_ping', position: { x: p.x, y: p.y + 1.6, z: p.z }, source: 'player' });
  }

  /** 使用治療品；正在治療時再按一次 = 取消（已使用的物品不會退還） */
  toggleHeal(): 'started' | 'cancelled' | 'full' | 'none' {
    if (this.dead) return 'none';
    if (this.heal) { this.cancelHeal(); this.bus.emit('heal', { phase: 'cancel' }); return 'cancelled'; }
    if (this.hp >= this.max - 0.5) return 'full';
    const ids = Object.keys(MEDICAL_STATS).filter((id) => this.eco.countCarried(id) > 0);
    const id = pickMedical(ids, this.max - this.hp);
    if (!id) return 'none';
    if (this.eco.consumeCarried(id, 1) < 1) return 'none';
    const m = MEDICAL_STATS[id];
    this.heal = { id, rate: m.heal / m.duration, left: m.duration };
    this.bus.emit('heal', { phase: 'start' });
    this.noise('heal', { item: id });
    return 'started';
  }

  cancelHeal(): void {
    this.heal = null;
  }

  get healing(): boolean { return !!this.heal; }
  get healMoveScale(): number { return this.heal ? MEDICAL_STATS[this.heal.id].moveScale : 1; }
  get healProgress(): number {
    if (!this.heal) return 0;
    const total = MEDICAL_STATS[this.heal.id].duration;
    return 1 - this.heal.left / total;
  }

  update(dt: number): void {
    if (!this.heal || this.dead) return;
    const step = Math.min(dt, this.heal.left);
    this.hp = Math.min(this.max, this.hp + this.heal.rate * step);
    this.heal.left -= step;
    if (this.heal.left <= 1e-6 || this.hp >= this.max) { this.heal = null; this.bus.emit('heal', { phase: 'done' }); }
  }
}
