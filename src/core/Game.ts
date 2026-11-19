import * as THREE from 'three';
import { EventBus, type GameBus, type GameEvents } from './EventBus';
import { Input } from './Input';
import { AudioManager } from '../audio/AudioManager';
import { AudioLoadBadge } from '../ui/AudioLoadBadge';
import { LocalSaveService, type SaveService } from '../save/SaveService';
import { EconomyService } from '../economy/EconomyService';

export interface Scene {
  enter(game: Game): void;
  exit(): void;
  /** 固定步長物理更新 */
  update(dt: number): void;
  /** 每個畫面一次；alpha 為固定步長之間的內插比例 */
  render(alpha: number, frameDt: number): void;
  resize?(width: number, height: number): void;
}

/** 場景工廠：由 main.ts 註冊，避免場景之間互相 import */
export interface SceneFactory {
  hub: () => Scene;
  raid: () => Scene;
  greybox: () => Scene;
}

export interface GameOptions {
  debug: boolean;
  forceTouch: boolean;
  /** 測試用：debug 模式下仍等第一次使用者操作才建立 AudioContext */
  lazyAudio?: boolean;
}

export const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 10;

function detectTouch(force: boolean): boolean {
  if (force) return true;
  if (matchMedia('(pointer: coarse)').matches) return true;
  return navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches;
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly bus: GameBus = new EventBus<GameEvents>();
  readonly input: Input;
  readonly save: SaveService = new LocalSaveService();
  /** 所有會改變存檔的操作都走這裡 */
  readonly economy: EconomyService = new EconomyService(this.save);
  scenes!: SceneFactory;
  readonly audio: AudioManager;
  readonly isTouch: boolean;
  readonly debug: boolean;
  scene: Scene | null = null;
  width = 1;
  height = 1;

  private accumulator = 0;
  private last = 0;
  private running = false;

  constructor(readonly container: HTMLElement, opts: GameOptions) {
    this.debug = opts.debug;
    this.isTouch = detectTouch(opts.forceTouch);
    // 音效最先建立：下載、解碼、合成立刻在背景開始，不等 three.js 場景；
    // debug 模式（自動化測試）立刻建立 AudioContext；一般模式等第一次使用者操作
    this.audio = new AudioManager(this.bus, this.save, { eager: this.debug && !opts.lazyAudio });
    new AudioLoadBadge(container, this.audio);
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isTouch,
      powerPreference: 'high-performance',
    });
    this.canvas = this.renderer.domElement;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.canvas);
    this.input = new Input(this.canvas, { touch: this.isTouch, debug: this.debug });

    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setScene(scene: Scene): void {
    this.scene?.exit();
    this.scene = scene;
    scene.enter(this);
    scene.resize?.(this.width, this.height);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private resize(): void {
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.width, this.height, false);
    this.scene?.resize?.(this.width, this.height);
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const frameDt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.accumulator += frameDt;

    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.scene?.update(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0; // 追不上就丟棄，避免螺旋

    this.scene?.render(this.accumulator / FIXED_DT, frameDt);
  };
}
