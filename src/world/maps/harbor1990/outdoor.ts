import { Ctx } from './util';

/** 卡車（沿 +x 或 +z 方向：車頭在 +方向端）。純方塊拼成，廢棄感：褪色、無輪胎的一側墊著磚。 */
function truck(c: Ctx, x: number, z: number, axis: 'x' | 'z', cab: string, trailer: string, trailerLen = 9.5): void {
  const W = 2.5;
  const sx = axis === 'x' ? trailerLen : W, sz = axis === 'x' ? W : trailerLen;
  c.mm('metal', trailer, x, 0.55, z, x + sx, 3.4, z + sz);
  c.mm('metal_hollow', '#6b6f70', x, 3.4, z, x + sx, 3.46, z + sz);
  // 車頭
  const cl = 2.4;
  const cx0 = axis === 'x' ? x + trailerLen + 0.2 : x, cz0 = axis === 'x' ? z : z + trailerLen + 0.2;
  const csx = axis === 'x' ? cl : W, csz = axis === 'x' ? W : cl;
  c.mm('metal', cab, cx0, 0.55, cz0, cx0 + csx, 3.0, cz0 + csz);
  c.vis('metal', '#1d2a33', axis === 'x' ? cx0 + csx : cx0 + 0.2, 1.7, axis === 'x' ? cz0 + 0.2 : cz0 + csz, axis === 'x' ? cx0 + csx + 0.04 : cx0 + csx - 0.2, 2.7, axis === 'x' ? cz0 + csz - 0.2 : cz0 + csz + 0.04);
  // 輪子（視覺）
  for (let k = 0; k < 3; k++) {
    const o = 1.4 + k * 3.0;
    if (axis === 'x') {
      c.vis('metal', '#1c1c1c', x + o, 0, z - 0.1, x + o + 1.0, 1.0, z + 0.3);
      c.vis('metal', '#1c1c1c', x + o, 0, z + W - 0.3, x + o + 1.0, 1.0, z + W + 0.1);
    } else {
      c.vis('metal', '#1c1c1c', x - 0.1, 0, z + o, x + 0.3, 1.0, z + o + 1.0);
      c.vis('metal', '#1c1c1c', x + W - 0.3, 0, z + o, x + W + 0.1, 1.0, z + o + 1.0);
    }
  }
  // 底盤下方碰撞（實心到地面，避免卡進車底）
  c.col(x, 0, z, x + sx, 0.55, z + sz);
  c.col(cx0, 0, cz0, cx0 + csx, 0.55, cz0 + csz);
}

function tree(c: Ctx, x: number, z: number, s = 1): void {
  c.mm('wood', '#5a4330', x - 0.2 * s, 0.02, z - 0.2 * s, x + 0.2 * s, 2.2 * s, z + 0.2 * s);
  c.vis('grass', '#3b6a38', x - 1.4 * s, 2.0 * s, z - 1.4 * s, x + 1.4 * s, 3.4 * s, z + 1.4 * s);
  c.vis('grass', '#427540', x - 0.9 * s, 3.4 * s, z - 0.9 * s, x + 0.9 * s, 4.4 * s, z + 0.9 * s);
}

export function buildOutdoor(c: Ctx): void {
  c.setRegion('central', { kind: 'outdoor' });
  // ---- 卡車停車場（碎石地）----
  truck(c, 58, -46.5, 'x', '#7b8a96', '#9a9484');
  truck(c, 66, -38, 'z', '#8f6a4d', '#6d7a72');
  truck(c, 76, -42, 'x', '#6b7e66', '#a89c7e', 8);
  truck(c, 70.5, -27, 'x', '#8a4a3a', '#5f7080');
  truck(c, 60, -13.5, 'x', '#9a9a8e', '#7c6a58');
  // 破損的小客車（方塊）
  c.mm('metal', '#4a6a52', 82, 0.3, -30, 86, 1.2, -28.2);
  c.mm('metal', '#3d5646', 83, 1.2, -29.8, 85.2, 1.9, -28.4);
  c.mm('metal', '#7a3a2a', 74, 0.3, -9, 78.4, 1.25, -7.2);
  c.mm('metal', '#6a3126', 75, 1.25, -8.8, 77.4, 1.95, -7.4);
  // 整齊的鐵絲網圍籬（prop_fence），留兩個缺口
  for (let z = -50; z < -20; z += 3) {
    if (z >= -37 && z < -33) continue;
    if (z >= -26 && z < -23) continue;
    c.prop('fence', 51.6, 0, z + 1.5, Math.PI / 2, 3);
  }
  // 油桶堆與發電機
  c.prop('barrels', 88, 0.02, -45, 0.3, 1.0); c.prop('barrels', 54, 0.02, -22, 0.9, 1.0); c.prop('barrels', 86, 0.02, -16, 0, 1.0);
  c.prop('crate', 56, 0, -34, 0.4, 1.1); c.prop('crate', 57.2, 0, -34.2, 0.1, 1.0); c.prop('generator', 88, 0, -36, 1.4, 1.0);
  c.prop('crate', 80, 0, -48, 0.3, 1.1); c.prop('crate', 90, 0, -26, 0, 1.0); c.prop('barrel', 66, 0, -19, 0, 0.95);
  c.prop('crate', 84, 0, 2, 0.2, 1.1); c.prop('barrels', 62, 0, 2, 0, 1.0);
  // 木電線桿（地標之一）
  for (const [x, z] of [[52, -3], [80, -3], [86, 18]] as const) {
    c.mm('wood', '#5b432d', x - 0.15, 0, z - 0.15, x + 0.15, 9, z + 0.15);
    c.vis('wood', '#5b432d', x - 1.0, 8.4, z - 0.08, x + 1.0, 8.6, z + 0.08);
  }
  c.sign({ text: '停車場 請勿逗留', x: 51.5, y: 2.4, z: -34.9, yaw: -Math.PI / 2, w: 3, h: 0.8, bg: '#f2d64a', fg: '#222', font: 0.8 });

  // ---- 水塔（西側地標）----
  const wx = -78, wz = 26;
  for (const [dx, dz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]] as const) {
    c.mm('concrete', '#8a8a82', wx + dx - 0.35, 0, wz + dz - 0.35, wx + dx + 0.35, 12, wz + dz + 0.35);
  }
  c.vis('concrete', '#777', wx - 2.8, 5.8, wz - 2.8, wx + 2.8, 6.2, wz - 2.0);
  c.vis('concrete', '#777', wx - 2.8, 5.8, wz + 2.0, wx + 2.8, 6.2, wz + 2.8);
  c.mm('metal', '#9aa8a6', wx - 3.6, 12, wz - 3.6, wx + 3.6, 17, wz + 3.6);
  c.mm('metal', '#7b8786', wx - 4.0, 17, wz - 4.0, wx + 4.0, 17.6, wz + 4.0);
  c.vis('metal', '#6a7776', wx - 0.4, 17.6, wz - 0.4, wx + 0.4, 19.2, wz + 0.4);
  c.sign({ text: '太平里', x: wx, y: 14.5, z: wz + 3.62, yaw: 0, w: 5.5, h: 2.2, bg: '#27608a', fg: '#ffffff', font: 0.85 });
  c.sign({ text: '太平里', x: wx + 3.62, y: 14.5, z: wz, yaw: Math.PI / 2, w: 5.5, h: 2.2, bg: '#27608a', fg: '#ffffff', font: 0.85 });
  c.prop('barrels', wx + 4, 0.02, wz + 5, 0.4, 1.0);

  // ---- 荒地：樹、廢棄漁船、水泥塊 ----
  for (const [x, z, s] of [[-86, -2, 1.2], [-80, 8, 1], [-70, 12, 1.1], [-88, 40, 1.3], [-70, 46, 1], [-84, 66, 1.2], [-60, 78, 1], [-44, 86, 1.2], [-74, 84, 1],
    [-26, 72, 1], [-10, 82, 1.1], [-2, 70, 0.9], [-86, 20, 1]] as const) tree(c, x, z, s);
  // 擱淺的漁船（沙灘）
  c.mm('wood', '#3f5a73', -74, 0.02, -34, -68, 1.0, -31.6);
  c.mm('wood', '#c8c2a8', -74, 1.0, -33.6, -68.4, 1.3, -32);
  c.vis('wood', '#8c3b2e', -72.5, 1.3, -33.2, -72.3, 3.4, -33.0);
  c.mm('wood', '#6a4a30', -84, 0.02, -26, -80, 0.4, -25.4); // 漂流木
  c.mm('wood', '#6a4a30', -86, 0.02, -50, -83, 0.35, -49.4);
  // 水泥塊與廢輪胎堆
  c.mm('concrete', '#6e706f', -60, 0.02, 12, -57.6, 1.2, 14.4);
  c.mm('concrete', '#7a7c7a', -57, 0.02, 10, -55.5, 0.7, 11.8);
  c.mm('concrete', '#6e706f', -40, 0.02, 70, -37.6, 1.5, 72.4);
  c.mm('metal', '#5a3a2a', -20, 0.02, 62, -16, 0.9, 64); // 廢棄小發財
  c.mm('metal', '#6a7a5a', -21, 0.9, 62.2, -18, 1.6, 63.8);
  c.prop('barrels', -64, 0.02, 70, 0.3, 1.0); c.prop('crate', -50, 0.02, 80, 0.2, 1.1); c.prop('crate', -49, 0.02, 80.3, 0.6, 0.9);
  c.prop('barrel', -12, 0.02, 56, 0, 0.95); c.prop('crate', -70, 0.02, 36, 0.2, 1.0); c.prop('crate', -33, 0.02, 56, 0.2, 1.0);
  // 東南空地：廢棄貨櫃屋（可進入的鐵皮屋，雙重貨櫃）
  c.mm('metal', '#7b6a4a', 80, 0, 62, 91.6, 2.4, 62.4);
  c.mm('metal', '#7b6a4a', 80, 0, 62, 80.3, 2.4, 66);
  c.mm('metal', '#7b6a4a', 80, 0, 65.7, 84, 2.4, 66);
  c.mm('metal', '#7b6a4a', 86, 0, 65.7, 91.6, 2.4, 66);
  c.mm('metal_hollow', '#5d6062', 80, 2.4, 62, 91.6, 2.5, 66);
  c.prop('crate', 89, 0.02, 63.4, 0.3, 1.0);
  c.sign({ text: '閒人勿進', x: 85, y: 1.6, z: 61.96, yaw: Math.PI, w: 2.4, h: 0.8, bg: '#b3261e', fg: '#fff', font: 0.9 });

  // ---- 大門 ----
  c.mm('concrete', '#8d8a80', -0.7, 0, 90.6, 0.2, 5.2, 92);
  c.mm('concrete', '#8d8a80', 9.8, 0, 90.6, 10.7, 5.2, 92);
  // 內側舊大門：門扇推開貼在門柱邊，上緣門楣保留
  c.vis('metal', '#2f5a3a', 0.2, 0.2, 90.7, 0.35, 3.6, 3.0 + 90.7);
  c.vis('metal', '#2f5a3a', 9.65, 0.2, 90.7, 9.8, 3.6, 3.0 + 90.7);
  c.vis('metal', '#2f5a3a', 0.2, 3.6, 91.4, 9.8, 4.1, 91.55);
  c.sign({ text: '海順海運 港區出入口', x: 5, y: 4.9, z: 91.3, yaw: Math.PI, w: 9, h: 1.0, bg: '#173a63', fg: '#f4f0dc', font: 0.8 });
  c.sign({ text: '閒雜人等 禁止入內', x: 5, y: 4.9, z: 91.99, yaw: 0, w: 9, h: 0.9, bg: '#b3261e', fg: '#ffffff', font: 0.8 });
  // 大門內側的路障
  c.mm('concrete', '#c8b02a', -1.5, 0, 84, -0.5, 0.8, 86);
  c.mm('concrete', '#c8b02a', 10.5, 0, 75, 11.5, 0.8, 77);
}
