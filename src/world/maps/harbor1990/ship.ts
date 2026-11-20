import { chairAt, bunkAt, lockerAt, tableAt } from './furniture';
import { CT, SHIP } from './layout';
import { container } from './yard';
import { Ctx, flight, uStair, type Opening, type Rect } from './util';

/**
 * 貨船「海順輪」：甲板上有貨櫃與艙口，甲板下三個空間：
 *  - 船艙（y 0.3）：船尾的上鋪、餐廳、廚房，木地板
 *  - 機房（y -2.9）：巨大的主機、金屬格柵地板，從船艙的樓梯下去，也有門通貨艙
 *  - 貨艙（y -2.9，6m 高）：疊著貨櫃的迷宮，很暗；從甲板的艙口樓梯下去
 */

const HATCH1 = { u: -33.8, v: -74.3, w: 1.8 };      // 貨艙艙口：U 形樓梯（往 +x 上行，B 段折返回甲板）
const HATCH2 = { top: -15.0, bottom: -10.68, v: -73.6, w: 2.4 }; // 船艙艙口：直梯
const ENG_STAIR = { top: -5.2, bottom: -0.5, v: -74.0, w: 2.4 };  // 船艙 → 機房（從東邊的機房底端往西上到船艙走廊）

export function buildShip(c: Ctx): void {
  const { x0: X0, x1: X1, z0: Z0, z1: Z1, wall: W, bottom, hold, cabin, deck, bulkhead } = SHIP;
  const hull = '#3f3a39', deckC = '#6d726c', rail = '#7a3b30';
  const deckSlabBottom = deck - 0.3;

  // ---- 艙口洞口（U 形樓梯 + 直梯）----
  const halfH = (deck - hold) / 2;
  const steps1 = Math.ceil(halfH / 0.25);
  const run1 = steps1 * 0.36;
  const hatch1: Rect = { x0: HATCH1.u, z0: HATCH1.v, x1: HATCH1.u + run1 + 2.0, z1: HATCH1.v + HATCH1.w * 2 + 0.2 };
  const hatch2: Rect = { x0: HATCH2.top, z0: HATCH2.v - HATCH2.w / 2, x1: HATCH2.bottom, z1: HATCH2.v + HATCH2.w / 2 };
  const engHole: Rect = { x0: ENG_STAIR.top, z0: ENG_STAIR.v - ENG_STAIR.w / 2, x1: ENG_STAIR.bottom, z1: ENG_STAIR.v + ENG_STAIR.w / 2 };

  // ================================================================ 外殼（甲板、船舷、上層建築、貨櫃）
  c.within('ship', { kind: 'shell', building: 'ship' }, () => {
    // 船殼：底板 + 四面牆（水面以下看不到）
    c.mm('metal', hull, X0, bottom, Z0, X1, bottom + 0.5, Z1);
    c.mm('metal', hull, X0, bottom, Z1 - W, X1, deckSlabBottom, Z1);
    c.mm('metal', hull, X0, bottom, Z0, X1, deckSlabBottom, Z0 + W);
    c.mm('metal', hull, X0, bottom, Z0, X0 + W, deckSlabBottom, Z1);
    c.mm('metal', hull, X1 - W, bottom, Z0, X1, deckSlabBottom, Z1);
    c.vis('metal', '#8c2f26', X0 - 0.05, -0.6, Z0 - 0.05, X1 + 0.05, 0.4, Z1 + 0.05); // 吃水線紅漆
    // 甲板（艙口開洞）
    c.ground('metal', deckC, { x0: X0, z0: Z0, x1: X1, z1: Z1 }, deck, 0.3, [hatch1, hatch2]);
    // 船舷（有缺口給登船梯）：視覺 1.2m + 隱形高牆到 7m
    const gap = { a: -21.2, b: -18.8 };
    const bt = 0.4;
    c.wall('x', Z1 - bt / 2, bt, X0, X1, deck, deck + 1.2, [{ a: gap.a, b: gap.b, h: 5 }], 'metal', rail);
    c.col(X0, deck + 1.2, Z1 - bt, gap.a, 7.5, Z1);
    c.col(gap.b, deck + 1.2, Z1 - bt, X1, 7.5, Z1);
    c.mm('metal', rail, X0, deck, Z0, X1, deck + 1.2, Z0 + bt);
    c.col(X0, deck + 1.2, Z0, X1, 7.5, Z0 + bt);
    c.mm('metal', rail, X0, deck, Z0, X0 + bt, deck + 1.2, Z1);
    c.col(X0, deck + 1.2, Z0, X0 + bt, 7.5, Z1);
    c.mm('metal', rail, X1 - bt, deck, Z0, X1, deck + 1.2, Z1);
    c.col(X1 - bt, deck + 1.2, Z0, X1, 7.5, Z1);
    // 船頭尖角（視覺）
    c.vis('metal', hull, X0 - 3, -2.4, Z0 + 4, X0, deck - 0.1, Z1 - 4);
    c.vis('metal', deckC, X0 - 3, deck - 0.1, Z0 + 4, X0, deck, Z1 - 4);

    // 上層建築（船橋）
    c.mm('metal', '#d8d6cc', -9, deck, -76.8, -1, 9.0, -68.6);
    c.mm('metal', '#c7c5bb', -8, 9.0, -76.2, -2, 11.0, -69.2);
    c.vis('metal', '#1b2a33', -8.05, 9.5, -76.2, -7.95, 10.6, -69.2);
    c.vis('metal', '#1b2a33', -8, 9.5, -69.25, -2, 10.6, -69.15);
    for (let y = 5; y < 9; y += 1.8) c.vis('metal', '#27333b', -9.05, y, -76.2, -8.95, y + 0.9, -69.2);
    c.mm('metal', '#a8322a', -5, 11, -73.5, -2.5, 15, -71.8);
    c.vis('metal', '#222', -5.05, 14, -73.5, -2.45, 15, -71.8);
    c.vis('metal', '#bbb', -4, 11, -72.9, -3.6, 21, -72.5); // 桅杆

    // 甲板貨櫃
    const cols = ['#9c3b2e', '#2f5d7c', '#a8842c', '#4f7a45'];
    const contMetal = (x0: number, z0: number, color: string, y: number = deck): void => {
      c.mm('metal', color, x0, y, z0, x0 + CT.len, y + CT.h - CT.roof, z0 + CT.wid);
      c.mm('metal_hollow', '#5a5d5f', x0, y + CT.h - CT.roof, z0, x0 + CT.len, y + CT.h, z0 + CT.wid);
    };
    contMetal(-41.4, -79.8, cols[0]);
    contMetal(-28.9, -79.8, cols[1]);
    contMetal(-16.4, -79.8, cols[2]);
    contMetal(-41.4, -67.9, cols[3]);
    contMetal(-41.4, -79.8, '#3b6c8d', deck + CT.h);

    // 艙口圍板（coaming）：三面有（入口那一側開放），視覺 0.45m、碰撞 1.2m
    const coaming = (r: Rect, openSide: '-x' | '+x'): void => {
      const t = 0.18, hv = 0.45, hc = 1.2;
      const put = (a0: number, b0: number, a1: number, b1: number): void => {
        c.mm('metal', '#4d5a4f', a0, deck, b0, a1, deck + hv, b1);
        c.col(a0, deck + hv, b0, a1, deck + hc, b1);
      };
      put(r.x0, r.z0 - t, r.x1, r.z0); put(r.x0, r.z1, r.x1, r.z1 + t);
      if (openSide === '-x') put(r.x1, r.z0 - t, r.x1 + t, r.z1 + t); else put(r.x0 - t, r.z0 - t, r.x0, r.z1 + t);
    };
    coaming(hatch1, '-x');
    coaming(hatch2, '-x');
    // 艙口邊的標示
    c.sign({ text: '貨艙 小心落差', x: HATCH1.u + 3, y: deck + 0.9, z: hatch1.z0 - 0.2, yaw: Math.PI, w: 2.4, h: 0.5, bg: '#c9a227', fg: '#222', font: 0.8 });
    // 甲板雜物
    c.prop('crate', -22, deck, -66.5, 0.3, 1.0);
    c.prop('crate', -23.1, deck, -66.4, 0.1, 1.0);
    c.prop('barrels', -16, deck, -66.4, 0.4, 1.0);
    c.prop('crate', -30, deck, -78.1, 0, 0.9);
    c.prop('barrel', -12, deck, -77.8, 0, 0.95);
    c.mm('metal', '#a8322a', -38, deck, -73.2, -36, deck + 0.9, -71.8);   // 起錨機
    c.mm('metal', '#2e3335', -4, deck, -66.2, -3.4, deck + 0.6, -65.6);    // 繫纜柱

    // 登船梯：碼頭 → 甲板（16 階）
    const gx = (gap.a + gap.b) / 2;
    const steps = 16, depth = 0.38;
    c.stairs({ surface: 'metal_grate', color: '#8e9aa3', altColor: '#7e8a93', x: gx, y: 0.02, z: -54, yaw: Math.PI / 2, steps, rise: (deck - 0.02) / steps, depth, width: 2.4 });
    const zTop = -54 - steps * depth;
    c.mm('metal_grate', '#8e9aa3', gap.a, deck - 0.3, Z1 - 0.2, gap.b, deck, zTop + 0.05);
    for (const sx of [gap.a, gap.b - 0.08]) c.vis('metal', '#c9a227', sx, 0.9, -64.6, sx + 0.08, 4.4, zTop);
    for (const sx of [gap.a - 0.1, gap.b]) c.col(sx, deck, Z1 - 0.2, sx + 0.1, deck + 1.4, zTop);
    c.sign({ text: '海順輪', x: -20, y: 1.6, z: -64.55, yaw: Math.PI, w: 7, h: 1.4, bg: '#2a2a2a', fg: '#f0e6c8', font: 0.8 });
    // 導航點：登船梯、艙口前
    c.hint(-20, 0.02, -52.5); c.hint(-20, deck, -62.5); c.hint(-20, deck, -67);
    for (const x of [-39, -34, -29, -24, -19, -14]) c.hint(x, deck, -69.2);
    for (const x of [-40, -34, -28, -22, -16]) c.hint(x, deck, -76.2);
    for (const [x, z] of [[-8, -67.0], [-5, -67.0], [-2, -67.0], [0.4, -70], [0.4, -75], [-10.5, -77.0], [-12, -70.5]] as const) c.hint(x, deck, z);
    c.hint(HATCH1.u - 1.4, deck, hatch1.z0 + 1.9); c.hint(HATCH1.u - 1.4, deck, hatch1.z0 + 3.2); c.hint(HATCH1.u - 1.4, deck, hatch1.z0 + 0.6);
    c.hint(HATCH2.top - 1.4, deck, HATCH2.v); c.hint(HATCH2.top - 1.4, deck, HATCH2.v + 1.4); c.hint(HATCH2.top - 1.4, deck, HATCH2.v - 1.4);
  });

  // ================================================================ 船艙（上鋪、餐廳）
  c.within('ship_cabin', { kind: 'interior', building: 'ship', floor: 1 }, () => {
    // 船艙地板（木）：船尾區 x -15.4 .. 船尾牆；艙口與機房樓梯的洞
    const sx0 = bulkhead + 0.4, sx1 = X1 - W;
    c.ground('wood', '#8a7455', { x0: sx0, z0: Z0 + W, x1: sx1, z1: Z1 - W }, cabin, 0.3, [engHole]);
    const y = cabin, top = deckSlabBottom;
    const pw = (axis: 'x' | 'z', fixed: number, a: number, b: number, ops: Opening[] = []): void =>
      c.wall(axis, fixed, 0.2, a, b, y, top, ops, 'wood', '#a69880');
    // 走廊（z -77..-72）與四間臥艙（北）
    const zN = -77.0, zS = -72.0;
    const cabDoors: Opening[] = [-13.4, -9.4, -5.4, -1.4].map((a) => ({ a, b: a + 1.2, h: 2.1 }));
    pw('x', zN, sx0, sx1, cabDoors);
    for (const x of [-11.0, -7.0, -3.0]) pw('z', x, Z0 + W, zN);
    // 走廊南牆：餐廳門與儲藏室門
    pw('x', zS, sx0, sx1, [{ a: -11.0, b: -9.4, h: 2.1 }, { a: -3.0, b: -1.4, h: 2.1 }]);
    pw('z', -5.0, zS, Z1 - W);
    // 臥艙內部：上下鋪、置物櫃
    [-15.0, -11.0, -7.0, -3.0].forEach((cx, i) => {
      bunkAt(c, y, cx + 0.3, -80.0, 2.0, 0.9);
      bunkAt(c, y, cx + 0.3, -79.0, 2.0, 0.9);
      lockerAt(c, y, cx + 2.6, -80.0, cx + 3.1, -78.6, 1.8, i % 2 ? '#6a7886' : '#7a6a58');
    });
    // 餐廳（tile 地板疊層）與廚房
    c.mm('tile', '#bdb8a8', sx0 + 0.2, y + 0.3 - 0.3, zS + 0.1, -5.1, y + 0.012, Z1 - W);
    for (const [ta, tb] of [[-14.2, -12.2], [-8.2, -6.2]] as const) for (const tz of [-69.6, -66.6]) {
      tableAt(c, y, ta, tz - 0.5, tb, tz + 0.5, 0.75, '#8a7a62');
      for (const x of [ta + 0.5, tb - 0.5]) { chairAt(c, y, x, tz - 1.0, '+z', '#4a3a2a'); chairAt(c, y, x, tz + 1.0, '-z', '#4a3a2a'); }
    }
    c.mm('metal', '#8a8f94', -14.8, y, -71.6, -14.2, y + 1.0, -65.6);                      // 流理台
    c.mm('metal', '#6a7074', -12.4, y, -65.9, -10.2, y + 1.2, -65.3);                      // 爐具
    // 儲藏室
    c.prop('crate', -4.0, y, -66.6, 0.2, 1.0); c.prop('crate', -4.0, y + 1.0, -66.6, 0.5, 0.9); c.prop('barrels', 0.4, y, -66.2, 0.1, 1.0);
    lockerAt(c, y, -4.6, -71.8, -4.1, -69.8, 1.9);
    // 走廊的燈與標示
    for (let x = -13; x < 1; x += 4) c.vis('metal', '#f2efc9', x - 0.8, top - 0.1, -74.6, x + 0.8, top, -74.4);
    c.sign({ text: '餐廳', x: -10.2, y: y + 2.4, z: zS - 0.12, yaw: Math.PI, w: 1.0, h: 0.4, bg: '#173a63', fg: '#fff', font: 0.9 });
    c.sign({ text: '輪機艙 閒人勿入', x: -1.5, y: y + 2.4, z: zS - 0.12, yaw: Math.PI, w: 2.0, h: 0.4, bg: '#b3261e', fg: '#fff', font: 0.8 });
    // 艙口直梯（甲板 ↔ 船艙）
    const f2 = flight(c, { axis: 'x', dir: -1, u: HATCH2.bottom, v: HATCH2.v, width: HATCH2.w, y: cabin, H: deck - cabin, s: 'metal_grate', color: '#7e8a93', alt: '#6f7a83', fill: true });
    for (const p of f2.pts) c.hint(p.x, p.y, p.z);
    // 機房樓梯口：往下
    c.zone('indoor_small', 'ship_cabin', sx0, cabin - 0.2, Z0 + W, sx1, top, Z1 - W);
    // 導航點
    for (const x of [-9.0, -6.4]) c.hint(x, cabin, -74.0);
    for (const a of [-13.4, -9.4, -5.4, -1.4]) { c.hint(a + 0.6, cabin, -76.4); c.hint(a + 0.6, cabin, -77.6); }
    c.doorHint('x', -72.0, -11.0, -9.4, cabin, 1.1); c.doorHint('x', -72.0, -3.0, -1.4, cabin, 1.1);
  }, 0.8);

  // ================================================================ 機房（巨大的主機）
  c.within('ship_engine', { kind: 'interior', building: 'ship', floor: 0 }, () => {
    const ex0 = bulkhead + 0.4, ex1 = X1 - W;
    c.ground('metal_grate', '#7a858c', { x0: ex0, z0: Z0 + W, x1: ex1, z1: Z1 - W }, hold, 0.3);
    const y = hold, top = cabin - 0.0;
    // 艙壁與通貨艙的水密門
    c.wall('z', bulkhead + 0.2, 0.4, Z0 + W, Z1 - W, hold, deckSlabBottom, [{ a: -73.2, b: -71.6, h: 2.3 }], 'metal', '#5a6670');
    c.mm('metal', '#5a6670', bulkhead - 0.05, hold - 0.5, -73.2, bulkhead + 0.45, hold, -71.6);  // 門檻（補平船艙底與機房地板之間的縫）
    c.vis('metal', '#2f3a40', bulkhead + 0.4, hold, -73.0, bulkhead + 0.55, hold + 2.1, -72.2); // 半開的水密門
    // 船艙樓板（從機房看到的天花板）已在 ship_cabin；這裡只畫機房的柱與管線
    // 主機：巨大的柴油引擎
    const ex = -13.9, ez0 = -76.0, ez1 = -69.5;
    c.mm('metal', '#2f4a3a', ex, y, ez0, -5.6, y + 1.0, ez1);                      // 底座
    c.mm('metal', '#3d5a47', ex + 0.4, y + 1.0, ez0 + 0.6, -6.0, y + 2.35, ez1 - 0.6); // 機體
    for (let i = 0; i < 6; i++) c.mm('metal', '#a8322a', ex + 0.8 + i * 1.25, y + 2.35, ez0 + 1.4, ex + 1.6 + i * 1.25, y + 2.75, ez1 - 1.4); // 汽缸蓋
    c.vis('metal', '#c9a227', ex + 0.4, y + 1.6, ez0 + 0.55, -6.0, y + 1.7, ez0 + 0.6);
    c.vis('metal', '#c9a227', ex + 0.4, y + 1.6, ez1 - 0.6, -6.0, y + 1.7, ez1 - 0.55);
    c.mm('metal', '#59606a', ex - 0.9, y, -75.4, ex, y + 1.4, -74.4);               // 飛輪
    // 發電機、油櫃、控制台
    c.mm('metal', '#c28a22', -1.4, y, -80.0, 1.3, y + 1.5, -78.4);
    c.mm('metal', '#c28a22', -1.4, y, -67.0, 1.3, y + 1.5, -65.6);
    c.mm('metal', '#6a7074', -13.0, y, -80.0, -9.4, y + 1.8, -78.4);
    c.mm('metal', '#6a7074', -8.4, y, -67.0, -5.6, y + 1.8, -65.6);
    c.mm('metal', '#3a3d3f', -6.6, y, -80.0, -4.6, y + 1.2, -79.0);
    c.vis('metal', '#6ab0c9', -6.5, y + 1.2, -80.0, -4.7, y + 1.8, -79.9);
    // 天花板下的管線（視覺）
    for (const z of [-79.2, -66.2]) c.vis('metal', '#7a4a30', ex, top - 0.45, z - 0.15, 1.2, top - 0.2, z + 0.15);
    c.vis('metal', '#5b5f60', ex, top - 0.5, -73.0, 1.2, top - 0.25, -72.8);
    for (let x = -13; x < 1; x += 4.5) c.vis('metal', '#e8f0d8', x - 0.6, top - 0.1, -72.9, x + 0.6, top, -72.7);
    c.sign({ text: '主機 禁止明火', x: -9.4, y: y + 2.5, z: -65.28, yaw: Math.PI, w: 2.2, h: 0.5, bg: '#b3261e', fg: '#fff', font: 0.8 });
    // 機房樓梯（往上到船艙）
    const f3 = flight(c, { axis: 'x', dir: -1, u: ENG_STAIR.bottom, v: ENG_STAIR.v, width: ENG_STAIR.w, y: hold, H: cabin - hold, s: 'metal_grate', color: '#7e8a93', alt: '#6f7a83', fill: true });
    for (const p of f3.pts) c.hint(p.x, p.y, p.z);
    // 樓梯口護欄（船艙那一層，洞口的南北兩側）
    for (const [za, zb] of [[engHole.z0 - 0.2, engHole.z0], [engHole.z1, engHole.z1 + 0.2]] as const) {
      c.mm('metal', '#c9a227', engHole.x0, cabin, za, engHole.x1, cabin + 1.0, zb);
      c.col(engHole.x0, cabin + 1.0, za, engHole.x1, cabin + 2.2, zb);
    }
    c.mm('metal', '#c9a227', engHole.x1, cabin, engHole.z0 - 0.2, engHole.x1 + 0.2, cabin + 1.0, engHole.z1 + 0.2);
    c.col(engHole.x1, cabin + 1.0, engHole.z0 - 0.2, engHole.x1 + 0.2, cabin + 2.2, engHole.z1 + 0.2);
    for (const [x, z] of [[0.6, -74.0], [0.6, -71.4], [0.6, -76.6], [-3.0, -78.4], [-3.0, -68.4], [-9.5, -78.2], [-9.5, -67.8], [-14.6, -77.0], [-14.6, -68.0]] as const) c.hint(x, hold, z);
    c.zone('indoor_large', 'ship_engine', ex0, hold - 0.2, Z0 + W, ex1, cabin, Z1 - W);
    // 導航點
    c.doorHint('z', bulkhead + 0.2, -73.2, -71.6, hold, 0.75);
  }, 0.6);

  // ================================================================ 貨艙（疊貨櫃的迷宮，很暗）
  c.within('ship_hold', { kind: 'interior', building: 'ship', floor: 0 }, () => {
    const hx0 = X0 + W, hx1 = bulkhead;
    const y = hold;
    c.ground('metal', '#6b6f72', { x0: hx0, z0: Z0 + W, x1: hx1, z1: Z1 - W }, hold, 0.3);
    // 貨櫃迷宮：每欄 12m 長（沿 z），南北交錯留出 2.2m 的通道
    const palette = ['#9c3b2e', '#2f5d7c', '#4f7a45', '#b08a2e', '#7c7f83', '#c46a2c', '#3a6b6b', '#8a4b6a'];
    const zN = Z0 + W + 0.1, zS = Z1 - W - 0.1 - CT.len;
    const colsX: { x: number; north: boolean; lv: number }[] = [
      { x: -41.3, north: true, lv: 2 },
      { x: -24.2, north: false, lv: 2 }, { x: -19.36, north: true, lv: 2 },
    ];
    colsX.forEach((cl, i) => {
      for (let l = 0; l < cl.lv; l++) container(c, cl.x, y + l * CT.h, cl.north ? zN : zS, palette[(i * 3 + l) % palette.length], false);
    });
    // 散落的貨物與貨板
    c.prop('crate', -37.0, y, -70.2, 0.3, 1.1); c.prop('crate', -37.0, y + 1.1, -70.2, 0.1, 1.0); c.prop('crate', -37.6, y, -75.0, 0.7, 1.0);
    c.prop('barrels', -29.0, y, -65.8, 0.2, 1.0); c.prop('crate', -28.6, y, -79.0, 0.4, 1.0); c.prop('crate', -17.2, y, -79.6, 0, 1.0);
    c.prop('barrels', -40.6, y, -66.2, 0.5, 1.0); c.prop('box_blue', -33.0, y, -66.0, 0.2, 0.9);
    // 貨艙壁的肋骨與管線（視覺）
    for (let x = hx0 + 2; x < hx1 - 1; x += 3) {
      c.vis('metal', '#59616a', x, y, Z1 - W - 0.15, x + 0.25, deckSlabBottom, Z1 - W);
      c.vis('metal', '#59616a', x, y, Z0 + W, x + 0.25, deckSlabBottom, Z0 + W + 0.15);
    }
    c.vis('metal', '#7a4a30', hx0, 1.6, Z0 + W, hx1, 1.85, Z0 + W + 0.25);
    // 貨艙樓梯（U 形，從甲板艙口往下）
    const st = uStair(c, {
      axis: 'x', dir: 1, u: HATCH1.u, v: HATCH1.v, w: HATCH1.w, gap: 0.2, y: hold, H: deck - hold, s: 'metal_grate',
      color: '#7e8a93', alt: '#6f7a83', plat: '#6f7a83', landing: 2.0, solid: true,
    });
    for (const p of st.pts) c.hint(p.x, p.y, p.z);
    c.hint(HATCH1.u - 1.0, hold, HATCH1.v + 1.0); c.hint(HATCH1.u - 1.0, hold, HATCH1.v + 2.8);
    for (const [x, z] of [[-35.0, -76.0], [-31.5, -76.8], [-35.0, -69.0], [-31.5, -68.6], [-25.4, -76.0], [-25.4, -72.0], [-25.4, -69.0], [-25.4, -78.6], [-22.9, -78.8], [-20.56, -78.6], [-20.56, -76.0], [-20.56, -72.0], [-20.56, -69.0], [-20.56, -67.0], [-18.2, -66.8], [-16.35, -67.0], [-16.35, -68.6], [-16.35, -70.0], [-16.35, -72.4], [-40.0, -66.6], [-37.0, -66.6]] as const) c.hint(x, hold, z);
    // 艙口垂下來的天光（視覺）
    c.vis('metal', '#cbd2d6', hatch1.x0 + 0.5, deckSlabBottom - 0.02, hatch1.z0 + 0.4, hatch1.x1 - 0.5, deckSlabBottom, hatch1.z0 + 0.5);
    c.pointLight(-30, 0.3, -72.7, '#c9d6c0', 8, 30, 0.8);
    c.zone('indoor_large', 'ship_hold', hx0, hold - 0.2, Z0 + W, hx1, deckSlabBottom, Z1 - W);
  }, 0.45);
}
