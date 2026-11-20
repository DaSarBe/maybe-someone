import { chairAt, lockerAt, shelfRow, tableAt } from './furniture';
import { DOCK } from './layout';
import { Ctx, flight } from './util';

/**
 * 修船廠（西側）：6m 深的乾塢，裡面墊著一艘整修中的船殼，北緣有橋可以走到船背上；
 * 兩道樓梯從北、南牆下到塢底。旁邊是高大的修理棚與龍門吊。
 */

export const SHED = { x0: -124, x1: -104, z0: 36, z1: 52, h: 6.5, t: 0.4 } as const;

export function buildDrydock(c: Ctx): void {
  const { x0, x1, z0, z1, depth, wall: w } = DOCK;
  const fl = -depth;
  const wc = '#7f8280';
  // ---- 塢底與四面擋土牆（內側面 + 護欄）----
  c.mm('concrete', '#5f6263', x0, fl - 1, z0, x1, fl, z1);
  const wallN = (a: number, b: number): void => { c.mm('concrete', wc, a, fl, z0, b, 0.9, z0 + w); c.col(a, 0.9, z0, b, 2.3, z0 + w); };
  const wallS = (a: number, b: number): void => { c.mm('concrete', wc, a, fl, z1 - w, b, 0.9, z1); c.col(a, 0.9, z1 - w, b, 2.3, z1); };
  // 北牆缺口：橋（x -116.6..-114.4）與北樓梯出口（x -101.4..-98.8）
  wallN(x0, -116.6); wallN(-114.4, -101.4);
  // 南牆缺口：南樓梯出口（x -123.2..-120.1）
  wallS(-120.1, x1);
  c.mm('concrete', wc, x0, fl, z0, x0 + w, 0.9, z1); c.col(x0, 0.9, z0, x0 + w, 2.3, z1);
  c.mm('concrete', wc, x1 - w, fl, z0, x1, 0.9, z1); c.col(x1 - w, 0.9, z0, x1, 2.3, z1);
  // 壁上的水位刻度線與排水孔（視覺）
  for (let x = x0 + 4; x < x1 - 3; x += 6) { c.vis('concrete', '#c8b02a', x, fl, z0 + w, x + 0.15, 0.7, z0 + w + 0.04); c.vis('metal', '#2a2d2e', x + 1.6, fl + 0.3, z0 + w, x + 2.4, fl + 0.9, z0 + w + 0.05); }

  // ---- 兩道樓梯：北（沿北牆往東上）、南（沿南牆往西上），底端朝向塢底走道，頂端接到牆缺口外的地面 ----
  const run = 24 * 0.36;
  const nBottom = -110.0, sBottom = -111.4;
  const fa = flight(c, { axis: 'x', dir: 1, u: nBottom, v: 9.8, width: 2.2, y: fl, H: depth, s: 'concrete', color: '#868a8c', alt: '#7b7f81', steps: 24 });
  const fb = flight(c, { axis: 'x', dir: -1, u: sBottom, v: 24.2, width: 2.2, y: fl, H: depth, s: 'concrete', color: '#868a8c', alt: '#7b7f81', steps: 24 });
  for (const p of [...fa.pts, ...fb.pts]) c.hint(p.x, p.y, p.z);
  c.mm('concrete', wc, nBottom + run - 0.05, -0.3, 8.0, x1 - w, 0, 10.9);                  // 北樓梯頂端的平台（連到牆缺口與地面）
  c.mm('concrete', wc, x0 + w, -0.3, 23.1, sBottom - run + 0.05, 0, 26.0);                  // 南樓梯頂端的平台
  // 平台下方填實（不留可以鑽進去的空洞）
  c.col(nBottom + run - 0.05, fl, 8.0, x1 - w, -0.3, 10.9);
  c.col(x0 + w, fl, 23.1, sBottom - run + 0.05, -0.3, 26.0);
  // 樓梯開放那一側的護牆
  c.mm('concrete', wc, nBottom, fl, 10.9, x1 - w, 0.9, 11.1); c.col(nBottom, 0.9, 10.9, x1 - w, 2.3, 11.1);
  c.mm('concrete', wc, x0 + w, fl, 22.9, sBottom, 0.9, 23.1); c.col(x0 + w, 0.9, 22.9, sBottom, 2.3, 23.1);
  c.hint(-100.2, 0, 6.4); c.hint(-100.2, 0, 9.4); c.hint(-121.7, 0, 27.6); c.hint(-121.7, 0, 24.6);
  c.hint(nBottom - 1.2, fl, 9.8); c.hint(nBottom - 1.2, fl, 12.0); c.hint(sBottom + 1.2, fl, 24.2); c.hint(sBottom + 1.2, fl, 22.0);

  // ---- 船殼（墊在龍骨墩上）：頂面與地面齊平，北緣一座橋可以走上去 ----
  for (let x = -120; x <= -102; x += 3) c.mm('wood', '#6a4a30', x - 0.6, fl, 14.6, x + 0.6, fl + 1.2, 19.4);
  c.mm('metal', '#4a4540', -121.5, fl + 1.2, 13.0, -100.5, 0.0, 21.0);                    // 船殼主體
  c.mm('metal', '#8c2f26', -121.5, fl + 1.2, 13.0, -100.5, fl + 2.2, 21.0);               // 水線下的防鏽紅漆
  c.mm('metal', '#5a5d5f', -121.4, -0.35, 13.1, -100.6, 0.0, 20.9);                        // 甲板
  c.vis('metal', '#6b6560', -121.5, -2.2, 12.95, -100.5, -0.4, 13.05);
  for (let x = -120; x < -101; x += 2.5) c.vis('metal', '#3a3d3f', x, -4.0, 12.92, x + 0.18, -0.4, 13.0);   // 肋骨（外露）
  // 甲板上的艙口、起貨機與雜物
  c.mm('metal', '#4d5a4f', -113, 0.0, 15.4, -108.6, 0.4, 18.6);
  c.mm('metal', '#a8322a', -118.4, 0.0, 16.0, -116.6, 0.9, 18.0);
  c.mm('metal', '#d8d6cc', -104.4, 0.0, 15.2, -101.6, 2.2, 18.8);                          // 船尾小艙房
  c.prop('crate', -110.8, 0.0, 19.8, 0.2, 1.0); c.prop('barrels', -106.8, 0.0, 20.2, 0.3, 1.0); c.prop('crate', -119.4, 0.0, 19.6, 0.5, 1.0);
  // 船背邊緣的護欄（隱形，避免跌進塢底）：北緣留橋的缺口
  c.col(-121.5, 0.0, 12.9, -116.6, 1.3, 13.1); c.col(-114.4, 0.0, 12.9, -100.5, 1.3, 13.1);
  c.col(-121.5, 0.0, 20.9, -100.5, 1.3, 21.1); c.col(-121.6, 0.0, 13.0, -121.4, 1.3, 21.0); c.col(-100.6, 0.0, 13.0, -100.4, 1.3, 21.0);
  // 橋：從北緣地面（z<8）接到甲板（z=13）
  c.mm('metal_grate', '#8a959c', -116.4, -0.3, 7.6, -114.6, 0.0, 13.2);
  c.col(-116.6, 0.0, 8.7, -116.4, 1.3, 13.0); c.col(-114.6, 0.0, 8.7, -114.4, 1.3, 13.0);
  c.vis('metal', '#c9a227', -116.5, 0.9, 8.7, -116.4, 1.0, 13.0); c.vis('metal', '#c9a227', -114.6, 0.9, 8.7, -114.5, 1.0, 13.0);
  c.hint(-115.5, 0, 14.6); c.hint(-115.5, 0, 17.5); c.hint(-115.5, 0, 20.0);
  c.hint(-115.5, 0, 6.2); c.hint(-115.5, 0, 9.6); c.hint(-115.5, 0, 12.4);
  for (const [x, z] of [[-119.5, 14.6], [-112, 14.2], [-111, 19.8], [-105, 14.2], [-117, 19.8], [-107, 20.0]] as const) c.hint(x, 0, z);
  // 塢底雜物：油桶、輪胎堆、焊接氣瓶與積水（掩體）
  c.prop('barrels', -122.0, fl, 11.0, 0.3, 1.0); c.prop('crate', -122.6, fl, 9.6, 0.2, 1.1); c.prop('barrels', -99.6, fl, 23.4, 0.9, 1.0);
  c.prop('generator', -99.9, fl, 22.2, 0.1, 1.0); c.prop('barrel', -112.0, fl, 10.4, 0, 0.95);
  c.vis('water', '#35505a', -118, fl, 9.4, -112, fl + 0.015, 12.2);
  c.vis('water', '#35505a', -108, fl, 22.0, -101, fl + 0.015, 24.6);
  // 龍門吊（視覺為主，兩側鋼腳在塢外）
  for (const z of [6.0, 28.0]) for (const x of [-122.6, -99.4]) c.mm('metal', '#c8a02a', x - 0.35, 0, z - 0.35, x + 0.35, 14, z + 0.35);
  c.vis('metal', '#c8a02a', -123.1, 13.2, 5.6, -98.9, 14.2, 6.4);
  c.vis('metal', '#c8a02a', -123.1, 13.2, 27.6, -98.9, 14.2, 28.4);
  c.vis('metal', '#d7b23a', -112.3, 13.4, 5.8, -111.7, 14.4, 28.2);
  c.vis('metal', '#3a3d3f', -113.0, 12.4, 16.6, -111.0, 13.4, 18.2);
  c.vis('metal', '#7a7f82', -112.1, 7.0, 17.2, -111.9, 12.4, 17.4);
  c.sign({ text: '一號乾塢 水深 6m', x: -112, y: 1.9, z: z0 - 0.3, yaw: Math.PI, w: 5, h: 0.7, bg: '#f2d64a', fg: '#222', font: 0.8 });

  buildShed(c);
}

function buildShed(c: Ctx): void {
  const { x0, x1, z0, z1, h, t } = SHED;
  const wc = '#7d8a93';
  c.setRegion('shipyard_shed', { kind: 'shell', building: 'shed' });
  c.mm('concrete', '#8a8c88', x0, -0.1, z0, x1, 0.03, z1);
  c.wall('x', z0 + t / 2, t, x0, x1, 0, h, [{ a: -115, b: -111, h: 4.4 }], 'metal', wc);   // 大門（北）
  c.wall('x', z1 - t / 2, t, x0, x1, 0, h, [{ a: -108, b: -106.4, h: 2.3 }], 'metal', wc);
  c.wall('z', x0 + t / 2, t, z0, z1, 0, h, [], 'metal', wc);
  c.wall('z', x1 - t / 2, t, z0, z1, 0, h, [{ a: 43, b: 44.6, h: 2.3 }], 'metal', wc);
  c.mm('metal', '#5b6772', x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.4, z1 + 0.3);
  for (let x = x0 + 3; x < x1 - 2; x += 5) c.vis('metal', '#2f3a44', x, 4.4, z0 - 0.04, x + 2.4, 5.6, z0 + 0.02);
  c.sign({ text: '海順造修船', x: -113, y: 5.4, z: z0 - 0.06, yaw: Math.PI, w: 9, h: 1.4, bg: '#1d3b5e', fg: '#f4f0dc', font: 0.8 });
  c.zone('indoor_large', 'shipyard_shed', x0 + t, -0.5, z0 + t, x1 - t, h, z1 - t);
  c.hint(-113, 0.03, z0 - 1.2); c.hint(-113, 0.03, z0 + 1.2); c.hint(-107.2, 0.03, z1 + 1.2); c.hint(-107.2, 0.03, z1 - 1.2);
  c.hint(x1 + 1.2, 0.03, 43.8); c.hint(x1 - 1.2, 0.03, 43.8);
  c.within('shipyard_shed_int', { kind: 'interior', building: 'shed' }, () => {
    // 工作台、車床、鋼板堆、焊接機
    for (const x of [-120, -116]) { tableAt(c, 0.03, x, 38.4, x + 3, 39.6, 0.95, '#6a5a44'); c.vis('metal', '#2f3438', x + 0.4, 0.98, 38.6, x + 1.2, 1.5, 39.4); }
    c.mm('metal', '#4a6f8a', -122.6, 0.03, 43, -120.4, 1.4, 48); c.mm('metal', '#4a6f8a', -122.6, 0.03, 49.4, -120.4, 1.4, 51.4);
    shelfRow(c, 0.03, -110.0, 46.0, -109.1, 51.4, 2.4); shelfRow(c, 0.03, -106.6, 46.0, -105.7, 51.0, 2.4);
    c.mm('metal', '#59606a', -119, 0.03, 44, -113, 0.5, 47);                           // 鋼板堆
    c.mm('metal', '#59606a', -118.4, 0.5, 44.4, -113.6, 1.0, 46.6);
    c.prop('barrels', -105, 0.03, 40.6, 0.2, 1.0); c.prop('crate', -105, 0.03, 38.6, 0.4, 1.1); c.prop('generator', -121.4, 0.03, 40.4, 0, 1.0);
    lockerAt(c, 0.03, -111.5, 51.0, -108.5, 51.5, 1.9);
    chairAt(c, 0.03, -118, 40.6, '-z');
    // 天車吊鉤與軌道（視覺）
    c.vis('metal', '#c9a227', x0 + 0.6, 5.2, z0 + 0.6, x1 - 0.6, 5.5, z0 + 1.0);
    c.vis('metal', '#c9a227', x0 + 0.6, 5.2, z1 - 1.0, x1 - 0.6, 5.5, z1 - 0.6);
    c.vis('metal', '#d7b23a', -114, 5.0, z0 + 0.8, -113, 5.5, z1 - 0.8);
    for (const x of [-118, -110, -106]) c.vis('metal', '#f2efc9', x - 1.2, h - 0.45, 43.9, x + 1.2, h - 0.3, 44.1);
    for (const [x, z] of [[-118, 41.6], [-113, 42.4], [-108, 40.8], [-108, 44.2], [-117, 49.4]] as const) c.hint(x, 0.03, z);
  }, 0.9);
}
