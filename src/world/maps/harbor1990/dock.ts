import { CT, DECK_Y } from './layout';
import { Ctx } from './util';

/** 碼頭區：木棧板碼頭、繫纜樁、貨船、起重機、燈塔、快艇 */
export function buildDock(c: Ctx): void {
  // 碼頭邊緣的水泥護舷與繫纜樁
  c.vis('concrete', '#6a6c6c', -62, -1.6, -64.3, 62, 0.02, -64);
  for (let x = -58; x <= 58; x += 8) {
    if (Math.abs(x + 20) < 3) continue; // 登船梯前面不放
    c.mm('metal', '#2e3335', x - 0.28, 0.02, -63.7, x + 0.28, 0.5, -63.2);
    c.vis('metal', '#c9a227', x - 0.3, 0.5, -63.75, x + 0.3, 0.58, -63.15);
  }
  // 木棧板與貨物
  const crates: [number, number, number][] = [
    [-58, -57, 1.1], [-56.8, -57.2, 1.0], [-57.4, -57.1, 0.9], [-47, -54, 1.1], [-46.9, -54, 1.1], [-12, -56, 1.1], [-12, -56.1, 1.1],
    [8, -61, 1.1], [9.4, -61.2, 1.0], [24, -53, 1.1], [32, -62, 1.2], [33.3, -62.2, 1.0], [-30, -62, 1.0], [-4, -53, 1.0],
  ];
  crates.forEach(([x, z, s], i) => {
    c.prop('crate', x, 0.02 + (i === 2 || i === 6 || i === 8 ? 1.1 : 0), z, (i * 0.7) % 1.2, s);
  });
  // 疊一層的底下墊著
  c.col(-58.5, 0.02, -57.6, -56.3, 1.1, -56.5);
  c.col(-12.6, 0.02, -56.6, -11.4, 1.1, -55.4);
  c.col(7.4, 0.02, -61.6, 8.6, 1.1, -60.4);
  c.prop('barrels', -36, 0.02, -61.5, 0.3, 1.0);
  c.prop('barrels', 14, 0.02, -62, 0.8, 1.0);
  c.prop('barrel', 40, 0.02, -53.2, 0, 0.95);
  c.prop('generator', 17, 0.02, -53, 0, 1.0);
  c.prop('barrels', 54, 0.02, -61, 1, 1.0);
  // 漁網堆（低矮，純視覺）
  c.vis('grass', '#3d5b4a', -26, 0.02, -58, -24, 0.45, -56.4);
  // 碼頭小屋（紅頂倉儲棚）
  c.mm('metal', '#8c7f6a', 18, 0.02, -62.6, 26, 3.2, -57);
  c.mm('metal', '#7b3a2a', 17.6, 3.2, -63, 26.4, 3.5, -56.6);

  // 快艇（撤離點）：停在碼頭東側水面，純視覺
  c.vis('metal', '#e8e8e4', 54.8, -1.0, -71, 57.2, -0.1, -65.6);
  c.vis('metal', '#2d6aa8', 54.8, -0.5, -71, 57.2, -0.1, -65.6);
  c.vis('metal', '#d9dad6', 55.2, -0.1, -69.5, 56.8, 0.7, -67.2);
  c.vis('metal', '#222', 55.3, 0.3, -69.4, 56.7, 0.55, -67.3);

  buildShip(c);
  buildCrane(c, 46);
  buildLighthouse(c, 82, -57);

  // 迴響：碼頭是開放空間（不標）
}

function buildShip(c: Ctx): void {
  const X0 = -42, X1 = 2, Z0 = -80.8, Z1 = -64.6;
  const hull = '#3f3a39', deck = '#6d726c', rail = '#7a3b30';
  // 船殼與甲板
  c.mm('metal', hull, X0, -2.4, Z0, X1, DECK_Y - 0.1, Z1);
  c.mm('metal', deck, X0, DECK_Y - 0.1, Z0, X1, DECK_Y, Z1);
  c.vis('metal', '#8c2f26', X0 - 0.05, -0.6, Z0 - 0.05, X1 + 0.05, 0.4, Z1 + 0.05); // 吃水線紅漆
  // 船舷（有缺口給登船梯）：視覺 1.2m + 隱形高牆到 7m
  const gap = { a: -21.2, b: -18.8 };
  const bt = 0.4;
  c.wall('x', Z1 - bt / 2, bt, X0, X1, DECK_Y, DECK_Y + 1.2, [{ a: gap.a, b: gap.b, h: 5 }], 'metal', rail);
  c.col(X0, DECK_Y + 1.2, Z1 - bt, gap.a, 7.5, Z1);
  c.col(gap.b, DECK_Y + 1.2, Z1 - bt, X1, 7.5, Z1);
  c.mm('metal', rail, X0, DECK_Y, Z0, X1, DECK_Y + 1.2, Z0 + bt);
  c.col(X0, DECK_Y + 1.2, Z0, X1, 7.5, Z0 + bt);
  c.mm('metal', rail, X0, DECK_Y, Z0, X0 + bt, DECK_Y + 1.2, Z1);
  c.col(X0, DECK_Y + 1.2, Z0, X0 + bt, 7.5, Z1);
  c.mm('metal', rail, X1 - bt, DECK_Y, Z0, X1, DECK_Y + 1.2, Z1);
  c.col(X1 - bt, DECK_Y + 1.2, Z0, X1, 7.5, Z1);
  // 船頭尖角（視覺）
  c.vis('metal', hull, X0 - 3, -2.4, Z0 + 4, X0, DECK_Y - 0.1, Z1 - 4);
  c.vis('metal', deck, X0 - 3, DECK_Y - 0.1, Z0 + 4, X0, DECK_Y, Z1 - 4);

  // 上層建築（船橋）
  c.mm('metal', '#d8d6cc', -9, DECK_Y, -76.8, -1, 9.0, -68.6);
  c.mm('metal', '#c7c5bb', -8, 9.0, -76.2, -2, 11.0, -69.2);
  c.vis('metal', '#1b2a33', -8.05, 9.5, -76.2, -7.95, 10.6, -69.2);
  c.vis('metal', '#1b2a33', -8, 9.5, -69.25, -2, 10.6, -69.15);
  for (let y = 5; y < 9; y += 1.8) c.vis('metal', '#27333b', -9.05, y, -76.2, -8.95, y + 0.9, -69.2);
  c.mm('metal', '#a8322a', -5, 11, -73.5, -2.5, 15, -71.8);
  c.vis('metal', '#222', -5.05, 14, -73.5, -2.45, 15, -71.8);
  // 桅杆
  c.vis('metal', '#bbb', -4, 11, -72.9, -3.6, 21, -72.5);

  // 甲板貨櫃（北排 3 只；南排 1 只）
  const cols = ['#9c3b2e', '#2f5d7c', '#a8842c', '#4f7a45'];
  const contMetal = (x0: number, z0: number, color: string, y = DECK_Y): void => {
    c.mm('metal', color, x0, y, z0, x0 + CT.len, y + CT.h - CT.roof, z0 + CT.wid);
    c.mm('metal_hollow', '#5a5d5f', x0, y + CT.h - CT.roof, z0, x0 + CT.len, y + CT.h, z0 + CT.wid);
  };
  contMetal(-41.4, -79.8, cols[0]);
  contMetal(-28.9, -79.8, cols[1]);
  contMetal(-16.4, -79.8, cols[2]);
  contMetal(-41.4, -67.9, cols[3]);
  contMetal(-41.4, -79.8, '#3b6c8d', DECK_Y + CT.h);
  // 艙口蓋與甲板雜物
  c.mm('metal', '#4d5a4f', -34, DECK_Y, -74.5, -26, DECK_Y + 0.45, -70.5);
  c.mm('metal', '#4d5a4f', -14, DECK_Y, -74.5, -10.5, DECK_Y + 0.4, -71.5);
  c.prop('crate', -22, DECK_Y, -66.5, 0.3, 1.0);
  c.prop('crate', -23.1, DECK_Y, -66.4, 0.1, 1.0);
  c.prop('barrels', -16, DECK_Y, -66.4, 0.4, 1.0);
  c.prop('crate', -30, DECK_Y, -78.1 + 0.0, 0, 0.9);
  c.prop('barrel', -12, DECK_Y, -77.8, 0, 0.95);
  // 起錨機與繫纜柱
  c.mm('metal', '#a8322a', -38, DECK_Y, -73.2, -36, DECK_Y + 0.9, -71.8);
  c.mm('metal', '#2e3335', -4, DECK_Y, -66.2, -3.4, DECK_Y + 0.6, -65.6);

  // 登船梯：碼頭 → 甲板（16 階 × 0.2 = 3.2m）
  const gx = (gap.a + gap.b) / 2;
  const steps = 16, rise = 0.2, depth = 0.38;
  c.b.addStairs({ surface: 'metal_grate', color: '#8e9aa3', altColor: '#7e8a93', x: gx, y: 0.02, z: -54, yaw: Math.PI / 2, steps, rise: (DECK_Y - 0.02) / steps, depth, width: 2.4 });
  const zTop = -54 - steps * depth;
  c.mm('metal_grate', '#8e9aa3', gap.a, DECK_Y - 0.3, Z1 - 0.2, gap.b, DECK_Y, zTop + 0.05);
  // 扶手（視覺）
  for (const sx of [gap.a, gap.b - 0.08]) c.vis('metal', '#c9a227', sx, 0.9, -64.6, sx + 0.08, 4.4, zTop);
  void rise;
  for (const sx of [gap.a - 0.1, gap.b]) c.col(sx, DECK_Y, Z1 - 0.2, sx + 0.1, DECK_Y + 1.4, zTop);
  // 船身填實（梯子下方到岸邊）：岸邊隱形牆在 buildTerrain，碼頭邊 z=-64 之下有 -2.4 的船殼
  c.sign({ text: '海順輪', x: -20, y: 1.6, z: -64.55, yaw: Math.PI, w: 7, h: 1.4, bg: '#2a2a2a', fg: '#f0e6c8', font: 0.8 });
}

/** 橋式起重機（地標）：四腳龍門 + 伸出海面的臂 */
function buildCrane(c: Ctx, cx: number): void {
  const col = '#c8a02a', dark = '#2e4a6b';
  const H = 24;
  const legs = [[cx - 6, -62.5], [cx - 6, -51.5], [cx + 6, -62.5], [cx + 6, -51.5]];
  for (const [x, z] of legs) {
    c.mm('metal', col, x - 0.6, 0.02, z - 0.6, x + 0.6, H, z + 0.6);
    c.vis('metal', dark, x - 0.9, 0.02, z - 0.9, x + 0.9, 1.0, z + 0.9);
  }
  // 門框橫樑與頂部走道（純視覺，碰撞不要）
  c.vis('metal', col, cx - 6.6, H - 1.2, -63.1, cx + 6.6, H, -62.0);
  c.vis('metal', col, cx - 6.6, H - 1.2, -52.0, cx + 6.6, H, -50.9);
  c.vis('metal', col, cx - 6.6, H - 1.2, -63.1, cx - 5.4, H, -50.9);
  c.vis('metal', col, cx + 5.4, H - 1.2, -63.1, cx + 6.6, H, -50.9);
  c.vis('metal', col, cx - 6.6, 11, -62.9, cx - 5.4, 12, -51.1);
  c.vis('metal', col, cx + 5.4, 11, -62.9, cx + 6.6, 12, -51.1);
  // 吊臂（伸向海面）與機房
  c.vis('metal', '#d7b23a', cx - 0.9, H, -98, cx + 0.9, H + 1.6, -50);
  c.vis('metal', '#8a6f1f', cx - 0.6, H + 1.6, -98, cx + 0.6, H + 2.4, -68);
  c.vis('metal', '#7a7f82', cx - 2, H + 1.6, -58, cx + 2, H + 5, -52); // 機房
  c.vis('metal', '#7a7f82', cx - 0.15, H, -82, cx + 0.15, H - 5, -81.8); // 吊索
  // A 字塔
  c.vis('metal', '#bf9a28', cx - 0.5, H + 1.6, -61, cx + 0.5, H + 9, -60);
  c.vis('metal', '#bf9a28', cx - 0.1, H + 8.5, -98, cx + 0.1, H + 9, -60.5);
  // 警示燈
  c.vis('metal', '#ff3a2a', cx - 0.3, H + 9, -60.9, cx + 0.3, H + 9.6, -60.3);
  c.sign({ text: '高雄港', x: cx, y: 15, z: -50.7, yaw: 0, w: 5.5, h: 1.3, bg: '#173a63', fg: '#ffffff', font: 0.8 });
}

function buildLighthouse(c: Ctx, cx: number, cz: number): void {
  const bands = [['#e8e4d8', 0, 5], ['#b83a2e', 5, 9], ['#e8e4d8', 9, 13], ['#b83a2e', 13, 17]] as const;
  let w = 5.4;
  for (const [color, y0, y1] of bands) {
    c.mm('concrete', color, cx - w / 2, y0, cz - w / 2, cx + w / 2, y1, cz + w / 2);
    w -= 0.5;
  }
  c.mm('concrete', '#44484a', cx - 3.2, 17, cz - 3.2, cx + 3.2, 17.4, cz + 3.2);
  c.vis('metal', '#f4e8a8', cx - 1.4, 17.4, cz - 1.4, cx + 1.4, 19.6, cz + 1.4);
  c.vis('metal', '#44484a', cx - 2.0, 19.6, cz - 2.0, cx + 2.0, 20.6, cz + 2.0);
  c.vis('metal', '#44484a', cx - 0.4, 20.6, cz - 0.4, cx + 0.4, 22, cz + 0.4);
  // 防波堤的堤頭石塊
  c.mm('concrete', '#6c6e6c', cx - 7, 0.02, cz - 6, cx - 4.4, 0.7, cz - 4);
  c.mm('concrete', '#6c6e6c', cx + 4.4, 0.02, cz + 3, cx + 6.6, 0.8, cz + 5.4);
}
