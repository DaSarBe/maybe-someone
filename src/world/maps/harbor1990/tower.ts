import type { Surface } from '../../Surface';
import { bunkAt, chairAt, deskAt, lockerAt, shelfRow, sofaAt, tableAt } from './furniture';
import { TOWER, TOWER_CORE, TOWER_SHAFT, floorY } from './layout';
import { Ctx, uStair, type Opening, type Rect } from './util';

/**
 * 海順海運大樓：5 層辦公樓 + 頂樓（x 100..124, z -6..16）。
 *  - 西北角：U 形樓梯間（每層兩段，頂樓有出口小屋）
 *  - 西南角：電梯井（各層以護欄擋住開口，從破掉的電梯門可以往下看；1F 可以走進井底）
 *  - 1F 大廳與警衛櫃台、2F 業務部、3F 檔案室、4F 主管辦公室、5F 董事長室與保險櫃
 *  - 頂樓：水塔、天線、直升機坪、狙擊點
 */

const FLOOR_SURF: Surface[] = ['tile', 'carpet', 'concrete', 'carpet', 'carpet'];
const FLOOR_COL = ['#cfcab8', '#8a8f98', '#a9a9a2', '#7d3f46', '#2f4a66'];
const CORE_HOLE: Rect = { x0: TOWER_CORE.x0, z0: TOWER_CORE.z0, x1: TOWER_CORE.x1, z1: TOWER_CORE.u };
const SHAFT_HOLE: Rect = { x0: TOWER_SHAFT.x0, z0: TOWER_SHAFT.z0, x1: TOWER_SHAFT.x1, z1: TOWER_SHAFT.z1 };

export const TOWER_ROOF_Y = floorY(5);
const door = (a: number, w = 1.6, h = 2.3): Opening => ({ a, b: a + w, h });

export function buildTower(c: Ctx): void {
  const { x0, x1, z0, z1, t } = TOWER;
  const ix0 = x0 + t, ix1 = x1 - t, iz0 = z0 + t, iz1 = z1 - t;
  const roofY = TOWER_ROOF_Y;
  const wc = '#bdb7a6';

  c.setRegion('tower', { kind: 'shell', building: 'tower' });
  // ---- 外牆（全高）----
  c.wall('x', z1 - t / 2, t, x0, x1, 0, roofY, [{ a: 110.5, b: 113.5, h: 2.7 }], 'concrete', wc);
  c.wall('x', z0 + t / 2, t, x0, x1, 0, roofY, [{ a: 118.5, b: 120.5, h: 2.4 }], 'concrete', wc);
  c.wall('z', x0 + t / 2, t, z0, z1, 0, roofY, [], 'concrete', wc);
  c.wall('z', x1 - t / 2, t, z0, z1, 0, roofY, [], 'concrete', wc);
  buildFacade(c);
  // 大門與後門：門兩側的導航點
  c.doorHint('x', z1 - t / 2, 110.5, 113.5, 0.03, 1.4);
  c.doorHint('x', z0 + t / 2, 118.5, 120.5, 0.03, 1.4);

  // ---- 樓板 ----
  const slabRect: Rect = { x0: ix0, z0: iz0, x1: ix1, z1: iz1 };
  for (let k = 0; k <= 5; k++) {
    const holes = k === 0 ? [] : [CORE_HOLE, SHAFT_HOLE];
    if (k === 5) c.ground('concrete', '#8c8a84', slabRect, roofY, 0.4, holes);
    else c.ground(FLOOR_SURF[k], FLOOR_COL[k], slabRect, floorY(k), k === 0 ? 0.13 : 0.4, holes);
  }

  // ---- 樓梯間與電梯井（每層）----
  for (let k = 0; k < 5; k++) buildCoreFloor(c, k);
  buildPenthouse(c);
  buildShaftWalls(c);

  // ---- 各層室內（區域：只有在樓內且樓層相鄰才畫）----
  for (let k = 0; k < 5; k++) {
    c.within(`tower_f${k + 1}`, { kind: 'interior', building: 'tower', floor: k }, () => buildFloor(c, k), k === 0 ? 0.95 : 0.88);
  }

  buildRoof(c);

  // ---- 回音區：每層一個、樓梯間與電梯井另外標（後定義者優先）----
  for (let k = 0; k < 5; k++) {
    const y0 = floorY(k) - (k === 0 ? 0.5 : 0.45), y1 = floorY(k + 1) - 0.45;
    c.zone(k === 0 ? 'indoor_large' : 'indoor_small', `tower_${k + 1}f`, ix0, y0, iz0, ix1, y1, iz1);
  }
  c.zone('indoor_large', 'tower_stairs', TOWER_CORE.x0, -0.5, TOWER_CORE.z0, TOWER_CORE.x1 + 0.1, roofY + 3.2, TOWER_CORE.z1);
  c.zone('indoor_large', 'tower_shaft', TOWER_SHAFT.x0, -0.5, TOWER_SHAFT.z0, TOWER_SHAFT.x1, roofY, TOWER_SHAFT.z1);
}

/** 外牆的窗（深色玻璃 + 窗框，純視覺）與一樓雨遮、招牌 */
function buildFacade(c: Ctx): void {
  const { x0, x1, z0, z1 } = TOWER;
  const glass = '#1d2a36', frame = '#d9d5c7';
  for (let k = 0; k < 5; k++) {
    const y = floorY(k) + 0.9, h = 1.5;
    // 南北面
    for (let x = x0 + 2.2; x < x1 - 2; x += 3.6) {
      if (k === 0 && x > 109 && x < 115) continue; // 大門
      for (const [zf, o] of [[z1, 1], [z0, -1]] as const) {
        if (k === 0 && zf === z0 && x > 117 && x < 121) continue;
        c.vis('metal', frame, x - 0.04, y - 0.06, zf + o * 0.0, x + 2.04, y + h + 0.06, zf + o * 0.06);
        c.vis('metal', glass, x, y, zf + o * 0.055, x + 2.0, y + h, zf + o * 0.07);
      }
    }
    // 東西面
    for (let z = z0 + 2.4; z < z1 - 2; z += 3.6) {
      for (const [xf, o] of [[x0, -1], [x1, 1]] as const) {
        c.vis('metal', frame, xf + o * 0.0, y - 0.06, z - 0.04, xf + o * 0.06, y + h + 0.06, z + 2.04);
        c.vis('metal', glass, xf + o * 0.055, y, z, xf + o * 0.07, y + h, z + 2.0);
      }
    }
    // 樓層分隔的水泥帶
    const by = floorY(k + 1) - 0.4;
    c.vis('concrete', '#8f8a7c', x0 - 0.08, by, z0 - 0.08, x1 + 0.08, by + 0.4, z0 + 0.0);
    c.vis('concrete', '#8f8a7c', x0 - 0.08, by, z1, x1 + 0.08, by + 0.4, z1 + 0.08);
    c.vis('concrete', '#8f8a7c', x0 - 0.08, by, z0, x0, by + 0.4, z1);
    c.vis('concrete', '#8f8a7c', x1, by, z0, x1 + 0.08, by + 0.4, z1);
  }
  // 一樓大門雨遮與外牆招牌
  c.mm('concrete', '#7a766a', 108.5, 2.9, z1, 115.5, 3.2, z1 + 2.4);
  c.mm('metal', '#3a3d3f', 108.6, 0, z1 + 2.1, 108.9, 2.9, z1 + 2.4);
  c.mm('metal', '#3a3d3f', 115.1, 0, z1 + 2.1, 115.4, 2.9, z1 + 2.4);
  c.sign({ text: '海順海運大樓', x: 112, y: 4.9, z: z1 + 0.09, yaw: 0, w: 10, h: 1.5, bg: '#173a63', fg: '#f4f0dc', font: 0.85 });
  c.sign({ text: '海順海運', x: x0 - 0.09, y: 13.6, z: 5, yaw: -Math.PI / 2, w: 9, h: 2.2, bg: '#173a63', fg: '#f4f0dc', font: 0.85 });
  c.sign({ text: '海順海運', x: x1 + 0.09, y: 13.6, z: 5, yaw: Math.PI / 2, w: 9, h: 2.2, bg: '#173a63', fg: '#f4f0dc', font: 0.85 });
}

/** 一層樓的樓梯間：兩道牆、一組 U 形樓梯、導航點 */
function buildCoreFloor(c: Ctx, k: number): void {
  const y = floorY(k), top = floorY(k + 1) - 0.4;
  const C = TOWER_CORE;
  // 東牆（實心）與南牆（門通往走廊）
  c.wall('z', C.x1 + 0.1, 0.2, C.z0, C.z1 + 0.2, y, top, [], 'concrete', '#c9c5b2');
  c.wall('x', C.z1 + 0.1, 0.2, C.x0, C.x1, y, top, [door(101.0, 1.6, 2.3)], 'concrete', '#c9c5b2');
  const s = uStair(c, {
    axis: 'z', dir: -1, u: C.u, v: C.v, w: C.w, y, H: TOWER.H, s: 'concrete', color: '#8a8d8e', alt: '#7b7e80', plat: '#7b7e80', solid: k === 0,
  });
  for (const p of s.pts) c.hint(p.x, p.y, p.z);
  c.hint(s.landingPt.x, s.landingPt.y, s.landingPt.z);
  // 入口前廳與走廊
  c.hint(101.8, y, 1.0); c.hint(103.6, y, 1.0); c.hint(101.8, y, 3.6); c.hint(103.8, y, 3.6);
  c.doorHint('x', C.z1 + 0.1, 101.0, 102.6, y, 1.0);
  // 樓梯的欄杆窗與樓層標示
  c.sign({ text: `${k + 1}F`, x: 105.0 + 0.0, y: y + 2.1, z: -1.8, yaw: -Math.PI / 2, w: 0.7, h: 0.5, bg: '#b3261e', fg: '#ffffff', font: 0.9 });
}

/** 頂樓出口小屋：樓梯間往上延伸的牆與屋頂 */
function buildPenthouse(c: Ctx): void {
  const C = TOWER_CORE, y = TOWER_ROOF_Y;
  c.wall('z', C.x1 + 0.1, 0.2, C.z0, C.z1 + 0.2, y, y + 3.0, [], 'concrete', '#c9c5b2');
  c.wall('x', C.z1 + 0.1, 0.2, C.x0, C.x1, y, y + 3.0, [door(101.0, 1.6, 2.3)], 'concrete', '#c9c5b2');
  c.mm('concrete', '#7a766a', TOWER.x0, y + 3.0, TOWER.z0, C.x1 + 0.3, y + 3.4, C.z1 + 0.4);
  // 樓梯頂端的出口前廳
  for (const p of [[101.8, 1.0], [103.6, 1.0], [101.8, 3.6]]) c.hint(p[0], y, p[1]);
  c.doorHint('x', C.z1 + 0.1, 101.0, 102.6, y, 1.0);
}

/** 電梯井：四面牆、每層的護欄開口、井底的殘骸 */
function buildShaftWalls(c: Ctx): void {
  const S = TOWER_SHAFT;
  const wallC = '#6f7377';
  for (let k = 0; k < 5; k++) {
    const y = floorY(k), top = floorY(k + 1) - 0.4;
    // 北牆（電梯門的開口 x 101.6..103.0）
    c.wall('x', S.z0 - 0.1, 0.2, S.x0, S.x1 + 0.2, y, top, [{ a: 101.6, b: 103.0, h: 2.4 }], 'concrete', wallC);
    c.wall('z', S.x1 + 0.1, 0.2, S.z0, S.z1 + 0.2, y, top, [], 'concrete', wallC);
    c.wall('x', S.z1 + 0.1, 0.2, S.x0, S.x1 + 0.2, y, top, [], 'concrete', wallC);
    if (k > 0) {
      // 破掉的電梯門：護欄擋住開口（碰撞到 2.4m），視覺上是歪掉的門片與黃黑警示條
      c.col(101.6, y, S.z0 - 0.2, 103.0, y + 2.4, S.z0);
      c.vis('metal', '#c9a227', 101.6, y + 0.95, S.z0 - 0.14, 103.0, y + 1.05, S.z0 - 0.04);
      c.vis('metal', '#7b8085', 101.6, y, S.z0 - 0.1, 101.95, y + 2.2, S.z0 - 0.02);
      c.vis('metal', '#7b8085', 102.6, y + 0.6, S.z0 - 0.1, 103.0, y + 2.0, S.z0 - 0.02);
    }
    // 井內的導軌與配重（視覺）
    c.vis('metal', '#3d4144', S.x1 - 0.12, y, 6.4, S.x1, top, 6.55);
    c.vis('metal', '#3d4144', S.x1 - 0.12, y, 8.3, S.x1, top, 8.45);
  }
  // 井底：電梯箱殘骸（頂部破洞）與積水
  c.mm('metal', '#59606a', 101.0, 0.03, 6.2, 103.4, 0.5, 8.6);
  c.vis('metal', '#2c3136', 101.2, 0.5, 6.4, 103.2, 0.58, 8.4);
  c.vis('water', '#35606a', 100.6, 0.03, 5.8, 104.0, 0.06, 9.2);
  c.pointLight(102.2, floorY(2) + 1.0, 7.4, '#d6ecc8', 7, 16, 0.7);
}

// ---------------------------------------------------------------- 各層室內
function buildFloor(c: Ctx, k: number): void {
  const y = floorY(k), top = floorY(k + 1) - 0.4;
  const pw = (axis: 'x' | 'z', fixed: number, a: number, b: number, ops: Opening[] = [], color = '#cfcab9'): void =>
    c.wall(axis, fixed, 0.2, a, b, y, top, ops, 'concrete', color);
  const hintDoor = (axis: 'x' | 'z', fixed: number, o: Opening): void => c.doorHint(axis, fixed, o.a, o.b, y, 1.1);

  // 走廊北牆（z=2.5）：通往 N1、N2
  const dN1 = door(107.0), dN2 = door(117.0);
  pw('x', 2.5, 105.0, 123.6, [dN1, dN2]); hintDoor('x', 2.5, dN1); hintDoor('x', 2.5, dN2);
  pw('z', 114.5, -5.6, 2.4);
  // 走廊南牆（z=5.5）：1F 是一整面寬的拱門通往大廳
  if (k === 0) {
    pw('x', 5.5, 104.2, 123.6, [{ a: 106.0, b: 122.0, h: 2.5 }]);
    c.doorHint('x', 5.5, 107, 109, y, 1.2); c.doorHint('x', 5.5, 113, 115, y, 1.2); c.doorHint('x', 5.5, 119, 121, y, 1.2);
  } else {
    const dS = [door(108.0), door(114.7), door(119.8)];
    pw('x', 5.5, 104.2, 123.6, dS); dS.forEach((o) => hintDoor('x', 5.5, o));
  }
  // 南側隔間（x=112.1、118.1）：2F 業務部與 3F 檔案室是開放空間，1F 是大廳
  if (k === 3) {
    pw('z', 112.1, 5.6, 15.6, [door(9.4)]); pw('z', 118.1, 5.6, 15.6, [door(9.4)]);
    c.doorHint('z', 112.1, 9.4, 11.0, y, 1.1); c.doorHint('z', 118.1, 9.4, 11.0, y, 1.1);
  }
  if (k === 4) { pw('z', 118.1, 5.6, 15.6, [door(9.4)]); c.doorHint('z', 118.1, 9.4, 11.0, y, 1.1); }
  // 雜物間（電梯井南側）
  pw('z', 104.1, 9.4, 15.6, [door(11.2)]); c.doorHint('z', 104.1, 11.2, 12.8, y, 1.1);
  // 雜物間內的置物
  lockerAt(c, y, 100.6, 14.9, 103.6, 15.5, 1.8);
  c.prop('crate', 101.6, y, 10.6, 0.3, 0.9);

  // 日光燈（視覺）
  for (let x = 107; x < 123; x += 5) c.vis('metal', '#f2efc9', x - 1.0, top - 0.1, 3.9, x + 1.0, top, 4.1);

  switch (k) {
    case 0: lobby(c, y); break;
    case 1: sales(c, y); break;
    case 2: archive(c, y); break;
    case 3: executive(c, y); break;
    default: chairman(c, y); break;
  }
  // 走廊上的飲水機、垃圾桶
  c.mm('metal', '#6e7a80', 122.7, y, 2.8, 123.4, y + 1.1, 3.4);
  c.mm('metal', '#5b646a', 105.3, y, 4.8, 105.8, y + 0.7, 5.3);
}

function lobby(c: Ctx, y: number): void {
  // 大廳：地毯、接待櫃台、安檢閘門、沙發
  c.mm('carpet', '#6b3030', 106.0, y, 7.4, 122.0, y + 0.012, 9.0);
  tableAt(c, y, 107.5, 11.2, 115.5, 12.4, 1.05, '#5b4a35');
  c.vis('wood', '#8a6a42', 107.4, y + 1.05, 11.1, 115.6, y + 1.12, 12.5);
  chairAt(c, y, 111.5, 12.9, '-z', '#2d2d33');
  c.sign({ text: '海順海運 服務台', x: 111.5, y: y + 2.6, z: 15.52, yaw: Math.PI, w: 5, h: 0.7, bg: '#173a63', fg: '#f4f0dc', font: 0.8 });
  for (const x of [107.0, 108.4, 117.0, 118.4]) {
    c.mm('metal', '#8a8f94', x, y, 7.2, x + 0.1, y + 1.0, 8.4);
  }
  sofaAt(c, y, 119.0, 13.2, 122.8, 14.6, '#3f4a55');
  sofaAt(c, y, 119.0, 10.0, 122.8, 11.4, '#3f4a55');
  tableAt(c, y, 120.0, 12.0, 121.6, 12.8, 0.45);
  // 盆栽
  for (const [x, z] of [[106.2, 6.2], [122.6, 6.2], [106.2, 14.8]] as const) {
    c.mm('wood', '#5a4330', x - 0.3, y, z - 0.3, x + 0.3, y + 0.5, z + 0.3);
    c.vis('grass', '#3b6a38', x - 0.5, y + 0.5, z - 0.5, x + 0.5, y + 1.5, z + 0.5);
  }
  // N1 警衛室
  deskAt(c, y, 109.5, -3.6, 1.8, 0.8); chairAt(c, y, 109.5, -2.4, '-z', '#2d3a45');
  lockerAt(c, y, 105.3, -5.4, 107.8, -4.8, 1.9);
  c.mm('metal', '#2f3438', 112.2, y, -5.0, 113.8, y + 1.1, -4.2); // 監視螢幕牆
  c.vis('metal', '#6ab0c9', 112.3, y + 1.1, -5.0, 113.7, y + 1.7, -4.9);
  // N2 配電室
  for (const x of [116.0, 118.4, 120.8]) c.mm('metal', '#5b6672', x, y, -5.2, x + 1.6, y + 2.2, -4.2);
  c.prop('barrels', 122.4, y, -0.6, 0.2, 0.9);
  c.sign({ text: '警衛室', x: 107.8, y: y + 2.5, z: 2.38, yaw: Math.PI, w: 1.2, h: 0.4, bg: '#173a63', fg: '#fff', font: 0.9 });
  c.sign({ text: '配電室 閒人勿進', x: 117.8, y: y + 2.5, z: 2.38, yaw: Math.PI, w: 1.8, h: 0.4, bg: '#b3261e', fg: '#fff', font: 0.85 });
}

function sales(c: Ctx, y: number): void {
  // 業務部：4 排 × 3 列的辦公桌
  for (const z of [7.6, 10.8, 14.0]) {
    // 第一排避開走廊的三個門（x 108、114.7、119.8 起的 1.6m）
    for (const x of z === 7.6 ? [107.0, 111.0, 118.0] : [107.0, 110.6, 114.2, 117.8, 121.2]) {
      deskAt(c, y, x, z, 1.5, 0.75, 'x', '#8a8f94');
      chairAt(c, y, x, z - 0.95, '+z', '#3f5f7a');
    }
  }
  for (const x of [108.8, 115.5, 120.6]) { c.hint(x, y, 6.6); c.hint(x, y, 9.0); c.hint(x, y, 12.0); }
  lockerAt(c, y, 105.0, 15.2, 108.5, 15.5, 1.9);
  c.sign({ text: '業務部', x: 112.0, y: y + 2.7, z: 15.52, yaw: Math.PI, w: 3, h: 0.7, bg: '#1d6a3a', fg: '#fff', font: 0.9 });
  c.sign({ text: '本月業績 目標 達成', x: 123.45, y: y + 2.0, z: 10, yaw: -Math.PI / 2, w: 4, h: 0.9, bg: '#f2ead0', fg: '#b3261e', font: 0.7 });
  // N1 會議室
  tableAt(c, y, 107.0, -3.6, 112.8, -1.8, 0.75);
  for (const x of [107.8, 109.6, 111.4]) { chairAt(c, y, x, -4.3, '+z'); chairAt(c, y, x, -1.1, '-z'); }
  // N2 經理室
  deskAt(c, y, 119, -3.2, 2.0, 0.9); chairAt(c, y, 119, -4.3, '+z', '#7a2f3a');
  sofaAt(c, y, 121.4, -2.0, 123.2, 1.0, '#3a3a44');
  c.sign({ text: '會議室', x: 107.8, y: y + 2.5, z: 2.38, yaw: Math.PI, w: 1.2, h: 0.4, bg: '#173a63', fg: '#fff', font: 0.9 });
}

function archive(c: Ctx, y: number): void {
  // 檔案室：五排鐵架
  for (const x of [106.8, 110.0, 113.2, 116.4, 119.6]) shelfRow(c, y, x, 7.0, x + 0.9, 14.2);
  for (const x of [108.85, 112.05, 115.25, 118.45, 121.8]) { c.hint(x, y, 6.3); c.hint(x, y, 10.6); c.hint(x, y, 14.9); }
  c.mm('wood', '#6b4c2e', 121.4, y, 7.2, 123.0, y + 0.9, 8.4); // 借閱櫃台
  c.sign({ text: '檔案室', x: 112.0, y: y + 2.7, z: 15.52, yaw: Math.PI, w: 3, h: 0.7, bg: '#222', fg: '#f2d64a', font: 0.9 });
  c.sign({ text: '機密文件 禁止拍照', x: 123.45, y: y + 2.0, z: 12, yaw: -Math.PI / 2, w: 3.4, h: 0.8, bg: '#b3261e', fg: '#fff', font: 0.75 });
  // N1 閱覽室、N2 檔案整理
  tableAt(c, y, 107.0, -3.6, 111.6, -2.4);
  chairAt(c, y, 108.0, -4.3, '+z'); chairAt(c, y, 110.4, -4.3, '+z');
  shelfRow(c, y, 106.0, -5.4, 113.6, -4.9); shelfRow(c, y, 116.0, -5.4, 123.0, -4.9);
  tableAt(c, y, 117.0, -3.0, 121.0, -1.8);
  c.prop('crate', 122.6, y, 0.8, 0.2, 0.9); c.prop('crate', 122.6, y + 0.9, 0.8, 0.5, 0.8);
}

function executive(c: Ctx, y: number): void {
  // 三間主管室（S1 x 104.2..112、S2 112..118、S3 118..123.6）
  deskAt(c, y, 108.0, 13.5, 2.0, 0.9); chairAt(c, y, 108.0, 14.6, '-z', '#2d2d33');
  sofaAt(c, y, 104.6, 7.0, 106.0, 10.0, '#4a3a3a');
  lockerAt(c, y, 110.2, 5.7, 111.9, 6.1, 1.9);
  deskAt(c, y, 115.0, 13.6, 1.8, 0.9); chairAt(c, y, 115.0, 14.7, '-z', '#2d2d33');
  lockerAt(c, y, 112.4, 5.7, 114.3, 6.1, 1.9); lockerAt(c, y, 116.6, 5.7, 117.8, 6.1, 1.9);
  tableAt(c, y, 120.6, 7.4, 123.2, 10.4, 0.75, '#6b4c2e');
  for (const z of [8.0, 9.8]) chairAt(c, y, 120.1, z, '+x');
  // N1 大會議室
  tableAt(c, y, 107.0, -3.8, 113.0, -1.4, 0.75, '#5b4a35');
  for (const x of [108.0, 110.0, 112.0]) { chairAt(c, y, x, -4.4, '+z'); chairAt(c, y, x, -0.8, '-z'); }
  // N2 祕書室
  deskAt(c, y, 119.0, -3.4, 1.6, 0.8); chairAt(c, y, 119.0, -4.4, '+z', '#7a2f3a');
  lockerAt(c, y, 121.0, -5.4, 123.4, -4.9, 1.9);
  c.sign({ text: '副總經理', x: 108.8, y: y + 2.5, z: 5.38, yaw: 0, w: 1.4, h: 0.4, bg: '#3a2a1a', fg: '#e9c46a', font: 0.9 });
  c.sign({ text: '財務長', x: 115.5, y: y + 2.5, z: 5.38, yaw: 0, w: 1.2, h: 0.4, bg: '#3a2a1a', fg: '#e9c46a', font: 0.9 });
}

function chairman(c: Ctx, y: number): void {
  // 董事長室（S1 + S2 合併 x 104.2..118）：大辦公桌、書櫃、沙發、保險櫃
  c.mm('carpet', '#5a1f2a', 106.0, y, 8.0, 116.0, y + 0.012, 14.4);
  deskAt(c, y, 111.0, 13.2, 3.0, 1.2, 'x', '#4a3220'); chairAt(c, y, 111.0, 14.5, '-z', '#1d1d20');
  sofaAt(c, y, 106.0, 8.0, 109.4, 9.2, '#2f3a2f');
  c.hint(108.8, y, 6.6); c.hint(107.6, y, 10.8); c.hint(106.6, y, 14.0); c.hint(112, y, 10.4);
  lockerAt(c, y, 110.0, 5.7, 114.3, 6.2, 2.2, '#4a3220'); // 書櫃
  // 保險櫃（固定的高價值點，靠西牆）
  c.mm('metal', '#2f3438', 104.3, y, 13.4, 105.6, y + 1.3, 14.6);
  c.vis('metal', '#c9a227', 105.6, y + 0.7, 13.9, 105.66, y + 0.9, 14.1);
  c.sign({ text: '董事長室', x: 112.0, y: y + 2.6, z: 5.38, yaw: 0, w: 2.4, h: 0.5, bg: '#3a2a1a', fg: '#e9c46a', font: 0.9 });
  // S3 小會客室
  tableAt(c, y, 120.6, 7.4, 123.2, 10.0, 0.75, '#6b4c2e');
  for (const z of [8.0, 9.4]) chairAt(c, y, 120.1, z, '+x');
  // N1 休息室（酒櫃）、N2 私人會議室
  sofaAt(c, y, 106.0, -4.0, 109.6, -2.8, '#4a3a3a');
  lockerAt(c, y, 110.4, -5.4, 113.6, -4.8, 2.0, '#4a3220');
  tableAt(c, y, 117.0, -3.8, 122.0, -1.6, 0.75, '#5b4a35');
  for (const x of [118, 120]) { chairAt(c, y, x, -4.4, '+z'); chairAt(c, y, x, -1.0, '-z'); }
  c.pointLight(111, y + 3.0, 10.5, '#ffe3b0', 9, 14, 0);
}

// ---------------------------------------------------------------- 頂樓
function buildRoof(c: Ctx): void {
  const { x0, x1, z0, z1 } = TOWER;
  const y = TOWER_ROOF_Y;
  // 女兒牆（視覺 1.1m，碰撞 2.2m：不能跳下去）
  const par = '#a6a090';
  c.mm('concrete', par, x0, y, z0, x1, y + 1.1, z0 + 0.4);
  c.mm('concrete', par, x0, y, z1 - 0.4, x1, y + 1.1, z1);
  c.mm('concrete', par, x0, y, z0, x0 + 0.4, y + 1.1, z1);
  c.mm('concrete', par, x1 - 0.4, y, z0, x1, y + 1.1, z1);
  c.col(x0, y + 1.1, z0, x1, y + 2.4, z0 + 0.4);
  c.col(x0, y + 1.1, z1 - 0.4, x1, y + 2.4, z1);
  c.col(x0, y + 1.1, z0, x0 + 0.4, y + 2.4, z1);
  c.col(x1 - 0.4, y + 1.1, z0, x1, y + 2.4, z1);
  // 水塔（東北角）：四支鋼腳 + 圓柱水箱
  const wx = 119.2, wz = -2.4;
  for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]] as const) c.mm('metal', '#4a4f50', wx + dx - 0.12, y, wz + dz - 0.12, wx + dx + 0.12, y + 2.4, wz + dz + 0.12);
  c.vis('metal', '#4a4f50', wx - 1.6, y + 1.1, wz - 1.6, wx + 1.6, y + 1.2, wz + 1.6);
  c.cyl('metal', '#8aa0a6', wx, y + 2.4, wz, 2.0, 2.8, 14);
  c.cyl('metal', '#6e8086', wx, y + 5.2, wz, 1.4, 0.4, 12);
  c.sign({ text: '海順', x: wx, y: y + 3.8, z: wz + 2.02, yaw: 0, w: 2.6, h: 1.2, bg: '#173a63', fg: '#f4f0dc', font: 0.9 });
  // 天線塔（出口小屋屋頂）：支撐 + 細桿 + 橫桿 + 警示燈
  const ax = 102.6, az = -2.6, ay = y + 3.4;
  c.mm('metal', '#4a4f50', ax - 0.5, ay, az - 0.5, ax + 0.5, ay + 0.6, az + 0.5);
  c.vis('metal', '#8a8f94', ax - 0.08, ay + 0.6, az - 0.08, ax + 0.08, ay + 13, az + 0.08);
  for (const h of [4, 7, 10.5]) c.vis('metal', '#8a8f94', ax - 1.1, ay + h, az - 0.05, ax + 1.1, ay + h + 0.1, az + 0.05);
  c.vis('metal', '#ff3a2a', ax - 0.18, ay + 13, az - 0.18, ax + 0.18, ay + 13.4, az + 0.18);
  // 直升機坪：圓環 + H（純視覺貼地）
  const hx = 112.5, hz = 9.0;
  c.vis('concrete', '#c8b02a', hx - 5.2, y, hz - 5.2, hx + 5.2, y + 0.03, hz - 4.9);
  c.vis('concrete', '#c8b02a', hx - 5.2, y, hz + 4.9, hx + 5.2, y + 0.03, hz + 5.2);
  c.vis('concrete', '#c8b02a', hx - 5.2, y, hz - 5.2, hx - 4.9, y + 0.03, hz + 5.2);
  c.vis('concrete', '#c8b02a', hx + 4.9, y, hz - 5.2, hx + 5.2, y + 0.03, hz + 5.2);
  c.vis('concrete', '#e8e8e0', hx - 1.4, y, hz - 2, hx - 1.0, y + 0.04, hz + 2);
  c.vis('concrete', '#e8e8e0', hx + 1.0, y, hz - 2, hx + 1.4, y + 0.04, hz + 2);
  c.vis('concrete', '#e8e8e0', hx - 1.0, y, hz - 0.2, hx + 1.0, y + 0.04, hz + 0.2);
  // 空調機組與管線（掩體）
  for (const [x, z, w, d] of [[106.6, 5.0, 2.4, 1.6], [106.6, 13.6, 2.4, 1.6], [121.6, 6.4, 1.8, 2.2]] as const) {
    c.mm('metal', '#9aa0a4', x - w / 2, y, z - d / 2, x + w / 2, y + 1.3, z + d / 2);
    c.vis('metal', '#6a7074', x - w / 2 + 0.2, y + 1.3, z - d / 2 + 0.2, x + w / 2 - 0.2, y + 1.45, z + d / 2 - 0.2);
  }
  // 狙擊點：東南角與西南角的沙包 + 南緣霓虹招牌架
  const sand = '#8a7a58';
  c.mm('concrete', sand, 120.2, y, 11.4, 123.4, y + 0.9, 12.2);
  c.mm('concrete', sand, 120.2, y, 11.4, 121.0, y + 0.9, 14.4);
  c.mm('concrete', sand, 101.0, y, 12.0, 104.0, y + 0.9, 12.8);
  c.mm('concrete', sand, 103.2, y, 12.0, 104.0, y + 0.9, 14.6);
  c.mm('metal', '#444', 108, y, 14.4, 108.4, y + 4.4, 14.8);
  c.mm('metal', '#444', 117.6, y, 14.4, 118, y + 4.4, 14.8);
  c.sign({ text: '海順海運', x: 113, y: y + 3.6, z: 14.82, yaw: 0, w: 10, h: 2.2, bg: '#1d3b5e', fg: '#f4f0dc', font: 0.85 });
  c.sign({ text: '海順海運', x: 113, y: y + 3.6, z: 14.38, yaw: Math.PI, w: 10, h: 2.2, bg: '#1d3b5e', fg: '#f4f0dc', font: 0.85 });
  c.prop('crate', 115.6, y, 2.4, 0.3, 1.0); c.prop('barrels', 122.2, y, 2.4, 0, 1.0);
  c.hint(112.5, y, 9); c.hint(106, y, 10); c.hint(120, y, 9); c.hint(112, y, 3.6);
  c.hint(118.0, y, 15.0); c.hint(119.2, y, 15.0); c.hint(120.6, y, 15.0); c.hint(122.4, y, 13.6); c.hint(116, y, 12.6); c.hint(118, y, 4.2);
  void bunkAt;
}
