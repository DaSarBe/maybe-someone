import { ARRIVALS, ENEMY_SPAWNS, EVAC_POINTS, LOOT_SPOTS } from './data';
import { CT, GUARD, OFFICE, SHOP } from './layout';
import type { P3 } from './navTools';
import { YARD, rowZ } from './yard';

/** 導航圖產生時強制入選的點：門口、樓梯兩端、貨櫃頂鐵板橋，加上所有資料點位（抵達點排最前面，第一個是連通的根） */

const yardBridges = (): P3[] => {
  const out: P3[] = [];
  for (let b = 0; b < 4; b++) {
    for (const row of [0, 1] as const) {
      const [z0, z1] = rowZ(b, row);
      for (let col = 0; col < 3; col++) {
        const L = YARD.levels[b][col][row];
        if (L < 1 || L !== YARD.levels[b][col + 1][row]) continue;
        const top = L * CT.h;
        const gapX = YARD.colX[col] + CT.len + 1;
        const z = (z0 + z1) / 2;
        out.push({ x: gapX - 2.2, y: top, z }, { x: gapX, y: top + 0.03, z }, { x: gapX + 2.2, y: top, z });
      }
    }
  }
  return out;
};

export const NAV_DOORS: P3[] = [
  // 倉庫四個門（內外）
  { x: 15, y: 0, z: -41.5 }, { x: 15, y: 0, z: -46 }, { x: 28, y: 0, z: -14.5 }, { x: 28, y: 0, z: -9.5 },
  { x: 8.5, y: 0, z: -27 }, { x: 3.5, y: 0, z: -27 }, { x: 43.5, y: 0, z: -21 }, { x: 48.5, y: 0, z: -21 },
  // 辦公室外門與內門
  { x: -16, y: 0.03, z: 44.5 }, { x: -16, y: 0, z: 48.5 }, { x: -20.5, y: 0.03, z: 36.25 }, { x: -24.5, y: 0, z: 36.25 }, { x: 2.5, y: 0.03, z: 36.25 }, { x: 6.5, y: 0, z: 36.25 },
  ...[-18, -9, -1].flatMap((x) => [{ x, y: 0.03, z: 33.2 }, { x, y: 0.03, z: 36.5 }]),
  ...[-17, -7, 1].flatMap((x) => [{ x, y: 0.03, z: 37.6 }, { x, y: 0.03, z: 39.8 }]),
  // 警衛室、加油站商店、貨櫃屋
  { x: 10, y: 0, z: 84.6 }, { x: 13.5, y: 0.03, z: 84.6 }, { x: 65, y: 0, z: 22.5 }, { x: 65, y: 0.03, z: 26 }, { x: 85, y: 0, z: 67.2 }, { x: 85, y: 0, z: 64.4 },
  // 樓梯的底端與頂端（平台中心）
  { x: -47, y: 0, z: -44.8 }, { x: -36.7, y: 5, z: -44.8 }, { x: -6, y: 0, z: -26.3 }, { x: -15.8, y: 5, z: -26.3 }, { x: -60.5, y: 0, z: -8.8 }, { x: -50.7, y: 5, z: -8.8 },
  { x: -5.5, y: 0, z: -2.3 }, { x: -15.2, y: 5, z: -2.3 }, { x: -60.5, y: 0, z: -20.8 }, { x: -54.5, y: 2.5, z: -20.8 }, { x: -32.5, y: 5, z: -42.2 }, { x: -26.5, y: 7.5, z: -42.2 }, { x: -31, y: 5, z: -43.45 }, { x: -28.5, y: 5, z: -43.45 }, { x: -26, y: 5, z: -43.45 },
  { x: -46.8, y: 0, z: -8.8 }, { x: -40.6, y: 2.5, z: -8.8 },
  { x: 7, y: 0, z: -36.5 }, { x: 16, y: 4, z: -36.5 }, { x: 45, y: 0, z: -36.5 }, { x: 36, y: 4, z: -36.5 },
  { x: -20, y: 0.02, z: -52.5 }, { x: -20, y: 3.2, z: -62.5 }, { x: -20, y: 3.2, z: -67 },
  { x: -72, y: -3.4, z: 61 }, { x: -82, y: 0, z: 61 }, { x: -33, y: -3.4, z: 61 }, { x: -22, y: 0, z: 61 },
  { x: 0.3, y: 3.2, z: -66.8 }, { x: 0.3, y: 3.2, z: -72 }, { x: 0.3, y: 3.2, z: -78 },
  { x: -26.5, y: 7.5, z: -40.32 }, { x: -23.5, y: 7.5, z: -40.32 }, { x: -12, y: 7.5, z: -40.32 },
  ...yardBridges(),
];

/** 房間內部較密的區域（節點間距 2.4m），小房間才走得進去 */
export const NAV_DENSE = [
  { x0: OFFICE.x0, z0: OFFICE.z0, x1: OFFICE.x1, z1: OFFICE.z1 },
  { x0: GUARD.x0, z0: GUARD.z0, x1: GUARD.x1, z1: GUARD.z1 },
  { x0: SHOP.x0, z0: SHOP.z0, x1: SHOP.x1, z1: SHOP.z1 },
  { x0: -56, z0: 58, x1: -47, z1: 68 },
];

export const NAV_FORCED: P3[] = [
  ...ARRIVALS.map((a) => a.position),
  ...EVAC_POINTS.map((e) => e.position),
  ...LOOT_SPOTS.map((l) => l.position),
  ...ENEMY_SPAWNS.flatMap((e) => [e.position, ...(e.patrol ?? [])]),
  { x: 51, y: 0.03, z: 51.6 }, // 商人攤位前
  ...NAV_DOORS,
];
