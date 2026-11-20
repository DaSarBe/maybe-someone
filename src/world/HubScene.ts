import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import type { Game, Scene } from '../core/Game';
import { PlayerController } from '../player/PlayerController';
import { MobileControls } from '../player/MobileControls';
import { DebugHud } from '../ui/DebugHud';
import { GameHud } from '../ui/GameHud';
import { resetSaveButton } from '../ui/MenuButtons';
import { PauseMenu } from '../ui/PauseMenu';
import { Ui } from '../ui/Ui';
import { ResultPanel } from '../ui/panels/ResultPanel';
import { BenchPanel } from '../ui/panels/BenchPanel';
import { ShopPanel } from '../ui/panels/ShopPanel';
import { TimeMachinePanel } from '../ui/panels/TimeMachinePanel';
import { TransferPanel } from '../ui/panels/TransferPanel';
import { UpgradePanel } from '../ui/panels/UpgradePanel';
import { findReverbZone, type ReverbZone } from './Surface';
import type { GameMap } from './GameMap';
import { HUB_SIZE, HUB_STATIONS, buildHub, makeLabel, type Station, type StationId } from './maps/hub';
import { fitModel, loadModel } from './Models';

const LABEL_POS: Record<StationId, [number, number, number]> = {
  stash: [-8.6, 3.0, 0.2],
  shop: [8.4, 2.9, -3.9],
  upgrade: [8.4, 2.8, 3.7],
  safe: [-8.5, 2.1, -5.4],
  timemachine: [0, 3.95, -6.6],
  bench: [-3.4, 2.75, 7.2],
};

/** 未來基地：可走動的 3D 房間，靠近互動站按 E 開啟各種介面 */
export class HubScene implements Scene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 80);
  player!: PlayerController;
  map!: GameMap;
  ui!: Ui;
  private game!: Game;
  private hud!: GameHud;
  private dbg: DebugHud | null = null;
  private menu: PauseMenu | null = null;
  private mc: MobileControls | null = null;
  private zone: ReverbZone | null = null;
  private near: Station | null = null;
  private tmp = new THREE.Vector3();
  private t = 0;
  private spinners: THREE.Object3D[] = [];
  private portalDisc: THREE.Mesh | null = null;
  private unsubs: (() => void)[] = [];
  private disposed = false;

  constructor(private opts: { showHud?: boolean } = {}) {}

  enter(game: Game): void {
    this.game = game;
    const touch = game.isTouch;
    this.buildLights();

    this.map = buildHub();
    this.scene.add(this.map.root);
    this.buildDecor();

    const octree = new Octree();
    octree.fromGraphNode(this.map.collision);
    this.scene.add(this.camera);
    this.player = new PlayerController(game.input, game.bus, this.camera);
    this.player.setWorld(octree, this.map.surfaceMeshes);
    this.player.setWeightProvider(() => game.economy.getWeightRatio());
    this.player.teleport(this.map.spawn.position, this.map.spawn.yaw);

    this.ui = new Ui(game);
    this.hud = new GameHud(game.container, touch ? game.layout : null);
    this.hud.setCredits(game.economy.credits);
    this.unsubs.push(game.economy.subscribe(() => this.hud.setCredits(game.economy.credits)));
    if (this.opts.showHud !== false) this.dbg = new DebugHud(game.container, game.bus, touch);
    if (touch) this.mc = new MobileControls(game.container, game.input, game.layout, game.controls);
    this.menu = new PauseMenu(game.container, game.input, game.audio, {
      touch, debug: game.debug, game,
      hint: 'WASD 移動 ・ Shift 衝刺 ・ E 互動 ・ Tab 身上裝備 ・ Esc 暫停|左側搖桿移動 ・ 右側拖曳轉視角 ・ 靠近互動站按「互動」',
      isBlocked: () => this.ui.isOpen,
      extra: [
        { label: '灰盒測試場景（開發用）', onClick: () => game.setScene(game.scenes.greybox()) },
        resetSaveButton(game),
      ],
    });
    this.ui.onClosed = () => {
      game.input.requestLock();
      window.setTimeout(() => this.menu?.refreshLock(), 160);
    };

    game.audio.setZones(this.map.reverbZones);
    if (game.economy.profile.pendingResult) this.showResult();
  }

  exit(): void {
    this.disposed = true;
    this.unsubs.forEach((u) => u());
    this.ui.dispose();
    this.hud.dispose();
    this.dbg?.dispose();
    this.menu?.dispose();
    this.mc?.dispose();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- 建構
  private buildLights(): void {
    const s = this.scene;
    s.background = new THREE.Color('#0a1018');
    s.fog = new THREE.Fog('#0a1018', 22, 60);
    s.add(new THREE.HemisphereLight('#a9c2e6', '#3a4a60', 2.6));
    const dir = new THREE.DirectionalLight('#bcd8ff', 1.1);
    dir.position.set(3, 8, 5);
    s.add(dir);
    const pl = (color: string, intensity: number, x: number, y: number, z: number, dist = 13) => {
      const l = new THREE.PointLight(color, intensity, dist, 2);
      l.position.set(x, y, z);
      s.add(l);
    };
    pl('#5b7bff', 70, 0, 3.2, -5.2, 16);
    pl('#35e1ff', 40, -7, 3.6, 0.2, 15);
    pl('#ffb23a', 38, 7, 3.2, -3.9, 15);
    pl('#4ade80', 36, 7, 3.2, 3.7, 15);
    pl('#ff3dcb', 36, -7, 3.2, -5.4, 15);
    pl('#ffa04a', 34, -3.4, 3.3, 6.2, 14);
    pl('#ffd2a0', 18, -3.4, 1.6, 4.6, 7);
    pl('#dfe9ff', 40, 0, 4.0, 0, 20);
    pl('#35e1ff', 26, 0, 3.8, 5, 15);
  }

  private buildDecor(): void {
    // 站名標籤
    for (const st of HUB_STATIONS) {
      const label = makeLabel(st.label, st.color);
      label.position.set(...LABEL_POS[st.id]);
      this.scene.add(label);
    }
    // 時光機的傳送門
    const Z = HUB_SIZE.z;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.09, 12, 56), new THREE.MeshBasicMaterial({ color: '#8fa0ff' }));
    ring.position.set(0, 1.85, -Z + 1.0);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.04, 8, 48), new THREE.MeshBasicMaterial({ color: '#35e1ff' }));
    ring2.position.copy(ring.position);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 48),
      new THREE.MeshBasicMaterial({ color: '#6d7dff', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    disc.position.copy(ring.position);
    this.portalDisc = disc;
    this.spinners.push(ring2);
    this.scene.add(ring, ring2, disc);

    // GLB 模型：非同步載入，失敗就略過（場景用方塊已經能玩）
    const place = async (name: string, size: number, x: number, y: number, z: number, rotY = 0, by: 'height' | 'max' = 'height') => {
      const m = await loadModel(name);
      if (!m || this.disposed) return null;
      const g = fitModel(m, size, by);
      g.position.set(x, y, z);
      g.rotation.y = rotY;
      this.scene.add(g);
      return g;
    };
    void place('prop_generator', 1.0, 8.9, 0.95, 3.7, -Math.PI / 2);
    void place('prop_chest', 0.8, -8.7, 0.85, -5.4, Math.PI / 2);
    void place('prop_crate', 0.9, -8.9, 1.0, 7.1, 0.3);
    void place('prop_crate', 0.9, -8.9, 1.9, 7.0, -0.2);
    void place('prop_barrels', 1.1, 8.9, 1.0, 7.1, 0.5);
    void place('item_chronite', 0.9, 0, 0.5, -5.9).then((g) => { if (g) this.spinners.push(g); });
  }

  // ---------------------------------------------------------------- 互動站
  openStation(id: StationId): void {
    const { ui } = this;
    this.game.audio.unlock();
    switch (id) {
      case 'stash': ui.open(new TransferPanel(ui, 'stash')); break;
      case 'safe': ui.open(new TransferPanel(ui, 'safe')); break;
      case 'shop': ui.open(new ShopPanel(ui)); break;
      case 'upgrade': ui.open(new UpgradePanel(ui)); break;
      case 'bench': ui.open(new BenchPanel(ui)); break;
      case 'timemachine': ui.open(new TimeMachinePanel(ui, (era) => this.depart(era))); break;
    }
  }

  private depart(eraId: string): void {
    const r = this.game.economy.startRaid(eraId);
    if (!r.ok) { this.ui.toast(r.reason, 'err'); return; }
    this.ui.close(true);
    this.game.audio.playUi('confirm');
    this.game.setScene(this.game.scenes.raid());
  }

  private showResult(): void {
    const res = this.game.economy.profile.pendingResult;
    if (!res) return;
    this.ui.open(new ResultPanel(this.ui, res, () => {
      this.game.economy.acknowledgeResult();
      this.ui.close(false, true);
    }));
  }

  // ---------------------------------------------------------------- 更新
  update(dt: number): void {
    this.player.update(dt);
    if (this.player.position.y < -10) this.player.teleport(this.map.spawn.position, this.map.spawn.yaw);
    const p = this.tmp.copy(this.player.position); p.y += 0.9;
    const zone = findReverbZone(this.map.reverbZones, p);
    if (zone !== this.zone) {
      this.zone = zone;
      this.game.bus.emit('reverbZoneChanged', { type: zone?.type ?? 'outdoor', zone });
    }
  }

  render(alpha: number, frameDt: number): void {
    this.t += frameDt;
    this.player.updateCamera(alpha, frameDt);
    this.game.audio.updateListener(this.camera);

    for (const s of this.spinners) { s.rotation.y += frameDt * 1.2; }
    if (this.portalDisc) (this.portalDisc.material as THREE.MeshBasicMaterial).opacity = 0.26 + Math.sin(this.t * 2.2) * 0.08;

    // 找最近的互動站
    const pos = this.player.position;
    let best: Station | null = null;
    let bestD = Infinity;
    for (const st of HUB_STATIONS) {
      const d = Math.hypot(pos.x - st.pos.x, pos.z - st.pos.z);
      if (d <= st.radius && d < bestD) { best = st; bestD = d; }
    }
    if (best !== this.near) {
      this.near = best;
      if (best) {
        const txt = this.game.isTouch ? `點「互動」：${best.label}` : `按 E 互動：${best.label}`;
        const id = best.id;
        this.hud.setPrompt(txt, () => this.openStation(id));
      } else this.hud.setPrompt(null);
    }
    const inp = this.game.input;
    if (!this.ui.isOpen) {
      if (inp.consumePress('interact') && this.near) this.openStation(this.near.id);
      else if (inp.consumePress('inventory')) this.ui.open(new TransferPanel(this.ui, 'body'));
    }

    const s = this.player.state;
    this.dbg?.update(frameDt, {
      surface: this.player.surface,
      zone: 'hub',
      moveState: !s.grounded ? 'air' : s.sprinting && s.moving ? 'sprint' : s.moving ? 'walk' : 'idle',
      position: `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}  w=${this.player.weightRatio.toFixed(2)}`,
      sound: this.game.audio.lastSound,
      audioState: `${this.game.audio.state} voices=${this.game.audio.voiceCount}`,
    });
    this.game.renderer.render(this.scene, this.camera);
  }
}
