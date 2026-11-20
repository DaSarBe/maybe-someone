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

/** 各等級頭盔的外觀（顏色與細節）：1 黃色安全帽、2 橄欖綠戰術盔、3 藍灰陶瓷盔、4 深紫全罩盔（帶青色面罩） */
const HELMET_LOOK: Record<number, { color: string; metal: number; brim: boolean; visor: boolean; r: number }> = {
  1: { color: '#e0b323', metal: 0.1, brim: true, visor: false, r: 1.0 },
  2: { color: '#5d7a4b', metal: 0.3, brim: false, visor: false, r: 1.06 },
  3: { color: '#4a6f93', metal: 0.55, brim: false, visor: false, r: 1.12 },
  4: { color: '#4b3470', metal: 0.7, brim: false, visor: true, r: 1.2 },
};

/** 各模型頭部的大小與位置（公尺，模型縮放到指定身高之後）：up = 頭部中心在 Head 骨骼原點上方多少、fwd = 往前多少、r = 頭部半徑 */
const HEAD_ANCHOR: Record<EnemyDef['model'], { up: number; fwd: number; r: number }> = {
  enemy_soldier: { up: 0.3, fwd: 0.03, r: 0.33 },
  enemy_robot_gunner: { up: 0.36, fwd: -0.04, r: 0.4 },
};

/** 頭盔模型：半球殼（依等級改變顏色與形狀）。單位是公尺，原點在頭部中心；headR 為頭部半徑，用來等比縮放 */
export function createHelmetMesh(level: number, headR: number): THREE.Group {
  const look = HELMET_LOOK[level] ?? HELMET_LOOK[1];
  const k = headR / 0.15;
  const g = new THREE.Group();
  g.name = 'helmet';
  const mat = new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.55 - look.metal * 0.3, metalness: look.metal });
  const R = 0.15 * k * look.r;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 12, 0, Math.PI * 2, 0, Math.PI * (look.visor ? 0.62 : 0.52)), mat);
  dome.position.y = 0.01 * k;
  g.add(dome);
  if (look.brim) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.12, R * 1.12, 0.012 * k, 20), mat);
    brim.position.y = 0.004 * k;
    const peak = new THREE.Mesh(new THREE.BoxGeometry(R * 1.1, 0.012 * k, R * 0.7), mat);
    peak.position.set(0, 0.004 * k, R * 0.95);
    g.add(brim, peak);
  } else {
    // 殼緣的加強環
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.97, 0.01 * k, 6, 24), new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.6, metalness: 0.5 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = (level >= 4 ? -0.062 : -0.003) * k;
    g.add(rim);
  }
  if (level >= 3) {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.02 * k, 0.012 * k, R * 1.7), new THREE.MeshStandardMaterial({ color: '#20242b', roughness: 0.5, metalness: 0.6 }));
    ridge.position.y = R * 0.97;
    g.add(ridge);
  }
  if (look.visor) {
    const visor = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.93, R * 0.93, 0.05 * k, 16, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
      new THREE.MeshStandardMaterial({ color: '#0d2b33', emissive: '#35e1ff', emissiveIntensity: 0.55, roughness: 0.2, metalness: 0.4, side: THREE.DoubleSide }),
    );
    visor.position.y = -0.03 * k;
    visor.rotation.y = Math.PI / 2;
    g.add(visor);
  }
  g.traverse((o) => { o.castShadow = false; o.frustumCulled = false; });
  return g;
}

/** 把頭盔掛到頭部骨骼（找不到骨骼就依身高放在模型根座標）；model 必須已經縮放並定位。回傳頭盔物件 */
function attachHelmet(root: THREE.Group, model: THREE.Object3D, level: number, def: EnemyDef): THREE.Group {
  const anchor = HEAD_ANCHOR[def.model];
  const helmet = createHelmetMesh(level, anchor.r);
  let head: THREE.Object3D | null = null;
  model.traverse((o) => { if (!head && (o as THREE.Bone).isBone && /^head$/i.test(o.name)) head = o; });
  root.updateMatrixWorld(true);
  if (!head) {
    helmet.position.set(0, def.height * 0.93, anchor.fwd);
    root.add(helmet);
    return helmet;
  }
  const bone = head as THREE.Object3D;
  const bw = new THREE.Vector3(), bq = new THREE.Quaternion(), bs = new THREE.Vector3();
  bone.matrixWorld.decompose(bw, bq, bs);
  // 頭部中心 = 骨骼原點 + HEAD_ANCHOR；換算成骨骼本地座標，並抵消骨骼的旋轉與縮放讓頭盔保持正立
  const center = bw.clone().add(new THREE.Vector3(0, anchor.up, anchor.fwd));
  helmet.position.copy(bone.worldToLocal(center));
  helmet.quaternion.copy(bq.clone().invert());
  helmet.scale.set(1 / bs.x, 1 / bs.y, 1 / bs.z);
  bone.add(helmet);
  return helmet;
}

export interface EnemyModelInstance {
  root: THREE.Group;
  /** 頭盔物件（沒戴頭盔為 null）；耐久歸零時由 Enemy 隱藏 */
  helmet: THREE.Group | null;
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
export async function createEnemyModel(def: EnemyDef, weaponId: string, castShadow: boolean, helmetLevel = 0): Promise<EnemyModelInstance> {
  const gltf = await preloadEnemyModel(def.model);
  if (!gltf) {
    const fb = fallbackBody(def);
    let helmet: THREE.Group | null = null;
    if (helmetLevel > 0) {
      helmet = createHelmetMesh(helmetLevel, 0.15 * (def.height / 1.8));
      helmet.position.y = def.height * 0.92 + 0.03;
      fb.add(helmet);
    }
    return { root: fb, helmet, anim: null, fallback: true };
  }
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
  const helmet = helmetLevel > 0 ? attachHelmet(root, model, helmetLevel, def) : null;
  return { root, helmet, anim: new EnemyAnim(model, gltf.animations, def.model), fallback: false };
}
