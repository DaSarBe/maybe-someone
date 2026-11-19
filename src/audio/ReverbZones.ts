import type { ReverbType } from '../world/Surface';
import { Rng } from './Synth';

/** 每種回音區的殘響參數 */
export interface ZoneReverbParams {
  /** 衰減到 -60 dB 的時間（秒） */
  decay: number;
  /** 殘響輸出音量（乘在 convolver 之後） */
  wet: number;
  preDelay: number;
  /** 殘響高頻隨時間變暗：開頭與結尾的低通截止頻率 */
  dampStart: number;
  dampEnd: number;
  /** 離散的遠處反射（秒, 增益）——室外用來模擬遠處牆面的回聲 */
  echoes?: { t: number; gain: number }[];
  /** 金屬感：疊加回授梳狀濾波（延遲秒數、回授量） */
  comb?: { delay: number; feedback: number };
}

export const REVERB_TYPES: readonly ReverbType[] = ['outdoor', 'indoor_small', 'indoor_large', 'tunnel'];

export const ZONE_PARAMS: Record<ReverbType, ZoneReverbParams> = {
  outdoor: {
    decay: 0.4, wet: 0.1, preDelay: 0.02, dampStart: 4500, dampEnd: 1800,
    echoes: [{ t: 0.17, gain: 0.5 }, { t: 0.31, gain: 0.25 }],
  },
  indoor_small: { decay: 0.5, wet: 0.3, preDelay: 0.004, dampStart: 10000, dampEnd: 5000 },
  indoor_large: { decay: 1.8, wet: 0.45, preDelay: 0.018, dampStart: 7000, dampEnd: 2500 },
  tunnel: {
    decay: 2.5, wet: 0.38, preDelay: 0.012, dampStart: 3200, dampEnd: 900,
    comb: { delay: 0.0063, feedback: 0.5 },
  },
};

/** 程式產生脈衝響應：指數衰減的雜訊，左右聲道使用不同的雜訊，高頻隨時間衰減得更快 */
export function buildImpulseResponse(ctx: BaseAudioContext, p: ZoneReverbParams, seed: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.ceil(sr * (p.preDelay + p.decay * 1.15));
  const buf = ctx.createBuffer(2, length, sr);
  for (let ch = 0; ch < 2; ch++) {
    const rng = new Rng(seed * 31 + ch * 9973);
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < length; i++) {
      const t = i / sr - p.preDelay;
      if (t < 0) continue;
      const amp = Math.exp((-6.9078 * t) / p.decay) * Math.min(1, t / 0.004);
      const x = (rng.next() * 2 - 1) * amp;
      const fc = p.dampStart + (p.dampEnd - p.dampStart) * Math.min(1, t / p.decay);
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      y += a * (x - y);
      d[i] = y;
    }
    if (p.echoes) {
      for (const e of p.echoes) {
        const start = Math.floor((e.t + ch * 0.007) * sr); // 左右稍微錯開
        const n = Math.floor(sr * 0.012);
        let z = 0;
        for (let i = 0; i < n && start + i < length; i++) {
          z += 0.25 * ((rng.next() * 2 - 1) * Math.exp(-i / (n * 0.3)) - z);
          d[start + i] += z * e.gain * 0.8;
        }
      }
    }
    if (p.comb) {
      const D = Math.floor((p.comb.delay + ch * 0.0007) * sr);
      for (let i = D; i < length; i++) d[i] += d[i - D] * p.comb.feedback;
    }
    // 能量正規化：輸出能量 ≈ 輸入能量 × wet²，各區之間的殘響量才好比較
    let e = 0;
    for (let i = 0; i < length; i++) e += d[i] * d[i];
    const k = e > 0 ? 1 / Math.sqrt(e) : 1;
    for (let i = 0; i < length; i++) d[i] *= k;
  }
  return buf;
}

interface Channel {
  input: GainNode;      // 單一來源（例如一聲槍響）直接送進這個區的殘響
  listenerGain: GainNode; // 聽者所在區：由 listenerBus 進來，交叉淡化
  convolver: ConvolverNode;
  output: GainNode;
}

const CROSSFADE = 0.4;

/**
 * 殘響系統：每種回音區一個 ConvolverNode。
 * - 聽者所在區：一般音效（腳步等）的 wet 訊號進 listenerBus，經各區的 listenerGain 分配；
 *   切換區域時，舊區 gain 降到 0、新區升到 1，約 0.4 秒交叉淡化。
 * - 聲源所在區：槍聲等用 channelInput(type) 直接送進聲源那個區的殘響，與聽者在哪裡無關。
 */
export class ReverbSystem {
  readonly listenerBus: GainNode;
  /** 殘響輸出的電平表（測試與除錯用） */
  private meter: AnalyserNode;
  private meterData: Float32Array<ArrayBuffer>;
  private channels = {} as Record<ReverbType, Channel>;
  private current: ReverbType = 'outdoor';

  constructor(private ctx: AudioContext, destination: AudioNode) {
    this.listenerBus = ctx.createGain();
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 1024;
    this.meterData = new Float32Array(this.meter.fftSize);
    REVERB_TYPES.forEach((type, i) => {
      const p = ZONE_PARAMS[type];
      const input = ctx.createGain();
      const listenerGain = ctx.createGain();
      listenerGain.gain.value = type === this.current ? 1 : 0;
      const convolver = ctx.createConvolver();
      convolver.normalize = false; // IR 已自行做能量正規化
      convolver.buffer = buildImpulseResponse(ctx, p, 1000 + i);
      const output = ctx.createGain();
      output.gain.value = p.wet;
      this.listenerBus.connect(listenerGain).connect(input);
      input.connect(convolver).connect(output).connect(destination);
      output.connect(this.meter);
      this.channels[type] = { input, listenerGain, convolver, output };
    });
  }

  channelInput(type: ReverbType): GainNode {
    return this.channels[type].input;
  }

  get listenerZone(): ReverbType {
    return this.current;
  }

  /** 聽者進入新區：0.4 秒內交叉淡化 */
  setListenerZone(type: ReverbType, instant = false): void {
    this.current = type;
    const now = this.ctx.currentTime;
    for (const t of REVERB_TYPES) {
      const g = this.channels[t].listenerGain.gain;
      const target = t === type ? 1 : 0;
      g.cancelScheduledValues(now);
      if (instant) { g.setValueAtTime(target, now); continue; }
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(target, now + CROSSFADE);
    }
  }

  /** 殘響輸出當下的 RMS（最近約 23 ms），用來驗證 wet 訊號真的有流過 */
  measureWet(): number {
    this.meter.getFloatTimeDomainData(this.meterData);
    let sum = 0;
    for (let i = 0; i < this.meterData.length; i++) sum += this.meterData[i] * this.meterData[i];
    return Math.sqrt(sum / this.meterData.length);
  }

  /** 目前聽者殘響的等效 wet 量（各區 listenerGain × 區的 wet 加總），除錯與測試用 */
  effectiveWet(): number {
    let sum = 0;
    for (const t of REVERB_TYPES) sum += this.channels[t].listenerGain.gain.value * ZONE_PARAMS[t].wet;
    return sum;
  }

  debugState(): { zone: ReverbType; effectiveWet: number; gains: Record<string, number>; decay: Record<string, number> } {
    const gains: Record<string, number> = {};
    const decay: Record<string, number> = {};
    for (const t of REVERB_TYPES) {
      gains[t] = +this.channels[t].listenerGain.gain.value.toFixed(3);
      decay[t] = +(this.channels[t].convolver.buffer?.duration ?? 0).toFixed(2);
    }
    return { zone: this.current, effectiveWet: +this.effectiveWet().toFixed(3), gains, decay };
  }
}
