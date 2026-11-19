import * as THREE from 'three';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import type { Octree } from 'three/examples/jsm/math/Octree.js';

/**
 * 導航圖的產生與驗證工具（只在離線產生器與單元測試使用，不會被遊戲載入）。
 * 驗證規則和 PlayerController 對齊：站立膠囊半徑 0.35、可跨越 0.45m 台階、坡度 ny > 0.7。
 */
export const NAV_RADIUS = 0.4;
const STAND_H = 1.75;
const LIFT = 0.12;
const STEP_H = 0.45;
const WALKABLE_NY = 0.7;
const SAMPLE = 0.3;

const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
const cap = new Capsule(new THREE.Vector3(), new THREE.Vector3(), NAV_RADIUS);
const tmpN = new THREE.Vector3();

export type P3 = { x: number; y: number; z: number };

/** 從 (x, fromY) 往下找第一個向上的面；回傳高度與法線 y，沒有則 null */
export function groundBelow(oct: Octree, x: number, z: number, fromY: number): { y: number; ny: number } | null {
  ray.origin.set(x, fromY, z);
  const hit = oct.rayIntersect(ray);
  if (!hit) return null;
  return { y: fromY - hit.distance, ny: hit.triangle.getNormal(tmpN).y };
}

/** (x, z) 上所有可站立的面（由上往下掃描，含貨櫃頂、二樓等多層）。容器等實心物體「裡面」不會出現 */
export function standableLevels(oct: Octree, x: number, z: number, topY = 60): number[] {
  const out: number[] = [];
  let from = topY;
  for (let guard = 0; guard < 10; guard++) {
    const g = groundBelow(oct, x, z, from);
    if (!g) break;
    from = g.y - 0.3;
    if (g.ny >= WALKABLE_NY) out.push(g.y);
  }
  return out;
}

/** 點是否站在某個可站立面上（容許 tol 公尺），回傳該面的高度；站在實心物體裡面會回傳 null */
export function surfaceHeightAt(oct: Octree, p: P3, tol = 0.15): number | null {
  for (const y of standableLevels(oct, p.x, p.z)) if (Math.abs(y - p.y) <= tol) return y;
  return null;
}

const _tris: any[] = [];
const _hit = new THREE.Vector3();
const _n = new THREE.Vector3();
/** 沿 dir 射線，最近的命中面是否「背面」（法線與射線同向）——代表出發點在實心物體裡面 */
function nearestIsBackface(oct: Octree, ox: number, oy: number, oz: number, dy: number): boolean {
  ray.origin.set(ox, oy, oz);
  ray.direction.set(0, dy, 0);
  _tris.length = 0;
  oct.getRayTriangles(ray, _tris);
  let best = Infinity;
  let back = false;
  for (const t of _tris) {
    if (!ray.intersectTriangle(t.a, t.b, t.c, false, _hit)) continue;
    const d = _hit.distanceTo(ray.origin);
    t.getNormal(_n);
    const isBack = _n.y * dy > 0;
    if (d < best - 1e-4) { best = d; back = isBack; } else if (Math.abs(d - best) <= 1e-4 && isBack) back = true;
  }
  ray.direction.set(0, -1, 0);
  return best < Infinity && back;
}

/** (x, y) 站立點的身體中心是否埋在實心碰撞體裡 */
export function insideSolid(oct: Octree, x: number, y: number, z: number): boolean {
  return nearestIsBackface(oct, x, y + 0.9, z, 1) || nearestIsBackface(oct, x, y + 0.9, z, -1);
}

/** 站在高度 y 時，膠囊是否沒有卡進任何東西 */
export function standClear(oct: Octree, x: number, y: number, z: number, radius = NAV_RADIUS): boolean {
  if (insideSolid(oct, x, y, z)) return false;
  cap.radius = radius;
  cap.start.set(x, y + radius + LIFT, z);
  cap.end.set(x, y + STAND_H - radius, z);
  return !oct.capsuleIntersect(cap);
}

/** 一條邊能不能直線走通：沿線每 0.3m 取樣，貼著地面走，膠囊不被擋、沒有斷崖/過高台階 */
export function edgePassable(oct: Octree, a: P3, b: P3): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) return Math.abs(a.y - b.y) < STEP_H;
  const n = Math.ceil(len / SAMPLE);
  let y = a.y;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = a.x + dx * t, z = a.z + dz * t;
    const g = groundBelow(oct, x, z, y + STEP_H + 0.05);
    if (!g || g.ny < WALKABLE_NY) return false;
    if (g.y < y - 0.6 || g.y > y + STEP_H) return false;
    y = g.y;
    if (!standClear(oct, x, y, z)) return false;
  }
  return Math.abs(y - b.y) < 0.3;
}

export interface NavResult { nodes: P3[]; edges: [number, number][] }

/**
 * 產生導航圖：2m 網格取樣所有可站立地面（含多層），再用最小間距挑出節點，
 * 強制點（點位、巡邏點、門口）一定入選，最後只保留與抵達點連通的部分。
 */
export function generateNav(
  oct: Octree,
  bounds: { x0: number; z0: number; x1: number; z1: number },
  forced: P3[],
  opts: { grid?: number; spacing?: number; maxEdge?: number; maxDegree?: number; prune?: boolean; dense?: { x0: number; z0: number; x1: number; z1: number }[] } = {},
): NavResult {
  const grid = opts.grid ?? 2, spacing = opts.spacing ?? 4.5, maxEdge = opts.maxEdge ?? 9.5, maxDeg = opts.maxDegree ?? 8;
  const nodes: P3[] = [];
  const cell = spacing;
  const hash = new Map<string, number[]>();
  const key = (x: number, z: number): string => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  const near = (p: P3, sp: number): boolean => {
    const cx = Math.floor(p.x / cell), cz = Math.floor(p.z / cell);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) {
      for (const id of hash.get(`${i},${j}`) ?? []) {
        const q = nodes[id];
        if (Math.abs(q.y - p.y) < 1.2 && Math.hypot(q.x - p.x, q.z - p.z) < sp) return true;
      }
    }
    return false;
  };
  const add = (p: P3): number => {
    nodes.push(p);
    const k = key(p.x, p.z);
    if (!hash.has(k)) hash.set(k, []);
    hash.get(k)!.push(nodes.length - 1);
    return nodes.length - 1;
  };

  // 強制點：以其標示的高度為準（snap 到最近的可站立面）
  for (const f of forced) {
    const y = surfaceHeightAt(oct, f, 0.25);
    if (y === null || !standClear(oct, f.x, y, f.z, 0.36)) { console.warn(`[nav] forced point is not standable: ${f.x},${f.y},${f.z}`); continue; }
    if (!near({ x: f.x, y, z: f.z }, 0.8)) add({ x: f.x, y, z: f.z });
  }
  // 網格候選
  for (let x = bounds.x0; x <= bounds.x1; x += grid) {
    for (let z = bounds.z0; z <= bounds.z1; z += grid) {
      let from = 60;
      for (let guard = 0; guard < 8; guard++) {
        const g = groundBelow(oct, x, z, from);
        if (!g) break;
        from = g.y - 0.3;
        if (g.ny < WALKABLE_NY) continue;
        if (!standClear(oct, x, g.y, z, 0.5) && !((opts.dense ?? []).some((d) => x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) && standClear(oct, x, g.y, z, 0.42))) continue;
        const p = { x, y: g.y, z };
        const isDense = (opts.dense ?? []).some((d) => x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1);
        if (!near(p, isDense ? 2.4 : spacing)) add(p);
      }
    }
  }

  // 邊：每個節點對較近且可通行的鄰居，最多 maxDeg 條
  const cands: [number, number, number][] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
      if (d > maxEdge) continue;
      const dy = Math.abs(nodes[i].y - nodes[j].y);
      if (dy > 0.75 * d + 0.6) continue;
      cands.push([i, j, d]);
    }
  }
  cands.sort((p, q) => p[2] - q[2]);
  const deg = new Array<number>(nodes.length).fill(0);
  const edges: [number, number][] = [];
  const passCache = new Map<number, boolean>();
  const forcedCount = forced.length;
  void passCache;
  void forcedCount;
  for (const [i, j] of cands) {
    if (deg[i] >= maxDeg && deg[j] >= maxDeg) continue;
    if (!edgePassable(oct, nodes[i], nodes[j]) || !edgePassable(oct, nodes[j], nodes[i])) continue;
    edges.push([i, j]);
    deg[i]++; deg[j]++;
  }
  bridgeComponents(oct, nodes, edges, 16);
  return opts.prune === false ? { nodes, edges } : pruneToMain(nodes, edges, 0);
}

/** 找連通元件；保留包含節點 0（第一個抵達點）的元件，重新編號 */
export function pruneToMain(nodes: P3[], edges: [number, number][], root: number): NavResult {
  const adj: number[][] = nodes.map(() => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  const seen = new Uint8Array(nodes.length);
  const stack = [root];
  seen[root] = 1;
  while (stack.length) {
    const n = stack.pop()!;
    for (const m of adj[n]) if (!seen[m]) { seen[m] = 1; stack.push(m); }
  }
  const remap = new Int32Array(nodes.length).fill(-1);
  const outNodes: P3[] = [];
  nodes.forEach((p, i) => { if (seen[i]) { remap[i] = outNodes.length; outNodes.push(p); } });
  const outEdges: [number, number][] = [];
  for (const [a, b] of edges) if (seen[a] && seen[b]) outEdges.push([remap[a], remap[b]]);
  return { nodes: outNodes, edges: outEdges };
}

/** 連通元件數 */
export function componentCount(nodeCount: number, edges: [number, number][]): number {
  const parent = Array.from({ length: nodeCount }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const [a, b] of edges) parent[find(a)] = find(b);
  const roots = new Set<number>();
  for (let i = 0; i < nodeCount; i++) roots.add(find(i));
  return roots.size;
}

/** 連通元件清單（偵錯用）：每個元件的節點數與中心 */
export function describeComponents(nodes: P3[], edges: [number, number][]): { size: number; cx: number; cy: number; cz: number; sample: P3 }[] {
  const parent = Array.from({ length: nodes.length }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const [a, b] of edges) parent[find(a)] = find(b);
  const groups = new Map<number, number[]>();
  nodes.forEach((_, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(i); });
  return [...groups.values()].sort((a, b) => b.length - a.length).map((ids) => {
    const c = ids.reduce((acc, i) => ({ x: acc.x + nodes[i].x, y: acc.y + nodes[i].y, z: acc.z + nodes[i].z }), { x: 0, y: 0, z: 0 });
    return { size: ids.length, cx: c.x / ids.length, cy: c.y / ids.length, cz: c.z / ids.length, sample: nodes[ids[0]] };
  });
}

/**
 * 補橋：把小元件接到其他元件。對每個元件，從最近的跨元件節點對開始試，
 * 直線可通行（兩個方向）就加一條較長的邊；一直做到沒有進展。
 */
export function bridgeComponents(oct: Octree, nodes: P3[], edges: [number, number][], maxDist: number): void {
  const comp = (): Int32Array => {
    const parent = Array.from({ length: nodes.length }, (_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (const [a, b] of edges) parent[find(a)] = find(b);
    return Int32Array.from(parent.map((_, i) => find(i)));
  };
  for (let round = 0; round < 40; round++) {
    const c = comp();
    const groups = new Map<number, number[]>();
    c.forEach((r, i) => { if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(i); });
    if (groups.size === 1) return;
    let added = 0;
    for (const ids of groups.values()) {
      const cands: [number, number, number][] = [];
      for (const i of ids) {
        for (let j = 0; j < nodes.length; j++) {
          if (c[j] === c[i]) continue;
          const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
          if (d > maxDist || Math.abs(nodes[i].y - nodes[j].y) > 0.75 * d + 0.6) continue;
          cands.push([i, j, d]);
        }
      }
      cands.sort((p, q) => p[2] - q[2]);
      for (const [i, j] of cands.slice(0, 800)) {
        if (edgePassable(oct, nodes[i], nodes[j]) && edgePassable(oct, nodes[j], nodes[i])) { edges.push([i, j]); added++; break; }
      }
    }
    if (!added) return;
  }
}
