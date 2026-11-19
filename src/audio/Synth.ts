/**
 * 程式合成音效（manifest 缺少或載入失敗時的替代聲音）。
 *
 * 每個配方（Recipe）用濾波雜訊 + 包絡 + 短音調組成，透過 OfflineAudioContext
 * 渲染成 AudioBuffer 後快取。AudioManager 優先使用 manifest 的素材；
 * 只有沒有素材的音庫才會來這裡找配方，所以之後有真實素材時只要改 manifest，程式不用動。
 *
 * 配方名稱 = 音庫名稱，例如 'footsteps.metal'。每個配方會渲染多個變化（variant），
 * 以不同的隨機種子微調頻率、時間、音量，避免連續聽到同一個聲音。
 */

// ---------------------------------------------------------------- 工具
/** 可重現的亂數（mulberry32） */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

interface BurstOpts {
  t?: number;
  /** 濾波器類型與頻率 */
  type?: BiquadFilterType;
  freq?: number;
  freqEnd?: number;
  q?: number;
  /** 額外再串一個濾波器，做出帶通/切頻效果 */
  type2?: BiquadFilterType;
  freq2?: number;
  peak?: number;
  attack?: number;
  decay: number;
}

interface ToneOpts {
  t?: number;
  freq: number;
  freqEnd?: number;
  type?: OscillatorType;
  peak?: number;
  attack?: number;
  decay: number;
}

/** 配方用的小型建構器：把「雜訊爆發」與「音調」排進同一個離線 context */
export class Builder {
  readonly out: GainNode;
  private noiseBuf: AudioBuffer;
  constructor(readonly ctx: OfflineAudioContext, readonly rng: Rng, readonly duration: number) {
    this.out = ctx.createGain();
    this.out.connect(ctx.destination);
    // 整段共用一份白噪音；各 burst 用不同起點切片，聽起來不重複
    const n = Math.ceil(ctx.sampleRate * duration) + 1;
    this.noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = rng.next() * 2 - 1;
  }

  private envelope(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /** 濾波雜訊 + 包絡 */
  burst(o: BurstOpts): void {
    const { ctx } = this;
    const t = o.t ?? 0;
    const attack = o.attack ?? 0.001;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 2000, t);
    if (o.freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t + attack + o.decay);
    f.Q.value = o.q ?? 0.7;
    const g = ctx.createGain();
    this.envelope(g, t, o.peak ?? 1, attack, o.decay);
    src.connect(f);
    let tail: AudioNode = f;
    if (o.type2) {
      const f2 = ctx.createBiquadFilter();
      f2.type = o.type2;
      f2.frequency.value = o.freq2 ?? 1000;
      f2.Q.value = 0.7;
      f.connect(f2);
      tail = f2;
    }
    tail.connect(g).connect(this.out);
    const need = attack + o.decay + 0.02;
    const offset = this.rng.range(0, Math.max(0, this.duration - need));
    src.start(t, offset);
    src.stop(t + attack + o.decay + 0.02);
  }

  /** 短音調（可滑音） */
  tone(o: ToneOpts): void {
    const { ctx } = this;
    const t = o.t ?? 0;
    const attack = o.attack ?? 0.001;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t + attack + o.decay);
    const g = ctx.createGain();
    this.envelope(g, t, o.peak ?? 0.5, attack, o.decay);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + attack + o.decay + 0.02);
  }
}

export interface Recipe {
  /** 秒 */
  duration: number;
  /** 渲染後正規化到的峰值（< 1，避免爆音） */
  peak: number;
  /** 要渲染幾個變化 */
  variants: number;
  /** true 則尾端與開頭交叉淡化，做成可無縫循環的音 */
  loop?: boolean;
  build(b: Builder, variant: number): void;
}

const jit = (b: Builder, v: number, amt = 0.08): number => v * (1 + b.rng.range(-amt, amt));

// ---------------------------------------------------------------- 腳步

/** 通用腳步參數：用於 concrete / wood / grass / gravel / water / carpet / sand */
interface StepParams {
  lp: number;          // 主體低通
  hp: number;          // 主體高通
  decay: number;
  body: number;        // 低頻「咚」的起始頻率；0 = 不加
  bodyGain: number;
  grains: number;      // 碎粒（沙礫、草的沙沙聲）數量
  grainFreq: number;
  grainGain: number;
  resonance?: number;  // 木頭的空腔共鳴
  splash?: boolean;    // 水
  peak: number;
}

const STEP_PARAMS: Record<string, StepParams> = {
  concrete: { lp: 4200, hp: 140, decay: 0.07, body: 120, bodyGain: 0.6, grains: 0, grainFreq: 0, grainGain: 0, peak: 0.75 },
  wood:     { lp: 2600, hp: 90, decay: 0.09, body: 150, bodyGain: 0.7, grains: 0, grainFreq: 0, grainGain: 0, resonance: 320, peak: 0.75 },
  grass:    { lp: 3200, hp: 700, decay: 0.15, body: 80, bodyGain: 0.3, grains: 7, grainFreq: 4200, grainGain: 0.25, peak: 0.6 },
  gravel:   { lp: 7000, hp: 1400, decay: 0.2, body: 90, bodyGain: 0.25, grains: 16, grainFreq: 3500, grainGain: 0.35, peak: 0.65 },
  water:    { lp: 2800, hp: 220, decay: 0.2, body: 100, bodyGain: 0.35, grains: 0, grainFreq: 0, grainGain: 0, splash: true, peak: 0.65 },
  carpet:   { lp: 1000, hp: 60, decay: 0.07, body: 90, bodyGain: 0.5, grains: 0, grainFreq: 0, grainGain: 0, peak: 0.55 },
  sand:     { lp: 4200, hp: 1000, decay: 0.16, body: 70, bodyGain: 0.2, grains: 9, grainFreq: 3000, grainGain: 0.28, peak: 0.55 },
};

function genericStep(p: StepParams): Recipe {
  return {
    duration: 0.45, peak: p.peak, variants: 4,
    build(b) {
      const d = jit(b, p.decay, 0.2);
      b.burst({ type: 'lowpass', freq: jit(b, p.lp), q: 0.7, type2: 'highpass', freq2: p.hp, peak: 1, attack: 0.003, decay: d });
      if (p.body) b.tone({ freq: jit(b, p.body), freqEnd: p.body * 0.5, peak: p.bodyGain, decay: 0.07 });
      if (p.resonance) b.burst({ type: 'bandpass', freq: jit(b, p.resonance), q: 8, peak: 0.6, attack: 0.002, decay: 0.16 });
      if (p.splash) b.burst({ type: 'bandpass', freq: 700, freqEnd: jit(b, 2600), q: 1.5, peak: 0.6, attack: 0.01, decay: 0.22 });
      for (let i = 0; i < p.grains; i++) {
        b.burst({
          t: b.rng.range(0, d * 1.6), type: 'bandpass', freq: jit(b, p.grainFreq, 0.3), q: 2.5,
          peak: p.grainGain * b.rng.range(0.4, 1), attack: 0.0005, decay: b.rng.range(0.006, 0.02),
        });
      }
    },
  };
}

/** 金屬：清脆的撞擊 + 一組不協和的板狀共鳴（比例接近金屬板的模態），尾音帶一點鈴聲 */
const metalStep: Recipe = {
  duration: 0.5, peak: 0.8, variants: 4,
  build(b) {
    const base = b.rng.range(360, 470);
    b.burst({ type: 'highpass', freq: 2200, q: 0.7, peak: 0.8, attack: 0.0004, decay: 0.012 });   // 敲擊瞬間的 click
    b.tone({ freq: b.rng.range(150, 200), freqEnd: 70, peak: 0.45, decay: 0.05 });                // 鞋底的悶響
    const ratios = [1, 2.76, 5.4, 8.93, 13.34];
    ratios.forEach((r, i) => {
      const f = base * r * b.rng.range(0.98, 1.02);
      if (f > 10000) return;
      const amp = 0.55 / Math.pow(i + 1, 0.7);
      b.tone({ freq: f, peak: amp, attack: 0.0008, decay: 0.28 / (1 + i * 0.45) });                // 鈴聲
      b.burst({ type: 'bandpass', freq: f, q: 35, peak: amp * 0.9, attack: 0.0008, decay: 0.12 / (1 + i * 0.3) }); // 雜訊激發的共鳴
    });
  },
};

/** 貨櫃頂：較低的空心咚咚 + 長一點的低頻殘響 */
const metalHollowStep: Recipe = {
  duration: 0.7, peak: 0.8, variants: 4,
  build(b) {
    b.burst({ type: 'highpass', freq: 1500, q: 0.7, peak: 0.5, attack: 0.0005, decay: 0.012 });
    const base = b.rng.range(100, 130);
    [1, 1.5, 2.24, 2.98].forEach((r, i) => {
      b.tone({ freq: base * r * b.rng.range(0.98, 1.02), peak: 0.7 / (1 + i * 0.5), attack: 0.002, decay: 0.18 / (1 + i * 0.2) });
    });
    b.tone({ freq: b.rng.range(380, 440), peak: 0.18, attack: 0.001, decay: 0.25 });
  },
};

/** 格柵：清脆的高頻碰撞 + 幾聲延遲的小喀啦 + 中高頻泛音 */
const metalGrateStep: Recipe = {
  duration: 0.45, peak: 0.8, variants: 4,
  build(b) {
    b.burst({ type: 'highpass', freq: 2500, q: 0.7, peak: 0.8, attack: 0.0004, decay: 0.008 });
    const base = b.rng.range(500, 650);
    [1, 2.32, 3.7].forEach((r, i) => {
      b.tone({ freq: base * r * b.rng.range(0.98, 1.02), peak: 0.4 / (1 + i * 0.6), attack: 0.0008, decay: 0.12 / (1 + i * 0.4) });
    });
    for (let i = 0; i < 3; i++) {
      b.burst({
        t: b.rng.range(0.02, 0.09), type: 'bandpass', freq: b.rng.range(2500, 5500), q: 1.5,
        peak: b.rng.range(0.2, 0.4), attack: 0.0003, decay: 0.006,
      });
    }
  },
};

/** 泥土：低沉的悶聲 + 少量碎土顆粒 */
const dirtStep: Recipe = {
  duration: 0.4, peak: 0.7, variants: 4,
  build(b) {
    b.burst({ type: 'lowpass', freq: b.rng.range(420, 620), q: 0.6, peak: 1, attack: 0.008, decay: 0.11 });
    b.tone({ freq: b.rng.range(80, 100), freqEnd: 42, peak: 0.9, attack: 0.004, decay: 0.1 });
    for (let i = 0; i < 4; i++) {
      b.burst({
        t: b.rng.range(0.005, 0.12), type: 'bandpass', freq: b.rng.range(900, 1700), q: 1.2,
        peak: b.rng.range(0.08, 0.2), attack: 0.002, decay: b.rng.range(0.01, 0.03),
      });
    }
  },
};

/** 磁磚：硬、短，帶高頻 click 與一點空洞的「叩」 */
const tileStep: Recipe = {
  duration: 0.3, peak: 0.75, variants: 4,
  build(b) {
    b.burst({ type: 'highpass', freq: 3200, q: 0.7, peak: 1, attack: 0.0003, decay: 0.006 });   // 高頻 click
    b.tone({ freq: b.rng.range(1100, 1500), freqEnd: 900, peak: 0.4, attack: 0.0005, decay: 0.03 });
    b.tone({ freq: b.rng.range(2300, 2700), peak: 0.18, attack: 0.0004, decay: 0.015 });
    b.tone({ freq: b.rng.range(170, 210), freqEnd: 120, peak: 0.45, decay: 0.035 });             // 叩
    b.burst({ type: 'bandpass', freq: b.rng.range(2000, 2600), q: 3, peak: 0.4, attack: 0.001, decay: 0.045 });
  },
};

// ---------------------------------------------------------------- 武器
/** 空槍：兩段機械喀聲（擊錘落下 + 撞針空擊），帶一點金屬鈴聲 */
const dryFire: Recipe = {
  duration: 0.3, peak: 0.8, variants: 3,
  build(b) {
    b.burst({ type: 'highpass', freq: 3000, q: 0.8, peak: 0.9, attack: 0.0004, decay: 0.005 });
    b.tone({ freq: b.rng.range(1700, 1900), type: 'square', peak: 0.12, attack: 0.0005, decay: 0.006 });
    b.burst({ type: 'bandpass', freq: 3200, q: 30, peak: 0.35, attack: 0.001, decay: 0.05 });
    const t2 = b.rng.range(0.06, 0.08);
    b.burst({ t: t2, type: 'bandpass', freq: b.rng.range(1800, 2300), q: 2, peak: 0.7, attack: 0.0005, decay: 0.012 });
    b.tone({ t: t2, freq: b.rng.range(650, 760), freqEnd: 500, peak: 0.5, attack: 0.0005, decay: 0.03 });
    b.burst({ t: t2, type: 'bandpass', freq: 4100, q: 25, peak: 0.25, attack: 0.001, decay: 0.07 });
  },
};

function shotRecipe(big: boolean): Recipe {
  return {
    duration: big ? 1.0 : 0.7, peak: 0.9, variants: 3,
    build(b) {
      const L = big ? 1.4 : 1;
      b.burst({ type: 'lowpass', freq: 9000, freqEnd: 900, q: 0.7, peak: 1, attack: 0.0006, decay: 0.07 * L });
      b.burst({ type: 'highpass', freq: 2500, peak: 0.6, attack: 0.0004, decay: 0.02 });
      b.tone({ freq: b.rng.range(140, 170) / L, freqEnd: 45, peak: 0.9, attack: 0.001, decay: 0.14 * L });
      b.burst({ t: 0.03, type: 'lowpass', freq: 1500, q: 0.7, peak: 0.35, attack: 0.02, decay: 0.3 * L });
    },
  };
}

const reload: Recipe = {
  duration: 1.1, peak: 0.7, variants: 3,
  build(b) {
    const click = (t: number, f: number, amp: number) => {
      b.burst({ t, type: 'bandpass', freq: f, q: 4, peak: amp, attack: 0.0005, decay: 0.02 });
      b.tone({ t, freq: f * 0.4, peak: amp * 0.5, attack: 0.0005, decay: 0.03 });
    };
    click(0.0, b.rng.range(1500, 1900), 0.6);   // 彈匣釋放
    click(0.38, b.rng.range(900, 1200), 0.8);   // 彈匣插入
    click(0.7, b.rng.range(2200, 2600), 0.7);   // 拉機柄
    click(0.82, b.rng.range(1800, 2200), 0.6);
  },
};


/** 彈殼落地：金屬「叮」，彈跳 2～3 次，一次比一次輕、音高略變 */
const casing: Recipe = {
  duration: 0.5, peak: 0.7, variants: 4,
  build(b) {
    const f = b.rng.range(3900, 5200);
    let t = 0, amp = 1;
    for (let i = 0; i < 3; i++) {
      b.burst({ t, type: 'highpass', freq: 3500, peak: 0.5 * amp, attack: 0.0003, decay: 0.006 });
      b.tone({ t, freq: f * (1 + i * 0.03), peak: 0.5 * amp, attack: 0.0004, decay: 0.07 - i * 0.015 });
      b.tone({ t, freq: f * 1.9, peak: 0.2 * amp, attack: 0.0004, decay: 0.04 });
      b.burst({ t, type: 'bandpass', freq: f, q: 18, peak: 0.3 * amp, attack: 0.0005, decay: 0.08 });
      t += b.rng.range(0.06, 0.11) * (1 - i * 0.25);
      amp *= 0.45;
    }
  },
};

/** 子彈從耳邊飛過：尖銳的裂響 + 往下掃的「咻」 */
const bulletFlyby: Recipe = {
  duration: 0.45, peak: 0.8, variants: 3,
  build(b) {
    b.burst({ type: 'highpass', freq: 3500, peak: 0.7, attack: 0.0005, decay: 0.012 });
    b.burst({ type: 'bandpass', freq: b.rng.range(4200, 5200), freqEnd: 900, q: 2.2, peak: 1, attack: 0.025, decay: 0.2 });
    b.tone({ freq: b.rng.range(2300, 2800), freqEnd: 650, peak: 0.16, attack: 0.01, decay: 0.16, type: 'sawtooth' });
  },
};

/** 子彈打在護甲上：悶重的金屬撞擊（比 metal 命中悶、沒有長鈴聲） */
const playerArmor: Recipe = {
  duration: 0.4, peak: 0.85, variants: 3,
  build(b) {
    b.tone({ freq: b.rng.range(140, 175), freqEnd: 60, peak: 1, attack: 0.002, decay: 0.12 });
    b.burst({ type: 'bandpass', freq: b.rng.range(900, 1300), q: 1.4, peak: 0.8, attack: 0.001, decay: 0.06 });
    b.burst({ type: 'highpass', freq: 2600, peak: 0.45, attack: 0.0004, decay: 0.01 });
    const base = b.rng.range(620, 780);
    [1, 2.4, 4.1].forEach((r, i) => b.tone({ freq: base * r, peak: 0.28 / (i + 1), attack: 0.001, decay: 0.12 / (1 + i * 0.5) }));
  },
};

/** 霰彈槍的低頻爆破層（疊在降調的 rifle_fire 上） */
const shotgunBoom: Recipe = {
  duration: 0.9, peak: 0.95, variants: 3,
  build(b) {
    b.tone({ freq: b.rng.range(95, 115), freqEnd: 32, peak: 1, attack: 0.002, decay: 0.34 });
    b.burst({ type: 'lowpass', freq: 800, freqEnd: 200, q: 0.7, peak: 1, attack: 0.002, decay: 0.28 });
    b.burst({ type: 'bandpass', freq: 1400, q: 0.8, peak: 0.5, attack: 0.001, decay: 0.07 });
  },
};

/** 霰彈槍上膛（泵動）：前推「喀」+ 後拉「嚓」，中間有金屬滑動聲 */
const shotgunPump: Recipe = {
  duration: 0.6, peak: 0.8, variants: 3,
  build(b) {
    const clack = (t: number, f: number, amp: number) => {
      b.burst({ t, type: 'bandpass', freq: f, q: 3, peak: amp, attack: 0.0005, decay: 0.025 });
      b.burst({ t, type: 'highpass', freq: 3000, peak: amp * 0.5, attack: 0.0003, decay: 0.008 });
      b.tone({ t, freq: f * 0.35, peak: amp * 0.6, attack: 0.0005, decay: 0.05 });
    };
    clack(0.0, b.rng.range(1100, 1400), 0.8);
    b.burst({ t: 0.04, type: 'bandpass', freq: 900, freqEnd: 2400, q: 3, peak: 0.18, attack: 0.02, decay: 0.12 });
    clack(b.rng.range(0.2, 0.24), b.rng.range(1500, 1900), 1.0);
  },
};

// ---------------------------------------------------------------- 命中
/** 水泥：短促的碎裂聲（裂響 + 悶響 + 幾顆碎屑） */
const concreteImpact: Recipe = {
  duration: 0.5, peak: 0.85, variants: 4,
  build(b) {
    b.burst({ type: 'lowpass', freq: 7000, freqEnd: 1000, q: 0.7, peak: 0.9, attack: 0.0006, decay: 0.07 });
    b.burst({ type: 'highpass', freq: 3000, peak: 0.8, attack: 0.0003, decay: 0.014 });    // 裂響
    b.tone({ freq: b.rng.range(110, 150), freqEnd: 50, peak: 0.7, decay: 0.09 });           // 悶響
    const n = 5 + Math.floor(b.rng.range(0, 4));
    for (let i = 0; i < n; i++) {                                                          // 碎屑
      b.burst({
        t: b.rng.range(0.04, 0.28), type: 'bandpass', freq: b.rng.range(2800, 6500), q: 3,
        peak: b.rng.range(0.1, 0.3), attack: 0.0003, decay: b.rng.range(0.005, 0.018),
      });
    }
  },
};

const metalImpact: Recipe = {
  duration: 0.6, peak: 0.8, variants: 4,
  build(b) {
    const base = b.rng.range(520, 760);
    b.burst({ type: 'highpass', freq: 2500, peak: 0.9, attack: 0.0003, decay: 0.01 });
    [1, 2.76, 5.4, 8.93].forEach((r, i) => {
      b.tone({ freq: base * r, peak: 0.5 / (i + 1), decay: 0.35 / (1 + i * 0.4) });
    });
  },
};
const woodImpact: Recipe = {
  duration: 0.4, peak: 0.8, variants: 4,
  build(b) {
    b.burst({ type: 'bandpass', freq: b.rng.range(600, 900), q: 3, peak: 1, attack: 0.001, decay: 0.07 });
    b.tone({ freq: b.rng.range(180, 240), freqEnd: 110, peak: 0.7, decay: 0.08 });
    b.burst({ type: 'highpass', freq: 2500, peak: 0.3, attack: 0.0004, decay: 0.01 });
  },
};
const fleshImpact: Recipe = {
  duration: 0.3, peak: 0.75, variants: 4,
  build(b) {
    b.burst({ type: 'lowpass', freq: 600, q: 0.7, peak: 1, attack: 0.004, decay: 0.09 });
    b.tone({ freq: b.rng.range(90, 120), freqEnd: 50, peak: 0.8, attack: 0.003, decay: 0.1 });
  },
};
const genericImpact: Recipe = {
  duration: 0.35, peak: 0.8, variants: 4,
  build(b) {
    b.burst({ type: 'lowpass', freq: 3500, freqEnd: 800, peak: 1, attack: 0.001, decay: 0.1 });
    b.tone({ freq: b.rng.range(120, 170), freqEnd: 60, peak: 0.6, decay: 0.08 });
  },
};

/** 重落地時多疊的低沉悶響 */
const landThump: Recipe = {
  duration: 0.5, peak: 0.85, variants: 2,
  build(b) {
    b.tone({ freq: b.rng.range(75, 90), freqEnd: 32, peak: 1, attack: 0.004, decay: 0.22 });
    b.burst({ type: 'lowpass', freq: 220, q: 0.7, peak: 0.9, attack: 0.005, decay: 0.2 });
  },
};

// ---------------------------------------------------------------- 環境音（可循環）
const harborWind: Recipe = {
  duration: 8, peak: 0.5, variants: 1, loop: true,
  build(b) {
    // 兩層緩慢起伏的帶通雜訊，模擬風的呼嘯
    for (let k = 0; k < 2; k++) {
      const f = b.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 0.8;
      const curve = new Float32Array(16);
      for (let i = 0; i < curve.length; i++) curve[i] = (k ? 420 : 750) * b.rng.range(0.6, 1.5);
      curve[curve.length - 1] = curve[0];
      f.frequency.setValueCurveAtTime(curve, 0, b.duration - 0.1);
      const g = b.ctx.createGain();
      const gc = new Float32Array(12);
      for (let i = 0; i < gc.length; i++) gc[i] = (k ? 0.5 : 0.35) * b.rng.range(0.4, 1);
      g.gain.setValueCurveAtTime(gc, 0, b.duration - 0.1);
      const src = b.ctx.createBufferSource();
      src.buffer = noiseOf(b);
      src.connect(f).connect(g).connect(b.out);
      src.start(0);
    }
  },
};

const roomTone: Recipe = {
  duration: 6, peak: 0.4, variants: 1, loop: true,
  build(b) {
    [60, 120, 180, 240].forEach((f, i) => b.tone({ freq: f, peak: 0.3 / (i + 1), attack: 0.01, decay: 8, type: 'sine' }));
    const src = b.ctx.createBufferSource();
    src.buffer = noiseOf(b);
    const lp = b.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 600;
    const g = b.ctx.createGain(); g.gain.value = 0.25;
    src.connect(lp).connect(g).connect(b.out);
    src.start(0);
  },
};

function noiseOf(b: Builder): AudioBuffer {
  const n = Math.ceil(b.ctx.sampleRate * b.duration);
  const buf = b.ctx.createBuffer(1, n, b.ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = b.rng.next() * 2 - 1;
  return buf;
}

// ---------------------------------------------------------------- 配方表
export const RECIPES: Record<string, Recipe> = {
  'footsteps.concrete': genericStep(STEP_PARAMS.concrete),
  'footsteps.wood': genericStep(STEP_PARAMS.wood),
  'footsteps.grass': genericStep(STEP_PARAMS.grass),
  'footsteps.gravel': genericStep(STEP_PARAMS.gravel),
  'footsteps.water': genericStep(STEP_PARAMS.water),
  'footsteps.carpet': genericStep(STEP_PARAMS.carpet),
  'footsteps.sand': genericStep(STEP_PARAMS.sand),
  'footsteps.metal': metalStep,
  'footsteps.metal_hollow': metalHollowStep,
  'footsteps.metal_grate': metalGrateStep,
  'footsteps.dirt': dirtStep,
  'footsteps.tile': tileStep,
  'weapons.dry_fire': dryFire,
  'weapons.pistol_fire': shotRecipe(false),
  'weapons.rifle_fire': shotRecipe(true),
  'weapons.reload': reload,
  'weapons.casing': casing,
  'weapons.bullet_flyby': bulletFlyby,
  'weapons.shotgun_boom': shotgunBoom,
  'weapons.shotgun_pump': shotgunPump,
  'impacts.player_armor': playerArmor,
  'impacts.concrete': concreteImpact,
  'impacts.metal': metalImpact,
  'impacts.wood': woodImpact,
  'impacts.flesh': fleshImpact,
  'impacts.generic': genericImpact,
  'land.thump': landThump,
  'ambient.harbor_wind': harborWind,
  'ambient.indoor_room_tone': roomTone,
};

export function hasRecipe(key: string): boolean {
  return key in RECIPES;
}

/** 渲染一個變化，回傳單聲道 AudioBuffer（已正規化、已去除首尾爆音） */
export async function renderRecipe(key: string, variant: number, sampleRate = 44100): Promise<AudioBuffer> {
  const r = RECIPES[key];
  if (!r) throw new Error(`no synth recipe: ${key}`);
  const length = Math.ceil(r.duration * sampleRate);
  const ctx = new OfflineAudioContext(1, length, sampleRate);
  const rng = new Rng(hash(key) + variant * 7919);
  const b = new Builder(ctx, rng, r.duration);
  r.build(b, variant);
  const rendered = await ctx.startRendering();
  return finish(rendered, r);
}

/** 渲染某個音庫的全部變化 */
export async function renderBank(key: string, sampleRate = 44100): Promise<AudioBuffer[]> {
  const r = RECIPES[key];
  if (!r) return [];
  const out: AudioBuffer[] = [];
  for (let v = 0; v < r.variants; v++) out.push(await renderRecipe(key, v, sampleRate));
  return out;
}

function finish(buf: AudioBuffer, r: Recipe): AudioBuffer {
  let data = buf.getChannelData(0);
  const sr = buf.sampleRate;

  if (r.loop) {
    // 尾端與開頭交叉淡化，裁掉尾端，做成可無縫循環
    const xf = Math.floor(sr * 0.5);
    const n = data.length - xf;
    const looped = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (i < xf) {
        const w = i / xf;
        looped[i] = data[i] * w + data[n + i] * (1 - w);
      } else looped[i] = data[i];
    }
    const nb = new AudioBuffer({ length: n, sampleRate: sr, numberOfChannels: 1 });
    nb.copyToChannel(looped, 0);
    buf = nb;
    data = nb.getChannelData(0);
  }

  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const scale = peak > 1e-6 ? r.peak / peak : 1;
  const fadeIn = Math.floor(sr * 0.0003);
  const fadeOut = r.loop ? 0 : Math.floor(sr * 0.012);
  for (let i = 0; i < data.length; i++) {
    let g = scale;
    if (i < fadeIn) g *= i / fadeIn;
    const rem = data.length - 1 - i;
    if (rem < fadeOut) g *= rem / fadeOut;
    data[i] *= g;
  }
  return buf;
}
