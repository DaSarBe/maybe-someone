import * as THREE from 'three';

export const SURFACES = [
  'concrete', 'metal', 'wood', 'grass', 'gravel',
  'dirt', 'water', 'tile', 'carpet', 'sand',
] as const;
export type Surface = (typeof SURFACES)[number];
export const DEFAULT_SURFACE: Surface = 'concrete';

export type ReverbType = 'outdoor' | 'indoor_small' | 'indoor_large' | 'tunnel';

export interface ReverbZone {
  box: THREE.Box3;
  type: ReverbType;
  name?: string;
}

function isSurface(v: unknown): v is Surface {
  return typeof v === 'string' && (SURFACES as readonly string[]).includes(v);
}

/** 沿父節點往上找 userData.surface，找不到回傳 concrete */
export function getSurfaceAt(object: THREE.Object3D | null): Surface {
  let o: THREE.Object3D | null = object;
  while (o) {
    const s = o.userData?.surface;
    if (isSurface(s)) return s;
    o = o.parent;
  }
  return DEFAULT_SURFACE;
}

/** 找出點所在的回音區；多個重疊時取後定義者；都不在則回傳 null（視為 outdoor） */
export function findReverbZone(zones: readonly ReverbZone[], p: THREE.Vector3): ReverbZone | null {
  for (let i = zones.length - 1; i >= 0; i--) {
    if (zones[i].box.containsPoint(p)) return zones[i];
  }
  return null;
}
