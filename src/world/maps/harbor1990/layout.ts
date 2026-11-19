import type { Rect } from './util';

/** 陸地範圍（海在 z < -64 的北側）。x 向東，z 向南，y 向上。 */
export const LAND: Rect = { x0: -92, z0: -64, x1: 92, z1: 92 };

/** 北岸淺水池（沙灘上的潮間帶） */
export const POOL: Rect = { x0: -92, z0: -64, x1: -76, z1: -44 };

/** 排水隧道（地下 -3.4m）：主體 + 兩端的樓梯井 + 側室 */
export const TUNNEL = {
  floorY: -3.4,
  roofY: -0.8,
  /** 有屋頂的隧道本體 x 範圍 */
  x0: -73, x1: -31,
  /** 內寬（z） */
  z0: 58.8, z1: 63.2,
  wall: 0.6,
  /** 側室 */
  alcove: { x0: -55, x1: -48, z0: 63.2, z1: 67 },
  stairW: { x: -73, steps: 17, rise: 0.2, depth: 0.4 },
  stairE: { x: -31, steps: 17, rise: 0.2, depth: 0.4 },
} as const;
export const TUNNEL_PIT: Rect = { x0: -80.6, z0: 58.2, x1: -23.8, z1: 63.8 };
export const TUNNEL_ALCOVE_PIT: Rect = { x0: -55.6, z0: 63.8, x1: -47.4, z1: 67.6 };

export const GROUND_HOLES: Rect[] = [POOL, TUNNEL_PIT, TUNNEL_ALCOVE_PIT];

/** 貨櫃尺寸（公尺）：40 呎櫃 */
export const CT = { len: 12, wid: 2.44, h: 2.5, roof: 0.06 } as const;

export const DECK_Y = 3.2;

/** 倉庫 */
export const WH = { x0: 6, x1: 46, z0: -44, z1: -12, wallH: 8, t: 0.4, mezzY: 4.0 } as const;

/** 辦公室 */
export const OFFICE = { x0: -22, x1: 4, z0: 28, z1: 46, h: 3.0, t: 0.3 } as const;

/** 警衛室 */
export const GUARD = { x0: 12, x1: 20, z0: 82, z1: 88, h: 3.0, t: 0.3 } as const;

/** 加油站商店 */
export const SHOP = { x0: 58, x1: 74, z0: 24, z1: 31, h: 3.0, t: 0.3 } as const;

/** 魚市場 */
export const MARKET = { x0: 34, x1: 68, z0: 34, z1: 66, roofY: 4.4 } as const;

export const WALL_T = 0.4;
