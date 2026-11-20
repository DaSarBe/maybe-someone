import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { buildHarborCore, type HarborCore } from '../src/world/maps/harbor1990/core';
import { ARRIVALS, ENEMY_SPAWNS, EVAC_POINTS, HARBOR_BOUNDS, LOOT_SPOTS, TRADER } from '../src/world/maps/harbor1990/data';
import { floorY } from '../src/world/maps/harbor1990/layout';
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
    expect(ARRIVALS).toHaveLength(6);
    expect(LOOT_SPOTS.length).toBeGreaterThanOrEqual(60);
    expect(LOOT_SPOTS.length).toBeLessThanOrEqual(75);
    expect(EVAC_POINTS.length).toBeGreaterThanOrEqual(4);
    expect(EVAC_POINTS.length).toBeLessThanOrEqual(5);
    const fixed = EVAC_POINTS.filter((e) => !e.random).length;
    expect(fixed).toBeGreaterThanOrEqual(1);
    expect(fixed).toBeLessThanOrEqual(2);
    expect(ENEMY_SPAWNS.length).toBeGreaterThanOrEqual(24);
    expect(ENEMY_SPAWNS.length).toBeLessThanOrEqual(30);
    const kinds = new Set(ENEMY_SPAWNS.map((e) => e.kind));
    expect(kinds).toEqual(new Set(['guard', 'thug', 'rival_agent']));
    expect(ENEMY_SPAWNS.filter((e) => e.kind === 'rival_agent').length).toBeGreaterThanOrEqual(5);
    expect(ENEMY_SPAWNS.filter((e) => e.patrol && e.patrol.length >= 3).length).toBeGreaterThanOrEqual(8);
    expect(ENEMY_SPAWNS.every((e) => !!e.group)).toBe(true);
    // 三種陣營都有：警衛、海龍幫、企業穿越者
    const factions = new Set(ENEMY_SPAWNS.map((e) => e.faction));
    expect(factions.has('guard') && factions.has('triad')).toBe(true);
    expect([...factions].some((f) => typeof f === 'string' && f.startsWith('corp_'))).toBe(true);
  });

  it('safes are rare; the chairman safe on 5F is guaranteed', () => {
    const safes = LOOT_SPOTS.filter((l) => l.types.includes('safe'));
    expect(safes.length).toBeGreaterThanOrEqual(3);
    expect(safes.length).toBeLessThanOrEqual(5);
    const chairman = safes.find((l) => Math.abs(l.position.y - floorY(4)) < 0.2);
    expect(chairman, '5F chairman safe').toBeDefined();
    expect(chairman!.types).toEqual(['safe']);
    expect(chairman!.chance ?? 1).toBe(1);
    expect(LOOT_SPOTS.filter((l) => l.types.includes('crate')).length).toBeGreaterThan(20);
    expect(LOOT_SPOTS.filter((l) => l.types.includes('cabinet')).length).toBeGreaterThan(10);
  });

  it('valuable loot sits where you have to climb or go deep', () => {
    expect(LOOT_SPOTS.some((l) => l.position.y > 15)).toBe(true);   // 5F / 頂樓
    expect(LOOT_SPOTS.some((l) => l.position.y < -6)).toBe(true);   // B2
    expect(LOOT_SPOTS.some((l) => l.position.y < -2.5 && l.position.z < -64)).toBe(true); // 貨艙
  });

  it('all points are inside bounds and stand on solid ground with headroom', () => {
    const bad: string[] = [];
    for (const { name, p } of allPoints()) {
      if (!HARBOR_BOUNDS.containsPoint(p)) { bad.push(`${name} out of bounds`); continue; }
      const y = surfaceHeightAt(oct, p, 0.15);
      if (y === null) { bad.push(`${name} not on a walkable surface (${p.x},${p.y},${p.z})`); continue; }
      if (!standClear(oct, p.x, y, p.z, 0.4)) bad.push(`${name} blocked by colliders`);
    }
    expect(bad).toEqual([]);
  });

  it('reverb zones cover every indoor space and each floor', () => {
    const zones = core.ctx.zones;
    const names = zones.map((z) => z.name);
    const need = [
      'warehouse', 'office', 'guard_house', 'gas_shop', 'fish_market', 'drain_tunnel',
      'warehouse_mezz', 'warehouse_catwalk', 'crane_cab',
      'tower_1f', 'tower_2f', 'tower_3f', 'tower_4f', 'tower_5f', 'tower_stairs', 'tower_shaft',
      'ship_cabin', 'ship_engine', 'ship_hold', 'parking_b1', 'parking_b2', 'service_tunnel',
      'boxcar_a', 'boxcar_b', 'signal_hut', 'old_street_temple', 'shop_w1', 'shop_e4', 'shipyard_shed', 'pump_house', 'south_gate_house',
    ];
    for (const n of need) expect(names, n).toContain(n);
    const type = (n: string): string => zones.find((z) => z.name === n)!.type;
    expect(type('drain_tunnel')).toBe('tunnel');
    expect(type('parking_b2')).toBe('tunnel');
    expect(type('warehouse')).toBe('indoor_large');
    expect(type('ship_hold')).toBe('indoor_large');
    expect(type('ship_engine')).toBe('indoor_large');
    expect(type('office')).toBe('indoor_small');
    expect(type('tower_3f')).toBe('indoor_small');
  });
});

describe('harbor1990 nav graph', () => {
  it('has a reasonable size and spacing', () => {
    expect(nodes.length).toBeGreaterThan(1200);
    expect(edges.length).toBeGreaterThan(nodes.length);
    const lens = edges.map(([a, b]) => Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z));
    expect(Math.max(...lens)).toBeLessThan(16.5);
    expect(lens.filter((l) => l >= 2 && l <= 9).length / lens.length).toBeGreaterThan(0.8);
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
    const bad: string[] = [];
    for (const [i, n] of nodes.entries()) {
      const g = groundBelow(oct, n.x, n.z, n.y + 0.3);
      if (!g || Math.abs(g.y - n.y) >= 0.1 || !standClear(oct, n.x, g.y, n.z)) bad.push(`node ${i} (${n.x},${n.y},${n.z})`);
    }
    expect(bad).toEqual([]);
  });

  it('every edge can be walked in a straight line (capsule sweep, both directions)', () => {
    const bad: string[] = [];
    for (const [a, b] of edges) {
      if (!edgePassable(oct, nodes[a], nodes[b]) || !edgePassable(oct, nodes[b], nodes[a])) bad.push(`${a}-${b}`);
    }
    expect(bad).toEqual([]);
  }, 120_000);

  it('every spawn, loot spot, patrol point, evac point and arrival is close to a nav node', () => {
    const bad: string[] = [];
    for (const { name, p } of allPoints()) {
      let best = Infinity;
      for (const n of nodes) {
        if (Math.abs(n.y - p.y) > 1.0) continue;
        best = Math.min(best, Math.hypot(n.x - p.x, n.z - p.z));
      }
      if (best >= 3) bad.push(`${name} (${p.x},${p.y},${p.z}) nearest nav node ${best.toFixed(1)}m`);
    }
    expect(bad).toEqual([]);
  });

  /** 某個 xz 範圍內、某個高度附近有導航節點 / 搜刮點 */
  const nodeNear = (x0: number, x1: number, z0: number, z1: number, y: number, tol = 0.6): boolean =>
    nodes.some((n) => n.x >= x0 && n.x <= x1 && n.z >= z0 && n.z <= z1 && Math.abs(n.y - y) <= tol);
  const lootNear = (x0: number, x1: number, z0: number, z1: number, y: number, tol = 0.6): boolean =>
    LOOT_SPOTS.some((l) => l.position.x >= x0 && l.position.x <= x1 && l.position.z >= z0 && l.position.z <= z1 && Math.abs(l.position.y - y) <= tol);

  it('nav covers elevated routes: container roofs, tunnel, stairs mid-way', () => {
    const has = (pred: (n: THREE.Vector3) => boolean): boolean => nodes.some(pred);
    expect(has((n) => n.y > 4.9 && n.x < -10 && n.z < -5 && n.z > -45)).toBe(true);        // 貨櫃頂
    expect(has((n) => n.y > 7.4 && n.x < -10 && n.z < -35 && n.z > -45)).toBe(true);       // 3 層貨櫃頂
    expect(has((n) => n.y < -3.3 && n.x < -35 && n.x > -75 && n.z > 58 && n.z < 64)).toBe(true); // 隧道
    // 樓梯中段也有節點（斜坡有連起來）
    expect(has((n) => n.y > 1.0 && n.y < 3.0 && n.x > 8 && n.x < 15 && n.z > -38 && n.z < -35)).toBe(true);
  });

  it('every floor has nav nodes and loot: tower 1F-5F + roof, warehouse 1F-3F, ship deck / cabin / engine / hold, parking B1-B2', () => {
    const TW: [number, number, number, number] = [100, 124, -6, 16];
    for (let k = 0; k <= 5; k++) {
      expect(nodeNear(...TW, floorY(k), 0.3), `tower floor ${k} nav`).toBe(true);
      // 4F 沒有專屬搜刮點的話至少 1F、2F、3F、5F、頂樓有
      if (k !== 3) expect(lootNear(...TW, floorY(k), 0.3), `tower floor ${k} loot`).toBe(true);
    }
    for (const y of [0, 4.0, 8.0]) {
      expect(nodeNear(6, 46, -44, -12, y, 0.3), `warehouse y=${y} nav`).toBe(true);
      expect(lootNear(6, 46, -44, -12, y, 0.3), `warehouse y=${y} loot`).toBe(true);
    }
    const ship: [number, number, number, number] = [-43, 3, -81, -64];
    expect(nodeNear(...ship, 3.2, 0.3), 'ship deck nav').toBe(true);
    expect(nodeNear(-15.4, 2, -81, -64, 0.3, 0.3), 'ship cabin nav').toBe(true);
    expect(nodeNear(-15.4, 2, -81, -64, -2.9, 0.3), 'ship engine nav').toBe(true);
    expect(nodeNear(-41, -16, -81, -64, -2.9, 0.3), 'ship hold nav').toBe(true);
    expect(lootNear(...ship, 3.2, 0.3), 'ship deck loot').toBe(true);
    expect(lootNear(-15.4, 2, -81, -64, 0.3, 0.3), 'ship cabin loot').toBe(true);
    expect(lootNear(-15.4, 2, -81, -64, -2.9, 0.3), 'ship engine loot').toBe(true);
    expect(lootNear(-41, -16, -81, -64, -2.9, 0.3), 'ship hold loot').toBe(true);
    for (const y of [-3.4, -6.9]) {
      expect(nodeNear(-84, -24, 104, 148, y, 0.3), `parking y=${y} nav`).toBe(true);
      expect(lootNear(-84, -24, 104, 148, y, 0.3), `parking y=${y} loot`).toBe(true);
    }
  });

  it('every new area is reachable: rail yard, old street, dry dock, tank farm, junkyard, service tunnel', () => {
    expect(nodeNear(94, 130, -62, -26, 0, 0.3)).toBe(true);
    expect(nodeNear(94, 130, -62, -26, 1.1, 0.3)).toBe(true);   // 月台
    expect(nodeNear(96, 130, 38, 98, 0.03, 0.3)).toBe(true);
    expect(nodeNear(-124, -98, 8, 26, -6, 0.3)).toBe(true);     // 乾塢底
    expect(nodeNear(-124, -98, 8, 26, 0, 0.3)).toBe(true);      // 船背
    expect(nodeNear(-14, 42, 100, 152, 0, 0.3)).toBe(true);
    expect(nodeNear(44, 96, 100, 166, 0, 0.3)).toBe(true);
    expect(nodeNear(-53, -50, 70, 102, -3.4, 0.3)).toBe(true);
  });
});

describe('harbor1990 surfaces', () => {
  it('at least 11 of the 12 surface types are present under nav nodes', () => {
    const rc = new THREE.Raycaster();
    const found = new Set<Surface>();
    for (const n of nodes) {
      rc.set(new THREE.Vector3(n.x, n.y + 0.3, n.z), new THREE.Vector3(0, -1, 0));
      rc.far = 1.2;
      const hits = rc.intersectObjects(core.surfaceMeshes, false);
      if (hits.length) found.add(getSurfaceAt(hits[0].object));
    }
    expect(found.size, `found ${[...found].join(',')}`).toBeGreaterThanOrEqual(11);
    for (const s of ['wood', 'metal_grate', 'metal_hollow', 'tile', 'carpet', 'sand', 'water', 'gravel', 'dirt', 'grass', 'concrete']) {
      expect(found.has(s as Surface), `surface ${s}`).toBe(true);
    }
    void SURFACES;
  });
});

describe('harbor1990 regions', () => {
  it('splits the static geometry into regions with a bounded number of meshes', () => {
    const meshes = core.regions.reduce((n, r) => n + r.object.children.length, 0);
    expect(core.regions.length).toBeGreaterThan(25);
    expect(meshes).toBeLessThan(260);
    // 每棟多層建築的室內都有自己的區域，可以獨立顯示或隱藏
    const names = core.regions.map((r) => r.meta.name);
    for (const n of ['tower_f1', 'tower_f5', 'ship_cabin', 'ship_engine', 'ship_hold', 'parking_b1', 'parking_b2', 'warehouse_int', 'office_int']) expect(names).toContain(n);
  });
});

// 型別檢查用
export type { P3 };
