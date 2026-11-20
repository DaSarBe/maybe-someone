import * as THREE from 'three';
import type { GameBus } from '../core/EventBus';
import type { NoiseEvent, NoiseKind } from '../data/noise';
import type { Input } from '../core/Input';
import { WEAPON_STATS } from '../data/weapons';
import { BASE_FOV, type WeaponHandling } from '../data/weaponHandling';
import { LASER_HIP_SPREAD } from '../data/attachments';
import { effectiveWeapon, lookScaleForFov, type EffectiveWeapon } from './WeaponMods';
import { getItem } from '../data/items';
import type { EconomyService } from '../economy/EconomyService';
import type { EquipSlot } from '../items/Profile';
import type { PlayerController } from '../player/PlayerController';
import { damageFalloff, type HitZone } from './Damage';
import type { WeaponClass } from '../data/helmet';
import type { CombatFx } from './Fx';
import type { PlayerHealth } from './PlayerHealth';
import type { Viewmodel } from './Viewmodel';
import { WeaponState, computeSpread, type AmmoSource } from './WeaponState';
import type { WorldTrace } from './WorldTrace';

const SLOTS: EquipSlot[] = ['primary', 'secondary'];
const SLOT_LABEL = ['1', '2'];
const SWITCH_TIME = 0.32;
const DEG = Math.PI / 180;
/** 換彈進度到多少時發出第 2、3 段聲音 */
const RELOAD_STAGE_AT = [0.42, 0.84];

/** 敵人命中判定的介面（由 EnemyManager 實作），讓武器系統不認識 AI 細節 */
export interface TargetHit {
  distance: number;
  point: THREE.Vector3;
  zone: HitZone;
  /** 造成傷害；base 為武器基礎傷害（已含距離衰減），回傳是否擊殺 */
  damage(base: number, zone: HitZone, from: THREE.Vector3, weaponClass: WeaponClass): { killed: boolean };
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
  /** 換彈已發出的階段（0 卸彈匣、1 插彈匣、2 拉槍機）；依進度分段發出聲音 */
  private reloadStage = 0;
  private lastWritten: (number | null)[] = [null, null];
  /** 各欄位武器套用配件後的數值、配件內容（偵測改裝）與戰術裝備開關 */
  private eff: (EffectiveWeapon | null)[] = [null, null];
  private modsKey: string[] = ['', ''];
  private tacticalOn: boolean[] = [false, false];
  private breath = 0;
  private breathPrev = [0, 0];
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
  /** 目前武器套用配件後的數值（沒有武器 = null） */
  get effective(): EffectiveWeapon | null { return this.eff[this.active]; }
  /** 目前武器的操作手感（含配件修正；雷射開著時腰射散佈降低） */
  get handling(): WeaponHandling | null {
    const e = this.effective;
    if (!e) return null;
    if (this.tacticalActive === 'laser') return { ...e.handling, spreadHip: e.handling.spreadHip * LASER_HIP_SPREAD };
    return e.handling;
  }
  /** 開著的戰術裝備（手電筒 / 雷射）；沒裝或關著 = null */
  get tacticalActive(): 'flashlight' | 'laser' | null {
    const e = this.effective;
    return e?.tactical && this.tacticalOn[this.active] ? e.tactical : null;
  }
  /** 目前瞄具：iron / reddot / holo / scope 與倍率（HUD 的倍鏡畫面用） */
  get sight(): { kind: EffectiveWeapon['sight']; zoom: number } {
    const e = this.effective;
    return { kind: e?.sight ?? 'iron', zoom: e?.zoom ?? 1 };
  }
  /** 瞄準程度（已套用緩動）0..1 */
  get adsAmount(): number { return this.ads * this.ads * (3 - 2 * this.ads); }
  toggleTactical(): boolean {
    const e = this.effective;
    if (!e?.tactical) return false;
    this.tacticalOn[this.active] = !this.tacticalOn[this.active];
    this.d.vm.setTactical(this.tacticalOn[this.active]);
    return true;
  }
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
        this.eff[i] = null;
        this.modsKey[i] = '';
        this.lastWritten[i] = null;
        return;
      }
      const eff = effectiveWeapon(st.id, st.mods);
      const key = `${st.id}|${JSON.stringify(st.mods ?? {})}`;
      const stored = st.dur ?? eff.stats.magazine;
      if (!cur || cur.id !== st.id || this.lastWritten[i] !== stored || this.modsKey[i] !== key) {
        if (cur && cur.id === st.id && this.modsKey[i] !== key) cur.cancelReload();
        this.slots[i] = new WeaponState(st.id, eff.stats, stored);
        this.lastWritten[i] = stored;
        if (this.modsKey[i] !== key) this.tacticalOn[i] = eff.tactical === 'laser';
      }
      this.eff[i] = eff;
      this.modsKey[i] = key;
    });
    if (!this.current) this.active = this.slots[0] ? 0 : this.slots[1] ? 1 : this.active;
    this.applyViewmodel();
  }

  private applyViewmodel(): void {
    const e = this.effective;
    this.d.vm.setWeapon(e ? e.handling.style : null, e?.mods);
    this.d.vm.setTactical(!!e?.tactical && this.tacticalOn[this.active]);
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
    this.noise('weapon_swap', { weaponId: this.slots[i]?.id });
  }

  /** 發出聲音事件（聲音在手 / 槍口高度；本機玩家的聲音非定位，AI 與其他玩家用同一張距離表） */
  private noise(kind: NoiseKind, extra: Partial<NoiseEvent> = {}): void {
    const p = this.d.camera.getWorldPosition(this.origin);
    this.d.bus.emit('noise', { kind, position: { x: p.x, y: p.y, z: p.z }, source: 'player', ...extra });
  }

  private tryReload(): void {
    const w = this.current;
    if (!w || this.switching) return;
    if (w.startReload(this.ammoSrc)) {
      this.d.health.cancelHeal();
      this.reloadStage = 0;
      this.noise('reload', { weaponId: w.id, stage: 0 });
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
      if (this.pumpT <= 0 && cw && cw.stats.pellets > 1) this.noise('pump', { weaponId: cw.id });
    }

    // 切換武器
    if (input.consumePress('weapon1')) this.select(0);
    if (input.consumePress('weapon2')) this.select(1);
    if (input.consumePress('weaponSwap')) this.select(this.active === 0 ? 1 : 0);
    if (input.consumePress('reload')) this.tryReload();
    if (input.consumePress('flashlight')) this.toggleTactical();
    if (input.consumePress('fire')) this.fireBuffer = 0.18;

    const cur = this.current;
    if (cur?.reloading) {
      // 換彈分 3 段：卸彈匣（開始時）→ 插彈匣 → 拉槍機
      const pr = cur.reloadProgress;
      if (this.reloadStage < 1 && pr >= RELOAD_STAGE_AT[0]) { this.reloadStage = 1; this.noise('reload', { weaponId: cur.id, stage: 1 }); }
      if (this.reloadStage < 2 && pr >= RELOAD_STAGE_AT[1]) { this.reloadStage = 2; this.noise('reload', { weaponId: cur.id, stage: 2 }); }
    }
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
    // 視角靈敏度：倍鏡依視野（倍率）降低；其他瞄具沿用原本的曲線。再乘上操作設定的瞄準靈敏度（Input.addLook）
    const eff = this.effective;
    input.lookScale = (eff?.scopeFov ? lookScaleForFov(camera.fov) : 1 + (camera.fov / BASE_FOV - 1) * 0.9) * this.assistScale;
    this.breathe(dt, eff, adsE);
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
            this.noise('dry_fire', { weaponId: w.id });
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

  /**
   * 倍鏡的呼吸晃動：用「差分」加到視角上（每幀加 offset(t) - offset(t - dt)），所以視線只會晃動、不會慢慢飄走。
   * 倍率越高越明顯；蹲下減半。只在瞄準到底時作用。
   */
  private breathe(dt: number, eff: EffectiveWeapon | null, adsE: number): void {
    const zoom = eff?.scopeFov ? eff.zoom : 0;
    const amp = zoom > 1 && adsE > 0.9 ? 0.0016 * zoom * (this.d.player.state.crouching ? 0.5 : 1) : 0;
    this.breath += dt;
    const ox = Math.sin(this.breath * 1.55) * amp;
    const oy = Math.sin(this.breath * 1.15 + 1.3) * amp * 1.3;
    if (amp > 0 || this.breathPrev[0] !== 0 || this.breathPrev[1] !== 0) {
      this.d.player.addView(ox - this.breathPrev[0], oy - this.breathPrev[1]);
    }
    this.breathPrev[0] = ox;
    this.breathPrev[1] = oy;
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

    // 槍聲：滅音器 ×0.25、制退器 ×1.1（loudness 乘在 data/noise.ts 的槍聲距離上）
    const eff = this.effective;
    const loud = eff?.loudness ?? 1;
    this.noise('shot', {
      weaponId: w.id, direction: { x: this.fwd.x, y: this.fwd.y, z: this.fwd.z }, surface: this.d.player.surface,
      ...(loud !== 1 ? { loudness: loud } : {}), ...(eff?.suppressed ? { suppressed: true } : {}),
    });
    const flash = eff?.flash ?? 1;
    fx.muzzleFlash(this.muzzle.clone().addScaledVector(this.fwd, 0.15), 0.35 * flash);
    vm.kick(w.stats.recoil * (this.ads > 0.5 ? 0.7 : 1) + 0.25, flash);

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
        const r = t.damage(base, t.zone, this.origin, stats.weaponClass);
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
