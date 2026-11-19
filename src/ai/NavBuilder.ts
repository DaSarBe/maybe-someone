import * as THREE from 'three';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import type { Octree } from 'three/examples/jsm/math/Octree.js';
import type { NavGraph } from '../world/RaidMap';

export interface NavGridOptions {
  /** 節點間距（公尺） */
  spacing?: number;
  /** 從這個高度往下找地面（必須低於室內屋頂） */
  probeHeight?: number;
  /** 沿邊每隔多少公尺檢查一次地面落差與通行 */
  sample?: number;
  /** 每個取樣間隔允許的最大地面高度差（公尺） */
  maxRise?: number;
  /** 連通元件少於這個節點數就丟掉（孤島，例如貨櫃頂） */
  minComponent?: number;
}

/**
 * 在靜態碰撞（Octree）上自動產生導航圖：規則格點 + 8 向邊，
 * 節點必須有地面且身體放得下；邊必須沿線地面連續、身體通得過。
 * 地圖作者也可以手工寫 nav；這個工具讓大地圖少寫很多座標，也確保「節點之間可直線通行」。
 */
export function buildNavGrid(octree: Octree, bounds: THREE.Box3, o: NavGridOptions = {}): NavGraph {
  const spacing = o.spacing ?? 3;
  const probe = o.probeHeight ?? 3.3;
  const sample = o.sample ?? 0.4;
  const maxRise = o.maxRise ?? 0.26;
  const minComp = o.minComponent ?? 4;
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  const cap = new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0.32);

  const ground = (x: number, y: number, z: number, down = 12): number | null => {
    ray.origin.set(x, y, z);
    const hit = octree.rayIntersect(ray);
    return hit && hit.distance <= down ? hit.position.y : null;
  };
  const free = (x: number, y: number, z: number): boolean => {
    cap.start.set(x, y + 0.55, z);
    cap.end.set(x, y + 1.5, z);
    return !octree.capsuleIntersect(cap);
  };

  const cols = Math.floor((bounds.max.x - bounds.min.x) / spacing) + 1;
  const rows = Math.floor((bounds.max.z - bounds.min.z) / spacing) + 1;
  const idx = new Int32Array(cols * rows).fill(-1);
  const nodes: THREE.Vector3[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = bounds.min.x + c * spacing, z = bounds.min.z + r * spacing;
      const g = ground(x, probe, z);
      if (g === null || g > probe - 0.5) continue;
      if (!free(x, g + 0.02, z)) continue;
      idx[r * cols + c] = nodes.length;
      nodes.push(new THREE.Vector3(x, g, z));
    }
  }

  const edgeOk = (a: THREE.Vector3, b: THREE.Vector3): boolean => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / sample));
    let py = a.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const g = ground(x, py + 0.7, z, 1.3);
      if (g === null) return false;
      if (Math.abs(g - py) > maxRise) return false;
      if (!free(x, g + 0.02, z)) return false;
      py = g;
    }
    return Math.abs(py - b.y) < 0.2;
  };

  const edges: [number, number][] = [];
  const dirs: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = idx[r * cols + c];
      if (a < 0) continue;
      for (const [dc, dr] of dirs) {
        const c2 = c + dc, r2 = r + dr;
        if (c2 < 0 || c2 >= cols || r2 < 0 || r2 >= rows) continue;
        const b = idx[r2 * cols + c2];
        if (b < 0) continue;
        if (edgeOk(nodes[a], nodes[b]) && edgeOk(nodes[b], nodes[a])) edges.push([a, b]);
      }
    }
  }

  // 丟掉太小的連通元件（孤立的平台、貨櫃頂）
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const [a, b] of edges) parent[find(a)] = find(b);
  const size = new Map<number, number>();
  nodes.forEach((_, i) => size.set(find(i), (size.get(find(i)) ?? 0) + 1));
  const remap = new Int32Array(nodes.length).fill(-1);
  const kept: THREE.Vector3[] = [];
  nodes.forEach((n, i) => { if ((size.get(find(i)) ?? 0) >= minComp) { remap[i] = kept.length; kept.push(n); } });
  const keptEdges: [number, number][] = [];
  for (const [a, b] of edges) if (remap[a] >= 0 && remap[b] >= 0) keptEdges.push([remap[a], remap[b]]);
  return { nodes: kept, edges: keptEdges };
}
