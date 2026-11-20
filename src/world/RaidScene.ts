import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { buildCorpseLoot } from '../ai/CorpseLoot';
import type { Enemy, PlayerTarget } from '../ai/Enemy';
import { EnemyManager } from '../ai/EnemyManager';
import { preloadEnemyModel } from '../ai/EnemyModel';
import { CombatFx } from '../combat/Fx';
import { PlayerHealth } from '../combat/PlayerHealth';
import { Viewmodel } from '../combat/Viewmodel';
import { TacticalFx } from '../combat/TacticalFx';
import { preloadAttachmentModels } from '../combat/AttachmentModels';
import { preloadWeaponModels } from '../combat/WeaponModels';
import { WeaponSystem } from '../combat/WeaponSystem';
import { WorldTrace } from '../combat/WorldTrace';
import type { Game, Scene } from '../core/Game';
import { DEFAULT_ERA, getEra } from '../data/eras';
import { SUSTAINED_BEAT, searchLoudness } from '../data/noise';
import { CONTAINER_OPEN_SECONDS } from '../data/search';
import { asDifficulty, type Difficulty } from '../data/enemies';
import { NoiseIndicator } from '../ui/NoiseIndicator';
import { FactionMarkers } from '../ui/FactionMarkers';
import { FACTIONS, areHostile, type FactionId } from '../data/factions';
import { LOOT_TABLES, type ContainerLootDef, type ContainerType } from '../data/lootTables';
import type { Slot } from '../items/Inventory';
import { autoPickupFromLoot } from '../items/LootActions';
import { LootSearch } from '../items/LootSearch';
import { rollContainer } from '../items/LootTable';
import { MobileControls } from '../player/MobileControls';
import { ASSIST_SCALE } from '../settings/ControlSettings';
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
import { TraderPanel } from '../ui/panels/TraderPanel';
import { TransferPanel } from '../ui/panels/TransferPanel';
import { getTrader } from '../data/traders';
import { getItem } from '../data/items';
import { HELMET_STATS } from '../data/gear';
import { WEAPON_STATS } from '../data/weapons';
import { setupLighting } from './Lighting';
import { makeLabel } from './maps/hub';
import { fitModel, loadModel } from './Models';
import type { EvacPoint, LootSpot, RaidMap, RaidMapLoader } from './RaidMap';
import { TraderNpc } from './TraderNpc';
import { findReverbZone, type ReverbType, type ReverbZone, type Surface } from './Surface';

const EVAC_SECONDS = 5;
/** 揭露提示音的音高（依稀有度） */
const REVEAL_PITCH: Record<string, number> = { common: 1, uncommon: 1.12, rare: 1.26, epic: 1.41, legendary: 1.59 };
const INTERACT_RANGE = 2.3;
/** 與商人互動的距離（水平）：商人在攤位內，玩家在櫃檯前 */
const TRADER_RANGE = 3.7;
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
  /** 已經打開過（之後再互動直接開面板，不用再等開箱動作） */
  opened: boolean;
  /** 逐件揭露的進度（關閉面板後保留） */
  search: LootSearch;
  /** 已經搜空：場景中變暗 */
  dimmed?: boolean;
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
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 250);
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
  trader: TraderNpc | null = null;
  /** 地圖難度 1～3（★～★★★）：敵人命中率、反應、聽覺與戰術機率 */
  difficulty: Difficulty = 2;
  /** 聲音視覺提示（準心周圍的方向弧形） */
  noiseHud: NoiseIndicator | null = null;
  /** 準心正對著敵人 */
  onTarget = false;
  /** 頭頂標記（中立 / 友好 / 警告 / 被挑釁） */
  markers: FactionMarkers | null = null;
  /** 測試用：強制本場企業休戰（true）或敵對（false）；null = 依存檔的本場擲骰 */
  truceOverride: boolean | null = null;
  /** 最近一次衝突事件（派誰去哪裡），除錯與測試用 */
  lastConflict: { from: FactionId; to: FactionId; ids: string[]; point: THREE.Vector3 } | null = null;
  /** 玩家最近一次殺人造成的聲望變化（除錯與測試用） */
  lastKill: { faction: FactionId; changes: Partial<Record<FactionId, number>>; ally: boolean } | null = null;

  private resolveLoaded!: () => void;
  private game!: Game;
  private hud!: GameHud;
  private chud!: CombatHud;
  private dbg: DebugHud | null = null;
  private menu: PauseMenu | null = null;
  private mc: MobileControls | null = null;
  private beatT: Record<string, number> = {};
  private vm = new Viewmodel();
  private tfx: TacticalFx | null = null;
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
  /** 開箱動作（點一下互動後 0.5 秒，期間移動離開範圍或開槍會中斷） */
  private opening: { c: RaidContainer; t: number } | null = null;
  /** 目前打開著的搜刮面板（揭露進度由場景推進，面板關閉就停止） */
  private activeLoot: { c: RaidContainer; panel: LootPanel } | null = null;
  private evacProgress = 0;
  private nearC: RaidContainer | null = null;
  private nearTrader = false;
  private t = 0;
  /** 距離「衝突事件」觸發還有幾秒（Raid 開始後 2～5 分鐘） */
  private conflictIn = 120 + Math.random() * 180;
  private disposed = false;
  private playerTarget: PlayerTarget = {
    feet: new THREE.Vector3(), eye: new THREE.Vector3(), crouching: false, sprinting: false, moving: false, alive: true,
    crouchRunning: false, healing: false, reloading: false,
  };
  private frustum = new THREE.Frustum();
  private projScreen = new THREE.Matrix4();
  private aimOrigin = new THREE.Vector3();
  private aimDir = new THREE.Vector3();
  private unsubs: (() => void)[] = [];
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'KeyK' && !e.repeat && !this.ui.isOpen && this.ready) this.end('death');
  };

  constructor(private loader: RaidMapLoader, private opts: { showHud?: boolean; testMap?: boolean } = {}) {
    this.loaded = new Promise((res) => { this.resolveLoaded = res; });
  }

  // ---------------------------------------------------------------- 進入 / 離開
  enter(game: Game): void {
    this.game = game;
    const eco = game.economy;
    // 直接載入 ?scene=raid 時還沒出發過：自動開始一場
    if (!eco.inRaid) eco.startRaid(DEFAULT_ERA, { testMap: this.opts.testMap });
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

    const [map] = await Promise.all([
      this.loader(), preloadEnemyModel('enemy_soldier'), preloadEnemyModel('enemy_robot_gunner'), preloadEnemyModel('npc_worker'), preloadWeaponModels(), preloadAttachmentModels(),
    ]);
    if (this.disposed) return;
    this.map = map;
    this.difficulty = asDifficulty(map.difficulty ?? getEra(this.era)?.difficulty);

    // 地圖自帶光源、霧、天空（harbor1990）就不再套用預設燈光
    if (!map.ownsLighting) setupLighting(this.scene, { shadowMapSize: touch ? 1024 : 2048, extent: 62 });
    this.scene.add(map.root);

    // 時代商人：碰撞先加進地圖（Octree 之前），子彈判定用隱形圓柱
    const traderDef = map.trader ? getTrader(this.era) : undefined;
    if (map.trader && traderDef) {
      this.trader = new TraderNpc({ ...map.trader, name: traderDef.name });
      map.collision.add(this.trader.collider);
      this.scene.add(this.trader.root, this.trader.hitbox);
    }
    const octree = new Octree();
    octree.fromGraphNode(map.collision);

    this.scene.add(this.camera);
    this.player = new PlayerController(game.input, game.bus, this.camera);
    this.player.setWorld(octree, map.surfaceMeshes);
    this.player.setWeightProvider(() => eco.getWeightRatio());
    const arrival = map.arrivals[Math.floor(Math.random() * map.arrivals.length)] ?? map.spawn;
    this.player.teleport(arrival.position, arrival.yaw);

    this.ui = new Ui(game);
    this.hud = new GameHud(game.container, touch ? game.layout : null);
    this.hud.showCredits(false);
    this.chud = new CombatHud(game.container, touch, touch ? game.layout : null);
    if (this.opts.showHud !== false) this.dbg = new DebugHud(game.container, game.bus, touch);
    if (touch) this.mc = new MobileControls(game.container, game.input, game.layout, game.controls, { combat: true });

    // ---- 戰鬥系統 ----
    this.trace = new WorldTrace(this.trader ? [...map.surfaceMeshes, this.trader.hitbox] : map.surfaceMeshes);
    this.fx = new CombatFx(this.scene);
    this.health = new PlayerHealth(game.bus, eco, this.player);
    this.health.onDeath = (killer, headshot) => { this.killedBy = killer; this.end('death', killer, headshot); };
    this.enemies = new EnemyManager({
      bus: game.bus, octree, nav: map.nav, fx: this.fx, trace: this.trace, player: this.playerTarget,
      lightAt: (p) => this.lightAt(p),
      damagePlayer: (base, zone, from, killer, weaponClass) => { this.health.hit(base, zone, from, killer, weaponClass); },
      onDeath: (e) => { this.spawnCorpse(e); if (e.killer === 'player') this.onPlayerKill(e); },
      factions: {
        playerCorp: () => eco.corp,
        attitude: (f) => eco.attitudeToward(f),
        hostile: (a, b) => areHostile(a, b, this.corpTruce),
      },
      surfaceAt: (p) => this.surfaceAt(p),
      castShadow: !touch,
      difficulty: this.difficulty,
    });
    // 聲音遮擋：聲源到耳朵之間有牆壁 / 貨櫃（Octree raycast）就加低通並降低音量
    const oa = new THREE.Vector3(), ob = new THREE.Vector3();
    game.audio.setOccluder((a, b) => this.enemies.mover.los(oa.set(a.x, a.y, a.z), ob.set(b.x, b.y, b.z)));
    this.ui.noiseAt = () => ({ x: this.player.position.x, y: this.player.position.y + 1.0, z: this.player.position.z });
    this.markers = new FactionMarkers(game.container);
    this.noiseHud = new NoiseIndicator(game.container, game.audio, touch ? game.layout : null, () => ({ ear: this.camera.position, yaw: this.player.facingYaw }));
    this.noiseHud.setEnabled(game.controls.get().soundIndicator);
    this.unsubs.push(game.controls.subscribe((c) => this.noiseHud?.setEnabled(c.soundIndicator)));
    this.tfx = new TacticalFx(this.camera, this.scene);
    this.weapons = new WeaponSystem({
      bus: game.bus, input: game.input, player: this.player, camera: this.camera, eco, fx: this.fx,
      trace: this.trace, targets: this.enemies, vm: this.vm, health: this.health,
    });

    this.menu = new PauseMenu(game.container, game.input, game.audio, {
      touch, debug: game.debug, game,
      hint: 'WASD 移動（Shift 衝刺、C 蹲下、蹲下再按 Shift = 蹲跑）・ 左鍵射擊 ・ 右鍵瞄準 ・ R 換彈 ・ T 手電筒 / 雷射 ・ 1/2 或滾輪換槍 ・ 4 治療 ・ E 搜刮容器（點一下就開始）・ Tab 背包 ・ K 模擬死亡（測試）・ Esc 暫停|左側搖桿移動（蹲下後推到底 = 蹲跑）・ 右側拖曳轉視角 ・ 左右兩側射擊鍵（右側可拖曳轉視角）・ 瞄準、換彈、切換武器、治療、燈（手電筒 / 雷射）・ 點「互動」搜刮',
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
      this.health.refreshHelmet();
      game.input.requestLock();
      window.setTimeout(() => this.menu?.refreshLock(), 160);
    };
    window.addEventListener('keydown', this.onKey);

    this.unsubs.push(
      game.bus.on('playerHurt', (e) => this.onHurt(e.amount, e.from)),
      game.bus.on('enemyHit', (e) => this.chud.showHit(e.zone, e.killed)),
      game.bus.on('helmetHit', (e) => { if (e.target === 'player') this.chud.flashHelmet(); }),
    );

    game.audio.setZones(map.reverbZones);
    // 從基地（室內）過來：先把聽者所在區重設為室外，之後只有換區時才會再發事件
    game.bus.emit('reverbZoneChanged', { type: 'outdoor', zone: null });
    this.spawnContainers(map.lootSpots);
    this.spawnEvac(map.evacPoints);
    await Promise.all([this.enemies.spawn(map.enemySpawns, this.scene), this.trader?.load()]);
    if (this.disposed) return;
    game.audio.startMapAmbience(map.ambience, this.duration);

    game.renderer.autoClear = false;
    this.ready = true;
    this.hud.flash(getEra(this.era)?.name ?? '時空 Raid');
    // 第二行提示：這一場企業之間是休戰還是敵對
    window.setTimeout(() => { if (!this.disposed && !this.ended) this.hud.flash(this.truceText()); }, 2800);
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
    this.trader?.dispose();
    this.game.audio.stopMapAmbience();
    this.game.audio.setOccluder(null);
    this.noiseHud?.dispose();
    this.markers?.dispose();
    this.fx.dispose();
    this.tfx?.dispose();
    this.ui.dispose();
    this.hud.dispose();
    this.chud.dispose();
    this.dbg?.dispose();
    this.menu?.dispose();
    this.game.input.lookScale = 1;
    this.game.input.ads = 0;
    this.mc?.dispose();
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

      const c: RaidContainer = { type, def, pos, loot, opened: false, search: new LootSearch(loot), group, marker };
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
          if (c.dimmed) this.dimGroup(g);
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
      helmet: e.helmetId ? { id: e.helmetId, dur: e.helmetDur } : null, mods: e.mods,
    }, this.era);
    const group = new THREE.Group();
    group.position.copy(e.pos);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: MARKER_COLOR.corpse }));
    marker.position.y = 1.2;
    group.add(marker);
    this.scene.add(group);
    const def: ContainerLootDef = { ...table, name: `${e.displayName}的屍體` };
    const c: RaidContainer = { type: 'corpse', def, pos: e.pos.clone(), loot, opened: false, search: new LootSearch(loot), group, marker, enemy: e };
    this.containers.push(c);
  }

  // ---------------------------------------------------------------- 陣營
  /** 這一場企業之間是否休戰（存檔的擲骰結果；測試可覆蓋） */
  get corpTruce(): boolean { return this.truceOverride ?? this.game.economy.corpTruce; }

  truceText(): string {
    return this.corpTruce ? '企業之間：本場休戰（穿越者彼此不開火）' : '企業之間：本場敵對（企業穿越者會互相開火）';
  }

  /** 玩家殺死了一個 NPC：依陣營結算聲望（友軍誤殺 = 結算時賠償） */
  private onPlayerKill(e: Enemy): void {
    const r = this.game.economy.recordKill(e.faction);
    if (!r.ok) return;
    this.lastKill = { faction: e.faction, changes: r.changes, ally: r.ally };
    if (r.ally) { this.ui.toast('誤傷友軍！結算時需要賠償', 'err'); return; }
    const parts = (Object.entries(r.changes) as [FactionId, number][]).map(([f, d]) => `${FACTIONS[f].short} ${d > 0 ? '+' : ''}${d}`);
    if (parts.length) this.ui.toast(`聲望：${parts.join('　')}`, 'info');
  }

  /**
   * 衝突事件：挑一組「對另一組敵對」的巡邏隊（優先警衛），派他們去對方的地盤巡查，提高交火機會。
   * 回傳是否有派出人（沒有合適的組合就什麼都不做）。
   */
  triggerConflict(): boolean {
    const groups = new Map<string, Enemy[]>();
    for (const e of this.enemies.list) {
      if (e.dead || !e.group) continue;
      (groups.get(e.group) ?? groups.set(e.group, []).get(e.group)!).push(e);
    }
    const hostile = (a: FactionId, b: FactionId) => areHostile(a, b, this.corpTruce);
    const pairs: { from: Enemy[]; to: Enemy[] }[] = [];
    for (const a of groups.values()) {
      if (a.every((e) => e.brain.engaged)) continue;
      for (const b of groups.values()) {
        if (a === b || !hostile(a[0].faction, b[0].faction)) continue;
        const d = a[0].pos.distanceTo(b[0].pos);
        if (d < 18) continue;
        pairs.push({ from: a, to: b });
      }
    }
    if (pairs.length === 0) return false;
    // 警衛優先（官方巡邏）
    const guards = pairs.filter((p) => p.from[0].faction === 'guard');
    const pool = guards.length ? guards : pairs;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const target = pick.to[Math.floor(Math.random() * pick.to.length)];
    const sent = pick.from.filter((e) => !e.brain.engaged);
    for (const e of sent) e.dispatch(target.pos);
    this.lastConflict = { from: pick.from[0].faction, to: pick.to[0].faction, ids: sent.map((e) => e.id), point: target.pos.clone() };
    return true;
  }

  // ---------------------------------------------------------------- 感知用的環境查詢
  private lightAt(p: THREE.Vector3): number {
    const q = this.tmp.set(p.x, p.y + 0.9, p.z);
    if (this.map.lightAt) return this.map.lightAt(q);
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
  /** 測試掛鉤：強制讓玩家挨一發爆頭（weaponId 決定武器類別） */
  debugHeadshot(weaponId: string, killer = '測試敵人'): number {
    const st = WEAPON_STATS[weaponId];
    return this.health.hit(st.damage, 'head', undefined, killer, st.weaponClass);
  }
  /** 測試掛鉤：在玩家前方 dist 公尺生成敵人（面向玩家）；helmet 見 EnemyManager.debugSpawn */
  debugSpawnEnemy(kind: 'guard' | 'thug' | 'rival_agent', dist: number, helmet?: { id: string; dur: number } | null, faction?: FactionId): Promise<Enemy> {
    const p = this.player.position;
    const yaw = this.player.facingYaw;
    const pos = new THREE.Vector3(p.x - Math.sin(yaw) * dist, p.y, p.z - Math.cos(yaw) * dist);
    return this.enemies.debugSpawn(kind, pos, this.scene, helmet, faction);
  }

  end(outcome: 'extract' | 'death', killedBy?: string, headshot = false): void {
    if (this.ended || !this.ready) return;
    this.weapons.flush();
    this.health.flush();
    const r = this.game.economy.resolveRaid(outcome);
    if (!r.ok) return;
    this.ended = true;
    this.opening = null;
    this.activeLoot = null;
    this.hud.setPrompt(null);
    this.hud.setProgress(null);
    this.chud.setVisible(false);
    this.markers?.setVisible(false);
    this.game.input.lookScale = 1;
    this.game.input.ads = 0;
    this.game.bus.emit('raidEnded', { outcome });
    this.ui.open(new ResultPanel(this.ui, r.result, () => {
      this.game.economy.acknowledgeResult();
      this.ui.close(true, true);
      this.game.setScene(this.game.scenes.hub());
    }, { killedBy, headshot }));
    this.game.audio.playUi(outcome === 'extract' ? 'confirm' : 'error');
  }

  private openPanel(p: Panel): void {
    this.weapons.flush();
    this.ui.open(p);
  }

  openTrader(): void {
    if (!this.trader || this.ui.isOpen) return;
    this.openPanel(new TraderPanel(this.ui, this.era));
  }

  /** 打開搜刮面板：揭露進度保留在容器上，從下一件繼續 */
  private openContainer(c: RaidContainer): void {
    c.opened = true;
    const panel = new LootPanel(this.ui, c.def, c.loot, c.search, () => {
      if (this.activeLoot?.panel === panel) this.activeLoot = null;
      this.refreshMarker(c);
    });
    this.activeLoot = { c, panel };
    this.refreshMarker(c);
    this.openPanel(panel);
  }

  /** 互動（點一下、按一下 E 或點提示）：已搜空 → 提示；打開過 → 直接開面板；第一次 → 開箱動作 */
  private interactContainer(c: RaidContainer): void {
    if (this.opening || this.ui.isOpen || this.ended) return;
    if (c.search.exhausted) { this.ui.toast(`${c.def.name}已搜空`, 'info'); return; }
    if (c.opened) { this.openContainer(c); return; }
    this.opening = { c, t: 0 };
  }

  private refreshMarker(c: RaidContainer): void {
    const empty = c.search.exhausted;
    c.marker.visible = !empty;
    (c.marker.material as THREE.MeshBasicMaterial).color.set(c.opened ? '#8892a0' : MARKER_COLOR[c.type]);
    if (empty && !c.dimmed) {
      c.dimmed = true;
      this.dimGroup(c.group);
    }
  }

  /** 搜空的容器變暗、降低飽和度（複製材質，不影響共用的模型材質） */
  private dimGroup(g: THREE.Object3D): void {
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh === (this.containers.find((c) => c.group === g)?.marker)) return;
      const dim = (m: THREE.Material): THREE.Material => {
        const mat = m.clone() as THREE.MeshStandardMaterial;
        if (mat.color) {
          const hsl = { h: 0, s: 0, l: 0 };
          mat.color.getHSL(hsl);
          mat.color.setHSL(hsl.h, hsl.s * 0.25, hsl.l * 0.4);
        }
        return mat;
      };
      if (mesh.userData.keepMaterial) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(dim) : dim(mesh.material);
    });
  }

  /** 玩家的聲音事件（手部高度）；持續型（搜刮、撤離）由 beat 每 SUSTAINED_BEAT 秒送一次心跳 */
  private emitNoise(kind: 'search' | 'evac', loudness = 1): void {
    const p = this.player.position;
    this.game.bus.emit('noise', { kind, position: { x: p.x, y: p.y + 1.0, z: p.z }, source: 'player', ...(loudness !== 1 ? { loudness } : {}) });
  }

  private beat(id: string, kind: 'search' | 'evac'): void {
    const now = this.t;
    if (now - (this.beatT[id] ?? -99) < SUSTAINED_BEAT) return;
    this.beatT[id] = now;
    // 安靜搜刮：搜刮聲音距離減半（倍率定義在 data/noise.ts）
    this.emitNoise(kind, kind === 'search' ? searchLoudness(this.game.controls.get().quietSearch) : 1);
  }

  /** 揭露中的容器：推進進度、持續發出搜刮聲音、處理新揭露的物品（自動拾取） */
  private tickLoot(dt: number): void {
    const a = this.activeLoot;
    if (!a) return;
    const c = a.c;
    if (!this.ui.isOpen) { this.activeLoot = null; return; }
    if (c.search.finished) return;
    const cfg = this.game.controls.get();
    const revealed = c.search.advance(dt, { scale: this.game.economy.searchScale(), quiet: cfg.quietSearch });
    if (!c.search.finished) this.beat('search', 'search');
    if (revealed.length === 0) return;
    for (const i of revealed) {
      const item = c.loot[i];
      if (item) {
        const rar = getItem(item.id)?.rarity ?? 'common';
        this.game.audio.play({ key: 'sfx.loot_reveal', volume: 0.45, rate: REVEAL_PITCH[rar], group: 'ui', tag: 'loot reveal' });
      }
      const r = autoPickupFromLoot(this.game.economy, c.loot, i, { ammo: cfg.autoPickupAmmo, chronite: cfg.autoPickupChronite });
      if (r?.taken) {
        this.game.bus.emit('itemPicked', { itemId: r.id, qty: r.taken });
        this.ui.noise('item_pickup');
        this.ui.toast(`自動拾取：${r.name} ×${r.taken}`, 'info');
      }
      if (r?.blocked) this.ui.toast('背包已滿', 'err');
    }
    a.panel.onRevealed(revealed);
    if (c.search.finished) this.refreshMarker(c);
  }

  private onHurt(amount: number, from?: THREE.Vector3): void {
    if (this.activeLoot) { this.ui.close(); this.ui.toast('搜刮被打斷', 'err'); }
    this.opening = null;
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
    pt.crouchRunning = s.crouchRunning && s.moving;
    pt.healing = this.health.healing;
    pt.reloading = !!this.weapons.current?.reloading;
    pt.flashlight = this.weapons.tacticalActive === 'flashlight';
    pt.laser = this.weapons.tacticalActive === 'laser';
    pt.alive = !this.health.dead;
    this.enemies.update(dt);
    this.conflictIn -= dt;
    if (this.conflictIn <= 0 && this.conflictIn + dt > 0) this.triggerConflict();

    // 穩定度倒數
    const rem = this.remaining;
    const sec = Math.ceil(rem);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      this.game.bus.emit('stabilityChanged', { remaining: Math.max(0, rem), total: this.duration });
    }
    if (rem <= 0) { this.end('death'); return; }
    if (rem <= 60 && !this.warned) { this.warned = true; this.hud.flash('時空穩定度不足！盡快撤離'); }

    this.tickLoot(dt);
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
      this.beat('evac', 'evac');
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

    // 時代商人：靠近按 E 開啟交易介面（優先於容器）
    const tp = this.map.trader?.position;
    this.nearTrader = !!(this.trader && tp && Math.hypot(pos.x - tp.x, pos.z - tp.z) <= TRADER_RANGE && Math.abs(pos.y - tp.y) < 2.2);
    if (this.nearTrader && inp.consumePress('interact')) { this.openTrader(); return; }

    // 點一下互動就開始（按住也可以，只看按下的那一刻）；開箱動作中移動離開範圍或開槍會中斷
    if (this.opening) {
      const o = this.opening;
      if (near !== o.c || inp.isDown('fire')) this.opening = null;
      else {
        this.beat('search', 'search');
        o.t += dt;
        if (o.t >= CONTAINER_OPEN_SECONDS) {
          this.opening = null;
          this.game.audio.play({ key: 'sfx.container_open', volume: 0.7, tag: 'container open' });
          this.emitNoise('search', searchLoudness(this.game.controls.get().quietSearch));
          this.openContainer(o.c);
        }
      }
    } else if (near && inp.consumePress('interact')) {
      this.interactContainer(near);
    }
    if (inp.consumePress('inventory')) this.openPanel(new TransferPanel(this.ui, 'body'));
  }

  private promptText(): string | null {
    if (this.nearTrader) return this.game.isTouch ? '點「互動」：與時代商行交易' : '按 E 與時代商行交易';
    const c = this.nearC;
    if (!c) return null;
    const touch = this.game.isTouch;
    if (c.search.exhausted) return `${c.def.name}（已搜空）`;
    const verb = !c.opened ? '搜刮' : c.search.finished ? '打開' : '繼續搜刮';
    return touch ? `點「互動」${verb}：${c.def.name}` : `按 E ${verb}：${c.def.name}`;
  }

  render(alpha: number, frameDt: number): void {
    if (!this.ready) return;
    const game = this.game;
    this.t += frameDt;

    // 觸控輔助瞄準：準心掃過敵人時降低轉視角的靈敏度（減速，不鎖定）
    this.weapons.assistScale = game.isTouch && this.onTarget ? ASSIST_SCALE[game.controls.get().assist] : 1;
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
      this.updateAimTarget(frameDt);
      this.tfx?.update(this.weapons.tacticalActive, this.vm, this.trace, this.weapons.adsAmount);
    }
    this.fx.update(frameDt);
    this.noiseHud?.update(frameDt);
    this.activeLoot?.panel.tick(frameDt);
    this.projScreen.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    this.enemies.updateAnim(frameDt, this.frustum);
    if (!this.ended) this.markers?.update(frameDt, this.enemies.list, this.camera, game.width, game.height, (a, b) => this.enemies.mover.los(a, b));
    game.audio.updateListener(this.camera);
    game.audio.updateMapAmbience(frameDt);
    this.trader?.update(frameDt, true);
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
      this.hud.setPrompt(this.ui.isOpen ? null : text, this.nearTrader ? () => this.openTrader() : c && !c.search.exhausted ? () => this.interactContainer(c) : undefined);
      if (this.ui.isOpen) this.hud.setProgress(null);
      else if (this.evacProgress > 0.001) this.hud.setProgress(`撤離中… ${(EVAC_SECONDS * (1 - this.evacProgress)).toFixed(1)}s`, this.evacProgress);
      else if (this.opening) this.hud.setProgress('開啟中…', this.opening.t / CONTAINER_OPEN_SECONDS);
      else this.hud.setProgress(null);

      const wh = this.weapons.hud();
      const tac = this.weapons.tacticalActive;
      this.chud.setWeapon(wh.name, wh.mag, wh.magMax, wh.reserve, wh.reloading, wh.reloadProgress, wh.slotLabel, tac === 'flashlight' ? '手電筒' : tac === 'laser' ? '雷射' : '');
      const sg = this.weapons.sight;
      this.chud.setAds(this.ui.isOpen ? 0 : this.weapons.adsAmount, sg.kind === 'scope' ? sg.zoom : 0);
      this.chud.setHealth(this.health.hp, this.health.max, this.health.armorDur, this.health.armorMax);
      const hid = this.health.helmetId;
      this.chud.setHelmet(this.health.helmetDur, this.health.helmetMax, hid ? HELMET_STATS[hid].level : 0, this.health.helmetEffLevel);
      this.chud.setCrosshair(Math.max(3, this.weapons.crosshairGapPx(game.height)) + 2, this.onTarget, !!this.weapons.current && !this.ui.isOpen);
      this.chud.setHeal(this.health.healing ? this.health.healProgress : null);
      this.chud.update(frameDt);
    }
    const s = this.player.state;
    const pos = this.player.position;
    this.dbg?.update(frameDt, {
      surface: this.player.surface,
      zone: this.zoneType,
      moveState: !s.grounded ? 'air' : s.sprinting && s.moving ? 'sprint' : s.crouchRunning && s.moving ? 'crouch run' : s.crouching && s.moving ? 'crouch (silent)' : s.moving ? 'walk' : 'idle',
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
  private updateAimTarget(dt: number): void {
    this.camera.getWorldPosition(this.aimOrigin);
    this.camera.getWorldDirection(this.aimDir);
    const h = this.enemies.pick(this.aimOrigin, this.aimDir, 70);
    this.onTarget = !!h && this.enemies.mover.los(this.aimOrigin, h.point);
    // 準心停在中立 / 友好的 NPC 身上（15m 內、手上有武器）：累積瞄準挑釁
    const armed = !!this.weapons.current && !this.health.dead && !this.ui.isOpen;
    this.enemies.updateAim(dt, armed && this.onTarget && h ? h.e : null, h ? h.distance : 99);
  }
}

const DOWN = new THREE.Vector3(0, -1, 0);
