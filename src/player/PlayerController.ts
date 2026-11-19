import * as THREE from 'three';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import type { Input } from '../core/Input';
import type { GameBus, StepIntensity } from '../core/EventBus';
import { getSurfaceAt, type Surface, DEFAULT_SURFACE } from '../world/Surface';
import { canSprintAtWeight, weightSpeedFactor } from '../items/Inventory';

// ---- 參數（公尺 / 秒）----
const RADIUS = 0.35;
const STAND_H = 1.75;
const CROUCH_H = 1.0;
const EYE_STAND = 1.62;
const EYE_CROUCH = 0.88;
const WALK_SPEED = 4.0;
const SPRINT_SPEED = 7.0;
const CROUCH_SPEED = 1.9;
const GRAVITY = 22;
const JUMP_V = 6.8;
const STEP_MIN = 0.05;      // 小於此高度的門檻/接縫不算台階，球體直接滾過去
const STEP_H = 0.45;        // 可直接走上去的最大台階
const SNAP_DIST = 0.4;      // 下樓梯/下坡時貼地距離
const STEP_SMOOTH_TAU = 0.1;   // 上台階 / 貼地下階的鏡頭高度差，以此時間常數指數衰減（秒）
const STEP_GRACE = 0.3;        // 剛上台階的最長寬限（秒）：重心越過邊緣、腳下偵測到踏面就會提早結束
const SNAP_SMOOTH_MIN = 0.04;  // 貼地下降超過此高度才記入鏡頭平滑（避免斜坡上持續落後）
const WALKABLE_NY = 0.7;    // 法線 y 大於此值視為可站立的地面
const STRIDE: Record<StepIntensity, number> = { sprint: 1.7, walk: 2.0, crouch: 2.6 };

export interface PlayerState {
  grounded: boolean;
  crouching: boolean;
  sprinting: boolean;
  moving: boolean;
  speed: number;
}

export class PlayerController {
  readonly camera: THREE.PerspectiveCamera;
  readonly state: PlayerState = { grounded: false, crouching: false, sprinting: false, moving: false, speed: 0 };
  /** 目前腳下材質（約 10Hz 更新） */
  surface: Surface = DEFAULT_SURFACE;

  private octree: Octree | null = null;
  private surfaceMeshes: THREE.Object3D[] = [];
  private capsule = new Capsule(new THREE.Vector3(0, RADIUS, 0), new THREE.Vector3(0, STAND_H - RADIUS, 0), RADIUS);
  private vel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;

  private prevPos = new THREE.Vector3();
  private curPos = new THREE.Vector3();
  private eye = EYE_STAND;
  private airTime = 0;
  private stepAccum = 0;
  private surfaceTimer = 0;
  private bobPhase = 0;
  private bobAmp = 0;
  private raycaster = new THREE.Raycaster();
  private weightProvider: (() => number) | null = null;
  private weightTimer = 0;

  // 暫存物件，避免每幀配置
  private tmpV = new THREE.Vector3();
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpVel = new THREE.Vector3();
  private stepGrace = 0;
  /** resolve() 這輪是否撞到不可站立的面（牆、台階立面） */
  private hitWall = false;
  /** 鏡頭高度補償：上台階為負、貼地下階為正，每個物理步指數衰減；跳躍/墜落不套用 */
  private stepOffset = 0;
  private prevStepOffset = 0;
  private tmpN = new THREE.Vector3();
  private stepRay = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  private tmpMove = new THREE.Vector2();
  private tmpLook = new THREE.Vector2();
  private tmpCapsule = new Capsule(new THREE.Vector3(), new THREE.Vector3(), RADIUS);

  constructor(
    private input: Input,
    private bus: GameBus,
    camera: THREE.PerspectiveCamera,
  ) {
    this.camera = camera;
    this.camera.rotation.order = 'YXZ';
  }

  /** 負重比例來源（EconomyService.getWeightRatio）：80% 開始變慢，100% 不能衝刺 */
  setWeightProvider(fn: (() => number) | null): void {
    this.weightProvider = fn;
  }

  /** 目前負重比例（供 HUD） */
  weightRatio = 0;

  setWorld(octree: Octree, surfaceMeshes: THREE.Object3D[]): void {
    this.octree = octree;
    this.surfaceMeshes = surfaceMeshes;
  }

  /** 腳底位置 */
  get position(): THREE.Vector3 {
    return this.curPos;
  }

  get facingYaw(): number {
    return this.yaw;
  }

  teleport(pos: THREE.Vector3, yaw = this.yaw): void {
    this.capsule.start.set(pos.x, pos.y + RADIUS, pos.z);
    this.capsule.end.set(pos.x, pos.y + STAND_H - RADIUS, pos.z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.state.crouching = false;
    this.eye = EYE_STAND;
    this.airTime = 0;
    this.stepOffset = 0;
    this.prevStepOffset = 0;
    this.stepGrace = 0;
    this.syncPos();
    this.prevPos.copy(this.curPos);
  }

  private syncPos(): void {
    this.curPos.set(this.capsule.start.x, this.capsule.start.y - RADIUS, this.capsule.start.z);
  }

  // ---------------------------------------------------------------- 物理更新
  update(dt: number): void {
    if (!this.octree) return;
    const st = this.state;
    const input = this.input;
    this.prevPos.copy(this.curPos);
    this.prevStepOffset = this.stepOffset;
    this.stepOffset *= Math.exp(-dt / STEP_SMOOTH_TAU);
    if (Math.abs(this.stepOffset) < 1e-4) this.stepOffset = 0;
    this.stepGrace = Math.max(0, this.stepGrace - dt);

    // 蹲下 / 起身（起身前檢查頭頂）
    this.updateCrouch(input.isDown('crouch'));

    // 目標水平速度
    const mv = input.getMove(this.tmpMove);
    const mag = mv.length();
    this.weightTimer -= dt;
    if (this.weightTimer <= 0) {
      this.weightTimer = 0.25;
      this.weightRatio = this.weightProvider ? this.weightProvider() : 0;
    }
    st.sprinting = input.isDown('sprint') && !st.crouching && mv.y > 0.3 && canSprintAtWeight(this.weightRatio);
    const maxSpeed = (st.crouching ? CROUCH_SPEED : st.sprinting ? SPRINT_SPEED : WALK_SPEED) * weightSpeedFactor(this.weightRatio);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward = (-sin, -cos)；right = (cos, -sin)
    const wx = (-sin * mv.y + cos * mv.x) * maxSpeed;
    const wz = (-cos * mv.y - sin * mv.x) * maxSpeed;
    const accel = st.grounded ? 14 : 2.5;
    const k = Math.min(1, accel * dt);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;
    if (mag < 0.01 && st.grounded) { this.vel.x *= 1 - Math.min(1, 6 * dt); this.vel.z *= 1 - Math.min(1, 6 * dt); }

    // 跳躍
    if (input.consumePress('jump') && st.grounded) {
      if (st.crouching) this.updateCrouch(false);
      if (!st.crouching) {
        this.vel.y = JUMP_V;
        st.grounded = false;
        this.stepGrace = 0;
      }
    }

    const wasGrounded = st.grounded;
    // 剛上台階：球體滾過台階邊緣時碰撞法線會帶出向上的速度，會讓人浮高再落下，清掉
    if (this.stepGrace > 0 && this.vel.y > 0) this.vel.y = 0;
    this.vel.y -= GRAVITY * dt;

    // 水平移動（含上台階）
    // 剛離地一瞬間（球體滾過台階邊緣被彈起）也允許上台階；跳躍起跳的上升速度遠大於此門檻
    this.moveHorizontal(this.vel.x * dt, this.vel.z * dt, wasGrounded || (this.airTime < 0.1 && this.vel.y < 3));

    // 垂直移動
    this.capsule.translate(this.tmpV.set(0, this.vel.y * dt, 0));
    const fallSpeed = -this.vel.y;
    let floor = this.resolve();

    // 貼地（下樓梯、下坡）：原本踩地、現在懸空且沒在上升，就貼回腳下的地面
    if (!floor && wasGrounded && this.stepGrace <= 0 && this.vel.y <= 0) {
      const y0 = this.capsule.start.y;
      floor = this.snapDown();
      const drop = y0 - this.capsule.start.y;
      if (floor && drop > SNAP_SMOOTH_MIN) this.stepOffset += drop; // 鏡頭留在原高度，再慢慢追上
    }
    // 邊緣支撐：膠囊球體卡在台階邊緣時，接觸法線不夠垂直，改用向下射線判定踩地
    if (!floor && this.vel.y <= 0) {
      floor = this.groundProbe();
      // 重心已經越過台階邊緣、腳下真的有踏面了：不需要再靠寬限期硬撐
      if (floor) this.stepGrace = 0;
    }
    // 剛上台階的短暫期間視為踩地，讓玩家能前進到台階上方
    if (!floor && this.stepGrace > 0 && this.vel.y <= 0) { floor = true; this.vel.y = 0; }

    st.grounded = floor;
    if (floor) {
      if (wasGrounded === false && this.airTime > 0.12 && fallSpeed > 2) {
        this.bus.emit('land', { surface: this.sampleSurface(), fallSpeed });
      }
      this.airTime = 0;
    } else {
      this.airTime += dt;
    }

    this.syncPos();

    // 水平速度與腳步
    const dx = this.curPos.x - this.prevPos.x, dz = this.curPos.z - this.prevPos.z;
    const dist = Math.hypot(dx, dz);
    st.speed = dist / dt;
    st.moving = st.grounded && st.speed > 0.5;
    const intensity: StepIntensity = st.crouching ? 'crouch' : st.sprinting ? 'sprint' : 'walk';
    if (st.moving) {
      this.stepAccum += dist;
      const stride = STRIDE[intensity];
      if (this.stepAccum >= stride) {
        this.stepAccum -= stride;
        const surface = this.sampleSurface();
        this.bus.emit('footstep', { surface, intensity, position: this.curPos.clone() });
      }
      this.bobPhase += (dist / STRIDE[intensity]) * Math.PI;
    } else if (st.speed < 0.3) {
      this.stepAccum = Math.max(this.stepAccum, STRIDE[intensity] * 0.6);
    }

    // 材質取樣（HUD 用，10Hz）
    this.surfaceTimer -= dt;
    if (this.surfaceTimer <= 0) {
      this.surfaceTimer = 0.1;
      this.sampleSurface();
    }
  }

  private updateCrouch(want: boolean): void {
    const st = this.state;
    if (want && !st.crouching) {
      st.crouching = true;
      this.capsule.end.y = this.capsule.start.y + CROUCH_H - 2 * RADIUS;
    } else if (!want && st.crouching) {
      // 以略微抬高的站立膠囊測試頭頂空間
      const t = this.tmpCapsule;
      t.start.copy(this.capsule.start); t.start.y += 0.02;
      t.end.copy(this.capsule.start); t.end.y += STAND_H - 2 * RADIUS + 0.02;
      if (!this.octree!.capsuleIntersect(t)) {
        st.crouching = false;
        this.capsule.end.y = this.capsule.start.y + STAND_H - 2 * RADIUS;
      }
    }
  }

  /** 把膠囊推出碰撞；回傳是否踩到可站立地面 */
  private resolve(): boolean {
    let floor = false;
    this.hitWall = false;
    for (let i = 0; i < 4; i++) {
      const r = this.octree!.capsuleIntersect(this.capsule);
      if (!r) break;
      if (r.normal.y > WALKABLE_NY) {
        // 可走斜面：垂直推出，避免在斜坡上滑動
        floor = true;
        this.capsule.translate(this.tmpV.set(0, r.depth / r.normal.y, 0));
        if (this.vel.y < 0) this.vel.y = 0;
      } else {
        this.hitWall = true;
        this.capsule.translate(this.tmpV.copy(r.normal).multiplyScalar(r.depth));
        const vn = this.vel.dot(r.normal);
        if (vn < 0) this.vel.addScaledVector(r.normal, -vn);
        // 剛上台階時，膠囊球體滾過邊緣的接觸法線較斜，也視為踩地，避免被重力拉回去
        if (this.stepGrace > 0 && r.normal.y > 0.12) {
          floor = true;
          if (this.vel.y < 0) this.vel.y = 0;
        }
      }
    }
    return floor;
  }

  private moveHorizontal(dx: number, dz: number, grounded: boolean): void {
    if (dx === 0 && dz === 0) return;
    const cap = this.capsule;
    const a = this.tmpA.copy(cap.start), b = this.tmpB.copy(cap.end);
    const vx0 = this.vel.x, vz0 = this.vel.z;
    cap.translate(this.tmpV.set(dx, 0, dz));
    this.resolve();
    // 沒有撞到牆/立面就不需要找台階（斜坡由 resolve 的垂直推出處理）
    if (!grounded || !this.hitWall) return;

    const want = Math.hypot(dx, dz);
    const moved1 = Math.hypot(cap.start.x - a.x, cap.start.z - a.z);

    // 被擋住：在前方探測台階頂面，若高度差在可跨越範圍內就把膠囊抬高再前進
    const feetY = a.y - RADIUS;
    const reach = RADIUS + 0.06;
    this.stepRay.origin.set(a.x + (dx / want) * reach, feetY + STEP_H + 0.02, a.z + (dz / want) * reach);
    const hit = this.octree!.rayIntersect(this.stepRay);
    if (!hit || hit.distance > STEP_H + 0.04) return;
    const gain = hit.position.y - feetY;
    if (gain < STEP_MIN || gain > STEP_H) return;
    if (Math.abs(hit.triangle.getNormal(this.tmpN).y) < WALKABLE_NY) return;

    const s1x = cap.start.x, s1y = cap.start.y, s1z = cap.start.z, e1y = cap.end.y;
    const vAfter1 = this.tmpVel.copy(this.vel);
    cap.start.copy(a); cap.end.copy(b);
    cap.translate(this.tmpV.set(0, gain + 0.005, 0));
    let ok = !this.octree!.capsuleIntersect(cap);
    if (ok) {
      cap.translate(this.tmpV.set(dx, 0, dz));
      this.resolve();
      // 抬高後走得更遠，或抬高後完全沒有被擋（球體滾過邊緣時，原高度的滑動距離看起來幾乎不減，但速度會被削掉）
      ok = !this.hitWall || Math.hypot(cap.start.x - a.x, cap.start.z - a.z) > moved1 + 0.002;
    }
    if (!ok) {
      cap.start.set(s1x, s1y, s1z);
      cap.end.set(s1x, e1y, s1z);
      this.vel.copy(vAfter1);
    } else {
      this.stepGrace = STEP_GRACE;
      // 台階立面造成的速度削減不算數：還原成移動前的水平速度
      this.vel.x = vx0; this.vel.z = vz0;
      this.vel.y = Math.min(this.vel.y, 0); // 球體滾過邊緣帶出的向上速度也不要
      // 鏡頭不跟著瞬間抬高，改由 stepOffset 平滑追上
      this.stepOffset -= cap.start.y - a.y;
    }
  }

  private groundProbe(): boolean {
    const feetY = this.capsule.start.y - RADIUS;
    this.stepRay.origin.set(this.capsule.start.x, feetY + 0.05, this.capsule.start.z);
    const hit = this.octree!.rayIntersect(this.stepRay);
    if (!hit || hit.distance > 0.12) return false;
    if (Math.abs(hit.triangle.getNormal(this.tmpN).y) < WALKABLE_NY) return false;
    if (this.vel.y < 0) this.vel.y = 0;
    return true;
  }

  /**
   * 貼地（下樓梯、下坡）：用向下射線找 SNAP_DIST 內的可站立地面，直接降到那個高度。
   * 不把膠囊整個壓進地面再推出，避免深穿透時碰到三角形內部邊而得到歪斜的法線。
   */
  private snapDown(): boolean {
    const cap = this.capsule;
    const feetY = cap.start.y - RADIUS;
    this.stepRay.origin.set(cap.start.x, feetY + 0.05, cap.start.z);
    const hit = this.octree!.rayIntersect(this.stepRay);
    if (!hit) return false;
    const drop = hit.distance - 0.05;
    if (drop > SNAP_DIST || Math.abs(hit.triangle.getNormal(this.tmpN).y) < WALKABLE_NY) return false;
    if (drop > 0) cap.translate(this.tmpV.set(0, -drop, 0));
    this.resolve();
    if (this.vel.y < 0) this.vel.y = 0;
    return true;
  }

  /** 向下射線取得腳下材質 */
  private sampleSurface(): Surface {
    this.raycaster.set(this.tmpV.set(this.curPos.x, this.curPos.y + 0.3, this.curPos.z), DOWN);
    this.raycaster.far = 1.2;
    const hits = this.raycaster.intersectObjects(this.surfaceMeshes, false);
    this.surface = hits.length ? getSurfaceAt(hits[0].object) : DEFAULT_SURFACE;
    return this.surface;
  }

  // ---------------------------------------------------------------- 每幀相機
  updateCamera(alpha: number, frameDt: number): void {
    const look = this.input.consumeLook(this.tmpLook);
    this.yaw -= look.x;
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.y, -1.55, 1.55);

    const targetEye = this.state.crouching ? EYE_CROUCH : EYE_STAND;
    this.eye += (targetEye - this.eye) * Math.min(1, 14 * frameDt);

    const targetAmp = this.state.moving ? (this.state.sprinting ? 0.055 : this.state.crouching ? 0.018 : 0.035) : 0;
    this.bobAmp += (targetAmp - this.bobAmp) * Math.min(1, 10 * frameDt);
    const bobY = Math.sin(this.bobPhase * 2) * this.bobAmp;
    const bobX = Math.cos(this.bobPhase) * this.bobAmp * 0.6;

    const p = this.tmpV.lerpVectors(this.prevPos, this.curPos, alpha);
    const stepY = this.prevStepOffset + (this.stepOffset - this.prevStepOffset) * alpha;
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    this.camera.position.set(p.x + cos * bobX, p.y + this.eye + bobY + stepY, p.z - sin * bobX);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}

const DOWN = new THREE.Vector3(0, -1, 0);
