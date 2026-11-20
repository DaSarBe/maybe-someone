import * as THREE from 'three';
import { MapBuilder } from '../MapBuilder';
import type { GameMap } from '../GameMap';

export type StationId = 'stash' | 'shop' | 'upgrade' | 'safe' | 'timemachine' | 'bench';

export interface Station {
  id: StationId;
  label: string;
  /** 互動中心（腳底高度） */
  pos: THREE.Vector3;
  radius: number;
  color: string;
}

export const HUB_STATIONS: Station[] = [
  { id: 'stash', label: '倉庫櫃', pos: new THREE.Vector3(-7.5, 0, 0.2), radius: 2.9, color: '#35e1ff' },
  { id: 'shop', label: '黑市終端機', pos: new THREE.Vector3(7.5, 0, -3.9), radius: 2.7, color: '#ffb23a' },
  { id: 'upgrade', label: '升級工作台', pos: new THREE.Vector3(7.3, 0, 3.7), radius: 2.7, color: '#4ade80' },
  { id: 'safe', label: '房間保險箱', pos: new THREE.Vector3(-7.5, 0, -5.4), radius: 2.5, color: '#ff3dcb' },
  { id: 'timemachine', label: '時光機', pos: new THREE.Vector3(0, 0, -4.8), radius: 3.0, color: '#7c8cff' },
  { id: 'bench', label: '改槍台', pos: new THREE.Vector3(-3.4, 0, 5.6), radius: 2.3, color: '#ff8a3d' },
];

export const HUB_SIZE = { x: 10, z: 8, h: 4.4 };

function neon(color: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0),
    new THREE.MeshBasicMaterial({ color }),
  );
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return m;
}

function gridTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(53,225,255,0.55)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 253, 253);
  g.strokeStyle = 'rgba(53,225,255,0.18)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function makeLabel(text: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(6,10,16,0.82)';
  g.beginPath(); g.roundRect(8, 16, 496, 96, 18); g.fill();
  g.strokeStyle = color; g.lineWidth = 4;
  g.beginPath(); g.roundRect(8, 16, 496, 96, 18); g.stroke();
  g.fillStyle = '#ffffff';
  g.font = '700 54px "Noto Sans CJK TC","Microsoft JhengHei","PingFang TC",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(2.4, 0.6, 1);
  return s;
}

/** 未來基地：穿越者宿舍／實驗室。深色牆面、霓虹燈條、發光地板；各站的外型用方塊搭，模型之後由 HubScene 補上 */
export function buildHub(): GameMap {
  const { x: X, z: Z, h: H } = HUB_SIZE;
  const b = new MapBuilder();
  const root = new THREE.Group();
  root.name = 'hub';
  // 貼圖（scifi_floor / scifi_wall）：載入完成前先用純色；貼圖亮度由頂點色決定
  const loader = new THREE.TextureLoader();
  const base = import.meta.env.BASE_URL + 'assets/textures/';
  b.useTexture('metal', loader.load(base + 'scifi_floor.png'), 4);
  b.useTexture('tile', loader.load(base + 'scifi_floor.png'), 4);
  b.useTexture('concrete', loader.load(base + 'scifi_wall.png'), 4);

  // 地板（金屬）與中央實驗區（磁磚）
  b.boxMinMax('metal', '#c9d6e8', -X, -0.4, -Z, X, 0, Z);
  b.boxMinMax('tile', '#dfe9f7', -4.5, -0.01, -Z, 4.5, 0.03, -1.6);
  // 牆、天花板（concrete = 牆面貼圖；沒有人會踩在牆上，腳步聲不受影響）
  const wall = '#b7c5da';
  b.boxMinMax('concrete', wall, -X - 0.4, -0.4, -Z - 0.4, X + 0.4, H, -Z);
  b.boxMinMax('concrete', wall, -X - 0.4, -0.4, Z, X + 0.4, H, Z + 0.4);
  b.boxMinMax('concrete', wall, -X - 0.4, -0.4, -Z, -X, H, Z);
  b.boxMinMax('concrete', wall, X, -0.4, -Z, X + 0.4, H, Z);
  b.boxMinMax('concrete', '#8a9bb4', -X - 0.4, H, -Z - 0.4, X + 0.4, H + 0.4, Z + 0.4);
  // 牆面裝飾嵌板
  for (let i = -3; i <= 3; i++) {
    b.boxMinMax('concrete', '#d4deec', i * 2.8 - 1.0, 0.9, -Z + 0.01, i * 2.8 + 1.0, 3.2, -Z + 0.12);
  }

  // 倉庫櫃（西牆）：一排儲物櫃
  b.boxMinMax('metal', '#4a6a8e', -X, 0, -3.3, -X + 1.0, 2.5, 3.5);
  for (let z = -3.3; z < 3.5; z += 1.1) b.boxMinMax('metal', '#0f1722', -X + 1.0, 0.1, z + 0.52, -X + 1.03, 2.4, z + 0.58);
  // 黑市終端機（東牆後）
  b.boxMinMax('metal', '#5e4a6a', X - 1.5, 0, -5.4, X, 1.0, -2.4);
  b.box('metal', '#1a1420', X - 0.55, 1.45, -3.9, 0.3, 1.0, 2.4, { z: -0.25 });
  // 升級工作台（東牆前）
  b.boxMinMax('metal', '#3c6a50', X - 1.8, 0, 2.3, X, 0.95, 5.2);
  b.boxMinMax('metal', '#12201a', X - 1.8, 0.95, 2.3, X - 1.7, 2.2, 5.2);
  // 房間保險箱基座（西牆後）
  b.boxMinMax('metal', '#6a3a66', -X, 0, -6.6, -X + 1.6, 0.85, -4.2);
  // 時光機：兩根立柱 + 平台
  b.boxMinMax('metal', '#3a4a8a', -2.9, 0, -Z, -2.1, 3.8, -Z + 1.3);
  b.boxMinMax('metal', '#3a4a8a', 2.1, 0, -Z, 2.9, 3.8, -Z + 1.3);
  b.boxMinMax('metal', '#3a4a8a', -2.9, 3.8, -Z, 2.9, 4.3, -Z + 1.3);
  b.boxMinMax('metal_grate', '#2a3150', -2.2, 0.03, -Z + 1.3, 2.2, 0.12, -3.6);
  // 改槍台（南牆前）：工作檯 + 牆上的工具板
  b.boxMinMax('metal', '#a8794c', -4.7, 0, 6.5, -2.1, 0.92, Z);
  b.boxMinMax('metal', '#6a4c34', -4.7, 0.92, 7.55, -2.1, 2.2, Z - 0.0);
  b.boxMinMax('metal', '#9a9fa8', -4.55, 0.92, 6.75, -2.25, 0.97, 7.45);
  // 角落的木箱（裝飾兼擋路）
  b.boxMinMax('metal', '#4c5e72', -X, 0, 6.2, -X + 1.8, 1.0, Z);
  b.boxMinMax('metal', '#4c5e72', X - 1.8, 0, 6.4, X, 1.0, Z);

  const { group, meshes, collision } = b.build();
  root.add(group);

  // ---- 霓虹燈條（純視覺） ----
  const strips = new THREE.Group();
  strips.add(neon('#35e1ff', -X, H - 0.12, -Z + 0.02, X, H - 0.04, -Z + 0.1));
  strips.add(neon('#35e1ff', -X, H - 0.12, Z - 0.1, X, H - 0.04, Z - 0.02));
  strips.add(neon('#ff3dcb', -X + 0.02, H - 0.12, -Z, -X + 0.1, H - 0.04, Z));
  strips.add(neon('#ff3dcb', X - 0.1, H - 0.12, -Z, X - 0.02, H - 0.04, Z));
  strips.add(neon('#35e1ff', -X + 0.02, 0.06, -Z, -X + 0.08, 0.12, Z));
  strips.add(neon('#35e1ff', X - 0.08, 0.06, -Z, X - 0.02, 0.12, Z));
  // 儲物櫃邊框
  strips.add(neon('#35e1ff', -X + 1.0, 2.5, -3.3, -X + 1.06, 2.56, 3.5));
  strips.add(neon('#35e1ff', -X + 1.0, 0.0, -3.3, -X + 1.06, 0.06, 3.5));
  // 終端機與工作台
  strips.add(neon('#ffb23a', X - 1.5, 1.0, -5.4, X - 1.44, 1.06, -2.4));
  strips.add(neon('#4ade80', X - 1.8, 0.95, 2.3, X - 1.74, 1.0, 5.2));
  // 保險箱基座
  strips.add(neon('#ff3dcb', -X + 1.6, 0, -6.6, -X + 1.66, 0.06, -4.2));
  // 改槍台
  strips.add(neon('#ff8a3d', -4.7, 0.92, 6.5, -2.1, 0.97, 6.56));
  strips.add(neon('#ff8a3d', -4.7, 2.15, 7.5, -2.1, 2.2, 7.56));
  // 時光機門框
  strips.add(neon('#7c8cff', -2.1, 0, -Z + 1.3, -2.04, 3.8, -Z + 1.36));
  strips.add(neon('#7c8cff', 2.04, 0, -Z + 1.3, 2.1, 3.8, -Z + 1.36));
  strips.add(neon('#7c8cff', -2.1, 3.74, -Z + 1.3, 2.1, 3.8, -Z + 1.36));
  root.add(strips);

  // 發光地板：外框 + 動線
  const gridTex = gridTexture();
  gridTex.repeat.set(X, Z);
  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(X * 2, Z * 2),
    new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }),
  );
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 0.012;
  root.add(grid);
  // 通往時光機的引導光
  const guide = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 7.5),
    new THREE.MeshBasicMaterial({ color: '#35e1ff', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  guide.rotation.x = -Math.PI / 2;
  guide.position.set(0, 0.05, 0.3);
  root.add(guide);

  // 各站的光暈地墊
  for (const s of HUB_STATIONS) {
    const pad = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.05, 40),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(s.pos.x, 0.045, s.pos.z);
    root.add(pad);
  }

  const zone = { box: new THREE.Box3(new THREE.Vector3(-X, -1, -Z), new THREE.Vector3(X, H, Z)), type: 'indoor_large' as const, name: 'hub' };
  return {
    root,
    collision,
    surfaceMeshes: meshes,
    reverbZones: [zone],
    spawn: { position: new THREE.Vector3(0, 0.05, 4.6), yaw: 0 },
  };
}
