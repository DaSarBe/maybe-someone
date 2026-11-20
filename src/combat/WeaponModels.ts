import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { ViewmodelStyle } from '../data/weaponHandling';

/**
 * 第一人稱武器模型（Quaternius FPS Pack，OBJ + MTL，只有材質色）。
 * 載入後把各材質色烤進頂點色、依需要拆成「前段 / 槍托」兩個 mesh（瞄準時隱藏槍托），
 * 每把槍最多 2 個 draw call；法線用平面法線（low poly 風格）。
 * 載入失敗時 getWeaponModel 回傳 null，Viewmodel 退回方塊槍。
 */

export interface WeaponModelCfg {
  file: string;
  /** 繞 Y 軸旋轉（弧度）：讓槍口朝 -Z。pistol 的模型槍口朝 +X，需要 +π/2 */
  rotY: number;
  /** 模型單位 → 公尺（未經 Viewmodel 的 VM_SCALE） */
  scale: number;
  /** 這個模型座標的點會被放在原點（約為槍身的中心，腰射時槍才會落在畫面合適的位置） */
  pivot: [number, number, number];
  /** 瞄準線（照門 / 準星頂）的模型座標高度；瞄準時這個高度會對準畫面中心 */
  sight: number;
  /** 材質名稱 → 顏色（MTL 裡所有材質都是同一個灰色，這裡重新上色） */
  colors: Record<string, string>;
  /** 槍口（模型座標） */
  muzzle: [number, number, number];
  /** 右手握把、左手托持的位置（模型座標） */
  grip: [number, number, number];
  fore: [number, number, number];
  /** 槍托切分：沿「後方」軸（rotY 之後的 +Z 方向）超過這個模型座標的三角形歸入槍托（可省略 = 不拆） */
  stockFrom?: { axis: 'x' | 'z'; value: number; sign: 1 | -1 };
  /**
   * 配件安裝點與機械瞄具的瞄準線（模型座標）：
   *  rear / front：照門與準星（瞄準線通過這兩點，瞄準時它們會落在畫面中心）
   *  rail：上方導軌（瞄具底座中心）、grip：握把頂端（護木下緣）、tac：戰術裝備（雷射 / 手電筒）底座
   *  tacDir：戰術裝備朝哪個方向長出去（側面往左 / 往下）、mag：彈匣底部（擴容彈匣往下延伸，size = 寬 / 高 / 長）
   */
  mounts: {
    rear: [number, number, number]; front: [number, number, number];
    rail: [number, number, number]; grip: [number, number, number];
    tac: [number, number, number]; tacDir: 'left' | 'down';
    mag: [number, number, number]; magSize: [number, number, number];
  };
}

export const WEAPON_MODEL_CFG: Record<ViewmodelStyle, WeaponModelCfg> = {
  pistol: {
    file: 'weapon_pistol', rotY: Math.PI / 2, scale: 0.04, pivot: [-1.5, 0, 0], sight: 3.07, muzzle: [4.94, 2.4, 0], grip: [-3.0, -0.6, 0], fore: [0.5, 1.0, 0],
    colors: { DarkerMetal: '#3b4048', Metal: '#59616c', Magazine: '#25282d', 'Material.003': '#8a8f98', Muzzle: '#141619', Wood: '#6b4a2e' },
    mounts: {
      rear: [-2.8, 3.07, 0], front: [4.3, 3.0, 0], rail: [1.2, 2.85, 0], grip: [3.0, 1.2, 0], tac: [3.0, 1.2, 0], tacDir: 'down',
      mag: [-3.7, -3.1, 0], magSize: [1.5, 1.2, 1.3],
    },
  },
  smg: {
    file: 'weapon_smg', rotY: 0, scale: 0.05, pivot: [0, -0.1, 2.0], sight: 0.67, muzzle: [0, -0.05, -6.25], grip: [0, -1.0, 0.6], fore: [0, -0.6, -3.2],
    colors: { 'Material.001': '#33373e', 'Material.003': '#1c1e22', 'Material.004': '#4d535c' },
    mounts: {
      rear: [0, 1.55, -2.1], front: [0, 1.4, -4.2], rail: [0, 1.66, -2.9], grip: [0, -0.6, -5.0], tac: [-0.5, -0.1, -5.0], tacDir: 'left',
      mag: [0, -1.9, 0.0], magSize: [0.9, 1.2, 1.6],
    },
  },
  rifle: {
    file: 'weapon_rifle', rotY: 0, scale: 0.105, pivot: [0, -0.06, 0.8], sight: 0.68, muzzle: [0, 0.56, -4.75], grip: [0, -0.4, 2.8], fore: [0, 0.2, -2.6],
    stockFrom: { axis: 'z', value: 2.6, sign: 1 },
    colors: { Barrels: '#2a2d32', Black: '#30343a', BulletOrange: '#c4651e', BulletYellow: '#c9a23a', DarkWood: '#5a3a22', LightWood: '#7a5232', Metal: '#59616c' },
    mounts: {
      rear: [0, 0.68, 0.45], front: [0, 0.76, -4.3], rail: [0, 0.68, 0.4], grip: [0, 0.2, -2.6], tac: [-0.2, 0.45, -3.0], tacDir: 'left',
      mag: [0, -0.1, 1.0], magSize: [0.42, 0.9, 0.6],
    },
  },
  shotgun: {
    file: 'weapon_shotgun', rotY: 0, scale: 0.11, pivot: [0, -0.27, 0.3], sight: 0.57, muzzle: [0, 0.4, -6.6], grip: [0, -0.4, 0.8], fore: [0, 0.1, -3.4],
    stockFrom: { axis: 'z', value: 0.9, sign: 1 },
    colors: { Barrels: '#3a3f46', Black: '#25282d', BulletRed: '#b02a2a', BulletYellow: '#c9a23a', DarkMetal: '#4a5058', Trigger: '#8a8f98' },
    mounts: {
      rear: [0, 0.51, -1.2], front: [0, 0.57, -6.5], rail: [0, 0.5, -1.2], grip: [0, 0.0, -3.2], tac: [-0.25, 0.3, -4.2], tacDir: 'left',
      mag: [0, -0.4, -0.5], magSize: [0.5, 0.8, 0.8],
    },
  },
};

export interface WeaponModel {
  /** 已經套用縮放 / 旋轉 / 置中，槍管朝 -Z；原點在瞄準線上 */
  group: THREE.Group;
  /** 槍口（group 座標） */
  muzzle: THREE.Vector3;
  grip: THREE.Vector3;
  fore: THREE.Vector3;
  /** 瞄準線高度（group 座標），目前原點就在瞄準線上，這裡是照門高出原點的量 */
  sightY: number;
  stocks: THREE.Mesh[];
  triangles: number;
  /** 配件安裝點與瞄準線（group 座標，已套用縮放 / 旋轉 / 置中） */
  mounts: {
    rear: THREE.Vector3; front: THREE.Vector3; rail: THREE.Vector3; grip: THREE.Vector3; tac: THREE.Vector3;
    tacDir: 'left' | 'down'; mag: THREE.Vector3; magSize: THREE.Vector3;
  };
}

/** 模型座標的 mounts → group 座標（magSize 是尺寸，只縮放不平移） */
export function resolveMounts(cfg: WeaponModelCfg): WeaponModel['mounts'] {
  const m = cfg.mounts;
  return {
    rear: toLocal(cfg, m.rear), front: toLocal(cfg, m.front), rail: toLocal(cfg, m.rail), grip: toLocal(cfg, m.grip), tac: toLocal(cfg, m.tac),
    tacDir: m.tacDir, mag: toLocal(cfg, m.mag),
    magSize: new THREE.Vector3(m.magSize[0], m.magSize[1], m.magSize[2]).multiplyScalar(cfg.scale),
  };
}

const BASE = import.meta.env.BASE_URL + 'assets/models/weapons/';
const cache = new Map<ViewmodelStyle, WeaponModel | null>();
let loading: Promise<void> | null = null;

const material = new THREE.MeshLambertMaterial({ vertexColors: true });

/** OBJ 的每個 Mesh（可能多材質）→ 平面法線 + 頂點色 + 依條件分桶 */
function bake(obj: THREE.Object3D, cfg: WeaponModelCfg): { front: THREE.BufferGeometry; stock: THREE.BufferGeometry | null; tris: number } {
  const bucket = (): { pos: number[]; col: number[] } => ({ pos: [], col: [] });
  const front = bucket(), rear = bucket();
  const rot = new THREE.Matrix4().makeRotationY(cfg.rotY);
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const pivot = new THREE.Vector3(...cfg.pivot);
  const sf = cfg.stockFrom;
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const pos = g.getAttribute('position');
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const groups = g.groups.length ? g.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
    for (const gr of groups) {
      const mat = mats[gr.materialIndex ?? 0] as THREE.MeshPhongMaterial;
      const color = new THREE.Color(cfg.colors[mat.name] ?? '#555b64');
      for (let i = gr.start; i + 2 < gr.start + gr.count; i += 3) {
        for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, i + k);
        const cz = sf ? (sf.axis === 'x' ? (v[0].x + v[1].x + v[2].x) : (v[0].z + v[1].z + v[2].z)) / 3 : 0;
        const toRear = !!sf && sf.sign * (cz - sf.value) > 0;
        const dst = toRear ? rear : front;
        for (let k = 0; k < 3; k++) {
          v[k].sub(pivot).multiplyScalar(cfg.scale).applyMatrix4(rot);
          dst.pos.push(v[k].x, v[k].y, v[k].z);
          dst.col.push(color.r, color.g, color.b);
        }
      }
    }
  });
  const make = (b: { pos: number[]; col: number[] }): THREE.BufferGeometry | null => {
    if (b.pos.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    geo.computeVertexNormals(); // 非索引幾何 → 平面法線
    geo.computeBoundingSphere();
    return geo;
  };
  const f = make(front)!;
  return { front: f, stock: make(rear), tris: (front.pos.length + rear.pos.length) / 9 };
}

function toLocal(cfg: WeaponModelCfg, p: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(...p).sub(new THREE.Vector3(...cfg.pivot)).multiplyScalar(cfg.scale).applyMatrix4(new THREE.Matrix4().makeRotationY(cfg.rotY));
}

async function loadOne(style: ViewmodelStyle): Promise<WeaponModel | null> {
  const cfg = WEAPON_MODEL_CFG[style];
  try {
    const [mtlText, objText] = await Promise.all([
      fetch(`${BASE}${cfg.file}.mtl`).then((r) => { if (!r.ok) throw new Error(`mtl ${r.status}`); return r.text(); }),
      fetch(`${BASE}${cfg.file}.obj`).then((r) => { if (!r.ok) throw new Error(`obj ${r.status}`); return r.text(); }),
    ]);
    const creator = new MTLLoader().parse(mtlText, BASE);
    const obj = new OBJLoader().setMaterials(creator).parse(objText);
    const baked = bake(obj, cfg);
    const group = new THREE.Group();
    group.name = `weapon_model_${style}`;
    const body = new THREE.Mesh(baked.front, material);
    group.add(body);
    const stocks: THREE.Mesh[] = [];
    if (baked.stock) {
      const st = new THREE.Mesh(baked.stock, material);
      group.add(st);
      stocks.push(st);
    }
    obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); } });
    return {
      group, stocks, triangles: baked.tris,
      muzzle: toLocal(cfg, cfg.muzzle), grip: toLocal(cfg, cfg.grip), fore: toLocal(cfg, cfg.fore),
      sightY: (cfg.sight - cfg.pivot[1]) * cfg.scale + 0.006,
      mounts: resolveMounts(cfg),
    };
  } catch (err) {
    console.warn(`[weapon] failed to load model ${style}, using box gun`, err);
    return null;
  }
}

/** 載入四把槍的模型（只載一次）。失敗的那把之後回傳 null */
export function preloadWeaponModels(): Promise<void> {
  loading ??= Promise.all((['pistol', 'smg', 'rifle', 'shotgun'] as const).map(async (s) => { cache.set(s, await loadOne(s)); })).then(() => undefined);
  return loading;
}

/** 已載入的模型（同步）。每次回傳新的 Group（共用幾何與材質），所以切換武器可以安全 dispose 外層 */
export function getWeaponModel(style: ViewmodelStyle): WeaponModel | null {
  const m = cache.get(style);
  if (!m) return null;
  const group = new THREE.Group();
  const stocks: THREE.Mesh[] = [];
  for (const c of m.group.children) {
    const src = c as THREE.Mesh;
    const mesh = new THREE.Mesh(src.geometry, src.material);
    group.add(mesh);
    if (m.stocks.includes(src)) stocks.push(mesh);
  }
  return { ...m, group, stocks };
}
