import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Surface } from '../../Surface';
import { buildDock } from './dock';
import { buildDrydock } from './drydock';
import { buildExtras } from './extras';
import { buildMarket } from './market';
import { buildGasStation, buildGuardHouse, buildOffice } from './offices';
import { buildOutdoor } from './outdoor';
import { buildParking, buildServiceTunnel } from './parking';
import { buildRailyard } from './railyard';
import { buildSouthYard } from './southyard';
import { buildStreet } from './street';
import { buildTerrain } from './terrain';
import { buildTower } from './tower';
import { buildWarehouse } from './warehouse';
import { buildYard } from './yard';
import { Ctx, type RegionMeta } from './util';

/** 一個渲染區域：獨立的 Group（依材質合併的幾個 mesh），可以單獨顯示 / 隱藏與做視錐剔除 */
export interface RegionInfo {
  meta: RegionMeta;
  object: THREE.Group;
  box: THREE.Box3;
}

export interface HarborCore {
  ctx: Ctx;
  root: THREE.Group;
  collision: THREE.Object3D;
  surfaceMeshes: THREE.Mesh[];
  regions: RegionInfo[];
}

export interface HarborCoreOptions {
  /** 瀏覽器載入的貼圖（單元測試沒有 DOM，不傳） */
  textures?: Partial<Record<Surface, { texture: THREE.Texture; tile: number }>>;
}

/**
 * 同一個區域、同一種材質的「碰撞 + 視覺」與「純視覺」兩個 mesh 合成一個渲染 mesh（draw call 減半）。
 * 碰撞用的 mesh 仍然共用原本的 geometry，不受影響。
 */
function mergeVisualInto(group: THREE.Group, meshes: THREE.Mesh[]): THREE.Mesh[] {
  const pairs = new Map<string, { stat?: THREE.Mesh; vis?: THREE.Mesh }>();
  for (const m of meshes) {
    const e = pairs.get(m.userData.surface as string) ?? {};
    if (m.name.startsWith('static_')) e.stat = m; else if (m.name.startsWith('visual_')) e.vis = m;
    pairs.set(m.userData.surface as string, e);
  }
  const drop = new Set<THREE.Mesh>();
  for (const { stat, vis } of pairs.values()) {
    if (!stat || !vis) continue;
    const a = stat.geometry.index ? stat.geometry.toNonIndexed() : stat.geometry.clone();
    const b = vis.geometry.index ? vis.geometry.toNonIndexed() : vis.geometry.clone();
    for (const name of Object.keys(a.attributes)) if (!b.getAttribute(name)) a.deleteAttribute(name);
    for (const name of Object.keys(b.attributes)) if (!a.getAttribute(name)) b.deleteAttribute(name);
    const merged = mergeGeometries([a, b], false);
    if (!merged) continue;
    stat.geometry = merged;   // collision 的 mesh 還拿著原本的 geometry
    stat.name = `render_${stat.userData.surface}`;
    group.remove(vis);
    vis.geometry.dispose();
    drop.add(vis);
  }
  return meshes.filter((m) => !drop.has(m));
}

/** 純幾何與碰撞（不需要 DOM，單元測試與導航圖產生器直接使用） */
export function buildHarborCore(opts: HarborCoreOptions = {}): HarborCore {
  const ctx = new Ctx(1990, opts.textures ?? {});
  const run = (name: string, meta: Omit<RegionMeta, 'name'>, fn: (c: Ctx) => void): void => {
    ctx.setRegion(name, meta);
    fn(ctx);
  };
  run('terrain', { kind: 'outdoor', flat: true }, buildTerrain);
  // 室外的小區域依鄰近程度合併成幾個大區域（每個區域每種材質一個 mesh，區域越少 draw call 越少）
  run('north', { kind: 'outdoor' }, buildDock);
  run('north', { kind: 'outdoor' }, buildYard);
  run('warehouse', { kind: 'shell', building: 'warehouse' }, buildWarehouse);
  run('office', { kind: 'shell', building: 'office' }, buildOffice);
  run('central', { kind: 'outdoor' }, buildGuardHouse);
  run('central', { kind: 'outdoor' }, buildGasStation);
  run('central', { kind: 'outdoor' }, buildOutdoor);
  run('central', { kind: 'outdoor' }, buildMarket);
  run('central', { kind: 'outdoor' }, buildExtras);
  // ---- 擴大後的新區域 ----
  run('tower', { kind: 'shell', building: 'tower' }, buildTower);
  run('service', { kind: 'underground', building: 'tunnel' }, buildServiceTunnel);
  run('parking', { kind: 'shell', building: 'parking' }, buildParking);
  run('railyard', { kind: 'outdoor' }, buildRailyard);
  run('street', { kind: 'shell', building: 'street' }, buildStreet);
  run('drydock', { kind: 'outdoor' }, buildDrydock);
  run('south', { kind: 'outdoor' }, buildSouthYard);

  const collision = new THREE.Group();
  const surfaceMeshes: THREE.Mesh[] = [];
  const regions: RegionInfo[] = [];
  for (const [name, builder] of ctx.allBuilders) {
    const meta = ctx.regions.get(name) ?? { name, kind: 'outdoor' as const };
    const built = builder.build();
    const { group, collision: col } = built;
    const meshes = mergeVisualInto(group, built.meshes);
    group.name = `region:${name}`;
    group.userData.regionKind = meta.kind;
    // 平坦的地面疊層、室內與地下不投射陰影（太陽照不到；也少一半 draw call）
    if (meta.flat || meta.kind === 'interior' || meta.kind === 'underground') for (const m of meshes) m.castShadow = false;
    for (const child of [...col.children]) collision.add(child);
    ctx.root.add(group);
    surfaceMeshes.push(...meshes);
    group.updateMatrixWorld(true);
    regions.push({ meta, object: group, box: new THREE.Box3().setFromObject(group) });
  }
  collision.updateMatrixWorld(true);
  return { ctx, root: ctx.root, collision, surfaceMeshes, regions };
}
