import * as THREE from 'three';
import type { MapAmbience, RaidMap, RaidMapLoader } from '../RaidMap';
import { findReverbZone, type ReverbType } from '../Surface';
import { buildHarborCore } from './harbor1990/core';
import { ARRIVALS, ENEMY_SPAWNS, EVAC_POINTS, HARBOR_BOUNDS, LOOT_SPOTS, TRADER } from './harbor1990/data';
import { decorateHarbor, loadHarborTextures } from './harbor1990/decor';
import { NAV_EDGES, NAV_NODES } from './harbor1990/navData';
import type { LightSpec } from './harbor1990/util';

export { applyHarborAtmosphere } from './harbor1990/decor';

/** 導航圖資料（預先離線產生並驗證，見 tests/harbor-nav-gen.test.ts） */
export function buildHarborNav(): RaidMap['nav'] {
  const nodes: THREE.Vector3[] = [];
  for (let i = 0; i < NAV_NODES.length; i += 3) nodes.push(new THREE.Vector3(NAV_NODES[i], NAV_NODES[i + 1], NAV_NODES[i + 2]));
  const edges: [number, number][] = [];
  for (let i = 0; i < NAV_EDGES.length; i += 2) edges.push([NAV_EDGES[i], NAV_EDGES[i + 1]]);
  return { nodes, edges };
}

/** 室外是傍晚（還算亮），室內與隧道較暗；有燈的地方依距離變亮 */
const BASE_LIGHT: Record<ReverbType, number> = { outdoor: 0.85, indoor_large: 0.4, indoor_small: 0.35, tunnel: 0.22 };
/** 特定空間更暗：貨艙、B2、服務隧道幾乎全黑，手電筒才有用武之地；有窗的大樓、鐵道悶罐車介於中間 */
const ZONE_LIGHT: Record<string, number> = {
  ship_hold: 0.08, parking_b2: 0.08, service_tunnel: 0.1, parking_b1: 0.18, ship_engine: 0.2, ship_cabin: 0.25,
  tower_stairs: 0.28, tower_shaft: 0.15, boxcar_a: 0.2, boxcar_b: 0.2, signal_hut: 0.3, pump_house: 0.3,
  tower_1f: 0.5, tower_2f: 0.45, tower_3f: 0.38, tower_4f: 0.45, tower_5f: 0.5, old_street_temple: 0.35,
};

/** 敵人感知用的亮度 0..1：回音區（室內外）當底，加上點光源的貢獻 */
export function harborLightAt(zones: RaidMap['reverbZones'], lights: readonly LightSpec[], pos: THREE.Vector3): number {
  const zone = findReverbZone(zones, pos);
  let v = (zone?.name ? ZONE_LIGHT[zone.name] : undefined) ?? BASE_LIGHT[zone?.type ?? 'outdoor'];
  for (const l of lights) {
    const range = l.light.distance;
    const d = l.light.position.distanceTo(pos);
    if (d >= range) continue;
    const strength = Math.min(1, Math.max(0.35, l.base / 40));
    v += strength * 0.6 * Math.pow(1 - d / range, 1.5);
  }
  return Math.min(1, v);
}

/** 海岸線上的幾個浪聲音源（碼頭前緣，海在 z < -64；陸地向東西各擴到 ±130） */
const SHORE_POINTS = [-120, -95, -70, -45, -20, 5, 30, 55, 80, 105, 125].map((x) => new THREE.Vector3(x, 0, -65));
const HARBOR_AMBIENCE: MapAmbience = {
  waves: { points: SHORE_POINTS, refDist: 14, maxDist: 75, volume: 0.9 },
  seagulls: { interval: [20, 60], volume: 0.55 },
  shipHorn: { count: [1, 3], volume: 1.0, origin: new THREE.Vector3(0, 0, -64), distance: [140, 210] },
};

/**
 * 1990 年代港口工業區（約 260m × 230m 陸地 + 北側海面；多層建築、貨船內部與地下停車場）。
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
    ownsLighting: true,
    lightAt: (pos) => harborLightAt(core.ctx.zones, core.ctx.lights, pos),
    ambience: HARBOR_AMBIENCE,
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
  // 預覽與測試用：分區可見性與區域清單（不在 RaidMap 合約內）
  Object.assign(map, { visibility: decor.visibility, regions: core.regions });
  return map;
};
