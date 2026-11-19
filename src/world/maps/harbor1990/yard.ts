import { CT } from './layout';
import { Ctx, climb } from './util';

/** 貨櫃堆場：4 欄 × 4 組，每組南北兩排貨櫃，貨櫃可疊到 3 層。 */
export const YARD = {
  colX: [-60, -46, -32, -18] as const,
  blockZ: [-44, -32, -20, -8] as const,
  /** 每組每欄的層數：[北排, 南排]，0 = 空位 */
  levels: [
    [[2, 2], [2, 2], [2, 3], [2, 3]],
    [[2, 2], [0, 0], [2, 2], [2, 2]],
    [[1, 1], [3, 3], [0, 0], [2, 2]],
    [[2, 2], [1, 1], [1, 1], [2, 2]],
  ] as const,
};

/** 取得某排貨櫃的 z 範圍 */
export function rowZ(block: number, row: 0 | 1): [number, number] {
  const z0 = YARD.blockZ[block];
  return row === 0 ? [z0, z0 + CT.wid] : [z0 + CT.wid + 0.02, z0 + CT.wid * 2 + 0.02];
}
/** 貨櫃頂的高度 */
export function stackTop(block: number, col: number, row: 0 | 1): number {
  return YARD.levels[block][col][row] * CT.h;
}

const PALETTE = ['#9c3b2e', '#2f5d7c', '#4f7a45', '#b08a2e', '#7c7f83', '#c46a2c', '#3a6b6b', '#8a4b6a', '#a4a07a', '#5c3a2a'];

export function container(c: Ctx, x0: number, y0: number, z0: number, color: string, alongX = true): void {
  const [sx, sz] = alongX ? [CT.len, CT.wid] : [CT.wid, CT.len];
  c.mm('metal', color, x0, y0, z0, x0 + sx, y0 + CT.h - CT.roof, z0 + sz);
  c.mm('metal_hollow', '#5d6062', x0, y0 + CT.h - CT.roof, z0, x0 + sx, y0 + CT.h, z0 + sz);
  // 門端的黑色鎖桿（視覺）
  if (alongX) c.vis('metal', '#2b2d2e', x0 + sx, y0 + 0.2, z0 + 0.2, x0 + sx + 0.05, y0 + CT.h - 0.2, z0 + sz - 0.2);
  else c.vis('metal', '#2b2d2e', x0 + 0.2, y0 + 0.2, z0 + sz, x0 + sx - 0.2, y0 + CT.h - 0.2, z0 + sz + 0.05);
}

export function buildYard(c: Ctx): void {
  const pick = (): string => PALETTE[Math.floor(c.rng() * PALETTE.length)];
  for (let b = 0; b < 4; b++) {
    for (let col = 0; col < 4; col++) {
      for (const row of [0, 1] as const) {
        const L = YARD.levels[b][col][row];
        const [z0] = rowZ(b, row);
        for (let l = 0; l < L; l++) container(c, YARD.colX[col], l * CT.h, z0, pick());
      }
    }
  }
  // 同高度相鄰貨櫃頂之間的鐵板橋（跨過 2m 的縱向走道）
  for (let b = 0; b < 4; b++) {
    for (const row of [0, 1] as const) {
      const [z0, z1] = rowZ(b, row);
      const zc = (z0 + z1) / 2;
      for (let col = 0; col < 3; col++) {
        const L = YARD.levels[b][col][row];
        if (L < 1 || L !== YARD.levels[b][col + 1][row]) continue;
        const top = L * CT.h;
        const xa = YARD.colX[col] + CT.len - 0.3, xb = YARD.colX[col + 1] + 0.3;
        c.mm('metal_grate', '#87939b', xa, top - 0.1, zc - 0.7, xb, top + 0.03, zc + 0.7);
      }
    }
  }

  // ---- 爬貨櫃頂的鐵梯（貼著貨櫃側面向上，頂端平台與貨櫃頂等高）----
  const G = '#8a959c', P = '#7d878e';
  climb(c, 'metal_grate', G, P, -45.5, 0, -44.8, '+x', 1.6, 5.0);
  climb(c, 'metal_grate', G, P, -7, 0, -26.3, '-x', 1.6, 5.0);
  climb(c, 'metal_grate', G, P, -59.5, 0, -8.8, '+x', 1.6, 5.0);
  climb(c, 'metal_grate', G, P, -6.5, 0, -2.3, '-x', 1.6, 5.0);
  climb(c, 'metal_grate', G, P, -59.5, 0, -20.8, '+x', 1.6, 2.5);
  climb(c, 'metal_grate', G, P, -45.5, 0, -8.8, '+x', 1.6, 2.5);
  climb(c, 'metal_grate', G, P, -31.5, 5.0, -42.2, '+x', 1.3, 2.5);
  // 貨櫃頂上的小圍欄（視覺）
  c.vis('metal', '#c9a227', -36, 5.0, -44.05, -34.2, 5.9, -44.0);

  // ---- 走道上的雜物 ----
  const crate = (x: number, z: number, s = 1.0, y = 0, yaw = 0): void => c.prop('crate', x, y, z, yaw, s);
  crate(-54, -38.3, 1.1, 0, 0.3); crate(-52.8, -38.4, 1.0, 0, 0.1); c.prop('barrels', -38, 0, -38.2, 0.4, 1.0);
  crate(-24, -38.4, 1.2); crate(-24, -38.4, 1.0, 1.2, 0.5); c.prop('barrels', -12, 0, -38.2, 0, 1.0);
  crate(-45, -22.2, 1.1); c.prop('barrels', -30, 0, -26.5, 0.7, 1.0); crate(-28, -21.5, 1.0, 0, 0.4); crate(-14.5, -21.5, 1.1);
  crate(-40, -14.3, 1.1); crate(-38.8, -14.3, 1.0, 0, 0.2); c.prop('barrel', -24, 0, -9.2, 0, 0.95);
  crate(-40, -1.2, 1.2); c.prop('generator', -52, 0, 0.2, 0.1, 1.0); c.prop('barrels', -30, 0, 1.2, 0.2, 1.0);
  crate(-22, 1, 1.0);

  // 路燈（高桿，頂端有燈罩）
  for (const [x, z] of [[-47, -35.5], [-19, -35.5], [-47, -11.5], [-19, -11.5]] as const) {
    c.mm('metal', '#4a4f50', x - 0.15, 0, z - 0.15, x + 0.15, 9, z + 0.15);
    c.vis('metal', '#e8d98a', x - 0.7, 9, z - 0.35, x + 0.7, 9.25, z + 0.35);
  }
  c.sign({ text: '禁止吸菸', x: -42, y: 1.6, z: -39.07, yaw: 0, w: 3, h: 1, bg: '#b3261e', fg: '#ffffff', font: 0.9 });
  c.sign({ text: '2 號堆場', x: -60.02, y: 3.4, z: -41.5, yaw: -Math.PI / 2, w: 4, h: 1, bg: '#1d2f45', fg: '#ffffff', font: 0.85 });
}
