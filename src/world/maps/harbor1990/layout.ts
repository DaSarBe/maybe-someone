import type { Rect } from './util';

/** 陸地範圍（海在 z < -64 的北側）。x 向東，z 向南，y 向上。 */
export const LAND: Rect = { x0: -130, z0: -64, x1: 130, z1: 166 };

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

/** 通往地下停車場的服務隧道（從排水隧道的側室往南） */
export const SERVICE = { x0: -53, x1: -50, wall: 0.6, z0: 67.6, z1: 104.6, floorY: -3.4, roofY: -0.8 } as const;
export const SERVICE_PIT: Rect = { x0: SERVICE.x0 - SERVICE.wall, z0: SERVICE.z0, x1: SERVICE.x1 + SERVICE.wall, z1: 104 };

/** 地下停車場：B1 -3.4、B2 -6.9；B2 只在西側 x < -40 */
export const PARK = {
  x0: -84, x1: -24, z0: 104, z1: 148, wall: 0.6,
  b1: -3.4, b2: -6.9, roofY: -0.6, slab: 0.5, b2x1: -40,
  /** 地面入口坡道（往東上到地面） */
  rampZ0: 121.5, rampZ1: 128.5,
} as const;
export const PARK_PIT: Rect = { x0: PARK.x0, z0: PARK.z0, x1: PARK.x1, z1: PARK.z1 };
/** 坡道頂端（地面）x */
export const PARK_RAMP_STEPS = 56;
export const PARK_RAMP_X1 = PARK.x1 - 0.6 + PARK_RAMP_STEPS * 0.36;
export const PARK_RAMP_PIT: Rect = { x0: PARK.x1, z0: PARK.rampZ0 - 0.6, x1: PARK_RAMP_X1, z1: PARK.rampZ1 + 0.6 };


/** 貨櫃尺寸（公尺）：40 呎櫃 */
export const CT = { len: 12, wid: 2.44, h: 2.5, roof: 0.06 } as const;

export const DECK_Y = 3.2;

/** 倉庫 */
export const WH = { x0: 6, x1: 46, z0: -44, z1: -12, wallH: 11.5, t: 0.4, mezzY: 4.0, topY: 8.0 } as const;

/** 辦公室 */
export const OFFICE = { x0: -22, x1: 4, z0: 28, z1: 46, h: 3.0, t: 0.3 } as const;

/** 警衛室 */
export const GUARD = { x0: 12, x1: 20, z0: 82, z1: 88, h: 3.0, t: 0.3 } as const;

/** 加油站商店 */
export const SHOP = { x0: 58, x1: 74, z0: 24, z1: 31, h: 3.0, t: 0.3 } as const;

/** 魚市場 */
export const MARKET = { x0: 34, x1: 68, z0: 34, z1: 66, roofY: 4.4 } as const;

export const WALL_T = 0.4;

/** 海順海運大樓：5 層 + 頂樓。地板高度 floorY(k)，k = 0..5（5 = 頂樓） */
export const TOWER = { x0: 100, x1: 124, z0: -6, z1: 16, t: 0.4, H: 3.8, slab: 0.4 } as const;
export const floorY = (k: number): number => 0.03 + TOWER.H * k;
/** 樓梯間（西北角）與電梯井（西南）的內部範圍 */
export const TOWER_CORE = { x0: 100.4, x1: 104.8, z0: -5.6, z1: 2.4, v: 100.4, w: 2.1, u: -0.52 } as const;
export const TOWER_SHAFT = { x0: 100.4, x1: 104.0, z0: 5.6, z1: 9.2 } as const;

/** 貨船（和 dock.ts 的 buildShip 共用）：船身 x -42..2、z -80.8..-64.6，甲板 3.2 */
export const SHIP = {
  x0: -42, x1: 2, z0: -80.8, z1: -64.6, wall: 0.5,
  bottom: -3.9, hold: -2.9, cabin: 0.3, deck: 3.2,
  /** 艙壁（貨艙 / 船尾）位置 */
  bulkhead: -15.8,
} as const;

/** 鐵道貨運站（東北）：x 94..130, z -62..-26 */
export const RAIL = { x0: 94, x1: 130, z0: -62, z1: -26, tracks: [-57, -50, -43] as const, platformZ0: -41.2, platformZ1: -38.4, platformY: 1.1 } as const;

/** 台式老街（東南）：街道 x 109..117 往南，兩側是騎樓店屋 */
export const STREET = { z0: 38, z1: 98, sx0: 109, sx1: 117, westX0: 96, westX1: 106, eastX0: 120, eastX1: 130, arcadeW: 3 } as const;

/** 修船廠乾塢（西側）：往下 6m 的大坑 */
export const DOCK = { x0: -124, x1: -98, z0: 8, z1: 26, depth: 6, wall: 0.7 } as const;
export const DOCK_PIT: Rect = { x0: DOCK.x0, z0: DOCK.z0, x1: DOCK.x1, z1: DOCK.z1 };

export const GROUND_HOLES: Rect[] = [POOL, TUNNEL_PIT, TUNNEL_ALCOVE_PIT, SERVICE_PIT, PARK_PIT, PARK_RAMP_PIT, DOCK_PIT];
