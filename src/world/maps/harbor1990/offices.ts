import { GUARD, OFFICE, SHOP } from './layout';
import { Ctx } from './util';

const GREEN = '#2f6a43'; // 綠色鐵窗
const CHAIR = '#c0392b'; // 紅色塑膠椅

function desk(c: Ctx, x: number, z: number, w = 1.6, d = 0.8, yaw90 = false): void {
  const [sx, sz] = yaw90 ? [d, w] : [w, d];
  c.mm('wood', '#7a5a3a', x - sx / 2, 0.03, z - sz / 2, x + sx / 2, 0.78, z + sz / 2);
  c.vis('wood', '#a98458', x - sx / 2 - 0.02, 0.78, z - sz / 2 - 0.02, x + sx / 2 + 0.02, 0.84, z + sz / 2 + 0.02);
}
/** 紅色塑膠椅（座面 + 椅背） */
function chair(c: Ctx, x: number, z: number, facing: '+x' | '-x' | '+z' | '-z' = '+z'): void {
  c.mm('wood', CHAIR, x - 0.22, 0.03, z - 0.22, x + 0.22, 0.46, z + 0.22);
  const bx = facing === '+x' ? -0.22 : facing === '-x' ? 0.2 : 0, bz = facing === '+z' ? -0.22 : facing === '-z' ? 0.2 : 0;
  const bsx = facing === '+x' || facing === '-x' ? 0.04 : 0.44, bsz = facing === '+z' || facing === '-z' ? 0.04 : 0.44;
  c.vis('wood', CHAIR, x + bx - bsx / 2, 0.46, z + bz - bsz / 2, x + bx + bsx / 2, 0.9, z + bz + bsz / 2);
}
/** 綠色鐵窗（裝飾）：沿牆面，o = 牆外法線 */
function grille(c: Ctx, cx: number, cy: number, cz: number, w: number, h: number, o: '+x' | '-x' | '+z' | '-z'): void {
  const along = o === '+z' || o === '-z' ? 'x' : 'z';
  const off = 0.06;
  const px = o === '+x' ? off : o === '-x' ? -off : 0, pz = o === '+z' ? off : o === '-z' ? -off : 0;
  c.vis('metal', '#1f2b30', cx + px - (along === 'x' ? w / 2 : 0.03), cy - h / 2, cz + pz - (along === 'z' ? w / 2 : 0.03), cx + px + (along === 'x' ? w / 2 : 0.03), cy + h / 2, cz + pz + (along === 'z' ? w / 2 : 0.03));
  const n = Math.round(w / 0.35);
  for (let i = 0; i <= n; i++) {
    const a = -w / 2 + (w * i) / n;
    c.vis('metal', GREEN, cx + px + (along === 'x' ? a : 0) - 0.025, cy - h / 2, cz + pz + (along === 'z' ? a : 0) - 0.025, cx + px + (along === 'x' ? a : 0) + 0.025, cy + h / 2, cz + pz + (along === 'z' ? a : 0) + 0.025);
  }
  for (const k of [-0.5, 0, 0.5]) {
    const y = cy + k * h;
    c.vis('metal', GREEN, cx + px - (along === 'x' ? w / 2 : 0.04), y - 0.03, cz + pz - (along === 'z' ? w / 2 : 0.04), cx + px + (along === 'x' ? w / 2 : 0.04), y + 0.03, cz + pz + (along === 'z' ? w / 2 : 0.04));
  }
}

export function buildOffice(c: Ctx): void {
  const { x0, x1, z0, z1, h, t } = OFFICE;
  const wc = '#aab3a3', inner = '#c9c5b2', ix0 = x0 + t, ix1 = x1 - t, iz0 = z0 + t, iz1 = z1 - t;
  const T = 0.2;
  // 地板：磁磚底 + 各房間地毯
  c.mm('tile', '#cfcab8', x0, -0.1, z0, x1, 0.03, z1);
  c.mm('carpet', '#7a2f3a', ix0, 0.03, iz0, -13 - T / 2, 0.045, 35 - T / 2);          // R1 經理室
  c.mm('carpet', '#2f4f6a', -5 + T / 2, 0.03, iz0, ix1, 0.045, 35 - T / 2);           // R3 董事長室
  c.mm('carpet', '#5a6a45', -3 + T / 2, 0.03, 38.5 + T / 2, ix1, 0.045, iz1);          // R6 會議室
  // 外牆（含門）
  c.wall('x', z0 + t / 2, t, x0, x1, 0, h, [], 'concrete', wc);
  c.wall('x', z1 - t / 2, t, x0, x1, 0, h, [{ a: -17, b: -15, h: 2.3 }], 'concrete', wc);
  c.wall('z', x0 + t / 2, t, z0, z1, 0, h, [{ a: 35.5, b: 37, h: 2.3 }], 'concrete', wc);
  c.wall('z', x1 - t / 2, t, z0, z1, 0, h, [{ a: 35.5, b: 37, h: 2.3 }], 'concrete', wc);
  c.mm('concrete', '#8d8a80', x0 - 0.2, h, z0 - 0.2, x1 + 0.2, h + 0.4, z1 + 0.2);
  c.vis('concrete', '#7c8577', x0 - 0.02, 0, z1 - 0.02, x1 + 0.02, 0.8, z1 + 0.04); // 外牆下緣的暗色裙板
  // 內牆
  const iw = (axis: 'x' | 'z', fixed: number, a: number, b: number, ops: { a: number; b: number; h: number }[] = []): void =>
    c.wall(axis, fixed, T, a, b, 0, h, ops, 'concrete', inner);
  iw('x', 35, ix0, ix1, [{ a: -18.6, b: -17.4, h: 2.2 }, { a: -9.6, b: -8.4, h: 2.2 }, { a: -1.6, b: -0.4, h: 2.2 }]);
  iw('z', -13, iz0, 35 - T / 2);
  iw('z', -5, iz0, 35 - T / 2);
  iw('x', 38.5, ix0, ix1, [{ a: -18, b: -16, h: 2.2 }, { a: -7.6, b: -6.4, h: 2.2 }, { a: 0.4, b: 1.6, h: 2.2 }]);
  iw('z', -10, 38.5 + T / 2, iz1);
  iw('z', -3, 38.5 + T / 2, iz1);

  // ---- 窗戶鐵窗（外牆）----
  for (const x of [-19, -14.5, -10, -5.5, -1, 2]) grille(c, x, 1.7, z0 - 0.15, 1.6, 1.1, '-z');
  for (const x of [-20, -12, -7, -1, 2]) grille(c, x, 1.7, z1 + 0.15, 1.6, 1.1, '+z');
  for (const z of [31, 41]) { grille(c, x1 + 0.15, 1.7, z, 1.6, 1.1, '+x'); grille(c, x0 - 0.15, 1.7, z, 1.6, 1.1, '-x'); }
  // 入口鐵捲門（拉起一半，視覺）與雨遮
  c.vis('metal', '#9a9a8a', -17.2, 2.3, z1 + 0.02, -14.8, 3.0, z1 + 0.14);
  c.vis('metal', '#a33a2e', -18.2, 3.0, z1 + 0.02, -13.8, 3.4, z1 + 1.2);

  // ---- 家具 ----
  desk(c, -19, 30); chair(c, -19, 31.5, '-z'); desk(c, -20.8, 32.8, 1.2, 0.6, true);
  desk(c, -11, 30); chair(c, -11, 31.5, '-z'); desk(c, -6.6, 33.2, 1.6, 0.8); chair(c, -6.6, 32.0, '+z');
  desk(c, 0.5, 30.2, 2.0, 1.0); chair(c, 0.5, 31.8, '-z');
  c.mm('carpet', '#3a3a44', -4.2, 0.045, 31.4, -2.6, 0.5, 34.4); // 沙發
  // 接待櫃台 + 等候紅椅
  c.mm('wood', '#6b4c2e', -21.4, 0.03, 40.4, -18.4, 1.05, 41.2);
  for (const x of [-13.4, -12.5, -11.6, -10.7]) chair(c, x, 45.2, '-z');
  c.mm('wood', '#6b4c2e', -13.6, 0.03, 40.2, -10.4, 0.5, 41.0); // 茶几
  // 倉庫房（置物櫃）
  c.mm('metal', '#6a7886', -9.8, 0.03, 39.2, -9.0, 2.0, 41.8);
  c.mm('metal', '#6a7886', -9.8, 0.03, 43.0, -9.0, 2.0, 45.5);
  c.mm('metal', '#6a7886', -3.8, 0.03, 41.5, -3.2, 1.8, 44.5);
  c.prop('crate', -6.3, 0.03, 44.6, 0.2, 0.9);
  // 會議室
  c.mm('wood', '#7a5a3a', -1.6, 0.045, 41.0, 2.0, 0.8, 43.6);
  for (const x of [-1.2, 0.3, 1.8]) chair(c, x, 44.1, '-z');
  // 走廊的垃圾桶與飲水機
  c.mm('metal', '#6e7a80', 2.6, 0.03, 35.2, 3.3, 1.1, 35.9);

  // ---- 招牌 / 月曆 / 標語（decor 畫成貼圖）----
  c.sign({ text: '安全第一', x: -21.55, y: 2.2, z: 36.7, yaw: Math.PI / 2, w: 2.2, h: 0.7, bg: '#1d6a3a', fg: '#ffffff', font: 0.9 });
  c.sign({ text: '八十九年 七月', x: -18.6, y: 1.7, z: 28.33, yaw: 0, w: 0.7, h: 1.0, bg: '#f2ead0', fg: '#b3261e', font: 0.5 });
  c.sign({ text: '禁止吸菸', x: -13.2, y: 1.8, z: 35.12, yaw: 0, w: 1.4, h: 0.5, bg: '#b3261e', fg: '#ffffff', font: 0.9 });
  c.sign({ text: '海順海運 總務處', x: -16, y: 3.5, z: z1 + 0.06, yaw: 0, w: 7, h: 1.0, bg: '#173a63', fg: '#f4f0dc', font: 0.8 });
  c.sign({ text: '董事長室', x: -1, y: 2.4, z: 35.12, yaw: 0, w: 1.4, h: 0.4, bg: '#3a2a1a', fg: '#e9c46a', font: 0.9 });
  c.sign({ text: '八十九年 八月', x: 3.65, y: 1.7, z: 31, yaw: -Math.PI / 2, w: 0.7, h: 1.0, bg: '#f2ead0', fg: '#2d6a4f', font: 0.5 });
  c.sign({ text: '請保持整潔', x: -6.5, y: 2.2, z: 38.38, yaw: Math.PI, w: 1.4, h: 0.4, bg: '#e8e0c8', fg: '#333', font: 0.9 });

  c.pointLight(-9, 2.7, 36.7, '#fff2d0', 14, 24, 0.5);
  c.zone('indoor_small', 'office', ix0, -0.5, iz0, ix1, h, iz1);
}

export function buildGuardHouse(c: Ctx): void {
  const { x0, x1, z0, z1, h, t } = GUARD;
  const wc = '#a9aea0';
  c.mm('tile', '#b9b6a4', x0, -0.1, z0, x1, 0.03, z1);
  c.wall('x', z0 + t / 2, t, x0, x1, 0, h, [], 'concrete', wc);
  c.wall('x', z1 - t / 2, t, x0, x1, 0, h, [], 'concrete', wc);
  c.wall('z', x0 + t / 2, t, z0, z1, 0, h, [{ a: 84, b: 85.2, h: 2.2 }], 'concrete', wc);
  c.wall('z', x1 - t / 2, t, z0, z1, 0, h, [], 'concrete', wc);
  c.mm('metal', '#7b3a2a', x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.35, z1 + 0.3);
  // 向外的窗：用鐵窗與鐵捲門做裝飾
  grille(c, 16, 1.6, z0 - 0.15, 2.4, 1.2, '-z');
  grille(c, 16, 1.6, z1 + 0.15, 2.4, 1.2, '+z');
  grille(c, x0 - 0.15, 1.6, 83, 1.4, 1.1, '-x');
  c.vis('metal', '#8e8e80', x1 + 0.02, 0.2, 83.3, x1 + 0.12, 2.5, 86.7);
  // 桌椅與櫃子
  desk(c, 17, 86.8, 2.0, 0.8); chair(c, 17, 85.5, '+z');
  c.mm('wood', '#6b4c2e', 12.4, 0.03, 82.4, 14.4, 0.85, 83.2); // 置物桌
  c.mm('metal', '#6a7886', 19.2, 0.03, 82.4, 19.8, 1.9, 83.8);
  chair(c, 13.4, 86, '+x'); c.mm('wood', '#6b4c2e', 12.4, 0.03, 86.7, 13.2, 0.5, 87.7);
  c.sign({ text: '警衛室', x: 12.34, y: 2.5, z: 83.0, yaw: -Math.PI / 2, w: 1.6, h: 0.5, bg: '#173a63', fg: '#fff', font: 0.9 });
  c.sign({ text: '出入請登記', x: 11.97, y: 2.2, z: 82.9, yaw: -Math.PI / 2, w: 1.8, h: 0.45, bg: '#f2d64a', fg: '#222', font: 0.9 });
  c.zone('indoor_small', 'guard_house', x0 + t, -0.5, z0 + t, x1 - t, h, z1 - t);
}

export function buildGasStation(c: Ctx): void {
  // 加油站雨棚
  const posts = [[59, 11], [75, 11], [59, 19], [75, 19]];
  for (const [x, z] of posts) c.mm('metal', '#d8d4c4', x - 0.3, 0, z - 0.3, x + 0.3, 5, z + 0.3);
  c.mm('metal', '#c8372d', 57.5, 5, 9.5, 76.5, 5.45, 20.5);
  c.vis('metal', '#ffffff', 57.5, 5.45, 9.5, 76.5, 5.6, 9.8);
  c.vis('metal', '#ffffff', 57.5, 5.45, 20.2, 76.5, 5.6, 20.5);
  // 加油島與加油機
  for (const px of [64, 70]) {
    c.mm('concrete', '#9a9a94', px - 1.6, 0, 14.4, px + 1.6, 0.2, 15.8);
    c.mm('metal', '#c8372d', px - 0.4, 0.2, 14.7, px + 0.4, 1.6, 15.5);
    c.vis('metal', '#f0e8b0', px - 0.3, 1.1, 14.62, px + 0.3, 1.4, 14.7);
  }
  // 商店
  const { x0, x1, z0, z1, h, t } = SHOP;
  const wc = '#c4bfae';
  c.mm('tile', '#d6d2c0', x0, -0.1, z0, x1, 0.03, z1);
  c.wall('x', z0 + t / 2, t, x0, x1, 0, h, [{ a: 64, b: 66, h: 2.3 }], 'concrete', wc);
  c.wall('x', z1 - t / 2, t, x0, x1, 0, h, [], 'concrete', wc);
  c.wall('z', x0 + t / 2, t, z0, z1, 0, h, [], 'concrete', wc);
  c.wall('z', x1 - t / 2, t, z0, z1, 0, h, [], 'concrete', wc);
  c.mm('metal', '#c8372d', x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.35, z1 + 0.3);
  c.vis('metal', '#6ab0c9', 60, 1.0, z0 - 0.01, 63, 2.4, z0 + 0.03);
  c.vis('metal', '#6ab0c9', 67, 1.0, z0 - 0.01, 72, 2.4, z0 + 0.03);
  // 貨架與櫃檯
  c.mm('metal', '#8a8f94', 59, 0.03, 26, 63, 1.8, 26.7);
  c.mm('metal', '#8a8f94', 59, 0.03, 28.4, 63, 1.8, 29.1);
  c.mm('wood', '#6b4c2e', 68, 0.03, 25, 72.5, 1.1, 26);
  c.mm('metal', '#d8dad8', 72.4, 0.03, 27.5, 73.7, 1.9, 30.4); // 冰箱
  c.sign({ text: '太平加油站', x: 66, y: 2.7, z: z0 - 0.03, yaw: Math.PI, w: 5, h: 0.5, bg: '#c8372d', fg: '#fff', font: 0.8 });
  c.sign({ text: '太平加油站', x: 66, y: 5.22, z: 20.52, yaw: 0, w: 8, h: 0.42, bg: '#c8372d', fg: '#fff', font: 0.9 });
  // 高桿招牌（地標）
  c.mm('metal', '#555', 55.8, 0, 7.8, 56.2, 10, 8.2);
  c.sign({ text: '加油', x: 56, y: 10.8, z: 8.25, yaw: 0, w: 3.4, h: 2.0, bg: '#c8372d', fg: '#ffffff', font: 0.7 });
  c.sign({ text: '加油', x: 56, y: 10.8, z: 7.75, yaw: Math.PI, w: 3.4, h: 2.0, bg: '#c8372d', fg: '#ffffff', font: 0.7 });
  c.zone('indoor_small', 'gas_shop', x0 + t, -0.5, z0 + t, x1 - t, h, z1 - t);
}
