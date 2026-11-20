import { describe, expect, it } from 'vitest';
import { ERAS, TEST_MAP_DURATION } from '../src/data/eras';
import { ITEMS } from '../src/data/items';
import { TRADERS } from '../src/data/traders';
import { buyPrice } from '../src/economy/Pricing';
import { rollTraderStock, traderSellTotal } from '../src/economy/Trader';
import { planHorns, waveLevel } from '../src/audio/MapAmbience';
import { SHOT_LAYERS } from '../src/audio/AudioManager';
import { makeEconomy, NOON } from './helpers';

const DAY = '2026-06-15';
const raidEco = (extra?: (p: any) => void) => {
  const { eco } = makeEconomy();
  const p = (eco as any).p;
  p.equipment.backpack = { id: 'bag_medium', qty: 1 };
  p.carried[0] = { id: 'energy_cell', qty: 5 };
  p.carried[1] = { id: 'scrap_metal', qty: 2 };
  extra?.(p);
  (eco as any).persist();
  expect(eco.startRaid('harbor_1990').ok).toBe(true);
  return eco;
};

describe('trader data', () => {
  it('only references real items and pays far above the future price for future goods', () => {
    const t = TRADERS.harbor_1990;
    for (const s of t.stock) expect(ITEMS[s.id], s.id).toBeTruthy();
    expect(ITEMS[t.currency]).toBeTruthy();
    for (const it of Object.values(ITEMS).filter((i) => i.category === 'future_goods')) {
      expect(traderSellTotal(t, it.id, 1, 0, DAY)).toBeGreaterThan(buyPrice(it.id, DAY) * 2);
    }
  });
  it('stock is deterministic per raid and varies between raids', () => {
    const t = TRADERS.harbor_1990;
    expect(rollTraderStock(t, 1000)).toEqual(rollTraderStock(t, 1000));
    const seen = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(rollTraderStock(t, i * 7919))));
    expect(seen.size).toBeGreaterThan(10);
  });
  it('saturated market pays less after the full-price units', () => {
    const t = TRADERS.harbor_1990;
    const one = traderSellTotal(t, 'energy_cell', 1, 0, DAY);
    expect(traderSellTotal(t, 'energy_cell', 3, 0, DAY)).toBe(one * 3);
    expect(traderSellTotal(t, 'energy_cell', 1, 3, DAY)).toBeLessThan(one * 0.5);
  });
});

describe('EconomyService trader', () => {
  it('sells future goods for old NTD, junk for a pittance, rejects invalid', () => {
    const eco = raidEco();
    const q = eco.traderSellQuote('energy_cell', 5);
    const r = eco.traderSell({ c: 'carried', i: 0 }, 5);
    expect(r.ok && r.gain).toBe(q);
    expect(eco.countCarried('old_ntd')).toBe(q);
    expect(eco.countCarried('energy_cell')).toBe(0);
    const j = eco.traderSell({ c: 'carried', i: 1 }, 2);
    expect(j.ok).toBe(true);
    expect(eco.traderSell({ c: 'carried', i: 0 }).ok).toBe(false); // 空格
    expect(eco.traderSell({ c: 'stash', i: 0 }).ok).toBe(false);
  });
  it('cannot sell the currency itself or more than owned', () => {
    const eco = raidEco();
    eco.traderSell({ c: 'carried', i: 0 }, 5);
    const idx = eco.view('carried').slots.findIndex((s) => s?.id === 'old_ntd');
    expect(eco.traderSell({ c: 'carried', i: idx }).ok).toBe(false);
    expect(eco.traderSell({ c: 'carried', i: 1 }, 99).ok).toBe(false);
  });
  it('buys within stock and funds, tracks stock, rolls back on failure', () => {
    const eco = raidEco((p) => { p.carried[2] = { id: 'old_ntd', qty: 100000 }; });
    const offers = eco.traderOffers();
    expect(offers.length).toBeGreaterThan(3);
    const o = offers[0];
    const before = eco.countCarried('old_ntd');
    expect(eco.traderBuy(o.id, o.left + 1).ok).toBe(false);
    expect(eco.countCarried('old_ntd')).toBe(before);
    const r = eco.traderBuy(o.id, 1);
    expect(r.ok).toBe(true);
    expect(eco.countCarried('old_ntd')).toBe(before - o.price);
    expect(eco.countCarried(o.id)).toBeGreaterThanOrEqual(1);
    expect(eco.traderOffers()[0].left).toBe(o.left - 1);
    expect(eco.traderBuy('rifle', 1).ok).toBe(false); // 不在貨架
  });
  it('refuses to buy without enough old NTD', () => {
    const eco = raidEco();
    const o = eco.traderOffers().find((x) => x.price > 100)!;
    const r = eco.traderBuy(o.id, 1);
    expect(r.ok).toBe(false);
  });
  it('is unavailable outside a raid', () => {
    const { eco } = makeEconomy();
    expect(eco.traderSell({ c: 'carried', i: 0 }).ok).toBe(false);
    expect(eco.traderBuy('pager', 1).ok).toBe(false);
    expect(eco.traderOffers()).toEqual([]);
  });
  it('trade state survives save/load and clears after the raid', () => {
    const eco = raidEco();
    eco.traderSell({ c: 'carried', i: 0 }, 3);
    expect((eco.profile.raid as any).trade.sold.energy_cell).toBe(3);
    eco.resolveRaid('extract');
    expect(eco.profile.raid).toBeNull();
    expect(NOON).toBeGreaterThan(0);
  });
});

describe('raid duration per era', () => {
  it('harbor is 15 minutes base, test map 5, stabilizer adds on top', () => {
    expect(ERAS[0].baseDuration).toBe(900);
    const { eco } = makeEconomy();
    expect(eco.raidDurationSec('harbor_1990')).toBe(900);
    const r = eco.startRaid('harbor_1990', { testMap: true });
    expect(r.ok && r.duration).toBe(TEST_MAP_DURATION);
    const e2 = makeEconomy().eco;
    (e2 as any).p.credits = 99999;
    e2.upgrade('stabilizer');
    expect(e2.raidDurationSec('harbor_1990')).toBe(945);
  });
});

describe('audio helpers', () => {
  it('wave level rises near the shore', () => {
    expect(waveLevel(5, 14, 75)).toBe(1);
    expect(waveLevel(80, 14, 75)).toBe(0);
    expect(waveLevel(30, 14, 75)).toBeGreaterThan(waveLevel(60, 14, 75));
  });
  it('plans 1-3 horns inside the raid', () => {
    for (let i = 0; i < 30; i++) {
      const h = planHorns([1, 3], 720);
      expect(h.length).toBeGreaterThanOrEqual(1);
      expect(h.length).toBeLessThanOrEqual(3);
      for (const t of h) { expect(t).toBeGreaterThanOrEqual(20); expect(t).toBeLessThanOrEqual(700); }
    }
  });
  it('every weapon has a distinct gunshot recipe', () => {
    const sig = (id: string) => JSON.stringify(SHOT_LAYERS[id]);
    expect(new Set(['pistol', 'smg', 'rifle', 'shotgun'].map(sig)).size).toBe(4);
  });
});
