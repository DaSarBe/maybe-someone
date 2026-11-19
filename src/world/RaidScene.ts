import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { buildCorpseLoot } from '../ai/CorpseLoot';
import type { Enemy, PlayerTarget } from '../ai/Enemy';
import { EnemyManager } from '../ai/EnemyManager';
import { preloadEnemyModel } from '../ai/EnemyModel';
import { CombatFx } from '../combat/Fx';
import { PlayerHealth } from '../combat/PlayerHealth';
import { Viewmodel } from '../combat/Viewmodel';
import { WeaponSystem } from '../combat/WeaponSystem';
import { WorldTrace } from '../combat/WorldTrace';
import type { Game, Scene } from '../core/Game';
import { DEFAULT_ERA, getEra } from '../data/eras';
import { LOOT_TABLES, type ContainerLootDef, type ContainerType } from '../data/lootTables';
import type { Slot } from '../items/Inventory';
import { rollContainer } from '../items/LootTable';
import { MobileControls } from '../player/MobileControls';
import { PlayerController } from '../player/PlayerController';
import { CombatHud } from '../ui/CombatHud';
import { DebugHud } from '../ui/DebugHud';
import { el } from '../ui/dom';
import { GameHud } from '../ui/GameHud';
import { resetSaveButton } from '../ui/MenuButtons';
import { PauseMenu } from '../ui/PauseMenu';
import { Ui, type Panel } from '../ui/Ui';
import { LootPanel } from '../ui/panels/LootPanel';
import { ResultPanel } from '../ui/panels/ResultPanel';
import { TransferPanel } from '../ui/panels/TransferPanel';
import { setupLighting } from './Lighting';
import { makeLabel } from './maps/hub';
import { fitModel, loadModel } from './Models';
import type { EvacPoint, LootSpot, RaidMap, RaidMapLoader } from './RaidMap';
import { findReverbZone, type ReverbType, type ReverbZone, type Surface } from './Surface';

const EVAC_SECONDS = 5;
const INTERACT_RANGE = 2.3;
const MARKER_COLOR: Record<ContainerType, string> = {
  crate: '#ffcf5a', toolbox: '#ff8a3d', cabinet: '#7cc4ff', safe: '#ff3dcb', corpse: '#ff5a5a',
};
/** 亮度：用回音區當作室內外的近似（暗處、室內較難發現玩家）。正式地圖若有燈光資料可替換 */
const LIGHT_BY_ZONE: Record<ReverbType, number> = { outdoor: 1, indoor_large: 0.75, indoor_small: 0.55, tunnel: 0.5 };

export interface RaidContainer {
  type: ContainerType;
  def: ContainerLootDef;
  pos: THREE.Vector3;
  loot: Slot[];
  /** 已經搜索完成（內容可見） */
  searched: boolean;
  group: THREE.Group;
  marker: THREE.Mesh;
  /** 敵人屍體 */
  enemy?: Enemy;
}

export interface RaidEvac {
  def: EvacPoint;
  group: THREE.Group;
  open: boolean;
}

/**
 * 通用 Raid 場景：從 RaidMap 資料建立搜刮容器、撤離點、抵達點、敵人，
 * 並串起戰鬥（武器、生命、敵人 AI）、穩定度倒數與結算。地圖本身由 RaidMapLoader 提供。
 */
export class RaidScene implements Scene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);
  player!: PlayerController;
  map!: RaidMap;
  ui!: Ui;
  weapons!: WeaponSystem;
  health!: PlayerHealth;
  enemies!: EnemyManager;
  fx!: CombatFx;
  containers: RaidContainer[] = [];
  evac: RaidEvac[] = [];
  ended = false;
  ready = false;
  /** 地圖與敵人載入完成時 resolve（自動化測試用） */
  loaded: Promise<void>;
  loadError: string | null = null;
  killedBy: string | null = null;
  /** 準心正對著敵人 */
  onTarget = false;

  private resolveLoaded!: () => void;
  private game!: Game;
  private hud!: GameHud;
  private chud!: CombatHud;
  private dbg: DebugHud | null = null;
  private menu: PauseMenu | null = null;
  private vm = new Viewmodel();
  private trace!: WorldTrace;
  private loading: HTMLElement | null = null;
  private zone: ReverbZone | null = null;
  private zoneType: ReverbType = 'outdoor';
  private tmp = new THREE.Vector3();
  private era = DEFAULT_ERA;
  private duration = 300;
  private startedAt = 0;
  private timeOffset = 0;
  private lastSecond = -1;
  private warned = false;
  private searching: RaidContainer | null = null;
  private searchProgress = 0;
  private needRelease = false;
  private evacProgress = 0;
  private nearC: RaidContainer | null = null;
  private t = 0;
  private disposed = false;
  private playerTarget: PlayerTarget = {
    feet: new THREE.Vector3(), eye: new THREE.Vector3(), crouching: false, sprinting: false, moving: false, alive: true,
  };
  private frustum = new THREE.Frustum();
  private projScreen = new THREE.Matrix4();
  private aimOrigin = new THREE.Vector3();
  private aimDir = new THREE.Vector3();
  private unsubs: (() => void)[] = [];
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'KeyK' && !e.repeat && !this.ui.isOpen && this.ready) this.end('death');
  };

  constructor(private loader: RaidMapLoader, private opts: { showHud?: boolean } = {}) {
    this.loaded = new Promise((res) => { this.resolveLoaded = res; });
  }

  // ---------------------------------------------------------------- 進入 / 離開
  enter(game: Game): void {
    this.game = game;
    const eco = game.economy;
    // 直接載入 ?scene=raid 時還沒出發過：自動開始一場
    if (!eco.inRaid) eco.startRaid(DEFAULT_ERA);
    const raid = eco.profile.raid;
    if (raid) { this.era = raid.era; this.duration = raid.duration; this.startedAt = raid.startedAt; }
    this.showLoading();
    this.vm.resize(this.camera.aspect);
    void this.init().catch((err) => {
      console.error('[raid] failed to load map', err);
      this.loadError = String(err);
      this.showLoading(`地圖載入失敗：${String(err)}`);
      this.resolveLoaded();
    });
  }

  private showLoading(error?: string): void {
    if (!this.loading) {
      this.loading = el('div', 'loading-screen');
      this.game.container.appendChild(this.loading);
    }
    this.loading.replaceChildren();
    const era = getEra(this.era);
    this.loading.append(el('h2', '', era?.name ?? '時空 Raid'), el('p', '', error ?? '時光機啟動中，正在建構時空座標…'));
    if (!error) {
      const bar = el('div', 'loading-bar');
      bar.appendChild(el('i'));
      this.loading.appendChild(bar);
    } else {
      const b = el('button', 'menu-btn primary', '回到基地');
      b.addEventListener('click', () => {
        this.game.economy.resolveRaid('death', true);
        this.game.economy.acknowledgeResult();
        this.game.setScene(this.game.scenes.hub());
      });
      this.loading.appendChild(b);
    }
  }

  private async init(): Promise<void> {
    const game = this.game;
    const eco = game.economy;
    const touch = game.isTouch;

    const [map] = await Promise.all([this.loader(), preloadEnemyModel('enemy_soldier'), preloadEnemyModel('enemy_robot_gunner')]);
    if (this.disposed) return;
    this.map = map;

    setupLighting(this.scene, { shadowMapSize: touch ? 1024 : 2048, extent: 62 });
    this.scene.add(map.root);
    const octree = new Octree();
    octree.fromGraphNode(map.collision);

    this.scene.add(this.camera);
    this.player = new PlayerController(game.input, game.bus, this.camera);
    this.player.setWorld(octree, map.surfaceMeshes);
    this.player.setWeightProvider(() => eco.getWeightRatio());
    const arrival = map.arrivals[Math.floor(Math.random() * map.arrivals.length)] ?? map.spawn;
    this.player.teleport(arrival.position, arrival.yaw);

    this.ui = new Ui(game);
    this.hud = new GameHud(game.container);
    this.hud.showCredits(false);
    this.chud = new CombatHud(game.container, touch);
    if (this.opts.showHud !== false) this.dbg = new DebugHud(game.container, game.bus, touch);
    if (touch) new MobileControls(game.container, game.input, { combat: true });

    // ---- 戰鬥系統 ----
    this.trace = new WorldTrace(map.surfaceMeshes);
    this.fx = new CombatFx(this.scene);
    this.health = new PlayerHealth(game.bus, eco, this.player);
    this.health.onDeath = (killer) => { this.killedBy = killer; this.end('death', killer); };
    this.enemies = new EnemyManager({
      bus: game.bus, octree, nav: map.nav, fx: this.fx, trace: this.trace, player: this.playerTarget,
      lightAt: (p) => this.lightAt(p),
      damagePlayer: (base, zone, from, killer) => { this.health.hit(base, zone, from, killer); },
      onDeath: (e) => this.spawnCorpse(e),
      surfaceAt: (p) => this.surfaceAt(p),
      castShadow: !touch,
    });
    this.weapons = new WeaponSystem({
      bus: game.bus, input: game.input, player: this.player, camera: this.camera, eco, fx: this.fx,
      trace: this.trace, targets: this.enemies, vm: this.vm, health: this.health,
    });

    this.menu = new PauseMenu(game.container, game.input, game.audio, {
      touch, debug: game.debug,
      hint: 'WASD 移動 ・ 左鍵射擊 ・ 右鍵瞄準 ・ R 換彈 ・ 1/2 或滾輪換槍 ・ 4 治療 ・ 按住 E 搜索 ・ Tab 背包 ・ K 模擬死亡（測試）・ Esc 暫停|左側搖桿移動 ・ 右側拖曳轉視角 ・ 按鈕射擊、瞄準、換彈、切換武器、治療 ・ 按住「互動」搜索',
      isBlocked: () => this.ui.isOpen,
      extra: [
        { label: '模擬死亡（測試）', onClick: () => this.end('death'), confirm: '再按一次確認：你會失去所有物品' },
        resetSaveButton(game),
      ],
    });
    this.ui.onClosed = () => {
      this.containers.forEach((c) => this.refreshMarker(c));
      this.weapons.refreshFromEquipment();
      this.health.refreshArmor();
      game.input.requestLock();
      window.setTimeout(() => this.menu?.refreshLock(), 160);
    };
    window.addEventListener('keydown', this.onKey);

    this.unsubs.push(
      game.bus.on('playerHurt', (e) => this.onHurt(e.amount, e.from)),
      game.bus.on('enemyHit', (e) => {
        this.chud.showHit(e.zone, e.killed);
        game.audio.play({ key: 'ui.select', volume: e.killed ? 0.5 : 0.3, rate: e.zone === 'head' ? 1.7 : e.killed ? 1.4 : 1.15, group: 'ui', tag: `hit ${e.zone}` });
      }),
    );

    game.audio.setZones(map.reverbZones);
    this.spawnContainers(map.lootSpots);
    this.spawnEvac(map.evacPoints);
    await this.enemies.spawn(map.enemySpawns, this.scene);
    if (this.disposed) return;

    game.renderer.autoClear = false;
    this.ready = true;
    this.hud.flash(getEra(this.era)?.name ?? '時空 Raid');
    const l = this.loading;
    this.loading = null;
    l?.classList.add('fade');
    window.setTimeout(() => l?.remove(), 450);
    this.resolveLoaded();
  }

  exit(): void {
    this.disposed = true;
    this.loading?.remove();
    if (!this.ready) return;
    this.game.renderer.autoClear = true;
    window.removeEventListener('keydown', this.onKey);
    for (const u of this.unsubs) u();
    this.enemies.dispose();
    this.fx.dispose();
    this.ui.dispose();
    this.hud.dispose();
    this.chud.dispose();
    this.dbg?.dispose();
    this.menu?.dispose();
    this.game.input.lookScale = 1;
    this.game.container.querySelector('.mc')?.remove();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm.resize(w / h);
  }

  // ---------------------------------------------------------------- 地圖資料 → 場景物件
  private spawnContainers(spots: LootSpot[]): void {
    const table = LOOT_TABLES[this.era]?.containers;
    if (!table) return;
    const avail = spots.filter((s) => Math.random() <= (s.chance ?? 1)).sort(() => Math.random() - 0.5);
    const n = Math.min(avail.length, 8 + Math.floor(Math.random() * 5)); // 8..12
    for (const spot of avail.slice(0, n)) {
      const type = spot.types[Math.floor(Math.random() * spot.types.length)];
      const def = table[type];
      const pos = spot.position.clone();
      const loot: Slot[] = rollContainer(this.era, type);
      const group = new THREE.Group();
      group.position.copy(pos);
      group.rotation.y = spot.yaw ?? Math.random() * Math.PI * 2;
      const [sx, sy, sz] = def.look.size;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, sz),
        new THREE.MeshLambertMaterial({ color: def.look.color }),
      );
      body.position.y = sy / 2;
      body.castShadow = body.receiveShadow = true;
      group.add(body);
      if (type === 'toolbox') {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.5, 0.06, 0.06), new THREE.MeshLambertMaterial({ color: '#2b2b2b' }));
        handle.position.y = sy + 0.03;
        group.add(handle);
      } else if (type === 'cabinet') {
        for (let i = 0; i < 3; i++) {
          const dr = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.9, 0.04, 0.02), new THREE.MeshLambertMaterial({ color: '#3a4552' }));
          dr.position.set(0, 0.35 + i * 0.45, sz / 2 + 0.01);
          group.add(dr);
        }
      } else if (type === 'corpse') {
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshLambertMaterial({ color: '#c9a98a' }));
        head.position.set(sx / 2 + 0.15, sy, 0);
        group.add(head);
      }
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: MARKER_COLOR[type] }));
      marker.position.y = sy + 0.75;
      group.add(marker);
      this.scene.add(group);

      const c: RaidContainer = { type, def, pos, loot, searched: false, group, marker };
      this.containers.push(c);

      if (def.look.model !== 'box') {
        void loadModel(def.look.model).then((m) => {
          if (!m || this.disposed) return;
          const g = fitModel(m, Math.max(sx, sz), 'max');
          if (type === 'safe') g.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh && mesh.material) {
              const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
              mat.color = mat.color.clone().multiplyScalar(0.55);
              mesh.material = mat;
            }
          });
          group.remove(body);
          group.add(g);
        });
      }
    }
  }

  /** 撤離點：固定的一定開放；random 的每場隨機開放約一半（至少總共開 1 個） */
  private spawnEvac(points: EvacPoint[]): void {
    const fixed = points.filter((p) => !p.random);
    const rand = points.filter((p) => p.random).sort(() => Math.random() - 0.5);
    const openRand = new Set(rand.slice(0, Math.max(fixed.length === 0 ? 1 : 0, Math.ceil(rand.length / 2))));
    for (const def of points) {
      const open = !def.random || openRand.has(def);
      const g = new THREE.Group();
      g.position.copy(def.position);
      g.visible = open;
      const R = def.radius;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(R - 0.25, R, 48),
        new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(R - 0.25, 48),
        new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.05;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(R - 0.3, R - 0.3, 14, 32, 1, true),
        new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      beam.position.y = 7;
      const label = makeLabel(def.name, '#4ade80');
      label.position.y = 3.2;
      g.add(ring, disc, beam, label);
      this.scene.add(g);
      this.evac.push({ def, group: g, open });
    }
  }

  /** 敵人死亡：屍體變成可搜刮的容器（武器、護甲、彈藥、額外掉落 + corpse 戰利品表） */
  private spawnCorpse(e: Enemy): void {
    const table = LOOT_TABLES[this.era]?.containers.corpse;
    if (!table) return;
    const loot: Slot[] = buildCorpseLoot({
      def: e.def, weaponId: e.weaponId, mag: e.mag, reserve: e.reserve, ammoType: e.stats.ammoType, armorDur: e.armorDur,
    }, this.era);
    const group = new THREE.Group();
    group.position.copy(e.pos);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: MARKER_COLOR.corpse }));
    marker.position.y = 1.2;
    group.add(marker);
    this.scene.add(group);
    const def: ContainerLootDef = { ...table, name: `${e.def.name}的屍體` };
    const c: RaidContainer = { type: 'corpse', def, pos: e.pos.clone(), loot, searched: false, group, marker, enemy: e };
    this.containers.push(c);
  }

  // ---------------------------------------------------------------- 感知用的環境查詢
  private lightAt(p: THREE.Vector3): number {
    const q = this.tmp.set(p.x, p.y + 0.9, p.z);
    const z = findReverbZone(this.map.reverbZones, q);
    return LIGHT_BY_ZONE[z?.type ?? 'outdoor'];
  }

  private surfaceAt(p: THREE.Vector3): Surface {
    const hit = this.trace.cast(this.tmp.set(p.x, p.y + 0.4, p.z), DOWN, 1.5);
    return hit?.surface ?? 'concrete';
  }

  // ---------------------------------------------------------------- 流程
  /** 剩餘秒數（以牆上時鐘計算，不受畫面暫停影響） */
  get remaining(): number {
    return this.duration - (Date.now() + this.timeOffset - this.startedAt) / 1000;
  }

  /** 測試掛鉤 */
  debugAdvance(sec: number): void { this.timeOffset += sec * 1000; }
  debugKill(): void { this.end('death'); }

  end(outcome: 'extract' | 'death', killedBy?: string): void {
    if (this.ended || !this.ready) return;
    this.weapons.flush();
    this.health.flush();
    const r = this.game.economy.resolveRaid(outcome);
    if (!r.ok) return;
    this.ended = true;
    this.searching = null;
    this.hud.setPrompt(null);
    this.hud.setProgress(null);
    this.chud.setVisible(false);
    this.game.input.lookScale = 1;
    this.game.bus.emit('raidEnded', { outcome });
    this.ui.open(new ResultPanel(this.ui, r.result, () => {
      this.game.economy.acknowledgeResult();
      this.ui.close(true, true);
      this.game.setScene(this.game.scenes.hub());
    }, { killedBy }));
    this.game.audio.playUi(outcome === 'extract' ? 'confirm' : 'error');
  }

  private openPanel(p: Panel): void {
    this.weapons.flush();
    this.ui.open(p);
  }

  private openContainer(c: RaidContainer): void {
    this.openPanel(new LootPanel(this.ui, c.def, c.loot));
  }

  private refreshMarker(c: RaidContainer): void {
    c.marker.visible = !c.searched || c.loot.some((s) => !!s);
    (c.marker.material as THREE.MeshBasicMaterial).color.set(c.searched ? '#8892a0' : MARKER_COLOR[c.type]);
  }

  private onHurt(amount: number, from?: THREE.Vector3): void {
    let angle: number | null = null;
    if (from) {
      const pp = this.player.position;
      const dx = from.x - pp.x, dz = from.z - pp.z;
      const yaw = this.player.facingYaw;
      const fwd = -Math.sin(yaw) * dx - Math.cos(yaw) * dz;
      const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
      angle = Math.atan2(right, fwd);
    }
    this.chud.showHurt(amount, angle);
    this.game.audio.play({ key: 'impacts.flesh', volume: 0.8, rate: 0.8, lowpass: 2500, tag: 'player hurt' });
  }

  update(dt: number): void {
    if (!this.ready) return;
    this.player.update(dt);
    if (this.player.position.y < -30) this.player.teleport(this.map.spawn.position, this.map.spawn.yaw);
    const p = this.tmp.copy(this.player.position); p.y += 0.9;
    const zone = findReverbZone(this.map.reverbZones, p);
    if (zone !== this.zone) {
      this.zone = zone;
      this.zoneType = zone?.type ?? 'outdoor';
      this.game.bus.emit('reverbZoneChanged', { type: this.zoneType, zone });
    }
    if (this.ended) return;

    // 玩家的感知資料
    const s = this.player.state;
    const pt = this.playerTarget;
    pt.feet.copy(this.player.position);
    pt.eye.copy(this.camera.position);
    pt.crouching = s.crouching;
    pt.sprinting = s.sprinting && s.moving;
    pt.moving = s.moving;
    pt.alive = !this.health.dead;
    this.enemies.update(dt);

    // 穩定度倒數
    const rem = this.remaining;
    const sec = Math.ceil(rem);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      this.game.bus.emit('stabilityChanged', { remaining: Math.max(0, rem), total: this.duration });
    }
    if (rem <= 0) { this.end('death'); return; }
    if (rem <= 60 && !this.warned) { this.warned = true; this.hud.flash('時空穩定度不足！盡快撤離'); }

    if (this.ui.isOpen) return;
    const inp = this.game.input;
    const pos = this.player.position;

    // 撤離點
    let inEvac = false;
    for (const e of this.evac) {
      if (!e.open) continue;
      if (Math.hypot(pos.x - e.def.position.x, pos.z - e.def.position.z) <= e.def.radius && Math.abs(pos.y - e.def.position.y) < 2.5) inEvac = true;
    }
    if (inEvac) {
      this.evacProgress += dt / EVAC_SECONDS;
      if (this.evacProgress >= 1) { this.end('extract'); return; }
    } else this.evacProgress = Math.max(0, this.evacProgress - dt * 2);

    // 搜刮
    let near: RaidContainer | null = null;
    let nd = INTERACT_RANGE;
    for (const c of this.containers) {
      const d = Math.hypot(pos.x - c.pos.x, pos.z - c.pos.z);
      if (d < nd && Math.abs(pos.y - c.pos.y) < 2) { near = c; nd = d; }
    }
    this.nearC = near;
    if (!inp.isDown('interact')) this.needRelease = false;

    if (near && near !== this.searching) { this.searching = null; this.searchProgress = 0; }
    if (near && !near.searched && inp.isDown('interact') && !this.needRelease) {
      this.searching = near;
      const total = near.def.searchTime * this.game.economy.searchScale();
      this.searchProgress += dt / total;
      if (this.searchProgress >= 1) {
        near.searched = true;
        this.searching = null;
        this.searchProgress = 0;
        this.needRelease = true;
        this.refreshMarker(near);
        this.openContainer(near);
      }
    } else {
      this.searching = null;
      this.searchProgress = Math.max(0, this.searchProgress - dt * 3);
      if (near && near.searched && inp.consumePress('interact')) this.openContainer(near);
    }
    if (inp.consumePress('inventory')) this.openPanel(new TransferPanel(this.ui, 'body'));
  }

  private promptText(): string | null {
    const c = this.nearC;
    if (!c) return null;
    const touch = this.game.isTouch;
    if (!c.searched) return touch ? `按住「互動」搜索：${c.def.name}` : `按住 E 搜索：${c.def.name}`;
    if (c.loot.every((s) => !s)) return `${c.def.name}（已搜空）`;
    return touch ? `點「互動」打開：${c.def.name}` : `按 E 打開：${c.def.name}`;
  }

  render(alpha: number, frameDt: number): void {
    if (!this.ready) return;
    const game = this.game;
    this.t += frameDt;

    // 觸控輔助瞄準：準心掃過敵人時降低轉視角的靈敏度（減速，不鎖定）
    this.weapons.assistScale = game.isTouch && this.onTarget ? 0.55 : 1;
    this.player.updateCamera(alpha, frameDt);
    this.camera.updateMatrixWorld();
    if (!this.ended) {
      if (game.input.consumePress('heal')) {
        const r = this.health.toggleHeal();
        if (r === 'none') this.ui.toast('背包裡沒有醫療品', 'err');
        else if (r === 'full') this.ui.toast('生命值已滿', 'info');
        else if (r === 'started') game.audio.playUi('equip', 0.6);
      }
      this.health.update(frameDt);
      this.weapons.update(frameDt);
      this.updateAimTarget();
    }
    this.fx.update(frameDt);
    this.projScreen.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    this.enemies.updateAnim(frameDt, this.frustum);
    game.audio.updateListener(this.camera);
    this.map.update?.(frameDt, this.t);

    for (const c of this.containers) {
      if (c.marker.visible) {
        c.marker.rotation.y += frameDt * 2;
        const base = c.enemy ? 1.2 : c.def.look.size[1] + 0.75;
        c.marker.position.y = base + Math.sin(this.t * 2 + c.pos.x) * 0.06;
      }
    }
    if (!this.ended) {
      this.hud.setTimer(Math.max(0, this.remaining), this.duration);
      const text = this.promptText();
      const c = this.nearC;
      this.hud.setPrompt(this.ui.isOpen ? null : text, c && c.searched && c.loot.some((s) => !!s) ? () => this.openContainer(c) : undefined);
      if (this.ui.isOpen) this.hud.setProgress(null);
      else if (this.evacProgress > 0.001) this.hud.setProgress(`撤離中… ${(EVAC_SECONDS * (1 - this.evacProgress)).toFixed(1)}s`, this.evacProgress);
      else if (this.searchProgress > 0.001) this.hud.setProgress('搜索中…', this.searchProgress);
      else this.hud.setProgress(null);

      const wh = this.weapons.hud();
      this.chud.setWeapon(wh.name, wh.mag, wh.magMax, wh.reserve, wh.reloading, wh.reloadProgress, wh.slotLabel);
      this.chud.setHealth(this.health.hp, this.health.max, this.health.armorDur, this.health.armorMax);
      this.chud.setCrosshair(Math.max(3, this.weapons.crosshairGapPx(game.height)) + 2, this.onTarget, !!this.weapons.current && !this.ui.isOpen);
      this.chud.setHeal(this.health.healing ? this.health.healProgress : null);
      this.chud.update(frameDt);
    }
    const s = this.player.state;
    const pos = this.player.position;
    this.dbg?.update(frameDt, {
      surface: this.player.surface,
      zone: this.zoneType,
      moveState: !s.grounded ? 'air' : s.sprinting && s.moving ? 'sprint' : s.moving ? 'walk' : 'idle',
      position: `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}  hp=${Math.ceil(this.health.hp)} ai=${this.enemies.aiMs.toFixed(2)}ms n=${this.enemies.alive.length}`,
      sound: game.audio.lastSound,
      audioState: `${game.audio.state} voices=${game.audio.voiceCount}`,
    });

    // 世界 → 武器模型（深度另外清除，不會穿牆）
    const r = game.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.vm.visible && !this.health.dead && !this.ended) {
      r.clearDepth();
      r.render(this.vm.scene, this.vm.camera);
    }
  }

  /** 準心下是否有（看得到的）敵人：命中標記顏色與觸控輔助瞄準用 */
  private updateAimTarget(): void {
    this.camera.getWorldPosition(this.aimOrigin);
    this.camera.getWorldDirection(this.aimDir);
    const h = this.enemies.raycast(this.aimOrigin, this.aimDir, 70);
    this.onTarget = !!h && this.enemies.mover.los(this.aimOrigin, h.point);
  }
}

const DOWN = new THREE.Vector3(0, -1, 0);
