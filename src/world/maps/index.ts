import type { RaidMapLoader } from '../RaidMap';
import { loadTestRaid } from './testRaid';

/**
 * 時代 id → Raid 地圖載入器。要換地圖只改這一張表。
 * 目前 harbor_1990 還是測試地圖；正式地圖（maps/harbor1990.ts）完成後把這裡換成 loadHarbor1990。
 */
export const RAID_MAPS: Record<string, RaidMapLoader> = {
  harbor_1990: loadTestRaid,
};

export function getRaidMapLoader(eraId: string): RaidMapLoader {
  return RAID_MAPS[eraId] ?? loadTestRaid;
}
