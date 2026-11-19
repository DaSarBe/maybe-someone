import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Surface } from './Surface';

interface Piece {
  geo: THREE.BufferGeometry;
  /** 是否渲染（false = 隱形碰撞體） */
  visual: boolean;
  /** 是否參與碰撞（false = 純視覺） */
  collide: boolean;
}

export interface StairsOptions {
  surface: Surface;
  color: THREE.ColorRepresentation;
  /** 第一階前緣的底部中心（世界座標，y = 地面高度） */
  x: number; y: number; z: number;
  /** 上行方向的繞 Y 軸旋轉（弧度）：0 = 往 +x，Math.PI/2 = 往 -z，-Math.PI/2 = 往 +z，Math.PI = 往 -x */
  yaw?: number;
  steps: number;
  /** 每階高度 / 深度 */
  rise: number;
  depth: number;
  width: number;
  /** 台階向下延伸的深度（避免底下露縫），預設 0.5 */
  skirt?: number;
  /** 階梯顏色可略有深淺交替 */
  altColor?: THREE.ColorRepresentation;
}

/**
 * 灰盒地圖建構器：收集方塊，依 surface 合併成單一 mesh（每種材質一個 draw call），
 * 顏色以頂點色表示，所有方塊共用一個材質。
 */
export class MapBuilder {
  private bySurface = new Map<Surface, Piece[]>();
  private nextVisual = true;
  private nextCollide = true;
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });

  /** 以中心 + 尺寸加入方塊，可選旋轉（弧度，XYZ 順序） */
  box(
    surface: Surface, color: THREE.ColorRepresentation,
    cx: number, cy: number, cz: number,
    sx: number, sy: number, sz: number,
    rot?: { x?: number; y?: number; z?: number },
  ): this {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(cx, cy, cz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot?.x ?? 0, rot?.y ?? 0, rot?.z ?? 0)),
      new THREE.Vector3(1, 1, 1),
    );
    geo.applyMatrix4(m);
    return this.addGeometry(surface, color, geo);
  }

  /** 加入任意幾何（已在世界座標）；顏色寫成頂點色 */
  private addGeometry(surface: Surface, color: THREE.ColorRepresentation, geo: THREE.BufferGeometry): this {
    const c = new THREE.Color(color);
    const n = geo.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    let list = this.bySurface.get(surface);
    if (!list) this.bySurface.set(surface, (list = []));
    list.push({ geo, visual: this.nextVisual, collide: this.nextCollide });
    return this;
  }

  /**
   * 樓梯：視覺上是一階一階的台階（含材質標記，腳步聲/彈著點讀這些 mesh），
   * 碰撞上是一個隱形斜坡（只進 Octree、不渲染），玩家走起來不會被每一階絆住。
   * 斜坡面通過每階踏面的中心高度，視覺落差在 ±rise/2 內。
   * 上到頂的平台請另外用 box 加（頂面高度 = y + steps * rise）。
   */
  addStairs(o: StairsOptions): this {
    const yaw = o.yaw ?? 0;
    const skirt = o.skirt ?? 0.5;
    const place = (lx: number, ly: number): [number, number, number] => {
      // 局部 (lx 沿上行方向, ly 高度)，局部寬度中心在 z=0
      return [o.x + lx * Math.cos(yaw), o.y + ly, o.z - lx * Math.sin(yaw)];
    };
    // 視覺台階：只渲染，不碰撞
    this.nextCollide = false;
    for (let i = 0; i < o.steps; i++) {
      const h = (i + 1) * o.rise + skirt;
      const [cx, cy, cz] = place((i + 0.5) * o.depth, (i + 1) * o.rise - h / 2);
      this.box(o.surface, i % 2 && o.altColor !== undefined ? o.altColor : o.color, cx, cy, cz, o.depth, h, o.width, { y: yaw });
    }
    // 碰撞斜坡：只碰撞，不渲染。剖面（局部 x 上行、y 高度）：
    // 斜面從 (-depth/2, 0) 爬到 ((steps-0.5)*depth, H)，之後接一小段平面伸進上方平台，避免頂端被圓形膠囊的邊緣頂起
    this.nextCollide = true;
    this.nextVisual = false;
    const H = o.steps * o.rise;
    const x0 = -o.depth / 2, x1 = (o.steps - 0.5) * o.depth, x2 = o.steps * o.depth + 0.3, t = 1.0; // 夠厚：貼地下階時膠囊會下探 SNAP_DIST + 半徑
    const shape = new THREE.Shape();
    shape.moveTo(x0, 0); shape.lineTo(x1, H); shape.lineTo(x2, H); shape.lineTo(x2, H - t); shape.lineTo(x0, -t);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: o.width, bevelEnabled: false });
    geo.translate(0, 0, -o.width / 2);
    const [px, py, pz] = place(0, 0);
    geo.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(px, py, pz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(1, 1, 1),
    ));
    this.addGeometry(o.surface, o.color, geo);
    this.nextVisual = true;
    return this;
  }

  /** 以最小/最大角加入方塊 */
  boxMinMax(
    surface: Surface, color: THREE.ColorRepresentation,
    x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  ): this {
    return this.box(surface, color, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0);
  }

  /**
   * group：所有要渲染的 mesh（surfaceMeshes 也來自這裡）。
   * collision：給 Octree 的碰撞 mesh（含隱形斜坡，不含純視覺台階）。
   */
  build(): { group: THREE.Group; meshes: THREE.Mesh[]; collision: THREE.Group } {
    const group = new THREE.Group();
    const collision = new THREE.Group();
    const meshes: THREE.Mesh[] = [];
    const merge = (pieces: Piece[]): THREE.BufferGeometry | null =>
      pieces.length ? mergeGeometries(pieces.map((p) => p.geo.clone()), false) : null;
    for (const [surface, list] of this.bySurface) {
      const both = merge(list.filter((p) => p.visual && p.collide));
      const visualOnly = merge(list.filter((p) => p.visual && !p.collide));
      const collideOnly = merge(list.filter((p) => !p.visual && p.collide));
      list.forEach((p) => p.geo.dispose());
      const make = (geo: THREE.BufferGeometry, name: string): THREE.Mesh => {
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.name = name;
        mesh.userData.surface = surface;
        return mesh;
      };
      if (both) {
        const mesh = make(both, `static_${surface}`);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh); meshes.push(mesh);
        // 碰撞用另一個 mesh 共用同一份 geometry（不加進場景）
        collision.add(make(both, `col_${surface}`));
      }
      if (visualOnly) {
        const mesh = make(visualOnly, `visual_${surface}`);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh); meshes.push(mesh);
      }
      if (collideOnly) collision.add(make(collideOnly, `ramp_${surface}`));
    }
    group.updateMatrixWorld(true);
    collision.updateMatrixWorld(true);
    return { group, meshes, collision };
  }
}
