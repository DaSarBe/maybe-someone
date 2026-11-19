import type { RaidMapLoader } from '../RaidMap';
import { loadTestRaid } from './testRaid';

/**
 * 時代 id → Raid 地圖載入器。要換地圖只改這一張表。
 * 正式地圖用動態 import，各自是獨立的 chunk，不會變大主程式。
 */
export const RAID_MAPS: Record<string, RaidMapLoader> = {
  harbor_1990: () => import('./harbor1990').then((m) => m.loadHarbor1990()),
};

/** ?map=test 用：小型測試地圖（維持在主 bundle） */
export const TEST_MAP_ID = 'test';

export function getRaidMapLoader(eraId: string, mapOverride?: string | null): RaidMapLoader {
  if (mapOverride === TEST_MAP_ID) return loadTestRaid;
  return RAID_MAPS[eraId] ?? loadTestRaid;
}
