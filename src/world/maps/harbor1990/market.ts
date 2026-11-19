import { MARKET } from './layout';
import { Ctx } from './util';

/** 魚市場 / 小吃攤：磁磚地、鐵皮屋頂、攤位。商人在中央攤位。 */
export function buildMarket(c: Ctx): void {
  const { x0, x1, z0, z1, roofY } = MARKET;
  // 磁磚地面（白色小方磚）
  c.mm('tile', '#c9ccc4', x0, -0.1, z0, x1, 0.03, z1);
  // 排水溝（視覺）
  c.vis('tile', '#7a8a86', x0 + 1, 0, 52.9, x1 - 1, 0.035, 53.3);
  // 鋼柱
  for (const x of [34.6, 42, 50, 58, 66.4]) {
    for (const z of [34.6, 44, 56, 65.4]) c.mm('metal', '#4a5560', x - 0.15, 0, z - 0.15, x + 0.15, roofY, z + 0.15);
  }
  // 鐵皮屋頂（藍色鏽蝕）+ 屋架橫樑
  c.mm('metal', '#4a6f8a', x0 - 1, roofY, z0 - 1, x1 + 1, roofY + 0.14, z1 + 1);
  for (let z = z0; z <= z1; z += 8) c.vis('metal', '#3a444c', x0 - 1, roofY - 0.3, z - 0.1, x1 + 1, roofY, z + 0.1);
  c.vis('metal', '#7a4a30', x0 - 1.05, roofY - 0.05, z1 + 0.8, x1 + 1.05, roofY + 0.18, z1 + 1.05); // 鏽邊
  // 後牆（北邊半高圍牆）
  c.wall('x', z0 + 0.15, 0.3, x0, x1, 0, 1.2, [{ a: 46, b: 56, h: 1.2 }], 'tile', '#bcc2b4');
  c.wall('x', z1 - 0.15, 0.3, x0, x1, 0, 1.2, [{ a: 50, b: 54, h: 1.2 }], 'tile', '#bcc2b4');

  const counter = (cx0: number, cz0: number, cx1: number, cz1: number, color: string, awning: string): void => {
    c.mm('tile', '#d8dad4', cx0, 0.03, cz0, cx1, 0.95, cz1);
    c.vis('wood', color, cx0 - 0.04, 0.95, cz0 - 0.04, cx1 + 0.04, 1.05, cz1 + 0.04);
    // 遮陽棚（條紋兩色）
    const mid = (cx0 + cx1) / 2;
    c.vis('metal', awning, cx0 - 0.2, 2.5, cz0 - 0.9, mid, 2.62, cz1 + 0.1);
    c.vis('metal', '#f0eadc', mid, 2.5, cz0 - 0.9, cx1 + 0.2, 2.62, cz1 + 0.1);
  };
  // 北排攤位（z=39）與南排攤位（z=60）
  counter(37, 38.6, 41, 39.6, '#8a6a42', '#c8372d');
  counter(44, 38.6, 47, 39.6, '#8a6a42', '#2f6a43');
  counter(56, 38.6, 60, 39.6, '#8a6a42', '#c8372d');
  counter(62, 38.6, 65, 39.6, '#8a6a42', '#2d5f9a');
  counter(37, 59.8, 40, 60.8, '#8a6a42', '#2d5f9a');
  counter(43, 59.8, 47, 60.8, '#8a6a42', '#c8372d');
  counter(57, 59.8, 60, 60.8, '#8a6a42', '#2f6a43');
  counter(62, 59.8, 66, 60.8, '#8a6a42', '#c8372d');
  // 攤位上的貨品（冰桶、藍色塑膠箱）
  c.prop('box_white', 38.4, 1.05, 39.1, 0.1, 0.8); c.prop('box_blue', 45.4, 1.05, 39.1, 0, 0.7); c.prop('box_white', 58, 1.05, 39.1, 0.2, 0.8);
  c.prop('box_blue', 38, 1.05, 60.3, 0, 0.7); c.prop('box_white', 45, 1.05, 60.3, 0, 0.8); c.prop('box_blue', 63.5, 1.05, 60.3, 0.1, 0.7);
  c.prop('box_white', 36.4, 0.03, 42.5, 0.3, 0.9); c.prop('box_blue', 66.2, 0.03, 42.6, 0.1, 0.9); c.prop('box_white', 68, 0.03, 56.5, 0, 0.9);
  c.prop('crate', 36.2, 0.03, 63.4, 0.3, 1.0); c.prop('crate', 36.2, 1.03, 63.4, 0.1, 0.9); c.prop('barrels', 67.3, 0.03, 64, 0.7, 1.0);
  // 水族箱（藍色）
  c.mm('tile', '#d8dad4', 49, 0.03, 62, 55, 0.8, 64.6);
  c.vis('water', '#2a8aa8', 49.1, 0.8, 62.1, 54.9, 1.05, 64.5);
  // 小吃攤的紅色塑膠椅與圓桌
  for (const [tx, tz] of [[40, 48], [46, 54.5], [62, 48], [58, 55]] as const) {
    c.mm('metal', '#d0c8b0', tx - 0.45, 0.03, tz - 0.45, tx + 0.45, 0.75, tz + 0.45);
    for (const [dx, dz] of [[-0.8, 0], [0.8, 0], [0, -0.8], [0, 0.8]] as const) c.mm('wood', '#c0392b', tx + dx - 0.2, 0.03, tz + dz - 0.2, tx + dx + 0.2, 0.45, tz + dz + 0.2);
  }
  // ---- 商人攤位（中央偏北）：圍起來的攤，只有南側櫃檯可互動 ----
  c.mm('tile', '#d8dad4', 47.6, 0.03, 49.4, 54.4, 1.0, 50.4);                   // 櫃檯
  c.vis('wood', '#6b4c2e', 47.55, 1.0, 49.35, 54.45, 1.1, 50.45);
  c.mm('metal', '#4a6a8a', 47.6, 0.03, 46.4, 54.4, 2.4, 46.6);                 // 後牆貨架
  c.mm('metal', '#4a6a8a', 47.6, 0.03, 46.4, 47.8, 2.4, 49.4);
  c.mm('metal', '#4a6a8a', 54.2, 0.03, 46.4, 54.4, 2.4, 49.4);
  c.vis('wood', '#b58a5a', 47.8, 1.0, 46.6, 54.2, 1.1, 47.0);
  c.vis('wood', '#b58a5a', 47.8, 1.7, 46.6, 54.2, 1.8, 47.0);
  c.vis('metal', '#d9a21b', 47.0, 2.5, 46.2, 55.0, 2.62, 51.4);                // 黃色大遮陽棚
  c.vis('metal', '#f0eadc', 47.0, 2.62, 51.3, 55.0, 2.9, 51.45);
  c.sign({ text: '時代商行', x: 51, y: 3.6, z: 51.5, yaw: 0, w: 5, h: 1.2, bg: '#7a1f1f', fg: '#f6d56a', font: 0.85 });
  c.sign({ text: '時代商行', x: 51, y: 3.6, z: 46.1, yaw: Math.PI, w: 5, h: 1.2, bg: '#7a1f1f', fg: '#f6d56a', font: 0.85 });
  c.sign({ text: '今日現流 新鮮魚貨', x: 51, y: 3.9, z: 34.5, yaw: 0, w: 9, h: 0.8, bg: '#1d3b5e', fg: '#ffffff', font: 0.8 });
  c.sign({ text: '魚市場', x: 51, y: 5.6, z: 66.9, yaw: 0, w: 8, h: 1.8, bg: '#173a63', fg: '#f4f0dc', font: 0.85 });
  c.sign({ text: '魚市場', x: 51, y: 5.6, z: 33.1, yaw: Math.PI, w: 8, h: 1.8, bg: '#173a63', fg: '#f4f0dc', font: 0.85 });
  c.sign({ text: '請勿吸菸', x: 34.4, y: 2.0, z: 50, yaw: Math.PI / 2, w: 1.4, h: 0.5, bg: '#b3261e', fg: '#fff', font: 0.9 });

  c.pointLight(51, 3.9, 50, '#ffe0a8', 22, 30, 0.4);
  c.zone('indoor_large', 'fish_market', x0, -0.5, z0, x1, roofY, z1);
}
