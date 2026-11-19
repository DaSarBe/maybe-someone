import * as THREE from 'three';
import type { HitZone } from './Damage';

export interface ZoneHit {
  zone: HitZone;
  distance: number;
  point: THREE.Vector3;
}

interface Cyl { cx: number; cz: number; r: number; y0: number; y1: number }

const _o = new THREE.Vector3();
const _p = new THREE.Vector3();

/** 射線對垂直圓柱（含上下蓋）。回傳最近的 t（> 0）或 -1 */
function rayCylinder(o: THREE.Vector3, d: THREE.Vector3, c: Cyl): number {
  let best = Infinity;
  const ox = o.x - c.cx, oz = o.z - c.cz;
  const a = d.x * d.x + d.z * d.z;
  if (a > 1e-9) {
    const b = 2 * (ox * d.x + oz * d.z);
    const cc = ox * ox + oz * oz - c.r * c.r;
    const disc = b * b - 4 * a * cc;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
        if (t > 0 && t < best) {
          const y = o.y + d.y * t;
          if (y >= c.y0 && y <= c.y1) best = t;
        }
      }
    }
  }
  if (Math.abs(d.y) > 1e-9) {
    for (const y of [c.y0, c.y1]) {
      const t = (y - o.y) / d.y;
      if (t > 0 && t < best) {
        const x = ox + d.x * t, z = oz + d.z * t;
        if (x * x + z * z <= c.r * c.r) best = t;
      }
    }
  }
  return best === Infinity ? -1 : best;
}

function raySphere(o: THREE.Vector3, d: THREE.Vector3, cx: number, cy: number, cz: number, r: number): number {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  const t = -b - sq;
  if (t > 0) return t;
  const t2 = -b + sq;
  return t2 > 0 ? t2 : -1;
}

/**
 * 敵人的命中判定：依身高比例近似的幾何（頭 = 球、軀幹 / 手臂 / 雙腿 = 圓柱），
 * 以腳底位置與面向（forward = (sin f, cos f)）擺放。不依賴動畫骨架，所以便宜。
 * dir 必須是單位向量。maxDist 之外的不算。
 */
export function intersectHitZones(
  origin: THREE.Vector3, dir: THREE.Vector3,
  feet: THREE.Vector3, facing: number, height: number, maxDist = Infinity,
): ZoneHit | null {
  const k = height / 1.8;
  const rx = Math.cos(facing), rz = -Math.sin(facing); // 右側向量
  // 快速剔除：離射線太遠就不用測
  _o.set(feet.x - origin.x, feet.y + height * 0.5 - origin.y, feet.z - origin.z);
  const along = _o.dot(dir);
  if (along < -height || along > maxDist + height) return null;
  const perp2 = _o.lengthSq() - along * along;
  if (perp2 > (height * 0.75) * (height * 0.75)) return null;

  const lat = (off: number): { cx: number; cz: number } => ({ cx: feet.x + rx * off * k, cz: feet.z + rz * off * k });
  let best = maxDist;
  let zone: HitZone | null = null;
  const consider = (t: number, z: HitZone) => { if (t > 0 && t < best) { best = t; zone = z; } };

  consider(raySphere(origin, dir, feet.x, feet.y + 1.6 * k, feet.z, 0.17 * k), 'head');
  consider(rayCylinder(origin, dir, { cx: feet.x, cz: feet.z, r: 0.28 * k, y0: feet.y + 0.85 * k, y1: feet.y + 1.43 * k }), 'body');
  for (const s of [-1, 1]) {
    const l = lat(0.36 * s);
    consider(rayCylinder(origin, dir, { cx: l.cx, cz: l.cz, r: 0.1 * k, y0: feet.y + 0.85 * k, y1: feet.y + 1.4 * k }), 'limb');
    const g = lat(0.13 * s);
    consider(rayCylinder(origin, dir, { cx: g.cx, cz: g.cz, r: 0.14 * k, y0: feet.y, y1: feet.y + 0.88 * k }), 'limb');
  }
  if (!zone) return null;
  return { zone, distance: best, point: _p.copy(dir).multiplyScalar(best).add(origin).clone() };
}
