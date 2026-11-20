import * as THREE from 'three';
import type { ContainerType } from '../../../data/lootTables';
import type { FactionId } from '../../../data/factions';
import type { EnemySpawn, EvacPoint, LootSpot, TraderSpot } from '../../RaidMap';
import { floorY } from './layout';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** 玩家抵達點：六個邊緣。yaw 以 -z 為 0，forward = (-sin, -cos) */
export const ARRIVALS: { position: THREE.Vector3; yaw: number }[] = [
  { position: v(-124, 0.02, -34), yaw: -Math.PI / 2 },  // 西北沙灘
  { position: v(125, 0.02, -14), yaw: Math.PI / 2 },    // 東側泥地（鐵道站與大樓之間）
  { position: v(70, 0.02, -57), yaw: Math.PI / 2 },     // 東碼頭防波堤
  { position: v(-124, 0.02, 100), yaw: -Math.PI / 2 },  // 西南荒地
  { position: v(-40, 0.02, 160), yaw: 0 },              // 南側草地（停車場後方）
  { position: v(110, 0.02, 150), yaw: 0 },              // 東南空地
];

const L = (x: number, y: number, z: number, types: ContainerType[], yaw = 0, chance?: number): LootSpot =>
  ({ position: v(x, y, z), types, yaw, chance });

const F = [floorY(0), floorY(1), floorY(2), floorY(3), floorY(4), floorY(5)];

export const LOOT_SPOTS: LootSpot[] = [
  // ---- 碼頭與貨船甲板 ----
  L(-50, 0.02, -56, ['crate', 'toolbox'], 0.3), L(4, 0.02, -56, ['crate'], 1.2), L(50, 0.02, -58, ['crate'], 0.6),
  L(-35, 3.2, -73, ['crate', 'toolbox'], 0.4), L(-26, 3.2, -67.8, ['toolbox', 'crate'], 1.2), L(-2, 3.2, -79, ['cabinet', 'crate'], 0, 0.8),
  // ---- 貨船內部：船艙、機房、貨艙（貨艙最值錢）----
  L(-7.85, 0.3, -77.85, ['cabinet', 'toolbox'], Math.PI), L(-10.2, 0.3, -66.6, ['crate', 'toolbox'], 0.4),
  L(-7, -2.9, -77.3, ['toolbox', 'crate'], 0), L(-3.5, -2.9, -67.8, ['toolbox', 'cabinet'], 1.2),
  L(-30.5, -2.9, -77, ['crate', 'safe'], 0, 0.9), L(-37.4, -2.9, -78.8, ['crate', 'cabinet'], 0.5), L(-22.9, -2.9, -78.9, ['crate', 'toolbox'], 0), L(-20.0, -2.9, -66.6, ['crate', 'cabinet'], 1.4),
  // ---- 貨櫃堆場（地面與貨櫃頂）----
  L(-53, 0, -36, ['crate', 'toolbox'], 0.5), L(-38, 0, -24, ['crate'], 0), L(-27, 0, -12, ['toolbox', 'crate'], 1.2),
  L(-40, 5.0, -42.8, ['crate', 'toolbox'], 0.4), L(-26, 5.0, -30.8, ['crate', 'toolbox'], 0.8), L(-12, 7.5, -40.3, ['safe', 'toolbox'], 0, 0.9),
  // ---- 倉庫：地面、二樓、三樓吊車維修走道與駕駛室 ----
  L(28, 0, -33, ['crate'], 0), L(34, 0, -20, ['crate', 'toolbox'], 0.5), L(16.5, 0, -26.5, ['toolbox', 'crate'], 0),
  L(12, 4.0, -40.5, ['crate', 'cabinet'], 0), L(40, 4.0, -40, ['crate', 'cabinet'], 0.4),
  L(14, 8.0, -42.5, ['crate', 'cabinet'], 0), L(34, 8.0, -42.5, ['toolbox', 'cabinet'], 0.3), L(42.6, 8.0, -40.6, ['toolbox', 'cabinet'], Math.PI, 0.9),
  // ---- 舊辦公室、警衛室、加油站、魚市場、卡車場 ----
  L(-21.2, 0.03, 29, ['cabinet'], Math.PI), L(3.2, 0.03, 29, ['cabinet'], Math.PI), L(-5, 0.03, 40.2, ['cabinet', 'toolbox'], Math.PI / 2),
  L(18.6, 0.03, 83.2, ['cabinet'], Math.PI), L(61, 0.03, 27.5, ['crate', 'toolbox'], 0), L(64, 0.03, 52, ['crate'], 0), L(78, 0, -34, ['toolbox', 'crate'], 0.5),
  // ---- 排水隧道 ----
  L(-66, -3.4, 62.4, ['crate', 'toolbox'], 0), L(-51.5, -3.4, 65.4, ['cabinet', 'toolbox'], Math.PI / 2, 0.9),
  // ---- 海順海運大樓：1F ~ 5F 與頂樓（越高越值錢；5F 董事長室的保險櫃固定出現）----
  L(111, F[0], -2.2, ['cabinet', 'toolbox'], 0), L(118, F[0], -1.2, ['toolbox'], 0.3),
  L(122.7, F[1], 12, ['cabinet', 'crate'], Math.PI / 2), L(113.6, F[1], 0.8, ['cabinet'], 0),
  L(108.85, F[2], 13, ['cabinet'], 0), L(115.25, F[2], 8, ['cabinet', 'crate'], Math.PI), L(109, F[2], -0.6, ['cabinet'], Math.PI / 2),
  L(121.5, F[3], 13.4, ['cabinet', 'toolbox'], 0, 0.9),
  L(106.6, F[4], 14, ['safe'], Math.PI / 2),
  L(116, F[5], 4.2, ['toolbox', 'cabinet'], 0, 0.8),
  // ---- 地下停車場：B1、B2、金庫室 ----
  L(-70, -3.4, 114, ['crate', 'toolbox'], 0.3), L(-44, -3.4, 136, ['toolbox', 'crate'], 0), L(-30, -3.4, 144, ['crate', 'cabinet'], 1.2),
  L(-60, -6.9, 114, ['crate', 'toolbox'], 0), L(-48, -6.9, 144, ['toolbox', 'cabinet'], 0.6),
  L(-80.6, -6.9, 108.5, ['safe', 'cabinet'], 0, 0.9), L(-76, -6.9, 108.2, ['cabinet', 'crate'], 0),
  // ---- 鐵道貨運站 ----
  L(109.1, 1.1, -42.45, ['crate', 'toolbox'], 0), L(124, 1.1, -43.4, ['crate', 'cabinet'], 0), L(100.6, 0.03, -30.9, ['cabinet', 'toolbox'], Math.PI), L(118, 1.1, -39.9, ['crate'], 0.3),
  // ---- 台式老街 ----
  L(101.8, 0.03, 57.5, ['cabinet', 'toolbox'], 0), L(125, 0.03, 41.5, ['crate', 'cabinet'], 0), L(125.5, 0.03, 80, ['crate', 'toolbox'], 0), L(101, 0.03, 83, ['cabinet', 'crate'], 0), L(110.6, 0.03, 95.5, ['cabinet', 'crate'], 0.3),
  // ---- 修船廠乾塢與修理棚 ----
  L(-114.5, 0.0, 20, ['crate', 'toolbox'], 0), L(-120, -6, 10.6, ['crate', 'toolbox'], 0.2), L(-108, -6, 22.6, ['toolbox', 'crate'], 1.2), L(-108, 0.03, 38.8, ['toolbox', 'crate'], 0),
  // ---- 南側：抽油站、油槽區、廢車場、南大門 ----
  L(11, 0.03, 127, ['toolbox', 'cabinet'], 0), L(12, 0, 108, ['crate', 'toolbox'], 0.5), L(60, 0, 124, ['crate', 'toolbox'], 0.4), L(88, 0, 142, ['crate', 'toolbox'], 1.0), L(15.2, 0.03, 159.8, ['toolbox'], 0),
  // ---- 荒地與海灘 ----
  L(-84, 0.02, 30, ['crate', 'toolbox'], 0.2), L(85, 0.02, 64.5, ['crate', 'toolbox'], 0.4), L(-110, 0.02, -30, ['crate', 'toolbox'], 0.5, 0.8),
];

export const EVAC_POINTS: EvacPoint[] = [
  { name: '南大門', position: v(8, 0.02, 161), radius: 3 },
  { name: '碼頭快艇', position: v(56, 0.02, -61.3), radius: 3 },
  { name: '停車場出口', position: v(-1, 0.02, 125), radius: 3, random: true },
  { name: '貨運專用線', position: v(127.5, 0.02, -50), radius: 3, random: true },
  { name: '頂樓直升機', position: v(112.5, F[5], 9), radius: 3, random: true },
];

const E = (kind: EnemySpawn['kind'], x: number, y: number, z: number, yaw: number, group: string, chance: number, patrol?: [number, number, number][], faction?: FactionId): EnemySpawn =>
  ({ kind, position: v(x, y, z), yaw, group, chance, patrol: patrol?.map(([a, b, c]) => v(a, b, c)), faction });

export const ENEMY_SPAWNS: EnemySpawn[] = [
  // ---- 警衛（港務）：沿著各陣營地盤的邊緣巡邏，和黑道、企業穿越者有交集 ----
  E('guard', -45, 0.02, -57, 0, 'dock', 0.9, [[-45, 0.02, -57], [-30, 0.02, -57], [5, 0.02, -54], [-30, 0.02, -57]], 'guard'),
  E('guard', 40, 0.02, -56, 0, 'dock', 0.8, [[40, 0.02, -56], [20, 0.02, -48], [40, 0.02, -48]], 'guard'),
  E('guard', 10, 0.02, 156, 0, 'southgate', 0.9, [[10, 0.02, 156], [22, 0.02, 153], [4, 0.02, 150]], 'guard'),
  E('guard', -12, 0.03, 36.7, Math.PI / 2, 'office', 0.9, [[-18, 0.03, 36.7], [-12, 0.03, 36.7], [-4, 0.03, 36.7], [2, 0.03, 36.7], [-4, 0.03, 36.7]], 'guard'),
  E('guard', 13, 0, -7, 0, 'whpatrol', 0.85, [[13, 0, -7], [28, 0, -9.5], [45, 0, -7], [28, 0, -9.5]], 'guard'),
  E('guard', -11, 0, -33, 0, 'yardpatrol', 0.8, [[-11, 0, -33], [-31, 0, -33], [-27, 0, -12], [-31, 0, -33]], 'guard'),
  E('guard', 108.8, F[0], 9.6, 0, 'tower', 0.9, [[108.8, F[0], 9.6], [116, F[0], 9.6], [116, F[0], 6.6], [108.8, F[0], 6.6]], 'guard'),
  E('guard', 100, 1.1, -39.8, Math.PI / 2, 'railpatrol', 0.85, [[100, 1.1, -39.8], [110, 1.1, -39.8], [122, 1.1, -39.8], [110, 1.1, -39.8]], 'guard'),
  E('guard', 113, 0, 42, Math.PI, 'street', 0.8, [[113, 0, 42], [113, 0, 60], [113, 0, 80], [113, 0, 60]], 'guard'),
  // ---- 海龍幫（打手）：倉庫、貨櫃區、貨艙、鐵道站、老街、油槽與廢車場 ----
  E('thug', 20, 0, -25, 0, 'wh', 0.9, [[20, 0, -25], [34, 0, -27], [26, 0, -18], [20, 0, -18]], 'triad'),
  E('thug', 36, 0, -33, Math.PI, 'wh', 0.9, undefined, 'triad'),
  E('thug', 30, 4.0, -38.6, 0, 'wh', 0.7, [[12, 4.0, -38.6], [24, 4.0, -38.6], [40, 4.0, -38.6], [24, 4.0, -38.6]], 'triad'),
  E('thug', 14, 8.0, -42.5, 0, 'wh', 0.7, [[10, 8.0, -42.5], [30, 8.0, -42.5], [30.8, 8.0, -30], [30.8, 8.0, -18], [30.8, 8.0, -30]], 'triad'),
  E('thug', -50, 0, -35.5, 0, 'yard', 0.9, [[-50, 0, -35.5], [-40, 0, -34], [-26, 0, -35], [-40, 0, -34]], 'triad'),
  E('thug', -31, -2.9, -67.75, 0, 'hold', 0.85, undefined, 'triad'),
  E('thug', -58, -3.4, 122.8, 0, 'park', 0.8, [[-58, -3.4, 122.8], [-40, -3.4, 122.8], [-40, -3.4, 128], [-58, -3.4, 128]], 'triad'),
  E('thug', 110, 0, -53.5, 0, 'rail', 0.85, [[104, 0, -53.5], [120, 0, -53.5]], 'triad'),
  E('thug', 101, 0.03, 42.2, 0, 'street', 0.8, undefined, 'triad'),
  E('thug', -2, 0, 123.6, 0, 'tank', 0.8, [[-2, 0, 123.6], [7, 0, 123.6], [7, 0, 128.8], [-2, 0, 128.8]], 'triad'),
  E('thug', 56, 0, 114, 0, 'junk', 0.85, [[50, 0, 114], [90, 0, 114], [90, 0, 116], [50, 0, 114]], 'triad'),
  // ---- 敵對時代特工（企業穿越者）：高樓層、貨櫃頂、地下、乾塢 ----
  E('rival_agent', -1, 0.03, 32.8, Math.PI, 'rivalA', 0.6),
  E('rival_agent', -51.5, -3.4, 63.8, Math.PI, 'rivalB', 0.55),
  E('rival_agent', -11, 7.5, -40.3, 0, 'rivalC', 0.5, undefined, 'corp_aurora'),
  E('rival_agent', 112.05, F[2], 10.5, 0, 'rivalT3', 0.6, [[112.05, F[2], 7.6], [112.05, F[2], 13.4], [112.05, F[2], 7.6]], 'corp_aurora'),
  E('rival_agent', 113.5, F[4], 10, Math.PI, 'rivalT5', 0.7, undefined, 'corp_chronos'),
  E('rival_agent', 121.5, F[4], 13, Math.PI, 'rivalT5', 0.6, undefined, 'corp_chronos'),
  E('rival_agent', 122.9, F[5], 13.6, Math.PI, 'rivalRoof', 0.6, undefined, 'corp_crimson'),
  E('rival_agent', -79, -6.9, 108.5, 0, 'rivalB2', 0.65, undefined, 'corp_crimson'),
  E('rival_agent', -120, 0.0, 16.6, 0, 'rivalDock', 0.5, undefined, 'corp_aurora'),
];

export const TRADER: TraderSpot = { name: '時代商行', position: v(51, 0.03, 48.2), yaw: Math.PI };

/** 地圖邊界（AI 與除錯用）：陸地 x ±130、z -64..166，加上海面與兩層地下、屋頂的高度 */
export const HARBOR_BOUNDS = new THREE.Box3(v(-132, -12, -90), v(132, 45, 168));
