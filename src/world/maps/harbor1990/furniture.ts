import type { Ctx } from './util';

/** 室內家具（可放在任何樓層：y 為該層地板高度）。碰撞用簡單方塊，細節是純視覺。 */

export type Face = '+x' | '-x' | '+z' | '-z';

export function deskAt(c: Ctx, y: number, x: number, z: number, w = 1.6, d = 0.8, along: 'x' | 'z' = 'x', color = '#7a5a3a'): void {
  const [sx, sz] = along === 'x' ? [w, d] : [d, w];
  c.mm('wood', color, x - sx / 2, y, z - sz / 2, x + sx / 2, y + 0.75, z + sz / 2);
  c.vis('wood', '#a98458', x - sx / 2 - 0.02, y + 0.75, z - sz / 2 - 0.02, x + sx / 2 + 0.02, y + 0.81, z + sz / 2 + 0.02);
  // 桌上的顯示器（純視覺）
  c.vis('metal', '#2a2f33', x - 0.25, y + 0.81, z - 0.1, x + 0.25, y + 1.15, z + 0.1);
}

export function chairAt(c: Ctx, y: number, x: number, z: number, facing: Face = '+z', color = '#34495e'): void {
  c.mm('wood', color, x - 0.22, y, z - 0.22, x + 0.22, y + 0.45, z + 0.22);
  const bx = facing === '+x' ? -0.22 : facing === '-x' ? 0.2 : 0, bz = facing === '+z' ? -0.22 : facing === '-z' ? 0.2 : 0;
  const bsx = facing === '+x' || facing === '-x' ? 0.04 : 0.44, bsz = facing === '+z' || facing === '-z' ? 0.04 : 0.44;
  c.vis('wood', color, x + bx - bsx / 2, y + 0.45, z + bz - bsz / 2, x + bx + bsx / 2, y + 0.9, z + bz + bsz / 2);
}

/** 金屬置物櫃 / 檔案櫃 */
export function lockerAt(c: Ctx, y: number, x0: number, z0: number, x1: number, z1: number, h = 1.9, color = '#6a7886'): void {
  c.mm('metal', color, x0, y, z0, x1, y + h, z1);
  const horiz = x1 - x0 > z1 - z0;
  const n = Math.max(1, Math.round((horiz ? x1 - x0 : z1 - z0) / 0.5));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (horiz) c.vis('metal', '#3e4750', x0 + (x1 - x0) * t - 0.01, y + 0.05, z0 - 0.015, x0 + (x1 - x0) * t + 0.01, y + h - 0.05, z0);
    else c.vis('metal', '#3e4750', x0 - 0.015, y + 0.05, z0 + (z1 - z0) * t - 0.01, x0, y + h - 0.05, z0 + (z1 - z0) * t + 0.01);
  }
}

/** 檔案架：鐵架 + 紙箱檔案（視覺） */
export function shelfRow(c: Ctx, y: number, x0: number, z0: number, x1: number, z1: number, h = 2.2): void {
  c.mm('metal', '#4b5563', x0, y, z0, x1, y + h, z1);
  for (let k = 0; k < 4; k++) {
    const yy = y + 0.25 + k * 0.5;
    c.vis('wood', k % 2 ? '#a58a64' : '#b99b6c', x0 - 0.04, yy, z0 + 0.04, x1 + 0.04, yy + 0.32, z1 - 0.04);
  }
}

export function sofaAt(c: Ctx, y: number, x0: number, z0: number, x1: number, z1: number, color = '#4a3a3a'): void {
  c.mm('carpet', color, x0, y, z0, x1, y + 0.45, z1);
  const horiz = x1 - x0 > z1 - z0;
  if (horiz) c.vis('carpet', color, x0, y + 0.45, z0, x1, y + 0.85, z0 + 0.25);
  else c.vis('carpet', color, x0, y + 0.45, z0, x0 + 0.25, y + 0.85, z1);
}

export function tableAt(c: Ctx, y: number, x0: number, z0: number, x1: number, z1: number, h = 0.75, color = '#7a5a3a'): void {
  c.mm('wood', color, x0, y, z0, x1, y + h, z1);
}

/** 上下鋪（沿 x 軸排列，z 方向是寬） */
export function bunkAt(c: Ctx, y: number, x0: number, z0: number, len = 2.0, wid = 0.9): void {
  c.mm('metal', '#4b5563', x0, y, z0, x0 + 0.08, y + 1.9, z0 + wid);
  c.mm('metal', '#4b5563', x0 + len - 0.08, y, z0, x0 + len, y + 1.9, z0 + wid);
  c.mm('wood', '#8a7a62', x0, y + 0.35, z0, x0 + len, y + 0.5, z0 + wid);
  c.mm('wood', '#8a7a62', x0, y + 1.25, z0, x0 + len, y + 1.4, z0 + wid);
  c.vis('carpet', '#5d6d7e', x0 + 0.1, y + 0.5, z0 + 0.05, x0 + len - 0.1, y + 0.62, z0 + wid - 0.05);
  c.vis('carpet', '#7e5d5d', x0 + 0.1, y + 1.4, z0 + 0.05, x0 + len - 0.1, y + 1.52, z0 + wid - 0.05);
}
