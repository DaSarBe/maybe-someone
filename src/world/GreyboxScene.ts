import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import type { Game, Scene } from '../core/Game';
import { PlayerController } from '../player/PlayerController';
import { MobileControls } from '../player/MobileControls';
import { DebugHud } from '../ui/DebugHud';
import { PauseMenu } from '../ui/PauseMenu';
import { TestFire } from '../combat/TestFire';
import { setupLighting } from './Lighting';
import { buildTestGreybox } from './maps/testGreybox';
import { findReverbZone, type ReverbType, type ReverbZone } from './Surface';
import type { GameMap } from './GameMap';

/** M1 灰盒測試場景 */
export class GreyboxScene implements Scene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);
  player!: PlayerController;
  map!: GameMap;
  private game!: Game;
  private hud: DebugHud | null = null;
  private menu: PauseMenu | null = null;
  private mc: MobileControls | null = null;
  private fire: TestFire | null = null;
  private zone: ReverbZone | null = null;
  private zoneType: ReverbType = 'outdoor';
  private tmp = new THREE.Vector3();

  constructor(private opts: { showHud: boolean; onExit?: () => void }) {}

  enter(game: Game): void {
    this.game = game;
    const touch = game.isTouch;
    setupLighting(this.scene, { shadowMapSize: touch ? 1024 : 2048, extent: 62 });

    this.map = buildTestGreybox();
    this.scene.add(this.map.root);

    const octree = new Octree();
    octree.fromGraphNode(this.map.collision);

    this.scene.add(this.camera);
    this.player = new PlayerController(game.input, game.bus, this.camera);
    this.player.setWorld(octree, this.map.surfaceMeshes);
    this.player.teleport(this.map.spawn.position, this.map.spawn.yaw);

    if (this.opts.showHud) this.hud = new DebugHud(game.container, game.bus, touch);
    if (touch) this.mc = new MobileControls(game.container, game.input, game.layout, game.controls);
    this.menu = new PauseMenu(game.container, game.input, game.audio, {
      touch, debug: game.debug, game,
      extra: this.opts.onExit ? [{ label: '回到未來基地', onClick: this.opts.onExit }] : [],
    });

    game.audio.setZones(this.map.reverbZones);
    this.fire = new TestFire(game.bus, game.input, this.camera, this.map.surfaceMeshes);
  }

  exit(): void {
    this.hud?.dispose();
    this.menu?.dispose();
    this.fire?.dispose();
    this.mc?.dispose();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.player.update(dt);
    // 掉出地圖就回出生點
    if (this.player.position.y < -30) this.player.teleport(this.map.spawn.position, this.map.spawn.yaw);
    // 回音區偵測
    const p = this.tmp.copy(this.player.position); p.y += 0.9;
    const zone = findReverbZone(this.map.reverbZones, p);
    if (zone !== this.zone) {
      this.zone = zone;
      this.zoneType = zone?.type ?? 'outdoor';
      this.game.bus.emit('reverbZoneChanged', { type: this.zoneType, zone });
    }
  }

  render(alpha: number, frameDt: number): void {
    this.player.updateCamera(alpha, frameDt);
    this.fire?.update(frameDt);
    this.game.audio.updateListener(this.camera);
    const s = this.player.state;
    const pos = this.player.position;
    this.hud?.update(frameDt, {
      surface: this.player.surface,
      zone: this.zone?.name ? `${this.zoneType} (${this.zone.name})` : this.zoneType,
      moveState: !s.grounded ? 'air' : s.crouching ? (s.moving ? 'crouch-walk' : 'crouch') : s.sprinting && s.moving ? 'sprint' : s.moving ? 'walk' : 'idle',
      position: `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`,
      sound: this.game.audio.lastSound,
      audioState: `${this.game.audio.state} voices=${this.game.audio.voiceCount}`,
    });
    this.game.renderer.render(this.scene, this.camera);
  }
}
