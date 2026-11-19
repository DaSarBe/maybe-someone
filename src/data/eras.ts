export interface EraDef {
  id: string;
  name: string;
  year: string;
  desc: string;
  unlocked: boolean;
  color: string;
  danger: number;
}

export const ERAS: EraDef[] = [
  {
    id: 'harbor_1990',
    name: '1990 年代 港口工業區',
    year: '1994',
    desc: '貨櫃、倉庫與廢棄廠房。時晶礦脈在碼頭下方，守衛數量不多。',
    unlocked: true,
    color: '#35e1ff',
    danger: 1,
  },
  { id: 'shanghai_1920', name: '1920 年代 租界街區', year: '1926', desc: '舊時代的銀行與洋行。', unlocked: false, color: '#c084fc', danger: 2 },
  { id: 'coldwar_1962', name: '1960 年代 地下研究所', year: '1962', desc: '被遺忘的冷戰設施。', unlocked: false, color: '#fb7185', danger: 3 },
  { id: 'ancient_forest', name: '遠古 時晶森林', year: '？？？', desc: '時晶自然生長的原始地帶。', unlocked: false, color: '#4ade80', danger: 4 },
];

export const DEFAULT_ERA = 'harbor_1990';

export const getEra = (id: string): EraDef | undefined => ERAS.find((e) => e.id === id);
