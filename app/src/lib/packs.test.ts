import { describe, it, expect } from 'vitest';
import { CREDIT_PACKS, getPack, creditsForAmount } from './packs';

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
