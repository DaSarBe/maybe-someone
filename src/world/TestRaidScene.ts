import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import type { Game, Scene } from '../core/Game';
import { DEFAULT_ERA, getEra } from '../data/eras';
import { LOOT_TABLES, type ContainerLootDef, type ContainerType } from '../data/lootTables';
import type { Slot } from '../items/Inventory';
import { rollContainer } from '../items/LootTable';
import { MobileControls } from '../player/MobileControls';
import { PlayerController } from '../player/PlayerController';
import { DebugHud } from '../ui/DebugHud';
import { GameHud } from '../ui/GameHud';
import { resetSaveButton } from '../ui/MenuButtons';
import { PauseMenu } from '../ui/PauseMenu';
import { Ui } from '../ui/Ui';
import { LootPanel } from '../ui/panels/LootPanel';
import { ResultPanel } from '../ui/panels/ResultPanel';
import { TransferPanel } from '../ui/panels/TransferPanel';
import { setupLighting } from './Lighting';
import { buildTestGreybox } from './maps/testGreybox';
import { makeLabel } from './maps/hub';
import { fitModel, loadModel } from './Models';
import { findReverbZone, type ReverbType, type ReverbZone } from './Surface';
import type { GameMap } from './GameMap';

/** 搜刮容器候選位置（灰盒地圖座標）。每次 Raid 隨機挑 8～12 個 */
const SPOTS: { x: number; z: number; y?: number; types: ContainerType[] }[] = [
  { x: -30, z: -14, types: ['crate', 'toolbox'] }, { x: -20, z: -3, types: ['toolbox', 'crate'] },
  { x: -8, z: 6, types: ['crate'] }, { x: 1, z: -3, types: ['toolbox', 'crate'] },
  { x: 12, z: -14, types: ['crate', 'corpse'] }, { x: 28, z: 14, types: ['crate', 'toolbox'] },
  { x: 34, z: -6, types: ['corpse', 'crate'] }, { x: 40, z: 22, types: ['corpse'] },
  { x: -38, z: 26, types: ['crate', 'toolbox'] }, { x: -20, z: 26, types: ['toolbox', 'crate'] },
  { x: 2, z: 26, types: ['crate', 'corpse'] }, { x: 18, z: 24, types: ['corpse', 'crate'] },
  { x: -24, z: 18.5, types: ['toolbox', 'crate'] }, { x: -10, z: 18.5, types: ['corpse', 'crate'] },
  { x: -36, z: -24, types: ['crate'] }, { x: 20, z: -24, types: ['crate', 'toolbox'] }, { x: 36, z: -24, types: ['toolbox', 'corpse'] },
  { x: 13, z: 2, types: ['cabinet'] }, { x: 24, z: 2, types: ['cabinet'] }, { x: 14, z: 9, types: ['cabinet', 'toolbox'] },
  { x: 20, z: 9.2, types: ['cabinet'] }, { x: 24.5, z: 8.2, types: ['safe'] },
  { x: -33, z: -8, y: 2.0, types: ['safe', 'cabinet'] }, { x: -18.5, z: -8, y: 1.6, types: ['cabinet', 'safe'] },
];

const EVAC_POINTS = [new THREE.Vector3(38, 0, 26), new THREE.Vector3(-36, 0, 2)];
const EVAC_RADIUS = 2.6;
const EVAC_SECONDS = 5;
const INTERACT_RANGE = 2.3;
/** 測試用 Raid 的基礎時間在 upgrades.stabilizer.base（300 秒 = 5 分鐘） */
const MARKER_COLOR: Record<ContainerType, string> = {
  crate: '#ffcf5a', toolbox: '#ff8a3d', cabinet: '#7cc4ff', safe: '#ff3dcb', corpse: '#ff5a5a',
};

interface RaidContainer {
  type: ContainerType;
  def: ContainerLootDef;
  pos: THREE.Vector3;
  loot: Slot[];
  /** 已經搜索完成（內容可見） */
  searched: boolean;
  group: THREE.Group;
  marker: THREE.Mesh;
}

/** M3 測試用 Raid：灰盒地圖 + 隨機搜刮容器 + 穩定度倒數 + 撤離點。M4 會換成正式地圖與敵人 */
export class TestRaidScene implements Scene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);
  player!: PlayerController;
  map!: GameMap;
  ui!: Ui;
  containers: RaidContainer[] = [];
  evac: THREE.Group[] = [];
  ended = false;

  private game!: Game;
  private hud!: GameHud;
  private dbg: DebugHud | null = null;
  private menu: PauseMenu | null = null;
  private zone: ReverbZone | null = null;
  private zoneType: ReverbType = 'outdoor';
  private tmp = new THREE.Vector3();
  private era = DEFAULT_ERA;
  private duration = 300;
  private startedAt = 0;
  /** 測試用：把時間往前撥 */
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
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'KeyK' && !e.repeat && !this.ui.isOpen) this.end('death');
  };

  constructor(private opts: { showHud?: boolean } = {}) {}

  enter(game: Game): void {
    this.game = game;
    const eco = game.economy;
    // 直接載入 ?scene=raid 時還沒出發過：自動開始一場
    if (!eco.inRaid) eco.startRaid(DEFAULT_ERA);
    const raid = eco.profile.raid;
    if (raid) { this.era = raid.era; this.duration = raid.duration; this.startedAt = raid.startedAt; }
    const touch = game.isTouch;

    setupLighting(this.scene, { shadowMapSize: touch ? 1024 : 2048, extent: 62 });
    this.map = buildTestGreybox();
    this.scene.add(this.map.root);
    const octree = new Octree();
    octree.fromGraphNode(this.map.collision);

    this.scene.add(this.camera);
    this.player = new PlayerController(game.input, game.bus, this.camera);
    this.player.setWorld(octree, this.map.surfaceMeshes);
    this.player.setWeightProvider(() => eco.getWeightRatio());
    this.player.teleport(this.map.spawn.position, this.map.spawn.yaw);

    this.ui = new Ui(game);
    this.hud = new GameHud(game.container);
    this.hud.showCredits(false);
    if (this.opts.showHud !== false) this.dbg = new DebugHud(game.container, game.bus, touch);
    if (touch) new MobileControls(game.container, game.input);
    this.menu = new PauseMenu(game.container, game.input, game.audio, {
      touch, debug: game.debug,
      hint: 'WASD 移動 ・ 按住 E 搜索容器 ・ Tab 背包 ・ K 模擬死亡（測試）・ Esc 暫停|左側搖桿移動 ・ 按住「互動」搜索 ・ 「背包」開啟背包',
      isBlocked: () => this.ui.isOpen,
      extra: [
        { label: '模擬死亡（測試）', onClick: () => this.end('death'), confirm: '再按一次確認：你會失去所有物品' },
        resetSaveButton(game),
      ],
    });
    this.ui.onClosed = () => {
      this.containers.forEach((c) => this.refreshMarker(c));
      game.input.requestLock();
      window.setTimeout(() => this.menu?.refreshLock(), 160);
    };
    window.addEventListener('keydown', this.onKey);

    game.audio.setZones(this.map.reverbZones);
    this.spawnContainers();
    this.spawnEvac();
    this.hud.flash(getEra(this.era)?.name ?? '時空 Raid');
  }

  exit(): void {
    this.disposed = true;
    window.removeEventListener('keydown', this.onKey);
    this.ui.dispose();
    this.hud.dispose();
    this.dbg?.dispose();
    this.menu?.dispose();
    this.game.container.querySelector('.mc')?.remove();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- 場景物件
  private spawnContainers(): void {
    const table = LOOT_TABLES[this.era]?.containers;
    if (!table) return;
    const spots = [...SPOTS].sort(() => Math.random() - 0.5);
    const n = 8 + Math.floor(Math.random() * 5); // 8..12
    const picked = spots.slice(0, n);
    for (const spot of picked) {
      const type = spot.types[Math.floor(Math.random() * spot.types.length)];
      const def = table[type];
      const pos = new THREE.Vector3(spot.x, spot.y ?? 0, spot.z);
      const loot: Slot[] = rollContainer(this.era, type);
      const group = new THREE.Group();
      group.position.copy(pos);
      group.rotation.y = Math.random() * Math.PI * 2;
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
      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.16),
        new THREE.MeshBasicMaterial({ color: MARKER_COLOR[type] }),
      );
      marker.position.y = sy + 0.75;
      group.add(marker);
      this.scene.add(group);

      const c: RaidContainer = { type, def, pos, loot, searched: false, group, marker };
      this.containers.push(c);

      if (def.look.model !== 'box') {
        void loadModel(def.look.model).then((m) => {
          if (!m || this.disposed) return;
          const g = fitModel(m, Math.max(sx, sz) * (def.look.model === 'prop_chest' ? 1.0 : 1.0), 'max');
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

  private spawnEvac(): void {
    for (const p of EVAC_POINTS) {
      const g = new THREE.Group();
      g.position.copy(p);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(EVAC_RADIUS - 0.25, EVAC_RADIUS, 48),
        new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(EVAC_RADIUS - 0.25, 48),
        new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.05;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(EVAC_RADIUS - 0.3, EVAC_RADIUS - 0.3, 14, 32, 1, true),
        new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      beam.position.y = 7;
      const label = makeLabel('撤離點', '#4ade80');
      label.position.y = 3.2;
      g.add(ring, disc, beam, label);
      this.scene.add(g);
      this.evac.push(g);
    }
  }

  // ---------------------------------------------------------------- 流程
  /** 剩餘秒數（以牆上時鐘計算，不受畫面暫停影響） */
  get remaining(): number {
    return this.duration - (Date.now() + this.timeOffset - this.startedAt) / 1000;
  }

  /** 測試掛鉤：把時間往前撥 sec 秒 */
  debugAdvance(sec: number): void { this.timeOffset += sec * 1000; }
  debugKill(): void { this.end('death'); }

  end(outcome: 'extract' | 'death'): void {
    if (this.ended) return;
    const r = this.game.economy.resolveRaid(outcome);
    if (!r.ok) return;
    this.ended = true;
    this.searching = null;
    this.hud.setPrompt(null);
    this.hud.setProgress(null);
    this.game.bus.emit('raidEnded', { outcome });
    this.ui.open(new ResultPanel(this.ui, r.result, () => {
      this.game.economy.acknowledgeResult();
      this.ui.close(true, true);
      this.game.setScene(this.game.scenes.hub());
    }));
    this.game.audio.playUi(outcome === 'extract' ? 'confirm' : 'error');
  }

  private openContainer(c: RaidContainer): void {
    this.ui.open(new LootPanel(this.ui, c.def, c.loot));
  }

  private refreshMarker(c: RaidContainer): void {
    c.marker.visible = !c.searched || c.loot.some((s) => !!s);
    (c.marker.material as THREE.MeshBasicMaterial).color.set(c.searched ? '#8892a0' : MARKER_COLOR[c.type]);
  }

  update(dt: number): void {
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
      if (Math.hypot(pos.x - e.position.x, pos.z - e.position.z) <= EVAC_RADIUS && Math.abs(pos.y - e.position.y) < 2.5) inEvac = true;
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
    if (inp.consumePress('inventory')) this.ui.open(new TransferPanel(this.ui, 'body'));
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
    this.t += frameDt;
    this.player.updateCamera(alpha, frameDt);
    this.game.audio.updateListener(this.camera);
    for (const c of this.containers) {
      if (c.marker.visible) {
        c.marker.rotation.y += frameDt * 2;
        c.marker.position.y = c.def.look.size[1] + 0.75 + Math.sin(this.t * 2 + c.pos.x) * 0.06;
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
    }
    const s = this.player.state;
    const pos = this.player.position;
    this.dbg?.update(frameDt, {
      surface: this.player.surface,
      zone: this.zoneType,
      moveState: !s.grounded ? 'air' : s.sprinting && s.moving ? 'sprint' : s.moving ? 'walk' : 'idle',
      position: `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}  w=${this.player.weightRatio.toFixed(2)}`,
      sound: this.game.audio.lastSound,
      audioState: `${this.game.audio.state} voices=${this.game.audio.voiceCount}`,
    });
    this.game.renderer.render(this.scene, this.camera);
  }
}
