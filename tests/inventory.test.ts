import { describe, expect, it } from 'vitest';
import { Inventory, canSprintAtWeight, weightSpeedFactor, type Slot } from '../src/items/Inventory';

const mk = (capacity: number, maxWeight?: number, extra = 0) =>
  new Inventory([] as Slot[], { capacity, maxWeight, extraWeight: extra });

describe('Inventory', () => {
  it('stacks items up to maxStack and spills into new slots', () => {
    const inv = mk(4);
    expect(inv.add('ammo_pistol', 100)).toBe(0);
    expect(inv.add('ammo_pistol', 50)).toBe(0); // maxStack 120 -> 2 slots
    expect(inv.slots[0]).toEqual({ id: 'ammo_pistol', qty: 120 });
    expect(inv.slots[1]).toEqual({ id: 'ammo_pistol', qty: 30 });
    expect(inv.count('ammo_pistol')).toBe(150);
  });

  it('reports the leftover when slots run out', () => {
    const inv = mk(1);
    expect(inv.add('pistol', 1)).toBe(0);
    expect(inv.add('pistol', 1)).toBe(1);
    expect(inv.add('nope', 1)).toBe(1);
  });

  it('splits a stack into an empty slot and merges back', () => {
    const inv = mk(3);
    inv.add('bandage', 8);
    expect(inv.split(0, 3)).toEqual({ ok: true, moved: 3 });
    expect(inv.slots[0]?.qty).toBe(5);
    expect(inv.slots[1]?.qty).toBe(3);
    expect(inv.moveWithin(1, 0)).toEqual({ ok: true, moved: 3 });
    expect(inv.slots[0]?.qty).toBe(8);
    expect(inv.slots[1]).toBeNull();
    expect(inv.split(0, 8).ok).toBe(false); // must leave at least one
    expect(inv.split(0, 0).ok).toBe(false);
  });

  it('refuses to split with no free slot', () => {
    const inv = mk(1);
    inv.add('bandage', 4);
    expect(inv.split(0, 2)).toEqual({ ok: false, reason: 'full' });
  });

  it('merge respects maxStack and swap works for different items', () => {
    const inv = mk(3);
    inv.slots[0] = { id: 'bandage', qty: 9 };
    inv.slots[1] = { id: 'bandage', qty: 4 };
    expect(inv.moveWithin(1, 0)).toEqual({ ok: true, moved: 1 }); // maxStack 10
    expect(inv.slots[0]?.qty).toBe(10);
    expect(inv.slots[1]?.qty).toBe(3);
    inv.slots[2] = { id: 'pistol', qty: 1 };
    expect(inv.moveWithin(2, 1).ok).toBe(true);
    expect(inv.slots[1]?.id).toBe('pistol');
    expect(inv.slots[2]?.id).toBe('bandage');
  });

  it('computes weight ratio and blocks pickup past the hard cap', () => {
    const inv = mk(8, 10);
    expect(inv.getWeightRatio()).toBe(0);
    inv.add('rice_cooker', 2); // 2 x 3.2 = 6.4kg
    expect(inv.getWeightRatio()).toBeCloseTo(0.64);
    expect(inv.add('rice_cooker', 2)).toBe(1); // hard cap 12.5kg -> only one more fits
    expect(inv.getWeightRatio()).toBeCloseTo(0.96);
    expect(inv.maxAddable('scrap_metal', 5)).toBe(1); // 2.9kg spare under the cap
  });

  it('counts extra (worn) weight', () => {
    const inv = mk(4, 10, 5);
    expect(inv.getWeightRatio()).toBeCloseTo(0.5);
  });

  it('weight speed has four bands: normal <=70%, slowing to x0.8 at 100%, x0.6 (no sprint) to 125%', () => {
    expect(weightSpeedFactor(0)).toBe(1);
    expect(weightSpeedFactor(0.5)).toBe(1);
    expect(weightSpeedFactor(0.7)).toBe(1);
    expect(weightSpeedFactor(0.85)).toBeCloseTo(0.9);
    expect(weightSpeedFactor(0.99)).toBeGreaterThan(0.8);
    expect(weightSpeedFactor(0.99)).toBeLessThan(0.81);
    expect(weightSpeedFactor(1)).toBe(0.6);
    expect(weightSpeedFactor(1.1)).toBe(0.6);
    expect(weightSpeedFactor(1.25)).toBe(0.6);
    expect(canSprintAtWeight(0.99)).toBe(true);
    expect(canSprintAtWeight(1)).toBe(false);
    expect(canSprintAtWeight(1.1)).toBe(false);
  });

  it('remove spans multiple stacks and is all-or-nothing', () => {
    const inv = mk(4);
    inv.add('ammo_pistol', 150);
    expect(inv.remove('ammo_pistol', 200)).toBe(false);
    expect(inv.count('ammo_pistol')).toBe(150);
    expect(inv.remove('ammo_pistol', 140)).toBe(true);
    expect(inv.count('ammo_pistol')).toBe(10);
  });

  it('forceAdd grows past capacity without losing items', () => {
    const inv = mk(1);
    inv.add('pistol', 1);
    inv.forceAdd('smg', 1);
    expect(inv.slots.length).toBe(2);
    expect(inv.count('smg')).toBe(1);
  });
});
