import * as THREE from 'three';
import type { MapAmbience } from '../world/RaidMap';
import type { ReverbType } from '../world/Surface';
import type { PlayOpts } from './types';

/** 地圖環境音需要從 AudioManager 取得的能力（不直接依賴 AudioManager，方便測試） */
export interface AmbienceHost {
  has(key: string): boolean;
  play(o: PlayOpts): void;
  /** 建立循環音層（接到環境音混音）；素材還沒就緒回傳 null */
  loopLayer(key: string): { setGain(g: number): void; stop(): void } | null;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** 浪聲音量：到最近海岸點的距離 → 0..1（refDist 內全開，maxDist 外無聲，中間平滑） */
export function waveLevel(dist: number, refDist: number, maxDist: number): number {
  if (dist <= refDist) return 1;
  if (dist >= maxDist) return 0;
  const t = 1 - (dist - refDist) / (maxDist - refDist);
  return t * t * (3 - 2 * t);
}

/** 隨機決定每場 Raid 遠方汽笛的時刻（秒，已排序），落在 [20, duration - 20] */
export function planHorns(count: [number, number], duration: number, rng: () => number = Math.random): number[] {
  const n = count[0] + Math.floor(rng() * (count[1] - count[0] + 1));
  const lo = 20, hi = Math.max(lo + 1, duration - 20);
  return Array.from({ length: n }, () => lo + rng() * (hi - lo)).sort((a, b) => a - b);
}

/**
 * 地圖專屬環境音：浪聲（依距離）、海鷗（室外隨機）、遠方汽笛（每場 1～3 次）。
 * 設定在 RaidMap.ambience；AudioManager 只負責執行。
 */
export class MapAmbienceRunner {
  elapsed = 0;
  readonly hornTimes: number[];
  /** 統計（除錯與測試） */
  readonly stats = { seagulls: 0, horns: 0 };
  waveGain = 0;
  nearestShore = Infinity;
  private waves: { setGain(g: number): void; stop(): void } | null = null;
  private gullT: number;
  private hornIdx = 0;
  private tmp = new THREE.Vector3();

  constructor(private host: AmbienceHost, private cfg: MapAmbience, duration: number) {
    this.hornTimes = cfg.shipHorn ? planHorns(cfg.shipHorn.count, duration) : [];
    this.gullT = cfg.seagulls ? rand(6, 20) : Infinity;
  }

  update(dt: number, listener: THREE.Vector3, zone: ReverbType): void {
    this.elapsed += dt;
    const { cfg, host } = this;

    // 浪聲：沒有素材就等（p2 載入完成後才有）
    if (cfg.waves) {
      let d = Infinity;
      for (const p of cfg.waves.points) d = Math.min(d, Math.hypot(listener.x - p.x, listener.z - p.z));
      this.nearestShore = d;
      const level = waveLevel(d, cfg.waves.refDist, cfg.waves.maxDist) * cfg.waves.volume * (zone === 'outdoor' ? 1 : zone === 'tunnel' ? 0.05 : 0.3);
      if (!this.waves) this.waves = host.loopLayer('ambient.waves');
      this.waveGain = level;
      this.waves?.setGain(level);
    }

    // 海鷗：只在室外、隨機間隔、遠處隨機方位
    if (cfg.seagulls) {
      this.gullT -= dt;
      if (this.gullT <= 0) {
        if (zone === 'outdoor' && host.has('ambient.seagulls')) {
          const a = Math.random() * Math.PI * 2, r = rand(45, 100);
          this.tmp.set(listener.x + Math.cos(a) * r, listener.y + rand(8, 22), listener.z + Math.sin(a) * r);
          host.play({
            key: 'ambient.seagulls', volume: cfg.seagulls.volume * rand(0.8, 1.1), rate: rand(0.94, 1.06),
            position: this.tmp.clone(), sourceZone: 'outdoor', wet: 1.0, refDistance: 25, tag: 'ambience seagulls',
          });
          this.stats.seagulls++;
          this.gullT = rand(cfg.seagulls.interval[0], cfg.seagulls.interval[1]);
        } else this.gullT = 4; // 不在室外或素材未就緒：稍後再試
      }
    }

    // 遠方汽笛：每場在事先排好的時刻，朝海的方向、帶大量室外回音
    if (cfg.shipHorn && this.hornIdx < this.hornTimes.length && this.elapsed >= this.hornTimes[this.hornIdx]) {
      if (host.has('ambient.ship_horn')) {
        const o = cfg.shipHorn.origin;
        const dx = o.x - listener.x, dz = o.z - listener.z;
        const base = Math.hypot(dx, dz) > 1 ? Math.atan2(dz, dx) : -Math.PI / 2;
        const a = base + rand(-0.6, 0.6), r = rand(cfg.shipHorn.distance[0], cfg.shipHorn.distance[1]);
        this.tmp.set(listener.x + Math.cos(a) * r, 8, listener.z + Math.sin(a) * r);
        host.play({
          key: 'ambient.ship_horn', volume: cfg.shipHorn.volume * rand(0.9, 1.1), rate: rand(0.92, 1.0),
          position: this.tmp.clone(), sourceZone: 'outdoor', wet: 2.2, refDistance: 60, tag: 'ambience ship_horn',
        });
        this.stats.horns++;
        this.hornIdx++;
      } else this.hornTimes[this.hornIdx] += 3; // 素材還沒就緒：延後
    }
  }

  stop(): void {
    this.waves?.stop();
    this.waves = null;
  }

  debugState(): { elapsed: number; waveGain: number; nearestShore: number; hornTimes: number[]; seagulls: number; horns: number } {
    return {
      elapsed: +this.elapsed.toFixed(1), waveGain: +this.waveGain.toFixed(3), nearestShore: +this.nearestShore.toFixed(1),
      hornTimes: this.hornTimes.map((t) => +t.toFixed(1)), seagulls: this.stats.seagulls, horns: this.stats.horns,
    };
  }
}
