import * as THREE from 'three';
import type { ContainerType } from '../../../data/lootTables';
import type { EnemySpawn, EvacPoint, LootSpot, TraderSpot } from '../../RaidMap';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** 玩家抵達點：四個邊緣。yaw 以 -z 為 0，forward = (-sin, -cos) */
export const ARRIVALS: { position: THREE.Vector3; yaw: number }[] = [
  { position: v(-84, 0.02, -32), yaw: -Math.PI / 2 },   // 西北沙灘
  { position: v(86, 0.02, 40), yaw: Math.PI / 2 },      // 東側泥地
  { position: v(70, 0.02, -57), yaw: Math.PI / 2 },     // 東碼頭防波堤
  { position: v(-84, 0.02, 80), yaw: -Math.PI / 2 },    // 西南荒地
];

const L = (x: number, y: number, z: number, types: ContainerType[], yaw = 0, chance?: number): LootSpot =>
  ({ position: v(x, y, z), types, yaw, chance });

export const LOOT_SPOTS: LootSpot[] = [
  // 碼頭
  L(-50, 0.02, -56, ['crate', 'toolbox'], 0.3), L(4, 0.02, -56, ['crate'], 1.2), L(30, 0.02, -57, ['toolbox', 'crate'], 0), L(50, 0.02, -58, ['crate'], 0.6),
  // 貨船甲板
  L(-35, 3.2, -73, ['crate', 'toolbox'], 0.4), L(-12, 3.2, -68.5, ['crate'], 0), L(-26, 3.2, -67.8, ['toolbox', 'crate'], 1.2), L(-2, 3.2, -79, ['cabinet', 'safe'], 0, 0.8),
  // 貨櫃堆場（地面）
  L(-53, 0, -36, ['crate', 'toolbox'], 0.5), L(-38, 0, -24, ['crate'], 0), L(-27, 0, -12, ['toolbox', 'crate'], 1.2), L(-40, 0, 2.5, ['crate', 'toolbox'], 0.2),
  // 貨櫃頂（高低差路線）
  L(-40, 5.0, -42.8, ['crate', 'toolbox'], 0.4), L(-26, 5.0, -30.8, ['crate', 'toolbox'], 0.8), L(-12, 7.5, -40.3, ['safe', 'toolbox'], 0, 0.9), L(-55, 5.0, -5.6, ['crate', 'toolbox'], 1.0),
  // 倉庫
  L(28, 0, -33, ['crate'], 0), L(34, 0, -20, ['crate', 'toolbox'], 0.5), L(22, 0, -22, ['crate'], 1.4), L(16.5, 0, -26.5, ['toolbox', 'crate'], 0), L(44.2, 0, -27, ['crate'], -1.6), L(24, 0, -14.5, ['crate', 'toolbox'], 0.3),
  // 倉庫二樓
  L(12, 4.0, -40.5, ['crate', 'cabinet'], 0), L(28, 4.0, -41, ['toolbox', 'crate'], 0), L(40, 4.0, -40, ['crate', 'cabinet'], 0.4),
  // 辦公室
  L(-21.2, 0.03, 29, ['cabinet'], Math.PI), L(-12.4, 0.03, 28.9, ['cabinet'], Math.PI), L(-6, 0.03, 28.9, ['cabinet'], Math.PI), L(3.2, 0.03, 29, ['safe'], Math.PI),
  L(-5, 0.03, 40.2, ['cabinet', 'toolbox'], Math.PI / 2), L(-20.5, 0.03, 44.8, ['cabinet'], 0),
  // 警衛室
  L(15.5, 0.03, 83.6, ['toolbox'], 0), L(18.6, 0.03, 83.2, ['cabinet'], Math.PI),
  // 加油站與卡車停車場
  L(61, 0.03, 27.5, ['crate', 'toolbox'], 0), L(71, 0.03, 29.5, ['toolbox', 'cabinet'], Math.PI), L(62, 0, -40, ['crate', 'toolbox'], 0.2), L(78, 0, -34, ['toolbox', 'crate'], 0.5),
  // 魚市場
  L(40, 0.03, 44, ['crate'], 0.3), L(64, 0.03, 52, ['crate'], 0),
  // 排水隧道
  L(-66, -3.4, 62.4, ['crate', 'toolbox'], 0), L(-40, -3.4, 59.8, ['toolbox', 'crate'], 0), L(-51.5, -3.4, 65.4, ['safe', 'cabinet'], Math.PI / 2, 0.9),
  // 荒地
  L(-70, 0.02, -40, ['crate'], 0.5, 0.8), L(-84, 0.02, 30, ['crate', 'toolbox'], 0.2), L(85, 0.02, 64.5, ['crate', 'toolbox'], 0.4),
];

export const EVAC_POINTS: EvacPoint[] = [
  { name: '南側鐵門', position: v(5, 0.02, 87.2), radius: 3 },
  { name: '碼頭快艇', position: v(56, 0.02, -61.3), radius: 3, random: true },
  { name: '排水道出口', position: v(-70.5, -3.4, 60.5), radius: 3, random: true },
];

const E = (kind: EnemySpawn['kind'], x: number, y: number, z: number, yaw: number, group: string, chance: number, patrol?: [number, number, number][]): EnemySpawn =>
  ({ kind, position: v(x, y, z), yaw, group, chance, patrol: patrol?.map(([a, b, c]) => v(a, b, c)) });

export const ENEMY_SPAWNS: EnemySpawn[] = [
  // 警衛：入口、警衛室、辦公室走廊、碼頭
  E('guard', 3, 0.02, 79, Math.PI, 'gate', 1, [[3, 0.02, 79], [8, 0.02, 74], [2, 0.02, 68], [8, 0.02, 74]]),
  E('guard', 8, 0.02, 84, 0, 'gate', 0.9),
  E('guard', 15.5, 0.03, 85.4, Math.PI / 2, 'gate', 0.8),
  E('guard', -12, 0.03, 36.7, Math.PI / 2, 'office', 0.9, [[-18, 0.03, 36.7], [-12, 0.03, 36.7], [-4, 0.03, 36.7], [2, 0.03, 36.7], [-4, 0.03, 36.7]]),
  E('guard', -45, 0.02, -57, 0, 'dock', 0.9, [[-45, 0.02, -57], [-30, 0.02, -57], [5, 0.02, -54], [-30, 0.02, -57]]),
  E('guard', 40, 0.02, -56, 0, 'dock', 0.8, [[40, 0.02, -56], [20, 0.02, -48], [40, 0.02, -48]]),
  // 巡邏路線和黑道地盤有交集（陣營衝突）：警衛沿倉庫南側外牆（正對倉庫南門）與貨櫃堆場北緣巡邏
  E('guard', 13, 0, -7, 0, 'whpatrol', 0.85, [[13, 0, -7], [28, 0, -9.5], [45, 0, -7], [28, 0, -9.5]]),
  E('guard', -11, 0, -33, 0, 'yardpatrol', 0.8, [[-11, 0, -33], [-31, 0, -33], [-27, 0, -12], [-31, 0, -33]]),
  // 打手：倉庫、貨櫃區、卡車停車場、貨船
  E('thug', 20, 0, -25, 0, 'wh', 0.9, [[20, 0, -25], [34, 0, -27], [26, 0, -18], [20, 0, -18]]),
  E('thug', 36, 0, -33, Math.PI, 'wh', 0.9),
  E('thug', 28, 0, -39, 0, 'wh', 0.8),
  E('thug', 30, 4.0, -40.5, 0, 'wh', 0.7, [[12, 4.0, -40.5], [30, 4.0, -40.5], [40, 4.0, -40.5], [30, 4.0, -40.5]]),
  E('thug', -50, 0, -35.5, 0, 'yard', 0.9, [[-50, 0, -35.5], [-40, 0, -34], [-26, 0, -35], [-40, 0, -34]]),
  E('thug', -30, 0, -17, 0, 'yard', 0.8, [[-30, 0, -17], [-12, 0, -12], [-50, 0, -12], [-30, 0, -17]]),
  E('thug', -50, 5.0, -42.8, Math.PI, 'yard', 0.7),
  E('thug', 62, 0, -34, 0, 'trucks', 0.8, [[62, 0, -34], [74, 0, -30], [62, 0, -22], [74, 0, -30]]),
  E('thug', -30, 3.2, -76, 0, 'ship', 0.8, [[-36, 3.2, -76], [-24, 3.2, -76], [-12, 3.2, -66.5], [-24, 3.2, -76]]),
  // 敵對時代特工：高價值區域
  E('rival_agent', -1, 0.03, 32.8, Math.PI, 'rivalA', 0.6),
  E('rival_agent', -51.5, -3.4, 63.8, Math.PI, 'rivalB', 0.55),
  E('rival_agent', -11, 7.5, -40.3, 0, 'rivalC', 0.5),
  // 企業穿越者：辦公大樓與貨櫃頂（和警衛、黑道的地盤相鄰）
  E('rival_agent', -26, 5.0, -30.8, 0, 'rivalD', 0.5),
  E('rival_agent', -4, 0.03, 36.7, Math.PI / 2, 'rivalE', 0.5),
];

export const TRADER: TraderSpot = { name: '時代商行', position: v(51, 0.03, 48.2), yaw: Math.PI };

export const HARBOR_BOUNDS = new THREE.Box3(v(-92, -5, -90), v(92, 45, 92));
