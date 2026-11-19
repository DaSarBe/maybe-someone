import type { ReverbType } from '../world/Surface';

interface LayerSpec {
  /** 音庫名稱（例如 'ambient.harbor_wind'） */
  key: string;
  gain: number;
  rate?: number;
  lowpass?: number;
}

/** 回音區 → 環境音層。tunnel：房間底噪降調加低通，再疊一點遠處的風 */
export const AMBIENCE_PROFILES: Record<ReverbType, LayerSpec[]> = {
  outdoor: [{ key: 'ambient.harbor_wind', gain: 0.7 }],
  indoor_small: [{ key: 'ambient.indoor_room_tone', gain: 0.55 }],
  indoor_large: [{ key: 'ambient.indoor_room_tone', gain: 0.65 }],
  tunnel: [
    { key: 'ambient.indoor_room_tone', gain: 0.6, rate: 0.78, lowpass: 700 },
    { key: 'ambient.harbor_wind', gain: 0.16, rate: 0.85, lowpass: 900 },
  ],
};

const FADE = 1.5;

interface Layer {
  id: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
  target: number;
  stopTimer: number | null;
}

/** 依回音區淡入淡出的循環環境音，交叉淡化約 1.5 秒 */
export class Ambience {
  private layers = new Map<string, Layer>();
  private zone: ReverbType | null = null;

  constructor(
    private ctx: AudioContext,
    private destination: AudioNode,
    private getBuffer: (key: string) => AudioBuffer | null,
  ) {}

  get activeLayers(): string[] {
    return [...this.layers.values()].filter((l) => l.target > 0).map((l) => l.id);
  }

  setZone(zone: ReverbType, instant = false): void {
    if (zone === this.zone) return;
    this.zone = zone;
    const wanted = new Map<string, LayerSpec>();
    for (const spec of AMBIENCE_PROFILES[zone]) wanted.set(this.layerId(spec), spec);

    // 淡出不需要的
    for (const layer of this.layers.values()) {
      if (!wanted.has(layer.id)) this.fadeTo(layer, 0, instant);
    }
    // 淡入需要的
    for (const [id, spec] of wanted) {
      let layer = this.layers.get(id);
      if (!layer) layer = this.createLayer(id, spec) ?? undefined;
      if (layer) this.fadeTo(layer, spec.gain, instant);
    }
  }

  private layerId(s: LayerSpec): string {
    return `${s.key}@${s.rate ?? 1}/${s.lowpass ?? 0}`;
  }

  private createLayer(id: string, spec: LayerSpec): Layer | null {
    const buf = this.getBuffer(spec.key);
    if (!buf) return null;
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = spec.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    let node: AudioNode = src;
    if (spec.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = spec.lowpass;
      node.connect(f);
      node = f;
    }
    node.connect(gain).connect(this.destination);
    src.start(0, Math.random() * buf.duration); // 隨機起點，避免每次進入同一區都從頭聽到一樣的位置
    const layer: Layer = { id, src, gain, target: 0, stopTimer: null };
    this.layers.set(id, layer);
    return layer;
  }

  private fadeTo(layer: Layer, target: number, instant: boolean): void {
    const now = this.ctx.currentTime;
    const g = layer.gain.gain;
    layer.target = target;
    if (layer.stopTimer !== null) { clearTimeout(layer.stopTimer); layer.stopTimer = null; }
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    if (instant) g.setValueAtTime(target, now);
    else g.linearRampToValueAtTime(target, now + FADE);
    if (target === 0) {
      // 淡出完成後釋放，省下手機的 CPU
      layer.stopTimer = window.setTimeout(() => {
        if (layer.target !== 0) return;
        try { layer.src.stop(); } catch { /* 已停止 */ }
        layer.src.disconnect();
        layer.gain.disconnect();
        this.layers.delete(layer.id);
      }, (instant ? 0 : FADE) * 1000 + 150);
    }
  }

  debugState(): { zone: ReverbType | null; layers: { id: string; gain: number; target: number }[] } {
    return {
      zone: this.zone,
      layers: [...this.layers.values()].map((l) => ({ id: l.id, gain: +l.gain.gain.value.toFixed(3), target: l.target })),
    };
  }
}
