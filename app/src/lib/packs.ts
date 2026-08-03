/**
 * Credit pack definitions — single source of truth.
 * Only the two packs that are actually reachable from the UI (`/create`) and
 * live in ECPay checkout exist here. Do not re-declare this table in a route.
 */

export interface CreditPack {
  id: string;
  credits: number;
  priceTWD: number;
  label: string;
}

export const CREDIT_PACKS: Record<string, CreditPack> = {
  pack20: { id: 'pack20', credits: 20, priceTWD: 299, label: '20 點生成組合包' },
  pack50: { id: 'pack50', credits: 50, priceTWD: 599, label: '50 點生成組合包' },
};

/** Look up a pack by id. Returns undefined for unknown ids. */
export function getPack(packId: string): CreditPack | undefined {
  return CREDIT_PACKS[packId];
}

/**
 * Legacy fallback: map a paid TWD amount to a credit count.
 * Needed for orders created before packId (CustomField2) was signed into the
 * ECPay checkout, and to keep crediting the two historical orders.
 */
export function creditsForAmount(amount: number): number | undefined {
  for (const pack of Object.values(CREDIT_PACKS)) {
    if (pack.priceTWD === amount) return pack.credits;
  }
  return undefined;
}
