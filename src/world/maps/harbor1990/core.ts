import * as THREE from 'three';
import type { Surface } from '../../Surface';
import { buildDock } from './dock';
import { buildExtras } from './extras';
import { buildMarket } from './market';
import { buildGasStation, buildGuardHouse, buildOffice } from './offices';
import { buildOutdoor } from './outdoor';
import { buildTerrain } from './terrain';
import { buildWarehouse } from './warehouse';
import { buildYard } from './yard';
import { Ctx } from './util';

export interface HarborCore {
  ctx: Ctx;
  root: THREE.Group;
  collision: THREE.Object3D;
  surfaceMeshes: THREE.Mesh[];
}

export interface HarborCoreOptions {
  /** 瀏覽器載入的貼圖（單元測試沒有 DOM，不傳） */
  textures?: Partial<Record<Surface, { texture: THREE.Texture; tile: number }>>;
}

/** 純幾何與碰撞（不需要 DOM，單元測試與導航圖產生器直接使用） */
export function buildHarborCore(opts: HarborCoreOptions = {}): HarborCore {
  const ctx = new Ctx();
  for (const [s, t] of Object.entries(opts.textures ?? {})) {
    if (t) ctx.b.useTexture(s as Surface, t.texture, t.tile);
  }
  buildTerrain(ctx);
  buildDock(ctx);
  buildYard(ctx);
  buildWarehouse(ctx);
  buildOffice(ctx);
  buildGuardHouse(ctx);
  buildGasStation(ctx);
  buildOutdoor(ctx);
  buildMarket(ctx);
  buildExtras(ctx);
  const { group, meshes, collision } = ctx.b.build();
  ctx.root.add(group);
  return { ctx, root: ctx.root, collision, surfaceMeshes: meshes };
}
