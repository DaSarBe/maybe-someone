export interface EraDef {
  id: string;
  name: string;
  year: string;
  desc: string;
  unlocked: boolean;
  color: string;
  danger: number;
  /** 基礎停留時間（秒）。實際時間 = 基礎 + 穩定器升級的加成（見 items/Profile.ts raidDuration） */
  baseDuration: number;
  /** 時光機面板的詳細資訊（地圖名稱、區域簡介、建議裝備） */
  info?: { mapName: string; brief: string[]; recommended: string[] };
}

/** 測試地圖（?scene=raid&map=test）的基礎停留時間 */
export const TEST_MAP_DURATION = 300;

export const ERAS: EraDef[] = [
  {
    id: 'harbor_1990',
    name: '1990 年代 港口工業區',
    year: '1994',
    desc: '貨櫃、倉庫與廢棄廠房。時晶礦脈在碼頭下方，守衛數量不多。',
    unlocked: true,
    color: '#35e1ff',
    danger: 1,
    baseDuration: 720,
    info: {
      mapName: '高雄舊港・第三貨櫃碼頭',
      brief: [
        '約 184 × 156 公尺的港口工業區，北側是海：貨櫃堆場、倉庫（含二樓）、辦公室、排水隧道、魚市場與一艘靠岸的貨船。貨櫃頂與船甲板視野好、搜刮點多，但敵人也會從上方巡邏。',
        '魚市場的「時代商行」可以把未來商品賣成舊台幣，或買古董與時晶碎片。約 12 名敵人：警衛、打手，與少數守著高價值區域的敵對特工。',
      ],
      recommended: ['主武器：突擊步槍或衝鋒槍', '護甲 2 級以上', '醫療品與足夠彈藥（至少 3 個彈匣）', '攜帶未來商品（電池、凝膠、晶片）到魚市場交易'],
    },
  },
  { id: 'shanghai_1920', name: '1920 年代 租界街區', year: '1926', desc: '舊時代的銀行與洋行。', unlocked: false, color: '#c084fc', danger: 2, baseDuration: 600 },
  { id: 'coldwar_1962', name: '1960 年代 地下研究所', year: '1962', desc: '被遺忘的冷戰設施。', unlocked: false, color: '#fb7185', danger: 3, baseDuration: 600 },
  { id: 'ancient_forest', name: '遠古 時晶森林', year: '？？？', desc: '時晶自然生長的原始地帶。', unlocked: false, color: '#4ade80', danger: 4, baseDuration: 600 },
];

export const DEFAULT_ERA = 'harbor_1990';

export const getEra = (id: string): EraDef | undefined => ERAS.find((e) => e.id === id);
