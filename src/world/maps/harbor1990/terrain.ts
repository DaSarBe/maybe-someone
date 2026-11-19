import { GROUND_HOLES, LAND, POOL, TUNNEL, TUNNEL_ALCOVE_PIT, TUNNEL_PIT } from './layout';
import { Ctx, subtractRects, type Rect } from './util';

const R = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 });
const OVERLAY_TOP = 0.02;

/** 基底水泥地 + 各區地面材質 + 圍牆 + 隧道與水池 */
export function buildTerrain(c: Ctx): void {
  // 基底（水泥），挖掉水池與隧道
  c.ground('concrete', '#9a9c9a', LAND, 0, 2.0, GROUND_HOLES);

  const overlay = (s: Parameters<Ctx['ground']>[0], color: string, r: Rect): void =>
    c.ground(s, color, r, OVERLAY_TOP, 0.1, GROUND_HOLES);

  overlay('sand', '#cbb88a', R(-92, -64, -66, -20));
  overlay('wood', '#9b7a55', R(-62, -64, 62, -50));
  overlay('grass', '#4f7a43', R(-92, -20, -66, 92));
  overlay('grass', '#55803f', R(-66, 52, -30, 92));
  overlay('grass', '#5b8444', R(-30, 56, -2, 92));
  overlay('gravel', '#7a746c', R(52, -50, 92, -20));
  overlay('dirt', '#6f5236', R(52, -20, 92, 6));
  overlay('dirt', '#73563a', R(78, 6, 92, 92));
  overlay('dirt', '#6a4e33', R(-66, 4, -50, 30));
  // 倉庫外的碎石小徑
  overlay('gravel', '#756f66', R(46, -44, 52, -12));

  // ---- 淺水池 ----
  c.mm('water', '#3f7f8f', POOL.x0, -2, POOL.z0, POOL.x1, -0.28, POOL.z1);
  c.mm('sand', '#b8a577', POOL.x0, -2.6, POOL.z0, POOL.x1, -2, POOL.z1);

  // ---- 圍牆（視覺 + 碰撞）與海岸隱形牆 ----
  const wallC = '#8a877d';
  c.mm('concrete', wallC, -92, -1, -64, -91.6, 3.6, 92);
  c.mm('concrete', wallC, 91.6, -1, -64, 92, 3.6, 92);
  c.mm('concrete', wallC, -92, -1, 91.6, 92, 3.6, 92);
  c.col(-92, 3.6, -64, -91.6, 8, 92);
  c.col(91.6, 3.6, -64, 92, 8, 92);
  c.col(-92, 3.6, 91.6, 92, 8, 92);
  // 海邊：看不見的牆，擋住下水
  c.col(-92, -3, -64.5, 92, 3.0, -64);
  // 圍牆上緣的鐵絲網（純視覺）
  c.vis('metal', '#3b3f40', -92, 3.6, -64, -91.9, 4.4, 92);
  c.vis('metal', '#3b3f40', 91.9, 3.6, -64, 92, 4.4, 92);
  c.vis('metal', '#3b3f40', -92, 3.6, 91.9, 92, 4.4, 92);

  buildTunnel(c);
}

function buildTunnel(c: Ctx): void {
  const T = TUNNEL;
  const pit = TUNNEL_PIT, alc = TUNNEL_ALCOVE_PIT;
  const wc = '#6b6e6f', fc = '#5f6263';
  const groove = R(T.x0 + 1, 60.2, T.x1 - 1, 61.8);

  // 地板（中間挖一條排水溝，裡面是淺水）
  for (const p of subtractRects(pit, [groove])) c.mm('concrete', fc, p.x0, -4.2, p.z0, p.x1, T.floorY, p.z1);
  c.mm('concrete', fc, alc.x0, -4.2, alc.z0, alc.x1, T.floorY, alc.z1);
  c.mm('water', '#35606a', groove.x0, -4.2, groove.z0, groove.x1, -3.52, groove.z1);

  // 牆：隧道本體高到地面，樓梯井段高出地面 0.9m 當護欄
  const wallZ = (z0: number, z1: number, xa: number, xb: number, top: number): void => c.mm('concrete', wc, xa, T.floorY, z0, xb, top, z1);
  for (const [z0, z1] of [[pit.z0, pit.z0 + T.wall], [pit.z1 - T.wall, pit.z1]] as const) {
    const south = z0 > 60;
    // 本體段
    if (!south) wallZ(z0, z1, T.x0, T.x1, 0);
    else {
      wallZ(z0, z1, T.x0, alc.x0, 0);
      wallZ(z0, z1, alc.x1, T.x1, 0);
    }
    // 兩端樓梯井護欄
    wallZ(z0, z1, pit.x0, T.x0, 0.9);
    wallZ(z0, z1, T.x1, pit.x1, 0.9);
    c.col(pit.x0, 0.9, z0, T.x0, 2.2, z1);
    c.col(T.x1, 0.9, z0, pit.x1, 2.2, z1);
  }
  // 側室
  c.mm('concrete', wc, alc.x0, T.floorY, alc.z0, alc.x0 + T.wall, 0, alc.z1 + T.wall);
  c.mm('concrete', wc, alc.x1 - T.wall, T.floorY, alc.z0, alc.x1, 0, alc.z1 + T.wall);
  c.mm('concrete', wc, alc.x0, T.floorY, alc.z1, alc.x1, 0, alc.z1 + T.wall);
  // 屋頂（上面是草地）
  c.mm('concrete', wc, T.x0, T.roofY, pit.z0, T.x1, -0.1, pit.z1);
  c.mm('grass', '#55803f', T.x0, -0.1, pit.z0, T.x1, 0, pit.z1);
  c.mm('concrete', wc, alc.x0, T.roofY, alc.z0, alc.x1, -0.1, alc.z1 + T.wall);
  c.mm('grass', '#55803f', alc.x0, -0.1, alc.z0, alc.x1, 0, alc.z1 + T.wall);
  // 樓梯井端牆的拱頂與出口平台
  c.mm('concrete', '#7b7d7e', pit.x0, -0.3, T.z0, pit.x0 + 0.9, 0, T.z1);
  c.mm('concrete', '#7b7d7e', pit.x1 - 0.5, -0.3, T.z0, pit.x1, 0, T.z1);

  // 兩端樓梯（addStairs 往上走：西端往 -x、東端往 +x）
  const w = T.z1 - T.z0;
  const zc = (T.z0 + T.z1) / 2;
  const sw = T.stairW, se = T.stairE;
  c.b.addStairs({ surface: 'concrete', color: '#868a8c', altColor: '#7b7f81', x: sw.x, y: T.floorY, z: zc, yaw: Math.PI, steps: sw.steps, rise: sw.rise, depth: sw.depth, width: w });
  c.b.addStairs({ surface: 'concrete', color: '#868a8c', altColor: '#7b7f81', x: se.x, y: T.floorY, z: zc, yaw: 0, steps: se.steps, rise: se.rise, depth: se.depth, width: w });

  // 隧道內的管線與支柱（視覺 + 低矮碰撞）
  c.vis('metal', '#5b5f60', T.x0, -1.4, T.z0, T.x1, -1.1, T.z0 + 0.25);
  c.vis('metal', '#7a4a30', T.x0, -1.9, T.z1 - 0.3, T.x1, -1.65, T.z1);
  for (let x = T.x0 + 6; x < T.x1 - 3; x += 9) {
    c.vis('concrete', '#74777a', x, T.floorY, T.z0, x + 0.5, T.roofY, T.z0 + 0.45);
    c.vis('concrete', '#74777a', x, T.floorY, T.z1 - 0.45, x + 0.5, T.roofY, T.z1);
    // 日光燈管
    c.vis('metal', '#e8f0d8', x - 0.6, T.roofY - 0.14, (T.z0 + T.z1) / 2 - 0.12, x + 0.6, T.roofY - 0.04, (T.z0 + T.z1) / 2 + 0.12);
  }
  c.pointLight(-60, -1.7, 61, '#d6ecc8', 9, 26, 0.7);
  c.pointLight(-42, -1.7, 61, '#d6ecc8', 9, 26, 0.5);
  c.zone('tunnel', 'drain_tunnel', pit.x0 + 0.2, T.floorY - 0.3, T.z0 - 0.4, pit.x1 - 0.2, T.roofY, alc.z1);
}
