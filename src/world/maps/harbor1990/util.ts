import * as THREE from 'three';
import { MapBuilder, type StairsOptions } from '../../MapBuilder';
import type { ReverbZone, ReverbType, Surface } from '../../Surface';

/** 簡單的可重現亂數（mulberry32） */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rect { x0: number; z0: number; x1: number; z1: number }

/** 從矩形扣掉一組洞，回傳剩下的矩形（用於挖出隧道、水池） */
export function subtractRects(r: Rect, holes: Rect[]): Rect[] {
  let out: Rect[] = [r];
  for (const h of holes) {
    const next: Rect[] = [];
    for (const a of out) {
      if (h.x1 <= a.x0 || h.x0 >= a.x1 || h.z1 <= a.z0 || h.z0 >= a.z1) { next.push(a); continue; }
      if (h.z0 > a.z0) next.push({ x0: a.x0, z0: a.z0, x1: a.x1, z1: h.z0 });
      if (h.z1 < a.z1) next.push({ x0: a.x0, z0: h.z1, x1: a.x1, z1: a.z1 });
      const zz0 = Math.max(a.z0, h.z0), zz1 = Math.min(a.z1, h.z1);
      if (h.x0 > a.x0) next.push({ x0: a.x0, z0: zz0, x1: h.x0, z1: zz1 });
      if (h.x1 < a.x1) next.push({ x0: h.x1, z0: zz0, x1: a.x1, z1: zz1 });
    }
    out = next;
  }
  return out;
}

/** 會被 InstancedMesh 取代視覺的小道具：核心只產生碰撞，視覺在 decor 階段（需要瀏覽器）加上 */
export type PropKind = 'crate' | 'barrel' | 'barrels' | 'generator' | 'fence' | 'box_blue' | 'box_white';
export interface PropPlacement {
  kind: PropKind;
  x: number; y: number; z: number;
  yaw: number;
  /** 邊長 / 高度（公尺），依種類而定，見 PROP_DIMS */
  size: number;
  color?: string;
  /** 所屬區域（可見性分組用） */
  region?: string;
  /** 區域的明暗倍率（暗處的道具跟著變暗） */
  shade?: number;
}

export interface SignSpec {
  text: string;
  /** 世界座標中心 */
  x: number; y: number; z: number;
  /** 面向：0 = 面向 +z，Math.PI = 面向 -z，Math.PI/2 = 面向 +x，-Math.PI/2 = 面向 -x */
  yaw: number;
  w: number; h: number;
  bg: string; fg: string;
  /** 字體倍率 */
  font?: number;
  /** 直書 */
  vertical?: boolean;
}

export interface LightSpec {
  light: THREE.PointLight;
  /** 閃爍強度，0 = 不閃 */
  flicker: number;
  base: number;
  phase: number;
}

export type Opening = { a: number; b: number; h: number };

/**
 * 渲染區域：每個區域有自己的 MapBuilder（依材質合併成幾個 mesh），
 * 這樣可以做視錐剔除與分區可見性（室內細節只有玩家在裡面才畫）。碰撞全部合併進同一個 Octree。
 *  - outdoor：室外的東西，依距離顯示
 *  - shell：建築外殼（牆、樓板），永遠依距離顯示
 *  - interior：建築室內的家具與裝飾；只在玩家位於該建築（且在相鄰樓層）時顯示
 *  - underground：地下空間（隧道、停車場）；玩家在地下時才顯示
 */
export interface RegionMeta {
  name: string;
  kind: 'outdoor' | 'shell' | 'interior' | 'underground';
  /** interior / underground 所屬建築 id（見 visibility.ts 的 BUILDINGS） */
  building?: string;
  /** 樓層編號（interior 與玩家所在樓層相差 > 1 就不畫） */
  floor?: number;
  /** 不投射陰影（平坦的地面疊層等） */
  flat?: boolean;
}

export type TextureOpts = Partial<Record<Surface, { texture: THREE.Texture; tile: number }>>;

export class Ctx {
  private readonly builders = new Map<string, MapBuilder>();
  private cur = 'world';
  readonly regions = new Map<string, RegionMeta>([['world', { name: 'world', kind: 'outdoor' }]]);
  /** 目前區域內顏色的明暗倍率（貨艙、地下層等暗處用） */
  shade = 1;
  /** 幾何產生時順便提供的導航強制點（樓梯、門口），導航產生器會一起使用 */
  readonly navHints: { x: number; y: number; z: number }[] = [];
  private readonly tex: TextureOpts;
  readonly root = new THREE.Group();
  readonly zones: ReverbZone[] = [];
  readonly props: PropPlacement[] = [];
  readonly signs: SignSpec[] = [];
  readonly lights: LightSpec[] = [];
  readonly rng: () => number;

  constructor(seed = 1990, textures: TextureOpts = {}) {
    this.rng = makeRng(seed);
    this.tex = textures;
    this.root.name = 'harbor1990';
  }

  /** 目前區域的建構器（每個區域一個，惰性建立） */
  get b(): MapBuilder {
    let mb = this.builders.get(this.cur);
    if (!mb) {
      mb = new MapBuilder();
      for (const [s, t] of Object.entries(this.tex)) if (t) mb.useTexture(s as Surface, t.texture, t.tile);
      this.builders.set(this.cur, mb);
    }
    return mb;
  }
  get region(): string { return this.cur; }
  get allBuilders(): ReadonlyMap<string, MapBuilder> { return this.builders; }

  /** 切換目前區域（第一次出現時以 meta 註冊） */
  setRegion(name: string, meta?: Omit<RegionMeta, 'name'>): void {
    if (!this.regions.has(name)) this.regions.set(name, { name, ...(meta ?? { kind: 'outdoor' }) });
    this.cur = name;
  }
  /** 在某個區域裡執行 fn，結束後回到原本的區域；shade 也會還原 */
  within<T>(name: string, meta: Omit<RegionMeta, 'name'> | undefined, fn: () => T, shade?: number): T {
    const prev = this.cur, prevShade = this.shade;
    this.setRegion(name, meta);
    if (shade !== undefined) this.shade = shade;
    try { return fn(); } finally { this.cur = prev; this.shade = prevShade; }
  }

  private tint(c: THREE.ColorRepresentation): THREE.ColorRepresentation {
    return this.shade === 1 ? c : new THREE.Color(c).multiplyScalar(this.shade);
  }

  /** 方塊（碰撞 + 渲染） */
  mm(s: Surface, c: THREE.ColorRepresentation, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.b.boxMinMax(s, this.tint(c), x0, y0, z0, x1, y1, z1);
  }
  /** 純視覺 */
  vis(s: Surface, c: THREE.ColorRepresentation, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.b.visualBox(s, this.tint(c), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0);
  }
  /** 圓柱（碰撞 + 渲染） */
  cyl(s: Surface, color: THREE.ColorRepresentation, cx: number, y0: number, cz: number, r: number, h: number, seg = 14): void {
    this.b.cylinder(s, this.tint(color), cx, y0, cz, r, h, seg);
  }
  /** 門口兩側的導航點（axis = 牆的走向；a..b 是洞口；y 為該層地板高度） */
  doorHint(axis: 'x' | 'z', fixed: number, a: number, b: number, y: number, off = 1.1): void {
    const m = (a + b) / 2;
    if (axis === 'x') { this.hint(m, y, fixed - off); this.hint(m, y, fixed + off); } else { this.hint(fixed - off, y, m); this.hint(fixed + off, y, m); }
  }
  /** 樓梯（顏色套用 shade） */
  stairs(o: StairsOptions): void {
    this.b.addStairs({ ...o, color: this.tint(o.color), altColor: o.altColor === undefined ? undefined : this.tint(o.altColor) });
  }
  /** 導航強制點 */
  hint(x: number, y: number, z: number): void { this.navHints.push({ x, y, z }); }
  /** 純碰撞（隱形） */
  col(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.b.colliderMinMax(x0, y0, z0, x1, y1, z1);
  }

  zone(type: ReverbType, name: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.zones.push({ type, name, box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)) });
  }

  /** 沿 x 軸（axis='x'，z 固定）或 z 軸的牆，可開門窗；t 為厚度，以 fixed 為中線 */
  wall(
    axis: 'x' | 'z', fixed: number, t: number, from: number, to: number, y0: number, y1: number,
    ops: Opening[], s: Surface, color: THREE.ColorRepresentation,
  ): void {
    const put = (a: number, b: number, ya: number, yb: number): void => {
      if (b - a < 1e-4 || yb - ya < 1e-4) return;
      if (axis === 'x') this.mm(s, color, a, ya, fixed - t / 2, b, yb, fixed + t / 2);
      else this.mm(s, color, fixed - t / 2, ya, a, fixed + t / 2, yb, b);
    };
    const sorted = [...ops].sort((p, q) => p.a - q.a);
    let cur = from;
    for (const o of sorted) {
      put(cur, o.a, y0, y1);
      put(o.a, o.b, y0 + o.h, y1); // 門楣
      cur = o.b;
    }
    put(cur, to, y0, y1);
  }

  /** 填滿一個矩形的地面薄片（可挖洞）；topY 為頂面高度 */
  ground(s: Surface, color: THREE.ColorRepresentation, r: Rect, topY: number, thick: number, holes: Rect[] = []): void {
    for (const p of subtractRects(r, holes)) {
      if (p.x1 - p.x0 < 1e-3 || p.z1 - p.z0 < 1e-3) continue;
      this.mm(s, color, p.x0, topY - thick, p.z0, p.x1, topY, p.z1);
    }
  }

  prop(kind: PropKind, x: number, y: number, z: number, yaw: number, size: number, color?: string): void {
    this.props.push({ kind, x, y, z, yaw, size, color, region: this.cur, shade: this.shade });
    // 簡化碰撞：以 yaw 旋轉後的外接軸對齊方塊
    const [w, h, d] = PROP_DIMS[kind](size);
    const c = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
    const hx = (w * c + d * sn) / 2, hz = (w * sn + d * c) / 2;
    this.col(x - hx, y, z - hz, x + hx, y + h, z + hz);
  }

  sign(spec: SignSpec): void { this.signs.push(spec); }

  pointLight(x: number, y: number, z: number, color: string, intensity: number, distance: number, flicker = 0): void {
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(x, y, z);
    this.root.add(light);
    this.lights.push({ light, flicker, base: intensity, phase: this.rng() * 10 });
  }
}

/** 各道具的碰撞尺寸 [寬, 高, 深] */
export const PROP_DIMS: Record<PropKind, (size: number) => [number, number, number]> = {
  crate: (s) => [s, s, s],
  box_blue: (s) => [s * 1.2, s * 0.8, s],
  box_white: (s) => [s * 1.4, s * 0.7, s],
  barrel: (s) => [s * 0.65, s, s * 0.65],
  barrels: (s) => [s * 1.3, s, s * 1.3],
  generator: (s) => [s * 1.5, s, s * 0.9],
  fence: (s) => [s, 2.0, 0.15],
};

/** 階梯上行方向 → addStairs 的 yaw */
export const DIR_YAW = { '+x': 0, '-z': Math.PI / 2, '-x': Math.PI, '+z': -Math.PI / 2 } as const;
export type Dir = keyof typeof DIR_YAW;

/** flight() / uStair() 預設的每階深度 */
export const FLIGHT_DEPTH = 0.36;
export const STAIR_RISE = 0.25;
export const STAIR_DEPTH = 0.38;

/**
 * 以高度 H 為目標的樓梯 + 頂端平台。(x, z) 是第一階前緣中心，dir 為上行方向。
 * 回傳平台終點（上行方向最遠處）的座標。
 */
export function climb(
  c: Ctx, s: Surface, color: THREE.ColorRepresentation, platColor: THREE.ColorRepresentation,
  x: number, y: number, z: number, dir: Dir, width: number, H: number, landing = 2.4,
  platSurface: Surface = s,
): { endX: number; endZ: number } {
  const steps = Math.round(H / STAIR_RISE);
  c.stairs({ surface: s, color, altColor: platColor, x, y, z, yaw: DIR_YAW[dir], steps, rise: H / steps, depth: STAIR_DEPTH, width });
  const a = steps * STAIR_DEPTH - 0.05, bb = steps * STAIR_DEPTH + landing;
  const w2 = width / 2, top = y + H;
  let x0: number, x1: number, z0: number, z1: number;
  if (dir === '+x') { x0 = x + a; x1 = x + bb; z0 = z - w2; z1 = z + w2; }
  else if (dir === '-x') { x0 = x - bb; x1 = x - a; z0 = z - w2; z1 = z + w2; }
  else if (dir === '+z') { z0 = z + a; z1 = z + bb; x0 = x - w2; x1 = x + w2; }
  else { z0 = z - bb; z1 = z - a; x0 = x - w2; x1 = x + w2; }
  c.mm(platSurface, platColor, x0, top - 0.3, z0, x1, top, z1);
  const ex = dir === '+x' ? x + bb : dir === '-x' ? x - bb : x;
  const ez = dir === '+z' ? z + bb : dir === '-z' ? z - bb : z;
  return { endX: ex, endZ: ez };
}


// ---------------------------------------------------------------------------
// 多樓層用的樓梯工具

const AXIS_DIR = (axis: 'x' | 'z', d: 1 | -1): Dir => (axis === 'x' ? (d > 0 ? '+x' : '-x') : d > 0 ? '+z' : '-z');

export interface FlightSpec {
  axis: 'x' | 'z';
  /** 上行方向 */
  dir: 1 | -1;
  /** 第一階前緣沿 axis 的座標 */
  u: number;
  /** 梯寬中心沿另一軸的座標 */
  v: number;
  width: number;
  /** 底部高度與總高度 */
  y: number;
  H: number;
  s: Surface;
  color: THREE.ColorRepresentation;
  alt?: THREE.ColorRepresentation;
  depth?: number;
  /** 最大每階高度（預設 0.25）；斜坡道用很小的值 */
  maxRise?: number;
  /** 底下用隱形碰撞填實（預設 true） */
  fill?: boolean;
  /** 指定階數（斜坡道用，避免浮點誤差） */
  steps?: number;
}

const to3 = (axis: 'x' | 'z', u: number, v: number, y: number): P3Like => (axis === 'x' ? { x: u, y, z: v } : { x: v, y, z: u });
export type P3Like = { x: number; y: number; z: number };

/**
 * 一段直線樓梯（addStairs + 底下填實）。回傳沿途的導航點（底、每約 1.4m、頂）與水平佔地長度。
 * 斜坡表面高度與 MapBuilder.addStairs 的碰撞斜坡一致：y(t) = y0 + rise * (t / depth + 0.5)。
 */
export function flight(c: Ctx, f: FlightSpec): { run: number; steps: number; rise: number; pts: P3Like[]; topU: number } {
  const depth = f.depth ?? FLIGHT_DEPTH;
  const steps = f.steps ?? Math.ceil(f.H / (f.maxRise ?? STAIR_RISE) - 1e-6);
  const rise = f.H / steps;
  const run = steps * depth;
  const [x, z] = axisXZ(f.axis, f.u, f.v);
  c.stairs({ surface: f.s, color: f.color, altColor: f.alt ?? f.color, x, y: f.y, z, yaw: DIR_YAW[AXIS_DIR(f.axis, f.dir)], steps, rise, depth, width: f.width });
  const surfY = (t: number): number => f.y + rise * (t / depth + 0.5);
  const hw = f.width / 2;
  if (f.fill !== false) {
    // 以每 3 階一段的隱形填實，頂面不超過該段最低點的斜坡面
    const seg = 3;
    for (let k = 0; k < steps; k += seg) {
      const t0 = Math.max(0, k * depth - depth / 2), t1 = Math.min(run, (k + seg) * depth);
      const top = surfY(t0) - 0.06;
      const a = f.u + f.dir * t0, b = f.u + f.dir * t1;
      const u0 = Math.min(a, b), u1 = Math.max(a, b);
      if (f.axis === 'x') c.col(u0, f.y - 1, f.v - hw, u1, top, f.v + hw);
      else c.col(f.v - hw, f.y - 1, u0, f.v + hw, top, u1);
    }
  }
  const pts: P3Like[] = [];
  const n = Math.max(2, Math.round(run / 1.4));
  for (let i = 0; i <= n; i++) {
    const t = Math.min(run - 0.6, Math.max(0.6, (run * i) / n));
    pts.push(to3(f.axis, f.u + f.dir * t, f.v, surfY(t)));
  }
  return { run, steps, rise, pts, topU: f.u + f.dir * run };
}
const axisXZ = (axis: 'x' | 'z', u: number, v: number): [number, number] => (axis === 'x' ? [u, v] : [v, u]);

export interface UStairSpec {
  axis: 'x' | 'z';
  /** A 段的上行方向 */
  dir: 1 | -1;
  /** A 段第一階前緣（樓梯間的入口端）沿 axis 的座標 */
  u: number;
  /** 梯間低邊（另一軸）座標 */
  v: number;
  /** 單段梯寬 */
  w: number;
  gap?: number;
  y: number;
  H: number;
  s: Surface;
  color: THREE.ColorRepresentation;
  alt?: THREE.ColorRepresentation;
  plat: THREE.ColorRepresentation;
  /** 平台長度 */
  landing?: number;
  depth?: number;
  /** 梯下填實（只有最底層，底下是地面；上層的梯下是樓梯井，不能填） */
  solid?: boolean;
}

/**
 * 轉折樓梯（U 形）：A 段上行到中間平台，B 段折返到上一層。上一層的樓板要在梯間開洞：
 * 開洞範圍 = 回傳的 hole（從 B 段頂端的外側到平台末端，不含入口端的「前廳」）。
 */
export function uStair(c: Ctx, o: UStairSpec): { hole: Rect; total: number; run: number; pts: P3Like[]; landingPt: P3Like; bottomPt: P3Like; topPt: P3Like } {
  const gap = o.gap ?? 0.2, LD = o.landing ?? 2.2;
  const halfH = o.H / 2;
  const vA = o.v + o.w / 2, vB = o.v + o.w + gap + o.w / 2;
  const A = flight(c, { axis: o.axis, dir: o.dir, u: o.u, v: vA, width: o.w, y: o.y, H: halfH, s: o.s, color: o.color, alt: o.alt, depth: o.depth, fill: !!o.solid });
  const u1 = o.u + o.dir * A.run;
  // 中間平台：實心（從下層樓板到平台頂）
  const midY = o.y + halfH;
  const uEnd = u1 + o.dir * LD;
  const lo = Math.min(u1 - o.dir * 0.05, uEnd), hi = Math.max(u1 - o.dir * 0.05, uEnd);
  const lb = o.solid ? o.y : midY - 0.3;
  if (o.axis === 'x') c.mm(o.s, o.plat, lo, lb, o.v, hi, midY, o.v + 2 * o.w + gap);
  else c.mm(o.s, o.plat, o.v, lb, lo, o.v + 2 * o.w + gap, midY, hi);
  const B = flight(c, { axis: o.axis, dir: (-o.dir) as 1 | -1, u: u1, v: vB, width: o.w, y: midY, H: halfH, s: o.s, color: o.color, alt: o.alt, depth: o.depth, fill: false });
  // B 段下方：從下層樓板填到該段斜面（隱形）
  const seg = 3;
  for (let k = 0; o.solid && k < B.steps; k += seg) {
    const depth = o.depth ?? FLIGHT_DEPTH;
    const t0 = Math.max(0, k * depth - depth / 2), t1 = Math.min(B.run, (k + seg) * depth);
    const top = midY + B.rise * (t0 / depth + 0.5) - 0.06;
    const a = u1 - o.dir * t0, b = u1 - o.dir * t1;
    const u0 = Math.min(a, b), uu1 = Math.max(a, b);
    if (o.axis === 'x') c.col(u0, o.y, vB - o.w / 2, uu1, top, vB + o.w / 2);
    else c.col(vB - o.w / 2, o.y, u0, vB + o.w / 2, top, uu1);
  }
  // 兩段之間的縫隙（分隔牆，視覺 + 碰撞）
  const sep0 = o.v + o.w, sep1 = o.v + o.w + gap;
  const sl = Math.min(o.u, u1), sh = Math.max(o.u, u1);
  if (o.axis === 'x') c.mm(o.s, o.plat, sl, o.y, sep0, sh, o.y + o.H, sep1);
  else c.mm(o.s, o.plat, sep0, o.y, sl, sep1, o.y + o.H, sh);
  // 欄杆：平台外緣沒有牆的那一側不需要（樓梯間四周都是牆）
  const holeU0 = Math.min(o.u + o.dir * 0.0, uEnd), holeU1 = Math.max(o.u + o.dir * 0.0, uEnd);
  const hole: Rect = o.axis === 'x'
    ? { x0: holeU0, x1: holeU1, z0: o.v, z1: o.v + 2 * o.w + gap }
    : { x0: o.v, x1: o.v + 2 * o.w + gap, z0: holeU0, z1: holeU1 };
  const landingPt = to3(o.axis, (u1 + uEnd) / 2, o.v + o.w + gap / 2, midY);
  // 平台與兩段的交接處補一個中心點，方便導航
  return {
    hole, total: A.run + LD, run: A.run, pts: [...A.pts, landingPt, ...B.pts],
    landingPt, bottomPt: to3(o.axis, o.u - o.dir * 0.8, vA, o.y), topPt: to3(o.axis, o.u - o.dir * 0.8, vB, o.y + o.H),
  };
}
