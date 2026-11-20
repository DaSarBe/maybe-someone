import * as THREE from 'three';
import { ATTACHMENTS, type SightKind, type WeaponMods } from '../data/attachments';
import type { ViewmodelStyle } from '../data/weaponHandling';
import { getAttachmentModel, type AttModel } from './AttachmentModels';
import { getWeaponModel } from './WeaponModels';

/**
 * 槍 + 配件的組裝（第一人稱 viewmodel 與改槍台的 3D 預覽共用）。
 * 座標：group 座標（公尺，槍管朝 -Z，+Y 向上，原點約在槍身中心）。
 * 配件的安裝點來自各槍模型的 mounts（combat/WeaponModels.ts），配件模型來自 combat/AttachmentModels.ts；
 * 沒有模型的配件（制退器、擴容彈匣）與機械瞄具的準星 / 照門用程式產生的簡單幾何。
 */

export interface Assembly {
  group: THREE.Group;
  /** 槍口（含槍口裝置）：曳光彈起點與火光位置 */
  muzzle: THREE.Vector3;
  /** 右手握把、左手托持的位置（手臂用） */
  grip: THREE.Vector3;
  fore: THREE.Vector3;
  /** 瞄準時隱藏的部件（槍托離鏡頭太近） */
  stocks: THREE.Object3D[];
  sight: SightKind;
  /** 瞄準線：照門（rear）與準星（front），瞄準時 rear 落在相機前方 eyeRelief 處、front 在視線上 */
  aim: { rear: THREE.Vector3; front: THREE.Vector3; eyeRelief: number };
  /** 紅點 / 全息 / 倍鏡的視窗（group 座標）；機械瞄具為 null */
  window: { center: THREE.Vector3; size: [number, number] } | null;
  /** 雷射 / 手電筒的發射點與方向（group 座標） */
  tactical: { kind: 'flashlight' | 'laser'; point: THREE.Vector3; dir: THREE.Vector3 } | null;
  /** 這次組裝建立的、需要在丟棄時釋放的幾何（程式產生的） */
  disposables: THREE.BufferGeometry[];
}

const mats = new Map<string, THREE.MeshLambertMaterial>();
const mat = (color: string): THREE.MeshLambertMaterial => {
  let m = mats.get(color);
  if (!m) mats.set(color, (m = new THREE.MeshLambertMaterial({ color })));
  return m;
};

const Z_FWD = new THREE.Vector3(0, 0, -1);

/** 方塊槍（模型載入失敗時的備用）的幾何與 mounts；與 Viewmodel 原本的方塊槍一致 */
function fallbackBody(style: ViewmodelStyle, g: THREE.Group): {
  muzzle: THREE.Vector3; grip: THREE.Vector3; fore: THREE.Vector3; stocks: THREE.Mesh[]; mounts: ReturnType<typeof boxMounts>;
} {
  const dark = '#2b2f36', mid = '#454c57', light = '#6b7482', wood = '#7a5230';
  const box = (color: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(color));
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
    return m;
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  switch (style) {
    case 'pistol':
      box(mid, 0.05, 0.06, 0.26, 0, 0, -0.12); box(dark, 0.045, 0.045, 0.1, 0, -0.01, -0.3); box(dark, 0.04, 0.1, 0.05, 0, -0.08, -0.03, 0.2);
      return { muzzle: V(0, -0.01, -0.36), grip: V(0, -0.1, -0.03), fore: V(0, -0.03, -0.1), stocks: [],
        mounts: boxMounts(V(0, 0.037, -0.02), V(0, 0.037, -0.22), V(0, 0.03, -0.12), V(0, -0.03, -0.2), 'down', V(0, -0.13, -0.03), V(0.04, 0.05, 0.05)) };
    case 'smg':
      box(dark, 0.055, 0.08, 0.34, 0, 0, -0.15); box(mid, 0.04, 0.04, 0.16, 0, 0, -0.4); box(dark, 0.035, 0.16, 0.05, 0, -0.12, -0.1);
      box(dark, 0.045, 0.1, 0.05, 0, -0.08, 0.05, 0.25); box(mid, 0.045, 0.06, 0.12, 0, 0, 0.1);
      return { muzzle: V(0, 0, -0.5), grip: V(0, -0.08, 0.03), fore: V(0, -0.0, -0.25), stocks: [],
        mounts: boxMounts(V(0, 0.055, -0.05), V(0, 0.055, -0.38), V(0, 0.04, -0.15), V(0, -0.02, -0.38), 'left', V(0, -0.2, -0.1), V(0.04, 0.06, 0.05)) };
    case 'rifle': {
      box(dark, 0.06, 0.09, 0.42, 0, 0, -0.1); box(mid, 0.05, 0.055, 0.34, 0, 0, -0.46); box(light, 0.022, 0.022, 0.2, 0, 0, -0.74);
      box(dark, 0.04, 0.14, 0.07, 0, -0.12, -0.05, 0.18); box(dark, 0.045, 0.1, 0.05, 0, -0.09, 0.06, 0.3);
      const stock = box(wood, 0.055, 0.1, 0.24, 0, -0.01, 0.28);
      return { muzzle: V(0, 0, -0.85), grip: V(0, -0.09, 0.06), fore: V(0, 0, -0.38), stocks: [stock],
        mounts: boxMounts(V(0, 0.065, 0.05), V(0, 0.07, -0.62), V(0, 0.045, -0.05), V(0, -0.03, -0.45), 'left', V(0, -0.19, -0.05), V(0.04, 0.08, 0.07)) };
    }
    case 'shotgun': {
      box(wood, 0.06, 0.09, 0.4, 0, 0, -0.05); box(light, 0.034, 0.034, 0.62, 0, 0.02, -0.55); box(dark, 0.03, 0.03, 0.55, 0, -0.025, -0.5);
      box(wood, 0.065, 0.06, 0.18, 0, -0.03, -0.42);
      const stock = box(wood, 0.055, 0.11, 0.26, 0, -0.01, 0.3);
      return { muzzle: V(0, 0.02, -0.88), grip: V(0, -0.02, 0.08), fore: V(0, -0.03, -0.42), stocks: [stock],
        mounts: boxMounts(V(0, 0.05, -0.1), V(0, 0.05, -0.85), V(0, 0.045, -0.05), V(0, -0.05, -0.42), 'left', V(0, -0.1, -0.05), V(0.04, 0.05, 0.05)) };
    }
  }
}

function boxMounts(rear: THREE.Vector3, front: THREE.Vector3, rail: THREE.Vector3, grip: THREE.Vector3, tacDir: 'left' | 'down', mag: THREE.Vector3, magSize: THREE.Vector3) {
  return { rear, front, rail, grip, tac: grip.clone().add(new THREE.Vector3(0, 0.01, 0.0)), tacDir, mag, magSize };
}

/** 機械瞄具的瞄準線比槍身上緣高出的高度（公尺）：準星與照門立在槍身上，瞄準線穿過它們的頂端 */
export const IRON_LIFT = 0.018;

/**
 * 機械瞄具：準星（柱 + 白色準星點）與照門（兩側立柱，中間留缺口）。
 * rear / front 是槍身上的底座位置；瞄準線在它們上方 IRON_LIFT，穿過缺口與準星頂端。
 */
function ironSights(rear: THREE.Vector3, front: THREE.Vector3, g: THREE.Group, disposables: THREE.BufferGeometry[]): void {
  const add = (color: string, sx: number, sy: number, sz: number, x: number, y: number, z: number): void => {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    disposables.push(geo);
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    g.add(m);
  };
  const L = IRON_LIFT;
  // 準星：柱子（底部埋進槍身）+ 頂端的白色準星點，頂端剛好在瞄準線上
  add('#2c3037', 0.011, L + 0.012, 0.012, front.x, front.y + (L - 0.012) / 2 - 0.0, front.z);
  add('#f4f7ff', 0.0075, 0.0075, 0.012, front.x, front.y + L - 0.0035, front.z);
  // 照門：左右兩根柱子（頂端比瞄準線高 5mm）+ 底座，缺口寬 2.4cm
  const h = L + 0.014;
  add('#1d2025', 0.009, h, 0.012, rear.x - 0.0165, rear.y + (h - 0.012) / 2 - 0.0, rear.z);
  add('#1d2025', 0.009, h, 0.012, rear.x + 0.0165, rear.y + (h - 0.012) / 2 - 0.0, rear.z);
  add('#22252b', 0.045, 0.008, 0.014, rear.x, rear.y + 0.0, rear.z);
}

/** 制退器：圓柱 + 排氣槽（深色環） */
function brake(g: THREE.Group, at: THREE.Vector3, disposables: THREE.BufferGeometry[]): number {
  const L = 0.07, R = 0.0165;
  const body = new THREE.CylinderGeometry(R, R, L, 12);
  body.rotateX(Math.PI / 2);
  disposables.push(body);
  const m = new THREE.Mesh(body, mat('#3d434b'));
  m.position.set(at.x, at.y, at.z - L / 2);
  g.add(m);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.CylinderGeometry(R * 1.08, R * 1.08, 0.008, 12);
    ring.rotateX(Math.PI / 2);
    disposables.push(ring);
    const r = new THREE.Mesh(ring, mat('#15171a'));
    r.position.set(at.x, at.y, at.z - 0.02 - i * 0.02);
    g.add(r);
  }
  return L;
}

/** 擴容彈匣：往下延伸的加長彈匣 */
function extMag(g: THREE.Group, at: THREE.Vector3, size: THREE.Vector3, disposables: THREE.BufferGeometry[]): void {
  const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
  disposables.push(geo);
  const m = new THREE.Mesh(geo, mat('#1f2328'));
  m.position.set(at.x, at.y - size.y / 2, at.z);
  g.add(m);
  const band = new THREE.BoxGeometry(size.x * 1.08, size.y * 0.14, size.z * 1.08);
  disposables.push(band);
  const b = new THREE.Mesh(band, mat('#4ade80'));
  b.position.set(at.x, at.y - size.y * 0.8, at.z);
  g.add(b);
}

/** 組裝一把槍。需要的模型尚未載入時用備用幾何（模型載入後請重新組裝） */
export function buildAssembly(style: ViewmodelStyle, mods: WeaponMods | undefined): Assembly {
  const m: WeaponMods = mods ?? {};
  const g = new THREE.Group();
  const disposables: THREE.BufferGeometry[] = [];
  const body = getWeaponModel(style);
  let muzzle: THREE.Vector3, grip: THREE.Vector3, fore: THREE.Vector3;
  let stocks: THREE.Object3D[];
  let mounts: NonNullable<ReturnType<typeof getWeaponModel>>['mounts'];
  if (body) {
    g.add(body.group);
    muzzle = body.muzzle.clone(); grip = body.grip.clone(); fore = body.fore.clone();
    stocks = body.stocks;
    mounts = body.mounts;
  } else {
    const fb = fallbackBody(style, g);
    muzzle = fb.muzzle; grip = fb.grip; fore = fb.fore; stocks = fb.stocks; mounts = fb.mounts;
  }

  const place = (id: string, at: THREE.Vector3, rotZ = 0): AttModel | null => {
    const att = getAttachmentModel(id);
    if (!att) return null;
    att.group.position.copy(at);
    att.group.rotation.z = rotZ;
    g.add(att.group);
    return att;
  };

  // ---- 瞄具 ----
  let sight: SightKind = 'iron';
  let window: Assembly['window'] = null;
  let rear = mounts.rear.clone();
  let front = mounts.front.clone();
  let eyeRelief = 0.2;
  const sightAtt = m.sight ? ATTACHMENTS[m.sight] : undefined;
  if (sightAtt?.sight && m.sight) {
    sight = sightAtt.sight;
    const att = place(m.sight, mounts.rail);
    if (att?.window) {
      const c = att.window.clone().add(mounts.rail);
      window = { center: c, size: att.windowSize ?? [0.02, 0.02] };
    } else {
      // 模型沒載入：方塊瞄具
      const geo = new THREE.BoxGeometry(0.035, 0.05, sight === 'scope' ? 0.22 : 0.08);
      disposables.push(geo);
      const b = new THREE.Mesh(geo, mat('#1f2328'));
      b.position.copy(mounts.rail).add(new THREE.Vector3(0, 0.03, 0));
      g.add(b);
      window = { center: mounts.rail.clone().add(new THREE.Vector3(0, 0.03, sight === 'scope' ? 0.11 : 0.04)), size: [0.025, 0.025] };
    }
    rear = window.center.clone();
    front = rear.clone().add(Z_FWD);
    eyeRelief = sight === 'scope' ? 0.07 : 0.13;
  } else {
    ironSights(mounts.rear, mounts.front, g, disposables);
    rear = mounts.rear.clone().add(new THREE.Vector3(0, IRON_LIFT, 0));
    front = mounts.front.clone().add(new THREE.Vector3(0, IRON_LIFT, 0));
  }

  // ---- 槍口 ----
  const tipOfMuzzle = muzzle.clone();
  if (m.muzzle === 'att_suppressor') {
    const att = place('att_suppressor', muzzle);
    if (att?.tip) tipOfMuzzle.add(att.tip);
    else {
      const geo = new THREE.CylinderGeometry(0.018, 0.018, 0.2, 12);
      geo.rotateX(Math.PI / 2);
      disposables.push(geo);
      const mesh = new THREE.Mesh(geo, mat('#1e2126'));
      mesh.position.set(muzzle.x, muzzle.y, muzzle.z - 0.1);
      g.add(mesh);
      tipOfMuzzle.z -= 0.2;
    }
  } else if (m.muzzle === 'att_brake') {
    tipOfMuzzle.z -= brake(g, muzzle, disposables);
  }

  // ---- 握把 ----
  if (m.grip === 'att_grip') {
    if (!place('att_grip', mounts.grip)) {
      const geo = new THREE.BoxGeometry(0.03, 0.09, 0.03);
      disposables.push(geo);
      const mesh = new THREE.Mesh(geo, mat('#2b3038'));
      mesh.position.copy(mounts.grip).add(new THREE.Vector3(0, -0.045, 0));
      g.add(mesh);
    }
  }

  // ---- 彈匣 ----
  if (m.mag === 'att_extmag') extMag(g, mounts.mag, mounts.magSize, disposables);

  // ---- 戰術裝備 ----
  let tactical: Assembly['tactical'] = null;
  if (m.tactical) {
    const kind = ATTACHMENTS[m.tactical]?.tactical ?? 'flashlight';
    const rotZ = mounts.tacDir === 'left' ? Math.PI / 2 : Math.PI;
    const att = place(m.tactical, mounts.tac, rotZ);
    const tip = att?.tip ? att.tip.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), rotZ).add(mounts.tac) : mounts.tac.clone().add(new THREE.Vector3(0, 0, -0.06));
    if (!att) {
      const geo = new THREE.BoxGeometry(0.03, 0.03, 0.08);
      disposables.push(geo);
      const mesh = new THREE.Mesh(geo, mat(kind === 'laser' ? '#8a2020' : '#cfc9a0'));
      mesh.position.copy(tip);
      g.add(mesh);
    }
    tactical = { kind, point: tip, dir: Z_FWD.clone() };
  }

  return { group: g, muzzle: tipOfMuzzle, grip, fore, stocks, sight, aim: { rear, front, eyeRelief }, window, tactical, disposables };
}

/** 瞄準姿勢：讓瞄準線的 rear 落在相機前方 eyeRelief（公尺，未縮放前的 viewmodel 座標）、整條線落在視線上。回傳 holder 的位置與繞 X 的俯仰角 */
export function adsPoseOf(a: Assembly, scale: number): { position: THREE.Vector3; pitch: number } {
  const dir = a.aim.front.clone().sub(a.aim.rear).normalize();
  // dir 抬頭多少（+ = 準星比照門高）；整支槍往下點同樣的角度，瞄準線才會水平
  const up = Math.atan2(dir.y, -dir.z);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -up);
  const r = a.aim.rear.clone().multiplyScalar(scale).applyQuaternion(q);
  return { position: new THREE.Vector3(0, 0, -a.aim.eyeRelief).sub(r), pitch: -up };
}

export function disposeAssembly(a: Assembly): void {
  for (const geo of a.disposables) geo.dispose();
  a.disposables.length = 0;
}
