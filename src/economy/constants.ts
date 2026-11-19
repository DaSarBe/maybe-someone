import type { Rarity } from '../data/types';

export const RARITY_PRICE_MULT: Record<Rarity, number> = {
  common: 1, uncommon: 1.1, rare: 1.25, epic: 1.5, legendary: 2,
};
export const BUY_MARKUP = 1.4;
