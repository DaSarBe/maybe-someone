import * as THREE from 'three';
import type { GameBus } from '../core/EventBus';
import type { SaveService } from '../save/SaveService';
import { findReverbZone, type ReverbType, type ReverbZone } from '../world/Surface';
import { Ambience } from './Ambience';
import { ReverbSystem, ZONE_PARAMS } from './ReverbZones';
import { RECIPES, renderBank } from './Synth';
import {
  detectPrimingShift, GROUP_CATEGORIES, groupByKey, parseSpriteManifest, pickSpriteFormat, sliceClips, SPRITE_GROUPS,
  type SpriteFormat, type SpriteGroupId, type SpriteManifest,
} from './sprites';
import { SurfaceSounds } from './SurfaceSounds';
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

    bus.on('footstep', (e) => this.surfaceSounds.footstep(e.surface, e.intensity, e.position));
    bus.on('land', (e) => this.surfaceSounds.land(e.surface, e.fallSpeed));
    bus.on('impact', (e) => this.surfaceSounds.impact(e.surface, e.position));
    bus.on('shot', (e) => this.playShot(e.weaponId, e.position));
    bus.on('weaponAction', (e) => this.playWeaponAction(e.weaponId, e.action, e.position));
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
      const synthEarly = manifestP.then((ok) => (ok ? this.renderSynth(Object.keys(RECIPES).filter((k) => !this.manifestPaths.has(k))) : undefined));

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

  /** 每個畫面呼叫：讓 listener 跟著相機 */
  updateListener(camera: THREE.Camera): void {
    const ctx = this.ctx;
    if (!ctx) return;
    camera.updateWorldMatrix(true, false);
    this.listenerPos.setFromMatrixPosition(camera.matrixWorld);
    const fwd = this.tmpDir.set(0, 0, -1).transformDirection(camera.matrixWorld);
    const up = this.tmpUp.set(0, 1, 0).transformDirection(camera.matrixWorld);
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = this.listenerPos.x; l.positionY.value = this.listenerPos.y; l.positionZ.value = this.listenerPos.z;
      l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
      l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(this.listenerPos.x, this.listenerPos.y, this.listenerPos.z);
      (l as unknown as { setOrientation(...a: number[]): void }).setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
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

  /**
   * 開槍。回音由「槍口所在的回音區」決定（不是聽者所在區）：
   * AI 或其他玩家在隧道裡開槍，就算聽者在室外也聽到隧道的回音。
   */
  playShot(weaponId: string, position: THREE.Vector3): void {
    const zone = findReverbZone(this.zones, position)?.type ?? 'outdoor';
    const key = this.has(`weapons.${weaponId}_fire`) ? `weapons.${weaponId}_fire` : 'weapons.pistol_fire';
    this.play({
      key,
      volume: 1 * jitter(0.05),
      rate: jitter(0.03),
      position,
      wet: 1.1,
      sourceZone: zone,
      refDistance: 8,
      tag: `shot ${weaponId} @${zone}`,
    });
  }

  playWeaponAction(weaponId: string, action: 'reload' | 'dry_fire', position: THREE.Vector3): void {
    const zone = findReverbZone(this.zones, position)?.type ?? 'outdoor';
    this.play({
      key: action === 'reload' ? 'weapons.reload' : 'weapons.dry_fire',
      volume: (action === 'reload' ? 0.7 : 0.8) * jitter(0.06),
      rate: jitter(0.03),
      position,
      wet: 0.5,
      sourceZone: zone,
      refDistance: 4,
      tag: `${action} ${weaponId}`,
    });
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
      if (Math.hypot(dx, dz) < 0.8) pos = undefined;
      else dist = this.listenerPos.distanceTo(pos);
    }

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

    const vol = ctx.createGain();
    vol.gain.value = volume;
    node.connect(vol);
    nodes.push(vol);

    // 乾聲
    const dryDest = group === 'ui' ? this.uiGroup : this.sfxDry;
    if (pos) {
      const pn = ctx.createPanner();
      pn.panningModel = 'HRTF';
      pn.distanceModel = 'inverse';
      pn.refDistance = o.refDistance ?? 3;
      pn.rolloffFactor = 1.2;
      pn.maxDistance = 250;
      if (pn.positionX) { pn.positionX.value = pos.x; pn.positionY.value = pos.y; pn.positionZ.value = pos.z; }
      else (pn as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(pos.x, pos.y, pos.z);
      vol.connect(pn).connect(dryDest);
      nodes.push(pn);
    } else {
      vol.connect(dryDest);
    }

    // 濕聲（殘響送出）：聲源有指定回音區就送進該區，否則走聽者所在區
    const wetAmt = group === 'sfx' ? o.wet ?? 0.5 : 0;
    if (wetAmt > 0) {
      const ref = o.refDistance ?? 3;
      const att = pos ? ref / (ref + 1.2 * Math.max(0, dist - ref)) : 1;
      const wet = ctx.createGain();
      wet.gain.value = wetAmt * att;
      vol.connect(wet);
      wet.connect(o.sourceZone ? this.reverb.channelInput(o.sourceZone) : this.reverb.listenerBus);
      nodes.push(wet);
    }

    const voice: Voice = { src, gain: vol, volume: volume * (pos ? 1 / (1 + dist / 10) : 1), start: ctx.currentTime };
    this.voices.push(voice);
    src.onended = () => {
      this.voices = this.voices.filter((v) => v !== voice);
      for (const n of nodes) n.disconnect();
    };
    src.start();

    this.record({
      t: +ctx.currentTime.toFixed(3), key: o.key, source: bank.source, variant: idx, name: bank.names[idx],
      volume: +volume.toFixed(3), rate: +rate.toFixed(3), lowpass: o.lowpass ?? null, positional: !!pos,
      wet: +wetAmt.toFixed(2), zone: o.sourceZone ? `source:${o.sourceZone}` : `listener:${this.zoneType}`, tag: o.tag,
    });
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
