import { Ctx } from './util';
import { container } from './yard';

/** 中央廣場與南側空地：路面標線、路燈、水泥護欄、廢棄車輛、散落的貨櫃（提供掩體） */
export function buildExtras(c: Ctx): void {
  // ---- 路面標線（視覺）----
  for (let x = -62; x < 50; x += 6) c.vis('concrete', '#d4b82a', x, 0, 16.9, x + 3, 0.03, 17.1);
  c.vis('concrete', '#e8e8e0', -62, 0, 11.9, 52, 0.03, 12.05);
  c.vis('concrete', '#e8e8e0', -62, 0, 21.95, 52, 0.03, 22.1);
  for (let z = 58; z < 90; z += 5) c.vis('concrete', '#d4b82a', 4.9, 0, z, 5.1, 0.03, z + 2.5);
  // 停車格
  for (let i = 0; i < 6; i++) c.vis('concrete', '#e8e8e0', 24 + i * 3.2, 0, 5, 24.1 + i * 3.2, 0.03, 10);

  // ---- 路燈 ----
  for (const [x, z] of [[-45, 13], [-20, 13], [5, 13], [30, 13], [-45, 21], [-8, 21], [25, 21], [46, 70], [30, 90 - 12]] as const) {
    c.mm('metal', '#4a4f50', x - 0.15, 0, z - 0.15, x + 0.15, 8, z + 0.15);
    c.vis('metal', '#4a4f50', x - 0.15, 7.8, z - 0.15, x + 1.3, 8.05, z + 0.15);
    c.vis('metal', '#f0e2a0', x + 0.8, 7.7, z - 0.3, x + 1.5, 7.8, z + 0.3);
  }

  // ---- 水泥護欄（New Jersey barrier）----
  const barrier = (x: number, z: number, alongX = true): void => {
    if (alongX) { c.mm('concrete', '#a9a9a2', x, 0, z, x + 3, 0.5, z + 0.6); c.mm('concrete', '#a9a9a2', x + 0.05, 0.5, z + 0.12, x + 2.95, 0.85, z + 0.48); }
    else { c.mm('concrete', '#a9a9a2', x, 0, z, x + 0.6, 0.5, z + 3); c.mm('concrete', '#a9a9a2', x + 0.12, 0.5, z + 0.05, x + 0.48, 0.85, z + 2.95); }
  };
  barrier(-36, 9); barrier(-33, 9); barrier(-12, 24, false); barrier(12, 8); barrier(36, 16); barrier(-8, 6); barrier(42, 2, false);
  barrier(30, -9); barrier(33, -9); barrier(70, 40, false); barrier(-60, 30); barrier(10, 62, false); barrier(-14, 64);

  // ---- 廢棄車輛（方塊拼成）----
  const car = (x: number, z: number, color: string, alongX = true): void => {
    const [bx, bz] = alongX ? [4.4, 1.9] : [1.9, 4.4];
    c.mm('metal', color, x, 0.25, z, x + bx, 1.0, z + bz);
    const [cx0, cz0, cx1, cz1] = alongX ? [x + 0.9, z + 0.1, x + 3.2, z + bz - 0.1] : [x + 0.1, z + 0.9, x + bz - 0.1, z + 3.2];
    c.mm('metal', color, cx0, 1.0, cz0, cx1, 1.55, cz1);
    c.vis('metal', '#1d2a33', alongX ? cx0 : cx0 - 0.02, 1.05, alongX ? cz0 - 0.02 : cz0, alongX ? cx1 : cx1 + 0.02, 1.5, alongX ? cz1 + 0.02 : cz1);
    c.vis('metal', '#1a1a1a', x + 0.2, 0, z + 0.1, x + 0.9, 0.5, z + bz - 0.1);
    c.vis('metal', '#1a1a1a', alongX ? x + bx - 0.9 : x + 0.2, 0, alongX ? z + 0.1 : z + bz - 0.9, alongX ? x + bx - 0.2 : x + bx - 0.1, 0.5, alongX ? z + bz - 0.1 : z + bz - 0.2);
  };
  car(-52, 14, '#7a8a96'); car(-30, 23, '#8a3a2e'); car(18, 14.5, '#9a9a8a'); car(41, 8, '#3a5a6e', false); car(-58, 80, '#5e6a50'); car(60, 66, '#a89a6a'); car(34, 24.5, '#6a4a6a');

  // ---- 南側空地散落的貨櫃（單層，當作掩體）----
  const cols = ['#9c3b2e', '#2f5d7c', '#b08a2e', '#4f7a45', '#7c7f83', '#c46a2c'];
  container(c, 24, 0, 70, cols[0], false);
  container(c, 36, 0, 74, cols[1], true);
  container(c, 26, 0, 84.5, cols[2], true);
  container(c, 44, 0, 76, cols[3], false);
  container(c, 50, 0, 70, cols[4], true);
  container(c, 62, 0, 78, cols[5], false); // 雙層疊放
  container(c, 62, 2.5, 78, cols[3], false);
  // 公車站亭（視覺 + 柱子碰撞）
  c.mm('metal', '#4a6f8a', 14, 3, 25, 19, 3.2, 27.5);
  for (const x of [14.2, 18.7]) c.mm('metal', '#3a444c', x - 0.1, 0, 25.2, x + 0.1, 3, 25.4);
  c.mm('wood', '#8a6a42', 14.6, 0, 26.6, 18.4, 0.5, 27.2);
  c.sign({ text: '港區交通車', x: 16.5, y: 2.6, z: 25.05, yaw: Math.PI, w: 4.4, h: 0.5, bg: '#1d6a3a', fg: '#fff', font: 0.8 });
}
