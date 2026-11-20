import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { describe, expect, it } from 'vitest';
import { EnemyBrain, DEFAULT_BRAIN, type BrainInput } from '../src/ai/Brain';
import { buildCorpseLoot } from '../src/ai/CorpseLoot';
import { NavIndex } from '../src/ai/Nav';
import { buildNavGrid } from '../src/ai/NavBuilder';
import { inFieldOfView, visionGain } from '../src/ai/Perception';
import { ENEMIES } from '../src/data/enemies';
import type { NavGraph } from '../src/world/RaidMap';

const V = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);
const ctx = (o: Partial<BrainInput> = {}): BrainInput => ({
  canSee: false, gain: 0, targetPos: V(10, 0), dist: 10, engageRange: 20, arrived: false, ...o,
});
function run(b: EnemyBrain, seconds: number, inp: Partial<BrainInput> = {}, dt = 0.1): void {
  for (let t = 0; t < seconds; t += dt) b.update(dt, ctx(inp));
}

describe('A* navigation', () => {
  // 3x3 格點，中間一排被牆擋住（只留最右邊通道）：
  //  0 1 2
  //  3 . 5   (4 不連通)
  //  6 7 8
  const nodes = [V(0, 0), V(1, 0), V(2, 0), V(0, 1), V(1, 1), V(2, 1), V(0, 2), V(1, 2), V(2, 2)];
  const graph: NavGraph = { nodes, edges: [[0, 1], [1, 2], [0, 3], [2, 5], [3, 6], [5, 8], [6, 7], [7, 8]] };
  const nav = new NavIndex(graph);
  it('finds the shortest path around an obstacle', () => {
    const p = nav.findPath(0, 7)!;
    expect(p[0]).toBe(0);
    expect(p[p.length - 1]).toBe(7);
    expect(nav.pathLength(p)).toBeCloseTo(3, 5);
    // 每一步都是圖上的邊
    for (let i = 1; i < p.length; i++) expect(nav.adj[p[i - 1]].some((e) => e.to === p[i])).toBe(true);
  });
  it('returns null for unreachable nodes and handles trivial paths', () => {
    expect(nav.findPath(0, 4)).toBeNull();
    expect(nav.findPath(3, 3)).toEqual([3]);
    expect(nav.findPath(-1, 3)).toBeNull();
  });
  it('prefers the cheaper of two routes', () => {
    const g2 = new NavIndex({ nodes: [V(0, 0), V(10, 0), V(5, 1), V(5, 20)], edges: [[0, 2], [2, 1], [0, 3], [3, 1]] });
    expect(g2.findPath(0, 1)).toEqual([0, 2, 1]);
  });
  it('nearest honors the filter', () => {
    expect(nav.nearest(V(0.1, 0.1))).toBe(0);
    expect(nav.nearest(V(0.1, 0.1), (i) => i !== 0)).not.toBe(0);
    expect(nav.nearest(V(50, 50), undefined, 5)).toBe(-1);
  });
});

describe('nav grid builder (on real collision)', () => {
  // 24x24 地板，中間一道牆（x=0，z -12..4，一路到地板邊緣），只有 z>4 的一側可繞過
  const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(24, 1, 24), new THREE.MeshBasicMaterial());
  floor.position.y = -0.5;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 16), new THREE.MeshBasicMaterial());
  wall.position.set(0, 1.5, -4);
  group.add(floor, wall);
  group.updateMatrixWorld(true);
  const octree = new Octree();
  octree.fromGraphNode(group);
  const graph = buildNavGrid(octree, new THREE.Box3(new THREE.Vector3(-9, -1, -9), new THREE.Vector3(9, 4, 9)), { spacing: 3 });
  const nav = new NavIndex(graph);
  it('creates nodes on open ground only, and no edge crosses the wall', () => {
    expect(graph.nodes.length).toBeGreaterThan(20);
    for (const n of graph.nodes) expect(Math.abs(n.x) > 0.7 || n.z > 4.2).toBe(true);
    for (const [a, b] of graph.edges) {
      const A = graph.nodes[a], B = graph.nodes[b];
      if ((A.x < 0) !== (B.x < 0)) expect(Math.max(A.z, B.z)).toBeGreaterThan(4);
    }
  });
  it('lets A* route around the wall', () => {
    const a = nav.nearest(V(-6, -3)), b = nav.nearest(V(6, -3));
    const path = nav.findPath(a, b)!;
    expect(path).toBeTruthy();
    expect(Math.max(...path.map((i) => graph.nodes[i].z))).toBeGreaterThan(4);
    expect(nav.pathLength(path)).toBeGreaterThan(20);
  });
});

describe('perception: vision', () => {
  const base = { dist: 10, offAxis: 0, crouching: false, sprinting: false, moving: true, light: 1 };
  const g = (o: Partial<typeof base> = {}) => visionGain(0.6, 30, { ...base, ...o });
  it('is slower when crouching, in the dark, far away, standing still or at the edge of view', () => {
    const ref = g();
    expect(g({ crouching: true })).toBeLessThan(ref);
    expect(g({ light: 0.4 })).toBeLessThan(ref);
    expect(g({ dist: 25 })).toBeLessThan(ref);
    expect(g({ moving: false })).toBeLessThan(ref);
    expect(g({ offAxis: 1 })).toBeLessThan(ref);
    expect(g({ sprinting: true })).toBeGreaterThan(ref);
    expect(g({ dist: 2 })).toBeGreaterThan(ref);
  });
  it('sees nothing beyond the (reduced) sight range', () => {
    expect(g({ dist: 35 })).toBe(0);
    expect(g({ dist: 24, crouching: true, light: 0.3 })).toBe(0);
  });
  it('takes about the reaction time to notice in ideal conditions', () => {
    const rate = visionGain(1, 30, { ...base, dist: 1, moving: true });
    expect(1 / rate).toBeLessThan(1);
  });
  it('field of view cone', () => {
    // 面向 +z（facing 0），全角 100 度
    expect(inFieldOfView(0, 0, 10, 100)).toBe(true);
    expect(inFieldOfView(0, 10, 10, 100)).toBe(true);   // 45 度
    expect(inFieldOfView(0, 10, 0, 100)).toBe(false);   // 90 度
    expect(inFieldOfView(0, 0, -10, 100)).toBe(false);  // 背後
    expect(inFieldOfView(Math.PI, 0, -10, 100)).toBe(true);
  });
});

describe('enemy brain state machine', () => {
  it('patrol -> alert when hearing a noise, and heads to the noise position', () => {
    const b = new EnemyBrain();
    b.hear(V(5, 5));
    expect(b.state).toBe('alert');
    expect(b.investigate.x).toBe(5);
    expect(b.hasInvestigate).toBe(true);
  });
  it('alert -> patrol after reaching the spot, waiting, and noticing nothing', () => {
    const b = new EnemyBrain();
    b.hear(V(5, 5));
    run(b, 1, { arrived: false });
    expect(b.state).toBe('alert');
    run(b, DEFAULT_BRAIN.alertWait + 3, { arrived: true });
    expect(b.state).toBe('patrol');
  });
  it('alert never lasts forever even if the spot is unreachable', () => {
    const b = new EnemyBrain();
    b.hear(V(5, 5));
    run(b, DEFAULT_BRAIN.alertMax + 2, { arrived: false });
    expect(b.state).toBe('patrol');
  });
  it('seeing the player builds awareness gradually: patrol -> alert -> attack', () => {
    const b = new EnemyBrain();
    run(b, 0.3, { canSee: true, gain: 1, dist: 8 });
    expect(b.state).toBe('alert');           // 發現值 0.3：起疑
    expect(b.awareness).toBeLessThan(1);
    run(b, 1.0, { canSee: true, gain: 1, dist: 8 });
    expect(b.state).toBe('attack');          // 滿了：發現，且距離在攻擊範圍內
    expect(b.consumeSpotted()).toBe(true);
    expect(b.consumeSpotted()).toBe(false);
  });
  it('spotting from beyond engage range starts a chase instead', () => {
    const b = new EnemyBrain();
    run(b, 2, { canSee: true, gain: 1, dist: 35, engageRange: 20 });
    expect(b.state).toBe('chase');
  });
  it('awareness drains if the player disappears before being noticed', () => {
    const b = new EnemyBrain();
    run(b, 0.35, { canSee: true, gain: 1 });
    expect(b.awareness).toBeGreaterThan(0.3);
    run(b, 6, { canSee: false });
    expect(b.awareness).toBe(0);
  });
  it('chase -> attack when in range with line of sight', () => {
    const b = new EnemyBrain();
    b.damaged(V(20, 0));
    expect(b.state).toBe('chase');
    run(b, 0.1, { canSee: true, dist: 10 });
    expect(b.state).toBe('attack');
  });
  it('attack -> chase when sight is lost, -> search after losing the target, -> patrol after searching', () => {
    const b = new EnemyBrain();
    b.damaged(V(10, 0));
    run(b, 0.1, { canSee: true, dist: 10 });
    expect(b.state).toBe('attack');
    run(b, DEFAULT_BRAIN.attackLoseTime + 0.3, { canSee: false });
    expect(b.state).toBe('chase');
    run(b, DEFAULT_BRAIN.loseTime + 0.3, { canSee: false });
    expect(b.state).toBe('search');
    expect(b.hasLastKnown).toBe(true);
    run(b, DEFAULT_BRAIN.searchTime + 0.5, { canSee: false });
    expect(b.state).toBe('patrol');
  });
  it('search -> attack again when the player is found', () => {
    const b = new EnemyBrain();
    b.damaged(V(10, 0));
    run(b, 0.1, { canSee: true, dist: 10 });
    run(b, 6, { canSee: false });
    expect(b.state).toBe('search');
    run(b, 2, { canSee: true, gain: 1, dist: 8 });
    expect(b.state).toBe('attack');
  });
  it('being shot goes straight to chase and flags a group alert', () => {
    const b = new EnemyBrain();
    b.damaged(V(3, 3));
    expect(b.state).toBe('chase');
    expect(b.consumeSpotted()).toBe(true);
    expect(b.lastKnown.x).toBe(3);
  });
  it('group alert pulls idle members into a chase, but not engaged or dead ones', () => {
    const idle = new EnemyBrain();
    idle.groupAlert(V(4, 4));
    expect(idle.state).toBe('chase');
    expect(idle.lastKnown.z).toBe(4);
    const dead = new EnemyBrain();
    dead.kill();
    dead.groupAlert(V(1, 1));
    dead.hear(V(1, 1));
    expect(dead.state).toBe('dead');
    const fighting = new EnemyBrain();
    fighting.damaged(V(0, 0));
    run(fighting, 0.1, { canSee: true, dist: 5 });
    fighting.hear(V(30, 30));
    expect(fighting.state).toBe('attack'); // 戰鬥中不被噪音分心
  });
  it('dead enemies stay dead', () => {
    const b = new EnemyBrain();
    b.kill();
    run(b, 5, { canSee: true, gain: 1 });
    expect(b.state).toBe('dead');
  });
});

describe('corpse loot', () => {
  const src = (kind: keyof typeof ENEMIES, over = {}) => ({
    def: ENEMIES[kind], weaponId: kind === 'rival_agent' ? 'rifle' : 'smg', mag: 7, reserve: 41,
    ammoType: kind === 'rival_agent' ? 'ammo_rifle' : 'ammo_pistol', armorDur: 20, ...over,
  });
  it('contains the weapon with its remaining magazine, the ammo and the armor with remaining durability', () => {
    const loot = buildCorpseLoot(src('rival_agent'), 'harbor_1990', () => 0);
    const w = loot.find((s) => s.id === 'rifle')!;
    expect(w.dur).toBe(7);
    expect(loot.filter((s) => s.id === 'ammo_rifle').reduce((n, s) => n + s.qty, 0)).toBeGreaterThanOrEqual(41);
    expect(loot.find((s) => s.id === 'armor_3')?.dur).toBe(20);
  });
  it('rival agents can drop chronite; guards never wear armor', () => {
    const rich = buildCorpseLoot(src('rival_agent'), 'harbor_1990', () => 0);
    expect(rich.some((s) => s.id === 'chronite_shard')).toBe(true);
    const g = buildCorpseLoot(src('guard', { weaponId: 'pistol', armorDur: 0 }), 'harbor_1990', () => 0.99);
    expect(g.some((s) => s.id.startsWith('armor_') && s.id !== 'armor_1' && s.id !== 'armor_2' && s.id !== 'armor_3')).toBe(false);
    expect(g.find((s) => s.id === 'pistol')?.dur).toBe(7);
  });
  it('splits ammo larger than a stack', () => {
    const loot = buildCorpseLoot(src('thug', { reserve: 300 }), 'harbor_1990', () => 0.99);
    for (const s of loot) expect(s.qty).toBeLessThanOrEqual(120);
    expect(loot.filter((s) => s.id === 'ammo_pistol').reduce((n, s) => n + s.qty, 0)).toBeGreaterThanOrEqual(300);
  });
});
