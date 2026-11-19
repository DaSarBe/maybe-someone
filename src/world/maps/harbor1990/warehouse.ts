import { WH } from './layout';
import { Ctx, climb } from './util';

/** 倉庫：大跨距鐵皮廠房，貨架、棧板、堆高機，北側二樓鐵網走道 */
export function buildWarehouse(c: Ctx): void {
  const { x0, x1, z0, z1, wallH: H, t, mezzY } = WH;
  const wc = '#6f8393', rust = '#7a6a58';
  const ix0 = x0 + t, ix1 = x1 - t, iz0 = z0 + t, iz1 = z1 - t;

  // 外牆：四面各開門
  c.wall('x', z0 + t / 2, t, x0, x1, 0, H, [{ a: 14, b: 16, h: 2.6 }], 'metal', wc);
  c.wall('x', z1 - t / 2, t, x0, x1, 0, H, [{ a: 25, b: 31, h: 3.4 }], 'metal', wc);
  c.wall('z', x0 + t / 2, t, z0, z1, 0, H, [{ a: -28, b: -26, h: 2.6 }], 'metal', wc);
  c.wall('z', x1 - t / 2, t, z0, z1, 0, H, [{ a: -22, b: -20, h: 2.6 }], 'metal', wc);
  // 屋頂
  c.mm('metal', '#5b6772', x0 - 0.3, H, z0 - 0.3, x1 + 0.3, H + 0.4, z1 + 0.3);
  // 鐵捲門（半開，視覺）：門洞上緣下垂的捲簾
  c.vis('metal', '#b7b19c', 25, 3.4, z1 - t - 0.02, 31, 4.6, z1 - t + 0.05);
  c.vis('metal', '#8f8a78', 24.9, 4.6, z1 - t - 0.08, 31.1, 5.0, z1 - t + 0.1);
  // 外牆鏽斑帶與高窗（視覺）
  c.vis('metal', rust, x0 - 0.03, 0, z1 - 0.01, x1 + 0.03, 0.9, z1 + 0.03);
  c.vis('metal', rust, x0 - 0.03, 0, z0 - 0.03, x1 + 0.03, 0.9, z0 + 0.01);
  for (let x = x0 + 4; x < x1 - 3; x += 5) {
    c.vis('metal', '#2f3a44', x, 5.8, z1 - 0.02, x + 2.6, 7.0, z1 + 0.04);
    c.vis('metal', '#2f3a44', x, 5.8, z0 - 0.04, x + 2.6, 7.0, z0 + 0.02);
  }
  // 屋頂採光帶
  for (let x = x0 + 3; x < x1 - 4; x += 8) c.vis('metal', '#c8d6dd', x, H + 0.4, -34, x + 3, H + 0.46, -22);

  // ---- 二樓走道（北側）----
  const mz1 = -37.5;
  c.mm('metal_grate', '#7a8790', x0 + t, mezzY - 0.2, iz0, ix1, mezzY, mz1);
  for (const x of [9, 17, 25, 33, 41]) c.mm('metal', '#44505a', x, 0, mz1 - 0.35, x + 0.3, mezzY - 0.2, mz1 - 0.05);
  // 護欄（碰撞 + 視覺），在樓梯口留缺口
  const gaps: [number, number][] = [[14.55, 17.2], [34.8, 37.45]];
  let cur = x0 + t;
  for (const [ga, gb] of [...gaps, [ix1 + 1, ix1 + 2] as [number, number]]) {
    const end = Math.min(ga, ix1);
    if (end > cur) {
      c.col(cur, mezzY, mz1 - 0.1, end, mezzY + 1.4, mz1);
      c.vis('metal', '#c9a227', cur, mezzY + 1.0, mz1 - 0.08, end, mezzY + 1.1, mz1 - 0.02);
      c.vis('metal', '#c9a227', cur, mezzY + 0.45, mz1 - 0.08, end, mezzY + 0.52, mz1 - 0.02);
    }
    cur = gb;
  }
  // 兩座樓梯：鐵網樓梯貼著走道南緣
  climb(c, 'metal_grate', '#8a959c', '#7d878e', 8.6, 0, -36.5, '+x', 2.0, mezzY, 2.4);
  climb(c, 'metal_grate', '#8a959c', '#7d878e', 43.4, 0, -36.5, '-x', 2.0, mezzY, 2.4);
  // 樓梯與走道之間補上連接（樓梯旁的欄杆）
  c.col(8.6, 0, -35.55, 14.7, 2.4, -35.45);
  c.col(37.3, 0, -35.55, 43.4, 2.4, -35.45);

  // ---- 貨架（實心碰撞 + 視覺貨品）----
  const rack = (rx0: number, rz0: number, rx1: number, rz1: number): void => {
    c.mm('metal', '#3e5a7a', rx0, 0, rz0, rx1, 3.2, rz1);
    // 每層的橫樑與貨品箱（視覺）
    for (let k = 0; k < 3; k++) {
      const y = 0.4 + k * 1.0;
      c.vis('metal', '#d27a1e', rx0 - 0.03, y, rz0, rx1 + 0.03, y + 0.1, rz1);
      c.vis('wood', k % 2 ? '#a07a4e' : '#b5895a', rx0 - 0.06, y + 0.1, rz0 + 0.1, rx1 + 0.06, y + 0.8, rz1 - 0.1);
    }
  };
  rack(9, -34, 10.2, -28.8); rack(12.4, -34, 13.6, -28.8);
  rack(9, -25, 10.2, -14.5); rack(12.4, -25, 13.6, -14.5);
  rack(38, -34, 39.2, -28.8); rack(41.4, -34, 42.6, -28.8);
  rack(38, -25, 39.2, -15); rack(41.4, -25, 42.6, -15);

  // ---- 棧板與箱子 ----
  const pallet = (x: number, z: number, n: number, yaw = 0): void => {
    c.mm('wood', '#8a6a42', x - 0.6, 0, z - 0.6, x + 0.6, 0.15, z + 0.6);
    for (let i = 0; i < n; i++) c.prop('crate', x, 0.15 + i * 1.0, z, yaw + i * 0.15, 1.0);
  };
  pallet(20, -30, 2); pallet(21.4, -30.2, 1, 0.3); pallet(20.6, -31.5, 3, 0.1);
  pallet(33, -24, 2); pallet(34.3, -24.2, 1, 0.4); pallet(22, -17, 2, 0.2); pallet(17.5, -39.8, 1); pallet(35, -40.5, 2); pallet(24.5, -40, 1);
  c.prop('barrels', 20, 0, -41, 0.2, 1.0); c.prop('barrels', 31, 0, -41.5, 1.1, 1.0); c.prop('barrel', 44, 0, -41, 0, 0.95);
  c.prop('generator', 8.4, 0, -40, 0, 1.0);
  c.prop('barrels', 44.4, 0, -14.4, 0.7, 1.0);
  // 堆高機（方塊拼成）
  c.mm('metal', '#d29b1c', 29.5, 0.15, -18.5, 31.1, 1.5, -16.2);
  c.mm('metal', '#3a3d3f', 29.6, 1.5, -18.4, 31.0, 2.1, -17.2);
  c.mm('metal', '#3a3d3f', 29.6, 0.15, -19.9, 29.8, 2.2, -18.5);
  c.mm('metal', '#3a3d3f', 30.8, 0.15, -19.9, 31.0, 2.2, -18.5);

  // 地面標線（視覺）
  for (const z of [-29, -22]) c.vis('concrete', '#c8b02a', x0 + 3, 0, z - 0.06, x1 - 3, 0.03, z + 0.06);
  c.vis('concrete', '#c8b02a', 28 - 0.06, 0, z0 + 2, 28 + 0.06, 0.03, z1 - 1);
  // 日光燈管
  for (const x of [14, 26, 38]) for (const z of [-38, -28, -18]) {
    c.vis('metal', '#f2efc9', x - 1.2, H - 0.45, z - 0.15, x + 1.2, H - 0.3, z + 0.15);
  }

  // ---- 招牌 ----
  c.sign({ text: '海順海運', x: 26, y: 5.4, z: z0 - 0.04, yaw: Math.PI, w: 14, h: 2.6, bg: '#1d3b5e', fg: '#f4f0dc', font: 0.8 });
  c.sign({ text: '海順海運', x: 36, y: 5.4, z: z1 + 0.05, yaw: 0, w: 14, h: 2.6, bg: '#1d3b5e', fg: '#f4f0dc', font: 0.8 });
  c.sign({ text: '安全第一', x: ix0 + 0.02, y: 3.0, z: -20, yaw: Math.PI / 2, w: 5, h: 1.3, bg: '#1d6a3a', fg: '#ffffff', font: 0.85 });
  c.sign({ text: '禁止吸菸', x: ix1 - 0.02, y: 2.6, z: -35, yaw: -Math.PI / 2, w: 3, h: 1, bg: '#b3261e', fg: '#ffffff', font: 0.9 });
  c.sign({ text: '一號倉庫', x: 17, y: 7.0, z: z1 - t - 0.03, yaw: Math.PI, w: 5, h: 1.1, bg: '#222', fg: '#f2d64a', font: 0.85 });
  // 屋頂大招牌（遠處的地標）
  c.mm('metal', '#444', 22, H + 0.4, -28.2, 22.5, H + 3.2, -27.8);
  c.mm('metal', '#444', 33.5, H + 0.4, -28.2, 34, H + 3.2, -27.8);
  c.sign({ text: '海順海運', x: 28, y: H + 2.2, z: -27.78, yaw: 0, w: 12, h: 3.6, bg: '#1d3b5e', fg: '#f4f0dc', font: 0.85 });
  c.sign({ text: '海順海運', x: 28, y: H + 2.2, z: -28.22, yaw: Math.PI, w: 12, h: 3.6, bg: '#1d3b5e', fg: '#f4f0dc', font: 0.85 });

  c.pointLight(26, 6.8, -28, '#ffe6b8', 38, 40, 0.35);
  c.zone('indoor_large', 'warehouse', ix0, -0.5, iz0, ix1, H, iz1);
}
