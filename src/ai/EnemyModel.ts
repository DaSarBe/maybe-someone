import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { EnemyDef } from '../data/enemies';

const BASE = import.meta.env.BASE_URL + 'assets/models/';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<GLTF | null>>();

export function preloadEnemyModel(name: string): Promise<GLTF | null> {
  let p = cache.get(name);
  if (!p) {
    p = loader.loadAsync(`${BASE}${name}.glb`).catch((err) => {
      console.warn(`[enemy] failed to load ${name}`, err);
      return null;
    });
    cache.set(name, p);
  }
  return p;
}

/** 武器 id → soldier 模型裡的武器節點名稱（其餘武器節點全部隱藏） */
const SOLDIER_WEAPON_NODE: Record<string, string> = { pistol: 'Pistol', smg: 'SMG', shotgun: 'Shotgun', rifle: 'AK' };
const SOLDIER_ALL_WEAPONS = ['Sniper', 'RocketLauncher', 'Revolver', 'Revolver_Small', 'Pistol', 'GrenadeLauncher', 'ShortCannon', 'Shotgun', 'Sniper_2', 'Shovel', 'Knife_2', 'Knife_1', 'AK', 'SMG'];

export type AnimName = 'idle' | 'walk' | 'run' | 'runGun' | 'shoot' | 'hit' | 'death';

/** 各模型的動畫對照（glb 內的名稱，省略 `CharacterArmature|` 前綴）；walk 沒有專屬動畫時用 run 放慢 */
const CLIP_MAP: Record<EnemyDef['model'], Record<AnimName, { clip: string; scale?: number } | null>> = {
  enemy_soldier: {
    idle: { clip: 'Idle' }, walk: { clip: 'Run', scale: 0.55 }, run: { clip: 'Run' }, runGun: { clip: 'Run_Gun' },
    shoot: { clip: 'Idle_Shoot' }, hit: { clip: 'HitReact' }, death: { clip: 'Death' },
  },
  enemy_robot_gunner: {
    idle: { clip: 'Idle' }, walk: { clip: 'Walk' }, run: { clip: 'Run' }, runGun: { clip: 'Run' },
    shoot: { clip: 'Shoot' }, hit: null, death: { clip: 'Death' },
  },
};

/** AnimationMixer 包裝：交叉淡化、單次動畫（受擊、死亡） */
export class EnemyAnim {
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<AnimName, THREE.AnimationAction>();
  private current: AnimName | null = null;
  private oneShotLeft = 0;
  finishedDeath = false;
  hasHit: boolean;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[], model: EnemyDef['model']) {
    this.mixer = new THREE.AnimationMixer(root);
    const map = CLIP_MAP[model];
    this.hasHit = !!map.hit;
    for (const [name, spec] of Object.entries(map) as [AnimName, { clip: string; scale?: number } | null][]) {
      if (!spec) continue;
      const clip = clips.find((c) => c.name === spec.clip || c.name.endsWith(`|${spec.clip}`));
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.timeScale = spec.scale ?? 1;
      if (name === 'hit' || name === 'death') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions.set(name, a);
    }
  }

  play(name: AnimName, fade = 0.2): void {
    if (this.current === 'death') return;
    if (name === this.current) return;
    if (this.oneShotLeft > 0 && name !== 'death') return;
    const next = this.actions.get(name) ?? this.actions.get('idle');
    if (!next) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    next.reset().play();
    if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
    else next.fadeIn(fade);
    this.current = name;
  }

  /** 受擊：播一次再回到原動作 */
  playOnce(name: 'hit' | 'death'): void {
    const a = this.actions.get(name);
    if (!a) return;
    if (name === 'hit' && (this.oneShotLeft > 0 || this.current === 'death')) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    a.reset().play();
    if (prev && prev !== a) prev.crossFadeTo(a, 0.08, false);
    if (name === 'death') { this.current = 'death'; this.oneShotLeft = 0; return; }
    this.oneShotLeft = a.getClip().duration * 0.9;
  }

  update(dt: number): void {
    if (this.finishedDeath) return;
    this.mixer.update(dt);
    if (this.oneShotLeft > 0) {
      this.oneShotLeft -= dt;
      if (this.oneShotLeft <= 0) {
        const hit = this.actions.get('hit');
        const cur = this.current && this.current !== 'death' ? this.actions.get(this.current) : null;
        if (hit && cur) { cur.reset().play(); hit.crossFadeTo(cur, 0.15, false); }
      }
    }
    if (this.current === 'death') {
      const d = this.actions.get('death');
      if (d && !d.isRunning()) this.finishedDeath = true;
    }
  }
}

export interface EnemyModelInstance {
  root: THREE.Group;
  anim: EnemyAnim | null;
  /** 載入失敗時的替代方塊人偶 */
  fallback: boolean;
}

function fallbackBody(def: EnemyDef): THREE.Group {
  const g = new THREE.Group();
  const c = new THREE.Color('#8a94a6');
  if (def.tint) c.multiply(new THREE.Color(def.tint[0], def.tint[1], def.tint[2]));
  const m = new THREE.MeshLambertMaterial({ color: c });
  const h = def.height;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, h * 0.5, 0.3), m);
  body.position.y = h * 0.62;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), new THREE.MeshLambertMaterial({ color: '#d2a98a' }));
  head.position.y = h * 0.92;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, h * 0.36, 0.22), m);
  legs.position.y = h * 0.18;
  g.add(body, head, legs);
  return g;
}

const tintCache = new Map<string, THREE.Material>();

/** 建立一個敵人的模型（SkeletonUtils.clone，每隻有自己的骨架與 mixer） */
export async function createEnemyModel(def: EnemyDef, weaponId: string, castShadow: boolean): Promise<EnemyModelInstance> {
  const gltf = await preloadEnemyModel(def.model);
  if (!gltf) return { root: fallbackBody(def), anim: null, fallback: true };
  const model = SkeletonUtils.clone(gltf.scene);

  if (def.model === 'enemy_soldier') {
    const keep = SOLDIER_WEAPON_NODE[weaponId] ?? 'Pistol';
    model.traverse((o) => {
      if (SOLDIER_ALL_WEAPONS.includes(o.name) && o.name !== keep) o.visible = false;
    });
  }
  // 量測（只算看得見的 mesh）後縮放到指定身高、腳底貼齊 y = 0
  const box = new THREE.Box3();
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && o.visible && !(o.parent && !o.parent.visible)) {
      const b = new THREE.Box3().setFromObject(m);
      if (isFinite(b.min.y)) box.union(b);
    }
  });
  const size = box.getSize(new THREE.Vector3());
  const k = size.y > 0.01 ? def.height / size.y : 1;
  model.scale.multiplyScalar(k);
  model.position.y = -box.min.y * k;

  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = castShadow;
    m.frustumCulled = false; // 蒙皮的包圍球不跟著動畫，關閉避免被誤剔除（敵人數量少）
    if (def.tint) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const out = mats.map((src) => {
        const key = `${def.kind}:${src.uuid}`;
        let t = tintCache.get(key);
        if (!t) {
          t = src.clone();
          const c = (t as THREE.MeshStandardMaterial).color;
          if (c) c.multiply(new THREE.Color(def.tint![0], def.tint![1], def.tint![2]));
          tintCache.set(key, t);
        }
        return t;
      });
      m.material = Array.isArray(m.material) ? out : out[0];
    }
  });

  const root = new THREE.Group();
  root.add(model);
  return { root, anim: new EnemyAnim(model, gltf.animations, def.model), fallback: false };
}
