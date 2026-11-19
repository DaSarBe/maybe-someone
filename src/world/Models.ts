import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const BASE = import.meta.env.BASE_URL + 'assets/models/';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<THREE.Object3D | null>>();

/** 載入 public/assets/models/<name>.glb（有快取，每次回傳一份新的複本）。失敗時回傳 null，場景用替代方塊 */
export async function loadModel(name: string): Promise<THREE.Object3D | null> {
  let p = cache.get(name);
  if (!p) {
    p = loader.loadAsync(`${BASE}${name}.glb`).then((g) => g.scene).catch((err) => {
      console.warn(`[models] failed to load ${name}`, err);
      return null;
    });
    cache.set(name, p);
  }
  const src = await p;
  return src ? src.clone(true) : null;
}

/** 縮放到指定高度（或最大邊長），並把底部中心放在原點 */
export function fitModel(obj: THREE.Object3D, size: number, by: 'height' | 'max' = 'height'): THREE.Object3D {
  const wrap = new THREE.Group();
  wrap.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const dim = box.getSize(new THREE.Vector3());
  const ref = by === 'height' ? dim.y : Math.max(dim.x, dim.y, dim.z);
  const k = ref > 0 ? size / ref : 1;
  obj.scale.multiplyScalar(k);
  const b2 = new THREE.Box3().setFromObject(obj);
  const c = b2.getCenter(new THREE.Vector3());
  obj.position.sub(new THREE.Vector3(c.x, b2.min.y, c.z));
  wrap.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  return wrap;
}
