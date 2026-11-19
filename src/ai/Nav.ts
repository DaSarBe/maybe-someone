import * as THREE from 'three';
import type { NavGraph } from '../world/RaidMap';

/** 導航圖索引：鄰接表 + A* 尋路。圖本身由地圖模組提供（RaidMap.nav） */
export class NavIndex {
  readonly nodes: THREE.Vector3[];
  readonly adj: { to: number; cost: number }[][];

  constructor(graph: NavGraph) {
    this.nodes = graph.nodes;
    this.adj = graph.nodes.map(() => []);
    for (const [a, b] of graph.edges) {
      if (a === b || !graph.nodes[a] || !graph.nodes[b]) continue;
      const cost = graph.nodes[a].distanceTo(graph.nodes[b]);
      this.adj[a].push({ to: b, cost });
      this.adj[b].push({ to: a, cost });
    }
  }

  get size(): number { return this.nodes.length; }

  /** 最近的節點（可用 accept 過濾，例如要求看得到）；沒有回傳 -1 */
  nearest(p: THREE.Vector3, accept?: (i: number) => boolean, maxDist = Infinity): number {
    let best = -1;
    let bd = maxDist * maxDist;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const dx = n.x - p.x, dz = n.z - p.z, dy = (n.y - p.y) * 2;
      const d = dx * dx + dz * dz + dy * dy;
      if (d < bd && (!accept || accept(i))) { bd = d; best = i; }
    }
    return best;
  }

  /** A* 最短路徑（節點索引，含起點與終點）；不連通回傳 null */
  findPath(from: number, to: number): number[] | null {
    if (from < 0 || to < 0 || from >= this.size || to >= this.size) return null;
    if (from === to) return [from];
    const g = new Float64Array(this.size).fill(Infinity);
    const prev = new Int32Array(this.size).fill(-1);
    const closed = new Uint8Array(this.size);
    const goal = this.nodes[to];
    const h = (i: number) => this.nodes[i].distanceTo(goal);
    // 小型二元堆（f 值）
    const heap: { i: number; f: number }[] = [];
    const push = (i: number, f: number) => {
      heap.push({ i, f });
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heap[p].f <= heap[c].f) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = c * 2 + 1, r = l + 1;
          let m = c;
          if (l < heap.length && heap[l].f < heap[m].f) m = l;
          if (r < heap.length && heap[r].f < heap[m].f) m = r;
          if (m === c) break;
          [heap[m], heap[c]] = [heap[c], heap[m]];
          c = m;
        }
      }
      return top;
    };
    g[from] = 0;
    push(from, h(from));
    while (heap.length > 0) {
      const { i } = pop();
      if (closed[i]) continue;
      if (i === to) break;
      closed[i] = 1;
      for (const e of this.adj[i]) {
        if (closed[e.to]) continue;
        const ng = g[i] + e.cost;
        if (ng < g[e.to]) {
          g[e.to] = ng;
          prev[e.to] = i;
          push(e.to, ng + h(e.to));
        }
      }
    }
    if (prev[to] < 0) return null;
    const path = [to];
    for (let c = to; prev[c] >= 0; c = prev[c]) path.push(prev[c]);
    return path.reverse();
  }

  pathLength(path: number[]): number {
    let d = 0;
    for (let i = 1; i < path.length; i++) d += this.nodes[path[i - 1]].distanceTo(this.nodes[path[i]]);
    return d;
  }
}
