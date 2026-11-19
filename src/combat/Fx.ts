import * as THREE from 'three';
import type { Surface } from '../world/Surface';

const MAX_PARTICLES = 220;
const MAX_DECALS = 64;
const MAX_TRACERS = 24;
const MAX_FLASHES = 6;

type ImpactKind = Surface | 'flesh';

interface Burst { color: THREE.Color; count: number; speed: number; life: number; gravity: number }
const mk = (hex: string, count: number, speed: number, life: number, gravity: number): Burst => ({ color: new THREE.Color(hex), count, speed, life, gravity });
const BURSTS: Record<ImpactKind, Burst> = {
  concrete: mk('#c9c6bd', 7, 3.2, 0.45, 9), tile: mk('#ece8da', 7, 3.2, 0.45, 9),
  metal: mk('#ffcf6b', 9, 5.5, 0.28, 12), metal_hollow: mk('#ffcf6b', 9, 5.5, 0.28, 12), metal_grate: mk('#ffcf6b', 8, 5.5, 0.28, 12),
  wood: mk('#b98b52', 7, 3.0, 0.5, 9), grass: mk('#5c9a47', 6, 2.4, 0.5, 8), dirt: mk('#8a6a46', 7, 2.6, 0.5, 8),
  sand: mk('#e1cb8a', 7, 2.4, 0.55, 7), gravel: mk('#9a948b', 8, 3.4, 0.45, 9), water: mk('#cfeeff', 8, 3.6, 0.5, 9),
  carpet: mk('#8a3040', 5, 2, 0.4, 8), flesh: mk('#b01818', 9, 3.4, 0.5, 10),
};

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,230,1)');
  grad.addColorStop(0.25, 'rgba(255,200,90,0.9)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function decalTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(10,10,10,0.95)');
  grad.addColorStop(0.45, 'rgba(25,25,25,0.7)');
  grad.addColorStop(1, 'rgba(25,25,25,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Tracer { mesh: THREE.Mesh; from: THREE.Vector3; dir: THREE.Vector3; total: number; t: number; active: boolean }
interface Flash { sprite: THREE.Sprite; life: number }

/**
 * 世界空間的戰鬥特效（玩家與敵人共用）：槍口火光（sprite + 一盞預先加入、強度歸零的點光源，
 * 避免臨時加燈造成材質重編譯）、曳光彈、彈著粒子、彈孔貼花（上限 64，循環使用）。
 */
export class CombatFx {
  private tracers: Tracer[] = [];
  private flashes: Flash[] = [];
  private flashLight = new THREE.PointLight('#ffb25a', 0, 14, 2);
  private flashLightLife = 0;
  private points: THREE.Points;
  private pPos = new Float32Array(MAX_PARTICLES * 3);
  private pCol = new Float32Array(MAX_PARTICLES * 3);
  private pVel = new Float32Array(MAX_PARTICLES * 3);
  private pLife = new Float32Array(MAX_PARTICLES);
  private pGrav = new Float32Array(MAX_PARTICLES);
  private pCount = 0;
  private decals: THREE.Mesh[] = [];
  private decalNext = 0;
  private decalGeo = new THREE.PlaneGeometry(0.14, 0.14);
  private decalMat: THREE.MeshBasicMaterial;
  private tmpQ = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();
  private static Z = new THREE.Vector3(0, 0, 1);
  private tracerGeo = new THREE.BoxGeometry(1, 1, 1);
  private tracerMat = new THREE.MeshBasicMaterial({ color: '#ffe7a3', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  private enemyTracerMat = new THREE.MeshBasicMaterial({ color: '#ff9a6a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  readonly root = new THREE.Group();
  /** 目前活著的粒子 + 貼花 + 曳光彈數量（除錯用） */
  get activeCount(): number { return this.pCount; }

  constructor(scene: THREE.Scene) {
    this.root.name = 'combatFx';
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    geo.setDrawRange(0, 0);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.075, vertexColors: true, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
    this.root.add(this.points);

    this.decalMat = new THREE.MeshBasicMaterial({
      map: decalTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const tex = glowTexture();
    for (let i = 0; i < MAX_FLASHES; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false;
      this.root.add(s);
      this.flashes.push({ sprite: s, life: 0 });
    }
    for (let i = 0; i < MAX_TRACERS; i++) {
      const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
      m.visible = false;
      m.frustumCulled = false;
      this.root.add(m);
      this.tracers.push({ mesh: m, from: new THREE.Vector3(), dir: new THREE.Vector3(), total: 0, t: 0, active: false });
    }
    this.root.add(this.flashLight);
    scene.add(this.root);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.decalGeo.dispose();
    this.decalMat.dispose();
  }

  /** 槍口火光：sprite + 短暫點光源 */
  muzzleFlash(pos: THREE.Vector3, size = 0.5): void {
    const f = this.flashes.find((x) => x.life <= 0) ?? this.flashes[0];
    f.sprite.position.copy(pos);
    f.sprite.scale.setScalar(size * (0.8 + Math.random() * 0.5));
    f.sprite.material.rotation = Math.random() * Math.PI;
    f.sprite.visible = true;
    f.life = 0.055;
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 14;
    this.flashLightLife = 0.06;
  }

  /** 曳光彈：從 from 沿 dir 飛 total 公尺 */
  tracer(from: THREE.Vector3, to: THREE.Vector3, enemy = false): void {
    const t = this.tracers.find((x) => !x.active);
    if (!t) return;
    t.from.copy(from);
    t.dir.subVectors(to, from);
    t.total = t.dir.length();
    if (t.total < 0.5) return;
    t.dir.divideScalar(t.total);
    t.t = 0;
    t.active = true;
    t.mesh.material = enemy ? this.enemyTracerMat : this.tracerMat;
    t.mesh.visible = true;
  }

  /** 彈著：粒子（依材質變色）；非人體另外留下彈孔 */
  impact(point: THREE.Vector3, normal: THREE.Vector3 | undefined, kind: ImpactKind): void {
    const b = BURSTS[kind];
    const n = normal ?? this.tmpV.set(0, 1, 0);
    for (let i = 0; i < b.count && this.pCount < MAX_PARTICLES; i++) {
      const k = this.pCount++;
      this.pPos[k * 3] = point.x + n.x * 0.03; this.pPos[k * 3 + 1] = point.y + n.y * 0.03; this.pPos[k * 3 + 2] = point.z + n.z * 0.03;
      const sp = b.speed * (0.4 + Math.random() * 0.8);
      this.pVel[k * 3] = (n.x + (Math.random() - 0.5) * 1.3) * sp;
      this.pVel[k * 3 + 1] = (n.y + (Math.random() - 0.3) * 1.3) * sp;
      this.pVel[k * 3 + 2] = (n.z + (Math.random() - 0.5) * 1.3) * sp;
      this.pLife[k] = b.life * (0.6 + Math.random() * 0.6);
      this.pGrav[k] = b.gravity;
      const v = 0.8 + Math.random() * 0.4;
      this.pCol[k * 3] = b.color.r * v; this.pCol[k * 3 + 1] = b.color.g * v; this.pCol[k * 3 + 2] = b.color.b * v;
    }
    if (kind !== 'flesh' && kind !== 'water' && normal) this.decal(point, normal);
  }

  private decal(point: THREE.Vector3, normal: THREE.Vector3): void {
    let m = this.decals[this.decalNext];
    if (!m) {
      m = new THREE.Mesh(this.decalGeo, this.decalMat);
      m.frustumCulled = true;
      this.root.add(m);
      this.decals[this.decalNext] = m;
    }
    this.decalNext = (this.decalNext + 1) % MAX_DECALS;
    m.position.copy(point).addScaledVector(normal, 0.012);
    this.tmpQ.setFromUnitVectors(CombatFx.Z, normal);
    m.quaternion.copy(this.tmpQ);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(0.7 + Math.random() * 0.7);
    m.visible = true;
  }

  get decalCount(): number { return this.decals.length; }

  update(dt: number): void {
    // 火光
    for (const f of this.flashes) {
      if (f.life > 0) { f.life -= dt; if (f.life <= 0) f.sprite.visible = false; }
    }
    if (this.flashLightLife > 0) {
      this.flashLightLife -= dt;
      this.flashLight.intensity = Math.max(0, this.flashLightLife / 0.06) * 14;
    }
    // 曳光彈
    const SPEED = 240, LEN = 3.5;
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.t += dt;
      const head = SPEED * t.t;
      const tail = Math.max(0, head - LEN);
      if (tail >= t.total) { t.active = false; t.mesh.visible = false; continue; }
      const a = Math.min(head, t.total), c = (a + tail) / 2;
      t.mesh.position.copy(t.from).addScaledVector(t.dir, c);
      t.mesh.scale.set(0.018, 0.018, Math.max(0.05, a - tail));
      t.mesh.lookAt(this.tmpV.copy(t.from).addScaledVector(t.dir, t.total));
    }
    // 粒子（壓縮活著的到前面）
    let w = 0;
    for (let r = 0; r < this.pCount; r++) {
      const life = this.pLife[r] - dt;
      if (life <= 0) continue;
      const i3 = r * 3, o3 = w * 3;
      this.pVel[i3 + 1] -= this.pGrav[r] * dt;
      this.pPos[o3] = this.pPos[i3] + this.pVel[i3] * dt;
      this.pPos[o3 + 1] = this.pPos[i3 + 1] + this.pVel[i3 + 1] * dt;
      this.pPos[o3 + 2] = this.pPos[i3 + 2] + this.pVel[i3 + 2] * dt;
      if (w !== r) {
        this.pVel[o3] = this.pVel[i3]; this.pVel[o3 + 1] = this.pVel[i3 + 1]; this.pVel[o3 + 2] = this.pVel[i3 + 2];
        this.pCol[o3] = this.pCol[i3]; this.pCol[o3 + 1] = this.pCol[i3 + 1]; this.pCol[o3 + 2] = this.pCol[i3 + 2];
        this.pGrav[w] = this.pGrav[r];
      }
      this.pLife[w] = life;
      w++;
    }
    this.pCount = w;
    const geo = this.points.geometry;
    geo.setDrawRange(0, w);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
}
