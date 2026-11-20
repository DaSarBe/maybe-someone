import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import type { Game, Scene } from '../../core/Game';
import { MobileControls } from '../../player/MobileControls';
import { PlayerController } from '../../player/PlayerController';
import { DebugHud } from '../../ui/DebugHud';
import { PauseMenu } from '../../ui/PauseMenu';
import type { RaidMap } from '../RaidMap';
import { findReverbZone, type ReverbType, type ReverbZone } from '../Surface';
import { applyHarborAtmosphere, loadHarbor1990 } from './harbor1990';

const ZONE_COLOR: Record<ReverbType, number> = { outdoor: 0x66aaff, indoor_small: 0xffaa33, indoor_large: 0xff66cc, tunnel: 0x66ffcc };
const ENEMY_COLOR = { guard: 0x4aa3ff, thug: 0xff9a2e, rival_agent: 0xff3b3b } as const;

/**
 * 港口地圖預覽場景（?scene=harbor）：驗收地圖用。
 *  - 走路模式：WASD / 空白鍵 / C，和 Raid 相同的玩家控制器
 *  - F：切換飛行模式（空白鍵上升、C 下降、Shift 加速）
 *  - G：切換除錯標記（導航圖、搜刮點、敵人與巡邏、撤離點、抵達點、商人、回音區）
 *  - 1～6：樓層切換的俯視模式（只顯示某個高度範圍，方便檢查各樓層；0 或再按同一個數字回到一般視角）
 *      1 = B2（停車場最下層）、2 = B1 與隧道、3 = 地面層、4 = 二樓高度、5 = 三樓高度、6 = 四樓以上與頂樓
 *  - ?fly=1 以飛行模式開始；?markers=0 預設隱藏標記；?floor=3 直接進入某個樓層俯視
 */

/** 樓層俯視：各按鍵對應的高度範圍 [最低, 最高]（超出的幾何會被全域裁切平面切掉，除錯標記也一起被切） */
export const FLOOR_BANDS: Record<number, { name: string; y0: number; y1: number }> = {
  1: { name: 'B2 停車場', y0: -8.5, y1: -3.95 },
  2: { name: 'B1 停車場・隧道', y0: -4.0, y1: -0.9 },
  3: { name: '地面層', y0: -1.0, y1: 2.6 },
  4: { name: '2F 高度（大樓 2F・倉庫二樓・船甲板）', y0: 3.0, y1: 6.9 },
  5: { name: '3F 高度（大樓 3F・倉庫三樓）', y0: 6.9, y1: 10.9 },
  6: { name: '4F 以上與頂樓', y0: 10.9, y1: 30 },
};

export class HarborPreviewScene implements Scene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 220);
  player: PlayerController | null = null;
  map: RaidMap | null = null;
  octree: Octree | null = null;
  loadMs = 0;
  /** 最近一幀的繪製統計（draw calls / 三角形） */
  stats = { calls: 0, triangles: 0, geometries: 0, textures: 0 };
  fly = false;
  readonly markers = new THREE.Group();

  private game!: Game;
  private hud: DebugHud | null = null;
  private menu: PauseMenu | null = null;
  private mc: MobileControls | null = null;
  private zone: ReverbZone | null = null;
  private zoneType: ReverbType = 'outdoor';
  private tmp = new THREE.Vector3();
  private flyYaw = 0;
  private flyPitch = -0.4;
  private elapsed = 0;
  private fog = true;
  private tmpMove = new THREE.Vector2();
  private tmpLook = new THREE.Vector2();
  /** 目前的樓層俯視模式（0 = 一般） */
  floor = 0;
  private onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === 'KeyF') this.setFly(!this.fly);
    else if (e.code === 'KeyG') this.markers.visible = !this.markers.visible;
    else if (/^Digit[0-6]$/.test(e.code)) { const n = Number(e.code.slice(5)); this.setFloor(n === this.floor ? 0 : n); }
  };

  constructor(private opts: { showHud?: boolean } = {}) {}

  enter(game: Game): void {
    this.game = game;
    const params = new URLSearchParams(location.search);
    const touch = game.isTouch;
    this.scene.add(this.camera);
    applyHarborAtmosphere(this.scene);
    if (this.opts.showHud !== false) this.hud = new DebugHud(game.container, game.bus, touch);
    if (touch) this.mc = new MobileControls(game.container, game.input, game.layout, game.controls);
    this.menu = new PauseMenu(game.container, game.input, game.audio, {
      touch, debug: game.debug, game,
      hint: 'WASD 移動 ・ Shift 衝刺 ・ C 蹲下 ・ Space 跳躍 ・ F 飛行 ・ G 除錯標記 ・ 1～6 樓層俯視|左側搖桿移動 ・ 右側拖曳轉視角',
    });
    window.addEventListener('keydown', this.onKey);

    const t0 = performance.now();
    void loadHarbor1990().then((map) => {
      this.map = map;
      this.loadMs = performance.now() - t0;
      this.scene.add(map.root);
      // ?shadows=0：關閉陰影（自動化測試在軟體算圖下用，加快速度）
      if (params.get('shadows') === '0') map.root.traverse((o) => { if ((o as THREE.Light).isLight) o.castShadow = false; });
      const octree = new Octree();
      octree.fromGraphNode(map.collision);
      this.octree = octree;
      const player = new PlayerController(game.input, game.bus, this.camera);
      player.setWorld(octree, map.surfaceMeshes);
      player.teleport(map.spawn.position, map.spawn.yaw);
      this.player = player;
      game.audio.setZones(map.reverbZones);
      this.buildMarkers(map);
      this.scene.add(this.markers);
      this.markers.visible = params.get('markers') !== '0';
      if (params.get('fly') === '1') { this.flyTo(0, 150, 60, 0, -1.1); this.setFly(true); }
      const fl = Number(params.get('floor') ?? 0);
      if (fl >= 1 && fl <= 6) this.setFloor(fl);
    });
  }

  exit(): void {
    window.removeEventListener('keydown', this.onKey);
    this.game.renderer.clippingPlanes = [];
    this.hud?.dispose();
    this.menu?.dispose();
    this.mc?.dispose();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- 控制（也給自動化測試用）
  setFly(on: boolean): void {
    if (on === this.fly) return;
    this.fly = on;
    if (on) {
      this.flyYaw = this.player?.facingYaw ?? 0;
      this.flyPitch = -0.2;
    } else if (this.player) {
      // 回到走路模式：放在相機正下方的地面
      const p = this.camera.position;
      this.player.teleport(this.tmp.set(p.x, p.y - 1.6, p.z));
    }
  }

  /** 飛行相機直接到某處（pitch 負值往下看） */
  flyTo(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.flyYaw = yaw;
    this.flyPitch = pitch;
    this.camera.position.set(x, y, z);
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  /** 關閉霧並拉遠相機（俯瞰截圖用） */
  setOverview(on: boolean): void {
    this.fog = !on;
    this.scene.fog = on ? null : this.scene.fog ?? null;
    if (!on) applyHarborAtmosphere(this.scene);
    const sky = this.scene.getObjectByName('sky');
    if (sky) sky.visible = !on;
    this.camera.far = on ? 600 : 220;
    this.camera.updateProjectionMatrix();
  }

  /**
   * 樓層俯視：n = 1～6 只顯示該高度範圍（全域裁切平面）、關掉分區可見性、相機拉到空中垂直往下看；0 = 回到一般視角。
   */
  setFloor(n: number): void {
    const vis = (this.map as (RaidMap & { visibility?: { locked: boolean; showAll(): void } }) | null)?.visibility;
    this.floor = n;
    const renderer = this.game.renderer;
    if (n === 0) {
      renderer.clippingPlanes = [];
      if (vis) vis.locked = false;
      this.setOverview(false);
      this.setFly(false);
      return;
    }
    const b = FLOOR_BANDS[n];
    renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), b.y1), new THREE.Plane(new THREE.Vector3(0, 1, 0), -b.y0)];
    if (vis) { vis.locked = true; vis.showAll(); }
    this.setOverview(true);
    this.setFly(true);
    this.flyTo(0, 172, 42, 0, -Math.PI / 2);
  }

  teleport(x: number, y: number, z: number, yaw = 0): void {
    this.setFly(false);
    this.player?.teleport(new THREE.Vector3(x, y, z), yaw);
  }

  // ---------------------------------------------------------------- 除錯標記
  private buildMarkers(map: RaidMap): void {
    const g = this.markers;
    const overlay = (m: THREE.Material): THREE.Material => { m.depthTest = false; m.transparent = true; return m; };
    // 導航圖
    const lineVerts: number[] = [];
    for (const [a, b] of map.nav.edges) {
      const p = map.nav.nodes[a], q = map.nav.nodes[b];
      lineVerts.push(p.x, p.y + 0.2, p.z, q.x, q.y + 0.2, q.z);
    }
    const nav = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3)), overlay(new THREE.LineBasicMaterial({ color: 0x35e0c0, opacity: 0.55 })));
    nav.renderOrder = 998; nav.name = 'dbg_navEdges';
    const ptVerts: number[] = [];
    for (const n of map.nav.nodes) ptVerts.push(n.x, n.y + 0.25, n.z);
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ptVerts, 3)), overlay(new THREE.PointsMaterial({ color: 0xffe14a, size: 3, sizeAttenuation: false })));
    pts.renderOrder = 999; pts.name = 'dbg_navNodes';
    g.add(nav, pts);

    // 搜刮點、敵人、抵達點、撤離點、商人
    const addInstanced = (geo: THREE.BufferGeometry, items: { p: THREE.Vector3; color: number; scale?: number }[], name: string): void => {
      if (!items.length) return;
      const im = new THREE.InstancedMesh(geo, overlay(new THREE.MeshBasicMaterial({ opacity: 0.9 })), items.length);
      const m = new THREE.Matrix4(), c = new THREE.Color();
      items.forEach((it, i) => {
        m.compose(it.p, new THREE.Quaternion(), new THREE.Vector3().setScalar(it.scale ?? 1));
        im.setMatrixAt(i, m);
        im.setColorAt(i, c.setHex(it.color));
      });
      im.renderOrder = 999; im.name = name; im.frustumCulled = false;
      g.add(im);
    };
    const LOOT_COLOR: Record<string, number> = { crate: 0xffcf5a, toolbox: 0xff8a3d, cabinet: 0x7cc4ff, safe: 0xff3dcb, corpse: 0xff5a5a };
    addInstanced(new THREE.OctahedronGeometry(0.35), map.lootSpots.map((l) => ({ p: l.position.clone().add(new THREE.Vector3(0, 1.0, 0)), color: LOOT_COLOR[l.types[0]] ?? 0xffffff })), 'dbg_loot');
    addInstanced(new THREE.ConeGeometry(0.45, 1.8, 8).translate(0, 0.9, 0), map.enemySpawns.map((e) => ({ p: e.position.clone(), color: ENEMY_COLOR[e.kind] })), 'dbg_enemies');
    addInstanced(new THREE.CylinderGeometry(0.4, 0.4, 3, 8).translate(0, 1.5, 0), map.arrivals.map((a) => ({ p: a.position.clone(), color: 0x59ff6a })), 'dbg_arrivals');
    addInstanced(new THREE.CylinderGeometry(1, 1, 5, 12, 1, true).translate(0, 2.5, 0), map.evacPoints.map((e) => ({ p: e.position.clone(), color: e.random ? 0x4ad8ff : 0xb6ff3a, scale: e.radius })), 'dbg_evac');
    if (map.trader) addInstanced(new THREE.CylinderGeometry(0.5, 0.5, 3, 8).translate(0, 1.5, 0), [{ p: map.trader.position.clone(), color: 0xc77dff }], 'dbg_trader');

    // 巡邏路線
    const patrolVerts: number[] = [], patrolCols: number[] = [];
    const col = new THREE.Color();
    for (const e of map.enemySpawns) {
      if (!e.patrol || e.patrol.length < 2) continue;
      col.setHex(ENEMY_COLOR[e.kind]);
      for (let i = 0; i < e.patrol.length; i++) {
        const a = e.patrol[i], b = e.patrol[(i + 1) % e.patrol.length];
        patrolVerts.push(a.x, a.y + 0.5, a.z, b.x, b.y + 0.5, b.z);
        patrolCols.push(col.r, col.g, col.b, col.r, col.g, col.b);
      }
    }
    const patrol = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(patrolVerts, 3)).setAttribute('color', new THREE.Float32BufferAttribute(patrolCols, 3)),
      overlay(new THREE.LineBasicMaterial({ vertexColors: true })),
    );
    patrol.renderOrder = 999; patrol.name = 'dbg_patrol';
    g.add(patrol);

    // 回音區
    const zoneVerts: number[] = [], zoneCols: number[] = [];
    for (const z of map.reverbZones) {
      const b = z.box;
      col.setHex(ZONE_COLOR[z.type]);
      const c = [
        [b.min.x, b.min.y, b.min.z], [b.max.x, b.min.y, b.min.z], [b.max.x, b.min.y, b.max.z], [b.min.x, b.min.y, b.max.z],
        [b.min.x, b.max.y, b.min.z], [b.max.x, b.max.y, b.min.z], [b.max.x, b.max.y, b.max.z], [b.min.x, b.max.y, b.max.z],
      ];
      for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) {
        zoneVerts.push(...c[i], ...c[j]);
        zoneCols.push(col.r, col.g, col.b, col.r, col.g, col.b);
      }
    }
    const zones = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(zoneVerts, 3)).setAttribute('color', new THREE.Float32BufferAttribute(zoneCols, 3)),
      overlay(new THREE.LineBasicMaterial({ vertexColors: true, opacity: 0.8 })),
    );
    zones.renderOrder = 997; zones.name = 'dbg_zones';
    g.add(zones);
  }

  // ---------------------------------------------------------------- 迴圈
  update(dt: number): void {
    if (!this.player || !this.map) return;
    if (this.fly) return;
    this.player.update(dt);
    // 掉出地圖就回出生點
    if (this.player.position.y < -30) this.player.teleport(this.map.spawn.position, this.map.spawn.yaw);
    const p = this.tmp.copy(this.player.position); p.y += 0.9;
    const zone = findReverbZone(this.map.reverbZones, p);
    if (zone !== this.zone) {
      this.zone = zone;
      this.zoneType = zone?.type ?? 'outdoor';
      this.game.bus.emit('reverbZoneChanged', { type: this.zoneType, zone });
    }
  }

  render(alpha: number, frameDt: number): void {
    this.elapsed += frameDt;
    const input = this.game.input;
    if (this.fly) {
      const look = input.consumeLook(this.tmpLook);
      this.flyYaw -= look.x;
      this.flyPitch = THREE.MathUtils.clamp(this.flyPitch - look.y, -1.57, 1.57);
      const mv = input.getMove(this.tmpMove);
      const speed = input.isDown('sprint') ? 60 : 14;
      const fwd = new THREE.Vector3(-Math.sin(this.flyYaw) * Math.cos(this.flyPitch), Math.sin(this.flyPitch), -Math.cos(this.flyYaw) * Math.cos(this.flyPitch));
      const right = new THREE.Vector3(Math.cos(this.flyYaw), 0, -Math.sin(this.flyYaw));
      this.camera.position.addScaledVector(fwd, mv.y * speed * frameDt).addScaledVector(right, mv.x * speed * frameDt);
      if (input.isDown('jump')) this.camera.position.y += speed * frameDt;
      if (input.isDown('crouch')) this.camera.position.y -= speed * frameDt;
      this.camera.rotation.set(this.flyPitch, this.flyYaw, 0, 'YXZ');
    } else if (this.player) {
      this.player.updateCamera(alpha, frameDt);
    }
    this.map?.update?.(frameDt, this.elapsed);
    this.game.audio.updateListener(this.camera);

    if (this.hud && this.player) {
      const s = this.player.state;
      const pos = this.fly ? this.camera.position : this.player.position;
      this.hud.update(frameDt, {
        surface: this.fly ? 'fly' : this.player.surface,
        zone: this.zone?.name ? `${this.zoneType} (${this.zone.name})` : this.zoneType,
        moveState: this.fly ? 'fly' : !s.grounded ? 'air' : s.crouching ? (s.moving ? 'crouch-walk' : 'crouch') : s.sprinting && s.moving ? 'sprint' : s.moving ? 'walk' : 'idle',
        position: `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`,
        sound: this.game.audio.lastSound,
        audioState: `${this.game.audio.state} calls=${this.stats.calls} tris=${(this.stats.triangles / 1000).toFixed(0)}k${this.floor ? ` ・樓層 ${this.floor}: ${FLOOR_BANDS[this.floor].name}` : ''}`,
      });
    }
    this.game.renderer.render(this.scene, this.camera);
    const info = this.game.renderer.info;
    this.stats = { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures };
    void this.fog;
  }
}
