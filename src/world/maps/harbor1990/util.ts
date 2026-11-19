import * as THREE from 'three';
import { MapBuilder } from '../../MapBuilder';
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

export class Ctx {
  readonly b = new MapBuilder();
  readonly root = new THREE.Group();
  readonly zones: ReverbZone[] = [];
  readonly props: PropPlacement[] = [];
  readonly signs: SignSpec[] = [];
  readonly lights: LightSpec[] = [];
  readonly rng: () => number;

  constructor(seed = 1990) {
    this.rng = makeRng(seed);
    this.root.name = 'harbor1990';
  }

  /** 方塊（碰撞 + 渲染） */
  mm(s: Surface, c: THREE.ColorRepresentation, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.b.boxMinMax(s, c, x0, y0, z0, x1, y1, z1);
  }
  /** 純視覺 */
  vis(s: Surface, c: THREE.ColorRepresentation, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.b.visualBox(s, c, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0);
  }
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
    this.props.push({ kind, x, y, z, yaw, size, color });
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
  c.b.addStairs({ surface: s, color, altColor: platColor, x, y, z, yaw: DIR_YAW[dir], steps, rise: H / steps, depth: STAIR_DEPTH, width });
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
