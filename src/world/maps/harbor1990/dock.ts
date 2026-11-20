import { buildShip } from './ship';
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
