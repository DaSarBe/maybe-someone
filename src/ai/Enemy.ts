import * as THREE from 'three';
import type { GameBus } from '../core/EventBus';
import { computeDamage, damageFalloff, type HitZone } from '../combat/Damage';
import type { CombatFx } from '../combat/Fx';
import type { WorldTrace } from '../combat/WorldTrace';
import { ARMOR_STATS, HELMET_STATS } from '../data/gear';
import { enemyHeadshotChance, effectiveHelmetLevel, resolveHeadshot, type WeaponClass } from '../data/helmet';
import { DIFFICULTY, accuracyAt, pickWeapon, rollEnemyHelmet, rollEnemyMods, scaledAccuracy, type Difficulty, type EnemyDef } from '../data/enemies';
import type { NoiseEvent, NoiseKind } from '../data/noise';
import { assessHearing } from '../audio/Hearing';
import type { WeaponStats } from '../data/types';
import type { EnemySpawn } from '../world/RaidMap';
import type { Surface } from '../world/Surface';
import { EnemyBrain, type AiState } from './Brain';
import { EnemyMover } from './EnemyMover';
import { createEnemyModel, type EnemyAnim } from './EnemyModel';
import type { NavIndex } from './Nav';
import { inFieldOfView, tacticalVision, visionGain } from './Perception';
import { effectiveWeapon, type EffectiveWeapon } from '../combat/WeaponMods';
import type { WeaponMods } from '../data/attachments';
import { RUSH_RANGE, SNEAK_APPROACH, hearChance, isNpcSource, shouldRush, shouldSneak } from './Tactics';

/** 玩家的感知用資訊（每幀由場景更新同一個物件） */
export interface PlayerTarget {
  feet: THREE.Vector3;
  eye: THREE.Vector3;
  crouching: boolean;
  sprinting: boolean;
  moving: boolean;
  alive: boolean;
  /** 蹲跑中（蹲下 + 衝刺） */
  crouchRunning?: boolean;
  /** 正在治療 / 換彈（敵人看到治療、聽到換彈會趁機衝過來） */
  healing?: boolean;
  reloading?: boolean;
  /** 手電筒開著（暗處更容易被看到）/ 雷射開著 */
  flashlight?: boolean;
  laser?: boolean;
}

export interface EnemyContext {
  bus: GameBus;
  mover: EnemyMover;
  nav: NavIndex;
  fx: CombatFx;
  trace: WorldTrace;
  player: PlayerTarget;
  /** 位置的亮度 0..1（暗處發現得慢） */
  lightAt(p: THREE.Vector3): number;
  damagePlayer(base: number, zone: HitZone, from: THREE.Vector3, killer: string, weaponClass: WeaponClass): void;
  alertGroup(group: string, pos: THREE.Vector3, exceptId: string): void;
  onDeath(e: Enemy): void;
  castShadow: boolean;
  /** 場上所有敵人（分離力用） */
  readonly all: Enemy[];
  /** 腳下材質（敵人腳步聲用） */
  surfaceAt(p: THREE.Vector3): Surface;
  /** 地圖難度（命中率、反應、聽覺、戰術機率，見 data/enemies.ts DIFFICULTY） */
  difficulty?: Difficulty;
  /** 亂數來源（測試用固定 seed）；預設 Math.random */
  rng?: () => number;
}

/** 移動姿態：蹲走完全無聲、蹲跑 8m、走路 18m、衝刺 30m（見 data/noise.ts） */
export type Stance = 'walk' | 'crouch' | 'crouch_run';
export type HearResult = 'ignored' | 'missed' | 'heard' | 'rush';

/** 滅音槍聲的方位誤差倍率 */
export const SUPPRESSED_ERR_K = 3;
const CROUCH_SPEED_K = 0.5;
const CROUCH_RUN_SPEED_K = 1.7;
const FLANK_MAX_TIME = 25;

let nextId = 1;
const TURN_RATE = 7;
const EYE_H = 1.55;
const normAngle = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export type Mode = 'fight' | 'cover';

export class Enemy {
  readonly id = `e${nextId++}`;
  readonly brain = new EnemyBrain();
  readonly pos = new THREE.Vector3();
  readonly group: string | null;
  readonly weaponId: string;
  readonly stats: WeaponStats;
  /** 武器上的配件與套用後的數值（滅音器的槍聲、擴容彈匣的彈匣容量） */
  readonly mods: WeaponMods;
  readonly eff: EffectiveWeapon;
  readonly root = new THREE.Group();
  facing = 0;
  hp: number;
  armorDur: number;
  /** 頭盔（沒戴為 null）與剩餘耐久；耐久歸零等於沒戴 */
  helmetId: string | null = null;
  helmetDur = 0;
  /** 是不是被爆頭打死的 */
  killedByHeadshot = false;
  mag: number;
  reserve: number;
  mode: Mode = 'fight';
  speedNow = 0;
  stance: Stance = 'walk';
  /** 偷襲中（警戒 / 搜索時蹲走接近） */
  sneaking = false;
  /** 衝鋒計時（聽到換彈 / 看到治療）與推進計時（戰鬥中趁玩家換彈推進） */
  rushT = 0;
  pushT = 0;
  /** 包抄路線（世界座標）；有值 = 正在繞路 */
  flank: { route: THREE.Vector3[]; idx: number; t: number } | null = null;
  /** 最近一次對聲音的反應（除錯與測試用） */
  lastHear: { kind: NoiseKind; result: HearResult; t: number; gain: number; occluded: boolean } | null = null;
  /** 最近一次被攻擊者的位置 */
  killedAt = 0;
  dead = false;
  ready = false;
  /** LOD：兩次 AI tick 之間的秒數 */
  interval = 1 / 30;
  distToPlayer = 0;
  tickCount = 0;
  private acc = Math.random() * 0.03;
  private anim: EnemyAnim | null = null;
  private helmetObj: THREE.Object3D | null = null;
  private pingAt = -9;
  private animAcc = 0;

  // 感知快取
  private canSee = false;
  private gain = 0;
  private visionT = 0;
  private hasLos = false;
  // 移動
  private path: THREE.Vector3[] = [];
  private pathIdx = 0;
  private pathGoal = new THREE.Vector3();
  private pathAge = 99;
  private arrived = false;
  private stuckT = 0;
  private patrolIdx = 0;
  private waitT = 0;
  private lookT = 0;
  private lookTarget = 0;
  private searchPoint: THREE.Vector3 | null = null;
  private searchWait = 0;
  // 戰鬥
  private strafeDir = Math.random() < 0.5 ? 1 : -1;
  private strafeT = 0;
  private aimT = 0;
  private burstLeft = 0;
  private shotCd = 0;
  private restT = 0.2;
  private reloadLeft = 0;
  private stun = 0;
  private hitCd = 0;
  private lastShotAgo = 9;
  private coverNode: THREE.Vector3 | null = null;
  private coverT = 0;
  private coverCd = 0;
  private stepAccum = 0;
  private prevState: AiState = 'patrol';
  private rushRollAt = -1e9;
  private healRolled = false;
  private reloadStageE = 0;
  private sepV = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private eyeVec = new THREE.Vector3();

  constructor(readonly def: EnemyDef, spawn: EnemySpawn, private ctx: EnemyContext) {
    this.group = spawn.group ?? null;
    this.pos.copy(spawn.position);
    // RaidMap 的 yaw 沿用玩家的慣例（forward = (-sin yaw, -cos yaw)）；敵人內部 forward = (sin f, cos f)
    this.facing = (spawn.yaw ?? 0) + Math.PI;
    this.weaponId = pickWeapon(def);
    this.mods = rollEnemyMods(def, this.weaponId, this.rng);
    this.eff = effectiveWeapon(this.weaponId, this.mods);
    this.stats = this.eff.stats;
    this.hp = def.hp;
    this.armorDur = def.armorId ? ARMOR_STATS[def.armorId].durability : 0;
    const hm = rollEnemyHelmet(def, (id) => HELMET_STATS[id]?.durability ?? 0, this.rng);
    if (hm) { this.helmetId = hm.id; this.helmetDur = hm.dur; }
    this.mag = this.stats.magazine;
    this.reserve = def.ammoCarry[0] + Math.floor(Math.random() * (def.ammoCarry[1] - def.ammoCarry[0] + 1));
    this.patrol = spawn.patrol && spawn.patrol.length >= 2 ? spawn.patrol.map((p) => p.clone()) : null;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    this.homeFacing = this.facing;
    this.eyeVec.copy(this.pos);
  }

  private patrol: THREE.Vector3[] | null;
  private homeFacing: number;

  /** 載入模型（非同步）；完成前敵人用不可見的狀態運作，不影響邏輯 */
  async load(): Promise<void> {
    const inst = await createEnemyModel(this.def, this.weaponId, this.ctx.castShadow, this.helmetId ? HELMET_STATS[this.helmetId].level : 0);
    this.root.add(inst.root);
    this.helmetObj = inst.helmet;
    if (inst.helmet) inst.helmet.visible = this.helmetDur > 0;
    this.anim = inst.anim;
    this.anim?.play('idle', 0);
    if (this.dead) this.anim?.playOnce('death');
    this.ready = true;
  }

  get state(): AiState { return this.brain.state; }
  get eye(): THREE.Vector3 { return this.eyeVec.set(this.pos.x, this.pos.y + EYE_H * (this.def.height / 1.8), this.pos.z); }

  /** 生效的頭盔等級（0 = 沒戴 / 耐久歸零；低耐久降一級） */
  get helmetLevel(): number {
    const st = this.helmetId ? HELMET_STATS[this.helmetId] : null;
    return st ? effectiveHelmetLevel({ level: st.level, dur: this.helmetDur, max: st.durability }) : 0;
  }

  get armorStat() { return this.def.armorId ? ARMOR_STATS[this.def.armorId] : null; }

  // ------------------------------------------------------------ 事件
  private get rng(): () => number { return this.ctx.rng ?? Math.random; }
  private get difficulty(): Difficulty { return this.ctx.difficulty ?? 2; }

  /**
   * 聽到一個聲音事件（玩家或其他真人發出的；NPC 彼此不聽）。
   * 和玩家聽 NPC 用同一張距離表：先看在不在「聽得到的距離」內，再依牆壁遮擋與距離算實際音量，
   * 最後依實際音量 × 聽力 × 難度聽覺倍率擲骰決定有沒有注意到。
   *  - 已進入戰鬥的敵人不會被引走；但聽到換彈會趁機推進
   *  - 聽到換彈且 25m 內：依難度與傾向的機率立刻衝向玩家
   */
  hearNoise(ev: NoiseEvent): HearResult {
    if (this.dead || ev.source === this.id || isNpcSource(ev.source)) return 'ignored';
    const mover = this.ctx.mover;
    const heard = assessHearing(this.eye, ev, (a, b) => mover.los(this.tmp.set(a.x, a.y, a.z), this.tmp2.set(b.x, b.y, b.z)));
    if (!heard.audible) return 'ignored';
    const sustained = ev.kind === 'search' || ev.kind === 'evac';
    const sens = this.def.hearing * DIFFICULTY[this.difficulty].hearing;
    const result = this.react(ev, heard.dist, hearChance(heard.gain, sens, sustained), heard.dist);
    this.lastHear = { kind: ev.kind, result, t: performance.now(), gain: +heard.gain.toFixed(3), occluded: heard.occluded };
    return result;
  }

  private react(ev: NoiseEvent, dist: number, chance: number, heardDist: number): HearResult {
    if (this.rng() >= chance) return 'missed';
    const at = this.tmp2.set(ev.position.x, ev.position.y, ev.position.z);
    // 趁換彈衝過來（一次換彈只擲一次骰）
    if (ev.kind === 'reload') {
      const now = performance.now();
      if (now - this.rushRollAt > 4000) {
        this.rushRollAt = now;
        if (shouldRush({ dist, difficulty: this.difficulty, def: this.def, rng: this.rng })) {
          this.startRush(at);
          return 'rush';
        }
      }
    }
    if (this.brain.engaged) return 'heard';
    // 槍聲能判斷方向，但距離越遠誤差越大；滅音槍聲又悶又難定位：誤差大很多（至少 5m）
    const err = heardDist * (ev.kind === 'shot' ? 0.12 : 0.05);
    this.brain.hear(this.noisePoint(at, ev.suppressed ? Math.max(5, err * SUPPRESSED_ERR_K) : err));
    return 'heard';
  }

  /** 衝鋒：未交戰就直接追擊（以聲源為最後已知位置）；交戰中就推進到更近 */
  private startRush(at: THREE.Vector3): void {
    if (this.brain.engaged) { this.pushT = 4; return; }
    this.brain.rush(this.noisePoint(at, 1));
    this.rushT = 8;
    this.sneaking = false;
  }

  private noisePoint(at: THREE.Vector3, err: number): THREE.Vector3 {
    return this.tmp2.set(at.x + (Math.random() - 0.5) * 2 * err, at.y, at.z + (Math.random() - 0.5) * 2 * err);
  }

  /** 玩家子彈命中。base 為武器基礎傷害（已含距離衰減） */
  takeHit(base: number, zone: HitZone, from: THREE.Vector3, weaponClass: WeaponClass = 'light'): { killed: boolean; dealt: number } {
    if (this.dead) return { killed: false, dealt: 0 };
    let r: { damage: number };
    if (zone === 'head') {
      // 爆頭：沒頭盔 = 一槍死；有頭盔依武器類別 × 等級查表（data/helmet.ts），傷害不看武器數值
      const hs = this.helmetId ? HELMET_STATS[this.helmetId] : null;
      const h = resolveHeadshot(weaponClass, hs ? { level: hs.level, dur: this.helmetDur, max: hs.durability } : null, this.def.hp, this.rng);
      if (hs) {
        this.helmetDur = h.durAfter;
        if (this.helmetObj && this.helmetDur <= 0) this.helmetObj.visible = false;
      }
      if (h.helmetHit) this.helmetPing();
      r = h;
      if (h.lethal) { this.killedByHeadshot = true; this.hp = 0; this.die(); return { killed: true, dealt: h.damage }; }
    } else {
      const st = this.armorStat;
      const c = computeDamage(base, zone, st && this.armorDur > 0 ? { reduction: st.reduction, dur: this.armorDur } : null);
      this.armorDur = c.durAfter;
      r = c;
    }
    this.hp -= r.damage;
    if (this.hp <= 0) { if (zone === 'head') this.killedByHeadshot = true; this.die(); return { killed: true, dealt: r.damage }; }
    this.voice('hurt', 0.5);
    this.brain.damaged(this.ctx.player.feet);
    this.afterSpotted();
    if (r.damage >= 8 && this.hitCd <= 0 && this.anim?.hasHit) {
      this.anim.playOnce('hit');
      this.hitCd = 1.2;
      this.stun = 0.3;
    } else this.stun = Math.max(this.stun, 0.12);
    void from;
    return { killed: false, dealt: r.damage };
  }

  /** 頭盔被打中：金屬「叮」（noise 15m，聲源在頭部；NPC 發出的不會被其他 NPC 聽到）。多顆彈丸只響一次 */
  private helmetPing(): void {
    this.ctx.bus.emit('helmetHit', { target: 'enemy', level: this.helmetLevel });
    const now = performance.now() / 1000;
    if (now - this.pingAt < 0.08) return;
    this.pingAt = now;
    this.ctx.bus.emit('noise', { kind: 'helmet_ping', position: { x: this.pos.x, y: this.pos.y + this.def.height * 0.9, z: this.pos.z }, source: this.id, surface: this.ctx.surfaceAt(this.pos) });
  }

  die(): void {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.voice('death', 0);
    this.brain.kill();
    this.anim?.playOnce('death');
    this.speedNow = 0;
    this.ctx.onDeath(this);
  }

  /** 被命中或發現玩家後，通知同群組 */
  private afterSpotted(): void {
    if (this.brain.consumeSpotted()) {
      this.voice('alert', 0);
      if (this.group) this.ctx.alertGroup(this.group, this.ctx.player.feet, this.id);
    }
  }

  /** 聲音事件（位置在頭部）；hurt 有個別冷卻，alert 的全域冷卻在 AudioManager */
  private voice(kind: 'hurt' | 'death' | 'alert', cooldown: number): void {
    if (kind !== 'death') {
      const now = performance.now() / 1000;
      const last = kind === 'hurt' ? this.voiceAt.hurt : this.voiceAt.alert;
      if (now - last < cooldown) return;
      if (kind === 'hurt') this.voiceAt.hurt = now; else this.voiceAt.alert = now;
    }
    this.ctx.bus.emit('noise', { kind, position: { x: this.pos.x, y: this.pos.y + this.def.height * 0.85, z: this.pos.z }, source: this.id, surface: this.ctx.surfaceAt(this.pos) });
  }
  private voiceAt = { hurt: -9, alert: -9 };

  // ------------------------------------------------------------ 更新
  /** 由 EnemyManager 每個固定步長呼叫；依 LOD 累積到 interval 才真正執行 */
  step(dt: number): void {
    if (this.dead) return;
    this.acc += dt;
    if (this.acc < this.interval) return;
    const d = Math.min(this.acc, 0.2);
    this.acc = 0;
    this.tickCount++;
    this.tick(d);
  }

  private tick(dt: number): void {
    const { ctx, brain, def } = this;
    const pl = ctx.player;
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.shotCd = Math.max(0, this.shotCd - dt);
    this.restT = Math.max(0, this.restT - dt);
    this.coverCd = Math.max(0, this.coverCd - dt);
    this.lastShotAgo += dt;

    const dx = pl.feet.x - this.pos.x, dz = pl.feet.z - this.pos.z;
    const dist = Math.hypot(dx, dz, pl.feet.y - this.pos.y);
    this.distToPlayer = dist;

    // ---- 視覺（約 8Hz 做視線檢查）----
    this.visionT -= dt;
    if (this.visionT <= 0) {
      this.visionT = brain.engaged ? 0.1 : 0.14;
      this.canSee = false; this.gain = 0; this.hasLos = false;
      if (pl.alive) {
        const range = def.sightRange * (brain.engaged ? 1.6 : 1);
        const light = ctx.lightAt(pl.feet);
        // 手電筒 / 雷射開著：看得更遠、更快發現（暗處效果最大）
        const tv = tacticalVision(light, !!pl.flashlight, !!pl.laser);
        if (dist <= range * 1.05 * tv.range) {
          const los = ctx.mover.los(this.eye, pl.eye);
          this.hasLos = los;
          const inFov = brain.engaged || inFieldOfView(this.facing, dx, dz, def.fov) || dist < 2;
          if (los && inFov) {
            this.canSee = true;
            const ang = Math.abs(normAngle(Math.atan2(dx, dz) - this.facing));
            this.gain = brain.engaged ? 1 : visionGain(def.reaction * DIFFICULTY[this.difficulty].reaction, range, {
              dist, offAxis: Math.min(1, ang / ((def.fov * Math.PI) / 360)),
              crouching: pl.crouching, sprinting: pl.sprinting, moving: pl.moving, light,
              flashlight: pl.flashlight, laser: pl.laser,
            });
            if (this.gain <= 0) this.canSee = false;
          }
        }
      }
    }

    // 看到玩家在治療（25m 內）：趁機衝過來（每次治療只擲一次骰）
    if (!pl.healing) this.healRolled = false;
    else if (!this.healRolled && this.canSee && dist <= RUSH_RANGE) {
      this.healRolled = true;
      if (shouldRush({ dist, difficulty: this.difficulty, def, rng: this.rng })) {
        this.startRush(this.tmp2.copy(pl.feet));
        this.lastHear = { kind: 'heal', result: 'rush', t: performance.now(), gain: 1, occluded: false };
      }
    }

    brain.update(dt, {
      canSee: this.canSee, gain: this.gain, targetPos: pl.feet, dist,
      engageRange: def.preferRange[1] + 8, arrived: this.arrived,
    });
    this.afterSpotted();

    // 進入警戒 / 搜索時決定要不要蹲走偷襲（每次進入擲一次骰）
    if (brain.state !== this.prevState) {
      this.prevState = brain.state;
      this.sneaking = (brain.state === 'alert' || brain.state === 'search') && shouldSneak({ difficulty: this.difficulty, def, rng: this.rng });
      if (brain.state === 'dead') this.flank = null;
    }
    this.rushT = Math.max(0, this.rushT - dt);
    this.pushT = Math.max(0, this.pushT - dt);

    // ---- 行為 ----
    this.arrived = false;
    this.stance = 'walk';
    let move = 0;
    if (this.flank && brain.engaged) move = this.doFlank(dt, dist);
    else {
      if (this.flank) this.flank = null;
      switch (brain.state) {
        case 'patrol': move = this.doPatrol(dt); break;
        case 'alert': move = this.doAlert(dt); break;
        case 'chase': move = this.doChase(dt); break;
        case 'attack': move = this.doAttack(dt, dist); break;
        case 'search': move = this.doSearch(dt); break;
      }
    }
    this.speedNow = move / dt;
    this.footsteps(move);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
  }

  // ---- 行為：巡邏 ----
  private doPatrol(dt: number): number {
    const def = this.def;
    if (!this.patrol) {
      // 站崗：偶爾左右張望
      this.lookT -= dt;
      if (this.lookT <= 0) { this.lookT = 2.5 + Math.random() * 3; this.lookTarget = this.homeFacing + (Math.random() - 0.5) * 1.6; }
      this.turnTo(this.lookTarget, dt, 2);
      return 0;
    }
    if (this.waitT > 0) {
      this.waitT -= dt;
      this.lookT -= dt;
      if (this.lookT <= 0) { this.lookT = 1.5; this.lookTarget = this.facing + (Math.random() - 0.5) * 1.2; }
      this.turnTo(this.lookTarget, dt, 2);
      return 0;
    }
    const target = this.patrol[this.patrolIdx];
    const moved = this.goTo(target, def.walkSpeed, dt);
    if (this.arrived) {
      this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length;
      this.waitT = 1 + Math.random() * 2.5;
      this.arrived = false;
    }
    return moved;
  }

  // ---- 行為：警戒 ----
  private doAlert(dt: number): number {
    const b = this.brain;
    if (!b.hasInvestigate) return 0;
    // 先轉向聲源再出發
    const dx = b.investigate.x - this.pos.x, dz = b.investigate.z - this.pos.z;
    const want = Math.atan2(dx, dz);
    if (b.stateTime < 0.5 && Math.abs(normAngle(want - this.facing)) > 0.5) {
      this.turnTo(want, dt, 2.2);
      return 0;
    }
    this.stanceSneak(Math.hypot(dx, dz));
    const moved = this.goTo(b.investigate, this.def.walkSpeed * 1.2, dt, 1.5);
    if (this.arrived) {
      this.lookT -= dt;
      if (this.lookT <= 0) { this.lookT = 1.2; this.lookTarget = this.facing + (Math.random() - 0.5) * 2.2; }
      this.turnTo(this.lookTarget, dt, 2);
    }
    return moved;
  }

  // ---- 行為：追擊 ----
  private doChase(dt: number): number {
    const b = this.brain;
    const moved = this.goTo(b.lastKnown, this.def.runSpeed, dt, 1.5);
    if (this.arrived && !this.canSee) {
      // 到了最後看到的位置卻沒人：原地張望（Brain 會在 loseTime 後轉搜索）
      this.lookT -= dt;
      if (this.lookT <= 0) { this.lookT = 0.8; this.lookTarget = this.facing + (Math.random() - 0.5) * 3; }
      this.turnTo(this.lookTarget, dt, 3);
    }
    return moved;
  }

  // ---- 行為：搜索 ----
  private doSearch(dt: number): number {
    const nav = this.ctx.nav;
    if (this.searchWait > 0) {
      this.searchWait -= dt;
      this.lookT -= dt;
      if (this.lookT <= 0) { this.lookT = 1; this.lookTarget = this.facing + (Math.random() - 0.5) * 2.6; }
      this.turnTo(this.lookTarget, dt, 2.5);
      return 0;
    }
    if (!this.searchPoint) {
      const center = this.brain.lastKnown;
      const cands: number[] = [];
      for (let i = 0; i < nav.nodes.length; i++) {
        if (nav.nodes[i].distanceTo(center) < 14) cands.push(i);
      }
      this.searchPoint = (cands.length ? nav.nodes[cands[Math.floor(Math.random() * cands.length)]] : center).clone();
    }
    this.stanceSneak(this.pos.distanceTo(this.brain.lastKnown));
    const moved = this.goTo(this.searchPoint, this.def.walkSpeed * 1.25, dt, 1.2);
    if (this.arrived) { this.searchPoint = null; this.searchWait = 1.5 + Math.random() * 1.5; }
    return moved;
  }

  /** 偷襲：離目標點近了才蹲走（遠的時候照常走，才不會慢到不像話） */
  private stanceSneak(distToTarget: number): void {
    this.stance = this.sneaking && distToTarget <= SNEAK_APPROACH ? 'crouch' : 'walk';
  }

  // ---- 行為：包抄（沿著另一條路線繞到玩家側面）----
  private doFlank(dt: number, dist: number): number {
    const f = this.flank!;
    const pl = this.ctx.player;
    f.t += dt;
    this.brain.hold(); // 繞路時看不到目標不算失去目標
    const seen = this.canSee && this.hasLos;
    if (f.t > FLANK_MAX_TIME || f.idx >= f.route.length || (seen && dist < 14) || !pl.alive) { this.flank = null; return 0; }
    // 離玩家還遠又沒被看到時蹲跑（8m 的腳步聲）；被看到或接近了就直接衝
    this.stance = !seen && dist > 16 ? 'crouch_run' : 'walk';
    const wp = f.route[f.idx];
    const moved = this.goTo(wp, this.def.runSpeed, dt, 1.6);
    if (this.arrived) { f.idx++; this.arrived = false; }
    return moved;
  }

  // ---- 行為：攻擊 ----
  private doAttack(dt: number, dist: number): number {
    const { def, ctx } = this;
    const pl = ctx.player;
    const tx = pl.feet.x - this.pos.x, tz = pl.feet.z - this.pos.z;
    const want = Math.atan2(tx, tz);
    let moved = 0;

    // 換彈
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      const pr = 1 - Math.max(0, this.reloadLeft) / this.stats.reloadTime;
      if (this.reloadStageE < 1 && pr >= 0.42) { this.reloadStageE = 1; this.emitNoise('reload', { stage: 1 }); }
      if (this.reloadStageE < 2 && pr >= 0.84) { this.reloadStageE = 2; this.emitNoise('reload', { stage: 2 }); }
      if (this.reloadLeft <= 0) {
        const n = Math.min(this.stats.magazine - this.mag, this.reserve);
        this.mag += n; this.reserve -= n;
      }
    } else if (this.mag <= 0 && this.reserve > 0) {
      this.reloadLeft = this.stats.reloadTime;
      this.reloadStageE = 0;
      this.emitNoise('reload', { stage: 0 });
      if (def.coverSeeker) this.beginCover();
    }
    // 掩護者血量低時也找掩護
    if (def.coverSeeker && this.mode === 'fight' && this.hp < def.hp * 0.35 && this.coverCd <= 0) this.beginCover();

    if (this.mode === 'cover') {
      this.coverT += dt;
      if (this.coverNode) {
        moved = this.goTo(this.coverNode, def.runSpeed, dt, 0.8);
        if (!this.arrived) { this.turnTo(this.facing, dt, 0); } else this.turnTo(want, dt, 4);
      }
      const done = this.reloadLeft <= 0 && this.mag > 0 && this.coverT > 1.6;
      if (done || this.coverT > 6 || (dist < 5 && this.coverT > 1)) {
        this.mode = 'fight';
        this.coverCd = 6;
        this.aimT = 0;
      }
      return moved;
    }

    // 面向玩家
    this.turnTo(want, dt, TURN_RATE);

    // 移動：衝鋒 / 推進 / 後退 / 側移
    const [pmin, pmax] = def.preferRange;
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = 1 + Math.random() * 1.6; this.strafeDir = Math.random() < 0.5 ? -this.strafeDir : this.strafeDir; }
    const toward = this.tmp.set(tx, 0, tz).normalize();
    if (this.pushT > 0 && dist > Math.max(3, pmin * 0.6)) {
      // 趁玩家換彈：推進到更近
      moved = this.goTo(pl.feet, def.runSpeed, dt, Math.max(3, pmin * 0.6));
    } else if (dist > pmax || (def.rush && dist > pmin + 1)) {
      moved = this.goTo(pl.feet, def.rush ? def.runSpeed : def.walkSpeed * 1.2, dt, pmin);
    } else if (dist < pmin) {
      moved = this.walk(-toward.x, -toward.z, def.walkSpeed * 0.8, dt);
    } else {
      const sp = def.walkSpeed * 0.75;
      moved = this.walk(-toward.z * this.strafeDir, toward.x * this.strafeDir, sp, dt);
      if (moved < sp * dt * 0.3) this.strafeDir = -this.strafeDir; // 被擋住就換邊
    }

    // 射擊
    if (this.canSee && this.hasLos) this.aimT += dt; else this.aimT = Math.max(0, this.aimT - dt * 2);
    const facingOk = Math.abs(normAngle(want - this.facing)) < 0.22;
    if (this.stun <= 0 && this.reloadLeft <= 0 && this.mag > 0 && this.aimT >= def.aimTime && this.hasLos && facingOk) {
      if (this.burstLeft <= 0 && this.restT <= 0) this.burstLeft = def.burst;
      if (this.burstLeft > 0 && this.shotCd <= 0) {
        this.shoot(dist);
        this.burstLeft--;
        this.shotCd = Math.max(0.09, 60 / this.stats.fireRate);
        if (this.burstLeft <= 0) this.restT = def.burstRest[0] + Math.random() * (def.burstRest[1] - def.burstRest[0]);
      }
    }
    return moved;
  }

  private beginCover(): void {
    const { ctx } = this;
    const pl = ctx.player;
    this.coverCd = 6;
    let best: THREE.Vector3 | null = null;
    let bd = 1e9;
    const nodes = ctx.nav.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const d = nodes[i].distanceTo(this.pos);
      if (d > 16 || d >= bd || d < 1.5) continue;
      this.tmp2.set(nodes[i].x, nodes[i].y + 1.4, nodes[i].z);
      if (!ctx.mover.los(this.tmp2, pl.eye)) { bd = d; best = nodes[i]; }
    }
    if (best) { this.coverNode = best; this.mode = 'cover'; this.coverT = 0; this.path = []; }
  }

  // ------------------------------------------------------------ 射擊
  private muzzle(out: THREE.Vector3): THREE.Vector3 {
    const k = this.def.height / 1.8;
    return out.set(
      this.pos.x + Math.sin(this.facing) * 0.55 + Math.cos(this.facing) * 0.16,
      this.pos.y + 1.38 * k,
      this.pos.z + Math.cos(this.facing) * 0.55 - Math.sin(this.facing) * 0.16,
    );
  }

  private shoot(dist: number): void {
    const { ctx, def, stats } = this;
    const pl = ctx.player;
    this.mag--;
    this.lastShotAgo = 0;
    const muzzle = this.muzzle(new THREE.Vector3());
    const aim = new THREE.Vector3(pl.feet.x, pl.feet.y + (pl.crouching ? 0.6 : 1.15), pl.feet.z);
    const dir = new THREE.Vector3().subVectors(aim, muzzle).normalize();
    // 同一套 noise 規則：滅音器 / 制退器改變槍聲距離（loudness）
    ctx.bus.emit('noise', {
      kind: 'shot', position: { x: muzzle.x, y: muzzle.y, z: muzzle.z }, source: this.id, weaponId: this.weaponId,
      direction: { x: dir.x, y: dir.y, z: dir.z }, surface: ctx.surfaceAt(this.pos),
      ...(this.eff.loudness !== 1 ? { loudness: this.eff.loudness } : {}), ...(this.eff.suppressed ? { suppressed: true } : {}),
    });
    ctx.fx.muzzleFlash(muzzle, 0.5 * this.eff.flash);

    let p = scaledAccuracy(accuracyAt(def.accuracy, dist), this.difficulty);
    if (pl.sprinting) p *= 0.7; else if (pl.moving) p *= 0.85;
    if (pl.crouching) p *= 0.85;
    if (this.speedNow > 1) p *= 0.85;
    let missEmitted = false;
    // 爆頭每一發只擲一次骰（霰彈槍最多一顆彈丸打中頭）：機率 = 難度 × 距離 × 敵人種類（data/helmet.ts）
    let headLeft = this.rng() < enemyHeadshotChance(this.difficulty, dist, def.headCoef);
    for (let i = 0; i < stats.pellets; i++) {
      if (Math.random() < p) {
        const zone: HitZone = headLeft ? 'head' : 'body';
        headLeft = false;
        const base = stats.damage * def.damageScale * damageFalloff(dist, stats.range);
        ctx.fx.tracer(muzzle, aim, true);
        ctx.damagePlayer(base, zone, muzzle, def.name, stats.weaponClass);
      } else {
        // 打偏：落在玩家附近 0.5～2m 的地方，帶有彈著點與聲音
        const r = 0.5 + Math.random() * 1.6, a = Math.random() * Math.PI * 2;
        const miss = this.tmp.set(aim.x + Math.cos(a) * r, aim.y + (Math.random() - 0.4) * r, aim.z + Math.sin(a) * r);
        const d2 = new THREE.Vector3().subVectors(miss, muzzle).normalize();
        const hit = ctx.trace.cast(muzzle, d2, dist + 25);
        const reach = hit ? hit.distance : dist + 25;
        this.flyby(muzzle, d2, reach);
        if (hit) {
          ctx.fx.impact(hit.point, hit.normal, hit.flesh ? 'flesh' : hit.surface);
          ctx.fx.tracer(muzzle, hit.point, true);
          if (!missEmitted) { missEmitted = true; ctx.bus.emit('impact', { surface: hit.surface, position: hit.point.clone(), normal: hit.normal.clone(), flesh: hit.flesh || undefined }); }
        } else ctx.fx.tracer(muzzle, muzzle.clone().addScaledVector(d2, 80), true);
      }
    }
  }

  /** 子彈（沿 dir 飛 reach 公尺）經過玩家 2m 內：發出 bulletFlyby */
  private flyby(origin: THREE.Vector3, dir: THREE.Vector3, reach: number): void {
    const eye = this.ctx.player.eye;
    const t = Math.min(reach, Math.max(0, (eye.x - origin.x) * dir.x + (eye.y - origin.y) * dir.y + (eye.z - origin.z) * dir.z));
    const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
    const d = Math.hypot(px - eye.x, py - eye.y, pz - eye.z);
    if (d <= 2 && t > 3) this.ctx.bus.emit('bulletFlyby', { position: new THREE.Vector3(px, py, pz), distance: d });
  }

  // ------------------------------------------------------------ 移動
  private turnTo(target: number, dt: number, rate: number): void {
    const d = normAngle(target - this.facing);
    const step = rate * dt;
    this.facing += Math.abs(d) <= step ? d : Math.sign(d) * step;
  }

  /** 朝 (dx, dz) 方向走（單位向量），含分離力。回傳位移距離 */
  private walk(dx: number, dz: number, speed: number, dt: number): number {
    const sep = this.separation();
    let vx = dx * speed + sep.x, vz = dz * speed + sep.z;
    const l = Math.hypot(vx, vz);
    if (l > speed * 1.4) { vx *= (speed * 1.4) / l; vz *= (speed * 1.4) / l; }
    return this.ctx.mover.move(this.pos, vx * dt, vz * dt, dt);
  }

  /** 與其他敵人、玩家保持距離的分離力 */
  separation(): THREE.Vector3 {
    const v = this.sepV.set(0, 0, 0);
    const list = this.ctx.all;
    {
      for (const o of list) {
        if (o === this || o.dead) continue;
        const ex = this.pos.x - o.pos.x, ez = this.pos.z - o.pos.z;
        const d = Math.hypot(ex, ez);
        if (d < 1.1 && d > 0.001) { const k = (1.1 - d) / d * 1.6; v.x += ex * k; v.z += ez * k; }
      }
    }
    const px = this.pos.x - this.ctx.player.feet.x, pz = this.pos.z - this.ctx.player.feet.z;
    const pd = Math.hypot(px, pz);
    if (pd < 0.9 && pd > 0.001) { const k = (0.9 - pd) / pd * 2; v.x += px * k; v.z += pz * k; }
    return v;
  }

  /** 沿 nav 圖走向 goal。到達（距離 ≤ stopDist）時設 arrived 並回傳 0 */
  private goTo(goal: THREE.Vector3, speed: number, dt: number, stopDist = 0.8): number {
    const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= stopDist && Math.abs(goal.y - this.pos.y) < 2.5) { this.arrived = true; return 0; }
    this.pathAge += dt;
    if (this.path.length === 0 || this.pathGoal.distanceToSquared(goal) > 9 || this.pathAge > 3) this.replan(goal);
    // 目前路徑點
    let wp = this.path[this.pathIdx] ?? goal;
    while (this.pathIdx < this.path.length - 1 && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 0.7) {
      this.pathIdx++;
      wp = this.path[this.pathIdx];
    }
    let wx = wp.x - this.pos.x, wz = wp.z - this.pos.z;
    const wl = Math.hypot(wx, wz);
    if (wl < 0.05) return 0;
    wx /= wl; wz /= wl;
    this.turnTo(Math.atan2(wx, wz), dt, TURN_RATE);
    const sp = this.stance === 'crouch' ? this.def.walkSpeed * CROUCH_SPEED_K : this.stance === 'crouch_run' ? this.def.walkSpeed * CROUCH_RUN_SPEED_K : speed;
    const moved = this.walk(wx, wz, sp, dt);
    // 卡住偵測
    if (moved < sp * dt * 0.25) {
      this.stuckT += dt;
      if (this.stuckT > 0.7) {
        this.stuckT = 0;
        this.path = [];
        this.pathAge = 99;
        // 輕推一下
        this.ctx.mover.move(this.pos, -wz * 0.3, wx * 0.3, dt);
      }
    } else this.stuckT = 0;
    return moved;
  }

  private replan(goal: THREE.Vector3): void {
    const { nav, mover } = this.ctx;
    this.pathAge = 0;
    this.pathGoal.copy(goal);
    this.pathIdx = 0;
    const a = this.tmp.set(this.pos.x, this.pos.y + 0.6, this.pos.z);
    const b = this.tmp2.set(goal.x, goal.y + 0.6, goal.z);
    if (this.pos.distanceTo(goal) < 10 && mover.los(a, b)) { this.path = [goal.clone()]; return; }
    const seeFrom = (i: number) => { const n = nav.nodes[i]; return mover.los(a, this.tmp2.set(n.x, n.y + 0.6, n.z)); };
    let from = nav.nearest(this.pos, seeFrom, 18);
    if (from < 0) from = nav.nearest(this.pos);
    const to = nav.nearest(goal);
    const nodes = from >= 0 && to >= 0 ? nav.findPath(from, to) : null;
    if (!nodes) { this.path = [goal.clone()]; return; }
    this.path = nodes.map((i) => nav.nodes[i]);
    // 終點若從最後一個節點直線可達，再接上真正的目標
    const last = this.path[this.path.length - 1];
    const lastP = this.tmp.set(last.x, last.y + 0.6, last.z);
    if (mover.los(lastP, b)) this.path.push(goal.clone());
  }

  /** 聲音事件（敵人的動作聲）：腳步在腳底，其餘在胸口高度 */
  private emitNoise(kind: NoiseKind, extra: Partial<NoiseEvent> = {}): void {
    this.ctx.bus.emit('noise', { kind, position: { x: this.pos.x, y: this.pos.y + 1.2, z: this.pos.z }, source: this.id, weaponId: this.weaponId, ...extra });
  }

  /** 腳步：巡邏走路、追擊衝刺各發各的 noise；偷襲蹲走完全無聲；蹲跑 8m */
  private footsteps(moved: number): void {
    if (moved < 0.001 || this.distToPlayer > 58 || this.stance === 'crouch') return;
    const sprint = this.stance === 'walk' && this.speedNow > this.def.walkSpeed * 1.6;
    const stride = sprint ? 1.7 : this.stance === 'crouch_run' ? 2.2 : 2.0;
    this.stepAccum += moved;
    if (this.stepAccum >= stride) {
      this.stepAccum -= stride;
      const kind: NoiseKind = this.stance === 'crouch_run' ? 'footstep_crouch_run' : sprint ? 'footstep_sprint' : 'footstep_walk';
      this.ctx.bus.emit('noise', { kind, position: { x: this.pos.x, y: this.pos.y, z: this.pos.z }, source: this.id, surface: this.ctx.surfaceAt(this.pos) });
    }
  }

  // ------------------------------------------------------------ 動畫（每個畫面）
  updateAnim(frameDt: number, visible: boolean): void {
    if (!this.anim) return;
    this.animAcc += frameDt;
    // LOD：遠的敵人降低動畫更新頻率，看不到的跳過
    const every = this.distToPlayer < 18 ? 0 : this.distToPlayer < 40 ? 0.05 : 0.1;
    if (!visible && !this.dead) return;
    if (this.animAcc < every) return;
    const dt = this.animAcc;
    this.animAcc = 0;
    if (!this.dead) {
      const shooting = this.lastShotAgo < 0.45;
      const s = this.speedNow;
      if (s > this.def.walkSpeed * 1.7) this.anim.play(shooting ? 'runGun' : 'run');
      else if (s > 0.25) this.anim.play(shooting && this.brain.state === 'attack' ? 'runGun' : s > this.def.walkSpeed * 1.4 ? 'run' : 'walk');
      else this.anim.play(shooting ? 'shoot' : 'idle');
    }
    this.anim.update(dt);
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
