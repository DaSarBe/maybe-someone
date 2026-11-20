import { chairAt, lockerAt, tableAt } from './furniture';
import { Ctx } from './util';

/**
 * 南側：油槽區（四座圓形儲油槽、防溢堤、抽油站）、廢車場（疊起來的報廢車與貨櫃牆）與南大門。
 * 也是玩家從南門進場後、往北經過停車場坡道與排水隧道前的第一段開闊地。
 */

function junkCar(c: Ctx, x: number, z: number, y: number, color: string, alongX: boolean, wreck = false): void {
  const [bx, bz] = alongX ? [4.4, 1.9] : [1.9, 4.4];
  c.mm('metal', color, x - bx / 2, y + 0.25, z - bz / 2, x + bx / 2, y + 1.0, z + bz / 2);
  const [cw, cl] = alongX ? [2.3, 1.7] : [1.7, 2.3];
  c.mm('metal', wreck ? '#5a4a3a' : color, x - cw / 2, y + 1.0, z - cl / 2, x + cw / 2, y + 1.5, z + cl / 2);
  c.col(x - bx / 2, y, z - bz / 2, x + bx / 2, y + 0.25, z + bz / 2);
  c.vis('metal', '#1d2a33', x - cw / 2 - 0.01, y + 1.05, z - cl / 2 - 0.01, x + cw / 2 + 0.01, y + 1.45, z + cl / 2 + 0.01);
}

export function buildSouthYard(c: Ctx): void {
  // ================================================================ 南大門
  c.setRegion('south', { kind: 'outdoor' });
  for (const x of [3.2, 12.0]) c.mm('concrete', '#8d8a80', x - 0.0, 0, 164.6, x + 0.8, 5.2, 166.4);
  c.vis('metal', '#2f5a3a', 4.0, 0.2, 165.5, 8.0, 3.6, 165.65);
  c.vis('metal', '#2f5a3a', 8.0, 0.2, 165.5, 12.0, 3.6, 165.65);
  for (let x = 4.3; x < 12; x += 0.5) c.vis('metal', '#1d3a26', x, 0.2, 165.45, x + 0.07, 3.6, 165.55);
  c.vis('metal', '#2f5a3a', 3.2, 3.6, 165.5, 12.8, 4.1, 165.65);
  c.sign({ text: '海順海運 南大門', x: 8, y: 4.9, z: 164.55, yaw: Math.PI, w: 9, h: 1.0, bg: '#173a63', fg: '#f4f0dc', font: 0.8 });
  c.sign({ text: '閒雜人等 禁止入內', x: 8, y: 4.9, z: 166.41, yaw: 0, w: 9, h: 0.9, bg: '#b3261e', fg: '#ffffff', font: 0.8 });
  // 警衛崗亭（旁邊）：小房間
  const bx0 = 14, bx1 = 19, bz0 = 158, bz1 = 163, bt = 0.3;
  c.mm('tile', '#b9b6a4', bx0, -0.1, bz0, bx1, 0.03, bz1);
  c.wall('x', bz0 + bt / 2, bt, bx0, bx1, 0, 3.0, [{ a: 15, b: 16.4, h: 2.2 }], 'concrete', '#a9aea0');
  c.wall('x', bz1 - bt / 2, bt, bx0, bx1, 0, 3.0, [], 'concrete', '#a9aea0');
  c.wall('z', bx0 + bt / 2, bt, bz0, bz1, 0, 3.0, [], 'concrete', '#a9aea0');
  c.wall('z', bx1 - bt / 2, bt, bz0, bz1, 0, 3.0, [], 'concrete', '#a9aea0');
  c.mm('metal', '#7b3a2a', bx0 - 0.3, 3.0, bz0 - 0.3, bx1 + 0.3, 3.3, bz1 + 0.3);
  tableAt(c, 0.03, 16.4, 161.6, 18.6, 162.6, 0.8); chairAt(c, 0.03, 17.5, 160.9, '+z'); lockerAt(c, 0.03, 14.4, 162.4, 16.0, 162.8, 1.9);
  c.sign({ text: '南門警衛室', x: 16.5, y: 2.6, z: bz0 - 0.03, yaw: Math.PI, w: 2.4, h: 0.5, bg: '#173a63', fg: '#fff', font: 0.9 });
  c.zone('indoor_small', 'south_gate_house', bx0 + bt, -0.5, bz0 + bt, bx1 - bt, 3.0, bz1 - bt);
  c.doorHint('x', bz0 + bt / 2, 15, 16.4, 0.03, 1.1); c.hint(16, 0.03, 160.4); c.hint(18, 0.03, 160); c.hint(16, 0.03, 162.0);
  c.hint(8, 0.02, 162.6); c.hint(8, 0.02, 158); c.hint(8, 0.02, 150);
  // 路障與水泥護欄
  c.mm('concrete', '#c8b02a', 1.0, 0, 154, 2.0, 0.8, 156); c.mm('concrete', '#c8b02a', 14.0, 0, 150, 15.0, 0.8, 152);

  // ================================================================ 油槽區
  c.setRegion('south', { kind: 'outdoor' });
  const tanks: [number, number, number, number, string][] = [
    [2, 114, 8.5, 11, '#b8b4a6'], [22, 114, 8.5, 11, '#a8a89c'], [2, 138, 8.5, 9, '#c0b8a0'], [22, 138, 8.5, 9, '#b0b0a4'],
  ];
  for (const [x, z, r, h, color] of tanks) {
    c.cyl('metal', color, x, 0, z, r, h, 16);
    c.cyl('metal', '#6a6a62', x, h, z, r + 0.15, 0.3, 16);
    c.cyl('concrete', '#8c8a84', x, 0, z, r + 0.4, 0.5, 16);               // 基座
    // 爬梯（視覺）
    c.vis('metal', '#3a3d3f', x - 0.4, 0.5, z - r - 0.15, x + 0.4, h, z - r);
    c.sign({ text: `第 ${tanks.findIndex((t) => t[0] === x && t[1] === z) + 1} 號槽`, x, y: h * 0.55, z: z + r + 0.02, yaw: 0, w: 3.6, h: 1.2, bg: '#c8372d', fg: '#fff', font: 0.85 });
  }
  // 防溢堤（低矮水泥牆，留缺口）
  const bw = (x0: number, z0: number, x1: number, z1: number): void => { c.mm('concrete', '#8a877d', x0, 0, z0, x1, 1.0, z1); };
  bw(-12, 101, 0, 101.5); bw(5, 101, 16, 101.5); bw(20, 101, 32, 101.5);
  bw(-12, 150.5, 6, 151); bw(10, 150.5, 24, 151); bw(28, 150.5, 32, 151);
  bw(-12, 101, -11.5, 117); bw(-12, 133, -11.5, 151); bw(31.5, 101, 32, 118); bw(31.5, 122, 32, 151);
  // 管架（兩層，貼地面，可以從下面鑽過）
  for (let x = -10; x <= 30; x += 8) {
    if (x > 8 && x < 17) continue;
    c.mm('metal', '#4a4f50', x - 0.2, 0, 125.2, x + 0.2, 3.4, 125.6); c.mm('metal', '#4a4f50', x - 0.2, 0, 126.4, x + 0.2, 3.4, 126.8);
  }
  for (const [a, b] of [[-10, 8.4], [16.6, 30.4]] as const) { c.vis('metal', '#7a4a30', a, 3.4, 125.0, b, 3.7, 125.6); c.vis('metal', '#5b5f60', a, 3.0, 126.4, b, 3.3, 126.8); }
  // 抽油站（小房間）
  const px0 = 9.5, px1 = 15.5, pz0 = 122.0, pz1 = 130.0, pt = 0.3;
  c.mm('concrete', '#8c8a84', px0, -0.1, pz0, px1, 0.03, pz1);
  c.wall('x', pz0 + pt / 2, pt, px0, px1, 0, 3.2, [], 'concrete', '#b0a98e');
  c.wall('x', pz1 - pt / 2, pt, px0, px1, 0, 3.2, [{ a: 11.2, b: 12.8, h: 2.3 }], 'concrete', '#b0a98e');
  c.wall('z', px0 + pt / 2, pt, pz0, pz1, 0, 3.2, [], 'concrete', '#b0a98e');
  c.wall('z', px1 - pt / 2, pt, pz0, pz1, 0, 3.2, [{ a: 125, b: 126.6, h: 2.3 }], 'concrete', '#b0a98e');
  c.mm('metal', '#7b3a2a', px0 - 0.3, 3.2, pz0 - 0.3, px1 + 0.3, 3.5, pz1 + 0.3);
  c.mm('metal', '#c8372d', 10.2, 0.03, 123.0, 12.4, 1.4, 124.2); c.mm('metal', '#c8372d', 12.8, 0.03, 123.0, 15.0, 1.4, 124.2);   // 泵
  c.mm('metal', '#4a6f8a', 10.2, 0.03, 127.6, 11.4, 1.8, 129.4); lockerAt(c, 0.03, 13.6, 129.2, 15.2, 129.6, 1.9);
  c.sign({ text: '抽油站 禁止煙火', x: 12.5, y: 2.6, z: pz1 + 0.03, yaw: 0, w: 3.2, h: 0.6, bg: '#b3261e', fg: '#fff', font: 0.8 });
  c.zone('indoor_small', 'pump_house', px0 + pt, -0.5, pz0 + pt, px1 - pt, 3.2, pz1 - pt);
  c.doorHint('x', pz1 - pt / 2, 11.2, 12.8, 0.03, 1.1); c.doorHint('z', px1 - pt / 2, 125, 126.6, 0.03, 1.1); c.hint(12.5, 0.03, 126.4);
  // 油罐車與桶裝油
  c.mm('metal', '#7a8a96', 36, 0.55, 108, 38.6, 1.1, 120);
  c.b.box('metal', '#b8b4a6', 37.3, 2.2, 112, 2.3, 2.4, 8);
  c.b.box('metal', '#b8b4a6', 37.3, 2.2, 112, 2.3, 2.4, 8, { z: Math.PI / 4 });
  c.mm('metal', '#7b8a96', 36, 0.55, 120.2, 38.6, 2.7, 122.8);
  c.col(36, 0, 108, 38.6, 0.55, 122.8);
  c.prop('barrels', -8.5, 0, 141, 0.2, 1.0); c.prop('barrels', 17.5, 0, 141.5, 0.8, 1.0); c.prop('barrel', 30, 0, 130, 0, 0.95); c.prop('barrels', 16, 0, 108, 0.4, 1.0);
  c.prop('crate', 12, 0, 148, 0.2, 1.1); c.prop('barrels', 26, 0, 120, 0.1, 1.0);
  for (const [x, z] of [[-6, 108], [-9, 134], [12, 120], [12, 132], [30, 108], [30, 126], [30, 146], [8, 146], [-6, 146], [14, 100], [10, 156], [26, 160]] as const) c.hint(x, 0, z);

  // ================================================================ 廢車場
  c.setRegion('south', { kind: 'outdoor' });
  const pal = ['#7a8a96', '#8a3a2e', '#9a9a8a', '#3a5a6e', '#5e6a50', '#a89a6a', '#6a4a6a', '#4a4a4a'];
  // 疊放的報廢車排：沿 x 方向的三排，每排留出缺口
  for (const [z, x0, x1] of [[110, 48, 92], [128, 52, 92], [146, 48, 90]] as const) {
    for (let x = x0; x < x1; x += 4.9) {
      if (c.rng() < 0.22) continue;
      if (Math.abs(x + 2.2 - 70) < 3.6) continue; // 中央通道
      const color = pal[Math.floor(c.rng() * pal.length)];
      junkCar(c, x + 2.2, z, 0, color, true, c.rng() < 0.4);
      if (c.rng() < 0.55) junkCar(c, x + 2.2 + (c.rng() - 0.5) * 0.6, z, 1.55, pal[Math.floor(c.rng() * pal.length)], c.rng() < 0.5, true);
    }
  }
  // 貨櫃牆圍出的小院（掩體）
  c.setRegion('south', { kind: 'outdoor' });
  const cols = ['#9c3b2e', '#2f5d7c', '#4f7a45', '#b08a2e', '#7c7f83', '#c46a2c'];
  const box = (x: number, z: number, alongX: boolean, lv = 1): void => {
    for (let l = 0; l < lv; l++) {
      const [sx, sz] = alongX ? [12, 2.44] : [2.44, 12];
      c.mm('metal', cols[(Math.floor(x + z) + l) % cols.length], x, l * 2.5, z, x + sx, l * 2.5 + 2.44, z + sz);
      c.mm('metal_hollow', '#5d6062', x, l * 2.5 + 2.44, z, x + sx, l * 2.5 + 2.5, z + sz);
    }
  };
  box(46, 118, true, 2); box(46, 120.6, true, 1); box(74, 136, false, 1); box(84, 120, false, 2); box(52, 156, true, 1); box(70, 156, true, 2); box(86, 154, false, 1);
  // 吊車與電磁鐵（視覺地標）
  c.mm('metal', '#c8a02a', 72, 0, 160, 73.2, 16, 161.2); c.mm('metal', '#c8a02a', 82, 0, 160, 83.2, 16, 161.2);
  c.vis('metal', '#c8a02a', 71.6, 15.2, 159.6, 83.6, 16.6, 161.6);
  c.vis('metal', '#d7b23a', 76.0, 15.4, 150, 77.2, 16.4, 161.4);
  c.vis('metal', '#7a7f82', 76.5, 8.5, 151.0, 76.7, 15.4, 151.2);
  c.cyl('metal', '#3a3d3f', 76.6, 7.0, 151.1, 1.1, 1.5, 10);
  c.sign({ text: '大順資源回收', x: 77.6, y: 12.5, z: 161.62, yaw: 0, w: 6, h: 1.4, bg: '#7a5a1d', fg: '#f4f0dc', font: 0.8 });
  c.prop('barrels', 66, 0, 142, 0.2, 1.0); c.prop('crate', 80, 0, 142.4, 0.3, 1.1); c.prop('barrels', 90, 0, 128, 0.5, 1.0); c.prop('crate', 56, 0, 130, 0.1, 1.0);
  c.prop('generator', 94, 0, 108, 0.4, 1.0); c.prop('crate', 58, 0, 104, 0.2, 1.0);
  for (const [x, z] of [[46, 104], [56, 104], [66, 104], [76, 104], [86, 104], [70, 112], [70, 120], [70, 128], [70, 136], [70, 146], [46, 120], [46, 138], [94, 116], [94, 136], [94, 150], [58, 150], [80, 150], [64, 160], [90, 160]] as const) c.hint(x, 0, z);
}
