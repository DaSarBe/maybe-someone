import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

/**
 * 配件模型（public/assets/models/attachments，CC0）：
 *  - Quaternius（Scope_1/2、Silencer_1、Grip、Flashlight）：OBJ + MTL，單位約為 glb 的 10 倍，槍口朝 +X；
 *  - Pichuliru（RedDot / Holographic / Laser，East 變體）：glb，朝 -Z。
 * 載入後正規化：原點在「安裝底面中心」、朝 -Z、+Y 向上、單位為公尺（槍模型座標：長槍約 1m）。
 * 材質色全部重新上色（原檔是近乎全黑），頂點色 + Lambert，所以每個配件只有 1～2 個 draw call。
 * 載入失敗時 getAttachmentModel 回傳 null，WeaponAssembly 改用程式產生的方塊。
 */

export interface AttModelCfg {
  file: string;
  kind: 'obj' | 'glb';
  /** 原始單位 → 公尺（含額外放大，配件比真實大一點才看得清楚） */
  scale: number;
  /** 繞 Y 旋轉：OBJ 的 +X 朝前 → +π/2 讓它朝 -Z */
  rotY: number;
  /** 原始座標中的安裝點（底面中心），會被移到原點 */
  origin: [number, number, number];
  /** 瞄具：鏡片 / 視窗中心（原始座標）與視窗寬高（公尺，已含 scale） */
  window?: [number, number, number];
  windowSize?: [number, number];
  /** 滅音器、手電筒：槍口 / 光源端的位置（原始座標） */
  tip?: [number, number, number];
  /** 材質名稱 → 顏色 */
  colors: Record<string, string>;
  /** 材質名稱 → 不透明度 */
  opacity?: Record<string, number>;
}

const DARK = { Black: '#23262b', DarkMetal: '#343a42', Main: '#2d323a' };

export const ATT_CFG: Record<string, AttModelCfg> = {
  att_scope2x: {
    file: 'Scope_1', kind: 'obj', scale: 0.1, rotY: Math.PI / 2, origin: [0.0, -0.03, 0],
    window: [-1.09, 0.17, 0], windowSize: [0.03, 0.03],
    colors: { ...DARK, Glass: '#2a4a68' },
  },
  att_scope4x: {
    file: 'Scope_2', kind: 'obj', scale: 0.1, rotY: Math.PI / 2, origin: [0.0, -0.03, 0],
    window: [-1.0, 0.17, 0], windowSize: [0.03, 0.03],
    colors: { ...DARK, Glass: '#2a4a68' },
  },
  att_suppressor: {
    file: 'Silencer_1', kind: 'obj', scale: 0.12, rotY: Math.PI / 2, origin: [0, 0, 0], tip: [1.65, 0, 0],
    colors: { Black: '#1e2126' },
  },
  att_grip: {
    file: 'Grip', kind: 'obj', scale: 0.13, rotY: 0, origin: [0, 0.42, 0],
    colors: { Main: '#2b3038' },
  },
  att_flashlight: {
    file: 'Flashlight', kind: 'obj', scale: 0.2, rotY: Math.PI / 2, origin: [0.07, -0.034, 0], tip: [0.272, 0.1, 0],
    colors: { ...DARK, Glass: '#e6e0b0' },
  },
  att_reddot: {
    file: 'RedDot_East', kind: 'glb', scale: 1.5, rotY: 0, origin: [0, -0.005, 0], window: [0, 0.0277, -0.02], windowSize: [0.024, 0.018],
    colors: {
      M_PCL_Flat_Black: '#25282d', M_PCL_Flat_Black_Lighter: '#3a3f46', 'M_PCL_Flat_Red.Brick': '#b02828', M_PCL_Flat_Glass: '#7da0c0',
    },
    opacity: { M_PCL_Flat_Glass: 0.3 },
  },
  att_holo: {
    file: 'Holographic_East', kind: 'glb', scale: 1.5, rotY: 0, origin: [0, -0.005, 0], window: [0, 0.031, 0.0], windowSize: [0.026, 0.026],
    colors: {
      M_PCL_Flat_Black: '#25282d', M_PCL_Flat_Black_Lighter: '#3a3f46', 'M_PCL_Flat_Red.Brick': '#b02828', M_PCL_Flat_Glass: '#7da0c0',
    },
    opacity: { M_PCL_Flat_Glass: 0.3 },
  },
  att_laser: {
    file: 'Laser_East', kind: 'glb', scale: 0.95, rotY: 0, origin: [0, -0.0025, 0], tip: [0, 0.012, -0.05],
    colors: {
      M_PCL_Flat_Black: '#25282d', M_PCL_Flat_Black_Lighter: '#3a3f46', M_PCL_Flat_Grey_Darker: '#4a4f57',
      'M_PCL_Flat_Red.Brick': '#d02020', M_PCL_Flat_White: '#cfd3d8',
    },
  },
};

export interface AttModel {
  group: THREE.Group;
  /** 視窗中心（group 座標，公尺）；非瞄具為 null */
  window: THREE.Vector3 | null;
  windowSize: [number, number] | null;
  /** 槍口 / 光源端（group 座標） */
  tip: THREE.Vector3 | null;
  /** 模型的包圍盒（group 座標） */
  box: THREE.Box3;
}

const BASE = import.meta.env.BASE_URL + 'assets/models/attachments/';
const cache = new Map<string, AttModel | null>();
let loading: Promise<void> | null = null;
const material = new THREE.MeshLambertMaterial({ vertexColors: true });
const glassMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false });

function bake(root: THREE.Object3D, cfg: AttModelCfg): { solid: THREE.BufferGeometry | null; glass: THREE.BufferGeometry | null } {
  const mk = () => ({ pos: [] as number[], col: [] as number[] });
  const solid = mk(), glass = mk();
  const rot = new THREE.Matrix4().makeRotationY(cfg.rotY);
  const origin = new THREE.Vector3(...cfg.origin);
  const v = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g0 = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const pos = g0.getAttribute('position');
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const groups = g0.groups.length ? g0.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
    for (const gr of groups) {
      const mat = mats[gr.materialIndex ?? 0] as THREE.Material;
      const color = new THREE.Color(cfg.colors[mat.name] ?? '#33373e');
      const isGlass = (cfg.opacity?.[mat.name] ?? 1) < 1 || mat.name === 'Glass';
      const dst = isGlass && cfg.opacity ? glass : solid;
      for (let i = gr.start; i < gr.start + gr.count; i++) {
        v.fromBufferAttribute(pos, i);
        tmp.copy(v).applyMatrix4(m.matrixWorld);
        tmp.sub(origin).multiplyScalar(cfg.scale).applyMatrix4(rot);
        dst.pos.push(tmp.x, tmp.y, tmp.z);
        dst.col.push(color.r, color.g, color.b);
      }
    }
  });
  const make = (b: { pos: number[]; col: number[] }): THREE.BufferGeometry | null => {
    if (!b.pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  };
  return { solid: make(solid), glass: make(glass) };
}

const toLocal = (cfg: AttModelCfg, p: [number, number, number]): THREE.Vector3 =>
  new THREE.Vector3(...p).sub(new THREE.Vector3(...cfg.origin)).multiplyScalar(cfg.scale).applyMatrix4(new THREE.Matrix4().makeRotationY(cfg.rotY));

async function loadOne(id: string): Promise<AttModel | null> {
  const cfg = ATT_CFG[id];
  try {
    let root: THREE.Object3D;
    if (cfg.kind === 'obj') {
      const [mtlText, objText] = await Promise.all([
        fetch(`${BASE}${cfg.file}.mtl`).then((r) => { if (!r.ok) throw new Error(`mtl ${r.status}`); return r.text(); }),
        fetch(`${BASE}${cfg.file}.obj`).then((r) => { if (!r.ok) throw new Error(`obj ${r.status}`); return r.text(); }),
      ]);
      root = new OBJLoader().setMaterials(new MTLLoader().parse(mtlText, BASE)).parse(objText);
    } else {
      root = (await new GLTFLoader().loadAsync(`${BASE}${cfg.file}.glb`)).scene;
    }
    const baked = bake(root, cfg);
    const group = new THREE.Group();
    group.name = `att_${id}`;
    if (baked.solid) group.add(new THREE.Mesh(baked.solid, material));
    if (baked.glass) { const g = new THREE.Mesh(baked.glass, glassMaterial); g.renderOrder = 2; group.add(g); }
    const box = new THREE.Box3();
    for (const g of [baked.solid, baked.glass]) if (g?.boundingBox) box.union(g.boundingBox);
    return {
      group, box,
      window: cfg.window ? toLocal(cfg, cfg.window) : null,
      windowSize: cfg.windowSize ?? null,
      tip: cfg.tip ? toLocal(cfg, cfg.tip) : null,
    };
  } catch (err) {
    console.warn(`[attachment] failed to load ${id}`, err);
    return null;
  }
}

/** 載入所有配件模型（只載一次）。失敗的那個之後回傳 null */
export function preloadAttachmentModels(): Promise<void> {
  loading ??= Promise.all(Object.keys(ATT_CFG).map(async (id) => { cache.set(id, await loadOne(id)); })).then(() => undefined);
  return loading;
}

/** 已載入的配件模型（同步）；每次回傳新的 Group（共用幾何與材質） */
export function getAttachmentModel(id: string): AttModel | null {
  const m = cache.get(id);
  if (!m) return null;
  const group = new THREE.Group();
  group.name = m.group.name;
  for (const c of m.group.children) {
    const src = c as THREE.Mesh;
    const mesh = new THREE.Mesh(src.geometry, src.material);
    mesh.renderOrder = src.renderOrder;
    group.add(mesh);
  }
  return { ...m, group, window: m.window?.clone() ?? null, tip: m.tip?.clone() ?? null, box: m.box.clone() };
}
