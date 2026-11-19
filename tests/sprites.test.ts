import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectPrimingShift, GROUP_CATEGORIES, groupByKey, parseSpriteManifest, pickSpriteFormat, sliceClips, SPRITE_GROUPS,
  type SpriteManifest,
} from '../src/audio/sprites';
// @ts-expect-error 純 JS 的打包腳本，沒有型別
import { GROUPS as SCRIPT_GROUPS } from '../scripts/build-audio-sprites.mjs';

const PUBLIC = join(__dirname, '..', 'public');
const SPRITES = join(PUBLIC, 'assets', 'sprites');

function validJson() {
  return {
    version: 1, group: 'px', sampleRate: 44100, gap: 0.05, totalSamples: 1000, channels: 2,
    formats: {
      ogg: { file: 'px.ogg', lag: 0, bytes: 10 },
      m4a: { file: 'px.m4a', lag: 0, priming: 1024, bytes: 20 },
    },
    clips: [
      { key: 'a.b', index: 1, path: 'sounds/a/2.ogg', channels: 1, start: 300, length: 100 },
      { key: 'a.b', index: 0, path: 'sounds/a/1.ogg', channels: 1, start: 100, length: 100 },
      { key: 'c.d', index: 0, path: 'sounds/c.ogg', channels: 2, start: 500, length: 200 },
    ],
  };
}

describe('parseSpriteManifest', () => {
  it('parses a valid manifest', () => {
    const m = parseSpriteManifest(validJson());
    expect(m.clips).toHaveLength(3);
    expect(m.formats.m4a.priming).toBe(1024);
    expect(m.formats.ogg.priming).toBeUndefined();
  });

  it('rejects malformed input', () => {
    expect(() => parseSpriteManifest(null)).toThrow();
    expect(() => parseSpriteManifest({})).toThrow();
    const noFormat = validJson() as Record<string, unknown>;
    delete noFormat.formats;
    expect(() => parseSpriteManifest(noFormat)).toThrow();
    const outOfRange = validJson();
    outOfRange.clips[0].start = 990;
    expect(() => parseSpriteManifest(outOfRange)).toThrow(/out of range/);
    const badCh = validJson();
    badCh.clips[2].channels = 3;
    expect(() => parseSpriteManifest(badCh)).toThrow();
    const floaty = validJson();
    (floaty.clips[0] as { start: number }).start = 1.5;
    expect(() => parseSpriteManifest(floaty)).toThrow();
  });
});

describe('sliceClips', () => {
  const manifest = parseSpriteManifest(validJson());
  const L = Float32Array.from({ length: 1000 }, (_, i) => i);
  const R = Float32Array.from({ length: 1000 }, (_, i) => -i);

  it('cuts exact, independent segments', () => {
    const out = sliceClips(manifest, 'ogg', [L, R]);
    expect(out).toHaveLength(3);
    const first = out[0];
    expect(first.data).toHaveLength(1); // mono clip -> one channel
    expect(first.data[0]).toHaveLength(100);
    expect(first.data[0][0]).toBe(300);
    expect(first.data[0][99]).toBe(399);
    const stereo = out[2];
    expect(stereo.data).toHaveLength(2);
    expect(stereo.data[1][0]).toBe(-500);
    // 複製，不共用記憶體
    first.data[0][0] = 12345;
    expect(L[300]).toBe(300);
  });

  it('applies lag and extra shift', () => {
    const m: SpriteManifest = { ...manifest, formats: { ...manifest.formats, m4a: { ...manifest.formats.m4a, lag: 7 } } };
    const out = sliceClips(m, 'm4a', [L, R]);
    expect(out[0].data[0][0]).toBe(307);
    const shifted = sliceClips(manifest, 'ogg', [L.map((_, i) => i - 3) as Float32Array, R], 3);
    expect(shifted[1].data[0][0]).toBe(100); // 資料整體延後 3 個取樣，用 shift 校正
  });

  it('duplicates a mono sprite into stereo clips and skips clips that do not fit', () => {
    const out = sliceClips(manifest, 'ogg', [L]);
    expect(out[2].data[1][5]).toBe(505);
    const short = sliceClips(manifest, 'ogg', [L.subarray(0, 450)]);
    expect(short.map((c) => c.index + c.key)).toEqual(['1a.b', '0a.b']);
  });

  it('groups by key sorted by index', () => {
    const g = groupByKey(sliceClips(manifest, 'ogg', [L, R]));
    expect([...g.keys()]).toEqual(['a.b', 'c.d']);
    expect(g.get('a.b')!.map((c) => c.index)).toEqual([0, 1]);
  });
});

describe('priming and format selection', () => {
  const m = parseSpriteManifest(validJson());
  it('detects an untrimmed AAC decode from the decoded length', () => {
    expect(detectPrimingShift('m4a', m, m.totalSamples)).toBe(0);
    expect(detectPrimingShift('m4a', m, m.totalSamples + 3)).toBe(0);
    expect(detectPrimingShift('m4a', m, m.totalSamples + 1023)).toBe(0); // 只有尾端補齊
    expect(detectPrimingShift('m4a', m, m.totalSamples + 1024)).toBe(1024);
    expect(detectPrimingShift('m4a', m, m.totalSamples + 1024 + 600)).toBe(1024);
    expect(detectPrimingShift('ogg', m, m.totalSamples + 5000)).toBe(0);
  });
  it('falls back to m4a when Vorbis is not playable', () => {
    expect(pickSpriteFormat((t) => (t.includes('ogg') ? 'probably' : ''))).toBe('ogg');
    expect(pickSpriteFormat((t) => (t.includes('ogg') ? '' : 'probably'))).toBe('m4a');
  });
});

describe('generated sprite files (commit them: npm run build:audio)', () => {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, 'assets', 'manifest.json'), 'utf8')) as Record<string, Record<string, string | string[]>>;

  it('script groups match runtime groups', () => {
    expect(SCRIPT_GROUPS).toEqual(GROUP_CATEGORIES);
  });

  it('every manifest audio file is in exactly one sprite, with valid offsets', () => {
    const seen = new Map<string, number>();
    for (const g of SPRITE_GROUPS) {
      const m = parseSpriteManifest(JSON.parse(readFileSync(join(SPRITES, `${g}.json`), 'utf8')));
      for (const fmt of ['ogg', 'm4a'] as const) {
        const f = join(SPRITES, m.formats[fmt].file);
        expect(existsSync(f)).toBe(true);
        expect(statSync(f).size).toBe(m.formats[fmt].bytes);
      }
      const sorted = [...m.clips].sort((a, b) => a.start - b.start);
      let end = 0;
      for (const c of sorted) {
        expect(c.start - end).toBeGreaterThanOrEqual(Math.round(0.05 * m.sampleRate)); // 片段之間至少 50ms 靜音
        end = c.start + c.length;
      }
      expect(m.totalSamples - end).toBeGreaterThanOrEqual(Math.round(0.05 * m.sampleRate));
      for (const c of m.clips) seen.set(c.path, (seen.get(c.path) ?? 0) + 1);
      for (const c of m.clips) expect(GROUP_CATEGORIES[g]).toContain(c.key.split('.')[0]);
    }
    const expected: string[] = [];
    for (const cats of Object.values(GROUP_CATEGORIES)) {
      for (const cat of cats) for (const v of Object.values(manifest[cat] ?? {})) expected.push(...(Array.isArray(v) ? v : [v]));
    }
    expect([...seen.keys()].sort()).toEqual([...expected].sort());
    for (const n of seen.values()) expect(n).toBe(1);
  });

  const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
  const decode = (file: string, ch: number): Float32Array => {
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-f', 'f32le', '-ar', '44100', '-ac', String(ch), 'pipe:1'], { maxBuffer: 1 << 30 });
    const all = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const mono = new Float32Array(Math.floor(all.length / ch));
    for (let i = 0; i < mono.length; i++) mono[i] = all[i * ch]; // 第一聲道
    return mono;
  };
  const rms = (a: ArrayLike<number>): number => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * a[i];
    return Math.sqrt(s / Math.max(1, a.length));
  };

  it.skipIf(!hasFfmpeg)('slices of the decoded ogg and m4a match the original files (length < 20ms, RMS < 15%)', () => {
    for (const g of SPRITE_GROUPS) {
      const m = parseSpriteManifest(JSON.parse(readFileSync(join(SPRITES, `${g}.json`), 'utf8')));
      for (const fmt of ['ogg', 'm4a'] as const) {
        const pcm = decode(join(SPRITES, m.formats[fmt].file), m.channels);
        const shift = detectPrimingShift(fmt, m, pcm.length);
        expect(shift).toBe(0); // ffmpeg 會依 edit list 去掉 priming
        const clips = sliceClips(m, fmt, [pcm], shift);
        expect(clips).toHaveLength(m.clips.length);
        const picks = [0, Math.floor(clips.length / 4), Math.floor(clips.length / 2), Math.floor((clips.length * 3) / 4), clips.length - 1];
        for (const i of new Set(picks)) {
          const c = clips[i];
          const orig = decode(join(PUBLIC, 'assets', c.path), m.clips[i].channels);
          expect(Math.abs(c.data[0].length - orig.length) / 44100).toBeLessThan(0.02);
          const r0 = rms(orig), r1 = rms(c.data[0]);
          if (r0 > 1e-4) expect(Math.abs(r1 - r0) / r0).toBeLessThan(0.15);
        }
      }
    }
  }, 60_000);
});
