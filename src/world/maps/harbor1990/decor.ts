import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fitModel, loadModel } from '../../Models';
import type { Surface } from '../../Surface';
import type { HarborCore, HarborCoreOptions } from './core';
import { HarborVisibility } from './visibility';
import type { PropKind, PropPlacement, SignSpec } from './util';

/** 只在瀏覽器執行的視覺層：貼圖、招牌、模型實例、天空、光線、海面與動畫 */

const TEX_BASE = import.meta.env.BASE_URL + 'assets/textures/';
const CJK = '"Noto Sans CJK TC","Noto Sans TC","Microsoft JhengHei","PingFang TC","WenQuanYi Zen Hei",sans-serif';

// ---------------------------------------------------------------- 貼圖
function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.anisotropy = 2;
  return t;
}

function noise(g: CanvasRenderingContext2D, s: number, n: number, colors: string[], max = 3): void {
  let seed = 7;
  const r = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    g.fillRect(Math.floor(r() * s), Math.floor(r() * s), 1 + Math.floor(r() * max), 1 + Math.floor(r() * max));
  }
}

const proceduralTextures: Partial<Record<Surface, { make: () => THREE.Texture; tile: number }>> = {
  // 貨櫃的波浪紋：垂直條紋 + 鏽斑
  metal: {
    tile: 1.5,
    make: () => canvasTex(128, (g, s) => {
      g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 8) {
        g.fillStyle = '#f2f2f2'; g.fillRect(x, 0, 2, s);
        g.fillStyle = '#9a9a9a'; g.fillRect(x + 4, 0, 3, s);
      }
      noise(g, s, 140, ['#8a6a50', '#a47a5a', '#7a7a7a'], 4);
    }),
  },
  metal_hollow: {
    tile: 3,
    make: () => canvasTex(128, (g, s) => {
      g.fillStyle = '#b4b6b6'; g.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 32) { g.fillStyle = '#dadcdc'; g.fillRect(x, 0, 3, s); g.fillStyle = '#8c8f90'; g.fillRect(x + 3, 0, 3, s); }
      noise(g, s, 100, ['#8a7058', '#9c8a78'], 4);
    }),
  },
  metal_grate: {
    tile: 1,
    make: () => canvasTex(64, (g, s) => {
      g.fillStyle = '#4a5156'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#b9c2c7';
      for (let i = 0; i < s; i += 16) { g.fillRect(i, 0, 3, s); g.fillRect(0, i, s, 3); }
    }),
  },
  tile: {
    tile: 1.6,
    make: () => canvasTex(128, (g, s) => {
      g.fillStyle = '#8f9690'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#f2f1ea';
      for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
      noise(g, s, 60, ['#d8d6cc', '#c9c7bd'], 3);
    }),
  },
  carpet: {
    tile: 2,
    make: () => canvasTex(64, (g, s) => {
      g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, s, s);
      noise(g, s, 500, ['#bdbdbd', '#f0f0f0', '#cfcfcf'], 2);
    }),
  },
  sand: {
    tile: 3,
    make: () => canvasTex(64, (g, s) => {
      g.fillStyle = '#e6e0cc'; g.fillRect(0, 0, s, s);
      noise(g, s, 300, ['#cfc7ab', '#f4efdc', '#d9d1b8'], 2);
    }),
  },
  water: {
    tile: 4,
    make: () => canvasTex(64, (g, s) => {
      g.fillStyle = '#9fb8c4'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#d9eef6'; g.lineWidth = 2;
      for (let y = 8; y < s; y += 16) { g.beginPath(); for (let x = 0; x <= s; x += 4) g.lineTo(x, y + Math.sin(x / 6 + y) * 2); g.stroke(); }
    }),
  },
};

/** mix：往灰白色混合的比例（降低對比，避免大面積牆面/地面像迷彩） */
const imageTextures: Partial<Record<Surface, { file: string; tile: number; mix: number }>> = {
  concrete: { file: 'surface_concrete.png', tile: 3, mix: 0.78 },
  wood: { file: 'surface_wood.png', tile: 2, mix: 0.4 },
  grass: { file: 'surface_grass.png', tile: 4, mix: 0.3 },
  gravel: { file: 'surface_gravel.png', tile: 3, mix: 0.3 },
  dirt: { file: 'surface_dirt.png', tile: 4, mix: 0.35 },
};

function softened(img: HTMLImageElement, mix: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  g.globalAlpha = mix;
  g.fillStyle = '#c4c4c4';
  g.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.anisotropy = 2;
  return t;
}

/** 載入各材質的貼圖（失敗的材質退回純頂點色） */
export async function loadHarborTextures(): Promise<NonNullable<HarborCoreOptions['textures']>> {
  const out: NonNullable<HarborCoreOptions['textures']> = {};
  const loader = new THREE.TextureLoader();
  await Promise.all(Object.entries(imageTextures).map(async ([s, cfg]) => {
    try {
      const src = await loader.loadAsync(TEX_BASE + cfg!.file);
      out[s as Surface] = { texture: softened(src.image as HTMLImageElement, cfg!.mix), tile: cfg!.tile };
      src.dispose();
    } catch (err) {
      console.warn(`[harbor] texture ${cfg!.file} failed`, err);
    }
  }));
  for (const [s, p] of Object.entries(proceduralTextures)) out[s as Surface] = { texture: p!.make(), tile: p!.tile };
  return out;
}

// ---------------------------------------------------------------- 招牌（合併成一張圖集、一個 draw call）
function buildSigns(allSigns: SignSpec[]): THREE.Mesh | null {
  if (!allSigns.length) return null;
  // 招牌很多（100+）：依高寬比由高到低排，一列一列塞進 2048 的圖集
  const signs = [...allSigns].sort((a, b) => b.h / b.w - a.h / a.w);
  const ATLAS = 2048, CELL_W = 288;
  const atlas = document.createElement('canvas');
  atlas.width = atlas.height = ATLAS;
  const g = atlas.getContext('2d')!;
  g.fillStyle = '#222'; g.fillRect(0, 0, ATLAS, ATLAS);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let cx = 0, cy = 0, rowH = 0;
  for (const s of signs) {
    const cw = s.vertical ? 64 : CELL_W, ch = s.vertical ? 160 : Math.max(40, Math.min(160, Math.round((CELL_W * s.h) / s.w)));
    if (cy + ch > ATLAS) { console.warn('[harbor] sign atlas full, skipping', s.text); continue; }
    if (cx + cw > ATLAS) { cx = 0; cy += rowH + 4; rowH = 0; }
    rowH = Math.max(rowH, ch);
    // 畫招牌
    g.fillStyle = s.bg; g.fillRect(cx, cy, cw, ch);
    g.strokeStyle = s.fg; g.lineWidth = Math.max(2, ch / 22);
    g.strokeRect(cx + 4, cy + 4, cw - 8, ch - 8);
    if (s.vertical) {
      // 直書：一個字一格，由上往下排
      const chars = [...s.text];
      const fs = Math.floor(Math.min(cw * 0.72, (ch - 12) / chars.length * 0.92));
      g.font = `700 ${fs}px ${CJK}`;
      g.fillStyle = s.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      chars.forEach((chr, i) => g.fillText(chr, cx + cw / 2, cy + 8 + ((ch - 16) * (i + 0.5)) / chars.length));
    } else {
      const fs = Math.floor(ch * 0.62 * (s.font ?? 0.85) / 0.85);
      g.font = `700 ${fs}px ${CJK}`;
      const w = g.measureText(s.text).width;
      const k = Math.min(1, (cw - 28) / w);
      g.save();
      g.translate(cx + cw / 2, cy + ch / 2 + 2);
      g.scale(k, 1);
      g.fillStyle = s.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(s.text, 0, 0);
      g.restore();
    }
    // 幾何
    const rx = Math.cos(s.yaw) * s.w / 2, rz = -Math.sin(s.yaw) * s.w / 2, ry = s.h / 2;
    const base = pos.length / 3;
    pos.push(s.x - rx, s.y - ry, s.z - rz, s.x + rx, s.y - ry, s.z + rz, s.x + rx, s.y + ry, s.z + rz, s.x - rx, s.y + ry, s.z - rz);
    const u0 = cx / ATLAS, u1 = (cx + cw) / ATLAS, v0 = 1 - (cy + ch) / ATLAS, v1 = 1 - cy / ATLAS;
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    cx += cw + 4;
  }
  const tex = new THREE.CanvasTexture(atlas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: '#d8d4d0' }));
  mesh.name = 'signs';
  return mesh;
}

// ---------------------------------------------------------------- 道具實例化
interface KindCfg { model: string; by: 'height' | 'max'; surface: Surface; fallback: () => THREE.BufferGeometry; color: string; /** 模型的基準尺寸（公尺），實例縮放 = size / ref */ ref: number }
/** 木箱：方形箱體 + 上下兩圈較暗的板條（prop_crate 模型是扁的手提箱，留給搜刮容器用） */
function crateGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, color: string): void => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(x, y, z);
    const c = new THREE.Color(color), n = g.getAttribute('position').count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  add(1, 1, 1, 0, 0.5, 0, '#b08650');
  for (const y of [0.1, 0.9]) add(1.02, 0.12, 1.02, 0, y, 0, '#6f4d2c');
  for (const [x, z] of [[-0.44, -0.44], [0.44, -0.44], [-0.44, 0.44], [0.44, 0.44]]) add(0.12, 1.02, 0.12, x, 0.5, z, '#6f4d2c');
  return mergeGeometries(parts, false)!;
}

const KINDS: Record<PropKind, KindCfg> = {
  crate: { model: '', by: 'max', surface: 'wood', fallback: crateGeometry, color: '#a2703c', ref: 1 },
  barrel: { model: 'prop_barrel', by: 'height', surface: 'metal', fallback: () => new THREE.CylinderGeometry(0.33, 0.33, 1, 8).translate(0, 0.5, 0), color: '#3d6a8a', ref: 1 },
  barrels: { model: 'prop_barrels', by: 'height', surface: 'metal', fallback: () => new THREE.CylinderGeometry(0.65, 0.65, 1, 8).translate(0, 0.5, 0), color: '#b0452e', ref: 1 },
  generator: { model: 'prop_generator', by: 'height', surface: 'metal', fallback: () => new THREE.BoxGeometry(1.5, 1, 0.9).translate(0, 0.5, 0), color: '#c28a22', ref: 1 },
  fence: { model: 'prop_fence', by: 'max', surface: 'metal', fallback: () => new THREE.BoxGeometry(1, 2, 0.08).translate(0, 1, 0), color: '#8a9096', ref: 1 },
  box_blue: { model: '', by: 'max', surface: 'wood', fallback: () => new THREE.BoxGeometry(1.2, 0.8, 1).translate(0, 0.4, 0), color: '#2d6aa8', ref: 1 },
  box_white: { model: '', by: 'max', surface: 'wood', fallback: () => new THREE.BoxGeometry(1.4, 0.7, 1).translate(0, 0.35, 0), color: '#e8ece8', ref: 1 },
};

function lambertify(m: THREE.Material): THREE.Material {
  const s = m as THREE.MeshStandardMaterial;
  if (!s.isMeshStandardMaterial) return m;
  const l = new THREE.MeshLambertMaterial({ color: s.color, map: s.map, vertexColors: s.vertexColors, side: s.side, transparent: s.transparent, opacity: s.opacity, alphaTest: s.alphaTest });
  return l;
}

/** 同一貼圖（或都沒貼圖）的零件合併成一個幾何：烘焙節點矩陣與材質顏色（頂點色），一種道具只剩 1～2 個 draw call */
function mergeParts(parts: { geo: THREE.BufferGeometry; mat: THREE.Material; local: THREE.Matrix4 }[]): { geo: THREE.BufferGeometry; mat: THREE.Material; local: THREE.Matrix4 }[] {
  const groups = new Map<string, typeof parts>();
  for (const p of parts) {
    const map = (p.mat as THREE.MeshLambertMaterial).map;
    const key = map ? map.uuid : 'none';
    const l = groups.get(key) ?? [];
    l.push(p);
    groups.set(key, l);
  }
  const out: typeof parts = [];
  for (const [key, list] of groups) {
    const baked: THREE.BufferGeometry[] = [];
    const textured = key !== 'none';
    for (const p of list) {
      let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      g.applyMatrix4(p.local);
      const hasColor = !!g.getAttribute('color');
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color' && !(textured && name === 'uv')) g.deleteAttribute(name);
      if (textured && !g.getAttribute('uv')) g = g.clone().setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      if (!hasColor) {
        const col = (p.mat as THREE.MeshLambertMaterial).color ?? new THREE.Color(1, 1, 1);
        const n = g.getAttribute('position').count;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      }
      baked.push(g);
    }
    const merged = mergeGeometries(baked, false);
    if (!merged) continue;
    const map = (list[0].mat as THREE.MeshLambertMaterial).map;
    out.push({ geo: merged, mat: new THREE.MeshLambertMaterial({ vertexColors: true, map: map ?? null }), local: new THREE.Matrix4() });
  }
  return out;
}

async function buildProps(props: PropPlacement[], regionGroups: Map<string, THREE.Object3D>): Promise<THREE.InstancedMesh[]> {
  const out: THREE.InstancedMesh[] = [];
  // 依「種類 × 區域」分組：每個區域的道具掛在該區域的 Group 底下，跟著區域一起顯示 / 隱藏 / 視錐剔除
  const byKind = new Map<string, PropPlacement[]>();
  for (const p of props) { const k = `${p.kind}|${p.region ?? 'world'}`; const l = byKind.get(k) ?? []; l.push(p); byKind.set(k, l); }
  const place = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const [key, list] of byKind) {
    const [kindName, regionName] = key.split('|');
    const kind = kindName as PropKind;
    const cfg = KINDS[kind];
    const obj = cfg.model ? await loadModel(cfg.model) : null;
    const parts: { geo: THREE.BufferGeometry; mat: THREE.Material; local: THREE.Matrix4 }[] = [];
    if (obj) {
      const base = fitModel(obj, cfg.ref, cfg.by);
      base.updateMatrixWorld(true);
      base.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) parts.push({ geo: m.geometry, mat: lambertify(m.material as THREE.Material), local: m.matrixWorld.clone() });
      });
    }
    if (!parts.length) {
      const fb = cfg.fallback();
      parts.push({ geo: fb, mat: new THREE.MeshLambertMaterial({ color: fb.getAttribute('color') ? '#ffffff' : cfg.color, vertexColors: !!fb.getAttribute('color') }), local: new THREE.Matrix4() });
    }
    for (const part of mergeParts(parts)) {
      const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      im.name = `prop_${kind}`;
      im.userData.surface = cfg.surface;
      const dark = list.some((p) => (p.shade ?? 1) !== 1);
      const tint = new THREE.Color();
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.yaw);
        sc.setScalar(p.size / cfg.ref);
        pp.set(p.x, p.y, p.z);
        place.compose(pp, q, sc).multiply(part.local);
        im.setMatrixAt(i, place);
        if (dark) im.setColorAt(i, tint.setScalar(p.shade ?? 1));
      });
      im.instanceMatrix.needsUpdate = true;
      const rg = regionGroups.get(regionName) ?? null;
      // 小道具（木箱、油桶）不投射陰影：省下一半的 draw call，視覺上幾乎看不出差別（貨櫃、牆、屋頂的陰影才明顯）
      im.castShadow = false;
      im.receiveShadow = true;
      rg?.add(im);
      out.push(im);
    }
  }
  return out;
}

// ---------------------------------------------------------------- 天空 / 光線 / 海
export interface Atmosphere { background: THREE.Color; fogColor: THREE.Color; fogNear: number; fogFar: number }
export const ATMOSPHERE: Atmosphere = {
  background: new THREE.Color('#9a8a90'),
  fogColor: new THREE.Color('#9a8a90'),
  fogNear: 38,
  fogFar: 150,
};

/** 傍晚的天空穹頂：跟著相機移動，不受霧影響 */
function buildSky(onView?: (cam: THREE.Camera) => void): THREE.Mesh {
  const geo = new THREE.SphereGeometry(150, 16, 10);
  const pos = geo.getAttribute('position');
  const cols = new Float32Array(pos.count * 3);
  const top = new THREE.Color('#3d4766'), mid = new THREE.Color('#8f7a8c'), hor = ATMOSPHERE.fogColor.clone();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / 150, -0.2, 1);
    if (t < 0.25) c.copy(hor).lerp(mid, Math.max(0, t) / 0.25); else c.copy(mid).lerp(top, (t - 0.25) / 0.75);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.name = 'sky';
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.matrixAutoUpdate = false;
  sky.onBeforeRender = (_r, _s, camera) => {
    sky.matrixWorld.makeTranslation(camera.position.x, 0, camera.position.z);
    onView?.(camera);
  };
  return sky;
}

/** 把霧與背景色套到 scene（RaidScene 與預覽場景都可以呼叫；root 加進 scene 時也會自動套用） */
export function applyHarborAtmosphere(scene: THREE.Scene): void {
  scene.background = ATMOSPHERE.background;
  scene.fog = new THREE.Fog(ATMOSPHERE.fogColor, ATMOSPHERE.fogNear, ATMOSPHERE.fogFar);
}

function buildLights(root: THREE.Object3D, coarse: boolean): { sun: THREE.DirectionalLight; follow: (x: number, z: number) => void } {
  root.add(new THREE.HemisphereLight('#bcc4d8', '#9a8a82', 2.8));
  const sun = new THREE.DirectionalLight('#ffc794', 3.2);
  sun.position.set(-70, 45, 55);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  const size = coarse ? 1024 : 2048;
  sun.shadow.mapSize.set(size, size);
  // 地圖變大（260 × 230m）：陰影只涵蓋相機周圍 ±80m（霧 150m 外本來就看不到），並對齊陰影貼圖的像素格避免閃爍
  const e = 80, cam = sun.shadow.camera;
  cam.left = -e; cam.right = e; cam.top = e; cam.bottom = -e; cam.near = 5; cam.far = 220;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  root.add(sun, sun.target);
  const texel = (2 * e) / size, offset = sun.position.clone().sub(sun.target.position);
  const follow = (x: number, z: number): void => {
    const tx = Math.round(x / texel) * texel, tz = Math.round(z / texel) * texel;
    if (tx === sun.target.position.x && tz === sun.target.position.z) return;
    sun.target.position.set(tx, 0, tz);
    sun.position.set(tx + offset.x, offset.y, tz + offset.z);
  };
  return { sun, follow };
}

// ---------------------------------------------------------------- 總裝
export interface Decor {
  extraSurfaceMeshes: THREE.Mesh[];
  /** 分區可見性（依最近一次算圖的相機位置；除錯與測試可以直接讀 stats） */
  visibility: HarborVisibility;
  update(dt: number, elapsed: number): void;
}

export async function decorateHarbor(core: HarborCore): Promise<Decor> {
  const { ctx, root } = core;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const { follow } = buildLights(root, coarse);
  // 分區可見性與陰影範圍都跟著「最近一次算圖的相機」走（相機位置在算圖時才知道，所以晚一幀生效）
  const visibility = new HarborVisibility(core.regions);
  const viewer = new THREE.Vector3(Infinity, 0, 0);
  root.add(buildSky((cam) => { viewer.copy(cam.position); follow(cam.position.x, cam.position.z); }));

  const signs = buildSigns(ctx.signs);
  if (signs) root.add(signs);

  const regionGroups = new Map<string, THREE.Object3D>(core.regions.map((r) => [r.meta.name, r.object]));
  const propMeshes = await buildProps(ctx.props, regionGroups);
  for (const m of propMeshes) if (!m.parent) root.add(m);
  // 道具加進區域之後，區域的包圍盒要重算（可見性的距離判斷用）
  for (const r of core.regions) { r.object.updateMatrixWorld(true); r.box.setFromObject(r.object); }
  visibility.refresh();

  // 海面：略微起伏
  const seaGeo = new THREE.PlaneGeometry(520, 300, 26, 15);
  seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshLambertMaterial({ color: '#4a6678' }));
  sea.position.set(0, -0.85, -64.2 - 150);
  sea.name = 'sea';
  root.add(sea);
  const seaBase = Float32Array.from(seaGeo.getAttribute('position').array as Float32Array);

  // 燈塔光束
  const beam = new THREE.Group();
  beam.position.set(82, 18.5, -57);
  const beamMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 3.2).rotateX(-Math.PI / 2).translate(23, 0, 0),
    new THREE.MeshBasicMaterial({ color: '#fff0b0', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  beam.add(beamMesh);
  root.add(beam);

  // 進入 scene 時自動套用霧與背景
  root.addEventListener('added', () => {
    let p: THREE.Object3D | null = root.parent;
    while (p && !(p as THREE.Scene).isScene) p = p.parent;
    if (p) applyHarborAtmosphere(p as THREE.Scene);
  });

  const lights = ctx.lights;
  return {
    extraSurfaceMeshes: propMeshes,
    visibility,
    update(_dt, t): void {
      if (viewer.x !== Infinity) visibility.update(viewer);
      const p = seaGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = seaBase[i * 3], z = seaBase[i * 3 + 2];
        p.setY(i, Math.sin(x * 0.06 + t * 0.9) * 0.22 + Math.cos(z * 0.09 + t * 0.7) * 0.18);
      }
      p.needsUpdate = true;
      beam.rotation.y = t * 0.6;
      for (const l of lights) {
        if (l.flicker <= 0) continue;
        // 日光燈接觸不良：偶爾閃一下
        const s = Math.sin(t * 23 + l.phase) * Math.sin(t * 7.3 + l.phase * 1.7);
        l.light.intensity = l.base * (s > 0.86 ? 1 - l.flicker : 1 - 0.04 * Math.abs(s));
      }
    },
  };
}
