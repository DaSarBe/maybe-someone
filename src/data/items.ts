import type { ItemDef } from './types';
import { WEAPON_ITEMS } from './weapons';
import { GEAR_ITEMS } from './gear';

export const CURRENCY_SYMBOL = '₵';
export const STARTING_CREDITS = 8000;
const H = ['harbor_1990'];

/** 武器與裝備以外的物品。價格欄位是「基準價」，成交價見 economy/Pricing.ts */
const BASE_ITEMS: ItemDef[] = [
  // ---- 彈藥（單價） ----
  { id: 'ammo_pistol', name: '9mm 脈衝彈', desc: '手槍與衝鋒槍通用的彈藥。單價。', category: 'ammo', weight: 0.02, maxStack: 120, priceFuture: 7, rarity: 'common', icon: { glyph: '▮', color: '#d6b34a' } },
  { id: 'ammo_rifle', name: '5.56 強化彈', desc: '突擊步槍使用的彈藥。單價。', category: 'ammo', weight: 0.03, maxStack: 90, priceFuture: 14, rarity: 'uncommon', icon: { glyph: '▮', color: '#4ade80' } },
  { id: 'ammo_shotgun', name: '12 號鹿彈', desc: '霰彈槍使用的彈藥。單價。', category: 'ammo', weight: 0.05, maxStack: 40, priceFuture: 18, rarity: 'common', icon: { glyph: '●', color: '#fb923c' } },

  // ---- 醫療 ----
  { id: 'bandage', name: '止血繃帶', desc: '快速止住流血。', category: 'medical', weight: 0.1, maxStack: 10, priceFuture: 90, rarity: 'common', icon: { glyph: '🩹', color: '#f4f4f5' } },
  { id: 'medkit', name: '野戰急救包', desc: '回復大量生命，並處理骨折。', category: 'medical', weight: 0.6, maxStack: 4, priceFuture: 420, rarity: 'uncommon', icon: { glyph: '🧰', color: '#ef4444' } },
  { id: 'painkiller', name: '腎上腺素針', desc: '短時間內無視疼痛、移動更快。', category: 'medical', weight: 0.15, maxStack: 5, priceFuture: 650, rarity: 'rare', icon: { glyph: '💉', color: '#f472b6' } },
  { id: 'stabilizer_shot', name: '時空穩定劑', desc: '緩解時空亂流對身體的侵蝕。', category: 'medical', weight: 0.2, maxStack: 5, priceFuture: 900, rarity: 'rare', icon: { glyph: '💉', color: '#35e1ff' } },

  // ---- 時晶 ----
  { id: 'chronite_shard', name: '時晶碎片', desc: '殘留在舊物中的微量時晶，仍微微發光。', category: 'chronite', weight: 0.1, maxStack: 20, priceFuture: 500, rarity: 'uncommon', icon: { glyph: '◆', color: '#7dd3fc' } },
  { id: 'chronite', name: '標準時晶', desc: '足以驅動一次時光機的標準純度時晶。', category: 'chronite', weight: 0.3, maxStack: 10, priceFuture: 1500, rarity: 'rare', icon: { glyph: '◆', color: '#38bdf8' } },
  { id: 'chronite_pure', name: '高純度時晶', desc: '極為罕見的高純度結晶，各大企業都在搶。', category: 'chronite', weight: 0.4, maxStack: 5, priceFuture: 4200, rarity: 'epic', icon: { glyph: '◆', color: '#e879f9' } },

  // ---- 古董（1990 年代台灣港口） ----
  { id: 'pager', name: '摩托羅拉呼叫器', desc: '「有人 call 你」的年代。螢幕還顯示著一串回電號碼。', category: 'antique', weight: 0.1, maxStack: 4, priceFuture: 280, rarity: 'common', icon: { glyph: '📟', color: '#a3a3a3' }, eras: H },
  { id: 'walkman', name: 'Walkman 隨身聽', desc: '裡面還有一卷張雨生的卡帶。', category: 'antique', weight: 0.4, maxStack: 2, priceFuture: 420, rarity: 'common', icon: { glyph: '📻', color: '#fbbf24' }, eras: H },
  { id: 'vhs', name: '出租店錄影帶', desc: '標籤寫著「請於明日中午前歸還」。', category: 'antique', weight: 0.3, maxStack: 5, priceFuture: 110, rarity: 'common', icon: { glyph: '📼', color: '#71717a' }, eras: H },
  { id: 'rice_wine', name: '紅標米酒', desc: '料理與送禮兩相宜，台灣家庭必備。', category: 'antique', weight: 0.9, maxStack: 6, priceFuture: 80, rarity: 'common', icon: { glyph: '🍶', color: '#dc2626' }, eras: H },
  { id: 'rice_cooker', name: '大同電鍋', desc: '外鍋一杯水。據說永遠不會壞。', category: 'antique', weight: 3.2, maxStack: 1, priceFuture: 650, rarity: 'uncommon', icon: { glyph: '🍚', color: '#16a34a' }, eras: H },
  { id: 'brick_phone', name: '黑金剛手機', desc: '又大又重的行動電話，是身份的象徵。', category: 'antique', weight: 0.9, maxStack: 1, priceFuture: 950, rarity: 'uncommon', icon: { glyph: '📱', color: '#1f2937' }, eras: H },
  { id: 'old_banknote', name: '舊版千元鈔', desc: '一疊保存完好的舊版新台幣，收藏家搶著要。', category: 'antique', weight: 0.1, maxStack: 10, priceFuture: 1250, rarity: 'rare', icon: { glyph: '💴', color: '#a78bfa' }, eras: H },
  { id: 'gold_necklace', name: '黃金項鍊', desc: '兩錢重的足金項鍊，來自某位老闆娘的保險櫃。', category: 'antique', weight: 0.1, maxStack: 3, priceFuture: 1600, rarity: 'rare', icon: { glyph: '📿', color: '#fbbf24' }, eras: H },
  { id: 'pocket_watch', name: '古董懷錶', desc: '日治時期的銀製懷錶，指針仍在走動。', category: 'antique', weight: 0.2, maxStack: 1, priceFuture: 2300, rarity: 'rare', icon: { glyph: '⌚', color: '#d4d4d8' }, eras: H },
  { id: 'qing_bowl', name: '清代青花瓷碗', desc: '底款清晰，不知為何出現在港口倉庫的木箱裡。', category: 'antique', weight: 1.2, maxStack: 1, priceFuture: 2800, rarity: 'epic', icon: { glyph: '🥣', color: '#3b82f6' }, eras: H },
  { id: 'famicom', name: '紅白機卡帶（快打旋風）', desc: '吹一吹就能玩。', category: 'antique', weight: 0.1, maxStack: 5, priceFuture: 330, rarity: 'uncommon', icon: { glyph: '🎮', color: '#ef4444' }, eras: H },

  // ---- 未來商品（在未來便宜，拿去過去高價交易） ----
  { id: 'energy_cell', name: '高密度能量電池', desc: '過去的人從未見過的能源，在 1990 年代是奇蹟。', category: 'future_goods', weight: 0.5, maxStack: 10, priceFuture: 160, pricePast: 900, rarity: 'common', icon: { glyph: '🔋', color: '#a3e635' } },
  { id: 'nano_gel', name: '醫療奈米凝膠', desc: '塗上去就能癒合傷口。對過去的人來說像魔法。', category: 'future_goods', weight: 0.3, maxStack: 10, priceFuture: 240, pricePast: 1400, rarity: 'uncommon', icon: { glyph: '🧪', color: '#2dd4bf' } },
  { id: 'quantum_chip', name: '量子運算晶片', desc: '一片就勝過整間機房。', category: 'future_goods', weight: 0.05, maxStack: 10, priceFuture: 520, pricePast: 3600, rarity: 'rare', icon: { glyph: '💾', color: '#818cf8' } },
  { id: 'optic_fiber', name: '光學奈米纖維卷', desc: '輕薄、堅韌、會發光的布料。', category: 'future_goods', weight: 0.8, maxStack: 5, priceFuture: 300, pricePast: 1700, rarity: 'uncommon', icon: { glyph: '🧵', color: '#f0abfc' } },

  // ---- 貴重品 ----
  { id: 'gold_bar', name: '金條', desc: '一台兩重的標準金條。沉甸甸的。', category: 'valuable', weight: 1.2, maxStack: 3, priceFuture: 2400, rarity: 'rare', icon: { glyph: '🪙', color: '#facc15' }, eras: H },
  { id: 'jade_pendant', name: '翡翠玉珮', desc: '水頭十足的老坑翡翠。', category: 'valuable', weight: 0.1, maxStack: 2, priceFuture: 2000, rarity: 'rare', icon: { glyph: '💎', color: '#34d399' }, eras: H },
  { id: 'pearl_string', name: '南洋珍珠串', desc: '顆顆圓潤的珍珠，不知哪位船東的收藏。', category: 'valuable', weight: 0.2, maxStack: 2, priceFuture: 1500, rarity: 'uncommon', icon: { glyph: '⚪', color: '#f5f5f4' }, eras: H },
  { id: 'diamond', name: '裸鑽（1 克拉）', desc: '附證書的裸鑽，走私貨的可能性很高。', category: 'valuable', weight: 0.02, maxStack: 3, priceFuture: 4200, rarity: 'legendary', icon: { glyph: '💠', color: '#a5f3fc' }, eras: H },

  // ---- 雜物 ----
  { id: 'scrap_metal', name: '廢鐵零件', desc: '重量不輕、賣不了多少錢。', category: 'junk', weight: 1.5, maxStack: 8, priceFuture: 30, rarity: 'common', icon: { glyph: '⚙', color: '#78716c' } },
  { id: 'wire_roll', name: '舊電線', desc: '纏成一團的銅線。', category: 'junk', weight: 0.6, maxStack: 8, priceFuture: 45, rarity: 'common', icon: { glyph: '➰', color: '#f97316' } },
  { id: 'glass_bottle', name: '黑松沙士空瓶', desc: '玻璃瓶可以回收。', category: 'junk', weight: 0.4, maxStack: 10, priceFuture: 12, rarity: 'common', icon: { glyph: '🍾', color: '#65a30d' } },
  { id: 'fishing_net', name: '破漁網', desc: '纏滿海草的舊漁網。', category: 'junk', weight: 1.1, maxStack: 4, priceFuture: 22, rarity: 'common', icon: { glyph: '🕸', color: '#94a3b8' } },
  { id: 'screw_jar', name: '螺絲罐', desc: '裝滿各式螺絲的餅乾鐵盒。', category: 'junk', weight: 0.8, maxStack: 5, priceFuture: 60, rarity: 'common', icon: { glyph: '🔩', color: '#a8a29e' } },
  { id: 'newspaper', name: '舊報紙', desc: '頭版標題寫著股市萬點。', category: 'junk', weight: 0.2, maxStack: 10, priceFuture: 8, rarity: 'common', icon: { glyph: '📰', color: '#d4d4d8' }, eras: H },
];

export const ITEM_LIST: ItemDef[] = [...WEAPON_ITEMS, ...GEAR_ITEMS, ...BASE_ITEMS];

export const ITEMS: Readonly<Record<string, ItemDef>> = Object.fromEntries(ITEM_LIST.map((d) => [d.id, d]));

export const CATEGORY_NAMES: Record<ItemDef['category'], string> = {
  weapon: '武器', ammo: '彈藥', armor: '護甲', backpack: '背包', medical: '醫療',
  chronite: '時晶', antique: '古董', future_goods: '未來商品', valuable: '貴重品', junk: '雜物',
};

export const RARITY_NAMES: Record<ItemDef['rarity'], string> = {
  common: '普通', uncommon: '優良', rare: '稀有', epic: '史詩', legendary: '傳說',
};

export const RARITY_COLORS: Record<ItemDef['rarity'], string> = {
  common: '#9aa5b1', uncommon: '#4ade80', rare: '#38bdf8', epic: '#c084fc', legendary: '#fbbf24',
};

/** 黑市終端機會販售的分類 */
export const SHOP_CATEGORIES: ItemDef['category'][] = ['weapon', 'ammo', 'armor', 'backpack', 'medical', 'future_goods'];

export function getItem(id: string): ItemDef | undefined {
  return ITEMS[id];
}
