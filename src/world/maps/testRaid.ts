import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { buildNavGrid } from '../../ai/NavBuilder';
import type { EnemySpawn, LootSpot, RaidMap } from '../RaidMap';
import type { ContainerType } from '../../data/lootTables';
import { buildTestGreybox } from './testGreybox';

/** 搜刮容器候選位置（灰盒地圖座標）。每次 Raid 隨機挑 8～12 個 */
const SPOTS: { x: number; z: number; y?: number; types: ContainerType[] }[] = [
  { x: -30, z: -14, types: ['crate', 'toolbox'] }, { x: -20, z: -3, types: ['toolbox', 'crate'] },
  { x: -8, z: 6, types: ['crate'] }, { x: 1, z: -3, types: ['toolbox', 'crate'] },
  { x: 12, z: -14, types: ['crate', 'corpse'] }, { x: 28, z: 14, types: ['crate', 'toolbox'] },
  { x: 34, z: -6, types: ['corpse', 'crate'] }, { x: 40, z: 22, types: ['corpse'] },
  { x: -38, z: 26, types: ['crate', 'toolbox'] }, { x: -20, z: 26, types: ['toolbox', 'crate'] },
  { x: 2, z: 26, types: ['crate', 'corpse'] }, { x: 18, z: 24, types: ['corpse', 'crate'] },
  { x: -24, z: 18.5, types: ['toolbox', 'crate'] }, { x: -10, z: 18.5, types: ['corpse', 'crate'] },
  { x: -36, z: -24, types: ['crate'] }, { x: 20, z: -24, types: ['crate', 'toolbox'] }, { x: 36, z: -24, types: ['toolbox', 'corpse'] },
  { x: 13, z: 2, types: ['cabinet'] }, { x: 24, z: 2, types: ['cabinet'] }, { x: 14, z: 9, types: ['cabinet', 'toolbox'] },
  { x: 20, z: 9.2, types: ['cabinet'] }, { x: 24.5, z: 8.2, types: ['safe'] },
  { x: -33, z: -8, y: 2.0, types: ['safe', 'cabinet'] }, { x: -18.5, z: -8, y: 1.6, types: ['cabinet', 'safe'] },
];

const v = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, 0, z);

/** 敵人配置：[種類, x, z, yaw, 群組, 巡邏路線]。6～8 個，三種都有 */
const ENEMY_DEFS: { kind: EnemySpawn['kind']; x: number; z: number; yaw: number; group?: string; patrol?: [number, number][] }[] = [
  { kind: 'guard', x: -30, z: 12, yaw: -Math.PI / 2, group: 'west' },
  { kind: 'guard', x: -30, z: -2, yaw: 0, group: 'west', patrol: [[-30, -2], [-16, -2], [-16, 10], [-30, 10]] },
  { kind: 'guard', x: -40, z: -15, yaw: -Math.PI / 2, patrol: [[-40, -15], [-5, -15], [-5, -12], [-40, -12]] },
  { kind: 'thug', x: 30, z: 12, yaw: 0, group: 'east', patrol: [[30, 12], [40, 12], [40, 20], [30, 20]] },
  { kind: 'thug', x: 34, z: 16, yaw: Math.PI, group: 'east' },
  { kind: 'thug', x: 2, z: 22, yaw: Math.PI / 2, patrol: [[2, 22], [14, 22]] },
  { kind: 'rival_agent', x: 22, z: 5, yaw: Math.PI / 2, group: 'room' },
  { kind: 'rival_agent', x: 38, z: -12, yaw: Math.PI },
];

/**
 * M4 測試用 Raid 地圖：以 M1/M2 灰盒（每種材質一區、樓梯、斜坡、室內、隧道）為基礎，
 * 加上 RaidMap 合約需要的抵達點、搜刮點、撤離點、敵人配置與導航圖（用 NavBuilder 在碰撞上自動產生，
 * 所以每條邊都保證可直線通行）。正式地圖完成後由 maps/index.ts 切換。
 */
export async function loadTestRaid(): Promise<RaidMap> {
  const g = buildTestGreybox();
  const octree = new Octree();
  octree.fromGraphNode(g.collision);
  const bounds = new THREE.Box3(new THREE.Vector3(-44, -1, -27), new THREE.Vector3(44, 6, 31));
  const nav = buildNavGrid(octree, bounds, { spacing: 3 });

  const snap = (x: number, z: number): THREE.Vector3 => {
    let best = new THREE.Vector3(x, 0, z), bd = Infinity;
    for (const n of nav.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n.clone(); }
    }
    return best;
  };

  const lootSpots: LootSpot[] = SPOTS.map((s) => ({ position: new THREE.Vector3(s.x, s.y ?? 0, s.z), types: s.types }));
  const enemySpawns: EnemySpawn[] = ENEMY_DEFS.map((d) => ({
    kind: d.kind,
    position: snap(d.x, d.z),
    yaw: d.yaw,
    group: d.group,
    patrol: d.patrol?.map(([x, z]) => snap(x, z)),
  }));

  return {
    ...g,
    eraId: 'harbor_1990',
    arrivals: [
      { position: new THREE.Vector3(0, 0.1, 12), yaw: 0 },
      { position: new THREE.Vector3(-38, 0.1, 26), yaw: -Math.PI / 2 },
    ],
    lootSpots,
    evacPoints: [
      { name: '東側出口', position: v(38, 26), radius: 2.6 },
      { name: '西側出口', position: v(-36, 2), radius: 2.6, random: true },
      { name: '南側閘門', position: v(0, -24), radius: 2.6, random: true },
    ],
    enemySpawns,
    nav,
    bounds,
  };
}
