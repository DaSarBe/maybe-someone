import * as THREE from 'three';
import type { RaidMap, RaidMapLoader } from '../RaidMap';
import { buildHarborCore } from './harbor1990/core';
import { ARRIVALS, ENEMY_SPAWNS, EVAC_POINTS, HARBOR_BOUNDS, LOOT_SPOTS, TRADER } from './harbor1990/data';
import { decorateHarbor, loadHarborTextures } from './harbor1990/decor';
import { NAV_EDGES, NAV_NODES } from './harbor1990/navData';

export { applyHarborAtmosphere } from './harbor1990/decor';

/** 導航圖資料（預先離線產生並驗證，見 tests/harbor-nav-gen.test.ts） */
export function buildHarborNav(): RaidMap['nav'] {
  const nodes: THREE.Vector3[] = [];
  for (let i = 0; i < NAV_NODES.length; i += 3) nodes.push(new THREE.Vector3(NAV_NODES[i], NAV_NODES[i + 1], NAV_NODES[i + 2]));
  const edges: [number, number][] = [];
  for (let i = 0; i < NAV_EDGES.length; i += 2) edges.push([NAV_EDGES[i], NAV_EDGES[i + 1]]);
  return { nodes, edges };
}

/**
 * 1990 年代港口工業區（約 184m × 156m 陸地 + 北側海面）。
 * 加進 scene 時會自動套用傍晚的霧與背景色，並帶有自己的光源與天空。
 */
export const loadHarbor1990: RaidMapLoader = async () => {
  const textures = await loadHarborTextures();
  const core = buildHarborCore({ textures });
  const decor = await decorateHarbor(core);
  const spawn = ARRIVALS[0];
  const map: RaidMap = {
    eraId: 'harbor_1990',
    root: core.root,
    collision: core.collision,
    surfaceMeshes: [...core.surfaceMeshes, ...decor.extraSurfaceMeshes],
    reverbZones: core.ctx.zones,
    spawn: { position: spawn.position.clone(), yaw: spawn.yaw },
    arrivals: ARRIVALS.map((a) => ({ position: a.position.clone(), yaw: a.yaw })),
    lootSpots: LOOT_SPOTS,
    evacPoints: EVAC_POINTS,
    enemySpawns: ENEMY_SPAWNS,
    nav: buildHarborNav(),
    trader: TRADER,
    bounds: HARBOR_BOUNDS.clone(),
    update: (dt, elapsed) => decor.update(dt, elapsed),
  };
  return map;
};
