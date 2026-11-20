import * as THREE from 'three';
import type { RegionInfo } from './core';
import { floorY } from './layout';

/**
 * 分區可見性（手機效能）：地圖被切成很多「區域」（core.ts），每個區域是獨立的 Group。
 * 這裡依相機位置切換 Object3D.visible：
 *  - 室內細節（家具、裝飾、道具）：只有相機在那棟建築裡（且樓層相鄰）才畫
 *  - 室外：相機在室內或地下時，只畫 70m 內；在室外畫到霧的盡頭
 *  - 地下空間（隧道、停車場）：相機在地下才畫，或離得很近（站在坡道口往下看）
 * 碰撞（Octree）與表面材質（腳步聲、彈著點）不受影響，它們不看 visible。
 */

export interface BuildingVis {
  id: string;
  /** 相機在這個盒子裡就算「在建築裡」 */
  inner: THREE.Box3;
  /** 樓層分界高度（相機腳下高度由低到高）；沒有 = 只看有沒有在裡面 */
  floorBreaks?: number[];
}

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.Box3 =>
  new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));

export const BUILDINGS: BuildingVis[] = [
  { id: 'tower', inner: box(99.5, -1, -6.5, 124.5, 24, 16.5), floorBreaks: [1, 2, 3, 4, 5].map((k) => floorY(k) - 0.6) },
  { id: 'warehouse', inner: box(5.5, -1, -44.5, 46.5, 13, -11.5) },
  { id: 'office', inner: box(-22.5, -1, 27.5, 4.5, 5, 46.5) },
  { id: 'guard', inner: box(11.5, -1, 81.5, 20.5, 4, 88.5) },
  { id: 'ship', inner: box(-43, -5, -81.5, 3, 12, -64) },
  { id: 'street_w', inner: box(95.5, -1, 37.5, 106.5, 5, 86.5) },
  { id: 'street_e', inner: box(119.5, -1, 37.5, 130.5, 5, 86.5) },
  { id: 'shed', inner: box(-124.5, -1, 35.5, -103.5, 8, 52.5) },
];

export interface VisStats { visible: number; hidden: number; building: string | null; floor: number; underground: boolean }

const _sphereBox = new THREE.Box3();

export class HarborVisibility {
  private readonly buildings = new Map(BUILDINGS.map((b) => [b.id, b]));
  readonly stats: VisStats = { visible: 0, hidden: 0, building: null, floor: 0, underground: false };
  private readonly states = new Map<RegionInfo, boolean>();
  /** true = 不再依相機切換（樓層俯視、截圖用） */
  locked = false;

  constructor(private readonly regions: RegionInfo[]) {}

  /** 區域的包圍盒變了（例如加了道具）之後呼叫：目前只需要清掉狀態讓下一次 update 重算 */
  refresh(): void { this.states.clear(); }

  /** 目前每個區域的可見狀態（測試與除錯用） */
  snapshot(): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const r of this.regions) out[r.meta.name] = r.object.visible;
    return out;
  }

  /** 把全部區域打開（俯瞰、截圖用） */
  showAll(): void { for (const r of this.regions) r.object.visible = true; this.states.clear(); }

  update(cam: THREE.Vector3): void {
    if (this.locked) return;
    // 相機現在在哪一棟（或地下）
    let inside: BuildingVis | null = null;
    for (const b of BUILDINGS) if (b.inner.containsPoint(cam)) { inside = b; break; }
    const feet = cam.y - 1.6;
    const underground = cam.y < -0.8;
    let floor = 0;
    if (inside?.floorBreaks) for (const y of inside.floorBreaks) if (feet > y) floor++;
    const indoors = !!inside || underground;
    const farOutdoor = indoors ? 60 : 125, farShell = indoors ? 90 : 135;
    let vis = 0, hid = 0;
    for (const r of this.regions) {
      const m = r.meta;
      const d = _dist(r.box, cam);
      let on: boolean;
      switch (m.kind) {
        case 'interior': {
          const b = m.building ? this.buildings.get(m.building) : undefined;
          on = !!b && inside === b && (m.floor === undefined || !b.floorBreaks || Math.abs(m.floor - floor) <= 1);
          break;
        }
        case 'underground':
          on = (underground && d < 85) || d < 24;
          break;
        case 'shell':
          on = d < farShell;
          break;
        default:
          on = d < farOutdoor;
      }
      if (this.states.get(r) !== on) { r.object.visible = on; this.states.set(r, on); }
      if (on) vis++; else hid++;
    }
    this.stats.visible = vis; this.stats.hidden = hid; this.stats.building = inside?.id ?? null; this.stats.floor = floor; this.stats.underground = underground;
  }
}

function _dist(b: THREE.Box3, p: THREE.Vector3): number {
  _sphereBox.copy(b);
  return _sphereBox.distanceToPoint(p);
}
