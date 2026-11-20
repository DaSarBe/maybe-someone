import { PARK, PARK_RAMP_PIT, PARK_RAMP_STEPS, PARK_RAMP_X1, SERVICE } from './layout';
import { Ctx, flight, type Rect } from './util';

/**
 * 地下停車場（B1 -3.4、B2 -6.9）與連接排水隧道的服務隧道。
 *  - 服務隧道：從排水隧道的側室往南 37m，進入 B1 北牆
 *  - B1：柱子林立、廢棄車輛；東側有車道坡道通往地面；兩個步行樓梯通往地面
 *  - B2（西半）：從 B1 西側的坡道往下；東側有步行樓梯上 B1；西北角有金庫室
 */

const colPalette = ['#7a8a96', '#8a3a2e', '#9a9a8a', '#3a5a6e', '#5e6a50', '#a89a6a', '#6a4a6a', '#4a4a4a', '#b8b0a0'];

/** 柱子位置（B1 與 B2 共用，坡道洞口的兩根省略） */
const PILLAR_X = [-78, -69, -60, -51, -42, -33];
const PILLAR_Z = [111, 125, 139];

/** 樓梯與坡道的佔地（車輛要避開）：xz 矩形 */
const KEEP_B1: Rect[] = [
  { x0: -83.4, z0: 120.8, x1: -61.5, z1: 129.2 },   // B1→B2 坡道洞口
  { x0: -83.2, z0: 104.6, x1: -78.2, z1: 113.5 },   // PS1 底端
  { x0: -32.6, z0: 104.6, x1: -26.8, z1: 113.5 },   // PS2 底端
  { x0: -55.5, z0: 104.6, x1: -47.5, z1: 110.5 },   // 服務隧道出口
  { x0: -48.5, z0: 132.5, x1: -43.5, z1: 141 },     // PS3 頂端
  { x0: -37.0, z0: 118.5, x1: -24.6, z1: 131.5 },   // 車道坡道出入口
];
const KEEP_B2: Rect[] = [
  { x0: -83.4, z0: 120.8, x1: -61.5, z1: 129.2 },
  { x0: -48.5, z0: 131.5, x1: -43.5, z1: 141 },
  { x0: -83.4, z0: 104.6, x1: -73.8, z1: 114 },      // 金庫
];
const overlaps = (a: Rect, b: Rect, m = 0): boolean => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;

function car(c: Ctx, y: number, cx: number, cz: number, color: string, alongZ: boolean): void {
  const [sx, sz] = alongZ ? [1.9, 4.4] : [4.4, 1.9];
  c.mm('metal', color, cx - sx / 2, y + 0.22, cz - sz / 2, cx + sx / 2, y + 0.95, cz + sz / 2);
  const [cw, cl] = alongZ ? [1.7, 2.3] : [2.3, 1.7];
  c.mm('metal', color, cx - cw / 2, y + 0.95, cz - cl / 2, cx + cw / 2, y + 1.5, cz + cl / 2);
  c.vis('metal', '#1d2a33', cx - cw / 2 - 0.01, y + 1.0, cz - cl / 2 - 0.01, cx + cw / 2 + 0.01, y + 1.45, cz + cl / 2 + 0.01);
  c.col(cx - sx / 2, y, cz - sz / 2, cx + sx / 2, y + 0.22, cz + sz / 2);
  // 輪胎（視覺）
  for (const sgn of [-1, 1]) for (const o of [-1.4, 1.4]) {
    if (alongZ) c.vis('metal', '#1a1a1a', cx + sgn * 0.95 - 0.12, y, cz + o - 0.35, cx + sgn * 0.95 + 0.12, y + 0.5, cz + o + 0.35);
    else c.vis('metal', '#1a1a1a', cx + o - 0.35, y, cz + sgn * 0.95 - 0.12, cx + o + 0.35, y + 0.5, cz + sgn * 0.95 + 0.12);
  }
}

export function buildParking(c: Ctx): void {
  const { x0, x1, z0, z1, wall: w, b1, b2, roofY, slab } = PARK;
  const wc = '#74777a', fc = '#5f6263';
  const mouth = { z0: PARK.rampZ0, z1: PARK.rampZ1 };

  // ================================================================ 結構（地下，玩家在下面才畫）
  c.within('parking_u', { kind: 'underground', building: 'parking' }, () => {
    // 外牆：西、北、南 B2 深到 -7.4（x<-40）；東側 B1 深到 -3.9
    const deep = PARK.b2x1;
    c.mm('concrete', wc, x0, b2 - 0.5, z0, x0 + w, roofY, z1);                           // 西
    // 北牆（服務隧道開口 x -53..-50，y -3.4..-0.6）
    c.mm('concrete', wc, x0 + w, b2 - 0.5, z0, SERVICE.x0, roofY, z0 + w);
    c.mm('concrete', wc, SERVICE.x0, b2 - 0.5, z0, SERVICE.x1, b1, z0 + w);
    c.mm('concrete', wc, SERVICE.x0, roofY, z0, SERVICE.x1, 0, z0 + w);
    c.mm('concrete', wc, SERVICE.x1, b2 - 0.5, z0, deep, roofY, z0 + w);
    c.mm('concrete', wc, deep, b1 - slab, z0, x1, roofY, z0 + w);
    // 南牆
    c.mm('concrete', wc, x0 + w, b2 - 0.5, z1 - w, deep, roofY, z1);
    c.mm('concrete', wc, deep, b1 - slab, z1 - w, x1, roofY, z1);
    // 東牆（車道開口 z 121.5..128.5，y -3.4..-0.6）
    c.mm('concrete', wc, x1 - w, b1 - slab, z0 + w, x1, roofY, mouth.z0);
    c.mm('concrete', wc, x1 - w, b1 - slab, mouth.z1, x1, roofY, z1 - w);
    c.mm('concrete', wc, x1 - w, roofY, mouth.z0, x1, 0, mouth.z1);
    // B2 東牆（x -40.6）
    c.mm('concrete', wc, deep - w, b2 - 0.5, z0 + w, deep, b1 - slab, z1 - w);

    // B1 樓板（B1→B2 坡道洞、PS3 樓梯洞）；B2 地板
    const holeRamp: Rect = { x0: x0 + w, z0: 121.6, x1: -62.7, z1: 128.4 };
    const holePS3: Rect = { x0: -47.6, z0: 134.0, x1: -45.0, z1: 139.0 };
    c.ground('concrete', fc, { x0: x0 + w, z0: z0 + w, x1: x1 - w, z1: z1 - w }, b1, slab, [holeRamp, holePS3]);
    c.ground('concrete', '#555859', { x0: x0 + w, z0: z0 + w, x1: deep - w, z1: z1 - w }, b2, 0.5);

    // 車道坡道（B1 → 地面）：東側
    const run = PARK_RAMP_STEPS * 0.36;
    const rampV = (mouth.z0 + mouth.z1) / 2;
    const rp = flight(c, { axis: 'x', dir: 1, u: x1 - w, v: rampV, width: mouth.z1 - mouth.z0, y: b1, H: -b1, s: 'concrete', color: '#868a8c', alt: '#7e8284', steps: PARK_RAMP_STEPS });
    for (const p of rp.pts) c.hint(p.x, p.y, p.z);
    c.hint(x1 - 3.5, b1, rampV); c.hint(x1 - 8, b1, rampV - 2); c.hint(x1 - 8, b1, rampV + 2);
    void run;
    // 坡道兩側擋土牆
    const rz0 = PARK_RAMP_PIT.z0, rz1 = PARK_RAMP_PIT.z1;
    c.mm('concrete', wc, x1, b1 - 0.8, rz0, PARK_RAMP_X1, 0.9, mouth.z0);
    c.mm('concrete', wc, x1, b1 - 0.8, mouth.z1, PARK_RAMP_X1, 0.9, rz1);
    c.col(x1, 0.9, rz0, PARK_RAMP_X1, 2.3, mouth.z0);
    c.col(x1, 0.9, mouth.z1, PARK_RAMP_X1, 2.3, rz1);
    // 坡道上的導流線與警示
    for (let x = x1 + 2; x < PARK_RAMP_X1 - 2; x += 6) c.vis('concrete', '#d4b82a', x, -3.3 + ((x - x1) / run) * 3.4 * 1.0, rampV - 0.05, x + 2.5, -3.3 + ((x - x1) / run) * 3.4 + 0.012, rampV + 0.05);

    // B1 → B2 坡道（西側，往西下去）：頂在 x -62.7，底在 x -82.9
    const b2r = flight(c, { axis: 'x', dir: 1, u: -62.74 - PARK_RAMP_STEPS * 0.36 * (3.5 / 3.4) * 0 - 20.16, v: 125, width: 6.8, y: b2, H: b1 - b2, s: 'concrete', color: '#80848a', alt: '#787c82', steps: 56 });
    for (const p of b2r.pts) c.hint(p.x, p.y, p.z);
    c.hint(-61.4, b1, 123.2); c.hint(-61.4, b1, 126.8); c.hint(-84.5 + 2, b2, 125);
    // 坡道洞口的護欄（北、南兩側）
    for (const [za, zb] of [[121.2, 121.6], [128.4, 128.8]] as const) {
      c.mm('concrete', '#8a8f94', x0 + w, b1, za, -62.7, b1 + 1.0, zb);
      c.col(x0 + w, b1 + 1.0, za, -62.7, b1 + 2.2, zb);
    }
    // B2 的步行樓梯（往上到 B1）：x -46.3，bottom z=134 往 +z 上行
    const ps3 = flight(c, { axis: 'z', dir: 1, u: 134.0, v: -46.3, width: 2.6, y: b2, H: b1 - b2, s: 'concrete', color: '#868a8c', alt: '#7b7f81' });
    for (const p of ps3.pts) c.hint(p.x, p.y, p.z);
    c.hint(-46.3, b1, 141); c.hint(-46.3, b2, 132);
    // PS3 洞口的護欄（東西兩側）
    for (const [xa, xb] of [[-47.9, -47.6], [-45.0, -44.7]] as const) {
      c.mm('concrete', '#8a8f94', xa, b1, 134, xb, b1 + 1.0, 139);
      c.col(xa, b1 + 1.0, 134, xb, b1 + 2.2, 139);
    }
    c.mm('concrete', '#8a8f94', -47.6, b1, 133.6, -45.0, b1 + 1.0, 134.0);
    c.col(-47.6, b1 + 1.0, 133.6, -45.0, b1 + 2.2, 134.0);
    // 洞口附近的警示條
    c.vis('concrete', '#c9a227', -47.5, b1, 139.05, -45.1, b1 + 0.02, 139.4);
  });

  // ================================================================ 屋頂（地面）：屋頂板、樓梯口、坡道口
  c.within('parking', { kind: 'shell', building: 'parking' }, () => {
    const holes: Rect[] = [
      { x0: -81.8, z0: 106.45, x1: -79.2, z1: 111.6 },
      { x0: -30.8, z0: 106.45, x1: -28.2, z1: 111.6 },
    ];
    c.ground('concrete', '#8c8e8c', { x0, z0, x1, z1 }, 0, 0.6, holes);
    // 屋頂上的停車格線（視覺）
    for (let i = 0; i < 18; i++) c.vis('concrete', '#e8e8e0', -80 + i * 3.1, 0, 114, -79.9 + i * 3.1, 0.012, 120);
    for (let i = 0; i < 18; i++) c.vis('concrete', '#e8e8e0', -80 + i * 3.1, 0, 130, -79.9 + i * 3.1, 0.012, 136);
    // 步行樓梯（B1 → 地面）：兩個，往北上行
    for (const [sx, name] of [[-80.5, 'PS1'], [-29.5, 'PS2']] as const) {
      const f = flight(c, { axis: 'z', dir: -1, u: 111.6, v: sx, width: 2.6, y: b1, H: -b1, s: 'concrete', color: '#868a8c', alt: '#7b7f81' });
      for (const p of f.pts) c.hint(p.x, p.y, p.z);
      c.hint(sx, b1, 113.4);
      c.hint(sx, 0, 103.2);
      // 洞口三面護欄與雨棚
      c.mm('concrete', '#8a8f94', sx - 1.6, 0, 106.45, sx - 1.3, 1.0, 112.0);
      c.mm('concrete', '#8a8f94', sx + 1.3, 0, 106.45, sx + 1.6, 1.0, 112.0);
      c.mm('concrete', '#8a8f94', sx - 1.6, 0, 111.6, sx + 1.6, 1.0, 112.0);
      c.col(sx - 1.6, 1.0, 106.45, sx - 1.3, 2.2, 112.0);
      c.col(sx + 1.3, 1.0, 106.45, sx + 1.6, 2.2, 112.0);
      c.col(sx - 1.6, 1.0, 111.6, sx + 1.6, 2.2, 112.0);
      for (const px of [sx - 1.45, sx + 1.45]) c.mm('metal', '#3a3d3f', px - 0.07, 1.0, 106.5, px + 0.07, 3.0, 106.64);
      c.vis('metal', '#2f5a3a', sx - 1.7, 3.0, 106.4, sx + 1.7, 3.2, 109.4);
      c.sign({ text: 'P 停車場', x: sx, y: 3.65, z: 106.5, yaw: Math.PI, w: 2.6, h: 0.7, bg: '#173a63', fg: '#fff', font: 0.9 });
      void name;
    }
    // 車道入口的柵欄與崗亭
    c.mm('concrete', '#a9a9a2', -9, 0, 130.6, -6.6, 2.6, 133.2);
    c.vis('metal', '#2f5a3a', -9.1, 2.6, 130.5, -6.5, 2.8, 133.3);
    c.vis('metal', '#c8372d', -8.0, 1.05, 128.9, -7.95, 1.12, 130.5);
    c.sign({ text: '地下停車場 B2', x: -15, y: 3.1, z: 120.9, yaw: Math.PI, w: 5.5, h: 0.9, bg: '#173a63', fg: '#f4f0dc', font: 0.8 });
    c.mm('metal', '#3a3d3f', -17.15, 0, 120.5, -16.85, 3.6, 120.8);
    c.mm('metal', '#3a3d3f', -12.15, 0, 120.5, -11.85, 3.6, 120.8);
    c.hint(-1, 0, 125);
  });

  // ================================================================ B1 室內
  c.within('parking_b1', { kind: 'underground', building: 'parking', floor: 0 }, () => {
    const keep = KEEP_B1;
    buildLevel(c, b1, roofY, keep, 7, true);
    c.zone('tunnel', 'parking_b1', x0 + w, b1 - 0.5, z0 + w, x1 - w, roofY, z1 - w);
  }, 0.7);

  // ================================================================ B2 室內
  c.within('parking_b2', { kind: 'underground', building: 'parking', floor: 1 }, () => {
    buildLevel(c, b2, b1 - slab, KEEP_B2, 6, false);
    // 金庫室（西北角）：厚牆 + 厚重的門
    const vx1 = -74.4, vz1 = 112.0;
    c.wall('z', vx1 - 0.2, 0.4, z0 + w, vz1 + 0.2, b2, b1 - slab, [], 'concrete', '#6a6d70');
    c.wall('x', vz1, 0.4, x0 + w, vx1, b2, b1 - slab, [{ a: -79.2, b: -77.4, h: 2.4 }], 'concrete', '#6a6d70');
    c.vis('metal', '#2f3a40', -79.2, b2, vz1 + 0.1, -78.6, b2 + 2.4, vz1 + 0.3);   // 半開的金庫門
    c.mm('metal', '#2f3438', -82.8, b2, 105.4, -81.2, b2 + 1.4, 106.8);               // 保險櫃
    c.vis('metal', '#c9a227', -81.2, b2 + 0.7, 105.9, -81.14, b2 + 0.9, 106.3);
    c.mm('metal', '#4b5563', -78.0, b2, 105.2, -75.0, b2 + 2.0, 105.7);
    c.prop('crate', -76.0, b2, 109.6, 0.3, 1.0); c.prop('crate', -76.0, b2 + 1.0, 109.6, 0.6, 0.9); c.prop('barrels', -82.4, b2, 110.2, 0.2, 0.9);
    c.sign({ text: '機密 閒人勿入', x: -78.3, y: b2 + 2.7, z: vz1 + 0.22, yaw: 0, w: 2.2, h: 0.5, bg: '#b3261e', fg: '#fff', font: 0.85 });
    c.hint(-78.3, b2, 113.2); c.hint(-78.3, b2, 110.6); c.hint(-80, b2, 108); c.hint(-77, b2, 107);
    c.zone('tunnel', 'parking_b2', x0 + w, b2 - 0.5, z0 + w, PARK.b2x1 - w, b1 - slab, z1 - w);
    c.pointLight(-62, b2 + 2.4, 126, '#9fb7c6', 6, 24, 0.8);
  }, 0.5);
}

/** 一層停車場的柱子、車輛、標線、漏水與雜物 */
function buildLevel(c: Ctx, y: number, ceil: number, keep: Rect[], maxPillarX: number, isB1: boolean): void {
  const { x0, x1, z0, z1, wall: w } = PARK;
  const xMax = isB1 ? x1 - w : PARK.b2x1 - w;
  const pillars: Rect[] = [];
  for (const px of PILLAR_X) for (const pz of PILLAR_Z) {
    if (px > xMax - 0.5) continue;
    if (pz === 125 && px < -62) continue;       // 坡道洞口
    if (!isB1 && px === -78 && pz === 111) continue; // 金庫門前
    c.mm('concrete', '#8d9093', px - 0.4, y, pz - 0.4, px + 0.4, ceil, pz + 0.4);
    c.vis('concrete', '#c9a227', px - 0.42, y, pz - 0.42, px + 0.42, y + 0.5, pz + 0.42);
    pillars.push({ x0: px - 0.4, z0: pz - 0.4, x1: px + 0.4, z1: pz + 0.4 });
  }
  void maxPillarX;
  // 車輛
  const rows = [107.5, 118.5, 132.5, 144.0];
  let n = 0;
  for (const cz of rows) {
    for (let cx = x0 + 3.0; cx < xMax - 1.5; cx += 3.0) {
      if (c.rng() < 0.42) continue;
      const r: Rect = { x0: cx - 0.95, z0: cz - 2.2, x1: cx + 0.95, z1: cz + 2.2 };
      if (keep.some((k) => overlaps(r, k, 0.4)) || pillars.some((p) => overlaps(r, p, 0.5))) continue;
      car(c, y, cx, cz, colPalette[Math.floor(c.rng() * colPalette.length)], true);
      n++;
    }
  }
  void n;
  // 停車格標線（視覺）：每排車位前的細線
  for (const cz of rows) for (let cx = x0 + 1.5; cx < xMax - 1; cx += 3.0) {
    if (keep.some((k) => overlaps({ x0: cx - 0.05, z0: cz - 2.2, x1: cx + 0.05, z1: cz + 2.2 }, k, 0.2))) continue;
    c.vis('concrete', '#c8c8c0', cx - 0.04, y, cz - 2.3, cx + 0.04, y + 0.012, cz + 2.3);
  }
  // 漏水積水與油漬（純視覺）
  const puddles: [number, number, number, number][] = isB1
    ? [[-70, 114.5, 3.0, 2.2], [-45, 136, 2.4, 1.8], [-58, 129.5, 2.6, 2.0]]
    : [[-76, 118, 3.4, 2.4], [-60, 136.5, 3.0, 2.2], [-50, 114, 2.2, 1.8], [-66, 140, 2.6, 2.0]];
  for (const [px, pz, sx, sz] of puddles) c.vis('water', '#35505a', px - sx / 2, y, pz - sz / 2, px + sx / 2, y + 0.014, pz + sz / 2);
  // 雜物：油桶、紙箱、廢棄輪胎堆
  const junk: [number, number][] = isB1 ? [[-81, 142], [-26.4, 106.4], [-26.4, 144], [-65, 146.4]] : [[-82.2, 146.4], [-42, 106.2], [-72.4, 133.6]];
  junk.forEach(([jx, jz], i) => { if (i % 2) c.prop('barrels', jx, y, jz, 0.5, 1.0); else c.prop('crate', jx, y, jz, 0.3, 1.0); });
  // 牆邊的管線、通風管（視覺）
  c.vis('metal', '#5b5f60', x0 + w, ceil - 0.6, z0 + w, xMax, ceil - 0.3, z0 + w + 0.3);
  c.vis('metal', '#7a4a30', x0 + w, ceil - 0.9, z1 - w - 0.3, xMax, ceil - 0.65, z1 - w);
  for (let x = x0 + 10; x < xMax - 4; x += 12) c.vis('metal', '#e8f0d8', x - 0.6, ceil - 0.12, 125 - 0.12, x + 0.6, ceil - 0.02, 125 + 0.12);
  // 出口標誌（發綠光，視覺）
  c.sign({ text: '出口 EXIT', x: isB1 ? -28 : -47, y: y + 2.3, z: isB1 ? 105.1 : 133.6, yaw: isB1 ? 0 : Math.PI, w: 1.4, h: 0.4, bg: '#0d6b3a', fg: '#eaffea', font: 0.9 });
  c.sign({ text: isB1 ? 'B1' : 'B2', x: -41.3, y: y + 2.2, z: 104.62, yaw: 0, w: 1.0, h: 0.6, bg: '#222', fg: '#f2d64a', font: 0.9 });
}

/** 服務隧道：排水隧道的側室往南，通向 B1 北牆 */
export function buildServiceTunnel(c: Ctx): void {
  const S = SERVICE;
  const wc = '#6b6e6f', fc = '#5f6263';
  const zc = (a: number): number => a;
  c.within('service', { kind: 'underground', building: 'tunnel' }, () => {
    c.mm('concrete', fc, S.x0 - S.wall, -4.2, 67.0, S.x1 + S.wall, S.floorY, S.z1);
    c.mm('concrete', wc, S.x0 - S.wall, S.floorY, S.z0, S.x0, 0, 104);
    c.mm('concrete', wc, S.x1, S.floorY, S.z0, S.x1 + S.wall, 0, 104);
    c.mm('concrete', wc, S.x0 - S.wall, S.roofY, S.z0, S.x1 + S.wall, -0.1, 104);
    c.mm('grass', '#55803f', S.x0 - S.wall, -0.1, S.z0, S.x1 + S.wall, 0, 104);
    // 管線與支柱（視覺）
    c.vis('metal', '#5b5f60', S.x0, -1.5, S.z0, S.x0 + 0.25, -1.2, 104);
    c.vis('metal', '#7a4a30', S.x1 - 0.25, -2.0, S.z0, S.x1, -1.75, 104);
    for (let z = 74; z < 100; z += 8) {
      c.vis('concrete', '#74777a', S.x0, S.floorY, z, S.x0 + 0.35, S.roofY, z + 0.45);
      c.vis('concrete', '#74777a', S.x1 - 0.35, S.floorY, z + 4, S.x1, S.roofY, z + 4.45);
    }
    // 廢棄的推車與水漬（半擋住通道，增加掩體）
    c.mm('metal', '#4b5563', -53.0, S.floorY, 80.4, -52.2, S.floorY + 0.9, 82.0);
    c.mm('metal', '#4b5563', -50.8, S.floorY, 91.6, -50.0, S.floorY + 0.8, 93.0);
    c.vis('water', '#35505a', -52.5, S.floorY, 85, -50.5, S.floorY + 0.012, 89);
    // 沿途導航點
    for (let z = 69; z <= 103; z += 3.4) c.hint(-51.5, S.floorY, zc(z));
    c.zone('tunnel', 'service_tunnel', S.x0 - 0.2, S.floorY - 0.3, 67.0, S.x1 + 0.2, S.roofY, 104.8);
  }, 0.62);
}
