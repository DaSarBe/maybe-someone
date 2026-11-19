import * as THREE from 'three';
import type { GameBus } from '../core/EventBus';
import { ARMOR_STATS } from '../data/gear';
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
  onDeath: ((killer: string) => void) | null = null;
  private armorWritten = -1;

  constructor(private bus: GameBus, private eco: EconomyService, private player: PlayerController) {
    this.refreshArmor();
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

  get armorMax(): number { return this.armorId ? ARMOR_STATS[this.armorId].durability : 0; }

  /** 把護甲耐久寫回物品 */
  flush(): void {
    if (!this.armorId) return;
    this.eco.setEquipState('armor', this.armorDur);
    this.armorWritten = Math.round(this.armorDur);
  }

  /** 受傷。raw 為武器基礎傷害（尚未套用部位與護甲）。回傳實際扣血 */
  hit(raw: number, zone: HitZone, from: THREE.Vector3 | undefined, killer: string): number {
    if (this.dead) return 0;
    const st = this.armorId ? ARMOR_STATS[this.armorId] : null;
    const r = computeDamage(raw, zone, st ? { reduction: st.reduction, dur: this.armorDur } : null);
    this.armorDur = r.durAfter;
    this.hp = Math.max(0, this.hp - r.damage);
    const killed = this.hp <= 0;
    this.bus.emit('playerHurt', { amount: r.damage, from, killed });
    this.player.shake(Math.min(0.045, 0.012 + r.damage * 0.0008));
    if (killed) {
      this.dead = true;
      this.killedBy = killer;
      this.heal = null;
      this.flush();
      this.onDeath?.(killer);
    }
    return r.damage;
  }

  /** 使用治療品；正在治療時再按一次 = 取消（已使用的物品不會退還） */
  toggleHeal(): 'started' | 'cancelled' | 'full' | 'none' {
    if (this.dead) return 'none';
    if (this.heal) { this.cancelHeal(); return 'cancelled'; }
    if (this.hp >= this.max - 0.5) return 'full';
    const ids = Object.keys(MEDICAL_STATS).filter((id) => this.eco.countCarried(id) > 0);
    const id = pickMedical(ids, this.max - this.hp);
    if (!id) return 'none';
    if (this.eco.consumeCarried(id, 1) < 1) return 'none';
    const m = MEDICAL_STATS[id];
    this.heal = { id, rate: m.heal / m.duration, left: m.duration };
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
    if (this.heal.left <= 1e-6 || this.hp >= this.max) this.heal = null;
  }
}
