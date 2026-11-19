import * as THREE from 'three';
import type { GameBus } from '../core/EventBus';
import type { Input } from '../core/Input';
import { WEAPON_STATS } from '../data/weapons';
import { BASE_FOV, WEAPON_HANDLING, type WeaponHandling } from '../data/weaponHandling';
import { getItem } from '../data/items';
import type { EconomyService } from '../economy/EconomyService';
import type { EquipSlot } from '../items/Profile';
import type { PlayerController } from '../player/PlayerController';
import { damageFalloff, type HitZone } from './Damage';
import type { CombatFx } from './Fx';
import type { PlayerHealth } from './PlayerHealth';
import type { Viewmodel } from './Viewmodel';
import { WeaponState, computeSpread, type AmmoSource } from './WeaponState';
import type { WorldTrace } from './WorldTrace';

const SLOTS: EquipSlot[] = ['primary', 'secondary'];
const SLOT_LABEL = ['1', '2'];
const SWITCH_TIME = 0.32;
const DEG = Math.PI / 180;

/** 敵人命中判定的介面（由 EnemyManager 實作），讓武器系統不認識 AI 細節 */
export interface TargetHit {
  distance: number;
  point: THREE.Vector3;
  zone: HitZone;
  /** 造成傷害；base 為武器基礎傷害（已含距離衰減），回傳是否擊殺 */
  damage(base: number, zone: HitZone, from: THREE.Vector3): { killed: boolean };
}
export interface TargetProvider {
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): TargetHit | null;
}

export interface WeaponDeps {
  bus: GameBus;
  input: Input;
  player: PlayerController;
  camera: THREE.PerspectiveCamera;
  eco: EconomyService;
  fx: CombatFx;
  trace: WorldTrace;
  targets: TargetProvider;
  vm: Viewmodel;
  health: PlayerHealth;
}

export interface WeaponHud {
  name: string;
  slotLabel: string;
  mag: number;
  magMax: number;
  reserve: number;
  reloading: boolean;
  reloadProgress: number;
}

/**
 * 玩家武器系統：依裝備欄的主 / 副武器運作。彈藥從背包消耗，彈匣屬於武器。
 * 只透過 Input 取得操作，透過 EventBus 發出 shot / impact / weaponAction，所以不依賴 PlayerController 的內部。
 */
export class WeaponSystem {
  readonly slots: (WeaponState | null)[] = [null, null];
  active = 0;
  /** 瞄準程度 0..1 */
  ads = 0;
  /** 目前散佈（度）— 準心用 */
  spread = 0;
  /** 觸控輔助瞄準的靈敏度倍率（場景設定） */
  assistScale = 1;
  shotsFired = 0;
  private bloom = 0;
  private switchT = 0;
  private fireBuffer = 0;
  private emptyClickT = 0;
  private recoilAccum = 0;       // 尚未回正的上飄量（弧度）
  private recoilPending = 0;    // 待套用的後座（弧度），幾個畫面內平滑加上去
  private sinceShot = 1;
  private pumpT = 0;
  private lastWritten: (number | null)[] = [null, null];
  private flushTimer = 0;
  private dirty = false;
  private ammoSrc: AmmoSource;
  private origin = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private muzzle = new THREE.Vector3();
  private end = new THREE.Vector3();
  private hit = { surface: 'concrete' as const };

  constructor(private d: WeaponDeps) {
    this.ammoSrc = {
      count: (id) => d.eco.countCarried(id),
      take: (id, n) => d.eco.consumeCarried(id, n),
    };
    this.refreshFromEquipment();
    this.active = this.slots[0] ? 0 : this.slots[1] ? 1 : 0;
    this.applyViewmodel();
    void this.hit;
  }

  get current(): WeaponState | null { return this.slots[this.active]; }
  get handling(): WeaponHandling | null { return this.current ? WEAPON_HANDLING[this.current.id] : null; }
  get switching(): boolean { return this.switchT > 0; }

  hud(): WeaponHud {
    const w = this.current;
    if (!w) return { name: '', slotLabel: '', mag: 0, magMax: 0, reserve: 0, reloading: false, reloadProgress: 0 };
    return {
      name: getItem(w.id)?.name ?? w.id, slotLabel: SLOT_LABEL[this.active],
      mag: w.mag, magMax: w.stats.magazine, reserve: this.d.eco.countCarried(w.stats.ammoType),
      reloading: w.reloading, reloadProgress: w.reloadProgress,
    };
  }

  /** 從裝備欄同步（開局、關閉背包後）。同種武器沿用狀態，被換成別把或彈匣被外部改過就採用物品上的值 */
  refreshFromEquipment(): void {
    SLOTS.forEach((slot, i) => {
      const st = this.d.eco.profile.equipment[slot];
      const cur = this.slots[i];
      if (!st || !WEAPON_STATS[st.id]) {
        if (cur) cur.cancelReload();
        this.slots[i] = null;
        this.lastWritten[i] = null;
        return;
      }
      const stored = st.dur ?? WEAPON_STATS[st.id].magazine;
      if (!cur || cur.id !== st.id || this.lastWritten[i] !== stored) {
        this.slots[i] = new WeaponState(st.id, WEAPON_STATS[st.id], stored);
        this.lastWritten[i] = stored;
      }
    });
    if (!this.current) this.active = this.slots[0] ? 0 : this.slots[1] ? 1 : this.active;
    this.applyViewmodel();
  }

  private applyViewmodel(): void {
    const h = this.handling;
    this.d.vm.setWeapon(h ? h.style : null);
  }

  /** 把彈匣寫回物品（換槍、開介面、撤離前） */
  flush(): void {
    SLOTS.forEach((slot, i) => {
      const w = this.slots[i];
      if (!w) return;
      this.d.eco.setEquipState(slot, w.mag);
      this.lastWritten[i] = w.mag;
    });
    this.d.health.flush();
    this.dirty = false;
  }

  private select(i: number): void {
    if (i === this.active || !this.slots[i]) return;
    this.current?.cancelReload();
    this.flush();
    this.active = i;
    this.switchT = SWITCH_TIME;
    this.ads = 0;
    this.fireBuffer = 0;
    this.d.health.cancelHeal();
    this.applyViewmodel();
  }

  private tryReload(): void {
    const w = this.current;
    if (!w || this.switching) return;
    if (w.startReload(this.ammoSrc)) {
      this.d.health.cancelHeal();
      this.d.bus.emit('weaponAction', { weaponId: w.id, action: 'reload', position: this.d.camera.getWorldPosition(this.origin).clone() });
    }
  }

  /** 每個畫面一次（相機矩陣已更新） */
  update(frameDt: number): void {
    const { input, player, camera, health } = this.d;
    const dt = Math.min(frameDt, 0.1);
    const st = player.state;
    this.switchT = Math.max(0, this.switchT - dt);
    this.emptyClickT = Math.max(0, this.emptyClickT - dt);
    this.fireBuffer = Math.max(0, this.fireBuffer - dt);
    this.sinceShot += dt;
    if (this.pumpT > 0) {
      this.pumpT -= dt;
      const cw = this.current;
      if (this.pumpT <= 0 && cw && cw.stats.pellets > 1) this.d.bus.emit('weaponAction', { weaponId: cw.id, action: 'pump', position: camera.getWorldPosition(this.origin).clone() });
    }

    // 切換武器
    if (input.consumePress('weapon1')) this.select(0);
    if (input.consumePress('weapon2')) this.select(1);
    if (input.consumePress('weaponSwap')) this.select(this.active === 0 ? 1 : 0);
    if (input.consumePress('reload')) this.tryReload();
    if (input.consumePress('fire')) this.fireBuffer = 0.18;

    for (const w of this.slots) {
      if (!w) continue;
      const got = w.update(dt, this.ammoSrc);
      if (got > 0) { this.dirty = true; this.flush(); }
    }

    const w = this.current;
    const h = this.handling;
    const dead = health.dead;

    // 瞄準
    const wantAds = !!w && !!h && !dead && input.isDown('aim') && !w.reloading && !this.switching && !health.healing;
    if (h) {
      const k = dt / h.adsTime;
      this.ads = THREE.MathUtils.clamp(this.ads + (wantAds ? k : -k * 1.3), 0, 1);
    } else this.ads = 0;
    const adsE = this.ads * this.ads * (3 - 2 * this.ads);
    const targetFov = h ? BASE_FOV + (h.adsFov - BASE_FOV) * adsE : BASE_FOV;
    if (Math.abs(camera.fov - targetFov) > 0.02) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 22);
      camera.updateProjectionMatrix();
    }
    input.lookScale = (1 + (targetFov / BASE_FOV - 1) * 0.9) * this.assistScale;
    input.ads = this.ads;
    player.speedScale = (h ? 1 + (h.adsMoveScale - 1) * adsE : 1) * health.healMoveScale;
    player.sprintBlocked = this.ads > 0.2 || health.healing || (!!w && input.isDown('fire') && !w.reloading);

    // 射擊
    if (w && h && !dead && !this.switching) {
      const want = h.auto ? input.isDown('fire') || this.fireBuffer > 0 : this.fireBuffer > 0;
      if (want) {
        const r = w.tryFire();
        if (r === 'fired') {
          this.fireBuffer = 0;
          health.cancelHeal();
          this.fire(w, h);
        } else if (r === 'empty') {
          this.fireBuffer = 0;
          if (this.emptyClickT <= 0) {
            this.emptyClickT = 0.4;
            this.d.bus.emit('weaponAction', { weaponId: w.id, action: 'dry_fire', position: camera.getWorldPosition(this.origin).clone() });
            this.tryReload(); // 彈匣空了還有備彈：自動換彈
          }
        }
      }
    }

    // 散佈與後座回正
    this.bloom = Math.max(0, this.bloom - (1.5 + this.bloom * 3) * dt);
    this.spread = h
      ? computeSpread(h, {
        ads: this.ads > 0.5, speed: st.speed, sprinting: st.sprinting && st.moving, airborne: !st.grounded,
        crouching: st.crouching, bloom: this.bloom,
      })
      : 0;
    if (this.recoilPending > 1e-5) {
      const a = this.recoilPending * (1 - Math.exp(-dt * 35));
      this.recoilPending -= a;
      player.addView(0, a);
    }
    if (this.sinceShot > 0.1 && this.recoilAccum > 0) {
      const rec = Math.min(this.recoilAccum, (2.5 + this.recoilAccum / DEG * 1.6) * DEG * dt);
      this.recoilAccum -= rec;
      player.addView(0, -rec);
    }

    // 武器模型
    this.d.vm.update(dt, {
      ads: adsE, speed: st.speed, sprinting: st.sprinting && st.moving, grounded: st.grounded,
      reloading: !!w && w.reloading, reloadProgress: w ? w.reloadProgress : 0,
      lookX: player.lastLook.x, lookY: player.lastLook.y,
    });

    // 延遲寫回（每 3 秒一次，彈匣有變動時）
    this.flushTimer += dt;
    if (this.dirty && this.flushTimer > 3) { this.flushTimer = 0; this.flush(); }
  }

  /** 準心螢幕像素間距（依目前散佈與 FOV 換算） */
  crosshairGapPx(viewHeight: number): number {
    const fov = this.d.camera.fov * DEG;
    return (Math.tan(this.spread * DEG) / Math.tan(fov / 2)) * (viewHeight / 2);
  }

  private fire(w: WeaponState, h: WeaponHandling): void {
    const { camera, bus, fx, trace, targets, vm } = this.d;
    camera.getWorldPosition(this.origin);
    camera.getWorldDirection(this.fwd);
    this.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    this.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    vm.muzzleWorld(camera, this.muzzle);
    this.shotsFired++;
    this.dirty = true;

    bus.emit('shot', { weaponId: w.id, position: this.origin.clone(), direction: this.fwd.clone(), surface: this.d.player.surface });
    fx.muzzleFlash(this.muzzle.clone().addScaledVector(this.fwd, 0.15), 0.35);
    vm.kick(w.stats.recoil * (this.ads > 0.5 ? 0.7 : 1) + 0.25);

    const stats = w.stats;
    const spreadNow = this.spread;
    const maxDist = stats.range * 2;
    let soundBudget = stats.pellets > 1 ? 2 : 1;
    let hitSent = false;

    for (let p = 0; p < stats.pellets; p++) {
      // 圓錐內均勻取樣
      const ang = Math.sqrt(Math.random()) * spreadNow * DEG;
      const rot = Math.random() * Math.PI * 2;
      this.dir.copy(this.fwd)
        .addScaledVector(this.right, Math.tan(ang) * Math.cos(rot))
        .addScaledVector(this.up, Math.tan(ang) * Math.sin(rot))
        .normalize();

      const world = trace.cast(this.origin, this.dir, maxDist);
      const wd = world ? world.distance : maxDist;
      const t = targets.raycast(this.origin, this.dir, wd);
      if (t && t.distance <= wd) {
        const base = stats.damage * damageFalloff(t.distance, stats.range);
        const r = t.damage(base, t.zone, this.origin);
        fx.impact(t.point, this.dir.clone().negate(), 'flesh');
        fx.tracer(this.muzzle, t.point);
        if (soundBudget-- > 0) bus.emit('impact', { surface: 'concrete', position: t.point.clone(), flesh: true });
        if (!hitSent || r.killed) { bus.emit('enemyHit', { zone: t.zone, killed: r.killed, position: t.point.clone() }); hitSent = true; }
      } else if (world) {
        fx.impact(world.point, world.normal, world.flesh ? 'flesh' : world.surface);
        fx.tracer(this.muzzle, world.point);
        if (soundBudget-- > 0) bus.emit('impact', { surface: world.surface, position: world.point.clone(), normal: world.normal.clone(), flesh: world.flesh || undefined });
      } else {
        this.end.copy(this.origin).addScaledVector(this.dir, 120);
        fx.tracer(this.muzzle, this.end);
      }
    }

    // 後座力與散佈累積
    const kick = stats.recoil * h.kickPerRecoil * (this.ads > 0.5 ? 0.65 : 1) * DEG;
    this.recoilPending += kick;
    this.recoilAccum = Math.min(this.recoilAccum + kick, 9 * DEG);
    this.d.player.addView((Math.random() - 0.5) * kick * 0.8, 0);
    this.bloom = Math.min(this.bloom + h.bloomPerShot, h.bloomPerShot * 6);
    this.sinceShot = 0;
    if (stats.pellets > 1) this.pumpT = 0.42; // 霰彈槍：開完槍自動上膛
  }
}
