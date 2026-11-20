import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { buildHarborCore, type HarborCore } from '../src/world/maps/harbor1990/core';
import { ARRIVALS, ENEMY_SPAWNS, EVAC_POINTS, HARBOR_BOUNDS, LOOT_SPOTS, TRADER } from '../src/world/maps/harbor1990/data';
import { NAV_EDGES, NAV_NODES } from '../src/world/maps/harbor1990/navData';
import { edgePassable, groundBelow, standClear, surfaceHeightAt, type P3 } from '../src/world/maps/harbor1990/navTools';
import { SURFACES, getSurfaceAt, type Surface } from '../src/world/Surface';

let core: HarborCore;
let oct: Octree;
const nodes: THREE.Vector3[] = [];
const edges: [number, number][] = [];

beforeAll(() => {
  core = buildHarborCore();
  oct = new Octree();
  oct.fromGraphNode(core.collision);
  for (let i = 0; i < NAV_NODES.length; i += 3) nodes.push(new THREE.Vector3(NAV_NODES[i], NAV_NODES[i + 1], NAV_NODES[i + 2]));
  for (let i = 0; i < NAV_EDGES.length; i += 2) edges.push([NAV_EDGES[i], NAV_EDGES[i + 1]]);
});

const allPoints = (): { name: string; p: THREE.Vector3 }[] => [
  ...ARRIVALS.map((a, i) => ({ name: `arrival${i}`, p: a.position })),
  ...LOOT_SPOTS.map((l, i) => ({ name: `loot${i}`, p: l.position })),
  ...EVAC_POINTS.map((e, i) => ({ name: `evac${i}`, p: e.position })),
  ...ENEMY_SPAWNS.flatMap((e, i) => [{ name: `enemy${i}`, p: e.position }, ...(e.patrol ?? []).map((p, j) => ({ name: `enemy${i}.patrol${j}`, p }))]),
];

describe('harbor1990 data', () => {
  it('trader booth faces a reachable spot', () => {
    expect(TRADER.position.y).toBeCloseTo(0.03, 1);
  });

  it('has the counts the design asks for', () => {
    expect(ARRIVALS).toHaveLength(4);
    expect(LOOT_SPOTS.length).toBeGreaterThanOrEqual(35);
    expect(LOOT_SPOTS.length).toBeLessThanOrEqual(45);
    expect(EVAC_POINTS).toHaveLength(3);
    expect(EVAC_POINTS.filter((e) => e.random)).toHaveLength(2);
    expect(ENEMY_SPAWNS.length).toBeGreaterThanOrEqual(14);
    expect(ENEMY_SPAWNS.length).toBeLessThanOrEqual(22);
    const kinds = new Set(ENEMY_SPAWNS.map((e) => e.kind));
    expect(kinds).toEqual(new Set(['guard', 'thug', 'rival_agent']));
    expect(ENEMY_SPAWNS.filter((e) => e.kind === 'rival_agent').length).toBeGreaterThanOrEqual(2);
    expect(ENEMY_SPAWNS.some((e) => e.patrol && e.patrol.length >= 3)).toBe(true);
    expect(ENEMY_SPAWNS.every((e) => !!e.group)).toBe(true);
  });

  it('safes are rare and containers match their area', () => {
    const onlySafe = LOOT_SPOTS.filter((l) => l.types.every((t) => t === 'safe'));
    expect(onlySafe.length).toBeLessThanOrEqual(2);
    expect(LOOT_SPOTS.filter((l) => l.types.includes('safe')).length).toBeLessThanOrEqual(5);
    expect(LOOT_SPOTS.filter((l) => l.types.includes('crate')).length).toBeGreaterThan(20);
    expect(LOOT_SPOTS.filter((l) => l.types.includes('cabinet')).length).toBeGreaterThan(6);
  });

  it('all points are inside bounds and stand on solid ground with headroom', () => {
    for (const { name, p } of allPoints()) {
      expect(HARBOR_BOUNDS.containsPoint(p), `${name} in bounds`).toBe(true);
      const y = surfaceHeightAt(oct, p, 0.15);
      expect(y, `${name} stands on a walkable surface (not inside a solid)`).not.toBeNull();
      expect(standClear(oct, p.x, y!, p.z, 0.4), `${name} clear of colliders`).toBe(true);
    }
  });

  it('reverb zones cover the indoor spaces and the tunnel', () => {
    const names = core.ctx.zones.map((z) => z.name);
    for (const n of ['warehouse', 'office', 'guard_house', 'gas_shop', 'fish_market', 'drain_tunnel']) expect(names).toContain(n);
    expect(core.ctx.zones.find((z) => z.name === 'drain_tunnel')!.type).toBe('tunnel');
    expect(core.ctx.zones.find((z) => z.name === 'warehouse')!.type).toBe('indoor_large');
    expect(core.ctx.zones.find((z) => z.name === 'office')!.type).toBe('indoor_small');
  });
});

describe('harbor1990 nav graph', () => {
  it('has a reasonable size and spacing', () => {
    expect(nodes.length).toBeGreaterThan(300);
    expect(edges.length).toBeGreaterThan(nodes.length);
    const lens = edges.map(([a, b]) => Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z));
    expect(Math.max(...lens)).toBeLessThan(16.5);
    // 大多數邊在 4～8m
    expect(lens.filter((l) => l >= 3 && l <= 9).length / lens.length).toBeGreaterThan(0.8);
  });

  it('is a single connected component', () => {
    const adj: number[][] = nodes.map(() => []);
    for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
    const seen = new Set<number>([0]);
    const stack = [0];
    while (stack.length) for (const m of adj[stack.pop()!]) if (!seen.has(m)) { seen.add(m); stack.push(m); }
    expect(seen.size).toBe(nodes.length);
  });

  it('every node stands on walkable ground with clearance', () => {
    for (const [i, n] of nodes.entries()) {
      const g = groundBelow(oct, n.x, n.z, n.y + 0.3);
      expect(g, `node ${i}`).not.toBeNull();
      expect(Math.abs(g!.y - n.y), `node ${i} height`).toBeLessThan(0.1);
      expect(standClear(oct, n.x, g!.y, n.z), `node ${i} clear`).toBe(true);
    }
  });

  it('every edge can be walked in a straight line (capsule sweep, both directions)', () => {
    const bad: string[] = [];
    for (const [a, b] of edges) {
      if (!edgePassable(oct, nodes[a], nodes[b]) || !edgePassable(oct, nodes[b], nodes[a])) bad.push(`${a}-${b}`);
    }
    expect(bad).toEqual([]);
  });

  it('every spawn, loot spot, patrol point, evac point and arrival is close to a nav node', () => {
    for (const { name, p } of allPoints()) {
      let best = Infinity;
      for (const n of nodes) {
        if (Math.abs(n.y - p.y) > 1.0) continue;
        best = Math.min(best, Math.hypot(n.x - p.x, n.z - p.z));
      }
      expect(best, `${name} nearest nav node`).toBeLessThan(3);
    }
  });

  it('nav covers elevated routes: container roofs, warehouse mezzanine, ship deck, tunnel', () => {
    const has = (pred: (n: THREE.Vector3) => boolean): boolean => nodes.some(pred);
    expect(has((n) => n.y > 4.9 && n.x < -10 && n.z < -5)).toBe(true);        // 貨櫃頂
    expect(has((n) => n.y > 7.4 && n.x < -10 && n.z < -35)).toBe(true);       // 3 層貨櫃頂
    expect(has((n) => n.y > 3.9 && n.y < 4.1 && n.x > 8 && n.z < -37)).toBe(true); // 倉庫二樓
    expect(has((n) => n.y > 3.1 && n.y < 3.3 && n.z < -66)).toBe(true);       // 船甲板
    expect(has((n) => n.y < -3.3 && n.x < -35 && n.z > 58)).toBe(true);       // 隧道
    // 樓梯中段也有節點（斜坡有連起來）
    expect(has((n) => n.y > 1.0 && n.y < 3.0 && n.x > 8 && n.x < 15 && n.z > -38 && n.z < -35)).toBe(true);
  });
});

describe('harbor1990 surfaces', () => {
  it('at least 10 of the 12 surface types are present under nav nodes', () => {
    const rc = new THREE.Raycaster();
    const found = new Set<Surface>();
    for (const n of nodes) {
      rc.set(new THREE.Vector3(n.x, n.y + 0.3, n.z), new THREE.Vector3(0, -1, 0));
      rc.far = 1.2;
      const hits = rc.intersectObjects(core.surfaceMeshes, false);
      if (hits.length) found.add(getSurfaceAt(hits[0].object));
    }
    expect(found.size, `found ${[...found].join(',')}`).toBeGreaterThanOrEqual(10);
    for (const s of ['wood', 'metal_grate', 'metal_hollow', 'tile', 'carpet', 'sand', 'water', 'gravel', 'dirt', 'grass', 'concrete']) {
      expect(found.has(s as Surface), `surface ${s}`).toBe(true);
    }
    void SURFACES;
  });
});

// 型別檢查用
export type { P3 };
