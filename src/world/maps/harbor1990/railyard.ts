import { RAIL } from './layout';
import { container } from './yard';
import { Ctx, flight } from './util';

/**
 * 鐵道貨運站（東北，x 94..130, z -62..-26）：三條東西向鐵軌、可以走進去的悶罐車、
 * 月台（1.1m 高）、油罐車、平板車、柴油機車、號誌小屋與水塔。中間那條鐵軌從東牆缺口穿出去（撤離點）。
 */

function rails(c: Ctx, z: number, x0: number, x1: number): void {
  // 道碴（視覺）、枕木、兩條鋼軌
  c.vis('gravel', '#6a645b', x0, 0, z - 1.7, x1, 0.1, z + 1.7);
  for (let x = x0 + 0.4; x < x1; x += 0.8) c.vis('wood', '#4a3a2a', x, 0.1, z - 1.3, x + 0.25, 0.18, z + 1.3);
  for (const o of [-0.72, 0.72]) c.vis('metal', '#7a6a5c', x0, 0.18, z + o - 0.06, x1, 0.3, z + o + 0.06);
}

/** 一節車廂的輪組與底盤（視覺 + 底盤碰撞） */
function chassis(c: Ctx, x0: number, x1: number, z: number, y: number): void {
  c.mm('metal', '#2e3335', x0, y - 0.4, z - 1.2, x1, y, z + 1.2);
  for (const bx of [x0 + 1.6, x1 - 3.2]) for (const o of [-1.0, 1.0]) c.vis('metal', '#1c1c1c', bx, 0.1, z + o - 0.12, bx + 1.6, 0.9, z + o + 0.12);
  c.col(x0, 0.2, z - 1.2, x1, y - 0.4, z + 1.2);
}

/** 八角形近似的油罐（兩個疊起來的方塊，其中一個轉 45 度） */
function tankCar(c: Ctx, x0: number, x1: number, z: number, y: number, color: string): void {
  const cx = (x0 + x1) / 2, cy = y + 1.35, len = x1 - x0 - 1.6;
  c.b.box('metal', color, cx, cy, z, len, 2.3, 2.3);
  c.b.box('metal', color, cx, cy, z, len, 2.3, 2.3, { x: Math.PI / 4 });
  c.vis('metal', '#2e3335', cx - 1.0, cy + 1.3, z - 0.4, cx + 1.0, cy + 1.5, z + 0.4);
}

export function buildRailyard(c: Ctx): void {
  const { x0, x1, tracks, platformZ0, platformZ1, platformY: PY } = RAIL;
  const [t1, t2, t3] = tracks;
  for (const z of tracks) rails(c, z, x0, x1);
  // 軌道盡頭的車擋
  for (const z of [t1, t3]) { c.mm('metal', '#a8322a', 94.2, 0.1, z - 1.2, 95.2, 1.0, z + 1.2); }

  // ---- 月台（沿 T3 南側，1.1m 高）與兩端樓梯 ----
  c.mm('concrete', '#8d8d86', 96, 0, platformZ0, 126, PY, platformZ1);
  c.vis('concrete', '#c8b02a', 96, PY, platformZ0, 126, PY + 0.02, platformZ0 + 0.15);
  const zc = (platformZ0 + platformZ1) / 2;
  const fa = flight(c, { axis: 'x', dir: 1, u: 94.2, v: zc, width: 2.0, y: 0, H: PY, s: 'concrete', color: '#8d8d86', alt: '#7e7e78', steps: 5 });
  const fb = flight(c, { axis: 'x', dir: -1, u: 127.8, v: zc, width: 2.0, y: 0, H: PY, s: 'concrete', color: '#8d8d86', alt: '#7e7e78', steps: 5 });
  for (const p of [...fa.pts.slice(0, -1), ...fb.pts.slice(0, -1)]) c.hint(p.x, p.y, p.z);
  for (const x of [98, 104, 110, 116, 122]) c.hint(x, PY, zc);
  c.hint(93.0, 0, zc); c.hint(129.0, 0, zc);
  // 月台上的雨棚（鐵柱 + 頂棚，純視覺高處）
  for (const x of [100, 112, 124]) c.mm('metal', '#3a3d3f', x - 0.12, PY, platformZ1 - 0.3, x + 0.12, 4.2, platformZ1 - 0.1);
  c.vis('metal', '#4a6f8a', 98, 4.2, platformZ0 - 0.4, 126, 4.35, platformZ1 + 0.4);
  c.sign({ text: '高雄港 貨運站', x: 111, y: 3.6, z: platformZ1 - 0.08, yaw: 0, w: 6.5, h: 0.9, bg: '#173a63', fg: '#f4f0dc', font: 0.8 });

  // ---- 悶罐車（可以走進去）：兩節，車門面向月台 ----
  const boxcar = (bx0: number, bx1: number, door: [number, number], color: string): void => {
    const z = t3, y = PY, zN = z - 1.45, zS = z + 1.45, t = 0.12, h = 2.9;
    chassis(c, bx0, bx1, z, y);
    c.mm('metal', '#6a5a48', bx0, y - 0.15, zN, bx1, y, zS);                                       // 地板
    c.wall('x', zN + t / 2, t, bx0, bx1, y, y + h, [], 'metal', color);                            // 北牆
    c.wall('x', zS - t / 2, t, bx0, bx1, y, y + h, [{ a: door[0], b: door[1], h: 2.5 }], 'metal', color); // 南牆（車門開口）
    c.wall('z', bx0 + t / 2, t, zN, zS, y, y + h, [], 'metal', color);
    c.wall('z', bx1 - t / 2, t, zN, zS, y, y + h, [], 'metal', color);
    c.mm('metal_hollow', '#5d6062', bx0 - 0.05, y + h, zN - 0.05, bx1 + 0.05, y + h + 0.12, zS + 0.05);
    c.mm('metal', '#6a5a48', door[0], y - 0.15, zS - 0.05, door[1], y, platformZ0 + 0.1);   // 門檻鐵板（接到月台）
    // 推開的門板（視覺）與車廂編號
    c.vis('metal', '#7a3b2a', door[1], y + 0.1, zS - 0.04, door[1] + (door[1] - door[0]) * 0.9, y + 2.5, zS + 0.1);
    c.sign({ text: '台鐵 貨 8217', x: bx0 + 3, y: y + 1.9, z: zN - 0.02, yaw: Math.PI, w: 2.6, h: 0.6, bg: '#2a2a2a', fg: '#e8e0c8', font: 0.8 });
    // 車廂內：貨箱、麻袋堆
    c.prop('crate', bx0 + 1.1, y, z - 0.4, 0.2, 1.0); c.prop('crate', bx0 + 1.1, y + 1.0, z - 0.4, 0.5, 0.9); c.prop('crate', bx1 - 1.2, y, z + 0.4, 0.3, 1.1);
    c.prop('barrels', bx1 - 1.5, y, z - 0.5, 0.2, 1.0); c.prop('crate', bx0 + 3.2, y, z + 0.5, 0.1, 0.9);
    c.zone('indoor_small', bx0 === 98 ? 'boxcar_a' : 'boxcar_b', bx0 + t, y - 0.2, zN + t, bx1 - t, y + h, zS - t);
    c.hint((door[0] + door[1]) / 2, y, z + 1.1); c.hint((door[0] + door[1]) / 2, y, z - 0.2);
  };
  boxcar(98, 112, [103, 106], '#7a4a36');
  boxcar(114, 128, [119, 122], '#5c6a4a');
  c.vis('metal', '#3a3d3f', 112, PY - 0.3, t3 - 0.2, 114, PY - 0.1, t3 + 0.2);                      // 連結器

  // ---- 油罐車（T2）：兩節 ----
  chassis(c, 100, 112, t2, 1.0); tankCar(c, 100, 112, t2, 1.0, '#6b6f66');
  chassis(c, 114, 126, t2, 1.0); tankCar(c, 114, 126, t2, 1.0, '#8a4a3a');
  // ---- 平板車載貨櫃 + 柴油機車（T1）----
  chassis(c, 96, 110, t1, 1.1);
  c.mm('metal', '#4a4f50', 96, 1.0, t1 - 1.45, 110, 1.15, t1 + 1.45);
  container(c, 97, 1.15, t1 - 1.22, '#2f5d7c', true);
  chassis(c, 111, 114, t1, 1.1);
  // 機車
  c.mm('metal', '#c28a22', 115, 0.9, t1 - 1.5, 128, 3.2, t1 + 1.5);
  c.mm('metal', '#3a3d3f', 115, 0.3, t1 - 1.3, 128, 0.9, t1 + 1.3);
  c.mm('metal', '#d8d4c4', 121, 3.2, t1 - 1.45, 126.4, 4.8, t1 + 1.45);                            // 駕駛室
  c.vis('metal', '#1d2a33', 126.4, 3.5, t1 - 1.1, 126.45, 4.5, t1 + 1.1);
  c.vis('metal', '#c8372d', 115, 2.9, t1 - 1.52, 128, 3.0, t1 + 1.52);
  for (const bx of [116.5, 123]) for (const o of [-1.2, 1.2]) c.vis('metal', '#1c1c1c', bx, 0.1, t1 + o - 0.12, bx + 2.4, 0.9, t1 + o + 0.12);
  c.col(115, 0.2, t1 - 1.3, 128, 0.9, t1 + 1.3);
  c.sign({ text: 'DR 2412', x: 118, y: 2.0, z: t1 + 1.55, yaw: 0, w: 2.2, h: 0.6, bg: '#222', fg: '#f2d64a', font: 0.8 });

  // ---- 號誌小屋（南緣）----
  const hx0 = 98, hx1 = 105, hz0 = -33, hz1 = -27, ht = 0.3, hh = 3.0;
  c.mm('tile', '#b9b6a4', hx0, -0.1, hz0, hx1, 0.03, hz1);
  c.wall('x', hz0 + ht / 2, ht, hx0, hx1, 0, hh, [{ a: 100.2, b: 101.8, h: 2.2 }], 'concrete', '#a9aea0');
  c.wall('x', hz1 - ht / 2, ht, hx0, hx1, 0, hh, [], 'concrete', '#a9aea0');
  c.wall('z', hx0 + ht / 2, ht, hz0, hz1, 0, hh, [], 'concrete', '#a9aea0');
  c.wall('z', hx1 - ht / 2, ht, hz0, hz1, 0, hh, [], 'concrete', '#a9aea0');
  c.mm('metal', '#7b3a2a', hx0 - 0.3, hh, hz0 - 0.3, hx1 + 0.3, hh + 0.3, hz1 + 0.3);
  c.mm('metal', '#4a6f8a', 99, 0.03, -29.2, 103.4, 1.0, -28.4);                                    // 號誌轉轍操作台
  for (let i = 0; i < 6; i++) c.vis('metal', i % 2 ? '#c8372d' : '#d9a21b', 99.3 + i * 0.7, 1.0, -29.0, 99.55 + i * 0.7, 1.7, -28.8);
  c.mm('wood', '#7a5a3a', 103.0, 0.03, -32.4, 104.6, 0.78, -31.4);
  c.mm('metal', '#6a7886', 98.4, 0.03, -32.6, 99.0, 1.9, -30.6);
  c.sign({ text: '號誌室', x: 101, y: 2.5, z: hz0 - 0.03, yaw: Math.PI, w: 1.8, h: 0.5, bg: '#173a63', fg: '#fff', font: 0.9 });
  c.zone('indoor_small', 'signal_hut', hx0 + ht, -0.5, hz0 + ht, hx1 - ht, hh, hz1 - ht);
  c.hint(101, 0.03, -34.2); c.hint(101, 0.03, -31.0); c.hint(101, 0.03, -29.8); c.hint(103.5, 0.03, -30.4); c.hint(99.6, 0.03, -30.0);

  // ---- 水塔 / 號誌桿 / 路燈 / 圍籬 ----
  const wx = 118, wz = -30;
  for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]] as const) c.mm('metal', '#4a4f50', wx + dx - 0.15, 0, wz + dz - 0.15, wx + dx + 0.15, 7, wz + dz + 0.15);
  c.cyl('metal', '#7a6a58', wx, 7, wz, 2.0, 2.6, 12);
  c.vis('metal', '#4a4f50', wx - 2.1, 9.6, wz - 2.1, wx + 2.1, 9.8, wz + 2.1);
  c.sign({ text: '給水', x: wx, y: 8.3, z: wz + 2.02, yaw: 0, w: 1.8, h: 0.8, bg: '#27608a', fg: '#fff', font: 0.9 });
  for (const [x, z] of [[96, -47], [108, -53.5], [120, -46.5], [127, -39]] as const) {
    c.mm('metal', '#3a3d3f', x - 0.1, 0, z - 0.1, x + 0.1, 6, z + 0.1);
    c.vis('metal', '#c8372d', x - 0.5, 5.2, z - 0.05, x + 0.1, 5.5, z + 0.05);
    c.vis('metal', '#6ab0c9', x - 0.25, 4.7, z - 0.2, x + 0.25, 5.1, z + 0.2);
  }
  for (const [x, z] of [[100, -61], [118, -61], [126, -28]] as const) {
    c.mm('metal', '#4a4f50', x - 0.15, 0, z - 0.15, x + 0.15, 9, z + 0.15);
    c.vis('metal', '#e8d98a', x - 0.7, 9, z - 0.35, x + 0.7, 9.25, z + 0.35);
  }
  for (let x = 95; x < 129; x += 3) {
    if (x >= 108 && x < 113) continue;
    c.prop('fence', x + 1.5, 0, -25.8, 0, 3);
  }
  // 貨板與木箱、油桶（掩體）
  c.prop('crate', 124.4, PY, -38.95, 0.1, 0.8); c.prop('barrel', 120.6, PY, -38.85, 0, 0.9); c.prop('crate', 98.2, PY, -38.95, 0.3, 0.8);
  c.prop('barrels', 95.4, 0, -61.4, 0.3, 1.0); c.prop('crate', 128, 0, -60, 0.2, 1.2); c.prop('crate', 126.4, 0, -58.6, 0.5, 1.0);
  c.prop('generator', 122, 0, -35, 0.4, 1.0); c.prop('crate', 107, 0, -35.4, 0.1, 1.1); c.prop('barrel', 112.6, 0, -55, 0, 0.95);
  // 東牆缺口的警示
  c.mm('metal', '#2e3335', 128.8, 0.1, t2 - 0.4, 129.4, 1.0, t2 + 0.4);
  c.sign({ text: '貨運專用線 禁止進入', x: 129.55, y: 2.6, z: t2 - 2.05, yaw: -Math.PI / 2, w: 3, h: 0.8, bg: '#f2d64a', fg: '#222', font: 0.8 });
  // 導航：鐵軌間的走道
  for (const [x, z] of [[96, -54], [104, -54], [112, -54], [120, -54], [127, -54], [96, -46.5], [104, -46.5], [113, -46.5], [127, -46.5], [127, -52], [127, -48.5], [96, -60], [108, -60], [120, -60]] as const) c.hint(x, 0, z);
}
