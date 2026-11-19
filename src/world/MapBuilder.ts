import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Surface } from './Surface';

interface Piece {
  geo: THREE.BufferGeometry;
}

/**
 * 灰盒地圖建構器：收集方塊，依 surface 合併成單一 mesh（每種材質一個 draw call），
 * 顏色以頂點色表示，所有方塊共用一個材質。
 */
export class MapBuilder {
  private bySurface = new Map<Surface, Piece[]>();
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
    const c = new THREE.Color(color);
    const n = geo.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    let list = this.bySurface.get(surface);
    if (!list) this.bySurface.set(surface, (list = []));
    list.push({ geo });
    return this;
  }

  /** 以最小/最大角加入方塊 */
  boxMinMax(
    surface: Surface, color: THREE.ColorRepresentation,
    x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  ): this {
    return this.box(surface, color, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0);
  }

  build(): { group: THREE.Group; meshes: THREE.Mesh[] } {
    const group = new THREE.Group();
    const meshes: THREE.Mesh[] = [];
    for (const [surface, list] of this.bySurface) {
      const merged = mergeGeometries(list.map((p) => p.geo), false);
      if (!merged) continue;
      list.forEach((p) => p.geo.dispose());
      const mesh = new THREE.Mesh(merged, this.material);
      mesh.name = `static_${surface}`;
      mesh.userData.surface = surface;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      meshes.push(mesh);
    }
    group.updateMatrixWorld(true);
    return { group, meshes };
  }
}
