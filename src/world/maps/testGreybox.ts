import * as THREE from 'three';
import { MapBuilder } from '../MapBuilder';
import type { GameMap } from '../GameMap';
import type { ReverbZone, Surface } from '../Surface';

/** 灰盒測試地圖：每種地面材質一個區域 + 樓梯/斜坡/箱子/低矮通道/室內/隧道/淺水 */

const PADS: { surface: Surface; color: string }[] = [
  { surface: 'concrete', color: '#8c8f93' },
  { surface: 'metal', color: '#5f7a8f' },
  { surface: 'metal_hollow', color: '#4f6f8a' },
  { surface: 'metal_grate', color: '#8a9aa8' },
  { surface: 'wood', color: '#8d5c2e' },
  { surface: 'grass', color: '#46944a' },
  { surface: 'gravel', color: '#77706a' },
  { surface: 'dirt', color: '#6e4b2c' },
  { surface: 'water', color: '#2c5f7d' },
  { surface: 'tile', color: '#ddd8c9' },
  { surface: 'carpet', color: '#8e2f40' },
  { surface: 'sand', color: '#dcc687' },
];
const PAD_W = 7;
const PAD_Z0 = -28;
const PAD_Z1 = -20;

function makeSign(text: string, color: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#10151b'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = color; g.fillRect(0, 0, 512, 16);
  g.fillStyle = '#ffffff';
  g.font = 'bold 68px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 256, 72);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: tex }));
  mesh.name = `sign_${text}`;
  return mesh;
}

export function buildTestGreybox(): GameMap {
  const b = new MapBuilder();
  const root = new THREE.Group();
  root.name = 'testGreybox';

  // ---- 底板與圍牆 ----
  b.boxMinMax('concrete', '#6f7378', -45, -1.02, PAD_Z1, 45, -0.02, 32);
  const wallC = '#4c5056';
  b.boxMinMax('concrete', wallC, -46, -1, -29, 46, 4, -28.2);
  b.boxMinMax('concrete', wallC, -46, -1, 32, 46, 4, 32.8);
  b.boxMinMax('concrete', wallC, -46, -1, -29, -45.2, 4, 32.8);
  b.boxMinMax('concrete', wallC, 45.2, -1, -29, 46, 4, 32.8);

  // 展示列兩端的填充地面
  const padEnd = (PADS.length * PAD_W) / 2;
  b.boxMinMax('concrete', '#6f7378', -45, -0.52, PAD_Z0, -padEnd, -0.02, PAD_Z1);
  b.boxMinMax('concrete', '#6f7378', padEnd, -0.52, PAD_Z0, 45, -0.02, PAD_Z1);

  // ---- 材質展示列 ----
  const x0 = -(PADS.length * PAD_W) / 2;
  PADS.forEach((p, i) => {
    const xa = x0 + i * PAD_W;
    const top = p.surface === 'water' ? -0.3 : p.surface === 'metal_grate' ? 0.2 : 0; // 格柵為稍微架高的平台
    b.boxMinMax(p.surface, p.color, xa, top - 0.5, PAD_Z0, xa + PAD_W, top, PAD_Z1);
    const sign = makeSign(p.surface, p.color);
    sign.position.set(xa + PAD_W / 2, 2.4, PAD_Z0 + 0.35);
    root.add(sign);
    if (p.surface === 'water') {
      // 純視覺的半透明水面（不參與碰撞與材質射線）
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(PAD_W, PAD_Z1 - PAD_Z0),
        new THREE.MeshBasicMaterial({ color: '#4aa3d8', transparent: true, opacity: 0.45, depthWrite: false }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(xa + PAD_W / 2, -0.08, (PAD_Z0 + PAD_Z1) / 2);
      root.add(water);
    }
  });

  // ---- 樓梯（10 階，每階 0.2m）+ 平台 ----
  {
    const sx = -40, rise = 0.2, depth = 0.4, zA = -9.5, zB = -6.5;
    for (let i = 0; i < 10; i++) {
      b.boxMinMax('concrete', '#9a9da1', sx + i * depth, -0.5, zA, sx + (i + 1) * depth, (i + 1) * rise, zB);
    }
    b.boxMinMax('metal', '#7b8996', sx + 10 * depth, -0.5, -11, sx + 10 * depth + 6, 2.0, -5);
  }

  // ---- 斜坡（約 15 度）+ 平台 ----
  {
    const xa = -26, run = 6, rise = 1.6, t = 0.5, zA = -9.5, zB = -6.5;
    const a = Math.atan2(rise, run);
    const len = Math.hypot(run, rise);
    b.box('gravel', '#85796d',
      xa + run / 2 + (Math.sin(a) * t) / 2, rise / 2 - (Math.cos(a) * t) / 2, (zA + zB) / 2,
      len, t, zB - zA, { z: a });
    b.boxMinMax('concrete', '#9a9da1', xa + run, -0.5, zA, xa + run + 3, rise, zB);
  }

  // ---- 可跳上去的箱子（高 0.4 / 0.7 / 0.85）與大貨櫃 ----
  [[-12, 0.4], [-9.4, 0.7], [-6.8, 0.85]].forEach(([cx, h]) => {
    b.boxMinMax('wood', '#a2703c', cx - 0.8, 0, -9.8, cx + 0.8, h, -8.2);
  });
  b.boxMinMax('metal', '#3f7191', 3, 0, -10.3, 9, 2.6, -7.7);

  // ---- 低矮通道（站著過不去，要蹲）----
  {
    const z0 = 2.8, z1 = 3.2, h = 1.25;
    const col = '#a35d4b';
    b.boxMinMax('metal', col, -12, 0, z0, -6, 3, z1);
    b.boxMinMax('metal', col, -4, 0, z0, 4, 3, z1);
    b.boxMinMax('metal', col, -6, h, z0, -4, 3, z1);
  }

  // ---- 室內房間（大）+ 小儲藏室 ----
  const reverbZones: ReverbZone[] = [];
  {
    const wc = '#b9b2a3';
    const T = 0.3;
    b.boxMinMax('tile', '#d9d4c6', 11.7, -0.2, -0.3, 26.3, 0, 10.3);            // 地板（磁磚）
    b.boxMinMax('carpet', '#8e2f40', 15, -0.01, 3, 21, 0.03, 8);                 // 地毯
    b.boxMinMax('concrete', wc, 11.7, -0.2, -T, 17, 3.4, 0);                     // 北牆左
    b.boxMinMax('concrete', wc, 19, -0.2, -T, 26.3, 3.4, 0);                     // 北牆右
    b.boxMinMax('concrete', wc, 17, 2.4, -T, 19, 3.4, 0);                        // 門楣
    b.boxMinMax('concrete', wc, 11.7, -0.2, 10, 26.3, 3.4, 10 + T);              // 南牆
    b.boxMinMax('concrete', wc, 11.7, -0.2, 0, 12, 3.4, 10);                     // 西牆
    b.boxMinMax('concrete', wc, 26, -0.2, 0, 26.3, 3.4, 10);                     // 東牆
    b.boxMinMax('concrete', '#8f897c', 11.7, 3.4, -T, 26.3, 3.7, 10 + T);        // 屋頂
    // 儲藏室（東南角）：木地板、門朝西
    b.boxMinMax('wood', '#8d5c2e', 22, -0.01, 5, 26, 0.04, 10);
    b.boxMinMax('concrete', wc, 21.85, 0, 5, 22.15, 2.8, 6.5);
    b.boxMinMax('concrete', wc, 21.85, 0, 8.5, 22.15, 2.8, 10);
    b.boxMinMax('concrete', wc, 21.85, 2.2, 6.5, 22.15, 2.8, 8.5);
    b.boxMinMax('concrete', wc, 22, 0, 4.85, 26, 2.8, 5.15);
    b.boxMinMax('concrete', wc, 21.85, 2.8, 4.85, 26, 3.0, 10);
    reverbZones.push({ box: new THREE.Box3(new THREE.Vector3(12, -0.5, 0), new THREE.Vector3(26, 3.4, 10)), type: 'indoor_large', name: 'room' });
    reverbZones.push({ box: new THREE.Box3(new THREE.Vector3(22.15, -0.5, 5.15), new THREE.Vector3(26, 2.8, 10)), type: 'indoor_small', name: 'closet' });
    const lamp = new THREE.PointLight('#ffe2b0', 30, 20, 2);
    lamp.position.set(19, 3.0, 5);
    root.add(lamp);
  }

  // ---- 隧道（x -34..-6，z 16..21）----
  {
    const tc = '#6a6e73';
    b.boxMinMax('gravel', '#6f6a64', -34, -0.2, 16, -6, 0, 21);
    b.boxMinMax('concrete', tc, -34, -0.2, 15.6, -6, 3.9, 16);
    b.boxMinMax('concrete', tc, -34, -0.2, 21, -6, 3.9, 21.4);
    b.boxMinMax('concrete', tc, -34, 3.5, 16, -6, 3.9, 21);
    reverbZones.push({ box: new THREE.Box3(new THREE.Vector3(-34, -0.5, 16), new THREE.Vector3(-6, 3.5, 21)), type: 'tunnel', name: 'tunnel' });
  }

  const { group, meshes } = b.build();
  root.add(group);

  return {
    root,
    collision: group,
    surfaceMeshes: meshes,
    reverbZones,
    spawn: { position: new THREE.Vector3(0, 0.1, 12), yaw: 0 },
  };
}
