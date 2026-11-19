#!/usr/bin/env node
/**
 * 音效精靈圖（audio sprite）打包腳本。
 *
 * 讀 public/assets/manifest.json（唯一的素材清單來源），依優先順序分成 p0 / p1 / p2 三組，
 * 把每組的所有音檔串接成一個檔案（每段之間、頭尾各留 50ms 靜音），輸出：
 *   public/assets/sprites/<group>.ogg   (Vorbis)
 *   public/assets/sprites/<group>.m4a   (AAC)
 *   public/assets/sprites/<group>.json  (每個片段的 key / index / path / offset / duration)
 *
 * 需要 ffmpeg（含 libvorbis 與 aac）。產生的檔案要 commit 進 repo（CI 不一定有 ffmpeg）。
 * 改動音效素材後請執行：npm run build:audio
 *
 * AAC 編碼器會在開頭補 priming 靜音。這裡把 m4a 編好之後用 ffmpeg 解回來，用互相關量測
 * 實際偏移（formats.m4a.lag），並記錄「完全不處理 edit list」時的偏移（formats.m4a.priming），
 * 執行時依解碼後的長度判斷瀏覽器有沒有自動去掉 priming，再校正。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const OUT = join(PUBLIC, 'assets', 'sprites');
const SAMPLE_RATE = 44100;
const GAP = Math.round(0.05 * SAMPLE_RATE);
/** Vorbis 品質（-1..10）與 AAC 位元率（每聲道） */
const OGG_QUALITY = Number(process.env.OGG_Q ?? 4);
const AAC_KBPS_PER_CH = Number(process.env.AAC_K ?? 64);

/** 優先順序：p0 先上線（腳步、介面），p1 其次（武器、命中、特效），p2 最後（檔案最大的環境音） */
export const GROUPS = {
  p0: ['footsteps', 'ui'],
  p1: ['weapons', 'impacts', 'sfx'],
  p2: ['ambient'],
};

function ff(args, opts = {}) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', ...args], { maxBuffer: 1 << 30, ...opts });
  if (r.error) throw new Error(`ffmpeg not available: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout;
}

function channelsOf(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', file]);
  return Number(String(out).trim());
}

/** 解碼成 44.1kHz float PCM，回傳每個聲道一個 Float32Array */
function decodeFile(file, channels) {
  const raw = ff(['-i', file, '-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', String(channels), 'pipe:1']);
  const all = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength - (raw.byteLength % 4)));
  const n = Math.floor(all.length / channels);
  const out = Array.from({ length: channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) out[c][i] = all[i * channels + c];
  return out;
}

function interleave(chs, length) {
  const out = new Float32Array(length * chs.length);
  for (let i = 0; i < length; i++) for (let c = 0; c < chs.length; c++) out[i * chs.length + c] = chs[c][i];
  return out;
}

function rms(a, from, to) {
  let s = 0;
  const end = Math.min(to, a.length);
  for (let i = Math.max(0, from); i < end; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, end - Math.max(0, from)));
}

/** 在 ±maxLag 內找 decoded 相對 ref 的延遲（decoded[n] ≈ ref[n - lag]），用正規化互相關 */
function measureLag(ref, decoded, from, len, maxLag = 4096) {
  let best = -Infinity;
  let bestLag = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let dot = 0, e = 1e-12;
    for (let i = 0; i < len; i++) {
      const r = ref[from + i] ?? 0;
      const d = decoded[from + i + lag] ?? 0;
      dot += r * d;
      e += d * d;
    }
    const score = dot / Math.sqrt(e);
    if (score > best) { best = score; bestLag = lag; }
  }
  return bestLag;
}

function readManifest() {
  const m = JSON.parse(readFileSync(join(PUBLIC, 'assets', 'manifest.json'), 'utf8'));
  return m;
}

function clipsFor(manifest, categories) {
  const clips = [];
  for (const cat of categories) {
    const group = manifest[cat];
    if (!group || typeof group !== 'object') continue;
    for (const [name, v] of Object.entries(group)) {
      const paths = (Array.isArray(v) ? v : [v]).filter((p) => typeof p === 'string');
      paths.forEach((path, index) => clips.push({ key: `${cat}.${name}`, index, path }));
    }
  }
  return clips;
}

function buildGroup(name, categories, manifest, tmp) {
  const clips = clipsFor(manifest, categories);
  if (clips.length === 0) throw new Error(`group ${name} has no clips`);
  const decoded = clips.map((c) => {
    const file = join(PUBLIC, 'assets', c.path);
    const channels = channelsOf(file);
    const pcm = decodeFile(file, channels);
    return { ...c, channels, pcm, length: pcm[0].length };
  });
  const groupChannels = Math.max(...decoded.map((d) => d.channels));
  let total = GAP;
  for (const d of decoded) { d.start = total; total += d.length + GAP; }
  const mix = Array.from({ length: groupChannels }, () => new Float32Array(total));
  for (const d of decoded) {
    for (let c = 0; c < groupChannels; c++) mix[c].set(d.pcm[Math.min(c, d.channels - 1)], d.start);
  }

  const rawPath = join(tmp, `${name}.f32`);
  writeFileSync(rawPath, Buffer.from(interleave(mix, total).buffer));
  const inArgs = ['-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', String(groupChannels), '-i', rawPath];
  const oggPath = join(OUT, `${name}.ogg`);
  const m4aPath = join(OUT, `${name}.m4a`);
  ff([...inArgs, '-c:a', 'libvorbis', '-q:a', String(OGG_QUALITY), '-y', oggPath]);
  ff([...inArgs, '-c:a', 'aac', '-b:a', `${AAC_KBPS_PER_CH * groupChannels}k`, '-movflags', '+faststart', '-y', m4aPath]);

  // 量測編碼後的實際偏移：用最響的前幾段之一當探針
  const probe = [...decoded.slice(0, 8)].sort((a, b) => rms(b.pcm[0], 0, 4000) - rms(a.pcm[0], 0, 4000))[0];
  const probeLen = Math.min(probe.length, 16384);
  const measure = (args, file) => {
    const raw = ff([...args, '-i', file, '-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', String(groupChannels), 'pipe:1']);
    const all = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength - (raw.byteLength % 4)));
    const n = Math.floor(all.length / groupChannels);
    const chs = Array.from({ length: groupChannels }, () => new Float32Array(n));
    for (let i = 0; i < n; i++) for (let c = 0; c < groupChannels; c++) chs[c][i] = all[i * groupChannels + c];
    return { chs, length: n, lag: measureLag(mix[0], chs[0], probe.start, probeLen) };
  };
  const ogg = measure([], oggPath);
  const m4a = measure([], m4aPath);
  const m4aRaw = measure(['-ignore_editlist', '1'], m4aPath);

  // 驗證：用量測到的 lag 把解碼結果切回每一段，和原始 PCM 比 RMS 與相關性，並檢查頭尾靜音區沒有漏進別段
  const report = { worstRmsErr: 0, worstGapLeak: 0, minCorr: 1 };
  for (const [fmt, dec] of [['ogg', ogg], ['m4a', m4a]]) {
    for (const d of decoded) {
      const ch = dec.chs[0];
      const from = d.start + dec.lag;
      const a = d.pcm[0];
      const r0 = rms(a, 0, a.length);
      const r1 = rms(ch, from, from + d.length);
      if (r0 > 1e-4) { const e = Math.abs(r1 - r0) / r0; if (process.env.VERBOSE && e > 0.08) console.log('  rmsErr', fmt, d.path, e.toFixed(3), 'r0', r0.toFixed(5)); report.worstRmsErr = Math.max(report.worstRmsErr, e); }
      // 緊鄰前後 40ms（片段之外）的能量，相對片段本身
      const guard = Math.round(0.04 * SAMPLE_RATE);
      const leak = Math.max(rms(ch, from - guard, from - 8), rms(ch, from + d.length + 8, from + d.length + guard));
      if (r0 > 1e-3) { if (process.env.VERBOSE && leak / r0 > 0.15) console.log('  leak', fmt, d.path, (leak / r0).toFixed(3), 'r0', r0.toFixed(5)); report.worstGapLeak = Math.max(report.worstGapLeak, leak / r0); }
      let dot = 0, ea = 0, eb = 0;
      for (let i = 0; i < d.length; i++) { const x = a[i], y = ch[from + i] ?? 0; dot += x * y; ea += x * x; eb += y * y; }
      if (ea > 1e-6) report.minCorr = Math.min(report.minCorr, dot / Math.sqrt(ea * eb + 1e-12));
    }
    report[`${fmt}Lag`] = dec.lag;
  }

  const json = {
    version: 1,
    group: name,
    sampleRate: SAMPLE_RATE,
    gap: GAP / SAMPLE_RATE,
    totalSamples: total,
    channels: groupChannels,
    formats: {
      ogg: { file: `${name}.ogg`, lag: ogg.lag, bytes: statSync(oggPath).size },
      m4a: { file: `${name}.m4a`, lag: m4a.lag, priming: m4aRaw.lag, bytes: statSync(m4aPath).size },
    },
    clips: decoded.map((d) => ({
      key: d.key,
      index: d.index,
      path: d.path,
      channels: d.channels,
      start: d.start,
      length: d.length,
      offset: +(d.start / SAMPLE_RATE).toFixed(6),
      duration: +(d.length / SAMPLE_RATE).toFixed(6),
    })),
  };
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(json) + '\n');
  return { json, report, ogg: json.formats.ogg.bytes, m4a: json.formats.m4a.bytes, clips: clips.length };
}

function main() {
  try { ff(['-version']); } catch (e) { console.error(String(e.message)); process.exit(1); }
  mkdirSync(OUT, { recursive: true });
  const manifest = readManifest();
  const tmp = mkdtempSync(join(tmpdir(), 'audio-sprites-'));
  try {
    for (const [name, cats] of Object.entries(GROUPS)) {
      const r = buildGroup(name, cats, manifest, tmp);
      console.log(
        `${name}: ${r.clips} clips  ogg ${(r.ogg / 1024).toFixed(0)}KB (lag ${r.json.formats.ogg.lag})  ` +
          `m4a ${(r.m4a / 1024).toFixed(0)}KB (lag ${r.json.formats.m4a.lag}, priming ${r.json.formats.m4a.priming})  ` +
          `rmsErr<=${(r.report.worstRmsErr * 100).toFixed(1)}% leak<=${(r.report.worstGapLeak * 100).toFixed(1)}% corr>=${r.report.minCorr.toFixed(3)}`,
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// 被測試 import 時只匯出 GROUPS，不執行打包
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
