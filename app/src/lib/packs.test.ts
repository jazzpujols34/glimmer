import { describe, it, expect } from 'vitest';
import {
  CREDIT_PACKS,
  getPack,
  creditsForAmount,
  PACK_LIST,
  MIN_PACK_PRICE_TWD,
  MIN_PACK_CREDITS,
} from './packs';

describe('getPack', () => {
  it('looks up a pack by id', () => {
    expect(getPack('pack20')).toEqual(CREDIT_PACKS.pack20);
    expect(getPack('pack50')).toEqual(CREDIT_PACKS.pack50);
  });

  it('returns undefined for an unknown id', () => {
    expect(getPack('single')).toBeUndefined();
    expect(getPack('pack5')).toBeUndefined();
    expect(getPack('nope')).toBeUndefined();
  });
});

describe('creditsForAmount', () => {
  it('maps 299 to 20 credits', () => {
    expect(creditsForAmount(299)).toBe(20);
  });

  it('maps 599 to 50 credits', () => {
    expect(creditsForAmount(599)).toBe(50);
  });

  it('returns undefined for an unknown amount', () => {
    expect(creditsForAmount(499)).toBeUndefined();
    expect(creditsForAmount(1999)).toBeUndefined();
    expect(creditsForAmount(0)).toBeUndefined();
  });
});

describe('live pricing pin — must match production exactly', () => {
  it('pack20 is exactly 299 TWD for 20 credits', () => {
    expect(CREDIT_PACKS.pack20.priceTWD).toBe(299);
    expect(CREDIT_PACKS.pack20.credits).toBe(20);
  });

  it('pack50 is exactly 599 TWD for 50 credits', () => {
    expect(CREDIT_PACKS.pack50.priceTWD).toBe(599);
    expect(CREDIT_PACKS.pack50.credits).toBe(50);
  });

  it('only pack20 and pack50 exist — no dead packs', () => {
    expect(Object.keys(CREDIT_PACKS).sort()).toEqual(['pack20', 'pack50']);
  });
});

describe('PACK_LIST / entry-price helpers', () => {
  it('lists every pack, cheapest first', () => {
    expect(PACK_LIST.map((p) => p.id)).toEqual(['pack20', 'pack50']);
    expect(PACK_LIST).toHaveLength(Object.keys(CREDIT_PACKS).length);
  });

  it('stays sorted by price for any pack table', () => {
    const prices = PACK_LIST.map((p) => p.priceTWD);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it('derives the entry price and credits from the cheapest pack', () => {
    expect(MIN_PACK_PRICE_TWD).toBe(PACK_LIST[0].priceTWD);
    expect(MIN_PACK_CREDITS).toBe(PACK_LIST[0].credits);
    expect(MIN_PACK_PRICE_TWD).toBe(299);
    expect(MIN_PACK_CREDITS).toBe(20);
  });

  it('every displayed price traces to a real pack — no orphan prices', () => {
    // Guards the drift this SSOT exists to stop: the comparison table once
    // advertised "NT$400 起", a price no pack has ever had.
    const realPrices = new Set(PACK_LIST.map((p) => p.priceTWD));
    expect(realPrices.has(MIN_PACK_PRICE_TWD)).toBe(true);
    expect(realPrices.has(400)).toBe(false);
  });
});
