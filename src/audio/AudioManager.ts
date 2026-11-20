import * as THREE from 'three';
import type { GameBus } from '../core/EventBus';
import type { SaveService } from '../save/SaveService';
import { findReverbZone, type ReverbType, type ReverbZone } from '../world/Surface';
import { Ambience } from './Ambience';
import { MapAmbienceRunner, type AmbienceHost } from './MapAmbience';
import type { MapAmbience } from '../world/RaidMap';
import type { Surface } from '../world/Surface';
import { ReverbSystem, ZONE_PARAMS } from './ReverbZones';
import { assessHearing, type Heard, type LineOfSight } from './Hearing';
import {
  SUSTAINED_TIMEOUT, SUSTAINED_UPDATE, REF_DISTANCE, distanceGain, isSustained, noiseRange,
  type NoiseEvent, type StepIntensity, type Vec3,
} from '../data/noise';
import { RECIPES, renderBank } from './Synth';
import {
  detectPrimingShift, GROUP_CATEGORIES, groupByKey, parseSpriteManifest, pickSpriteFormat, sliceClips, SPRITE_GROUPS,
  type SpriteFormat, type SpriteGroupId, type SpriteManifest,
} from './sprites';
import { FOOTSTEP_BANKS, SurfaceSounds } from './SurfaceSounds';
import type { BankSource, PlayOpts, PlayRecord, SoundPlayer } from './types';

/** 同時發聲的上限（手機效能）；超過就停掉最舊、最小聲的 */
export const MAX_VOICES = 24;

export interface AudioSettings {
  master: number;
  sfx: number;
  ambient: number;
}
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { master: 0.8, sfx: 1, ambient: 0.6 };
const SETTINGS_KEY = 'settings.audio';

interface Bank {
  buffers: AudioBuffer[];
  names: string[];
  source: BankSource;
}

interface Loop {
  key: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
  lp: BiquadFilterNode;
  panner: PannerNode | null;
  ev: NoiseEvent;
  /** ctx.currentTime：最後一次收到心跳 */
  lastBeat: number;
}

export interface NoiseLogEntry {
  t: number;
  kind: string;
  source: string;
  dist: number;
  range: number;
  gain: number;
  occluded: boolean;
  vertical: boolean;
  played: boolean;
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  volume: number;
  start: number;
}

const ASSET_BASE = import.meta.env.BASE_URL + 'assets/';
const SPRITE_BASE = ASSET_BASE + 'sprites/';
/** 解碼用的取樣率：和精靈圖相同，切片時不需要重新取樣。AudioBuffer 在任何取樣率的 AudioContext 都能播（瀏覽器自動重取樣） */
const DECODE_RATE = 44100;
/** 同時渲染的合成音庫數（Safari 對同時存在的音訊 context 數量有限制） */
const SYNTH_CONCURRENCY = 4;
/** 載入進度的權重（加總 1）：精靈圖三組 + 合成音庫 */
const PROGRESS_WEIGHTS: Record<string, number> = { p0: 0.35, p1: 0.25, p2: 0.25, synth: 0.15 };

interface Fetched { json: unknown; data: ArrayBuffer; format: SpriteFormat }

/** index.html 的行內腳本在最早的時間點就開始抓 p0 精靈圖，這裡接手 */
interface SfxPreload {
  fmt: SpriteFormat;
  p0: Promise<{ json: unknown; data: ArrayBuffer }>;
}
declare global {
  interface Window { __sfxPreload?: SfxPreload }
}

/** 頁面（含 JS）載入完成 */
const pageLoaded = (): Promise<void> =>
  document.readyState === 'complete' ? Promise.resolve() : new Promise((res) => window.addEventListener('load', () => res(), { once: true }));

/** 音量滑桿 0..1 → 增益（平方曲線，比較貼近聽感） */
const toGain = (v: number): number => v * v;
const jitter = (amt: number): number => 1 + (Math.random() * 2 - 1) * amt;
const minDefined = (a?: number, b?: number): number | undefined => (a === undefined ? b : b === undefined ? a : Math.min(a, b));

interface ShotLayer { key: string; rate: number; volume: number; lowpass?: number; highshelf?: number }
/**
 * 各武器的槍聲：用現有素材（pistol_fire / rifle_fire）加上變速、濾波與合成疊層做出不同的聲音。
 *  - pistol：原聲
 *  - smg：pistol_fire 加快 30%、高頻擱架 +7dB（更脆更尖）
 *  - rifle：原聲（rifle_fire）
 *  - shotgun：rifle_fire 降調到 0.62 倍、壓掉高頻，再疊 synth 的低頻爆破層
 */
export const SHOT_LAYERS: Record<string, ShotLayer[]> = {
  pistol: [{ key: 'weapons.pistol_fire', rate: 1, volume: 1 }],
  smg: [{ key: 'weapons.pistol_fire', rate: 1.3, volume: 0.85, highshelf: 7 }],
  rifle: [{ key: 'weapons.rifle_fire', rate: 1, volume: 1 }],
  shotgun: [
    { key: 'weapons.rifle_fire', rate: 0.62, volume: 0.9, lowpass: 5200 },
    { key: 'weapons.shotgun_boom', rate: 1, volume: 0.95 },
  ],
};
/** 滅音槍聲的處理：低通到 1.4kHz、音量 ×0.5、降音高 8%、殘響減少 */
export const SUPPRESSED_SHOT = { lowpass: 1400, volume: 0.5, rate: 0.92, wet: 0.45 };
/** 彈殼落地的延遲（秒）：霰彈槍在上膛時才退殼 */
const CASING_DELAY: Record<string, number> = { pistol: 0.32, smg: 0.28, rifle: 0.34, shotgun: 0.95 };
/** 彈殼落在不同地面的聲音變化 */
const CASING_SURFACE: Record<Surface, { rate: number; volume: number; lowpass?: number }> = {
  concrete: { rate: 1, volume: 1 }, tile: { rate: 1.1, volume: 1 },
  metal: { rate: 1.12, volume: 1.15 }, metal_hollow: { rate: 0.92, volume: 1.1 }, metal_grate: { rate: 1.2, volume: 1 },
  wood: { rate: 0.82, volume: 0.8, lowpass: 4500 },
  gravel: { rate: 0.95, volume: 0.7, lowpass: 5500 },
  grass: { rate: 0.75, volume: 0.35, lowpass: 2200 }, dirt: { rate: 0.72, volume: 0.35, lowpass: 2000 },
  sand: { rate: 0.7, volume: 0.3, lowpass: 1800 }, carpet: { rate: 0.7, volume: 0.3, lowpass: 2000 },
  water: { rate: 0.6, volume: 0.3, lowpass: 1500 },
};
const ALERT_COOLDOWN = 4.5;      // 全場任何敵人兩次喊叫的最短間隔（秒）
const ALERT_COOLDOWN_EACH = 15;  // 同一個敵人的喊叫間隔

/**
 * 音效系統。只靠 EventBus 與遊戲溝通（footstep / land / impact / shot / weaponAction /
 * reverbZoneChanged），遊戲程式不直接呼叫這裡。
 *
 * 混音結構：
 *   voice → (panner) → sfxDry ─┐
 *   voice → wetSend → ReverbSystem(convolver) ─┴→ sfxGroup ─┐
 *   ambience → ambientGroup ───────────────────────────────┼→ master → destination
 *   ui voice → uiGroup ────────────────────────────────────┘
 */
export class AudioManager implements SoundPlayer {
  ctx: AudioContext | null = null;
  settings: AudioSettings;
  reverb: ReverbSystem | null = null;
  ambience: Ambience | null = null;
  /** 供除錯與測試：最近播放紀錄 */
  readonly recent: PlayRecord[] = [];
  lastSound = '-';
  playCount = 0;
  /** 全部音效（素材與合成）都就緒；個別音庫一就緒就能播，不用等這個 */
  loaded = false;
  /** 載入進度 0..1 */
  progress = 0;
  /** 各階段就緒的時間（performance.now()，毫秒，從頁面開始載入起算） */
  readonly readyAt: Partial<Record<SpriteGroupId | 'synth' | 'all', number>> = {};
  readonly stats = {
    manifestOk: false,
    format: '' as SpriteFormat | '',
    filesTotal: 0,
    filesFetched: 0,
    filesDecoded: 0,
    failed: [] as string[],
    synthKeys: [] as string[],
    /** 各組的載入方式：sprite = 精靈圖；files = 退回逐檔；none = 失敗（改用合成） */
    groups: {} as Record<string, 'sprite' | 'files' | 'none'>,
  };

  private master!: GainNode;
  private sfxGroup!: GainNode;
  private sfxDry!: GainNode;
  private ambientGroup!: GainNode;
  private uiGroup!: GainNode;
  private banks = new Map<string, Bank>();
  private lastVariant = new Map<string, number>();
  private voices: Voice[] = [];
  private zones: readonly ReverbZone[] = [];
  private zoneType: ReverbType = 'outdoor';
  private surfaceSounds = new SurfaceSounds(this);
  private decodeCtx: BaseAudioContext;
  private manifestPaths = new Map<string, string[]>();
  private progressDone = new Set<string>();
  private progressListeners = new Set<(p: number) => void>();
  private listenerPos = new THREE.Vector3();
  private listenerFwd = new THREE.Vector3(0, 0, -1);
  private listenerRight = new THREE.Vector3(1, 0, 0);
  private occluder: LineOfSight | null = null;
  private heardListeners = new Set<(e: NoiseEvent, h: Heard) => void>();
  private loops = new Map<string, Loop>();
  private lastSustainedUpdate = 0;
  /** 最近的聲音事件與判定結果（除錯與測試用） */
  readonly noiseLog: NoiseLogEntry[] = [];
  private tmpRel = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();
  private tmpUp = new THREE.Vector3();
  private gestureHandler = () => this.unlock();

  constructor(bus: GameBus, private save: SaveService, opts: { eager: boolean }) {
    this.settings = { ...DEFAULT_AUDIO_SETTINGS, ...save.get<Partial<AudioSettings>>(SETTINGS_KEY, {}) };
    // 下載、解碼與合成都不需要（正式的）AudioContext：用離線 context 在使用者操作之前就全部做完，
    // 第一次操作時只需要建立並 resume AudioContext、接上 graph
    const OAC = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    this.decodeCtx = new OAC(1, 1, DECODE_RATE);
    void this.loadAll();

    bus.on('noise', (e) => this.onNoise(e));
    bus.on('impact', (e) => this.surfaceSounds.impact(e.surface, e.position, e.flesh));
    bus.on('bulletFlyby', (e) => this.playFlyby(e.position, e.distance));
    bus.on('helmetHit', (e) => { if (e.target === 'player') this.play({ key: 'sfx.tinnitus', volume: 0.5, delay: 0.05, tag: 'tinnitus' }); });
    bus.on('playerHurt', (e) => e.helmet ? undefined : this.play({ key: e.armor ? 'impacts.player_armor' : 'impacts.player_flesh', volume: e.armor ? 0.95 : 0.9, rate: jitter(0.06), tag: e.armor ? 'player hit armor' : 'player hit flesh' }));
    bus.on('enemyHit', (e) => this.playHitMarker(e.zone, e.killed));
    bus.on('heal', (e) => this.playHeal(e.phase));
    bus.on('reverbZoneChanged', (e) => this.setListenerZone(e.type));
    bus.on('itemPicked', () => this.playUi('pickup', 0.7));

    for (const ev of ['pointerdown', 'touchend', 'keydown', 'click'] as const) {
      window.addEventListener(ev, this.gestureHandler, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
    if (opts.eager) this.unlock();
  }

  // ------------------------------------------------------------ 啟動
  /** 第一次使用者操作時呼叫：建立（或 resume）AudioContext 並接上 graph（素材早就在背景載入了） */
  unlock(): void {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch (err) {
        console.warn('[audio] AudioContext unavailable', err);
        return;
      }
      this.buildGraph(this.ctx);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    if (this.ctx.state === 'running') {
      for (const ev of ['pointerdown', 'touchend', 'keydown', 'click'] as const) {
        window.removeEventListener(ev, this.gestureHandler, { capture: true });
      }
    }
  }

  private buildGraph(ctx: AudioContext): void {
    this.master = ctx.createGain();
    this.sfxGroup = ctx.createGain();
    this.ambientGroup = ctx.createGain();
    this.uiGroup = ctx.createGain();
    this.sfxDry = ctx.createGain();
    this.master.gain.value = toGain(this.settings.master);
    this.sfxGroup.gain.value = toGain(this.settings.sfx);
    this.ambientGroup.gain.value = toGain(this.settings.ambient);
    this.sfxDry.connect(this.sfxGroup);
    this.sfxGroup.connect(this.master);
    this.ambientGroup.connect(this.master);
    this.uiGroup.connect(this.master);
    this.master.connect(ctx.destination);
    this.reverb = new ReverbSystem(ctx, this.sfxGroup);
    this.reverb.setListenerZone(this.zoneType, true);
    this.ambience = new Ambience(ctx, this.ambientGroup, (key) => this.banks.get(key)?.buffers[0] ?? null);
    this.ambience.refresh(this.zoneType);
  }

  // ------------------------------------------------------------ 素材載入
  /** 訂閱載入進度（0..1）；回傳取消訂閱函式 */
  onProgress(fn: (p: number) => void): () => void {
    this.progressListeners.add(fn);
    return () => this.progressListeners.delete(fn);
  }

  private markDone(id: string): void {
    this.progressDone.add(id);
    let p = 0;
    for (const k of this.progressDone) p += PROGRESS_WEIGHTS[k] ?? 0;
    this.progress = Math.min(1, p);
    for (const fn of this.progressListeners) fn(this.progress);
  }

  /**
   * 載入全部音效。精靈圖依 p0 → p1 → p2 的順序下載（下載一組的同時解碼上一組），
   * 每一組解碼完就立刻上線；合成音庫（只算沒有素材的）同時在背景並行計算。
   */
  private async loadAll(): Promise<void> {
    try {
      const manifestP = this.fetchManifest();
      const format = window.__sfxPreload?.fmt ?? pickSpriteFormat((t) => new Audio().canPlayType(t));
      this.stats.format = format;

      // manifest 一回來就開始合成缺少素材的音庫，不擋素材
      const synthEarly = manifestP.then((ok) => (ok ? this.renderSynth(Object.keys(RECIPES).filter((k) => !this.manifestPaths.get(k)?.length)) : undefined));

      // 依優先順序下載：前一組下載完才開始下一組，避免擠掉 p0 的頻寬；
      // p1 之後還要等頁面（JS 與 three.js）載入完成，不跟遊戲本體搶頻寬
      const fetches = new Map<SpriteGroupId, Promise<Fetched>>();
      let chain: Promise<unknown> = Promise.resolve();
      for (const g of SPRITE_GROUPS) {
        const p = chain.then(() => (g === 'p0' ? undefined : pageLoaded())).then(() => this.fetchSprite(g, format, true));
        p.catch(() => {});
        chain = p.catch(() => {});
        fetches.set(g, p);
      }

      for (const g of SPRITE_GROUPS) {
        try {
          await this.installSprite(g, format, await fetches.get(g)!);
          this.stats.groups[g] = 'sprite';
        } catch (err) {
          console.warn(`[audio] sprite ${g} failed, falling back to individual files`, err);
          try {
            await this.loadGroupFiles(g, manifestP);
            this.stats.groups[g] = 'files';
          } catch (err2) {
            console.warn(`[audio] files for ${g} failed, using synthesized sounds`, err2);
            this.stats.groups[g] = 'none';
          }
        }
        this.readyAt[g] = performance.now();
        this.markDone(g);
      }

      await synthEarly;
      // 補漏：素材全部失敗的音庫改用合成
      await this.renderSynth(Object.keys(RECIPES).filter((k) => !this.banks.has(k)));
    } catch (err) {
      console.warn('[audio] loading failed', err);
    }
    this.readyAt.synth = performance.now();
    this.markDone('synth');
    this.loaded = true;
    this.readyAt.all = performance.now();
  }

  private async fetchManifest(): Promise<boolean> {
    try {
      const res = await fetch(ASSET_BASE + 'manifest.json');
      if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
      const manifest = (await res.json()) as Record<string, Record<string, string | string[]>>;
      for (const cats of Object.values(GROUP_CATEGORIES)) {
        for (const cat of cats) {
          const group = manifest[cat];
          if (!group || typeof group !== 'object') continue;
          for (const [name, v] of Object.entries(group)) {
            const paths = (Array.isArray(v) ? v : [v]).filter((p): p is string => typeof p === 'string');
            this.manifestPaths.set(`${cat}.${name}`, paths);
            this.stats.filesTotal += paths.length;
          }
        }
      }
      this.stats.manifestOk = true;
      return true;
    } catch (err) {
      console.warn('[audio] manifest unavailable', err);
      return false;
    }
  }

  private async fetchSprite(group: SpriteGroupId, format: SpriteFormat, allowPreload: boolean): Promise<Fetched> {
    const pre = window.__sfxPreload;
    if (allowPreload && group === 'p0' && pre && pre.fmt === format) {
      try {
        const r = await pre.p0;
        this.stats.filesFetched += 1;
        return { ...r, format };
      } catch { /* 預載失敗：重新抓一次 */ }
    }
    const [jr, dr] = await Promise.all([fetch(`${SPRITE_BASE}${group}.json`), fetch(`${SPRITE_BASE}${group}.${format}`)]);
    if (!jr.ok || !dr.ok) throw new Error(`sprite ${group} HTTP ${jr.status}/${dr.status}`);
    this.stats.filesFetched += 1;
    return { json: await jr.json(), data: await dr.arrayBuffer(), format };
  }

  /** 解碼精靈圖並切成片段上線。解碼失敗就換另一種格式再試一次 */
  private async installSprite(group: SpriteGroupId, format: SpriteFormat, first: Fetched): Promise<void> {
    const alt: SpriteFormat = format === 'ogg' ? 'm4a' : 'ogg';
    let fetched: Fetched = first;
    for (let attempt = 0; ; attempt++) {
      try {
        await this.decodeAndInstall(group, fetched);
        this.stats.format = fetched.format;
        return;
      } catch (err) {
        if (attempt > 0) throw err;
        console.warn(`[audio] sprite ${group}.${fetched.format} unusable, trying ${alt}`, err);
        fetched = await this.fetchSprite(group, alt, false);
      }
    }
  }

  private async decodeAndInstall(group: SpriteGroupId, f: Fetched): Promise<void> {
    const manifest: SpriteManifest = parseSpriteManifest(f.json);
    const decoded = await this.decodeCtx.decodeAudioData(f.data);
    this.stats.filesDecoded += 1;
    if (decoded.sampleRate !== manifest.sampleRate) throw new Error(`sprite ${group}: unexpected sample rate ${decoded.sampleRate}`);
    const channelData = Array.from({ length: decoded.numberOfChannels }, (_, c) => decoded.getChannelData(c));
    const shift = detectPrimingShift(f.format, manifest, decoded.length);
    const clips = sliceClips(manifest, f.format, channelData, shift);
    if (clips.length < manifest.clips.length) throw new Error(`sprite ${group}: ${manifest.clips.length - clips.length} clips out of range`);
    for (const [key, list] of groupByKey(clips)) {
      const buffers = list.map((c) => {
        const buf = this.decodeCtx.createBuffer(c.channels, c.data[0].length, manifest.sampleRate);
        c.data.forEach((d, ch) => buf.copyToChannel(d as Float32Array<ArrayBuffer>, ch));
        return buf;
      });
      this.installBank(key, buffers, list.map((c) => c.path), 'asset');
    }
    this.afterInstall(group);
  }

  /** 精靈圖失敗時的退路：逐檔下載、解碼（有限並行） */
  private async loadGroupFiles(group: SpriteGroupId, manifestP: Promise<boolean>): Promise<void> {
    if (!(await manifestP)) throw new Error('no manifest');
    const cats = GROUP_CATEGORIES[group];
    const keys = [...this.manifestPaths.keys()].filter((k) => cats.includes(k.split('.')[0]));
    const jobs = keys.flatMap((key) => this.manifestPaths.get(key)!.map((path, i) => ({ key, path, i })));
    const results = new Map<string, (AudioBuffer | null)[]>(keys.map((k) => [k, []]));
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const j = jobs[next++];
        let buf: AudioBuffer | null = null;
        try {
          const res = await fetch(ASSET_BASE + j.path);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          this.stats.filesFetched++;
          buf = await this.decodeCtx.decodeAudioData(await res.arrayBuffer());
          this.stats.filesDecoded++;
        } catch (err) {
          this.stats.failed.push(j.path);
          console.warn(`[audio] failed to load ${j.path}`, err);
        }
        results.get(j.key)![j.i] = buf;
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    let any = false;
    for (const [key, bufs] of results) {
      const paths = this.manifestPaths.get(key)!;
      const ok = paths.map((p, i) => ({ p, b: bufs[i] })).filter((x): x is { p: string; b: AudioBuffer } => !!x.b);
      if (ok.length) { this.installBank(key, ok.map((x) => x.b), ok.map((x) => x.p), 'asset'); any = true; }
    }
    if (!any) throw new Error('no files decoded');
    this.afterInstall(group);
  }

  private installBank(key: string, buffers: AudioBuffer[], names: string[], source: BankSource): void {
    this.banks.set(key, { buffers, names, source });
  }

  private afterInstall(group: SpriteGroupId): void {
    // 環境音在 p2 載入完成後才開始（淡入）
    if (group === 'p2') this.ambience?.refresh(this.zoneType);
  }

  /** 並行合成指定的音庫（跳過已經有素材的） */
  private async renderSynth(keys: string[]): Promise<void> {
    let next = 0;
    const worker = async () => {
      while (next < keys.length) {
        const key = keys[next++];
        if (this.banks.has(key)) continue;
        try {
          const buffers = await renderBank(key, DECODE_RATE);
          if (this.banks.has(key)) continue;
          this.installBank(key, buffers, buffers.map((_, i) => `synth:${key}#${i}`), 'synth');
          this.stats.synthKeys.push(key);
          if (key.startsWith('ambient.')) this.ambience?.refresh(this.zoneType);
        } catch (err) {
          console.warn(`[audio] synth failed for ${key}`, err);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(SYNTH_CONCURRENCY, keys.length) }, worker));
  }

  // ------------------------------------------------------------ 公開 API
  has(key: string): boolean {
    return this.banks.has(key);
  }

  getBank(key: string): Bank | undefined {
    return this.banks.get(key);
  }

  setZones(zones: readonly ReverbZone[]): void {
    this.zones = zones;
  }

  /** 每個畫面呼叫：讓 listener 跟著相機（沒有 AudioContext 時仍會更新位置：聲音視覺提示與敵人聽覺要用） */
  updateListener(camera: THREE.Camera): void {
    camera.updateWorldMatrix(true, false);
    this.listenerPos.setFromMatrixPosition(camera.matrixWorld);
    const fwd = this.tmpDir.set(0, 0, -1).transformDirection(camera.matrixWorld);
    const up = this.tmpUp.set(0, 1, 0).transformDirection(camera.matrixWorld);
    this.listenerFwd.copy(fwd);
    this.listenerRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = this.listenerPos.x; l.positionY.value = this.listenerPos.y; l.positionZ.value = this.listenerPos.z;
      l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
      l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(this.listenerPos.x, this.listenerPos.y, this.listenerPos.z);
      (l as unknown as { setOrientation(...a: number[]): void }).setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
    this.updateSustained(ctx.currentTime);
  }

  /** 聽者（耳朵）位置：聲音視覺提示與敵人聽覺的參考 */
  get ear(): Vec3 { return this.listenerPos; }

  /** 設定牆壁遮擋判定（RaidScene 用 Octree raycast 提供）；null = 不做遮擋 */
  setOccluder(fn: LineOfSight | null): void { this.occluder = fn; }

  /** 訂閱「聽得到的」聲音（其他人發出、已通過距離與遮擋判定）；聲音視覺提示用 */
  onHeard(fn: (e: NoiseEvent, h: Heard) => void): () => void {
    this.heardListeners.add(fn);
    return () => { this.heardListeners.delete(fn); };
  }

  setVolume(name: keyof AudioSettings, v: number): void {
    const value = Math.min(1, Math.max(0, v));
    this.settings[name] = value;
    this.save.set(SETTINGS_KEY, this.settings);
    const node = name === 'master' ? this.master : name === 'sfx' ? this.sfxGroup : this.ambientGroup;
    if (this.ctx && node) node.gain.setTargetAtTime(toGain(value), this.ctx.currentTime, 0.02);
  }

  playUi(name: string, volume = 0.6): void {
    this.play({ key: `ui.${name}`, volume, group: 'ui', tag: `ui ${name}` });
  }

  // ------------------------------------------------------------ 聲音事件（noise）
  /**
   * 所有「動作的聲音」都從這裡進來。本機玩家（source = 'player'）的聲音是非定位的；
   * 其他人的聲音用 HRTF 定位，音量依 data/noise.ts 的距離曲線衰減（超過距離完全無聲），
   * 並依牆壁遮擋（Octree raycast）加低通與降音量、依上下樓層加悶與回音。
   */
  private onNoise(e: NoiseEvent): void {
    const own = e.source === 'player';
    const range = noiseRange(e);
    if (range <= 0) return; // 蹲走：完全無聲
    let heard: Heard | null = null;
    if (!own) {
      heard = assessHearing(this.listenerPos, e, this.occluder);
      this.logNoise(e, heard, heard.audible);
      if (!heard.audible) return;
      for (const fn of this.heardListeners) fn(e, heard);
    }
    if (isSustained(e.kind)) { this.beatLoop(e, own, heard); return; }
    this.playNoise(e, own, heard);
  }

  private logNoise(e: NoiseEvent, h: Heard, played: boolean): void {
    this.noiseLog.push({ t: +(this.ctx?.currentTime ?? 0).toFixed(3), kind: e.kind, source: e.source, dist: +h.dist.toFixed(2), range: +h.range.toFixed(1), gain: +h.gain.toFixed(3), occluded: h.occluded, vertical: h.vertical, played });
    if (this.noiseLog.length > 60) this.noiseLog.shift();
  }

  /** 其他人的聲音：定位、距離衰減、遮擋 */
  private spatial(e: NoiseEvent, h: Heard | null): Partial<PlayOpts> {
    if (!h) return {};
    return {
      position: new THREE.Vector3(e.position.x, e.position.y, e.position.z),
      range: h.range, gainMul: h.extraGain, lowpass: h.lowpass ?? undefined, wetBoost: h.wetBoost,
      sourceZone: findReverbZone(this.zones, e.position as THREE.Vector3)?.type ?? 'outdoor', refDistance: REF_DISTANCE,
    };
  }

  private playNoise(e: NoiseEvent, own: boolean, h: Heard | null): void {
    const sp = this.spatial(e, h);
    const pos = sp.position;
    const tag = (s: string) => `${s} ${own ? 'own' : e.source}`;
    switch (e.kind) {
      case 'footstep_sprint': case 'footstep_walk': case 'footstep_crouch_run': case 'footstep_crouch':
        this.surfaceSounds.footstep(e.surface ?? 'concrete', e.kind.slice(9) as StepIntensity, sp);
        return;
      case 'land':
        this.surfaceSounds.land(e.surface ?? 'concrete', e.fallSpeed ?? 4, sp);
        return;
      case 'shot':
        this.playShot(e, own, sp);
        return;
      case 'reload': {
        const stage = e.stage ?? 0;
        const key = ['weapons.mag_out', 'weapons.mag_in', 'weapons.bolt_rack'][stage];
        this.play({ ...sp, key, volume: (stage === 2 ? 0.8 : 0.7) * jitter(0.06), rate: jitter(0.04), wet: 0.5, tag: tag(`reload${stage + 1}/3 ${e.weaponId ?? ''}`) });
        return;
      }
      case 'weapon_swap':
        this.play({ ...sp, key: 'weapons.swap', volume: 0.65 * jitter(0.06), rate: jitter(0.04), wet: 0.5, tag: tag('weapon swap') });
        return;
      case 'dry_fire':
        this.play({ ...sp, key: 'weapons.dry_fire', volume: 0.8 * jitter(0.06), rate: jitter(0.03), wet: 0.5, tag: tag(`dry_fire ${e.weaponId ?? ''}`) });
        return;
      case 'pump':
        this.play({ ...sp, key: 'weapons.shotgun_pump', volume: 0.85 * jitter(0.06), rate: jitter(0.04), wet: 0.5, tag: tag('pump') });
        return;
      case 'heal':
        this.play({ ...sp, key: e.item === 'bandage' ? 'sfx.heal_bandage' : 'sfx.heal_inject', volume: 0.65 * jitter(0.05), rate: jitter(0.03), wet: 0.4, tag: tag(`heal ${e.item ?? ''}`) });
        return;
      case 'item_pickup': case 'item_drop':
        if (own) return; // 本機玩家的撿起 / 丟下由 UI 音效處理
        this.play({ ...sp, key: e.kind === 'item_pickup' ? 'ui.pickup' : 'ui.drop', group: 'sfx', volume: 0.6, wet: 0.4, tag: tag(e.kind) });
        return;
      case 'armor_equip':
        this.play({ ...sp, key: 'sfx.armor_equip', volume: 0.7 * jitter(0.05), rate: jitter(0.03), wet: 0.4, tag: tag('armor equip') });
        return;
      case 'helmet_ping':
        this.play({ ...sp, key: 'impacts.helmet_ping', volume: 0.95 * jitter(0.05), rate: jitter(0.04), wet: 0.45, tag: tag('helmet ping') });
        return;
      case 'trade':
        this.play({ ...sp, key: 'sfx.trade_cash', volume: 0.6 * jitter(0.05), rate: jitter(0.03), wet: 0.3, tag: tag('trade') });
        return;
      case 'hurt': case 'death': case 'alert':
        if (own || !pos) return;
        this.playEnemyVoice(e.kind, e.source, sp);
        if (e.kind === 'death') {
          // 倒地聲：衣料與撲通 + 地面材質的聲音
          const at = pos.clone();
          this.play({ ...sp, position: at, key: 'impacts.body_fall', volume: 0.9, delay: 0.32, wet: 0.5, tag: tag('body fall') });
          const surf = e.surface ?? 'concrete';
          this.play({ ...sp, position: at, key: FOOTSTEP_BANKS[surf], volume: 0.7, rate: 0.7, delay: 0.36, wet: 0.5, tag: tag(`body fall ${surf}`) });
        }
        return;
      default:
        return;
    }
  }

  /** 持續型聲音（搜刮、撤離嗡嗡聲）：每次心跳更新位置並續命；啟動時算一次遮擋，之後每 0.25 秒更新 */
  private beatLoop(e: NoiseEvent, own: boolean, h: Heard | null): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.reverb) return;
    const id = `${e.source}:${e.kind}`;
    const live = this.loops.get(id);
    if (live) { live.ev = e; live.lastBeat = ctx.currentTime; return; }
    const key = e.kind === 'evac' ? 'sfx.evac_hum' : 'sfx.search_rummage';
    const buf = this.banks.get(key)?.buffers[0];
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 22000;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(lp).connect(gain);
    let panner: PannerNode | null = null;
    if (own) gain.connect(this.sfxDry);
    else {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.rolloffFactor = 0; // 距離衰減由 gain 自己算（和 AI、視覺提示同一條曲線）
      gain.connect(panner).connect(this.sfxDry);
    }
    src.start(0, Math.random() * buf.duration);
    const loop: Loop = { key, src, gain, lp, panner, ev: e, lastBeat: ctx.currentTime };
    this.loops.set(id, loop);
    this.applyLoop(loop, own ? null : h, true);
    this.record({
      t: +ctx.currentTime.toFixed(3), key, source: this.banks.get(key)!.source, variant: 0, name: this.banks.get(key)!.names[0],
      volume: 1, rate: 1, lowpass: null, positional: !own, wet: 0, zone: 'loop', tag: `loop start ${id}`,
      ...(h ? { dist: +h.dist.toFixed(2), gain: +h.gain.toFixed(3), occluded: h.occluded, range: h.range } : {}),
    });
  }

  private applyLoop(l: Loop, h: Heard | null, immediate = false): void {
    const ctx = this.ctx!;
    const base = l.ev.kind === 'evac' ? 0.55 : 0.6;
    const t = ctx.currentTime;
    const set = (p: AudioParam, v: number) => (immediate ? (p.value = v) : p.setTargetAtTime(v, t, 0.08));
    if (!h) { set(l.gain.gain, base); return; }
    set(l.gain.gain, base * h.gain);
    set(l.lp.frequency, h.lowpass ?? 22000);
    if (l.panner) {
      const p = l.ev.position;
      if (l.panner.positionX) { l.panner.positionX.value = p.x; l.panner.positionY.value = p.y; l.panner.positionZ.value = p.z; }
      else (l.panner as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(p.x, p.y, p.z);
    }
  }

  /** 每個畫面呼叫：持續型聲音每 SUSTAINED_UPDATE 秒重新評估遮擋 / 音量；超過 SUSTAINED_TIMEOUT 沒心跳就淡出停止 */
  private updateSustained(now: number): void {
    if (this.loops.size === 0 || now - this.lastSustainedUpdate < SUSTAINED_UPDATE) return;
    this.lastSustainedUpdate = now;
    for (const [id, l] of this.loops) {
      if (now - l.lastBeat > SUSTAINED_TIMEOUT) {
        l.gain.gain.setTargetAtTime(0, now, 0.06);
        try { l.src.stop(now + 0.3); } catch { /* 已停止 */ }
        l.src.onended = () => { l.src.disconnect(); l.lp.disconnect(); l.gain.disconnect(); l.panner?.disconnect(); };
        this.loops.delete(id);
        continue;
      }
      const own = l.ev.source === 'player';
      this.applyLoop(l, own ? null : assessHearing(this.listenerPos, l.ev, this.occluder));
    }
  }

  /**
   * 開槍。回音由「槍口所在的回音區」決定（不是聽者所在區）：
   * AI 或其他玩家在隧道裡開槍，就算聽者在室外也聽到隧道的回音。
   * 每把武器由 SHOT_LAYERS 決定要疊哪些聲音。
   */
  playShot(e: NoiseEvent, own: boolean, sp: Partial<PlayOpts>): void {
    const weaponId = e.weaponId ?? 'pistol';
    const position = sp.position;
    const zone = (position ? findReverbZone(this.zones, position)?.type : undefined) ?? 'outdoor';
    const layers = SHOT_LAYERS[weaponId] ?? SHOT_LAYERS.pistol;
    const vJ = jitter(0.05), rJ = jitter(0.03);
    // 滅音槍聲：壓掉高頻（低通）、降音量與音高、殘響很少（悶悶的「噗」）
    const sup = !!e.suppressed;
    for (const l of layers) {
      const key = this.has(l.key) ? l.key : 'weapons.pistol_fire';
      if (!this.has(key)) continue;
      this.play({
        ...sp, key, volume: l.volume * vJ * (sup ? SUPPRESSED_SHOT.volume : 1), rate: l.rate * rJ * (sup ? SUPPRESSED_SHOT.rate : 1),
        lowpass: minDefined(sup ? SUPPRESSED_SHOT.lowpass : l.lowpass, sp.lowpass), highshelf: sup ? undefined : l.highshelf,
        wet: (sup ? SUPPRESSED_SHOT.wet : 1.1) + (sp.wetBoost ?? 0), sourceZone: own ? undefined : zone, refDistance: sp.refDistance ?? 8,
        tag: `shot ${weaponId} ${l.key.split('.')[1]} @${zone}${sup ? ' suppressed' : ''}`,
      });
    }
    const pos = e.position;
    this.playCasing(weaponId, e.surface ?? 'concrete', new THREE.Vector3(pos.x, pos.y, pos.z), e.direction ? new THREE.Vector3(e.direction.x, e.direction.y, e.direction.z) : undefined, !own);
  }

  /** 彈殼落地（延遲播放，音色依地面材質）。別人的彈殼只有近處才聽得到 */
  playCasing(weaponId: string, surface: Surface, shotPos: THREE.Vector3, dir: THREE.Vector3 | undefined, fromOther: boolean): void {
    if (fromOther && this.listenerPos.distanceTo(shotPos) > 35) return;
    const prof = CASING_SURFACE[surface] ?? CASING_SURFACE.concrete;
    const pos = this.tmpCasing.copy(shotPos);
    pos.y -= fromOther ? 1.3 : 1.5;
    if (dir) { pos.x += -dir.z * 0.8; pos.z += dir.x * 0.8; } // 玩家右側的地面
    this.play({
      key: 'weapons.casing', volume: (fromOther ? 0.22 : 0.4) * prof.volume * jitter(0.15), rate: prof.rate * jitter(0.08),
      lowpass: prof.lowpass, position: pos.clone(), delay: (CASING_DELAY[weaponId] ?? 0.32) * jitter(0.1),
      wet: 0.5, sourceZone: findReverbZone(this.zones, shotPos)?.type ?? 'outdoor', refDistance: 2, tag: `casing ${surface}`,
    });
  }

  /** 子彈從耳邊飛過 */
  playFlyby(position: THREE.Vector3, distance: number): void {
    this.play({
      key: 'weapons.bullet_flyby', volume: Math.min(1, 1.1 - distance * 0.3) * jitter(0.1), rate: jitter(0.12),
      position: position.clone(), wet: 0.25, refDistance: 1.5, tag: `flyby ${distance.toFixed(1)}m`,
    });
  }

  private alertGlobal = -99;
  private alertEach = new Map<string, number>();
  private hurtGlobal = -99;

  /** 敵人的聲音（有位置、走該區的回音）。alert 有全域與個別冷卻 */
  playEnemyVoice(kind: 'hurt' | 'death' | 'alert', enemyId: string, sp: Partial<PlayOpts>): void {
    const now = this.ctx?.currentTime ?? 0;
    if (kind === 'alert') {
      if (now - this.alertGlobal < ALERT_COOLDOWN) return;
      if (now - (this.alertEach.get(enemyId) ?? -99) < ALERT_COOLDOWN_EACH) return;
      this.alertGlobal = now;
      this.alertEach.set(enemyId, now);
    } else if (kind === 'hurt') {
      if (now - this.hurtGlobal < 0.12) return;
      this.hurtGlobal = now;
    }
    // 每個敵人固定一個音高偏移，聽起來是不同的人
    let h = 0;
    for (let i = 0; i < enemyId.length; i++) h = (h * 31 + enemyId.charCodeAt(i)) % 97;
    const voiceRate = 0.9 + (h / 97) * 0.22;
    this.play({
      ...sp, key: `enemy.${kind}`, volume: kind === 'alert' ? 1 : kind === 'death' ? 1 : 0.8, rate: voiceRate * jitter(0.05),
      wet: 0.9, refDistance: 6, tag: `enemy ${kind} ${enemyId}`,
    });
  }

  /** 命中標記音；擊殺多一聲上揚的確認音 */
  playHitMarker(zone: 'head' | 'body' | 'limb', killed: boolean): void {
    this.play({ key: 'ui.select', volume: killed ? 0.5 : 0.3, rate: zone === 'head' ? 1.7 : killed ? 1.4 : 1.15, group: 'ui', tag: `hit ${zone}` });
    if (killed) this.play({ key: 'ui.confirm', volume: 0.45, rate: 1.55, group: 'ui', delay: 0.06, tag: 'kill confirm' });
  }

  /** 治療的確認音：完成（上揚）、取消。開始的聲音走 noise */
  playHeal(phase: 'start' | 'done' | 'cancel'): void {
    if (phase === 'start') return; // 開始的聲音（撕繃帶 / 注射）走 noise 事件
    if (phase === 'done') {
      this.play({ key: 'ui.confirm', volume: 0.6, rate: 1.25, group: 'ui', tag: 'heal done' });
      this.play({ key: 'ui.pickup', volume: 0.5, rate: 0.8, group: 'ui', delay: 0.12, tag: 'heal done 2' });
    } else this.play({ key: 'ui.back', volume: 0.4, group: 'ui', tag: 'heal cancel' });
  }

  private tmpCasing = new THREE.Vector3();

  // ------------------------------------------------------------ 地圖環境音（設定在 RaidMap.ambience）
  private mapAmb: MapAmbienceRunner | null = null;

  startMapAmbience(cfg: MapAmbience | undefined, duration: number): void {
    this.stopMapAmbience();
    if (cfg) this.mapAmb = new MapAmbienceRunner(this as unknown as AmbienceHost, cfg, duration);
  }

  stopMapAmbience(): void {
    this.mapAmb?.stop();
    this.mapAmb = null;
  }

  /** 每個畫面呼叫（listener 位置由 updateListener 更新） */
  updateMapAmbience(dt: number): void {
    this.mapAmb?.update(dt, this.listenerPos, this.zoneType);
  }

  /** AmbienceHost：建立循環音層（接到環境音混音）；沒有 ctx 或素材未就緒回傳 null */
  loopLayer(key: string): { setGain(g: number): void; stop(): void } | null {
    const ctx = this.ctx;
    const buf = this.banks.get(key)?.buffers[0];
    if (!ctx || !buf || !this.ambientGroup) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.ambientGroup);
    src.start(0, Math.random() * buf.duration);
    return {
      setGain: (g) => gain.gain.setTargetAtTime(g, ctx.currentTime, 0.35),
      stop: () => {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        window.setTimeout(() => { try { src.stop(); } catch { /* 已停止 */ } src.disconnect(); gain.disconnect(); }, 900);
      },
    };
  }

  private setListenerZone(type: ReverbType): void {
    this.zoneType = type;
    this.reverb?.setListenerZone(type);
    this.ambience?.setZone(type);
  }

  // ------------------------------------------------------------ 播放
  play(o: PlayOpts): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.reverb) return;
    const bank = this.banks.get(o.key);
    if (!bank || bank.buffers.length === 0) return;

    // 挑變化：避免連續兩次相同
    let idx = o.variant ?? Math.floor(Math.random() * bank.buffers.length);
    if (o.variant === undefined && bank.buffers.length > 1 && idx === this.lastVariant.get(o.key)) {
      idx = (idx + 1 + Math.floor(Math.random() * (bank.buffers.length - 1))) % bank.buffers.length;
    }
    idx %= bank.buffers.length;
    this.lastVariant.set(o.key, idx);

    const volume = o.volume ?? 1;
    const rate = o.rate ?? 1;
    const group = o.group ?? 'sfx';

    // 空間音：離聽者水平距離很近（本機玩家自己）的當作非空間音
    let pos = o.position;
    let dist = 0;
    if (pos) {
      const dx = pos.x - this.listenerPos.x, dz = pos.z - this.listenerPos.z;
      if (Math.hypot(dx, dz) < 0.8 && o.range === undefined) pos = undefined;
      else dist = this.listenerPos.distanceTo(pos);
    }
    // 有 range（聲音事件）：音量依 data/noise.ts 的衰減曲線，超過距離完全無聲（不播放）
    const rangeGain = pos && o.range !== undefined ? distanceGain(dist, o.range) : 1;
    if (rangeGain <= 0) return;
    const finalGain = rangeGain * (o.gainMul ?? 1);

    // 限制同時發聲數
    if (this.voices.length >= MAX_VOICES) this.dropWeakestVoice(ctx.currentTime);

    const src = ctx.createBufferSource();
    src.buffer = bank.buffers[idx];
    src.playbackRate.value = rate;
    const nodes: AudioNode[] = [src];
    let node: AudioNode = src;

    // 低通：呼叫端指定（蹲下）+ 距離造成的高頻衰減
    let cutoff = o.lowpass ?? 22000;
    if (pos) cutoff = Math.min(cutoff, Math.max(1500, 20000 / (1 + dist / 25)));
    if (cutoff < 15000) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      node.connect(lp);
      nodes.push(lp);
      node = lp;
    }

    if (o.highshelf) {
      const hs = ctx.createBiquadFilter();
      hs.type = 'highshelf';
      hs.frequency.value = 3500;
      hs.gain.value = o.highshelf;
      node.connect(hs);
      nodes.push(hs);
      node = hs;
    }

    const vol = ctx.createGain();
    vol.gain.value = volume * finalGain;
    node.connect(vol);
    nodes.push(vol);

    // 乾聲
    const dryDest = group === 'ui' ? this.uiGroup : this.sfxDry;
    if (pos) {
      const pn = ctx.createPanner();
      pn.panningModel = 'HRTF';
      pn.distanceModel = 'inverse';
      pn.refDistance = o.refDistance ?? 3;
      pn.rolloffFactor = o.range !== undefined ? 0 : 1.2; // 聲音事件：距離衰減由上面的 GainNode 自己算
      pn.maxDistance = 250;
      if (pn.positionX) { pn.positionX.value = pos.x; pn.positionY.value = pos.y; pn.positionZ.value = pos.z; }
      else (pn as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(pos.x, pos.y, pos.z);
      vol.connect(pn).connect(dryDest);
      nodes.push(pn);
    } else {
      vol.connect(dryDest);
    }

    // 濕聲（殘響送出）：聲源有指定回音區就送進該區，否則走聽者所在區
    const wetAmt = group === 'sfx' ? Math.min(1.5, (o.wet ?? 0.5) + (o.wetBoost ?? 0)) : 0;
    if (wetAmt > 0) {
      const ref = o.refDistance ?? 3;
      const att = pos ? (o.range !== undefined ? rangeGain : ref / (ref + 1.2 * Math.max(0, dist - ref))) : 1;
      const wet = ctx.createGain();
      wet.gain.value = wetAmt * att;
      vol.connect(wet);
      wet.connect(o.sourceZone ? this.reverb.channelInput(o.sourceZone) : this.reverb.listenerBus);
      nodes.push(wet);
    }

    const voice: Voice = { src, gain: vol, volume: volume * (pos ? (o.range !== undefined ? finalGain : 1 / (1 + dist / 10)) : 1), start: ctx.currentTime };
    this.voices.push(voice);
    src.onended = () => {
      this.voices = this.voices.filter((v) => v !== voice);
      for (const n of nodes) n.disconnect();
    };
    src.start(o.delay ? ctx.currentTime + o.delay : 0);

    this.record({
      t: +ctx.currentTime.toFixed(3), key: o.key, source: bank.source, variant: idx, name: bank.names[idx],
      volume: +volume.toFixed(3), rate: +rate.toFixed(3), lowpass: o.lowpass ?? null, positional: !!pos,
      wet: +wetAmt.toFixed(2), zone: o.sourceZone ? `source:${o.sourceZone}` : `listener:${this.zoneType}`, tag: o.tag,
      highshelf: o.highshelf ?? null, delay: o.delay ?? 0,
      ...(pos ? this.spatialRecord(pos, dist, o.range, finalGain, o.gainMul !== undefined && o.gainMul < 1) : {}),
    });
  }

  /** 除錯紀錄：聲源相對耳朵的位置（azimuth：0 前、+90 右、-90 左、±180 後） */
  private spatialRecord(pos: THREE.Vector3, dist: number, range: number | undefined, gain: number, occluded: boolean) {
    const rel = this.tmpRel.copy(pos).sub(this.listenerPos);
    const az = Math.atan2(rel.dot(this.listenerRight), rel.dot(this.listenerFwd)) * 180 / Math.PI;
    return {
      pos: { x: +pos.x.toFixed(1), y: +pos.y.toFixed(1), z: +pos.z.toFixed(1) },
      dist: +dist.toFixed(2), range, gain: +gain.toFixed(3), occluded, azimuth: +az.toFixed(1),
    };
  }

  /** 停掉最舊、最小聲的 voice */
  private dropWeakestVoice(now: number): void {
    let worst: Voice | null = null;
    let worstScore = Infinity;
    for (const v of this.voices) {
      const score = v.volume - 0.1 * (now - v.start); // 越小聲、越舊分數越低
      if (score < worstScore) { worstScore = score; worst = v; }
    }
    if (!worst) return;
    worst.gain.gain.setTargetAtTime(0, now, 0.008);
    try { worst.src.stop(now + 0.05); } catch { /* 已停止 */ }
    this.voices = this.voices.filter((v) => v !== worst);
  }

  private record(r: PlayRecord): void {
    this.playCount++;
    this.recent.push(r);
    if (this.recent.length > 80) this.recent.shift();
    this.lastSound = `${r.tag ?? r.key} [${r.source}#${r.variant}]`;
  }

  get voiceCount(): number { return this.voices.length; }
  get state(): string { return this.ctx?.state ?? 'none'; }

  /** 除錯資訊：給 window.__game.audio.debugInfo() 與 Playwright 測試 */
  debugInfo() {
    const banks: Record<string, { source: BankSource; count: number }> = {};
    for (const [k, b] of this.banks) banks[k] = { source: b.source, count: b.buffers.length };
    return {
      state: this.state,
      sampleRate: this.ctx?.sampleRate ?? 0,
      loaded: this.loaded,
      progress: this.progress,
      readyAt: this.readyAt,
      stats: this.stats,
      banks,
      voices: this.voices.length,
      playCount: this.playCount,
      reverb: this.reverb?.debugState() ?? null,
      reverbParams: ZONE_PARAMS,
      ambience: this.ambience?.debugState() ?? null,
      mapAmbience: this.mapAmb?.debugState() ?? null,
      loops: [...this.loops.keys()],
      noiseLog: this.noiseLog,
    };
  }

  /** 每個音庫逐一檢查 RMS 與峰值（測試用：確認沒有無聲或爆音的 buffer） */
  bufferStats(): { key: string; source: BankSource; index: number; rms: number; peak: number; duration: number }[] {
    const out: { key: string; source: BankSource; index: number; rms: number; peak: number; duration: number }[] = [];
    for (const [key, b] of this.banks) {
      b.buffers.forEach((buf, index) => {
        const d = buf.getChannelData(0);
        let sum = 0, peak = 0;
        for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); }
        out.push({ key, source: b.source, index, rms: Math.sqrt(sum / d.length), peak, duration: buf.duration });
      });
    }
    return out;
  }
}
