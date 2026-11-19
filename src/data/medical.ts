/** 醫療品效果：使用後在 duration 秒內持續回復 heal 點生命。使用中移動變慢，可被打斷（打斷後剩餘的回復作廢）。 */
export interface MedicalStats {
  heal: number;
  duration: number;
  /** 使用中的移動速度倍率 */
  moveScale: number;
}

export const MEDICAL_STATS: Record<string, MedicalStats> = {
  bandage: { heal: 20, duration: 2.5, moveScale: 0.7 },
  medkit: { heal: 60, duration: 6, moveScale: 0.5 },
  painkiller: { heal: 30, duration: 3, moveScale: 0.75 },
};

/** 挑選要使用的醫療品：能補滿缺口的最小者，否則最大者。available 為背包內有的 id */
export function pickMedical(available: string[], missingHp: number): string | null {
  const list = available.filter((id) => MEDICAL_STATS[id]).sort((a, b) => MEDICAL_STATS[a].heal - MEDICAL_STATS[b].heal);
  if (list.length === 0) return null;
  return list.find((id) => MEDICAL_STATS[id].heal >= missingHp) ?? list[list.length - 1];
}
