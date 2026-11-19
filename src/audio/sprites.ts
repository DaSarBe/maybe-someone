/**
 * 音效精靈圖（audio sprite）的資料結構、JSON 解析與切片。
 * 這個檔案不依賴瀏覽器 API，可直接在 Node 單元測試。
 * 打包腳本見 scripts/build-audio-sprites.mjs。
 */

export type SpriteFormat = 'ogg' | 'm4a';
export type SpriteGroupId = 'p0' | 'p1' | 'p2';

/** 載入順序：p0 腳步與介面、p1 武器、命中、特效與敵人聲音、p2 環境音（最大，最後） */
export const SPRITE_GROUPS: readonly SpriteGroupId[] = ['p0', 'p1', 'p2'];

/** 各組包含的 manifest 類別（要和 scripts/build-audio-sprites.mjs 的 GROUPS 一致，有單元測試把關） */
export const GROUP_CATEGORIES: Record<SpriteGroupId, readonly string[]> = {
  p0: ['footsteps', 'ui'],
  p1: ['weapons', 'impacts', 'sfx', 'enemy'],
  p2: ['ambient'],
};

export interface SpriteClip {
  key: string;
  index: number;
  path: string;
  channels: number;
  /** 在精靈圖中的起點與長度（取樣數） */
  start: number;
  length: number;
}

export interface SpriteFormatInfo {
  file: string;
  /** 編碼後解碼出來相對於原始位置的偏移（取樣數） */
  lag: number;
  /** 瀏覽器完全不去除編碼器補的靜音時會多出的取樣數（只有 m4a） */
  priming?: number;
  bytes: number;
}

export interface SpriteManifest {
  group: string;
  sampleRate: number;
  totalSamples: number;
  channels: number;
  formats: Record<SpriteFormat, SpriteFormatInfo>;
  clips: SpriteClip[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** 解析並驗證精靈圖 JSON；格式不對就丟錯（呼叫端會退回逐檔載入） */
export function parseSpriteManifest(raw: unknown): SpriteManifest {
  if (!isObj(raw)) throw new Error('sprite manifest: not an object');
  const { group, sampleRate, totalSamples, channels, formats, clips } = raw;
  if (typeof group !== 'string') throw new Error('sprite manifest: missing group');
  if (!isInt(sampleRate) || sampleRate <= 0) throw new Error('sprite manifest: bad sampleRate');
  if (!isInt(totalSamples) || totalSamples <= 0) throw new Error('sprite manifest: bad totalSamples');
  if (!isInt(channels) || channels < 1 || channels > 2) throw new Error('sprite manifest: bad channels');
  if (!isObj(formats) || !Array.isArray(clips)) throw new Error('sprite manifest: missing formats/clips');

  const parsedFormats = {} as Record<SpriteFormat, SpriteFormatInfo>;
  for (const f of ['ogg', 'm4a'] as const) {
    const info = formats[f];
    if (!isObj(info) || typeof info.file !== 'string' || !isInt(info.lag)) throw new Error(`sprite manifest: bad format ${f}`);
    parsedFormats[f] = {
      file: info.file,
      lag: info.lag,
      priming: isInt(info.priming) ? info.priming : undefined,
      bytes: typeof info.bytes === 'number' ? info.bytes : 0,
    };
  }

  const parsedClips: SpriteClip[] = clips.map((c, i) => {
    if (!isObj(c) || typeof c.key !== 'string' || !isInt(c.index) || !isInt(c.start) || !isInt(c.length) || !isInt(c.channels)) {
      throw new Error(`sprite manifest: bad clip #${i}`);
    }
    if (c.start < 0 || c.length <= 0 || c.start + c.length > totalSamples) throw new Error(`sprite manifest: clip #${i} out of range`);
    if (c.channels < 1 || c.channels > channels) throw new Error(`sprite manifest: clip #${i} bad channels`);
    return { key: c.key, index: c.index, path: typeof c.path === 'string' ? c.path : '', channels: c.channels, start: c.start, length: c.length };
  });
  return { group, sampleRate, totalSamples, channels, formats: parsedFormats, clips: parsedClips };
}

/** 依解碼出來的長度判斷瀏覽器有沒有自動去掉 AAC 的 priming，回傳要額外加上的偏移（取樣數） */
export function detectPrimingShift(format: SpriteFormat, manifest: SpriteManifest, decodedLength: number): number {
  if (format !== 'm4a') return 0;
  const priming = manifest.formats.m4a.priming ?? 0;
  if (priming <= 0) return 0;
  const extra = decodedLength - manifest.totalSamples;
  // 有去掉 priming 的解碼器，多出來的只剩尾端補齊（< 1 個 AAC 影格 = 1024 取樣）；
  // 沒去掉的會再多出 priming 個取樣，所以門檻就是 priming 本身
  return extra >= priming ? priming : 0;
}

export interface SlicedClip {
  key: string;
  index: number;
  path: string;
  channels: number;
  data: Float32Array[];
}

/** 把整段解碼後的 PCM 依 clips 切成獨立片段（複製，不共用記憶體）。shift 為偏移校正（取樣數） */
export function sliceClips(
  manifest: SpriteManifest,
  format: SpriteFormat,
  channelData: readonly Float32Array[],
  shift = 0,
): SlicedClip[] {
  const lag = manifest.formats[format].lag + shift;
  const available = channelData[0]?.length ?? 0;
  const out: SlicedClip[] = [];
  for (const c of manifest.clips) {
    const from = c.start + lag;
    const to = from + c.length;
    if (from < 0 || to > available + 64) continue; // 超出解碼結果太多：這段不可用
    const data: Float32Array[] = [];
    for (let ch = 0; ch < c.channels; ch++) {
      const src = channelData[Math.min(ch, channelData.length - 1)];
      const piece = new Float32Array(c.length);
      piece.set(src.subarray(from, Math.min(to, src.length)));
      data.push(piece);
    }
    out.push({ key: c.key, index: c.index, path: c.path, channels: c.channels, data });
  }
  return out;
}

/** 把切好的片段依 key 分組，並依 index 排好序 */
export function groupByKey(clips: readonly SlicedClip[]): Map<string, SlicedClip[]> {
  const map = new Map<string, SlicedClip[]>();
  for (const c of clips) {
    const list = map.get(c.key);
    if (list) list.push(c);
    else map.set(c.key, [c]);
  }
  for (const list of map.values()) list.sort((a, b) => a.index - b.index);
  return map;
}

/** 依 canPlayType 結果挑格式：支援 Vorbis 用 ogg，否則 m4a（舊版 iOS Safari） */
export function pickSpriteFormat(canPlay: (type: string) => string): SpriteFormat {
  return canPlay('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
}
