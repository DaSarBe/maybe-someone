import { chairAt, lockerAt, shelfRow, tableAt } from './furniture';
import { STREET } from './layout';
import { Ctx, type Opening } from './util';

/**
 * 台式老街（東南，x 96..130, z 38..99）：兩排騎樓店屋（磁磚地、鐵捲門、直式招牌）夾著一條 8m 的小街，
 * 盡頭是土地公廟。店屋室內是 indoor_small；騎樓有頂但兩側通透。
 */

const NAMES = ['阿財小吃', '新生藥房', '大同五金', '振興電器', '美美理髮', '老王麵店', '順發雜貨', '金記鐘錶'];
const SHOP_Z: [number, number][] = [[38, 50], [50, 62], [62, 74], [74, 86]];
const T = 0.3, SH = 3.3;

/** 店屋的室內範圍（給可見性與導航用） */
export const STREET_SHOPS = {
  west: { x0: STREET.westX0, x1: STREET.westX1, z0: 38, z1: 86 },
  east: { x0: STREET.eastX0, x1: STREET.eastX1, z0: 38, z1: 86 },
};

function scooter(c: Ctx, x: number, z: number, color: string, yaw90 = false): void {
  const [sx, sz] = yaw90 ? [1.8, 0.6] : [0.6, 1.8];
  c.mm('metal', color, x - sx / 2, 0.25, z - sz / 2, x + sx / 2, 0.95, z + sz / 2);
  c.vis('metal', '#1a1a1a', x - sx / 2 + 0.05, 0, z - sz / 2 + 0.05, x + sx / 2 - 0.05, 0.3, z + sz / 2 - 0.05);
  c.vis('metal', '#2a2a2a', x - sx / 2 + (yaw90 ? 0 : 0.05), 0.95, z - sz / 2 + (yaw90 ? 0.05 : 0), x + sx / 2 - (yaw90 ? 0 : 0.05), 1.2, z + sz / 2 - (yaw90 ? 0.05 : 0));
}

function cart(c: Ctx, x: number, z: number, awning: string): void {
  c.mm('wood', '#8a6a42', x - 0.9, 0.2, z - 0.5, x + 0.9, 0.95, z + 0.5);
  c.vis('wood', '#b58a5a', x - 0.95, 0.95, z - 0.55, x + 0.95, 1.02, z + 0.55);
  c.vis('metal', '#1a1a1a', x - 0.8, 0, z - 0.55, x - 0.5, 0.4, z - 0.45);
  c.vis('metal', '#1a1a1a', x + 0.5, 0, z - 0.55, x + 0.8, 0.4, z - 0.45);
  for (const [dx, dz] of [[-0.9, -0.5], [0.9, -0.5], [-0.9, 0.5], [0.9, 0.5]] as const) c.vis('metal', '#3a3d3f', x + dx - 0.03, 1.0, z + dz - 0.03, x + dx + 0.03, 2.3, z + dz + 0.03);
  c.vis('metal', awning, x - 1.15, 2.3, z - 0.8, x + 1.15, 2.4, z + 0.8);
  c.vis('metal', '#f0eadc', x - 1.15, 2.2, z + 0.7, x + 1.15, 2.4, z + 0.8);
  c.prop('box_white', x - 0.4, 1.02, z, 0.2, 0.6); c.prop('box_blue', x + 0.4, 1.02, z, 0, 0.55);
}

export function buildStreet(c: Ctx): void {
  const S = STREET;
  c.setRegion('street', { kind: 'shell', building: 'street' });

  // ---- 街道：兩側騎樓地磚、街中央的標線 ----
  c.mm('tile', '#c4bba6', 106, -0.1, 38, 109, 0.03, 86);
  c.mm('tile', '#c4bba6', 117, -0.1, 38, 120, 0.03, 86);
  for (let z = 40; z < 96; z += 5) c.vis('concrete', '#d4b82a', 112.9, 0, z, 113.1, 0.02, z + 2.4);
  // ---- 騎樓頂與柱子 ----
  c.mm('concrete', '#a49f90', 106, 3.4, 38, 109, 3.7, 86);
  c.mm('concrete', '#a49f90', 117, 3.4, 38, 120, 3.7, 86);
  c.vis('concrete', '#8d887b', 108.9, 3.1, 38, 109.1, 3.4, 86);
  c.vis('concrete', '#8d887b', 116.9, 3.1, 38, 117.1, 3.4, 86);
  for (let z = 38.4; z < 86; z += 6) {
    c.mm('concrete', '#b9b4a4', 108.35, 0, z - 0.2, 108.8, 3.4, z + 0.2);
    c.mm('concrete', '#b9b4a4', 117.2, 0, z - 0.2, 117.65, 3.4, z + 0.2);
    c.vis('concrete', '#7c7769', 108.3, 0, z - 0.25, 108.85, 0.35, z + 0.25);
    c.vis('concrete', '#7c7769', 117.15, 0, z - 0.25, 117.7, 0.35, z + 0.25);
  }
  // ---- 入口牌樓 ----
  for (const x of [107.4, 118.1]) c.mm('concrete', '#8a2a22', x, 0, 35.6, x + 0.9, 6.4, 36.5);
  c.mm('concrete', '#8a2a22', 107.4, 5.6, 35.6, 119.0, 6.6, 36.5);
  c.vis('metal', '#d9a21b', 107.2, 6.6, 35.5, 119.2, 6.9, 36.6);
  c.sign({ text: '太平老街', x: 113.2, y: 6.1, z: 36.55, yaw: 0, w: 8, h: 1.3, bg: '#8a2a22', fg: '#f6d56a', font: 0.9 });
  c.sign({ text: '太平老街', x: 113.2, y: 6.1, z: 35.55, yaw: Math.PI, w: 8, h: 1.3, bg: '#8a2a22', fg: '#f6d56a', font: 0.9 });

  // ---- 兩排店屋 ----
  let n = 0;
  for (const side of ['w', 'e'] as const) {
    SHOP_Z.forEach(([za, zb], i) => { buildShop(c, side, za, zb, i, NAMES[n++]); });
  }
  // 兩排店屋之間的隔牆（延伸到騎樓外緣）已包含在各店的北南牆；最北、最南的店屋外牆補上
  // ---- 街上的小吃攤與機車 ----
  cart(c, 110.6, 45, '#c8372d'); cart(c, 115.6, 52.5, '#2f6a43'); cart(c, 110.6, 59, '#d9a21b');
  cart(c, 115.6, 67, '#2d5f9a'); cart(c, 110.6, 74, '#c8372d'); cart(c, 115.6, 81, '#2f6a43');
  const cols = ['#c8372d', '#2d5f9a', '#d8d4c4', '#2f6a43', '#1a1a1a', '#d9a21b'];
  for (const [x, z] of [[109.5, 40.5], [109.5, 48.5], [109.5, 55.5], [109.5, 63], [109.5, 71], [109.5, 78.5], [116.5, 42], [116.5, 49], [116.5, 56.5], [116.5, 63.5], [116.5, 71], [116.5, 77]] as const) {
    scooter(c, x, z, cols[Math.floor(c.rng() * cols.length)], false);
  }
  c.prop('barrels', 110.6, 0, 86.6, 0.2, 1.0); c.prop('crate', 116.0, 0, 86.8, 0.4, 1.0); c.prop('crate', 116.1, 1.0, 86.8, 0.1, 0.9);
  // 沿街的導航點
  for (let z = 40; z <= 84; z += 4.5) { c.hint(113, 0, z); c.hint(107.3, 0.03, z); c.hint(118.7, 0.03, z); }
  c.hint(113, 0, 88.6);

  // ---- 土地公廟（街的盡頭）----
  buildTemple(c);
  void S;
}

function buildShop(c: Ctx, side: 'w' | 'e', za: number, zb: number, i: number, name: string): void {
  const west = side === 'w';
  const x0 = west ? STREET.westX0 : STREET.eastX0, x1 = west ? STREET.westX1 : STREET.eastX1;
  const frontX = west ? x1 : x0;          // 面向街的牆
  const backX = west ? x0 : x1;
  const wc = west ? '#cfc6ae' : '#c9bfa6';
  const doorA = za + 4.2 + (i % 2) * 1.2;
  const front: Opening[] = [{ a: doorA, b: doorA + 1.8, h: 2.4 }];
  const back: Opening[] = (west && i === 1) ? [{ a: za + 8.4, b: za + 9.8, h: 2.3 }] : [];

  // 結構（外殼）
  c.mm('tile', '#bcb59f', x0, -0.1, za, x1, 0.03, zb);
  c.wall('z', frontX + (west ? -T / 2 : T / 2), T, za, zb, 0, SH, front, 'concrete', wc);
  c.wall('z', backX + (west ? T / 2 : -T / 2), T, za, zb, 0, SH, back, 'concrete', wc);
  c.wall('x', za + T / 2, T, x0, x1, 0, SH, [], 'concrete', wc);
  c.wall('x', zb - T / 2, T, x0, x1, 0, SH, [], 'concrete', wc);
  c.mm('concrete', '#8d887b', x0 - 0.1, SH, za - 0.1, x1 + 0.1, SH + 0.3, zb + 0.1);
  c.vis('concrete', '#8d887b', x0 - 0.1, SH + 0.3, za - 0.1, x1 + 0.1, SH + 0.9, za + 0.1);
  c.vis('concrete', '#8d887b', x0 - 0.1, SH + 0.3, zb - 0.1, x1 + 0.1, SH + 1.0, zb + 0.1);
  // 鐵捲門（拉起一半）與直式招牌、窗
  const fx = frontX + (west ? 0.02 : -0.02);
  const dir = west ? 1 : -1;
  c.vis('metal', '#9a9a8a', fx, 2.4, doorA, fx + dir * 0.1, 3.1, doorA + 1.8);
  const wz = doorA + 1.8 + 0.9;
  c.vis('metal', '#2a3a44', fx + dir * 0.0, 0.9, wz, fx + dir * 0.06, 2.3, Math.min(wz + 2.6, zb - 0.6));
  c.vis('metal', '#1f2b30', fx + dir * 0.0, 0.9, za + 0.6, fx + dir * 0.06, 2.3, doorA - 0.3);
  c.sign({ text: name, x: frontX + dir * 0.06, y: 3.0, z: (za + zb) / 2 - 1.2, yaw: west ? Math.PI / 2 : -Math.PI / 2, w: 3.6, h: 0.55, bg: ['#8a2a22', '#1d6a3a', '#173a63', '#7a5a1d'][i], fg: '#f6d56a', font: 0.85 });
  const bx = west ? 108.9 : 117.1;
  for (const [yaw, off] of [[0, 0.07], [Math.PI, -0.07]] as const) {
    c.sign({ text: name, x: bx, y: 2.2, z: doorA + 0.9 + off, yaw, w: 0.55, h: 2.2, bg: ['#c8372d', '#173a63', '#1d6a3a', '#2d2d33'][(i + (west ? 0 : 2)) % 4], fg: '#f6d56a', font: 0.7, vertical: true });
  }
  // 房頂雜物（視覺）
  c.vis('metal', '#8a8f94', x0 + 2, SH + 0.3, za + 3, x0 + 3.6, SH + 1.3, za + 4.4);
  c.vis('metal', '#8a8f94', x0 + 5, SH + 0.3, zb - 4.4, x0 + 6.6, SH + 1.3, zb - 3);
  c.zone('indoor_small', `shop_${side}${i + 1}`, x0 + T, -0.5, za + T, x1 - T, SH, zb - T);
  // 導航：門口內外
  c.doorHint('z', frontX, doorA, doorA + 1.8, 0.03, 1.2);
  if (back.length) c.doorHint('z', backX, back[0].a, back[0].b, 0.03, 1.2);

  // 室內（可見性分區）：家具只放在靠後牆的一側，門前 2.6m 與門後保持淨空
  c.within(`street_${side}_int`, { kind: 'interior', building: `street_${side}` }, () => {
    const sgn = west ? 1 : -1;
    const bx = (d: number): number => (west ? x0 + T + d : x1 - T - d); // 距後牆 d 公尺處的 x
    const iz0 = za + T, iz1 = zb - T;
    const sc = i % 4;
    const range = (a: number, b: number): [number, number] => (west ? [bx(a), bx(b)] : [bx(b), bx(a)]);
    if (sc === 0) {
      // 小吃 / 麵店：櫃檯靠北牆、兩張圓桌與紅塑膠椅
      const [a0, a1] = range(0.2, 2.6);
      c.mm('metal', '#d8dad8', a0, 0.03, iz0 + 0.3, a1, 1.0, iz0 + 1.1);
      for (const [d, dz] of [[2.4, 8.6], [5.2, 8.6]] as const) {
        const tx = bx(d), tz = za + dz;
        tableAt(c, 0.03, tx - 0.5, tz - 0.5, tx + 0.5, tz + 0.5, 0.74, '#d0c8b0');
        for (const [ox, oz] of [[-0.8, 0], [0.8, 0], [0, -0.8], [0, 0.8]] as const) chairAt(c, 0.03, tx + ox, tz + oz, '+z', '#c0392b');
      }
    } else if (sc === 1) {
      // 藥房 / 雜貨：靠後牆兩排貨架
      const [a0, a1] = range(0.3, 1.2), [b0, b1] = range(3.0, 3.9);
      shelfRow(c, 0.03, a0, iz0 + 1.2, a1, iz0 + 6.8, 1.9);
      shelfRow(c, 0.03, b0, iz0 + 1.2, b1, iz0 + 4.6, 1.9);
      const [k0, k1] = range(3.0, 5.2);
      c.mm('wood', '#6b4c2e', k0, 0.03, iz1 - 1.1, k1, 1.0, iz1 - 0.3);
    } else if (sc === 2) {
      // 五金：金屬櫃靠北南牆、油桶與木箱
      const [a0, a1] = range(0.3, 3.8);
      lockerAt(c, 0.03, a0, iz0 + 0.3, a1, iz0 + 0.8, 2.0);
      lockerAt(c, 0.03, a0, iz1 - 0.8, a1, iz1 - 0.3, 2.0);
      c.prop('barrels', bx(1.2), 0.03, za + 6.0, 0.3, 1.0); c.prop('crate', bx(1.2), 0.03, za + 7.6, 0.2, 1.0);
      const [k0, k1] = range(4.4, 6.0);
      c.mm('wood', '#6b4c2e', k0, 0.03, iz1 - 3.2, k1, 1.0, iz1 - 0.4);
    } else {
      // 電器 / 理髮：後牆櫃台與舊電視、兩張理髮椅
      const [a0, a1] = range(0.3, 1.1);
      c.mm('metal', '#6a7886', a0, 0.03, iz0 + 1.0, a1, 0.8, iz1 - 1.0);
      for (let k = 0; k < 4; k++) c.vis('metal', '#2a2f33', a0, 0.8, iz0 + 1.4 + k * 2.4, a1, 1.3, iz0 + 2.2 + k * 2.4);
      for (const dz of [3.6, 8.2]) chairAt(c, 0.03, bx(3.6), za + dz, west ? '-x' : '+x', '#3a3a44');
    }
    void sgn;
  }, 0.92);
}

function buildTemple(c: Ctx): void {
  const x0 = 108, x1 = 118, z0 = 90, z1 = 99, t = 0.4;
  const red = '#8a2a22';
  c.mm('tile', '#b9a98a', x0, -0.1, z0, x1, 0.03, z1);
  c.mm('concrete', red, x0, 0, z0, x0 + t, 3.8, z1);
  c.mm('concrete', red, x1 - t, 0, z0, x1, 3.8, z1);
  c.mm('concrete', red, x0, 0, z1 - t, x1, 3.8, z1);
  c.mm('concrete', red, x0, 0, z0, x0 + 2.6, 1.0, z0 + t);
  c.mm('concrete', red, x1 - 2.6, 0, z0, x1, 1.0, z0 + t);
  for (const x of [x0 + 2.2, x1 - 2.7]) c.mm('concrete', '#b3261e', x, 0, z0 - 0.1, x + 0.5, 3.8, z0 + 0.4);
  c.mm('concrete', red, x0, 3.8, z0, x1, 4.2, z1);
  c.vis('metal', '#2f5a3a', x0 - 0.8, 4.2, z0 - 0.8, x1 + 0.8, 4.5, z1 + 0.3);
  c.vis('metal', '#2f5a3a', x0 + 1.2, 4.5, z0 + 0.4, x1 - 1.2, 5.0, z1 - 1.2);
  c.vis('metal', '#d9a21b', x0 + 3.2, 5.0, z0 + 2.4, x1 - 3.2, 5.5, z1 - 3.2);
  c.sign({ text: '福德正神', x: 113, y: 3.3, z: z0 - 0.12, yaw: Math.PI, w: 3.2, h: 0.55, bg: '#2a1a0a', fg: '#e9c46a', font: 0.85 });
  // 供桌、香爐、金爐
  c.mm('wood', '#5a2a1a', 111, 0.03, 97.0, 115, 1.05, 98.3);
  c.vis('wood', '#d9a21b', 111.5, 1.05, 97.3, 114.5, 1.4, 98.0);
  c.cyl('metal', '#7a5a2a', 113, 0.03, 94.6, 0.45, 1.0, 10);
  c.mm('metal', '#5b432d', 116.2, 0.03, 93.0, 117.2, 1.3, 94.0);
  for (const x of [110, 112, 114, 116]) c.vis('metal', '#c8372d', x - 0.18, 3.0, 93.5, x + 0.18, 3.6, 93.9);
  c.pointLight(113, 2.4, 95, '#ff6a3a', 9, 16, 0.3);
  c.zone('indoor_small', 'old_street_temple', x0 + t, -0.5, z0 + 0.2, x1 - t, 3.8, z1 - t);
  c.hint(113, 0.03, 92.6); c.hint(110.6, 0.03, 95.6); c.hint(115.4, 0.03, 95.6); c.hint(113, 0.03, 96.0);
}
